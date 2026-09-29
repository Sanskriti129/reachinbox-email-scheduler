import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EmailListItem, EmailTab } from '../../api/types';
import { formatFull, nameFromEmail } from '../../lib/format';
import { StatusPill } from '../ui/StatusPill';

export function EmailRow({ email, tab }: { email: EmailListItem; tab: EmailTab }) {
  const when = tab === 'sent' ? email.sent_at : email.scheduled_at;
  return (
    <li>
      <Link
        to={`/email/${email.id}`}
        className="group flex items-center gap-4 border-b border-line px-6 py-3.5 transition-colors hover:bg-surface/70"
        title={when ? `${tab === 'sent' ? 'Sent' : 'Scheduled for'} ${formatFull(when)}` : undefined}
      >
        <span className="w-44 shrink-0 truncate text-sm" title={email.recipient}>
          <span className="text-muted">To: </span>
          <span className="font-medium">{nameFromEmail(email.recipient)}</span>
          <span className="block truncate text-xs text-faint sm:hidden">{email.recipient}</span>
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
            className="hidden shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 lg:inline"
            title="Moved to a later hour because the hourly limit was reached"
          >
            rate-limited
          </span>
        )}
        {email.status === 'failed' && email.error && (
          <span className="hidden max-w-40 shrink-0 truncate text-xs text-red-500 lg:inline" title={email.error}>
            {email.error}
          </span>
        )}
        <Star className="size-4 shrink-0 text-faint/60 group-hover:text-faint" />
      </Link>
    </li>
  );
}
