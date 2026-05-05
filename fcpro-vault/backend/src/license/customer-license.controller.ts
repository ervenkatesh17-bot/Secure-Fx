import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Customer } from '../auth/entities/customer.entity';
import { License } from './entities/license.entity';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('license')
export class CustomerLicenseController {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
  ) {}

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async myLicense(@Req() req: AuthenticatedRequest): Promise<License> {
    const customer = await this.customerRepository.findOne({
      where: { id: req.user.sub },
    });

    if (customer === null) {
      throw new NotFoundException('Customer not found');
    }

    const license = await this.licenseRepository.findOne({
      where: { email: customer.email },
      relations: ['devices'],
    });

    if (license === null) {
      throw new NotFoundException('License not found');
    }

    return license;
  }
}
