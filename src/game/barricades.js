import { RoadNavigation, distance } from "./navigation.js";
export const BARRICADE_TIMES = Object.freeze([10, 20, 30, 40, 50]);
export function overlap(a, b, margin = 0) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin
  );
}
export function planBarricade(player, navigation, solids, active, fleet, id) {
  const speed = Math.hypot(player.vx, player.vz),
    fx = speed > 3 ? player.vx / speed : -Math.sin(player.angle),
    fz = speed > 3 ? player.vz / speed : -Math.cos(player.angle);
  const candidates = [];
  for (const node of navigation.nodes) {
    if (Math.abs(node.x) > 90 || Math.abs(node.z) > 90) continue;
    const vertical = node.x % 30 === 0 && node.z % 30 !== 0,
      horizontal = node.z % 30 === 0 && node.x % 30 !== 0;
    if (!vertical && !horizontal) continue;
    const dist = distance(node, player),
      forward = (node.x - player.x) * fx + (node.z - player.z) * fz;
    if (dist < 25 || dist > 80) continue;
    const b = {
      id,
      x: node.x,
      z: node.z,
      w: vertical ? 11.2 : 1.2,
      d: vertical ? 1.2 : 11.2,
      kind: "barricade",
      vertical,
      road: { x: node.x, z: node.z },
      forward: { x: fx, z: fz },
    };
    if (
      solids.some((box) => overlap(b, box, 0.8)) ||
      active.some((box) => distance(box, b) < 20) ||
      fleet.some(
        (c) =>
          c.state === "active" &&
          Math.abs(c.x - b.x) < b.w / 2 + 3 &&
          Math.abs(c.z - b.z) < b.d / 2 + 3,
      )
    )
      continue;
    // Prefer the predicted road ahead; near the map edge use a connected next-turn road.
    const score =
      Math.hypot(node.x - (player.x + fx * 36), node.z - (player.z + fz * 36)) +
      (forward < 15 ? 80 : 0);
    const before = {
        x: node.x - (vertical ? 0 : 6),
        z: node.z - (vertical ? 6 : 0),
      },
      after = {
        x: node.x + (vertical ? 0 : 6),
        z: node.z + (vertical ? 6 : 0),
      };
    candidates.push({ b, score, before, after });
  }
  candidates.sort(
    (a, b) => a.score - b.score || a.b.x - b.b.x || a.b.z - b.b.z,
  );
  for (const candidate of candidates) {
    const trial = new RoadNavigation([...solids, ...active, candidate.b]);
    const detour = trial.findPath(candidate.before, candidate.after);
    if (detour.length >= 4) return { ...candidate.b, detour };
  }
  return null;
}
export function updateBarricades(sim) {
  let changed = false;
  for (const time of BARRICADE_TIMES) {
    if (sim.elapsed + 1e-7 >= time - 2 && !sim.barricadeWarnings.has(time)) {
      sim.barricadeWarnings.add(time);
      sim.barricadeWarning = { time, until: time };
    }
    if (
      sim.elapsed + 1e-7 >= time &&
      !sim.barricadeEvents.some((e) => e.time === time)
    ) {
      const b = planBarricade(
        sim.player,
        sim.navigation,
        [...sim.staticSolids, ...sim.wrecks.filter((w) => w.solid)],
        sim.barricades,
        sim.police,
        time / 10,
      );
      if (b) {
        Object.assign(b, {
          born: sim.elapsed,
          expires: sim.elapsed + 14,
          passedAt: null,
        });
        sim.barricades.push(b);
        changed = true;
      }
      sim.barricadeEvents.push({
        time,
        actualTime: sim.elapsed,
        placed: !!b,
        position: b ? { x: b.x, z: b.z } : null,
      });
      sim.barricadeWarning = null;
    }
  }
  for (const b of sim.barricades) {
    const passed =
      (sim.player.x - b.road.x) * b.forward.x +
      (sim.player.z - b.road.z) * b.forward.z;
    if (passed > 8 && distance(b, sim.player) > 14 && b.passedAt === null)
      b.passedAt = sim.elapsed;
  }
  const keep = sim.barricades.filter(
    (b) =>
      sim.elapsed < b.expires &&
      (b.passedAt === null || sim.elapsed - b.passedAt < 3),
  );
  if (keep.length !== sim.barricades.length) {
    sim.barricades = keep;
    changed = true;
  }
  if (changed) sim.refreshNavigation();
}
