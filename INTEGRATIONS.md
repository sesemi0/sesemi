# SESEMI — Server & Integration Contract (INTEGRATIONS.md)

This document is the reference for the studio's backend: what the admin panel
expects from the server, which secrets exist, and how every integration is
wired. The Persian step-by-step deployment guide lives in `DEPLOY-fa.md`.

## Architecture

```
Browser (React site + Persian admin panel)
        │  same-origin fetch, credentials: 'include'
        ▼
Cloudflare Pages Functions  (functions/api/[[route]].ts)
        │  session cookie (HMAC-signed, HttpOnly) + CSRF tokens
        ├── D1 database (SQLite)  — leads, orders, events, settings, owner
        ├── Resend API            — new-enquiry email notifications (optional)
        └── AI provider (OpenAI / Gemini / OpenRouter) — server-held key (optional)
```

There is no password, token or API key in the browser bundle. All privileged
access goes through `/api/admin/*` protected by a signed HttpOnly session
cookie plus an `X-CSRF-Token` header derived from that session.

## Secrets (Cloudflare Pages → Settings → Environment variables)

| Name             | Required | Purpose                                              |
|------------------|----------|------------------------------------------------------|
| `SESSION_SECRET` | yes      | Signs owner session cookies + CSRF tokens. Rotate = all sessions invalidated. |
| `ALLOW_SETUP`    | once     | Set to `true` only for the first-run owner creation at `/admin`; remove afterwards. |
| `RESEND_API_KEY` | optional | Enables new-enquiry email notifications.             |
| `OWNER_EMAIL`    | with Resend | The owner's inbox for notifications.              |
| `MAIL_FROM`      | optional | Sender, default `SESEMI <onboarding@resend.dev>` (Resend test sender, delivers to your own account email only). |
| `AI_PROVIDER`    | optional | `openai` \| `gemini` \| `openrouter`.                |
| `AI_API_KEY`     | with AI  | The provider key. Never exposed to the browser.      |
| `AI_MODEL`       | optional | Defaults: `gpt-4o-mini` / `gemini-2.0-flash`.        |

Client-visible endpoints are plain same-origin paths declared in `.env`
(`VITE_CONTACT_ENDPOINT`, `VITE_ANALYTICS_ENDPOINT`, `VITE_AGENT_ENDPOINT`,
`VITE_ADMIN_API_BASE`). They contain no secrets; leaving them empty restores
the honest "not connected" preview behavior.

## Public endpoints

| Route            | Body | Behavior |
|------------------|------|----------|
| `POST /api/contact` | `{name, contact, message, service, consent, website?}` | Validates (consent required, email format, lengths), honeypot `website`, per-IP rate limit 10/h, inserts a lead (`source='Website'`, message → `notes`), sends the Resend email when configured. → `{ok:true}` |
| `POST /api/track`   | `{name, path, sessionId, referrer, at}` | Consented pseudonymous analytics (`page_view`, `assistant_open`, `brief_submitted`); dates bucketed in Asia/Tehran (+03:30 fixed). → `{ok:true}` |
| `POST /api/ai/chat` | `{messages:[{role:'user'\|'assistant',content}]}` | Proxy to the configured provider; system prompt from the admin "دستورات دستیار" setting; 20 msg/h per IP. → `{reply}` or 503 when not configured. |
| `GET /api/blog/posts` | — | Latest AI-news posts from D1 (2-min client cache). Cold start inlines a small refresh; when the last refresh is >20h old, a background refresh runs via `waitUntil`. |
| `POST /api/blog/refresh` | — | Force a news refresh. Auth: `Authorization: Bearer $BLOG_REFRESH_TOKEN` (GitHub Actions daily cron, 04:30 UTC) **or** an owner session. |
| `GET /api/auth/status` | — | `{enabled, user?}` — `enabled:false` until `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` exist. |
| `GET /api/auth/google/start` | — | Redirects to Google consent (state cookie `sesemi_oauth`, 10 min, 30/IP/h). When unconfigured → 302 `/account?error=unavailable`. |
| `GET /api/auth/google/callback` | — | Verifies state, exchanges the code, upserts `users`, links existing briefs by email, sets the `sesemi_user` session cookie (opaque 32B token; only its SHA-256 stored), clears the state cookie → 302 `/account`. |
| `POST /api/auth/logout` | — | Deletes the session row + clears the cookie. |
| `GET /api/account/projects` | — | The signed-in visitor's briefs with friendly status labels (lead status / joined order status). 401 without a visitor session. |
| `POST /api/contact` (behavior) | | When a visitor session cookie is present, the lead is stamped with `user_id`; the email-matching backfill also runs for signed-in users. |

## Owner (admin) endpoints — session cookie required, CSRF on mutations

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/setup`     | POST  | First-run owner creation (`ALLOW_SETUP=true` + empty `owner` table only). |
| `/api/admin/login`     | POST  | `{username,password}` → PBKDF2-SHA256 (100k iterations — the Workers runtime cap) verify; 6 failures / 15 min per IP+username lockout; sets session cookie, returns `{role, csrfToken}`. |
| `/api/admin/session`   | GET   | Session check → `{role, csrfToken}`; 401 body includes `setup:true` when first-run setup is available. |
| `/api/admin/logout`    | POST  | Clears the cookie. |
| `/api/admin/workspace` | GET   | `{leads, orders, daily[90d], pages, sources, settings}` — traffic aggregated from `events`. |
| `/api/admin/system`    | GET   | `{ai:{enabled,provider,model}, mail:{enabled}}` — connection status for the اتصال‌ها view. |
| `/api/admin/test-ai`   | POST  | One-shot assistant sanity check. |
| `/api/admin/leads`     | POST  | Manual lead. |
| `/api/admin/leads/:id` | PATCH | `{status, notes, followUp}`. |
| `/api/admin/leads/:id/convert` | POST | Creates an order (`Planning`), marks the lead `Won`. |
| `/api/admin/orders/:id`| PATCH | `{status, amount, due}`. |
| `/api/admin/settings`  | PATCH | `{studioName, replyEmail, notifications, assistantInstructions}`. |

## Database (D1 / SQLite)

Schema lives in `schema.sql`. Apply locally with `npm run db:init`, remotely
with `npm run db:init:remote`. Tables: `owner`, `leads`, `orders`, `events`,
`settings`, `login_throttle`, `blog_posts`, `blog_state`, `users`, `user_sessions`.
One-off migrations live in `migrations/` (e.g. `001-user-accounts.sql` adds
`leads.user_id`) — applied remotely once per database. All access flows through the Pages Function with
the owner session — there is no public table access.

## Security checklist (already implemented)

1. Owner account with PBKDF2-hashed password (100,000 iterations — the Workers runtime cap, per-user salt).
2. Every admin request verified server-side — not just the login screen.
3. `HttpOnly; SameSite=Lax` session cookie (`Secure` on HTTPS) + CSRF header on every mutation.
4. Leads stored in D1; the browser never queries the database directly.
5. Email and AI keys are Cloudflare secrets, only readable inside the Function.
