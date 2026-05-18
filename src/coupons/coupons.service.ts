import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { isCouponLookupKey } from '../common/validators';
import { DatabaseService } from '../database/database.service';
import { SignatureStorageService } from '../storage/signature-storage.service';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';

interface CouponRow {
  id: string;
  token: string;
  prize_id: string | null;
  assigned_entry_id: string | null;
  title: string;
  coupon_image_url: string | null;
  status: 'AVAILABLE' | 'ASSIGNED' | 'USED' | 'EXPIRED';
  event_name: string | null;
  booth_name: string | null;
  menu_name: string | null;
  valid_from: string | null;
  valid_until: string | null;
  contact_phone: string | null;
  assigned_at: Date | null;
  used_at: Date | null;
  signature_image_url: string | null;
  created_at: Date;
}

@Injectable()
export class CouponsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: SignatureStorageService,
  ) {}

  async getCoupon(couponId: string) {
    this.assertCouponLookupKey(couponId);
    const coupon = await this.findCoupon(couponId);
    if (!coupon) {
      throw new ApiError('COUPON_NOT_FOUND', '쿠폰을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }

    const status = this.resolveCouponStatus(coupon);
    if (status === 'EXPIRED' && coupon.status !== 'EXPIRED') {
      void this.markExpired(coupon.id).catch(() => undefined);
    }

    if (status === 'USED') {
      return {
        coupon_id: coupon.id,
        status: 'USED',
        title: coupon.title,
        coupon_image_url: coupon.coupon_image_url,
        used_at: coupon.used_at?.toISOString() ?? null,
        signature_image_url: coupon.signature_image_url
          ? await this.safeSignedUrl(coupon.signature_image_url)
          : null,
        message: '이미 사용 완료된 쿠폰입니다.',
        contact_phone: coupon.contact_phone,
      };
    }

    if (status === 'EXPIRED') {
      return {
        coupon_id: coupon.id,
        status: 'EXPIRED',
        title: coupon.title,
        coupon_image_url: coupon.coupon_image_url,
        message: '만료된 쿠폰입니다.',
        contact_phone: coupon.contact_phone,
      };
    }

    return {
      coupon_id: coupon.id,
      status,
      title: coupon.title,
      coupon_image_url: coupon.coupon_image_url,
      event_name: coupon.event_name,
      valid_from: coupon.valid_from,
      valid_until: coupon.valid_until,
      booth_name: coupon.booth_name,
      menu_name: coupon.menu_name,
      operator_signature_required: true,
      contact_phone: coupon.contact_phone,
    };
  }

  async redeemCoupon(couponId: string, dto: RedeemCouponDto) {
    this.assertCouponLookupKey(couponId);
    if (!dto.signature_image?.trim()) {
      throw new ApiError('SIGNATURE_REQUIRED', '운영자 서명이 필요합니다.', HttpStatus.BAD_REQUEST);
    }
    try {
      this.storage.parsePngDataUrl(dto.signature_image);
    } catch {
      throw new ApiError('INVALID_SIGNATURE_IMAGE', '서명 이미지 형식이 올바르지 않습니다.', HttpStatus.BAD_REQUEST);
    }

    const coupon = await this.findCoupon(couponId);
    if (!coupon) {
      throw new ApiError('COUPON_NOT_FOUND', '쿠폰을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }
    const status = this.resolveCouponStatus(coupon);
    if (status === 'USED') {
      throw new ApiError('COUPON_ALREADY_USED', '이미 사용된 쿠폰입니다.', HttpStatus.CONFLICT);
    }
    if (status === 'EXPIRED') {
      throw new ApiError('COUPON_EXPIRED', '만료된 쿠폰입니다.', HttpStatus.GONE);
    }

    let signaturePath: string;
    try {
      signaturePath = await this.storage.uploadSignature(coupon.id, dto.signature_image);
    } catch {
      throw new ApiError(
        'SIGNATURE_UPLOAD_FAILED',
        '서명 이미지 저장에 실패했습니다.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const redeemed = await this.database.transaction(async (client) => {
      const locked = await client.query<CouponRow>(
        'select * from coupons where id = $1 for update',
        [coupon.id],
      );
      const current = locked.rows[0];
      if (!current) {
        throw new ApiError('COUPON_NOT_FOUND', '쿠폰을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
      }
      const currentStatus = this.resolveCouponStatus(current);
      if (currentStatus === 'USED') {
        throw new ApiError('COUPON_ALREADY_USED', '이미 사용된 쿠폰입니다.', HttpStatus.CONFLICT);
      }
      if (currentStatus === 'EXPIRED') {
        throw new ApiError('COUPON_EXPIRED', '만료된 쿠폰입니다.', HttpStatus.GONE);
      }

      const updated = await client.query<CouponRow>(
        `
          update coupons
          set status = 'USED', used_at = now(), signature_image_url = $2
          where id = $1
          returning *
        `,
        [current.id, signaturePath],
      );

      await client.query(
        `
          insert into coupon_redemptions (coupon_id, signature_image_url)
          values ($1, $2)
        `,
        [current.id, signaturePath],
      );

      return updated.rows[0];
    });

    return {
      coupon_id: redeemed.id,
      status: 'USED',
      used_at: redeemed.used_at?.toISOString(),
      signature_image_url: await this.safeSignedUrl(signaturePath),
      message: '쿠폰 사용이 완료되었습니다.',
    };
  }

  private async findCoupon(couponId: string): Promise<CouponRow | null> {
    const result = await this.database.query<CouponRow>(
      'select * from coupons where token = $1 or id::text = $1 limit 1',
      [couponId],
    );
    return result.rows[0] ?? null;
  }

  private assertCouponLookupKey(couponId: string) {
    if (!isCouponLookupKey(couponId)) {
      throw new ApiError('COUPON_NOT_FOUND', '쿠폰을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }
  }

  private resolveCouponStatus(coupon: CouponRow): CouponRow['status'] {
    if (coupon.status === 'USED') {
      return 'USED';
    }
    if (coupon.status === 'EXPIRED') {
      return 'EXPIRED';
    }
    if (coupon.valid_until) {
      const today = new Date();
      const validUntil = new Date(`${coupon.valid_until}T23:59:59+09:00`);
      if (today > validUntil) {
        return 'EXPIRED';
      }
    }
    return coupon.status;
  }

  private async markExpired(couponId: string) {
    await this.database.query(
      "update coupons set status = 'EXPIRED' where id = $1 and status in ('AVAILABLE', 'ASSIGNED')",
      [couponId],
    );
  }

  private async safeSignedUrl(path: string): Promise<string> {
    try {
      return await this.storage.createSignedUrl(path);
    } catch {
      return path;
    }
  }

}
