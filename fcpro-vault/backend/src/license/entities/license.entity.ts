import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from './device.entity';

export enum LicenseStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

export enum LicenseTier {
  STANDARD = 'standard',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

@Entity('licenses')
export class License {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36, unique: true })
  licenseKey: string;

  @Column({
    type: 'enum',
    enum: LicenseStatus,
    enumName: 'license_status',
    default: LicenseStatus.ACTIVE,
  })
  status: LicenseStatus;

  @Column({
    type: 'enum',
    enum: LicenseTier,
    enumName: 'license_tier',
    default: LicenseTier.STANDARD,
  })
  tier: LicenseTier;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  customerId: string;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'integer', default: 2 })
  maxDevices: number;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeCustomerId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeSubscriptionId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  razorpayCustomerId: string | null;

  @Column({ type: 'integer', default: 0 })
  verificationCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  lastVerifiedIp: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  kekAlias: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Device, (device) => device.license)
  devices: Device[];

  get isExpired(): boolean {
    return this.expiresAt !== null && this.expiresAt.getTime() <= Date.now();
  }

  get isActive(): boolean {
    return this.status === LicenseStatus.ACTIVE && !this.isExpired;
  }
}
