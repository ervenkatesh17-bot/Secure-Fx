import axios from 'axios';
import { machineIdSync } from 'node-machine-id';
import { v4 as uuidv4 } from 'uuid';

const api = axios.create({
  baseURL: process.env.FCPRO_API_URL ?? 'http://localhost:3001',
  timeout: 10_000,
});

export type LicenseActivationRequest = {
  licenseKey: string;
  projectId: string;
};

export type LicenseActivationResponse = {
  activationId: string;
  expiresAt: string;
};

export async function activateLicense(
  request: LicenseActivationRequest,
): Promise<LicenseActivationResponse> {
  const machineId = machineIdSync();
  const response = await api.post<LicenseActivationResponse>('/licenses/activate', {
    ...request,
    machineId,
    nonce: uuidv4(),
  });

  return response.data;
}
