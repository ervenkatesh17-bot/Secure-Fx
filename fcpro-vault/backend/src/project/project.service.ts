import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { EncryptionService } from '../encryption/encryption.service';
import { StorageService } from '../storage/storage.service';
import { Project } from './entities/project.entity';

const DOWNLOAD_TOKEN_TTL_SEC = 300;

type ProjectTier = 'standard' | 'professional' | 'enterprise';

const TIER_RANK: Record<ProjectTier, number> = {
  standard: 1,
  professional: 2,
  enterprise: 3,
};

interface DownloadJwtPayload extends JwtPayload {
  remotePath: string;
  projectId: string;
  type: string;
}

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly encryptionService: EncryptionService,
    private readonly storageService: StorageService,
  ) {}

  async getDownloadToken(
    projectId: string,
    licenseId: string,
    licenseTier: string,
  ): Promise<{ token: string; expiresAt: number; checksum: string }> {
    void licenseId;
    const project = await this.projectRepository.findOne({
      where: { id: projectId, isPublished: true },
    });

    if (project === null) {
      throw new NotFoundException('Project not found');
    }

    const callerTier = this.parseTier(licenseTier);
    const requiredTier = this.parseTier(project.requiredTier);

    if (TIER_RANK[callerTier] < TIER_RANK[requiredTier]) {
      throw new ForbiddenException('Upgrade required for this project');
    }

    const remotePath = this.projectRemotePath(project);
    const { token, expiresAt } = await this.storageService.generateDownloadToken(
      remotePath,
      projectId,
      DOWNLOAD_TOKEN_TTL_SEC,
    );

    return {
      token,
      expiresAt,
      checksum: project.encryptedChecksum ?? '',
    };
  }

  async streamProjectToClient(token: string, res: Response): Promise<void> {
    const payload = this.verifyDownloadToken(token);
    const data = await this.storageService.downloadFile(payload.remotePath);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="project.enc"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', data.length);
    res.end(data);
  }

  async uploadAndEncrypt(projectId: string, fileBuffer: Buffer): Promise<void> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (project === null) {
      throw new NotFoundException('Project not found');
    }

    const encrypted = await this.encryptionService.encryptBuffer(
      fileBuffer,
      Buffer.from(projectId, 'utf8'),
    );
    const serialized = this.encryptionService.serializeEnvelope(encrypted);
    const checksum = createHash('sha256').update(serialized).digest('hex');
    const remotePath = this.projectRemotePath(project);

    await this.storageService.uploadFile(remotePath, serialized, checksum);
    await this.projectRepository.update(projectId, {
      encryptedChecksum: checksum,
      fileSizeBytes: serialized.length.toString(),
    });
    this.logger.log(`Project ${projectId} encrypted and stored on WD Cloud`);
  }

  async listPublished(): Promise<Project[]> {
    return this.projectRepository.find({
      where: { isPublished: true },
      order: { createdAt: 'DESC' },
    });
  }

  private verifyDownloadToken(token: string): DownloadJwtPayload {
    try {
      const payload = jwt.verify(
        token,
        this.configService.getOrThrow<string>('JWT_SECRET'),
      ) as DownloadJwtPayload;
      const now = Math.floor(Date.now() / 1000);

      if (
        payload.type !== 'download' ||
        typeof payload.remotePath !== 'string' ||
        typeof payload.projectId !== 'string'
      ) {
        throw new UnauthorizedException('Invalid download token');
      }

      if (typeof payload.exp !== 'number' || payload.exp < now) {
        throw new UnauthorizedException('Token expired');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid download token');
    }
  }

  private projectRemotePath(project: Project): string {
    return `${project.id}/encrypted/${project.encryptedFileName}`;
  }

  private parseTier(value: string): ProjectTier {
    if (value === 'professional' || value === 'enterprise') {
      return value;
    }

    return 'standard';
  }
}
