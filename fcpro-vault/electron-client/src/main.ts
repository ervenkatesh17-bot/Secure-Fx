import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  session,
  shell,
} from 'electron';
import path from 'node:path';
import { LicenseClient } from './services/license';
import {
  DecryptionResult,
  decryptToTemp,
  downloadEncryptedBlob,
} from './services/decryption';

const LICENSE_KEY_PATTERN =
  /^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVER_URL = process.env.FCPRO_API_URL ?? 'http://localhost:3000';

const licenseClient = new LicenseClient(SERVER_URL);
const activeDecryptions = new Set<DecryptionResult>();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'FCPro Vault',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  return mainWindow;
}

function installCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'",
        ],
      },
    });
  });
}

function validateLicenseKey(licenseKey: unknown): string {
  if (typeof licenseKey !== 'string' || !LICENSE_KEY_PATTERN.test(licenseKey)) {
    throw new Error('Invalid license key format');
  }

  return licenseKey;
}

function validateProjectId(projectId: unknown): string {
  if (typeof projectId !== 'string' || !UUID_V4_PATTERN.test(projectId)) {
    throw new Error('Invalid project id format');
  }

  return projectId;
}

function emitProjectStatus(message: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('project-status', message);
  }
}

async function openInFinalCutPro(filePath: string): Promise<void> {
  const errorMessage = await shell.openPath(filePath);

  if (errorMessage.length > 0) {
    throw new Error(errorMessage);
  }
}

ipcMain.handle('activate-license', async (_event, licenseKey: unknown) => {
  return licenseClient.verifyLicense(validateLicenseKey(licenseKey));
});

ipcMain.handle('check-activation', async () => {
  try {
    const token = await licenseClient.getValidToken();

    return {
      activated: true,
      expiresAt: token.expiresAt,
    };
  } catch {
    return {
      activated: false,
      expiresAt: null,
    };
  }
});

ipcMain.handle('deactivate-license', async () => {
  await licenseClient.clearKeychain();

  for (const result of activeDecryptions) {
    result.cleanup();
  }

  activeDecryptions.clear();

  return { deactivated: true };
});

ipcMain.handle('open-project', async (_event, projectId: unknown) => {
  const validProjectId = validateProjectId(projectId);

  emitProjectStatus('Checking license token');
  const token = await licenseClient.getValidToken();

  emitProjectStatus('Requesting secure download URL');
  const download = await licenseClient.getDownloadUrl(validProjectId);

  emitProjectStatus('Downloading encrypted project');
  const encryptedBlob = await downloadEncryptedBlob(
    download.signedUrl,
    download.checksum,
  );

  emitProjectStatus('Decrypting project in memory');
  const result = await decryptToTemp(
    encryptedBlob,
    token.accessToken,
    SERVER_URL,
    validProjectId,
  );
  activeDecryptions.add(result);

  emitProjectStatus('Opening project');
  await openInFinalCutPro(result.tempPath);

  return {
    opened: true,
    checksum: result.checksum,
  };
});

app.whenReady().then(() => {
  installCsp();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();

  if (window !== undefined) {
    if (window.isMinimized()) {
      window.restore();
    }

    window.focus();
  }
});

app.on('window-all-closed', () => {
  for (const result of activeDecryptions) {
    result.cleanup();
  }

  activeDecryptions.clear();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
