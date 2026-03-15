import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  current_password: string;

  @ApiProperty({ description: '8자 이상, 영문+숫자+특수문자 포함' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/`~\\]).{8,}$/, {
    message: '비밀번호는 영문, 숫자, 특수문자를 각각 1자 이상 포함해야 합니다',
  })
  new_password: string;
}
