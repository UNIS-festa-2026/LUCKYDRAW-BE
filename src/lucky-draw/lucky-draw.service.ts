import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { ApiError } from '../common/api-error';
import { isUuid } from '../common/validators';
import { AppConfig } from '../config/app.config';
import { DatabaseService } from '../database/database.service';
import { SheetsService } from '../sheets/sheets.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateWinnerInfoDto } from './dto/create-winner-info.dto';

interface PrizeRow {
  id: string;
  name: string;
  type: 'DIGITAL_COUPON' | 'BOOTH_COUPON' | 'ETC';
  image_url: string | null;
  remaining_quantity: number;
  probability_weight: number;
}

interface EntryRow {
  id: string;
  session_id: string | null;
  amount: number;
  depositor_name: string | null;
  result: 'WIN' | 'LOSE';
  prize_id: string | null;
  status: string;
  payment_verified: boolean;
  created_at: Date;
}

interface WinnerInfoRow {
  id: string;
  entry_id: string;
  name: string;
  phone: string;
  review: string;
  delivery_status: string;
  created_at: Date;
}

@Injectable()
export class LuckyDrawService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sheets: SheetsService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async createEntry(dto: CreateEntryDto) {
    const config = this.configService.get('luckyDraw', { infer: true });
    if (dto.payment_method !== 'BANK_TRANSFER') {
      throw new ApiError('INVALID_PAYMENT_METHOD', '결제 방식이 올바르지 않습니다.', HttpStatus.BAD_REQUEST);
    }
    if (dto.amount !== config.amount) {
      throw new ApiError('INVALID_AMOUNT', '응모 금액이 올바르지 않습니다.', HttpStatus.BAD_REQUEST);
    }
    if (!this.isWithinOperatingHours(config.timezone, config.openTime, config.closeTime)) {
      throw new ApiError('LUCKY_DRAW_CLOSED', '현재 응모 가능 시간이 아닙니다.', HttpStatus.FORBIDDEN);
    }

    const txResult = await this.database.transaction(async (client) => {
      if (dto.session_id) {
        await this.assertNoRecentDuplicate(client, dto.session_id);
      }

      const dayRange = this.getServiceDayRange(config.timezone);
      await this.lockDailyDrawCounter(client, dayRange.key);
      const usedWinnerSlots = await this.countTodayWinners(client, dayRange.start, dayRange.end);
      const isGuaranteedWinner = usedWinnerSlots < config.dailyWinnerLimit;
      const isRandomWinner = !isGuaranteedWinner && Math.random() < config.randomWinRateAfterLimit;
      const shouldWin = isGuaranteedWinner || isRandomWinner;

      let prize = shouldWin ? await this.selectPrize(client) : null;
      if (shouldWin && !prize && isGuaranteedWinner) {
        throw new ApiError('PRIZE_SOLD_OUT', '남은 상품이 없습니다.', HttpStatus.CONFLICT);
      }
      let assignedCouponId: string | null = null;

      if (prize?.type === 'BOOTH_COUPON') {
        assignedCouponId = await this.lockAvailableCoupon(client, prize.id);
        if (!assignedCouponId && isGuaranteedWinner) {
          throw new ApiError('PRIZE_SOLD_OUT', '남은 상품이 없습니다.', HttpStatus.CONFLICT);
        }
        if (!assignedCouponId) {
          prize = null;
        }
      }

      if (prize) {
        await client.query('update prizes set remaining_quantity = remaining_quantity - 1 where id = $1', [prize.id]);
      }

      const entryResult = await client.query<EntryRow>(
        `
          insert into lucky_draw_entries
            (session_id, payment_method, amount, depositor_name, result, prize_id)
          values
            ($1, $2, $3, $4, $5, $6)
          returning *
        `,
        [
          dto.session_id ?? null,
          dto.payment_method,
          dto.amount,
          dto.depositor_name?.trim() || null,
          prize ? 'WIN' : 'LOSE',
          prize?.id ?? null,
        ],
      );
      const entry = entryResult.rows[0];

      if (prize?.type === 'BOOTH_COUPON') {
        await this.assignLockedCoupon(client, assignedCouponId, entry.id);
      }

      await this.enqueueEntrySheetJobs(client, entry, prize, assignedCouponId);
      return { entry, prize, assignedCouponId };
    });

    const { entry, prize, assignedCouponId } = txResult;

    void this.sheets.processPendingJobs().catch(() => undefined);

    if (entry.result === 'LOSE') {
      return {
        entry_id: entry.id,
        result: 'LOSE' as const,
        title: '아쉽지만 다음 기회에..',
        message: '매일 9시~20시 동안 도전할 수 있어요!',
        retry_available: true,
        share_url: '/lucky-draw',
      };
    }

    const response: Record<string, unknown> = {
      entry_id: entry.id,
      result: 'WIN' as const,
      title: '당첨!!',
      prize: {
        prize_id: prize?.id ?? null,
        type: prize?.type ?? null,
        name: prize?.name ?? null,
        image_url: prize?.image_url ?? null,
        delivery_type: prize?.type === 'BOOTH_COUPON' ? 'BOOTH_COUPON' : 'MANUAL_SEND',
      },
      winner_info_required: true,
      next_action: 'INPUT_WINNER_INFO',
    };

    if (prize?.type === 'BOOTH_COUPON' && assignedCouponId) {
      const coupon = await this.database.query<{ id: string; token: string }>(
        'select id, token from coupons where id = $1 limit 1',
        [assignedCouponId],
      );
      if (coupon.rows[0]) {
        response.coupon = {
          coupon_id: coupon.rows[0].id,
          token: coupon.rows[0].token,
          url: this.buildCouponUrl(coupon.rows[0].token),
        };
      }
    }

    return response;
  }

  async getHomeStatus() {
    const config = this.configService.get('luckyDraw', { infer: true });
    const dayRange = this.getServiceDayRange(config.timezone);
    const count = await this.database.query<{ count: string }>(
      `
        select count(*)::text as count
        from lucky_draw_entries
        where result = 'WIN' and created_at >= $1 and created_at < $2
      `,
      [dayRange.start, dayRange.end],
    );
    const usedWinnerSlots = Number(count.rows[0]?.count ?? '0');
    const remainingWinnerSlots = Math.max(config.dailyWinnerLimit - usedWinnerSlots, 0);
    const isOpen = this.isWithinOperatingHours(config.timezone, config.openTime, config.closeTime);

    return {
      daily_winner_limit: config.dailyWinnerLimit,
      used_winner_slots: usedWinnerSlots,
      remaining_winner_slots: remainingWinnerSlots,
      guaranteed_win_available: isOpen && remainingWinnerSlots > 0,
      random_available: isOpen && remainingWinnerSlots === 0,
      random_win_rate_after_limit: config.randomWinRateAfterLimit,
      is_open: isOpen,
      popup_text:
        remainingWinnerSlots > 0
          ? `100% 당첨 ${remainingWinnerSlots}명 남음!`
          : '선착순 100% 당첨 마감! 지금부터 랜덤 당첨',
      hero_title: '단돈 990원으로 상품타자!',
      hero_subtitle: '400개 이상의 상품이 준비되어 있다고..?',
      speech_bubble_text: '욜영, 치킨, 베라, 떡볶이, 커피.. 대동제 부스 쿠폰까지 준다구?!',
      cta_text: '응모하기',
      server_time: this.formatKstTimestamp(new Date()),
    };
  }

  async createWinnerInfo(entryId: string, dto: CreateWinnerInfoDto) {
    this.assertEntryId(entryId);
    const normalized = this.validateWinnerInfo(dto);

    const winnerInfo = await this.database.transaction(async (client) => {
      const entryResult = await client.query<EntryRow>(
        'select * from lucky_draw_entries where id = $1 for update',
        [entryId],
      );
      const entry = entryResult.rows[0];
      if (!entry) {
        throw new ApiError('ENTRY_NOT_FOUND', '응모 내역을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
      }
      if (entry.result !== 'WIN') {
        throw new ApiError('NOT_WINNER', '당첨된 응모가 아닙니다.', HttpStatus.FORBIDDEN);
      }

      const existing = await client.query('select id from winner_infos where entry_id = $1', [entryId]);
      if (existing.rowCount) {
        throw new ApiError(
          'WINNER_INFO_ALREADY_SUBMITTED',
          '이미 당첨자 정보가 입력되었습니다.',
          HttpStatus.CONFLICT,
        );
      }

      const created = await client.query<WinnerInfoRow>(
        `
          insert into winner_infos (entry_id, name, phone, review)
          values ($1, $2, $3, $4)
          returning *
        `,
        [entryId, normalized.name, normalized.phone, normalized.review],
      );
      const winnerInfo = created.rows[0];

      await this.sheets.enqueueJob(client, {
        targetTab: 'winner_infos',
        operation: 'APPEND',
        dedupeKey: `winner_infos:${winnerInfo.id}`,
        payload: this.toWinnerInfoSheetPayload(winnerInfo),
      });

      return winnerInfo;
    });

    void this.sheets.processPendingJobs().catch(() => undefined);
    return {
      entry_id: winnerInfo.entry_id,
      winner_info_id: winnerInfo.id,
      name: winnerInfo.name,
      phone: winnerInfo.phone,
      review: winnerInfo.review,
      delivery_status: winnerInfo.delivery_status,
      created_at: winnerInfo.created_at.toISOString(),
      next_action: 'SHOW_DELIVERY_GUIDE',
    };
  }

  async getWinnerInfo(entryId: string) {
    this.assertEntryId(entryId);
    const entryResult = await this.database.query<EntryRow>(
      'select * from lucky_draw_entries where id = $1',
      [entryId],
    );
    const entry = entryResult.rows[0];
    if (!entry) {
      throw new ApiError('ENTRY_NOT_FOUND', '응모 내역을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }
    if (entry.result !== 'WIN') {
      throw new ApiError('NOT_WINNER', '당첨된 응모가 아닙니다.', HttpStatus.FORBIDDEN);
    }

    const info = await this.database.query<WinnerInfoRow>(
      'select * from winner_infos where entry_id = $1',
      [entryId],
    );
    const winnerInfo = info.rows[0];
    if (!winnerInfo) {
      return {
        entry_id: entryId,
        is_submitted: false,
        message: '아직 당첨자 정보가 입력되지 않았습니다.',
      };
    }

    return {
      entry_id: entryId,
      winner_info_id: winnerInfo.id,
      name: winnerInfo.name,
      phone: winnerInfo.phone,
      review: winnerInfo.review,
      delivery_status: winnerInfo.delivery_status,
      created_at: winnerInfo.created_at.toISOString(),
    };
  }

  private async assertNoRecentDuplicate(client: PoolClient, sessionId: string) {
    const duplicate = await client.query(
      `
        select id from lucky_draw_entries
        where session_id = $1 and created_at > now() - interval '5 seconds'
        limit 1
      `,
      [sessionId],
    );
    if (duplicate.rowCount) {
      throw new ApiError('DUPLICATE_ENTRY', '이미 처리 중인 응모가 있습니다.', HttpStatus.CONFLICT);
    }
  }

  private assertEntryId(entryId: string) {
    if (!isUuid(entryId)) {
      throw new ApiError('ENTRY_NOT_FOUND', '응모 내역을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }
  }

  private async lockDailyDrawCounter(client: PoolClient, dayKey: string) {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`lucky_draw:${dayKey}`]);
  }

  private async countTodayWinners(client: PoolClient, start: Date, end: Date): Promise<number> {
    const result = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from lucky_draw_entries
        where result = 'WIN' and created_at >= $1 and created_at < $2
      `,
      [start, end],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  private async selectPrize(client: PoolClient): Promise<PrizeRow | null> {
    const result = await client.query<PrizeRow>(
      `
        select *
        from prizes
        where
          is_active = true
          and remaining_quantity > 0
          and (
            type <> 'BOOTH_COUPON'
            or exists (
              select 1
              from coupons
              where coupons.prize_id = prizes.id and coupons.status = 'AVAILABLE'
            )
          )
        order by id
        for update
      `,
    );
    if (!result.rows.length) {
      return null;
    }

    const totalWeight = result.rows.reduce((sum, prize) => sum + prize.probability_weight, 0);
    let threshold = Math.random() * totalWeight;
    for (const prize of result.rows) {
      threshold -= prize.probability_weight;
      if (threshold <= 0) {
        return prize;
      }
    }
    return result.rows[result.rows.length - 1];
  }

  private async lockAvailableCoupon(client: PoolClient, prizeId: string): Promise<string | null> {
    const coupon = await client.query<{ id: string }>(
      `
        select id
        from coupons
        where prize_id = $1 and status = 'AVAILABLE'
        order by created_at
        for update skip locked
        limit 1
      `,
      [prizeId],
    );

    return coupon.rows[0]?.id ?? null;
  }

  private async assignLockedCoupon(client: PoolClient, couponId: string | null, entryId: string) {
    if (!couponId) {
      return;
    }
    await client.query(
      `
        update coupons
        set status = 'ASSIGNED', assigned_entry_id = $1, assigned_at = now()
        where id = $2
      `,
      [entryId, couponId],
    );
  }

  private async enqueueEntrySheetJobs(
    client: PoolClient,
    entry: EntryRow,
    prize: PrizeRow | null,
    assignedCouponId: string | null,
  ) {
    await this.sheets.enqueueJob(client, {
      targetTab: 'entries',
      operation: 'APPEND',
      dedupeKey: `entries:${entry.id}`,
      payload: {
        entry_id: entry.id,
        session_id: entry.session_id,
        amount: entry.amount,
        depositor_name: entry.depositor_name,
        result: entry.result,
        prize_id: entry.prize_id,
        payment_verified: entry.payment_verified,
        created_at: entry.created_at.toISOString(),
      },
    });

    if (prize) {
      await this.sheets.enqueueJob(client, {
        targetTab: 'prizes',
        operation: 'UPDATE',
        dedupeKey: `prizes:${prize.id}:${entry.id}`,
        payload: { prize_id: prize.id },
      });
    }

    if (assignedCouponId) {
      await this.sheets.enqueueJob(client, {
        targetTab: 'coupons',
        operation: 'UPDATE',
        dedupeKey: `coupons-assigned:${assignedCouponId}`,
        payload: { coupon_id: assignedCouponId },
      });
    }
  }

  private validateWinnerInfo(dto: CreateWinnerInfoDto) {
    const name = dto.name.trim();
    const review = dto.review.trim();
    const phone = dto.phone.replace(/\D/g, '');

    if (name.length < 1 || name.length > 20) {
      throw new ApiError('INVALID_NAME', '이름을 올바르게 입력해주세요.', HttpStatus.BAD_REQUEST);
    }
    if (!/^010\d{8}$/.test(phone)) {
      throw new ApiError('INVALID_PHONE', '전화번호 형식이 올바르지 않습니다.', HttpStatus.BAD_REQUEST);
    }
    if (review.length < 1 || review.length > 100) {
      throw new ApiError('INVALID_REVIEW', '한 줄 후기를 올바르게 입력해주세요.', HttpStatus.BAD_REQUEST);
    }

    return { name, phone, review };
  }

  private toWinnerInfoSheetPayload(winnerInfo: WinnerInfoRow) {
    return {
      winner_info_id: winnerInfo.id,
      entry_id: winnerInfo.entry_id,
      name: winnerInfo.name,
      phone: winnerInfo.phone,
      review: winnerInfo.review,
      delivery_status: winnerInfo.delivery_status,
      created_at: winnerInfo.created_at.toISOString(),
    };
  }

  private isWithinOperatingHours(timezone: string, openTime: string, closeTime: string): boolean {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    const current = hour * 60 + minute;
    return current >= this.toMinutes(openTime) && current < this.toMinutes(closeTime);
  }

  private getServiceDayRange(timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);

    // The festival timezone is Asia/Seoul. KST is UTC+09:00 and has no DST.
    const start = new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
    const end = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0));
    return {
      key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      start,
      end,
    };
  }

  private formatKstTimestamp(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+09:00`;
  }

  private toMinutes(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private buildCouponUrl(token: string): string {
    const baseUrl = this.configService.get('publicCouponBaseUrl', { infer: true });
    return baseUrl ? `${baseUrl.replace(/\/$/, '')}/${token}` : `/coupons/${token}`;
  }
}
