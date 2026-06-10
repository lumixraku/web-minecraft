import * as THREE from 'three';
import { HALF, WORLD_HEIGHT, REACH } from './config.js';
import { AIR } from './voxels.js';

// Block targeting + break/place. A DDA voxel raycast (Amanatides & Woo)
// walks the grid from the camera along the view direction; the hit voxel is
// outlined, left-click clears it, right-click places the hotbar block in the
// cell in front of the hit face.

// origin/dir in world space; returns grid coords + hit face normal, or null.
export function raycastVoxel(vox, origin, dir, maxDist) {
  let x = Math.floor(origin.x + HALF);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z + HALF);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const ox = origin.x + HALF, oy = origin.y, oz = origin.z + HALF;
  let tMaxX = dir.x !== 0 ? (stepX > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? (stepY > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? (stepZ > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;

  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < 256; i++) {
    if (vox.get(x, y, z) !== AIR) return { x, y, z, nx, ny, nz };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) return null;
      x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) return null;
      y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      if (tMaxZ > maxDist) return null;
      z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}

export function createInteraction(scene, camera, player, hud, getWorld) {
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }),
  );
  highlight.visible = false;
  highlight.renderOrder = 4;
  scene.add(highlight);

  const dir = new THREE.Vector3();
  let target = null;

  function update() {
    const world = getWorld();
    if (!world || document.pointerLockElement === null) {
      highlight.visible = false;
      target = null;
      return;
    }
    camera.getWorldDirection(dir);
    target = raycastVoxel(world.vox, camera.position, dir, REACH);
    if (target) {
      highlight.position.set(
        target.x - HALF + 0.5,
        target.y + 0.5,
        target.z - HALF + 0.5,
      );
      highlight.visible = true;
    } else {
      highlight.visible = false;
    }
  }

  document.addEventListener('mousedown', (e) => {
    const world = getWorld();
    if (!world || document.pointerLockElement === null || !target) return;

    if (e.button === 0) {
      world.vox.set(target.x, target.y, target.z, AIR);
      world.chunks.rebuildAt(target.x, target.z);
    } else if (e.button === 2) {
      const px = target.x + target.nx;
      const py = target.y + target.ny;
      const pz = target.z + target.nz;
      if (target.nx === 0 && target.ny === 0 && target.nz === 0) return;
      if (py < 0 || py >= WORLD_HEIGHT) return;
      if (world.vox.get(px, py, pz) !== AIR) return;

      // Don't place a block inside the player
      const bb = player.getAABB();
      const wx = px - HALF, wz = pz - HALF;
      const overlaps =
        bb.maxX > wx && bb.minX < wx + 1 &&
        bb.maxY > py && bb.minY < py + 1 &&
        bb.maxZ > wz && bb.minZ < wz + 1;
      if (overlaps) return;

      world.vox.set(px, py, pz, hud.selectedId());
      world.chunks.rebuildAt(px, pz);
    }
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  return { update };
}
