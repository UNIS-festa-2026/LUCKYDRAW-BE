import { IsString } from 'class-validator';

export class RedeemCouponDto {
  @IsString()
  signature_image!: string;
}
