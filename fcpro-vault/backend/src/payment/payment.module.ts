import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../common/entities/audit-log.entity';
import { License } from '../license/entities/license.entity';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { RazorpayOrderController } from './razorpay-order.controller';

@Module({
  imports: [TypeOrmModule.forFeature([License, AuditLog])],
  providers: [PaymentService],
  controllers: [PaymentController, RazorpayOrderController],
})
export class PaymentModule {}
