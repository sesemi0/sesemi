// Local stand-in for the Supabase contact function, so the form's live
// delivery path can be tested end to end without deploying anything.
//   node scripts/dev-backend.mjs            -> http://localhost:8787/api/contact
// Then run Vite with the endpoint wired in:
//   VITE_CONTACT_ENDPOINT=http://localhost:8787/api/contact npm run dev
// Submissions are logged to the console and appended to data/dev-enquiries.json.

import { createServer } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const STORE = resolve(process.cwd(), 'data/dev-enquiries.json');
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const server = createServer(async (request, response) => {
  const send = (body, status = 200) => {
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': request.headers.origin || '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'post, options',
    });
    response.end(JSON.stringify(body));
  };
  if (request.method === 'OPTIONS') return send({}, 204);
  if (request.method !== 'POST' || !request.url.includes('/api/contact')) return send({ ok: false, error: 'not_found' }, 404);

  const raw = await new Promise(resolveChunk => {
    let data = '';
    request.on('data', chunk => { data += chunk; if (data.length > 8192) request.destroy(); });
    request.on('end', () => resolveChunk(data));
  });
  let payload;
  try { payload = JSON.parse(raw); } catch { return send({ ok: false, error: 'invalid_json' }, 400); }

  const name = String(payload.name ?? '').trim();
  const contact = String(payload.contact ?? '').trim();
  if (name.length < 2 || !validEmail(contact) || payload.consent !== true) {
    return send({ ok: false, error: 'validation_failed' }, 422);
  }
  const record = { at: new Date().toISOString(), name, contact, message: payload.message ?? '', service: payload.service ?? '' };
  console.log('📩 enquiry received:', JSON.stringify(record));
  await mkdir(dirname(STORE), { recursive: true });
  await appendFile(STORE, JSON.stringify(record) + '\n', 'utf8');
  send({ ok: true });
});

server.listen(PORT, () => console.log(`SESEMI dev backend on http://localhost:${PORT}/api/contact — submissions logged to ${STORE}`));
