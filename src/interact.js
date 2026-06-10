import * as THREE from 'three';
import { WORLD_HEIGHT, REACH } from './config.js';
import { AIR } from './blocks.js';

// Block targeting + break/place. A DDA voxel raycast (Amanatides & Woo)
// walks the grid from the camera along the view direction; the hit voxel is
// outlined, left-click clears it, right-click places the hotbar block in the
// cell in front of the hit face. Voxel coords ARE world coords (floored).

export function raycastVoxel(world, origin, dir, maxDist) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX = dir.x !== 0 ? (stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? (stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? (stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ : Infinity;

  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < 256; i++) {
    if (world.get(x, y, z) !== AIR) return { x, y, z, nx, ny, nz };
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
    target = raycastVoxel(world, camera.position, dir, REACH);
    if (target) {
      highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
      highlight.visible = true;
    } else {
      highlight.visible = false;
    }
  }

  document.addEventListener('mousedown', (e) => {
    const world = getWorld();
    if (!world || document.pointerLockElement === null || !target) return;

    if (e.button === 0) {
      world.set(target.x, target.y, target.z, AIR);
      world.remeshAt(target.x, target.z);
    } else if (e.button === 2) {
      const px = target.x + target.nx;
      const py = target.y + target.ny;
      const pz = target.z + target.nz;
      if (target.nx === 0 && target.ny === 0 && target.nz === 0) return;
      if (py < 0 || py >= WORLD_HEIGHT) return;
      if (world.get(px, py, pz) !== AIR) return;

      // Don't place a block inside the player
      const bb = player.getAABB();
      const overlaps =
        bb.maxX > px && bb.minX < px + 1 &&
        bb.maxY > py && bb.minY < py + 1 &&
        bb.maxZ > pz && bb.minZ < pz + 1;
      if (overlaps) return;

      world.set(px, py, pz, hud.selectedId());
      world.remeshAt(px, pz);
    }
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  return { update, getTarget: () => target };
}
