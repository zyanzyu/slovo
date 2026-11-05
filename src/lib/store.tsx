import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createSeedData } from '../data/seed';
import { recordStudyStats, scheduleReview } from './srs';
import type { Deck, Rating, Settings, StoreData, Word } from './types';
import { getNativeBridge } from './platform';
import { normalizeRu, uid } from './utils';

const STORAGE_KEY = 'slovo.store.v1';
const DECK_COLORS: Deck['color'][] = ['clay', 'sage', 'ochre', 'ink'];

export interface WordDraft {
  ru: string;
  zh: string;
  transcription?: string;
  exampleRu?: string;
  exampleZh?: string;
  note?: string;
}

function freshWord(draft: WordDraft, deckId: string): Word {
  return {
    id: uid('w-'),
    deckId,
    ru: draft.ru.trim(),
    zh: draft.zh.trim() || '待补充释义',
    transcription: draft.transcription?.trim() || undefined,
    exampleRu: draft.exampleRu?.trim() || undefined,
    exampleZh: draft.exampleZh?.trim() || undefined,
    note: draft.note?.trim() || undefined,
    createdAt: Date.now(),
    srs: {
      due: Date.now(),
      interval: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      mastery: 0,
    },
  };
}

function hydrate(raw: unknown): StoreData {
  const base = createSeedData();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<StoreData>;
  if (!Array.isArray(data.decks) || !Array.isArray(data.words)) return base;
  const wordIds = new Set<string>();
  const words = data.words
    .filter((word): word is Word => {
      if (!word || typeof word.ru !== 'string' || !word.ru.trim()) return false;
      if (wordIds.has(word.id)) return false;
      wordIds.add(word.id);
      return true;
    })
    .map((word) => ({
      ...word,
      zh: word.zh || '待补充释义',
      srs: {
        due: word.srs?.due ?? Date.now(),
        interval: word.srs?.interval ?? 0,
        ease: word.srs?.ease ?? 2.5,
        reps: word.srs?.reps ?? 0,
        lapses: word.srs?.lapses ?? 0,
        mastery: word.srs?.mastery ?? 0,
        lastReviewed: word.srs?.lastReviewed,
        firstReviewedAt: word.srs?.firstReviewedAt,
      },
    }));
  const decks = data.decks.filter((deck): deck is Deck => Boolean(deck?.id && deck?.name));
  return {
    version: 1,
    decks: decks.length ? decks : base.decks,
    words,
    settings: {
      ...base.settings,
      ...(data.settings ?? {}),
      fontScale: Math.min(1.4, Math.max(0.85, Number(data.settings?.fontScale) || base.settings.fontScale)),
    },
    stats: {
      ...base.stats,
      ...(data.stats ?? {}),
      daily: data.stats?.daily ?? {},
    },
  };
}

function loadState(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedData();
    return hydrate(JSON.parse(raw));
  } catch {
    return createSeedData();
  }
}

interface AppContextValue {
  data: StoreData;
  addWords: (drafts: WordDraft[], deckId: string) => { added: number; skipped: number };
  addWord: (draft: WordDraft, deckId: string) => Word;
  updateWord: (id: string, patch: Partial<WordDraft>) => void;
  deleteWord: (id: string) => void;
  createDeck: (name: string, subtitle?: string) => Deck;
  updateDeck: (id: string, patch: Partial<Pick<Deck, 'name' | 'subtitle' | 'color'>>) => void;
  deleteDeck: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  reviewWord: (wordId: string, rating: Rating, correct: boolean) => void;
  resetProgress: () => void;
  resetAll: () => void;
  importBackup: (json: string) => boolean;
  exportBackup: () => string;
  getDeck: (id: string) => Deck | undefined;
  getWord: (id: string) => Word | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData>(loadState);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Surface quota/private-mode failures instead of silently losing data.
        window.dispatchEvent(new CustomEvent('slovo:storage-error'));
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    const scale = Math.min(1.4, Math.max(0.85, data.settings.fontScale || 1));
    const bridge = getNativeBridge();
    if (bridge?.setTextZoom) {
      // Android WebView does not inherit the system font scale. Let it scale the
      // whole page while CSS keeps a neutral scale to avoid double scaling.
      bridge.setTextZoom(Math.round(scale * 100));
      document.documentElement.style.setProperty('--font-scale', '1');
    } else {
      document.documentElement.style.setProperty('--font-scale', String(scale));
    }
  }, [data.settings.fontScale]);

  const addWords = useCallback(
    (drafts: WordDraft[], deckId: string) => {
      const valid = drafts.filter((draft) => draft.ru.trim());
      if (!valid.length) return { added: 0, skipped: 0 };
      const known = new Set(data.words.map((word) => normalizeRu(word.ru)));
      const batch = new Set<string>();
      const next: Word[] = [];
      for (const draft of valid) {
        const key = normalizeRu(draft.ru);
        if (!key || known.has(key) || batch.has(key)) continue;
        batch.add(key);
        next.push(freshWord(draft, deckId));
      }
      if (next.length) {
        setData((current) => {
          const currentKnown = new Set(current.words.map((word) => normalizeRu(word.ru)));
          const safe = next.filter((word) => !currentKnown.has(normalizeRu(word.ru)));
          return safe.length ? { ...current, words: [...current.words, ...safe] } : current;
        });
      }
      return { added: next.length, skipped: valid.length - next.length };
    },
    [data.words],
  );

  const addWord = useCallback((draft: WordDraft, deckId: string) => {
    const word = freshWord(draft, deckId);
    setData((current) => ({ ...current, words: [...current.words, word] }));
    return word;
  }, []);

  const updateWord = useCallback((id: string, patch: Partial<WordDraft>) => {
    setData((current) => ({
      ...current,
      words: current.words.map((word) =>
        word.id === id
          ? {
              ...word,
              ...Object.fromEntries(
                Object.entries(patch).map(([key, value]) => [
                  key,
                  typeof value === 'string' ? value.trim() : value,
                ]),
              ),
            }
          : word,
      ),
    }));
  }, []);

  const deleteWord = useCallback((id: string) => {
    setData((current) => ({ ...current, words: current.words.filter((word) => word.id !== id) }));
  }, []);

  const createDeck = useCallback((name: string, subtitle = '自己收集的单词') => {
    const deck: Deck = {
      id: uid('deck-'),
      name: name.trim() || '未命名词库',
      subtitle: subtitle.trim(),
      color: 'clay',
      createdAt: Date.now(),
    };
    setData((current) => ({
      ...current,
      decks: [...current.decks, { ...deck, color: DECK_COLORS[current.decks.length % DECK_COLORS.length] }],
    }));
    return deck;
  }, []);

  const updateDeck = useCallback(
    (id: string, patch: Partial<Pick<Deck, 'name' | 'subtitle' | 'color'>>) => {
      setData((current) => ({
        ...current,
        decks: current.decks.map((deck) => (deck.id === id ? { ...deck, ...patch } : deck)),
      }));
    },
    [],
  );

  const deleteDeck = useCallback((id: string) => {
    setData((current) => ({
      ...current,
      decks: current.decks.filter((deck) => deck.id !== id),
      words: current.words.filter((word) => word.deckId !== id),
    }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  const reviewWord = useCallback((wordId: string, rating: Rating, correct: boolean) => {
    setData((current) => {
      const word = current.words.find((item) => item.id === wordId);
      if (!word) return current;
      const reviewed = scheduleReview(word, rating);
      return {
        ...current,
        words: current.words.map((item) => (item.id === wordId ? reviewed : item)),
        stats: recordStudyStats(current.stats, word, correct),
      };
    });
  }, []);

  const resetProgress = useCallback(() => {
    setData((current) => ({
      ...current,
      words: current.words.map((word) => ({
        ...word,
        srs: {
          due: Date.now(),
          interval: 0,
          ease: 2.5,
          reps: 0,
          lapses: 0,
          mastery: 0,
        },
      })),
      stats: { streak: 0, daily: {}, totalReviews: 0, totalCorrect: 0 },
    }));
  }, []);

  const resetAll = useCallback(() => {
    setData(createSeedData());
  }, []);

  const importBackup = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      const source = parsed?.data ?? parsed;
      if (!source || !Array.isArray(source.words) || !Array.isArray(source.decks)) return false;
      setData(hydrate(source));
      return true;
    } catch {
      return false;
    }
  }, []);

  const exportBackup = useCallback(() => {
    return JSON.stringify(
      {
        app: 'slovo',
        exportedAt: new Date().toISOString(),
        data,
      },
      null,
      2,
    );
  }, [data]);

  const getDeck = useCallback((id: string) => data.decks.find((deck) => deck.id === id), [data.decks]);
  const getWord = useCallback((id: string) => data.words.find((word) => word.id === id), [data.words]);

  const value = useMemo(
    () => ({
      data,
      addWords,
      addWord,
      updateWord,
      deleteWord,
      createDeck,
      updateDeck,
      deleteDeck,
      updateSettings,
      reviewWord,
      resetProgress,
      resetAll,
      importBackup,
      exportBackup,
      getDeck,
      getWord,
    }),
    [
      data,
      addWords,
      addWord,
      updateWord,
      deleteWord,
      createDeck,
      updateDeck,
      deleteDeck,
      updateSettings,
      reviewWord,
      resetProgress,
      resetAll,
      importBackup,
      exportBackup,
      getDeck,
      getWord,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
