import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dirname, posix } from 'path';
import type { WebDAVClient } from 'webdav';
import jwt from 'jsonwebtoken';

interface DownloadTokenPayload {
  remotePath: string;
  projectId: string;
  type: 'download';
  exp: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: WebDAVClient;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const { createClient } = await this.loadWebDav();
    this.client = createClient(this.configService.getOrThrow<string>('WD_CLOUD_URL'), {
      username: this.configService.getOrThrow<string>('WD_CLOUD_USERNAME'),
      password: this.configService.getOrThrow<string>('WD_CLOUD_PASSWORD'),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    await this.ensureDirectory('/fcpro-vault/projects');
  }

  async uploadFile(
    remotePath: string,
    data: Buffer,
    checksum: string,
  ): Promise<void> {
    const fullPath = this.fullPath(remotePath);
    await this.ensureDirectory(dirname(fullPath));
    await this.client.putFileContents(fullPath, data, {
      overwrite: true,
      headers: { 'X-File-Checksum': checksum },
    });
    this.logger.log(`Uploaded: ${remotePath} (${data.length} bytes)`);
  }

  async downloadFile(remotePath: string): Promise<Buffer> {
    const content = await this.client.getFileContents(this.fullPath(remotePath));

    if (Buffer.isBuffer(content)) {
      return Buffer.from(content);
    }

    if (typeof content === 'string') {
      return Buffer.from(content);
    }

    return Buffer.from(content as ArrayBuffer);
  }

  async fileExists(remotePath: string): Promise<boolean> {
    try {
      await this.client.stat(this.fullPath(remotePath));
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(remotePath: string): Promise<void> {
    await this.client.deleteFile(this.fullPath(remotePath));
  }

  async generateDownloadToken(
    remotePath: string,
    projectId: string,
    expiresInSeconds = 300,
  ): Promise<{ token: string; expiresAt: number }> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload: DownloadTokenPayload = {
      remotePath,
      projectId,
      type: 'download',
      exp: expiresAt,
    };
    const token = jwt.sign(payload, this.configService.getOrThrow<string>('JWT_SECRET'), {
      algorithm: 'HS256',
      noTimestamp: true,
    });

    return { token, expiresAt };
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      const exists = await this.client.exists(dirPath);

      if (!exists) {
        await this.client.createDirectory(dirPath, { recursive: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not ensure directory ${dirPath}: ${message}`);
    }
  }

  private fullPath(remotePath: string): string {
    const normalized = posix.normalize(remotePath).replace(/^(\.\.\/|\/)+/, '');
    return `/fcpro-vault/projects/${normalized}`;
  }

  private async loadWebDav(): Promise<typeof import('webdav')> {
    const dynamicImport = new Function(
      'specifier',
      'return import(specifier)',
    ) as (specifier: string) => Promise<typeof import('webdav')>;

    return dynamicImport('webdav');
  }
}
