import { LoaderCircle } from 'lucide-react';

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <LoaderCircle className={`animate-spin text-brand-600 ${className}`} aria-label="Loading" />;
}

/** Placeholder rows shown while a list loads. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading emails">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-6 border-b border-line px-6 py-4">
          <div className="h-3 w-32 animate-pulse rounded bg-surface" />
          <div className="h-5 w-28 animate-pulse rounded-full bg-surface" />
          <div className="h-3 flex-1 animate-pulse rounded bg-surface" />
        </li>
      ))}
    </ul>
  );
}
