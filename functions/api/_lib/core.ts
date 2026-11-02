/**
 * Shared security + HTTP helpers for the SESEMI Pages Functions.
 * Runs on the Cloudflare Workers runtime (WebCrypto only — no Node APIs).
 * Secrets never leave the server; the browser only ever sees signed cookies.
 */

export interface D1Result<T = unknown> { results?: T[]; success: boolean; meta?: unknown }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  ALLOW_SETUP?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  OWNER_EMAIL?: string;
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  BLOG_REFRESH_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AI?: { run(model: string, input: unknown): Promise<{ response?: unknown }> };
}

export const SESSION_COOKIE = 'sesemi_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
// The Workers runtime caps PBKDF2 iterations at 100,000 — do not raise this.
const PBKDF2_ITERATIONS = 100_000;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

/** Split an /api/* catch-all path into segments. */
export function segments(route: string | string[]): string[] {
  const value = Array.isArray(route) ? route.join('/') : route;
  return value.split('/').filter(Boolean);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    const body = await request.json() as T;
    return body && typeof body === 'object' ? body : null;
  } catch { return null; }
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'local';
}

/* ---------- encoding + constant-time comparison ---------- */

const encoder = new TextEncoder();

export function bytesToB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function b64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- HMAC signing (sessions + CSRF) ---------- */

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  return bytesToB64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}

export async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  return safeEqual(signature, await sign(payload, secret));
}

/* ---------- owner password hashing: PBKDF2-SHA256 ---------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToB64Url(salt)}$${bytesToB64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !saltB64 || !hashB64) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 100_000) return false;
  const salt = b64UrlToBytes(saltB64);
  if (!salt) return false;
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
    return safeEqual(bytesToB64Url(new Uint8Array(bits)), hashB64);
  } catch { return false; }
}

/* ---------- stateless sessions + CSRF tokens ---------- */

export interface Session { username: string; expiresAt: number; payload: string }

export async function createSessionToken(username: string, secret: string): Promise<string> {
  const payload = bytesToB64Url(encoder.encode(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function readSession(request: Request, secret: string): Promise<Session | null> {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = match.slice(SESSION_COOKIE.length + 1);
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!await verifySignature(payload, signature, secret)) return null;
  const bytes = b64UrlToBytes(payload);
  if (!bytes) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { u?: unknown; exp?: unknown };
    if (typeof data.u !== 'string' || typeof data.exp !== 'number') return null;
    if (data.exp * 1000 < Date.now()) return null;
    return { username: data.u, expiresAt: data.exp, payload };
  } catch { return null; }
}

/** CSRF token is derived from the session payload: readable only via the authenticated /session call. */
export async function csrfTokenFor(session: Session, secret: string): Promise<string> {
  return sign(`${session.payload}|csrf`, secret);
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/* ---------- tiny in-memory rate limiter (per isolate) ---------- */

const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    if (buckets.size > 8000) buckets.clear();
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

/* ---------- validation ---------- */

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;
export const SLUG_RE = /^[a-z0-9-]{2,60}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
