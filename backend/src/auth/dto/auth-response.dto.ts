import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty()
  user_id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  display_name: string | null;

  @ApiProperty()
  role: string;

  @ApiProperty()
  groups: string[];
}

export class AuthResponseDto {
  @ApiProperty()
  access_token: string;

  @ApiProperty()
  refresh_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;

  @ApiProperty({ description: 'Access token TTL in seconds' })
  expires_in: number;

  @ApiProperty()
  user: AuthUserDto;
}
