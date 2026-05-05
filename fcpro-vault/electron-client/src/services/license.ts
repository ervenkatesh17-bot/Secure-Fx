import axios, { AxiosError, AxiosInstance } from 'axios';
import keytar from 'keytar';
import { v4 as uuidv4 } from 'uuid';
import {
  DeviceFingerprint,
  generateFingerprint,
  verifyFingerprintConsistency,
} from './fingerprint';

export const KEYCHAIN_SERVICE = 'fcp-license-client';
export const ACCESS_TOKEN_KEY = 'access-token';
export const LICENSE_KEY = 'license-key';
export const DEVICE_FINGERPRINT_KEY = 'device-fingerprint';
export const TOKEN_REFRESH_BUFFER_SEC = 60;

export interface StoredTokenInfo {
  accessToken: string;
  expiresAt: number;
  deviceId: string;
  encryptedDek: string;
  kekAlias: string;
}

export interface DownloadUrlResponse {
  signedUrl: string;
  expiresAt: number;
  projectId: string;
  checksum: string;
}

interface LicenseVerificationResponse extends StoredTokenInfo {}

interface ApiErrorBody {
  message?: string | string[];
}

export class LicenseClient {
  private readonly api: AxiosInstance;
  private tokenInfo: StoredTokenInfo | null = null;

  constructor(private readonly serverUrl: string) {
    this.api = axios.create({
      baseURL: serverUrl,
      timeout: 15_000,
    });
  }

  async verifyLicense(licenseKey: string): Promise<StoredTokenInfo> {
    const fingerprint = await generateFingerprint();
    await keytar.setPassword(
      KEYCHAIN_SERVICE,
      DEVICE_FINGERPRINT_KEY,
      fingerprint.hash,
    );

    const payload = this.buildVerifyPayload(licenseKey, fingerprint);

    try {
      const response = await this.api.post<LicenseVerificationResponse>(
        '/license/verify',
        payload,
      );
      const tokenInfo = response.data;

      await keytar.setPassword(KEYCHAIN_SERVICE, LICENSE_KEY, licenseKey);
      await keytar.setPassword(
        KEYCHAIN_SERVICE,
        ACCESS_TOKEN_KEY,
        JSON.stringify(tokenInfo),
      );
      this.tokenInfo = tokenInfo;

      return tokenInfo;
    } catch (error) {
      throw new Error(this.mapError(error));
    }
  }

  async getValidToken(): Promise<StoredTokenInfo> {
    await this.assertHardwareConsistent();

    if (this.tokenInfo !== null && this.isTokenValid(this.tokenInfo)) {
      return this.tokenInfo;
    }

    const storedToken = await this.getStoredToken();

    if (storedToken !== null && this.isTokenValid(storedToken)) {
      this.tokenInfo = storedToken;
      return storedToken;
    }

    const storedLicenseKey = await keytar.getPassword(
      KEYCHAIN_SERVICE,
      LICENSE_KEY,
    );

    if (storedLicenseKey === null) {
      throw new Error('License activation required');
    }

    return this.verifyLicense(storedLicenseKey);
  }

  async getDownloadUrl(projectId: string): Promise<DownloadUrlResponse> {
    const token = await this.getValidToken();
    const response = await this.api.get<DownloadUrlResponse>('/project/download', {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
      params: { projectId },
    });

    return response.data;
  }

  async clearKeychain(): Promise<void> {
    await Promise.all([
      keytar.deletePassword(KEYCHAIN_SERVICE, ACCESS_TOKEN_KEY),
      keytar.deletePassword(KEYCHAIN_SERVICE, LICENSE_KEY),
      keytar.deletePassword(KEYCHAIN_SERVICE, DEVICE_FINGERPRINT_KEY),
    ]);
    this.tokenInfo = null;
  }

  private buildVerifyPayload(
    licenseKey: string,
    fingerprint: DeviceFingerprint,
  ): Record<string, string | number> {
    return {
      licenseKey,
      fingerprintHash: fingerprint.hash,
      nonce: uuidv4(),
      timestamp: Math.floor(Date.now() / 1000),
      deviceName: fingerprint.deviceName,
      platform: fingerprint.platform,
      osVersion: fingerprint.osVersion,
      appVersion: '1.0.0',
    };
  }

  private async assertHardwareConsistent(): Promise<void> {
    const cachedHash = await keytar.getPassword(
      KEYCHAIN_SERVICE,
      DEVICE_FINGERPRINT_KEY,
    );

    if (cachedHash === null) {
      return;
    }

    const consistent = await verifyFingerprintConsistency(cachedHash);

    if (!consistent) {
      await this.clearKeychain();
      throw new Error('Hardware change detected. Re-verify.');
    }
  }

  private async getStoredToken(): Promise<StoredTokenInfo | null> {
    const serialized = await keytar.getPassword(
      KEYCHAIN_SERVICE,
      ACCESS_TOKEN_KEY,
    );

    if (serialized === null) {
      return null;
    }

    try {
      return JSON.parse(serialized) as StoredTokenInfo;
    } catch {
      await keytar.deletePassword(KEYCHAIN_SERVICE, ACCESS_TOKEN_KEY);
      return null;
    }
  }

  private isTokenValid(token: StoredTokenInfo): boolean {
    return (
      token.expiresAt - TOKEN_REFRESH_BUFFER_SEC >
      Math.floor(Date.now() / 1000)
    );
  }

  private mapError(error: unknown): string {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error.message : 'License verification failed';
    }

    const axiosError = error as AxiosError<ApiErrorBody>;
    const message = this.extractMessage(axiosError.response?.data?.message);

    switch (axiosError.response?.status) {
      case 401:
        return 'License verification failed';
      case 403:
        return `License rejected: ${message}`;
      case 409:
        return 'Device limit reached';
      case 429:
        return 'Too many attempts. Wait a moment.';
      default:
        return message || 'License verification failed';
    }
  }

  private extractMessage(message: string | string[] | undefined): string {
    if (Array.isArray(message)) {
      return message.join(', ');
    }

    return message ?? '';
  }
}
