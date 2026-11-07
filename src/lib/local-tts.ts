/**
 * Bundled offline Russian TTS.
 *
 * Model: Piper ru_RU-irina-medium (CC BY 4.0), executed by VITS/ONNX Runtime
 * WebAssembly. The model, phonemizer and ONNX runtime live under /tts in the
 * app bundle. VITS uses an https://huggingface.co URL as its OPFS cache key, so
 * we keep that key and redirect only the network request to the local bundle.
 * Nothing is downloaded at runtime.
 */

const HF_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const VOICE_ID = 'ru_RU-irina-medium';

let fetchPatched = false;

function localBaseUrl(): string {
  return new URL('/tts/', window.location.href).href;
}

function installLocalFetch(): void {
  if (fetchPatched || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  fetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    if (raw.startsWith(`${HF_BASE}/`)) {
      const local = `${localBaseUrl()}${raw.slice(HF_BASE.length + 1)}`;
      return nativeFetch(local, init);
    }
    return nativeFetch(input, init);
  };
}

installLocalFetch();

let predictPromise: Promise<typeof import('../tts/vendor/vits-web.js').predict> | null = null;

async function getPredict(): Promise<typeof import('../tts/vendor/vits-web.js').predict> {
  predictPromise ??= import('../tts/vendor/vits-web.js').then((mod) => mod.predict);
  return predictPromise;
}

export function hasLocalTtsSupport(): boolean {
  return typeof window !== 'undefined'
    && typeof WebAssembly !== 'undefined'
    && (typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window);
}

export function getLocalTtsName(): string {
  return 'Piper · Irina (ru_RU, 离线)';
}

/** Synthesizes a WAV blob entirely on-device. Exported for smoke tests. */
const wavCache = new Map<string, Blob>();
const WAV_CACHE_LIMIT = 120;

export async function synthesizeRussian(text: string): Promise<Blob> {
  const key = text.trim();
  const cached = wavCache.get(key);
  if (cached) return cached;
  const predict = await getPredict();
  const blob = await predict({ text: key, voiceId: VOICE_ID });
  if (wavCache.size >= WAV_CACHE_LIMIT) {
    const oldest = wavCache.keys().next().value;
    if (oldest !== undefined) wavCache.delete(oldest);
  }
  wavCache.set(key, blob);
  return blob;
}

let audioContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let generation = 0;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('AudioContext is unavailable');
    audioContext = new Ctor();
  }
  return audioContext;
}

function stopActiveSource(): void {
  if (!activeSource) return;
  const source = activeSource;
  activeSource = null;
  try {
    source.stop();
  } catch {
    // Already stopped.
  }
  source.disconnect();
}

export interface LocalSpeechOptions {
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Speaks Russian through the bundled model. Throws when synthesis/playback
 * fails so the caller can fall back to the system voice.
 */
export async function speakLocalRussian(text: string, options: LocalSpeechOptions = {}): Promise<void> {
  // Create/resume the context synchronously inside the caller's user gesture.
  // Waiting for the 63 MB model first would lose the activation on Chrome.
  const context = getAudioContext();
  if (context.state === 'suspended') void context.resume();

  const requestGeneration = ++generation;
  const blob = await synthesizeRussian(text);
  if (requestGeneration !== generation) return;

  if (context.state === 'suspended') await context.resume();
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  if (requestGeneration !== generation) return;

  stopActiveSource();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = options.rate ?? 1;
  source.connect(context.destination);
  activeSource = source;

  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (activeSource === source) activeSource = null;
      source.disconnect();
      resolve();
    };
    options.onStart?.();
    source.start();
  });

  if (requestGeneration === generation) options.onEnd?.();
}

export function stopLocalTts(): void {
  generation += 1;
  stopActiveSource();
}
