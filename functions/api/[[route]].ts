/**
 * SESEMI studio API — a single Cloudflare Pages Function catching /api/*.
 * Public:    POST /api/contact, /api/track, /api/ai/chat
 * Owner:     /api/admin/*  (session cookie + CSRF; no passwords in the browser)
 *
 * Secrets live in Cloudflare (.dev.vars locally, `wrangler pages secret put` in production).
 * The API contract is documented in INTEGRATIONS.md.
 */
import services from '../../src/services.json';
import {
  type Env, type Session, json, fail, segments, readJson, clientIp, rateLimit,
  hashPassword, verifyPassword, createSessionToken, readSession, csrfTokenFor,
  sessionCookie, clearSessionCookie, safeEqual, bytesToB64Url,
  EMAIL_RE, USERNAME_RE, SLUG_RE, DATE_RE, cleanText,
} from './_lib/core';
import { sendEnquiryEmail, askAi, aiStatus, runWorkersAi } from './_lib/outbound';
import { refreshBlog, listPosts, lastRefreshAt } from './_lib/news';
import {
  googleConfigured, readVisitor, createUserSession, destroyVisitorSession,
  userCookie, clearUserCookie, oauthStateCookie, readCookie, googleAuthUrl,
  exchangeGoogleCode, upsertGoogleUser, linkLeadsByEmail, listVisitorProjects,
  OAUTH_STATE_COOKIE,
} from './_lib/accounts';
import { logSecurity, issueAdminCode, verifyAdminCode, telegramConfigured } from './_lib/security';

const REFRESH_INTERVAL = 20 * 60 * 60 * 1000; // matches news.ts — cron daily + lazy backstop

const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Won', 'Lost'] as const;
const ORDER_STATUSES = ['Planning', 'In progress', 'Review', 'Delivered'] as const;
const EVENT_NAMES = ['page_view', 'assistant_open', 'brief_submitted', 'engine_error', 'engine_diag'] as const;
const SERVICE_SLUGS = new Set<string>(services.map(s => String(s.slug)));
const FA_SERVICES: Record<string, string> = {
  'web-design': 'طراحی و توسعهٔ وب',
  'ai-advertising-videos': 'فیلم‌های تبلیغاتی هوش مصنوعی',
  'ai-video-editing': 'تدوین ویدیو با هوش مصنوعی',
  'ui-ux-design': 'طراحی رابط و تجربهٔ کاربری',
  'brand-identity': 'لوگو و هویت بصری',
  'prompt-engineering': 'مهندسی پرامپت خلاقانه',
  'geo-optimization': 'بهینه‌سازی حضور در پاسخ‌های AI (GEO)',
};

type LeadRow = { id: string; name: string; company: string; email: string; service: string; status: string; created_at: string; notes: string; source: string; follow_up: string };
type OrderRow = { id: string; lead_id: string | null; title: string; client: string; service: string; status: string; amount: number; due: string };

function toLead(row: LeadRow) {
  return { id: row.id, name: row.name, company: row.company, email: row.email, service: row.service, status: row.status, createdAt: row.created_at, notes: row.notes, source: row.source, followUp: row.follow_up };
}
function toOrder(row: OrderRow) {
  return { id: row.id, leadId: row.lead_id, title: row.title, client: row.client, service: row.service, status: row.status, amount: row.amount, due: row.due };
}
function serviceTitle(value: string): string {
  return FA_SERVICES[value] || services.find(s => s.slug === value)?.title || value;
}

/** Iran abolished DST in 2022 — a fixed +03:30 offset is correct year-round. */
function tehranDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 210 * 60 * 1000).toISOString().slice(0, 10);
}

const DEFAULT_SETTINGS = {
  studioName: 'SESEMI',
  replyEmail: '',
  notifications: false,
  assistantInstructions: '',
};

async function readSettings(env: Env): Promise<typeof DEFAULT_SETTINGS> {
  const rows = await env.DB.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>();
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows.results || []) {
    try {
      const parsed = JSON.parse(row.value);
      if (row.key in result) (result as Record<string, unknown>)[row.key] = parsed;
    } catch { /* skip malformed row */ }
  }
  return result;
}

async function requireOwner(request: Request, env: Env, csrf = false): Promise<{ session: Session } | Response> {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return fail(401, 'نشست شما معتبر نیست. دوباره وارد شوید.');
  if (csrf) {
    const header = request.headers.get('X-CSRF-Token') || '';
    const expected = await csrfTokenFor(session, env.SESSION_SECRET);
    if (!header || !safeEqual(header, expected)) return fail(403, 'درخواست تایید نشد. صفحه را دوباره بارگذاری کنید.');
  }
  return { session };
}

function isSecure(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === 'https:' || request.headers.get('X-Forwarded-Proto') === 'https';
}

export const onRequest = async (context: { request: Request; env: Env; params: { route?: string | string[] }; waitUntil(promise: Promise<unknown>): void }): Promise<Response> => {
  const { request, env, waitUntil } = context;
  const path = segments(context.params.route || []);
  const method = request.method.toUpperCase();

  try {
    /* ============ public: contact form ============ */
    if (path.join('/') === 'contact' && method === 'POST') {
      if (!rateLimit(`contact:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
        waitUntil(logSecurity(env, env.DB, { type: 'rate_limit', ip: clientIp(request), path: '/api/contact', detail: 'contact form flood (10/h exceeded)' }, waitUntil));
        return fail(429, 'درخواست‌های زیاد. کمی بعد دوباره تلاش کنید.');
      }
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return fail(400, 'درخواست نامعتبر است.');
      if (cleanText(body.website, 100)) { // honeypot — silently accept bots but record them
        waitUntil(logSecurity(env, env.DB, {
          type: 'honeypot', severity: 'warning', ip: clientIp(request), path: '/api/contact',
          detail: 'hidden website field filled — automated form bot',
        }, waitUntil));
        return json({ ok: true });
      }
      const name = cleanText(body.name, 100);
      const contact = cleanText(body.contact, 150);
      const message = cleanText(body.message, 3000);
      const service = cleanText(body.service, 60);
      if (!name || !EMAIL_RE.test(contact)) return fail(400, 'نام و یک ایمیل معتبر لازم است.');
      if (body.consent !== true) return fail(400, 'رضایت حریم خصوصی لازم است.');
      if (service && !SLUG_RE.test(service)) return fail(400, 'خدمت نامعتبر است.');

      const id = `L-${crypto.randomUUID().slice(0, 12)}`;
      const createdAt = new Date().toISOString();
      const visitor = await readVisitor(env, request);
      await env.DB.prepare(
        `INSERT INTO leads (id, name, company, email, service, status, created_at, notes, source, follow_up, user_id)
         VALUES (?1, ?2, '', ?3, ?4, 'New', ?5, ?6, 'Website', '', ?7)`,
      ).bind(id, name, contact, service, createdAt, message, visitor?.id ?? '').run();
      if (visitor) await linkLeadsByEmail(env.DB, visitor.id, contact);

      const mailSent = await sendEnquiryEmail(env, { name, email: contact, service: serviceTitle(service), message });
      if (!mailSent) console.error('enquiry email not sent (Resend not configured or failed)');
      // آینهٔ تلگرام درخواست — وقتی سکرت‌های بات ست باشند، متن فرم فوراً به چت مالک می‌رود
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        waitUntil(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `🔔 درخواست جدید از سایت\n👤 ${name}\n📧 ${contact}\n🛠 ${serviceTitle(service) || '—'}\n\n${message}` }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => null));
      }
      return json({ ok: true });
    }

    if (path.join('/') === 'pay/info' && method === 'GET') {
      // the wallet ADDRESS is public information (it receives funds); the
      // owner sets it as a Cloudflare secret so it never lives in the repo
      return json({ wallet: env.PAY_WALLET_ADDRESS || '', network: env.PAY_NETWORK || 'USDT · TRC20 (TRON)', configured: Boolean(env.PAY_WALLET_ADDRESS) }, 200, { 'Cache-Control': 'public, max-age=300' });
    }

    /* ============ public: generated article art — every post without a feed
       image gets a deterministic, brand-styled SVG (no external requests,
       immutable cache; the same id+title+source always draws the same art) === */
    if (path.join('/') === 'blog/art' && method === 'GET') {
      const url = new URL(request.url);
      const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      const id = esc(url.searchParams.get('id') || 'x').slice(0, 120);
      const title = esc(url.searchParams.get('t') || '').slice(0, 160);
      const source = esc(url.searchParams.get('s') || 'AI').slice(0, 30);
      const palette = [
        ['#0d1c31', '#123a5c', '#53b9fb'], ['#141026', '#2a1a4d', '#9b7fe0'],
        ['#0a1f2e', '#0e3a4d', '#61e7ff'], ['#1a2408', '#2e3d10', '#c8f06c'],
        ['#260f14', '#4d1a22', '#fc765e'], ['#0c1030', '#1a2360', '#7c9bff'],
      ];
      let hash = 0;
      for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      const [c0, c1, accent] = palette[hash % palette.length];
      // deterministic ring positions from the hash — no two posts look alike
      const r1 = 120 + (hash % 90);
      const r2 = 200 + ((hash >> 3) % 110);
      const cx = 560 + ((hash >> 6) % 200);
      const cy = 140 + ((hash >> 9) % 160);
      const words = url.searchParams.get('t') || '';
      const raw: string[] = [];
      let line = '';
      for (const w of words.split(/\s+/)) {
        if ((line + ' ' + w).trim().length > 34) { if (line) raw.push(line.trim()); line = w; }
        else line = (line + ' ' + w).trim();
      }
      if (line) raw.push(line.trim());
      const lines = raw.slice(0, 2);
      if (raw.length > 2 && lines[1]) lines[1] = lines[1].slice(0, 31).trimEnd() + '…';
      const titleSvg = lines.map((ln, i) =>
        `<text x="64" y="${386 + i * 44}" font-family="Arial,sans-serif" font-size="33" font-weight="700" fill="#e9f1f8">${esc(ln)}</text>`).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="506" viewBox="0 0 900 506" role="img" aria-label="article art">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>
<rect width="900" height="506" fill="url(#g)"/>
<circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${accent}" stroke-opacity=".35"/>
<circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${accent}" stroke-opacity=".18" stroke-dasharray="3 9"/>
<circle cx="${cx + r1 * 0.71}" cy="${cy - r1 * 0.71}" r="5" fill="${accent}" opacity=".9"/>
<circle cx="${cx - r2 * 0.6}" cy="${cy + r2 * 0.55}" r="3.5" fill="#ffffff" opacity=".5"/>
<g transform="translate(56,64)"><rect x="-14" y="-14" width="28" height="28" transform="rotate(45)" fill="none" stroke="${accent}" stroke-width="1.6"/><rect x="-8" y="-8" width="16" height="16" transform="rotate(45)" fill="${accent}"/></g>
<text x="836" y="58" text-anchor="end" font-family="monospace" font-size="13" letter-spacing="3" fill="${accent}">${source.toUpperCase()}</text>
<line x1="56" y1="330" x2="844" y2="330" stroke="#ffffff" stroke-opacity=".14"/>
${titleSvg}
<text x="56" y="472" font-family="monospace" font-size="12" letter-spacing="2" fill="#8ea9c2">SESEMI · AI RADAR</text>
</svg>`;
      return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }

    /* ============ public: crypto payment submission (TXID proof) ============ */
    if (path.join('/') === 'pay' && method === 'POST') {
      if (!rateLimit(`pay:${clientIp(request)}`, 6, 60 * 60 * 1000)) {
        waitUntil(logSecurity(env, env.DB, { type: 'rate_limit', ip: clientIp(request), path: '/api/pay', detail: 'payment flood (6/h exceeded)' }, waitUntil));
        return fail(429, 'درخواست‌های زیاد. کمی بعد دوباره تلاش کنید.');
      }
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return fail(400, 'درخواست نامعتبر است.');
      const name = cleanText(body.name, 100);
      const email = cleanText(body.email, 150);
      const service = cleanText(body.service, 120);
      const amount = Math.max(0, Math.min(100_000, Number(body.amount) || 0));
      const txid = cleanText(body.txid, 100).replace(/\s+/g, '');
      const note = cleanText(body.note, 400);
      if (!name || !EMAIL_RE.test(email)) return fail(400, 'نام و یک ایمیل معتبر لازم است.');
      if (!service) return fail(400, 'خدمت انتخاب نشده است.');
      if (!/^[A-Za-z0-9]{12,100}$/.test(txid)) return fail(400, 'TXID معتبر نیست — شناسهٔ تراکنش کامل روی زنجیره را بفرست.');
      if (body.consent !== true) return fail(400, 'تأیید شرایط لازم است.');

      const id = `P-${crypto.randomUUID().slice(0, 10)}`;
      await env.DB.prepare(
        `INSERT INTO payments (id, name, email, service, amount_usd, txid, note, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)`,
      ).bind(id, name, email, service, amount, txid, note, Date.now()).run();

      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        waitUntil(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: `💰 پرداخت جدید در انتظار تأیید\n🧾 ${id}\n👤 ${name} (${email})\n🛠 ${service} — ${amount}$\n🔗 TXID: ${txid}${note ? `\n📝 ${note}` : ''}\n\nبررسی و تأیید در پنل → پرداخت‌ها`,
          }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => null));
      }
      return json({ ok: true, id });
    }

    /* ============ public: office AI — runs the agents' tasks on the account's
       own Workers-AI allocation (no API key). Restricted to the office origin
       and rate-limited so nobody can burn the allocation from elsewhere. ===== */
    if (path.join('/') === 'ai/office' && method === 'POST') {
      // cross-origin from the office app — JSON body means a preflight happens
      // first; both the preflight AND every response must carry CORS headers
      const officeOrigin = request.headers.get('Origin') || '';
      const cors = { 'Access-Control-Allow-Origin': officeOrigin || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (!/^https:\/\/(sesemi-office\.pages\.dev|localhost(?::\d+)?)$/.test(officeOrigin)) {
        return fail(403, 'این مسیر فقط برای دفتر سسِمی است.');
      }
      if (!rateLimit(`office-ai:${clientIp(request)}`, 40, 60 * 60 * 1000)) {
        waitUntil(logSecurity(env, env.DB, { type: 'rate_limit', ip: clientIp(request), path: '/api/ai/office', detail: 'office AI flood (40/h exceeded)' }, waitUntil));
        return json({ error: 'سهمیهٔ هوش مصنوعی دفتر پر شد — کمی بعد دوباره تلاش کنید.' }, 429, cors);
      }
      const body = await readJson<{ messages?: unknown; maxTokens?: unknown }>(request);
      const raw = Array.isArray(body?.messages) ? body!.messages : [];
      const messages = raw.slice(-10).map(item => {
        const m = item as { role?: unknown; content?: unknown };
        const role = m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user';
        return { role, content: cleanText(m.content, 12000) };
      }).filter(m => m.content) as { role: 'system' | 'user' | 'assistant'; content: string }[];
      if (!messages.length) return json({ error: 'پیامی ارسال نشده است.' }, 400, cors);
      const maxTokens = Math.max(256, Math.min(8192, Number(body?.maxTokens) || 2000));
      try {
        const reply = await runWorkersAi(env, messages, maxTokens);
        return json({ ok: true, reply }, 200, cors);
      } catch (error) {
        console.error('office AI failed:', error instanceof Error ? error.message : error);
        return json({ error: 'ارتباط با هوش مصنوعی برقرار نشد — چند لحظه بعد «تلاش دوباره» بزن.' }, 502, cors);
      }
    }

    /* ============ public: consented analytics ============ */
    if (path.join('/') === 'track' && method === 'POST') {
      if (!rateLimit(`track:${clientIp(request)}`, 240, 60 * 60 * 1000)) return json({ ok: true });
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return json({ ok: true });
      const name = cleanText(body.name, 40);
      const eventPath = cleanText(body.path, 200);
      const sessionId = cleanText(body.sessionId, 64);
      if (!EVENT_NAMES.includes(name as typeof EVENT_NAMES[number]) || !eventPath.startsWith('/') || !sessionId) return json({ ok: true });
      let referrer = cleanText(body.referrer, 100);
      try { if (referrer) referrer = new URL(referrer).origin; } catch { referrer = ''; }
      const atIso = typeof body.at === 'string' && !Number.isNaN(Date.parse(body.at)) ? body.at : new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO events (at, date, name, path, session_id, referrer) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(Date.parse(atIso), tehranDate(atIso), name, eventPath, sessionId, referrer).run();
      return json({ ok: true });
    }

    /* ============ public: SESEMI Office agent outputs (mission bridge) ============ */
    if (path.join('/') === 'agent-outputs') {
      // cross-origin on purpose: the office app (sesemi-office.pages.dev) reports here
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (method === 'POST') {
        if (!rateLimit(`agentout:${clientIp(request)}`, 120, 60 * 60 * 1000)) return fail(429, 'درخواست‌های زیاد. کمی بعد دوباره تلاش کنید.');
        const body = await readJson<Record<string, unknown>>(request);
        if (!body) return fail(400, 'درخواست نامعتبر است.');
        const items = Array.isArray(body.items) ? body.items : [body];
        if (!items.length || items.length > 12) return fail(400, 'تعداد خروجی‌ها نامعتبر است.');
        const inserts: Promise<unknown>[] = [];
        for (const raw of items) {
          const item = raw as Record<string, unknown>;
          const missionCode = cleanText(item.missionCode, 40);
          const taskTitle = cleanText(item.taskTitle, 200);
          const agentName = cleanText(item.agentName, 40);
          const agentRole = cleanText(item.agentRole, 40);
          const status = cleanText(item.status, 20) || 'done';
          const result = cleanText(item.result, 24000); // صفحات HTML ساخته‌شده توسط ایجنت‌ها جا شوند
          if (!taskTitle || !agentName || !result) continue; // incomplete rows are silently dropped
          if (status !== 'done' && status !== 'failed' && status !== 'working') continue;
          inserts.push(
            env.DB.prepare(
              `INSERT INTO agent_outputs (mission_code, task_title, agent_name, agent_role, status, result, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
            ).bind(missionCode, taskTitle, agentName, agentRole, status, result, Date.now()).run(),
          );
        }
        if (!inserts.length) return fail(400, 'هیچ ردیف معتبر ارسال نشد.');
        await Promise.all(inserts);
        return json({ ok: true, stored: inserts.length }, 200, cors);
      }
      if (method === 'GET') {
        const url = new URL(request.url);
        const mission = cleanText(url.searchParams.get('mission'), 40);
        const limitRaw = Number(url.searchParams.get('limit')) || 40;
        const limit = Math.min(100, Math.max(1, Math.floor(limitRaw)));
        const rows = mission
          ? await env.DB.prepare(`SELECT id, mission_code, task_title, agent_name, agent_role, status, result, created_at FROM agent_outputs WHERE mission_code = ?1 ORDER BY id DESC LIMIT ?2`).bind(mission, limit).all()
          : await env.DB.prepare(`SELECT id, mission_code, task_title, agent_name, agent_role, status, result, created_at FROM agent_outputs ORDER BY id DESC LIMIT ?1`).bind(limit).all();
        return json({ ok: true, items: rows.results ?? [] }, 200, cors);
      }
    }
    /* ============ public: telegram bridge (site submissions → owner chat) ============ */
    if (path.join('/') === 'agent-notify') {
      // the office app (sesemi-office.pages.dev) posts task results here —
      // cross-origin with a JSON body needs a preflight + open CORS headers
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (method !== 'POST') return fail(405, 'روش نامعتبر است.');
      if (!rateLimit(`notify:${clientIp(request)}`, 20, 60 * 60 * 1000)) return fail(429, 'درخواست‌های زیاد. کمی بعد دوباره تلاش کنید.');
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return json({ error: 'درخواست نامعتبر است.' }, 400, cors);
      const text = cleanText(body.text, 1500);
      if (!text) return json({ error: 'متن خالی است.' }, 400, cors);
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
        return json({ ok: true, delivered: false, reason: 'telegram_not_configured' }, 200, cors);
      }
      const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 3500) }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      if (!tg || !tg.ok) return json({ ok: true, delivered: false, reason: 'telegram_error' }, 200, cors);
      return json({ ok: true, delivered: true }, 200, cors);
    }

    if (path.join('/') === 'ai/chat' && method === 'POST') {
      const status = aiStatus(env);
      if (!status.enabled) return fail(503, 'دستیار هوش مصنوعی هنوز متصل نشده است.');
      if (!rateLimit(`ai:${clientIp(request)}`, 20, 60 * 60 * 1000)) {
        waitUntil(logSecurity(env, env.DB, { type: 'rate_limit', ip: clientIp(request), path: '/api/ai/chat', detail: 'assistant flood (20/h exceeded)' }, waitUntil));
        return fail(429, 'تعداد پیام‌ها زیاد است. کمی صبر کنید.');
      }
      const body = await readJson<{ messages?: unknown }>(request);
      const raw = Array.isArray(body?.messages) ? body.messages : [];
      if (!raw.length) return fail(400, 'پیامی ارسال نشده است.');
      const messages = raw.slice(-20).map(item => {
        const m = item as { role?: unknown; content?: unknown };
        return { role: m.role === 'assistant' ? 'assistant' : 'user', content: cleanText(m.content, 4000) };
      }).filter(m => m.content) as { role: 'user' | 'assistant'; content: string }[];
      if (!messages.some(m => m.role === 'user')) return fail(400, 'پیامی ارسال نشده است.');
      const result = await askAi(env, env.DB, messages);
      if (!result.ok) {
        if (result.error === 'provider_error') return fail(502, 'ارتباط با دستیار برقرار نشد. دوباره تلاش کنید.');
        return fail(503, 'دستیار هوش مصنوعی در دسترس نیست.');
      }
      return json({ reply: result.reply });
    }

    /* ============ public: AI-news blog ============ */
    if (path.join('/') === 'blog/posts' && method === 'GET') {
      let posts = await listPosts(env.DB);
      // cold start (blog never filled): fetch + translate a few stories inline
      // so the very first visitor sees content; afterwards refreshes run in
      // the background while the cached list is served instantly
      if (!posts.length) await refreshBlog(env, { max: 4 });
      else if (Date.now() - (await lastRefreshAt(env.DB)) > REFRESH_INTERVAL) waitUntil(refreshBlog(env));
      posts = await listPosts(env.DB);
      return json({ posts, updatedAt: Date.now() }, 200, { 'Cache-Control': 'public, max-age=120' });
    }

    /* daily updater (GitHub Actions cron) or the signed-in owner */
    if (path.join('/') === 'blog/refresh' && method === 'POST') {
      const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const tokenOk = Boolean(env.BLOG_REFRESH_TOKEN) && Boolean(bearer) && safeEqual(bearer, env.BLOG_REFRESH_TOKEN!);
      const session = await readSession(request, env.SESSION_SECRET);
      if (!tokenOk && !session) return fail(401, 'دسترسی مجاز نیست.');
      const result = await refreshBlog(env, { force: true });
      if (!result.ok) return fail(502, `به‌روزرسانی خبرها ناموفق بود: ${result.error}`);
      return json(result);
    }

    /* ============ public: optional visitor accounts (Google sign-in) ============ */
    if (path.join('/') === 'auth/status' && method === 'GET') {
      const visitor = await readVisitor(env, request);
      return json({ enabled: googleConfigured(env), user: visitor ? { name: visitor.name, email: visitor.email, picture: visitor.picture } : null });
    }

    if (path.join('/') === 'auth/google/start' && method === 'GET') {
      const origin = new URL(request.url).origin;
      if (!googleConfigured(env)) return Response.redirect(`${origin}/account?error=unavailable`, 302);
      if (!rateLimit(`oauth:${clientIp(request)}`, 30, 60 * 60 * 1000)) return Response.redirect(`${origin}/account?error=rate`, 302);
      const state = bytesToB64Url(crypto.getRandomValues(new Uint8Array(16)));
      return new Response(null, { status: 302, headers: {
        Location: googleAuthUrl(origin, env.GOOGLE_CLIENT_ID!, state),
        'Set-Cookie': oauthStateCookie(state, isSecure(request)),
      } });
    }

    if (path.join('/') === 'auth/google/callback' && method === 'GET') {
      const origin = new URL(request.url).origin;
      const url = new URL(request.url);
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      const expectedState = readCookie(request, OAUTH_STATE_COOKIE);
      const fail = (reason: string) => new Response(null, { status: 302, headers: {
        Location: `${origin}/account?error=${reason}`,
        'Set-Cookie': `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${isSecure(request) ? '; Secure' : ''}`,
      } });
      if (!googleConfigured(env)) return fail('unavailable');
      if (!code || !state || state.length < 16 || !expectedState || !safeEqual(state, expectedState)) return fail('state');
      const profile = await exchangeGoogleCode(env, code, origin);
      if (!profile) return fail('google');
      const userId = await upsertGoogleUser(env.DB, profile);
      await linkLeadsByEmail(env.DB, userId, profile.email);
      const token = await createUserSession(env.DB, userId);
      // two cookies: the new session AND the consumed oauth state being cleared
      const headers = new Headers({ Location: `${origin}/account` });
      headers.append('Set-Cookie', userCookie(token, isSecure(request)));
      headers.append('Set-Cookie', `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${isSecure(request) ? '; Secure' : ''}`);
      return new Response(null, { status: 302, headers });
    }

    if (path.join('/') === 'auth/logout' && method === 'POST') {
      await destroyVisitorSession(env, request);
      return json({ ok: true }, 200, { 'Set-Cookie': clearUserCookie(isSecure(request)) });
    }

    if (path.join('/') === 'account/projects' && method === 'GET') {
      const visitor = await readVisitor(env, request);
      if (!visitor) return fail(401, 'برای دیدن پروژه‌هایتان وارد شوید.');
      const projects = await listVisitorProjects(env.DB, visitor.id);
      return json({ user: { name: visitor.name, email: visitor.email, picture: visitor.picture }, projects });
    }

    /* ============ owner: first-run account creation ============ */
    if (path.join('/') === 'admin/setup' && method === 'POST') {
      if (env.ALLOW_SETUP !== 'true') return fail(403, 'ساخت حساب غیرفعال است.');
      const existing = await env.DB.prepare(`SELECT COUNT(*) AS n FROM owner`).first<{ n: number }>();
      if ((existing?.n ?? 0) > 0) return fail(403, 'حساب مدیر قبلاً ساخته شده است.');
      const body = await readJson<Record<string, unknown>>(request);
      const username = cleanText(body?.username, 40).toLowerCase();
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!USERNAME_RE.test(username)) return fail(400, 'نام کاربری: ۳ تا ۴۰ کاراکتر، فقط حروف لاتین، عدد، نقطه، خط تیره.');
      if (password.length < 8) return fail(400, 'گذرواژه باید دست‌کم ۸ کاراکتر باشد.');
      const passHash = await hashPassword(password);
      await env.DB.prepare(`INSERT INTO owner (username, pass_hash, created_at) VALUES (?1, ?2, ?3)`)
        .bind(username, passHash, Date.now()).run();
      const token = await createSessionToken(username, env.SESSION_SECRET);
      const csrfToken = await csrfTokenFor({ username, expiresAt: 0, payload: token.split('.')[0] }, env.SESSION_SECRET);
      return json({ ok: true, role: 'owner', csrfToken }, 200, {
        'Set-Cookie': sessionCookie(token, isSecure(request)),
      });
    }

    /* ============ owner: login (step 1: password) ============ */
    if (path.join('/') === 'admin/login' && method === 'POST') {
      const body = await readJson<Record<string, unknown>>(request);
      const username = cleanText(body?.username, 40).toLowerCase();
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!username || !password) return fail(400, 'نام کاربری و گذرواژه لازم است.');
      const ip = clientIp(request);
      const throttleKey = `${ip}|${username}`;
      const now = Date.now();
      const cutoff = now - 15 * 60 * 1000;
      // D1 does not support reusing numbered placeholders, so the throttle
      // counter is read and then written with INSERT OR REPLACE.
      const throttleRow = await env.DB.prepare(
        `SELECT count, window_start FROM login_throttle WHERE key = ?1`,
      ).bind(throttleKey).first<{ count: number; window_start: number }>();
      const failedCount = throttleRow && throttleRow.window_start >= cutoff ? throttleRow.count : 0;
      if (failedCount >= 6) {
        waitUntil(logSecurity(env, env.DB, {
          type: 'admin_login_fail', severity: 'critical', ip, path: '/api/admin/login',
          detail: `lockout engaged (6+ fails) username=${username}`, userAgent: request.headers.get('User-Agent') || '',
        }, waitUntil));
        return fail(429, 'تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه صبر کنید.');
      }

      const owner = await env.DB.prepare(`SELECT username, pass_hash FROM owner WHERE username = ?1`).bind(username).first<{ username: string; pass_hash: string }>();
      const valid = owner ? await verifyPassword(password, owner.pass_hash) : await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      if (!owner || !valid) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO login_throttle (key, count, window_start) VALUES (?1, ?2, ?3)`,
        ).bind(throttleKey, failedCount + 1, now).run();
        waitUntil(logSecurity(env, env.DB, {
          type: 'admin_login_fail', severity: 'warning', ip, path: '/api/admin/login',
          detail: `wrong credentials username=${username} attempt=${failedCount + 1}/6`, userAgent: request.headers.get('User-Agent') || '',
        }, waitUntil));
        return fail(401, 'نام کاربری یا گذرواژه درست نیست.');
      }
      await env.DB.prepare(`DELETE FROM login_throttle WHERE key = ?1`).bind(throttleKey).run();

      // step 2: one-time code to the owner's Telegram chat
      const pending = await issueAdminCode(env, env.DB, owner.username);
      if (!pending) {
        // Telegram not configured or delivery failed — never strand the owner:
        // fall back to single-factor and record it so it is visible in the panel
        waitUntil(logSecurity(env, env.DB, {
          type: 'admin_2fa_bypass', severity: 'warning', ip, path: '/api/admin/login',
          detail: telegramConfigured(env) ? 'telegram delivery failed — single-factor fallback used' : 'TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set',
        }, waitUntil));
        const token = await createSessionToken(owner.username, env.SESSION_SECRET);
        const csrfToken = await csrfTokenFor({ username: owner.username, expiresAt: 0, payload: token.split('.')[0] }, env.SESSION_SECRET);
        return json({ role: 'owner', csrfToken }, 200, { 'Set-Cookie': sessionCookie(token, isSecure(request)) });
      }
      waitUntil(logSecurity(env, env.DB, {
        type: 'admin_login_success', severity: 'info', ip, path: '/api/admin/login',
        detail: `password OK, code sent to Telegram username=${owner.username}`,
      }, waitUntil));
      return json({ pending2fa: true, pendingId: pending.pendingId });
    }

    /* ============ owner: login (step 2: Telegram code) ============ */
    if (path.join('/') === 'admin/verify-2fa' && method === 'POST') {
      const body = await readJson<Record<string, unknown>>(request);
      const pendingId = cleanText(body?.pendingId, 64);
      const code = cleanText(body?.code, 12).replace(/\D/g, '');
      if (!pendingId || !/^\d{6}$/.test(code)) return fail(400, 'کد نامعتبر است.');
      if (!rateLimit(`2fa:${clientIp(request)}`, 15, 60 * 60 * 1000)) return fail(429, 'تلاش‌های زیاد. کمی بعد دوباره تلاش کنید.');
      const result = await verifyAdminCode(env.DB, pendingId, code);
      if (!result.ok) {
        waitUntil(logSecurity(env, env.DB, {
          type: 'admin_2fa_fail', severity: result.reason === 'locked' ? 'critical' : 'warning',
          ip: clientIp(request), path: '/api/admin/verify-2fa', detail: `code rejected (${result.reason})`,
        }, waitUntil));
        const messages: Record<string, string> = {
          not_found: 'کد مورد انتظار نیست. از نو وارد شوید.',
          expired: 'کد منقضی شده است. دوباره وارد شوید.',
          locked: 'تلاش‌های اشتباه زیاد بود. از نو وارد شوید.',
          wrong: 'کد درست نیست.',
        };
        return fail(403, messages[result.reason] || 'کد درست نیست.');
      }
      const token = await createSessionToken(result.username, env.SESSION_SECRET);
      const csrfToken = await csrfTokenFor({ username: result.username, expiresAt: 0, payload: token.split('.')[0] }, env.SESSION_SECRET);
      waitUntil(logSecurity(env, env.DB, {
        type: 'admin_2fa_success', ip: clientIp(request), path: '/api/admin/verify-2fa',
        detail: `owner signed in username=${result.username}`,
      }, waitUntil));
      return json({ role: 'owner', csrfToken }, 200, { 'Set-Cookie': sessionCookie(token, isSecure(request)) });
    }

    /* ============ owner: session check ============ */
    if (path.join('/') === 'admin/session' && method === 'GET') {
      const session = await readSession(request, env.SESSION_SECRET);
      if (!session) {
        const existing = await env.DB.prepare(`SELECT COUNT(*) AS n FROM owner`).first<{ n: number }>();
        const setup = env.ALLOW_SETUP === 'true' && (existing?.n ?? 0) === 0;
        return json({ error: 'نشست شما معتبر نیست. دوباره وارد شوید.', setup }, 401);
      }
      return json({ role: 'owner', csrfToken: await csrfTokenFor(session, env.SESSION_SECRET) });
    }

    if (path.join('/') === 'admin/logout' && method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(isSecure(request)) });
    }

    /* ============ owner: everything below needs a live session ============ */
    if (path[0] !== 'admin') return fail(404, 'مسیر یافت نشد.');
    const auth = await requireOwner(request, env, method !== 'GET');
    if (!('session' in auth)) return auth;

    /* ============ owner: security observability ============ */
    if (path.length === 2 && path[1] === 'security' && method === 'GET') {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const [rows, summary] = await Promise.all([
        env.DB.prepare(
          `SELECT id, at, type, severity, ip, path, detail, user_agent FROM security_events ORDER BY id DESC LIMIT 120`,
        ).all(),
        env.DB.prepare(
          `SELECT type, COUNT(*) AS n FROM security_events WHERE at >= ?1 GROUP BY type`,
        ).bind(since).all<{ type: string; n: number }>(),
      ]);
      return json({
        events: rows.results ?? [],
        summary: summary.results ?? [],
        twoFactor: telegramConfigured(env),
      });
    }

    if (path.length === 2 && path[1] === 'security' && method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM security_events WHERE at < ?1`).bind(Date.now() - 30 * 24 * 60 * 60 * 1000).run();
      return json({ ok: true });
    }

    /* ============ owner: payments (who paid what, when, on-chain proof) ============ */
    if (path.length === 2 && path[1] === 'payments' && method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT id, name, email, service, amount_usd, txid, note, status, created_at, verified_at FROM payments ORDER BY created_at DESC LIMIT 200`,
      ).all();
      const summary = await env.DB.prepare(
        `SELECT status, COUNT(*) AS n, SUM(amount_usd) AS usd FROM payments GROUP BY status`,
      ).all<{ status: string; n: number; usd: number }>();
      return json({
        payments: rows.results ?? [],
        summary: summary.results ?? [],
        walletConfigured: Boolean(env.PAY_WALLET_ADDRESS),
      });
    }

    if (path.length === 3 && path[1] === 'payments' && (method === 'PATCH' || method === 'DELETE')) {
      const id = path[2];
      const body = await readJson<Record<string, unknown>>(request);
      const current = await env.DB.prepare(`SELECT * FROM payments WHERE id = ?1`).bind(id).first<{ id: string; name: string; email: string; service: string; amount_usd: number; txid: string; note: string; status: string; created_at: number }>();
      if (!current) return fail(404, 'پرداخت یافت نشد.');

      if (method === 'DELETE') {
        await env.DB.prepare(`DELETE FROM payments WHERE id = ?1`).bind(id).run();
        return json({ ok: true });
      }

      const status = body && 'status' in body ? String(body.status) : current.status;
      if (!['pending', 'verified', 'rejected'].includes(status)) return fail(400, 'وضعیت نامعتبر است.');
      const verifiedAt = status === 'verified' && current.status !== 'verified' ? Date.now() : 0;
      await env.DB.prepare(`UPDATE payments SET status = ?1, verified_at = CASE WHEN ?1 = 'verified' AND verified_at = 0 THEN ?2 ELSE verified_at END WHERE id = ?3`)
        .bind(status, Date.now(), id).run();

      // verified → hand the order to the office: agent_outputs is the bridge the
      // office app already reads (CORS-open GET), so agents can pick up the paid work
      if (status === 'verified' && current.status !== 'verified') {
        const brief = JSON.stringify({
          goal: `سفارش پرداخت‌شدهٔ سایت: ${current.service} — مبلغ ${current.amount_usd}$ — برای ${current.name} (${current.email})${current.note ? ' — توضیح مشتری: ' + current.note : ''}`,
          service: current.service, amount: current.amount_usd, email: current.email, paymentId: current.id,
        });
        await env.DB.prepare(
          `INSERT INTO agent_outputs (mission_code, task_title, agent_name, agent_role, status, result, created_at)
           VALUES (?1, ?2, 'owner', 'paid-order', 'done', ?3, ?4)`,
        ).bind(`PAY-${current.id}`, current.service, brief, Date.now()).run();
        waitUntil(logSecurity(env, env.DB, {
          type: 'admin_login_success', severity: 'info', path: '/api/admin/payments',
          detail: `payment ${current.id} verified → handed to office (${current.service}, ${current.amount_usd}$)`,
        }, waitUntil));
      }
      return json({ ok: true, status, handedToOffice: status === 'verified' });
    }

    if (path.length === 2 && path[1] === 'password' && method === 'POST') {
      const body = await readJson<Record<string, unknown>>(request);
      const current = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
      const next = typeof body?.newPassword === 'string' ? body.newPassword : '';
      if (next.length < 8 || next.length > 100) return fail(400, 'گذرواژهٔ جدید باید ۸ تا ۱۰۰ کاراکتر باشد.');
      const owner = await env.DB.prepare(`SELECT username, pass_hash FROM owner WHERE username = ?1`).bind(auth.session.username).first<{ username: string; pass_hash: string }>();
      if (!owner || !(await verifyPassword(current, owner.pass_hash))) return fail(401, 'گذرواژهٔ فعلی درست نیست.');
      const passHash = await hashPassword(next);
      await env.DB.prepare(`UPDATE owner SET pass_hash = ?1 WHERE username = ?2`).bind(passHash, owner.username).run();
      // the old session dies with the old password: force a fresh login everywhere
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(isSecure(request)) });
    }

    if (path.length === 2 && path[1] === 'workspace' && method === 'GET') {
      const [leadRows, orderRows, settings] = await Promise.all([
        env.DB.prepare(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 2000`).all<LeadRow>(),
        env.DB.prepare(`SELECT * FROM orders ORDER BY rowid DESC LIMIT 500`).all<OrderRow>(),
        readSettings(env),
      ]);

      const leads = (leadRows.results || []).map(toLead);
      const orders = (orderRows.results || []).map(toOrder);

      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const [traffic, pageRows, sourceRows] = await Promise.all([
        env.DB.prepare(
          `SELECT date, COUNT(DISTINCT session_id) AS visitors, COUNT(*) AS pageviews
           FROM events WHERE name = 'page_view' AND at >= ?1 GROUP BY date`,
        ).bind(cutoff).all<{ date: string; visitors: number; pageviews: number }>(),
        env.DB.prepare(
          `SELECT path, COUNT(*) AS views FROM events WHERE name = 'page_view' GROUP BY path ORDER BY views DESC LIMIT 8`,
        ).all<{ path: string; views: number }>(),
        env.DB.prepare(
          `SELECT CASE WHEN referrer = '' THEN 'Direct' ELSE referrer END AS name, COUNT(*) AS visits
           FROM events WHERE name = 'page_view' GROUP BY name ORDER BY visits DESC LIMIT 6`,
        ).all<{ name: string; visits: number }>(),
      ]);

      const daily = new Map<string, { visitors: number; pageviews: number; enquiries: number }>();
      for (let i = 89; i >= 0; i--) {
        const date = tehranDate(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString());
        daily.set(date, { visitors: 0, pageviews: 0, enquiries: 0 });
      }
      for (const row of traffic.results || []) {
        const day = daily.get(row.date);
        if (day) { day.visitors = row.visitors; day.pageviews = row.pageviews; }
      }
      for (const lead of leads) {
        const day = daily.get(tehranDate(lead.createdAt));
        if (day) day.enquiries += 1;
      }

      return json({
        leads,
        orders,
        daily: [...daily.entries()].map(([date, d]) => ({ date, ...d })),
        pages: (pageRows.results || []).map(row => ({ path: row.path, views: row.views })),
        sources: (sourceRows.results || []).map(row => ({ name: row.name, visits: row.visits })),
        settings,
      });
    }

    if (path.length === 2 && path[1] === 'system' && method === 'GET') {
      const ai = aiStatus(env);
      const mail = Boolean(env.RESEND_API_KEY && env.OWNER_EMAIL);
      return json({ ai: { enabled: ai.enabled, provider: ai.provider, model: ai.model }, mail: { enabled: mail } });
    }

    if (path.length === 2 && path[1] === 'test-ai' && method === 'POST') {
      const result = await askAi(env, env.DB, [{ role: 'user', content: 'به من سلام کن و در یک جمله بگو چه کمکی می‌توانی بکنی.' }]);
      if (!result.ok) return fail(502, result.error === 'provider_error' ? 'ارتباط با سرویس هوش مصنوعی برقرار نشد. کلید و نام سرویس را بررسی کنید.' : 'سرویس هوش مصنوعی متصل نیست.');
      return json({ ok: true, sample: result.reply });
    }

    if (path.length >= 2 && path[1] === 'leads') {
      if (path.length === 2 && method === 'POST') {
        const body = await readJson<Record<string, unknown>>(request);
        const name = cleanText(body?.name, 100);
        const email = cleanText(body?.email, 150);
        const company = cleanText(body?.company, 150);
        const service = cleanText(body?.service, 60);
        if (!name || !EMAIL_RE.test(email)) return fail(400, 'نام و ایمیل معتبر لازم است.');
        if (service && !SLUG_RE.test(service)) return fail(400, 'خدمت نامعتبر است.');
        const lead: LeadRow = { id: `M-${crypto.randomUUID().slice(0, 10)}`, name, company, email, service, status: 'New', created_at: new Date().toISOString(), notes: '', source: 'Manual', follow_up: '' };
        await env.DB.prepare(
          `INSERT INTO leads (id, name, company, email, service, status, created_at, notes, source, follow_up)
           VALUES (?1, ?2, ?3, ?4, ?5, 'New', ?6, '', 'Manual', '')`,
        ).bind(lead.id, lead.name, lead.company, lead.email, lead.service, lead.created_at).run();
        return json(toLead(lead), 201);
      }

      if (path.length === 3 && method === 'PATCH') {
        const id = path[2];
        const body = await readJson<Record<string, unknown>>(request);
        const current = await env.DB.prepare(`SELECT * FROM leads WHERE id = ?1`).bind(id).first<LeadRow>();
        if (!current) return fail(404, 'پیام یافت نشد.');
        const status = body && 'status' in body ? cleanText(body.status, 20) : current.status;
        if (!LEAD_STATUSES.includes(status as typeof LEAD_STATUSES[number])) return fail(400, 'مرحلهٔ نامعتبر است.');
        const notes = body && 'notes' in body ? cleanText(body.notes, 6000) : current.notes;
        const followUp = body && 'followUp' in body ? cleanText(body.followUp, 10) : current.follow_up;
        if (followUp && !DATE_RE.test(followUp)) return fail(400, 'تاریخ فالوآپ نامعتبر است.');
        await env.DB.prepare(`UPDATE leads SET status = ?1, notes = ?2, follow_up = ?3 WHERE id = ?4`)
          .bind(status, notes, followUp, id).run();
        return json(toLead({ ...current, status, notes, follow_up: followUp }));
      }

      if (path.length === 4 && path[3] === 'convert' && method === 'POST') {
        const id = path[2];
        const current = await env.DB.prepare(`SELECT * FROM leads WHERE id = ?1`).bind(id).first<LeadRow>();
        if (!current) return fail(404, 'پیام یافت نشد.');
        const existing = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE lead_id = ?1`).bind(id).first<{ n: number }>();
        if ((existing?.n ?? 0) > 0) return fail(409, 'برای این پیام قبلاً پروژه ساخته شده است.');
        const order: OrderRow = {
          id: `P-${crypto.randomUUID().slice(0, 8)}`,
          lead_id: current.id,
          title: `${current.company || current.name} · ${serviceTitle(current.service)}`,
          client: current.company || current.name,
          service: current.service,
          status: 'Planning',
          amount: 0,
          due: '',
        };
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO orders (id, lead_id, title, client, service, status, amount, due) VALUES (?1, ?2, ?3, ?4, ?5, 'Planning', 0, '')`,
          ).bind(order.id, order.lead_id, order.title, order.client, order.service),
          env.DB.prepare(`UPDATE leads SET status = 'Won' WHERE id = ?1`).bind(current.id),
        ]);
        return json({ order: toOrder(order), lead: toLead({ ...current, status: 'Won' }) });
      }
    }

    if (path.length === 3 && path[1] === 'orders' && method === 'PATCH') {
      const id = path[2];
      const body = await readJson<Record<string, unknown>>(request);
      const current = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?1`).bind(id).first<OrderRow>();
      if (!current) return fail(404, 'پروژه یافت نشد.');
      const status = body && 'status' in body ? cleanText(body.status, 20) : current.status;
      if (!ORDER_STATUSES.includes(status as typeof ORDER_STATUSES[number])) return fail(400, 'مرحلهٔ نامعتبر است.');
      const amount = body && 'amount' in body ? Math.max(0, Math.min(10_000_000, Number(body.amount) || 0)) : current.amount;
      const due = body && 'due' in body ? cleanText(body.due, 10) : current.due;
      if (due && !DATE_RE.test(due)) return fail(400, 'تاریخ تحویل نامعتبر است.');
      await env.DB.prepare(`UPDATE orders SET status = ?1, amount = ?2, due = ?3 WHERE id = ?4`)
        .bind(status, amount, due, id).run();
      return json(toOrder({ ...current, status, amount, due }));
    }

    if (path.length === 2 && path[1] === 'settings' && method === 'PATCH') {
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return fail(400, 'درخواست نامعتبر است.');
      const current = await readSettings(env);
      const next = {
        studioName: 'studioName' in body ? cleanText(body.studioName, 100) || DEFAULT_SETTINGS.studioName : current.studioName,
        replyEmail: 'replyEmail' in body ? (cleanText(body.replyEmail, 150) && EMAIL_RE.test(cleanText(body.replyEmail, 150)) ? cleanText(body.replyEmail, 150) : '') : current.replyEmail,
        notifications: typeof body.notifications === 'boolean' ? body.notifications : current.notifications,
        assistantInstructions: 'assistantInstructions' in body ? cleanText(body.assistantInstructions, 6000) : current.assistantInstructions,
      };
      const statements = Object.entries(next).map(([key, value]) =>
        env.DB.prepare(
          `INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).bind(key, JSON.stringify(value)),
      );
      await env.DB.batch(statements);
      return json(next);
    }

    return fail(404, 'مسیر یافت نشد.');
  } catch (error) {
    console.error('API error:', error instanceof Error ? error.message : error);
    return fail(500, 'خطای غیرمنتظرهٔ سرور. دوباره تلاش کنید.');
  }
};
