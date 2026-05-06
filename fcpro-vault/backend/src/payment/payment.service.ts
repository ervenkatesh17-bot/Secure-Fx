import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../common/entities/audit-log.entity';
import {
  License,
  LicenseStatus,
  LicenseTier,
} from '../license/entities/license.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async handleRazorpayWebhook(
    payload: Record<string, any>,
    signature: string,
    rawBody: string,
  ): Promise<void> {
    const secret = this.configService.getOrThrow<string>(
      'RAZORPAY_WEBHOOK_SECRET',
    );
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    if (!this.isSignatureMatch(expected, signature)) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }

    switch (payload.event) {
      case 'payment.captured':
        await this.handlePaymentCaptured(payload.payload?.payment?.entity);
        break;
      case 'subscription.charged':
        await this.handleSubscriptionCharged(
          payload.payload?.subscription?.entity,
        );
        break;
      case 'subscription.cancelled':
        await this.handleSubscriptionCancelled(
          payload.payload?.subscription?.entity,
        );
        break;
      default:
        this.logger.debug(`Unhandled event: ${String(payload.event)}`);
    }
  }

  private async handlePaymentCaptured(payment: any): Promise<void> {
    if (!payment) {
      return;
    }

    const tier = this.normalizeTier(payment.notes?.tier ?? 'standard');
    const email = payment.email ?? payment.notes?.email ?? null;
    const customerId = payment.contact ?? payment.id;

    if (typeof customerId !== 'string' || customerId.length === 0) {
      this.logger.warn('Razorpay payment missing contact and payment id');
      return;
    }

    const license = this.licenseRepository.create({
      licenseKey: this.generateLicenseKey(),
      status: LicenseStatus.ACTIVE,
      tier,
      customerId,
      email,
      razorpayCustomerId: payment.customer_id ?? null,
      razorpayPaymentId: payment.id,
      maxDevices: this.maxDevicesForTier(tier),
      kekAlias: 'fcp-license-kek',
    });

    await this.licenseRepository.save(license);
    await this.createAuditLog(
      license.id,
      AuditAction.LICENSE_CREATED,
      'razorpay-webhook',
    );
    this.logger.log(
      `License created: ${license.licenseKey} | tier: ${tier} | email: ${email}`,
    );
  }

  private async handleSubscriptionCharged(subscription: any): Promise<void> {
    if (!subscription?.customer_id) {
      return;
    }

    await this.licenseRepository.update(
      { razorpayCustomerId: subscription.customer_id },
      { status: LicenseStatus.ACTIVE },
    );
  }

  private async handleSubscriptionCancelled(subscription: any): Promise<void> {
    if (!subscription?.customer_id) {
      return;
    }

    await this.licenseRepository.update(
      { razorpayCustomerId: subscription.customer_id },
      { status: LicenseStatus.EXPIRED },
    );
  }

  private generateLicenseKey(): string {
    const hex = randomBytes(18).toString('hex').toUpperCase();

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16,
    )}-${hex.slice(16, 20)}-${hex.slice(20, 36)}`;
  }

  private maxDevicesForTier(tier: string): number {
    const map: Record<string, number> = {
      standard: 2,
      professional: 3,
      enterprise: 10,
    };

    return map[tier] ?? 2;
  }

  private async createAuditLog(
    licenseId: string,
    action: AuditAction,
    ip: string,
  ): Promise<void> {
    try {
      await this.auditRepository.save(
        this.auditRepository.create({
          licenseId,
          action,
          ipAddress: ip,
          deviceId: null,
          details: null,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Audit log failed: ${message}`);
    }
  }

  private isSignatureMatch(expected: string, actual: string): boolean {
    try {
      const expectedBuffer = Buffer.from(expected, 'hex');
      const actualBuffer = Buffer.from(actual, 'hex');

      return (
        expectedBuffer.length > 0 &&
        expectedBuffer.length === actualBuffer.length &&
        timingSafeEqual(expectedBuffer, actualBuffer)
      );
    } catch {
      return false;
    }
  }

  private normalizeTier(tier: string): LicenseTier {
    if (
      tier === LicenseTier.STANDARD ||
      tier === LicenseTier.PROFESSIONAL ||
      tier === LicenseTier.ENTERPRISE
    ) {
      return tier;
    }

    return LicenseTier.STANDARD;
  }
}
