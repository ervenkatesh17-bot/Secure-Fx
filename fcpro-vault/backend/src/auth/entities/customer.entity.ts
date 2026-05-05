import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { License } from '../../license/entities/license.entity';

export enum CustomerRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}

@Entity('customers')
@Index('IDX_customers_email', ['email'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: CustomerRole,
    enumName: 'customer_role',
    default: CustomerRole.CUSTOMER,
  })
  role: CustomerRole;

  @OneToMany(() => License, (license) => license.customer)
  licenses: License[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
