import { useEffect, useState } from 'react';
import { onLang, t } from './i18n';

/**
 * نوار پیشرفت اسکرول — خط عمودی ثابت کنار صفحه که با اسکرول پر می‌شود؛
 * هر نقطه یک سکشن است (بدون لیبل متنی — لیبل روی محتوا می‌افتد).
 * دسکتاپ: خط + نقطه — موبایل: خط باریک لبه‌ی صفحه.
 * LTR: سمت چپ — RTL (فارسی): قرینه، سمت راست.
 */
const SECTIONS = [
  { id: 'services', key: 'rail.services' },
  { id: 'process', key: 'rail.process' },
  { id: 'office', key: 'rail.office' },
  { id: 'pricing', key: 'rail.pricing' },
  { id: 'about', key: 'rail.about' },
  { id: 'portfolio', key: 'rail.portfolio' },
  { id: 'contact', key: 'rail.contact' },
] as const;

/** تاکید رنگی هر سکشن — ریل هم‌زمان با فضای صفحه رنگ عوض می‌کند */
const ACCENTS: Record<string, string> = {
  hero: '#9b7fe0',
  services: '#53b9fb',
  process: '#53b9fb',
  office: '#61e7ff',
  pricing: '#53b9fb',
  about: '#53b9fb',
  portfolio: '#9b7fe0',
  contact: '#53b9fb',
};

/** روشنایی نسبی پس‌زمینه (0=سیاه، 1=سفید) — از خود عنصر به بالا می‌کاود */
function backgroundLuminance(el: HTMLElement | null): number {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    node = node.parentElement;
  }
  return 0;
}

export default function ScrollRail() {
  const [, bump] = useState(0);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(-1);
  const [dots, setDots] = useState<number[]>([]);
  const [skin, setSkin] = useState<'light' | 'dark'>('dark');
  const [accent, setAccent] = useState<string | undefined>(undefined);
  useEffect(() => onLang(() => bump(x => x + 1)), []);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      setProgress(total > 200 ? Math.min(1, Math.max(0, y / total)) : 0);
      const positions: number[] = [];
      let current = -1;
      let underId = 'hero';
      const centerY = y + window.innerHeight * 0.5;
      SECTIONS.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (!el) { positions.push(-1); return; }
        const top = el.getBoundingClientRect().top + y;
        positions.push(total > 200 ? Math.min(100, Math.max(0, (top / total) * 100)) : 0);
        if (top - window.innerHeight * 0.45 <= y) current = i;
        if (top <= centerY) underId = s.id; // سکشنی که وسط دید روی آن است
      });
      setDots(positions);
      setActive(current);
      const under = document.getElementById(underId);
      setSkin(backgroundLuminance(under) < 0.35 ? 'dark' : 'light');
      setAccent(ACCENTS[underId]);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  if (!dots.length) return null;
  return <nav
    className="scroll-rail"
    data-skin={skin}
    style={accent ? ({ '--rail-accent': accent } as React.CSSProperties) : undefined}
    aria-label="Page scroll progress">
    <span className="rail-fill" style={{ height: `${progress * 100}%` }} aria-hidden="true" />
    {dots.map((pct, i) => pct < 0 ? null : (
      <button key={SECTIONS[i].id}
        className={`rail-dot ${i === active ? 'active' : ''}`}
        style={{ top: `${pct}%` }}
        onClick={() => document.getElementById(SECTIONS[i].id)?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        })}
        aria-label={t(SECTIONS[i].key)}
        aria-current={i === active ? 'true' : undefined} />
    ))}
  </nav>;
}
