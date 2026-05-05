import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../common/entities/audit-log.entity';
import { DekCacheService } from '../common/dek-cache/dek-cache.service';
import { NonceService } from '../common/nonce/nonce.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { Device } from './entities/device.entity';
import { License, LicenseStatus } from './entities/license.entity';
import { VerifyLicenseDto } from './dto/verify-license.dto';

export const TIMESTAMP_DRIFT_SEC = 30;
export const TOKEN_TTL_SEC = 300;
export const MAX_DEVICES = 2;

export interface LicenseToken {
  accessToken: string;
  expiresAt: number;
  deviceId: string;
  encryptedDek: string;
  kekAlias: string;
}

@Injectable()
export class LicenseService {
  constructor(
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly nonceService: NonceService,
    private readonly dekCacheService: DekCacheService,
  ) {}

  async verify(
    dto: VerifyLicenseDto,
    clientIp: string,
  ): Promise<LicenseToken> {
    this.assertTimestamp(dto.timestamp);

    const nonceHash = createHash('sha256')
      .update(dto.licenseKey, 'utf8')
      .digest('hex')
      .slice(0, 16);

    await this.nonceService.claimNonce(dto.nonce, nonceHash, 'pre-verify');

    return this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager): Promise<LicenseToken> => {
        const license = await manager.getRepository(License).findOne({
          where: { licenseKey: dto.licenseKey },
          relations: ['devices'],
          lock: { mode: 'pessimistic_write' },
        });

        if (license === null) {
          await this.audit(
            manager,
            AuditAction.VERIFY_FAIL,
            null,
            null,
            clientIp,
            'License key not found',
          );
          throw new UnauthorizedException('Invalid license');
        }

        this.assertLicenseActive(license);

        const device = await this.resolveDevice(manager, license, dto, clientIp);
        const nowDate = new Date();

        device.lastSeenAt = nowDate;
        device.lastSeenIp = clientIp;
        await manager.getRepository(Device).save(device);

        license.verificationCount += 1;
        license.lastVerifiedAt = nowDate;
        license.lastVerifiedIp = clientIp;
        await manager.getRepository(License).save(license);

        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + TOKEN_TTL_SEC;
        const jti = randomUUID();
        const kekAlias = this.resolveKekAlias(license);
        const payload = {
          sub: license.id,
          deviceId: device.id,
          fingerprintHash: dto.fingerprintHash,
          licenseKey: license.licenseKey,
          tier: license.tier,
          clientIpHash: JwtStrategy.hashIp(clientIp),
        };
        const accessToken = await this.jwtService.signAsync(payload, {
          algorithm: 'HS512',
          expiresIn: TOKEN_TTL_SEC,
          jwtid: jti,
        });
        const encryptedDek = await this.dekCacheService.getEncryptedDek(
          license.id,
          kekAlias,
        );

        await this.audit(
          manager,
          AuditAction.VERIFY_SUCCESS,
          license.id,
          device.id,
          clientIp,
          'License verification succeeded',
        );

        return {
          accessToken,
          expiresAt,
          deviceId: device.id,
          encryptedDek,
          kekAlias,
        };
      },
    );
  }

  async revokeDevice(
    licenseId: string,
    deviceId: string,
    requestorIp: string,
  ): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const license = await manager.getRepository(License).findOne({
        where: { id: licenseId },
        lock: { mode: 'pessimistic_write' },
      });

      if (license === null) {
        throw new NotFoundException('License not found');
      }

      const device = await manager.getRepository(Device).findOne({
        where: { id: deviceId, licenseId },
        lock: { mode: 'pessimistic_write' },
      });

      if (device === null) {
        throw new NotFoundException('Device not found');
      }

      device.isActive = false;
      await manager.getRepository(Device).save(device);
      await this.dekCacheService.invalidate(
        license.id,
        this.resolveKekAlias(license),
      );
      await this.audit(
        manager,
        AuditAction.DEVICE_REVOKE,
        license.id,
        device.id,
        requestorIp,
        'Device revoked',
      );
    });
  }

  async revokeLicense(
    licenseId: string,
    reason: string,
    requestorIp: string,
  ): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const license = await manager.getRepository(License).findOne({
        where: { id: licenseId },
        lock: { mode: 'pessimistic_write' },
      });

      if (license === null) {
        throw new NotFoundException('License not found');
      }

      license.status = LicenseStatus.REVOKED;
      await manager.getRepository(License).save(license);
      await this.dekCacheService.invalidate(
        license.id,
        this.resolveKekAlias(license),
      );
      await this.audit(
        manager,
        AuditAction.LICENSE_REVOKE,
        license.id,
        null,
        requestorIp,
        reason,
      );
    });
  }

  private assertTimestamp(timestamp: number): void {
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException('Invalid timestamp');
    }

    const now = Math.floor(Date.now() / 1000);
    const drift = Math.abs(now - timestamp);

    if (drift > TIMESTAMP_DRIFT_SEC) {
      throw new BadRequestException('Request timestamp is outside allowed drift');
    }
  }

  private assertLicenseActive(license: License): void {
    if (!license.isActive) {
      throw new UnauthorizedException('License is not active');
    }
  }

  private async resolveDevice(
    manager: EntityManager,
    license: License,
    dto: VerifyLicenseDto,
    clientIp: string,
  ): Promise<Device> {
    const deviceRepository = manager.getRepository(Device);
    const existingDevice = await deviceRepository.findOne({
      where: {
        licenseId: license.id,
        fingerprintHash: dto.fingerprintHash,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (existingDevice !== null) {
      if (!existingDevice.isActive) {
        await this.audit(
          manager,
          AuditAction.VERIFY_FAIL,
          license.id,
          existingDevice.id,
          clientIp,
          'Device is revoked',
        );
        throw new UnauthorizedException('Device has been revoked');
      }

      return existingDevice;
    }

    const activeCount = (license.devices ?? []).filter(
      (device) => device.isActive,
    ).length;
    const maxDevices = license.maxDevices || MAX_DEVICES;

    if (activeCount >= maxDevices) {
      await this.audit(
        manager,
        AuditAction.DEVICE_LIMIT,
        license.id,
        null,
        clientIp,
        'Device limit reached',
      );
      throw new ConflictException('Device limit reached');
    }

    const device = deviceRepository.create({
      licenseId: license.id,
      license,
      fingerprintHash: dto.fingerprintHash,
      deviceName: dto.deviceName ?? null,
      platform: dto.platform ?? null,
      osVersion: dto.osVersion ?? null,
      appVersion: dto.appVersion ?? null,
      isActive: true,
      lastSeenAt: new Date(),
      lastSeenIp: clientIp,
      usedNonces: [],
    });
    const savedDevice = await deviceRepository.save(device);

    await this.audit(
      manager,
      AuditAction.DEVICE_REGISTER,
      license.id,
      savedDevice.id,
      clientIp,
      'Device registered',
    );

    return savedDevice;
  }

  private async audit(
    manager: EntityManager,
    action: AuditAction,
    licenseId: string | null,
    deviceId: string | null,
    ipAddress: string,
    details: string,
  ): Promise<void> {
    await manager.getRepository(AuditLog).save(
      manager.getRepository(AuditLog).create({
        action,
        licenseId,
        deviceId,
        ipAddress,
        details,
      }),
    );
  }

  private resolveKekAlias(license: License): string {
    return (
      license.kekAlias ??
      this.configService.get<string>('KMS_KEY_ALIAS') ??
      'alias/fcpro-vault'
    );
  }
}
