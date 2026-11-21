import { useEffect, useState } from 'react';
import { t } from './i18n';
import { Icon } from './Visuals';
import { Words } from './Motion';

export interface BlogPost { id: string; url: string; title_en: string; published_at: string; source: string; image_url?: string }

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Every card carries art: the feed image when the publisher ships one and it
 *  loads; otherwise the generated SVG art endpoint draws a unique, brand-styled
 *  piece per article (server-deterministic, no external requests). */
function NewsCard({ post }: { post: BlogPost }) {
  const [stage, setStage] = useState<'feed' | 'art' | 'grad'>(post.image_url ? 'feed' : 'art');
  const slug = post.source.toLowerCase().replace(/[^a-z]+/g, '-');
  const artUrl = `/api/blog/art?id=${encodeURIComponent(post.id)}&t=${encodeURIComponent(post.title_en)}&s=${encodeURIComponent(post.source)}&v=2`;
  const src = stage === 'feed' ? post.image_url : artUrl;
  return <a className="news-card" href={post.url} target="_blank" rel="noopener noreferrer">
    <span className={`news-media ${stage === 'grad' ? `news-media-fallback src-${slug}` : ''}`} aria-hidden="true">
      {stage !== 'grad' && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer"
        onError={() => setStage(stage === 'feed' ? 'art' : 'grad')} />}
      {stage === 'grad' && <span className="news-media-glyph">{post.source.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}</span>}
    </span>
    <div className="news-top"><span className="news-source">{post.source}</span><span className="news-date">{formatStamp(post.published_at)}</span></div>
    <h3 className="news-title">{post.title_en}</h3>
    <span className="news-arrow"><Icon size={15} /></span>
  </a>;
}

function usePosts() {
  const [state, setState] = useState<{ posts: BlogPost[] | null; failed: boolean }>({ posts: null, failed: false });
  useEffect(() => {
    let alive = true;
    fetch('/api/blog/posts')
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((data: { posts?: BlogPost[] }) => { if (alive) setState({ posts: Array.isArray(data.posts) ? data.posts : [], failed: false }); })
      .catch(() => { if (alive) setState({ posts: [], failed: true }); });
    return () => { alive = false; };
  }, []);
  return state;
}

function NewsSkeleton() {
  return <div className="news-grid" aria-hidden="true">{[0, 1, 2].map(i => <div className="news-card news-loading" key={i}><span className="news-pulse" /><span className="news-pulse wide" /><span className="news-pulse" /></div>)}</div>;
}

export function NewsTeaser() {
  const { posts, failed } = usePosts();
  return <section className="section container news-section" id="ai-radar">
    <div className="section-heading">
      <div><div className="eyebrow section-kicker"><span /> TODAY IN WORLD AI — UPDATED EVERY DAY</div>
        <h2><Words>{t('teaser.kicker')}</Words><br /><span>{t('teaser.h')}</span></h2></div>
      <p>{t('teaser.p')}</p>
    </div>
    {posts === null ? <NewsSkeleton /> : posts.length
      ? <div className="news-grid">{posts.slice(0, 3).map(post => <NewsCard post={post} key={post.id} />)}</div>
      : <p className="news-empty">{failed ? 'The news feed could not be reached. ' : 'The first daily update is being collected. '}<a href="/blog">{t('teaser.cta')}</a></p>}
    <div className="news-cta"><a className="button small" href="/blog">{t('teaser.cta')} <Icon size={15} /></a></div>
  </section>;
}

export default function BlogPage() {
  const { posts, failed } = usePosts();
  const updated = posts?.length ? formatStamp(posts[0].published_at) : '';
  return <article className="container detail-page blog-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/">Studio</a><span>/</span><span>AI Radar</span></nav>
    <div className="detail-heading">
      <div className="eyebrow section-kicker"><span /> WORLD AI NEWS · AUTO-REFRESHED DAILY</div>
      <h1>The AI Radar<span className="title-period">.</span></h1>
      <p>What is happening in AI around the world — top stories from leading sources, collected automatically once a day. Every story links straight to the original article.</p>
      {updated && <p className="news-updated">Latest story: {updated}</p>}
    </div>
    {posts === null ? <NewsSkeleton />
      : posts.length
        ? <div className="news-grid news-grid-page">{posts.map(post => <NewsCard post={post} key={post.id} />)}</div>
        : <p className="news-empty">{failed ? 'The news feed could not be reached right now — please try again in a few minutes.' : 'The first daily update is being collected right now — refresh in a minute.'}</p>}
    <p className="news-note">Sources: TechCrunch AI · The Verge AI · VentureBeat AI · AI News · Ars Technica · MIT Tech Review · The Guardian — every story links straight to the original article on the publisher’s own site.</p>
  </article>;
}
