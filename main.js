const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { AIProviderManager } = require('./src/js/ai-provider');

let mainWindow = null;
let aiManager = null;
let currentLang = 'zh';

// Menu i18n dictionaries
const menuI18n = {
  zh: {
    file: '文件', edit: '编辑', view: '视图', insert: '插入', layout: '布局', theme: '主题',
    new: '新建', open: '打开...', save: '保存', saveAs: '另存为...',
    exportPNG: '导出为 PNG', exportSVG: '导出为 SVG', exportPDF: '导出为 PDF', exportJSON: '导出为 JSON', exportMM: '导出为 FreeMind',
    quit: '退出',
    undo: '撤销', redo: '重做', cut: '剪切', copy: '复制', paste: '粘贴',
    selectAll: '全选', find: '查找替换',
    zoomIn: '放大', zoomOut: '缩小', zoomReset: '重置缩放', fitCanvas: '适应画布',
    outline: '大纲视图', fullscreen: '全屏', devTools: '开发者工具',
    childNode: '子节点', siblingNode: '同级节点', parentNode: '父节点',
    link: '联系线', note: '备注', icon: '图标',
    mindmap: '思维导图', treeRight: '向右树状', treeDown: '向下树状', fishbone: '鱼骨图', org: '组织架构图',
    classicBlue: '经典蓝', darkPurple: '暗夜紫', freshGreen: '清新绿',
    vibrantOrange: '活力橙', minimal: '极简白', chinaRed: '中国红',
    openFile: '打开思维导图', mindzFile: 'MindZ 文件', jsonFile: 'JSON 文件', freemindFile: 'FreeMind 文件', allFiles: '所有文件',
    saveFile: '保存思维导图',
  },
  en: {
    file: 'File', edit: 'Edit', view: 'View', insert: 'Insert', layout: 'Layout', theme: 'Theme',
    new: 'New', open: 'Open...', save: 'Save', saveAs: 'Save As...',
    exportPNG: 'Export as PNG', exportSVG: 'Export as SVG', exportPDF: 'Export as PDF', exportJSON: 'Export as JSON', exportMM: 'Export as FreeMind',
    quit: 'Quit',
    undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste',
    selectAll: 'Select All', find: 'Find & Replace',
    zoomIn: 'Zoom In', zoomOut: 'Zoom Out', zoomReset: 'Reset Zoom', fitCanvas: 'Fit Canvas',
    outline: 'Outline View', fullscreen: 'Fullscreen', devTools: 'Developer Tools',
    childNode: 'Child Node', siblingNode: 'Sibling Node', parentNode: 'Parent Node',
    link: 'Relationship', note: 'Note', icon: 'Icon',
    mindmap: 'Mind Map', treeRight: 'Tree Right', treeDown: 'Tree Down', fishbone: 'Fishbone', org: 'Org Chart',
    classicBlue: 'Classic Blue', darkPurple: 'Dark Purple', freshGreen: 'Fresh Green',
    vibrantOrange: 'Vibrant Orange', minimal: 'Minimal', chinaRed: 'China Red',
    openFile: 'Open Mind Map', mindzFile: 'MindZ Files', jsonFile: 'JSON Files', freemindFile: 'FreeMind Files', allFiles: 'All Files',
    saveFile: 'Save Mind Map',
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon_256.png'),
    title: 'MindZ 思维导图',
    // Dark background matching CSS body — prevents white→dark flash
    backgroundColor: '#1e1e2e',
    show: false,  // Don't show until first paint is complete
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true // P1-10: preload only needs ipcRenderer/contextBridge — tighten attack surface
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Ensure renderer paints even when window is hidden
  mainWindow.webContents.setBackgroundThrottling(false);

  // Use 'ready-to-show' to wait for the renderer's first paint
  // This is Electron's recommended way to prevent flash on startup
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  // 自定义菜单
  const menuTemplate = buildMenu(currentLang);
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function buildMenu(lang) {
  const t = menuI18n[lang] || menuI18n.zh;
  return [
    {
      label: t.file,
      submenu: [
        { label: t.new, accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-action', 'new') },
        // P0-4: open/save now handled entirely by the renderer so the active tab's
        // path is used (multi-tab safe), .mm is supported, and unsaved work is honored
        { label: t.open, accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('menu-action', 'open') },
        { type: 'separator' },
        { label: t.save, accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-action', 'save') },
        { label: t.saveAs, accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('menu-action', 'save-as') },
        { type: 'separator' },
        { label: t.exportPNG, click: () => mainWindow.webContents.send('menu-action', 'export-png') },
        { label: t.exportSVG, click: () => mainWindow.webContents.send('menu-action', 'export-svg') },
        { label: t.exportPDF, click: () => mainWindow.webContents.send('menu-action', 'export-pdf') },
        { label: t.exportJSON, click: () => mainWindow.webContents.send('menu-action', 'export-json') },
        { label: t.exportMM, click: () => mainWindow.webContents.send('menu-action', 'export-mm') },
        { type: 'separator' },
        { label: t.quit, accelerator: 'Alt+F4', role: 'quit' }
      ]
    },
    {
      label: t.edit,
      submenu: [
        { label: t.undo, accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('menu-action', 'undo') },
        { label: t.redo, accelerator: 'CmdOrCtrl+Y', click: () => mainWindow.webContents.send('menu-action', 'redo') },
        { type: 'separator' },
        { label: t.cut, accelerator: 'CmdOrCtrl+X', click: () => mainWindow.webContents.send('menu-action', 'cut') },
        { label: t.copy, accelerator: 'CmdOrCtrl+C', click: () => mainWindow.webContents.send('menu-action', 'copy') },
        { label: t.paste, accelerator: 'CmdOrCtrl+V', click: () => mainWindow.webContents.send('menu-action', 'paste') },
        { type: 'separator' },
        { label: t.selectAll, accelerator: 'CmdOrCtrl+A', click: () => mainWindow.webContents.send('menu-action', 'select-all') },
        { label: t.find, accelerator: 'CmdOrCtrl+F', click: () => mainWindow.webContents.send('menu-action', 'find') }
      ]
    },
    {
      label: t.view,
      submenu: [
        { label: t.zoomIn, accelerator: 'CmdOrCtrl+=', click: () => mainWindow.webContents.send('menu-action', 'zoom-in') },
        { label: t.zoomOut, accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.send('menu-action', 'zoom-out') },
        { label: t.zoomReset, accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.send('menu-action', 'zoom-reset') },
        { type: 'separator' },
        { label: t.fitCanvas, accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.send('menu-action', 'fit-canvas') },
        { type: 'separator' },
        { label: t.outline, accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow.webContents.send('menu-action', 'toggle-outline') },
        { type: 'separator' },
        { label: t.fullscreen, accelerator: 'F11', role: 'togglefullscreen' }
        // DevTools removed from production build
      ]
    },
    {
      label: t.insert,
      submenu: [
        // P1-9: Tab/Enter/Shift+Tab must NOT be menu accelerators — they hijack typing
        // in the node editor and the AI chat input. The renderer's keydown handler
        // implements them natively; menu labels keep the shortcut hint for discoverability.
        { label: t.childNode + ' (Tab)', click: () => mainWindow.webContents.send('menu-action', 'insert-child') },
        { label: t.siblingNode + ' (Enter)', click: () => mainWindow.webContents.send('menu-action', 'insert-sibling') },
        { type: 'separator' },
        { label: t.parentNode + ' (Shift+Tab)', click: () => mainWindow.webContents.send('menu-action', 'insert-parent') },
        { type: 'separator' },
        { label: t.link, click: () => mainWindow.webContents.send('menu-action', 'insert-link') },
        { label: t.note, click: () => mainWindow.webContents.send('menu-action', 'insert-note') },
        { label: t.icon, click: () => mainWindow.webContents.send('menu-action', 'insert-icon') }
      ]
    },
    {
      label: t.layout,
      submenu: [
        { label: t.mindmap, click: () => mainWindow.webContents.send('menu-action', 'layout-mindmap') },
        { label: t.treeRight, click: () => mainWindow.webContents.send('menu-action', 'layout-tree-right') },
        { label: t.treeDown, click: () => mainWindow.webContents.send('menu-action', 'layout-tree-down') },
        { label: t.fishbone, click: () => mainWindow.webContents.send('menu-action', 'layout-fishbone') },
        { label: t.org, click: () => mainWindow.webContents.send('menu-action', 'layout-org') }
      ]
    },
    {
      label: t.theme,
      submenu: [
        { label: t.classicBlue, click: () => mainWindow.webContents.send('menu-action', 'theme-classic-blue') },
        { label: t.darkPurple, click: () => mainWindow.webContents.send('menu-action', 'theme-dark-purple') },
        { label: t.freshGreen, click: () => mainWindow.webContents.send('menu-action', 'theme-fresh-green') },
        { label: t.vibrantOrange, click: () => mainWindow.webContents.send('menu-action', 'theme-vibrant-orange') },
        { label: t.minimal, click: () => mainWindow.webContents.send('menu-action', 'theme-minimal') },
        { label: t.chinaRed, click: () => mainWindow.webContents.send('menu-action', 'theme-china-red') }
      ]
    }
  ];
}

// 文件读写 IPC（P0-4：对话框与路径由渲染进程统一管理，主进程不再持有 currentFilePath）

ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    // P3: window title follows the current menu language
    mainWindow.setTitle(`MindZ${currentLang === 'zh' ? ' 思维导图' : ' Mind Map'} - ${path.basename(filePath)}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-image', async (event, { filePath, dataUrl }) => {
  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-svg', async (event, { filePath, svgContent }) => {
  try {
    fs.writeFileSync(filePath, svgContent, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-pdf', async (event, { filePath, svgContent }) => {
  try {
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({
      width: 1200, height: 900,
      show: false,
      webPreferences: { offscreen: true }
    });

    // Build a full HTML page with the SVG centered
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: white; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  svg { max-width: 100%; max-height: 100%; }
</style></head>
<body>${svgContent}</body></html>`;

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // P3: wait for the page to actually finish loading instead of a fixed 800ms guess,
    // then give the compositor a short settle window before rasterizing to PDF
    await new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      win.webContents.once('did-finish-load', done);
      setTimeout(done, 3000); // safety cap in case did-finish-load never fires
    });
    await new Promise(resolve => setTimeout(resolve, 150));

    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    win.close();
    fs.writeFileSync(filePath, pdfData);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

// ============================================================
// AI Module IPC Handlers
// ============================================================

// Initialize AI manager after app is ready
function initAIManager() {
  if (!aiManager) {
    aiManager = new AIProviderManager(app.getPath('userData'));
  }
}

// Get AI config (with masked API keys)
ipcMain.handle('ai-get-config', async () => {
  initAIManager();
  return aiManager.getConfig();
});

// Update provider settings
ipcMain.handle('ai-update-provider', async (event, { providerKey, settings }) => {
  initAIManager();
  return aiManager.updateProvider(providerKey, settings);
});

// Set default provider
ipcMain.handle('ai-set-default-provider', async (event, { providerKey }) => {
  initAIManager();
  return aiManager.setDefaultProvider(providerKey);
});

// Non-streaming chat
ipcMain.handle('ai-chat', async (event, { providerKey, messages, options }) => {
  initAIManager();
  return await aiManager.chat(providerKey, messages, options || {});
});

// Streaming chat — sends chunks back via 'ai-chat-chunk' channel
ipcMain.handle('ai-chat-stream', async (event, { providerKey, messages, options }) => {
  initAIManager();
  await aiManager.chatStream(providerKey, messages, (chunk) => {
    // Send each chunk to the renderer
    event.sender.send('ai-chat-chunk', chunk);
  }, options || {});
  return { success: true };
});

// P0-5: abort the active streaming request (renderer "Stop" button)
ipcMain.handle('ai-abort-stream', async () => {
  initAIManager();
  aiManager.abortActiveStream();
  return { success: true };
});

// Parse file for AI import
ipcMain.handle('ai-parse-file', async (event, { filePath }) => {
  initAIManager();
  return aiManager.parseFile(filePath);
});

// Conversation history CRUD
ipcMain.handle('ai-save-conversation', async (event, { convId, messages }) => {
  initAIManager();
  return aiManager.saveConversation(convId, messages);
});

ipcMain.handle('ai-load-conversation', async (event, { convId }) => {
  initAIManager();
  return aiManager.loadConversation(convId);
});

ipcMain.handle('ai-list-conversations', async () => {
  initAIManager();
  return aiManager.listConversations();
});

ipcMain.handle('ai-delete-conversation', async (event, { convId }) => {
  initAIManager();
  return aiManager.deleteConversation(convId);
});

// Update menu language
ipcMain.handle('update-menu-language', async (event, { lang }) => {
  currentLang = lang || 'zh';
  const menuTemplate = buildMenu(currentLang);
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  return { success: true };
});

// ============================================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
