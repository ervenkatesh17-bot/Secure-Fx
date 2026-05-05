import axios from 'axios';
import { app } from 'electron';
import {
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { get } from 'node:https';
import path from 'node:path';

export const ALGORITHM = 'aes-256-gcm';

export interface EncryptedEnvelope {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  encryptedDek: Buffer;
}

export interface DecryptionResult {
  tempPath: string;
  checksum: string;
  cleanup: () => void;
}

export async function downloadEncryptedBlob(
  signedUrl: string,
  expectedChecksum: string,
): Promise<Buffer> {
  const data = await downloadBuffer(signedUrl);
  const actualChecksum = createHash('sha256').update(data).digest('hex');
  const actual = Buffer.from(actualChecksum, 'hex');
  const expected = Buffer.from(expectedChecksum, 'hex');

  if (
    expected.length === 0 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new Error('Encrypted project checksum mismatch');
  }

  return data;
}

export function deserializeEnvelope(data: Buffer): EncryptedEnvelope {
  let offset = 0;

  if (data.length < 1) {
    throw new Error('Encrypted envelope is empty');
  }

  const algoFlag = data.readUInt8(offset);
  offset += 1;

  if (algoFlag !== 0x01) {
    throw new Error('Unsupported encryption envelope algorithm');
  }

  const ivLength = readUInt8(data, offset, 'iv length');
  offset += 1;
  const iv = readSlice(data, offset, ivLength, 'iv');
  offset += ivLength;

  const tagLength = readUInt8(data, offset, 'auth tag length');
  offset += 1;
  const authTag = readSlice(data, offset, tagLength, 'auth tag');
  offset += tagLength;

  if (data.length < offset + 4) {
    throw new Error('Encrypted envelope missing DEK length');
  }

  const dekLength = data.readUInt32BE(offset);
  offset += 4;
  const encryptedDek = readSlice(data, offset, dekLength, 'encrypted DEK');
  offset += dekLength;
  const ciphertext = Buffer.from(data.subarray(offset));

  if (iv.length !== 12 || authTag.length !== 16 || encryptedDek.length === 0) {
    throw new Error('Invalid encrypted envelope');
  }

  return {
    ciphertext,
    iv,
    authTag,
    encryptedDek,
  };
}

export async function decryptDekViaServer(
  encryptedDek: Buffer,
  accessToken: string,
  serverUrl: string,
): Promise<Buffer> {
  const response = await axios.post<{ plaintextDek: string }>(
    '/kms/decrypt-dek',
    {
      encryptedDek: encryptedDek.toString('base64'),
    },
    {
      baseURL: serverUrl,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return Buffer.from(response.data.plaintextDek, 'base64');
}

export async function decryptToTemp(
  encryptedBlob: Buffer,
  accessToken: string,
  serverUrl: string,
  projectId: string,
): Promise<DecryptionResult> {
  const envelope = deserializeEnvelope(encryptedBlob);
  let plaintextDek: Buffer | null = null;
  let plaintext: Buffer | null = null;

  try {
    plaintextDek = await decryptDekViaServer(
      envelope.encryptedDek,
      accessToken,
      serverUrl,
    );
    const decipher = createDecipheriv(ALGORITHM, plaintextDek, envelope.iv, {
      authTagLength: 16,
    });
    decipher.setAuthTag(envelope.authTag);
    decipher.setAAD(Buffer.from(projectId, 'utf8'));
    plaintext = Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ]);
    const checksum = createHash('sha256').update(plaintext).digest('hex');
    const tempPath = path.join(
      app.getPath('temp'),
      `.fcp_${randomBytes(16).toString('hex')}.fcpx`,
    );

    writeFileSync(tempPath, plaintext, { mode: 0o600 });
    plaintext.fill(0);
    plaintext = null;

    return {
      tempPath,
      checksum,
      cleanup: () => secureDelete(tempPath),
    };
  } finally {
    if (plaintextDek !== null) {
      plaintextDek.fill(0);
    }

    if (plaintext !== null) {
      plaintext.fill(0);
    }
  }
}

function downloadBuffer(signedUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = get(signedUrl, (response) => {
      if (
        response.statusCode !== undefined &&
        (response.statusCode < 200 || response.statusCode >= 300)
      ) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });

    request.setTimeout(30_000, () => {
      request.destroy(new Error('Download timed out'));
    });
    request.on('error', reject);
  });
}

function readUInt8(data: Buffer, offset: number, name: string): number {
  if (data.length < offset + 1) {
    throw new Error(`Encrypted envelope missing ${name}`);
  }

  return data.readUInt8(offset);
}

function readSlice(
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

function secureDelete(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const size = statSync(filePath).size;
  const fd = openSync(filePath, 'r+');

  try {
    const zeroChunk = Buffer.alloc(Math.min(size, 64 * 1024));
    let remaining = size;
    let position = 0;

    while (remaining > 0) {
      const length = Math.min(remaining, zeroChunk.length);
      writeSync(fd, zeroChunk, 0, length, position);
      position += length;
      remaining -= length;
    }
  } finally {
    closeSync(fd);
    unlinkSync(filePath);
  }
}
