import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { KekService } from './kek.service';

@Module({
  providers: [EncryptionService, KekService],
  exports: [EncryptionService, KekService],
})
export class EncryptionModule {}
