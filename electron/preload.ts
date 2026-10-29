import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('plistApi', {
  getBackendUrl: (): Promise<string> => ipcRenderer.invoke('backend:getUrl'),
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
  saveExportDialog: (payload: {
    defaultName: string;
    format: 'csv' | 'txt';
    content: string;
  }): Promise<{ saved: boolean; filePath: string | null }> =>
    ipcRenderer.invoke('dialog:saveExport', payload),
});
