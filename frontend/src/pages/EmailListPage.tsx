import { CircleAlert, Clock, Gauge, PenLine, Send, ServerOff, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { EmailTab } from '../api/types';
import { EmailRow } from '../components/emails/EmailRow';
import { Toolbar } from '../components/emails/Toolbar';
import { useLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { TestModeBanner } from '../components/ui/TestModeBanner';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../hooks/useToast';
import { formatRelative } from '../lib/format';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const copy = {
  scheduled: {
    title: 'Scheduled',
    subtitle: 'Emails waiting to go out. They send automatically at their time, even if the server restarts.',
    icon: Clock,
    empty: 'Nothing scheduled yet',
    hint: 'Compose an email, upload your leads and pick a start time — every email will wait here until it is sent.',
  },
  sent: {
    title: 'Sent',
    subtitle: 'Everything the workers have delivered (or given up on after retries).',
    icon: Send,
    empty: 'No sent emails yet',
    hint: 'Emails appear here the moment a worker delivers them.',
  },
};

export function EmailListPage({ tab }: { tab: EmailTab }) {
  const navigate = useNavigate();
  const { counts, refreshCounts } = useLayout();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [pageSize, setPageSize] = useState(50);
  const toast = useToast();
  const q = useDebounced(query.trim(), 300);

  // Poll so rows move from Scheduled → Sent live while you watch.
  const { data, error, loading, reload } = useAsync(() => api.emails(tab, q, pageSize), [tab, q, pageSize], { pollMs: 4000 });

  useEffect(() => {
    setQuery('');
    setPageSize(50);
  }, [tab]);

  const cancel = async (id: number) => {
    try {
      await api.cancelEmail(id);
      toast('Email cancelled — it will not be sent.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    void reload(true);
    refreshCounts();
  };

  const nextOverdue = counts?.nextAt ? new Date(counts.nextAt).getTime() < Date.now() - 60_000 : false;
  const workerDown = counts?.workers === 0 && (counts?.scheduled ?? 0) > 0;

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === 'all') return all;
    const attention = (e: (typeof all)[number]) => e.status === 'failed' || e.reschedule_count > 0;
    return all.filter((e) => (filter === 'attention' ? attention(e) : !attention(e)));
  }, [data, filter]);

  const { title, subtitle, icon, empty, hint } = copy[tab];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 px-6 pb-4 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>
        </div>
        <Button onClick={() => navigate('/compose')} icon={<PenLine className="size-4" />}>
          Compose
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 px-6 pb-4 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          tone="orange"
          label="Scheduled"
          value={counts?.scheduled ?? '–'}
          hint={counts?.nextAt ? (nextOverdue ? 'due now, waiting for a worker' : `next ${formatRelative(counts.nextAt)}`) : 'nothing queued'}
        />
        <StatCard icon={Send} tone="brand" label="Sent in the last hour" value={counts?.sentLastHour ?? '–'} hint={`${counts?.sent ?? 0} delivered in total`} />
        <StatCard icon={Gauge} tone="amber" label="Waiting on hourly limit" value={counts?.rateLimited ?? '–'} hint="rolled to a later hour" />
        <StatCard icon={TriangleAlert} tone="red" label="Failed" value={counts?.failed ?? '–'} hint="after all retries" />
      </div>

      {workerDown && (
        <div className="px-6 pb-4">
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ServerOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              <span className="font-semibold">No worker is running.</span> Your emails are safe and will go out the moment a
              worker starts (<code className="rounded bg-amber-100 px-1 text-xs">npm run dev:worker</code>). Overdue emails are
              sent right away, never skipped.
            </p>
          </div>
        </div>
      )}

      {tab === 'sent' && (
        <div className="px-6 pb-4">
          <TestModeBanner />
        </div>
      )}

      <div className="mx-6 mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white">
        <Toolbar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          refreshing={loading && !!data}
          onRefresh={() => {
            void reload();
            refreshCounts();
          }}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !data ? (
            <SkeletonRows />
          ) : error && !data ? (
            <EmptyState
              icon={CircleAlert}
              title="Couldn't load emails"
              description={error}
              action={<Button onClick={() => void reload()}>Try again</Button>}
            />
          ) : items.length === 0 ? (
            q || filter !== 'all' ? (
              <EmptyState icon={icon} title="No matching emails" description="Try a different search or clear the filter." />
            ) : (
              <EmptyState
                icon={icon}
                title={empty}
                description={hint}
                action={<Button onClick={() => navigate('/compose')}>Compose New Email</Button>}
              />
            )
          ) : (
            <>
              <ul>
                {items.map((e) => (
                  <EmailRow key={e.id} email={e} tab={tab} onCancel={tab === 'scheduled' ? cancel : undefined} />
                ))}
              </ul>
              <div className="flex items-center justify-between gap-4 px-6 py-3 text-xs text-faint">
                <span>
                  Showing {items.length} of {data!.total}
                  {data!.search && ' · results from Elasticsearch'}
                </span>
                {!data!.search && data!.items.length < data!.total && pageSize < 1000 && (
                  <Button size="sm" variant="soft" onClick={() => setPageSize((n) => n + 100)}>
                    Load more
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
