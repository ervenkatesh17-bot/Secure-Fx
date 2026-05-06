import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { IsEmail, IsIn, IsString, MaxLength } from 'class-validator';

type RazorpayPlan = 'standard' | 'professional' | 'enterprise';

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
}

interface RazorpayOrdersClient {
  create(options: {
    amount: number;
    currency: 'INR';
    receipt: string;
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

export class VerifyPaymentDto {
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

const PLAN_AMOUNTS: Record<RazorpayPlan, number> = {
  standard: 199_900,
  professional: 399_900,
  enterprise: 799_900,
};

@Controller('payment/razorpay')
export class RazorpayOrderController {
  constructor(private readonly configService: ConfigService) {}

  @Post('order')
  @HttpCode(200)
  async createOrder(@Body() dto: CreateOrderDto): Promise<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string | undefined;
  }> {
    const Razorpay = require('razorpay') as RazorpayConstructor;
    const instance = new Razorpay({
      key_id: this.configService.getOrThrow<string>('RAZORPAY_KEY_ID'),
      key_secret: this.configService.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
    });
    const order = await instance.orders.create({
      amount: PLAN_AMOUNTS[dto.plan],
      currency: 'INR',
      receipt: `fcp_${Date.now()}`,
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
      keyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
    };
  }

  @Post('verify')
  @HttpCode(200)
  async verifyPayment(@Body() dto: VerifyPaymentDto): Promise<{
    message: string;
    email: string;
  }> {
    const secret = this.configService.getOrThrow<string>(
      'RAZORPAY_KEY_SECRET',
    );
    const body = `${dto.razorpay_order_id}|${dto.razorpay_payment_id}`;
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    let valid: boolean;

    try {
      valid = timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(dto.razorpay_signature, 'hex'),
      );
    } catch {
      valid = false;
    }

    if (!valid) {
      throw new BadRequestException('Invalid payment signature');
    }

    return {
      message:
        'Payment verified successfully. Your license key will be sent to your email shortly.',
      email: dto.email,
    };
  }
}
