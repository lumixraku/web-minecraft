import {
  SIZE,
  SEA_LEVEL,
  BEACH_BAND,
  STONE_EXPOSE,
  TARGET_TREES,
} from '../config.js';
import { random } from '../random.js';

// Scatter trees on grass columns, avoiding sand / bare stone / steep slopes
// and enforcing a 2-block min spacing. Returns wood + leaf blocks in
// world-grid coordinates.
export function generateTrees(heightMap, h) {
  const blocks = [];
  const occupied = new Set();
  const MAX_ATTEMPTS = TARGET_TREES * 40;
  let placed = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && placed < TARGET_TREES; attempt++) {
    const tx = 2 + Math.floor(random() * (SIZE - 4));
    const tz = 2 + Math.floor(random() * (SIZE - 4));
    const key = tx * SIZE + tz;
    if (occupied.has(key)) continue;

    const s = heightMap[key];
    if (s <= SEA_LEVEL + BEACH_BAND) continue;
    if (s >= STONE_EXPOSE - 2) continue;

    const steep = Math.max(
      Math.abs(s - h(tx + 1, tz)),
      Math.abs(s - h(tx - 1, tz)),
      Math.abs(s - h(tx, tz + 1)),
      Math.abs(s - h(tx, tz - 1)),
    );
    if (steep > 2) continue;

    let tooClose = false;
    for (let dx = -2; dx <= 2 && !tooClose; dx++) {
      for (let dz = -2; dz <= 2 && !tooClose; dz++) {
        if (occupied.has((tx + dx) * SIZE + (tz + dz))) tooClose = true;
      }
    }
    if (tooClose) continue;

    occupied.add(key);
    placed++;

    // Trunk
    const trunkH = 4 + Math.floor(random() * 3); // 4..6
    for (let k = 1; k <= trunkH; k++) {
      blocks.push({ x: tx, y: s + k, z: tz, type: 'wood' });
    }

    // Leaf canopy: wider near bottom, narrower on top
    const topY = s + trunkH;
    const layers = [
      { dy: -1, r: 2 },
      { dy:  0, r: 2 },
      { dy:  1, r: 1 },
      { dy:  2, r: 1 },
    ];
    for (const L of layers) {
      const r = L.r;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && L.dy < 1) continue;
          // round off the corners
          if (Math.abs(dx) === r && Math.abs(dz) === r && random() < 0.55) continue;
          blocks.push({
            x: tx + dx,
            y: topY + L.dy,
            z: tz + dz,
            type: random() < 0.3 ? 'leavesLight' : 'leaves',
          });
        }
      }
    }
  }
  return blocks;
}
