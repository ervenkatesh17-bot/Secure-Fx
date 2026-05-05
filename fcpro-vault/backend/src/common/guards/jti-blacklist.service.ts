import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export const BLACKLIST_TTL_SEC = 360;

@Injectable()
export class JtiBlacklistService {
  private readonly logger = new Logger(JtiBlacklistService.name);

  constructor(private readonly redisService: RedisService) {}

  async blacklist(jti: string, reason: string): Promise<void> {
    await this.redisService
      .getClient()
      .setex(RedisService.tokenJtiKey(jti), BLACKLIST_TTL_SEC, reason);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const exists = await this.redisService
      .getClient()
      .exists(RedisService.tokenJtiKey(jti));

    return exists === 1;
  }

  async blacklistDevice(jtiList: string[], reason: string): Promise<void> {
    if (jtiList.length === 0) {
      return;
    }

    const pipeline = this.redisService.getClient().multi();

    for (const jti of jtiList) {
      pipeline.setex(RedisService.tokenJtiKey(jti), BLACKLIST_TTL_SEC, reason);
    }

    const results = await pipeline.exec();

    if (results === null) {
      this.logger.error('Redis pipeline for JTI blacklist did not execute');
      throw new Error('Unable to blacklist device tokens');
    }

    const failed = results.find(([error]) => error !== null);

    if (failed !== undefined) {
      this.logger.error('Redis pipeline for JTI blacklist failed', failed[0]);
      throw failed[0];
    }
  }
}
