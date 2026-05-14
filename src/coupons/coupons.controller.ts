import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get(':couponId')
  @ApiOperation({ summary: '쿠폰 조회', description: '쿠폰 ID 또는 토큰으로 쿠폰 정보를 조회합니다.' })
  @ApiParam({ name: 'couponId', description: '쿠폰 UUID 또는 토큰' })
  @ApiResponse({ status: 200, description: '쿠폰 정보 반환 (status: ASSIGNED | USED | EXPIRED)' })
  @ApiResponse({ status: 404, description: '쿠폰 없음' })
  getCoupon(@Param('couponId') couponId: string) {
    return this.couponsService.getCoupon(couponId);
  }

  @Post(':couponId/redeem')
  @HttpCode(200)
  @ApiOperation({ summary: '쿠폰 사용 처리', description: '운영자 서명 이미지를 첨부하여 쿠폰을 사용 처리합니다.' })
  @ApiParam({ name: 'couponId', description: '쿠폰 UUID 또는 토큰' })
  @ApiResponse({ status: 200, description: '쿠폰 사용 완료' })
  @ApiResponse({ status: 400, description: '서명 이미지 없음 또는 형식 오류' })
  @ApiResponse({ status: 404, description: '쿠폰 없음' })
  @ApiResponse({ status: 409, description: '이미 사용된 쿠폰' })
  @ApiResponse({ status: 410, description: '만료된 쿠폰' })
  redeemCoupon(@Param('couponId') couponId: string, @Body() body: RedeemCouponDto) {
    return this.couponsService.redeemCoupon(couponId, body);
  }
}
