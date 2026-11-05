import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

type Tone = 'default' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<((message: string, tone?: Tone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const notify = useCallback((message: string, tone: Tone = 'default') => {
    const id = ++counter.current;
    setItems((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  const value = useMemo(() => notify, [notify]);

  useEffect(() => {
    const onStorageError = () => notify('存储空间不足，最新数据未能保存；请先导出备份', 'error');
    window.addEventListener('slovo:storage-error', onStorageError);
    return () => window.removeEventListener('slovo:storage-error', onStorageError);
  }, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`} role="status">
            {item.tone === 'success' ? (
              <CheckCircle2 size={16} />
            ) : item.tone === 'error' ? (
              <XCircle size={16} />
            ) : (
              <Info size={16} />
            )}
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
