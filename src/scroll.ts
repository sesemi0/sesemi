import type Lenis from 'lenis';

/** The live Lenis instance, shared so canvas-driven CTAs can scroll smoothly. */
export const scrollState: { lenis?: Lenis } = {};

/** Scroll to a selector through Lenis when it owns the page scroll. */
export function scrollToSection(selector: string, immediate = false) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  if (scrollState.lenis) scrollState.lenis.scrollTo(target, { offset: -110, immediate });
  else target.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth', block: 'start' });
}
