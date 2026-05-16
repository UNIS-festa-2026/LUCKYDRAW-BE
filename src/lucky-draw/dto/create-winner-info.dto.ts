import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateWinnerInfoDto {
  @ApiProperty({ example: '홍길동', description: '수령인 이름 (1~20자)' })
  @IsString()
  @MaxLength(20)
  name!: string;

  @ApiProperty({ example: '01012345678', description: '수령인 휴대폰 번호 (010XXXXXXXX 형식)' })
  @IsString()
  @MaxLength(13)
  phone!: string;

  @ApiProperty({ example: '재미있었어요!', description: '한 줄 후기 (1~100자)' })
  @IsString()
  @MaxLength(100)
  review!: string;
}
