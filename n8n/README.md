# SESEMI n8n Workflows

Import-ready exports of the [SESEMI Agent OS](https://github.com/sesemi0/sesemi-agent-os) suite.
Import in n8n via **Workflow menu → Import from File**, then reconnect Gmail / Telegram / OpenAI credentials.

| File | What it is |
|---|---|
| `sesemi-telegram-owner-notifier.json` | Telegram gateway: email digests, two-way AI chat, `/mission` + `/tasks` router |
| `sesemi-04-crm-manager.json` | Headless CRM sub-workflow (projects, USDT payment proofs) |
| `sesemi-07-mission-control.json` | Groundwork: goal → AI tasks → mission tracking + webhooks |
| `sesemi-06-daily-briefing.json` | 08:00 daily Persian report to Telegram |

Webhooks exposed by the live instance: `POST /webhook/sesemi-mission` `{goal}` and `POST /webhook/sesemi-mission-status` `{mission_code?}`.
