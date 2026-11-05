export interface SlovoNativeBridge {
  saveBackup?: (json: string, filename: string) => void;
  speak?: (text: string) => void;
  hasRussianVoice?: () => boolean;
  stopSpeaking?: () => void;
  setTextZoom?: (percent: number) => void;
}

declare global {
  interface Window {
    SlovoNative?: SlovoNativeBridge;
    __slovoBackupResult?: (ok: boolean) => void;
  }
}

export function getNativeBridge(): SlovoNativeBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.SlovoNative;
}

export function isNativeShell(): boolean {
  if (getNativeBridge()) return true;
  return typeof navigator !== 'undefined' && /SlovoAndroid|Electron/i.test(navigator.userAgent);
}
