import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('projects')
@Index('idx_projects_required_tier', ['requiredTier'])
@Index('idx_projects_is_published', ['isPublished'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  originalFileName!: string;

  @Column({ type: 'varchar', length: 255 })
  encryptedFileName!: string;

  @Column({ type: 'char', length: 64, nullable: true })
  encryptedChecksum!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'standard' })
  requiredTier!: string;

  @Column({ type: 'boolean', default: true })
  isPublished!: boolean;

  @Column({ type: 'bigint', nullable: true })
  fileSizeBytes!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  kekAlias!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
