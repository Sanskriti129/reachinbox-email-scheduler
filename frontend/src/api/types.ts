export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';
export type EmailTab = 'scheduled' | 'sent';

export interface User {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface EmailListItem {
  id: number;
  recipient: string;
  subject: string;
  snippet: string;
  status: EmailStatus;
  scheduled_at: string;
  original_scheduled_at: string;
  sent_at: string | null;
  preview_url: string | null;
  error: string | null;
  reschedule_count: number;
  sender_email: string;
  sender_name: string;
}

export interface EmailDetail extends EmailListItem {
  body: string;
  campaign_id: number;
  attempts: number;
  message_id: string | null;
}

export interface EmailListResponse {
  items: EmailListItem[];
  total: number;
  search?: 'elasticsearch';
}

export interface Counts {
  scheduled: number;
  sent: number;
}

export interface Sender {
  id: number;
  email: string;
  name: string;
  usage: { sender: number; global: number; windowEndsAt: number };
}

export interface Limits {
  minDelayBetweenSendsMs: number;
  maxEmailsPerHourPerSender: number;
  maxEmailsPerHour: number;
  workerConcurrency: number;
}

export interface SendersResponse {
  senders: Sender[];
  limits: Limits;
}

export interface ScheduleRequest {
  senderId: number;
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayMs: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  campaignId: number;
  scheduled: number;
  invalid: number;
  duplicates: number;
  firstAt: string;
  lastAt: string;
}

export type SlackStatus =
  | { connected: false }
  | { connected: true; team: string; channel: string; since: string };
