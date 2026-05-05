import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { KEY_BYTES } from '../../encryption/encryption.service';
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
  private readonly logger = new Logger(DekCacheService.name);
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
  private readonly kmsClient: KMSClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.kmsClient = new KMSClient({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>(
          'AWS_ACCESS_KEY_ID',
        ),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async getOrGenerateDek(
    licenseId: string,
    kekAlias: string,
  ): Promise<DekPair> {
    const key = this.cacheKey(licenseId, kekAlias);
    const cachedDekB64 =
      this.getFromMemory(key) ?? (await this.getFromRedis(key));

    if (cachedDekB64 !== null) {
      if (this.getFromMemory(key) === null) {
        this.setInMemory(key, cachedDekB64);
      }

      return {
        plaintextDek: await this.kmsDecrypt(cachedDekB64),
        encryptedDekB64: cachedDekB64,
      };
    }

    const generated = await this.generateFromKms(kekAlias);
    await this.setInRedis(key, generated.encryptedDekB64);
    this.setInMemory(key, generated.encryptedDekB64);

    return generated;
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

    if (encryptedDekB64 === null) {
      return null;
    }

    this.setInMemory(key, encryptedDekB64);

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

  private async generateFromKms(kekAlias: string): Promise<DekPair> {
    try {
      const response = await this.kmsClient.send(
        new GenerateDataKeyCommand({
          KeyId: kekAlias,
          KeySpec: 'AES_256',
        }),
      );

      if (
        response.Plaintext === undefined ||
        response.CiphertextBlob === undefined
      ) {
        throw new Error('KMS GenerateDataKey response was incomplete');
      }

      const plaintextDek = Buffer.from(response.Plaintext);

      if (plaintextDek.length !== KEY_BYTES) {
        plaintextDek.fill(0);
        throw new Error('KMS GenerateDataKey returned an invalid DEK length');
      }

      return {
        plaintextDek,
        encryptedDekB64: Buffer.from(response.CiphertextBlob).toString('base64'),
      };
    } catch (error) {
      this.logger.error('Failed to generate DEK from KMS');
      throw new InternalServerErrorException('Unable to generate data key');
    }
  }

  private async kmsDecrypt(encryptedDekB64: string): Promise<Buffer> {
    try {
      const response = await this.kmsClient.send(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(encryptedDekB64, 'base64'),
        }),
      );

      if (response.Plaintext === undefined) {
        throw new Error('KMS Decrypt response did not include Plaintext');
      }

      const plaintextDek = Buffer.from(response.Plaintext);

      if (plaintextDek.length !== KEY_BYTES) {
        plaintextDek.fill(0);
        throw new Error('KMS Decrypt returned an invalid DEK length');
      }

      return plaintextDek;
    } catch (error) {
      this.logger.error('Failed to decrypt cached DEK with KMS');
      throw new InternalServerErrorException('Unable to decrypt data key');
    }
  }

  private cacheKey(licenseId: string, kekAlias: string): string {
    return RedisService.dekCacheKey(licenseId, kekAlias);
  }
}
