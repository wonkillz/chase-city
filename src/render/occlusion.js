// Segment/AABB intersection is independent of Three.js and never alters colliders.
export function segmentHitsBuilding(camera, target, b) {
  const low = [b.x - b.w / 2 - 0.2, 0.35, b.z - b.d / 2 - 0.2];
  const high = [b.x + b.w / 2 + 0.2, b.h + 1.5, b.z + b.d / 2 + 1.45];
  let near = 0,
    far = 1;
  for (let axis = 0; axis < 3; axis++) {
    const key = ["x", "y", "z"][axis],
      origin = camera[key],
      delta = target[key] - origin;
    if (Math.abs(delta) < 1e-8) {
      if (origin < low[axis] || origin > high[axis]) return false;
      continue;
    }
    let a = (low[axis] - origin) / delta,
      bound = (high[axis] - origin) / delta;
    if (a > bound) [a, bound] = [bound, a];
    near = Math.max(near, a);
    far = Math.min(far, bound);
    if (near > far) return false;
  }
  return near < 0.999 && far > 0;
}
export function approachOpacity(current, occluded, dt) {
  const target = occluded ? 0.35 : 1;
  const next =
    current + (target - current) * (1 - Math.exp(-8 * Math.max(0, dt)));
  return Math.abs(next - target) < 0.002 ? target : next;
}
export class BuildingOcclusion {
  constructor(buildings) {
    this.buildings = buildings;
  }
  update(camera, player, dt) {
    const samples = [
      { x: player.x, y: 1, z: player.z },
      { x: player.x - 0.8, y: 0.7, z: player.z },
      { x: player.x + 0.8, y: 0.7, z: player.z },
      { x: player.x, y: 0.7, z: player.z - 1.5 },
      { x: player.x, y: 0.7, z: player.z + 1.5 },
    ];
    for (const entry of this.buildings) {
      entry.occluded = samples.some(
        (target) =>
          segmentHitsBuilding(camera, target, entry.bounds) &&
          (!entry.intersects || entry.intersects(camera, target)),
      );
      entry.opacity = approachOpacity(entry.opacity, entry.occluded, dt);
      entry.mesh.material.opacity = entry.opacity;
      entry.mesh.material.transparent = entry.opacity < 1;
      entry.mesh.material.depthWrite = entry.opacity === 1;
    }
  }
  reset() {
    for (const e of this.buildings) {
      e.opacity = 1;
      e.occluded = false;
      e.mesh.material.opacity = 1;
      e.mesh.material.transparent = false;
      e.mesh.material.depthWrite = true;
    }
  }
}
