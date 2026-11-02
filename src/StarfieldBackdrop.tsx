import { useEffect, useRef } from 'react';

/**
 * A quiet galaxy behind every section: a slowly turning starfield that leans
 * with the pointer. Rendered only when motion is welcome, paused when hidden,
 * and removed entirely in light mode via CSS.
 */
export default function StarfieldBackdrop() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 767px)').matches;
    let disposed = false;
    let teardown: (() => void) | undefined;
    import('three').then((THREE) => {
      if (disposed || reduce.matches) return;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.5));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, .1, 120);
      camera.position.set(0, 0, 10);
      const count = mobile ? 450 : 900;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const direction = new THREE.Vector3().randomDirection();
        direction.multiplyScalar(14 + Math.random() * 26).toArray(positions, i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        size: .12, transparent: true, opacity: .45, fog: false,
        blending: THREE.AdditiveBlending, depthWrite: false, color: '#aac8f0',
      });
      const stars = new THREE.Points(geometry, material);
      scene.add(stars);
      element.appendChild(renderer.domElement);
      let frame = 0, lastTime = 0, elapsed = 0, visible = true, awake = !document.hidden;
      let pointerX = 0, pointerY = 0, currentX = 0, currentY = 0;
      const resize = () => {
        const { width, height } = element.getBoundingClientRect();
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(1, height);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(element);
      const animate = (now: number) => {
        frame = 0;
        if (!visible || !awake) return;
        const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : .016;
        lastTime = now;
        elapsed += dt;
        const ease = 1 - Math.exp(-dt * 2);
        currentX += (pointerX - currentX) * ease;
        currentY += (pointerY - currentY) * ease;
        stars.rotation.y = elapsed * .008 + currentX * .05;
        stars.rotation.x = currentY * .04;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      const wake = () => { if (!frame && visible && awake) { lastTime = 0; frame = requestAnimationFrame(animate); } };
      const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }, { rootMargin: '120px' });
      io.observe(element);
      const visibility = () => { awake = !document.hidden; wake(); };
      const move = (event: PointerEvent) => {
        pointerX = (event.clientX / innerWidth - .5) * 2;
        pointerY = (event.clientY / innerHeight - .5) * 2;
      };
      document.addEventListener('visibilitychange', visibility);
      document.addEventListener('pointermove', move, { passive: true });
      resize();
      wake();
      teardown = () => {
        cancelAnimationFrame(frame);
        ro.disconnect(); io.disconnect();
        document.removeEventListener('visibilitychange', visibility);
        document.removeEventListener('pointermove', move);
        geometry.dispose(); material.dispose(); renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => { /* No WebGL: the flat navy background remains. */ });
    return () => { disposed = true; teardown?.(); };
  }, []);
  return <div className="site-starfield" ref={host} aria-hidden="true" />;
}
