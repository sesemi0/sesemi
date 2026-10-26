import type { Plugin, ViteDevServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * SESEMI local backend (dev server middleware)
 * ---------------------------------------------
 * POST /api/agent   → { reply: string }        Sesi AI assistant (z-ai-web-dev-sdk, server-side only)
 * POST /api/contact → { ok: true }             Stores project briefs in data/briefs.jsonl
 *
 * If the AI SDK is unavailable, /api/agent falls back to friendly preset
 * answers so the widget never breaks. Rate limited per IP, in-memory.
 */

type IncomingMessage = { role: 'user' | 'assistant'; content: unknown }

const SYSTEM_PROMPT = [
  'You are Sesi, the warm and professional studio assistant of SESEMI — an independent digital & creative studio.',
  'Services: web design & development, AI advertising films, UI/UX & product design, AI-assisted video editing, logo & visual identity, creative prompt engineering.',
  'Style: friendly, concise (2-4 short sentences), one question at the end to move the visitor forward.',
  'Rules: never quote prices or timelines (projects are individually scoped — invite the visitor to fill the brief at /start). Never claim to be human. Never invent client names or portfolio items.',
  'Reply in the same language the visitor writes in (English or Persian).',
].join(' ')

const FALLBACKS: Array<[RegExp, string]> = [
  [/price|cost|budget|quote|قیمت|هزینه/i, 'Every project is scoped individually — share your idea and timeline through the brief at /start and we will follow up with a tailored proposal.'],
  [/video|film|teaser|advert|reel|edit|ویدیو|تیزر/i, 'We craft AI advertising films and brand teasers — concept, storyboard, AI visuals and channel-ready editing. Tell us a little about your brand and goal.'],
  [/logo|identity|brand|لوگو|هویت/i, 'Logos, color and typography direction, cohesive visual identity — we would love to hear whether this is a new brand or a refresh.'],
  [/prompt|workflow/i, 'We build structured prompt libraries and repeatable AI workflows for images and video. What would you like to create more consistently?'],
  [/web|site|landing|shop|ui|ux|وب ?سایت|طراحی/i, 'We design and build responsive brand websites with clear user journeys and on-page SEO. What should your visitors do when they land on your page?'],
  [/hello|hi\b|hey|سلام|درود/i, 'Hello! Happy to help you find the right service. Tell me a little about your brand and what you want to make.'],
]

function fallbackReply(text: string): string {
  for (const [pattern, reply] of FALLBACKS) if (pattern.test(text)) return reply
  return 'I can help with web design, AI advertising films, UI/UX, video editing, branding or prompt engineering — which one is closest to your idea?'
}

function readBody(req: any, limit = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: any, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

// --- naive per-IP rate limiter (30 requests / minute) ---
const hits = new Map<string, { count: number; resetAt: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || entry.resetAt < now) { hits.set(ip, { count: 1, resetAt: now + 60_000 }); return false }
  entry.count += 1
  return entry.count > 30
}

// --- lazy AI client (backend only, never bundled for the browser) ---
let zaiPromise: Promise<any> | null = null
async function getClient(): Promise<any | null> {
  try {
    if (!zaiPromise) {
      zaiPromise = import('z-ai-web-dev-sdk').then((mod: any) => mod.default.create())
    }
    return await zaiPromise
  } catch {
    zaiPromise = null
    return null
  }
}

async function handleAgent(req: any, res: any) {
  let body: any
  try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON' }) }
  const messages: IncomingMessage[] = Array.isArray(body?.messages) ? body.messages.slice(-20) : []
  const cleaned = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
  const lastUser = [...cleaned].reverse().find((m) => m.role === 'user')
  if (!lastUser) return json(res, 400, { error: 'empty conversation' })

  const client = await getClient()
  if (client) {
    try {
      const completion = await client.chat.completions.create({
        messages: [{ role: 'assistant', content: SYSTEM_PROMPT }, ...cleaned],
        thinking: { type: 'disabled' },
      })
      const reply: string = completion?.choices?.[0]?.message?.content?.trim()
      if (reply) return json(res, 200, { reply: reply.slice(0, 2000) })
    } catch (error) {
      console.error('[sesemi-api] agent fallback:', (error as Error).message)
    }
  }
  return json(res, 200, { reply: fallbackReply(String(lastUser.content)) })
}

async function handleContact(req: any, res: any) {
  let body: any
  try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'invalid JSON' }) }
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : ''
  const contact = typeof body?.contact === 'string' ? body.contact.trim().slice(0, 150) : ''
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 3000) : ''
  const service = typeof body?.service === 'string' ? body.service.trim().slice(0, 80) : ''
  const consent = body?.consent === true
  if (!name || !contact || !consent) return json(res, 422, { error: 'name, contact and consent are required' })

  try {
    const dir = path.resolve(process.cwd(), 'data')
    fs.mkdirSync(dir, { recursive: true })
    const brief = { id: crypto.randomUUID(), receivedAt: new Date().toISOString(), name, contact, service, message, consent }
    fs.appendFileSync(path.join(dir, 'briefs.jsonl'), JSON.stringify(brief) + '\n', 'utf8')
    console.log(`[sesemi-api] brief stored: ${brief.id}`)
  } catch (error) {
    console.error('[sesemi-api] contact store failed:', (error as Error).message)
    return json(res, 500, { error: 'storage unavailable' })
  }
  return json(res, 200, { ok: true })
}

export function sesemiApi(): Plugin {
  return {
    name: 'sesemi-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        const pathname = (req.url || '').split('?')[0]
        if (req.method !== 'POST') return next()
        const ip = (req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '')
        if (rateLimited(ip)) return json(res, 429, { error: 'too many requests' })
        try {
          if (pathname === '/api/agent') return await handleAgent(req, res)
          if (pathname === '/api/contact') return await handleContact(req, res)
        } catch (error) {
          console.error('[sesemi-api] unhandled:', (error as Error).message)
          return json(res, 500, { error: 'internal error' })
        }
        return next()
      })
      console.log('[sesemi-api] Sesi backend ready → POST /api/agent, POST /api/contact')
    },
  }
}
