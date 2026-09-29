import { ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../ui/Avatar';

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left transition-colors hover:bg-line"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted">{user.email}</span>
        </span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
          <a
            href="/admin/queues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface"
          >
            <LayoutDashboard className="size-4 text-muted" /> Queue dashboard
          </a>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
