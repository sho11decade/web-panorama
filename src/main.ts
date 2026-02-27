import './style.css';
import { PanoramaViewer } from './PanoramaViewer';

// ── DOM 要素 ──────────────────────────────────────────────────
const viewerContainer = document.getElementById('viewer-container') as HTMLDivElement;
const welcome         = document.getElementById('welcome') as HTMLDivElement;
const overlay         = document.getElementById('overlay') as HTMLDivElement;
const dropOverlay     = document.getElementById('drop-overlay') as HTMLDivElement;
const hintBar         = document.getElementById('hint-bar') as HTMLDivElement;
const fileInput       = document.getElementById('file-input') as HTMLInputElement;

const welcomeOpenBtn  = document.getElementById('welcome-open-btn') as HTMLButtonElement;
const openBtn         = document.getElementById('open-btn') as HTMLButtonElement;
const resetBtn        = document.getElementById('reset-btn') as HTMLButtonElement;
const fullscreenBtn   = document.getElementById('fullscreen-btn') as HTMLButtonElement;

// ── ビューア初期化 ────────────────────────────────────────────
const viewer = new PanoramaViewer(viewerContainer);

function showViewer(): void {
  welcome.classList.add('hidden');
  overlay.classList.remove('hidden');
  hintBar.classList.remove('hidden');
}
// ── ファイル読み込み ──────────────────────────────────────────
async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください');
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    await viewer.loadImage(url);
    showViewer();
  } catch (err) {
    alert('画像の読み込みに失敗しました');
    console.error(err);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── ファイル選択ダイアログ ───────────────────────────────────
function openFilePicker(): void {
  fileInput.click();
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) {
    void loadFile(file);
    fileInput.value = '';
  }
});

welcomeOpenBtn.addEventListener('click', openFilePicker);
openBtn.addEventListener('click', openFilePicker);

// ── 視点リセット ──────────────────────────────────────────────
resetBtn.addEventListener('click', () => viewer.resetView());

// ── 全画面表示 ────────────────────────────────────────────────
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen();
    fullscreenBtn.textContent = '✕';
    fullscreenBtn.title = '全画面解除';
  } else {
    void document.exitFullscreen();
    fullscreenBtn.textContent = '⛶';
    fullscreenBtn.title = '全画面表示';
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    fullscreenBtn.textContent = '⛶';
    fullscreenBtn.title = '全画面表示';
  }
});

// ── ドラッグ＆ドロップ ────────────────────────────────────────
function setupDragAndDrop(target: HTMLElement, showOverlay: HTMLElement | null): void {
  let dragCounter = 0;

  target.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  target.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (showOverlay) showOverlay.classList.remove('hidden');
    else target.classList.add('drag-over');
  });

  target.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (showOverlay) showOverlay.classList.add('hidden');
      else target.classList.remove('drag-over');
    }
  });

  target.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (showOverlay) showOverlay.classList.add('hidden');
    else target.classList.remove('drag-over');

    const file = e.dataTransfer?.files[0];
    if (file) void loadFile(file);
  });
}

// ウェルカム画面へのドラッグ
setupDragAndDrop(welcome, null);

// ビューア表示中のドラッグ
setupDragAndDrop(document.getElementById('app') as HTMLElement, dropOverlay);
