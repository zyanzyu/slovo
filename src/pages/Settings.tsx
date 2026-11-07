import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  Check,
  Cloud,
  Download,
  HardDrive,
  Languages,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { usePageTitle } from '../lib/usePageTitle';
import { getRussianVoiceName, hasRussianVoice, initSpeech, speakRussian } from '../lib/speech';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { StudyMode } from '../lib/types';
import { getNativeBridge } from '../lib/platform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const modeOptions: Array<{ value: StudyMode; label: string }> = [
  { value: 'audio', label: '听写' },
  { value: 'meaning', label: '中译俄' },
  { value: 'mixed', label: '混合' },
];

const fontOptions = [
  { value: 0.95, label: '小' },
  { value: 1.08, label: '标准' },
  { value: 1.2, label: '大' },
  { value: 1.32, label: '特大' },
];

function Stepper({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label="减少"
      >
        <Minus size={15} />
      </button>
      <span>
        <strong>{value}</strong>
        <small>{suffix}</small>
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label="增加"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

export function Settings() {
  usePageTitle('设置');
  const navigate = useNavigate();
  const toast = useToast();
  const { data, updateSettings, exportBackup, importBackup, resetProgress, resetAll } = useApp();
  const [confirmProgress, setConfirmProgress] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initSpeech();
    const check = () => {
      setVoiceReady(hasRussianVoice());
      setVoiceName(getRussianVoiceName());
    };
    check();
    const timer = window.setInterval(check, 1200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.__slovoBackupResult = (ok) => {
      toast(ok ? '备份已保存' : '已取消保存备份', ok ? 'success' : 'default');
    };
    return () => {
      delete window.__slovoBackupResult;
    };
  }, [toast]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const mastered = data.words.filter((word) => word.srs.mastery >= 4).length;
  const accuracy = data.stats.totalReviews
    ? Math.round((data.stats.totalCorrect / data.stats.totalReviews) * 100)
    : 0;

  const handleExport = () => {
    const filename = `slovo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const payload = exportBackup();
    const bridge = getNativeBridge();
    if (bridge?.saveBackup) {
      bridge.saveBackup(payload, filename);
      toast('正在打开保存位置…');
      return;
    }

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('备份文件已生成', 'success');
  };

  const handleRestore = async (file: File) => {
    try {
      const text = await file.text();
      if (importBackup(text)) {
        toast('备份已恢复', 'success');
      } else {
        toast('备份文件格式不正确', 'error');
      }
    } catch {
      toast('无法读取备份文件', 'error');
    }
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') toast('已添加到主屏幕', 'success');
    setInstallPrompt(null);
  };

  return (
    <div className="page settings-page">
      <header className="page-header">
        <p className="eyebrow">Настройки · 偏好</p>
        <h1>设置</h1>
        <p className="page-lead">让练习适合你的节奏。所有学习数据只保存在这台设备上。</p>
      </header>

      <section className="settings-overview">
        <div>
          <strong>{data.words.length}</strong>
          <span>单词</span>
        </div>
        <div>
          <strong>{mastered}</strong>
          <span>已掌握</span>
        </div>
        <div>
          <strong>{data.stats.totalReviews ? `${accuracy}%` : '—'}</strong>
          <span>正确率</span>
        </div>
        <div>
          <strong>{data.stats.streak}</strong>
          <span>连续天数</span>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-heading">
          <span className="settings-icon">
            <CalendarDays size={17} />
          </span>
          <div>
            <h2>学习计划</h2>
            <p>每天留一点给俄语。</p>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>每日目标</strong>
            <small>完成多少张复习卡</small>
          </div>
          <Stepper
            value={data.settings.dailyGoal}
            min={5}
            max={50}
            step={5}
            suffix="词"
            onChange={(value) => updateSettings({ dailyGoal: value })}
          />
        </div>

        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>每日新词</strong>
            <small>超过后只复习，不加入新词</small>
          </div>
          <Stepper
            value={data.settings.newPerDay}
            min={0}
            max={20}
            step={1}
            suffix="词"
            onChange={(value) => updateSettings({ newPerDay: value })}
          />
        </div>

        <div className="settings-row stacked">
          <div className="settings-row-copy">
            <strong>默认练习方式</strong>
            <small>开始提背时优先使用</small>
          </div>
          <div className="segment-control">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                className={data.settings.defaultMode === option.value ? 'active' : ''}
                onClick={() => updateSettings({ defaultMode: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-heading">
          <span className="settings-icon">
            <Type size={17} />
          </span>
          <div>
            <h2>显示与字号</h2>
            <p>字号会随屏幕和你的选择自适应。</p>
          </div>
        </div>

        <div className="settings-row stacked">
          <div className="settings-row-copy">
            <strong>界面字号</strong>
            <small>影响按钮、说明、题目与统计；手机和桌面都适用</small>
          </div>
          <div className="font-scale-options" role="group" aria-label="界面字号">
            {fontOptions.map((option) => (
              <button
                key={option.value}
                className={Math.abs(data.settings.fontScale - option.value) < 0.01 ? 'active' : ''}
                onClick={() => updateSettings({ fontScale: option.value })}
                aria-pressed={Math.abs(data.settings.fontScale - option.value) < 0.01}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="font-preview" aria-hidden="true">
            <span>Слово за словом.</span>
            <small>一天一点，把俄语写进记忆。</small>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-heading">
          <span className="settings-icon">
            <Languages size={17} />
          </span>
          <div>
            <h2>识别与发音</h2>
            <p>手写识别与听写发音。</p>
          </div>
        </div>

        <label className="toggle-row">
          <span>
            <strong>在线手写识别</strong>
            <small>只发送笔画，不保存照片；识别更自然</small>
          </span>
          <input
            type="checkbox"
            className="switch-input"
            checked={data.settings.onlineHandwriting}
            onChange={(event) => updateSettings({ onlineHandwriting: event.target.checked })}
          />
          <span className="switch" aria-hidden="true" />
        </label>

        <label className="toggle-row">
          <span>
            <strong>离线手写识别</strong>
            <small>在线不可用时，使用设备上的识别模型</small>
          </span>
          <input
            type="checkbox"
            className="switch-input"
            checked={data.settings.offlineHandwriting}
            onChange={(event) => updateSettings({ offlineHandwriting: event.target.checked })}
          />
          <span className="switch" aria-hidden="true" />
        </label>

        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>俄语发音</strong>
            <small>{voiceReady ? `内置离线音色：${voiceName || 'Piper · Irina (ru_RU)'}` : '没有可用的俄语语音'}</small>
          </div>
          <button
            className="btn btn-outline sm"
            onClick={() => {
              const played = speakRussian('привет, как дела?');
              if (!played) toast('当前浏览器不支持语音播放', 'error');
            }}
          >
            <Volume2 size={15} />
            试听
          </button>
        </div>

        <label className="toggle-row">
          <span>
            <strong>自动播放</strong>
            <small>出现听写题时自动读出单词</small>
          </span>
          <input
            type="checkbox"
            className="switch-input"
            checked={data.settings.autoPlay}
            onChange={(event) => updateSettings({ autoPlay: event.target.checked })}
          />
          <span className="switch" aria-hidden="true" />
        </label>
      </section>

      {installPrompt && (
        <section className="install-card">
          <span className="install-icon">
            <Smartphone size={22} />
          </span>
          <div>
            <strong>安装到主屏幕</strong>
            <p>像 App 一样全屏使用，离线也能打开。</p>
          </div>
          <button className="btn btn-primary sm" onClick={() => void handleInstall()}>
            安装
          </button>
        </section>
      )}

      <section className="settings-section">
        <div className="settings-heading">
          <span className="settings-icon">
            <HardDrive size={17} />
          </span>
          <div>
            <h2>数据</h2>
            <p>备份、恢复或重新开始。</p>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>导出备份</strong>
            <small>包含词库、学习进度与设置</small>
          </div>
          <button className="btn btn-outline sm" onClick={handleExport}>
            <Download size={15} />
            导出
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>从备份恢复</strong>
            <small>会替换当前全部数据</small>
          </div>
          <input
            ref={backupRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleRestore(file);
              event.target.value = '';
            }}
          />
          <button className="btn btn-outline sm" onClick={() => backupRef.current?.click()}>
            <Upload size={15} />
            恢复
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>重置学习进度</strong>
            <small>保留单词，清空复习安排</small>
          </div>
          <button className="btn btn-ghost sm danger-text" onClick={() => setConfirmProgress(true)}>
            <RotateCcw size={15} />
            重置
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>恢复示例数据</strong>
            <small>删除全部自定义词库与进度</small>
          </div>
          <button className="btn btn-ghost sm danger-text" onClick={() => setConfirmAll(true)}>
            <Trash2 size={15} />
            清空
          </button>
        </div>
      </section>

      <section className="settings-section about-section">
        <div className="settings-heading">
          <span className="settings-icon">
            <Sparkles size={17} />
          </span>
          <div>
            <h2>为什么这样练</h2>
            <p>四个让记忆留下来的小机制。</p>
          </div>
        </div>
        <div className="method-grid">
          <div>
            <b>01</b>
            <strong>主动回忆</strong>
            <p>先写答案，再看提示。回忆本身比重复阅读更有用。</p>
          </div>
          <div>
            <b>02</b>
            <strong>间隔重复</strong>
            <p>根据「忘记 / 模糊 / 记得 / 熟练」自动安排下次。</p>
          </div>
          <div>
            <b>03</b>
            <strong>听写双通道</strong>
            <p>声音和拼写一起编码，记得更牢。</p>
          </div>
          <div>
            <b>04</b>
            <strong>错词回炉</strong>
            <p>答错或选择「忘记」的词，会在本轮末尾再来一次。</p>
          </div>
        </div>
      </section>

      <footer className="settings-footer">
        <ShieldCheck size={16} />
        <p>
          你的词库与学习记录保存在浏览器本机（localStorage），不会上传。照片 OCR
          与手写识别在需要时才会调用对应模型或服务。
        </p>
      </footer>

      <div className="version-line">
        <span>СЛОВО</span>
        <span>v1.5.1 · 本地优先</span>
      </div>

      <ConfirmDialog
        open={confirmProgress}
        title="重置学习进度？"
        description="所有单词会保留，但复习安排、连续天数和正确率会清零。"
        confirmLabel="重置进度"
        onConfirm={() => {
          resetProgress();
          toast('学习进度已重置');
        }}
        onClose={() => setConfirmProgress(false)}
      />
      <ConfirmDialog
        open={confirmAll}
        title="恢复示例数据？"
        description="当前所有词库、单词和学习记录都会被删除，并恢复三组示例词库。"
        confirmLabel="清空并恢复"
        onConfirm={() => {
          resetAll();
          toast('已恢复示例数据');
          navigate('/');
        }}
        onClose={() => setConfirmAll(false)}
      />
    </div>
  );
}
