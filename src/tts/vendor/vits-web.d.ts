export interface TtsProgress {
  url: string;
  total: number;
  loaded: number;
}

export function predict(
  config: { text: string; voiceId: string },
  callback?: (progress: TtsProgress) => void,
): Promise<Blob>;
