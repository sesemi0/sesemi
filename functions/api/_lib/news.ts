/**
 * AI-news blog engine: pulls RSS feeds of leading world outlets (real
 * journalism, every card links to the original article), filters out
 * promotional filler and anything older than two days, and stores them in D1.
 * Refresh is triggered daily by a GitHub Actions cron (POST /api/blog/refresh
 * with a bearer token) and lazily by visitors if the cron ever misses a day.
 */
import type { Env, D1Database } from './core';

export interface NewsItem { id: string; url: string; title: string; description: string; source: string; publishedAt: string }
export interface BlogPost { id: string; url: string; title_en: string; title_fa: string; summary_fa: string; published_at: string; source: string }

const FEEDS: { name: string; url: string }[] = [
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'AI News', url: 'https://www.artificialintelligence-news.com/feed/' },
  { name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { name: 'The Guardian AI', url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss' },
];

const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // cron runs daily; visitors may add a bit more
const MAX_NEW_PER_RUN = 14;
const KEEP_DAYS = 45;
const MAX_AGE_HOURS = 48; // only the day's real news — never stale filler

// promotional / non-news filler that real outlets mix into their feeds
const PROMO_RE = /\b(summit|register|signup|sign ?up|discount|ticket|coupon|sponsor|webinar|last chance|days? left|save \$?\d|small talk|newsletter|podcast|deals?|roundup|week in \w+)/i;

const decodeEntities = (text: string): string => text
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const stripTags = (html: string): string => decodeEntities(html.replace(/<[^>]*>/g, ' '))
  .replace(/\s+/g, ' ').trim();

function firstMatch(block: string, pattern: RegExp): string {
  const match = block.match(pattern);
  return match ? decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : '';
}

function extractLink(block: string): string {
  // RSS: <link>url</link> — Atom: <link rel="alternate" href="..."/> (rel optional)
  const rss = firstMatch(block, /<link[^>]*>([\s\S]*?)<\/link>/);
  if (/^https?:\/\//.test(rss)) return rss;
  const atomMatches = block.matchAll(/<link\b([^>]*)>/g);
  for (const tag of atomMatches) {
    const attrs = tag[1];
    const href = (attrs.match(/href="([^"]+)"/) || [])[1] || '';
    if (/^https?:\/\//.test(href) && !/rel="(self|replies|enclosure|edit)"/.test(attrs)) return href;
  }
  return '';
}

function extractDate(block: string): string {
  const raw = firstMatch(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)
    || firstMatch(block, /<published[^>]*>([\s\S]*?)<\/published>/)
    || firstMatch(block, /<updated[^>]*>([\s\S]*?)<\/updated>/);
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

async function fetchFeed(feed: { name: string; url: string }): Promise<NewsItem[]> {
  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'SESEMI-NewsBot/1.0 (+https://sesemi.pages.dev)' },
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
      cf: { cacheTtl: 300 },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/g) || [];
    const items: NewsItem[] = [];
    for (const block of blocks) {
      const title = firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/);
      const url = extractLink(block);
      if (!title || !/^https?:\/\//.test(url)) continue;
      const description = stripTags(
        firstMatch(block, /<description[^>]*>([\s\S]*?)<\/description>/)
        || firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/)
        || firstMatch(block, /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/),
      ).slice(0, 500);
      items.push({ id: url.split('#')[0], url, title: title.slice(0, 300), description, source: feed.name, publishedAt: extractDate(block) });
    }
    return items;
  } catch { return []; }
}

export async function collectItems(): Promise<NewsItem[]> {
  const settled = await Promise.all(FEEDS.map(fetchFeed));
  const byId = new Map<string, NewsItem>();
  const cutoff = Date.now() - MAX_AGE_HOURS * 3_600_000;
  for (const items of settled) for (const item of items) {
    // real daily news only: drop promotional filler and anything stale
    if (PROMO_RE.test(item.title)) continue;
    if (Date.parse(item.publishedAt) < cutoff) continue;
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 30);
}

export async function lastRefreshAt(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare(`SELECT value FROM blog_state WHERE key = 'last_refresh'`).first<{ value: string }>();
    return row ? Number(row.value) || 0 : 0;
  } catch { return 0; }
}

export async function listPosts(db: D1Database, limit = 24): Promise<BlogPost[]> {
  const rows = await db.prepare(
    `SELECT id, url, title_en, title_fa, summary_fa, published_at, source FROM blog_posts ORDER BY published_at DESC LIMIT ?1`,
  ).bind(limit).all<BlogPost>();
  return rows.results || [];
}

export async function refreshBlog(env: Env, opts: { force?: boolean; max?: number } = {}): Promise<{ ok: true; added: number; total: number; skipped: boolean } | { ok: false; error: string }> {
  const db = env.DB;
  const last = await lastRefreshAt(db);
  if (!opts.force && Date.now() - last < REFRESH_INTERVAL_MS) return { ok: true, added: 0, total: 0, skipped: true };

  // stamp the run first so concurrent visitors do not stampede the feeds
  await db.prepare(
    `INSERT INTO blog_state (key, value) VALUES ('last_refresh', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).bind(String(Date.now())).run();

  const items = await collectItems();
  if (!items.length) return { ok: false, error: 'feeds_unavailable' };

  // D1 cannot bind an IN() list dynamically — check existing ids in small chunks
  const existing = new Set<string>();
  for (let offset = 0; offset < items.length; offset += 12) {
    const slice = items.slice(offset, offset + 12);
    const placeholders = slice.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await db.prepare(`SELECT id FROM blog_posts WHERE id IN (${placeholders})`).bind(...slice.map(i => i.id)).all<{ id: string }>();
    for (const row of rows.results || []) existing.add(row.id);
  }

  const fresh = items.filter(item => !existing.has(item.id)).slice(0, Math.max(1, Math.min(opts.max ?? MAX_NEW_PER_RUN, MAX_NEW_PER_RUN)));
  // the site is English-only by design — stories are stored as published,
  // Persian fields stay empty (kept in the schema for future use)
  await Promise.all(fresh.map(async item => {
    await db.prepare(
      `INSERT OR IGNORE INTO blog_posts (id, url, title_en, title_fa, summary_fa, published_at, source) VALUES (?1, ?2, ?3, '', '', ?4, ?5)`,
    ).bind(item.id, item.url, item.title, item.publishedAt, item.source).run();
  }));

  await db.prepare(`DELETE FROM blog_posts WHERE published_at < ?1`).bind(
    new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString(),
  ).run();

  const count = await db.prepare(`SELECT COUNT(*) AS n FROM blog_posts`).first<{ n: number }>();
  return { ok: true, added: fresh.length, total: count?.n ?? 0, skipped: false };
}
