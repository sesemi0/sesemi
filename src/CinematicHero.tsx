import { useEffect, useRef } from 'react';

/**
 * The raster master is retained on a traced, beveled relief. This is deliberately
 * not presented as a reconstruction of the unknown original sculptural model.
 */
export default function CinematicHero() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let teardown: (() => void) | undefined;
    import('./hero-scene').then(async ({ createHeroScene }) => {
      if (disposed) return;
      try {
        teardown = await createHeroScene(element, () => disposed);
        if (disposed) teardown?.();
      } catch {
        element.dataset.scene = 'fallback';
      }
    }).catch(() => { element.dataset.scene = 'fallback'; });
    return () => { disposed = true; teardown?.(); };
  }, []);
  return <div className="cinematic-scene" ref={host} aria-hidden="true">
    <div className="scene-fallback"><div className="fallback-horizon" /><img src="/brand/sesemi-star.webp" alt="" fetchPriority="high" /></div>
  </div>;
}
