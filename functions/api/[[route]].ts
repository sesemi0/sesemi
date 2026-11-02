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
import { sendEnquiryEmail, askAi, aiStatus } from './_lib/outbound';
import { refreshBlog, listPosts, lastRefreshAt } from './_lib/news';
import {
  googleConfigured, readVisitor, createUserSession, destroyVisitorSession,
  userCookie, clearUserCookie, oauthStateCookie, readCookie, googleAuthUrl,
  exchangeGoogleCode, upsertGoogleUser, linkLeadsByEmail, listVisitorProjects,
  OAUTH_STATE_COOKIE,
} from './_lib/accounts';

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
      if (!rateLimit(`contact:${clientIp(request)}`, 10, 60 * 60 * 1000)) return fail(429, 'درخواست‌های زیاد. کمی بعد دوباره تلاش کنید.');
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return fail(400, 'درخواست نامعتبر است.');
      if (cleanText(body.website, 100)) return json({ ok: true }); // honeypot — silently accept bots
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
      return json({ ok: true });
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

    /* ============ public: AI assistant ============ */
    if (path.join('/') === 'ai/chat' && method === 'POST') {
      const status = aiStatus(env);
      if (!status.enabled) return fail(503, 'دستیار هوش مصنوعی هنوز متصل نشده است.');
      if (!rateLimit(`ai:${clientIp(request)}`, 20, 60 * 60 * 1000)) return fail(429, 'تعداد پیام‌ها زیاد است. کمی صبر کنید.');
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

    /* ============ owner: login ============ */
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
      if (failedCount >= 6) return fail(429, 'تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه صبر کنید.');

      const owner = await env.DB.prepare(`SELECT username, pass_hash FROM owner WHERE username = ?1`).bind(username).first<{ username: string; pass_hash: string }>();
      const valid = owner ? await verifyPassword(password, owner.pass_hash) : await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      if (!owner || !valid) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO login_throttle (key, count, window_start) VALUES (?1, ?2, ?3)`,
        ).bind(throttleKey, failedCount + 1, now).run();
        return fail(401, 'نام کاربری یا گذرواژه درست نیست.');
      }
      await env.DB.prepare(`DELETE FROM login_throttle WHERE key = ?1`).bind(throttleKey).run();
      const token = await createSessionToken(owner.username, env.SESSION_SECRET);
      const csrfToken = await csrfTokenFor({ username: owner.username, expiresAt: 0, payload: token.split('.')[0] }, env.SESSION_SECRET);
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
