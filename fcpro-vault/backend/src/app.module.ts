import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { Customer } from './auth/entities/customer.entity';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AuditLog } from './common/entities/audit-log.entity';
import { EncryptionModule } from './encryption/encryption.module';
import { Device } from './license/entities/device.entity';
import { License } from './license/entities/license.entity';
import { LicenseModule } from './license/license.module';
import { PaymentModule } from './payment/payment.module';
import { Project } from './project/entities/project.entity';
import { ProjectModule } from './project/project.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.getOrThrow<string>('DATABASE_URL'),
        entities: [AuditLog, Customer, Device, License, Project],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    AdminModule,
    AuthModule,
    CommonModule,
    EncryptionModule,
    LicenseModule,
    PaymentModule,
    ProjectModule,
    StorageModule,
  ],
})
export class AppModule {}
