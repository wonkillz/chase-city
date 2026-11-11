import { CONFIG } from "./config.js";
import { resolveBuilding } from "../world/layout.js";
// Circle-to-oriented-car clearance, shared by enclosure detection and fixtures.
export function carClearance(point, car) {
  const dx = point.x - car.x,
    dz = point.z - car.z,
    c = Math.cos(car.angle),
    s = Math.sin(car.angle);
  const x = dx * c - dz * s,
    z = -dx * s - dz * c;
  return (
    Math.hypot(
      Math.max(0, Math.abs(x) - 1.05),
      Math.max(0, Math.abs(z) - 1.8),
    ) - CONFIG.radius
  );
}
export function inspectEnclosure(player, fleet, solids, allowed = () => true) {
  const nearby = fleet.filter(
    (c) =>
      c.state === "active" && Math.hypot(c.x - player.x, c.z - player.z) < 8,
  );
  if (nearby.length < 3)
    return { trapped: false, exits: 24, nearby: nearby.length };
  let exits = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    let clear = true;
    const initial = nearby.map((c) => carClearance(player, c));
    for (let d = 0.5; d <= 6; d += 0.5) {
      const p = {
        x: player.x + Math.sin(a) * d,
        z: player.z + Math.cos(a) * d,
      };
      if (
        !allowed(p) ||
        solids.some((b) =>
          resolveBuilding({ ...p }, b, CONFIG.radius - 0.02),
        ) ||
        nearby.some(
          (c, j) => carClearance(p, c) < Math.min(0, initial[j]) - 0.015,
        )
      ) {
        clear = false;
        break;
      }
    }
    if (clear) exits++;
  }
  if (exits === 0) {
    // A curved opening between offset cars is still an escape. Confirm closure
    // with a small swept-circle flood fill before raising the arrest gauge.
    const queue = [{ x: 0, z: 0 }],
      seen = new Set(["0,0"]);
    const initial = nearby.map((c) => carClearance(player, c));
    const valid = (x, z) => {
      const p = { x: player.x + x, z: player.z + z };
      return (
        allowed(p) &&
        !solids.some((b) =>
          resolveBuilding({ ...p }, b, CONFIG.radius - 0.02),
        ) &&
        !nearby.some(
          (c, j) => carClearance(p, c) < Math.min(0, initial[j]) - 0.015,
        )
      );
    };
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      if (Math.hypot(n.x, n.z) >= 6) {
        exits = 1;
        break;
      }
      for (const [dx, dz] of [
        [0.75, 0],
        [-0.75, 0],
        [0, 0.75],
        [0, -0.75],
        [0.75, 0.75],
        [0.75, -0.75],
        [-0.75, 0.75],
        [-0.75, -0.75],
      ]) {
        const x = n.x + dx,
          z = n.z + dz,
          key = `${x},${z}`;
        if (Math.abs(x) > 6.75 || Math.abs(z) > 6.75 || seen.has(key)) continue;
        seen.add(key);
        if (valid(x, z) && valid(n.x + dx / 2, n.z + dz / 2))
          queue.push({ x, z });
      }
    }
  }
  return { trapped: exits === 0, exits, nearby: nearby.length };
}
