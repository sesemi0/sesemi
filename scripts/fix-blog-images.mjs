// One-off backfill: HEAD-validate every stored blog image; dead URLs -> ''.
// Run: node scripts/fix-blog-images.mjs
import { execSync } from 'node:child_process';

const out = execSync('npx wrangler d1 execute sesemi --remote --command "SELECT id, image_url FROM blog_posts WHERE image_url != \'\'" --json', { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const parsed = JSON.parse(out.slice(out.indexOf('[')));
const rows = parsed[0].results || [];
console.log(`checking ${rows.length} stored image URLs…`);

const dead = [];
const alive = [];
const workers = 8;
let index = 0;
async function worker() {
  while (index < rows.length) {
    const row = rows[index++];
    try {
      const res = await fetch(row.image_url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SESEMI-NewsBot/1.0' },
      });
      if (!res.ok) { dead.push(row.id); console.log(`DEAD ${res.status} ${row.image_url.slice(0, 70)}`); }
      else alive.push(row.id);
    } catch { dead.push(row.id); console.log(`DEAD timeout ${row.image_url.slice(0, 70)}`); }
  }
}
await Promise.all(Array.from({ length: workers }, worker));
console.log(`alive=${alive.length} dead=${dead.length}`);

for (let i = 0; i < dead.length; i += 20) {
  const slice = dead.slice(i, i + 20);
  const placeholders = slice.map((_, j) => `'${String.raw`${v => v}`}'`);
  void placeholders;
  // d1 execute --command with quoted ids: ids are UUID-ish (safe chars only)
  const list = slice.map(id => `'${id.replace(/[^A-Za-z0-9-]/g, '')}'`).join(', ');
  const sql = `UPDATE blog_posts SET image_url = '' WHERE id IN (${list})`;
  execSync(`npx wrangler d1 execute sesemi --remote --command "${sql}" --json`, { stdio: 'pipe' });
}
console.log('backfill complete');
