import { useEffect } from 'react';
import Lenis from 'lenis';

export function Words({ children }: { children: string }) {
  return <>{children.split(' ').map((word, i) => <span className="motion-word" key={i}>{word}{' '}</span>)}</>;
}

export default function Motion() {
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let lenis: Lenis | undefined;
    const configure = () => {
      lenis?.destroy();
      lenis = undefined;
      if (!preference.matches) lenis = new Lenis({ autoRaf: true, duration: 1.15, smoothWheel: true, anchors: { offset: -110 } });
    };
    configure();
    preference.addEventListener('change', configure);
    let previous: HTMLElement | null = null;
    let frame = 0;
    const reset = () => {
      previous?.style.removeProperty('--hover-x');
      previous?.style.removeProperty('--hover-y');
      previous = null;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || preference.matches) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>('.app');
        root?.style.setProperty('--mouse-x', `${event.clientX}px`);
        root?.style.setProperty('--mouse-y', `${event.clientY}px`);
        const target = (event.target as HTMLElement).closest<HTMLElement>('.motion-word, a, button, .service-icon, .values h4, .step h3, .tech-name, label, .eyebrow');
        if (target !== previous) reset();
        if (!target) return;
        previous = target;
        const bounds = target.getBoundingClientRect();
        const strength = target.classList.contains('motion-word') ? 0.18 : 0.055;
        target.style.setProperty('--hover-x', `${Math.max(-5, Math.min(5, (event.clientX - bounds.left - bounds.width / 2) * strength))}px`);
        target.style.setProperty('--hover-y', `${Math.max(-4, Math.min(4, (event.clientY - bounds.top - bounds.height / 2) * strength))}px`);
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', reset);
    return () => {
      lenis?.destroy();
      preference.removeEventListener('change', configure);
      cancelAnimationFrame(frame);
      reset();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', reset);
    };
  }, []);
  return <div className="ambient-cursor" aria-hidden="true" />;
}
