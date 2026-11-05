import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { usePageTitle } from '../lib/usePageTitle';
import { getDeckStats, formatNextReview } from '../lib/utils';
import { WordEditor } from '../components/WordEditor';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { Word } from '../lib/types';

function DeckCover({ color, number, letter }: { color: string; number: number; letter: string }) {
  return (
    <span className={`deck-cover cover-${color} large`}>
      <small>{String(number + 1).padStart(2, '0')}</small>
      <b>{letter}</b>
    </span>
  );
}

function WordStatus({ word }: { word: Word }) {
  const now = Date.now();
  if (word.srs.reps === 0) return <span className="word-status new">新词</span>;
  if (word.srs.due <= now) return <span className="word-status due">待复习</span>;
  if (word.srs.mastery >= 4) return <span className="word-status mastered">已掌握</span>;
  return <span className="word-status learning">{formatNextReview(word.srs.due)}</span>;
}

export function DeckDetail() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, deleteDeck } = useApp();
  const deck = data.decks.find((item) => item.id === deckId);
  usePageTitle(deck?.name ?? '词库');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const words = useMemo(
    () => data.words.filter((word) => word.deckId === deckId),
    [data.words, deckId],
  );
  const stats = getDeckStats(words);
  const query = search.trim().toLowerCase();
  const filtered = query
    ? words.filter(
        (word) =>
          word.ru.toLowerCase().includes(query) ||
          word.zh.toLowerCase().includes(query) ||
          word.transcription?.toLowerCase().includes(query),
      )
    : words;

  if (!deck) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>找不到这个词库</h2>
          <p>它可能已经被删除了。</p>
          <Link className="btn btn-primary" to="/library">
            返回词库
          </Link>
        </div>
      </div>
    );
  }

  const deckIndex = data.decks.findIndex((item) => item.id === deck.id);
  const letter = ['А', 'Б', 'В', 'Г', 'Д'][deckIndex % 5] ?? 'А';

  return (
    <div className="page deck-detail-page">
      <header className="subpage-head">
        <button className="icon-button quiet" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={19} />
        </button>
        <span className="subpage-title">词库</span>
        <button
          className="icon-button quiet"
          onClick={() => {
            setEditingWord(null);
            setEditorOpen(true);
          }}
          aria-label="添加单词"
        >
          <Plus size={20} />
        </button>
      </header>

      <section className="deck-hero">
        <DeckCover color={deck.color} number={deckIndex} letter={letter} />
        <div className="deck-hero-copy">
          <p>{String(deckIndex + 1).padStart(2, '0')} · 词库</p>
          <h1>{deck.name}</h1>
          <span>{deck.subtitle}</span>
        </div>
      </section>

      <div className="deck-stat-row">
        <div>
          <strong>{words.length}</strong>
          <span>总词数</span>
        </div>
        <div>
          <strong>{stats.due}</strong>
          <span>待复习</span>
        </div>
        <div>
          <strong>{stats.mastered}</strong>
          <span>已掌握</span>
        </div>
        <div>
          <strong>{stats.progress}%</strong>
          <span>已开始</span>
        </div>
      </div>

      <div className="deck-actions">
        <button
          className="btn btn-primary grow"
          disabled={!words.length}
          onClick={() => navigate(`/study?deck=${deck.id}`)}
        >
          <Sparkles size={16} />
          练习本词库
        </button>
        <Link to={`/import?deck=${deck.id}`} className="btn btn-outline" aria-label="导入到本词库">
          <ArrowRight size={17} />
        </Link>
      </div>

      {words.length > 6 && (
        <div className="search-bar">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索俄语或中文"
            aria-label="搜索单词"
          />
        </div>
      )}

      <div className="word-list">
        {filtered.map((word, index) => (
          <button
            className="word-row"
            key={word.id}
            onClick={() => {
              setEditingWord(word);
              setEditorOpen(true);
            }}
          >
            <span className="word-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="word-row-copy">
              <span className="word-row-primary">
                <strong>{word.ru}</strong>
                {word.transcription && <em>{word.transcription}</em>}
              </span>
              <small>{word.zh}</small>
            </span>
            <WordStatus word={word} />
            <ChevronRight size={16} className="row-arrow" />
          </button>
        ))}
        {!filtered.length && (
          <div className="empty-state compact-empty">
            <BookOpen size={28} strokeWidth={1.5} />
            <h3>{query ? '没有匹配的单词' : '这个词库还是空的'}</h3>
            <p>{query ? '换个关键词试试。' : '添加一个词，或从文本、照片、文件导入。'}</p>
            {!query && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingWord(null);
                  setEditorOpen(true);
                }}
              >
                <Plus size={16} />
                添加第一个词
              </button>
            )}
          </div>
        )}
      </div>

      <div className="danger-zone">
        <button className="text-button danger-text" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} />
          删除这个词库
        </button>
      </div>

      <WordEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        deckId={deck.id}
        word={editingWord}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`删除「${deck.name}」？`}
        description={`词库中的 ${words.length} 个单词和学习记录都会被删除，操作无法撤销。`}
        confirmLabel="删除词库"
        onConfirm={() => {
          deleteDeck(deck.id);
          toast('词库已删除');
          navigate('/library');
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
