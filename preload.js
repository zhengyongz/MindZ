const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 菜单事件
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action, data) => callback(action, data)),
  
  // 文件操作
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  
  // 导出
  exportImage: (filePath, dataUrl) => ipcRenderer.invoke('export-image', { filePath, dataUrl }),
  exportSvg: (filePath, svgContent) => ipcRenderer.invoke('export-svg', { filePath, svgContent }),
  exportPdf: (filePath, svgContent) => ipcRenderer.invoke('export-pdf', { filePath, svgContent }),
  
  // 对话框
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // 应用路径
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // ============================================================
  // AI Module APIs
  // ============================================================
  aiGetConfig: () => ipcRenderer.invoke('ai-get-config'),
  aiUpdateProvider: (providerKey, settings) => ipcRenderer.invoke('ai-update-provider', { providerKey, settings }),
  aiSetDefaultProvider: (providerKey) => ipcRenderer.invoke('ai-set-default-provider', { providerKey }),
  aiChat: (providerKey, messages, options) => ipcRenderer.invoke('ai-chat', { providerKey, messages, options }),
  aiChatStream: (providerKey, messages, options) => ipcRenderer.invoke('ai-chat-stream', { providerKey, messages, options }),
  onAiChatChunk: (callback) => ipcRenderer.on('ai-chat-chunk', (event, chunk) => callback(chunk)),
  removeAiChatChunkListener: () => ipcRenderer.removeAllListeners('ai-chat-chunk'),
  aiParseFile: (filePath) => ipcRenderer.invoke('ai-parse-file', { filePath }),
  aiSaveConversation: (convId, messages) => ipcRenderer.invoke('ai-save-conversation', { convId, messages }),
  aiLoadConversation: (convId) => ipcRenderer.invoke('ai-load-conversation', { convId }),
  aiListConversations: () => ipcRenderer.invoke('ai-list-conversations'),
  aiDeleteConversation: (convId) => ipcRenderer.invoke('ai-delete-conversation', { convId }),

  // ============================================================
  // Language / Menu
  // ============================================================
  updateMenuLanguage: (lang) => ipcRenderer.invoke('update-menu-language', { lang })
});
