-- Idempotent schema: safe to run on every boot.

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  google_id   TEXT UNIQUE NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SMTP identities emails are sent from (Ethereal test accounts).
CREATE TABLE IF NOT EXISTS senders (
  id          SERIAL PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  smtp_host   TEXT NOT NULL DEFAULT 'smtp.ethereal.email',
  smtp_port   INT  NOT NULL DEFAULT 587,
  smtp_user   TEXT NOT NULL,
  smtp_pass   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One "compose" action = one campaign fanned out into many emails.
CREATE TABLE IF NOT EXISTS campaigns (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id       INT NOT NULL REFERENCES senders(id),
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  delay_ms        INT NOT NULL,
  hourly_limit    INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('scheduled', 'sending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS emails (
  id                 SERIAL PRIMARY KEY,
  campaign_id        INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id          INT NOT NULL REFERENCES senders(id),
  recipient          TEXT NOT NULL,
  subject            TEXT NOT NULL,
  body               TEXT NOT NULL,
  status             email_status NOT NULL DEFAULT 'scheduled',
  scheduled_at       TIMESTAMPTZ NOT NULL,
  original_scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at            TIMESTAMPTZ,
  locked_at          TIMESTAMPTZ,
  attempts           INT NOT NULL DEFAULT 0,
  reschedule_count   INT NOT NULL DEFAULT 0,
  message_id         TEXT,
  preview_url        TEXT,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same campaign can never contain the same recipient twice.
  UNIQUE (campaign_id, recipient)
);

CREATE INDEX IF NOT EXISTS emails_user_status_idx ON emails (user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS emails_status_sched_idx ON emails (status, scheduled_at);

CREATE TABLE IF NOT EXISTS slack_connections (
  user_id       INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id       TEXT,
  team_name     TEXT,
  channel       TEXT,
  webhook_url   TEXT NOT NULL,
  access_token  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign lifecycle (pause / resume / cancel a whole campaign).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('active', 'paused', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS emails_campaign_status_idx ON emails (campaign_id, status);

-- Friendly "From" address shown to recipients and in the UI. Ethereal logins are random
-- strings (and get rotated when Ethereal expires them); this stays stable.
ALTER TABLE senders ADD COLUMN IF NOT EXISTS from_email TEXT;
UPDATE senders SET from_email = split_part(lower(name), ' ', 1) || '@reachinbox-demo.test'
 WHERE from_email IS NULL AND smtp_host LIKE '%ethereal.email';
