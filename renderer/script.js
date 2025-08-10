// Отладочный блок (выключен по умолчанию)
const DEBUG_MODE = false;
const DEBUG_PATH = '';
const DEBUG_CALCS = false;
const logNodeState = () => {};

const showToast = (message, type = 'info', duration = 4000) => {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-message ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Заставляем браузер применить начальные стили перед добавлением класса .show
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Таймер на удаление
  setTimeout(() => {
    toast.classList.remove('show');
    // Ждем окончания анимации исчезновения перед удалением из DOM
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
};

document.addEventListener('DOMContentLoaded', () => {
  // Локализация
  let t;

  const applyTranslations = async (translations) => {
    if (!translations) return;
    t = (key, replacements = {}) => {
        let translation = translations[key] || key;
        for (const placeholder in replacements) {
            translation = translation.replace(`{${placeholder}}`, replacements[placeholder]);
        }
        return translation;
    };
    // Применяем переводы к элементам с атрибутом data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        // Для label, содержащих input, текст нужно вставлять в span
        if (el.tagName === 'SPAN' && el.parentElement.tagName === 'LABEL') {
             el.innerHTML = t(key);
        } else {
             el.innerHTML = t(key);
        }
    });
    // Применяем переводы к placeholder и title
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-tooltip'));
    });
    // Обновляем динамические элементы
    updateTotals();
    renderSplitTree(splitFileTreeData); // Перерисовываем дерево разборки с новыми переводами
    
    // Флаги в переключателе языка
    const flagImg = document.getElementById('lang-flag');
    const currentLang = await window.api.getConfig('language', 'ru');
    const altFlagActive = alternateFlagsState[currentLang];
    
    let flagFile = translations.flag_file;
    if (altFlagActive && translations.alt_flag_file) {
        flagFile = translations.alt_flag_file;
    }
    
    if (flagFile) {
        flagImg.src = `../locales/flags/${flagFile}`;
        flagImg.style.display = 'block';
    } else {
        flagImg.style.display = 'none';
    }
    
    // Обновляем текст в списке языков для пасхалки
    const langLi = document.querySelector(`#lang-list li[data-lang="ro"]`);
    if (langLi) {
        const roAltActive = alternateFlagsState['ro'];
        langLi.textContent = roAltActive ? 'Moldovenească' : 'Română';
    }
    // Конец блока флагов
    CodeViewer.updateUiForLanguage(t);
    CodeViewer.setPhrases({
        'Find': t('search_find'),
        'Replace': t('search_replace'),
        'next': t('search_next'),
        'previous': t('search_prev'),
        'all': t('search_all'),
        'match case': t('search_match_case'),
        'regexp': t('search_regexp'),
        'by word': t('search_by_word'),
        'replace': t('search_replace_btn'),
        'replace all': t('search_replace_all'),
        'close': t('search_close')
    });
  };
  // Конец блока локализации

  const settingsToPersist = {
    '#validExtensions': 'merge.validExtensions',
    '#ignorePatterns': 'merge.ignorePatterns',
    '#outputPath': 'merge.outputPath',
    '#useAbsolutePaths': 'merge.useAbsolutePaths',
    '#addTimestamp': 'merge.addTimestamp',
    '#addNumber': 'merge.addNumber',
    '#closeOnComplete': 'merge.closeOnComplete',
    '#excludeNodeModules': 'merge.excludeNodeModules',
    '#excludeUserData': 'merge.excludeUserData',
    '#startDelimiter': 'split.startDelimiter',
    '#endDelimiter': 'split.endDelimiter',
    '_checkedPaths': 'merge.checkedPaths'
  };
  const defaultSettings = {
      extensions: '.js, .jsx, .ts, .tsx, .html, .css, .scss, .json, .md, .py',
      ignores: '.git, .vscode, dist, build, coverage, package-lock.json'
  };
  const fileIcons = {
    '.js': 'JS', '.jsx': 'JS',
    '.ts': 'TS', '.tsx': 'TS',
    '.html': '🌐', '.css': '🎨', '.scss': '🎨',
    '.json': '⚙️', '.md': '📝', '.py': '🐍',
    'default': '📄'
  };
  let fileTreeData = [];
  let splitFileTreeData = [];
  let treeObserver = null;
  let alternateFlagsState = {};
  let flagClickCounter = 0;
  let flagClickTimer = null;
  let currentSearchIndex = -1;
  let searchResults = [];
  
  const formatTimestampForFilename = async (date) => {
    const format = await window.api.getConfig('ui.dateFormat', 'dd-mm-yyyy');
    const translations = await window.api.getTranslations();

    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const M_index = date.getMonth();
    const DD = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');

    let dateString;

    switch (format) {
        case 'yyyy-mm-dd':
            dateString = `${YYYY}-${MM}-${DD}`;
            break;
        case 'textual':
            const monthName = translations.months[M_index] || '';
            const yearSuffix = translations.year_suffix ? ` ${translations.year_suffix}` : '';
            dateString = `${DD} ${monthName} ${YYYY}${yearSuffix}`;
            break;
        case 'dd-mm-yyyy':
        default:
            dateString = `${DD}-${MM}-${YYYY}`;
            break;
    }

    return `${dateString}, ${hh}-${mm}`;
};

const formatSize = (bytes) => {
    if (bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
};

const calculateFolderStats = (nodes) => {
    nodes.forEach(node => {
        if (node.type === 'dir' && node.children) {
            calculateFolderStats(node.children);
            
            node.lines = node.children.reduce((sum, child) => {
                // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
                // Мы включаем статистику дочернего элемента, если он отмечен ИЛИ находится в неопределенном состоянии.
                // Это гарантирует, что частично выбранные папки тоже вносят свой вклад в родительскую.
                const shouldInclude = child.checked || child.indeterminate;
                const linesToAdd = shouldInclude && child.lines ? child.lines : 0;
                return sum + linesToAdd;
            }, 0);

            node.size = node.children.reduce((sum, child) => {
                // --- И ИЗМЕНЕНИЕ ЗДЕСЬ ---
                const shouldInclude = child.checked || child.indeterminate;
                const sizeToAdd = shouldInclude && child.size ? child.size : 0;
                return sum + sizeToAdd;
            }, 0);
        }
    });
};

  const autoResizeTextarea = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  
  let splitRenderTimeout;
  const parseAndRenderSplitTree = (content, filePath) => {
    clearTimeout(splitRenderTimeout);
    splitRenderTimeout = setTimeout(() => {
      if (!content.trim()) {
        splitFileTreeData = [];
        renderSplitTree([], null);
        return;
      }
      
      const files = parseInputToFiles(content);
      if (files.length > 0) {
        splitFileTreeData = buildTreeFromFlatPaths(files);
        calculateFolderStats(splitFileTreeData);
        sortTree(splitFileTreeData);
      } else {
        splitFileTreeData = [];
      }
      renderSplitTree(splitFileTreeData, filePath);
	  CodeViewer.loadContent(getAllNodesRecursive(splitFileTreeData));
    }, 300);
  };
const parseInputToFiles = (content) => {
    const startDelimiter = document.getElementById('startDelimiter').value;
    const endDelimiter = document.getElementById('endDelimiter').value;
    const endFileMarker = '//======= END FILE =======';
    const files = [];
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = new RegExp(
      `(?:^|\\r?\\n)${escapeRegExp(startDelimiter)}(.*?)${escapeRegExp(endDelimiter)}\\r?\\n([\\s\\S]*?)(?=\\r?\\n${escapeRegExp(endFileMarker)}|$)`, 'g'
    );

    for (const match of content.matchAll(regex)) {
      // Группы захвата теперь сместились на 1, т.к. мы добавили группу в начале.
      const filePath = match[1].trim().replace(/\\/g, '/');
      const fileContent = match[2].trim();
      if (filePath) {
        const lines = fileContent.split('\n').length;
        const size = new TextEncoder().encode(fileContent).length;
        files.push({ path: filePath, content: fileContent, lines, size });
      }
    }
    return files;
  };

  const buildTreeFromFlatPaths = (files) => {
    const tree = [];
    const map = new Map();
    files.forEach(file => {
      const pathParts = file.path.split('/');
      let currentLevel = tree;
      let currentPath = '';

      pathParts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLastPart = index === pathParts.length - 1;
        let node = map.get(currentPath);
        if (!node) {
           if (isLastPart) {
            node = {
              name: part, path: file.path, type: 'file', content: file.content,
              lines: file.lines,
              size: file.size,
              checked: true, isExcluded: false, ext: '.' + part.split('.').pop().toLowerCase()
            };
            map.set(file.path, node);
          } else {
            node = {
              name: part, path: currentPath, type: 'dir', children: [],
              checked: true, isExcluded: false, collapsed: false
            };
            map.set(currentPath, node);
          }
          currentLevel.push(node);
         }
        if (node.type === 'dir') {
          currentLevel = node.children;
        }
      });
    });
    return tree;
  };
  const renderSplitTree = (nodesToRender, filePath) => {
    const container = document.getElementById('split-file-list-container');
    const statsContainer = document.getElementById('split-total-stats-text');

    if (!nodesToRender || nodesToRender.length === 0) {
      container.innerHTML = `<p class="placeholder">${t('split_files_placeholder')}</p>`;
      document.getElementById('split-file-count').textContent = t('file_count_many', { count: 0 });
      if (statsContainer) statsContainer.innerHTML = '&nbsp;';
      return;
    }

    const createNodeHTML = (node) => {
      const isDir = node.type === 'dir';
      const icon = isDir ? '📂' : getIconForFile(node.name);
      const childrenHTML = (isDir && node.children && node.children.length > 0)
        ? `<ul>${node.children.map(createNodeHTML).join('')}</ul>`
        : '';
      const checkboxState = node.checked ? 'checked' : '';
      const ext = isDir ? null : (node.ext || '');

      const statsHTML = (node.lines !== undefined && node.size !== undefined) ?
      `
        <div class="file-stats">
            <span class="stat-lines">${node.lines !== undefined ? node.lines.toLocaleString('ru-RU') : ''}</span>
            <span class="stat-size">${node.size !== undefined ? formatSize(node.size) : ''}</span>
        </div>
      ` : '';

      const fileActionsHTML = !isDir ?
      `
        <div class="file-actions">
          <button class="action-btn" title="${t('copy_content_tooltip')}" data-action="copy" data-path="${node.path}">📋</button>
          <button class="action-btn" title="${t('save_file_as_tooltip')}" data-action="save" data-path="${node.path}">💾</button>
        </div>
      ` : '';

      return `<li class="tree-item" data-path="${node.path}">
          <div class="tree-item-content">
              <input type="checkbox" data-path="${node.path}" ${checkboxState}>
              <span class="icon" data-type="${node.type}" data-ext="${ext}">${icon}</span>
              <span class="name">${node.name}</span>
              ${fileActionsHTML}
              ${statsHTML}
          </div>
          ${childrenHTML}
      </li>`;
    };
    
    container.innerHTML = `<ul class="file-tree">${nodesToRender.map(createNodeHTML).join('')}</ul>`;
    const allNodes = (function getAllNodesRecursive(nodes) {
        let flatList = [];
        for (const node of nodes) {
            flatList.push(node);
            if (node.children) flatList.push(...getAllNodesRecursive(node.children));
        }
        return flatList;
    })(nodesToRender);
    allNodes.forEach((node) => {
        const li = container.querySelector(`li[data-path="${CSS.escape(node.path)}"]`);
        if (li) {
            const checkbox = li.querySelector(':scope > .tree-item-content > input[type="checkbox"]');
            if (checkbox) checkbox.indeterminate = node.indeterminate === true;
        }
    });
    const count = (function countCheckedFiles(nodes) {
        let n = 0;
        nodes.forEach(node => {
            if (node.type === 'file' && node.checked) n++;
            if (node.children) n += countCheckedFiles(node.children);
        });
        return n;
    })(splitFileTreeData);
    document.getElementById('split-file-count').textContent = formatFileCount(count);

    if (statsContainer) {
        const allFileNodes = getAllNodesRecursive(splitFileTreeData).filter(n => n.type === 'file');
        const totalLines = allFileNodes.reduce((sum, file) => sum + (file.lines || 0), 0);
        const totalSize = allFileNodes.reduce((sum, file) => sum + (file.size || 0), 0);
        const fileName = filePath ? filePath.split(/[\\/]/).pop() : '';
        
        statsContainer.textContent = `${fileName} | Итог: ${totalLines.toLocaleString('ru-RU')} строк, ${formatSize(totalSize)}`;
    }

    if (nodesToRender.length === 0) {
        CodeViewer.loadContent([]);
    }
  };
  const updateSplitTreeState = (path, isChecked) => {
      const node = findNodeByPath(splitFileTreeData, path);
      if (!node) return;
      const updateChildrenRecursive = (n, checked) => {
          n.checked = checked;
          n.indeterminate = false;
          if (n.children) n.children.forEach(child => updateChildrenRecursive(child, checked));
      };
      updateChildrenRecursive(node, isChecked);
      const updateAllParentCheckboxes = (nodes) => {
        const recursiveUpdate = (node) => {
          if (node.type !== 'dir' || !node.children || node.children.length === 0) {
            return node.checked;
          }
          const childStates = node.children.map(child => recursiveUpdate(child));
          const allChildrenChecked = childStates.every(state => state === true);
          const someChildrenChecked = childStates.some(state => state === true || state === 'indeterminate');
          if (allChildrenChecked) {
            node.checked = true;
            node.indeterminate = false;
            return true;
          } else if (someChildrenChecked) {
            node.checked = false;
            node.indeterminate = true;
            return 'indeterminate';
          } else {
            node.checked = false;
            node.indeterminate = false;
            return false;
          }
        };
        nodes.forEach(recursiveUpdate);
      };
      updateAllParentCheckboxes(splitFileTreeData);
      renderSplitTree(splitFileTreeData);
  };
  
  const loadSettings = async () => {
    for (const selector in settingsToPersist) {
      const element = document.querySelector(selector);
      if (element) {
        const key = settingsToPersist[selector];
        const value = await window.api.getConfig(key);
        if (element.type === 'checkbox') {
          if (value === undefined) {
            element.checked = (selector === '#excludeNodeModules' || selector === '#excludeUserData');
          } else {
            element.checked = value === true;
          }
        } else if (value !== undefined && value !== null) {
          element.value = value;
        } else {
          if (selector === '#validExtensions') element.value = defaultSettings.extensions;
          if (selector === '#ignorePatterns') element.value = defaultSettings.ignores;
        }
        if (value === undefined) {
            saveSetting(element);
        }
      }
    }
  };
const saveSetting = (element) => {
  const key = settingsToPersist[`#${element.id}`];
  if (key) {
    const value = element.type === 'checkbox' ? element.checked : element.value;
    window.api.setConfig({ key, value });
  }
};

const applyBodyTheme = (theme) => {
    document.body.classList.toggle('light-theme', theme === 'light');
    document.body.classList.toggle('dark-theme', theme === 'dark');
};

const setupEventListeners = async (theme) => {
        applyBodyTheme(theme);
        const searchAll = await window.api.getConfig('split.searchAllFiles', false);
        const isPanelVisible = await window.api.getConfig('split.isPanelVisible', true);
        CodeViewer.init({
            theme,
            searchAll,
            onFileDroppedOrSelected: async (files) => {
        let filePath = null;
        if (files && files.length > 0) {
            filePath = files[0].path;
        } else {
            const lastDir = await window.api.getConfig('split.lastInputDirectory');
            const paths = await window.api.showOpenDialog({
                properties: ['openFile'],
                defaultPath: lastDir,
                filters: [{ name: 'Text Files', extensions: ['txt', 'log', 'md'] }, { name: 'All Files', extensions: ['*'] }]
            });
            if (paths && paths.length > 0) {
                filePath = paths[0];
            }
        }

        if (filePath) {
            const dirPath = await window.api.pathDirname(filePath);
            window.api.setConfig({ key: 'split.lastInputDirectory', value: dirPath });
            showLoader(true);
            const result = await window.api.readFile(filePath);
            showLoader(false);

            if (result.success) {
                parseAndRenderSplitTree(result.content, filePath);
            } else {
                showToast(t('alert_read_file_error', { error: result.error }), 'error');
            }
        }
    }
    });
    
    window.api.onLanguageChanged((newTranslations) => {
      applyTranslations(newTranslations);
    });

    // Логика селектора языка
    const populateLangSelector = async () => {
        const availableLangs = await window.api.getAvailableLangs();
        const langList = document.getElementById('lang-list');
        langList.innerHTML = '';
        availableLangs.forEach(lang => {
            const li = document.createElement('li');
            li.dataset.lang = lang.code;
            li.textContent = lang.name;
li.addEventListener('click', async () => {
    const currentLang = await window.api.getConfig('language', 'ru');
    const newLang = li.dataset.lang;

    // Сбрасываем состояние пасхалки, только если выбрали ДРУГОЙ язык
    if (currentLang !== newLang) {
        alternateFlagsState = {}; 
        await window.api.setConfig({ key: 'ui.alternateFlags', value: alternateFlagsState });
    }

    // Теперь меняем язык
    await window.api.setConfig({ key: 'language', value: newLang });
    // Закрываем меню после выбора
    document.getElementById('lang-selector').classList.remove('open');
});

            langList.appendChild(li);
        });
        applyTranslations(await window.api.getTranslations()); // Первичная отрисовка флага
    };
    
    const langFlag = document.getElementById('lang-flag');
    langFlag.addEventListener('click', () => {
        flagClickCounter++;
        
        clearTimeout(flagClickTimer);
        flagClickTimer = setTimeout(() => {
            flagClickCounter = 0; // Сбрасываем счетчик, если клики были медленными
        }, 1000); // 1 секунда на 5 кликов
        
        if (flagClickCounter === 5) {
            flagClickCounter = 0;
            clearTimeout(flagClickTimer);
            
            const toggleAltFlag = async () => {
                const currentLang = await window.api.getConfig('language', 'ru');
                alternateFlagsState[currentLang] = true;
                await window.api.setConfig({ key: 'ui.alternateFlags', value: alternateFlagsState });
                applyTranslations(await window.api.getTranslations());
            };
            toggleAltFlag();
        }
    });
    
    populateLangSelector();
    // Конец логики селектора языка
	
	const langSelector = document.getElementById('lang-selector');
langSelector.addEventListener('click', (e) => {
  // Не даем клику по пункту меню закрыть его мгновенно
  if (e.target.tagName !== 'LI') {
    langSelector.classList.toggle('open');
  }
});

// Закрываем меню, если кликнули в любом другом месте окна
document.addEventListener('click', (e) => {
  if (!langSelector.contains(e.target)) {
    langSelector.classList.remove('open');
  }
});
    
    // Форматирование имени файла
const updateOutputFilename = async () => {
    const outputPathEl = document.getElementById('outputPath');
    let baseName = outputPathEl.value || 'codepack_output.txt';

    const extIndex = baseName.lastIndexOf('.');
    let nameWithoutExt = extIndex !== -1 ? baseName.substring(0, extIndex) : baseName;
    const extension = extIndex !== -1 ? baseName.substring(extIndex) : '';

    // Удаляем старые добавки: временную метку и комментарий
    nameWithoutExt = nameWithoutExt.replace(/\s-\s.*$/, '');
    nameWithoutExt = nameWithoutExt.replace(/\s*\[.*?\]\s*$/, '');

    const addTimestamp = document.getElementById('addTimestamp').checked;
    const comment = document.getElementById('filenameComment').value.trim();

    let additions = '';
    if (addTimestamp) {
        additions += ` - ${await formatTimestampForFilename(new Date())}`;
    }
    if (comment) {
        additions += ` [${comment}]`;
    }

    outputPathEl.value = nameWithoutExt + additions + extension;
    saveSetting(outputPathEl); // Сохраняем измененный путь
};
    
    document.getElementById('addTimestamp').addEventListener('change', updateOutputFilename);
    document.getElementById('addNumber').addEventListener('change', updateOutputFilename);
    document.getElementById('filenameComment').addEventListener('input', updateOutputFilename);
    document.getElementById('outputPath').addEventListener('change', () => {
        // Чтобы при ручном изменении пути настройки тоже применялись
        if (!document.getElementById('addTimestamp').checked && !document.getElementById('filenameComment').value) {
           saveSetting(document.getElementById('outputPath'));
        } else {
           updateOutputFilename();
        }
    });
    // Конец форматирования имени файла

    document.querySelector('.tabs').addEventListener('click', (e) => {
      if (e.target.matches('.tab-btn')) switchTab(e.target.dataset.tab);
    });
    Object.keys(settingsToPersist).forEach(selector => {
      document.querySelector(selector)?.addEventListener('change', (e) => saveSetting(e.target));
    });
    const controlsToWatch = ['#validExtensions', '#ignorePatterns', '#excludeNodeModules', '#excludeUserData'];
    controlsToWatch.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        const eventType = element.type === 'checkbox' ? 'change' : 'input';
        element.addEventListener(eventType, () => {
          if (rawFileTree.length > 0) {
            applyFiltersAndRender();
          }
        });
      }
    });

    document.querySelectorAll('.setting-item textarea').forEach(textarea => {
      textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    });
    document.getElementById('restoreExtensions').addEventListener('click', () => {
      const textarea = document.getElementById('validExtensions');
      textarea.value = defaultSettings.extensions;
      autoResizeTextarea(textarea);
      saveSetting(textarea);
      applyFiltersAndRender();
    });
    document.getElementById('restoreIgnores').addEventListener('click', () => {
      const textarea = document.getElementById('ignorePatterns');
      textarea.value = defaultSettings.ignores;
      autoResizeTextarea(textarea);
      saveSetting(textarea);
      applyFiltersAndRender();
    });
    document.getElementById('chooseFolderBtn').addEventListener('click', async () => {
      const paths = await window.api.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] });
      if (paths && paths.length > 0) await processSelectedPaths(paths, { replace: true });
    });
    document.getElementById('chooseFilesBtn').addEventListener('click', async () => {
      const paths = await window.api.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
      if (paths && paths.length > 0) await processSelectedPaths(paths, { replace: true });
    });
    document.getElementById('selectFolderBtn').addEventListener('click', async () => {
      const paths = await window.api.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] });
      if (paths && paths.length > 0) await processSelectedPaths(paths, { forceInclude: true });
    });
    document.getElementById('selectFilesBtn').addEventListener('click', async () => {
      const paths = await window.api.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
      if (paths && paths.length > 0) await processSelectedPaths(paths, { forceInclude: true });
    });
    document.getElementById('selectOutputPathBtn').addEventListener('click', async () => {
      const path = await window.api.showSaveDialog({
        title: 'Сохранить объединенный файл', defaultPath: 'codepack_output.txt', filters: [{ name: 'Text Files', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }]
      });
      if (path) {
        const outputPathEl = document.getElementById('outputPath');
        outputPathEl.value = path;
        saveSetting(outputPathEl);
      }
    });
    document.getElementById('mergeBtn').addEventListener('click', async () => {
      const outputPath = document.getElementById('outputPath').value;
      const useAbsolutePaths = document.getElementById('useAbsolutePaths').checked;
      const filesToMerge = [];

      const findCheckedFiles = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'file' && node.checked) {
            filesToMerge.push(node.path);
          }
           if (node.children) {
            findCheckedFiles(node.children);
          }
        }
      };
      findCheckedFiles(rawFileTree);

      if (filesToMerge.length === 0) {
        showToast(t('alert_no_files_to_merge'), 'error');
        return;
      }
      showLoader(true);
      try {
        const addNumber = document.getElementById('addNumber').checked;
        const result = await window.api.mergeFiles({ filesToMerge, outputPath, useAbsolutePaths, addNumber });
        if (result.success) {
            showToast(t('alert_merge_success_title') + '\n' + t('alert_merge_success_message', {outputPath: result.outputPath}), 'success');
            if (document.getElementById('closeOnComplete').checked) {
                setTimeout(() => window.api.quitApp(), 1000);
            }
        } else {
            throw new Error(result.message);
        }
      } catch (error) {
        showToast(t('alert_merge_error_title', { error: error.message }), 'error');
      } finally {
        if (!document.getElementById('closeOnComplete').checked) {
            showLoader(false);
        }
      }
    });
    document.getElementById('clearFileListBtn').addEventListener('click', () => {
      rawFileTree = [];
      renderFileTree(rawFileTree);
    });
    const dropZone = document.getElementById('drag-drop-zone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove('drag-over');
      const paths = [...e.dataTransfer.files].map(f => f.path);
      // Добавляем опцию, чтобы перетаскивание работало как "Добавить", а не "Выбрать"
      if (paths.length > 0) processSelectedPaths(paths, { forceInclude: true });
    });
    document.getElementById('file-list-container').addEventListener('click', async (e) => {
      const li = e.target.closest('li.tree-item');
      if (!li) return;
      if (e.target.matches('.toggle-icon')) {
        const path = li.dataset.path;
        const node = findNodeByPath(rawFileTree, path);
        if (node && node.type === 'dir') {
            toggleFolder(node);
        }
        return;
      }
      if (e.target.matches('input[type="checkbox"]')) {
        await updateTreeState(li.dataset.path, e.target.checked);
        return;
      }
      if (e.target.matches('.name')) {
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          updateTreeState(li.dataset.path, checkbox.checked);
        }
        return;
      }
    });
    document.getElementById('file-list-container').addEventListener('dblclick', (e) => {
      const itemContent = e.target.closest('.tree-item-content');
      if (!itemContent) return;
      const li = itemContent.closest('li.tree-item');
      if (!li) return;
      const path = li.dataset.path;
      const node = findNodeByPath(rawFileTree, path);
      if (node && node.type === 'dir') {
        toggleFolder(node);
      }
    });
    document.getElementById('expandAllBtn').addEventListener('click', () => {
      toggleAllNodes(false);
    });
    document.getElementById('collapseAllBtn').addEventListener('click', () => {
      rawFileTree.forEach(rootNode => {
        if (rootNode.children) {
          rootNode.children.forEach(childNode => {
            if (childNode.type === 'dir') {
              childNode.collapsed = true;
            }
          });
        }
       });
      renderFileTree(rawFileTree);
    });
    document.getElementById('copyAITemplateBtn').addEventListener('click', () => {
      const startDelimiter = document.getElementById('startDelimiter').value;
      const endDelimiter = document.getElementById('endDelimiter').value;
      const template = `Проанализируй и доработай следующий код. Предоставь ответ в виде полного набора файлов, используя строго заданный формат. Не добавляй никаких пояснений, только код в указанном формате.\n\nФормат:\n${startDelimiter}путь/к/файлу1.js${endDelimiter}\n// Содержимое файла 1\n//======= END FILE =======\n\n${startDelimiter}путь/к/папке/файлу2.css${endDelimiter}\n/* Содержимое файла 2 */\n//======= END FILE =======\n`;
      window.api.copyToClipboard(template);
      showToast(t('alert_ai_template_copied'), 'success');
    });
    window.api.onPathsSelected((paths) => {
      if (paths && paths.length > 0) {
        processSelectedPaths(paths);
      }
    });
    // --- ОБРАБОТЧИКИ ДЛЯ ВКЛАДКИ "РАЗБОРКА" ---
    document.getElementById('splitClearBtn').addEventListener('click', () => {
      splitFileTreeData = [];
      renderSplitTree([], null);
    });
    document.getElementById('split-file-list-container').addEventListener('click', async (e) => {
      const target = e.target;
      const li = target.closest('.tree-item');
      if (!li) return;
      const path = li.dataset.path;
      if (target.matches('.name') || target.matches('.icon')) {
        e.preventDefault();
        const node = findNodeByPath(splitFileTreeData, path);
        if (node && node.type === 'file') {
            CodeViewer.navigateTo(path);
         }
        return;
      }
      if (target.matches('input[type="checkbox"]')) {
        updateSplitTreeState(path, target.checked);
        return;
      }
      if (target.matches('.action-btn')) {
        const action = target.dataset.action;
        const node = findNodeByPath(splitFileTreeData, path);
        if (!node || node.type !== 'file') return;

        if (action === 'copy') {
            window.api.copyToClipboard(node.content);
        } else if (action === 'save') {
            const defaultPath = node.name;
            const savedPath = await window.api.showSaveDialog({ defaultPath });
            if(savedPath) {
                await window.api.saveFileContent({filePath: savedPath, content: node.content});
            }
        }
      }
    });
    document.getElementById('splitBtn').addEventListener('click', async () => {
      const filesToCreate = [];
      const findCheckedFiles = (nodes) => {
          for (const node of nodes) {
              if (node.type === 'file' && node.checked) {
                  filesToCreate.push({ path: node.path, content: node.content });
              }
              if (node.children) {
                  findCheckedFiles(node.children);
              }
          }
      };
      findCheckedFiles(splitFileTreeData);

      if (filesToCreate.length === 0) {
          showToast(t('alert_no_files_to_split'), 'error');
          return;
      }

      const lastDir = await window.api.getConfig('split.lastOutputDirectory');
      const paths = await window.api.showOpenDialog({ 
          properties: ['openDirectory'],
          defaultPath: lastDir 
      });

      if (!paths || paths.length === 0) return;

      const outputDir = paths[0];
      window.api.setConfig({ key: 'split.lastOutputDirectory', value: outputDir });
      showLoader(true);
      try {
        const result = await window.api.splitFiles({ filesToCreate, outputDir });
        if (result.success) {
            showToast(t('alert_split_success_title') + '\n' + result.message, 'success');
        } else {
            throw new Error(result.error);
        }
      } catch (error) {
        showToast(t('alert_split_error_title', {error: error.message}), 'error');
      } finally {
        showLoader(false);
      }
    });

    document.getElementById('rebuildBtn').addEventListener('click', async () => {
      if (!CodeViewer.state.files || CodeViewer.state.files.length === 0) {
        showToast(t('alert_no_files_to_merge'), 'error');
        return;
      }
      const defaultPath = 'repacked.txt';
      const savedPath = await window.api.showSaveDialog({
        defaultPath,
        filters: [{ name: 'Text Files', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }]
      });
      if (!savedPath) return;
      const startDel = document.getElementById('startDelimiter').value;
      const endDel = document.getElementById('endDelimiter').value;
      let out = '';
      CodeViewer.state.files.forEach(f => {
        out += `${startDel}${f.path}${endDel}\n${f.content}\n//======= END FILE =======\n\n`;
      });
      await window.api.saveFileContent({ filePath: savedPath, content: out });
      showToast(t('alert_merge_success_title') + '\n' + t('alert_merge_success_message', {outputPath: savedPath}), 'success');
    });
    const triggerContextualSave = () => {
        if (document.getElementById('merge-tab').classList.contains('active')) {
            document.getElementById('mergeBtn').click();
        } else if (document.getElementById('split-tab').classList.contains('active')) {
            document.getElementById('splitBtn').click();
        }
    };

    window.api.onTriggerSave(() => {
        triggerContextualSave();
    });
    window.api.onTriggerOpen(() => {
        if (document.getElementById('merge-tab').classList.contains('active')) {
            document.getElementById('chooseFolderBtn').click();
        } else if (document.getElementById('split-tab').classList.contains('active')) {
            document.getElementById('selectSplitFileBtn').click();
        }
    });
    document.addEventListener('keydown', (e) => {

          // Поиск на вкладке "Сборка"
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        if (document.getElementById('merge-tab').classList.contains('active')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            toggleMergeSearch();
            return;
        }
    }

      if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        if (document.getElementById('split-tab').classList.contains('active')) {
            e.preventDefault();
            CodeViewer.toggleFilePanel();
            return;
        }
    }

    // Контекстный Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const mergeSearchContainer = document.getElementById('merge-search-container');
        const isMergeSearchVisible = mergeSearchContainer && mergeSearchContainer.style.display === 'flex';

        if (isMergeSearchVisible && document.getElementById('merge-tab').classList.contains('active')) {
            e.preventDefault();
            handleSearchInTree(true); // Искать вперед по Enter
            return;
        }

        const active = document.activeElement;
        const insideEditor = active.closest('.cm-editor');
        const insideSearch = active.closest('.cm-search');
        if (
            active.tagName !== 'TEXTAREA' &&
            active.tagName !== 'INPUT' &&
            !insideEditor &&
            !insideSearch
        ) {
             e.preventDefault();
            triggerContextualSave();
        }
        return; // Явно выходим, чтобы не было конфликтов
    }

        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            triggerContextualSave();
            return;
        }


        if (e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
            const nextTab = currentTab === 'merge' ? 'split' : 'merge';
            switchTab(nextTab);
            return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
            if (document.getElementById('split-tab').classList.contains('active')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
                CodeViewer.openSearch();
                return;
            }
        }
		
        if (e.ctrlKey && e.key === 'Enter') {
            if (document.getElementById('split-tab').classList.contains('active')) {
                e.preventDefault();
                CodeViewer.toggleFullWindow();
                return;
            }
        }

        if (e.altKey && e.key === 'Enter') {
            if (document.getElementById('split-tab').classList.contains('active')) {
                e.preventDefault();
                CodeViewer.toggleFullScreen();
                return;
            }
        }

        if (e.ctrlKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
            if (document.getElementById('split-tab').classList.contains('active')) {
                e.preventDefault();
                if (CodeViewer.state.viewMode === 'all') {
            // Логика для режима потока
            if (e.key === 'PageUp') {
                CodeViewer.scrollToPrevFile();
            } else {
                CodeViewer.scrollToNextFile();
            }
        } else {
            // Логика для режима одного файла
            if (e.key === 'PageUp') {
                CodeViewer.prevFile();
            } else {
                CodeViewer.nextFile();
            }
        }
        return;
    }
}

        if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            const active = document.activeElement;
            const insideEditor = active.closest('.cm-editor');
            const insideSearch = active.closest('.cm-search');
            if (
                active.tagName !== 'TEXTAREA' &&
                active.tagName !== 'INPUT' &&
                !insideEditor &&
                !insideSearch
            ) {
                e.preventDefault();
                triggerContextualSave();
            }
        }
    }, true);
  };


  const init = async () => {
    await applyTranslations(await window.api.getTranslations());
    await loadSettings();
    alternateFlagsState = (await window.api.getConfig('ui.alternateFlags')) || {};

      // --- Загружаем сохраненные "принудительные" пути ---
    const savedForcedPaths = await window.api.getConfig('merge.forcedPaths');
    if (savedForcedPaths && Array.isArray(savedForcedPaths)) {
        savedForcedPaths.forEach(p => forcedPaths.add(p));
    }

    const theme = await window.api.getConfig('ui.theme', 'light');
    await setupEventListeners(theme);
    window.api.onThemeChanged((th) => CodeViewer.setTheme(th));
    document.querySelectorAll('.setting-item textarea').forEach(autoResizeTextarea);
    
const lastPaths = await window.api.getConfig('merge.lastUsedPaths');
if (lastPaths && lastPaths.length > 0) {
    const pathExists = await window.api.pathExists(lastPaths[0]);
    if (pathExists) {
        if (DEBUG_MODE) console.log('[START] Начинаем восстановление состояния...');
        
        // 1. Строим дерево и применяем к нему фильтры (isExcluded).
        await processSelectedPaths(lastPaths, { isRestore: true });
        if (DEBUG_MODE) getAllNodesRecursive(rawFileTree).forEach(n => logNodeState('1. After applyFiltersAndRender', n));

        // 2. Загружаем сохраненное состояние галочек
        const checkedPaths = await window.api.getConfig('merge.checkedPaths');
        if (checkedPaths && Array.isArray(checkedPaths)) {
            if (DEBUG_MODE) console.log('[CONFIG] Загружены checkedPaths:', checkedPaths);
            const checkedSet = new Set(checkedPaths);
            const allNodes = getAllNodesRecursive(rawFileTree);

            // 3. Устанавливаем галочки АВТОРИТЕТНО из сохраненного списка
            allNodes.forEach(node => {
                node.checked = checkedSet.has(node.path);
            });
            if (DEBUG_MODE) getAllNodesRecursive(rawFileTree).forEach(n => logNodeState('2. After applying checkedSet', n));
            
            // 4. ✨✨✨ ФИНАЛЬНЫЙ ФИКС ✨✨✨
            // Принудительно ставим галочки всем дочерним элементам уже отмеченных папок.
            const setChildrenChecked = (nodes) => {
                for (const node of nodes) {
                    if (node.checked && node.type === 'dir' && node.children) {
                         const recursiveCheck = (n) => {
                            n.checked = true;
                            if (n.children) n.children.forEach(recursiveCheck);
                        };
                        node.children.forEach(recursiveCheck);
                    }
                    if (node.children) {
                        setChildrenChecked(node.children);
                    }
                }
            }
            setChildrenChecked(rawFileTree);
            if (DEBUG_MODE) getAllNodesRecursive(rawFileTree).forEach(n => logNodeState('3. After children propagation', n));

            // 5. Теперь, когда модель данных полностью восстановлена, выполняем всю остальную логику.
            expandIncludedNodes(rawFileTree);
            updateAllParentCheckboxes(rawFileTree);
            if (DEBUG_MODE) getAllNodesRecursive(rawFileTree).forEach(n => logNodeState('4. After updateAllParentCheckboxes', n));
            
            calculateFolderStats(rawFileTree);
            sortTree(rawFileTree);
            renderFileTree(rawFileTree);
            if (DEBUG_MODE) console.log('[END] Восстановление состояния завершено.');
        }
    }
  }
  };

  const showLoader = (show) => {
    document.getElementById('loader').style.display = show ? 'flex' : 'none';
    document.querySelectorAll('button').forEach(btn => btn.disabled = show);
  };

  const switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
  };
  
  const getIconForFile = (fileName) => {
    const ext = '.' + fileName.split('.').pop().toLowerCase();
    return fileIcons[ext] || fileIcons['default'];
  };
  
  const getAllNodesRecursive = (nodes) => {
    let flatList = [];
    for (const node of nodes) {
      flatList.push(node);
      if (node.children) {
        flatList.push(...getAllNodesRecursive(node.children));
      }
    }
    return flatList;
  };
  const syncTreeUI = () => {
    const allNodes = getAllNodesRecursive(rawFileTree);
    for (const node of allNodes) {
      const li = document.querySelector(`li[data-path="${CSS.escape(node.path)}"]`);
      if (li) {
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = node.checked;
          checkbox.indeterminate = node.indeterminate;
        }
      }
    }
  };
  const formatFileCount = (count) => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return t('file_count_many', { count });
    if (lastDigit === 1) return t('file_count_one', { count });
    if (lastDigit >= 2 && lastDigit <= 4) return t('file_count_few', { count });
    return t('file_count_many', { count });
  };
  
const updateTotals = () => {
    let checkedFileCount = 0;
    let totalLines = 0;
    let totalSize = 0;

    const allFileNodes = getAllNodesRecursive(rawFileTree).filter(node => node.type === 'file');

    if (DEBUG_CALCS) console.group(`%cCalculating GRAND TOTAL (updateTotals)`, 'color: red; font-weight: bold');

    allFileNodes.forEach(node => {
        if (node.checked) {
            checkedFileCount++;
            const linesToAdd = node.lines || 0;
            const sizeToAdd = node.size || 0;
            totalLines += linesToAdd;
            totalSize += sizeToAdd;
            if(DEBUG_CALCS) {
                console.log(`- File: ${node.path}, adding lines: %c${linesToAdd}`, 'color: green', `, adding size: %c${sizeToAdd}`, 'color: green');
            }
        }
    });

    if (DEBUG_CALCS) {
        console.log(`-> Grand Total Result: lines=%c${totalLines}`, 'font-weight: bold', `, size=%c${totalSize}`, 'font-weight: bold');
        console.groupEnd();
    }

    // Обновляем счётчик файлов в заголовке
    document.getElementById('file-count').textContent = formatFileCount(checkedFileCount);

    // Обновляем итоговую статистику
    const statsTextEl = document.getElementById('total-stats-text');
    if (totalLines > 0 || totalSize > 0) {
        statsTextEl.textContent = `Итог: ${totalLines.toLocaleString('ru-RU')} строк, ${formatSize(totalSize)}`;
    } else {
         statsTextEl.innerHTML = '&nbsp;';
    }
};

  const expandIncludedNodes = (nodes) => {
    for (const node of nodes) {
        if (node.type === 'dir' && !node.isExcluded) {
            node.collapsed = false;
            if (node.children) {
                expandIncludedNodes(node.children);
            }
        }
    }
  };
const renderFileTree = (nodesToRender) => {
    const container = document.getElementById('file-list-container');
    if (!nodesToRender || nodesToRender.length === 0) {
      container.innerHTML = `<p class="placeholder">${t('files_placeholder')}</p>`;
      document.getElementById('sticky-separator')?.classList.remove('visible');
      updateTotals(); // Обновляем итоги, чтобы сбросить их
      return;
    }

    const createNodeHTML = (node, level, preRenderedChildren = null) => {
        const isDir = node.type === 'dir';
        const icon = isDir ? '📂' : getIconForFile(node.name);
        const canExpand = isDir && node.children && node.children.length > 0;
        const toggleIcon = canExpand ? `<span class="toggle-icon">${node.collapsed ? '[+]' : '[-]'}</span>` : '<span class="toggle-icon"></span>';

        const statsHTML = (node.lines !== undefined && node.size !== undefined) ? `
            <div class="file-stats">
                <span class="stat-lines">
                    ${node.lines === null ? '—' : (node.lines !== undefined ? node.lines.toLocaleString('ru-RU') : '')}
                </span>
                <span class="stat-size">${node.size !== undefined ? formatSize(node.size) : ''}</span>
            </div>
        ` : '';

        let childrenHTML = '';
        if (preRenderedChildren) {
            childrenHTML = `<ul style="${node.collapsed ? 'display: none;' : ''}">${preRenderedChildren}</ul>`;
        } else if (isDir && node.children && node.children.length > 0) {
            childrenHTML = `<ul style="${node.collapsed ? 'display: none;' : ''}">${generateNodeListHTML(node.children, level + 1)}</ul>`;
        }

        const isVisuallyExcluded = node.isExcluded && !node.checked;
        const liClass = `tree-item ${isVisuallyExcluded ? 'is-excluded' : ''} ${node.collapsed ? 'collapsed' : ''}`;
        const checkboxState = node.checked ? 'checked' : '';
        const ext = isDir ? null : (node.ext || '');

        return `<li class="${liClass}" data-path="${node.path}">
            <div class="tree-item-content">
                ${toggleIcon}
                <input type="checkbox" data-path="${node.path}" ${checkboxState}>
                <span class="icon" data-type="${node.type}" data-ext="${ext}">${icon}</span>
                <span class="name">${node.name}</span>
                ${statsHTML}
            </div>
            ${childrenHTML}
        </li>`;
    };

    const generateNodeListHTML = (nodes, level = 0) => {
        // ... остальной код этой вложенной функции НЕ МЕНЯЕТСЯ ...
        if (level === 0 && nodes.length === 1 && nodes[0].type === 'dir') {
            const rootNode = nodes[0];
            const childrenListHTML = generateNodeListHTML(rootNode.children, level + 1);
            return createNodeHTML(rootNode, level, childrenListHTML);
        }
        const firstExcludedIndex = nodes.findIndex(node => node.isExcluded);
        if (firstExcludedIndex < 0) {
            return nodes.map(node => createNodeHTML(node, level)).join('');
        }
        const includedNodes = nodes.slice(0, firstExcludedIndex);
        const excludedNodes = nodes.slice(firstExcludedIndex);
        if (includedNodes.length === 0 || excludedNodes.length === 0) {
            return nodes.map(node => createNodeHTML(node, level)).join('');
        }
        return `
            ${includedNodes.map(node => createNodeHTML(node, level)).join('')}
            <li class="separator-line"></li>
            ${excludedNodes.map(node => createNodeHTML(node, level)).join('')}
        `;
    };

    container.innerHTML = `<ul class="file-tree">${generateNodeListHTML(nodesToRender)}</ul>`;
    const allNodes = (function getAllNodesRecursive(nodes) {
        let flatList = [];
        for (const node of nodes) {
            flatList.push(node);
            if (node.children) {
                flatList.push(...getAllNodesRecursive(node.children));
            }
        }
        return flatList;
    })(nodesToRender);
    allNodes.forEach((node) => {
        const li = container.querySelector(`li[data-path="${CSS.escape(node.path)}"]`);
        if (li) {
            const checkbox = li.querySelector(':scope > .tree-item-content > input[type="checkbox"]');
            if (checkbox) {
                checkbox.indeterminate = node.indeterminate === true;
            }
        }
    });

    updateTotals(); // <-- ВАЖНО: Заменена updateFileCount на updateTotals

    // ... остальной код функции для IntersectionObserver НЕ МЕНЯЕТСЯ ...
    const realSeparator = container.querySelector('.separator-line');
    const stickySeparator = document.getElementById('sticky-separator');
    if (treeObserver) {
        treeObserver.disconnect();
    }
    if (stickySeparator) {
        stickySeparator.classList.remove('visible');
    }
    if (realSeparator && stickySeparator) {
        treeObserver = new IntersectionObserver((entries) => {
          const [entry] = entries;
          stickySeparator.classList.toggle('visible', !entry.isIntersecting);
        }, {
          root: container,
          threshold: [0, 1] 
        });
        treeObserver.observe(realSeparator);
        stickySeparator.onclick = () => {
          container.scrollTo({
            top: realSeparator.offsetTop - container.offsetTop,
            behavior: 'smooth'
          });
        };
    }
};
  
  const toggleAllNodes = (isCollapsed) => {
    if (rawFileTree.length === 0) return;
    const recursiveToggle = (nodes) => {
        for (const node of nodes) {
            if (node.type === 'dir' && !node.isExcluded) {
                node.collapsed = isCollapsed;
                if (node.children) {
                    recursiveToggle(node.children);
                }
            }
        }
    };
    recursiveToggle(rawFileTree);
    renderFileTree(rawFileTree);
  };

   const sortTree = (nodes) => {
    if (!nodes) return;
    nodes.sort((a, b) => {
        // Правило 1: Неактивные (isExcluded) элементы всегда в самом низу.
        if (a.isExcluded !== b.isExcluded) {
            return a.isExcluded ? 1 : -1;
        }

        // Учитываем принудительно включённые пути (forcedPaths)
        // Правило 2: Новые или принудительно добавленные элементы всегда наверху.
        const aIsPriority = (a.isNew ?? false) || forcedPaths.has(a.path);
        const bIsPriority = (b.isNew ?? false) || forcedPaths.has(b.path);

        if (aIsPriority !== bIsPriority) {
            return aIsPriority ? -1 : 1;
        }
        // Конец учета принудительно включённых путей

        // Правило 3: Сортировка по типу (папки, затем файлы).
        if (a.type !== b.type) {
            return a.type === 'dir' ? -1 : 1;
        }

        // Правило 4: Сортировка по имени (в алфавитном порядке).
        return a.name.localeCompare(b.name);
    });

    // После сортировки очищаем временные метки и рекурсивно сортируем дочерние узлы.
    nodes.forEach(node => {
        if (node.isNew) delete node.isNew;
        if (node.children) {
            sortTree(node.children);
        }
    });
};

  const findNodeByPath = (nodes, path) => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };
  const toggleFolder = async (node) => {
    const needsLoading = node.type ==='dir' && node.children.length === 0 && !node.isContentLoaded;
    if (needsLoading) {
      showLoader(true);
      const result = await window.api.getDirectoryTree({ dirPath: node.path });
      if (result.success) {
        node.children = result.tree;
        node.isContentLoaded = true;
        node.collapsed = false;
        applyFiltersAndRender();
      } else {
        alert(`Не удалось загрузить содержимое папки: ${node.path}`);
        node.collapsed = !node.collapsed;
        renderFileTree(rawFileTree);
      }
      showLoader(false);
    } else {
      node.collapsed = !node.collapsed;
      renderFileTree(rawFileTree);
    }
  };

const updateAllParentCheckboxes = (nodes) => {
    const recursiveUpdate = (node) => {
      if (node.type !== 'dir' || !node.children || node.children.length === 0) {
        return node.checked;
      }
	  
      // Больше не фильтруем по isExcluded, 
      // а смотрим на все дочерние элементы, как и должно быть в дереве.
      const childStates = node.children.map(child => recursiveUpdate(child));
      const allChildrenChecked = childStates.every(state => state === true);
      const someChildrenChecked = childStates.some(state => state === true || state === 'indeterminate');

      if (allChildrenChecked) {
        node.checked = true;
        node.indeterminate = false;
        return true;
      } else if (someChildrenChecked) {
        node.checked = false;
        node.indeterminate = true;
        return 'indeterminate';
      } else {
        node.checked = false;
        node.indeterminate = false;
        return false;
      }
    };
    nodes.forEach(recursiveUpdate);
  };
  
  let rawFileTree = [];
  const forcedPaths = new Set();
const applyFiltersAndRender = (options = {}) => {
    const { replace = false, isRestore = false } = options;
    const excludeNodeModules = document.getElementById('excludeNodeModules').checked;
    const excludeUserData = document.getElementById('excludeUserData').checked;
    const ignorePatterns = document.getElementById('ignorePatterns').value.split(',').map(p => p.trim()).filter(Boolean);
    const validExtensions = document.getElementById('validExtensions').value.split(',').map(p => p.trim()).filter(Boolean);
    const processNode = (node, isParentExcluded = false, parentForced = false) => {
        const forced = forcedPaths.has(node.path);
        const isIgnoredByName = ignorePatterns.some(pattern => pattern && node.name === pattern);
        const isNodeModulesFolder = excludeNodeModules && node.name === 'node_modules';
        const isUserDataFolder = excludeUserData && node.name === 'user-data';
        const isInvalidExtension = node.type === 'file' && !validExtensions.includes(node.ext);
        node.isExcluded = forced ? false : (isParentExcluded || isIgnoredByName || isNodeModulesFolder || isUserDataFolder || isInvalidExtension);
        
        node.indeterminate = false;

        if (node.children) {
            const childForced = forced || (node.type === 'dir' && forcedPaths.has(node.path));
            node.children.forEach(child => processNode(child, node.isExcluded, childForced));
        }
    };

    rawFileTree.forEach(node => processNode(node, false, forcedPaths.has(node.path)));
    
    // В режиме восстановления останавливаемся здесь.
    // Всю последующую логику будет выполнять функция init после восстановления галочек.
    if (isRestore) {
        return;
    }
    
    // Этот блок выполняется только при «живых» изменениях (не при запуске)
    if (!options.isRestore) {
        getAllNodesRecursive(rawFileTree).forEach(node => {
            if (node.isNew) {
                node.checked = !node.isExcluded;
            }
        });
    }

    expandIncludedNodes(rawFileTree);
    updateAllParentCheckboxes(rawFileTree);
    calculateFolderStats(rawFileTree);
    sortTree(rawFileTree);
    renderFileTree(rawFileTree);
  };

const updateTreeState = async (path, isChecked) => {
    const node = findNodeByPath(rawFileTree, path);
    if (!node) return;
        // --- Анализ по требованию ---
    if (isChecked) {
        const nodesToAnalyze = getAllNodesRecursive([node]).filter(n => n.type === 'file' && n.lines === undefined);
        const pathsToAnalyze = nodesToAnalyze.map(n => n.path);

        if (pathsToAnalyze.length > 0) {
            showLoader(true);
            try {
                const stats = await window.api.analyzeFiles(pathsToAnalyze);
                const statsMap = new Map(stats.map(s => [s.path, s]));

                nodesToAnalyze.forEach(n => {
                    const stat = statsMap.get(n.path);
                    if (stat) {
                        n.lines = stat.lines;
                        n.size = stat.size;
                    }
                });
            } finally {
                showLoader(false);
            }
        }
    }
    const updateChildrenRecursive = (n) => {
      n.checked = isChecked;
      n.indeterminate = false;
      if (n.children) n.children.forEach(updateChildrenRecursive);
    };
    updateChildrenRecursive(node);
    updateAllParentCheckboxes(rawFileTree);
    calculateFolderStats(rawFileTree); 
    renderFileTree(rawFileTree); 
    updateTotals();

    // Сохраняем все отмеченные пути (и файлы, и папки)
    const checkedPaths = getAllNodesRecursive(rawFileTree)
      .filter(n => n.checked) // Просто n.checked, без проверки на тип
      .map(n => n.path);
    window.api.setConfig({ key: 'merge.checkedPaths', value: checkedPaths });
};

const processSelectedPaths = async (paths, options = {}) => {
    const { replace = false, forceInclude = false, isRestore = false } = options;
    showLoader(true);
    
    if (replace) {
        rawFileTree = [];
        forcedPaths.clear();
    }

    // Любой путь, переданный в эту функцию (выбранный вручную),
    // --- теперь будет добавлен в список принудительного включения.
    // --- Это гарантирует, что даже если пользователь выберет саму папку node_modules,
    // --- она будет добавлена с галочкой.
    paths.forEach(p => forcedPaths.add(p));
    // Старая опция `forceInclude` теперь фактически не нужна, но мы оставим её для совместимости.

    const removeNodeByPath = (nodes, pathToRemove) => {
        const index = nodes.findIndex(node => node.path === pathToRemove);
        if (index !== -1) {
            nodes.splice(index, 1);
            return true;
        }
        for (const node of nodes) {
            if (node.children && removeNodeByPath(node.children, pathToRemove)) {
                return true;
            }
        }
        return false;
    };

    const newNodes = [];
    for (const p of paths) {
      if (!replace && findNodeByPath(rawFileTree, p)) {
          removeNodeByPath(rawFileTree, p);
      }

      const isDirectory = await window.api.isDirectory(p);
      if (isDirectory) {
        const result = await window.api.getDirectoryTree({ dirPath: p });
        if (result.success) {
          const rootNode = { name: p.split(/[\\/]/).pop(), path: p, type: 'dir', children: result.tree, checked: true, collapsed: false };
          newNodes.push(rootNode);
        }
      } else {
        const ext = '.' + p.split('.').pop().toLowerCase();
        newNodes.push({ name: p.split(/[\\/]/).pop(), path: p, type: 'file', children: [], ext: ext, checked: true });
      }
    }

    if (!isRestore) {
        const markAsNew = (nodes) => {
            for (const node of nodes) {
                node.isNew = true;
                if (node.children) {
                    markAsNew(node.children);
                }
            }
        };
        markAsNew(newNodes);
    }

    if (replace) {
        rawFileTree = newNodes;
    } else {
        rawFileTree.unshift(...newNodes);
    }

    const allFileNodes = getAllNodesRecursive(rawFileTree).filter(node => node.type === 'file' && node.lines === undefined);
    const pathsToAnalyze = allFileNodes.map(node => node.path);

    if (pathsToAnalyze.length > 0) {
        const stats = await window.api.analyzeFiles(pathsToAnalyze);
        const statsMap = new Map(stats.map(s => [s.path, s]));

        allFileNodes.forEach(node => {
            const stat = statsMap.get(node.path);
            if (stat) {
                node.lines = stat.lines;
                node.size = stat.size;
            }
        });
    }
    
    applyFiltersAndRender(options);
    showLoader(false);

    window.api.setConfig({ key: 'merge.lastUsedPaths', value: rawFileTree.map(node => node.path) });
    window.api.setConfig({ key: 'merge.forcedPaths', value: Array.from(forcedPaths) });

    if (!isRestore) {
        const checkedPaths = getAllNodesRecursive(rawFileTree)
            .filter(n => n.checked)
            .map(n => n.path);
        window.api.setConfig({ key: 'merge.checkedPaths', value: checkedPaths });
    }
};
  
  init();

  // Поиск в дереве на вкладке "Сборка"

const toggleMergeSearch = (forceClose = false) => {
    const searchContainer = document.getElementById('merge-search-container');
    const searchInput = document.getElementById('merge-search-input');

    if (forceClose || searchContainer.style.display === 'flex') {
        searchContainer.style.display = 'none';
        clearSearchHighlight();
    } else {
        searchContainer.style.display = 'flex';
        searchInput.focus();
        searchInput.select();
        handleSearchInTree(true, true); // Запускаем поиск при открытии
    }
};

const clearSearchHighlight = () => {
    document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight');
    });
};

const handleSearchInTree = (forward, fromStart = false) => {
    const query = document.getElementById('merge-search-input').value.toLowerCase();
    if (!query) {
        clearSearchHighlight();
        return;
    }

    // При новом поиске обновляем список результатов
    if (fromStart || searchResults.length === 0) {
        searchResults = getAllNodesRecursive(rawFileTree).filter(node => node.name.toLowerCase().includes(query));
        currentSearchIndex = -1;
    }

    if (searchResults.length === 0) return;

    clearSearchHighlight();

    if (forward) {
        currentSearchIndex++;
        if (currentSearchIndex >= searchResults.length) {
            currentSearchIndex = 0; // Переход по кругу
        }
    } else {
        currentSearchIndex--;
        if (currentSearchIndex < 0) {
            currentSearchIndex = searchResults.length - 1; // Переход по кругу
        }
    }

    const targetNode = searchResults[currentSearchIndex];
    if (targetNode) {
        const nodeElement = document.querySelector(`li.tree-item[data-path="${CSS.escape(targetNode.path)}"]`);
        if (nodeElement) {
            const nameSpan = nodeElement.querySelector(':scope > .tree-item-content > .name');
            nameSpan.classList.add('search-highlight');
            nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
};

// Конец поиска в дереве на вкладке "Сборка"

// Привязываем кнопки панели поиска на вкладке "Сборка"
(() => {
    const prevBtn = document.getElementById('merge-search-prev');
    const nextBtn = document.getElementById('merge-search-next');
    const closeBtn = document.getElementById('merge-search-close');
    const searchContainer = document.getElementById('merge-search-container');

    if (prevBtn && !prevBtn.dataset.bound) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSearchInTree(false);
        });
        prevBtn.dataset.bound = '1';
    }

    if (nextBtn && !nextBtn.dataset.bound) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSearchInTree(true);
        });
        nextBtn.dataset.bound = '1';
    }

    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMergeSearch(true);
        });
        closeBtn.dataset.bound = '1';
    }

    // Не прокручивать body, когда колесо крутят над панелью поиска
    if (searchContainer && !searchContainer.dataset.wheelBound) {
        const wheelHandler = (e) => {
            e.preventDefault();
            const list = document.getElementById('file-list-container');
            if (list) list.scrollTop += e.deltaY;
        };
        searchContainer.addEventListener('wheel', wheelHandler, { passive: false });
        searchContainer.dataset.wheelBound = '1';
    }
})();

});