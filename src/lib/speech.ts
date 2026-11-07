import { getNativeBridge } from './platform';
import {
  getLocalTtsName,
  hasLocalTtsSupport,
  speakLocalRussian,
  stopLocalTts,
} from './local-tts';

let nativeTimer: number | null = null;

let russianVoice: SpeechSynthesisVoice | null = null;
let voicesBound = false;

function selectRussianVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const russian = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ru'));
  if (!russian.length) return null;
  const local = russian.filter((voice) => voice.localService);
  const exactLocal = local.find((voice) => /^ru([-_]RU)?$/i.test(voice.lang));
  const exact = russian.find((voice) => /^ru([-_]RU)?$/i.test(voice.lang));
  return exactLocal ?? local[0] ?? exact ?? russian[0];
}

export function getRussianVoiceName(): string | null {
  if (hasLocalTtsSupport()) return getLocalTtsName();
  initSpeech();
  return (russianVoice ?? selectRussianVoice())?.name ?? null;
}

export function initSpeech(): void {
  if (getNativeBridge()?.speak) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || voicesBound) return;
  voicesBound = true;
  russianVoice = selectRussianVoice();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    russianVoice = selectRussianVoice();
  });
}

export function hasRussianVoice(): boolean {
  if (hasLocalTtsSupport()) return true;
  const bridge = getNativeBridge();
  if (bridge?.speak) {
    return bridge.hasRussianVoice ? bridge.hasRussianVoice() : true;
  }
  return Boolean(russianVoice ?? selectRussianVoice());
}

function speakSystemOrNative(
  text: string,
  options: { rate?: number; onStart?: () => void; onEnd?: () => void },
): boolean {
  const bridge = getNativeBridge();
  if (bridge?.speak && (!bridge.hasRussianVoice || bridge.hasRussianVoice())) {
    if (nativeTimer !== null) window.clearTimeout(nativeTimer);
    bridge.speak(text);
    options.onStart?.();
    // Android TTS does not expose a completion callback to the web layer.
    // Estimate a natural stopping point so the listening indicator does not stick.
    nativeTimer = window.setTimeout(() => {
      nativeTimer = null;
      options.onEnd?.();
    }, Math.max(1200, text.replace(/\s+/g, '').length * 105));
    return true;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  initSpeech();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voice = russianVoice ?? selectRussianVoice();
  if (voice) utterance.voice = voice;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    options.onEnd?.();
  };
  utterance.onstart = () => options.onStart?.();
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function speakRussian(
  text: string,
  options: { rate?: number; onStart?: () => void; onEnd?: () => void } = {},
): boolean {
  if (hasLocalTtsSupport()) {
    void speakLocalRussian(text, { ...options, rate: options.rate ?? 1 }).catch((error) => {
      console.warn('Bundled Russian TTS failed; falling back to system voice.', error);
      speakSystemOrNative(text, options);
    });
    return true;
  }
  return speakSystemOrNative(text, options);
}

export function stopSpeech(): void {
  stopLocalTts();
  const bridge = getNativeBridge();
  if (bridge?.stopSpeaking) bridge.stopSpeaking();
  if (nativeTimer !== null) {
    window.clearTimeout(nativeTimer);
    nativeTimer = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
