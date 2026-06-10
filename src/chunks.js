import * as THREE from 'three';
import { SIZE, HALF, CHUNK } from './config.js';
import { blockGeom, M } from './materials.js';
import { ID_TO_TYPE } from './voxels.js';

// Chunked instanced meshing over the voxel field. Each CHUNK×CHUNK column
// region gets its own set of InstancedMeshes (one per block type) so a block
// edit only rebuilds the chunk it touches, not the whole world.
//
// A voxel (gx, y, gz) renders as a unit cube centered at
// (gx - HALF + 0.5, y + 0.5, gz - HALF + 0.5), i.e. the cell spans
// world [gx - HALF, gx - HALF + 1) on each axis — which makes
// world→voxel conversion a plain floor().

const N_CHUNKS = SIZE / CHUNK;

export function createChunkedMesh(vox) {
  const group = new THREE.Group();
  const chunkGroups = new Array(N_CHUNKS * N_CHUNKS).fill(null);
  const dummy = new THREE.Object3D();

  function buildChunk(ci, cj) {
    const old = chunkGroups[ci * N_CHUNKS + cj];
    if (old) {
      old.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      group.remove(old);
    }

    // Collect exposed voxels in this chunk, bucketed by block id.
    const byId = new Map();
    const x0 = ci * CHUNK, z0 = cj * CHUNK;
    for (let x = x0; x < x0 + CHUNK; x++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        const top = vox.colMax[x * SIZE + z];
        for (let y = 0; y <= top; y++) {
          const id = vox.get(x, y, z);
          if (!id) continue;
          const exposed =
            !vox.get(x + 1, y, z) || !vox.get(x - 1, y, z) ||
            !vox.get(x, y, z + 1) || !vox.get(x, y, z - 1) ||
            !vox.get(x, y + 1, z) || (y > 0 && !vox.get(x, y - 1, z));
          if (!exposed) continue;
          let list = byId.get(id);
          if (!list) byId.set(id, (list = []));
          list.push(x, y, z);
        }
      }
    }

    const cg = new THREE.Group();
    for (const [id, list] of byId) {
      const type = ID_TO_TYPE[id];
      const count = list.length / 3;
      const mesh = new THREE.InstancedMesh(blockGeom, M[type], count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (let i = 0; i < count; i++) {
        dummy.position.set(
          list[i * 3] - HALF + 0.5,
          list[i * 3 + 1] + 0.5,
          list[i * 3 + 2] - HALF + 0.5,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      cg.add(mesh);
    }
    chunkGroups[ci * N_CHUNKS + cj] = cg;
    group.add(cg);
  }

  function rebuildAll() {
    for (let ci = 0; ci < N_CHUNKS; ci++) {
      for (let cj = 0; cj < N_CHUNKS; cj++) buildChunk(ci, cj);
    }
  }

  // Rebuild the chunk containing grid column (gx, gz), plus neighbors when
  // the edit sits on a chunk border (their exposure may have changed).
  function rebuildAt(gx, gz) {
    const ci = Math.floor(gx / CHUNK);
    const cj = Math.floor(gz / CHUNK);
    const cis = new Set([ci]);
    const cjs = new Set([cj]);
    if (gx % CHUNK === 0 && ci > 0) cis.add(ci - 1);
    if (gx % CHUNK === CHUNK - 1 && ci < N_CHUNKS - 1) cis.add(ci + 1);
    if (gz % CHUNK === 0 && cj > 0) cjs.add(cj - 1);
    if (gz % CHUNK === CHUNK - 1 && cj < N_CHUNKS - 1) cjs.add(cj + 1);
    for (const i of cis) for (const j of cjs) buildChunk(i, j);
  }

  function dispose() {
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    if (group.parent) group.parent.remove(group);
  }

  rebuildAll();
  return { group, rebuildAt, dispose };
}
