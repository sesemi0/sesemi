/**
 * SESEMI production server (zero npm dependencies, Node 20+)
 * -----------------------------------------------------------
 * Serves the built site from dist/ and provides the Sesi backend:
 *   POST /api/agent   → { reply }   (LLM via OpenAI-compatible API, e.g. Ollama, or z-ai SDK)
 *   POST /api/contact → { ok:true } (briefs appended to data/briefs.jsonl)
 *
 * Environment variables:
 *   PORT            default 8788
 *   LLM_PROVIDER    "openai" (default; works with Ollama/LM Studio/OpenAI/OpenRouter) | "zai"
 *   LLM_BASE_URL    default http://host.docker.internal:11434/v1   (Ollama)
 *   LLM_API_KEY     default "ollama"   (ignored by Ollama, needed by cloud providers)
 *   LLM_MODEL       default "qwen3:14b"
 *   DATA_DIR        default ./data
 *   DIST_DIR        default ./dist
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const PORT = parseInt(process.env.PORT || '8788')
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase()
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'http://host.docker.internal:11434/v1').replace(/\/$/, '')
const LLM_API_KEY = process.env.LLM_API_KEY || 'ollama'
const LLM_MODEL = process.env.LLM_MODEL || 'qwen3:14b'
const DATA_DIR = process.env.DATA_DIR || './data'
const DIST_DIR = process.env.DIST_DIR || './dist'

const SYSTEM_PROMPT = [
  'You are Sesi, the warm and professional studio assistant of SESEMI — an independent digital & creative studio.',
  'Services: web design & development, AI advertising films, UI/UX & product design, AI-assisted video editing, logo & visual identity, creative prompt engineering.',
  'Style: friendly, concise (2-4 short sentences), one question at the end to move the visitor forward.',
  'Rules: never quote prices or timelines (projects are individually scoped — invite the visitor to fill the brief at /start). Never claim to be human. Never invent client names or portfolio items.',
  'Reply in the same language the visitor writes in (English or Persian).',
].join(' ')

const FALLBACKS = [
  [/price|cost|budget|quote|قیمت|هزینه/i, 'Every project is scoped individually — share your idea and timeline through the brief at /start and we will follow up with a tailored proposal.'],
  [/video|film|teaser|advert|reel|edit|ویدیو|تیزر/i, 'We craft AI advertising films and brand teasers — concept, storyboard, AI visuals and channel-ready editing. Tell us a little about your brand and goal.'],
  [/logo|identity|brand|لوگو|هویت/i, 'Logos, color and typography direction, cohesive visual identity — we would love to hear whether this is a new brand or a refresh.'],
  [/prompt|workflow/i, 'We build structured prompt libraries and repeatable AI workflows for images and video. What would you like to create more consistently?'],
  [/web|site|landing|shop|ui|ux|وب ?سایت|طراحی/i, 'We design and build responsive brand websites with clear user journeys and on-page SEO. What should your visitors do when they land on your page?'],
  [/hello|hi\b|hey|سلام|درود/i, 'Hello! Happy to help you find the right service. Tell me a little about your brand and what you want to make.'],
]

function fallbackReply(text) {
  for (const [pattern, reply] of FALLBACKS) if (pattern.test(text)) return reply
  return 'I can help with web design, AI advertising films, UI/UX, video editing, branding or prompt engineering — which one is closest to your idea?'
}

function readBody(req, limit = 60_000) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

// --- naive per-IP rate limiter (30 req / minute) ---
const hits = new Map()
function rateLimited(ip) {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || entry.resetAt < now) { hits.set(ip, { count: 1, resetAt: now + 60_000 }); return false }
  entry.count += 1
  return entry.count > 30
}

function cleanHistory(messages) {
  if (!Array.isArray(messages)) return []
  return messages.slice(-20)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
}

async function llmOpenAI(messages) {
  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, messages, stream: false }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}`)
  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content || ''
  // qwen3 may emit a thinking block — strip it
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

let zaiClientPromise = null
async function llmZai(messages) {
  try {
    if (!zaiClientPromise) zaiClientPromise = import('z-ai-web-dev-sdk').then((mod) => mod.default.create())
    const client = await zaiClientPromise
    const completion = await client.chat.completions.create({ messages, thinking: { type: 'disabled' } })
    return completion?.choices?.[0]?.message?.content?.trim() || ''
  } catch {
    zaiClientPromise = null
    return ''
  }
}

async function handleAgent(req, res) {
  let body
  try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON' }) }
  const cleaned = cleanHistory(body?.messages)
  const lastUser = [...cleaned].reverse().find((m) => m.role === 'user')
  if (!lastUser) return json(res, 400, { error: 'empty conversation' })

  const prompt = [{ role: 'system', content: SYSTEM_PROMPT }, ...cleaned]
  try {
    const reply = LLM_PROVIDER === 'zai' ? await llmZai(prompt) : await llmOpenAI(prompt)
    if (reply) return json(res, 200, { reply: reply.slice(0, 2000) })
  } catch (error) {
    console.error('[sesemi] agent fallback:', error.message)
  }
  return json(res, 200, { reply: fallbackReply(String(lastUser.content)) })
}

async function handleContact(req, res) {
  let body
  try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON' }) }
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : ''
  const contact = typeof body?.contact === 'string' ? body.contact.trim().slice(0, 150) : ''
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 3000) : ''
  const service = typeof body?.service === 'string' ? body.service.trim().slice(0, 80) : ''
  if (!name || !contact || body?.consent !== true) return json(res, 422, { error: 'name, contact and consent are required' })

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const brief = { id: crypto.randomUUID(), receivedAt: new Date().toISOString(), name, contact, service, message, consent: true }
    fs.appendFileSync(path.join(DATA_DIR, 'briefs.jsonl'), JSON.stringify(brief) + '\n', 'utf8')
    console.log(`[sesemi] brief stored: ${brief.id}`)
  } catch (error) {
    console.error('[sesemi] contact store failed:', error.message)
    return json(res, 500, { error: 'storage unavailable' })
  }
  return json(res, 200, { ok: true })
}

// --- static file serving with SPA fallback ---
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' })
  fs.createReadStream(filePath).pipe(res)
}

function serveSite(pathname, res) {
  const root = path.resolve(DIST_DIR)
  let target = path.normalize(path.join(root, decodeURIComponent(pathname)))
  if (!target.startsWith(root)) { res.writeHead(403); return res.end('Forbidden') }
  if (pathname === '/' || !path.extname(target)) {
    const candidate = pathname === '/' ? path.join(root, 'index.html') : `${target}.html`
    target = fs.existsSync(candidate) ? candidate : path.join(root, 'index.html')
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    target = path.join(root, 'index.html')
  }
  if (!fs.existsSync(target)) { res.writeHead(503); return res.end('dist/ not built yet — run: bun run build') }
  serveStatic(res, target)
}

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || '/').split('?')[0]
  if (req.method === 'POST' && (pathname === '/api/agent' || pathname === '/api/contact')) {
    const ip = (req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '')
    if (rateLimited(ip)) return json(res, 429, { error: 'too many requests' })
    try {
      if (pathname === '/api/agent') return await handleAgent(req, res)
      return await handleContact(req, res)
    } catch (error) {
      console.error('[sesemi] unhandled:', error.message)
      return json(res, 500, { error: 'internal error' })
    }
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveSite(pathname, res)
  res.writeHead(405); res.end('Method Not Allowed')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[sesemi] SESEMI server ready → http://0.0.0.0:${PORT}`)
  console.log(`[sesemi] LLM provider: ${LLM_PROVIDER} ${LLM_PROVIDER === 'openai' ? `(${LLM_MODEL} @ ${LLM_BASE_URL})` : '(z-ai sdk)'}`)
  console.log('[sesemi] briefs storage:', path.resolve(DATA_DIR))
})
