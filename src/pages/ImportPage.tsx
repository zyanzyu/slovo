import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  ChevronDown,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  ScanLine,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  X,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { usePageTitle } from '../lib/usePageTitle';
import { parseVocabularyText, type ParsedEntry } from '../lib/parse';
import { extractEntriesFromFile } from '../lib/files';
import { recognizeImageFile } from '../lib/ocr';
import { normalizeRu } from '../lib/utils';
import { useToast } from '../components/Toast';

type Source = 'text' | 'camera' | 'photo' | 'file';
type Progress = { value: number; label: string } | null;

const sources: Array<{ id: Source; label: string; hint: string; icon: typeof Type }> = [
  { id: 'text', label: '文字', hint: '粘贴单词表', icon: Type },
  { id: 'camera', label: '拍照', hint: '拍下单词书', icon: Camera },
  { id: 'photo', label: '照片', hint: '上传图片', icon: ImageIcon },
  { id: 'file', label: '文件', hint: 'TXT / PDF / Excel', icon: FileText },
];

const SAMPLE = `привет — 你好
спасибо — 谢谢
до свидания — 再见
извините — 对不起；请问
как дела — 最近怎么样`;

export function ImportPage() {
  usePageTitle('导入');
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { data, addWords, createDeck } = useApp();
  const queryDeck = params.get('deck');
  const defaultDeck =
    queryDeck && data.decks.some((deck) => deck.id === queryDeck)
      ? queryDeck
      : (data.decks[0]?.id ?? '__new__');

  const [source, setSource] = useState<Source>('text');
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [rawText, setRawText] = useState('');
  const [fileKind, setFileKind] = useState('');
  const [fileName, setFileName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState('');
  const [includeChinese, setIncludeChinese] = useState(true);
  const [deckId, setDeckId] = useState(defaultDeck);
  const [newDeckName, setNewDeckName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const previewRef = useRef<HTMLElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data.decks.some((deck) => deck.id === deckId) && deckId !== '__new__') {
      setDeckId(data.decks[0]?.id ?? '__new__');
    }
  }, [data.decks, deckId]);

  useEffect(() => {
    if (entries.length) {
      window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, [entries.length]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const existingKeys = useMemo(
    () => new Set(data.words.map((word) => normalizeRu(word.ru))),
    [data.words],
  );
  const duplicateCount = entries.filter((entry) => existingKeys.has(normalizeRu(entry.ru))).length;
  const validCount = entries.filter((entry) => entry.ru.trim()).length;

  function resetParsed() {
    setEntries([]);
    setRawText('');
    setFileKind('');
    setFileName('');
    setError('');
    setProgress(null);
  }

  function switchSource(next: Source) {
    setSource(next);
    resetParsed();
    if (next !== 'photo' && next !== 'camera') {
      setImageUrl('');
      setImageFile(null);
    }
  }

  function acceptEntries(nextEntries: ParsedEntry[], kind: string, raw: string) {
    setEntries(nextEntries);
    setFileKind(kind);
    setRawText(raw);
    if (!nextEntries.length) {
      setError('没有找到「俄语 — 释义」格式的词条。可以在下方修正识别文字，再重新解析。');
    } else {
      setError('');
    }
  }

  function handleParseText() {
    if (!text.trim()) {
      setError('先粘贴一些单词吧');
      return;
    }
    const parsed = parseVocabularyText(text);
    if (!parsed.length) {
      setError('没有解析出俄语单词。每行可以写成「привет — 你好」。');
      return;
    }
    acceptEntries(parsed, '文字', text);
  }

  function handleReparseRaw() {
    const parsed = parseVocabularyText(rawText);
    if (!parsed.length) {
      setError('修正后的文字里还没有识别出词条。');
      return;
    }
    setEntries(parsed);
    setError('');
  }

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setEntries([]);
    setRawText('');
    setError('');
    setFileName(file.name);
    setFileKind('图片 OCR');
    setProgress({ value: 0.02, label: '准备识别图片' });
    try {
      const result = await recognizeImageFile(file, {
        chinese: includeChinese,
        onProgress: (value, label) => setProgress({ value, label }),
      });
      setProgress({ value: 1, label: '识别完成' });
      if (!result.text.trim()) {
        setError('这张图里没有识别到文字，试试在光线更好的地方重拍。');
        setRawText('');
        return;
      }
      setRawText(result.text);
      const parsed = parseVocabularyText(result.text);
      setEntries(parsed);
      setFileKind('图片 OCR');
      if (!parsed.length) {
        setError('识别出了文字，但还没找到词对。请在下方修正格式，再点「重新解析」。');
      }
    } catch (err) {
      console.error(err);
      setError('图片识别失败，请换一张更清晰的照片，或使用文字导入。');
      setProgress(null);
    } finally {
      window.setTimeout(() => setProgress(null), 500);
    }
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setEntries([]);
    setRawText('');
    setError('');
    setProgress({ value: 0.25, label: '解析文件' });
    try {
      const result = await extractEntriesFromFile(file);
      setProgress({ value: 1, label: '解析完成' });
      acceptEntries(result.entries, result.kind, result.rawText);
      if (!result.entries.length) {
        setError('文件里没有找到俄语词条。请确认格式，或把内容粘贴到「文字」导入。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件解析失败');
      setRawText('');
    } finally {
      window.setTimeout(() => setProgress(null), 500);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (source === 'file') void handleFile(file);
    else void handleImageFile(file);
  }

  function updateEntry(index: number, patch: Partial<ParsedEntry>) {
    setEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );
    setError('');
  }

  function removeEntry(index: number) {
    setEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  function addEntry() {
    setEntries((current) => [...current, { ru: '', zh: '', source: '手动添加' }]);
  }

  function handleImport() {
    const cleanEntries = entries.filter((entry) => entry.ru.trim());
    if (!cleanEntries.length) {
      setError('至少需要一个俄语单词');
      return;
    }
    setImporting(true);
    let targetDeck = deckId;
    if (deckId === '__new__') {
      const deck = createDeck(newDeckName.trim() || '我的词库', '通过导入创建');
      targetDeck = deck.id;
    }
    const result = addWords(
      cleanEntries.map((entry) => ({
        ru: entry.ru,
        zh: entry.zh,
        transcription: entry.transcription,
      })),
      targetDeck,
    );
    setImporting(false);
    if (!result.added) {
      toast(result.skipped ? '这些单词都已经在词库里了' : '没有可导入的单词', 'error');
      return;
    }
    toast(
      `已导入 ${result.added} 个单词${result.skipped ? `，跳过 ${result.skipped} 个重复项` : ''}`,
      'success',
    );
    navigate(`/library/${targetDeck}`);
  }

  const sourceMeta = sources.find((item) => item.id === source)!;
  const isProcessing = Boolean(progress && progress.value < 1);
  const showPreview = entries.length > 0;

  return (
    <div className="page import-page">
      <header className="page-header">
        <p className="eyebrow">Добавить · 添加</p>
        <h1>导入单词</h1>
        <p className="page-lead">
          文字、照片、文件都可以。识别后先预览，再放进你的词库。
        </p>
      </header>

      <div className="source-tabs" role="tablist" aria-label="导入方式">
        {sources.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={source === id}
            className={`source-tab ${source === id ? 'active' : ''}`}
            onClick={() => switchSource(id)}
          >
            <span className="source-icon">
              <Icon size={19} strokeWidth={1.7} />
            </span>
            <strong>{label}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>

      <section className="import-panel">
        <div className="import-panel-head">
          <div>
            <p className="eyebrow">{sourceMeta.label}导入</p>
            <h2>{sourceMeta.hint}</h2>
          </div>
          {source === 'text' && (
            <button className="text-button" onClick={() => setText(SAMPLE)}>
              填入示例
            </button>
          )}
        </div>

        {source === 'text' && (
          <div className="text-import">
            <textarea
              className="import-textarea"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setError('');
              }}
              placeholder={`每行一个词，例如：\n\nпривет — 你好\nспасибо — 谢谢\nкнига, 书`}
              rows={10}
              lang="ru"
            />
            <div className="import-help">
              <span>支持空格、逗号、分号、制表符、破折号分隔</span>
              <span>{text.trim() ? `${text.trim().split('\n').length} 行` : '等待输入'}</span>
            </div>
            <button className="btn btn-primary wide" onClick={handleParseText}>
              <Sparkles size={16} />
              解析单词
            </button>
          </div>
        )}

        {(source === 'camera' || source === 'photo') && (
          <div className="image-import">
            <input
              ref={source === 'camera' ? cameraRef : photoRef}
              type="file"
              accept="image/*"
              capture={source === 'camera' ? 'environment' : undefined}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImageFile(file);
                event.target.value = '';
              }}
            />
            <div
              className={`dropzone ${dragActive ? 'drag-active' : ''} ${imageUrl ? 'has-image' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => (source === 'camera' ? cameraRef : photoRef).current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  (source === 'camera' ? cameraRef : photoRef).current?.click();
                }
              }}
            >
              {imageUrl ? (
                <>
                  <img src={imageUrl} alt="待识别的单词照片" className="dropzone-preview" />
                  <div className="image-overlay">
                    <span>点按更换图片</span>
                  </div>
                </>
              ) : (
                <div className="dropzone-empty">
                  <span className="dropzone-icon">
                    {source === 'camera' ? <Camera size={28} /> : <ImageIcon size={28} />}
                  </span>
                  <strong>{source === 'camera' ? '拍一张单词书' : '上传单词表照片'}</strong>
                  <small>支持 JPG、PNG、WebP，尽量保持文字清晰</small>
                </div>
              )}
            </div>
            <div className="image-options">
              <label className="toggle-row compact">
                <span>
                  <strong>同时识别中文释义</strong>
                  <small>关闭后只识别俄语，速度更快</small>
                </span>
                <input
                  type="checkbox"
                  checked={includeChinese}
                  onChange={(event) => setIncludeChinese(event.target.checked)}
                  className="switch-input"
                />
                <span className="switch" aria-hidden="true" />
              </label>
              {imageFile && (
                <button
                  className="text-button"
                  disabled={isProcessing}
                  onClick={() => void handleImageFile(imageFile)}
                >
                  <ScanLine size={14} />
                  重新识别
                </button>
              )}
            </div>
            <p className="ocr-note">
              OCR 在设备本地完成。首次使用需要加载俄语与中文模型，可能需要几秒。
            </p>
          </div>
        )}

        {source === 'file' && (
          <div className="file-import">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.csv,.tsv,.json,.docx,.pdf,.xlsx,.xls,.html,.htm"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
            <div
              className={`dropzone ${dragActive ? 'drag-active' : ''} ${fileName ? 'has-file' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click();
              }}
            >
              {fileName ? (
                <div className="file-selected">
                  <span className="file-selected-icon">
                    <FileCheck2 size={25} />
                  </span>
                  <strong>{fileName}</strong>
                  <small>{fileKind || '已选择文件'} · 点按更换</small>
                </div>
              ) : (
                <div className="dropzone-empty">
                  <span className="dropzone-icon">
                    <UploadCloud size={28} />
                  </span>
                  <strong>上传一个单词表</strong>
                  <small>TXT、CSV、JSON、DOCX、PDF、XLSX，最大 25 MB</small>
                </div>
              )}
            </div>
            <div className="supported-formats">
              {['TXT', 'CSV', 'JSON', 'DOCX', 'PDF', 'XLSX'].map((format) => (
                <span key={format}>{format}</span>
              ))}
            </div>
            <p className="ocr-note">
              Excel 会读取所有工作表；PDF 只读取可复制文字，扫描版 PDF 请改用照片导入。
            </p>
          </div>
        )}

        {progress && (
          <div className="ocr-progress" aria-live="polite">
            <div className="ocr-progress-copy">
              <span>
                {isProcessing && <LoaderCircle size={15} className="spin" />}
                {progress.label}
              </span>
              <strong>{Math.round(progress.value * 100)}%</strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${Math.round(progress.value * 100)}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="inline-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {source !== 'text' && rawText && (
          <details className="raw-text-details">
            <summary>
              <span>查看识别原文</span>
              <ChevronDown size={16} />
            </summary>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              rows={8}
              lang="ru"
              aria-label="识别原文"
            />
            <button className="btn btn-outline sm" onClick={handleReparseRaw}>
              重新解析文字
            </button>
          </details>
        )}
      </section>

      {showPreview && (
        <section className="import-preview" ref={previewRef}>
          <div className="preview-head">
            <div>
              <p className="eyebrow">Проверьте · 核对</p>
              <h2>确认导入</h2>
              <p>
                识别到 {validCount} 个词
                {duplicateCount ? `，其中 ${duplicateCount} 个已存在` : ''}
              </p>
            </div>
            <button className="text-button" onClick={resetParsed}>
              <X size={14} />
              重新导入
            </button>
          </div>

          <div className="preview-table">
            <div className="preview-table-head">
              <span>#</span>
              <span>俄语</span>
              <span>中文释义</span>
              <span />
            </div>
            {entries.map((entry, index) => {
              const duplicate = existingKeys.has(normalizeRu(entry.ru));
              return (
                <div className={`preview-row ${duplicate ? 'is-duplicate' : ''}`} key={`entry-${index}`}>
                  <span className="preview-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="preview-input-wrap">
                    <input
                      value={entry.ru}
                      onChange={(event) => updateEntry(index, { ru: event.target.value })}
                      lang="ru"
                      spellCheck={false}
                      aria-label={`第 ${index + 1} 个俄语单词`}
                    />
                    {duplicate && <small className="duplicate-badge">已存在</small>}
                  </div>
                  <div className="preview-input-wrap">
                    <input
                      value={entry.zh}
                      onChange={(event) => updateEntry(index, { zh: event.target.value })}
                      placeholder="补充释义"
                      aria-label={`第 ${index + 1} 个中文释义`}
                    />
                  </div>
                  <button
                    className="mini-icon-button"
                    onClick={() => removeEntry(index)}
                    aria-label={`删除第 ${index + 1} 行`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          <button className="add-row-button" onClick={addEntry}>
            <Plus size={15} />
            再加一行
          </button>

          <div className="import-target">
            <label className="field">
              <span>放到哪个词库</span>
              <div className="select-wrap">
                <select value={deckId} onChange={(event) => setDeckId(event.target.value)}>
                  {data.decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                  <option value="__new__">＋ 新建词库</option>
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
            {deckId === '__new__' && (
              <label className="field">
                <span>新词库名称</span>
                <input
                  value={newDeckName}
                  onChange={(event) => setNewDeckName(event.target.value)}
                  placeholder="我的词库"
                  maxLength={28}
                />
              </label>
            )}
          </div>

          <button
            className="btn btn-primary wide import-submit"
            onClick={handleImport}
            disabled={importing || !validCount}
          >
            {importing ? <LoaderCircle size={17} className="spin" /> : <FileCheck2 size={17} />}
            导入 {validCount} 个单词
          </button>
          {duplicateCount > 0 && (
            <p className="import-footnote">重复的单词会自动跳过，不会覆盖已有的学习记录。</p>
          )}
        </section>
      )}

      <div className="import-note">
        <Sparkles size={16} />
        <p>
          小建议：一次导入 10–20 个同主题单词。导入后，用「听写」先建立声音和拼写的联系。
        </p>
      </div>
    </div>
  );
}
