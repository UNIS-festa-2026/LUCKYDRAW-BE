import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEntryDto {
  @ApiPropertyOptional({ example: 'session-uuid-here', description: '중복 방지용 세션 ID (최대 100자)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  session_id?: string;
}
