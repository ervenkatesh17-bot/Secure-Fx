import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { EncryptionService } from '../encryption/encryption.service';
import { Project } from './entities/project.entity';

export const SIGNED_URL_TTL_SEC = 300;

export interface DownloadToken {
  signedUrl: string;
  expiresAt: number;
  projectId: string;
  checksum: string;
}

type ProjectTier = 'standard' | 'professional' | 'enterprise';

const TIER_RANK: Record<ProjectTier, number> = {
  standard: 1,
  professional: 2,
  enterprise: 3,
};

@Injectable()
export class ProjectService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly encryptionService: EncryptionService,
  ) {
    this.bucketName = this.configService.getOrThrow<string>('S3_BUCKET_NAME');
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>(
          'AWS_ACCESS_KEY_ID',
        ),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async generateDownloadUrl(
    projectId: string,
    licenseId: string,
    licenseTier: string,
  ): Promise<DownloadToken> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, isPublished: true },
    });

    if (project === null) {
      throw new NotFoundException('Project not found');
    }

    const callerTier = this.parseTier(licenseTier);
    const requiredTier = this.parseTier(project.requiredTier);

    if (TIER_RANK[callerTier] < TIER_RANK[requiredTier]) {
      throw new ForbiddenException('License tier does not allow this project');
    }

    const key = this.projectS3Key(project);
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseCacheControl: 'no-store',
      ResponseContentDisposition: `attachment; filename="${project.encryptedFileName}"`,
    });
    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: SIGNED_URL_TTL_SEC,
    });

    return {
      signedUrl,
      expiresAt: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC,
      projectId: project.id,
      checksum: project.encryptedChecksum ?? '',
    };
  }

  async uploadAndEncrypt(
    projectId: string,
    fileBuffer: Buffer,
    kekAlias: string,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (project === null) {
      throw new NotFoundException('Project not found');
    }

    const envelope = await this.encryptionService.encryptBuffer(
      fileBuffer,
      kekAlias,
      Buffer.from(projectId, 'utf8'),
    );
    const serializedEnvelope =
      this.encryptionService.serializeEnvelope(envelope);
    const checksum = createHash('sha256')
      .update(serializedEnvelope)
      .digest('hex');

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.projectS3Key(project),
        Body: serializedEnvelope,
        ContentType: 'application/octet-stream',
        CacheControl: 'no-store',
        ServerSideEncryption: 'aws:kms',
      }),
    );

    project.encryptedChecksum = checksum;
    project.kekAlias = kekAlias;
    project.fileSizeBytes = serializedEnvelope.length.toString();

    return this.projectRepository.save(project);
  }

  async listPublished(): Promise<Project[]> {
    return this.projectRepository.find({
      where: { isPublished: true },
      order: { createdAt: 'DESC' },
    });
  }

  private projectS3Key(project: Project): string {
    return `projects/${project.id}/encrypted/${project.encryptedFileName}`;
  }

  private parseTier(value: string): ProjectTier {
    if (value === 'professional' || value === 'enterprise') {
      return value;
    }

    return 'standard';
  }
}
