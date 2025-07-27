const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// --- НАЧАЛО БЛОКА ЛОКАЛИЗАЦИИ ---
let translations = {};
const availableLanguages = ['en', 'ru', 'ro'];

const languageNames = {
    en: 'English',
    ru: 'Русский',
    ro: 'Română'
};

function loadTranslations(lang) {
  try {
    const filePath = path.join(__dirname, 'locales', `${lang}.json`);
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      translations = JSON.parse(fileContent);
    } else {
      console.warn(`Translation file for ${lang} not found, falling back to English.`);
      if (lang !== 'en') {
        loadTranslations('en');
      }
    }
  } catch (error) {
    console.error(`Could not load/parse translation file for ${lang}:`, error);
    if (lang !== 'en') {
      loadTranslations('en');
    }
  }
}

function t(key, replacements = {}) {
    let translation = translations[key] || key;
    for (const placeholder in replacements) {
        translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return translation;
}
// --- КОНЕЦ БЛОКА ЛОКАЛИЗАЦИИ ---

let Store;
let mainWindow;

import('electron-store').then(storeModule => {
  Store = storeModule.default;
  const store = new Store();
  
  const savedLang = store.get('language', 'ru');
  loadTranslations(savedLang);

  initializeApp(store);
});

const dateFormats = [
    { id: 'dd-mm-yyyy', labelKey: 'menu_format_ddmmyyyy' },
    { id: 'yyyy-mm-dd', labelKey: 'menu_format_yyyymmdd' },
	{ id: 'mm-dd-yyyy', labelKey: 'menu_format_mmddyyyy' },
    { id: 'textual', labelKey: 'menu_format_textual' }
];

function createMenu(store, win) {
  const currentLang = store.get('language', 'ru');
  const currentFormat = store.get('ui.dateFormat', 'dd-mm-yyyy');
  const formatSubmenu = dateFormats.map(format => ({
    label: t(format.labelKey),
    type: 'radio',
    checked: currentFormat === format.id,
    click: () => {
      store.set('ui.dateFormat', format.id);
      // Меню пересоздастся автоматически при следующем запуске или смене языка.
      // Для мгновенного обновления можно было бы вызвать createMenu снова, но это не критично.
    }
  }));

  const menuTemplate = [
    {
      label: t('menu_file'),
      submenu: [
        {
          label: t('menu_select_folder'),
          accelerator: 'CmdOrCtrl+O',
          click: () => win.webContents.send('trigger-open')
        },
        {
          label: t('menu_save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => win.webContents.send('trigger-save')
        },
        { type: 'separator' },
        { role: 'quit', label: t('menu_exit') }
      ]
    },
    {
        label: t('menu_format'), // Используем ключ из локализации
        submenu: formatSubmenu
    },
    {
        label: t('menu_dev'),
        submenu: [
            { role: 'reload', label: t('menu_reload') },
            { role: 'forceReload', label: t('menu_force_reload') },
            { type: 'separator' },
            {
                label: t('menu_dev_tools'),
                accelerator: 'CmdOrCtrl+Shift+I',
                click: (item, focusedWindow) => focusedWindow.webContents.toggleDevTools()
            }
        ]
    },
    {
        label: t('menu_help'),
        submenu: [
            {
                label: t('menu_about'),
                click: () => {
                    dialog.showMessageBox(win, {
                        type: 'info',
                        title: t('about_title'),
                        message: t('about_message'),
                        detail: t('about_detail')
                    });
                }
            }
        ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function initializeApp(store) {
  const createWindow = () => {
    mainWindow = new BrowserWindow({
      width: 900,
      height: 800,
      minWidth: 700,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false
      }
    });
    
    createMenu(store, mainWindow);
    mainWindow.loadFile('renderer/index.html');
  };

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  // --- ОБРАБОТЧИКИ IPC ---
  ipcMain.handle('config:get', (_, key) => store.get(key));
  ipcMain.handle('i18n:get-translations', () => translations);
  ipcMain.handle('app:get-available-langs', () => {
    return availableLanguages.map(code => ({ code, name: languageNames[code] || code }));
  });

  ipcMain.handle('config:set', (_, { key, value }) => {
    store.set(key, value);
    if (key === 'language') {
        loadTranslations(value);
        createMenu(store, mainWindow);
        mainWindow.webContents.send('language-changed', translations);
    }
  });

  ipcMain.handle('dialog:open', async (_, options) => {
    const { properties, defaultPath, filters } = options;
    const result = await dialog.showOpenDialog(mainWindow, { properties, defaultPath, filters });
    return result.filePaths;
  });

  ipcMain.handle('dialog:saveFile', async (_, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result.filePath;
  });

  ipcMain.handle('fs:isDirectory', async (_, path) => {
    try {
      return fs.statSync(path).isDirectory();
    } catch (error) {
      console.error(`Error checking path type: ${path}`, error);
      return false;
    }
  });

  ipcMain.handle('fs:pathExists', async (_, path) => {
    return fs.existsSync(path);
  });

  ipcMain.handle('path:dirname', async (_, p) => {
    return path.dirname(p);
  });

  ipcMain.handle('files:getDirectoryTree', async (_, { dirPath }) => {
    const readDirFlat = (dir) => {
      const results = [];
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          const ext = file.isFile() ? path.extname(file.name).toLowerCase() : null;
          results.push({
            name: file.name,
            path: fullPath,
            type: file.isDirectory() ? 'dir' : 'file',
            children: [],
            ext: ext
          });
        }
      } catch (e) {
        console.warn(`Could not read directory: ${dir}`, e.message);
      }
      return results;
    };
    const readDirRecursive = (dir) => {
      const results = [];
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            if (file.name === 'node_modules' || file.name === 'user-data') {
                 results.push({ name: file.name, path: fullPath, type: 'dir', children: [] });
            } else {
                 results.push({ name: file.name, path: fullPath, type: 'dir', children: readDirRecursive(fullPath) });
            }
          } else {
            const ext = path.extname(file.name).toLowerCase();
            results.push({ name: file.name, path: fullPath, type: 'file', children: [], ext: ext });
          }
        }
      } catch (e) {
        console.warn(`Could not read directory: ${dir}`, e.message);
      }
      return results;
    };

    try {
      const baseName = path.basename(dirPath);
      if (baseName === 'node_modules' || baseName === 'user_data') {
        return { success: true, tree: readDirFlat(dirPath) };
      } else {
        return { success: true, tree: readDirRecursive(dirPath) };
      }
    } catch (error) {
      console.error('Error reading directory tree:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('files:merge', async (_, options) => {
    let { filesToMerge, outputPath, useAbsolutePaths } = options;
    const findCommonBasePath = (paths) => {
        if (!paths || paths.length === 0) return '';
        if (paths.length === 1) return path.dirname(paths[0]);
        let commonPath = path.dirname(paths[0]).split(path.sep);
        for (let i = 1; i < paths.length; i++) {
            const currentPath = path.dirname(paths[i]).split(path.sep);
            let j = 0;
            while (j < commonPath.length && j < currentPath.length && commonPath[j] === currentPath[j]) {
                j++;
            }
            commonPath.length = j; 
        }
        return commonPath.join(path.sep);
    };

    if (!outputPath) {
        outputPath = path.join(app.getAppPath(), 'codepack_output.txt');
    }

    if (!filesToMerge || filesToMerge.length === 0) {
        return { success: false, message: 'Не выбраны файлы для объединения.' };
    }

    let outputText = '';
    const basePath = useAbsolutePaths ? '' : findCommonBasePath(filesToMerge);

    for (const filePath of filesToMerge) {
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const displayPath = useAbsolutePaths ? filePath : path.relative(basePath, filePath);
                outputText += `//======= FILE: ${displayPath.replace(/\\/g, '/')} =======\n${content}\n//======= END FILE =======\n\n`;
            }
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            outputText += `//======= ERROR READING FILE: ${filePath} =======\n// ${error.message}\n//======= END FILE =======\n\n`;
        }
    }

    if (!outputText) {
        return { success: false, message: 'Не удалось прочитать ни один файл.' };
    }

    let finalPath = outputPath;
    if (fs.existsSync(finalPath)) {
        const dir = path.dirname(finalPath);
        const ext = path.extname(finalPath);
        const baseName = path.basename(finalPath, ext);
        let counter = 1;
        do {
            finalPath = path.join(dir, `${baseName}(${counter})${ext}`);
            counter++;
        } while (fs.existsSync(finalPath));
    }
    
    fs.writeFileSync(finalPath, outputText);
    return { success: true, outputPath: finalPath };
  });

  ipcMain.handle('files:split', async (_, { filesToCreate, outputDir }) => {
    try {
      if (!filesToCreate || filesToCreate.length === 0) {
        throw new Error('Не выбрано файлов для создания.');
      }
      const resolvedOutputDir = path.resolve(outputDir);
      let count = 0;
      let skippedCount = 0;

      for (const file of filesToCreate) {
        const fullPath = path.resolve(resolvedOutputDir, file.path);
        if (!fullPath.startsWith(resolvedOutputDir)) {
          console.warn(`Attempted path traversal blocked for: "${file.path}". Skipping file.`);
          skippedCount++;
          continue;
        }
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.content);
        count++;
      }
      
      let message = t('alert_split_success_message', { count: count, outputDir: outputDir });
      if (skippedCount > 0) {
        message += `\n\nВнимание: ${skippedCount} файлов было пропущено из-за попытки записи за пределами целевой папки.`;
      }

      return { success: true, count, message };
    } catch (error) {
      console.error('Splitting error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clipboard:write', (_, text) => {
    clipboard.writeText(text);
  });

  ipcMain.on('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      console.error(`Error reading file: ${filePath}`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('fs:saveFileContent', async (_, { filePath, content }) => {
    try {
      fs.writeFileSync(filePath, content);
      return { success: true };
    } catch (error) {
      console.error(`Error saving file: ${filePath}`, error);
      return { success: false, error: error.message };
    }
  });
}