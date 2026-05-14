import { IsString, MaxLength } from 'class-validator';

export class CreateWinnerInfoDto {
  @IsString()
  @MaxLength(40)
  name!: string;

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @MaxLength(200)
  review!: string;
}
