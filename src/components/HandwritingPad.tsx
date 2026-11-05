import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Eraser, LoaderCircle, Sparkles, Undo2 } from 'lucide-react';
import { recognizeHandwriting, type InkPoint, type RecognitionOutcome } from '../lib/handwriting';
import { useApp } from '../lib/store';

export interface HandwritingPadHandle {
  recognize: () => Promise<RecognitionOutcome | null>;
  clear: () => void;
  hasInk: () => boolean;
}

interface HandwritingPadProps {
  onText?: (text: string) => void;
  onCandidates?: (candidates: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  autoRecognize?: boolean;
}

export const HandwritingPad = forwardRef<HandwritingPadHandle, HandwritingPadProps>(
  function HandwritingPad(
    { onText, onCandidates, onBusyChange, autoRecognize = true },
    ref,
  ) {
    const { data } = useApp();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const strokesRef = useRef<InkPoint[][]>([]);
    const currentRef = useRef<InkPoint[]>([]);
    const drawingRef = useRef(false);
    const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
    const timerRef = useRef<number | null>(null);
    const busyRef = useRef<Promise<RecognitionOutcome | null> | null>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('用印刷体书写，写完后会自动识别');
    const [candidates, setCandidates] = useState<string[]>([]);
    const [hasInk, setHasInk] = useState(false);

    const redraw = useCallback(() => {
      const ctx = ctxRef.current;
      const { width, height, dpr } = sizeRef.current;
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#1b2420';
      ctx.fillStyle = '#1b2420';
      ctx.lineWidth = 3.3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const stroke of strokesRef.current) {
        if (!stroke.length) continue;
        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, 1.8, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let index = 1; index < stroke.length; index++) {
          ctx.lineTo(stroke[index].x, stroke[index].y);
        }
        ctx.stroke();
      }
    }, []);

    const setupCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const previous = sizeRef.current;
      if (previous.width && previous.height && previous.width !== rect.width) {
        const sx = rect.width / previous.width;
        const sy = rect.height / previous.height;
        strokesRef.current = strokesRef.current.map((stroke) =>
          stroke.map((point) => ({ x: point.x * sx, y: point.y * sy })),
        );
      }
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctxRef.current = ctx;
      redraw();
    }, [redraw]);

    useEffect(() => {
      setupCanvas();
      const observer = new ResizeObserver(setupCanvas);
      if (wrapRef.current) observer.observe(wrapRef.current);
      return () => observer.disconnect();
    }, [setupCanvas]);

    useEffect(
      () => () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
      },
      [],
    );

    const clear = useCallback(() => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      strokesRef.current = [];
      currentRef.current = [];
      drawingRef.current = false;
      setHasInk(false);
      setCandidates([]);
      setStatus('用印刷体书写，写完后会自动识别');
      onText?.('');
      onCandidates?.([]);
      redraw();
    }, [onCandidates, onText, redraw]);

    const undo = useCallback(() => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      strokesRef.current.pop();
      setHasInk(strokesRef.current.length > 0);
      setCandidates([]);
      setStatus(strokesRef.current.length ? '已撤销最后一笔' : '用印刷体书写，写完后会自动识别');
      onCandidates?.([]);
      onText?.('');
      redraw();
    }, [onCandidates, onText, redraw]);

    const doRecognize = useCallback(async (): Promise<RecognitionOutcome | null> => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (busyRef.current) return busyRef.current;
      if (!strokesRef.current.length) {
        setStatus('手写板还是空的，先写一个单词吧');
        return null;
      }
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const size = sizeRef.current;
      setBusy(true);
      onBusyChange?.(true);
      setStatus('正在识别笔画…');
      const task = (async () => {
        try {
          const result = await recognizeHandwriting({
            strokes: strokesRef.current,
            width: size.width,
            height: size.height,
            canvas,
            online: data.settings.onlineHandwriting,
            offline: data.settings.offlineHandwriting,
            onProgress: (label) => setStatus(label),
          });
          setCandidates(result.candidates);
          if (result.candidates.length) {
            onText?.(result.text);
            onCandidates?.(result.candidates);
            setStatus(
              result.source === 'online'
                ? '识别完成，可点选其他候选'
                : '离线识别完成，可点选其他候选',
            );
          } else {
            onText?.('');
            onCandidates?.([]);
            setStatus('没有识别清楚，可以重写，或切换键盘输入');
          }
          return result;
        } catch (error) {
          console.error(error);
          setStatus('识别服务暂时不可用，请切换键盘输入');
          return null;
        } finally {
          setBusy(false);
          onBusyChange?.(false);
        }
      })();
      busyRef.current = task;
      try {
        return await task;
      } finally {
        if (busyRef.current === task) busyRef.current = null;
      }
    }, [
      data.settings.offlineHandwriting,
      data.settings.onlineHandwriting,
      onBusyChange,
      onCandidates,
      onText,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        recognize: doRecognize,
        clear,
        hasInk: () => strokesRef.current.length > 0,
      }),
      [clear, doRecognize],
    );

    const scheduleRecognition = useCallback(() => {
      if (!autoRecognize) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void doRecognize();
      }, 1100);
    }, [autoRecognize, doRecognize]);

    function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): InkPoint {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      };
    }

    function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event);
      currentRef.current = [point];
      drawingRef.current = true;
      setHasInk(true);
      setCandidates([]);
      setStatus('正在书写…');
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.fillStyle = '#1b2420';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      event.preventDefault();
      const point = pointFromEvent(event);
      const stroke = currentRef.current;
      const last = stroke[stroke.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.2) return;
      stroke.push(point);
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.strokeStyle = '#1b2420';
        ctx.lineWidth = 3.3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(last?.x ?? point.x, last?.y ?? point.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    }

    function finishStroke(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
      if (currentRef.current.length) {
        strokesRef.current.push(currentRef.current);
        currentRef.current = [];
      }
      setStatus('松手后自动识别…');
      scheduleRecognition();
    }

    return (
      <div className="handwriting" ref={wrapRef}>
        <div className={`handwriting-canvas-wrap ${busy ? 'is-busy' : ''}`}>
          <canvas
            ref={canvasRef}
            className="handwriting-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            aria-label="俄语手写板"
            role="img"
          />
          {!hasInk && (
            <div className="handwriting-placeholder" aria-hidden="true">
              <span>Пишите здесь</span>
              <small>在这里写俄语</small>
            </div>
          )}
          {busy && (
            <div className="handwriting-busy" aria-live="polite">
              <LoaderCircle size={18} className="spin" />
              <span>识别中</span>
            </div>
          )}
        </div>
        <div className="handwriting-tools">
          <div className="handwriting-status">
            <span className={`status-dot ${busy ? 'busy' : ''}`} />
            {status}
          </div>
          <div className="handwriting-actions">
            <button
              type="button"
              className="mini-icon-button"
              onClick={undo}
              disabled={!hasInk || busy}
              aria-label="撤销一笔"
              title="撤销"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="mini-icon-button"
              onClick={clear}
              disabled={!hasInk || busy}
              aria-label="清空手写板"
              title="清空"
            >
              <Eraser size={16} />
            </button>
            <button
              type="button"
              className="mini-text-button"
              onClick={() => void doRecognize()}
              disabled={!hasInk || busy}
            >
              <Sparkles size={14} />
              识别
            </button>
          </div>
        </div>
        {candidates.length > 0 && (
          <div className="candidate-row" aria-label="识别候选">
            <span>候选</span>
            {candidates.slice(0, 5).map((candidate, index) => (
              <button
                type="button"
                key={`${candidate}-${index}`}
                onClick={() => {
                  onText?.(candidate);
                  setStatus(`已选择「${candidate}」`);
                }}
              >
                {candidate}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
