import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';

export const VERIFY_LIMIT = 20;
export const VERIFY_WINDOW_MS = 60_000;

interface LicenseVerifyBody {
  licenseKey?: unknown;
}

@Injectable()
export class LicenseRateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = this.getRequestBody(request);
    const { licenseKey } = body;

    if (typeof licenseKey !== 'string' || licenseKey.length === 0) {
      return true;
    }

    const redis = this.redisService.getClient();
    const keyHash = createHash('sha256')
      .update(licenseKey, 'utf8')
      .digest('hex')
      .slice(0, 32);
    const key = RedisService.rateLimitKey(keyHash);
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.pexpire(key, VERIFY_WINDOW_MS);
    }

    if (count > VERIFY_LIMIT) {
      const ttlMs = await redis.pttl(key);
      const retryAfter = Math.max(1, Math.ceil(ttlMs / 1000));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'License verification rate limit exceeded',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getRequestBody(request: Request): LicenseVerifyBody {
    if (
      request.body !== null &&
      typeof request.body === 'object' &&
      !Array.isArray(request.body)
    ) {
      return request.body as LicenseVerifyBody;
    }

    return {};
  }
}
