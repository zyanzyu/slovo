import type { DayStat, Rating, SrsState, Stats, Word } from './types';
import { DAY, formatInterval, todayKey, yesterdayKey } from './utils';

export interface NextInterval {
  rating: Rating;
  days: number;
  label: string;
  ease: number;
}

export function previewIntervals(srs: SrsState): NextInterval[] {
  const base = Math.max(0, srs.interval);
  const ease = Math.max(1.3, srs.ease);
  const intervals: Record<Rating, number> = {
    again: 10 / (24 * 60),
    hard: srs.reps === 0 ? 1 : Math.max(1, base * 1.2),
    good: srs.reps === 0 ? 1 : base < 1 ? 2 : Math.max(2, base * ease),
    easy: srs.reps === 0 ? 3 : Math.max(4, base * ease * 1.3),
  };
  return (['again', 'hard', 'good', 'easy'] as Rating[]).map((rating) => ({
    rating,
    days: intervals[rating],
    label: formatInterval(intervals[rating]),
    ease,
  }));
}

export function scheduleReview(word: Word, rating: Rating, now = Date.now()): Word {
  const srs = { ...word.srs };
  const oldInterval = Math.max(0, srs.interval);
  const oldEase = Math.max(1.3, srs.ease);
  let interval = oldInterval;

  if (rating === 'again') {
    interval = 10 / (24 * 60);
    srs.ease = Math.max(1.3, oldEase - 0.2);
    srs.lapses += 1;
    srs.mastery = Math.max(0, srs.mastery - 1);
  } else if (rating === 'hard') {
    interval = srs.reps === 0 ? 1 : Math.max(1, oldInterval * 1.2);
    srs.ease = Math.max(1.3, oldEase - 0.15);
  } else if (rating === 'good') {
    interval = srs.reps === 0 ? 1 : oldInterval < 1 ? 2 : Math.max(2, oldInterval * oldEase);
    srs.ease = oldEase;
    srs.mastery = Math.min(5, srs.mastery + 1);
  } else {
    interval = srs.reps === 0 ? 3 : Math.max(4, oldInterval * oldEase * 1.3);
    srs.ease = Math.min(3.2, oldEase + 0.15);
    srs.mastery = Math.min(5, srs.mastery + 2);
  }

  srs.interval = Math.min(interval, 730);
  srs.due = now + Math.min(interval, 730) * DAY;
  srs.reps += 1;
  srs.lastReviewed = now;
  if (!srs.firstReviewedAt) srs.firstReviewedAt = now;

  return { ...word, srs };
}

export function recordStudyStats(
  stats: Stats,
  word: Word,
  correct: boolean,
  now = Date.now(),
): Stats {
  const today = todayKey(new Date(now));
  const day: DayStat = stats.daily[today]
    ? { ...stats.daily[today] }
    : { reviewed: 0, correct: 0, newWords: 0 };

  day.reviewed += 1;
  if (correct) day.correct += 1;
  if (word.srs.reps === 0) day.newWords += 1;

  let streak = stats.streak;
  if (stats.lastStudyDate !== today) {
    streak = stats.lastStudyDate === yesterdayKey() ? stats.streak + 1 : 1;
  }

  return {
    ...stats,
    streak,
    lastStudyDate: today,
    daily: { ...stats.daily, [today]: day },
    totalReviews: stats.totalReviews + 1,
    totalCorrect: stats.totalCorrect + (correct ? 1 : 0),
  };
}
