import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditAction {
  VERIFY_SUCCESS = 'verify_success',
  VERIFY_FAIL = 'verify_fail',
  DEVICE_REGISTER = 'device_register',
  DEVICE_REVOKE = 'device_revoke',
  DEVICE_LIMIT = 'device_limit',
  LICENSE_CREATED = 'license_created',
  LICENSE_REVOKE = 'license_revoke',
  DOWNLOAD_ISSUED = 'download_issued',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  licenseId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  deviceId!: string | null;

  @Column({
    type: 'enum',
    enum: AuditAction,
    enumName: 'audit_action',
  })
  action!: AuditAction;

  @Column({ type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
