import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook/razorpay')
  @HttpCode(200)
  async razorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Body() body: Record<string, any>,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing signature header');
    }

    const rawBody = req.rawBody?.toString('utf-8') ?? JSON.stringify(body);
    await this.paymentService.handleRazorpayWebhook(body, signature, rawBody);

    return { received: true };
  }
}
