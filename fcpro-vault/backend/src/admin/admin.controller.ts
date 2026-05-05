import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenseStatus } from '../license/entities/license.entity';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

class LicenseListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn([
    LicenseStatus.ACTIVE,
    LicenseStatus.EXPIRED,
    LicenseStatus.SUSPENDED,
    LicenseStatus.REVOKED,
  ])
  status?: LicenseStatus;
}

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  licenseId?: string;
}

class RevokeLicenseDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('licenses')
  async getLicenses(@Query() query: LicenseListQueryDto) {
    return this.adminService.getLicenses({
      page: query.page ?? 1,
      limit: query.limit ?? 25,
      search: query.search,
      status: query.status,
    });
  }

  @Get('licenses/:id')
  async getLicense(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getLicense(id);
  }

  @Post('licenses/:id/revoke')
  async revokeLicense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RevokeLicenseDto,
  ) {
    await this.adminService.revokeLicense(id, body.reason);

    return { revoked: true };
  }

  @Get('audit')
  async getAuditLogs(@Query() query: AuditQueryDto) {
    return this.adminService.getAuditLogs({
      page: query.page ?? 1,
      limit: query.limit ?? 25,
      licenseId: query.licenseId,
    });
  }
}
