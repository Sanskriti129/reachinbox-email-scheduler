import { FlaskConical, X } from 'lucide-react';
import { useState } from 'react';

const KEY = 'ri_test_banner_dismissed';

/**
 * Emails go to Ethereal (a fake SMTP inbox), never to real mailboxes.
 * Say so up front so nobody waits for an email in Gmail.
 */
export function TestModeBanner({ compact = false }: { compact?: boolean }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode: just hide for this visit */
    }
  };

  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 text-sky-900 ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}
    >
      <FlaskConical className={`shrink-0 text-sky-600 ${compact ? 'mt-0.5 size-3.5' : 'mt-0.5 size-4'}`} />
      <p className="flex-1 leading-relaxed">
        <span className="font-semibold">Test mode:</span> emails are delivered to{' '}
        <a href="https://ethereal.email" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Ethereal
        </a>
        , a safe fake inbox — they never reach real mailboxes. Open any sent email and click{' '}
        <span className="font-medium">“View on Ethereal”</span> to see exactly what was delivered.
      </p>
      <button onClick={dismiss} aria-label="Dismiss" className="rounded p-0.5 text-sky-700/60 hover:bg-sky-100 hover:text-sky-900">
        <X className="size-4" />
      </button>
    </div>
  );
}
