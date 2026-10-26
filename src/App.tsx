import { lazy, Suspense, useEffect, useState } from 'react';
import services from './services.json';
import ServicePage from './Experience';
import Assistant, { QuickContact } from './Assistant';
import Motion, { Words } from './Motion';
import { Icon, Ribbon } from './Visuals';
import Seo from './Seo';
import { AnalyticsConsent } from './analytics';
import Privacy from './Privacy';
import CinematicHero from './CinematicHero';
import './cinematic.css';

const Admin = lazy(() => import('./Admin'));
const nav = [['Services', 'services'], ['Our process', 'process'], ['About the studio', 'about']];
const tools = ['React', 'Next.js', 'TypeScript', 'Figma', 'ChatGPT', 'Gemini', 'Claude', 'OpenAI', 'DeepSeek', 'Mistral', 'Runway', 'Kling'];
const steps = [
  ['Discover', 'Tell us what you want to make. We clarify the audience, goal and scope.'],
  ['Shape', 'Explore a focused direction, from interface concepts to storyboards.'],
  ['Create', 'We design, develop or edit, with clear checkpoints and room for feedback.'],
  ['Deliver', 'Receive your finished assets, website or film, ready for the next chapter.'],
];

export default function App() {
  const [menu, setMenu] = useState(false);
  const [light, setLight] = useState(false);
  const [hash, setHash] = useState(window.location.hash);
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const admin = path === '/admin' || path.startsWith('/admin/');
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
    document.querySelectorAll('.section-heading, .service-card, .step, .about-copy, .contact-form-wrap, .detail-block').forEach(el => { el.classList.add('reveal'); observer.observe(el); });
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
    <Seo path={path} /><Motion />
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="site-arrival" aria-hidden="true"><span>SESEMI<span>.</span></span><i /></div>
    <header className="header"><div className="container nav-wrap">
      <a className="brand" href="/" aria-label="SESEMI home"><Ribbon small /><span>SESEMI<span className="brand-dot">.</span></span></a>
      <nav id="main-navigation" className={menu ? 'nav open' : 'nav'} aria-label="Main navigation">{nav.map(([label, id]) => <a key={id} href={`/#${id}`} onClick={() => setMenu(false)}>{label}</a>)}<a href="/#contact" onClick={() => setMenu(false)}>Get in touch</a></nav>
      <div className="nav-actions"><button className="theme-button" onClick={() => setLight(!light)} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'} aria-pressed={light}><Icon name="sun" size={19} /></button><a className="button small" href="/#contact">Let’s create <Icon size={16} /></a><button className="menu-button" onClick={() => setMenu(!menu)} aria-controls="main-navigation" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu}><Icon name="menu" /></button></div>
    </div></header>
    <main id="main">
      {path === '/start' ? <QuickContact page /> : path === '/privacy' ? <Privacy /> : service ? <ServicePage service={service} /> : !home ? <section className="container detail-page"><div className="eyebrow">404 / A LITTLE OFF THE MAP</div><h1>This page took a detour.</h1><p>Let’s get you back to something good.</p><a href="/" className="button">Back to the studio <Icon /></a></section> : <>
        <section className="hero" id="home">
          <CinematicHero />
          <div className="hero-vignette" aria-hidden="true" />
          <div className="hero-layout container">
          <div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> INDEPENDENT DIGITAL & CREATIVE STUDIO</div>
            <h1><Words>Built to work.</Words><br /><span><Words>Made to stand out.</Words></span></h1>
            <p className="hero-description">Distinctive websites. Cinematic AI advertising films. We turn ambitious ideas into digital experiences and brand stories people remember.</p>
            <div className="hero-buttons"><a className="button" href="#contact">Start your project <Icon size={19} /></a><a className="button secondary" href="#about">Meet Sesemi <Icon size={18} /></a></div>
            <div className="ownership"><Icon name="check" size={17} /> Clear scope. Thoughtful craft. A simple way to start.</div>
          </div>
          <div className="scene-caption"><span className="scene-caption-index">01 / SESEMI IN ANOTHER DIMENSION</span><span>HUMAN IMAGINATION. NEW POSSIBILITIES.</span></div>
          <div className="hero-bottom"><a className="scroll-cue" href="#services"><span>↓</span> Scroll to explore</a><span>STRATEGY <i /> DESIGN <i /> MOTION <i /> AI</span><span className="pointer-note">MOVE YOUR CURSOR. CHANGE YOUR PERSPECTIVE. <Icon name="design" size={14} /></span></div>
          </div>
        </section>
        <section className="tech-strip full-bleed" aria-label="Our creative and development toolkit"><div className="toolkit-label"><span className="live-dot" /> OUR TOOLKIT, ALWAYS EVOLVING</div><div className="marquee-window"><div className="marquee-track">{[0, 1].map(copy => <div className="marquee-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>{tools.map((name, i) => <span className={`tech-name ${i > 3 ? 'ai-tool' : ''}`} key={name}><Icon name={i > 3 ? 'ai' : 'code'} size={18} />{name}</span>)}</div>)}</div></div><p className="tech-disclaimer">Tools we can work with. Names do not imply an official partnership or affiliation.</p></section>
        <section className="section container" id="services"><div className="section-heading"><div><div className="eyebrow section-kicker"><span /> WHAT WE DO</div><h2><Words>Digital craft.</Words><br /><span>Creative possibility.</span></h2></div><p>From your first impression to your next big launch.<br />A focused set of services, built around your brand.</p></div>
          <div className="services-grid">{services.map((s, i) => <a href={`/services/${s.slug}`} className={`service-card ${i === 0 || i === 1 ? 'featured' : ''} ${i === 1 ? 'film-card' : ''}`} key={s.slug}><div className="service-top"><span className="service-icon"><Icon name={s.icon} size={27} /></span><span className="card-number">0{i + 1}</span></div><h3><Words>{s.title}</Words></h3><p>{s.description}</p><div className="service-bottom"><span>{s.category}</span><span className="round-arrow"><Icon size={18} /></span></div></a>)}</div>
        </section>
        <section className="creative-banner container" id="creative-lab"><div className="film-frame" aria-hidden="true"><div className="film-grain" /><span className="frame-time">EXPERIMENT 001 / SESEMI CREATIVE LAB</span><img className="lab-star" src="/brand/sesemi-star.webp" alt="" loading="lazy" /><div className="lab-rings" /><span className="film-type">A different<br /><em>dimension.</em></span><span className="frame-corner">IDENTITY IN MOTION / CONCEPT STUDY</span></div><div className="creative-copy"><div className="eyebrow section-kicker"><span /> BRAND STORIES, REIMAGINED</div><h2>Give your brand<br /><span>its cinematic moment.</span></h2><p>From a single product to an entire brand world. We combine creative direction, AI-generated visuals and purposeful editing to make advertising teasers with a point of view.</p><a className="button secondary" href="/services/ai-advertising-videos">Explore AI advertising films <Icon size={18} /></a><small>Conceptual studio artwork — not a client campaign.</small></div></section>
        <section className="section container process-section" id="process"><div className="section-heading"><div><div className="eyebrow section-kicker"><span /> LESS FRICTION. MORE MOMENTUM.</div><h2>A clear path.<br /><span>Room for great ideas.</span></h2></div><p>No mystery process. No endless forms.<br />Just a collaborative route from idea to delivery.</p></div><div className="steps">{steps.map(([title, text], i) => <div className="step" key={title}><div className="step-track"><span>0{i + 1}</span><div /></div><h3><Words>{title}</Words></h3><p>{text}</p><span className="step-english">{['GET ALIGNED', 'FIND THE DIRECTION', 'BRING IT TO LIFE', 'MAKE IT YOURS'][i]}</span></div>)}</div></section>
        <section className="about-section container" id="about"><div className="about-art"><div className="about-grid" /><span className="about-top-label">THE MINDSET BEHIND THE WORK</span><div className="code-window"><div className="window-dots"><i /><i /><i /><span>sesemi / studio-dna.ts</span></div><pre><span className="code-purple">const</span> studio = {'{'}<br />  thinking: <span className="code-green">'brand-first'</span>,<br />  design: <span className="code-green">'with intention'</span>,<br />  technology: <span className="code-green">'a creative tool'</span>,<br />  partnership: <span className="code-green">'built on clarity'</span><br />{'}'};<br /><br /><span className="code-comment">// Thoughtful work. Real possibilities.</span><br /><span className="code-purple">export default</span> studio;</pre></div><div className="about-seal"><Icon name="design" size={27} /><span>Human ideas.<br /><strong>Extraordinary possibilities.</strong></span></div></div><div className="about-copy"><div className="eyebrow section-kicker"><span /> HELLO, WE’RE SESEMI</div><h2>Small studio.<br /><span>A wider imagination.</span></h2><p>We bring web design and AI-powered creative production together. One place to build your digital presence and tell your brand’s next story.</p><p>Technology is our toolkit, not our identity. Good judgment, a strong visual point of view and honest collaboration are what make the work matter.</p><div className="values">{[['Clarity from day one', 'A focused brief, agreed deliverables and visible progress.'], ['A human creative perspective', 'AI supports the craft. It does not replace the idea.'], ['Made for your brand', 'Intentional work, not another template.']].map(([title, text]) => <div key={title}><span><Icon name="check" size={17} /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></div></section>
        <section className="container section faq-section"><div><div className="eyebrow section-kicker"><span /> GOOD QUESTIONS</div><h2>A little clarity<br /><span>before we begin.</span></h2></div><div className="faq-list">{[['What can you help my brand create?', 'Custom websites, UI/UX design, AI advertising films, AI-assisted video editing, logos and visual identities, and creative prompt workflows.'], ['Do I need a finished brief?', 'Not at all. A short description of your goal is enough to start. We can help clarify the scope and creative direction together.'], ['How much does a project cost?', 'Pricing depends on deliverables, complexity and timeline. We agree the scope before providing a project-specific quote.'], ['Can you create videos for social platforms?', 'Yes. We can plan AI advertising teasers and edited content around the aspect ratios, length and creative requirements of your chosen channels.']].map(([q, a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
        <QuickContact />
      </>}
    </main>
    <Assistant /><AnalyticsConsent />
    <footer><div className="container footer-main"><div><a href="/" className="brand"><Ribbon small /><span>SESEMI<span className="brand-dot">.</span></span></a><p>Digital experiences. Brand stories. New possibilities.</p></div><div className="footer-links">{nav.map(([label, id]) => <a key={id} href={`/#${id}`}>{label}</a>)}</div><button className="footer-chat" onClick={() => window.dispatchEvent(new Event('sesemi:chat'))}>Say hello to Sesi <Icon name="ai" size={18} /></button></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} SESEMI. All rights reserved.</span><div className="footer-legal"><a href="/privacy">Privacy</a><button onClick={() => window.dispatchEvent(new Event('sesemi:privacy'))}>Cookie preferences</button></div><a href="#main">Back to top ↑</a></div></footer>
  </div>;
}
