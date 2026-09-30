import { ArrowLeft, CircleAlert, ExternalLink } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Avatar } from '../components/ui/Avatar';
import { IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { StatusPill } from '../components/ui/StatusPill';
import DOMPurify from 'dompurify';
import { useAsync } from '../hooks/useAsync';
import { formatFull } from '../lib/format';

export function EmailDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: email, error, loading } = useAsync(() => api.email(Number(id)), [id], { pollMs: 5000 });

  if (loading && !email) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-7" />
      </div>
    );
  }
  if (error || !email) return <EmptyState icon={CircleAlert} title="Email not found" description={error ?? undefined} />;

  const back = email.status === 'sent' || email.status === 'failed' ? '/sent' : '/scheduled';

  const steps = [
    { label: 'Scheduled', at: email.created_at, done: true },
    ...(email.reschedule_count > 0
      ? [{ label: `Moved by hourly limit (${email.reschedule_count}×)`, at: email.scheduled_at, done: true }]
      : []),
    {
      label: email.status === 'failed' ? 'Failed' : 'Sent',
      at: email.sent_at ?? email.scheduled_at,
      done: email.status === 'sent' || email.status === 'failed',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Back" onClick={() => (history.length > 1 ? navigate(-1) : navigate(back))}>
          <ArrowLeft className="size-5 text-ink" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">{email.subject}</h1>
        <StatusPill email={email} />
      </div>

      <article className="overflow-hidden rounded-2xl border border-line bg-white">
        <header className="flex flex-wrap items-start gap-3 border-b border-line px-6 py-5">
          <Avatar name={email.sender_name} size={42} />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-semibold">{email.sender_name}</span>{' '}
              <span className="text-muted">&lt;{email.sender_email}&gt;</span>
            </p>
            <p className="text-xs text-muted">to {email.recipient}</p>
          </div>
          <div className="text-right text-xs text-muted">
            {email.sent_at ? <>Sent {formatFull(email.sent_at)}</> : <>Scheduled for {formatFull(email.scheduled_at)}</>}
            {email.reschedule_count > 0 && (
              <p className="text-amber-700">Originally {formatFull(email.original_scheduled_at)}</p>
            )}
          </div>
        </header>

        {email.error && (
          <p className="mx-6 mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Last error (attempt {email.attempts}): {email.error}
          </p>
        )}

        <div
          className="prose-email px-6 py-6 text-[15px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body) }}
        />

        <footer className="flex flex-wrap items-center gap-4 border-t border-line bg-surface/50 px-6 py-4">
          <ol className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {steps.map((st, i) => (
              <li key={st.label} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-5 bg-line" />}
                <span className={`size-2 rounded-full ${st.done ? 'bg-brand-500' : 'bg-line ring-2 ring-brand-100'}`} />
                <span className={st.done ? 'text-ink' : 'text-muted'}>{st.label}</span>
                <span className="text-faint">{formatFull(st.at)}</span>
              </li>
            ))}
          </ol>
          {email.preview_url && (
            <a
              href={email.preview_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              View on Ethereal <ExternalLink className="size-4" />
            </a>
          )}
        </footer>
      </article>

      {email.status !== 'sent' && email.status !== 'failed' && (
        <p className="mt-4 text-center text-xs text-faint">This page refreshes automatically — watch it flip to Sent.</p>
      )}
    </div>
  );
}
