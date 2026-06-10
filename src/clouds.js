import * as THREE from 'three';
import { CLOUD_Y } from './config.js';
import { NOISE_GLSL } from './shaders.js';

// Procedural cloud system: two camera-following planes (a main billowing
// deck and a higher, faster wisp layer). The fragment shader builds cloud
// masses from domain-warped fbm and shades them like volumes:
//
//   - dense cores darken (bodies read as masses, not a tinted sheet)
//   - a sunward density gradient lights one side and shades the other
//   - thin edges facing the sun get a bright "silver lining" — at dusk
//     this turns into the orange-pink rims of the reference look
//   - with distance, clouds blend into the horizon haze color (aerial
//     perspective) before fading out
//
// All colors are resolved on the CPU each frame from the sky/weather
// state, so the same shader does white noon decks, pink sunset rims,
// dark night clouds and storm gloom.

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uCover;     // 0..1 coverage
  uniform vec3 uBodyCol;    // lit body color
  uniform vec3 uShadeCol;   // shaded body / underside color
  uniform vec3 uLitCol;     // sun-facing rim color (incl. intensity)
  uniform vec3 uHazeCol;    // horizon haze for aerial perspective
  uniform vec2 uSunXZ;
  uniform vec2 uCamXZ;
  uniform float uFlash;
  uniform vec2 uScale;      // noise scale (layer-specific)
  uniform vec2 uDrift;      // wind drift speed
  uniform float uAlpha;     // layer opacity
  varying vec3 vW;

  ${NOISE_GLSL}

  void main() {
    vec2 rel = vW.xz - uCamXZ;
    float dist = length(rel);

    // Domain-warped fbm → billowing, non-repetitive masses
    vec2 q = vW.xz * uScale + uDrift * uTime;
    vec2 warp = vec2(fbm(q * 1.7 + 13.1), fbm(q * 1.7 - 7.3)) - 0.5;
    float n = fbm(q + warp * 0.55);

    float thresh = 0.56 - uCover * 0.45;
    float density = smoothstep(thresh, thresh + 0.24, n);
    if (density < 0.004) discard;

    // Sunward density gradient: less cloud toward the sun → lit face
    float n2 = fbm(q + warp * 0.55 + uSunXZ * 0.05);
    float lit = clamp(0.5 + (n - n2) * 6.0, 0.0, 1.0);

    vec3 col = mix(uShadeCol, uBodyCol, lit);

    // Dense cores darken — bodies gain volume
    float core = smoothstep(0.4, 1.0, density);
    col = mix(col, uShadeCol, core * 0.5);

    // Silver / sunset lining on thin sun-facing edges
    float rim = (1.0 - density) * lit;
    col += uLitCol * rim * rim;

    col += vec3(0.9, 0.95, 1.0) * uFlash * 0.8;

    // Aerial perspective: melt into the horizon haze, then fade out
    col = mix(col, uHazeCol, smoothstep(160.0, 540.0, dist));
    float fade = 1.0 - smoothstep(430.0, 680.0, dist);

    gl_FragColor = vec4(col, density * uAlpha * fade);
  }
`;

// Palette anchors (body / shade / rim), blended per-frame
const BODY_DAY = new THREE.Color(1.00, 1.00, 1.00);
const BODY_NIGHT = new THREE.Color(0.10, 0.11, 0.16);
const BODY_DUSK = new THREE.Color(0.48, 0.33, 0.32);
const SHADE_DAY = new THREE.Color(0.55, 0.60, 0.70);
const SHADE_NIGHT = new THREE.Color(0.045, 0.055, 0.095);
const SHADE_DUSK = new THREE.Color(0.24, 0.16, 0.18);
const LIT_DAY = new THREE.Color(0.40, 0.38, 0.34);
const LIT_NIGHT = new THREE.Color(0.10, 0.13, 0.22);
const LIT_DUSK = new THREE.Color(1.15, 0.48, 0.28);
const STORM_TINT = new THREE.Color(0.28, 0.30, 0.34);

function makeLayer(y, scale, drift, alpha) {
  const uniforms = {
    uTime:     { value: 0 },
    uCover:    { value: 0.25 },
    uBodyCol:  { value: new THREE.Color() },
    uShadeCol: { value: new THREE.Color() },
    uLitCol:   { value: new THREE.Color() },
    uHazeCol:  { value: new THREE.Color() },
    uSunXZ:    { value: new THREE.Vector2(1, 0) },
    uCamXZ:    { value: new THREE.Vector2() },
    uFlash:    { value: 0 },
    uScale:    { value: new THREE.Vector2(...scale) },
    uDrift:    { value: new THREE.Vector2(...drift) },
    uAlpha:    { value: alpha },
  };
  const geom = new THREE.PlaneGeometry(1400, 1400);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  mesh.position.y = y;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function createClouds(scene) {
  // Main billowing deck + higher wispy cirrus moving on a different wind
  const deck = makeLayer(CLOUD_Y, [0.0065, 0.0100], [0.008, 0.0033], 0.95);
  const wisps = makeLayer(CLOUD_Y + 22, [0.0110, 0.0260], [0.014, 0.0015], 0.45);
  scene.add(deck.mesh, wisps.mesh);

  const body = new THREE.Color();
  const shade = new THREE.Color();
  const lit = new THREE.Color();
  let elapsed = 0;

  function update(dt, weather, sky, camera) {
    elapsed += dt;
    const { dayF, duskF } = sky.out;
    const gloom = weather.gloom;

    body.copy(BODY_NIGHT).lerp(BODY_DAY, dayF)
      .lerp(BODY_DUSK, duskF * 0.85).lerp(STORM_TINT, gloom * 0.85);
    shade.copy(SHADE_NIGHT).lerp(SHADE_DAY, dayF)
      .lerp(SHADE_DUSK, duskF * 0.85)
      .lerp(STORM_TINT.clone().multiplyScalar(0.45), gloom * 0.85);
    lit.copy(LIT_NIGHT).lerp(LIT_DAY, dayF)
      .lerp(LIT_DUSK, duskF).multiplyScalar(1 - gloom * 0.9);

    for (const layer of [deck, wisps]) {
      const u = layer.uniforms;
      u.uTime.value = elapsed;
      u.uCover.value = weather.cover;
      u.uFlash.value = weather.flash;
      u.uBodyCol.value.copy(body);
      u.uShadeCol.value.copy(shade);
      u.uLitCol.value.copy(lit);
      u.uHazeCol.value.copy(sky.out.fogColor);
      u.uSunXZ.value.set(sky.out.sunDir.x, sky.out.sunDir.z);
      layer.mesh.position.x = camera.position.x;
      layer.mesh.position.z = camera.position.z;
      u.uCamXZ.value.set(camera.position.x, camera.position.z);
    }
    // The wisp layer stays thinner than the deck
    wisps.uniforms.uCover.value = Math.min(weather.cover * 0.8, 0.5);
  }

  return { update };
}
