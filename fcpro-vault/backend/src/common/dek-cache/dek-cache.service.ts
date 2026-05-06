import { Injectable } from '@nestjs/common';
import { KekService } from '../../encryption/kek.service';
import { RedisService } from '../redis/redis.service';

export const DEK_CACHE_TTL_SEC = 86_400;
export const MEMORY_CACHE_MAX = 500;
export const MEMORY_CACHE_TTL_MS = 300_000;

export interface DekPair {
  plaintextDek: Buffer;
  encryptedDekB64: string;
}

interface MemoryCacheEntry {
  encryptedDekB64: string;
  expiresAt: number;
}

@Injectable()
export class DekCacheService {
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();

  constructor(
    private readonly redisService: RedisService,
    private readonly kekService: KekService,
  ) {}

  async getOrGenerateDek(
    licenseId: string,
    kekAlias: string,
  ): Promise<DekPair> {
    const key = this.cacheKey(licenseId, kekAlias);
    const cachedDekB64 =
      this.getFromMemory(key) ?? (await this.getFromRedis(key));

    if (cachedDekB64 !== null) {
      return {
        plaintextDek: await this.kekService.decryptDek(
          Buffer.from(cachedDekB64, 'base64'),
        ),
        encryptedDekB64: cachedDekB64,
      };
    }

    const generated = await this.kekService.generateDek();
    const encryptedDekB64 = generated.encryptedDek.toString('base64');
    await this.setInRedis(key, encryptedDekB64);
    this.setInMemory(key, encryptedDekB64);

    return {
      plaintextDek: generated.plaintextDek,
      encryptedDekB64,
    };
  }

  async getEncryptedDek(licenseId: string, kekAlias: string): Promise<string> {
    const dekPair = await this.getOrGenerateDek(licenseId, kekAlias);

    try {
      return dekPair.encryptedDekB64;
    } finally {
      dekPair.plaintextDek.fill(0);
    }
  }

  async invalidate(licenseId: string, kekAlias: string): Promise<void> {
    const key = this.cacheKey(licenseId, kekAlias);
    this.memoryCache.delete(key);
    await this.redisService.getClient().del(key);
  }

  private getFromMemory(key: string): string | null {
    const entry = this.memoryCache.get(key);

    if (entry === undefined) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }

    this.memoryCache.delete(key);
    this.memoryCache.set(key, entry);

    return entry.encryptedDekB64;
  }

  private setInMemory(key: string, encryptedDekB64: string): void {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    }

    while (this.memoryCache.size >= MEMORY_CACHE_MAX) {
      const oldest = this.memoryCache.keys().next().value as
        | string
        | undefined;

      if (oldest === undefined) {
        break;
      }

      this.memoryCache.delete(oldest);
    }

    this.memoryCache.set(key, {
      encryptedDekB64,
      expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
    });
  }

  private async getFromRedis(key: string): Promise<string | null> {
    const encryptedDekB64 = await this.redisService.getClient().get(key);

    if (encryptedDekB64 !== null) {
      this.setInMemory(key, encryptedDekB64);
    }

    return encryptedDekB64;
  }

  private async setInRedis(
    key: string,
    encryptedDekB64: string,
  ): Promise<void> {
    await this.redisService
      .getClient()
      .set(key, encryptedDekB64, 'EX', DEK_CACHE_TTL_SEC);
  }

  private cacheKey(licenseId: string, kekAlias: string): string {
    return RedisService.dekCacheKey(licenseId, kekAlias);
  }
}
