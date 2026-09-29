import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import type { Counts } from '../../api/types';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import { Logo, Sidebar } from './Sidebar';

interface LayoutContext {
  counts: Counts | null;
  refreshCounts: () => void;
}
export const useLayout = () => useOutletContext<LayoutContext>();

export function AppLayout() {
  const { user, loading } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const counts = useAsync(() => api.counts(), [user?.id], { pollMs: 5000 });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-full">
      <div className="hidden md:block">
        <Sidebar counts={counts.data} />
      </div>

      {/* Mobile: header + slide-over drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawer(false)} />
          <div className="relative h-full w-64">
            <Sidebar counts={counts.data} onNavigate={() => setDrawer(false)} />
            <button
              onClick={() => setDrawer(false)}
              className="absolute right-2 top-4 rounded-lg p-1 text-muted"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:hidden">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="text-muted">
            <Menu className="size-5" />
          </button>
          <Logo />
          <span className="ml-auto">
            <Avatar name={user.name} src={user.avatarUrl} size={30} />
          </span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet context={{ counts: counts.data, refreshCounts: () => void counts.reload(true) } satisfies LayoutContext} />
        </main>
      </div>
    </div>
  );
}
