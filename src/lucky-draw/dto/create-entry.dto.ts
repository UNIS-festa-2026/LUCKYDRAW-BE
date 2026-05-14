import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateEntryDto {
  @ApiProperty({ example: 'BANK_TRANSFER', description: '결제 방식 (현재 계좌이체만 지원)' })
  @IsString()
  payment_method!: 'BANK_TRANSFER';

  @ApiProperty({ example: 990, description: '응모 금액 (원)' })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: '홍길동', description: '입금자명 (최대 40자)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  depositor_name?: string;

  @ApiPropertyOptional({ example: 'session-uuid-here', description: '중복 방지용 세션 ID (최대 100자)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  session_id?: string;
}
