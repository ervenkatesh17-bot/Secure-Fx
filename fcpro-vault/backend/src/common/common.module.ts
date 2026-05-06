import { Global, Module } from '@nestjs/common';
import { DekCacheService } from './dek-cache/dek-cache.service';
import { JtiBlacklistService } from './guards/jti-blacklist.service';
import { LicenseRateLimitGuard } from './guards/license-rate-limit.guard';
import { HealthController } from './health.controller';
import { NonceService } from './nonce/nonce.service';
import { RedisService } from './redis/redis.service';
import { EncryptionModule } from '../encryption/encryption.module';

@Global()
@Module({
  imports: [EncryptionModule],
  controllers: [HealthController],
  providers: [
    RedisService,
    NonceService,
    DekCacheService,
    JtiBlacklistService,
    LicenseRateLimitGuard,
  ],
  exports: [
    RedisService,
    NonceService,
    DekCacheService,
    JtiBlacklistService,
    LicenseRateLimitGuard,
  ],
})
export class CommonModule {}
