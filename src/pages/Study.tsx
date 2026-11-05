import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Keyboard,
  Lightbulb,
  LoaderCircle,
  PenLine,
  RotateCcw,
  Sparkles,
  Target,
  Volume2,
  Waves,
  XCircle,
} from 'lucide-react';
import { HandwritingPad, type HandwritingPadHandle } from '../components/HandwritingPad';
import { CyrillicKeyboard } from '../components/CyrillicKeyboard';
import { ProgressRing } from '../components/ProgressRing';
import { useToast } from '../components/Toast';
import { useApp } from '../lib/store';
import { usePageTitle } from '../lib/usePageTitle';
import { previewIntervals } from '../lib/srs';
import { hasRussianVoice, speakRussian, stopSpeech } from '../lib/speech';
import { buildStudyPlan, isAnswerClose, isAnswerCorrect, todayKey } from '../lib/utils';
import type { Rating, StudyCard, StudyResult } from '../lib/types';

const RATINGS: Array<{ value: Rating; label: string; hint: string }> = [
  { value: 'again', label: '忘记', hint: '重新来' },
  { value: 'hard', label: '模糊', hint: '有点难' },
  { value: 'good', label: '记得', hint: '刚刚好' },
  { value: 'easy', label: '熟练', hint: '很轻松' },
];

const RATING_CLASS: Record<Rating, string> = {
  again: 'rate-again',
  hard: 'rate-hard',
  good: 'rate-good',
  easy: 'rate-easy',
};

function modeLabel(card: StudyCard): string {
  return card.mode === 'audio' ? '听写' : '中译俄';
}

export function Study() {
  usePageTitle('提背');
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { data, reviewWord } = useApp();
  const deckId = params.get('deck') ?? undefined;
  const deck = data.decks.find((item) => item.id === deckId);
  const free = params.get('free') === '1';

  const [cards, setCards] = useState<StudyCard[]>(() =>
    buildStudyPlan(data, { deckId: deck?.id, free, limit: free ? 10 : undefined }),
  );
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'answering' | 'checked'>('answering');
  const [input, setInput] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<'type' | 'hand'>('type');
  const [keyboardOpen, setKeyboardOpen] = useState(true);
  const [handBusy, setHandBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [feedbackAnswer, setFeedbackAnswer] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(() => hasRussianVoice());
  const [results, setResults] = useState<StudyResult[]>([]);
  const padRef = useRef<HandwritingPadHandle>(null);
  const startedAt = useRef(Date.now());
  const speechTimer = useRef<number | null>(null);

  const current = cards[index];
  const finished = cards.length > 0 && index >= cards.length;
  const totalWords = data.words.length;

  const firstAttempts = useMemo(() => {
    const seen = new Set<string>();
    return results.filter((result) => {
      if (seen.has(result.wordId)) return false;
      seen.add(result.wordId);
      return true;
    });
  }, [results]);

  const firstCorrect = firstAttempts.filter((result) => result.correct).length;
  const accuracy = firstAttempts.length
    ? Math.round((firstCorrect / firstAttempts.length) * 100)
    : 0;
  const missed = useMemo(() => {
    const ids = new Set(results.filter((result) => !result.correct).map((result) => result.wordId));
    return Array.from(ids)
      .map((id) => data.words.find((word) => word.id === id))
      .filter((word): word is NonNullable<typeof word> => Boolean(word));
  }, [data.words, results]);

  useEffect(() => {
    const check = () => setVoiceAvailable(hasRussianVoice());
    check();
    const timer = window.setInterval(check, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const playWord = useCallback(
    (text: string) => {
      if (!hasRussianVoice()) {
        setVoiceAvailable(false);
        setSpeaking(false);
        return;
      }
      if (speechTimer.current) window.clearTimeout(speechTimer.current);
      setSpeaking(true);
      const supported = speakRussian(text, {
        onStart: () => setSpeaking(true),
        onEnd: () => {
          setSpeaking(false);
          if (speechTimer.current) window.clearTimeout(speechTimer.current);
        },
      });
      if (!supported) {
        setSpeaking(false);
        setVoiceAvailable(false);
        toast('当前设备没有可用的俄语语音；已切换为看中文作答', 'error');
        return;
      }
      speechTimer.current = window.setTimeout(() => setSpeaking(false), 7000);
    },
    [toast],
  );

  useEffect(() => {
    setPhase('answering');
    setInput('');
    setCandidates([]);
    setCorrect(false);
    setFeedbackAnswer('');
    setHintLevel(0);
    setUsedHint(false);
    setChecking(false);
    stopSpeech();
    setSpeaking(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [index]);

  useEffect(() => {
    if (!current) return;
    if (data.settings.autoPlay && current.mode === 'audio' && voiceAvailable) {
      const timer = window.setTimeout(() => playWord(current.word.ru), 420);
      return () => window.clearTimeout(timer);
    }
  }, [current?.word.id, current?.mode, data.settings.autoPlay, voiceAvailable, playWord]);

  useEffect(() => {
    return () => {
      stopSpeech();
      if (speechTimer.current) window.clearTimeout(speechTimer.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'checked' || !current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const position = Number(event.key);
      if (position >= 1 && position <= 4) {
        event.preventDefault();
        const rating = RATINGS[position - 1].value;
        rate(rating);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const intervals = current ? previewIntervals(current.word.srs) : [];

  const hintFirstLetter = current
    ? current.word.ru.trim().charAt(0).toUpperCase()
    : '';
  const hintLetterCount = current
    ? current.word.ru.replace(/[^А-Яа-яЁё]/g, '').length
    : 0;

  async function checkAnswer() {
    if (!current || phase === 'checked' || checking) return;
    let answer = input;
    let answerCandidates = candidates;
    if (inputMode === 'hand' && !answer.trim()) {
      if (!padRef.current?.hasInk()) {
        toast('先在手写板上写点什么', 'error');
        return;
      }
      setChecking(true);
      try {
        const outcome = await padRef.current.recognize();
        if (outcome?.text) {
          answer = outcome.text;
          answerCandidates = outcome.candidates;
          setInput(outcome.text);
          setCandidates(outcome.candidates);
        }
      } finally {
        setChecking(false);
      }
    }
    if (!answer.trim()) {
      toast('先写出或输入你的答案', 'error');
      return;
    }
    const isCorrect =
      isAnswerCorrect(answer, current.word.ru) ||
      answerCandidates.some((candidate) => isAnswerCorrect(candidate, current.word.ru));
    setCorrect(isCorrect);
    setFeedbackAnswer(answer);
    setPhase('checked');
    if (data.settings.autoPlay && voiceAvailable) playWord(current.word.ru);
  }

  function revealAnswer() {
    if (!current) return;
    setCorrect(false);
    setFeedbackAnswer('');
    setPhase('checked');
    if (data.settings.autoPlay && voiceAvailable) playWord(current.word.ru);
  }

  function rate(rating: Rating) {
    if (!current || phase !== 'checked') return;
    const card = current;
    reviewWord(card.word.id, rating, correct);
    setResults((previous) => [
      ...previous,
      {
        wordId: card.word.id,
        rating,
        correct,
        mode: card.mode,
        firstTry: !card.requeued,
      },
    ]);
    if ((!correct || rating === 'again') && !card.requeued) {
      setCards((previous) => [
        ...previous,
        {
          ...card,
          mode: card.mode === 'audio' ? 'meaning' : 'audio',
          requeued: true,
        },
      ]);
    }
    stopSpeech();
    setSpeaking(false);
    setIndex((value) => value + 1);
    setPhase('answering');
  }

  function restartPractice(freeMode = true) {
    const next = buildStudyPlan(data, {
      deckId: deck?.id,
      free: freeMode,
      limit: freeMode ? 10 : undefined,
    });
    if (!next.length) {
      toast('这个词库还没有单词', 'error');
      return;
    }
    setCards(next);
    setIndex(0);
    setResults([]);
    startedAt.current = Date.now();
    setPhase('answering');
  }

  function switchMode(next: 'type' | 'hand') {
    if (next === inputMode) return;
    setInputMode(next);
    if (next === 'hand') {
      setInput('');
      setCandidates([]);
    }
    setKeyboardOpen(true);
  }

  if (!cards.length) {
    return (
      <div className="study-shell">
        <StudyTop
          label={deck?.name ?? '全部词库'}
          progress={0}
          count="0 / 0"
          onBack={() => navigate(-1)}
        />
        <div className="study-empty">
          <span className="empty-cyrillic" aria-hidden="true">
            А
          </span>
          <p className="eyebrow">Пусто · 空</p>
          <h1>{totalWords === 0 ? '还没有单词' : '今天的复习完成了'}</h1>
          <p>
            {totalWords === 0
              ? '先导入一批单词，再开始第一次听写。'
              : '没有到期的复习。可以自由练习几个词，保持语感。'}
          </p>
          <div className="study-empty-actions">
            {totalWords === 0 ? (
              <button className="btn btn-accent" onClick={() => navigate('/import')}>
                <Sparkles size={16} />
                去导入单词
              </button>
            ) : (
              <button className="btn btn-accent" onClick={() => restartPractice(true)}>
                <Sparkles size={16} />
                自由练习 10 个
              </button>
            )}
            <button className="btn btn-on-dark" onClick={() => navigate('/')}>
              回到今天
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (finished || !current) {
    return (
      <div className="study-shell summary-shell">
        <StudyTop
          label={deck?.name ?? '全部词库'}
          progress={1}
          count={`${cards.length} / ${cards.length}`}
          onBack={() => navigate('/')}
        />
        <main className="session-summary">
          <p className="eyebrow">Сессия завершена · 完成</p>
          <h1>{accuracy >= 90 ? 'Отлично.' : accuracy >= 70 ? 'Хорошо.' : 'Ещё раз.'}</h1>
          <p className="summary-subtitle">
            {accuracy >= 90
              ? '这一组记得很扎实。间隔复习会继续帮你巩固。'
              : accuracy >= 70
                ? '已经不错了。错词会在本轮末尾再出现一次。'
                : '先别急，记忆本来就需要几次往返。'}
          </p>

          <div className="summary-score">
            <ProgressRing
              value={accuracy / 100}
              size={152}
              stroke={7}
              label={`${accuracy}%`}
              sublabel="正确率"
              trackColor="rgba(246,242,234,.14)"
              color="#d86b4b"
            />
            <div className="summary-numbers">
              <div>
                <strong>
                  {firstCorrect}
                  <span> / {firstAttempts.length}</span>
                </strong>
                <small>第一次写对</small>
              </div>
              <div>
                <strong>{new Set(results.map((result) => result.wordId)).size}</strong>
                <small>练过的词</small>
              </div>
              <div>
                <strong>
                  {Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))}
                  <span> 分</span>
                </strong>
                <small>用时</small>
              </div>
            </div>
          </div>

          {missed.length > 0 && (
            <div className="missed-list">
              <div className="summary-section-head">
                <span>
                  <BookOpen size={15} />
                  本轮错词
                </span>
                <small>{missed.length} 个</small>
              </div>
              {missed.map((word) => (
                <div className="missed-row" key={word.id}>
                  <div>
                    <strong>{word.ru}</strong>
                    <span>{word.zh}</span>
                  </div>
                  <button
                    className="mini-icon-button light"
                    onClick={() => playWord(word.ru)}
                    aria-label={`朗读 ${word.ru}`}
                  >
                    <Volume2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="summary-actions">
            <button className="btn btn-accent wide" onClick={() => restartPractice(true)}>
              <Sparkles size={16} />
              再练 10 个
            </button>
            <button className="btn btn-on-dark wide" onClick={() => navigate('/')}>
              回到今天
              <ArrowRight size={16} />
            </button>
          </div>

          <p className="summary-tip">
            <Clock3 size={14} />
            下次复习时间会按你的记忆程度自动安排。
          </p>
        </main>
      </div>
    );
  }

  const closeMatch =
    phase === 'checked' && !correct && isAnswerClose(feedbackAnswer, current.word.ru);

  return (
    <div className="study-shell">
      <StudyTop
        label={`${modeLabel(current)} · ${deck?.name ?? '全部词库'}`}
        progress={(index / cards.length) * 100}
        count={`${index + 1} / ${cards.length}`}
        onBack={() => {
          stopSpeech();
          navigate(-1);
        }}
      />

      <main className="study-main">
        <div className="study-prompt">
          <div className="prompt-meta">
            {current.isNew ? (
              <span className="prompt-badge new">新词</span>
            ) : current.requeued ? (
              <span className="prompt-badge repeat">再练一次</span>
            ) : (
              <span className="prompt-badge review">复习</span>
            )}
            <span>{current.mode === 'audio' ? '听音写词' : '看中文写俄语'}</span>
          </div>

          {current.mode === 'audio' ? (
            <div className="listen-area">
              <button
                className={`listen-button ${speaking ? 'is-speaking' : ''}`}
                onClick={() => playWord(current.word.ru)}
                aria-label="播放俄语发音"
              >
                {speaking ? <Waves size={38} /> : <Volume2 size={38} />}
              </button>
              <span className="listen-caption">
                {speaking ? '正在播放…' : voiceAvailable ? '点按再听一遍' : '当前设备没有俄语语音'}
              </span>
              {!voiceAvailable && (
                <div className="listen-fallback" role="status">
                  <span>听不到也没关系，先看中文写出俄语</span>
                  <strong>{current.word.zh}</strong>
                </div>
              )}
            </div>
          ) : (
            <div className="meaning-area">
              <p className="prompt-label">中文释义</p>
              <h1>{current.word.zh}</h1>
              <p>写出对应的俄语</p>
            </div>
          )}

          {hintLevel > 0 && (
            <div className="hint-reveal" role="status">
              <Lightbulb size={15} />
              <span>
                {hintLevel === 1
                  ? `首字母是「${hintFirstLetter}」，共 ${hintLetterCount} 个字母`
                  : current.mode === 'audio'
                    ? `${current.word.zh}${current.word.transcription ? ` · ${current.word.transcription}` : ''}`
                    : current.word.transcription
                      ? `重音：${current.word.transcription}`
                      : '再看看中文，想想它在俄语里的样子'}
              </span>
            </div>
          )}
        </div>

        {phase === 'answering' ? (
          <>
            <section className={`answer-card ${inputMode === 'hand' ? 'hand-mode' : ''}`}>
              <div className="answer-card-head">
                <span>你的答案</span>
                <div className="input-switch" role="group" aria-label="输入方式">
                  <button
                    className={inputMode === 'type' ? 'active' : ''}
                    onClick={() => switchMode('type')}
                    aria-pressed={inputMode === 'type'}
                  >
                    <Keyboard size={14} />
                    键盘
                  </button>
                  <button
                    className={inputMode === 'hand' ? 'active' : ''}
                    onClick={() => switchMode('hand')}
                    aria-pressed={inputMode === 'hand'}
                  >
                    <PenLine size={14} />
                    手写
                  </button>
                </div>
              </div>

              {inputMode === 'type' ? (
                <>
                  <div className="answer-input-row">
                    <input
                      className="answer-input"
                      value={input}
                      onChange={(event) => {
                        setInput(event.target.value);
                        setCandidates([]);
                      }}
                      placeholder="在这里输入俄语"
                      lang="ru"
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      maxLength={80}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void checkAnswer();
                        }
                      }}
                      aria-label="俄语答案"
                    />
                    {input && (
                      <button
                        className="clear-answer"
                        onClick={() => {
                          setInput('');
                          setCandidates([]);
                        }}
                        aria-label="清空答案"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </div>
                  <div className="keyboard-head">
                    <span>俄语键盘</span>
                    <button className="text-button" onClick={() => setKeyboardOpen((value) => !value)}>
                      {keyboardOpen ? '收起' : '展开'}
                    </button>
                  </div>
                  {keyboardOpen && (
                    <CyrillicKeyboard
                      onKey={(key) => setInput((value) => (value + key).slice(0, 80))}
                      onBackspace={() => setInput((value) => value.slice(0, -1))}
                      onSpace={() => setInput((value) => `${value} `.slice(0, 80))}
                    />
                  )}
                </>
              ) : (
                <>
                  <HandwritingPad
                    key={index}
                    ref={padRef}
                    onText={setInput}
                    onCandidates={setCandidates}
                    onBusyChange={setHandBusy}
                  />
                  {!input.trim() && (
                    <p className="handwriting-fallback">
                      <span>手写没认出来？</span>
                      <button className="text-button" onClick={() => switchMode('type')}>
                        切换键盘输入
                      </button>
                    </p>
                  )}
                  {input.trim() && (
                    <p className="recognized-line">
                      识别为 <strong>{input}</strong>
                      <button className="text-button" onClick={() => switchMode('type')}>
                        切换键盘修改
                      </button>
                    </p>
                  )}
                </>
              )}
            </section>

            <div className="answer-helper-row">
              <button
                className="hint-button"
                onClick={() => {
                  setUsedHint(true);
                  setHintLevel((level) => Math.min(2, level + 1));
                }}
              >
                <Lightbulb size={15} />
                {hintLevel === 0 ? '提示' : hintLevel === 1 ? '再提示一点' : '已给出提示'}
              </button>
              <button className="reveal-button" onClick={revealAnswer}>
                不会，看答案
              </button>
            </div>

            <button
              className="check-button"
              onClick={() => void checkAnswer()}
              disabled={checking || handBusy}
            >
              {checking || handBusy ? (
                <>
                  <LoaderCircle size={18} className="spin" />
                  正在识别…
                </>
              ) : (
                <>
                  <Check size={19} />
                  检查答案
                </>
              )}
            </button>
          </>
        ) : (
          <section className={`feedback-panel ${correct ? 'is-correct' : 'is-wrong'}`} aria-live="polite">
            <div className="feedback-head">
              <span className="feedback-icon">
                {correct ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
              </span>
              <div>
                <strong>{correct ? '写对了' : closeMatch ? '很接近了' : '这次没写对'}</strong>
                <small>
                  {correct
                    ? '趁记忆还热，告诉我想起的难度。'
                    : feedbackAnswer
                      ? `你的答案：${feedbackAnswer}`
                      : '先看一遍正确答案，再记住它。'}
                </small>
              </div>
              {usedHint && <span className="hint-used">用了提示</span>}
            </div>

            <div className="answer-reveal">
              <div className="reveal-main">
                <h2>{current.word.ru}</h2>
                {current.word.transcription && (
                  <span className="transcription">{current.word.transcription}</span>
                )}
                <p>{current.word.zh}</p>
              </div>
              <button
                className={`round-play ${speaking ? 'is-speaking' : ''}`}
                onClick={() => playWord(current.word.ru)}
                aria-label="播放单词发音"
              >
                <Volume2 size={20} />
              </button>
            </div>

            {current.word.exampleRu && (
              <div className="example-box">
                <p>{current.word.exampleRu}</p>
                {current.word.exampleZh && <span>{current.word.exampleZh}</span>}
              </div>
            )}

            <div className="rating-block">
              <div className="rating-head">
                <span>这次记得怎么样？</span>
                <small>决定下次复习时间</small>
              </div>
              <div className="rating-grid">
                {RATINGS.map(({ value, label, hint }, ratingIndex) => {
                  const preview = intervals.find((item) => item.rating === value);
                  const recommended =
                    (!correct && value === 'again') || (correct && value === 'good');
                  return (
                    <button
                      key={value}
                      className={`rate-button ${RATING_CLASS[value]} ${recommended ? 'recommended' : ''}`}
                      onClick={() => rate(value)}
                    >
                      <span className="rate-dot" />
                      <strong>{label}</strong>
                      <small>{preview?.label ?? hint}</small>
                      <kbd>{ratingIndex + 1}</kbd>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="study-footer">
        <span>
          <Target size={14} />
          {data.stats.daily[todayKey()]?.reviewed ?? 0} /{' '}
          {data.settings.dailyGoal} 今日
        </span>
        <span>
          <Sparkles size={14} />
          间隔重复
        </span>
      </footer>
    </div>
  );
}

function StudyTop({
  label,
  progress,
  count,
  onBack,
}: {
  label: string;
  progress: number;
  count: string;
  onBack: () => void;
}) {
  return (
    <header className="study-top">
      <button className="study-back" onClick={onBack} aria-label="退出练习">
        <ArrowLeft size={20} />
      </button>
      <div className="study-progress-wrap">
        <div className="study-progress">
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <span>{label}</span>
      </div>
      <span className="study-count">{count}</span>
    </header>
  );
}
