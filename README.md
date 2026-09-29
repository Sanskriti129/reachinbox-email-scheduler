# ReachInbox — Full-stack Email Job Scheduler

A production-style email scheduler: an Express + BullMQ backend that schedules and sends emails through Ethereal SMTP, and a React dashboard (built to the provided Figma) to compose campaigns and watch them go out.

- **No cron anywhere.** Every email is a BullMQ *delayed job* persisted in Redis, with Postgres as the source of truth.
- **Survives restarts.** Future emails still send on time, and nothing is re-sent or restarted from scratch.
- **Rate limited and throttled.** Hourly limits live in Redis counters that are safe across workers. A minimum delay between sends is enforced, and overflow rolls into the next hour.
- **Slack alerts.** Real OAuth "Connect Slack". A live message is posted the moment a sender hits its hourly limit.
- **Searchable.** Every scheduled and sent email is indexed in Elasticsearch.
- **Live queue dashboard.** Bull Board at `/admin/queues`.

---

## Contents

1. [Tech stack](#tech-stack)
2. [Quick start (Docker)](#quick-start-docker)
3. [Running backend & frontend](#running-the-backend-and-frontend)
4. [Environment variables, Ethereal, Google & Slack setup](#configuration)
5. [Architecture](#architecture)
   - [How scheduling works](#how-scheduling-works)
   - [Persistence & restarts](#persistence--restarts)
   - [Idempotency](#idempotency-never-send-twice)
   - [Rate limiting & concurrency](#rate-limiting-delay--concurrency)
   - [Behaviour under load (1000+ emails)](#behaviour-under-load)
   - [Slack notifications](#slack-notifications)
   - [Search](#search-elasticsearch)
6. [API](#api)
7. [Features implemented](#features-implemented)
8. [Assumptions & trade-offs](#assumptions-shortcuts--trade-offs)

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | TypeScript, Express 5, BullMQ 6 (Redis), PostgreSQL (`pg`, plain SQL), Nodemailer + Ethereal, Elasticsearch 8, Bull Board, Zod |
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS 4, React Router, PapaParse, lucide-react |
| Infra | Docker Compose: Postgres 16, Redis 7 (AOF on), Elasticsearch 8.15 |

```
.
├── backend/
│   ├── src/
│   │   ├── app.ts / server.ts      Express API (+ Bull Board, serves built frontend in prod)
│   │   ├── workerApp.ts / worker.ts  BullMQ worker process
│   │   ├── all.ts                  API + worker in one process (single-service hosting)
│   │   ├── config.ts               env parsing & validation (zod) — every knob is configurable
│   │   ├── db/schema.sql           idempotent schema, applied on boot
│   │   ├── lib/queue.ts, redis.ts  queue + connections
│   │   ├── routes/                 auth (Google), emails, slack
│   │   └── services/
│   │       ├── emails.ts           schedule campaign, list, boot-time reconcile
│   │       ├── processor.ts        the job handler (limit → claim → send → mark)
│   │       ├── rateLimiter.ts      Redis Lua counters, next-window placement
│   │       ├── mailer.ts           Ethereal senders + SMTP transport
│   │       ├── search.ts           Elasticsearch indexing & search
│   │       └── slack.ts            Slack OAuth + notifications
│   └── scripts/loadTest.ts         schedule 1000+ emails at once
├── frontend/src/
│   ├── api/                        typed API client + response types
│   ├── components/ui/              Button, IconButton, Spinner/Skeleton, EmptyState, Avatar, StatusPill
│   ├── components/layout/          AppLayout, Sidebar, UserMenu, SlackCard
│   ├── components/emails/          EmailRow, Toolbar (search / filter / refresh)
│   ├── components/compose/         RecipientsField (CSV upload), SendLaterPopover, RichTextEditor
│   ├── hooks/                      useAuth, useAsync (loading/error/poll), useToast
│   └── pages/                      Login, EmailList (Scheduled / Sent), EmailDetail, Compose
├── docker-compose.yml
└── Dockerfile
```

---

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env        # then fill in Google + Slack credentials (see below)
docker compose up -d                        # Postgres, Redis, Elasticsearch
cd backend  && npm install && npm run dev           # API on :4000
cd backend  && npm run dev:worker                   # worker (second terminal)
cd frontend && npm install && npm run dev           # UI on :5173
```

Open http://localhost:5173 and log in with Google. The queue dashboard is at http://localhost:4000/admin/queues.

To run everything in containers instead: `docker compose --profile app up -d --build`, then open http://localhost:4000.

## Running the backend and frontend

**Backend** (`backend/`)

| Command | What it does |
| --- | --- |
| `npm run dev` | API with hot reload (applies schema, creates Ethereal senders, sets up ES index) |
| `npm run dev:worker` | BullMQ worker with hot reload. Run as many as you like: limits are shared in Redis |
| `npm run build && npm start` / `npm run start:worker` | production API / worker |
| `npm run start:all` | API + worker in one process |
| `npm run migrate` | apply schema only |
| `npm run load-test -- --count 1000 --limit 50` | schedule 1000 emails at the same instant (see [load](#behaviour-under-load)) |

**Frontend** (`frontend/`): `npm run dev` (Vite on :5173, proxies `/api` and `/admin` to :4000) and `npm run build` (static build, served by the API in production).

## Configuration

All settings live in `backend/.env` (template: [`backend/.env.example`](backend/.env.example)). None of the limits are hardcoded.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | `5` | jobs processed in parallel per worker process |
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | **min 2 seconds between any two sends** (global, across all workers) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | hourly cap per sender (a campaign can set a lower one) |
| `MAX_EMAILS_PER_HOUR` | `1000` | global hourly cap across all senders |
| `JOB_ATTEMPTS` | `3` | SMTP retries (exponential backoff 5s, 10s, 20s) |
| `ETHEREAL_SENDERS` | *(empty)* | `user:pass,user2:pass2`. Empty means auto-create `ETHEREAL_SENDER_COUNT` accounts |
| `DRY_RUN_SMTP` | `false` | skip the real SMTP call (for big load tests) |

### Ethereal Email

There's nothing to set up. On first boot the API creates `ETHEREAL_SENDER_COUNT` (default 3) distinct Ethereal accounts through Ethereal's API and stores them in the `senders` table. These are the "multiple senders" you pick from in the compose screen. Every sent email records Ethereal's preview URL, so the email detail page links straight to the delivered message. To use your own accounts, create them at https://ethereal.email and set `ETHEREAL_SENDERS`.

### Google OAuth

1. In https://console.cloud.google.com, open *APIs & Services*, then *OAuth consent screen* (External). Add your account as a test user.
2. Go to *Credentials*, then *Create OAuth client ID* (Web application).
3. Add the authorised redirect URI `http://localhost:4000/api/auth/google/callback` (and `https://<your-domain>/api/auth/google/callback` for production).
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The flow is authorization-code with a CSRF `state` cookie. The backend exchanges the code, reads the OpenID profile (name, email, avatar), upserts the user and sets an httpOnly JWT session cookie.

### Slack app

1. Go to https://api.slack.com/apps and choose *Create New App*, then *From scratch*.
2. Under *OAuth & Permissions*, add the bot scopes `incoming-webhook` and `chat:write`, and the redirect URL `https://<your-domain>/api/slack/callback`. Slack requires HTTPS, so for local testing use a tunnel such as `ngrok http 4000` and set `BACKEND_URL` to it.
3. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`. Set *Manage Distribution* to public if users outside your workspace will connect.

---

## Architecture

```
 React dashboard ──HTTP──▶ Express API ──INSERT──▶ PostgreSQL  (source of truth: campaigns, emails, users, slack)
        ▲                     │   │
        │ poll 4s             │   └──bulk index──▶ Elasticsearch (search)
        │                     ▼
        │            BullMQ queue "email-send" in Redis (delayed jobs, AOF-persisted)
        │                     │
        │                     ▼
        └──────────── Worker(s)  ── limiter: 1 job / MIN_DELAY (global) ──
                        │ 1. load row (skip if sent)
                        │ 2. reserve hourly slot  (Redis Lua, per-sender + global)
                        │      └─ full → move job to next hour, Slack alert once
                        │ 3. claim row scheduled→sending (single UPDATE)
                        │ 4. SMTP via Ethereal → mark sent (+ preview URL), update ES
```

### How scheduling works

1. `POST /api/emails/schedule` validates the payload (zod), cleans and dedupes recipients, and computes each email's send time as `startAt + i × delayMs`.
2. In **one transaction** it inserts the campaign and all email rows. A single `INSERT … SELECT unnest(...)` handles thousands of rows in one round-trip, and `UNIQUE(campaign_id, recipient)` blocks duplicates.
3. After commit, each row gets a BullMQ job with `delay = scheduled_at − now` and the deterministic `jobId = email-<id>`, added in chunks of 500 with `addBulk`.
4. When the delay expires, BullMQ moves the job to *waiting*, and a worker picks it up (throttled by the limiter) and runs [`processor.ts`](backend/src/services/processor.ts).

There's no polling and no cron: BullMQ keeps delayed jobs in a Redis sorted set scored by timestamp.

### Persistence & restarts

- **Redis runs with AOF** (`appendonly yes`, `appendfsync everysec`) and `maxmemory-policy noeviction`, so delayed jobs survive a Redis restart. When the API or worker restarts, the jobs are simply still there.
- **Postgres is the source of truth.** On every worker boot, `reconcileQueue()` walks all `scheduled` and `sending` emails and re-creates any job that's missing. That covers a crash between DB commit and enqueue, or a wiped Redis. Because job ids are deterministic, BullMQ ignores re-adds of existing jobs, so this is always safe to run.
- A future email is re-enqueued with its **original** `scheduled_at`, so it still goes out at the right time. An email whose time already passed while the system was down is sent right away. Nothing restarts from "Day 1", because sent rows are never re-enqueued.
- **A worker killed mid-job:** BullMQ's lock (60s) expires, the stalled-job checker hands the job to another worker, and the row claim below prevents a double send.
- **Graceful shutdown:** on SIGINT/SIGTERM the worker finishes in-flight sends before exiting.

### Idempotency (never send twice)

Several guards stack up:

| Layer | Guard |
| --- | --- |
| Enqueue | deterministic `jobId = email-<id>`: the same email can't be queued twice |
| DB | `UNIQUE(campaign_id, recipient)`: the same campaign can't contain the same lead twice |
| Worker | row is re-read first; `sent` / `failed` means no-op |
| Worker | **atomic claim**: `UPDATE … SET status='sending' WHERE id=$1 AND status='scheduled' RETURNING *`. Only one worker can win, even with many workers on many machines |
| SMTP | deterministic `Message-ID: <email-<id>.campaign-<cid>@…>`, so any downstream can de-duplicate |

A row stuck in `sending` (the worker died after claiming) can only be re-claimed after a 2-minute lock age.

### Rate limiting, delay & concurrency

**Worker concurrency:** `WORKER_CONCURRENCY` jobs run in parallel per process, and you can run any number of worker processes. Everything shared lives in Redis or Postgres, never in memory, so parallel jobs are safe.

**Delay between each email:** the worker uses BullMQ's built-in **Redis-backed limiter**, `{ max: 1, duration: MIN_DELAY_BETWEEN_SENDS_MS }`. It's global across *all* workers, so no matter how many run, at most one send starts every 2s by default. Each campaign's own "Delay between 2 emails" spaces the *scheduled* times on top of that. The effective gap is `max(campaign delay, MIN_DELAY)`.

**Emails per hour:** enforced in [`rateLimiter.ts`](backend/src/services/rateLimiter.ts) with Redis counters keyed by hour window:

```
rl:sender:<senderId>:<hourWindow>   rl:global:<hourWindow>     (hourWindow = floor(epoch_ms / 3_600_000))
```

- A single **Lua script** checks both counters and increments both only if both are under their limits. Lua runs atomically in Redis, so concurrent workers can't overshoot (there's no read-then-write race). Keys expire after 2h.
- The per-sender limit is `min(campaign's Hourly Limit, MAX_EMAILS_PER_HOUR_PER_SENDER)`. The global limit is `MAX_EMAILS_PER_HOUR`.
- If an SMTP send fails, the slot is released, so failures don't eat the budget.

**When the limit is reached, jobs are never dropped or failed.** The worker:
1. computes the next free slot: `nextHourStart + position × MIN_DELAY`, where `position` comes from a per-window Redis `INCR` (`rl:overflow:<sender>:<window>`). Overflowing jobs are laid out in the order they overflowed, preserving the original order and avoiding a thundering herd at :00;
2. updates `scheduled_at` in Postgres (the UI shows a *rate-limited* tag and the original time);
3. calls `job.moveToDelayed(nextSlot)` and throws BullMQ's `DelayedError`. The job goes back to *delayed* without consuming a retry attempt;
4. sends a Slack alert (at most once per sender per hour window, using `SET NX`).

**Trade-offs:** fixed hour windows (not sliding) are simple, cheap and easy to explain, but they allow a burst at a window boundary. Ordering is preserved "as much as possible". Jobs from *different* campaigns on the same sender interleave by the time they overflowed, not strictly by creation time.

### Behaviour under load

Scheduling 1000+ emails at the same instant (`npm run load-test -- --count 1000 --limit 50`):

- The API inserts 1000 rows in one statement and enqueues them in two `addBulk` calls, in well under a second.
- All 1000 jobs become due together. The limiter admits one every `MIN_DELAY`, so the SMTP provider sees a steady trickle, not a spike.
- The first 50 reserve slots this hour. Job 51 hits the limit and gets placed at the next hour (plus its position), and the same goes for every later job. Slack gets exactly one alert.
- Next hour, the next 50 go out in order, and so on, until everything is sent. Nothing is dropped, duplicated or failed.
- With `DRY_RUN_SMTP=true` you can run 10k+ through the real scheduling path without touching Ethereal.

### Slack notifications

1. The user clicks **Connect Slack** in the sidebar, which goes to `/api/slack/install`. The backend stores a random `state` → userId mapping in Redis (10 min TTL) and redirects to Slack's OAuth v2 authorize page.
2. Slack redirects to `/api/slack/callback`. The backend exchanges the code (`oauth.v2.access`) and stores the **incoming webhook URL** (plus team, channel and token) per user in `slack_connections`. A confirmation message is posted immediately.
3. When a sender's limit is hit, the worker looks up the connection **at that moment**. There's no caching, so connecting, disconnecting or reconnecting takes effect without a restart or redeploy. With no connection the alert is silently skipped. If Slack returns 403/404 (app removed), the connection is dropped.
4. The sidebar card shows the connected channel, with **Test** and **Disconnect** buttons.

### Search (Elasticsearch)

- The `emails` index maps recipient, subject, body (HTML stripped), status, sender and dates.
- Rows are bulk-indexed at scheduling time, and documents are updated on every status change (sent / failed / rescheduled).
- `GET /api/emails?status=sent&q=...` runs a `multi_match` (`bool_prefix`, fuzzy) over recipient^3, subject^2 and body, filtered by user and tab, then hydrates the rows from Postgres in relevance order. The search box in the dashboard uses this.
- Indexing is best-effort: an Elasticsearch outage never blocks scheduling or sending, because Postgres is the source of truth.

---

## API

All routes except auth callbacks need the session cookie.

| Method & path | Description |
| --- | --- |
| `GET /api/auth/google` → `/callback` | Google OAuth login |
| `GET /api/auth/me`, `POST /api/auth/logout` | session |
| `GET /api/senders` | senders, their usage this hour, and the configured limits |
| `POST /api/emails/schedule` | `{ senderId, subject, body, recipients[], startAt, delayMs, hourlyLimit }` |
| `GET /api/emails?status=scheduled\|sent&q=&limit=&offset=` | list (and Elasticsearch search when `q` is set) |
| `GET /api/emails/:id`, `GET /api/emails/counts` | detail, tab counts |
| `GET /api/slack/install` → `/callback`, `GET /api/slack/status`, `POST /api/slack/test`, `DELETE /api/slack` | Slack |
| `GET /api/health` | DB / Redis / ES status + queue counts |
| `/admin/queues` | Bull Board (login required) |

Postman example:

```http
POST /api/emails/schedule
Cookie: ri_session=...
Content-Type: application/json

{ "senderId": 1, "subject": "Hello", "body": "<p>Hi!</p>",
  "recipients": ["a@example.com", "b@example.com"],
  "startAt": "2026-10-01T09:00:00Z", "delayMs": 5000, "hourlyLimit": 100 }
```

---

## Features implemented

**Backend**

| Requirement | Where |
| --- | --- |
| Accept & store scheduling requests (Postgres) | `routes/emails.ts`, `services/emails.ts`, `db/schema.sql` |
| BullMQ delayed jobs, no cron | `lib/queue.ts`, `services/emails.ts` |
| Multiple senders via Ethereal SMTP | `services/mailer.ts` |
| Persistence across restarts, no duplicates | Redis AOF, `reconcileQueue()`, deterministic job ids, atomic claim |
| Configurable worker concurrency | `WORKER_CONCURRENCY` → `workerApp.ts` |
| Min delay between sends | BullMQ Redis limiter, `MIN_DELAY_BETWEEN_SENDS_MS` |
| Hourly limits (per-sender + global), multi-instance safe | `services/rateLimiter.ts` (Lua) |
| Overflow rescheduled to next window, order preserved | `nextSlotAfterLimit()` + `moveToDelayed` |
| Slack OAuth + live alert on limit hit, connect/disconnect | `routes/slack.ts`, `services/slack.ts` |
| Elasticsearch indexing & search | `services/search.ts` |
| Live BullMQ dashboard | Bull Board at `/admin/queues` |
| Behaviour under load | `scripts/loadTest.ts` |

**Frontend**

| Requirement | Where |
| --- | --- |
| Real Google login, redirect to dashboard, name/email/avatar, logout | `pages/LoginPage.tsx`, `components/layout/UserMenu.tsx` |
| Dashboard with Scheduled / Sent tabs + counts, Compose button | `components/layout/Sidebar.tsx`, `pages/EmailListPage.tsx` |
| Compose: subject, rich-text body, CSV/text lead upload with detected count, start time, delay, hourly limit | `pages/ComposePage.tsx`, `components/compose/*` |
| Scheduled & Sent lists: email, subject, time, status | `components/emails/EmailRow.tsx`, `components/ui/StatusPill.tsx` |
| Loading skeletons, empty states, error toasts | `components/ui/*`, `hooks/useToast.tsx` |
| Email detail with Ethereal preview link | `pages/EmailDetailPage.tsx` |
| Search (Elasticsearch), filter, refresh, live updates | `components/emails/Toolbar.tsx`, polling in `useAsync` |
| Responsive (mobile drawer) | `components/layout/AppLayout.tsx` |

---

## Assumptions, shortcuts & trade-offs

- **The Figma login shows email/password as well as Google.** The assignment asks for Google OAuth, so that's the only real login. The email form is kept for visual fidelity and shows a notice.
- **The user card sits in the sidebar, as in the Figma**, rather than a separate top bar. On mobile the app shows a top header with the avatar and a drawer.
- **The "Send" button with no start time** schedules immediately, and the clock opens the *Send Later* picker. Attachments shown in the Figma aren't implemented, since they're out of scope for the scheduler.
- **The hourly limit is a fixed window** (clock hour), not sliding, which is simpler and good enough for throttling. The global min-delay limiter is shared by all senders.
- **The hourly limit from the compose screen** is applied per sender, capped by the server's `MAX_EMAILS_PER_HOUR_PER_SENDER`. Campaigns sharing a sender share its counter.
- **Plain SQL with `pg`** instead of an ORM keeps queries explicit (atomic claim, bulk insert). The schema is idempotent and applied on boot, which is fine for this scope. A real project would use versioned migrations.
- **Sessions are a signed JWT in an httpOnly, SameSite=Lax cookie.** The frontend is served from the same origin as the API in production, which avoids third-party-cookie issues.
- **The email body is HTML** from a lightweight contentEditable editor, sanitised with DOMPurify when rendered.
- **Dashboards refresh by polling** (4–5s) rather than websockets, which keeps things simple and reliable behind any host.
