import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

class DecisionRequestEventDto {
  @ApiProperty({
    enum: ['TYPE', 'PASTE', 'SUBMIT', 'UPLOAD_SELECT', 'UPLOAD_SUBMIT'],
  })
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  occurred_at: string;

  @ApiProperty()
  @IsObject()
  app: { domain: string; url: string; app_id_hint?: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  page_context?: {
    path?: string;
    title?: string;
    workspace_hint?: string;
    submit_kind?: string;
  };
}

class UserHintDto {
  @ApiProperty({ type: [String], description: 'User group names' })
  @IsArray()
  @IsString({ each: true })
  groups: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  display_name?: string;
}

class DeviceInfoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  os?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  browser?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extension_version?: string;
}

class ContentDto {
  @ApiProperty({ enum: ['TEXT', 'FILE_META'] })
  @IsString()
  kind: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  length: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  hashes?: { sha256?: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sample_masked?: string;

  @ApiProperty({ type: [Object], description: 'Array of detector results' })
  @IsArray()
  local_detectors: Array<{ type: string; count: number; confidence?: number }>;
}

export class DecisionRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  trace_id: string;

  @ApiProperty()
  @IsObject()
  event: DecisionRequestEventDto;

  @ApiProperty()
  @IsObject()
  actor: { user_hint: UserHintDto; device: DeviceInfoDto; network?: object };

  @ApiProperty()
  @IsObject()
  content: ContentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  file?: {
    name: string;
    size_bytes: number;
    mime?: string;
    ext?: string;
    hashes?: object;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  schema_version?: number;

  /** 승인된 case_id. 있으면 해당 케이스가 APPROVED이고 미사용일 때 1회 ALLOW 후 소진 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approved_case_id?: string;
}
