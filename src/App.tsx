import { lazy, Suspense, useEffect, useState } from 'react';
import services from './services.json';
import ServicePage from './Experience';
import Assistant, { QuickContact } from './Assistant';
import BlogPage, { NewsTeaser } from './Blog';
import AccountPage, { HeaderAuth } from './Account';
import Motion, { Words } from './Motion';
import { Icon, Ribbon } from './Visuals';
import Seo from './Seo';
import { AnalyticsConsent } from './analytics';
import Privacy from './Privacy';
import { watchTranslation } from './translate';
import VortexHero from './VortexHero';
import StarfieldBackdrop from './StarfieldBackdrop';
import StellarFooter from './StellarFooter';
import './cinematic.css';

const Admin = lazy(() => import('./Admin'));
const nav = [['Services', 'services'], ['Our process', 'process'], ['Office', 'office'], ['About the studio', 'about']];
const tools = ['React', 'Next.js', 'TypeScript', 'Figma', 'ChatGPT', 'Gemini', 'Claude', 'OpenAI', 'DeepSeek', 'Mistral', 'Runway', 'Kling'];
const steps = [
  ['Discover', 'Tell us what you want to make. We clarify the audience, goal and scope.'],
  ['Shape', 'Explore a focused direction, from interface concepts to storyboards.'],
  ['Create', 'We design, develop or edit, with clear checkpoints and room for feedback.'],
  ['Deliver', 'Receive your finished assets, website or film, ready for the next chapter.'],
];

export default function App() {
  const [menu, setMenu] = useState(false);
  const [light, setLight] = useState(() => {
    try { return localStorage.getItem('sesemi-theme') === 'light'; } catch { return false; }
  });
  const [hash, setHash] = useState(window.location.hash);
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const admin = path === '/admin' || path.startsWith('/admin/');
  useEffect(() => {
    try { localStorage.setItem('sesemi-theme', light ? 'light' : 'dark'); } catch { /* storage blocked */ }
  }, [light]);
  useEffect(() => { watchTranslation(); }, []);
  useEffect(() => {
    const update = () => { setHash(window.location.hash); setMenu(false); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        document.querySelector<HTMLButtonElement>('.menu-button')?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.header')) setMenu(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); };
  }, [menu]);
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    if (admin) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.06 });
    document.querySelectorAll('.section-heading, .service-card, .step, .about-copy, .contact-form-wrap, .detail-block, .tech-strip, .creative-banner, .creative-copy, .film-frame, .faq-list details, .faq-cta, .process-cta, .about-art, .about-seal, .code-window, .values, .detail-cta, .portfolio-item, .contact-copy, .news-card, .office-scene, .office-copy, .pricing-card, .pricing-menu').forEach(el => { el.classList.add('reveal'); observer.observe(el); });
    const move = (event: PointerEvent) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.service-card, .hero-art');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => { observer.disconnect(); document.removeEventListener('pointermove', move); };
  }, [admin, hash]);
  if (admin) return <><Seo path="/admin" /><Suspense fallback={<div className="admin-loading">Opening your workspace…</div>}><Admin /></Suspense></>;
  const home = path === '/';
  const service = services.find(s => path === `/services/${s.slug}`);
  return <div className={`app english cinematic ${light ? 'light' : ''}`} dir="ltr">
    <Seo path={path} /><Motion /><StarfieldBackdrop />
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="site-arrival" aria-hidden="true"><span>SESEMI<span>.</span></span><i /></div>
    <header className="header"><div className="container nav-wrap">
      <div className="brand-group"><a className="brand" href="/" translate="no" aria-label="SESEMI home"><Ribbon small /><span>SESEMI<span className="brand-dot">.</span></span></a><span className="brand-loc" translate="no">Yerevan, Armenia</span></div>
      <nav id="main-navigation" className={menu ? 'nav open' : 'nav'} aria-label="Main navigation">{nav.map(([label, id]) => <a key={id} href={`/#${id}`} onClick={() => setMenu(false)}>{label}</a>)}<a href="/blog" onClick={() => setMenu(false)}>AI Radar</a><a href="/#contact" onClick={() => setMenu(false)}>Get in touch</a></nav>
      <div className="nav-actions"><HeaderAuth /><button className="theme-button" onClick={() => setLight(!light)} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'} aria-pressed={light}><Icon name="sun" size={19} /></button><a className="button small" href="/#contact">Let’s create <Icon size={16} /></a><button className="menu-button" onClick={() => setMenu(!menu)} aria-controls="main-navigation" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu}><Icon name="menu" /></button></div>
    </div></header>
    <main id="main">
      {path === '/start' ? <QuickContact page /> : path === '/privacy' ? <Privacy /> : path === '/blog' ? <BlogPage /> : path === '/account' ? <AccountPage /> : service ? <ServicePage service={service} /> : !home ? <section className="container detail-page"><div className="eyebrow">404 / A LITTLE OFF THE MAP</div><h1>This page took a detour.</h1><p>Let’s get you back to something good.</p><a href="/" className="button">Back to the studio <Icon /></a></section> : <>
        <VortexHero />
        <section className="tech-strip full-bleed" aria-label="Our creative and development toolkit"><div className="toolkit-label"><span className="live-dot" /> OUR TOOLKIT, ALWAYS EVOLVING</div><div className="marquee-window"><div className="marquee-track">{[0, 1].map(copy => <div className="marquee-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>{tools.map((name, i) => <span className={`tech-name ${i > 3 ? 'ai-tool' : ''}`} key={name}><Icon name={i > 3 ? 'ai' : 'code'} size={18} />{name}</span>)}</div>)}</div></div><p className="tech-disclaimer">Tools we can work with. Names do not imply an official partnership or affiliation.</p></section>
        <section className="section container" id="services"><div className="section-heading"><div><div className="eyebrow section-kicker"><span /> WHAT WE DO</div><h2><Words>Digital craft.</Words><br /><span>Creative possibility.</span></h2></div><p>From your first impression to your next big launch.<br />A focused set of services, built around your brand.</p></div>
          <div className="services-grid">{services.map((s, i) => <a href={`/services/${s.slug}`} className={`service-card ${i === 0 || i === 1 ? 'featured' : ''} ${i === 1 ? 'film-card' : ''}`} key={s.slug}><div className="service-top"><span className="service-icon"><Icon name={s.icon} size={27} /></span><span className="card-number">0{i + 1}</span></div><h3><Words>{s.title}</Words></h3><p>{s.description}</p><div className="service-bottom"><span>{s.category}</span><span className="round-arrow"><Icon size={18} /></span></div></a>)}</div>
        </section>
        <section className="creative-banner container" id="creative-lab"><div className="film-frame" aria-hidden="true"><div className="film-grain" /><span className="frame-time">EXPERIMENT 001 / SESEMI CREATIVE LAB</span><img className="lab-star" src="/brand/sesemi-star.webp" alt="" loading="lazy" /><div className="lab-rings" /><span className="film-type">A different<br /><em>dimension.</em></span><span className="frame-corner">IDENTITY IN MOTION / CONCEPT STUDY</span></div><div className="creative-copy"><div className="eyebrow section-kicker"><span /> BRAND STORIES, REIMAGINED</div><h2>Give your brand<br /><span>its cinematic moment.</span></h2><p>From a single product to an entire brand world. We combine creative direction, AI-generated visuals and purposeful editing to make advertising teasers with a point of view.</p><a className="button secondary" href="/services/ai-advertising-videos">Explore AI advertising films <Icon size={18} /></a><small>Conceptual studio artwork — not a client campaign.</small></div></section>
        <section className="section container process-section" id="process"><div className="section-heading"><div><div className="eyebrow section-kicker"><span /> LESS FRICTION. MORE MOMENTUM.</div><h2>A clear path.<br /><span>Room for great ideas.</span></h2></div><p>No mystery process. No endless forms.<br />Just a collaborative route from idea to delivery.</p></div><div className="steps">{steps.map(([title, text], i) => <div className="step" key={title}><div className="step-track"><span>0{i + 1}</span><div /></div><h3><Words>{title}</Words></h3><p>{text}</p><span className="step-english">{['GET ALIGNED', 'FIND THE DIRECTION', 'BRING IT TO LIFE', 'MAKE IT YOURS'][i]}</span></div>)}</div><div className="process-cta"><span>Have something in mind?</span><a className="button small" href="#contact">Start your project <Icon size={16} /></a></div></section>
        <section className="office-section container" id="office" aria-labelledby="office-heading">
          <div className="office-scene" aria-hidden="true"><span className="office-chip">LIVE OFFICE / AGENTS ON DUTY</span>
            <svg className="office-iso" viewBox="0 0 520 320" focusable="false">
              <polygon points="260,55 489,169.5 260,284 31,169.5" fill="#0a1526" stroke="#2b4a6d" strokeWidth="1" />
              <g stroke="#223d5c" strokeWidth="1" opacity="0.55">
                <line x1="298.2" y1="74.1" x2="69.2" y2="188.6" /><line x1="336.3" y1="93.2" x2="107.3" y2="207.7" /><line x1="374.5" y1="112.3" x2="145.5" y2="226.8" /><line x1="412.7" y1="131.3" x2="183.7" y2="245.8" /><line x1="450.8" y1="150.4" x2="221.8" y2="264.9" />
                <line x1="221.8" y1="74.1" x2="450.8" y2="188.6" /><line x1="183.7" y1="93.2" x2="412.7" y2="207.7" /><line x1="145.5" y1="112.3" x2="374.5" y2="226.8" /><line x1="107.3" y1="131.3" x2="336.3" y2="245.8" /><line x1="69.2" y1="150.4" x2="298.2" y2="264.9" />
              </g>
              <polygon points="170,160 215,186 215,164 170,138" fill="#0e1c31" stroke="#2b4a6d" /><polygon points="170,160 125,186 125,164 170,138" fill="#12233b" stroke="#2b4a6d" /><polygon points="170,138 215,164 170,190 125,164" fill="#61e7ff1a" stroke="#61e7ff66" />
              <polygon points="430,150 475,176 475,120 430,94" fill="#0e1c31" stroke="#2b4a6d" /><polygon points="430,150 385,176 385,120 430,94" fill="#12233b" stroke="#2b4a6d" /><polygon points="430,94 475,120 430,146 385,120" fill="#8b5cff22" stroke="#9b7fe0" />
              <polygon points="330,150 375,176 375,136 330,110" fill="#0e1c31" stroke="#2b4a6d" /><polygon points="330,150 285,176 285,136 330,110" fill="#12233b" stroke="#2b4a6d" /><polygon points="330,110 375,136 330,162 285,136" fill="#48b9ff1f" stroke="#5ba9e6" />
              <polygon points="250,200 295,226 295,208 250,182" fill="#0e1c31" stroke="#2b4a6d" /><polygon points="250,200 205,226 205,208 250,182" fill="#12233b" stroke="#2b4a6d" /><polygon points="250,182 295,208 250,234 205,208" fill="#48b9ff14" stroke="#2b4a6d" />
              <polygon points="241,203 262,214 262,186 241,175" fill="#0a1424" stroke="#48b9ff" strokeWidth="1.2" /><polygon points="245,180 258,187 258,200 245,193" fill="#48b9ff26" />
              <polyline points="450,180 405,206 360,232 315,258 270,284" fill="none" stroke="#48b9ff55" strokeWidth="1.5" strokeDasharray="4 6" />
              <g stroke="#9fd8ff" strokeWidth="2" strokeLinecap="round" fill="none">
                <g><circle cx="405" cy="183" r="3.5" fill="#9fd8ff" stroke="none" /><line x1="405" y1="187" x2="405" y2="199" /><line x1="405" y1="199" x2="401" y2="206" /><line x1="405" y1="199" x2="409" y2="206" /></g>
                <g><circle cx="315" cy="235" r="3.5" fill="#9fd8ff" stroke="none" /><line x1="315" y1="239" x2="315" y2="251" /><line x1="315" y1="251" x2="311" y2="258" /><line x1="315" y1="251" x2="319" y2="258" /></g>
                <g><circle cx="285" cy="222" r="3.5" fill="#9fd8ff" stroke="none" /><line x1="285" y1="226" x2="285" y2="238" /><line x1="285" y1="238" x2="281" y2="245" /><line x1="285" y1="238" x2="289" y2="245" /></g>
              </g>
              <circle cx="350" cy="240" r="2" fill="#61e7ff66" /><circle cx="200" cy="240" r="2" fill="#48b9ff44" /><circle cx="450" cy="230" r="2" fill="#bd70ff44" />
              <line x1="292" y1="95" x2="330" y2="110" stroke="#48b9ff66" strokeWidth="1" strokeDasharray="3 4" />
              <rect x="196" y="84" width="96" height="22" rx="11" fill="#0d1a2d" stroke="#2b4a6d" />
              <text x="244" y="98" textAnchor="middle" fontSize="7.5" fontFamily="monospace" letterSpacing="1" fill="#9fd8ff">TASK 042 ✓</text>
            </svg>
            <span className="office-corner">SESEMI OFFICE / SHIFT 001</span>
          </div>
          <div className="office-copy">
            <div className="eyebrow section-kicker"><span /> WALK INTO SESEMI OFFICE</div>
            <h2 id="office-heading">An isometric office.<br /><span>A team that delivers.</span></h2>
            <p>Step into our live AI office. Hand a task to a team of AI agents working at their isometric desks — they take the brief, head off to work and come back with it actually done.</p>
            <a className="button office-cta" href="https://sesemi-office.pages.dev" target="_blank" rel="noopener noreferrer" aria-label="Open the SESEMI Office at sesemi-office.pages.dev">Visit sesemi-office.pages.dev <Icon size={18} /></a>
            <small>SESEMI Office is a live space — agents keep learning between shifts.</small>
          </div>
        </section>
        <section className="section container pricing-section" id="pricing" aria-labelledby="pricing-heading">
          <div className="section-heading"><div>
            <div className="eyebrow section-kicker"><span /> SIMPLE PRICING</div>
            <h2 id="pricing-heading">Run an AI office.<br /><span>Priced like a menu.</span></h2>
          </div>
            <p>Subscribe to SESEMI Office — the live AI-agent workspace — or order studio services à la carte.</p>
          </div>
          <div className="pricing-grid">
            <div className="pricing-card">
              <h3>Demo</h3>
              <span className="price">$0<small>/forever</small></span>
              <ul>
                <li>Watch the live AI office work</li>
                <li>Demo agents, unlimited missions</li>
                <li>Telegram mission alerts</li>
              </ul>
              <a className="button secondary" href="https://sesemi-office.pages.dev" target="_blank" rel="noopener noreferrer">Open the office</a>
            </div>
            <div className="pricing-card featured">
              <span className="pricing-tag">MOST POPULAR</span>
              <h3>Pro</h3>
              <span className="price">$19<small>/month</small></span>
              <ul>
                <li>Real AI agents on your own key</li>
                <li>Unlimited missions with auto-delegation</li>
                <li>Delivery reports to Telegram</li>
                <li>The office grows with every delivery</li>
              </ul>
              <a className="button" href="#contact">Start with Pro</a>
            </div>
            <div className="pricing-card">
              <h3>Business</h3>
              <span className="price">$49<small>/month</small></span>
              <ul>
                <li>Everything in Pro</li>
                <li>Custom agents and roles</li>
                <li>Client-facing mission board</li>
                <li>Priority support on Telegram</li>
              </ul>
              <a className="button secondary" href="#contact">Talk to us</a>
            </div>
          </div>
          <div className="pricing-menu">
            <h3>Studio services — à la carte</h3>
            {[['Landing page', 'from $290'], ['Brand identity', 'from $250'], ['AI advertising film', 'from $390'], ['UI/UX design', 'from $450'], ['Monthly content pack', '$120/mo'], ['AI workflows & automation', 'from $200']].map(([s, p]) =>
              <div className="menu-row" key={s}><span>{s}</span><i /><b>{p}</b></div>)}
          </div>
        </section>
        <section className="about-section container" id="about"><div className="about-art"><div className="about-grid" /><span className="about-top-label">THE MINDSET BEHIND THE WORK</span><div className="code-window"><div className="window-dots"><i /><i /><i /><span>sesemi / studio-dna.ts</span></div><pre><span className="code-purple">const</span> studio = {'{'}<br />  thinking: <span className="code-green">'brand-first'</span>,<br />  design: <span className="code-green">'with intention'</span>,<br />  technology: <span className="code-green">'a creative tool'</span>,<br />  partnership: <span className="code-green">'built on clarity'</span><br />{'}'};<br /><br /><span className="code-comment">// Thoughtful work. Real possibilities.</span><br /><span className="code-purple">export default</span> studio;</pre></div><div className="about-seal"><Icon name="design" size={27} /><span>Human ideas.<br /><strong>Extraordinary possibilities.</strong></span></div></div><div className="about-copy"><div className="eyebrow section-kicker"><span /> HELLO, WE’RE SESEMI</div><h2>Small studio.<br /><span>A wider imagination.</span></h2><p>We bring web design and AI-powered creative production together. One place to build your digital presence and tell your brand’s next story.</p><p>Technology is our toolkit, not our identity. Good judgment, a strong visual point of view and honest collaboration are what make the work matter.</p><div className="values">{[['Clarity from day one', 'A focused brief, agreed deliverables and visible progress.'], ['A human creative perspective', 'AI supports the craft. It does not replace the idea.'], ['Made for your brand', 'Intentional work, not another template.']].map(([title, text]) => <div key={title}><span><Icon name="check" size={17} /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><a className="quiet-link about-cta" href="#contact">Start the conversation <Icon size={15} /></a></div></section>
        <section className="container section faq-section"><div><div className="eyebrow section-kicker"><span /> GOOD QUESTIONS</div><h2>A little clarity<br /><span>before we begin.</span></h2></div><div className="faq-list">{[['What can you help my brand create?', 'Custom websites, UI/UX design, AI advertising films, AI-assisted video editing, logos and visual identities, and creative prompt workflows.'], ['Do I need a finished brief?', 'Not at all. A short description of your goal is enough to start. We can help clarify the scope and creative direction together.'], ['How much does a project cost?', 'Pricing depends on deliverables, complexity and timeline. We agree the scope before providing a project-specific quote.'], ['Can you create videos for social platforms?', 'Yes. We can plan AI advertising teasers and edited content around the aspect ratios, length and creative requirements of your chosen channels.']].map(([q, a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div><button className="quiet-link faq-cta" onClick={() => window.dispatchEvent(new Event('sesemi:chat'))}>Still curious? Ask Sesemi <span>↗</span></button></section>
        <NewsTeaser />
        <QuickContact />
      </>}
    </main>
    <Assistant /><AnalyticsConsent />
    <StellarFooter />
  </div>;
}
