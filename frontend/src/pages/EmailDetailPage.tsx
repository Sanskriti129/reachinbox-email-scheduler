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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <IconButton label="Back" onClick={() => (history.length > 1 ? navigate(-1) : navigate(back))}>
          <ArrowLeft className="size-5 text-ink" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium">{email.subject}</h1>
        <StatusPill email={email} />
      </div>

      <div className="px-6 py-5">
        <div className="mb-6 flex items-start gap-3">
          <Avatar name={email.sender_name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-semibold">{email.sender_name}</span>{' '}
              <span className="text-muted">&lt;{email.sender_email}&gt;</span>
            </p>
            <p className="text-xs text-muted">to {email.recipient}</p>
          </div>
          <div className="text-right text-xs text-muted">
            {email.sent_at ? (
              <>Sent {formatFull(email.sent_at)}</>
            ) : (
              <>Scheduled for {formatFull(email.scheduled_at)}</>
            )}
            {email.reschedule_count > 0 && (
              <p className="text-amber-700">
                Originally {formatFull(email.original_scheduled_at)} · moved by hourly limit
              </p>
            )}
          </div>
        </div>

        {email.error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Last error (attempt {email.attempts}): {email.error}
          </p>
        )}

        <div className="prose-email text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body) }} />

        {email.preview_url && (
          <a
            href={email.preview_url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-brand-700 hover:bg-brand-50"
          >
            View delivered message on Ethereal <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
