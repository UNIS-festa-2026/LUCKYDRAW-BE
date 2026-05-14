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
  type: 'BOOTH' | 'UNIS';
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

interface DailyDrawConfig {
  booth_quota: number;
  unis_quota: number;
  random_win_rate: number;
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

    const today = this.getTodayKst(config.timezone);

    const txResult = await this.database.transaction(async (client) => {
      if (dto.session_id) {
        await this.assertNoRecentDuplicate(client, dto.session_id);
      }

      const drawConfig = await this.getDailyConfig(client, today);
      const totalQuota = drawConfig.booth_quota + drawConfig.unis_quota;

      // advisory lock 없이 atomic하게 슬롯 확보
      const slot = await this.claimGuaranteedSlot(client, today, totalQuota);
      const isGuaranteedWinner = slot !== null;
      const isRandomWinner = !isGuaranteedWinner && Math.random() < drawConfig.random_win_rate;

      let prize: PrizeRow | null = null;

      if (isGuaranteedWinner && slot !== null) {
        // 보장 당첨: 슬롯 번호로 BOOTH/UNIS 결정
        const guaranteedType: 'BOOTH' | 'UNIS' = slot <= drawConfig.booth_quota ? 'BOOTH' : 'UNIS';
        prize = await this.selectPrize(client, guaranteedType);
        if (!prize) {
          // 해당 타입 소진 → 반대 타입 fallback
          const fallbackType: 'BOOTH' | 'UNIS' = guaranteedType === 'BOOTH' ? 'UNIS' : 'BOOTH';
          prize = await this.selectPrize(client, fallbackType);
          if (!prize) {
            throw new ApiError('PRIZE_SOLD_OUT', '남은 상품이 없습니다.', HttpStatus.CONFLICT);
          }
        }
      } else if (isRandomWinner) {
        // 랜덤 당첨: 타입 필터 없이 probability_weight로 선택 (BOOTH 가중치 높으면 거의 BOOTH)
        prize = await this.selectPrize(client);
      }

      return await this.buildEntryResult(client, dto, prize);
    });

    void this.sheets.processPendingJobs().catch(() => undefined);

    const { entry, prize } = txResult;

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

    return {
      entry_id: entry.id,
      result: 'WIN' as const,
      title: '당첨!!',
      prize: {
        prize_id: prize?.id ?? null,
        type: prize?.type ?? null,
        name: prize?.name ?? null,
        image_url: prize?.image_url ?? null,
      },
      winner_info_required: true,
      next_action: 'INPUT_WINNER_INFO',
    };
  }

  async getHomeStatus() {
    const config = this.configService.get('luckyDraw', { infer: true });
    const today = this.getTodayKst(config.timezone);
    const drawConfig = await this.database.query<DailyDrawConfig>(
      'select booth_quota, unis_quota, random_win_rate from daily_draw_config where date = $1',
      [today],
    );
    const cfg = drawConfig.rows[0] ?? { booth_quota: 90, unis_quota: 10, random_win_rate: 0.2 };
    const totalQuota = cfg.booth_quota + cfg.unis_quota;

    const counter = await this.database.query<{ guaranteed_count: number }>(
      'select guaranteed_count from daily_counters where date = $1',
      [today],
    );
    const usedSlots = counter.rows[0]?.guaranteed_count ?? 0;
    const remainingSlots = Math.max(totalQuota - usedSlots, 0);
    const isOpen = this.isWithinOperatingHours(config.timezone, config.openTime, config.closeTime);

    return {
      daily_winner_limit: totalQuota,
      used_winner_slots: usedSlots,
      remaining_winner_slots: remainingSlots,
      guaranteed_win_available: isOpen && remainingSlots > 0,
      random_available: isOpen && remainingSlots === 0,
      random_win_rate_after_limit: cfg.random_win_rate,
      is_open: isOpen,
      popup_text:
        remainingSlots > 0
          ? `100% 당첨 ${remainingSlots}명 남음!`
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

  private async getDailyConfig(client: PoolClient, today: string): Promise<DailyDrawConfig> {
    const result = await client.query<DailyDrawConfig>(
      'select booth_quota, unis_quota, random_win_rate from daily_draw_config where date = $1',
      [today],
    );
    return result.rows[0] ?? { booth_quota: 90, unis_quota: 10, random_win_rate: 0.2 };
  }

  // advisory lock 없이 atomic하게 선착순 슬롯 번호 확보
  // 반환값: 슬롯 번호 (1~totalQuota) 또는 null (선착순 마감)
  private async claimGuaranteedSlot(client: PoolClient, today: string, totalQuota: number): Promise<number | null> {
    await client.query(
      'insert into daily_counters (date, guaranteed_count) values ($1, 0) on conflict (date) do nothing',
      [today],
    );
    const result = await client.query<{ guaranteed_count: number }>(
      `update daily_counters
       set guaranteed_count = guaranteed_count + 1
       where date = $1 and guaranteed_count < $2
       returning guaranteed_count`,
      [today, totalQuota],
    );
    return result.rows[0]?.guaranteed_count ?? null;
  }

  private async selectPrize(client: PoolClient, type?: 'BOOTH' | 'UNIS'): Promise<PrizeRow | null> {
    const result = await client.query<PrizeRow>(
      type
        ? `select * from prizes
           where is_active = true and remaining_quantity > 0 and type = $1
           order by id
           for update skip locked`
        : `select * from prizes
           where is_active = true and remaining_quantity > 0
           order by id
           for update skip locked`,
      type ? [type] : [],
    );
    if (!result.rows.length) return null;

    const totalWeight = result.rows.reduce((sum, p) => sum + p.probability_weight, 0);
    let threshold = Math.random() * totalWeight;
    for (const prize of result.rows) {
      threshold -= prize.probability_weight;
      if (threshold <= 0) return prize;
    }
    return result.rows[result.rows.length - 1];
  }

  private async buildEntryResult(client: PoolClient, dto: CreateEntryDto, prize: PrizeRow | null) {
    if (prize) {
      await client.query('update prizes set remaining_quantity = remaining_quantity - 1 where id = $1', [prize.id]);
    }

    const entryResult = await client.query<EntryRow>(
      `insert into lucky_draw_entries
         (session_id, payment_method, amount, depositor_name, result, prize_id)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
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
    await this.enqueueEntrySheetJobs(client, entry, prize);
    return { entry, prize };
  }

  private async assertNoRecentDuplicate(client: PoolClient, sessionId: string) {
    const duplicate = await client.query(
      `select id from lucky_draw_entries
       where session_id = $1 and created_at > now() - interval '5 seconds'
       limit 1`,
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

  private async enqueueEntrySheetJobs(client: PoolClient, entry: EntryRow, prize: PrizeRow | null) {
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

  private getTodayKst(timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '';
    const m = parts.find((p) => p.type === 'month')?.value ?? '';
    const d = parts.find((p) => p.type === 'day')?.value ?? '';
    return `${y}-${m}-${d}`;
  }

  private getServiceDayRange(timezone: string) {
    const today = this.getTodayKst(timezone);
    const [year, month, day] = today.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
    const end = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0));
    return { key: today, start, end };
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
}
