import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let backendPort = 8765;
let backendBaseUrl = `http://127.0.0.1:${backendPort}`;

/**
 * Locate a working Python 3 interpreter across Windows, macOS, and Linux.
 */
function findPythonExecutable(): string {
  const envPython = process.env.PLISTVIEWER_PYTHON;
  if (envPython && fs.existsSync(envPython)) {
    return envPython;
  }

  const candidates: string[] =
    process.platform === 'win32'
      ? [
          'python',
          'py',
          'C:\\Python314\\python.exe',
          'C:\\Python313\\python.exe',
          'C:\\Python312\\python.exe',
          'C:\\Python311\\python.exe',
        ]
      : [
          'python3',
          'python',
          '/opt/homebrew/bin/python3',
          '/usr/local/bin/python3',
          '/usr/bin/python3',
        ];

  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['--version'], { stdio: 'pipe', timeout: 3000 });
      if (res.status === 0) {
        return cmd;
      }
    } catch {
      // Try next candidate
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Find an available TCP port on localhost.
 */
function getAvailablePort(preferredPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.listen(0, '127.0.0.1', () => {
        const addr = fallback.address();
        const port = typeof addr === 'object' && addr ? addr.port : preferredPort;
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      server.close(() => resolve(preferredPort));
    });
  });
}

/**
 * Locate a PyInstaller-compiled standalone backend binary if built via `npm run build:backend`.
 */
function resolveCompiledBackendBinary(): string | null {
  const exeName = process.platform === 'win32' ? 'plist-backend.exe' : 'plist-backend';
  const candidates = [
    path.join(__dirname, '..', 'backend', 'dist', exeName),
    process.resourcesPath ? path.join(process.resourcesPath, 'backend', 'dist', exeName) : '',
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve the path to `backend/main.py` in both development and packaged builds.
 */
function resolveBackendScript(): string {
  const devPath = path.join(__dirname, '..', 'backend', 'main.py');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return path.join(process.resourcesPath, 'backend', 'main.py');
}

/**
 * Wait until the Python HTTP sidecar responds on `/api/health`.
 */
function waitForBackendReady(url: string, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(`${url}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (Date.now() - start < timeoutMs) {
          setTimeout(check, 200);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (Date.now() - start < timeoutMs) {
          setTimeout(check, 200);
        } else {
          resolve(false);
        }
      });
      req.end();
    };
    check();
  });
}

async function startPythonBackend(): Promise<void> {
  backendPort = await getAvailablePort(8765);
  backendBaseUrl = `http://127.0.0.1:${backendPort}`;

  const compiledBinary = resolveCompiledBackendBinary();
  if (compiledBinary) {
    console.log(`[Backend] Launching standalone compiled binary: ${compiledBinary}`);
    pythonProcess = spawn(compiledBinary, ['--host', '127.0.0.1', '--port', String(backendPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    const pythonCmd = findPythonExecutable();
    const scriptPath = resolveBackendScript();
    console.log(`[Backend] Launching Python script with ${pythonCmd}: ${scriptPath}`);
    pythonProcess = spawn(pythonCmd, [scriptPath, '--host', '127.0.0.1', '--port', String(backendPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
  }

  pythonProcess.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[Python] ${chunk.toString().trim()}`);
  });

  pythonProcess.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[Python] ${chunk.toString().trim()}`);
  });

  await waitForBackendReady(backendBaseUrl, 8000);
}

function stopPythonBackend(): void {
  if (pythonProcess && !pythonProcess.killed) {
    try {
      pythonProcess.kill();
    } catch {
      // Ignore cleanup errors
    }
    pythonProcess = null;
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('backend:getUrl', () => backendBaseUrl);

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Plist or Data File',
      properties: ['openFile'],
      filters: [
        {
          name: 'Plist & Data Files',
          extensions: ['plist', 'bplist', 'xml', 'strings', 'archive', 'sqlite', 'sqlite3', 'db', 'bin', 'dat', 'log', 'txt'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(
    'dialog:saveExport',
    async (_event, payload: { defaultName: string; format: 'csv' | 'txt'; content: string }) => {
      const ext = payload.format === 'csv' ? 'csv' : 'txt';
      const result = await dialog.showSaveDialog({
        title: `Export Plist Data as ${ext.toUpperCase()}`,
        defaultPath: payload.defaultName || `plist_export.${ext}`,
        filters: [
          ext === 'csv'
            ? { name: 'CSV Spreadsheet (*.csv)', extensions: ['csv'] }
            : { name: 'Text Report (*.txt)', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { saved: false, filePath: null };
      }
      fs.writeFileSync(result.filePath, payload.content, 'utf-8');
      return { saved: true, filePath: result.filePath };
    }
  );
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'PListViewer',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
    await mainWindow.loadFile(indexHtml);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await startPythonBackend();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPythonBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
});
