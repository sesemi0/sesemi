import { useEffect, useMemo, useRef } from 'react';
import './hero-doodles.css';

/**
 * The hero's sticker weather — cosmic doodles raining gently from the top of
 * the hero and scattering aside whenever the pointer approaches. Pop one and
 * it resparks back at the top of the sky.
 */
type DoodleKind = 'sparkle' | 'planet' | 'bolt' | 'moon' | 'dot' | 'comet' | 'swirl' | 'cross' | 'ring' | 'puff' | 'ship' | 'ufo' | 'satellite' | 'constellation' | 'diamond' | 'sun' | 'wave';

/** Each kind carries its weight in the rain and a drawn size in pixels. */
const KINDS: { kind: DoodleKind; weight: number; size: number }[] = [
  { kind: 'sparkle', weight: 4, size: 26 },
  { kind: 'planet', weight: 2, size: 28 },
  { kind: 'ship', weight: 2, size: 30 },
  { kind: 'comet', weight: 2, size: 28 },
  { kind: 'moon', weight: 2, size: 24 },
  { kind: 'bolt', weight: 1, size: 24 },
  { kind: 'dot', weight: 1, size: 22 },
  { kind: 'swirl', weight: 2, size: 26 },
  { kind: 'cross', weight: 1, size: 26 },
  { kind: 'ring', weight: 1, size: 26 },
  { kind: 'puff', weight: 1, size: 26 },
  { kind: 'ufo', weight: 2, size: 30 },
  { kind: 'satellite', weight: 2, size: 28 },
  { kind: 'constellation', weight: 1, size: 28 },
  { kind: 'diamond', weight: 1, size: 22 },
  { kind: 'sun', weight: 1, size: 26 },
  { kind: 'wave', weight: 1, size: 26 },
];
const KIND_SIZE = new Map(KINDS.map(entry => [entry.kind, entry.size]));

/** How many stickers the sky can carry: scaled by viewport area so big,
 *  high-resolution screens rain dense and small ones stay breathable. */
function stickerCount() {
  const area = Math.max(320 * 560, innerWidth * innerHeight);
  return Math.round(Math.min(190, Math.max(60, area / 10000)));
}

/** Weighted, deterministic cycle built once per mount. */
function buildDoodleCycle(count: number) {
  const total = KINDS.reduce((sum, entry) => sum + entry.weight, 0);
  const bag: DoodleKind[] = [];
  KINDS.forEach(entry => { for (let i = 0; i < entry.weight; i++) bag.push(entry.kind); });
  let seed = 20261025;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: count }, () => bag[Math.floor(rand() * total)]);
}

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
    case 'comet':
      return (
        <g>
          <circle cx="16.5" cy="7.5" r="3.4" fill={color} />
          <path fill={color} opacity=".55" d="M14 10 2 22l4-.5L5 26 12.5 13Z" transform="translate(0 -2)" />
        </g>
      );
    case 'swirl':
      return (
        <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 12a4.2 4.2 0 1 1 4.2 4.2A6.5 6.5 0 0 1 12 12a8.8 8.8 0 1 0 8.8 8.8" opacity=".9" />
        </g>
      );
    case 'cross':
      return (
        <g fill={color}>
          <path d="M12 2h1.6v20H12zM2 10.8h20v1.6H2z" transform="rotate(0)" />
          <path d="M12 2h1.6v20H12z" transform="rotate(45 12 12)" />
          <path d="M2 10.8h20v1.6H2z" transform="rotate(45 12 12)" />
        </g>
      );
    case 'ring':
      return (
        <g>
          <circle cx="12" cy="12" r="7.4" fill="none" stroke={color} strokeWidth="2" opacity=".9" />
          <circle cx="12" cy="12" r="2.2" fill={color} />
        </g>
      );
    case 'puff':
      return (
        <g fill={color} opacity=".55">
          <circle cx="9" cy="11" r="4.4" /><circle cx="14.5" cy="9" r="3.4" /><circle cx="14" cy="14.5" r="3.8" /><circle cx="9.5" cy="15.5" r="3" />
        </g>
      );
    case 'ship':
      return (
        <g>
          <path fill={color} d="M12 1.6c2.7 2.3 4.1 5.4 4.1 8.9 0 2.3-.5 4.4-1.5 6.1H9.4c-1-1.7-1.5-3.8-1.5-6.1 0-3.5 1.4-6.6 4.1-8.9Z" />
          <circle cx="12" cy="9.6" r="2" fill="#050a16" opacity=".85" />
          <path fill={color} d="M7.9 13.2 5 17.4l3.5-1zM16.1 13.2l2.9 4.2-3.5-1z" opacity=".85" />
          <path fill={color} d="M10.4 18.4h3.2L12 22.4z" opacity=".55" />
        </g>
      );
    case 'ufo':
      return (
        <g>
          <ellipse cx="12" cy="13" rx="9.5" ry="3.4" fill={color} />
          <path fill={color} d="M8.2 12.2a3.8 3.8 0 0 1 7.6 0z" opacity=".9" />
          <circle cx="5.8" cy="13.8" r="1.1" fill="#dff0ff" opacity=".9" />
          <circle cx="18.2" cy="13.8" r="1.1" fill="#dff0ff" opacity=".9" />
          <path fill={color} d="M10 17.5l4 0-2 4.5z" opacity=".4" />
        </g>
      );
    case 'satellite':
      return (
        <g>
          <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1" fill={color} />
          <path fill="none" stroke={color} strokeWidth="1.3" d="M9.6 12H3.2M14.4 12h6.4" />
          <rect x="1.6" y="9.8" width="4.4" height="4.4" fill={color} opacity=".55" />
          <rect x="18" y="9.8" width="4.4" height="4.4" fill={color} opacity=".55" />
          <path fill="none" stroke={color} strokeWidth="1.1" d="M12 9.6V6.4" opacity=".8" />
          <circle cx="12" cy="5" r="1.5" fill={color} />
        </g>
      );
    case 'constellation':
      return (
        <g stroke={color} strokeWidth=".9" opacity=".8">
          <path fill="none" d="M4 17 9 8l6 3 5-7" />
          <circle cx="4" cy="17" r="1.6" fill={color} stroke="none" />
          <circle cx="9" cy="8" r="2.1" fill={color} stroke="none" />
          <circle cx="15" cy="11" r="1.5" fill={color} stroke="none" />
          <circle cx="20" cy="4" r="1.9" fill={color} stroke="none" />
        </g>
      );
    case 'diamond':
      return (
        <g>
          <path fill={color} d="M12 2 21 12 12 22 3 12Z" opacity=".9" />
          <path fill="none" stroke="#050a16" strokeWidth="1" d="M12 2v20M3 12h18" opacity=".5" />
        </g>
      );
    case 'sun':
      return (
        <g>
          <circle cx="12" cy="12" r="4.6" fill={color} />
          <g stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity=".85">
            <path d="M12 2.4v2.8M12 18.8v2.8M2.4 12h2.8M18.8 12h2.8M5.2 5.2l2 2M16.8 16.8l2 2M18.8 5.2l-2 2M7.2 16.8l-2 2" />
          </g>
        </g>
      );
    case 'wave':
      return (
        <g fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
          <path d="M2 12c2.5-5 5-5 7.5 0s5 5 7.5 0 3-4 5-2.5" />
        </g>
      );
  }
}

type Floater = { x: number; y: number; vx: number; vy: number; rot: number; fall: number; phase: number; pop: number };

export default function HeroDoodles() {
  const layer = useRef<HTMLDivElement>(null);
  const doodleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sim = useRef({ floaters: [] as Floater[], w: 0, h: 0, px: NaN, py: NaN, visible: false, seed: 11 });
  const reduce = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  // the sticker population is chosen once, sized to this screen's resolution
  const DOODLE_CYCLE = useMemo(() => buildDoodleCycle(stickerCount()), []);

  // The living weather: doodles rain from the top, sway, dodge the pointer
  // and wrap back up. All motion lives in one rAF, paused off-screen.
  useEffect(() => {
    const host = layer.current;
    if (!host) return;
    const state = sim.current;
    const rand = () => { state.seed = (state.seed * 16807) % 2147483647; return state.seed / 2147483647; };
    const layout = () => {
      const rect = host.getBoundingClientRect();
      state.w = rect.width; state.h = rect.height;
      if (!state.floaters.length) {
        // start scattered through the height so the rain is already falling
        state.floaters = DOODLE_CYCLE.map((_, k) => ({
          x: ((k + .5) / DOODLE_CYCLE.length + (rand() - .5) * .07) * rect.width,
          y: rand() * rect.height - rect.height * .2,
          vx: 0, vy: 0,
          rot: (rand() - .5) * 70,
          fall: 9 + rand() * 17,
          phase: rand() * Math.PI * 2,
          pop: 0,
        }));
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
      const radius = 135;
      for (const f of state.floaters) {
        if (f.pop > 0) {
          f.pop -= dt;
          if (f.pop <= 0) { f.pop = 0; f.x = rand() * state.w; f.y = -26; f.vy = f.fall; }
          continue;
        }
        const sway = Math.sin(t * .5 + f.phase) * 14;
        if (Number.isFinite(state.px) && Number.isFinite(state.py)) {
          const dx = f.x - state.px, dy = f.y - state.py;
          const d = Math.hypot(dx, dy);
          if (d < radius && d > .01) {
            const push = (1 - d / radius) * (1 - d / radius) * 3200 * dt;
            f.vx += (dx / d) * push;
            f.vy += (dy / d) * push;
          }
        }
        const ease = Math.min(1, dt * 2.2);
        f.vx += (sway - f.vx) * ease;
        f.vy += (f.fall - f.vy) * ease;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += Math.sin(f.phase * 3) * 12 * dt;
        if (f.y > state.h + 26) { f.y = -26; f.x = rand() * state.w; }
        if (f.x < -26) f.x = state.w + 26;
        else if (f.x > state.w + 26) f.x = -26;
      }
      paint();
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; });
    io.observe(host);
    if (!reduce) frame = requestAnimationFrame(step);
    const move = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      state.px = e.clientX - rect.left;
      state.py = e.clientY - rect.top;
    };
    const leave = () => { state.px = NaN; state.py = NaN; };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
    };
  }, [reduce]);

  const pop = (index: number) => {
    const f = sim.current.floaters[index];
    if (f && f.pop <= 0) f.pop = 1.1;
  };

  return (
    <div className="hd-layer" ref={layer} aria-hidden="false">
      {DOODLE_CYCLE.map((kind, k) => {
        const size = KIND_SIZE.get(kind) ?? 26;
        return (
          <div key={k} className="hd-doodle" ref={el => { doodleRefs.current[k] = el; }} onPointerDown={() => pop(k)}
            style={{ width: size, height: size, margin: `${-size / 2}px 0 0 ${-size / 2}px` }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><DoodleArt kind={kind} color={DOODLE_COLORS[k % DOODLE_COLORS.length]} /></svg>
          </div>
        );
      })}
    </div>
  );
}
