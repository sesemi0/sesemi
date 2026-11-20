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

export default function ScrollRail() {
  const [, bump] = useState(0);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(-1);
  const [dots, setDots] = useState<number[]>([]);
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
      SECTIONS.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (!el) { positions.push(-1); return; }
        const top = el.getBoundingClientRect().top + y;
        positions.push(total > 200 ? Math.min(100, Math.max(0, (top / total) * 100)) : 0);
        if (top - window.innerHeight * 0.45 <= y) current = i;
      });
      setDots(positions);
      setActive(current);
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
  return <nav className="scroll-rail" aria-label="Page scroll progress">
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
