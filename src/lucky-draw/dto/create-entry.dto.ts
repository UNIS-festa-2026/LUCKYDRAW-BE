import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateEntryDto {
  @IsString()
  payment_method!: 'BANK_TRANSFER';

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  depositor_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  session_id?: string;
}
