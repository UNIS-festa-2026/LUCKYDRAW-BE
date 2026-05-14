import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';

@ApiExcludeController()
@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get(':couponId')
  @ApiOperation({
    summary: '쿠폰 조회',
    description: `쿠폰 ID(UUID) 또는 토큰으로 쿠폰 정보를 조회합니다.

**쿠폰 URL 구조:** \`GET /api/coupons/{token}\`
당첨자가 받는 URL(\`coupon.url\`)이 이 엔드포인트로 라우팅됩니다. 프론트에서 해당 경로를 쿠폰 화면으로 연결하면 됩니다.

**status별 화면 처리:**
- \`ASSIGNED\` → 쿠폰 상세 + 부스 운영자 서명 UI 표시
- \`USED\` → 사용 완료 화면 (서명 이미지 포함)
- \`EXPIRED\` → 만료 안내 화면`,
  })
  @ApiParam({ name: 'couponId', description: '쿠폰 UUID 또는 토큰' })
  @ApiResponse({
    status: 200,
    description: '쿠폰 정보 반환',
    schema: {
      oneOf: [
        {
          title: '사용 가능',
          example: {
            coupon_id: 'uuid-here',
            status: 'ASSIGNED',
            title: '베라 싱글레귤러',
            coupon_image_url: 'https://...',
            event_name: '이화여대 대동제',
            valid_from: '2026-05-15',
            valid_until: '2026-05-17',
            booth_name: '베라 부스',
            menu_name: '싱글레귤러',
            operator_signature_required: true,
            contact_phone: '010-0000-0000',
          },
        },
        {
          title: '사용 완료',
          example: {
            coupon_id: 'uuid-here',
            status: 'USED',
            title: '베라 싱글레귤러',
            coupon_image_url: 'https://...',
            used_at: '2026-05-15T12:00:00.000Z',
            signature_image_url: 'https://...',
            message: '이미 사용 완료된 쿠폰입니다.',
            contact_phone: '010-0000-0000',
          },
        },
        {
          title: '만료',
          example: {
            coupon_id: 'uuid-here',
            status: 'EXPIRED',
            title: '베라 싱글레귤러',
            coupon_image_url: 'https://...',
            message: '만료된 쿠폰입니다.',
            contact_phone: '010-0000-0000',
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 404, description: '쿠폰 없음', schema: { example: { error: 'COUPON_NOT_FOUND', message: '쿠폰을 찾을 수 없습니다.' } } })
  getCoupon(@Param('couponId') couponId: string) {
    return this.couponsService.getCoupon(couponId);
  }

  @Post(':couponId/redeem')
  @HttpCode(200)
  @ApiOperation({
    summary: '쿠폰 사용 처리',
    description: `부스 운영자가 서명 후 쿠폰을 사용 완료 처리합니다.

**처리 흐름:**
1. 당첨자가 쿠폰 화면 열기 (\`GET /api/coupons/:token\`)
2. 부스 운영자가 화면에 서명
3. 프론트에서 서명 이미지를 PNG Data URL로 변환 후 이 API 호출
4. 서명 이미지는 Supabase Storage에 저장, 쿠폰 상태가 \`USED\`로 변경
5. Google Sheets \`coupons\` 탭 및 \`coupon_redemptions\` 탭에 자동 기록

**서명 이미지 형식:** \`data:image/png;base64,{base64}\` 형태의 Data URL`,
  })
  @ApiParam({ name: 'couponId', description: '쿠폰 UUID 또는 토큰' })
  @ApiResponse({
    status: 200,
    description: '쿠폰 사용 완료',
    schema: {
      example: {
        coupon_id: 'uuid-here',
        status: 'USED',
        used_at: '2026-05-15T12:00:00.000Z',
        signature_image_url: 'https://...',
        message: '쿠폰 사용이 완료되었습니다.',
      },
    },
  })
  @ApiResponse({ status: 400, description: '서명 이미지 없음 또는 형식 오류', schema: { example: { error: 'SIGNATURE_REQUIRED', message: '운영자 서명이 필요합니다.' } } })
  @ApiResponse({ status: 404, description: '쿠폰 없음', schema: { example: { error: 'COUPON_NOT_FOUND', message: '쿠폰을 찾을 수 없습니다.' } } })
  @ApiResponse({ status: 409, description: '이미 사용된 쿠폰', schema: { example: { error: 'COUPON_ALREADY_USED', message: '이미 사용된 쿠폰입니다.' } } })
  @ApiResponse({ status: 410, description: '만료된 쿠폰', schema: { example: { error: 'COUPON_EXPIRED', message: '만료된 쿠폰입니다.' } } })
  redeemCoupon(@Param('couponId') couponId: string, @Body() body: RedeemCouponDto) {
    return this.couponsService.redeemCoupon(couponId, body);
  }
}
