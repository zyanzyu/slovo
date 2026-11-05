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


let serviceProbe: { at: number; available: boolean } | null = null;

async function handwritingServiceAvailable(): Promise<boolean> {
  if (serviceProbe && Date.now() - serviceProbe.at < 30_000) return serviceProbe.available;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch('/api/health', { signal: controller.signal });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('json')) {
      serviceProbe = { at: Date.now(), available: false };
      return false;
    }
    const payload = await response.json().catch(() => null);
    const available = payload?.ok === true;
    serviceProbe = { at: Date.now(), available };
    return available;
  } catch {
    serviceProbe = { at: Date.now(), available: false };
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function recognizeInk(
  strokes: InkPoint[][],
  width: number,
  height: number,
  timeoutMs = 4_500,
): Promise<string[]> {
  if (!strokes.length) return [];
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
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/handwriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    return parseInkResponse(await response.json());
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function recognizeHandwriting(options: {
  strokes: InkPoint[][];
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  online: boolean;
  offline: boolean;
  onProgress?: (label: string) => void;
}): Promise<RecognitionOutcome> {
  const { strokes, width, height, canvas, online, offline, onProgress } = options;
  if (!strokes.length) return { text: '', candidates: [], source: 'none' };

  if (online && (await handwritingServiceAvailable())) {
    onProgress?.('在线识别中');
    const onlineCandidates = await recognizeInk(strokes, width, height);
    if (onlineCandidates.length) {
      return { text: onlineCandidates[0], candidates: onlineCandidates, source: 'online' };
    }
    onProgress?.('在线识别没有结果，尝试离线');
  } else if (online) {
    onProgress?.('在线识别暂不可用，改用离线');
  }

  if (offline) {
    onProgress?.('尝试离线识别');
    try {
      const { recognizeHandwritingCanvas } = await import('./ocr');
      const result = await recognizeHandwritingCanvas(canvas, (progress, label) => {
        onProgress?.(`${label} ${Math.round(progress * 100)}%`);
      });
      const text = result.text.trim();
      if (text) {
        return { text, candidates: [text], source: 'offline' };
      }
    } catch (error) {
      console.error('Offline handwriting recognition failed', error);
    }
  }

  return { text: '', candidates: [], source: 'none' };
}
