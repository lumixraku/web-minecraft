import { createNoise2D } from 'simplex-noise';
import { SIZE, HALF } from './config.js';
import { random } from './random.js';

// Builds a fresh heightmap using ridged + low-freq mountain mask + hills +
// detail + negative-basin noise. Returns:
//   heightMap : Int16Array of length SIZE*SIZE, indexed `x * SIZE + z`
//   h(x, z)   : bounds-safe getter (-1 if outside the world)
//   heightAt  : the raw continuous function, in case caller wants it
export function createTerrain() {
  // All 4 noise instances pull from the shared seeded PRNG, so the same
  // seed always yields the same terrain.
  const noiseA = createNoise2D(random);
  const noiseB = createNoise2D(random);
  const noiseC = createNoise2D(random);
  const noiseD = createNoise2D(random);

  function heightAt(x, z) {
    // Soft continent dome — outer edges sink toward water. Bigger landmass.
    const distFromCenter = Math.sqrt(x * x + z * z) / HALF;
    const continent = Math.max(0, 1 - distFromCenter * 0.55);

    // Ridged noise gives sharp mountain spines. Square (not cube) so ridges
    // sit higher more of the time.
    const r = noiseA(x * 0.011, z * 0.011);
    const ridge = Math.pow(1 - Math.abs(r), 2);

    // Mountain mask gates where mountains appear — flatter exponent so
    // mountainous regions are more common.
    const maskRaw = (noiseB(x * 0.0055 + 17, z * 0.0055 - 41) + 1) * 0.5;
    const mask = Math.pow(maskRaw, 0.9);
    const mountainHeight = ridge * mask * 60;

    // Secondary higher-frequency peaks add asymmetry on the slopes.
    const r2 = noiseA(x * 0.022 - 88, z * 0.022 + 130);
    const ridge2 = Math.pow(1 - Math.abs(r2), 3) * mask * 16;

    // Rolling hills + fine detail.
    const hills = noiseC(x * 0.028, z * 0.028) * 6;
    const detail = noiseD(x * 0.12, z * 0.12) * 1.4;

    // Basin field — strong negative bumps carve out lakes, but only where
    // the noise dips well below zero so lakes don't dominate the map.
    const basinNoise = noiseB(x * 0.017 - 200, z * 0.017 + 350);
    const basin = basinNoise < -0.2 ? (basinNoise + 0.2) * 22 : 0;

    let h = 10 + (mountainHeight + ridge2) * continent + hills + detail + basin;
    // Extra dip near borders so water leaks out toward the edges.
    h -= Math.max(0, distFromCenter - 0.85) * 28;

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
