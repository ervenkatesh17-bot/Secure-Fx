import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { KekService } from './kek.service';

export const ALGORITHM = 'aes-256-gcm';
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;
export const CHUNK_SIZE = 65_536;

const ENVELOPE_ALGO_FLAG = 0x01;
const MAX_USED_IVS = 100_000;

export const usedIvRegistry = new Set<string>();

export function assertIvUnique(iv: Buffer): void {
  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid IV length: expected ${IV_BYTES} bytes`);
  }

  const hex = iv.toString('hex');

  if (usedIvRegistry.has(hex)) {
    throw new Error('FATAL: IV collision detected');
  }

  if (usedIvRegistry.size >= MAX_USED_IVS) {
    const oldest = usedIvRegistry.values().next().value as string | undefined;

    if (oldest !== undefined) {
      usedIvRegistry.delete(oldest);
    }
  }

  usedIvRegistry.add(hex);
}

export interface EncryptedEnvelope {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  encryptedDek: Buffer;
  algorithm: string;
}

@Injectable()
export class EncryptionService {
  constructor(private readonly kekService: KekService) {}

  async encryptBuffer(
    plaintext: Buffer,
    associatedData?: Buffer,
  ): Promise<EncryptedEnvelope> {
    const { plaintextDek, encryptedDek } = await this.kekService.generateDek();

    try {
      const iv = randomBytes(IV_BYTES);
      assertIvUnique(iv);

      const cipher = createCipheriv(ALGORITHM, plaintextDek, iv, {
        authTagLength: TAG_BYTES,
      });

      if (associatedData !== undefined) {
        cipher.setAAD(associatedData);
      }

      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return {
        ciphertext,
        iv,
        authTag,
        encryptedDek,
        algorithm: ALGORITHM,
      };
    } finally {
      plaintextDek.fill(0);
    }
  }

  async decryptBuffer(
    envelope: EncryptedEnvelope,
    associatedData?: Buffer,
  ): Promise<Buffer> {
    let plaintextDek: Buffer | undefined;

    try {
      this.validateEnvelope(envelope);
      plaintextDek = await this.kekService.decryptDek(envelope.encryptedDek);

      const decipher = createDecipheriv(ALGORITHM, plaintextDek, envelope.iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAuthTag(envelope.authTag);

      if (associatedData !== undefined) {
        decipher.setAAD(associatedData);
      }

      return Buffer.concat([
        decipher.update(envelope.ciphertext),
        decipher.final(),
      ]);
    } catch {
      throw new InternalServerErrorException(
        'Decryption failed — data may be tampered',
      );
    } finally {
      if (plaintextDek !== undefined) {
        plaintextDek.fill(0);
      }
    }
  }

  serializeEnvelope(envelope: EncryptedEnvelope): Buffer {
    this.validateEnvelope(envelope);

    const dekLength = Buffer.alloc(4);
    dekLength.writeUInt32BE(envelope.encryptedDek.length, 0);

    return Buffer.concat([
      Buffer.from([ENVELOPE_ALGO_FLAG, envelope.iv.length]),
      envelope.iv,
      Buffer.from([envelope.authTag.length]),
      envelope.authTag,
      dekLength,
      envelope.encryptedDek,
      envelope.ciphertext,
    ]);
  }

  deserializeEnvelope(data: Buffer): EncryptedEnvelope {
    let offset = 0;

    if (data.length < 1) {
      throw new Error('Encrypted envelope is empty');
    }

    const algoFlag = data.readUInt8(offset);
    offset += 1;

    if (algoFlag !== ENVELOPE_ALGO_FLAG) {
      throw new Error('Unsupported envelope algorithm flag');
    }

    const ivLength = this.readFieldLength(data, offset, 'iv length');
    offset += 1;
    const iv = this.readSlice(data, offset, ivLength, 'iv');
    offset += ivLength;

    const tagLength = this.readFieldLength(data, offset, 'auth tag length');
    offset += 1;
    const authTag = this.readSlice(data, offset, tagLength, 'auth tag');
    offset += tagLength;

    if (data.length < offset + 4) {
      throw new Error('Encrypted envelope missing DEK length');
    }

    const dekLength = data.readUInt32BE(offset);
    offset += 4;
    const encryptedDek = this.readSlice(data, offset, dekLength, 'encrypted DEK');
    offset += dekLength;
    const ciphertext = Buffer.from(data.subarray(offset));
    const envelope: EncryptedEnvelope = {
      ciphertext,
      iv,
      authTag,
      encryptedDek,
      algorithm: ALGORITHM,
    };

    this.validateEnvelope(envelope);

    return envelope;
  }

  private validateEnvelope(envelope: EncryptedEnvelope): void {
    if (envelope.algorithm !== ALGORITHM) {
      throw new Error('Unsupported envelope algorithm');
    }

    if (envelope.iv.length !== IV_BYTES) {
      throw new Error(`Envelope IV must be ${IV_BYTES} bytes`);
    }

    if (envelope.authTag.length !== TAG_BYTES) {
      throw new Error(`Envelope auth tag must be ${TAG_BYTES} bytes`);
    }

    if (envelope.encryptedDek.length < IV_BYTES + TAG_BYTES + KEY_BYTES) {
      throw new Error('Envelope encrypted DEK is invalid');
    }
  }

  private readFieldLength(data: Buffer, offset: number, name: string): number {
    if (data.length < offset + 1) {
      throw new Error(`Encrypted envelope missing ${name}`);
    }

    return data.readUInt8(offset);
  }

  private readSlice(
    data: Buffer,
    offset: number,
    length: number,
    name: string,
  ): Buffer {
    if (data.length < offset + length) {
      throw new Error(`Encrypted envelope missing ${name}`);
    }

    return Buffer.from(data.subarray(offset, offset + length));
  }
}
