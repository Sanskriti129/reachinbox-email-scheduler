import { Clock, LoaderCircle } from 'lucide-react';
import type { EmailListItem } from '../../api/types';
import { formatPillTime } from '../../lib/format';

/** The coloured tag shown before the subject in every list row (matches Figma). */
export function StatusPill({ email }: { email: Pick<EmailListItem, 'status' | 'scheduled_at'> }) {
  switch (email.status) {
    case 'scheduled':
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600 ring-1 ring-orange-200">
          <Clock className="size-3" />
          {formatPillTime(email.scheduled_at)}
        </span>
      );
    case 'sending':
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
          <LoaderCircle className="size-3 animate-spin" />
          Sending
        </span>
      );
    case 'sent':
      return (
        <span className="inline-flex shrink-0 items-center rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-line">
          Sent
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex shrink-0 items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 ring-1 ring-red-200">
          Failed
        </span>
      );
  }
}
