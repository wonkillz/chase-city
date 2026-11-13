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
      c.state === "active" &&
      Math.hypot(c.x - player.x, c.z - player.z) <
        (player.contained ? 10.5 : 9.5),
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
  const initial = obstacles.map((b) => penetration(base, b));
  let vx = player.vx || 0,
    vz = player.vz || 0;
  // Match the real contact solver: velocity into an already-touching officer
  // is removed before evaluating the opening, rather than rejecting every
  // route because of one frame of residual sideways collision velocity.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < cops.length; i++)
      if (initial[i] > 0.001) {
        const dx = cops[i].x - base.x,
          dz = cops[i].z - base.z,
          d = Math.hypot(dx, dz) || 1;
        const inward = Math.max(0, (vx * dx + vz * dz) / d);
        vx -= (inward * dx) / d;
        vz -= (inward * dz) / d;
      }
  const queue = [
      {
        ...base,
        vx,
        vz,
        speed: player.speed ?? Math.hypot(player.vx || 0, player.vz || 0),
        steering: player.steering || 0,
        depth: 0,
      },
    ],
    seen = new Set();
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (
      Math.hypot(node.x - base.x, node.z - base.z) >= 5.5 &&
      obstacles.slice(0, cops.length).every((b) => penetration(node, b) < 0.01)
    )
      return {
        trapped: false,
        exits: 1,
        nearby: cops.length,
        reason: "drivable-exit",
        searched: head + 1,
      };
    if (node.depth >= 12) continue;
    for (const steering of [0, 1, -1]) {
      const next = { ...node, depth: node.depth + 1 };
      let valid = true;
      for (let step = 0; step < 3; step++) {
        next.steering += (steering - next.steering) * (1 - Math.exp(-0.05 * 7));
        next.angle += next.steering * 1.75 * 0.05;
        next.speed += (24 - next.speed) * (1 - Math.exp(-0.05 * 2));
        next.vx +=
          (-Math.sin(next.angle) * next.speed - next.vx) *
          (1 - Math.exp(-0.05 * 10));
        next.vz +=
          (-Math.cos(next.angle) * next.speed - next.vz) *
          (1 - Math.exp(-0.05 * 10));
        next.x += next.vx * 0.05;
        next.z += next.vz * 0.05;
        next.c = Math.cos(next.angle);
        next.s = Math.sin(next.angle);
        if (
          !allowed(next) ||
          obstacles.some(
            (b, i) =>
              penetration(next, b) >
              initial[i] +
                (i < cops.length && initial[i] > 0.001 ? 0.12 : 0.02),
          )
        ) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      const key = `${Math.round((next.x - base.x) / 0.5)},${Math.round((next.z - base.z) / 0.5)},${Math.round(next.angle / (Math.PI / 12))},${Math.round(next.steering * 2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return {
    trapped: true,
    exits: 0,
    nearby: cops.length,
    reason: "no-drivable-exit",
    searched: queue.length,
  };
}
