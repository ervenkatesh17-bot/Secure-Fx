import {
  Controller,
  Delete,
  Headers,
  HttpCode,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenseRateLimitGuard } from '../common/guards/license-rate-limit.guard';
import { VerifyLicenseDto } from './dto/verify-license.dto';
import { LicenseService } from './license.service';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Post('verify')
  @HttpCode(200)
  @Throttle({ auth: { ttl: 60_000, limit: 10 } })
  @UseGuards(LicenseRateLimitGuard)
  async verify(
    @Body() dto: VerifyLicenseDto,
    @Headers('x-forwarded-for') forwardedFor: string | string[] | undefined,
    @Req() request: Request,
  ) {
    return this.licenseService.verify(dto, this.extractClientIp(forwardedFor, request));
  }

  @Delete(':licenseId/device/:deviceId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async revokeDevice(
    @Param('licenseId') licenseId: string,
    @Param('deviceId') deviceId: string,
    @Headers('x-forwarded-for') forwardedFor: string | string[] | undefined,
    @Req() request: Request,
  ): Promise<void> {
    await this.licenseService.revokeDevice(
      licenseId,
      deviceId,
      this.extractClientIp(forwardedFor, request),
    );
  }

  private extractClientIp(
    forwardedFor: string | string[] | undefined,
    request: Request,
  ): string {
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0].split(',')[0].trim();
    }

    return request.ip || request.socket.remoteAddress || '';
  }
}
