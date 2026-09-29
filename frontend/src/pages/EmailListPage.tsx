import { CircleAlert, Clock, Send } from 'lucide-react';
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
import { useAsync } from '../hooks/useAsync';

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
    icon: Clock,
    empty: 'No scheduled emails',
    hint: 'Compose a new email and pick a start time — it will show up here until it is sent.',
  },
  sent: {
    icon: Send,
    empty: 'No sent emails yet',
    hint: 'Emails appear here as soon as the worker delivers them.',
  },
};

export function EmailListPage({ tab }: { tab: EmailTab }) {
  const navigate = useNavigate();
  const { refreshCounts } = useLayout();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const q = useDebounced(query.trim(), 300);

  // Poll so rows move from Scheduled → Sent live while you watch.
  const { data, error, loading, reload } = useAsync(() => api.emails(tab, q), [tab, q], { pollMs: 4000 });

  useEffect(() => setQuery(''), [tab]);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === 'all') return all;
    const attention = (e: (typeof all)[number]) => e.status === 'failed' || e.reschedule_count > 0;
    return all.filter((e) => (filter === 'attention' ? attention(e) : !attention(e)));
  }, [data, filter]);

  const { icon, empty, hint } = copy[tab];

  return (
    <div className="flex h-full flex-col">
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
          <EmptyState icon={icon} title="No matching emails" description="Try a different search or filter." />
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
              <EmailRow key={e.id} email={e} tab={tab} />
            ))}
          </ul>
          <p className="px-6 py-3 text-xs text-faint">
            Showing {items.length} of {data!.total}
            {data!.search && ' · results from Elasticsearch'}
          </p>
        </>
      )}
    </div>
  );
}
