// Управляет всем, что связано с просмотрщиком кода

import {EditorState, EditorView, basicSetup, javascript, oneDark, Compartment, openSearchPanel, closeSearchPanel, panelConfig} from './codemirror-bundle.js';
let phrases = {};

const themeCompartment = new Compartment();

let searchPanelContainer = null;

let currentTheme = 'dark';
const createEditor = (parent, doc, onChange) => {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        javascript(),
        themeCompartment.of(currentTheme === 'dark' ? oneDark : []),
        EditorState.phrases.of(phrases),
        EditorView.updateListener.of((v) => {
          if (v.docChanged && typeof onChange === 'function') {
      onChange(v.state.doc.toString());
          }
        }),
        panelConfig.of({ bottomContainer: searchPanelContainer })
      ]
    }),
    parent
  });
};

const CodeViewer = {
  t: (str) => str,
  
  elements: {
    container: null, header: null, filePath: null, content: null,
    prevBtn: null, nextBtn: null, dropZone: null, selectFileBtn: null,
	selectNewFileBtn: null,
    toggleModeBtn: null,
    searchBtn: null,
    windowBtn: null,
    fullscreenBtn: null,
    panel: null,
    panelList: null,
    togglePanelBtn: null
  },

  state: {
    files: [],
    currentFileIndex: -1,
    viewMode: 'all',
    fileObserver: null,
    editors: [],
    currentEditor: null,
    theme: 'dark',
    searchAll: false,
    searchPanelOpen: false,
    searchQuery: '',
    isFullscreen: false,
    isFullWindow: false,
    escClosedSearch: false,
    isPanelVisible: true,
    panelPositions: {
      fullwindow: { top: 10, left: null }, // Используем left, null означает "авто" (позиция по right из CSS)
      fullscreen: { top: 10, left: null }
    },
    navigationTimeout: null // Возвращаем свойство для таймера
  },

  onFileDroppedOrSelected: null,

  async init(options) {
    currentTheme = options.theme || 'dark';
    this.state.theme = currentTheme;
    this.state.searchAll = options.searchAll || false;
     // Устанавливаем начальное состояние видимости панели из опций, по умолчанию true
    this.state.isPanelVisible = options.isPanelVisible !== false; 

     // Загружаем сохраненные позиции панели, если они есть
    const savedPositions = await window.api.getConfig('split.panelPositions');
    if (savedPositions) {
      this.state.panelPositions = { ...this.state.panelPositions, ...savedPositions };
    }

    this.elements.container = document.getElementById('viewer-container');
    this.elements.header = document.getElementById('viewer-header');
    this.elements.filePath = document.getElementById('viewer-file-path');
    this.elements.content = document.getElementById('viewer-content');
    this.elements.prevBtn = document.getElementById('viewer-prev-btn');
    this.elements.nextBtn = document.getElementById('viewer-next-btn');
    this.elements.dropZone = document.getElementById('viewer-drop-zone');
    this.elements.selectFileBtn = document.getElementById('selectSplitFileBtn');
    this.elements.selectNewFileBtn = document.getElementById('selectNewFileBtn');
    this.elements.toggleModeBtn = document.getElementById('viewer-toggle-mode-btn');
    this.elements.searchBtn = document.getElementById('viewer-search-btn');
    this.elements.windowBtn = document.getElementById('viewer-window-btn');
    this.elements.fullscreenBtn = document.getElementById('viewer-fullscreen-btn');
    // Инициализация элементов панели
    this.elements.panel = document.getElementById('viewer-file-panel');
    this.elements.panelList = document.getElementById('viewer-file-panel-list');
    this.elements.togglePanelBtn = document.getElementById('viewer-toggle-panel-btn');
    searchPanelContainer = document.getElementById('viewer-search-container');

    this.onFileDroppedOrSelected = options.onFileDroppedOrSelected;
    this.addEventListeners();

    this.updateFullscreenButton(false);
    this.updateFullWindowButton(false);
    // Применяем состояние видимости панели по умолчанию
    this.updateFilePanel(this.state.isPanelVisible);
    this.updatePanelAndButtonVisibility();

    console.log('CodeViewer initialized!');
  },

  addEventListeners() {
    this.elements.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); this.elements.dropZone.classList.add('drag-over'); });
    this.elements.dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); this.elements.dropZone.classList.remove('drag-over'); });
    this.elements.dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation(); this.elements.dropZone.classList.remove('drag-over');
      if (this.onFileDroppedOrSelected) this.onFileDroppedOrSelected(e.dataTransfer.files);
    });
    this.elements.selectNewFileBtn.addEventListener('click', () => {
      if (this.onFileDroppedOrSelected) this.onFileDroppedOrSelected(null);
    });
    this.elements.selectFileBtn.addEventListener('click', () => {
         if (this.onFileDroppedOrSelected) this.onFileDroppedOrSelected(null);
    });
    this.elements.prevBtn.addEventListener('click', () => this.prevFile());
    this.elements.nextBtn.addEventListener('click', () => this.nextFile());
    this.elements.toggleModeBtn.addEventListener('click', () => this.toggleViewMode());
    this.elements.searchBtn.addEventListener('click', () => this.openSearch());
    this.elements.windowBtn.addEventListener('click', () => this.toggleFullWindow());
    this.elements.fullscreenBtn.addEventListener('click', () => this.toggleFullScreen());
    this.elements.togglePanelBtn.addEventListener('click', () => this.toggleFilePanel()); // Обработчик для кнопки переключения панели
    this.elements.panel.addEventListener('mousedown', (e) => this.handlePanelMouseDown(e));

    document.addEventListener('keydown', (e) => {
      // Обрабатываем горячие клавиши только когда активна вкладка "Разборка"
      const splitActive = document.getElementById('split-tab')?.classList.contains('active');
      if (!splitActive) return;
      if (e.defaultPrevented) return;
      // Ctrl+F обрабатывается централизованно в script.js для исключения конфликтов
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        this.toggleFullScreen();
        return;
      }
      if (e.key === 'Escape') {
        if (this.state.searchPanelOpen) {
          if (this.state.isFullscreen) this.state.escClosedSearch = true;
          e.preventDefault();
       e.stopImmediatePropagation();
          this.closeSearch();
          return;
        }
        if (this.state.isFullscreen) {
          e.preventDefault();
          this.toggleFullScreen();
          return;
        }
        if (this.state.isFullWindow) {
          e.preventDefault();
           this.toggleFullWindow();
        }
      }
    }, true);
    document.addEventListener('fullscreenchange', () => {
      const isFull = document.fullscreenElement === this.elements.container;
      this.updateFullscreenButton(isFull);
      if (!isFull) {
        if (this.state.searchPanelOpen) {
          this.closeSearch();
          this.state.escClosedSearch = false;
          this.toggleFullScreen();
        } else if (this.state.escClosedSearch) {
          this.state.escClosedSearch = false;
      this.toggleFullScreen();
        }
      }
    });
    this.elements.content.addEventListener('scroll', () => {
        if (this.state.viewMode === 'single' && this.state.currentFileIndex !== -1) {
            const file = this.state.files[this.state.currentFileIndex];
            if (file) {
                file.scrollPosition = this.elements.content.scrollTop;
            }
        }
    });
  },

  updateFilePanel(isVisible) {
    this.state.isPanelVisible = isVisible;
    this.elements.container.classList.toggle('panel-hidden', !isVisible);
  },

  toggleFilePanel() {
      const newState = !this.state.isPanelVisible;
      this.updateFilePanel(newState);
      window.api.setConfig({ key: 'split.isPanelVisible', value: newState });
  },

  renderFilePanel() {
      if (!this.elements.panelList) return;
      this.elements.panelList.innerHTML = '';
      this.state.files.forEach(file => {
          const li = document.createElement('li');
          // Используем имя файла, а не полный путь для краткости
          const fileName = file.path.split(/[\\/]/).pop();
          li.textContent = fileName;
          li.dataset.path = file.path;
          li.title = file.path; // Полный путь во всплывающей подсказке
          li.addEventListener('click', () => this.navigateTo(file.path));
          this.elements.panelList.appendChild(li);
      });
  },
  
  updateActiveHighlight(filePath) {
    // Подсветка в основном дереве файлов на вкладке
    const activeTreeItems = document.querySelectorAll('#split-file-list-container .is-active');
    activeTreeItems.forEach(item => item.classList.remove('is-active'));

    if (filePath) {
        const newActiveTreeItem = document.querySelector(`#split-file-list-container .tree-item[data-path="${CSS.escape(filePath)}"]`);
        if (newActiveTreeItem) {
            newActiveTreeItem.classList.add('is-active');
        }
    }

    // Подсветка в плавающей панели
    if (!this.elements.panelList) return;
    
    const activePanelItems = this.elements.panelList.querySelectorAll('.is-active');
    activePanelItems.forEach(item => item.classList.remove('is-active'));

    if (filePath) {
        const newActivePanelItem = this.elements.panelList.querySelector(`li[data-path="${CSS.escape(filePath)}"]`);
        if (newActivePanelItem) {
            newActivePanelItem.classList.add('is-active');
            newActivePanelItem.scrollIntoView({ block: 'nearest', inline: 'start' });
        }
    }
  },
  
  toggleViewMode() {
    this.state.viewMode = this.state.viewMode === 'single' ? 'all' : 'single';
    this.loadContent();
    if (this.state.searchPanelOpen) {
      this.openSearch();
    }
  },

  loadContent(parsedFiles) {
    const reopenSearch = this.state.searchPanelOpen;
    if (reopenSearch) this.closeSearch();
    this.updateActiveHighlight(null);
    this.state.editors.forEach(ed => ed.destroy());
    this.state.editors = [];
    if (this.state.currentEditor) {
      this.state.currentEditor.destroy();
      this.state.currentEditor = null;
    }
      if (parsedFiles) {
          this.state.files = parsedFiles
              .filter(f => f.type === 'file')
              .map(f => ({ ...f, scrollPosition: 0 }));
      }
  
      if (this.state.files.length > 0) {
          this.elements.dropZone.style.display = 'none';
          this.elements.container.style.display = 'flex';
           // Отрисовываем панель
          this.renderFilePanel();
  
          if (this.state.fileObserver) this.state.fileObserver.disconnect();
  
          if (this.state.viewMode === 'all') {
              this.renderAllFiles();
          } else {
              this.showFile(this.state.currentFileIndex >= 0 ? this.state.currentFileIndex : 0);
          }
      } else {
          this.elements.dropZone.style.display = 'block';
          this.elements.container.style.display = 'none';
      }
      this.updateHeaderUI();
      if (reopenSearch) {
        this.state.searchPanelOpen = true;
        this.openSearch();
      }
  },

  updatePanelAndButtonVisibility() {
    const mode = this.state.isFullscreen ? 'fullscreen' : (this.state.isFullWindow ? 'fullwindow' : null);
    const inImmersiveMode = !!mode;

    this.elements.togglePanelBtn.style.display = inImmersiveMode ? 'block' : 'none';

    if (!inImmersiveMode) {
      this.elements.panel.style.display = 'none';
    } else {
      this.elements.panel.style.display = 'block';
      this.updateFilePanel(this.state.isPanelVisible);

      // Применяем и корректируем позицию
      let { top, left } = this.state.panelPositions[mode];
      
      const panelW = this.elements.panel.offsetWidth;
      const panelH = this.elements.panel.offsetHeight;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      
      // Если left не задан (null), считаем его от правого края, как в CSS
      if (left === null) {
        left = viewportW - panelW - 10; // 10px - отступ по умолчанию
      }

      // Коррекция, чтобы панель не уходила за пределы экрана
      if (top < 0) top = 0;
      if (left < 0) left = 0;
      if (top + panelH > viewportH) top = viewportH - panelH;
      if (left + panelW > viewportW) left = viewportW - panelW;
      
      this.elements.panel.style.top = `${top}px`;
      this.elements.panel.style.left = `${left}px`;
      this.elements.panel.style.right = 'auto';
    }
  },

  // Функции перетаскивания панели
  handlePanelMouseDown(e) {
    // Игнорируем клики не левой кнопкой мыши или по полосе прокрутки
    if (e.button !== 0 || e.target.closest('#viewer-file-panel-list') !== this.elements.panelList) return;

    this.elements.panel.style.transition = 'none'; // Отключаем анимацию на время перетаскивания

    const initialMouseX = e.clientX;
    const initialMouseY = e.clientY;
    const initialPanelLeft = this.elements.panel.offsetLeft;
    const initialPanelTop = this.elements.panel.offsetTop;

    const handleDrag = (moveEvent) => {
      const deltaX = moveEvent.clientX - initialMouseX;
      const deltaY = moveEvent.clientY - initialMouseY;
      this.elements.panel.style.left = `${initialPanelLeft + deltaX}px`;
      this.elements.panel.style.top = `${initialPanelTop + deltaY}px`;
      this.elements.panel.style.right = 'auto'; // Отменяем позиционирование по right из CSS
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleMouseUp);
      this.elements.panel.style.transition = ''; // Возвращаем анимацию

      const mode = this.state.isFullscreen ? 'fullscreen' : (this.state.isFullWindow ? 'fullwindow' : null);
      if (mode) {
        this.state.panelPositions[mode] = {
          top: this.elements.panel.offsetTop,
          left: this.elements.panel.offsetLeft,
        };
        window.api.setConfig({ key: 'split.panelPositions', value: this.state.panelPositions });
      }
    };

    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleMouseUp);
  },
  

  renderAllFiles() {
    this.elements.content.innerHTML = '';
    this.state.files.forEach(file => {
        const block = document.createElement('div');
        block.className = 'viewer-file-block';
        block.dataset.path = file.path;

        const header = document.createElement('div');
        header.className = 'viewer-file-block-header';
        header.textContent = `//======= FILE: ${file.path} =======`;
        block.appendChild(header);

        const editorWrap = document.createElement('div');
        block.appendChild(editorWrap);

        const view = createEditor(editorWrap, file.content, c => file.content = c);
        this.state.editors.push(view);
        if (this.state.editors.length === 1) view.focus();

        this.elements.content.appendChild(block);
    });
    this.elements.content.scrollTop = 0;

    const observerOptions = {
      root: this.elements.content,
      rootMargin: "0px 0px -98% 0px",
      threshold: 0
    };
    this.state.fileObserver = new IntersectionObserver((entries) => {
            
      const intersectingEntry = entries.find(entry => entry.isIntersecting);
      if (intersectingEntry) {
        const filePath = intersectingEntry.target.dataset.path;
        console.log(`[ОБНОВЛЕНИЕ] Observer зафиксировал наверху файл: ${filePath}`);
        if (this.state.viewMode === 'all') {
            this.elements.filePath.textContent = filePath;
            this.elements.filePath.title = filePath;
            this.updateActiveHighlight(filePath);
            this.updateNavButtons();
        }
      }
    }, observerOptions);
    const fileBlocks = this.elements.content.querySelectorAll('.viewer-file-block');
    fileBlocks.forEach(block => this.state.fileObserver.observe(block));
    if (fileBlocks.length > 0) {
      const firstPath = fileBlocks[0].dataset.path;
      this.elements.filePath.textContent = firstPath;
      this.elements.filePath.title = firstPath;
      this.updateActiveHighlight(firstPath);
      this.updateNavButtons();
    }
    this.elements.content.focus();
    if (this.state.searchPanelOpen) {
      this.openSearch();
    }
  },

  showFile(index) {
    console.log('Switching to file index:', index, 'path:', this.state.files[index]?.path);
    if (index < 0 || index >= this.state.files.length) return;
      const reopenSearch = this.state.searchPanelOpen;
      if (reopenSearch) this.closeSearch();
      this.state.currentFileIndex = index;
      const file = this.state.files[index];

      this.elements.filePath.textContent = file.path;
      this.elements.filePath.title = file.path;
      this.updateActiveHighlight(file.path);

      this.elements.content.innerHTML = '';

      if (this.state.currentEditor) {
          this.state.currentEditor.destroy();
          this.state.currentEditor = null;
      }

      const editorWrap = document.createElement('div');
      this.elements.content.appendChild(editorWrap);
      const view = createEditor(editorWrap, file.content, c => file.content = c);
      this.state.currentEditor = view;
      if (file.scrollPosition) {
          view.scrollDOM.scrollTop = file.scrollPosition;
      }
      view.scrollDOM.addEventListener('scroll', () => {
          file.scrollPosition = view.scrollDOM.scrollTop;
      });
      view.focus();
      this.updateHeaderUI();
      if (reopenSearch) {
        this.state.searchPanelOpen = true;
        this.openSearch();
      }
  },

  updateHeaderUI() {
      if (this.state.viewMode === 'all') {
          this.elements.prevBtn.style.display = 'block';
          this.elements.nextBtn.style.display = 'block';
          this.elements.toggleModeBtn.textContent = '📄';
          this.elements.toggleModeBtn.title = 'Переключить в режим одного файла';
          this.updateNavButtons();
      } else {
          this.elements.prevBtn.style.display = 'block';
          this.elements.nextBtn.style.display = 'block';
          this.elements.toggleModeBtn.textContent = '📚';
          this.elements.toggleModeBtn.title = 'Переключить в режим потока';
          this.updateNavButtons();
          const file = this.state.files[this.state.currentFileIndex];
          if(file) this.elements.filePath.textContent = file.path;
      }
  },

  updateNavButtons() {
    if (this.state.viewMode === 'single') {
      this.elements.prevBtn.disabled = this.state.currentFileIndex <= 0;
      this.elements.nextBtn.disabled = this.state.currentFileIndex >= this.state.files.length - 1;
    } else {
      const currentPath = this.elements.filePath.textContent;
      const blocks = Array.from(this.elements.content.querySelectorAll('.viewer-file-block'));
      const currentIndex = blocks.findIndex(b => b.dataset.path === currentPath);
      this.elements.prevBtn.disabled = currentIndex <= 0;
      this.elements.nextBtn.disabled = currentIndex === -1 || currentIndex >= blocks.length - 1;
    }
  },

  prevFile() {
    if (this.state.viewMode === 'all') {
      this.scrollToPrevFile();
    } else {
      this.showFile(this.state.currentFileIndex - 1);
    }
  },
  nextFile() {
    if (this.state.viewMode === 'all') {
      this.scrollToNextFile();
    } else {
      this.showFile(this.state.currentFileIndex + 1);
    }
  },

  scrollToPrevFile() {
    const currentPath = this.elements.filePath.textContent;
    const currentBlock = this.elements.content.querySelector(`.viewer-file-block[data-path="${CSS.escape(currentPath)}"]`);
    if (currentBlock && currentBlock.previousElementSibling) {
        this.navigateTo(currentBlock.previousElementSibling.dataset.path);
    }
  },

  scrollToNextFile() {
    const currentPath = this.elements.filePath.textContent;
    const currentBlock = this.elements.content.querySelector(`.viewer-file-block[data-path="${CSS.escape(currentPath)}"]`);
    let nextBlock = currentBlock ? currentBlock.nextElementSibling : null;
    while(nextBlock && !nextBlock.matches('.viewer-file-block')) {
        nextBlock = nextBlock.nextElementSibling;
    }

    if (nextBlock) {
        this.navigateTo(nextBlock.dataset.path);
    }
  },

  navigateTo(filePath) {
    console.log(`[НАВИГАЦИЯ] Вызван переход к файлу: ${filePath}`);
    this.updateActiveHighlight(filePath);

    const fileBlock = this.elements.content.querySelector(`.viewer-file-block[data-path="${CSS.escape(filePath)}"]`);

    if (this.state.viewMode === 'all' && fileBlock) {
      if (this.state.navigationTimeout) {
        clearTimeout(this.state.navigationTimeout);
      }

      const content = this.elements.content;
      const computeTargetTop = () => {
        const contentRect = content.getBoundingClientRect();
        const blockRect = fileBlock.getBoundingClientRect();
        return blockRect.top - contentRect.top + content.scrollTop;
      };

      const scrollToTarget = () => {
        const top = computeTargetTop();
        content.scrollTo({ top, behavior: 'smooth' });
      };

      // Запускаем плавную прокрутку у самого контейнера
      scrollToTarget();

      const targetLine = fileBlock.offsetTop;
      console.log(`[НАВИГАЦИЯ] Цель: ${filePath} (примерная позиция: ${targetLine}px).`);

      this.state.navigationTimeout = setTimeout(() => {
        // Первая фиксация после завершения анимации
        const finalTop1 = computeTargetTop();
        content.scrollTo({ top: finalTop1, behavior: 'auto' });

        // Вторая фиксация на следующий кадр на случай позднего перерасчёта высот
        requestAnimationFrame(() => {
          const finalTop2 = computeTargetTop();
          content.scrollTo({ top: finalTop2, behavior: 'auto' });

          this.elements.filePath.textContent = filePath;
          this.elements.filePath.title = filePath;
          this.updateNavButtons();
          this.state.navigationTimeout = null;
          console.log(`[НАВИГАЦИЯ ЗАВЕРШЕНА] Состояние интерфейса установлено на: ${filePath}`);
        });
      }, 600);

    } else if (this.state.viewMode === 'single') {
      const fileIndex = this.state.files.findIndex(f => f.path === filePath);
      if (fileIndex !== -1) {
        this.showFile(fileIndex);
      }
    }
  },

  openSearch() {
    console.log('Opening search panel, mode:', this.state.viewMode, 'current file:', this.elements.filePath.textContent);

    // Если уже открыто — воспринимаем повторный вызов как закрытие
    if (this.state.searchPanelOpen) {
      this.closeSearch();
      return;
    }

    // Закрываем панели в редакторах на всякий случай
    this.state.editors.forEach(ed => closeSearchPanel(ed));
    if (this.state.currentEditor) closeSearchPanel(this.state.currentEditor);

    // Удаляем возможные залипшие/дублирующиеся панели из контейнера
    const stalePanels = searchPanelContainer.querySelectorAll('.cm-search');
    stalePanels.forEach(p => p.remove());

    let view = null;
    if (this.state.viewMode === 'single') {
      view = this.state.currentEditor;
    } else {
      const currentPath = this.elements.filePath.textContent;
      const idx = this.state.files.findIndex(f => f.path === currentPath);
      if (idx !== -1) view = this.state.editors[idx];
    }
    if (view) {
      openSearchPanel(view);
      this.state.searchPanelOpen = true;
      setTimeout(() => this.patchSearchPanel(view), 0);
    }
  },

  closeSearch() {
    console.log('Closing search panel');
    this.state.editors.forEach(ed => closeSearchPanel(ed));
    if (this.state.currentEditor) closeSearchPanel(this.state.currentEditor);

    // Удаляем панель(и) из контейнера, если остались
    const panels = searchPanelContainer.querySelectorAll('.cm-search');
    panels.forEach(p => p.remove());

    this.state.searchPanelOpen = false;
  },

  patchSearchPanel(view, attempt = 0) {
    const panel = searchPanelContainer.querySelector('.cm-search');
    if (!panel) {
      if (attempt < 10) {
        setTimeout(() => this.patchSearchPanel(view, attempt + 1), 50);
      }
      return;
    }

    const wordLabel = panel.querySelector('input[name="word"]')?.parentElement;
    if (!wordLabel) {
      if (attempt < 10) {
        setTimeout(() => this.patchSearchPanel(view, attempt + 1), 50);
      }
      return;
    }

    if (!panel.dataset.extraAdded) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.state.searchAll;
      cb.addEventListener('change', () => {
        this.state.searchAll = cb.checked;
        window.api.setConfig({ key: 'split.searchAllFiles', value: cb.checked });
      });
      label.append(cb, ' ', this.t('search_all_files_label'));
      wordLabel.insertAdjacentElement('afterend', label);
      panel.dataset.extraAdded = '1';

      const input = panel.querySelector('[main-field]');
      if (input) {
        input.addEventListener('input', () => {
          this.state.searchQuery = input.value;
        });
      }
      panel.addEventListener('click', (e) => {
        if (e.target.name === 'next' || e.target.name === 'prev') {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.searchStep(e.target.name === 'next');
        }
      }, true);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'F3' || (e.key.toLowerCase() === 'g' && e.metaKey)) {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.searchStep(!e.shiftKey);
        }
        if (e.key === 'Enter') {
          e.stopImmediatePropagation();
          e.preventDefault();
           this.searchStep(true);
        }
        if (e.key === 'Escape') {
          if (this.state.isFullscreen) this.state.escClosedSearch = true;
          e.stopImmediatePropagation();
          e.preventDefault();
          this.closeSearch();
        }
      }, true);
      const closeBtn = panel.querySelector('button[name="close"]');
      if (closeBtn && !closeBtn.dataset.closeHandled) {
        closeBtn.addEventListener('click', () => this.closeSearch());
        closeBtn.dataset.closeHandled = '1';
      }
    }
    if (panel.parentNode !== searchPanelContainer) {
      searchPanelContainer.appendChild(panel);
    }
    const input = panel.querySelector('[main-field]');
    if (input) {
      input.value = this.state.searchQuery;
      input.dispatchEvent(new Event('input'));
      input.focus();
      input.select();
    }
  },

  searchStep(forward) {
    let view = null;
    let currentFileIndexInState = -1;
  
    if (this.state.viewMode === 'single') {
      view = this.state.currentEditor;
      currentFileIndexInState = this.state.currentFileIndex;
    } else {
      const currentPath = this.elements.filePath.textContent;
      currentFileIndexInState = this.state.files.findIndex(f => f.path === currentPath);
      if (currentFileIndexInState !== -1) {
        view = this.state.editors[currentFileIndexInState];
      }
    }
  
    if (!view) {
      console.error("Не удалось определить активный редактор для поиска.");
      return;
    }
  
    const panel = searchPanelContainer.querySelector('.cm-search');
    if (!panel) return;
    const input = panel.querySelector('[main-field]');
    const query = (input ? input.value : this.state.searchQuery) || '';
    this.state.searchQuery = query;
    if (!query) return;
  
    console.log('Шаг поиска:', forward ? 'вперед' : 'назад', `| Запрос: "${query}"`, `| В файле: ${this.elements.filePath.textContent}`);
    const text = view.state.doc.toString();
    const pos = view.state.selection.main[forward ? 'to' : 'from'];
    const searchText = query.toLowerCase();
    const hay = text.toLowerCase();
    let index = forward ? hay.indexOf(searchText, pos) : hay.lastIndexOf(searchText, pos - 1);
  
    if (index !== -1) {
      const foundText = text.substring(index, index + query.length);
      console.log(`✅ Найдено в текущем файле '${this.elements.filePath.textContent}': '${foundText}' на позиции ${index}`);
      view.dispatch({ selection: { anchor: index, head: index + query.length }, scrollIntoView: true });
    } else if (this.state.searchAll) {
      const step = forward ? 1 : -1;
      let idx = currentFileIndexInState + step;
  
      while (idx >= 0 && idx < this.state.files.length) {
        const f = this.state.files[idx];
        const haystack = f.content.toLowerCase();
        const pos2 = forward ? haystack.indexOf(searchText) : haystack.lastIndexOf(searchText);
  
        if (pos2 !== -1) {
          const foundText = f.content.substring(pos2, pos2 + query.length);
          console.log(`✅ Найдено совпадение в ДРУГОМ файле '${f.path}': '${foundText}' на позиции ${pos2}`);
  
          if (this.state.viewMode === 'all') {
              this.navigateTo(f.path);
          } else {
              this.showFile(idx);
          }
          
          setTimeout(() => {
              const newView = this.state.viewMode === 'single' ? this.state.currentEditor : this.state.editors[idx];
              if (newView) {
                 newView.dispatch({ selection: { anchor: pos2, head: pos2 + query.length }, scrollIntoView: true });
              }
          }, 100);
  
          return;
        }
        
        idx += step;
      }
      console.log("Больше совпадений не найдено.");
    }
  },

  setTheme(theme) {
    if (this.state.theme === theme) return;
    this.state.theme = theme;
    currentTheme = theme;
    const ext = theme === 'dark' ? oneDark : [];
    const effect = themeCompartment.reconfigure(ext);
    this.state.editors.forEach(v => v.dispatch({ effects: effect }));
    if (this.state.currentEditor) this.state.currentEditor.dispatch({ effects: effect });
    document.body.classList.toggle('light-theme', theme === 'light');
    document.body.classList.toggle('dark-theme', theme === 'dark');
  },

  updateFullscreenButton(isFull) {
    this.state.isFullscreen = isFull;
    const tooltipKey = isFull ? 'viewer_exit_fullscreen_tooltip' : 'viewer_fullscreen_tooltip';
    this.elements.fullscreenBtn.title = this.t(tooltipKey);
    this.elements.fullscreenBtn.textContent = isFull ? '🗗' : '⛶';
  },


  updateFullWindowButton(isFull) {
    this.state.isFullWindow = isFull;
    const key = isFull ? 'viewer_exit_fullwindow_tooltip' : 'viewer_fullwindow_tooltip';
    this.elements.windowBtn.title = this.t(key);
    this.elements.windowBtn.textContent = isFull ? '🗗' : '🗖';
  },

  async toggleFullScreen() {
    const shouldEnable = !this.state.isFullscreen;
    if (shouldEnable && this.state.isFullWindow) {
      await this.toggleFullWindow();
    }
    try {
      if (shouldEnable) {
        await this.elements.container.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error', err);
    }
    this.updateFullscreenButton(shouldEnable);
    this.updatePanelAndButtonVisibility();
  },

  async toggleFullWindow() {
    const shouldEnable = !this.state.isFullWindow;
    if (shouldEnable && this.state.isFullscreen) {
      await this.toggleFullScreen();
    }
    this.updateFullWindowButton(shouldEnable);
    this.elements.container.classList.toggle('fullwindow', shouldEnable);
    document.body.classList.toggle('no-scroll', shouldEnable);
     this.updatePanelAndButtonVisibility();
  },

  updateUiForLanguage(t) {
    if (!t || !this.elements.container) return;
    this.t = t;

    this.elements.prevBtn.title = t('viewer_prev_file_tooltip');
    this.elements.nextBtn.title = t('viewer_next_file_tooltip');
    this.elements.toggleModeBtn.title = t('viewer_toggle_mode_tooltip');
    this.elements.searchBtn.title = t('viewer_search_tooltip');
    const fsKey = this.state.isFullscreen ? 'viewer_exit_fullscreen_tooltip' : 'viewer_fullscreen_tooltip';
    this.elements.fullscreenBtn.title = t(fsKey);
    const fwKey = this.state.isFullWindow ? 'viewer_exit_fullwindow_tooltip' : 'viewer_fullwindow_tooltip';
    this.elements.windowBtn.title = t(fwKey);
  },

  setPhrases(newPhrases) {
    phrases = newPhrases || {};
  }
};
window.CodeViewer = CodeViewer;
