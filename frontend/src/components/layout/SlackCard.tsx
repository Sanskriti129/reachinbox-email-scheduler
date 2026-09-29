import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useToast';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

const slackResult: Record<string, [string, 'success' | 'error' | 'info']> = {
  connected: ['Slack connected — you will be alerted when a sender hits its hourly limit.', 'success'],
  denied: ['Slack connection was cancelled.', 'info'],
  expired: ['Slack connection link expired, please try again.', 'error'],
  error: ['Could not connect Slack. Please try again.', 'error'],
  not_configured: ['Slack app credentials are not configured on the server.', 'error'],
};

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#E01E5A" d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" />
      <path fill="#36C5F0" d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" />
      <path fill="#2EB67D" d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" />
      <path fill="#ECB22E" d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
    </svg>
  );
}

export function SlackCard() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, reload } = useAsync(() => api.slackStatus(), []);

  // Show the result of the OAuth round-trip once, then clean the URL.
  useEffect(() => {
    const status = params.get('slack');
    if (!status) return;
    const [msg, tone] = slackResult[status] ?? slackResult.error!;
    toast(msg, tone);
    params.delete('slack');
    setParams(params, { replace: true });
    void reload(true);
  }, [params, setParams, toast, reload]);

  const disconnect = async () => {
    await api.slackDisconnect();
    toast('Slack disconnected. Rate-limit alerts are paused.', 'info');
    void reload(true);
  };
  const test = async () => {
    const r = await api.slackTest().catch(() => ({ ok: false }));
    toast(r.ok ? 'Test message sent to Slack.' : 'Slack test failed.', r.ok ? 'success' : 'error');
  };

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <SlackLogo /> Slack alerts
      </div>
      {loading && !data ? (
        <Spinner className="size-4" />
      ) : data?.connected ? (
        <>
          <p className="mb-2 text-xs text-muted">
            Posting to <span className="font-medium text-ink">{data.channel}</span> in {data.team}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="soft" onClick={test} className="flex-1 px-2">
              Test
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect} className="flex-1 px-2">
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">Get notified the moment a sender hits its hourly limit.</p>
          <a
            href={api.slackInstallUrl}
            className="flex h-8 w-full items-center justify-center gap-2 rounded-full bg-[#4A154B] text-xs font-medium text-white hover:bg-[#3b0f3c]"
          >
            <SlackLogo /> Connect Slack
          </a>
        </>
      )}
    </div>
  );
}
