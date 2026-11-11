import { CONFIG } from "./config.js";
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Swept circle uses conservative expanded AABBs; no route can cut a building.
export function clearSegment(
  a,
  b,
  solids,
  radius = CONFIG.policeRadius + 0.25,
) {
  const minX = Math.min(a.x, b.x) - radius,
    maxX = Math.max(a.x, b.x) + radius,
    minZ = Math.min(a.z, b.z) - radius,
    maxZ = Math.max(a.z, b.z) + radius;
  for (const box of solids) {
    if (
      maxX < box.x - box.w / 2 ||
      minX > box.x + box.w / 2 ||
      maxZ < box.z - box.d / 2 ||
      minZ > box.z + box.d / 2
    )
      continue;
    let near = 0,
      far = 1;
    for (const key of ["x", "z"]) {
      const half = (key === "x" ? box.w : box.d) / 2 + radius,
        lo = box[key] - half,
        hi = box[key] + half,
        d = b[key] - a[key];
      if (Math.abs(d) < 1e-9) {
        if (a[key] < lo || a[key] > hi) {
          near = 2;
          break;
        }
        continue;
      }
      let u = (lo - a[key]) / d,
        v = (hi - a[key]) / d;
      if (u > v) [u, v] = [v, u];
      near = Math.max(near, u);
      far = Math.min(far, v);
      if (near > far) break;
    }
    if (near <= far && near <= 1 && far >= 0) return false;
  }
  return true;
}
export class RoadNavigation {
  constructor(solids) {
    this.solids = solids;
    this.nodes = [];
    this.map = new Map();
    this.searches = 0;
    this.revision = 0;
    for (let x = -90; x <= 90; x += 10)
      for (let z = -90; z <= 90; z += 10) {
        const node = { x, z, id: this.nodes.length, neighbors: [] };
        if (
          (x % 30 === 0 || z % 30 === 0) &&
          clearSegment(node, node, solids)
        ) {
          this.nodes.push(node);
          this.map.set(`${x},${z}`, node);
        }
      }
    for (const n of this.nodes)
      for (const [dx, dz] of [
        [10, 0],
        [-10, 0],
        [0, 10],
        [0, -10],
      ]) {
        const other = this.map.get(`${n.x + dx},${n.z + dz}`);
        if (other && this.clear(n, other)) n.neighbors.push(other.id);
      }
  }
  setSolids(solids) {
    this.solids = solids;
    this.revision++;
  }
  addExit(exit) {
    this.exit = exit;
    for (let forward = 100; forward <= 150; forward += 10) {
      const x = exit.dx ? exit.dx * forward : exit.x,
        z = exit.dz ? exit.dz * forward : exit.z,
        key = `${x},${z}`;
      if (this.map.has(key)) continue;
      const n = { x, z, id: this.nodes.length, neighbors: [] };
      this.nodes.push(n);
      this.map.set(key, n);
      const prev = this.map.get(`${x - exit.dx * 10},${z - exit.dz * 10}`);
      if (prev) {
        n.neighbors.push(prev.id);
        prev.neighbors.push(n.id);
      }
    }
    this.revision++;
  }
  allowed(point) {
    if (Math.abs(point.x) <= 106 && Math.abs(point.z) <= 106) return true;
    if (!this.exit) return false;
    const e = this.exit,
      forward = point.x * e.dx + point.z * e.dz,
      lateral = (point.x - e.x) * e.dz - (point.z - e.z) * e.dx;
    return forward >= 94 && forward <= 154 && Math.abs(lateral) <= 8;
  }
  clear(a, b, radius) {
    if (!this.allowed(a) || !this.allowed(b)) return false;
    return clearSegment(a, b, this.solids, radius);
  }
  nearest(point, visibleFrom = null, radius = CONFIG.policeRadius - 0.02) {
    const candidates = this.nodes
      .map((n) => ({ n, d: distance(n, point) }))
      .sort((a, b) => a.d - b.d);
    for (const { n } of candidates)
      if (
        this.clear(n, n) &&
        (!visibleFrom || this.clear(visibleFrom, n, radius))
      )
        return n;
    return null;
  }
  findPath(start, goal, radius) {
    this.searches++;
    const from = this.nearest(start, start, radius),
      to = this.nearest(goal);
    if (!from || !to) return [];
    const open = new Set([from.id]),
      came = new Map(),
      g = new Map([[from.id, 0]]);
    const h = (n) => Math.abs(n.x - to.x) + Math.abs(n.z - to.z);
    while (open.size) {
      let id = -1,
        best = Infinity;
      for (const candidate of open) {
        const f = g.get(candidate) + h(this.nodes[candidate]);
        if (f < best) {
          best = f;
          id = candidate;
        }
      }
      if (id === to.id) {
        const path = [to];
        while (came.has(id)) {
          id = came.get(id);
          path.push(this.nodes[id]);
        }
        return path.reverse().map((n) => ({ x: n.x, z: n.z }));
      }
      open.delete(id);
      for (const next of this.nodes[id].neighbors) {
        if (!this.clear(this.nodes[id], this.nodes[next])) continue;
        const cost = g.get(id) + 10;
        if (cost < (g.get(next) ?? Infinity)) {
          came.set(next, id);
          g.set(next, cost);
          open.add(next);
        }
      }
    }
    return [];
  }
  spawn(player, fleet, id, generation = 0) {
    const ahead = {
      x: player.x + player.vx * 0.9,
      z: player.z + player.vz * 0.9,
    };
    const candidates = this.nodes.filter((n) => {
      const d = distance(n, player);
      return (
        this.clear(n, n) &&
        d >= 27 &&
        d <= 48 &&
        fleet.every((c) => c.state !== "active" || distance(n, c) > 7)
      );
    });
    candidates.sort(
      (a, b) => distance(a, ahead) - distance(b, ahead) || a.id - b.id,
    );
    if (!candidates.length) return null;
    const n = candidates[(id + generation) % Math.min(5, candidates.length)];
    return n ? { x: n.x, z: n.z } : null;
  }
}
