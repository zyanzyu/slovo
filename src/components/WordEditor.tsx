import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Word } from '../lib/types';
import { normalizeRu } from '../lib/utils';
import { useApp } from '../lib/store';
import { Modal, ConfirmDialog } from './Modal';
import { useToast } from './Toast';

interface WordEditorProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
  word?: Word | null;
}

export function WordEditor({ open, onClose, deckId, word }: WordEditorProps) {
  const { data, addWord, updateWord, deleteWord } = useApp();
  const toast = useToast();
  const [ru, setRu] = useState('');
  const [zh, setZh] = useState('');
  const [transcription, setTranscription] = useState('');
  const [exampleRu, setExampleRu] = useState('');
  const [exampleZh, setExampleZh] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRu(word?.ru ?? '');
    setZh(word?.zh === '待补充释义' ? '' : (word?.zh ?? ''));
    setTranscription(word?.transcription ?? '');
    setExampleRu(word?.exampleRu ?? '');
    setExampleZh(word?.exampleZh ?? '');
    setError('');
  }, [open, word]);

  const handleSave = () => {
    const trimmedRu = ru.trim();
    if (!trimmedRu) {
      setError('请填写俄语单词');
      return;
    }
    if (!/[А-Яа-яЁё]/.test(trimmedRu)) {
      setError('俄语单词中需要包含西里尔字母');
      return;
    }
    const duplicate = data.words.find(
      (item) =>
        item.id !== word?.id &&
        normalizeRu(item.ru) === normalizeRu(trimmedRu) &&
        item.deckId === deckId,
    );
    if (duplicate) {
      setError(`「${duplicate.ru}」已经在这个词库里了`);
      return;
    }
    const draft = {
      ru: trimmedRu,
      zh: zh.trim() || '待补充释义',
      transcription: transcription.trim() || undefined,
      exampleRu: exampleRu.trim() || undefined,
      exampleZh: exampleZh.trim() || undefined,
    };
    if (word) {
      updateWord(word.id, draft);
      toast('单词已更新', 'success');
    } else {
      addWord(draft, deckId);
      toast('已添加新单词', 'success');
    }
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        eyebrow={word ? '编辑词条' : '新词'}
        title={word ? '修改单词' : '添加一个单词'}
        className="word-editor-modal"
        footer={
          <>
            {word && (
              <button
                type="button"
                className="btn btn-ghost btn-icon-text danger-text"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} />
                删除
              </button>
            )}
            <div className="footer-spacer" />
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" form="word-editor-form" className="btn btn-primary">
              保存
            </button>
          </>
        }
      >
        <form
          id="word-editor-form"
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <label className="field">
            <span>俄语单词 <b className="required">*</b></span>
            <input
              value={ru}
              onChange={(event) => {
                setRu(event.target.value);
                setError('');
              }}
              placeholder="например, привет"
              lang="ru"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <label className="field">
            <span>中文释义</span>
            <input
              value={zh}
              onChange={(event) => setZh(event.target.value)}
              placeholder="你好；嗨"
            />
          </label>
          <label className="field">
            <span>重音 / 音标 <em>可选</em></span>
            <input
              value={transcription}
              onChange={(event) => setTranscription(event.target.value)}
              placeholder="приве́т"
              lang="ru"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>俄语例句 <em>可选</em></span>
            <textarea
              value={exampleRu}
              onChange={(event) => setExampleRu(event.target.value)}
              placeholder="Привет, как дела?"
              lang="ru"
              rows={2}
            />
          </label>
          <label className="field">
            <span>例句翻译 <em>可选</em></span>
            <textarea
              value={exampleZh}
              onChange={(event) => setExampleZh(event.target.value)}
              placeholder="嗨，你好吗？"
              rows={2}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="删除这个单词？"
        description="单词及其学习记录都会被删除，这个操作无法撤销。"
        confirmLabel="删除单词"
        onConfirm={() => {
          if (word) {
            deleteWord(word.id);
            toast('单词已删除');
            onClose();
          }
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
