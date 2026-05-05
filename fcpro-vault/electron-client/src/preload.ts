import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const LICENSE_KEY_PATTERN =
  /^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProjectStatusCallback = (status: string) => void;

function validateLicenseKey(licenseKey: string): string {
  const normalized = licenseKey.trim().toUpperCase();

  if (!LICENSE_KEY_PATTERN.test(normalized)) {
    throw new Error('Invalid license key format');
  }

  return normalized;
}

function validateProjectId(projectId: string): string {
  const normalized = projectId.trim();

  if (!UUID_V4_PATTERN.test(normalized)) {
    throw new Error('Invalid project ID format');
  }

  return normalized;
}

contextBridge.exposeInMainWorld('licenseAPI', {
  activate: (key: string) =>
    ipcRenderer.invoke('activate-license', validateLicenseKey(key)),
  deactivate: () => ipcRenderer.invoke('deactivate-license'),
  checkActivation: () => ipcRenderer.invoke('check-activation'),
  openProject: (id: string) =>
    ipcRenderer.invoke('open-project', validateProjectId(id)),
  onProjectStatus: (callback: ProjectStatusCallback) => {
    const handler = (_event: IpcRendererEvent, status: unknown): void => {
      if (typeof status === 'string') {
        callback(status);
        return;
      }

      if (
        status !== null &&
        typeof status === 'object' &&
        'message' in status &&
        typeof status.message === 'string'
      ) {
        callback(status.message);
      }
    };

    ipcRenderer.on('project-status', handler);

    return () => {
      ipcRenderer.off('project-status', handler);
    };
  },
});
