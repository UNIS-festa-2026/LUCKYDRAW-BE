import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get(':couponId')
  getCoupon(@Param('couponId') couponId: string) {
    return this.couponsService.getCoupon(couponId);
  }

  @Post(':couponId/redeem')
  @HttpCode(200)
  redeemCoupon(@Param('couponId') couponId: string, @Body() body: RedeemCouponDto) {
    return this.couponsService.redeemCoupon(couponId, body);
  }
}
