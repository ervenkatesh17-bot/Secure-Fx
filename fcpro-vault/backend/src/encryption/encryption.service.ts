import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DecryptCommand,
  EncryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { Readable, Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';

export const ALGORITHM = 'aes-256-gcm';
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;
export const CHUNK_SIZE = 64 * 1024;

const MAX_USED_IVS = 100_000;
const ENVELOPE_ALGO_FLAG = 0x01;
const STREAM_MAGIC = Buffer.from('FCPE', 'ascii');

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

export interface StreamEncryptOptions {
  inputStream: Readable;
  outputStream: NodeJS.WritableStream;
  kekAlias: string;
  associatedData?: Buffer;
}

@Injectable()
export class EncryptionService {
  private readonly kmsClient: KMSClient;

  constructor(private readonly configService: ConfigService) {
    this.kmsClient = new KMSClient({
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

  async encryptBuffer(
    plaintext: Buffer,
    kekAlias: string,
    associatedData?: Buffer,
  ): Promise<EncryptedEnvelope> {
    const { plaintextDek, encryptedDek } = await this.generateDek(kekAlias);

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
      plaintextDek = await this.decryptDek(envelope.encryptedDek);

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
    } catch (error) {
      throw new InternalServerErrorException('Unable to decrypt payload');
    } finally {
      if (plaintextDek !== undefined) {
        plaintextDek.fill(0);
      }
    }
  }

  async encryptStream(options: StreamEncryptOptions): Promise<void> {
    const { plaintextDek, encryptedDek } = await this.generateDek(
      options.kekAlias,
    );

    try {
      const headerIv = randomBytes(IV_BYTES);
      assertIvUnique(headerIv);

      const header = this.buildStreamHeader(headerIv, encryptedDek);
      const encryptTransform = this.createChunkEncryptTransform(
        plaintextDek,
        header,
        options.associatedData,
      );

      await pipeline(
        options.inputStream,
        encryptTransform,
        options.outputStream as Writable,
      );
    } catch (error) {
      throw new InternalServerErrorException('Unable to encrypt stream');
    } finally {
      plaintextDek.fill(0);
    }
  }

  serializeEnvelope(envelope: EncryptedEnvelope): Buffer {
    this.validateEnvelope(envelope);

    if (envelope.iv.length > 255 || envelope.authTag.length > 255) {
      throw new Error('Envelope field length exceeds binary format limit');
    }

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

  deserializeEnvelope(serialized: Buffer): EncryptedEnvelope {
    let offset = 0;

    if (serialized.length < 1) {
      throw new Error('Serialized envelope is empty');
    }

    const algoFlag = serialized.readUInt8(offset);
    offset += 1;

    if (algoFlag !== ENVELOPE_ALGO_FLAG) {
      throw new Error('Unsupported envelope algorithm flag');
    }

    const ivLength = this.readEnvelopeFieldLength(serialized, offset);
    offset += 1;
    const iv = this.readEnvelopeSlice(serialized, offset, ivLength, 'iv');
    offset += ivLength;

    const tagLength = this.readEnvelopeFieldLength(serialized, offset);
    offset += 1;
    const authTag = this.readEnvelopeSlice(
      serialized,
      offset,
      tagLength,
      'authTag',
    );
    offset += tagLength;

    if (serialized.length < offset + 4) {
      throw new Error('Serialized envelope is missing encrypted DEK length');
    }

    const encryptedDekLength = serialized.readUInt32BE(offset);
    offset += 4;
    const encryptedDek = this.readEnvelopeSlice(
      serialized,
      offset,
      encryptedDekLength,
      'encryptedDek',
    );
    offset += encryptedDekLength;

    const ciphertext = Buffer.from(serialized.subarray(offset));
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

  async kmsEncrypt(plaintext: string, kekAlias: string): Promise<string> {
    const plaintextBuffer = Buffer.from(plaintext, 'utf8');

    try {
      const response = await this.kmsClient.send(
        new EncryptCommand({
          KeyId: kekAlias,
          Plaintext: plaintextBuffer,
        }),
      );

      if (response.CiphertextBlob === undefined) {
        throw new Error('KMS Encrypt response did not include CiphertextBlob');
      }

      return Buffer.from(response.CiphertextBlob).toString('base64');
    } catch (error) {
      throw new InternalServerErrorException('Unable to encrypt with KMS');
    } finally {
      plaintextBuffer.fill(0);
    }
  }

  private async generateDek(
    kekAlias: string,
  ): Promise<{ plaintextDek: Buffer; encryptedDek: Buffer }> {
    try {
      const response = await this.kmsClient.send(
        new GenerateDataKeyCommand({
          KeyId: kekAlias,
          KeySpec: 'AES_256',
        }),
      );

      if (
        response.Plaintext === undefined ||
        response.CiphertextBlob === undefined
      ) {
        throw new Error('KMS GenerateDataKey response was incomplete');
      }

      const plaintextDek = Buffer.from(response.Plaintext);

      if (plaintextDek.length !== KEY_BYTES) {
        plaintextDek.fill(0);
        throw new Error('KMS GenerateDataKey returned an invalid DEK length');
      }

      return {
        plaintextDek,
        encryptedDek: Buffer.from(response.CiphertextBlob),
      };
    } catch (error) {
      throw new InternalServerErrorException('Unable to generate data key');
    }
  }

  private async decryptDek(encryptedDek: Buffer): Promise<Buffer> {
    try {
      const response = await this.kmsClient.send(
        new DecryptCommand({
          CiphertextBlob: encryptedDek,
        }),
      );

      if (response.Plaintext === undefined) {
        throw new Error('KMS Decrypt response did not include Plaintext');
      }

      const plaintextDek = Buffer.from(response.Plaintext);

      if (plaintextDek.length !== KEY_BYTES) {
        plaintextDek.fill(0);
        throw new Error('KMS Decrypt returned an invalid DEK length');
      }

      return plaintextDek;
    } catch (error) {
      throw new InternalServerErrorException('Unable to decrypt data key');
    }
  }

  private createChunkEncryptTransform(
    plaintextDek: Buffer,
    header: Buffer,
    associatedData?: Buffer,
  ): Transform {
    let pending = Buffer.alloc(0);

    return new Transform({
      construct(callback: (error?: Error | null) => void): void {
        this.push(header);
        callback();
      },

      transform(
        chunk: Buffer | string,
        encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
      ): void {
        try {
          const input = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, encoding);

          pending =
            pending.length === 0 ? input : Buffer.concat([pending, input]);

          while (pending.length >= CHUNK_SIZE) {
            const plaintextChunk = pending.subarray(0, CHUNK_SIZE);
            this.push(
              EncryptionService.encryptStreamChunk(
                plaintextChunk,
                plaintextDek,
                associatedData,
              ),
            );
            pending = pending.subarray(CHUNK_SIZE);
          }

          callback();
        } catch (error) {
          callback(error instanceof Error ? error : new Error(String(error)));
        }
      },

      flush(callback: (error?: Error | null) => void): void {
        try {
          if (pending.length > 0) {
            this.push(
              EncryptionService.encryptStreamChunk(
                pending,
                plaintextDek,
                associatedData,
              ),
            );
          }

          callback();
        } catch (error) {
          callback(error instanceof Error ? error : new Error(String(error)));
        }
      },
    });
  }

  private static encryptStreamChunk(
    plaintextChunk: Buffer,
    plaintextDek: Buffer,
    associatedData?: Buffer,
  ): Buffer {
    const chunkIv = randomBytes(IV_BYTES);
    assertIvUnique(chunkIv);

    const cipher = createCipheriv(ALGORITHM, plaintextDek, chunkIv, {
      authTagLength: TAG_BYTES,
    });

    if (associatedData !== undefined) {
      cipher.setAAD(associatedData);
    }

    const ciphertext = Buffer.concat([
      cipher.update(plaintextChunk),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const chunkLength = Buffer.alloc(4);
    chunkLength.writeUInt32BE(ciphertext.length, 0);

    return Buffer.concat([chunkIv, chunkLength, ciphertext, authTag]);
  }

  private buildStreamHeader(iv: Buffer, encryptedDek: Buffer): Buffer {
    const encryptedDekLength = Buffer.alloc(4);
    encryptedDekLength.writeUInt32BE(encryptedDek.length, 0);

    return Buffer.concat([STREAM_MAGIC, iv, encryptedDekLength, encryptedDek]);
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

    if (envelope.encryptedDek.length === 0) {
      throw new Error('Envelope encrypted DEK must not be empty');
    }
  }

  private readEnvelopeFieldLength(serialized: Buffer, offset: number): number {
    if (serialized.length < offset + 1) {
      throw new Error('Serialized envelope ended before field length');
    }

    return serialized.readUInt8(offset);
  }

  private readEnvelopeSlice(
    serialized: Buffer,
    offset: number,
    length: number,
    fieldName: string,
  ): Buffer {
    if (serialized.length < offset + length) {
      throw new Error(`Serialized envelope ended before ${fieldName}`);
    }

    return Buffer.from(serialized.subarray(offset, offset + length));
  }
}
