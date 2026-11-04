import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Visuals';
import './stellar-footer.css';

/**
 * The SESEMI storyboard footer, drawn from the studio's own galaxy: the
 * wordmark stamps itself down letter by letter, brand sparkles take their
 * seats on the letters, little cosmic doodles drift past the pointer, and the
 * tagline and calls to action arrive word by word — all when the footer first
 * scrolls into view. Inspired by hand-stamped sketchbook endings, executed in
 * the studio's cinematic palette.
 */

const WORDMARK = 'SESEMI';
const TAGLINE = 'Digital experiences. Brand stories. New possibilities.';

type Seat = 'front' | 'top' | 'behind';
type CrewStar = { letter: number; seat: Seat; offset: number; color: string; size: number; says: string };
const CREW: CrewStar[] = [
  { letter: 0, seat: 'front', offset: -0.22, color: '#61e7ff', size: 30, says: 'Ready when you are.' },
  { letter: 1, seat: 'top', offset: 0.08, color: '#c9b1ff', size: 25, says: 'Ideas live up here.' },
  { letter: 3, seat: 'top', offset: -0.06, color: '#9fdcff', size: 19, says: 'Fresh perspective.' },
  { letter: 5, seat: 'behind', offset: 0.05, color: '#8b5cff', size: 34, says: 'See you at the top.' },
];

type DoodleKind = 'sparkle' | 'planet' | 'bolt' | 'moon' | 'dot';
const DOODLE_CYCLE: DoodleKind[] = ['sparkle', 'planet', 'sparkle', 'bolt', 'moon', 'sparkle', 'dot', 'planet', 'sparkle', 'moon'];
const DOODLE_COLORS = ['#48b9ff', '#8b5cff', '#61e7ff', '#c9b1ff', '#dff0ff'];

function DoodleArt({ kind, color }: { kind: DoodleKind; color: string }) {
  switch (kind) {
    case 'sparkle':
      return <path fill={color} d="M12 1C13 8 16 11 23 12C16 13 13 16 12 23C11 16 8 13 1 12C8 11 11 8 12 1Z" />;
    case 'planet':
      return (
        <g>
          <circle cx="12" cy="12" r="6.5" fill={color} />
          <ellipse cx="12" cy="12" rx="11" ry="3.6" fill="none" stroke={color} strokeWidth="1.4" opacity=".75" transform="rotate(-18 12 12)" />
        </g>
      );
    case 'bolt':
      return <path fill={color} d="M13.5 2 5 13.5h5L9 22l9.5-12h-5.5L13.5 2Z" />;
    case 'moon':
      return <path fill={color} d="M15.5 3.5a9.5 9.5 0 1 0 5 12.6A8 8 0 0 1 15.5 3.5Z" opacity=".9" />;
    case 'dot':
      return (
        <g fill={color}>
          <circle cx="7" cy="9" r="2.2" /><circle cx="15" cy="5" r="1.5" /><circle cx="17" cy="14" r="1.8" /><circle cx="10" cy="17" r="1.3" />
        </g>
      );
  }
}

type Floater = { x: number; y: number; vx: number; vy: number; rot: number; fall: number; phase: number; pop: number };

export default function StellarFooter() {
  const root = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const doodleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [play, setPlay] = useState(false);
  const [talking, setTalking] = useState(-1);
  const talkTimer = useRef(0);
  const sim = useRef({ floaters: [] as Floater[], w: 0, h: 0, px: NaN, py: NaN, inside: false, visible: false, seed: 7 });
  const reduce = useMemo(() => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      sim.current.visible = entry.isIntersecting;
      if (entry.isIntersecting && entry.intersectionRatio > .12) setPlay(true);
    }), { threshold: [0, .12, .35] });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => window.clearTimeout(talkTimer.current), []);

  // The living layer: doodles drift, sway, dodge the pointer and wrap around.
  // They only wake once the storyboard has played.
  useEffect(() => {
    const worldElement = world.current;
    if (!worldElement || reduce || !play) return;
    const state = sim.current;
    const rand = () => { state.seed = (state.seed * 16807) % 2147483647; return state.seed / 2147483647; };
    const layout = () => {
      const rect = worldElement.getBoundingClientRect();
      const oldW = state.w, oldH = state.h;
      state.w = rect.width; state.h = rect.height;
      if (state.floaters.length !== DOODLE_CYCLE.length || !oldW) {
        state.floaters = DOODLE_CYCLE.map((_, k) => ({
          x: ((k + .5) / DOODLE_CYCLE.length + (rand() - .5) * .06) * rect.width,
          y: rand() * rect.height * .8,
          vx: 0, vy: 0,
          rot: (rand() - .5) * 60,
          fall: 12 + rand() * 20,
          phase: rand() * Math.PI * 2,
          pop: 0,
        }));
      } else if (oldW && oldH) {
        state.floaters.forEach(f => { f.x *= rect.width / oldW; f.y *= rect.height / oldH; });
      }
      paint();
    };
    const paint = () => {
      for (let i = 0; i < state.floaters.length; i++) {
        const element = doodleRefs.current[i];
        const f = state.floaters[i];
        if (!element || !f) continue;
        let scale = 1, opacity = .9;
        if (f.pop > 0) {
          const age = 1.1 - f.pop;
          scale = 1 + Math.min(1, age / .3) * .8;
          opacity = Math.max(0, 1 - age / .3);
        }
        element.style.transform = `translate3d(${f.x.toFixed(1)}px,${f.y.toFixed(1)}px,0) rotate(${f.rot.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
        element.style.opacity = String(opacity);
      }
    };
    let frame = 0, last = performance.now();
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (!state.visible || document.hidden) { last = now; return; }
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const radius = 110;
      for (const f of state.floaters) {
        if (f.pop > 0) {
          f.pop -= dt;
          if (f.pop <= 0) { f.pop = 0; f.x = rand() * state.w; f.y = -30; f.vy = f.fall; }
          continue;
        }
        const sway = Math.sin(t * .6 + f.phase) * 16;
        if (Number.isFinite(state.px) && Number.isFinite(state.py)) {
          const dx = f.x - state.px, dy = f.y - state.py;
          const d = Math.hypot(dx, dy);
          if (d < radius && d > .01) {
            const push = (1 - d / radius) * (1 - d / radius) * 2600 * dt;
            f.vx += (dx / d) * push;
            f.vy += (dy / d) * push;
          }
        }
        const ease = Math.min(1, dt * 2.2);
        f.vx += (sway - f.vx) * ease;
        f.vy += (f.fall - f.vy) * ease;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += Math.sin(f.phase * 3) * 14 * dt;
        if (f.y > state.h + 30) { f.y = -30; f.x = rand() * state.w; }
        if (f.x < -30) f.x = state.w + 30;
        else if (f.x > state.w + 30) f.x = -30;
      }
      paint();
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(worldElement);
    frame = requestAnimationFrame(step);
    const move = (e: PointerEvent) => {
      const rect = worldElement.getBoundingClientRect();
      state.px = e.clientX - rect.left;
      state.py = e.clientY - rect.top;
      state.inside = true;
    };
    const leave = () => { state.px = NaN; state.py = NaN; };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
    };
  }, [reduce, play]);

  const poke = (index: number) => {
    setTalking(index);
    window.clearTimeout(talkTimer.current);
    talkTimer.current = window.setTimeout(() => setTalking(-1), 2400);
  };
  const pop = (index: number) => {
    const f = sim.current.floaters[index];
    if (f && f.pop <= 0) f.pop = 1.1;
  };
  const toTop = () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });

  const letters = WORDMARK.split('');
  const words = TAGLINE.split(' ');
  const letterDelay = (i: number) => 140 + i * 90;
  const crewStart = letterDelay(letters.length - 1) + 380;
  const copyStart = crewStart + 320;

  return (
    <footer className="stellar-footer" ref={root} data-play={play || reduce ? '1' : '0'}>
      <div className="sf-top">
        <div className="sf-brand-note">
          <a className="sf-brand" href="/" translate="no"><span className="sf-brand-mark" aria-hidden="true"><Icon name="ai" size={20} /></span>SESEMI</a>
          <p>An independent digital and creative studio. Websites, AI advertising films and identities for ambitious brands.</p>
          <div className="sf-contact">
            <span className="sf-contact-item sf-contact-loc">Yerevan, Armenia</span>
            <a className="sf-contact-item" href="tel:+37498426704"><Icon name="phone" size={13} />+374 98 426 704</a>
            <a className="sf-contact-item" href="https://t.me/MersadJy" target="_blank" rel="noopener noreferrer">Telegram · @MersadJy</a>
            <a className="sf-contact-item" href="mailto:sesemiaddress@gmail.com"><Icon name="mail" size={13} />sesemiaddress@gmail.com</a>
          </div>
        </div>
        <nav className="sf-columns" aria-label="Footer">
          <div><h3>Studio</h3>
            <a href="/#services">Services</a>
            <a href="/#process">Our process</a>
            <a href="/#about">About the studio</a>
            <a href="/#contact">Get in touch</a>
          </div>
          <div><h3>Popular</h3>
            <a href="/services/web-design">Web design</a>
            <a href="/services/ai-advertising-videos">AI advertising films</a>
            <a href="/services/brand-identity">Brand identity</a>
            <a href="/start">Start a project</a>
          </div>
        </nav>
      </div>

      <div className="sf-world" ref={world}>
        <div className="sf-stage">
          <h2 className="sf-sr">SESEMI</h2>
          <div className="sf-word" aria-hidden="true">
            {letters.map((letter, i) => (
              <span className="sf-letter" key={i} style={{ '--d': `${letterDelay(i)}ms` } as React.CSSProperties}>{letter}</span>
            ))}
            {CREW.map((star, i) => (
              <button
                key={i}
                className={`sf-star sf-${star.seat}-seat${talking === i ? ' is-talking' : ''}`}
                style={{
                  '--d': `${crewStart + i * 140}ms`, '--x': `${((star.letter + .5 + star.offset) / letters.length) * 100}%`,
                  '--size': `${star.size}px`, '--star': star.color,
                } as React.CSSProperties}
                onClick={() => poke(i)}
                aria-label={`Sesemi sparkle: ${star.says}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1C13 8 16 11 23 12C16 13 13 16 12 23C11 16 8 13 1 12C8 11 11 8 12 1Z" /></svg>
              </button>
            ))}
            <div className="sf-bubbles" aria-live="polite">
              {CREW.map((star, i) => talking === i && (
                <span key={i} className="sf-bubble" style={{ '--x': `${((star.letter + .5) / letters.length) * 100}%` } as React.CSSProperties}>{star.says}</span>
              ))}
            </div>
          </div>
          <svg className="sf-ground" viewBox="0 0 600 12" preserveAspectRatio="none" aria-hidden="true">
            <path className="sf-ground-path" pathLength={1} d="M4 8C60 3 120 10 180 6S300 3 360 7 480 10 540 5 585 6 596 7" />
          </svg>
        </div>

        <div className="sf-doodles" aria-hidden="true">
          {DOODLE_CYCLE.map((kind, k) => (
            <div key={k} className="sf-doodle" ref={el => { doodleRefs.current[k] = el; }} onPointerDown={() => pop(k)}>
              <svg width="26" height="26" viewBox="0 0 24 24"><DoodleArt kind={kind} color={DOODLE_COLORS[k % DOODLE_COLORS.length]} /></svg>
            </div>
          ))}
        </div>

        <p className="sf-tagline">
          {words.map((word, k) => <span key={k} className="sf-word-anim" style={{ '--d': `${copyStart + k * 60}ms` } as React.CSSProperties}>{word}{' '}</span>)}
        </p>
        <div className="sf-actions">
          <a className="button" href="/#contact" style={{ '--d': `${copyStart + words.length * 60 + 140}ms` } as React.CSSProperties}>Start your project <Icon size={18} /></a>
          <a className="button secondary" href="/#services" style={{ '--d': `${copyStart + words.length * 60 + 240}ms` } as React.CSSProperties}>Explore services <Icon size={16} /></a>
          <button className="sf-ask" onClick={() => window.dispatchEvent(new Event('sesemi:chat'))} style={{ '--d': `${copyStart + words.length * 60 + 340}ms` } as React.CSSProperties}>Ask Sesemi <span>↗</span></button>
        </div>
      </div>

      <div className="sf-bar">
        <span>© {new Date().getFullYear()} SESEMI. All rights reserved.</span>
        <div className="sf-legal">
          <a href="/privacy">Privacy</a>
          <button onClick={() => window.dispatchEvent(new Event('sesemi:privacy'))}>Cookie preferences</button>
        </div>
        <button className="sf-top-button" onClick={toTop}>Back to top ↑</button>
      </div>
    </footer>
  );
}
