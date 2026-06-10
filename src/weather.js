import * as THREE from 'three';

// Weather state machine + precipitation particles. States transition
// smoothly (parameters lerp toward the active preset) and cycle on a random
// timer; R can force the next state. update() returns the blended parameter
// set that drives the sky / cloud / water / fog systems:
//   cover  — cloud coverage 0..1
//   gloom  — light & sky darkening 0..1
//   fog    — fog distance multiplier
//   rain   — rain particle amount (also water ripple boost)
//   snow   — snow particle amount
//   flash  — lightning flash intensity (decaying spike)

const PRESETS = {
  clear:  { cover: 0.22, gloom: 0.00, fog: 1.00, rain: 0.0, snow: 0, thunder: 0 },
  cloudy: { cover: 0.60, gloom: 0.18, fog: 0.85, rain: 0.0, snow: 0, thunder: 0 },
  rain:   { cover: 0.85, gloom: 0.45, fog: 0.60, rain: 1.0, snow: 0, thunder: 0 },
  storm:  { cover: 1.00, gloom: 0.70, fog: 0.45, rain: 1.6, snow: 0, thunder: 1 },
  snow:   { cover: 0.80, gloom: 0.30, fog: 0.55, rain: 0.0, snow: 1, thunder: 0 },
};
const ORDER = ['clear', 'cloudy', 'rain', 'storm', 'snow'];
const WEIGHTS = { clear: 0.32, cloudy: 0.24, rain: 0.18, storm: 0.10, snow: 0.16 };

// Particle field: world-anchored positions wrapped in a box around the
// camera, so walking through rain reveals new drops instead of dragging
// the whole field along.
const BOX = new THREE.Vector3(70, 35, 70);

function makeParticles({ count, fall, sway, size, fragBody }) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * BOX.x;
    pos[i * 3 + 1] = Math.random() * BOX.y;
    pos[i * 3 + 2] = Math.random() * BOX.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const uniforms = {
    uTime:    { value: 0 },
    uOpacity: { value: 0 },
    uOrigin:  { value: new THREE.Vector3() },
    uDim:     { value: 1 },  // dim particles at night
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uOrigin;
      varying float vSeed;
      void main() {
        vec3 box = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${BOX.z.toFixed(1)});
        vec3 p = position;
        vSeed = p.x * 0.371 + p.z * 0.557;
        p.y -= uTime * ${fall.toFixed(1)};
        p.x += sin(uTime * 0.9 + vSeed * 17.0) * ${sway.toFixed(2)};
        // World-anchored wrap around the camera
        vec3 w = mod(p - uOrigin, box) + uOrigin - box * 0.5;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        gl_PointSize = clamp(${size.toFixed(1)} / -mv.z, 1.0, 18.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uDim;
      varying float vSeed;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        ${fragBody}
        gl_FragColor.rgb *= uDim;
        if (gl_FragColor.a < 0.01) discard;
      }
    `,
  });
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  return { points, uniforms };
}

export function createWeather(scene) {
  const rainFx = makeParticles({
    count: 2400, fall: 30, sway: 0.15, size: 170,
    fragBody: /* glsl */ `
      float a = (1.0 - smoothstep(0.04, 0.13, abs(c.x))) * (1.0 - abs(c.y));
      gl_FragColor = vec4(0.70, 0.78, 0.92, a * 0.55 * uOpacity);
    `,
  });
  const snowFx = makeParticles({
    count: 1200, fall: 2.2, sway: 0.9, size: 70,
    fragBody: /* glsl */ `
      float a = smoothstep(1.0, 0.45, length(c));
      gl_FragColor = vec4(0.95, 0.97, 1.0, a * 0.85 * uOpacity);
    `,
  });
  scene.add(rainFx.points, snowFx.points);

  let stateName = 'clear';
  let locked = false;  // /weather lock — suspend auto-cycling
  const cur = { ...PRESETS.clear };
  let nextChange = 45 + Math.random() * 45;
  let boltTimer = 6;
  let flash = 0;
  let elapsed = 0;

  function pickNext() {
    let r = Math.random();
    for (const name of ORDER) {
      r -= WEIGHTS[name];
      if (r <= 0 && name !== stateName) return name;
    }
    return stateName === 'clear' ? 'cloudy' : 'clear';
  }

  function setState(name) {
    stateName = name;
    nextChange = 45 + Math.random() * 45;
  }

  function cycle() {
    setState(ORDER[(ORDER.indexOf(stateName) + 1) % ORDER.length]);
  }

  function update(dt, camera, dayF) {
    elapsed += dt;
    nextChange -= dt;
    if (nextChange <= 0 && !locked) setState(pickNext());

    // Ease parameters toward the active preset
    const target = PRESETS[stateName];
    const k = Math.min(1, dt * 0.4);
    for (const key of ['cover', 'gloom', 'fog', 'rain', 'snow', 'thunder']) {
      cur[key] += (target[key] - cur[key]) * k;
    }

    // Lightning: random strikes while the storm parameter is high
    flash *= Math.exp(-7 * dt);
    if (cur.thunder > 0.5) {
      boltTimer -= dt;
      if (boltTimer <= 0) {
        flash = 0.8 + Math.random() * 0.5;
        boltTimer = 2.5 + Math.random() * 8;
      }
    }

    // Particles
    const dim = 0.25 + 0.75 * dayF;
    for (const [fx, amount] of [[rainFx, Math.min(cur.rain, 1)], [snowFx, cur.snow]]) {
      fx.uniforms.uTime.value = elapsed;
      fx.uniforms.uOpacity.value = amount;
      fx.uniforms.uOrigin.value.copy(camera.position);
      fx.uniforms.uDim.value = dim;
      fx.points.visible = amount > 0.02;
    }

    return {
      cover: cur.cover, gloom: cur.gloom, fog: cur.fog,
      rain: cur.rain, snow: cur.snow, flash,
      name: stateName,
    };
  }

  return {
    update, cycle, setState,
    get state() { return stateName; },
    get locked() { return locked; },
    setLocked(v) { locked = v; },
    isValidState: (name) => name in PRESETS,
    states: Object.keys(PRESETS),
  };
}
