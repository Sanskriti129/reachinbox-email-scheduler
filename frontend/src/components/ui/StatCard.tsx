import type { LucideIcon } from 'lucide-react';

const tones = {
  brand: 'bg-brand-50 text-brand-600',
  orange: 'bg-orange-50 text-orange-600',
  sky: 'bg-sky-50 text-sky-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'brand',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof tones;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-lg font-semibold leading-tight tabular-nums">{value}</p>
        {hint && <p className="truncate text-[11px] text-faint">{hint}</p>}
      </div>
    </div>
  );
}
