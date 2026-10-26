import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const sky = '#050a16';

function makeTerrain(side: number, mobile: boolean) {
  const geometry = new THREE.PlaneGeometry(12, 22, mobile ? 36 : 74, mobile ? 44 : 100);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const wave = Math.sin(x * 1.5 + z * .46) * .42 + Math.cos(z * .8 - x * .6) * .3;
    const detail = Math.sin(x * 13 + z * 9) * Math.cos(z * 8) * .055;
    const shore = Math.max(0, (side * x + 6) / 12);
    p.setY(i, .15 + Math.pow(shore, 1.25) * (2.5 + wave * 2) + detail * 1.4);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#0d1e39', roughness: .72, metalness: .38, flatShading: true,
  }));
  mesh.position.set(side * 8.3, -.85, -2);
  mesh.receiveShadow = true;
  return mesh;
}

function makeLogo(image: HTMLImageElement, texture: THREE.Texture) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
  // Trace the exact artwork silhouette, rather than substituting a generic star.
  for (let y = 0; y < size; y += 1) {
    let a = -1, b = -1;
    for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3] > 100) { if (a < 0) a = x; b = x; }
    }
    if (a >= 0) {
      left.push(new THREE.Vector2((a / (size - 1) - .5) * 3.9, (.5 - y / (size - 1)) * 3.9));
      right.push(new THREE.Vector2((b / (size - 1) - .5) * 3.9, (.5 - y / (size - 1)) * 3.9));
    }
  }
  const shape = new THREE.Shape([...left, ...right.reverse()]);
  const edge = new THREE.ExtrudeGeometry(shape, { depth: .19, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .025, bevelThickness: .035 });
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: '#1166d4', metalness: .86, roughness: .22, clearcoat: 1, clearcoatRoughness: .16 });
  const group = new THREE.Group();
  const body = new THREE.Mesh(edge, bodyMaterial);
  body.castShadow = true;
  group.add(body);

  // A tessellated, shallow relief preserves the supplied highlights and folds.
  const relief = new THREE.PlaneGeometry(3.9, 3.9, 120, 120);
  const pos = relief.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 1.95, y = pos.getY(i) / 1.95;
    const r = Math.sqrt(x * x + y * y);
    const angle = Math.atan2(y, x);
    pos.setZ(i, .25 + Math.max(0, 1 - r) * (.12 + .11 * Math.sin(angle * 4 + r * 5)));
  }
  relief.computeVertexNormals();
  const faceMaterial = new THREE.MeshPhysicalMaterial({
    map: texture, transparent: true, alphaTest: .45, metalness: .32,
    roughness: .46, clearcoat: .22, clearcoatRoughness: .3, envMapIntensity: .18,
    emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: .48,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(relief, faceMaterial));
  return group;
}

export async function createHeroScene(host: HTMLDivElement, cancelled: () => boolean) {
  const mobile = matchMedia('(max-width: 767px)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.FogExp2(sky, .055);
  const camera = new THREE.PerspectiveCamera(mobile ? 43 : 39, 1, .1, 65);
  camera.position.set(0, 1.3, 9.3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .32;
  room.dispose();
  const ambient = new THREE.HemisphereLight('#5d95d2', '#050713', .8);
  scene.add(ambient);
  const key = new THREE.DirectionalLight('#61e7ff', 1.8);
  key.position.set(-4, 6, 5);
  key.castShadow = !mobile;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -7;
  key.shadow.camera.right = key.shadow.camera.top = 7;
  key.shadow.bias = -.001;
  scene.add(key);
  const violet = new THREE.PointLight('#8b5cff', 32, 16, 2);
  violet.position.set(4, 2, -1);
  scene.add(violet);
  const blue = new THREE.PointLight('#087cff', 24, 20, 2);
  blue.position.set(-3, 1, 2);
  scene.add(blue);
  scene.add(makeTerrain(-1, mobile), makeTerrain(1, mobile));
  const rockGeometry = new THREE.DodecahedronGeometry(1, mobile ? 1 : 3);
  const rockPositions = rockGeometry.attributes.position;
  for (let i = 0; i < rockPositions.count; i++) {
    const x = rockPositions.getX(i), y = rockPositions.getY(i), z = rockPositions.getZ(i);
    const radius = 1 + Math.sin(x * 13 + y * 8 + z * 7) * .12;
    rockPositions.setXYZ(i, x * radius, y * radius, z * radius);
  }
  rockGeometry.computeVertexNormals();
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#0b1730', roughness: .78, metalness: .25 });
  for (const [x, y, z, scale] of [[-3.1, -.5, 2.3, 1], [3.8, -.3, 2, 1.6], [2.9, -.55, 4.3, .8], [-4.6, -.1, -3, 1.5]]) {
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(x, y, z);
    rock.scale.set(scale * 1.4, scale * .65, scale);
    rock.rotation.set(.1, x * .5, .1);
    rock.castShadow = !mobile;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  const water = new THREE.Mesh(new THREE.PlaneGeometry(30, 32, 1, 1), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time;
    void main(){
      float wave=sin(vUv.y*480.+sin(vUv.x*150.+time*.3)*2.+time*.4)*.5+.5;
      float beam=exp(-pow((vUv.x-.5)*18.+sin(vUv.y*90.)*.25,2.));
      float fade=smoothstep(.0,.5,vUv.y);
      vec3 col=mix(vec3(.012,.026,.055),vec3(.025,.1,.19),wave*.1);
      col+=beam*vec3(.025,.15,.29)*(.5+wave*.4)*fade;
      gl_FragColor=vec4(col,1.);
    }`,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -.69, -3);
  scene.add(water);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, .12, 64), new THREE.MeshStandardMaterial({ color: '#071122', roughness: .65, metalness: .25, envMapIntensity: .1 }));
  plinth.position.set(0, -.55, 0);
  plinth.receiveShadow = true;
  scene.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.77, .008, 6, 100), new THREE.MeshBasicMaterial({ color: '#246a9c', transparent: true, opacity: .7 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -.44;
  scene.add(ring);
  let texture: THREE.Texture | undefined;
  const release = () => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    texture?.dispose(); environment.dispose(); pmrem.dispose(); renderer.dispose();
  };
  try { texture = await new THREE.TextureLoader().loadAsync('/brand/sesemi-star.webp'); }
  catch (error) { release(); throw error; }
  if (cancelled()) { release(); return () => {}; }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const image = texture.image;
  if (!(image instanceof HTMLImageElement)) { release(); throw new Error('Logo image is unavailable.'); }
  const logo = makeLogo(image, texture);
  logo.position.set(0, 1.65, 0);
  logo.rotation.y = -.2;
  scene.add(logo);

  // An inexpensive art-directed reflection, not a second scene render.
  const reflection = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: .12, depthWrite: false, color: '#338aca',
  }));
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.set(0, -.675, 1.8);
  scene.add(reflection);

  let frame = 0, visible = true, pageVisible = !document.hidden;
  let pointerX = 0, pointerY = 0, currentX = 0, currentY = 0, scroll = 0;
  let lastTime = 0, elapsed = 0;
  const hero = host.closest<HTMLElement>('.hero')!;
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize); ro.observe(host);
  const move = (e: PointerEvent) => {
    if (reduce.matches || e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    pointerX = ((e.clientX - r.left) / r.width - .5) * 2;
    pointerY = ((e.clientY - r.top) / r.height - .5) * 2;
  };
  const reset = () => { pointerX = pointerY = 0; };
  const onScroll = () => { scroll = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / hero.offsetHeight)); };
  const animate = (now: number) => {
    frame = 0;
    if (!visible || !pageVisible) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : .016;
    lastTime = now;
    if (!reduce.matches) elapsed += dt;
    const damping = 1 - Math.exp(-dt * 3.4);
    currentX += ((reduce.matches ? 0 : pointerX) - currentX) * damping;
    currentY += ((reduce.matches ? 0 : pointerY) - currentY) * damping;
    const travel = reduce.matches ? 0 : scroll;
    camera.position.set(currentX * .55, 1.3 - currentY * .28 + travel * .6, 9.3 + travel * 1.1);
    camera.lookAt(0, .85 + travel * .15, 0);
    logo.rotation.set(currentY * .07 + Math.sin(elapsed * .22) * .025, -.2 + currentX * .18 + Math.sin(elapsed * .18) * .025, Math.sin(elapsed * .2) * .018);
    logo.position.y = 1.65 + Math.sin(elapsed * .65) * .055 - travel * .22;
    blue.position.x = -3 + currentX * .6;
    violet.intensity = 32 + Math.sin(elapsed * .3) * 2;
    (water.material as THREE.ShaderMaterial).uniforms.time.value = elapsed;
    renderer.render(scene, camera);
    host.dataset.camera = `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)}`;
    if (!reduce.matches) frame = requestAnimationFrame(animate);
  };
  const wake = () => { if (!frame && visible && pageVisible) frame = requestAnimationFrame(animate); };
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; lastTime = 0; if (visible) wake(); }, { rootMargin: '80px' });
  io.observe(host);
  const visibility = () => { pageVisible = !document.hidden; lastTime = 0; wake(); };
  const changed = () => { reset(); wake(); };
  const lost = (event: Event) => { event.preventDefault(); host.dataset.scene = 'fallback'; visible = false; };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', visibility);
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerleave', reset);
  window.addEventListener('scroll', onScroll, { passive: true });
  reduce.addEventListener('change', changed);
  host.appendChild(renderer.domElement);
  host.dataset.scene = 'ready';
  resize(); onScroll(); wake();
  return () => {
    cancelAnimationFrame(frame); ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', reset);
    window.removeEventListener('scroll', onScroll); reduce.removeEventListener('change', changed);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    release();
    renderer.domElement.remove();
  };
}
