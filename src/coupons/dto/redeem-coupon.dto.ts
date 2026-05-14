import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RedeemCouponDto {
  @ApiProperty({ example: 'data:image/png;base64,iVBORw0KGgo...', description: '운영자 서명 이미지 (PNG Data URL)' })
  @IsString()
  signature_image!: string;
}
