// SESEMI contact endpoint — Supabase Edge Function (Deno).
// Contract (see INTEGRATIONS-style docs in README):
//   POST /contact  { name, contact, message?, service?, consent }
//   -> 200 { ok: true }   only after the enquiry is durably stored.
// Deploy: supabase functions deploy contact --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '*').split(',').map(o => o.trim());
const MAX_BODY = 8 * 1024;

const json = (body: unknown, status = 200, origin = '*') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'post, options',
      'cache-control': 'no-store',
    },
  });

function pickOrigin(request: Request): string {
  const origin = request.headers.get('origin') || '';
  return ALLOWED_ORIGINS.includes('*') ? (origin || '*') : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
}

// Dumb per-IP throttle: one small Durable-free window via the table's timestamp.
function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

Deno.serve(async request => {
  const origin = pickOrigin(request);
  if (request.method === 'OPTIONS') return json({}, 204, origin);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, origin);

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: 'payload_too_large' }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400, origin);
  }

  const name = String(payload.name ?? '').trim();
  const contact = String(payload.contact ?? '').trim();
  const message = String(payload.message ?? '').trim();
  const service = String(payload.service ?? '').trim();
  const consent = payload.consent === true;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? null;

  if (name.length < 2 || name.length > 100) return json({ ok: false, error: 'invalid_name' }, 422, origin);
  if (!contact || contact.length > 150 || !validEmail(contact)) return json({ ok: false, error: 'invalid_contact' }, 422, origin);
  if (message.length > 3000) return json({ ok: false, error: 'invalid_message' }, 422, origin);
  if (!consent) return json({ ok: false, error: 'consent_required' }, 422, origin);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error } = await supabase.from('enquiries').insert({
    name, contact, message, service, ip, user_agent: userAgent,
  });
  if (error) {
    console.error('enquiry insert failed', error.message);
    return json({ ok: false, error: 'storage_failed' }, 500, origin);
  }
  return json({ ok: true }, 200, origin);
});
