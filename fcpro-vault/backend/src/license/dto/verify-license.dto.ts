import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class VerifyLicenseDto {
  @IsString()
  @Length(36, 36)
  @Matches(/^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}$/)
  licenseKey: string;

  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]{64}$/)
  fingerprintHash: string;

  @IsUUID('4')
  nonce: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  timestamp: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  platform?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  osVersion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  appVersion?: string;
}
