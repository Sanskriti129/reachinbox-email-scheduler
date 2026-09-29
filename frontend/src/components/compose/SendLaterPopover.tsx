import { useEffect, useRef, useState } from 'react';
import { toLocalInput } from '../../lib/format';
import { Button } from '../ui/Button';

function tomorrowAt(h: number) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  return d;
}

const presets = [
  { label: 'In 1 minute', at: () => new Date(Date.now() + 60_000) },
  { label: 'Tomorrow', at: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
];

/** "Send Later" dropdown from the Figma: pick date & time, presets, Cancel / Done. */
export function SendLaterPopover({
  value,
  onDone,
  onClose,
}: {
  value: Date | null;
  onDone: (d: Date) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState(value ? toLocalInput(value) : '');

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Send later"
      className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-line bg-white p-4 shadow-xl"
    >
      <p className="mb-3 text-sm font-semibold">Send Later</p>
      <input
        type="datetime-local"
        value={picked}
        min={toLocalInput(new Date())}
        onChange={(e) => setPicked(e.target.value)}
        aria-label="Pick date & time"
        className="mb-2 h-9 w-full rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-brand-500"
      />
      <ul className="mb-4">
        {presets.map((p) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => setPicked(toLocalInput(p.at()))}
              className="w-full rounded-md px-1 py-1.5 text-left text-sm text-ink hover:bg-surface"
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!picked}
          onClick={() => {
            onDone(new Date(picked));
            onClose();
          }}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
