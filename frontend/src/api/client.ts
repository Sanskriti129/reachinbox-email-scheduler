import type {
  Campaign,
  Counts,
  EmailDetail,
  EmailListResponse,
  EmailTab,
  ScheduleRequest,
  ScheduleResponse,
  SendersResponse,
  SlackStatus,
  User,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Set once /auth/me succeeds; only then does a 401 mean "your session expired". */
let signedIn = false;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (path === '/auth/me') signedIn = res.ok;
  // Session expired mid-use (we *were* signed in): back to login instead of a broken page.
  // Requests made before /auth/me answers must not trigger this.
  if (res.status === 401 && signedIn && path !== '/auth/me' && !location.pathname.startsWith('/login')) {
    signedIn = false;
    location.assign('/login?error=session_expired');
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  me: () => request<User>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  googleLoginUrl: '/api/auth/google',

  counts: () => request<Counts>('/emails/counts'),
  emails: (tab: EmailTab, q = '', limit = 50) =>
    request<EmailListResponse>(`/emails?status=${tab}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  cancelEmail: (id: number) => request<{ ok: true }>(`/emails/${id}`, { method: 'DELETE' }),
  email: (id: number) => request<EmailDetail>(`/emails/${id}`),
  senders: () => request<SendersResponse>('/senders'),
  schedule: (body: ScheduleRequest) =>
    request<ScheduleResponse>('/emails/schedule', { method: 'POST', body: JSON.stringify(body) }),

  campaigns: () => request<{ items: Campaign[] }>('/campaigns'),
  campaignAction: (id: number, action: 'pause' | 'resume' | 'cancel') =>
    request<Record<string, number>>(`/campaigns/${id}/${action}`, { method: 'POST' }),
  sendTest: (body: Pick<ScheduleRequest, 'senderId' | 'subject' | 'body'>) =>
    request<{ previewUrl: string | null }>('/emails/test', { method: 'POST', body: JSON.stringify(body) }),

  slackStatus: () => request<SlackStatus>('/slack/status'),
  slackInstallUrl: '/api/slack/install',
  slackTest: () => request<{ ok: boolean }>('/slack/test', { method: 'POST' }),
  slackDisconnect: () => request<{ ok: true }>('/slack', { method: 'DELETE' }),
};
