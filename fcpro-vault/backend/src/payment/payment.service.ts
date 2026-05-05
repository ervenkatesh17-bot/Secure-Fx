import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import Stripe from 'stripe';
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

type SupportedTier = LicenseTier;

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: {
      entity?: RazorpayPaymentEntity;
    };
    subscription?: {
      entity?: RazorpaySubscriptionEntity;
    };
  };
}

interface RazorpayPaymentEntity {
  id: string;
  email?: string;
  contact?: string;
  notes?: {
    tier?: string;
    email?: string;
    name?: string;
  };
  customer_id?: string;
}

interface RazorpaySubscriptionEntity {
  id: string;
  customer_id?: string;
  notes?: {
    email?: string;
  };
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2023-10-16',
      },
    );
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const secret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      secret,
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleStripeCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'invoice.paid':
        await this.activateStripeLicense(
          event.data.object as Stripe.Invoice,
          'Stripe invoice paid',
        );
        break;
      case 'customer.subscription.deleted':
        await this.expireStripeLicense(
          event.data.object as Stripe.Subscription,
          'Stripe subscription deleted',
        );
        break;
      case 'invoice.payment_failed':
        await this.suspendStripeLicense(
          event.data.object as Stripe.Invoice,
          'Stripe invoice payment failed',
        );
        break;
      case 'charge.dispute.created':
        await this.suspendStripeLicense(
          event.data.object as Stripe.Dispute,
          'Stripe dispute created',
        );
        break;
      default:
        this.logger.log(`Ignoring unsupported Stripe event ${event.type}`);
    }
  }

  async handleRazorpayWebhook(
    payload: unknown,
    signature: string,
    rawBody: string,
  ): Promise<void> {
    this.verifyRazorpaySignature(
      rawBody,
      signature,
      this.configService.getOrThrow<string>('RAZORPAY_WEBHOOK_SECRET'),
    );

    const webhookPayload = this.parseRazorpayWebhookPayload(payload);

    switch (webhookPayload.event) {
      case 'payment.captured':
        await this.handleRazorpayPaymentCaptured(
          this.requireRazorpayPayment(webhookPayload),
        );
        break;
      case 'subscription.charged':
        await this.activateRazorpayLicense(
          this.requireRazorpaySubscription(webhookPayload),
          'Razorpay subscription charged',
        );
        break;
      case 'subscription.cancelled':
        await this.expireRazorpayLicense(
          this.requireRazorpaySubscription(webhookPayload),
          'Razorpay subscription cancelled',
        );
        break;
      default:
        this.logger.log(
          `Ignoring unsupported Razorpay event ${webhookPayload.event}`,
        );
    }
  }

  private async handleStripeCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const email = this.extractStripeEmail(session);
    const tier = this.parseTier(session.metadata?.tier);
    const stripeCustomerId = this.asStripeId(session.customer);
    const stripeSubscriptionId = this.asStripeId(session.subscription);

    if (stripeCustomerId === null) {
      throw new BadRequestException('Stripe checkout session missing customer');
    }

    const license = await this.licenseRepository.save(
      this.licenseRepository.create({
        licenseKey: this.generateLicenseKey(),
        status: LicenseStatus.ACTIVE,
        tier,
        customerId: stripeCustomerId,
        email,
        maxDevices: this.maxDevicesForTier(tier),
        stripeCustomerId,
        stripeSubscriptionId: stripeSubscriptionId ?? undefined,
        kekAlias: 'fcp-license-kek',
      }),
    );

    await this.auditRepository.save(
      this.auditRepository.create({
        action: AuditAction.LICENSE_CREATED,
        licenseId: license.id,
        deviceId: null,
        ipAddress: null,
        details: `Stripe checkout completed for ${email}`,
      }),
    );
  }

  private async handleRazorpayPaymentCaptured(
    payment: RazorpayPaymentEntity,
  ): Promise<void> {
    const tier = this.parseTier(payment.notes?.tier);
    const email = payment.notes?.email ?? payment.email ?? null;
    const razorpayCustomerId = payment.customer_id ?? payment.id;
    const license = await this.licenseRepository.save(
      this.licenseRepository.create({
        licenseKey: this.generateLicenseKey(),
        status: LicenseStatus.ACTIVE,
        tier,
        customerId: razorpayCustomerId,
        email,
        maxDevices: this.maxDevicesForTier(tier),
        razorpayCustomerId,
        kekAlias: 'fcp-license-kek',
      }),
    );

    await this.auditRepository.save(
      this.auditRepository.create({
        action: AuditAction.LICENSE_CREATED,
        licenseId: license.id,
        deviceId: null,
        ipAddress: null,
        details: `Razorpay payment captured for ${email ?? 'unknown email'}`,
      }),
    );
  }

  private async activateStripeLicense(
    object: Stripe.Invoice,
    details: string,
  ): Promise<void> {
    await this.updateStripeLicenseStatus(
      this.asStripeId(object.subscription) ?? this.asStripeId(object.customer),
      LicenseStatus.ACTIVE,
      details,
    );
  }

  private async suspendStripeLicense(
    object: Stripe.Invoice | Stripe.Dispute,
    details: string,
  ): Promise<void> {
    const stripeRef =
      'subscription' in object
        ? this.asStripeId(object.subscription) ?? this.asStripeId(object.customer)
        : this.asStripeId(object.charge);

    await this.updateStripeLicenseStatus(
      stripeRef,
      LicenseStatus.SUSPENDED,
      details,
    );
  }

  private async expireStripeLicense(
    subscription: Stripe.Subscription,
    details: string,
  ): Promise<void> {
    await this.updateStripeLicenseStatus(
      subscription.id,
      LicenseStatus.EXPIRED,
      details,
    );
  }

  private async activateRazorpayLicense(
    subscription: RazorpaySubscriptionEntity,
    details: string,
  ): Promise<void> {
    await this.updateRazorpayLicenseStatus(
      subscription.customer_id ?? subscription.id,
      LicenseStatus.ACTIVE,
      details,
    );
  }

  private async expireRazorpayLicense(
    subscription: RazorpaySubscriptionEntity,
    details: string,
  ): Promise<void> {
    await this.updateRazorpayLicenseStatus(
      subscription.customer_id ?? subscription.id,
      LicenseStatus.EXPIRED,
      details,
    );
  }

  private async updateStripeLicenseStatus(
    stripeRef: string | null,
    status: LicenseStatus,
    details: string,
  ): Promise<void> {
    if (stripeRef === null) {
      this.logger.warn(`Unable to update Stripe license status: ${details}`);
      return;
    }

    const license = await this.licenseRepository
      .createQueryBuilder('license')
      .where('license.stripeSubscriptionId = :stripeRef', { stripeRef })
      .orWhere('license.stripeCustomerId = :stripeRef', { stripeRef })
      .getOne();

    if (license === null) {
      this.logger.warn(`No Stripe license found for ${stripeRef}`);
      return;
    }

    license.status = status;
    await this.licenseRepository.save(license);
  }

  private async updateRazorpayLicenseStatus(
    razorpayRef: string,
    status: LicenseStatus,
    details: string,
  ): Promise<void> {
    const license = await this.licenseRepository.findOne({
      where: { razorpayCustomerId: razorpayRef },
    });

    if (license === null) {
      this.logger.warn(`No Razorpay license found for ${razorpayRef}`);
      return;
    }

    license.status = status;
    await this.licenseRepository.save(license);
    this.logger.log(`${details} for license ${license.id}`);
  }

  private verifyRazorpaySignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): void {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }
  }

  private generateLicenseKey(): string {
    const value = randomBytes(18).toString('hex').toUpperCase();

    return [
      value.slice(0, 8),
      value.slice(8, 12),
      value.slice(12, 16),
      value.slice(16, 20),
      value.slice(20, 32),
    ].join('-');
  }

  private maxDevicesForTier(tier: SupportedTier): number {
    switch (tier) {
      case 'standard':
        return 2;
      case 'professional':
        return 3;
      case 'enterprise':
        return 10;
      default:
        return 2;
    }
  }

  private parseTier(value: string | null | undefined): LicenseTier {
    if (
      value === LicenseTier.STANDARD ||
      value === LicenseTier.PROFESSIONAL ||
      value === LicenseTier.ENTERPRISE
    ) {
      return value;
    }

    return LicenseTier.STANDARD;
  }

  private extractStripeEmail(session: Stripe.Checkout.Session): string | null {
    return session.customer_details?.email ?? session.customer_email ?? null;
  }

  private asStripeId(value: { id?: string } | string | null): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (value !== null && typeof value.id === 'string') {
      return value.id;
    }

    return null;
  }

  private parseRazorpayWebhookPayload(payload: unknown): RazorpayWebhookPayload {
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'event' in payload &&
      typeof (payload as { event?: unknown }).event === 'string'
    ) {
      return payload as RazorpayWebhookPayload;
    }

    throw new BadRequestException('Invalid Razorpay webhook payload');
  }

  private requireRazorpayPayment(
    payload: RazorpayWebhookPayload,
  ): RazorpayPaymentEntity {
    const payment = payload.payload?.payment?.entity;

    if (payment === undefined) {
      throw new BadRequestException('Razorpay payment payload missing');
    }

    return payment;
  }

  private requireRazorpaySubscription(
    payload: RazorpayWebhookPayload,
  ): RazorpaySubscriptionEntity {
    const subscription = payload.payload?.subscription?.entity;

    if (subscription === undefined) {
      throw new BadRequestException('Razorpay subscription payload missing');
    }

    return subscription;
  }
}
