import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CustomerRole } from './entities/customer.entity';
import { JtiBlacklistService } from '../common/guards/jti-blacklist.service';

export interface JwtPayload {
  sub: string;
  email?: string;
  name?: string;
  role?: CustomerRole;
  deviceId?: string;
  fingerprintHash?: string;
  licenseKey?: string;
  tier?: string;
  clientIpHash?: string;
  iat?: number;
  exp?: number;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly ipBindingStrict: boolean;

  constructor(
    configService: ConfigService,
    private readonly jtiBlacklist: JtiBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS512'],
      issuer: 'license-server',
      audience: 'fcp-client',
      passReqToCallback: true,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
    this.ipBindingStrict =
      configService.get<string>('IP_BINDING_STRICT', 'true') === 'true';
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.jti !== 'string' ||
      payload.jti.length === 0
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const isRevoked = await this.jtiBlacklist.isBlacklisted(payload.jti);

    if (isRevoked) {
      this.logger.warn(`Rejected revoked token jti=${payload.jti}`);
      throw new UnauthorizedException('Token has been revoked');
    }

    if (
      this.hasLicenseBindingFields(payload) &&
      !this.isIpBindingValid(req, payload)
    ) {
      const message = `IP binding mismatch for token jti=${payload.jti}`;

      if (this.ipBindingStrict) {
        this.logger.warn(message);
        throw new UnauthorizedException('Token IP binding mismatch');
      }

      this.logger.warn(`${message}; allowing because IP_BINDING_STRICT=false`);
    }

    return payload;
  }

  static hashIp(ip: string): string {
    const normalized = ip.replace(/^::ffff:/, '');

    return createHash('sha256').update(normalized).digest('hex');
  }

  private hasLicenseBindingFields(payload: JwtPayload): boolean {
    return (
      payload.deviceId !== undefined ||
      payload.fingerprintHash !== undefined ||
      payload.licenseKey !== undefined ||
      payload.tier !== undefined ||
      payload.clientIpHash !== undefined
    );
  }

  private isIpBindingValid(req: Request, payload: JwtPayload): boolean {
    if (
      typeof payload.deviceId !== 'string' ||
      payload.deviceId.length === 0 ||
      typeof payload.clientIpHash !== 'string' ||
      payload.clientIpHash.length === 0
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const currentIpHash = JwtStrategy.hashIp(this.extractIp(req));
    const expected = Buffer.from(payload.clientIpHash, 'hex');
    const actual = Buffer.from(currentIpHash, 'hex');

    if (expected.length !== actual.length || expected.length === 0) {
      return false;
    }

    return timingSafeEqual(expected, actual);
  }

  private extractIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];

    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0].split(',')[0].trim();
    }

    return req.ip || req.socket.remoteAddress || '';
  }
}
