import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { License } from './license.entity';

@Entity('devices')
@Index(['licenseId', 'fingerprintHash'], { unique: true })
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  licenseId!: string;

  @ManyToOne(() => License, (license) => license.devices, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'licenseId' })
  license!: License;

  @Column({ type: 'varchar', length: 64 })
  fingerprintHash!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  deviceName!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  platform!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  osVersion!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  appVersion!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ type: 'inet', nullable: true })
  lastSeenIp!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  usedNonces!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  registeredAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
