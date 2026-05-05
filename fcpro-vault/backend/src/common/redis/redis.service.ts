import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    const tlsEnabled = this.parseBoolean(
      this.configService.get<string>('REDIS_TLS'),
    );
    const options: RedisOptions = {
      host: this.configService.getOrThrow<string>('REDIS_HOST'),
      port: Number(this.configService.getOrThrow<string>('REDIS_PORT')),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
      commandTimeout: 2_000,
      retryStrategy: (times: number): number | null => {
        if (times > 5) {
          return null;
        }

        return Math.min(100 * 2 ** (times - 1), 2_000);
      },
    };

    if (tlsEnabled) {
      options.tls = {};
    }

    this.client = new Redis(options);
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.initialized = true;
    this.logger.log('Redis connection initialized');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }

    this.initialized = false;
  }

  getClient(): Redis {
    if (!this.initialized) {
      throw new Error('Redis client is not initialized');
    }

    return this.client;
  }

  static nonceKey(nonce: string): string {
    return `nonce:${nonce}`;
  }

  static dekCacheKey(licenseId: string, kekAlias: string): string {
    return `dek:${kekAlias}:${licenseId}`;
  }

  static tokenJtiKey(jti: string): string {
    return `jti:${jti}`;
  }

  static rateLimitKey(hash: string): string {
    return `rl:license:${hash}`;
  }

  private parseBoolean(value: string | undefined): boolean {
    return value === 'true' || value === '1';
  }
}
