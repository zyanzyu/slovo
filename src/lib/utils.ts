import type { StoreData, StudyCard, StudyMode, Word } from './types';

export const DAY = 86_400_000;

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function yesterdayKey(): string {
  return todayKey(new Date(Date.now() - DAY));
}

export function normalizeRu(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\u0301/g, '')
    .normalize('NFC')
    .replace(/[^а-яa-z0-9\s-]/gi, '')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function isAnswerCorrect(input: string, target: string): boolean {
  const a = normalizeRu(input);
  const b = normalizeRu(target);
  if (!a) return false;
  if (a === b) return true;
  const distance = levenshtein(a, b);
  if (b.length >= 8) return distance <= 1;
  return false;
}

export function isAnswerClose(input: string, target: string): boolean {
  const a = normalizeRu(input);
  const b = normalizeRu(target);
  if (!a) return false;
  if (a === b) return true;
  return levenshtein(a, b) <= Math.max(1, Math.floor(b.length * 0.18));
}

export function getDeckWords(data: StoreData, deckId: string): Word[] {
  return data.words.filter((word) => word.deckId === deckId);
}

export function getDeckStats(words: Word[]) {
  const now = Date.now();
  const due = words.filter((w) => w.srs.reps > 0 && w.srs.due <= now).length;
  const fresh = words.filter((w) => w.srs.reps === 0).length;
  const mastered = words.filter((w) => w.srs.mastery >= 4).length;
  const started = words.filter((w) => w.srs.reps > 0).length;
  const progress = words.length ? Math.round((started / words.length) * 100) : 0;
  return { due, new: fresh, mastered, started, progress };
}

export function getStudySummary(data: StoreData, deckId?: string) {
  const scope = deckId ? data.words.filter((w) => w.deckId === deckId) : data.words;
  const now = Date.now();
  const due = scope.filter((w) => w.srs.reps > 0 && w.srs.due <= now);
  const fresh = scope.filter((w) => w.srs.reps === 0);
  const today = data.stats.daily[todayKey()];
  const learnedToday = today?.newWords ?? 0;
  const newLeft = Math.max(0, data.settings.newPerDay - learnedToday);
  const goalDone = today?.reviewed ?? 0;
  return {
    due: due.length,
    fresh: fresh.length,
    newLeft,
    goalDone,
    goal: data.settings.dailyGoal,
    total: scope.length,
  };
}

export function buildStudyPlan(
  data: StoreData,
  options: { mode?: StudyMode; deckId?: string; free?: boolean; limit?: number } = {},
): StudyCard[] {
  const now = Date.now();
  const today = data.stats.daily[todayKey()];
  const learnedToday = today?.newWords ?? 0;
  const newLeft = Math.max(0, data.settings.newPerDay - learnedToday);
  const mode = options.mode ?? data.settings.defaultMode;
  let pool = options.deckId ? data.words.filter((w) => w.deckId === options.deckId) : data.words;

  let due: Word[];
  let fresh: Word[];

  if (options.free) {
    due = [...pool].sort(() => Math.random() - 0.5);
    fresh = [];
  } else {
    due = pool
      .filter((w) => w.srs.reps > 0 && w.srs.due <= now)
      .sort((a, b) => a.srs.due - b.srs.due);
    fresh = pool
      .filter((w) => w.srs.reps === 0)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, newLeft);
  }

  const targetSize = options.limit ?? Math.max(data.settings.dailyGoal, options.free ? 10 : 8);
  due = due.slice(0, Math.max(targetSize, 12));
  fresh = fresh.slice(0, newLeft);

  const merged: Word[] = [];
  const maxCards = options.free ? targetSize : Math.min(targetSize + 4, 20);
  let d = 0;
  let n = 0;
  while (merged.length < maxCards && (d < due.length || n < fresh.length)) {
    if (d < due.length) merged.push(due[d++]);
    if (merged.length < maxCards && n < fresh.length) merged.push(fresh[n++]);
  }

  const capped = merged;

  return capped.map((word, index) => {
    const cardMode =
      mode === 'mixed' ? (index % 2 === 0 ? 'audio' : 'meaning') : mode;
    return {
      word,
      mode: cardMode as 'audio' | 'meaning',
      isNew: word.srs.reps === 0,
    };
  });
}

export function formatNextReview(due: number): string {
  const diff = due - Date.now();
  if (diff <= 0) return '现在';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? '明天' : `${days} 天后`;
}

export function formatInterval(days: number): string {
  if (days <= 0.01) return '10 分钟';
  if (days < 1) return `${Math.round(days * 24)} 小时`;
  if (days < 30) return `${Math.round(days)} 天`;
  if (days < 365) return `${Math.round(days / 30)} 个月`;
  return `${(days / 365).toFixed(1)} 年`;
}

export function dateLabel(date = new Date()): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${weekdays[date.getDay()]} · ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function uid(prefix = ''): string {
  return `${prefix}${crypto.randomUUID()}`;
}
