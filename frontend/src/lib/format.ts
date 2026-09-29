const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "Tue 9:15:12 AM" — the format used in the Figma pills. */
export const formatPillTime = (iso: string) => {
  const d = new Date(iso);
  return `${weekday.format(d)} ${time.format(d)}`;
};

export const formatFull = (iso: string) => full.format(new Date(iso));

/** Relative-ish label for the right side of rows: today → time, otherwise date. */
export const formatShort = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

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
