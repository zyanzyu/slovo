export type StudyMode = 'audio' | 'meaning' | 'mixed';
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  due: number;
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  mastery: number;
  lastReviewed?: number;
  firstReviewedAt?: number;
}

export interface Word {
  id: string;
  deckId: string;
  ru: string;
  zh: string;
  transcription?: string;
  exampleRu?: string;
  exampleZh?: string;
  note?: string;
  tags?: string[];
  createdAt: number;
  srs: SrsState;
}

export interface Deck {
  id: string;
  name: string;
  subtitle: string;
  color: 'clay' | 'sage' | 'ochre' | 'ink';
  createdAt: number;
}

export interface Settings {
  dailyGoal: number;
  newPerDay: number;
  defaultMode: StudyMode;
  onlineHandwriting: boolean;
  offlineHandwriting: boolean;
  autoPlay: boolean;
  showTranscription: boolean;
  /** UI text scale; 1 = standard. */
  fontScale: number;
}

export interface DayStat {
  reviewed: number;
  correct: number;
  newWords: number;
}

export interface Stats {
  streak: number;
  lastStudyDate?: string;
  daily: Record<string, DayStat>;
  totalReviews: number;
  totalCorrect: number;
}

export interface StoreData {
  version: 1;
  decks: Deck[];
  words: Word[];
  settings: Settings;
  stats: Stats;
}

export interface StudyCard {
  word: Word;
  mode: 'audio' | 'meaning';
  isNew: boolean;
  requeued?: boolean;
}

export interface StudyResult {
  wordId: string;
  rating: Rating;
  correct: boolean;
  mode: 'audio' | 'meaning';
  firstTry: boolean;
}
