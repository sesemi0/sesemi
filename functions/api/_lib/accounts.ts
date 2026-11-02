/**
 * Visitor accounts: optional "Continue with Google" (OAuth 2.0 authorization
 * code flow) + the owner-free "my space" where visitors see the briefs and
 * project status they registered on the site. Everything is optional — the
 * studio works fully for anonymous visitors.
 *
 * Sessions: opaque 32-byte cookie token; only its SHA-256 is stored in D1
 * (a stolen database cannot forge a session). The cookie is HttpOnly.
 */
import type { Env, D1Database } from './core';
import { bytesToB64Url } from './core';

export const USER_COOKIE = 'sesemi_user';
export const OAUTH_STATE_COOKIE = 'sesemi_oauth';
const USER_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface VisitorUser { id: string; email: string; name: string; picture: string }

export function googleConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/* ---------- sessions ---------- */

async function sha256Hex(value: string): Promise<string> {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createUserSession(db: D1Database, userId: string): Promise<string> {
  const token = bytesToB64Url(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    // opportunistic cleanup keeps the sessions table from growing forever
    db.prepare(`DELETE FROM user_sessions WHERE expires_at < ?1`).bind(Date.now()),
    db.prepare(`INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)`)
      .bind(await sha256Hex(token), userId, Date.now() + USER_TTL_SECONDS * 1000, Date.now()),
  ]);
  return token;
}

export async function readVisitor(env: Env, request: Request): Promise<VisitorUser | null> {
  if (!googleConfigured(env)) return null;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${USER_COOKIE}=`));
  if (!match) return null;
  const token = match.slice(USER_COOKIE.length + 1);
  if (token.length < 20) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.picture FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
    ).bind(await sha256Hex(token), Date.now()).first<VisitorUser>();
    return row || null;
  } catch { return null; }
}

export async function destroyVisitorSession(env: Env, request: Request): Promise<void> {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${USER_COOKIE}=`));
  if (!match) return;
  const token = match.slice(USER_COOKIE.length + 1);
  try {
    await env.DB.prepare(`DELETE FROM user_sessions WHERE token_hash = ?1`).bind(await sha256Hex(token)).run();
  } catch { /* nothing to undo */ }
}

export function userCookie(token: string, secure: boolean): string {
  return `${USER_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${USER_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearUserCookie(secure: boolean): string {
  return `${USER_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function oauthStateCookie(state: string, secure: boolean): string {
  return `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`;
}

export function readCookie(request: Request, name: string): string {
  const match = (request.headers.get('Cookie') || '').split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : '';
}

/* ---------- Google OAuth 2.0 (authorization code) ---------- */

export function googleAuthUrl(origin: string, clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleProfile { sub: string; email: string; name: string; picture: string }

/** Exchange the authorization code. The id_token comes straight from the
 *  token endpoint over TLS, so decoding (not re-verifying) is standard. */
export async function exchangeGoogleCode(env: Env, code: string, origin: string): Promise<GoogleProfile | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { id_token?: string };
    const payload = data.id_token?.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(new TextDecoder().decode(b64UrlDecode(payload))) as Record<string, unknown>;
    const sub = typeof json.sub === 'string' ? json.sub : '';
    const email = typeof json.email === 'string' ? json.email : '';
    const verified = json.email_verified !== false;
    if (!sub || !email || !verified || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email)) return null;
    return {
      sub,
      email,
      name: typeof json.name === 'string' ? json.name.slice(0, 100) : '',
      picture: typeof json.picture === 'string' && json.picture.startsWith('https://') ? json.picture.slice(0, 400) : '',
    };
  } catch { return null; }
}

function b64UrlDecode(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function upsertGoogleUser(db: D1Database, profile: GoogleProfile): Promise<string> {
  const existing = await db.prepare(`SELECT id FROM users WHERE google_sub = ?1`).bind(profile.sub).first<{ id: string }>();
  if (existing) {
    await db.prepare(`UPDATE users SET email = ?1, name = ?2, picture = ?3 WHERE id = ?4`)
      .bind(profile.email, profile.name, profile.picture, existing.id).run();
    return existing.id;
  }
  const id = `U-${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`;
  await db.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(id, profile.sub, profile.email, profile.name, profile.picture, Date.now()).run();
  return id;
}

/** Link briefs the visitor already sent with this email before signing up. */
export async function linkLeadsByEmail(db: D1Database, userId: string, email: string): Promise<void> {
  try {
    await db.prepare(`UPDATE leads SET user_id = ?1 WHERE lower(email) = ?2 AND (user_id IS NULL OR user_id = '')`)
      .bind(userId, email.toLowerCase()).run();
  } catch { /* user_id column may not exist on stale deploys — harmless */ }
}

/* ---------- the visitor's own projects ---------- */

export interface VisitorProject {
  id: string; service: string; status: string; createdAt: string;
  orderStatus: string | null; message: string;
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  New: 'Received',
  Contacted: 'We replied',
  Qualified: 'Planning together',
  Won: 'In progress',
  Lost: 'Closed',
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  Planning: 'Planning',
  'In progress': 'In progress',
  Review: 'In review',
  Delivered: 'Delivered',
};

export async function listVisitorProjects(db: D1Database, userId: string): Promise<VisitorProject[]> {
  const rows = await db.prepare(
    `SELECT l.id, l.service, l.status, l.created_at, l.message, o.status AS order_status
     FROM leads l LEFT JOIN orders o ON o.lead_id = l.id
     WHERE l.user_id = ?1 ORDER BY l.created_at DESC LIMIT 30`,
  ).bind(userId).all<{ id: string; service: string; status: string; created_at: string; message: string; order_status: string | null }>();
  return (rows.results || []).map(row => ({
    id: row.id,
    service: row.service,
    status: row.order_status ? (ORDER_STATUS_LABELS[row.order_status] || row.order_status) : (LEAD_STATUS_LABELS[row.status] || row.status),
    createdAt: row.created_at,
    orderStatus: row.order_status,
    message: row.message,
  }));
}
