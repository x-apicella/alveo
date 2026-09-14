// Sandboxed Electron preload scripts use its restricted CommonJS loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('capturePicker', Object.freeze({
  list: () => ipcRenderer.invoke('alveo:capture:list'),
  select: id => ipcRenderer.invoke('alveo:capture:select', id),
  cancel: () => ipcRenderer.invoke('alveo:capture:cancel'),
}));
