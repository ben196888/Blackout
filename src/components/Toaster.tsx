import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'ok' | 'bad' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
}

export type PushToast = (text: string, tone?: ToastTone) => void;

const ToastContext = createContext<PushToast>(() => {});

/**
 * Most moves change hidden state — a battery, a position someone else cannot see —
 * so a click that worked and a click that never registered look identical. Every
 * dispatched move says so here.
 */
export function useToast(): PushToast {
  return useContext(ToastContext);
}

const LIFETIME_MS = 3600;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const push = useCallback<PushToast>((text, tone = 'ok') => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { id, text, tone }].slice(-MAX_VISIBLE));
    timers.current.push(window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      LIFETIME_MS,
    ));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* role="log", not "status": the boards already use status for send receipts,
          and two live regions with the same role make those ambiguous to query. */}
      <div aria-label="Action feedback" aria-live="polite" className="toaster" role="log">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id}>
            <span aria-hidden="true">{toast.tone === 'bad' ? '✕' : toast.tone === 'info' ? '·' : '✓'}</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
