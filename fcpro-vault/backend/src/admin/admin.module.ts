import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../auth/entities/customer.entity';
import { AuditLog } from '../common/entities/audit-log.entity';
import { Device } from '../license/entities/device.entity';
import { License } from '../license/entities/license.entity';
import { LicenseModule } from '../license/license.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([License, Device, AuditLog, Customer]),
    LicenseModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
