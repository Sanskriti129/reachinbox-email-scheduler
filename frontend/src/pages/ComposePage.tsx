import { ArrowLeft, Clock, Info } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { SendLaterPopover } from '../components/compose/SendLaterPopover';
import { RecipientsField } from '../components/compose/RecipientsField';
import { RichTextEditor } from '../components/compose/RichTextEditor';
import { useLayout } from '../components/layout/AppLayout';
import { Button, IconButton } from '../components/ui/Button';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../hooks/useToast';
import { formatFull } from '../lib/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-line py-2.5">
      <span className="w-16 shrink-0 pt-1 text-sm text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function NumberBox({
  value,
  onChange,
  label,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink">{label}</span>
      <input
        type="number"
        min={0}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        placeholder="00"
        className="h-8 w-20 rounded-lg border border-line px-2 text-sm outline-none focus:border-brand-500"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </label>
  );
}

export function ComposePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshCounts } = useLayout();
  const { data: senderData, error: senderError } = useAsync(() => api.senders(), []);

  const [senderId, setSenderId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delaySec, setDelaySec] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(NaN);
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!senderData) return;
    setSenderId((id) => id ?? senderData.senders[0]?.id ?? null);
    setHourlyLimit((h) => (Number.isNaN(h) ? senderData.limits.maxEmailsPerHourPerSender : h));
  }, [senderData]);

  const limits = senderData?.limits;
  const effectiveLimit = limits ? Math.min(hourlyLimit || Infinity, limits.maxEmailsPerHourPerSender) : hourlyLimit;

  // Preview what the scheduler will do with these settings.
  const plan = useMemo(() => {
    if (!recipients.length) return null;
    const start = Math.max(startAt?.getTime() ?? Date.now(), Date.now());
    const gap = Math.max((delaySec || 0) * 1000, limits?.minDelayBetweenSendsMs ?? 0);
    const last = start + (recipients.length - 1) * gap;
    const hours = Number.isFinite(effectiveLimit) ? Math.ceil(recipients.length / effectiveLimit) : 1;
    return { start, last, hours };
  }, [recipients.length, startAt, delaySec, limits, effectiveLimit]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!senderId) e.sender = 'Choose a sender';
    if (!recipients.length) e.to = 'Add at least one recipient or upload a list';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!body.replace(/<[^>]+>|&nbsp;/g, '').trim()) e.body = 'Write a message';
    if (!(delaySec >= 0)) e.delay = 'Delay must be 0 or more';
    if (!(hourlyLimit > 0)) e.limit = 'Hourly limit must be at least 1';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.schedule({
        senderId: senderId!,
        subject: subject.trim(),
        body,
        recipients,
        startAt: (startAt ?? new Date()).toISOString(),
        delayMs: Math.round(delaySec * 1000),
        hourlyLimit,
      });
      toast(
        `Scheduled ${res.scheduled} email${res.scheduled === 1 ? '' : 's'} starting ${formatFull(res.firstAt)}` +
          (res.invalid ? ` (${res.invalid} invalid skipped)` : ''),
        'success',
      );
      refreshCounts();
      navigate('/scheduled');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not schedule emails', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-red-500">{errors[k]}</p>;

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl pb-10">
      <div className="flex items-center gap-2 px-4 py-4">
        <IconButton type="button" label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-5 text-ink" />
        </IconButton>
        <h1 className="flex-1 text-xl font-medium">Compose New Email</h1>

        <div className="relative flex items-center gap-2">
          <IconButton
            type="button"
            label="Send later"
            onClick={() => setPickerOpen((o) => !o)}
            className={startAt ? 'text-brand-600' : ''}
          >
            <Clock className="size-5" />
          </IconButton>
          <Button type="submit" variant="outline" size="sm" loading={submitting}>
            {startAt ? 'Schedule' : 'Send'}
          </Button>
          {pickerOpen && (
            <SendLaterPopover value={startAt} onDone={setStartAt} onClose={() => setPickerOpen(false)} />
          )}
        </div>
      </div>

      <div className="px-6 md:px-20">
        {senderError && <p className="mb-2 text-sm text-red-500">Could not load senders: {senderError}</p>}
        <Row label="From">
          <select
            value={senderId ?? ''}
            onChange={(e) => setSenderId(Number(e.target.value))}
            aria-label="From"
            className="h-8 max-w-full rounded-lg bg-surface px-3 text-sm outline-none"
          >
            {!senderData && <option>Loading senders…</option>}
            {senderData?.senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.email} ({s.usage.sender} sent this hour)
              </option>
            ))}
          </select>
          {err('sender')}
        </Row>

        <Row label="To">
          <RecipientsField value={recipients} onChange={setRecipients} />
          {err('to')}
        </Row>

        <Row label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-faint"
          />
          {err('subject')}
        </Row>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-line py-3">
          <NumberBox label="Delay between 2 emails" value={delaySec} onChange={setDelaySec} suffix="sec" />
          <NumberBox label="Hourly Limit" value={hourlyLimit} onChange={setHourlyLimit} suffix="/ sender" />
          <span className="text-sm text-muted">
            Start:{' '}
            <button type="button" onClick={() => setPickerOpen(true)} className="font-medium text-ink underline">
              {startAt ? formatFull(startAt.toISOString()) : 'now'}
            </button>
          </span>
          {err('delay')}
          {err('limit')}
        </div>

        {plan && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {recipients.length} email{recipients.length === 1 ? '' : 's'} from {formatFull(new Date(plan.start).toISOString())}{' '}
              to ~{formatFull(new Date(plan.last).toISOString())}.
              {plan.hours > 1 &&
                ` With a limit of ${effectiveLimit}/hour this spans at least ${plan.hours} hour windows — extra emails roll over to the next hour automatically.`}
              {limits && ` Server enforces ≥ ${limits.minDelayBetweenSendsMs / 1000}s between sends.`}
            </span>
          </p>
        )}

        <div className="mt-4">
          <RichTextEditor value={body} onChange={setBody} />
          {err('body')}
        </div>
      </div>
    </form>
  );
}
