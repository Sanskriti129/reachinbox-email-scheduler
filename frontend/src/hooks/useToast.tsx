import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<((message: string, tone?: Tone) => void) | null>(null);

const icons = { success: CircleCheck, error: CircleAlert, info: Info };
const tones = {
  success: 'border-brand-100 text-brand-700',
  error: 'border-red-100 text-red-600',
  info: 'border-line text-ink',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((message: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => dismiss(id), 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={`flex items-start gap-2 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg ${tones[t.tone]}`}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1 text-ink">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="text-faint hover:text-ink" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
