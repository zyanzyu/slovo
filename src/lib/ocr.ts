import type { LoggerMessage, Worker } from 'tesseract.js';

export type OcrProgress = (progress: number, label: string) => void;

const workers = new Map<string, Promise<Worker>>();
let activeProgress: OcrProgress | null = null;
let activeStage = 0;
let queue: Promise<unknown> = Promise.resolve();

const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': '加载识别引擎',
  'initializing tesseract': '启动识别引擎',
  'loading language traineddata': '加载语言模型',
  'initializing api': '准备识别',
  'recognizing text': '识别文字中',
};

function cleanOcrText(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!/[А-Яа-яЁё]/.test(trimmed)) return trimmed;
      return trimmed
        .split(/\s+/)
        .filter((token) => /[А-Яа-яЁё\u3400-\u9fff]/.test(token))
        .join(' ');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isLatinOnlyLine(line: string): boolean {
  return /[A-Za-z]/.test(line) && !/[А-Яа-яЁё]/.test(line);
}

function mergeRussianLines(mixedText: string, russianText: string): string {
  const mixed = mixedText.split('\n');
  const russian = russianText.split('\n');
  if (mixed.length !== russian.length) return mixedText;

  return mixed
    .map((line, index) => {
      if (!isLatinOnlyLine(line)) return line;
      const ru = russian[index].match(/[А-Яа-яЁё][А-Яа-яЁё\s-]*/)?.[0].trim();
      if (!ru) return line;
      const zh = line.match(/[\u3400-\u9fff].*/)?.[0].trim();
      return zh ? `${ru} — ${zh}` : ru;
    })
    .join('\n');
}

function report(message: LoggerMessage) {
  if (!activeProgress) return;
  const label = STATUS_LABELS[message.status] || '准备识别';
  let progress = activeStage;
  if (message.status === 'recognizing text') {
    progress = 0.42 + Math.max(0, Math.min(1, message.progress)) * 0.58;
  } else if (message.status === 'loading language traineddata') {
    progress = 0.18 + message.progress * 0.2;
  } else {
    progress = Math.max(activeStage, 0.04 + message.progress * 0.14);
  }
  activeProgress(progress, label);
}

async function getWorker(langs: string): Promise<Worker> {
  let promise = workers.get(langs);
  if (!promise) {
    promise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(langs, 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract',
        langPath: '/tessdata',
        gzip: true,
        cacheMethod: 'write',
        logger: report,
        errorHandler: (error) => console.error('Tesseract error', error),
      });
    })();
    workers.set(langs, promise);
    promise.catch(() => workers.delete(langs));
  }
  return promise;
}

/**
 * Warm the Russian handwriting worker while the user is still writing.
 * Loading the wasm core and traineddata is by far the largest first-use cost.
 */
export async function preloadHandwritingWorker(): Promise<void> {
  await getWorker('rus');
}


function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

async function fileToCanvas(file: File, maxSide = 2200): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = null;
  }

  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup = () => {};
  if (bitmap) {
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap?.close();
  } else {
    const url = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = url;
    });
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
    cleanup = () => URL.revokeObjectURL(url);
  }

  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale)) + 48;
  canvas.height = Math.max(1, Math.round(height * scale)) + 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持图片处理');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.filter = 'grayscale(1) contrast(1.16) brightness(1.03)';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 24, 24, canvas.width - 48, canvas.height - 48);
  ctx.filter = 'none';
  cleanup();
  return canvas;
}

export async function recognizeImageFile(
  file: File,
  options: { chinese?: boolean; onProgress?: OcrProgress } = {},
): Promise<{ text: string; confidence: number }> {
  const langs = options.chinese === false ? 'rus' : 'rus+chi_sim';
  activeProgress = options.onProgress ?? null;
  activeStage = 0.03;
  activeProgress?.(0.03, '准备图片');
  const canvas = await fileToCanvas(file);
  activeStage = 0.08;

  return runExclusive(async () => {
    activeProgress?.(0.08, '加载识别模型');
    const worker = await getWorker(langs);
    const { PSM } = await import('tesseract.js');
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessedit_char_whitelist: '',
    });
    activeStage = 0.42;
    activeProgress?.(0.42, '识别文字中');
    const result = await worker.recognize(canvas);
    let text = cleanOcrText(result.data.text || '');

    // Chinese and Russian models together sometimes read a Cyrillic word as Latin.
    // Only if such a line exists, run a Russian-only correction pass.
    if (options.chinese !== false && text.split('\n').some(isLatinOnlyLine)) {
      activeProgress?.(0.9, '校正俄语拼写');
      const progress = activeProgress;
      activeProgress = null;
      try {
        const russianWorker = await getWorker('rus');
        await russianWorker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
          tessedit_char_whitelist: '',
        });
        const russianResult = await russianWorker.recognize(canvas);
        text = mergeRussianLines(text, cleanOcrText(russianResult.data.text || ''));
      } catch {
        // Keep the mixed-language result if the correction pass fails.
      } finally {
        activeProgress = progress;
      }
    }

    activeProgress?.(1, '识别完成');
    return {
      text: text.replace(/\n{3,}/g, '\n\n').trim(),
      confidence: result.data.confidence,
    };
  }).finally(() => {
    activeProgress = null;
  });
}

export async function recognizeHandwritingCanvas(
  source: HTMLCanvasElement,
  onProgress?: OcrProgress,
): Promise<{ text: string; confidence: number }> {
  const factor = Math.min(2.2, Math.max(1.2, 700 / Math.max(1, source.width)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * factor) + 48;
  canvas.height = Math.round(source.height * factor) + 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { text: '', confidence: 0 };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 24, 24, canvas.width - 48, canvas.height - 48);

  activeProgress = onProgress ?? null;
  activeStage = 0.04;
  onProgress?.(0.04, '加载离线识别');

  return runExclusive(async () => {
    const { PSM } = await import('tesseract.js');
    const worker = await getWorker('rus');
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_WORD,
      tessedit_char_whitelist:
        'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ-',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    activeStage = 0.42;
    onProgress?.(0.42, '离线识别中');
    const result = await worker.recognize(canvas);
    onProgress?.(1, '识别完成');
    const lines = (result.data.text || '')
      .split('\n')
      .map((line) => line.replace(/[^А-Яа-яЁё\s-]/g, '').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    return {
      text: lines[0] || '',
      confidence: result.data.confidence,
    };
  }).finally(() => {
    activeProgress = null;
  });
}

export async function terminateOcrWorkers(): Promise<void> {
  const all = Array.from(workers.values());
  workers.clear();
  await Promise.all(
    all.map(async (promise) => {
      try {
        const worker = await promise;
        await worker.terminate();
      } catch {
        // Ignore workers that failed during initialization.
      }
    }),
  );
}
