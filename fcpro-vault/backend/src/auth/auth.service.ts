import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Customer, CustomerRole } from './entities/customer.entity';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface TokenUser {
  id: string;
  email: string;
  name: string;
  role: CustomerRole;
}

interface AuthTokenResponse {
  token: string;
  user: TokenUser;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterInput): Promise<AuthTokenResponse> {
    const email = this.normalizeEmail(dto.email);
    const existingCustomer = await this.customerRepository.findOne({
      where: { email },
    });

    if (existingCustomer !== null) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const customer = this.customerRepository.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      role: CustomerRole.CUSTOMER,
    });
    const savedCustomer = await this.customerRepository.save(customer);

    return this.issueToken(savedCustomer);
  }

  async login(email: string, password: string): Promise<AuthTokenResponse> {
    const customer = await this.customerRepository.findOne({
      where: { email: this.normalizeEmail(email) },
    });

    if (customer === null) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, customer.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueToken(customer);
  }

  private async issueToken(customer: Customer): Promise<AuthTokenResponse> {
    const payload = {
      sub: customer.id,
      email: customer.email,
      name: customer.name,
      role: customer.role,
    };
    const token = await this.jwtService.signAsync(payload, {
      algorithm: 'HS512',
      expiresIn: '30d',
      jwtid: randomUUID(),
    });

    return {
      token,
      user: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        role: customer.role,
      },
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
