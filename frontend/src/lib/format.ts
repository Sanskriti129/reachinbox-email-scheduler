const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "Tue 9:15:12 AM" — the format used in the Figma pills. */
export const formatPillTime = (iso: string) => {
  const d = new Date(iso);
  return `${weekday.format(d)} ${time.format(d)}`;
};

export const formatFull = (iso: string) => full.format(new Date(iso));

/** Value for <input type="datetime-local"> in the user's local timezone. */
export const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Friendly name from an address: "john.smith@x.com" → "John Smith". */
export const nameFromEmail = (email: string) =>
  email
    .split('@')[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(' ');

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "in 3 min", "2 hours ago", "tomorrow" — for quick scanning in lists. */
export const formatRelative = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 45_000) return diff >= 0 ? 'in a few seconds' : 'just now';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
};
