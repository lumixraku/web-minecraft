import * as THREE from 'three';
import { HALF, SEA_LEVEL, SNOW_LEVEL } from './config.js';
import { createVoxels } from './voxels.js';
import { createChunkedMesh } from './chunks.js';
import { createWater } from './water.js';

// Build a complete world for a seed: voxel field → chunked meshes + shader
// water, plus a spawn point. Same seed → same world.
export function createWorld(seed) {
  const vox = createVoxels(seed);
  const chunks = createChunkedMesh(vox);
  const water = createWater(vox.heightMap);

  const group = new THREE.Group();
  group.add(chunks.group, water.mesh);

  // Spawn on the land column nearest the world center (dry, below the snow
  // line so the player starts somewhere green).
  let spawn = null;
  outer:
  for (let r = 0; r < HALF && !spawn; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const gx = HALF + dx, gz = HALF + dz;
        const s = vox.h(gx, gz);
        if (s > SEA_LEVEL + 1 && s < SNOW_LEVEL) {
          spawn = new THREE.Vector3(gx - HALF + 0.5, s + 1, gz - HALF + 0.5);
          break outer;
        }
      }
    }
  }
  spawn ||= new THREE.Vector3(0.5, 50, 0.5);

  function dispose() {
    chunks.dispose();
    water.dispose();
    if (group.parent) group.parent.remove(group);
  }

  return { vox, chunks, water, group, spawn, h: vox.h, dispose };
}
