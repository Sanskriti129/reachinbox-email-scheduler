import { ListFilter, RotateCw, Search } from 'lucide-react';
import { IconButton } from '../ui/Button';

export function Toolbar({
  query,
  onQuery,
  onRefresh,
  refreshing,
  filter,
  onFilter,
}: {
  query: string;
  onQuery: (q: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  filter: string;
  onFilter: (f: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-6 py-3">
      <label className="flex h-9 flex-1 items-center gap-2 rounded-full bg-surface px-4 focus-within:ring-2 focus-within:ring-brand-100">
        <Search className="size-4 text-faint" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search emails"
          className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </label>
      <label className="relative" title="Filter">
        <ListFilter className="pointer-events-none absolute left-2 top-2 size-4 text-muted" />
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          aria-label="Filter"
          className="h-8 w-8 cursor-pointer appearance-none rounded-lg bg-transparent text-transparent hover:bg-surface focus:w-auto focus:pl-7 focus:pr-2 focus:text-sm focus:text-ink"
        >
          <option value="all">All</option>
          <option value="ok">Delivered / on time</option>
          <option value="attention">Failed / rate-limited</option>
        </select>
      </label>
      <IconButton label="Refresh" onClick={onRefresh}>
        <RotateCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
      </IconButton>
    </div>
  );
}
