const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (d) => ipcRenderer.invoke('save-settings', d),
  isElectron: () => ipcRenderer.invoke('is-electron'),
  getPort: () => ipcRenderer.invoke('get-port')
});
