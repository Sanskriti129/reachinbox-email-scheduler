import { Activity, Clock, ExternalLink, Send } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { Counts } from '../../api/types';
import { Button } from '../ui/Button';
import { SlackCard } from './SlackCard';
import { UserMenu } from './UserMenu';

export function Logo() {
  return <span className="font-logo text-3xl leading-none tracking-tight text-ink">ONB</span>;
}

const nav = [
  { to: '/scheduled', label: 'Scheduled', icon: Clock, key: 'scheduled' as const },
  { to: '/sent', label: 'Sent', icon: Send, key: 'sent' as const },
];

export function Sidebar({ counts, onNavigate }: { counts: Counts | null; onNavigate?: () => void }) {
  const navigate = useNavigate();
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-4 border-r border-line bg-white px-4 py-5">
      <div className="px-1">
        <Logo />
      </div>
      <UserMenu />
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          navigate('/compose');
          onNavigate?.();
        }}
      >
        Compose
      </Button>

      <nav>
        <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-faint">Core</p>
        <ul className="space-y-0.5">
          {nav.map(({ to, label, icon: Icon, key }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-brand-50 font-semibold text-ink' : 'text-muted hover:bg-surface hover:text-ink'
                  }`
                }
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                <span className="text-xs tabular-nums text-muted">{counts ? counts[key] : '–'}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <nav>
        <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-faint">Tools</p>
        <a
          href="/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <Activity className="size-4" />
          <span className="flex-1">Queue dashboard</span>
          <ExternalLink className="size-3.5 text-faint" />
        </a>
      </nav>

      <div className="mt-auto">
        <SlackCard />
      </div>
    </aside>
  );
}
