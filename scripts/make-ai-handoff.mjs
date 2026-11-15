/**
 * AI-Studio handoff bundler — packs the whole site source (with a crafted
 * prompt) into ONE markdown file that can be uploaded/pasted into Google AI
 * Studio. Run: node scripts/make-ai-handoff.mjs  →  ai-studio-handoff.md
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = 'D:/myproject';
const OUT = join(ROOT, 'ai-studio-handoff.md');

/** text files worth handing over, by folder */
const INCLUDE_DIRS = ['src', 'functions', 'migrations', 'public', 'n8n'];
const INCLUDE_FILES = [
  'package.json', 'wrangler.toml', 'schema.sql',
  'index.html', 'vite.config.ts', 'tsconfig.json', 'README.md', 'INTEGRATIONS.md', 'DEPLOY-fa.md',
];
const SKIP_PARTS = ['node_modules', 'dist', '.git', '.wrangler', 'icons', 'brand', 'google', 'social-card', 'panel.html'];

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_PARTS.some(s => name.includes(s))) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (st.size < 300_000 && !/\.(png|jpg|jpeg|webp|gif|ico|woff2?|mp4|pdf|zip)$/i.test(name)) {
      files.push(relative(ROOT, full).split(sep).join('/'));
    }
  }
}
for (const d of INCLUDE_DIRS) if (existsSync(join(ROOT, d))) walk(join(ROOT, d));
for (const f of INCLUDE_FILES) if (existsSync(join(ROOT, f))) files.push(f);
files.sort();

const PROMPT = `# SESEMI Studio — full codebase handoff for Google AI Studio

You are receiving the COMPLETE source code of my production website so you can act as its senior engineer.

## What this project is
**SESEMI** (https://sesemi.pages.dev) — the public site of a digital & AI-creative studio in Yerevan:
- **Frontend:** React 19 + TypeScript + Vite 8, single-page app with generated crawlable pages, dark/light theme, trilingual UI (English default, Persian RTL, Armenian) via src/i18n.ts.
- **Backend:** Cloudflare Pages Functions under functions/api/[[route]].ts (single catch-all router) + Cloudflare D1 (SQLite) — contact leads, consented analytics, Workers-AI assistant with model fallback, AI-Radar blog (7 RSS feeds, daily refresh), optional "Continue with Google" visitor accounts (OAuth code flow), admin panel (session cookie + CSRF, hashed passwords).
- **SESEMI Office bridge:** the homepage showcases a separate app (sesemi-office.pages.dev); completed agent tasks are reported to POST /api/agent-outputs (D1 table agent_outputs); a Telegram bridge exists at POST /api/agent-notify (env-gated: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
- **Deploy:** push to GitHub (sesemi0/sesemi) → GitHub Actions → Cloudflare Pages. Secrets live ONLY in Cloudflare dashboard (.dev.vars locally), never in this code.

## What I want from you
1. Read and understand the whole codebase first; then answer my questions about any part of it.
2. When I ask for changes, give me COMPLETE updated files (or precise diffs) that respect the existing architecture and conventions.
3. Audit as I ask: security (auth, CSRF, rate limits, D1 injection), performance (mobile-first, 60fps hero), and SEO.
4. Never invent endpoints or env vars that don't exist in this code; if something is missing, tell me.
5. Public pages are ENGLISH by design; Persian/Armenian are UI translations only. Do not put Persian into public copy.

## How to run / verify locally
- npm run check  → tsc for src AND functions
- npm run build  → vite build (generates crawlable pages + sitemap)
- Deploy is automatic via GitHub Actions; do not propose wrangler deploy steps unless I ask.

## Conventions to respect
- Persian admin/UI strings live inline; site copy for the 3 languages lives in src/i18n.ts.
- RTL is driven by html.lang-fa CSS layer (do NOT reuse html.translated-rtl — it belongs to the Chrome-translate watcher).
- All D1 access uses numbered placeholders (?1, ?2 — no reuse); IN() needs chunked binds.
- Rate limits per IP for public endpoints; every mutation validates its body with cleanText helpers from functions/api/_lib/core.ts.

---

# The codebase

Every file below is prefixed with its repo-relative path. Root: D:/myproject (this exact tree ships to production).
`;

let total = 0;
const blocks = files.map(f => {
  const body = readFileSync(join(ROOT, f), 'utf8');
  total += body.length;
  const lang = /\.(ts|tsx|mjs|js)$/.test(f) ? 'ts' : /\.(css)$/.test(f) ? 'css' : /\.(json)$/.test(f) ? 'json' : /\.(md)$/.test(f) ? 'md' : /\.(html)$/.test(f) ? 'html' : /\.(sql)$/.test(f) ? 'sql' : 'text';
  return `\n\n## FILE: ${f}\n\n\`\`\`${lang}\n${body}\n\`\`\``;
});

const tail = `\n\n---\n\n# End of codebase\n${files.length} files, ${(total / 1024).toFixed(0)} KB of source. Ask me what you want to build or audit — I will paste follow-up requests in Persian or English.\n`;

writeFileSync(OUT, PROMPT + blocks.join('') + tail, 'utf8');
console.log(`written: ${OUT}`);
console.log(`files: ${files.length}, source size: ${(total / 1024).toFixed(0)} KB`);
