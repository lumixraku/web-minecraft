import { createNoise2D } from 'simplex-noise';
import { SIZE, HALF } from './config.js';

// Builds a fresh heightmap using ridged + low-freq mountain mask + hills +
// detail + negative-basin noise. Returns:
//   heightMap : Int16Array of length SIZE*SIZE, indexed `x * SIZE + z`
//   h(x, z)   : bounds-safe getter (-1 if outside the world)
//   heightAt  : the raw continuous function, in case caller wants it
export function createTerrain() {
  const noiseA = createNoise2D(Math.random);
  const noiseB = createNoise2D(Math.random);
  const noiseC = createNoise2D(Math.random);
  const noiseD = createNoise2D(Math.random);

  function heightAt(x, z) {
    // Soft continent dome — outer edges sink toward water.
    const distFromCenter = Math.sqrt(x * x + z * z) / HALF;
    const continent = Math.max(0, 1 - distFromCenter * 0.78);

    // Ridged noise gives sharp mountain spines.
    const r = noiseA(x * 0.011, z * 0.011);
    const ridge = Math.pow(1 - Math.abs(r), 3);

    // Mountain mask gates where mountains actually appear.
    const maskRaw = (noiseB(x * 0.0055 + 17, z * 0.0055 - 41) + 1) * 0.5;
    const mask = Math.pow(maskRaw, 1.4);
    const mountainHeight = ridge * mask * 48;

    // Secondary higher-frequency peaks add asymmetry.
    const r2 = noiseA(x * 0.022 - 88, z * 0.022 + 130);
    const ridge2 = Math.pow(1 - Math.abs(r2), 4) * mask * 12;

    // Rolling hills + fine detail.
    const hills = noiseC(x * 0.028, z * 0.028) * 5.5;
    const detail = noiseD(x * 0.12, z * 0.12) * 1.4;

    // Basin field — strong negative bumps carve out lakes.
    const basinNoise = noiseB(x * 0.017 - 200, z * 0.017 + 350);
    const basin = basinNoise < -0.05 ? (basinNoise + 0.05) * 26 : 0;

    let h = 7 + (mountainHeight + ridge2) * continent + hills + detail + basin;
    // Extra dip near borders so water leaks out toward the edges.
    h -= Math.max(0, distFromCenter - 0.82) * 32;

    return Math.max(1, Math.floor(h));
  }

  const heightMap = new Int16Array(SIZE * SIZE);
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      heightMap[x * SIZE + z] = heightAt(x - HALF, z - HALF);
    }
  }

  function h(x, z) {
    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) return -1;
    return heightMap[x * SIZE + z];
  }

  return { heightMap, h, heightAt };
}
