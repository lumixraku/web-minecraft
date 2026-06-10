import { createNoise2D } from 'simplex-noise';
import { WORLD_HEIGHT } from './config.js';
import { setSeed, random } from './random.js';

// Unbounded, continent-scale terrain. There is no island dome or border
// falloff anymore — the height function is defined for every (x, z), and
// chunks sample it on demand:
//
//   continentalness  3-octave very-low-freq noise → oceans vs landmass
//   base elevation   ocean floor (~3) rising to coastal plains (~14)
//   mountains        ridged noise² gated by a mask, only well inland
//   hills + detail   rolling terrain and per-block jitter
//   basins           negative dips that carve inland lakes
//
// A separate forest field drives tree density (clustered woods instead of
// uniform scatter). Same seed → same planet.

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createTerrain(seed) {
  setSeed(seed);
  // Consumed from the seeded PRNG in fixed order — deterministic per seed.
  const nRidge = createNoise2D(random);
  const nMask = createNoise2D(random);
  const nHill = createNoise2D(random);
  const nDetail = createNoise2D(random);
  const nCont = createNoise2D(random);

  function heightAt(x, z) {
    // Continentalness: ~600-block-wavelength landmasses with ocean between
    let c = nCont(x * 0.0016, z * 0.0016)
          + 0.50 * nCont(x * 0.0032 + 71, z * 0.0032 - 19)
          + 0.25 * nCont(x * 0.0064 - 133, z * 0.0064 + 57);
    c /= 1.75;
    const land = smoothstep(-0.22, 0.18, c);

    let h = 3 + land * 11; // ocean floor → coastal plains

    // Mountain ranges: ridged spines, gated to appear only well inland
    const maskRaw = (nMask(x * 0.004 + 17, z * 0.004 - 41) + 1) * 0.5;
    const mountains = smoothstep(0.35, 0.8, land) * Math.pow(maskRaw, 1.15);
    const r = nRidge(x * 0.009, z * 0.009);
    const ridge = Math.pow(1 - Math.abs(r), 2);
    const r2 = nRidge(x * 0.02 - 88, z * 0.02 + 130);
    const ridge2 = Math.pow(1 - Math.abs(r2), 3) * 16;
    h += (ridge * 58 + ridge2) * mountains;

    // Rolling hills (damped over the ocean) + fine detail
    h += nHill(x * 0.025, z * 0.025) * 5 * (0.3 + 0.7 * land);
    h += nDetail(x * 0.11, z * 0.11) * 1.5;

    // Inland lake basins
    const b = nMask(x * 0.013 - 200, z * 0.013 + 350);
    if (b < -0.25) h += (b + 0.25) * 20 * land;

    return Math.max(1, Math.min(WORLD_HEIGHT - 3, Math.floor(h)));
  }

  // 0..1 forest density field — woods cluster instead of uniform scatter.
  function forestAt(x, z) {
    const f = (nCont(x * 0.005 + 555, z * 0.005 + 888) + 1) * 0.5;
    return smoothstep(0.35, 0.75, f);
  }

  return { heightAt, forestAt };
}
