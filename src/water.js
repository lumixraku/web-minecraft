import * as THREE from 'three';
import { NOISE_GLSL } from './shaders.js';

// Shader water material, shared by every chunk's water mesh (geometry is
// built per chunk in mesher.js with a per-vertex depth attribute). The
// vertex shader rolls gentle waves; the fragment shader does analytic wave
// normals + noise ripples, depth-based color, fresnel sky reflection,
// sun/moon specular (tight sparkle + broad glitter path) and shoreline
// foam. Colors arrive via uniforms each frame from the sky/weather state.

const VERT = /* glsl */ `
  attribute float aDepth;
  uniform float uTime;
  varying vec3 vW;
  varying float vDepth;
  void main() {
    vec3 p = position;
    float t = uTime * 1.6;
    p.y += sin(p.x * 0.8 + t) * 0.045
         + sin(p.z * 1.1 + t * 0.83) * 0.045
         + sin((p.x + p.z) * 0.45 + t * 0.62) * 0.05;
    vW = p;
    vDepth = aDepth;
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
  varying vec3 vW;
  varying float vDepth;

  ${NOISE_GLSL}

  void main() {
    float t = uTime * 1.6;
    float ndx = cos(vW.x * 0.8 + t) * 0.036
              + cos((vW.x + vW.z) * 0.45 + t * 0.62) * 0.0225;
    float ndz = cos(vW.z * 1.1 + t * 0.83) * 0.0495
              + cos((vW.x + vW.z) * 0.45 + t * 0.62) * 0.0225;
    vec2 rp = vW.xz * 2.3 + vec2(uTime * 0.4, -uTime * 0.33);
    float ra = 0.08 + min(uRipple, 1.0) * 0.10;
    ndx += (vnoise(rp) - 0.5) * ra + (vnoise(rp * 2.7) - 0.5) * ra * 0.6;
    ndz += (vnoise(rp + 19.7) - 0.5) * ra + (vnoise(rp * 2.7 + 7.3) - 0.5) * ra * 0.6;
    vec3 n = normalize(vec3(-ndx * 4.0, 1.0, -ndz * 4.0));

    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(dot(V, n), 0.0), 3.0);

    float dT = clamp(vDepth / 6.0, 0.0, 1.0);
    vec3 base = mix(uShallow, uDeep, dT);
    vec3 col = mix(base, uSkyCol, clamp(fres * 0.85 + 0.08, 0.0, 1.0));

    vec3 H = normalize(uLightDir + V);
    float ndh = max(dot(n, H), 0.0);
    col += uLightCol * (pow(ndh, 160.0) * 1.6 + pow(ndh, 14.0) * 0.22);

    float foamBand = 1.0 - smoothstep(0.0, 1.3, vDepth);
    float fn = vnoise(vW.xz * 2.0 + uTime * 0.5)
             * vnoise(vW.xz * 3.7 - uTime * 0.4);
    float foam = smoothstep(0.18, 0.42, fn * foamBand * 1.6);
    col += uSkyCol * 1.15 * foam;

    float alpha = mix(0.62, 0.88, dT) + fres * 0.08 + foam * 0.2;

    float fd = length(cameraPosition - vW);
    float ff = smoothstep(uFogNear, uFogFar, fd);
    col = mix(col, uFogColor, ff);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
  }
`;

const DEEP = new THREE.Color(0.08, 0.28, 0.58);
const SHALLOW = new THREE.Color(0.20, 0.62, 0.72);

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
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

  let elapsed = 0;

  function update(dt, weather, sky, scene) {
    elapsed += dt;
    uniforms.uTime.value = elapsed;
    uniforms.uLightDir.value.copy(sky.out.lightDir);
    uniforms.uLightCol.value.copy(sky.out.lightCol);
    uniforms.uSkyCol.value.copy(sky.out.reflectCol);
    const dim = 0.10 + 0.90 * sky.out.dayF * (1 - weather.gloom * 0.5);
    uniforms.uDeep.value.copy(DEEP).multiplyScalar(dim);
    uniforms.uShallow.value.copy(SHALLOW).multiplyScalar(dim);
    uniforms.uRipple.value = weather.rain;
    uniforms.uFogColor.value.copy(scene.fog.color);
    uniforms.uFogNear.value = scene.fog.near;
    uniforms.uFogFar.value = scene.fog.far;
  }

  return { material, update };
}
