import { SIZE, CLOUD_COUNT, CLOUD_BASE_Y } from '../config.js';
import { random } from '../random.js';

// Drop random ragged ellipsoidal cloud clusters high in the sky. Positions
// are returned in *world* coords (already centered), not grid coords, since
// clouds can spill outside the world footprint.
export function generateClouds() {
  const blocks = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cx = Math.floor((random() - 0.5) * SIZE * 1.4);
    const cz = Math.floor((random() - 0.5) * SIZE * 1.4);
    const cy = CLOUD_BASE_Y + Math.floor(random() * 10);
    const w = 3 + Math.floor(random() * 5);
    const d = 3 + Math.floor(random() * 5);
    for (let dx = -w; dx <= w; dx++) {
      for (let dz = -d; dz <= d; dz++) {
        const ev = (dx * dx) / (w * w) + (dz * dz) / (d * d);
        if (ev > 1) continue;
        if (random() < 0.15) continue; // make ragged
        blocks.push({ x: cx + dx, y: cy, z: cz + dz, type: 'cloud' });
        if (random() < 0.3) {
          blocks.push({ x: cx + dx, y: cy + 1, z: cz + dz, type: 'cloud' });
        }
      }
    }
  }
  return blocks;
}
