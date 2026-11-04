import { readFile, writeFile, mkdir } from 'node:fs/promises';

const services = JSON.parse(await readFile(new URL('../src/services.json', import.meta.url), 'utf8'));
const config = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));
const template = await readFile('dist/index.html', 'utf8');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let origin = '';
if (config.siteUrl) {
  const parsed = new URL(config.siteUrl);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('site.config.json siteUrl must be your production HTTPS origin, without a path or query.');
  origin = parsed.origin;
}
const pages = [
  { path: '/', title: config.title, description: config.description, body: `<h1>Built to work. Made to stand out.</h1><p>Distinctive websites. Cinematic AI advertising films. We turn ambitious ideas into digital experiences and brand stories people remember.</p><h2>Digital craft. Creative possibility.</h2>${services.map(s => `<section><h3><a href="/services/${s.slug}">${escape(s.title)}</a></h3><p>${escape(s.description)}</p></section>`).join('')}<h2>A clear path. Room for great ideas.</h2><p>Discover, shape, create and deliver. A collaborative route from idea to delivery.</p><h2>Small studio. A wider imagination.</h2><p>We bring web design and AI-powered creative production together. One place to build your digital presence and tell your brand’s next story.</p><a href="/start">Start your project</a>` },
  ...services.map(s => ({ path: `/services/${s.slug}`, title: `${s.title} | SESEMI`, description: s.description, service: s, body: `<nav aria-label="Breadcrumb"><a href="/">Studio</a> / <a href="/#services">Services</a> / ${escape(s.short)}</nav><h1>${escape(s.title)}</h1><p>${escape(s.description)}</p><h2>First the idea. Then the right tools.</h2><p>${escape(s.intro)}</p><h2>What we can create</h2><ul>${s.deliverables.map(d => `<li>${escape(d)}</li>`).join('')}</ul><h2>A good fit for</h2><p>${escape(s.fit)}</p><p>Final deliverables and revisions are agreed in your project scope.</p><a href="/start?service=${s.slug}">Start a simple brief</a>` })),
  { path: '/start', title: 'Start a Project | SESEMI', description: 'Start a website, AI advertising film or brand identity project with SESEMI. A simple brief, a clear creative direction.', body: '<h1>Let’s make something good.</h1><p>No long questionnaires. Just a name, a way to reach you and a little about what you want to create.</p><p>Enable JavaScript to use the project brief and see whether delivery is connected.</p>' },
  { path: '/blog', title: 'The AI Radar — Daily World AI News | SESEMI', description: 'Today’s most important world AI news — top stories from leading sources, refreshed automatically every day, each linking to the original article.', body: '<nav aria-label="Breadcrumb"><a href="/">Studio</a> / AI Radar</nav><h1>The AI Radar.</h1><p>What is happening in AI around the world — top stories from leading sources, collected automatically once a day. Every story links straight to the original article.</p><p>Enable JavaScript to load today’s AI stories.</p><a href="/start">Start your project</a>' },
  { path: '/account', title: 'My Space | SESEMI', description: 'Your personal space at SESEMI — the project briefs you sent and their live status. Optional Google sign-in.', noindex: true, body: '<h1>Your space.</h1><p>A personal corner of the studio: the briefs you send and their live status. Sign-in with Google is optional and completely separate from contacting the studio.</p><p>Enable JavaScript to open your space.</p>' },
  { path: '/privacy', title: 'Privacy Notice | SESEMI', description: 'How SESEMI handles enquiries, optional analytics and studio assistant conversations.', body: '<h1>Your privacy. A clear explanation.</h1><h2>Project enquiries</h2><p>Details are used to respond to your enquiry. In preview mode, nothing is sent.</p><h2>Optional analytics</h2><p>Analytics is off until an endpoint is configured and you opt in. No hidden identification of anonymous visitors.</p><h2>Studio guide</h2><p>Local guide mode uses predefined answers in page memory. Connected agent mode sends messages to the configured service. Avoid sensitive information.</p><p>Enable JavaScript to view the complete privacy notice and change preferences.</p>' },
  { path: '/admin', title: 'Owner Workspace | SESEMI', description: 'Private owner workspace. Server authorization required.', noindex: true, body: '<h1>Owner workspace</h1><p>Live access requires a server-verified owner session. Enable JavaScript to sign in.</p>' },
  { path: '/404', title: 'Page Not Found | SESEMI', description: 'Find your way back to the SESEMI studio.', noindex: true, body: '<h1>This page took a detour.</h1><a href="/">Back to the studio</a>' },
];
for (const page of pages) {
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(page.description)}">`)
    .replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${page.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escape(page.title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escape(page.description)}">`)
  const schema = page.service ? { '@context': 'https://schema.org', '@type': 'Service', name: page.service.title, description: page.description, serviceType: page.service.short, provider: { '@type': 'Organization', name: 'SESEMI', ...(origin ? { url: origin, logo: `${origin}/brand/sesemi-mark-512.png` } : {}) } } : { '@context': 'https://schema.org', '@type': 'Organization', name: 'SESEMI', description: config.description, ...(origin ? { url: origin, logo: `${origin}/brand/sesemi-mark-512.png` } : {}) };
  const head = `<style>html,body{background:#050a16;margin:0}</style>${!page.noindex ? `<script type="application/ld+json" id="site-schema">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>` : ''}${origin && !page.noindex ? `<link rel="canonical" href="${origin}${page.path}"><meta property="og:url" content="${origin}${page.path}"><meta property="og:image" content="${origin}/social-card.png"><meta name="twitter:image" content="${origin}/social-card.png">` : ''}<meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}">`;
  html = html.replace('</head>', `${head}</head>`);
  const folder = page.path === '/' ? 'dist' : `dist${page.path}`;
  await mkdir(folder, { recursive: true });
  await writeFile(`${folder}/index.html`, html);
  if (page.path === '/404') await writeFile('dist/404.html', html);
}
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
if (origin) await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.filter(p => !p.noindex).map(p => `<url><loc>${escape(origin + p.path)}</loc></url>`).join('')}</urlset>`);
console.log(`Generated ${pages.length} crawlable pages.${origin ? ' Canonicals and sitemap enabled.' : ' Set site.config.json siteUrl to enable canonicals and sitemap on your real domain.'}`);
