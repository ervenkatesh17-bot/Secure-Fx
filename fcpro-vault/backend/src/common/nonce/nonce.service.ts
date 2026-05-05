import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export const NONCE_TTL_MS = (300 + 30 + 5) * 1000;

@Injectable()
export class NonceService {
  private readonly logger = new Logger(NonceService.name);

  constructor(private readonly redisService: RedisService) {}

  async claimNonce(
    nonce: string,
    deviceId: string,
    licenseId: string,
  ): Promise<void> {
    const redis = this.redisService.getClient();
    const key = RedisService.nonceKey(nonce);
    const value = `${deviceId}:${licenseId}:${Date.now()}`;
    const result = await redis.set(key, value, 'PX', NONCE_TTL_MS, 'NX');

    if (result === null) {
      this.logger.warn(
        `Replay attempt detected for nonce ${nonce} on device ${deviceId} and license ${licenseId}`,
      );
      throw new UnauthorizedException(
        'Nonce already used — replay attack detected',
      );
    }
  }

  async isNonceUsed(nonce: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    const exists = await redis.exists(RedisService.nonceKey(nonce));

    return exists === 1;
  }

  async revokeNonce(nonce: string): Promise<void> {
    const redis = this.redisService.getClient();
    await redis.del(RedisService.nonceKey(nonce));
  }
}
