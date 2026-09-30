import { ExternalLink, Gauge } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EmailListItem, EmailTab } from '../../api/types';
import { formatFull, formatRelative, nameFromEmail } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { StatusPill } from '../ui/StatusPill';

export function EmailRow({ email, tab }: { email: EmailListItem; tab: EmailTab }) {
  const when = tab === 'sent' ? email.sent_at : email.scheduled_at;
  const name = nameFromEmail(email.recipient);
  return (
    <li>
      <Link
        to={`/email/${email.id}`}
        className="group relative flex items-center gap-4 border-b border-line px-6 py-3.5 transition-colors hover:bg-surface/70 focus-visible:bg-surface focus-visible:outline-none"
        title={when ? `${tab === 'sent' ? 'Sent' : 'Scheduled for'} ${formatFull(when)}` : undefined}
      >
        <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-500 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="flex w-48 shrink-0 items-center gap-3">
          <Avatar name={name || email.recipient} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-sm">
              <span className="text-muted">To: </span>
              <span className="font-medium">{name}</span>
            </span>
            <span className="block truncate text-xs text-faint">{email.recipient}</span>
          </span>
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-2">
          <StatusPill email={email} />
          <span className="min-w-0 truncate text-sm">
            <span className="font-semibold">{email.subject}</span>
            <span className="text-faint"> - {email.snippet}</span>
          </span>
        </span>

        {email.reschedule_count > 0 && tab === 'scheduled' && (
          <span
            className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 lg:inline-flex"
            title="Moved to a later hour because the sender's hourly limit was reached"
          >
            <Gauge className="size-3" /> rate-limited
          </span>
        )}
        {email.status === 'failed' && email.error && (
          <span className="hidden max-w-40 shrink-0 truncate text-xs text-red-500 lg:inline" title={email.error}>
            {email.error}
          </span>
        )}

        <span className="hidden w-28 shrink-0 text-right text-xs text-muted sm:block">
          {when ? formatRelative(when) : ''}
        </span>

        {email.preview_url ? (
          <button
            type="button"
            title="View delivered message on Ethereal"
            aria-label="View on Ethereal"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(email.preview_url!, '_blank', 'noopener');
            }}
            className="shrink-0 rounded-lg p-1.5 text-faint opacity-60 transition hover:bg-white hover:text-brand-600 group-hover:opacity-100"
          >
            <ExternalLink className="size-4" />
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
      </Link>
    </li>
  );
}
