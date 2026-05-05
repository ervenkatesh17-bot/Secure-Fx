import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../common/entities/audit-log.entity';
import { Customer } from '../auth/entities/customer.entity';
import { Device } from '../license/entities/device.entity';
import {
  License,
  LicenseStatus,
} from '../license/entities/license.entity';
import { LicenseService } from '../license/license.service';

export interface AdminStats {
  totalLicenses: number;
  activeLicenses: number;
  totalDevices: number;
  recentVerifications: number;
}

export interface AdminPaginationQuery {
  page?: number;
  limit?: number;
}

export interface LicenseListQuery extends AdminPaginationQuery {
  search?: string;
  status?: LicenseStatus;
}

export interface AuditLogQuery extends AdminPaginationQuery {
  licenseId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly licenseService: LicenseService,
  ) {}

  async getStats(): Promise<AdminStats> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      totalLicenses,
      activeLicenses,
      totalDevices,
      recentVerifications,
    ] = await Promise.all([
      this.licenseRepository.count(),
      this.licenseRepository.count({
        where: { status: LicenseStatus.ACTIVE },
      }),
      this.deviceRepository.count({
        where: { isActive: true },
      }),
      this.auditRepository.count({
        where: {
          action: AuditAction.VERIFY_SUCCESS,
          createdAt: MoreThan(since),
        },
      }),
    ]);

    return {
      totalLicenses,
      activeLicenses,
      totalDevices,
      recentVerifications,
    };
  }

  async getLicenses(
    query: LicenseListQuery,
  ): Promise<PaginatedResult<License>> {
    const { page, limit, skip } = this.normalizePagination(query);
    const queryBuilder = this.licenseRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.devices', 'devices');

    if (query.status !== undefined) {
      queryBuilder.andWhere('l.status = :status', { status: query.status });
    }

    if (query.search !== undefined && query.search.trim().length > 0) {
      queryBuilder.andWhere(
        '(l.licenseKey ILIKE :search OR l.email ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const [data, total] = await queryBuilder
      .orderBy('l.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async getLicense(id: string): Promise<License> {
    const license = await this.licenseRepository.findOne({
      where: { id },
      relations: ['devices'],
    });

    if (license === null) {
      throw new NotFoundException('License not found');
    }

    return license;
  }

  async revokeLicense(id: string, reason: string): Promise<void> {
    await this.licenseService.revokeLicense(id, reason, 'admin');
  }

  async getAuditLogs(
    query: AuditLogQuery,
  ): Promise<PaginatedResult<AuditLog>> {
    const { page, limit, skip } = this.normalizePagination(query);
    const where =
      query.licenseId !== undefined ? { licenseId: query.licenseId } : {};
    const [data, total] = await this.auditRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  private normalizePagination(query: AdminPaginationQuery): {
    page: number;
    limit: number;
    skip: number;
  } {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));

    return {
      page,
      limit,
      skip: (page - 1) * limit,
    };
  }
}
