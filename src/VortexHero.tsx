import { useEffect, useRef } from 'react';
import { Words } from './Motion';
import { Icon } from './Visuals';
import { scrollToSection } from './scroll';
import HeroDoodles from './HeroDoodles';

/**
 * Self-contained cinematic hero. Clean two-column layout: typography and CTAs
 * aligned on the left, and a full-bleed GPU canvas carrying the deep-space
 * starfield and an organic, gently CURVED 3D DNA double helix — a fine
 * two-layer particle rope (dense cores + soft halos + base-pair rungs) wound
 * along a bezier arc that sweeps past the bottom-left and top-right corners,
 * fading out beyond the frame. The molecule slowly screws around its own
 * axis, sways organically, and the dots near the cursor ripple along the
 * pointer's direction of travel.
 */
export default function VortexHero() {
  const host = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    const mount = host.current;
    const hero = section.current;
    if (!mount || !hero) return;
    let disposed = false;
    let teardown: (() => void) | undefined;

    (async () => {
      try {
        const THREE = await import('three');
        const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
        const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
        const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
        const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');
        if (disposed) return;
        teardown = await createHelix(THREE, { EffectComposer, RenderPass, UnrealBloomPass, OutputPass }, mount, hero!, () => disposed);
        if (disposed) { teardown?.(); teardown = undefined; }
      } catch { mount.dataset.scene = 'fallback'; }
    })();

    return () => { disposed = true; teardown?.(); };
  }, []);

  return (
    <section id="home" ref={section} className="vortex-hero relative isolate min-h-[100svh] w-full overflow-hidden">
      <div className="vh-ambient pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      <div ref={host} data-scene="loading" className="absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 grid place-items-center">
          <img className="vortex-hero-fallback w-[min(42%,230px)] opacity-0 transition-opacity duration-500" src="/brand/sesemi-star.webp" alt="" fetchPriority="high" />
        </div>
      </div>
      <HeroDoodles />
      <div className="vh-bottomfade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32" aria-hidden="true" />
      <div className="relative z-10 mx-auto grid min-h-[100svh] w-full max-w-[1360px] grid-cols-1 items-center gap-x-16 px-6 pb-28 pt-20 sm:px-10 lg:grid-cols-[1.02fr_.98fr] lg:pb-16 lg:pt-6">
        <div className="order-2 lg:order-1">
          <div className="eyebrow hero-stamp" style={{ '--d': '80ms' } as React.CSSProperties}><span className="live-dot" /> INDEPENDENT DIGITAL &amp; CREATIVE STUDIO</div>
          <h1 className="mt-7 max-w-[640px] whitespace-nowrap text-[clamp(46px,4.6vw,76px)] font-medium leading-[1.05] tracking-[-3px] text-[#f3f6ff] max-[767px]:whitespace-normal max-[767px]:tracking-[-1.5px]">
            <Words stamp={250}>Built to work.</Words><br /><span className="text-[#48b9ff]"><Words stamp={490}>Made to stand out.</Words></span>
          </h1>
          <p className="hero-stamp mt-6 max-w-[440px] text-[13px] leading-[2.15] text-[#94a3bb]" style={{ '--d': '1150ms' } as React.CSSProperties}>
            Distinctive websites. Cinematic AI advertising films. We turn ambitious ideas into digital experiences and brand stories people remember.
          </p>
          <div className="mt-8 flex flex-wrap gap-3.5">
            <a className="button hero-stamp" style={{ '--d': '1400ms' } as React.CSSProperties} href="#contact">Start your project <Icon size={19} /></a>
            <a className="button hero-stamp secondary" style={{ '--d': '1520ms' } as React.CSSProperties} href="#about">Meet Sesemi <Icon size={18} /></a>
          </div>
          <div className="ownership hero-stamp mt-7" style={{ '--d': '1660ms' } as React.CSSProperties}><Icon name="check" size={17} /> Clear scope. Thoughtful craft. A simple way to start.</div>
        </div>
        <div className="relative order-1 hidden min-h-[380px] lg:order-2 lg:block" aria-hidden="true">
          <div className="pointer-events-none absolute -bottom-6 right-0 flex flex-col items-end gap-1.5 font-mono text-[8px] tracking-[.18em] text-[#8fa5bd]">
            <span className="text-[#b6c9df]">01 / SESEMI IN ANOTHER DIMENSION</span>
            <span>HUMAN IMAGINATION. NEW POSSIBILITIES.</span>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-5 z-10 mx-auto flex w-full max-w-[1360px] items-center justify-between px-6 font-mono text-[8px] tracking-[.15em] text-[#4e607c] sm:px-10">
        <a href="#services" className="flex items-center gap-3.5 text-[10px] tracking-normal text-[#7792b2]">
          <span className="text-[19px] leading-none">↓</span> Scroll to explore
        </a>
        <span className="hidden items-center gap-3 sm:flex">STRATEGY <i className="inline-block h-[3px] w-[3px] rounded-full bg-[#48b9ff]" /> DESIGN <i className="inline-block h-[3px] w-[3px] rounded-full bg-[#48b9ff]" /> MOTION <i className="inline-block h-[3px] w-[3px] rounded-full bg-[#48b9ff]" /> AI</span>
        <span className="hidden items-center gap-2 md:flex">MOVE YOUR CURSOR. CHANGE YOUR PERSPECTIVE. <Icon name="design" size={14} /></span>
      </div>
    </section>
  );
}

/**
 * The engine. The DNA is fully procedural in the vertex shader: the bezier
 * centerline, its bent frame, the molecular spin around its own axis and the
 * pointer-direction ripple are all computed per dot from a handful of
 * uniforms — the CPU only advances time and damped pointer values, so the
 * full-bleed canvas holds 60fps at any resolution.
 */
async function createHelix(
  THREE: typeof import('three'),
  addons: {
    EffectComposer: typeof import('three/addons/postprocessing/EffectComposer.js').EffectComposer;
    RenderPass: typeof import('three/addons/postprocessing/RenderPass.js').RenderPass;
    UnrealBloomPass: typeof import('three/addons/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
    OutputPass: typeof import('three/addons/postprocessing/OutputPass.js').OutputPass;
  },
  mount: HTMLDivElement,
  hero: HTMLElement,
  cancelled: () => boolean,
) {
  const mobile = matchMedia('(max-width: 767px)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // remote diagnostics: real devices report engine state straight into D1 so a
  // device-specific failure can be read server-side without device console
  // access. fully invisible — production visitors must never see debug UI.
  const diag = (message: string) => {
    try {
      void fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ name: 'engine_diag', path: '/' + message.slice(0, 188), sessionId: 'diag-' + (navigator.userAgent.match(/iPhone|iPad|Android/i)?.[0] || 'other'), referrer: '', at: new Date().toISOString() }) }).catch(() => {});
    } catch { /* diagnostics must never break the engine */ }
  };
  diag(`init vw=${innerWidth} dpr=${devicePixelRatio} mobile=${mobile} reduce=${reduce.matches} webgl=${!!document.createElement('canvas').getContext('webgl2')}`);
  let renderer: import('three').WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
  } catch (error) {
    diag('renderer fail: ' + (error instanceof Error ? error.message : String(error)));
    throw error;
  }
  renderer.debug.onShaderError = (error) => diag('shader fail: ' + String(error).slice(0, 160));
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.8));
  renderer.info.autoReset = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050a16');
  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 42, 1, .1, 60);
  camera.position.set(0, .1, 9.4);

  // Whisper bloom for the fine dots — delicate, never blinding.
  // Desktop renders through the composer; mobile renders DIRECTLY — some
  // phone GPUs silently produced an empty composer output (the invisible DNA).
  let composer: import('three/addons/postprocessing/EffectComposer.js').EffectComposer | undefined;
  let bloom: import('three/addons/postprocessing/UnrealBloomPass.js').UnrealBloomPass | undefined;
  if (!mobile) {
    // the composer MUST match the renderer's ratio — at 1x the final pass
    // upsamples and smears the DNA across a phone's high-DPI screen
    composer = new addons.EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.renderTarget1.samples = 4;
    composer.renderTarget2.samples = 4;
    composer.addPass(new addons.RenderPass(scene, camera));
    bloom = new addons.UnrealBloomPass(new THREE.Vector2(1, 1), .22, .4, .85);
    composer.addPass(bloom);
    composer.addPass(new addons.OutputPass());
  }

  // ---- Layer 1: the full-bleed calm starfield -----------------------------
  // built at the LIGHT-theme density; the dark theme draws a subset
  const starDrawDark = mobile ? 340 : 600;
  const starCount = mobile ? 520 : 950;
  const starPositions = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  const starPhase = new Float32Array(starCount);
  const starDepth = new Float32Array(starCount);
  const starBright = new Float32Array(starCount);
  const corners = [[-12.5, -7.2], [12.5, -7.2], [-12.5, 7.2], [12.5, 7.2]];
  for (let i = 0; i < starCount; i++) {
    if (i % 2 === 0) {
      const [cx, cy] = corners[(i >> 1) % 4];
      const spread = Math.exp(Math.random()) * 4.4;
      const angle = Math.random() * Math.PI * 2;
      starPositions[i * 3] = cx + Math.cos(angle) * spread;
      starPositions[i * 3 + 1] = cy + Math.sin(angle) * spread * .7;
      starPositions[i * 3 + 2] = -18 - Math.random() * 16;
      starSize[i] = .7 + Math.random() * Math.random() * 1.9;
    } else {
      starPositions[i * 3] = (Math.random() - .5) * 34;
      starPositions[i * 3 + 1] = (Math.random() - .5) * 20;
      starPositions[i * 3 + 2] = -8 - Math.random() * 34;
      starSize[i] = .5 + Math.random() * Math.random() * 1.4;
    }
    starPhase[i] = Math.random() * Math.PI * 2;
    starDepth[i] = .3 + Math.random() * .7;
    starBright[i] = Math.random();
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  starGeometry.setAttribute('aDepth', new THREE.BufferAttribute(starDepth, 1));
  starGeometry.setAttribute('aBright', new THREE.BufferAttribute(starBright, 1));
  const starUniforms = {
    uTime: { value: 0 },
    uParallax: { value: new THREE.Vector2(0, 0) },
    uPresence: { value: 0 },
    uSRGB: { value: mobile ? 1 : 0 },
    uLight: { value: 0 },
  };
  const stars = new THREE.Points(starGeometry, new THREE.ShaderMaterial({
    uniforms: starUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize; attribute float aPhase; attribute float aDepth; attribute float aBright;
      uniform float uTime; uniform vec2 uParallax; uniform float uLight;
      varying float vBright;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * .05 + aPhase) * .5;
        p.y += cos(uTime * .04 + aPhase * 1.3) * .4;
        p.x += uParallax.x * aDepth;
        p.y += uParallax.y * aDepth;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        // light theme: much bigger dots so the galaxy reads on the pale sky
        float sizeDark = aSize * (30. / -mv.z);
        gl_PointSize = mix(sizeDark, max(sizeDark, 2.6) * 1.15, uLight);
        vBright = aBright;
      }`,
    fragmentShader: `
      varying float vBright;
      uniform float uPresence; uniform float uLight; uniform float uSRGB;
      void main(){
        float disc = smoothstep(.5, .1, length(gl_PointCoord - .5));
        // the pointer-roam fade is a night-sky effect; the day sky keeps its stars
        float fade = mix(1., smoothstep(.18, .5, vBright), uPresence * (1. - uLight * .9));
        vec3 col = mix(vec3(.72,.8,1.), vec3(.08,.3,.66), uLight);
        float alpha = disc * disc * mix(.5, 1., uLight) * fade * mix(1., .6, uPresence * (1. - uLight));
        // direct mobile render skips the composer's sRGB pass — convert in-shader
        col = mix(col, pow(col, vec3(.4545)), uSRGB);
        gl_FragColor = vec4(col, alpha);
      }`,
  }));
  scene.add(stars);
  diag('stage: stars added');

  // ---- Layer 2: the organic curved DNA rope (procedural particles) --------
  // position attribute packs (t along the arc, base angle, radius, strand).
  const corePerStrand = mobile ? 2600 : 5400;
  const haloPerStrand = mobile ? 1500 : 3100;
  const rungCount = mobile ? 52 : 72;
  const rungDots = 13;
  const coreTotal = corePerStrand * 2;
  const haloTotal = haloPerStrand * 2;
  const rungTotal = rungCount * rungDots;
  const total = coreTotal + haloTotal + rungTotal;
  const packed = new Float32Array(total * 3);   // (t, baseAngle, radius)
  const pStrand = new Float32Array(total);      // 0/1 cores, 2/3 halos, 4 rung
  const pPhase = new Float32Array(total);
  const pSize = new Float32Array(total);
  const pTint = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const strand = i < coreTotal ? i % 2
      : i < coreTotal + haloTotal ? 2 + Math.floor((i - coreTotal) / haloPerStrand) % 2
      : 4;
    pStrand[i] = strand;
    pPhase[i] = Math.random();
    if (strand === 4) {
      const rungId = Math.floor((i - coreTotal - haloTotal) / rungDots);
      packed[i * 3] = (rungId + .5) / rungCount;
      packed[i * 3 + 1] = 0;
      // rung dots span exactly to the strand radius (.82) — base pairs meet
      // the backbones precisely, and each half carries its own base color
      packed[i * 3 + 2] = ((Math.floor((i - coreTotal - haloTotal) % rungDots) / (rungDots - 1)) * 2 - 1) * .82;
      pTint[i] = ((i - coreTotal - haloTotal) % rungDots) / (rungDots - 1) < .5 ? .12 : .88;
      pSize[i] = .4 + Math.random() * .3;
    } else {
      packed[i * 3] = Math.random();
      packed[i * 3 + 1] = 0;
      // cores hug the helical path; halos drift slightly off it for atmosphere
      packed[i * 3 + 2] = strand < 2 ? .8 + Math.random() * .12 : .8 + Math.random() * .48;
      pSize[i] = strand < 2 ? .38 + Math.random() * .38 : .44 + Math.random() * .42;
    }
    pTint[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(packed, 3));
  geometry.setAttribute('aStrand', new THREE.BufferAttribute(pStrand, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(pPhase, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(pTint, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 16);

  const ropeUniforms = {
    uTime: { value: 0 }, uTwist: { value: reduce.matches ? .6 : 0 }, uSway: { value: 0 },
    uTurns: { value: 10 },
    uBoost: { value: mobile ? 1 : 0 },
    uReveal: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uNarrow: { value: 0 }, uWide: { value: 0 },
    uC0: { value: new THREE.Vector3() }, uC1: { value: new THREE.Vector3() },
    uC2: { value: new THREE.Vector3() }, uC3: { value: new THREE.Vector3() },
    uAxis: { value: new THREE.Vector3(0, 1, 0) },
    uPointer: { value: new THREE.Vector3(99, 99, 0) },
    uStrength: { value: 0 },
  };
  const ropeMaterial = new THREE.ShaderMaterial({
    uniforms: ropeUniforms, transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: `
      attribute float aStrand; attribute float aPhase; attribute float aSize; attribute float aTint;
      uniform float uTime, uTwist, uSway, uReveal, uPixelRatio, uNarrow, uWide, uStrength, uTurns, uBoost;
      uniform vec3 uC0, uC1, uC2, uC3, uAxis, uPointer;
      varying float vTint; varying float vStrand; varying float vAlpha; varying float vT;
      varying float vDepth; varying float vGlow;
      vec3 bezier(float t){
        float s = 1. - t;
        return uC0 * (s*s*s) + uC1 * (3.*s*s*t) + uC2 * (3.*s*t*t) + uC3 * (t*t*t);
      }
      void main(){
        float t = position.x;          // 0..1 along the arc
        float radius = position.z;     // distance from the centerline
        float strand = aStrand;

        vec3 C = bezier(clamp(t, 0., 1.));
        // bent frame: tangent of the arc, then a stable in-plane normal
        vec3 T = normalize(
          bezier(clamp(t + .008, 0., 1.)) - bezier(clamp(t - .008, 0., 1.)));
        vec3 N = normalize(cross(T, vec3(0., 0., 1.)));
        vec3 B = cross(T, N);

        // THE helix coupling: the winding angle is a function of t — this is
        // what makes two strands read as a double helix (random angles would
        // collapse into a dust tube). uTwist slowly screws the molecule.
        float jitter = (sin(aPhase * 91.7) * .5 + .5) * (strand < 2. ? .12 : .5);
        float theta = t * (uTurns + uBoost * 4.) * 6.283 + uTwist + strand * 3.14159 + jitter;
        float r = radius;
        vec3 off = (N * cos(theta) + B * sin(theta)) * r;

        // organic idle sway: the whole rope breathes along its own frame
        C += N * sin(uTime * .27 + t * 2.4) * uSway;
        C += B * cos(uTime * .22 + t * 1.9) * uSway * .8;

        vec3 world = C + off;
        // depth: dots behind the axis plane sit darker and quieter
        float depth = smoothstep(.12, -.45, off.z / max(radius, .01));

        // LOCAL pointer ripple: dots near the cursor lean toward it and lift
        // toward the viewer with a smooth magnetic ease — no flinging, the
        // helix form is preserved and the motion is continuous
        vec3 d = world - uPointer;
        float dist = length(d.xy + vec2(0., d.z * .25));
        float infl = pow(smoothstep(1.05, 0., dist), 1.5) * uStrength;
        world.xy += normalize(d.xy + vec2(1e-4)) * infl * .06;
        world.z += infl * .12;

        vec4 mv = viewMatrix * vec4(world, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (15. / max(1., -mv.z)) * 6.2
          * (1. + infl * .15) * mix(1., .8, depth) * mix(1., 1.38, uBoost);
        vTint = aTint;
        vStrand = strand;
        vT = t;
        vGlow = infl;
        vDepth = depth;
        // the rope melts beyond both corners: soft alpha gradients off-screen
        float ends = smoothstep(0., .1, t) * smoothstep(1., .9, t);
        // gentle dimming wherever the copy lives — never a hard cut
        float guardX = mix(1., .35, uWide * smoothstep(-1.1, -3.2, world.x) * smoothstep(.05, 1.3, world.y));
        float guardY = mix(1., .42 + uBoost * .18, uNarrow * smoothstep(-.45, -2.0, world.y));
        float breathe = .85 + .15 * sin(uTime * .6 + aPhase * 6.283);
        vAlpha = ends * guardX * guardY * uReveal * breathe * mix(1., 1.65, uBoost);
      }`,
    fragmentShader: `
      varying float vTint; varying float vStrand; varying float vAlpha; varying float vT;
      varying float vDepth; varying float vGlow;
      uniform float uSRGB;
      void main(){
        float d = length(gl_PointCoord - .5);
        // crisp two-tone dots: a tight bright core inside a clean colored disc
        float disc = smoothstep(.5, .16, d);
        float hot = smoothstep(.2, .03, d);
        if (disc < .01) discard;
        bool isCore = vStrand < 1.5;
        bool isHalo = vStrand > 1.5 && vStrand < 3.5;
        // strand A drifts deep blue -> violet along the arc; strand B mirrors;
        // halos are the soft atmosphere.
        // ONE palette for both themes — the rope renders identically day/night.
        vec3 colA = mix(vec3(.1,.32,.78), vec3(.36,.2,.74), vT);
        vec3 colB = mix(vec3(.32,.2,.72), vec3(.1,.34,.76), vT);
        vec3 col = mix(colA, colB, min(vStrand, 1.));
        if (isHalo) col = mix(col, vec3(.32,.38,.7), .45);
        // base pairs: each rung half carries its own base color, meeting bright
        if (vStrand > 3.5) col = mix(vec3(.16,.5,.95), vec3(.58,.36,.96), smoothstep(.42, .58, vTint));
        float sparkle = step(.985, vTint) * (isCore ? 1. : 0.);
        col = mix(col, vec3(.85,.9,.99), sparkle * .5);
        float base = isCore ? .62 : isHalo ? .17 : .46;
        float alpha = vAlpha * disc * disc * base;
        col += col * hot * (isCore ? .45 : .25);
        // depth: dots behind the axis plane sit darker and quieter
        alpha *= mix(1., .5, vDepth);
        col *= mix(1., .7, vDepth);
        // direct mobile render skips the composer's sRGB pass — convert in-shader
        col = mix(col, pow(col, vec3(.4545)), uSRGB);
        // the pointer spot: a soft cyan shimmer blended INTO the rope colors —
        // same dots, same size class, just gently awakened
        col = mix(col, vec3(.42,.78,1.), vGlow * .22);
        alpha *= (1. + vGlow * .32);
        gl_FragColor = vec4(col * (1. + sparkle * .5 + vGlow * .12), alpha);
      }`,
  });
  const rope = new THREE.Points(geometry, ropeMaterial);
  scene.add(rope);
  diag('stage: rope added');
  diag('stage: theme fn defined');

  // vDepthOf helper used inside the vertex shader (declared there too)
  // Theme awareness: only the canvas backdrop follows the page theme. The DNA
  // rope renders IDENTICALLY day and night (same palette, same blending, no
  // bloom in either) — the user wants zero difference in the molecule.
  const applyTheme = (isLight: boolean) => {
    scene.background = new THREE.Color(isLight ? '#e8f0fb' : '#050a16');
    starUniforms.uLight.value = isLight ? 1 : 0;
    const starBlending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
    (stars.material as import('three').ShaderMaterial).blending = starBlending;
    (stars.material as import('three').Material).needsUpdate = true;
    starGeometry.setDrawRange(0, isLight ? starCount : starDrawDark);
    if (bloom) bloom.enabled = false;
    mount.dataset.theme = isLight ? 'light' : 'dark';
  };
  const appRoot = document.querySelector('.app');
  applyTheme(!!appRoot?.classList.contains('light'));
  const themeObserver = new MutationObserver(() => applyTheme(!!appRoot?.classList.contains('light')));
  if (appRoot) themeObserver.observe(appRoot, { attributes: true, attributeFilter: ['class'] });

  // ---- Interaction state ---------------------------------------------------
  let frame = 0, visible = true, pageVisible = !document.hidden, frameCount = 0;
  let currentX = 0, currentY = 0, targetX = 0, targetY = 0;
  let insideHero = false, presence = 0, spin = 0, speedSmooth = 0;
  let lastPtr: { x: number; y: number; t: number } | undefined;
  let hover = false, downAt: { x: number; y: number; t: number } | undefined;
  let lastTime = 0, elapsed = 0;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitPoint = new THREE.Vector3();
  // the ripple center tracks the RAW cursor position with only a jitter-killing
  // micro-smooth — it must sit under the cursor, never trail behind it
  const immediatePointer = new THREE.Vector3(0, .1, 0);
  const smoothPointer = new THREE.Vector3(0, .1, 0);
  let strength = 0;

  const resize = () => {
    const { width, height } = mount.getBoundingClientRect();
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    // wide screens: the arc sweeps past BOTH corners (7% beyond each edge) so
    // the ends melt off-screen. Narrow/phone screens: both endpoints stay just
    // inside the frame so the whole helix is visible, as requested.
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const visibleWidth = visibleHeight * camera.aspect;
    const narrow = camera.aspect <= 1.05;
    const c0 = narrow
      ? new THREE.Vector3((.10 - .5) * visibleWidth, (.5 - 1.04) * visibleHeight, 0)
      : new THREE.Vector3((.02 - .5) * visibleWidth, (.5 - 1.06) * visibleHeight, 0);
    const c3 = narrow
      ? new THREE.Vector3((.97 - .5) * visibleWidth, (.5 - -.03) * visibleHeight, 0)
      : new THREE.Vector3((1.08 - .5) * visibleWidth, (.5 - -.05) * visibleHeight, 0);
    const bow = c0.distanceTo(c3) * (narrow ? .12 : .1);
    const dir = c3.clone().sub(c0);
    const perp = new THREE.Vector3(dir.y, -dir.x, 0).normalize();
    const c1 = c0.clone().addScaledVector(dir, .33).addScaledVector(perp, bow);
    const c2 = c0.clone().addScaledVector(dir, .66).addScaledVector(perp, bow);
    (ropeUniforms.uC0.value as import('three').Vector3).copy(c0);
    (ropeUniforms.uC1.value as import('three').Vector3).copy(c1);
    (ropeUniforms.uC2.value as import('three').Vector3).copy(c2);
    (ropeUniforms.uC3.value as import('three').Vector3).copy(c3);
    (ropeUniforms.uAxis.value as import('three').Vector3).copy(dir.normalize());
    const wide = camera.aspect > 1.05;
    ropeUniforms.uWide.value = wide ? 1 : 0;
    ropeUniforms.uNarrow.value = wide ? 0 : 1;
    if (composer) composer.render(); else renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  const pick = (clientX: number, clientY: number) => {
    const rect = mount.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.ray.intersectPlane(pointerPlane, hitPoint) !== null
      && Math.abs(hitPoint.x) < 3.4 && Math.abs(hitPoint.y) < 2.8;
  };
  const move = (e: PointerEvent) => {
    insideHero = true;
    wake();
    const now = performance.now();
    if (lastPtr) {
      const dtms = Math.max(8, now - lastPtr.t);
      const dx = e.clientX - lastPtr.x, dy = e.clientY - lastPtr.y;
      speedSmooth = Math.max(speedSmooth, Math.min(1.2, (Math.hypot(dx, dy) / dtms) * .8));
      const rect = hero.getBoundingClientRect();
    }
    lastPtr = { x: e.clientX, y: e.clientY, t: now };
    const r = hero.getBoundingClientRect();
    targetX = ((e.clientX - r.left) / r.width - .5) * 2;
    targetY = ((e.clientY - r.top) / r.height - .5) * 2;
    // ripple center follows the RAW cursor position immediately (no lag)
    pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    raycaster.setFromCamera(pointerNdc, camera);
    raycaster.ray.intersectPlane(pointerPlane, immediatePointer);
    if (e.pointerType === 'mouse' && !reduce.matches) {
      const over = pick(e.clientX, e.clientY);
      if (over !== hover) { hover = over; hero.style.cursor = hover ? 'pointer' : ''; }
    }
  };
  const leave = () => {
    insideHero = false; lastPtr = undefined; speedSmooth = 0;
    targetX = targetY = 0; hover = false; hero.style.cursor = '';
  };
  const down = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const up = (e: PointerEvent) => {
    const start = downAt;
    downAt = undefined;
    if (!start || performance.now() - start.t > 700) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 9) return;
    if (pick(e.clientX, e.clientY)) scrollToSection('#contact', reduce.matches);
  };
  const animate = (now: number) => {
    frame = 0;
    try {
      if (!visible || !pageVisible) return;
    frameCount++;
    if (frameCount === 1 || frameCount === 150 || frameCount === 40) renderer.info.reset();
    if (frameCount === 1) diag(`f1 dpr=${renderer.getPixelRatio()} narrow=${ropeUniforms.uNarrow.value} reveal=${ropeUniforms.uReveal.value.toFixed(2)} calls=${renderer.info.render.calls} pts=${renderer.info.render.points} tris=${renderer.info.render.triangles}`);
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : .016;
    lastTime = now;
    if (!reduce.matches) elapsed += dt;
    const t = elapsed;
    const damp = 1 - Math.exp(-dt * 3.2);
    currentX += ((reduce.matches ? 0 : targetX) - currentX) * damp;
    currentY += ((reduce.matches ? 0 : targetY) - currentY) * damp;
    speedSmooth *= Math.exp(-dt * 2.2);
    presence += ((insideHero ? 1 : 0) - presence) * (1 - Math.exp(-dt * 4));
    const spinTarget = Math.min(1, speedSmooth) * presence;
    spin += (spinTarget - spin) * (1 - Math.exp(-dt * (spinTarget > spin ? 5 : 1.4)));
    starUniforms.uTime.value = t;
    starUniforms.uPresence.value = presence;
    (starUniforms.uParallax.value as import('three').Vector2).set(currentX * .45, currentY * .3);
    stars.rotation.z = t * .004;
    ropeUniforms.uTime.value = t;
    // slow molecular screw around its own axis + the pointer's energy
    if (!reduce.matches) ropeUniforms.uTwist.value += (.12 + spin * .55) * dt;
    ropeUniforms.uSway.value = reduce.matches ? 0 : .16 + spin * .12;
    ropeUniforms.uReveal.value = reduce.matches ? 1 : Math.min(1, ropeUniforms.uReveal.value + dt / .9);
    // zero-lag ripple center: micro-smoothed raw cursor (26/s ≈ 40ms), instant strength
    smoothPointer.lerp(immediatePointer, 1 - Math.exp(-dt * 26));
    strength += (presence - strength) * (1 - Math.exp(-dt * (presence > strength ? 16 : 3)));
    ropeUniforms.uStrength.value = strength;
    (ropeUniforms.uPointer.value as import('three').Vector3).copy(smoothPointer);
    // zero rotation of the composition: only the camera keeps a whisper of parallax
    camera.position.set(currentX * .3, .1 - currentY * .16, 9.4);
    camera.lookAt(0, 0, 0);
    mount.dataset.storm = spin.toFixed(2);
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (frameCount === 1) diag('render ok f1' + (composer ? ' composer' : ' direct'));
    if (frameCount === 150) {
      // pixel heatmap: 8×6 blocks across the whole canvas — where is the DNA?
      try {
        const gl = renderer.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const cols = 8, rows = 6, bw = Math.max(2, W / cols | 0), bh = Math.max(2, H / rows | 0);
        const px = new Uint8Array(bw * bh * 4);
        const rowMax: string[] = [];
        for (let r = 0; r < rows; r++) {
          let rowStr = '';
          for (let c = 0; c < cols; c++) {
            gl.readPixels(c * bw, (rows - 1 - r) * bh, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, px);
            let mx = 0;
            for (let i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i], px[i + 1], px[i + 2]);
            rowStr += (mx > 99 ? 'XX' : mx > 39 ? String(mx >> 4) : '·') + ' ';
          }
          rowMax.push(rowStr);
        }
        diag(`HM ${W}x${H} | ` + rowMax.join('/'));
      } catch (e) { diag('probe fail: ' + (e instanceof Error ? e.message : String(e))); }
    }
    if (!reduce.matches) frame = requestAnimationFrame(animate);
    } catch (error) {
      if (frameCount < 4) diag('ANIMATE CRASH: ' + (error instanceof Error ? (error.message + ' | ' + String(error.stack).slice(0, 120)) : String(error)));
      if (!reduce.matches) frame = requestAnimationFrame(animate);
    }
  };
  const wake = () => { if (!frame && visible && pageVisible) frame = requestAnimationFrame(animate); };
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; lastTime = 0; if (visible) wake(); }, { rootMargin: '60px' });
  io.observe(mount);
  const visibility = () => { pageVisible = !document.hidden; lastTime = 0; wake(); };
  document.addEventListener('visibilitychange', visibility);
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerleave', leave);
  hero.addEventListener('pointerdown', down, { passive: true });
  hero.addEventListener('pointerup', up, { passive: true });
  const lost = (event: Event) => { event.preventDefault(); mount.dataset.scene = 'fallback'; visible = false; };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  mount.appendChild(renderer.domElement);
  mount.dataset.scene = 'ready';
  resize();
  diag('stage: resize done');
  wake();
  diag('stage: wake done');
  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect(); io.disconnect(); themeObserver.disconnect();
    hero.style.cursor = '';
    document.removeEventListener('visibilitychange', visibility);
    hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', leave);
    hero.removeEventListener('pointerdown', down); hero.removeEventListener('pointerup', up);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    starGeometry.dispose(); geometry.dispose();
    (stars.material as import('three').Material).dispose();
    ropeMaterial.dispose();
    bloom?.dispose(); composer?.dispose(); renderer.dispose();
    renderer.domElement.remove();
  };
}
