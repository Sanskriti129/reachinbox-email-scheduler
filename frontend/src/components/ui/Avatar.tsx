const palette = ['bg-brand-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600'];

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (src) {
    return <img src={src} alt={name} style={style} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" />;
  }
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const color = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  return (
    <span
      style={{ ...style, fontSize: size * 0.38 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${color}`}
    >
      {initials}
    </span>
  );
}
