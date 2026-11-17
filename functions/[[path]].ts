/**
 * Catch-all Pages Function — runs for any path without a static asset.
 * Static pages win first (Cloudflare Pages serves assets before Functions),
 * so this only sees unknown paths: mostly typo'd URLs and, more interestingly,
 * automated scanner probes (wp-admin, .env, .git, backup dumps, …).
 *
 * Probes are logged into security_events and alerted to the owner's Telegram;
 * everything else gets a clean branded 404.
 */
import { logSecurity, looksLikeProbe } from './api/_lib/security';
import type { Env } from './api/_lib/core';
import { clientIp, rateLimit } from './api/_lib/core';

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Page Not Found | SESEMI</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 30%,#0d1c31,#04070f);color:#e4edf8;font-family:'Segoe UI',system-ui,Arial,sans-serif;text-align:center}
.card{padding:60px 40px}.diamond{width:26px;height:26px;margin:0 auto 26px;background:#53b9fb;box-shadow:0 0 30px #53b9fb88;transform:rotate(45deg)}
h1{font-size:30px;letter-spacing:-1px;margin:0 0 12px}p{color:#6d95b7;font-size:13px;line-height:2;margin:0 0 30px}
a{color:#53b9fb;text-decoration:none;border:1px solid #2a4a6d;border-radius:25px;padding:12px 26px;font-size:12px;letter-spacing:1px}
</style></head><body><div class="card"><div class="diamond"></div><h1>This page took a detour.</h1><p>The address you followed doesn't exist on the SESEMI studio site.</p><a href="/">Back to the studio</a></div></body></html>`;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Never touch the API catch-all (it has its own deeper route) or the admin SPA shell.
  if (path.startsWith('/api/') || path === '/admin' || path.startsWith('/admin/')) {
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
  }

  if (looksLikeProbe(path) && request.method === 'GET') {
    // Cap logging per IP so a flood of probes doesn't burn D1 writes
    if (rateLimit(`probe:${clientIp(request)}`, 15, 60 * 60 * 1000)) {
      waitUntil(logSecurity(env, env.DB, {
        type: 'probe_scan',
        severity: 'warning',
        ip: clientIp(request),
        path,
        detail: `scanner probe ${request.method} "${path}"`,
        userAgent: request.headers.get('User-Agent') || '',
      }, waitUntil).catch(() => null));
    }
  }

  return new Response(NOT_FOUND_HTML, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
};
