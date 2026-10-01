import { ArrowLeft, CalendarClock, Clock, FlaskConical, Gauge, Mail, Timer, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { RecipientsField } from '../components/compose/RecipientsField';
import { RichTextEditor } from '../components/compose/RichTextEditor';
import { SendLaterPopover } from '../components/compose/SendLaterPopover';
import { useLayout } from '../components/layout/AppLayout';
import { Button, IconButton } from '../components/ui/Button';
import { TestModeBanner } from '../components/ui/TestModeBanner';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../hooks/useToast';
import { formatFull } from '../lib/format';
import { isBlankHtml } from '../lib/html';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-line px-5 py-3">
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
  hint,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          placeholder="00"
          className="h-9 w-24 rounded-lg border border-line bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function SummaryItem({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-medium text-ink">{value}</p>
      </div>
    </li>
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
  const [testing, setTesting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!senderData) return;
    setSenderId((id) => id ?? senderData.senders[0]?.id ?? null);
    setHourlyLimit((h) => (Number.isNaN(h) ? senderData.limits.maxEmailsPerHourPerSender : h));
  }, [senderData]);

  const limits = senderData?.limits;
  const sender = senderData?.senders.find((s) => s.id === senderId);
  const effectiveLimit = limits ? Math.min(hourlyLimit || Infinity, limits.maxEmailsPerHourPerSender) : hourlyLimit;

  // Preview what the scheduler will do with these settings.
  const plan = useMemo(() => {
    if (!recipients.length) return null;
    const start = Math.max(startAt?.getTime() ?? Date.now(), Date.now());
    const gap = Math.max((delaySec || 0) * 1000, limits?.minDelayBetweenSendsMs ?? 0);
    const last = start + (recipients.length - 1) * gap;
    const hours = Number.isFinite(effectiveLimit) ? Math.ceil(recipients.length / effectiveLimit) : 1;
    return { start, last, hours, gap };
  }, [recipients.length, startAt, delaySec, limits, effectiveLimit]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!senderId) e.sender = 'Choose a sender';
    if (!recipients.length) e.to = 'Add at least one recipient or upload a list';
    else if (recipients.length > 10_000) e.to = `Up to 10,000 recipients per campaign (you have ${recipients.length.toLocaleString()})`;
    if (!subject.trim()) e.subject = 'Subject is required';
    if (isBlankHtml(body)) e.body = 'Write a message';
    if (!(delaySec >= 0)) e.delay = 'Delay must be 0 or more';
    else if (delaySec > 86_400) e.delay = 'Delay can be at most 24 hours (86,400 s)';
    if (!(hourlyLimit > 0)) e.limit = 'Hourly limit must be at least 1';
    else if (!Number.isInteger(hourlyLimit)) e.limit = 'Hourly limit must be a whole number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = useCallback(
    async (ev?: FormEvent) => {
      ev?.preventDefault();
      if (submitting || !validate()) return;
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submitting, senderId, subject, body, recipients, startAt, delaySec, hourlyLimit],
  );

  // Ctrl/Cmd + Enter schedules from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit]);

  const sendTest = async () => {
    if (!senderId || !subject.trim() || isBlankHtml(body)) {
      toast('Add a subject and a message first, then send yourself a test.', 'info');
      return;
    }
    setTesting(true);
    try {
      const res = await api.sendTest({ senderId, subject: subject.trim(), body });
      toast('Test sent to you — opening it on Ethereal.', 'success');
      if (res.previewUrl) window.open(res.previewUrl, '_blank', 'noopener');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not send the test email', 'error');
    } finally {
      setTesting(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-red-500">{errors[k]}</p>;
  const usagePct = sender && limits ? Math.min(100, (sender.usage.sender / Math.max(1, effectiveLimit)) * 100) : 0;

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl px-4 pb-10 md:px-6">
      <div className="flex items-center gap-2 py-5">
        <IconButton type="button" label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-5 text-ink" />
        </IconButton>
        <h1 className="flex-1 text-xl font-semibold tracking-tight">Compose New Email</h1>

        <div className="relative flex items-center gap-2">
          <IconButton
            type="button"
            label="Send later"
            onClick={() => setPickerOpen((o) => !o)}
            className={startAt ? 'bg-brand-50 text-brand-600' : ''}
          >
            <Clock className="size-5" />
          </IconButton>
          <Button type="submit" variant="outline" size="sm" loading={submitting}>
            {startAt ? 'Schedule' : 'Send'}
          </Button>
          {pickerOpen && <SendLaterPopover value={startAt} onDone={setStartAt} onClose={() => setPickerOpen(false)} />}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left: the email itself */}
        <div className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-line bg-white">
            {senderError && <p className="px-5 pt-3 text-sm text-red-500">Could not load senders: {senderError}</p>}
            <Row label="From">
              <select
                value={senderId ?? ''}
                onChange={(e) => setSenderId(Number(e.target.value))}
                aria-label="From"
                className="h-8 max-w-full rounded-lg bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-brand-100"
              >
                {!senderData && <option>Loading senders…</option>}
                {senderData?.senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.email}
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

            <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-5 py-4">
              <NumberBox
                label="Delay between 2 emails"
                value={delaySec}
                onChange={setDelaySec}
                suffix="seconds"
                hint={limits ? `server minimum ${limits.minDelayBetweenSendsMs / 1000}s` : undefined}
              />
              <NumberBox
                label="Hourly limit"
                value={hourlyLimit}
                onChange={setHourlyLimit}
                suffix="per sender"
                hint={limits ? `server cap ${limits.maxEmailsPerHourPerSender}/hour` : undefined}
              />
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-ink">Start</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm hover:border-brand-500"
                >
                  <CalendarClock className="size-4 text-muted" />
                  {startAt ? formatFull(startAt.toISOString()) : 'Right now'}
                </button>
                {startAt && (
                  <button type="button" onClick={() => setStartAt(null)} className="self-start text-[11px] text-faint underline">
                    send now instead
                  </button>
                )}
              </div>
              {err('delay')}
              {err('limit')}
            </div>
          </section>

          <section>
            <RichTextEditor value={body} onChange={setBody} />
            {err('body')}
          </section>
        </div>

        {/* Right: live summary of what will happen */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-semibold">Schedule summary</h2>
            <ul className="mt-2 divide-y divide-line">
              <SummaryItem icon={Users} label="Recipients" value={recipients.length ? recipients.length.toLocaleString() : 'None yet'} />
              <SummaryItem
                icon={CalendarClock}
                label="First email"
                value={plan ? formatFull(new Date(plan.start).toISOString()) : startAt ? formatFull(startAt.toISOString()) : 'Right after you click Send'}
              />
              {plan && recipients.length > 1 && (
                <SummaryItem icon={Timer} label="Last email (at the earliest)" value={formatFull(new Date(plan.last).toISOString())} />
              )}
              <SummaryItem
                icon={Gauge}
                label="Hourly windows needed"
                value={plan ? `${plan.hours} × ${Number.isFinite(effectiveLimit) ? effectiveLimit : '∞'} per hour` : '—'}
              />
            </ul>
            {plan && plan.hours > 1 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                More recipients than one hour allows — extra emails roll into the next hour automatically, in order.
              </p>
            )}
            <Button type="submit" className="mt-4 w-full" loading={submitting}>
              {startAt ? 'Schedule emails' : 'Send now'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full"
              loading={testing}
              icon={<FlaskConical className="size-4" />}
              onClick={() => void sendTest()}
            >
              Send test to me
            </Button>
            <p className="mt-1 text-center text-[11px] text-faint">or press Ctrl + Enter to schedule</p>
          </section>

          {sender && limits && (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-sm font-semibold">Sender this hour</h2>
              <p className="mt-1 truncate text-xs text-muted">{sender.email}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full transition-all ${usagePct >= 100 ? 'bg-amber-500' : 'bg-brand-500'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                <span className="font-medium text-ink">{sender.usage.sender}</span> of {Number.isFinite(effectiveLimit) ? effectiveLimit : '–'} used ·
                resets {new Date(sender.usage.windowEndsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </p>
            </section>
          )}

          <TestModeBanner compact />
        </aside>
      </div>
    </form>
  );
}
