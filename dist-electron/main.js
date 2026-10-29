"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const net = __importStar(require("net"));
const path = __importStar(require("path"));
let mainWindow = null;
let pythonProcess = null;
let backendPort = 8765;
let backendBaseUrl = `http://127.0.0.1:${backendPort}`;
/**
 * Locate a working Python 3 interpreter across Windows, macOS, and Linux.
 */
function findPythonExecutable() {
    const envPython = process.env.PLISTVIEWER_PYTHON;
    if (envPython && fs.existsSync(envPython)) {
        return envPython;
    }
    const candidates = process.platform === 'win32'
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
            const res = (0, child_process_1.spawnSync)(cmd, ['--version'], { stdio: 'pipe', timeout: 3000 });
            if (res.status === 0) {
                return cmd;
            }
        }
        catch {
            // Try next candidate
        }
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}
/**
 * Find an available TCP port on localhost.
 */
function getAvailablePort(preferredPort) {
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
function resolveCompiledBackendBinary() {
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
function resolveBackendScript() {
    const devPath = path.join(__dirname, '..', 'backend', 'main.py');
    if (fs.existsSync(devPath)) {
        return devPath;
    }
    return path.join(process.resourcesPath, 'backend', 'main.py');
}
/**
 * Wait until the Python HTTP sidecar responds on `/api/health`.
 */
function waitForBackendReady(url, timeoutMs = 10000) {
    const start = Date.now();
    return new Promise((resolve) => {
        const check = () => {
            const req = http.get(`${url}/api/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                }
                else if (Date.now() - start < timeoutMs) {
                    setTimeout(check, 200);
                }
                else {
                    resolve(false);
                }
            });
            req.on('error', () => {
                if (Date.now() - start < timeoutMs) {
                    setTimeout(check, 200);
                }
                else {
                    resolve(false);
                }
            });
            req.end();
        };
        check();
    });
}
async function startPythonBackend() {
    backendPort = await getAvailablePort(8765);
    backendBaseUrl = `http://127.0.0.1:${backendPort}`;
    const compiledBinary = resolveCompiledBackendBinary();
    if (compiledBinary) {
        console.log(`[Backend] Launching standalone compiled binary: ${compiledBinary}`);
        pythonProcess = (0, child_process_1.spawn)(compiledBinary, ['--host', '127.0.0.1', '--port', String(backendPort)], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    else {
        const pythonCmd = findPythonExecutable();
        const scriptPath = resolveBackendScript();
        console.log(`[Backend] Launching Python script with ${pythonCmd}: ${scriptPath}`);
        pythonProcess = (0, child_process_1.spawn)(pythonCmd, [scriptPath, '--host', '127.0.0.1', '--port', String(backendPort)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
    }
    pythonProcess.stdout?.on('data', (chunk) => {
        console.log(`[Python] ${chunk.toString().trim()}`);
    });
    pythonProcess.stderr?.on('data', (chunk) => {
        console.error(`[Python] ${chunk.toString().trim()}`);
    });
    await waitForBackendReady(backendBaseUrl, 8000);
}
function stopPythonBackend() {
    if (pythonProcess && !pythonProcess.killed) {
        try {
            pythonProcess.kill();
        }
        catch {
            // Ignore cleanup errors
        }
        pythonProcess = null;
    }
}
function registerIpcHandlers() {
    electron_1.ipcMain.handle('backend:getUrl', () => backendBaseUrl);
    electron_1.ipcMain.handle('dialog:openFile', async () => {
        const result = await electron_1.dialog.showOpenDialog({
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
    electron_1.ipcMain.handle('dialog:saveExport', async (_event, payload) => {
        const ext = payload.format === 'csv' ? 'csv' : 'txt';
        const result = await electron_1.dialog.showSaveDialog({
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
    });
}
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
    }
    else {
        const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
        await mainWindow.loadFile(indexHtml);
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(async () => {
    registerIpcHandlers();
    await startPythonBackend();
    await createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        stopPythonBackend();
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', () => {
    stopPythonBackend();
});
