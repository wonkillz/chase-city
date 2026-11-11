// SAT clearance for the whole car, including a small driving clearance. A point
// or centre circle can fit a gap that the visible 2.1 x 3.6 car cannot traverse.
function penetration(a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const c = Math.abs(a.c * b.c + a.s * b.s),
    s = Math.abs(a.s * b.c - a.c * b.s);
  const aw = a.hw + b.hw * c + b.hl * s - Math.abs(dx * a.c - dz * a.s);
  if (aw <= 0) return 0;
  const al = a.hl + b.hw * s + b.hl * c - Math.abs(dx * a.s + dz * a.c);
  if (al <= 0) return 0;
  const bw = b.hw + a.hw * c + a.hl * s - Math.abs(dx * b.c - dz * b.s);
  if (bw <= 0) return 0;
  const bl = b.hl + a.hw * s + a.hl * c - Math.abs(dx * b.s + dz * b.c);
  return bl <= 0 ? 0 : Math.min(aw, al, bw, bl);
}
export function inspectEnclosure(player, fleet, solids, allowed = () => true) {
  const cops = fleet.filter(
    (c) =>
      c.state === "active" && Math.hypot(c.x - player.x, c.z - player.z) < 8,
  );
  if (cops.length < 3)
    return {
      trapped: false,
      exits: 1,
      nearby: cops.length,
      reason: "outside-cordon",
    };
  const obstacles = [
    ...cops.map((c) => ({
      ...c,
      hw: 1.05,
      hl: 1.8,
      c: Math.cos(c.angle),
      s: Math.sin(c.angle),
    })),
    ...solids
      .filter(
        (b) =>
          Math.abs(b.x - player.x) < b.w / 2 + 11 &&
          Math.abs(b.z - player.z) < b.d / 2 + 11,
      )
      .map((b) => ({ ...b, angle: 0, hw: b.w / 2, hl: b.d / 2, c: 1, s: 0 })),
  ];
  const base = {
    x: player.x,
    z: player.z,
    angle: player.angle || 0,
    hw: 1.1,
    hl: 1.85,
    c: Math.cos(player.angle || 0),
    s: Math.sin(player.angle || 0),
  };
  const headings = Array.from({ length: 48 }, (_, i) => ({
    c: Math.cos(base.angle + (i * Math.PI) / 24),
    s: Math.sin(base.angle + (i * Math.PI) / 24),
  }));
  const initial = obstacles.map((b) => penetration(base, b));
  const valid = (pose) => {
    // World limits constrain the centre in the actual simulation; overhang
    // beyond that line is allowed on the surrounding ground.
    if (!allowed(pose)) return false;
    return !obstacles.some((b, i) => penetration(pose, b) > initial[i] + 0.012);
  };
  const clear = (pose) =>
    obstacles.slice(0, cops.length).every((b) => penetration(pose, b) < 0.001);
  const queue = [{ ...base, k: 0 }],
    seen = new Set(["0,0,0"]);
  // Forward motion and swept, in-place steering are possible at low speed.
  // No sideways translation, reverse teleport or instantaneous yaw is allowed.
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    if (Math.hypot(n.x - player.x, n.z - player.z) >= 7 && clear(n))
      return {
        trapped: false,
        exits: 1,
        nearby: cops.length,
        reason: "vehicle-path",
        searched: head + 1,
      };
    for (const action of [-1, 0, 1]) {
      const k = (n.k + action + 24) % 24;
      const angle = base.angle + (k * Math.PI) / 12;
      const next = {
        ...base,
        x: n.x - (action === 0 ? Math.sin(angle) * 0.6 : 0),
        z: n.z - (action === 0 ? Math.cos(angle) * 0.6 : 0),
        angle,
        ...headings[k * 2],
        k,
      };
      if (Math.abs(next.x - player.x) > 8 || Math.abs(next.z - player.z) > 8)
        continue;
      const key = `${Math.round((next.x - player.x) / 0.4)},${Math.round((next.z - player.z) / 0.4)},${k}`;
      if (seen.has(key)) continue;
      const middle = {
        ...base,
        x: (n.x + next.x) / 2,
        z: (n.z + next.z) / 2,
        angle: action === 0 ? angle : n.angle + (action * Math.PI) / 24,
        ...headings[action === 0 ? k * 2 : (n.k * 2 + action + 48) % 48],
      };
      if (!valid(next) || !valid(middle)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return {
    trapped: true,
    exits: 0,
    nearby: cops.length,
    reason: "blocked-footprint",
    searched: queue.length,
  };
}
