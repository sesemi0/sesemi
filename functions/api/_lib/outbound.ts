/**
 * Outbound integrations: Resend email notifications and the AI assistant proxy.
 * Provider keys exist ONLY as server secrets — the browser never sees them.
 */
import type { Env, D1Database } from './core';

/* ---------- email (Resend) ---------- */

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export async function sendEnquiryEmail(env: Env, lead: { name: string; email: string; service: string; message: string }): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL || !EMAIL_RE.test(env.OWNER_EMAIL)) return false;
  const from = env.MAIL_FROM || 'SESEMI <onboarding@resend.dev>';
  const rows: [string, string][] = [
    ['نام', lead.name],
    ['ایمیل', lead.email],
    ['خدمت', lead.service || '—'],
    ['پیام', lead.message || '—'],
  ];
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#0b111c;padding:32px">
  <div style="max-width:520px;margin:auto;background:#101a29;border:1px solid #26364c;border-radius:12px;padding:28px">
    <p style="color:#7cc7f5;font-size:12px;letter-spacing:2px;margin:0 0 14px">SESEMI · پیام جدید</p>
    <h1 style="color:#e4edf8;font-size:20px;margin:0 0 22px">سلام! یک پیام تازه از سایت رسید.</h1>
    ${rows.map(([label, value]) => `<div style="border-bottom:1px solid #223047;padding:11px 0"><span style="color:#7d8ca4;font-size:12px;display:block;margin-bottom:5px">${label}</span><strong style="color:#dfe8f4;font-size:14px;font-weight:500;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(value)}</strong></div>`).join('')}
    <p style="color:#7d8ca4;font-size:11px;line-height:1.9;margin:20px 0 0">این پیام از فرم سایت آمده. برای دیدن جزئیات و مدیریت آن به بخش مدیریت استودیو بروید.</p>
  </div>
</div>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [env.OWNER_EMAIL], subject: `پیام جدید از سایت — ${lead.name}`, html }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok;
  } catch { return false; }
}

/* ---------- AI assistant proxy ---------- */

export interface AiStatus { enabled: boolean; provider: string; model: string }

const CF_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
// Preferred first (better quality), falling back automatically when a model is
// plan-gated or deprecated on the account's Workers plan.
const CF_MODEL_CHAIN = [
  '@cf/zai-org/glm-5.3-flash',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  CF_MODEL,
];

export function aiStatus(env: Env): AiStatus {
  const hasBinding = typeof (env as { AI?: { run?: unknown } }).AI?.run === 'function';
  const provider = (env.AI_PROVIDER || '').toLowerCase();
  if (hasBinding) {
    const model = env.AI_MODEL || CF_MODEL;
    return { enabled: true, provider: provider || 'cloudflare', model };
  }
  const enabled = Boolean(env.AI_API_KEY) && ['openai', 'gemini', 'openrouter'].includes(provider);
  const defaults: Record<string, string> = { openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash', openrouter: '' };
  return { enabled, provider: enabled ? provider : '', model: env.AI_MODEL || (enabled ? defaults[provider] : '') };
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

async function callOpenAiCompatible(url: string, key: string, model: string, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 600, temperature: 0.7 }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`provider ${response.status}`);
  const data = await response.json() as { choices?: { message?: { content?: unknown } }[] };
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty reply');
  return reply.trim();
}

async function callGemini(key: string, model: string, system: string, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`provider ${response.status}`);
  const data = await response.json() as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] };
  const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text).filter((text): text is string => typeof text === 'string').join('');
  if (!reply || !reply.trim()) throw new Error('empty reply');
  return reply.trim();
}

export async function askAi(env: Env, db: D1Database, messages: ChatMessage[]): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const status = aiStatus(env);
  if (!status.enabled) return { ok: false, error: 'ai_disabled' };

  // The studio owner can tune the assistant from the admin settings page.
  let instructions = '';
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'assistantInstructions'`).first<{ value: string }>();
    if (row) instructions = String(JSON.parse(row.value) || '');
  } catch { /* default behaviour below */ }

  const system = `${instructions || 'You are Sesemi, the friendly guide of the SESEMI studio website (web design, AI advertising films, UI/UX, video editing, brand identity, prompt engineering).'} Be concise (max ~120 words), warm and professional. Never invent prices, delivery dates or client work. If the visitor wants to start a project, point them to the brief form. Reply in the same language the visitor writes in.`;

  try {
    if (hasWorkersAi(env)) {
      const chain = status.model && status.model !== CF_MODEL ? [status.model, ...CF_MODEL_CHAIN.filter(m => m !== status.model)] : CF_MODEL_CHAIN;
      let lastError = '';
      for (const model of chain) {
        try {
          const result = await env.AI!.run(model, {
            messages: [{ role: 'system', content: system }, ...messages],
            max_tokens: 600,
          }) as { response?: unknown };
          const reply = typeof result?.response === 'string' ? result.response.trim() : '';
          if (reply) return { ok: true, reply };
          lastError = 'empty reply';
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          if (!/5035|deprecated|not available/i.test(lastError)) break;
        }
      }
      throw new Error(lastError || 'all models failed');
    }
    if (status.provider === 'gemini') return { ok: true, reply: await callGemini(env.AI_API_KEY!, status.model, system, messages) };
    if (status.provider === 'openrouter') return { ok: true, reply: await callOpenAiCompatible('https://openrouter.ai/api/v1/chat/completions', env.AI_API_KEY!, status.model, [{ role: 'system', content: system }, ...messages] as ChatMessage[]) };
    if (status.provider === 'openai') return { ok: true, reply: await callOpenAiCompatible('https://api.openai.com/v1/chat/completions', env.AI_API_KEY!, status.model, [{ role: 'system', content: system }, ...messages] as ChatMessage[]) };
    return { ok: false, error: 'unknown_provider' };
  } catch (error) {
    console.error('AI proxy failed:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'provider_error' };
  }
}

function hasWorkersAi(env: Env): boolean {
  return typeof (env as { AI?: { run?: unknown } }).AI?.run === 'function';
}
