import { Activity, Clock, ExternalLink, Megaphone, PenLine, Send } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { Counts } from '../../api/types';
import { Button } from '../ui/Button';
import { SlackCard } from './SlackCard';
import { UserMenu } from './UserMenu';

/** Brand mark: a clock-stamped envelope (a scheduled email). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#16a34a" />
      <path d="M7 11.5A2.5 2.5 0 0 1 9.5 9h13A2.5 2.5 0 0 1 25 11.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 7 20.5z" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="m7.8 10.5 8.2 6 8.2-6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="23.5" cy="21.5" r="5" fill="#0f2a1c" stroke="#16a34a" strokeWidth="1.5" />
      <path d="M23.5 19v2.6l1.6 1" fill="none" stroke="#7ee2a3" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** "ONB" is the product wordmark from the Figma; the mark + tagline make it read as a brand. */
export function Logo({ tagline = true, invert = false }: { tagline?: boolean; invert?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-none">
        <span className={`block font-logo text-2xl tracking-tight ${invert ? 'text-white' : 'text-ink'}`}>ONB</span>
        {tagline && (
          <span className={`mt-1 block text-[10.5px] font-medium uppercase tracking-[0.12em] ${invert ? 'text-white/55' : 'text-faint'}`}>
            Email Scheduler
          </span>
        )}
      </span>
    </span>
  );
}

const nav = [
  { to: '/scheduled', label: 'Scheduled', icon: Clock, key: 'scheduled' as const },
  { to: '/sent', label: 'Sent', icon: Send, key: 'sent' as const },
];

export function Sidebar({ counts, onNavigate }: { counts: Counts | null; onNavigate?: () => void }) {
  const navigate = useNavigate();
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-5 border-r border-line bg-[#f7f8f9] px-4 py-5">
      <div className="px-1">
        <Logo />
      </div>
      <UserMenu />
      <Button
        variant="outline"
        className="w-full shadow-sm"
        icon={<PenLine className="size-4" />}
        onClick={() => {
          navigate('/compose');
          onNavigate?.();
        }}
      >
        Compose
      </Button>

      <nav>
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Core</p>
        <ul className="space-y-1">
          {nav.map(({ to, label, icon: Icon, key }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                    isActive
                      ? 'bg-brand-50 font-semibold text-ink ring-1 ring-brand-100'
                      : 'text-muted hover:bg-white hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`size-4 ${isActive ? 'text-brand-600' : ''}`} />
                    <span className="flex-1">{label}</span>
                    <span
                      className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums ${
                        isActive ? 'bg-white text-brand-700' : 'bg-line/70 text-muted'
                      }`}
                    >
                      {counts ? counts[key] : '–'}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <nav>
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Manage</p>
        <NavLink
          to="/campaigns"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
              isActive ? 'bg-brand-50 font-semibold text-ink ring-1 ring-brand-100' : 'text-muted hover:bg-white hover:text-ink'
            }`
          }
        >
          <Megaphone className="size-4" />
          <span className="flex-1">Campaigns</span>
        </NavLink>
      </nav>

      <nav>
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Tools</p>
        <a
          href="/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <Activity className="size-4" />
          <span className="flex-1">Queue dashboard</span>
          <ExternalLink className="size-3.5 text-faint" />
        </a>
      </nav>

      <div className="mt-auto space-y-3">
        <SlackCard />
        {counts && (
          <p className="flex items-center gap-2 px-1 text-[11px] text-muted">
            <span
              className={`size-2 rounded-full ${counts.workers > 0 ? 'bg-brand-500 shadow-[0_0_0_3px_rgba(34,180,90,.18)]' : counts.workers === 0 ? 'bg-amber-500' : 'bg-faint'}`}
            />
            {counts.workers > 0
              ? `${counts.workers} worker${counts.workers === 1 ? '' : 's'} online`
              : counts.workers === 0
                ? 'No worker running'
                : 'Worker status unknown'}
          </p>
        )}
      </div>
    </aside>
  );
}
