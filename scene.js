// O céu da galeria: um plano com gradiente + partículas + gotas no vidro.
// Cada tema meteorológico é um conjunto de valores para os uniforms; a troca de
// tema faz morph via GSAP. A obra carregada pode tingir o céu (opts.tint) e a
// hora real posiciona o sol/lua (opts.sun).
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const THEMES = {
  rest: {
    top: '#c6d3e4', bottom: '#f2e5d5',
    sun: '#ffe7bf', sunPos: [0.8, 0.74], sunSize: 0.0, sunGlow: 0.32, sunPower: 0.55,
    fog: '#ffffff', fogAmount: 0.18, drops: 0,
    particle: '#ffffff', count: 0.25, size: 1.6, fall: 0.0, rise: 0.08, sway: 0.5, drift: 0.05,
    stretch: 0, soft: 1, twinkle: 0.3, opacity: 0.55, blend: 'normal',
  },
  clear: {
    top: '#6fa9e3', bottom: '#f7e9cb',
    sun: '#fff0c2', sunPos: [0.78, 0.72], sunSize: 0.055, sunGlow: 0.42, sunPower: 0.95,
    fog: '#ffffff', fogAmount: 0.0, drops: 0,
    particle: '#fff6dc', count: 0.18, size: 1.4, fall: 0.0, rise: 0.05, sway: 0.4, drift: 0.04,
    stretch: 0, soft: 1, twinkle: 0.5, opacity: 0.5, blend: 'additive',
  },
  cloudy: {
    top: '#8e9ba9', bottom: '#dfe4e9',
    sun: '#ffffff', sunPos: [0.7, 0.7], sunSize: 0.0, sunGlow: 0.5, sunPower: 0.3,
    fog: '#f3f5f7', fogAmount: 0.65, drops: 0,
    particle: '#ffffff', count: 0.12, size: 1.2, fall: 0.0, rise: 0.02, sway: 0.4, drift: 0.12,
    stretch: 0, soft: 1, twinkle: 0, opacity: 0.35, blend: 'normal',
  },
  fog: {
    top: '#c3c7cb', bottom: '#e9eaeb',
    sun: '#ffffff', sunPos: [0.6, 0.8], sunSize: 0.0, sunGlow: 0.6, sunPower: 0.25,
    fog: '#f8f8f8', fogAmount: 0.9, drops: 0.15,
    particle: '#ffffff', count: 0.3, size: 2.6, fall: 0.0, rise: 0.0, sway: 0.9, drift: 0.08,
    stretch: 0, soft: 1, twinkle: 0, opacity: 0.25, blend: 'normal',
  },
  rain: {
    top: '#2f4358', bottom: '#6a8196',
    sun: '#ffffff', sunPos: [0.5, 0.9], sunSize: 0.0, sunGlow: 0.5, sunPower: 0.12,
    fog: '#7f93a6', fogAmount: 0.45, drops: 0.75,
    particle: '#dbe8f4', count: 0.85, size: 3.4, fall: 9.0, rise: 0.0, sway: 0.05, drift: 0.0,
    stretch: 1, soft: 0.5, twinkle: 0, opacity: 0.6, blend: 'normal',
  },
  snow: {
    top: '#b3c3d3', bottom: '#f0f3f6',
    sun: '#ffffff', sunPos: [0.7, 0.8], sunSize: 0.0, sunGlow: 0.55, sunPower: 0.3,
    fog: '#ffffff', fogAmount: 0.4, drops: 0,
    particle: '#ffffff', count: 0.7, size: 2.1, fall: 0.9, rise: 0.0, sway: 0.9, drift: 0.03,
    stretch: 0, soft: 0.9, twinkle: 0, opacity: 0.9, blend: 'normal',
  },
  storm: {
    top: '#181b30', bottom: '#3a3f63',
    sun: '#ffffff', sunPos: [0.5, 0.9], sunSize: 0.0, sunGlow: 0.5, sunPower: 0.05,
    fog: '#4b5075', fogAmount: 0.6, drops: 1.0,
    particle: '#c9d3f0', count: 1.0, size: 3.6, fall: 14.0, rise: 0.0, sway: 0.3, drift: 0.0,
    stretch: 1, soft: 0.6, twinkle: 0, opacity: 0.55, blend: 'normal',
  },
  night: {
    top: '#060a1e', bottom: '#1b2246',
    sun: '#f4f1de', sunPos: [0.76, 0.76], sunSize: 0.028, sunGlow: 0.2, sunPower: 0.7,
    fog: '#1f2750', fogAmount: 0.25, drops: 0,
    particle: '#ffffff', count: 0.6, size: 1.2, fall: 0.0, rise: 0.0, sway: 0.0, drift: 0.0,
    stretch: 0, soft: 0.5, twinkle: 1.0, opacity: 0.95, blend: 'additive',
  },
};

// Quanto a paleta da obra pesa sobre a paleta do tema.
const TINT_STRENGTH = 0.38;

// ---------- shaders ----------

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float hash1(float p) { return fract(sin(p * 127.1) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
    return v;
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uTop, uBottom, uSun, uFog;
  uniform vec2 uSunPos;
  uniform float uSunSize, uSunGlow, uSunPower, uFogAmount, uFlash, uTime, uAspect;
  ${NOISE_GLSL}

  void main() {
    float y = smoothstep(0.0, 1.0, vUv.y);
    vec3 col = mix(uBottom, uTop, y);

    vec2 p = vec2((vUv.x - uSunPos.x) * uAspect, vUv.y - uSunPos.y);
    float d = length(p);
    float disc = smoothstep(uSunSize + 0.003, uSunSize - 0.003, d);
    float glow = exp(-(d * d) / (uSunGlow * uSunGlow + 1e-4));
    col = mix(col, uSun, clamp(disc + glow * uSunPower, 0.0, 1.0));

    vec2 q = vec2(vUv.x * uAspect * 1.6 + uTime * 0.018, vUv.y * 1.6 - uTime * 0.004);
    float n = fbm(q + fbm(q * 0.7 - uTime * 0.01) * 0.6);
    col = mix(col, uFog, uFogAmount * smoothstep(0.32, 0.78, n));

    col += vec3(uFlash);

    float vig = smoothstep(1.35, 0.35, length((vUv - 0.5) * vec2(uAspect, 1.0)));
    col *= mix(0.86, 1.0, vig);

    col += (hash(vUv * 1600.0 + fract(uTime)) - 0.5) * 0.028;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Gotas escorrendo por um vidro na frente do céu. Duas camadas de gotas em
// movimento + uma camada de gotas paradas. Saída: realce (alpha) sobre o céu.
const GLASS_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uAspect, uDrops;
  ${NOISE_GLSL}

  // Uma camada de gotas: grade de células, cada célula com uma gota que cai
  // em tempo próprio, deixando um rastro de gotículas.
  vec2 dropsLayer(vec2 uv, float t) {
    vec2 grid = vec2(6.0, 1.0) * 2.4;
    vec2 cellUv = uv * grid;
    vec2 id = floor(cellUv);
    float colSeed = hash1(id.x * 7.3);
    // Coluna inteira desliza em tempo diferente para quebrar o padrão.
    cellUv.y += t * (0.25 + colSeed * 0.35) + colSeed * 9.0;
    id = floor(cellUv);
    vec2 st = fract(cellUv) - 0.5;
    float seed = hash(id);
    float x = (seed - 0.5) * 0.7;
    float wig = sin(t * 2.0 + seed * 20.0 + st.y * 8.0) * 0.06 * (1.0 - abs(st.y * 2.0));
    x += wig;
    float y = st.y;
    vec2 dropPos = vec2(st.x - x, y * 2.0 * grid.y / grid.x);
    float drop = smoothstep(0.045, 0.02, length(dropPos));

    // Rastro: pontinhos acima da gota que somem com o tempo.
    float trailY = fract(st.y * 8.0 + t * 0.0) - 0.5;
    vec2 trailPos = vec2(st.x - x, trailY * 0.5);
    float trail = smoothstep(0.03, 0.01, length(trailPos));
    trail *= smoothstep(0.5, -0.2, st.y) * step(y, 0.4);
    float trailMask = smoothstep(0.5, 0.1, st.y);
    trail *= trailMask;

    return vec2(drop, trail * 0.5);
  }

  float staticDrops(vec2 uv, float t) {
    vec2 cellUv = uv * 42.0;
    vec2 id = floor(cellUv);
    vec2 st = fract(cellUv) - 0.5;
    float seed = hash(id * 1.7);
    if (seed < 0.5) return 0.0;
    vec2 pos = st - (vec2(hash(id + 3.1), hash(id + 5.7)) - 0.5) * 0.6;
    float life = fract(t * 0.05 + seed * 3.0);
    float fade = smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.7, life);
    return smoothstep(0.12 * (0.4 + seed * 0.6), 0.02, length(pos)) * fade;
  }

  void main() {
    if (uDrops <= 0.001) discard;
    vec2 uv = vec2(vUv.x * uAspect, vUv.y);
    vec2 a = dropsLayer(uv, uTime);
    vec2 b = dropsLayer(uv * 1.45 + 3.7, uTime * 1.2);
    float s = staticDrops(uv, uTime);
    float highlight = a.x + b.x * 0.8 + a.y + b.y * 0.6 + s * 0.35;
    highlight = clamp(highlight, 0.0, 1.0) * uDrops;
    // Borda clara, miolo levemente escuro: lê como gota de água.
    vec3 col = vec3(1.0);
    gl_FragColor = vec4(col, highlight * 0.55);
  }
`;

const DOT_VERT = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aRand;
  uniform float uTime, uFall, uRise, uSway, uDrift, uWind, uSize, uCount, uPixelRatio;
  uniform vec2 uPointer;
  uniform float uPointerLight;
  varying float vSeed, vAlpha;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    float speed = 0.6 + aRand.x * 0.8;
    p.y = mod(p.y - uTime * uFall * speed + uTime * uRise * speed, 24.0) - 12.0;
    p.x += sin(uTime * (0.25 + aRand.y * 0.6) + aRand.z * 6.2831) * uSway * (0.4 + aRand.x);
    p.x = mod(p.x + 16.0 + uTime * (uDrift + uWind) * speed, 32.0) - 16.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / clip.w;
    float near = 1.0 - smoothstep(0.0, 0.55, length(ndc - uPointer));
    float lit = 1.0 + uPointerLight * near * 1.6;
    gl_PointSize = uSize * (0.55 + aRand.z * 0.9) * uPixelRatio * 26.0 / -mv.z * (1.0 + uPointerLight * near * 0.8);
    vAlpha = step(aSeed, uCount) * (0.55 + 0.45 * aRand.y) * lit;
    gl_Position = clip;
  }
`;

const DOT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity, uStretch, uSoft, uTwinkle, uTime;
  varying float vSeed, vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    uv.x *= 1.0 + uStretch * 7.0;
    float d = length(uv);
    float a = smoothstep(0.5, 0.5 - 0.46 * uSoft - 0.03, d);
    float tw = 1.0 - uTwinkle * 0.6 * (0.5 + 0.5 * sin(uTime * (1.5 + vSeed * 4.0) + vSeed * 60.0));
    gl_FragColor = vec4(uColor, min(1.0, a * vAlpha * uOpacity * tw));
  }
`;

// ---------- setup ----------

const canvas = document.querySelector('#sky');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch {
  canvas.remove();
  renderer = null;
}

const api = { setTheme() {}, setWind() {}, setBusy() {}, ready: false };
window.gallerySky = api;

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const c = (hex) => new THREE.Color(hex);
  const t0 = THEMES.rest;

  const skyUniforms = {
    uTop: { value: c(t0.top) },
    uBottom: { value: c(t0.bottom) },
    uSun: { value: c(t0.sun) },
    uFog: { value: c(t0.fog) },
    uSunPos: { value: new THREE.Vector2(...t0.sunPos) },
    uSunSize: { value: t0.sunSize },
    uSunGlow: { value: t0.sunGlow },
    uSunPower: { value: t0.sunPower },
    uFogAmount: { value: t0.fogAmount },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
  };

  const quad = new THREE.PlaneGeometry(2, 2);

  const sky = new THREE.Mesh(
    quad,
    new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SKY_FRAG, uniforms: skyUniforms, depthWrite: false, depthTest: false }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const COUNT = 3200;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const rands = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 32;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
    positions[i * 3 + 2] = -Math.random() * 14 + 2;
    seeds[i] = Math.random();
    rands[i * 3] = Math.random();
    rands[i * 3 + 1] = Math.random();
    rands[i * 3 + 2] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 3));

  const dotUniforms = {
    uTime: { value: 0 },
    uFall: { value: t0.fall },
    uRise: { value: t0.rise },
    uSway: { value: t0.sway },
    uDrift: { value: t0.drift },
    uWind: { value: 0 },
    uSize: { value: t0.size },
    uCount: { value: t0.count },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uColor: { value: c(t0.particle) },
    uOpacity: { value: t0.opacity },
    uStretch: { value: t0.stretch },
    uSoft: { value: t0.soft },
    uTwinkle: { value: t0.twinkle },
    uPointer: { value: new THREE.Vector2(9, 9) },
    uPointerLight: { value: 0 },
  };

  const dotMaterial = new THREE.ShaderMaterial({
    vertexShader: DOT_VERT,
    fragmentShader: DOT_FRAG,
    uniforms: dotUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
  });
  const dots = new THREE.Points(geometry, dotMaterial);
  dots.frustumCulled = false;
  scene.add(dots);

  const glassUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uDrops: { value: 0 },
  };
  const glass = new THREE.Mesh(
    quad,
    new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: GLASS_FRAG,
      uniforms: glassUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  glass.frustumCulled = false;
  glass.renderOrder = 2;
  scene.add(glass);

  // ---------- resize / pointer ----------

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    skyUniforms.uAspect.value = w / h;
    glassUniforms.uAspect.value = w / h;
  }
  window.addEventListener('resize', resize);
  resize();

  const pointer = { x: 0, y: 0, active: false };
  window.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { pointer.active = false; });

  // ---------- theme morph ----------

  let currentTheme = 'rest';
  let flashCall = null;
  const speed = { value: 1 };

  function scheduleFlash() {
    if (flashCall) flashCall.kill();
    if (currentTheme !== 'storm' || REDUCED_MOTION) return;
    flashCall = gsap.delayedCall(2 + Math.random() * 5, () => {
      const tl = gsap.timeline({ onComplete: scheduleFlash });
      tl.to(skyUniforms.uFlash, { value: 0.55, duration: 0.05 })
        .to(skyUniforms.uFlash, { value: 0.08, duration: 0.12 })
        .to(skyUniforms.uFlash, { value: 0.4, duration: 0.05 })
        .to(skyUniforms.uFlash, { value: 0, duration: 0.7, ease: 'power3.out' });
      window.dispatchEvent(new CustomEvent('sky:flash'));
    });
  }

  // Posição e cor do sol (ou da lua) a partir do progresso no dia/noite.
  function sunFromProgress(sun, theme) {
    const p = Math.min(1, Math.max(0, sun.progress));
    const arc = Math.sin(p * Math.PI);
    const x = 0.14 + p * 0.72;
    const y = 0.18 + arc * 0.62;
    if (sun.isDay) {
      const horizon = c('#ffb070');
      const noon = c(theme.sun);
      return { pos: [x, y], color: horizon.lerp(noon, Math.min(1, arc * 1.6)) };
    }
    return { pos: [x, y], color: c(theme.sun) };
  }

  api.setTheme = (name, opts = {}) => {
    const t = THEMES[name] || THEMES.rest;
    currentTheme = THEMES[name] ? name : 'rest';
    const duration = REDUCED_MOTION ? 0 : 2.2;
    const ease = 'power2.inOut';

    let top = c(t.top);
    let bottom = c(t.bottom);
    let particle = c(t.particle);
    let fog = c(t.fog);
    if (opts.tint) {
      const strength = opts.tint.strength ?? TINT_STRENGTH;
      top = top.lerp(c(opts.tint.dark), strength);
      bottom = bottom.lerp(c(opts.tint.light), strength);
      fog = fog.lerp(c(opts.tint.light), strength * 0.6);
      particle = particle.lerp(c(opts.tint.light), strength * 0.4);
    }

    let sunPos = t.sunPos;
    let sunColor = c(t.sun);
    if (opts.sun && Number.isFinite(opts.sun.progress)) {
      const s = sunFromProgress(opts.sun, t);
      sunPos = s.pos;
      sunColor = s.color;
    }

    const tweenColor = (uniform, target) => {
      gsap.to(uniform.value, { r: target.r, g: target.g, b: target.b, duration, ease });
    };

    tweenColor(skyUniforms.uTop, top);
    tweenColor(skyUniforms.uBottom, bottom);
    tweenColor(skyUniforms.uSun, sunColor);
    tweenColor(skyUniforms.uFog, fog);
    tweenColor(dotUniforms.uColor, particle);

    gsap.to(skyUniforms.uSunPos.value, { x: sunPos[0], y: sunPos[1], duration, ease });
    gsap.to(skyUniforms.uSunSize, { value: t.sunSize, duration, ease });
    gsap.to(skyUniforms.uSunGlow, { value: t.sunGlow, duration, ease });
    gsap.to(skyUniforms.uSunPower, { value: t.sunPower, duration, ease });
    gsap.to(skyUniforms.uFogAmount, { value: t.fogAmount, duration, ease });
    gsap.to(glassUniforms.uDrops, { value: t.drops, duration: duration * 1.4, ease });

    gsap.to(dotUniforms.uFall, { value: t.fall, duration, ease });
    gsap.to(dotUniforms.uRise, { value: t.rise, duration, ease });
    gsap.to(dotUniforms.uSway, { value: t.sway, duration, ease });
    gsap.to(dotUniforms.uDrift, { value: t.drift, duration, ease });
    gsap.to(dotUniforms.uSize, { value: t.size, duration, ease });
    gsap.to(dotUniforms.uCount, { value: t.count, duration, ease });
    gsap.to(dotUniforms.uOpacity, { value: t.opacity, duration, ease });
    gsap.to(dotUniforms.uStretch, { value: t.stretch, duration, ease });
    gsap.to(dotUniforms.uSoft, { value: t.soft, duration, ease });
    gsap.to(dotUniforms.uTwinkle, { value: t.twinkle, duration, ease });
    gsap.to(dotUniforms.uPointerLight, { value: currentTheme === 'night' ? 1 : 0, duration, ease });

    dotMaterial.blending = t.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
    dotMaterial.needsUpdate = true;

    scheduleFlash();
  };

  // Vento em km/h empurra as partículas para o lado.
  api.setWind = (kmh) => {
    const wind = Math.min(1, Math.max(0, Number(kmh) || 0) / 60) * 1.6;
    gsap.to(dotUniforms.uWind, { value: wind, duration: 2, ease: 'power2.inOut' });
  };

  // Enquanto carrega, o céu acelera.
  api.setBusy = (busy) => {
    gsap.to(speed, { value: busy ? 2.4 : 1, duration: busy ? 0.8 : 1.6, ease: 'power2.inOut' });
  };

  api.ready = true;

  // ---------- loop ----------

  const clock = new THREE.Clock();
  let elapsed = 0;
  let visible = !document.hidden;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += (REDUCED_MOTION ? dt * 0.08 : dt) * speed.value;
    skyUniforms.uTime.value = elapsed;
    dotUniforms.uTime.value = elapsed;
    glassUniforms.uTime.value = elapsed;

    camera.position.x += (pointer.x * 0.45 - camera.position.x) * 0.04;
    camera.position.y += (-pointer.y * 0.3 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    const target = pointer.active ? { x: pointer.x, y: -pointer.y } : { x: 9, y: 9 };
    dotUniforms.uPointer.value.x += (target.x - dotUniforms.uPointer.value.x) * 0.08;
    dotUniforms.uPointer.value.y += (target.y - dotUniforms.uPointer.value.y) * 0.08;

    renderer.render(scene, camera);
  }
  frame();

  // Ao carregar: o céu "acorda".
  if (!REDUCED_MOTION) {
    dotUniforms.uOpacity.value = 0;
    skyUniforms.uSunPower.value = 0;
    gsap.to(dotUniforms.uOpacity, { value: t0.opacity, duration: 2.4, ease: 'power2.out', delay: 0.3 });
    gsap.to(skyUniforms.uSunPower, { value: t0.sunPower, duration: 2.4, ease: 'power2.out', delay: 0.2 });
  }
}
