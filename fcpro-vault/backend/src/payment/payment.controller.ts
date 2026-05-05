import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook/stripe')
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | string[] | undefined,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody;

    if (rawBody === undefined) {
      throw new BadRequestException('Missing raw request body');
    }

    await this.paymentService.handleStripeWebhook(
      rawBody,
      this.requireSingleHeader(signature, 'stripe-signature'),
    );

    return { received: true };
  }

  @Post('webhook/razorpay')
  async handleRazorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers('x-razorpay-signature') signature: string | string[] | undefined,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(body);

    await this.paymentService.handleRazorpayWebhook(
      body,
      this.requireSingleHeader(signature, 'x-razorpay-signature'),
      rawBody,
    );

    return { received: true };
  }

  private requireSingleHeader(
    value: string | string[] | undefined,
    name: string,
  ): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (Array.isArray(value) && value.length > 0 && value[0].length > 0) {
      return value[0];
    }

    throw new BadRequestException(`Missing ${name} header`);
  }
}
