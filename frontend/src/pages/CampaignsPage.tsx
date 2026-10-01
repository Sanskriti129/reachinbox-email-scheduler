import { CircleAlert, Megaphone, Pause, PenLine, Play, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Campaign, CampaignStatus } from '../api/types';
import { useLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Spinner';
import { useAsync } from '../hooks/useAsync';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';
import { formatFull, formatRelative } from '../lib/format';

const statusStyle: Record<CampaignStatus | 'done', string> = {
  active: 'bg-brand-50 text-brand-700 ring-brand-100',
  paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  cancelled: 'bg-surface text-muted ring-line',
  done: 'bg-sky-50 text-sky-700 ring-sky-100',
};

function Progress({ c }: { c: Campaign }) {
  const pct = (n: number) => (c.total ? (n / c.total) * 100 : 0);
  return (
    <div className="min-w-0">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
        <div className="bg-brand-500 transition-all" style={{ width: `${pct(c.sent)}%` }} />
        <div className="bg-red-400 transition-all" style={{ width: `${pct(c.failed)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        <span className="font-medium text-ink">{c.sent}</span> sent
        {c.failed > 0 && <span className="text-red-600"> · {c.failed} failed</span>}
        {c.pending > 0 && <> · {c.pending} to go</>} · {c.total} total
      </p>
    </div>
  );
}

function CampaignCard({ c, onAction }: { c: Campaign; onAction: (id: number, a: 'pause' | 'resume' | 'cancel') => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const { armed: confirmCancel, arm: armCancel } = useConfirm();

  const done = c.status === 'active' && c.pending === 0;
  // Every email cancelled individually → treat the campaign as cancelled, not "done".
  const label = c.total === 0 ? 'cancelled' : done ? 'done' : c.status;
  const run = async (a: 'pause' | 'resume' | 'cancel') => {
    setBusy(a);
    await onAction(c.id, a).finally(() => setBusy(null));
  };

  return (
    <li className="grid gap-4 border-b border-line px-6 py-4 last:border-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ${statusStyle[label]}`}>{label}</span>
          <p className="truncate text-sm font-semibold">{c.subject}</p>
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          from {c.sender_name} · {c.sender_email} · created {formatRelative(c.created_at)}
        </p>
        <p className="mt-0.5 text-xs text-faint">
          {[
            c.status === 'paused'
              ? 'Paused — nothing will send until you resume'
              : c.next_at && c.status === 'active'
                ? `Next email ${formatRelative(c.next_at)} (${formatFull(c.next_at)})`
                : c.last_sent_at
                  ? `Last sent ${formatRelative(c.last_sent_at)}`
                  : null,
            `${c.delay_ms / 1000}s apart`,
            `max ${c.hourly_limit}/hour`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Progress c={c} />

      <div className="flex items-center gap-2 md:justify-end">
        {c.status === 'active' && c.pending > 0 && (
          <Button size="sm" variant="soft" icon={<Pause className="size-3.5" />} loading={busy === 'pause'} onClick={() => run('pause')}>
            Pause
          </Button>
        )}
        {c.status === 'paused' && (
          <Button size="sm" variant="soft" icon={<Play className="size-3.5" />} loading={busy === 'resume'} onClick={() => run('resume')}>
            Resume
          </Button>
        )}
        {c.status !== 'cancelled' && c.pending > 0 && (
          <Button
            size="sm"
            variant={confirmCancel ? 'danger' : 'ghost'}
            icon={<X className="size-3.5" />}
            loading={busy === 'cancel'}
            onClick={() => (confirmCancel ? run('cancel') : armCancel())}
          >
            {confirmCancel ? `Cancel ${c.pending}?` : 'Cancel'}
          </Button>
        )}
      </div>
    </li>
  );
}

export function CampaignsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshCounts } = useLayout();
  const { data, error, loading, reload } = useAsync(() => api.campaigns(), [], { pollMs: 5000 });

  const onAction = async (id: number, a: 'pause' | 'resume' | 'cancel') => {
    try {
      const res = await api.campaignAction(id, a);
      const n = Object.values(res)[0] ?? 0;
      toast(
        a === 'pause' ? `Paused — ${n} email(s) on hold.` : a === 'resume' ? `Resumed — ${n} email(s) back in the queue.` : `Cancelled ${n} unsent email(s).`,
        'success',
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    void reload(true);
    refreshCounts();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 px-6 pb-4 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Every Compose creates a campaign. Track progress, and pause, resume or cancel the emails that haven't gone out yet.
          </p>
        </div>
        <Button onClick={() => navigate('/compose')} icon={<PenLine className="size-4" />}>
          New campaign
        </Button>
      </header>

      <div className="mx-6 mb-6 overflow-hidden rounded-2xl border border-line bg-white">
        {loading && !data ? (
          <SkeletonRows rows={4} />
        ) : error && !data ? (
          <EmptyState icon={CircleAlert} title="Couldn't load campaigns" description={error} action={<Button onClick={() => void reload()}>Try again</Button>} />
        ) : !data?.items.length ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Compose an email to a list of leads — it shows up here with live progress."
            action={<Button onClick={() => navigate('/compose')}>Compose New Email</Button>}
          />
        ) : (
          <ul>
            {data.items.map((c) => (
              <CampaignCard key={c.id} c={c} onAction={onAction} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
