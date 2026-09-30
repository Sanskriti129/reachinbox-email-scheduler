import { ExternalLink, Gauge, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EmailListItem, EmailTab } from '../../api/types';
import { formatFull, formatRelative, nameFromEmail } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { StatusPill } from '../ui/StatusPill';

export function EmailRow({
  email,
  tab,
  onCancel,
}: {
  email: EmailListItem;
  tab: EmailTab;
  onCancel?: (id: number) => Promise<void>;
}) {
  const when = tab === 'sent' ? email.sent_at : email.scheduled_at;
  const overdue = tab === 'scheduled' && email.status === 'scheduled' && new Date(email.scheduled_at).getTime() < Date.now() - 60_000;
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);
  const name = nameFromEmail(email.recipient);
  return (
    <li>
      <Link
        to={`/email/${email.id}`}
        className="group relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-3.5 transition-colors hover:bg-surface/70 focus-visible:bg-surface focus-visible:outline-none"
        title={when ? `${tab === 'sent' ? 'Sent' : 'Scheduled for'} ${formatFull(when)}` : undefined}
      >
        <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-500 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="flex min-w-0 flex-1 items-center gap-3 sm:w-48 sm:flex-none">
          <Avatar name={name || email.recipient} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-sm">
              <span className="text-muted">To: </span>
              <span className="font-medium">{name}</span>
            </span>
            <span className="block truncate text-xs text-faint">{email.recipient}</span>
          </span>
        </span>

        <span className="order-last flex min-w-0 basis-full items-center gap-2 pl-[42px] sm:order-none sm:basis-0 sm:flex-1 sm:pl-0">
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

        <span className={`hidden w-28 shrink-0 text-right text-xs sm:block ${overdue ? 'font-medium text-amber-600' : 'text-muted'}`}>
          {overdue ? 'due now' : when ? formatRelative(when) : ''}
        </span>

        {onCancel && email.status === 'scheduled' && (
          <button
            type="button"
            disabled={cancelling}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!confirming) return setConfirming(true);
              setCancelling(true);
              await onCancel(email.id).finally(() => setCancelling(false));
            }}
            className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium transition ${
              confirming
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'text-faint opacity-0 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100'
            }`}
            aria-label={confirming ? 'Confirm cancel' : 'Cancel this email'}
          >
            {cancelling ? '…' : confirming ? 'Confirm' : <X className="size-4" />}
          </button>
        )}

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
