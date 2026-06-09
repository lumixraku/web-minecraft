import * as THREE from 'three';
import { HALF } from './config.js';
import {
  blockGeom,
  waterGeom,
  M,
  PLANAR_TYPES,
  TRANSPARENT_TYPES,
} from './materials.js';
import { createTerrain } from './terrain.js';
import { collectSolidBlocks } from './blocks.js';
import { generateWater } from './features/water.js';
import { generateTrees } from './features/trees.js';
import { generateClouds } from './features/clouds.js';

// Build a complete world: terrain, water, trees, clouds. Returns a Group
// containing one InstancedMesh per block type. The caller adds it to the
// scene and later passes it to disposeWorld().
export function buildWorld() {
  const terrain = createTerrain();

  const sources = [
    // [blocks, mode]   mode = 'grid' shifts by -HALF, 'world' leaves as-is
    [collectSolidBlocks(terrain.heightMap, terrain.h), 'grid'],
    [generateTrees(terrain.heightMap, terrain.h),      'grid'],
    [generateWater(terrain.heightMap),                 'grid'],
    [generateClouds(),                                 'world'],
  ];

  // Bucket by block type → list of [x,y,z]
  const groups = {};
  for (const [list, mode] of sources) {
    for (const b of list) {
      const shift = mode === 'grid' ? HALF : 0;
      (groups[b.type] ||= []).push([b.x - shift, b.y, b.z - shift]);
    }
  }

  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  for (const type in groups) {
    const positions = groups[type];
    if (!M[type]) {
      console.warn(`No material registered for block type "${type}", skipping`);
      continue;
    }
    const isPlanar = PLANAR_TYPES.has(type);
    const isTransparent = TRANSPARENT_TYPES.has(type);
    const geom = isPlanar ? waterGeom : blockGeom;

    const mesh = new THREE.InstancedMesh(geom, M[type], positions.length);
    mesh.castShadow = !isTransparent;
    mesh.receiveShadow = !isTransparent || type === 'water';
    if (isTransparent) mesh.renderOrder = type === 'cloud' ? 1 : 2;

    for (let i = 0; i < positions.length; i++) {
      const [x, y, z] = positions[i];
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  return group;
}

export function disposeWorld(group) {
  group.traverse((obj) => {
    if (obj.isInstancedMesh && obj.dispose) obj.dispose();
  });
  if (group.parent) group.parent.remove(group);
}
