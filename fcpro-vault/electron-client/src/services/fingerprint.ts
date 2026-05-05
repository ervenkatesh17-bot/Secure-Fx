import crypto from 'node:crypto';
import os from 'node:os';
import { machineId } from 'node-machine-id';

const APP_SALT = 'fcp-license-client-v1';

export interface DeviceFingerprint {
  hash: string;
  platform: string;
  osVersion: string;
  deviceName: string;
}

export async function generateFingerprint(): Promise<DeviceFingerprint> {
  const id = await machineId(true);
  const platform = os.platform();
  const arch = os.arch();
  const cpuModel = os.cpus()[0]?.model ?? 'unknown-cpu';
  const osVersion = os.release();
  const composite = [id, platform, arch, cpuModel].join('||');
  const hash = crypto
    .createHmac('sha256', APP_SALT)
    .update(composite)
    .digest('hex');

  return {
    hash,
    platform,
    osVersion,
    deviceName: os.hostname(),
  };
}

export async function verifyFingerprintConsistency(
  cachedHash: string,
): Promise<boolean> {
  const current = await generateFingerprint();
  const currentHash = Buffer.from(current.hash, 'hex');
  const cached = Buffer.from(cachedHash, 'hex');

  if (currentHash.length !== cached.length || cached.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(currentHash, cached);
}
