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
    fullscreenBtn: null
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
    escClosedSearch: false
  },

  onFileDroppedOrSelected: null,

  init(options) {
    currentTheme = options.theme || 'dark';
    this.state.theme = currentTheme;
    this.state.searchAll = options.searchAll || false;
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
    searchPanelContainer = document.getElementById('viewer-search-container');

    this.onFileDroppedOrSelected = options.onFileDroppedOrSelected;
    this.addEventListeners();
    this.updateFullscreenButton(false);
    this.updateFullWindowButton(false);
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

    document.addEventListener('keydown', (e) => {
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
    // Сохраняем позицию скролла при прокрутке в режиме одного файла
    this.elements.content.addEventListener('scroll', () => {
        if (this.state.viewMode === 'single' && this.state.currentFileIndex !== -1) {
            const file = this.state.files[this.state.currentFileIndex];
            if (file) {
                file.scrollPosition = this.elements.content.scrollTop;
            }
        }
    });
  },

updateActiveHighlight(filePath) {
    // Сначала убираем подсветку со всех старых элементов
    const activeItems = document.querySelectorAll('#split-file-list-container .is-active');
    activeItems.forEach(item => item.classList.remove('is-active'));

    if (filePath) {
        // Находим новый элемент по пути и подсвечиваем его
        const newActiveItem = document.querySelector(`#split-file-list-container .tree-item[data-path="${CSS.escape(filePath)}"]`);
        if (newActiveItem) {
            newActiveItem.classList.add('is-active');
        }
    }
  },
  
  toggleViewMode() {
    this.state.viewMode = this.state.viewMode === 'single' ? 'all' : 'single';
    this.loadContent(); // Перерисовываем с теми же файлами, но в новом режиме
    if (this.state.searchPanelOpen) {
      this.openSearch();
    }
  },

  loadContent(parsedFiles) {
  this.updateActiveHighlight(null);
  this.state.editors.forEach(ed => ed.destroy());
  this.state.editors = [];
  if (this.state.currentEditor) {
    this.state.currentEditor.destroy();
    this.state.currentEditor = null;
  }
    if (parsedFiles) {
        // Добавляем свойство для хранения позиции скролла
        this.state.files = parsedFiles
            .filter(f => f.type === 'file')
            .map(f => ({ ...f, scrollPosition: 0 }));
    }

    if (this.state.files.length > 0) {
        this.elements.dropZone.style.display = 'none';
        this.elements.container.style.display = 'flex';

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
    this.elements.content.scrollTop = 0; // Сбрасываем скролл при переключении в режим потока

    const observerOptions = {
      root: this.elements.content,
      rootMargin: "0px 0px -98% 0px",
      threshold: 0
    };

    this.state.fileObserver = new IntersectionObserver((entries) => {
      const intersectingEntry = entries.find(entry => entry.isIntersecting);
      if (intersectingEntry) {
        const filePath = intersectingEntry.target.dataset.path;
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
      if (index < 0 || index >= this.state.files.length) return;
      this.state.currentFileIndex = index;
      const file = this.state.files[index];

      // Обновляем и заголовок, и подсветку в дереве
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
      if (this.state.searchPanelOpen) {
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

  // Новые методы для прокрутки в режиме потока
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
    // Ищем следующий элемент с таким же классом
    let nextBlock = currentBlock ? currentBlock.nextElementSibling : null;
    while(nextBlock && !nextBlock.matches('.viewer-file-block')) {
        nextBlock = nextBlock.nextElementSibling;
    }

    if (nextBlock) {
        this.navigateTo(nextBlock.dataset.path);
    }
  },

  navigateTo(filePath) {
    this.updateActiveHighlight(filePath); // Обновляем подсветку немедленно

    const fileBlock = this.elements.content.querySelector(`.viewer-file-block[data-path="${CSS.escape(filePath)}"]`);
    if (this.state.viewMode === 'all') {
        if (fileBlock) {
            this.elements.content.scrollTo({
                top: fileBlock.offsetTop - this.elements.content.offsetTop,
                behavior: 'smooth'
            });
        }
    } else {
        const fileIndex = this.state.files.findIndex(f => f.path === filePath);
        if (fileIndex !== -1) {
            this.showFile(fileIndex);
        }
    }
  },

  openSearch() {
    // Close existing panels to avoid duplicates
    this.state.editors.forEach(ed => closeSearchPanel(ed));
    if (this.state.currentEditor) closeSearchPanel(this.state.currentEditor);
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
    this.state.editors.forEach(ed => closeSearchPanel(ed));
    if (this.state.currentEditor) closeSearchPanel(this.state.currentEditor);
    this.state.searchPanelOpen = false;
  },

  patchSearchPanel(view, attempt = 0) {
    const panel = view.dom.querySelector('.cm-search');
    if (!panel) {
      if (attempt < 5) {
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
      panel.appendChild(label);
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
          this.searchStep(e.target.name === 'next', view);
        }
      }, true);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'F3' || (e.key.toLowerCase() === 'g' && e.metaKey)) {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.searchStep(!e.shiftKey, view);
        }
        if (e.key === 'Enter') {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.searchStep(true, view);
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

  searchStep(forward, view) {
    if (!view) return;
    const panel = view.dom.querySelector('.cm-search');
    if (!panel) return;
    const input = panel.querySelector('[main-field]');
    const query = (input ? input.value : this.state.searchQuery) || '';
    this.state.searchQuery = query;
    const text = view.state.doc.toString();
    const pos = view.state.selection.main[forward ? 'to' : 'from'];
    const searchText = query.toLowerCase();
    const hay = text.toLowerCase();
    let index = forward ? hay.indexOf(searchText, pos) : hay.lastIndexOf(searchText, pos - 1);
    if (index !== -1) {
      view.dispatch({ selection: { anchor: index, head: index + query.length }, scrollIntoView: true });
    } else if (this.state.searchAll) {
      const currentIndex = this.state.viewMode === 'single' ? this.state.currentFileIndex : this.state.files.findIndex(f => f.path === this.elements.filePath.textContent);
      const step = forward ? 1 : -1;
      let idx = currentIndex + step;
      while (idx >= 0 && idx < this.state.files.length) {
        const f = this.state.files[idx];
        const haystack = f.content.toLowerCase();
        const pos2 = haystack.indexOf(searchText);
        if (pos2 !== -1) {
          if (this.state.viewMode === 'single') this.showFile(idx); else this.navigateTo(f.path);
          this.openSearch();
          const nv = this.state.viewMode === 'single' ? this.state.currentEditor : this.state.editors[idx];
          nv.dispatch({ selection: { anchor: pos2, head: pos2 + query.length }, scrollIntoView: true });
          break;
        }
        idx += step;
      }
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
    if (shouldEnable) {
      await this.elements.container.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    this.updateFullscreenButton(shouldEnable);
  },

  async toggleFullWindow() {
    const shouldEnable = !this.state.isFullWindow;
    if (shouldEnable && this.state.isFullscreen) {
      await this.toggleFullScreen();
    }
    this.updateFullWindowButton(shouldEnable);
    this.elements.container.classList.toggle('fullwindow', shouldEnable);
    document.body.classList.toggle('no-scroll', shouldEnable);
  },

  updateUiForLanguage(t) {
    if (!t || !this.elements.container) return; // Защита от ошибок
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
