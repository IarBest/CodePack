// Управляет всем, что связано с просмотрщиком кода

import {EditorState, EditorView, basicSetup, javascript, oneDark, Compartment} from './codemirror-bundle.js';

const themeCompartment = new Compartment();

let currentTheme = 'dark';

const createEditor = (parent, doc, onChange) => {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        javascript(),
        themeCompartment.of(currentTheme === 'dark' ? oneDark : []),
        EditorView.updateListener.of((v) => {
          if (v.docChanged && typeof onChange === 'function') {
            onChange(v.state.doc.toString());
          }
        })
      ]
    }),
    parent
  });
};

const CodeViewer = {
  elements: {
    container: null, header: null, filePath: null, content: null,
    prevBtn: null, nextBtn: null, dropZone: null, selectFileBtn: null,
	selectNewFileBtn: null,
    toggleModeBtn: null,
    searchBtn: null,
    fullscreenBtn: null
  },

  state: {
    files: [],
    currentFileIndex: -1,
    viewMode: 'all',
    fileObserver: null,
    editors: [],
    currentEditor: null,
    theme: 'dark'
  },

  onFileDroppedOrSelected: null,

  init(options) {
    currentTheme = options.theme || 'dark';
    this.state.theme = currentTheme;
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
    this.elements.fullscreenBtn = document.getElementById('viewer-fullscreen-btn');

    this.onFileDroppedOrSelected = options.onFileDroppedOrSelected;
    this.addEventListeners();
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
    this.elements.searchBtn.addEventListener('click', () => {
    showToast('Функция поиска будет добавлена в будущих версиях!', 'info');
});
    this.elements.fullscreenBtn.addEventListener('click', () => {
    showToast('Полноэкранный режим будет добавлен в будущих версиях!', 'info');
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
        }
      }
    }, observerOptions);

    const fileBlocks = this.elements.content.querySelectorAll('.viewer-file-block');
    fileBlocks.forEach(block => this.state.fileObserver.observe(block));
    this.elements.content.focus();
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
  },

  updateHeaderUI() {
      if (this.state.viewMode === 'all') {
          this.elements.filePath.textContent = 'Режим потока';
          this.elements.filePath.title = 'Все файлы в одном окне';
          this.elements.prevBtn.style.display = 'none';
          this.elements.nextBtn.style.display = 'none';
          this.elements.toggleModeBtn.textContent = '📄';
          this.elements.toggleModeBtn.title = 'Переключить в режим одного файла';
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
    this.elements.prevBtn.disabled = this.state.currentFileIndex <= 0;
    this.elements.nextBtn.disabled = this.state.currentFileIndex >= this.state.files.length - 1;
  },

  prevFile() {
    this.showFile(this.state.currentFileIndex - 1);
  },
  nextFile() {
    this.showFile(this.state.currentFileIndex + 1);
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

  setTheme(theme) {
    if (this.state.theme === theme) return;
    this.state.theme = theme;
    currentTheme = theme;
    const ext = theme === 'dark' ? oneDark : [];
    const effect = themeCompartment.reconfigure(ext);
    this.state.editors.forEach(v => v.dispatch({ effects: effect }));
    if (this.state.currentEditor) this.state.currentEditor.dispatch({ effects: effect });
  },

  updateUiForLanguage(t) {
    if (!t || !this.elements.container) return; // Защита от ошибок

    this.elements.prevBtn.title = t('viewer_prev_file_tooltip');
    this.elements.nextBtn.title = t('viewer_next_file_tooltip');
    this.elements.toggleModeBtn.title = t('viewer_toggle_mode_tooltip');
    this.elements.searchBtn.title = t('viewer_search_tooltip');
    this.elements.fullscreenBtn.title = t('viewer_fullscreen_tooltip');
  }
};

window.CodeViewer = CodeViewer;
