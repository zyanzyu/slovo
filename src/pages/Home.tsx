import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Flame,
  Headphones,
  Languages,
  Shuffle,
  Sparkles,
  Target,
  Waves,
} from 'lucide-react';
import { useApp } from '../lib/store';
import {
  dateLabel,
  getDeckStats,
  getStudySummary,
  greeting,
  todayKey,
} from '../lib/utils';
import { ProgressRing } from '../components/ProgressRing';
import { usePageTitle } from '../lib/usePageTitle';
import type { StudyMode } from '../lib/types';

const modes: Array<{
  value: StudyMode;
  name: string;
  description: string;
  icon: typeof Headphones;
}> = [
  { value: 'audio', name: '听写', description: '听音写词', icon: Headphones },
  { value: 'meaning', name: '中译俄', description: '看义写词', icon: Languages },
  { value: 'mixed', name: '混合', description: '交替训练', icon: Shuffle },
];

export function Home() {
  usePageTitle('今天');
  const navigate = useNavigate();
  const { data, updateSettings } = useApp();
  const summary = getStudySummary(data);
  const today = data.stats.daily[todayKey()];
  const reviewed = today?.reviewed ?? 0;
  const goalProgress = data.settings.dailyGoal ? reviewed / data.settings.dailyGoal : 0;
  const newCount = Math.min(summary.fresh, summary.newLeft);
  const planCount = summary.due + newCount;
  const accuracy = data.stats.totalReviews
    ? Math.round((data.stats.totalCorrect / data.stats.totalReviews) * 100)
    : null;
  const mastered = data.words.filter((word) => word.srs.mastery >= 4).length;
  const previewDecks = data.decks.slice(0, 3);

  const primaryTarget = summary.total === 0 ? '/import' : planCount > 0 ? '/study' : '/study?free=1';
  const primaryLabel = summary.total === 0 ? '导入第一批单词' : planCount > 0 ? '开始提背' : '自由练习';

  return (
    <div className="page home-page">
      <header className="brand-row">
        <Link to="/" className="wordmark" aria-label="СЛОВО 首页">
          СЛОВО<span>.</span>
        </Link>
        <div className="brand-actions">
          <span className={`streak-pill ${data.stats.streak ? 'is-lit' : ''}`}>
            <Flame size={14} />
            {data.stats.streak ? `${data.stats.streak} 天` : '连续 0 天'}
          </span>
        </div>
      </header>

      <section className="hero">
        <p className="hero-kicker">
          <span>{greeting()}</span>
          <span className="kicker-sep" />
          <span>{dateLabel()}</span>
        </p>
        <h1 className="hero-title">
          Слово
          <br />
          <em>за словом.</em>
        </h1>
        <p className="hero-subtitle">一天一点，把俄语写进记忆。先回忆，再揭晓答案。</p>
      </section>

      <section className="plan-card" aria-labelledby="today-plan-title">
        <div className="plan-watermark" aria-hidden="true">
          Ж
        </div>
        <div className="plan-top">
          <div className="plan-copy">
            <p className="plan-label">今日计划</p>
            <h2 className="plan-title" id="today-plan-title">
              {summary.total === 0
                ? '从第一个词开始'
                : planCount
                  ? `还有 ${planCount} 个词`
                  : '今天的复习完成了'}
            </h2>
            <p className="plan-note">
              {summary.total === 0
                ? '粘贴单词、上传表格，或者拍一张你的单词书。'
                : planCount
                  ? '先凭记忆写出答案，再用间隔重复把它们留得更久。'
                  : '记忆正在巩固。自由练习不计入新词，只保持手感。'}
            </p>
          </div>
          <ProgressRing
            value={goalProgress}
            label={`${reviewed}`}
            sublabel={`/ ${data.settings.dailyGoal}`}
            size={78}
            stroke={5}
          />
        </div>
        <div className="plan-chips">
          <span className="plan-chip">
            <Waves size={14} />
            {summary.due} 待复习
          </span>
          <span className="plan-chip">
            <Sparkles size={14} />
            {newCount} 个新词
          </span>
        </div>
        <button className="plan-cta" onClick={() => navigate(primaryTarget)}>
          <span>{primaryLabel}</span>
          <span className="plan-cta-icon">
            <ArrowRight size={19} />
          </span>
        </button>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <h2>怎么练</h2>
          <span>换一种回忆方式</span>
        </div>
        <div className="mode-grid">
          {modes.map(({ value, name, description, icon: Icon }) => (
            <button
              key={value}
              className={`mode-card ${data.settings.defaultMode === value ? 'active' : ''}`}
              onClick={() => updateSettings({ defaultMode: value })}
              aria-pressed={data.settings.defaultMode === value}
            >
              <Icon size={21} strokeWidth={1.7} />
              <span>
                <strong>{name}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="stat-strip" aria-label="学习统计">
        <div className="stat-item">
          <span className="stat-icon">
            <Flame size={17} />
          </span>
          <strong>{data.stats.streak}</strong>
          <span>连续天数</span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">
            <Target size={17} />
          </span>
          <strong>{accuracy === null ? '—' : `${accuracy}%`}</strong>
          <span>累计正确率</span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">
            <BookOpen size={17} />
          </span>
          <strong>{mastered}</strong>
          <span>已掌握</span>
        </div>
      </section>

      <section className="home-section decks-section">
        <div className="section-heading">
          <h2>你的词库</h2>
          <Link to="/library" className="text-link">
            全部 {data.words.length} 词
          </Link>
        </div>
        <div className="deck-list compact">
          {previewDecks.map((deck, index) => {
            const words = data.words.filter((word) => word.deckId === deck.id);
            const stats = getDeckStats(words);
            return (
              <Link to={`/library/${deck.id}`} className="deck-row" key={deck.id}>
                <span className={`deck-cover cover-${deck.color}`}>
                  <small>0{index + 1}</small>
                  <b>{['А', 'Б', 'В'][index] ?? 'Г'}</b>
                </span>
                <span className="deck-row-copy">
                  <strong>{deck.name}</strong>
                  <small>
                    {words.length} 个词 · {stats.progress}% 开始学习
                  </small>
                  <span className="mini-progress">
                    <i style={{ width: `${stats.progress}%` }} />
                  </span>
                </span>
                <ArrowRight size={18} className="row-arrow" />
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="proverb">
        <p>Повторение — мать учения.</p>
        <span>重复是学习之母。</span>
      </footer>
    </div>
  );
}
