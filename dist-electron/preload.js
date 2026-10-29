"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('plistApi', {
    getBackendUrl: () => electron_1.ipcRenderer.invoke('backend:getUrl'),
    openFileDialog: () => electron_1.ipcRenderer.invoke('dialog:openFile'),
    saveExportDialog: (payload) => electron_1.ipcRenderer.invoke('dialog:saveExport', payload),
});
