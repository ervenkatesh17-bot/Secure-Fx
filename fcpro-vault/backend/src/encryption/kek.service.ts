import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEK_BYTES = 32;
const DEK_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

@Injectable()
export class KekService {
  constructor(private readonly configService: ConfigService) {}

  async generateDek(): Promise<{ plaintextDek: Buffer; encryptedDek: Buffer }> {
    const plaintextDek = randomBytes(DEK_BYTES);
    const kek = this.getKek();

    try {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, kek, iv, {
        authTagLength: TAG_BYTES,
      });
      const encrypted = Buffer.concat([
        cipher.update(plaintextDek),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return {
        plaintextDek,
        encryptedDek: Buffer.concat([iv, authTag, encrypted]),
      };
    } finally {
      kek.fill(0);
    }
  }

  async decryptDek(encryptedDek: Buffer): Promise<Buffer> {
    if (encryptedDek.length < IV_BYTES + TAG_BYTES + DEK_BYTES) {
      throw new Error('Encrypted DEK is invalid');
    }

    const iv = encryptedDek.subarray(0, IV_BYTES);
    const authTag = encryptedDek.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = encryptedDek.subarray(IV_BYTES + TAG_BYTES);
    const kek = this.getKek();

    try {
      const decipher = createDecipheriv(ALGORITHM, kek, iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAuthTag(authTag);

      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } finally {
      kek.fill(0);
    }
  }

  async encryptSmallValue(plaintext: string): Promise<string> {
    const kek = this.getKek();

    try {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, kek, iv, {
        authTagLength: TAG_BYTES,
      });
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(plaintext, 'utf8')),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    } finally {
      kek.fill(0);
    }
  }

  async decryptSmallValue(ciphertext: string): Promise<string> {
    const payload = Buffer.from(ciphertext, 'base64');

    if (payload.length <= IV_BYTES + TAG_BYTES) {
      throw new Error('Encrypted value is invalid');
    }

    const iv = payload.subarray(0, IV_BYTES);
    const authTag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = payload.subarray(IV_BYTES + TAG_BYTES);
    const kek = this.getKek();

    try {
      const decipher = createDecipheriv(ALGORITHM, kek, iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return plaintext.toString('utf8');
    } finally {
      kek.fill(0);
    }
  }

  private getKek(): Buffer {
    const hex = this.configService.getOrThrow<string>('KEK_MASTER_KEY');

    if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
      throw new Error('KEK_MASTER_KEY must be 64 hex chars');
    }

    const kek = Buffer.from(hex, 'hex');

    if (kek.length !== KEK_BYTES) {
      kek.fill(0);
      throw new Error('KEK_MASTER_KEY must decode to 32 bytes');
    }

    return kek;
  }
}
