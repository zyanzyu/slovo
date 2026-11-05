export interface InkPoint {
  x: number;
  y: number;
}

export interface RecognitionOutcome {
  text: string;
  candidates: string[];
  source: 'online' | 'offline' | 'none';
}

function cyrillicCandidates(node: unknown, found: string[][] = []): string[][] {
  if (Array.isArray(node)) {
    if (
      node.length > 0 &&
      node.every((value) => typeof value === 'string') &&
      node.some((value) => /[А-Яа-яЁё]/.test(value))
    ) {
      found.push(node as string[]);
      return found;
    }
    for (const child of node) cyrillicCandidates(child, found);
  }
  return found;
}

export function parseInkResponse(payload: unknown): string[] {
  const lists = cyrillicCandidates(payload);
  const flattened = lists.flat();
  const unique = new Set<string>();
  for (const value of flattened) {
    const candidate = value
      .replace(/\s+/g, ' ')
      .replace(/[^\u0400-\u04FF\s-]/g, '')
      .trim();
    if (candidate) unique.add(candidate);
  }
  return Array.from(unique).slice(0, 8);
}


export async function recognizeInk(
  strokes: InkPoint[][],
  width: number,
  height: number,
  timeoutMs = 1_300,
  outerSignal?: AbortSignal,
): Promise<string[]> {
  if (outerSignal?.aborted || !strokes.length) return [];
  const readable = strokes.filter((stroke) => stroke.length > 1);
  if (!readable.length) return [];

  const payload = {
    options: 'enable_pre_space',
    requests: [
      {
        writing_guide: {
          writing_area_width: Math.round(width),
          writing_area_height: Math.round(height),
        },
        ink: readable.map((stroke) => [
          stroke.map((point) => Math.round(point.x)),
          stroke.map((point) => Math.round(point.y)),
          [],
        ]),
        language: 'ru',
      },
    ],
  };

  const controller = new AbortController();
  const abort = () => controller.abort();
  outerSignal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/handwriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    // A static PWA can answer unknown routes with index.html. Do not treat
    // that HTML fallback as a handwriting service.
    const type = response.headers.get('content-type') || '';
    if (!type.includes('json')) return [];
    return parseInkResponse(await response.json());
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
    outerSignal?.removeEventListener('abort', abort);
  }
}

export async function recognizeHandwriting(options: {
  strokes: InkPoint[][];
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  offlineCanvas?: HTMLCanvasElement;
  online: boolean;
  offline: boolean;
  signal?: AbortSignal;
  onProgress?: (label: string) => void;
}): Promise<RecognitionOutcome> {
  const {
    strokes,
    width,
    height,
    canvas,
    offlineCanvas,
    online,
    offline,
    signal,
    onProgress,
  } = options;

  if (signal?.aborted || !strokes.length) {
    return { text: '', candidates: [], source: 'none' };
  }

  let settled = false;
  const report = (label: string) => {
    if (!settled) onProgress?.(label);
  };

  let offlineTimer: number | undefined;
  let offlineTask: Promise<RecognitionOutcome> | null = null;
  const startOffline = async (): Promise<RecognitionOutcome> => {
    if (settled || !offline) return { text: '', candidates: [], source: 'none' };
    report('离线识别中');
    try {
      const { recognizeHandwritingCanvas } = await import('./ocr');
      const result = await recognizeHandwritingCanvas(
        offlineCanvas ?? canvas,
        (progress, label) => report(`${label} ${Math.round(progress * 100)}%`),
      );
      const text = result.text.trim();
      if (text) {
        return { text, candidates: [text], source: 'offline' };
      }
    } catch (error) {
      console.error('Offline handwriting recognition failed', error);
    }
    return { text: '', candidates: [], source: 'none' };
  };

  if (offline) {
    offlineTask = new Promise<RecognitionOutcome>((resolve) => {
      // Let the network start first. If it is fast it wins before Tesseract;
      // if it is slow, offline is already warming up in parallel.
      const delay = online ? 80 : 0;
      offlineTimer = window.setTimeout(() => {
        void startOffline().then(resolve);
      }, delay);
    });
  }

  const pending: Array<{
    source: 'online' | 'offline';
    promise: Promise<RecognitionOutcome>;
  }> = [];

  if (online) {
    report('在线识别中');
    pending.push({
      source: 'online',
      promise: recognizeInk(strokes, width, height, 1_300, signal).then((candidates) => ({
        text: candidates[0] ?? '',
        candidates,
        source: candidates.length ? 'online' as const : 'none' as const,
      })),
    });
  }

  if (offlineTask) {
    pending.push({ source: 'offline', promise: offlineTask });
  }

  if (!pending.length) {
    return { text: '', candidates: [], source: 'none' };
  }

  while (pending.length) {
    const winner = await Promise.race(pending.map((item) => item.promise));
    const winnerIndex = pending.findIndex((item) => item.source === winner.source);
    if (winnerIndex >= 0) pending.splice(winnerIndex, 1);
    if (signal?.aborted) {
      settled = true;
      if (offlineTimer) window.clearTimeout(offlineTimer);
      return { text: '', candidates: [], source: 'none' };
    }
    if (winner.text) {
      settled = true;
      if (offlineTimer) window.clearTimeout(offlineTimer);
      return winner;
    }
  }

  settled = true;
  if (offlineTimer) window.clearTimeout(offlineTimer);
  return { text: '', candidates: [], source: 'none' };
}
