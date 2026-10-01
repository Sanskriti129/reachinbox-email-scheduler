export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export interface UserRow {
  id: number;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface SenderRow {
  id: number;
  email: string;
  name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from_email: string | null;
}

export interface EmailRow {
  id: number;
  campaign_id: number;
  user_id: number;
  sender_id: number;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: Date;
  original_scheduled_at: Date;
  sent_at: Date | null;
  attempts: number;
  reschedule_count: number;
  message_id: string | null;
  preview_url: string | null;
  error: string | null;
  created_at: Date;
}

/** Payload stored in each BullMQ job. Kept minimal: the DB row is the source of truth. */
export interface SendEmailJob {
  emailId: number;
  senderId: number;
  hourlyLimit: number;
}
