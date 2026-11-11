// Segment/AABB intersection is independent of Three.js and never alters colliders.
export function segmentHitsBuilding(camera, target, b, visualBounds) {
  const low = visualBounds
    ? [visualBounds.min.x, visualBounds.min.y, visualBounds.min.z]
    : [b.x - b.w / 2 - 0.2, 0.35, b.z - b.d / 2 - 0.2];
  const high = visualBounds
    ? [visualBounds.max.x, visualBounds.max.y, visualBounds.max.z]
    : [b.x + b.w / 2 + 0.2, b.h + 1.5, b.z + b.d / 2 + 1.45];
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
// Changing transparent switches Three.js shader variants (OPAQUE define).
// Opacity uniforms alone cannot fade a shader compiled as opaque.
export function applyBuildingOpacity(entry, opacity) {
  entry.opacity = opacity;
  const meshes = entry.meshes || [entry.mesh];
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      const transparent = opacity < 1;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
      material.depthWrite = !transparent;
    }
  }
}
export class BuildingOcclusion {
  constructor(buildings) {
    this.buildings = buildings;
  }
  update(camera, player, dt) {
    const angle = player.angle || 0,
      sin = Math.sin(angle),
      cos = Math.cos(angle);
    const samples = [
      [0, 1, 0],
      [0, 1.5, 0],
      [-0.8, 0.7, 0],
      [0.8, 0.7, 0],
      [0, 0.7, -1.6],
      [0, 0.7, 1.6],
    ].map(([x, y, z]) => ({
      x: player.x + x * cos + z * sin,
      y,
      z: player.z - x * sin + z * cos,
    }));
    for (const entry of this.buildings) {
      entry.occluded = samples.some(
        (target) =>
          segmentHitsBuilding(
            camera,
            target,
            entry.bounds,
            entry.visualBounds,
          ) &&
          (!entry.intersects || entry.intersects(camera, target)),
      );
      applyBuildingOpacity(
        entry,
        approachOpacity(entry.opacity, entry.occluded, dt),
      );
    }
  }
  reset() {
    for (const e of this.buildings) {
      e.occluded = false;
      applyBuildingOpacity(e, 1);
    }
  }
}
