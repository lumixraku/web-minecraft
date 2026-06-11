import * as THREE from 'three';
import { NOISE_GLSL } from './shaders.js';
import { WATER_Y } from './config.js';

// Calm, painterly shader water (shared by every chunk's water mesh; the
// geometry carries a per-vertex depth attribute). The look follows the
// reference illustration: a muted steel-blue surface with soft,
// large-scale tonal patches that drift very slowly — no foam, no wave
// stripes, no sparkly noise. Depth tints the color (hazy shallows →
// deeper, darker water), fresnel blends in a planar reflection of the
// scene (rendered each frame from a camera mirrored about the water
// plane), and a restrained sun/moon glint survives for sunsets. Rain
// roughens the surface slightly. All colors track the day/night/weather
// state.

const VERT = /* glsl */ `
  attribute float aDepth;
  uniform float uTime;
  uniform mat4 uReflMatrix;
  varying vec3 vW;
  varying float vDepth;
  varying vec4 vRefl;
  void main() {
    vec3 p = position;
    // Barely-there swell — non-axis-aligned so no pattern ever shows
    p.y += sin(dot(p.xz, vec2(0.43, 0.71)) + uTime * 0.9) * 0.025
         + sin(dot(p.xz, vec2(-0.61, 0.33)) * 1.3 + uTime * 0.7) * 0.02;
    vW = p;
    vDepth = aDepth;
    vRefl = uReflMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform vec3 uLightCol;
  uniform vec3 uSkyCol;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uRipple;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uReflTex;
  uniform float uReflStrength;
  varying vec3 vW;
  varying float vDepth;
  varying vec4 vRefl;

  ${NOISE_GLSL}

  void main() {
    // Soft tonal patches, large and slow — the painterly surface variation
    vec2 flow = vec2(uTime * 0.012, uTime * -0.009);
    vec2 p = vW.xz * 0.035;
    vec2 warp = vec2(fbm(p * 0.6 + flow), fbm(p * 0.6 - flow.yx + 5.2)) - 0.5;
    float n = fbm(p + warp * 0.9 + flow * 0.5);

    // Gentle normals from the same field; rain roughens them a touch
    float ra = 0.10 + min(uRipple, 1.0) * 0.22;
    vec3 nrm = normalize(vec3(warp.x * ra, 1.0, warp.y * ra));

    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(dot(V, nrm), 0.0), 3.0);

    float dT = clamp(vDepth / 6.0, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, dT);
    // Tonal drift: ±5% brightness in soft blotches
    col *= 0.95 + n * 0.10;

    // Planar reflection, rippled by the surface normal; falls back to the
    // flat sky color underwater / before the first reflection pass
    vec2 ruv = clamp(vRefl.xy / vRefl.w + nrm.xz * 0.35, 0.002, 0.998);
    vec3 reflCol = mix(uSkyCol, texture2D(uReflTex, ruv).rgb, uReflStrength);
    col = mix(col, reflCol, clamp(fres * 0.80 + 0.05, 0.0, 1.0));

    // Restrained sun / moon glint (keeps the sunset path, never glittery)
    vec3 H = normalize(uLightDir + V);
    float ndh = max(dot(nrm, H), 0.0);
    col += uLightCol * (pow(ndh, 140.0) * 0.5 + pow(ndh, 14.0) * 0.12);

    float alpha = mix(0.60, 0.86, dT) + fres * 0.14;

    float fd = length(cameraPosition - vW);
    float ff = smoothstep(uFogNear, uFogFar, fd);
    col = mix(col, uFogColor, ff);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.93));
  }
`;

// Muted steel blues, like the reference illustration
const DEEP = new THREE.Color(0.15, 0.27, 0.39);
const SHALLOW = new THREE.Color(0.33, 0.50, 0.58);

export function createWaterMaterial() {
  const uniforms = {
    uTime:     { value: 0 },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightCol: { value: new THREE.Color(1, 1, 1) },
    uSkyCol:   { value: new THREE.Color(0.8, 0.9, 1.0) },
    uDeep:     { value: DEEP.clone() },
    uShallow:  { value: SHALLOW.clone() },
    uRipple:   { value: 0 },
    uFogColor: { value: new THREE.Color(0.9, 0.95, 1.0) },
    uFogNear:  { value: 60 },
    uFogFar:   { value: 120 },
    uReflTex:      { value: null },
    uReflMatrix:   { value: new THREE.Matrix4() },
    uReflStrength: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

  // ---- planar reflection ------------------------------------------------
  // The whole world shares one water plane (y = WATER_Y), so a single
  // mirrored render serves every chunk. Rendered at quarter resolution —
  // the ripple distortion and the soft painterly look hide the difference.
  const reflTarget = new THREE.WebGLRenderTarget(1, 1);
  uniforms.uReflTex.value = reflTarget.texture;

  const virtualCamera = new THREE.PerspectiveCamera();
  const reflPlane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  const dir = new THREE.Vector3();
  const bufSize = new THREE.Vector2();
  const UP = new THREE.Vector3(0, 1, 0);
  const CLIP_BIAS = 0.05;

  // Renders the scene from a camera mirrored about the water plane into
  // reflTarget. Call once per frame, before the main render.
  function renderReflection(renderer, scene, camera) {
    // From below the surface there is nothing to mirror — fall back to the
    // flat sky color in the shader.
    if (camera.position.y <= WATER_Y) {
      uniforms.uReflStrength.value = 0;
      return;
    }
    uniforms.uReflStrength.value = 1;

    renderer.getDrawingBufferSize(bufSize);
    const w = Math.max(1, bufSize.x >> 2), h = Math.max(1, bufSize.y >> 2);
    if (reflTarget.width !== w || reflTarget.height !== h) reflTarget.setSize(w, h);

    // Mirror position, view direction and up about y = WATER_Y
    virtualCamera.position.copy(camera.position);
    virtualCamera.position.y = 2 * WATER_Y - camera.position.y;
    camera.getWorldDirection(dir);
    dir.y = -dir.y;
    const e = camera.matrixWorld.elements; // world up = column 1
    virtualCamera.up.set(e[4], -e[5], e[6]);
    virtualCamera.lookAt(dir.add(virtualCamera.position));
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    virtualCamera.updateMatrixWorld();

    // Projective texture matrix (NDC → [0,1]), before the oblique clip
    uniforms.uReflMatrix.value.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    ).multiply(virtualCamera.projectionMatrix)
     .multiply(virtualCamera.matrixWorldInverse);

    // Oblique near plane (Lengyel) so geometry below the water surface
    // never leaks into the mirrored image — works for any material.
    reflPlane.set(UP, -WATER_Y)
      .applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(reflPlane.normal.x, reflPlane.normal.y, reflPlane.normal.z, reflPlane.constant);
    const pm = virtualCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
    pm.elements[2] = clipPlane.x;
    pm.elements[6] = clipPlane.y;
    pm.elements[10] = clipPlane.z + 1.0 - CLIP_BIAS;
    pm.elements[14] = clipPlane.w;

    // Render, hiding the water itself and reusing this frame's shadow maps
    const prevTarget = renderer.getRenderTarget();
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    material.visible = false;
    renderer.setRenderTarget(reflTarget);
    renderer.render(scene, virtualCamera);
    renderer.setRenderTarget(prevTarget);
    material.visible = true;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
  }

  let elapsed = 0;

  function update(dt, weather, sky, scene) {
    elapsed += dt;
    uniforms.uTime.value = elapsed;
    uniforms.uLightDir.value.copy(sky.out.lightDir);
    uniforms.uLightCol.value.copy(sky.out.lightCol);
    uniforms.uSkyCol.value.copy(sky.out.reflectCol);
    const dim = 0.12 + 0.88 * sky.out.dayF * (1 - weather.gloom * 0.5);
    uniforms.uDeep.value.copy(DEEP).multiplyScalar(dim);
    uniforms.uShallow.value.copy(SHALLOW).multiplyScalar(dim);
    uniforms.uRipple.value = weather.rain;
    uniforms.uFogColor.value.copy(scene.fog.color);
    uniforms.uFogNear.value = scene.fog.near;
    uniforms.uFogFar.value = scene.fog.far;
  }

  function dispose() {
    reflTarget.dispose();
  }

  return { material, update, renderReflection, dispose };
}
