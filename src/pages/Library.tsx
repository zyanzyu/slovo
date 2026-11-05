import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { usePageTitle } from '../lib/usePageTitle';
import { getDeckStats } from '../lib/utils';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

export function Library() {
  usePageTitle('词库');
  const navigate = useNavigate();
  const toast = useToast();
  const { data, createDeck } = useApp();
  const [query, setQuery] = useState('');
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckSubtitle, setDeckSubtitle] = useState('');
  const [error, setError] = useState('');

  const search = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!search) return [];
    return data.words.filter((word) => {
      const ru = word.ru.toLowerCase().replace(/ё/g, 'е');
      const q = search.replace(/ё/g, 'е');
      return (
        ru.includes(q) ||
        word.zh.toLowerCase().includes(search) ||
        word.transcription?.toLowerCase().includes(search)
      );
    });
  }, [data.words, search]);

  const totalMastered = data.words.filter((word) => word.srs.mastery >= 4).length;

  const handleCreate = () => {
    if (!deckName.trim()) {
      setError('给词库起一个名字');
      return;
    }
    const deck = createDeck(deckName.trim(), deckSubtitle.trim() || '自己收集的单词');
    setNewDeckOpen(false);
    setDeckName('');
    setDeckSubtitle('');
    setError('');
    toast('词库已创建', 'success');
    navigate(`/library/${deck.id}`);
  };

  return (
    <div className="page library-page">
      <header className="page-header">
        <p className="eyebrow">Библиотека · 收藏</p>
        <h1>词库</h1>
        <p className="page-lead">
          {data.decks.length} 个词库 · {data.words.length} 个单词
          {totalMastered ? ` · 已掌握 ${totalMastered}` : ''}
        </p>
      </header>

      <div className="page-actions">
        <Link to="/import" className="btn btn-outline grow">
          <Upload size={16} />
          导入单词
        </Link>
        <button className="btn btn-primary grow" onClick={() => setNewDeckOpen(true)}>
          <Plus size={16} />
          新建词库
        </button>
      </div>

      <div className="search-bar">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索单词、释义或音标"
          aria-label="搜索全部单词"
        />
      </div>

      {search ? (
        <section className="search-results">
          <div className="section-heading">
            <h2>搜索结果</h2>
            <span>{results.length} 个词</span>
          </div>
          <div className="word-list">
            {results.slice(0, 80).map((word) => {
              const deck = data.decks.find((item) => item.id === word.deckId);
              return (
                <Link to={`/library/${word.deckId}`} className="word-row link-row" key={word.id}>
                  <span className="word-row-copy">
                    <span className="word-row-primary">
                      <strong>{word.ru}</strong>
                      {word.transcription && <em>{word.transcription}</em>}
                    </span>
                    <small>{word.zh}</small>
                  </span>
                  <span className="deck-chip">{deck?.name ?? '未分类'}</span>
                  <ChevronRight size={16} className="row-arrow" />
                </Link>
              );
            })}
            {!results.length && (
              <div className="empty-state compact-empty">
                <Search size={26} strokeWidth={1.5} />
                <h3>没有找到这个词</h3>
                <p>试试俄语拼写，或者中文释义。</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="library-decks">
            <div className="section-heading">
              <h2>全部词库</h2>
              <span>按自己的节奏</span>
            </div>
            <div className="deck-library-list">
              {data.decks.map((deck, index) => {
                const words = data.words.filter((word) => word.deckId === deck.id);
                const stats = getDeckStats(words);
                return (
                  <Link to={`/library/${deck.id}`} className="deck-card" key={deck.id}>
                    <span className={`deck-cover cover-${deck.color} large`}>
                      <small>{String(index + 1).padStart(2, '0')}</small>
                      <b>{['А', 'Б', 'В', 'Г', 'Д', 'Е'][index % 6]}</b>
                    </span>
                    <span className="deck-card-copy">
                      <strong>{deck.name}</strong>
                      <small>{deck.subtitle}</small>
                      <span className="deck-card-meta">
                        <span>{words.length} 个词</span>
                        {stats.due > 0 && <span className="meta-due">{stats.due} 待复习</span>}
                        {stats.mastered > 0 && <span>{stats.mastered} 已掌握</span>}
                      </span>
                      <span className="mini-progress">
                        <i style={{ width: `${stats.progress}%` }} />
                      </span>
                    </span>
                    <ChevronRight size={18} className="row-arrow" />
                  </Link>
                );
              })}
              <button
                className="new-deck-card"
                onClick={() => {
                  setError('');
                  setNewDeckOpen(true);
                }}
              >
                <span className="new-deck-icon">
                  <Plus size={20} />
                </span>
                <span>
                  <strong>新建一个词库</strong>
                  <small>把同一主题的词放在一起</small>
                </span>
              </button>
            </div>
          </section>

          <section className="library-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <div>
              <strong>一句建议</strong>
              <p>每次只练 10–15 个词，先回忆再看答案，比反复阅读更有效。</p>
            </div>
            <BookOpen size={32} strokeWidth={1.2} className="tip-art" />
          </section>
        </>
      )}

      <Modal
        open={newDeckOpen}
        onClose={() => setNewDeckOpen(false)}
        eyebrow="新词库"
        title="给单词一个主题"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setNewDeckOpen(false)}>
              取消
            </button>
            <button type="submit" form="new-deck-form" className="btn btn-primary">
              创建词库
            </button>
          </>
        }
      >
        <form
          id="new-deck-form"
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <label className="field">
            <span>词库名称</span>
            <input
              value={deckName}
              onChange={(event) => {
                setDeckName(event.target.value);
                setError('');
              }}
              placeholder="例如：厨房里的俄语"
              maxLength={28}
            />
          </label>
          <label className="field">
            <span>一句介绍 <em>可选</em></span>
            <input
              value={deckSubtitle}
              onChange={(event) => setDeckSubtitle(event.target.value)}
              placeholder="例如：从早餐开始学"
              maxLength={48}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
        </form>
      </Modal>
    </div>
  );
}
