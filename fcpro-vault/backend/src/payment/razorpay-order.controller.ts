import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';

type RazorpayPlan = 'standard' | 'professional' | 'enterprise';

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
}

interface RazorpayOrdersClient {
  create(options: {
    amount: number;
    currency: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrderResponse>;
}

interface RazorpayClient {
  orders: RazorpayOrdersClient;
}

interface RazorpayConstructor {
  new (options: { key_id: string; key_secret: string }): RazorpayClient;
}

export class CreateOrderDto {
  @IsIn(['standard', 'professional', 'enterprise'])
  plan: RazorpayPlan;

  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(100)
  name: string;
}

export class VerifyRazorpayOrderDto {
  @IsString()
  razorpay_order_id: string;

  @IsString()
  razorpay_payment_id: string;

  @IsString()
  razorpay_signature: string;

  @IsIn(['standard', 'professional', 'enterprise'])
  plan: RazorpayPlan;

  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(100)
  name: string;
}

const PLAN_AMOUNTS_PAISE: Record<RazorpayPlan, number> = {
  standard: 199_900,
  professional: 399_900,
  enterprise: 799_900,
};

@Controller('payment/razorpay')
export class RazorpayOrderController {
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly razorpay: RazorpayClient;

  constructor(private readonly configService: ConfigService) {
    this.keyId = this.configService.getOrThrow<string>('RAZORPAY_KEY_ID');
    this.keySecret = this.configService.getOrThrow<string>(
      'RAZORPAY_KEY_SECRET',
    );
    const Razorpay = require('razorpay') as RazorpayConstructor;
    this.razorpay = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret,
    });
  }

  @Post('order')
  async createOrder(@Body() dto: CreateOrderDto) {
    const amount = PLAN_AMOUNTS_PAISE[dto.plan];
    const currency = 'INR';
    const order = await this.razorpay.orders.create({
      amount,
      currency,
      notes: {
        plan: dto.plan,
        email: dto.email,
        name: dto.name,
      },
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.keyId,
    };
  }

  @Post('verify')
  verifyPayment(@Body() dto: VerifyRazorpayOrderDto) {
    const expectedSignature = createHmac('sha256', this.keySecret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');

    if (!this.isSignatureMatch(expectedSignature, dto.razorpay_signature)) {
      throw new BadRequestException('Invalid Razorpay signature');
    }

    return {
      success: true,
      message: 'Payment verified. License will be created by webhook.',
    };
  }

  private isSignatureMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');

    if (
      expectedBuffer.length === 0 ||
      expectedBuffer.length !== actualBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
