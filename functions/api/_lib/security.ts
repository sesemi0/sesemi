/**
 * Security observability + two-step owner login.
 *
 * logSecurity() records suspicious activity in D1 (probe scans, brute force,
 * honeypot hits, rate-limit rejections) and pushes a throttled Telegram alert
 * to the owner so an attack is noticed the moment it starts.
 *
 * The admin panel's second factor is a one-time 6-digit code delivered to the
 * owner's Telegram chat. Only the SHA-256 of the code is stored, the pending
 * record lives for 10 minutes and dies after 5 wrong attempts.
 */
import type { Env, D1Database } from './core';
import { bytesToB64Url, safeEqual } from './core';

export type SecuritySeverity = 'info' | 'warning' | 'critical';
export type SecurityType =
  | 'admin_login_fail' | 'admin_login_success' | 'admin_2fa_sent' | 'admin_2fa_fail'
  | 'admin_2fa_success' | 'admin_2fa_bypass' | 'probe_scan' | 'honeypot' | 'rate_limit';

export interface SecurityEvent {
  type: SecurityType;
  severity?: SecuritySeverity;
  ip?: string;
  path?: string;
  detail?: string;
  userAgent?: string;
}

/** Minimum seconds between Telegram alerts of the same type (alert storm guard). */
const ALERT_THROTTLE: Partial<Record<SecurityType, number>> = {
  admin_login_fail: 120,
  admin_2fa_fail: 120,
  admin_2fa_bypass: 3600,
  probe_scan: 600,
  honeypot: 600,
  rate_limit: 600,
};

const alertedAt = new Map<string, number>();

/** truncate + strip control chars so a hostile payload can't forge log lines or Telegram text */
function safeDetail(value: string, max = 300): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

export function telegramConfigured(env: Env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(env: Env, text: string): Promise<boolean> {
  if (!telegramConfigured(env)) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 3500) }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok;
  } catch { return false; }
}

export async function logSecurity(
  env: Env,
  db: D1Database,
  event: SecurityEvent,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<void> {
  const severity = event.severity || 'info';
  const now = Date.now();
  try {
    await db.prepare(
      `INSERT INTO security_events (at, type, severity, ip, path, detail, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      now,
      event.type,
      severity,
      safeDetail(event.ip || '', 64),
      safeDetail(event.path || '', 200),
      safeDetail(event.detail || ''),
      safeDetail(event.userAgent || '', 200),
    ).run();
  } catch { /* table may not exist on a stale deploy — alerts still fire below */ }

  // opportunistic retention: keep 30 days
  if (Math.random() < 0.05) {
    try { await db.prepare(`DELETE FROM security_events WHERE at < ?1`).bind(now - 30 * 24 * 60 * 60 * 1000).run(); } catch { /* fine */ }
  }

  const minGap = ALERT_THROTTLE[event.type];
  if (!minGap) return; // info-level types are logged, never alerted
  const key = event.type;
  const last = alertedAt.get(key) || 0;
  if (now - last < minGap * 1000) return;
  alertedAt.set(key, now);

  const labels: Record<SecurityType, string> = {
    admin_login_fail: '⚠️ تلاش ناموفق ورود مدیر',
    admin_login_success: '✅ ورود مدیر (کد تلگرام ارسال شد)',
    admin_2fa_sent: '🔑 کد دومرحله‌ای ارسال شد',
    admin_2fa_fail: '🚫 کد دومرحله‌ای اشتباه',
    admin_2fa_success: '🔓 ورود دومرحله‌ای کامل شد',
    admin_2fa_bypass: '⚙️ ورود دومرحله‌ای غیرفعال (تلگرام تنظیم نشده)',
    probe_scan: '🕸️ ردیاب اسکن مهاجم',
    honeypot: '🍯 ربات فرم (تلهٔ عسل)',
    rate_limit: '⛔ عبور از حد مجاز درخواست',
  };
  const icon = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟠' : '🟡';
  const message = [
    `${icon} ${labels[event.type]}`,
    severity !== 'info' ? `شدت: ${severity}` : '',
    event.ip ? `IP: \`${event.ip}\`` : '',
    event.path ? `مسیر: \`${event.path}\`` : '',
    event.detail ? safeDetail(event.detail, 200) : '',
  ].filter(Boolean).join('\n');

  const send = sendTelegram(env, message);
  if (waitUntil) waitUntil(send.catch(() => null)); else await send.catch(() => null);
}

/* ---------- two-step login codes ---------- */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

async function sha256Hex(value: string): Promise<string> {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Create a one-time code for `username`, deliver it to the owner's Telegram.
 *  Returns null when Telegram is not configured (login falls back to 1 step). */
export async function issueAdminCode(
  env: Env,
  db: D1Database,
  username: string,
): Promise<{ pendingId: string } | null> {
  if (!telegramConfigured(env)) return null;
  // unbiased 6-digit code: rejection sampling on 32-bit draws (2^32 % 1e6 ≠ 0)
  let code = '';
  while (!code) {
    const draw = crypto.getRandomValues(new Uint32Array(1))[0];
    if (draw < 4_294_000_000) code = String(draw % 1_000_000).padStart(6, '0');
  }
  const pendingId = bytesToB64Url(crypto.getRandomValues(new Uint8Array(18)));
  const now = Date.now();
  await db.batch([
    db.prepare(`DELETE FROM admin_2fa WHERE expires_at < ?1`).bind(now),
    db.prepare(`DELETE FROM admin_2fa WHERE username = ?1`).bind(username), // one live code per username
    db.prepare(`INSERT INTO admin_2fa (pending_id, username, code_hash, expires_at, attempts, created_at)
                VALUES (?1, ?2, ?3, ?4, 0, ?5)`).bind(pendingId, username, await sha256Hex(code), now + CODE_TTL_MS, now),
  ]);
  const sent = await sendTelegram(env,
    `🔐 کد ورود دومرحله‌ای سسِمی\n\n*${code}*\n\n۱۰ دقیقه اعتبار دارد.\nاگر شما در حال ورود نبودید، این کد را نادیده بگیرید و گذرواژه‌تان را عوض کنید.`);
  if (!sent) return null; // delivery failed → do not strand the owner mid-login
  return { pendingId };
}

export type CodeVerifyResult = { ok: true; username: string } | { ok: false; reason: 'not_found' | 'expired' | 'locked' | 'wrong' };

/** Verify a pending code. Wrong attempts are counted; 5 wrong kills the record. */
export async function verifyAdminCode(db: D1Database, pendingId: string, code: string): Promise<CodeVerifyResult> {
  const row = await db.prepare(
    `SELECT pending_id, username, code_hash, expires_at, attempts FROM admin_2fa WHERE pending_id = ?1`,
  ).bind(pendingId).first<{ pending_id: string; username: string; code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.pending_id !== pendingId || !/^\d{6}$/.test(code)) return { ok: false, reason: 'not_found' };
  if (row.expires_at < Date.now()) {
    await db.prepare(`DELETE FROM admin_2fa WHERE pending_id = ?1`).bind(pendingId).run();
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await db.prepare(`DELETE FROM admin_2fa WHERE pending_id = ?1`).bind(pendingId).run();
    return { ok: false, reason: 'locked' };
  }
  if (!safeEqual(await sha256Hex(code), row.code_hash)) {
    await db.prepare(`UPDATE admin_2fa SET attempts = attempts + 1 WHERE pending_id = ?1`).bind(pendingId).run();
    return { ok: false, reason: 'wrong' };
  }
  await db.prepare(`DELETE FROM admin_2fa WHERE pending_id = ?1`).bind(pendingId).run();
  return { ok: true, username: row.username };
}

/* ---------- hostile path detection (shared with the catch-all function) ---------- */

/** Common scanner fingerprints: WordPress/php exploits, secret files, clouds. */
const PROBE_PATTERNS: RegExp[] = [
  /wp-(admin|login|content|includes)/i,
  /phpmyadmin|xmlrpc\.php|wp-json/i,
  /\.(env|git|aws|sql|bak|ini|conf|yml|yaml|log|old|swp)(\?|$)/i,
  /\.well-known\/(sftp|acme-challenge)/i,
  /config\.php|backup|dump|xmlrpc/i,
  /\/(actuator|cgi-bin|vendor\/phpunit|eval-stdin|solr|jenkins)/i,
  /\.php($|\?)/i,
];

export function looksLikeProbe(pathname: string): boolean {
  return PROBE_PATTERNS.some(pattern => pattern.test(pathname));
}
