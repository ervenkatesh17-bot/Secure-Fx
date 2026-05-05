import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { DeviceService } from './services/device.service';
import { LicenseService } from './services/license.service';

const deviceService = new DeviceService();
const licenseService = new LicenseService();

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'FCPro Vault',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

ipcMain.handle('device:get-fingerprint', () => deviceService.getFingerprint());
ipcMain.handle('license:activate', async (_event, licenseKey: string) => {
  return licenseService.activate(licenseKey, await deviceService.getFingerprint());
});

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
