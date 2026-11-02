import { useEffect } from 'react';
import services from './services.json';
import config from '../site.config.json';

export default function Seo({ path }: { path: string }) {
  useEffect(() => {
    const service = services.find(s => path === `/services/${s.slug}`);
    const privatePage = path.startsWith('/admin') || path === '/account';
    const known = ['/', '/start', '/privacy', '/blog'].includes(path) || !!service;
    const title = privatePage ? (path === '/account' ? 'My Space | SESEMI' : 'Owner Workspace | SESEMI') : service ? `${service.title} | SESEMI` : path === '/start' ? 'Start a Project | SESEMI' : path === '/privacy' ? 'Privacy Notice | SESEMI' : path === '/blog' ? 'The AI Radar — Daily World AI News | SESEMI' : known ? config.title : 'Page Not Found | SESEMI';
    const description = service?.description || (path === '/start' ? 'Start a website, AI advertising film or brand identity project with SESEMI. A simple brief, a clear creative direction.' : path === '/privacy' ? 'How SESEMI handles project enquiries, optional analytics and studio assistant conversations.' : path === '/blog' ? 'Today’s most important world AI news — top stories from leading sources, refreshed automatically every day, each linking to the original article.' : path === '/account' ? 'Your personal space at SESEMI — the project briefs you sent and their live status. Optional Google sign-in.' : config.description);
    document.title = title;
    const meta = (name: string, content: string, property = false) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${property ? 'property' : 'name'}="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute(property ? 'property' : 'name', name); document.head.append(el); }
      el.content = content;
    };
    meta('description', description); meta('robots', privatePage || !known ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    meta('og:title', title, true); meta('og:description', description, true); meta('og:type', 'website', true); meta('og:site_name', 'SESEMI', true); meta('og:locale', 'en_US', true); meta('twitter:card', 'summary_large_image'); meta('twitter:title', title); meta('twitter:description', description);
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
    const url = /^https?:\/\//.test(config.siteUrl) ? config.siteUrl.replace(/\/$/, '') : '';
    if (url && known && !privatePage) {
      const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = `${url}${path}`; document.head.append(canonical);
      meta('og:url', `${url}${path}`, true); meta('og:image', `${url}/social-card.png`, true); meta('twitter:image', `${url}/social-card.png`);
    }
    let schema = document.getElementById('site-schema') as HTMLScriptElement | null;
    if (!schema) { schema = document.createElement('script'); schema.type = 'application/ld+json'; schema.id = 'site-schema'; document.head.append(schema); }
    schema.textContent = privatePage || !known ? '{}' : JSON.stringify(service ? { '@context': 'https://schema.org', '@type': 'Service', name: service.title, description: service.description, serviceType: service.short, provider: { '@type': 'Organization', name: 'SESEMI', ...(url ? { url } : {}) }, ...(url ? { url: `${url}${path}` } : {}) } : { '@context': 'https://schema.org', '@type': 'Organization', name: 'SESEMI', description: config.description, knowsAbout: services.map(s => s.title), ...(url ? { url, logo: `${url}/brand/sesemi-mark.png` } : {}) });
  }, [path]);
  return null;
}
