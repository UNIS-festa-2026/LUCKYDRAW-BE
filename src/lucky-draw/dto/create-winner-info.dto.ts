import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateWinnerInfoDto {
  @ApiProperty({ example: '홍길동', description: '수령인 이름 (최대 40자)' })
  @IsString()
  @MaxLength(40)
  name!: string;

  @ApiProperty({ example: '01012345678', description: '수령인 휴대폰 번호 (010XXXXXXXX 형식)' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @ApiProperty({ example: '재미있었어요!', description: '한 줄 후기 (최대 200자)' })
  @IsString()
  @MaxLength(200)
  review!: string;
}
