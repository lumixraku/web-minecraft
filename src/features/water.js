import { SIZE, SEA_LEVEL } from '../config.js';

// Emits one flat horizontal quad position per submerged column. The quad sits
// at y = SEA_LEVEL + 0.5 so it lines up with the top face of a normal block.
// World-grid coords (centering happens later in world.js).
export function generateWater(heightMap) {
  const quads = [];
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const s = heightMap[x * SIZE + z];
      if (s < SEA_LEVEL) {
        quads.push({ x, y: SEA_LEVEL + 0.5, z, type: 'water' });
      }
    }
  }
  return quads;
}
