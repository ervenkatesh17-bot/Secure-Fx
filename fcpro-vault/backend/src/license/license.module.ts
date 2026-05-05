import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../auth/entities/customer.entity';
import { AuditLog } from '../common/entities/audit-log.entity';
import { LicenseRateLimitGuard } from '../common/guards/license-rate-limit.guard';
import { CustomerLicenseController } from './customer-license.controller';
import { Device } from './entities/device.entity';
import { License } from './entities/license.entity';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([License, Device, AuditLog, Customer]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS512',
          issuer: 'license-server',
          audience: 'fcp-client',
        },
      }),
    }),
  ],
  controllers: [LicenseController, CustomerLicenseController],
  providers: [LicenseService, LicenseRateLimitGuard],
  exports: [LicenseService],
})
export class LicenseModule {}
