import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fcproVault', {
  getDeviceFingerprint: () => ipcRenderer.invoke('device:fingerprint'),
});
