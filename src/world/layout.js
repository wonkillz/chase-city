import { CONFIG } from "../game/config.js";
export function createLayout() {
  const buildings = [],
    parks = [];
  for (let x = -90; x <= 90; x += 30)
    for (let z = -90; z <= 90; z += 30) {
      const cx = x + 15,
        cz = z + 15;
      if (cx > 100 || cz > 100) continue;
      if (((x + 90) / 30 + (2 * (z + 90)) / 30) % 5 === 0) {
        parks.push({ x: cx, z: cz });
        continue;
      }
      for (let a = -1; a <= 1; a += 2)
        for (let b = -1; b <= 1; b += 2) {
          const seed = Math.abs(x * 17 + z * 31 + a * 19 + b * 7);
          buildings.push({
            x: cx + a * 4.6,
            z: cz + b * 4.6,
            w: 7,
            d: 7,
            h: 5 + (seed % 13),
            color: seed % 6,
          });
        }
    }
  return { buildings, parks };
}
export function resolveBuilding(body, box, radius = CONFIG.radius) {
  const nx = Math.max(box.x - box.w / 2, Math.min(body.x, box.x + box.w / 2));
  const nz = Math.max(box.z - box.d / 2, Math.min(body.z, box.z + box.d / 2));
  let dx = body.x - nx,
    dz = body.z - nz,
    dist = Math.hypot(dx, dz);
  if (dist >= radius) return false;
  if (dist === 0) {
    const sides = [
      { v: body.x - (box.x - box.w / 2), x: -1, z: 0 },
      { v: box.x + box.w / 2 - body.x, x: 1, z: 0 },
      { v: body.z - (box.z - box.d / 2), x: 0, z: -1 },
      { v: box.z + box.d / 2 - body.z, x: 0, z: 1 },
    ].sort((a, b) => a.v - b.v);
    dx = sides[0].x;
    dz = sides[0].z;
    body.x += dx * (sides[0].v + radius);
    body.z += dz * (sides[0].v + radius);
  } else {
    body.x += (dx / dist) * (radius - dist);
    body.z += (dz / dist) * (radius - dist);
  }
  return true;
}
