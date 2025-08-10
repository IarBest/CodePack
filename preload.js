const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Настройки
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (options) => ipcRenderer.invoke('config:set', options),

  // Локализация
  getTranslations: () => ipcRenderer.invoke('i18n:get-translations'),
  getAvailableLangs: () => ipcRenderer.invoke('app:get-available-langs'),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (_, newTranslations) => callback(newTranslations)),
  onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (_, theme) => callback(theme)),

  // Диалоги
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  // Файловые операции
  getDirectoryTree: (options) => ipcRenderer.invoke('files:getDirectoryTree', options),
  isDirectory: (path) => ipcRenderer.invoke('fs:isDirectory', path),
  analyzeFiles: (paths) => ipcRenderer.invoke('files:analyze', paths),
  mergeFiles: (options) => ipcRenderer.invoke('files:merge', options),
  splitFiles: (options) => ipcRenderer.invoke('files:split', options),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  saveFileContent: (options) => ipcRenderer.invoke('fs:saveFileContent', options),
  pathDirname: (p) => ipcRenderer.invoke('path:dirname', p),
  pathExists: (path) => ipcRenderer.invoke('fs:pathExists', path),
  
  // Буфер обмена
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),

  // События от главного процесса
  onPathsSelected: (callback) => ipcRenderer.on('paths-selected', (_, paths) => callback(paths)),
  onTriggerSave: (callback) => ipcRenderer.on('trigger-save', callback),
  onTriggerOpen: (callback) => ipcRenderer.on('trigger-open', callback),

  // Управление приложением
  openExternalLink: (url) => ipcRenderer.send('app:open-external', url),
  quitApp: () => ipcRenderer.send('app:quit'),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggle-fullscreen')
});