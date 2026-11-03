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
    const recognitionAbortRef = useRef<AbortController | null>(null);
    const inkVersionRef = useRef(0);
    const pendingRecognitionRef = useRef(false);
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

    const makeOfflineCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const points = strokesRef.current.flat();
      const size = sizeRef.current;
      if (!canvas || !points.length || !size.width || !size.height) return canvas;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of points) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      }
      const margin = 16;
      minX = Math.max(0, minX - margin);
      minY = Math.max(0, minY - margin);
      maxX = Math.min(size.width, maxX + margin);
      maxY = Math.min(size.height, maxY + margin);
      const sx = canvas.width / size.width;
      const sy = canvas.height / size.height;
      const sourceX = Math.floor(minX * sx);
      const sourceY = Math.floor(minY * sy);
      const sourceW = Math.max(1, Math.ceil((maxX - minX) * sx));
      const sourceH = Math.max(1, Math.ceil((maxY - minY) * sy));
      const cropped = document.createElement('canvas');
      cropped.width = sourceW;
      cropped.height = sourceH;
      const ctx = cropped.getContext('2d');
      if (!ctx) return canvas;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sourceW, sourceH);
      ctx.drawImage(canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
      return cropped;
    }, []);

    useEffect(() => {
      if (!data.settings.offlineHandwriting) return;
      let cancelled = false;
      void import('../lib/ocr')
        .then(({ preloadHandwritingWorker }) => {
          if (!cancelled) return preloadHandwritingWorker();
          return undefined;
        })
        .catch((error) => console.error('Handwriting preload failed', error));
      return () => {
        cancelled = true;
      };
    }, [data.settings.offlineHandwriting]);

    useEffect(
      () => () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        recognitionAbortRef.current?.abort();
      },
      [],
    );

    const clear = useCallback(() => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      recognitionAbortRef.current?.abort();
      inkVersionRef.current += 1;
      pendingRecognitionRef.current = false;
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
      recognitionAbortRef.current?.abort();
      inkVersionRef.current += 1;
      pendingRecognitionRef.current = false;
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
      const version = inkVersionRef.current;
      const strokes = strokesRef.current.map((stroke) => stroke.slice());
      const offlineCanvas = data.settings.offlineHandwriting
        ? makeOfflineCanvas() ?? canvas
        : undefined;
      const controller = new AbortController();
      recognitionAbortRef.current = controller;
      setBusy(true);
      onBusyChange?.(true);
      setStatus('正在识别笔画…');
      const task = (async () => {
        try {
          const result = await recognizeHandwriting({
            strokes,
            width: size.width,
            height: size.height,
            canvas,
            offlineCanvas,
            online: data.settings.onlineHandwriting,
            offline: data.settings.offlineHandwriting,
            signal: controller.signal,
            onProgress: (label) => {
              if (version === inkVersionRef.current) setStatus(label);
            },
          });
          if (version !== inkVersionRef.current) {
            pendingRecognitionRef.current = true;
            return null;
          }
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
          if (version === inkVersionRef.current) {
            setStatus('识别服务暂时不可用，请切换键盘输入');
          }
          return null;
        } finally {
          setBusy(false);
          onBusyChange?.(false);
          if (recognitionAbortRef.current === controller) {
            recognitionAbortRef.current = null;
          }
        }
      })();
      busyRef.current = task;
      try {
        return await task;
      } finally {
        if (busyRef.current === task) busyRef.current = null;
        if (pendingRecognitionRef.current && autoRecognize) {
          pendingRecognitionRef.current = false;
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            void doRecognize();
          }, 120);
        }
      }
    }, [
      autoRecognize,
      data.settings.offlineHandwriting,
      data.settings.onlineHandwriting,
      makeOfflineCanvas,
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

    const scheduleRecognition = useCallback(
      (delay = 220) => {
        if (!autoRecognize) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        if (busyRef.current) {
          pendingRecognitionRef.current = true;
          return;
        }
        timerRef.current = window.setTimeout(() => {
          void doRecognize();
        }, delay);
      },
      [autoRecognize, doRecognize],
    );

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
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      inkVersionRef.current += 1;
      if (busyRef.current) {
        pendingRecognitionRef.current = true;
      } else {
        pendingRecognitionRef.current = false;
      }
      recognitionAbortRef.current?.abort();
      const point = pointFromEvent(event);
      currentRef.current = [point];
      drawingRef.current = true;
      setHasInk(true);
      setCandidates([]);
      onCandidates?.([]);
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
      inkVersionRef.current += 1;
      setStatus('松手后自动识别…');
      scheduleRecognition(220);
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
