import { CONFIG, clamp, angleDelta } from "./config.js";
export function makePolice(i, generation = 0) {
  let x = (i % 2 ? 1 : -1) * 3,
    z = 30 + i * 9;
  return {
    id: i,
    generation,
    x,
    z,
    angle: 0,
    vx: 0,
    vz: 0,
    speed: CONFIG.policeSpeed,
    type: i % 3 === 0 ? "pursuit" : "patrol",
    boostTimer: 0,
    boostCooldown: 0,
    effectiveSpeed: CONFIG.policeSpeed,
    health: CONFIG.policeHealth,
    state: "active",
    wreckAge: 0,
    stuck: 0,
    turn: 0,
    wallCooldown: 0,
    pairCooldown: 0,
    route: [],
    routeTimer: 0,
    role: "pursuit",
    mode: "pursuit",
    replans: 0,
    blocked: 0,
  };
}
export function steerPolice(
  c,
  index,
  player,
  dt,
  navigation,
  fleet = [],
  elapsed = 0,
) {
  if (!navigation) return;
  c.routeTimer = (c.routeTimer || 0) - dt;
  const ranked = fleet
    .filter((p) => p.state === "active")
    .sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.z - player.z) -
        Math.hypot(b.x - player.x, b.z - player.z),
    );
  const rank = ranked.indexOf(c),
    close = Math.hypot(c.x - player.x, c.z - player.z);
  c.role = rank <= 1 ? "pursuit" : "intercept";
  const lead =
    c.role === "pursuit"
      ? 0
      : 0.8 + Math.min(1, elapsed / 60) * 0.7 + (index % 3) * 0.6;
  const surrounding =
    (player.contained ||
      player.cordonCandidate ||
      (c.mode === "contain" && player.captureProgress > 0)) &&
    close < 12;
  const slotAngle =
    (player.cordonHeading ?? player.angle) + ((c.id % 4) * Math.PI) / 2;
  const slot = {
    x: player.x - Math.sin(slotAngle) * (c.id < 4 ? 3.4 : 5.4),
    z: player.z - Math.cos(slotAngle) * (c.id < 4 ? 3.4 : 5.4),
  };
  c.mode = surrounding ? "contain" : "pursuit";
  c.role = surrounding ? "contain" : c.role;
  const ahead = {
    x: player.x + player.vx * lead,
    z: player.z + player.vz * lead,
  };
  const prediction = navigation.allowed(ahead)
    ? ahead
    : navigation.allowed(player)
      ? { x: player.x, z: player.z }
      : { x: clamp(player.x, -95, 95), z: clamp(player.z, -95, 95) };
  const flank = ((index % 3) - 1) * 2.1;
  const chaseTarget =
    c.role === "intercept"
      ? {
          x: prediction.x + Math.cos(player.angle) * flank,
          z: prediction.z - Math.sin(player.angle) * flank,
        }
      : player;
  const target = surrounding ? slot : chaseTarget;
  const direct = close < 22 && navigation.clear(c, target);
  let waypoint;
  if (direct) {
    waypoint = target;
    c.route = [];
    c.routeTimer = 0;
  } else {
    const goal = navigation.nearest(prediction);
    if (
      c.routeTimer <= 0 ||
      !c.route?.length ||
      c.goalId !== goal?.id ||
      c.navigationRevision !== navigation.revision
    ) {
      c.navigationRevision = navigation.revision;
      c.route = navigation.findPath(c, prediction);
      c.goalId = goal?.id;
      c.routeTimer = 0.5 + (index % 3) * 0.08;
      c.replans = (c.replans || 0) + 1;
    }
    while (
      c.route.length > 1 &&
      Math.hypot(c.x - c.route[0].x, c.z - c.route[0].z) < 2
    )
      c.route.shift();
    // Only shortcut a waypoint when the full swept corridor is clear.
    while (c.route.length > 1 && navigation.clear(c, c.route[1]))
      c.route.shift();
    waypoint = c.route[0];
    if (waypoint && Math.hypot(c.x - waypoint.x, c.z - waypoint.z) < 1.5) {
      c.route.shift();
      waypoint = c.route[0];
    }
    if (!waypoint) {
      c.vx *= Math.exp(-dt * 10);
      c.vz *= Math.exp(-dt * 10);
      c.turn = 0;
      return;
    }
  }
  const dx = waypoint.x - c.x,
    dz = waypoint.z - c.z,
    d = Math.hypot(dx, dz);
  const desired = Math.atan2(-dx, -dz),
    error = angleDelta(desired, c.angle);
  const delta = clamp(error, -3.8 * dt, 3.8 * dt);
  c.angle += delta;
  c.turn = delta / dt;
  const corner = clamp(1 - Math.abs(error) * 0.45, 0.35, 1);
  const difficulty = Math.min(1, elapsed / 60);
  c.boostCooldown = Math.max(0, (c.boostCooldown || 0) - dt);
  const behind =
    (c.x - player.x) * -Math.sin(player.angle) +
      (c.z - player.z) * -Math.cos(player.angle) <
    -6;
  const canBoost =
    c.type === "pursuit" &&
    rank <= 3 &&
    behind &&
    close > 11 &&
    close < 110 &&
    Math.abs(error) < 0.32 &&
    navigation.clear(c, target);
  if (c.boostTimer > 0) {
    c.boostTimer -= dt;
    if (!canBoost || c.boostTimer <= 0) {
      c.boostTimer = 0;
      c.boostCooldown = 2.7 - difficulty;
    }
  } else if (canBoost && c.boostCooldown <= 0) {
    c.boostTimer = 2.8 + difficulty * 0.6;
  }
  c.effectiveSpeed = c.boostTimer > 0 ? 26 + difficulty * 2 : c.speed;
  let speed = c.effectiveSpeed * corner;
  if (surrounding) {
    speed = Math.min(speed, Math.max(0, d - 0.12) * 2.2, 6);
    c.boostTimer = 0;
    // Brake on entering a low-speed cordon, before contacts are resolved.
    const current = Math.hypot(c.vx, c.vz);
    if (current > 6) {
      c.vx *= 6 / current;
      c.vz *= 6 / current;
    }
    const px = player.x - c.x,
      pz = player.z - c.z,
      range = Math.hypot(px, pz) || 1;
    const approach = (c.vx * px + c.vz * pz) / range;
    if (approach > 4) {
      c.vx -= ((approach - 4) * px) / range;
      c.vz -= ((approach - 4) * pz) / range;
    }
  }
  // Gently match a nearby slower car instead of accelerating into a stationary cordon.
  for (const other of fleet)
    if (surrounding && other !== c && other.state === "active") {
      const ox = other.x - c.x,
        oz = other.z - c.z,
        dist = Math.hypot(ox, oz);
      if (
        dist < 4.8 &&
        dist > 0 &&
        (ox * dx + oz * dz) / (dist * (d || 1)) > 0.7
      )
        speed = Math.min(
          speed,
          Math.hypot(other.vx, other.vz) + Math.max(0, dist - 3.2) * 2,
        );
    }
  const grip = 1 - Math.exp(-dt * 7);
  c.vx += ((dx / (d || 1)) * speed - c.vx) * grip;
  c.vz += ((dz / (d || 1)) * speed - c.vz) * grip;
  const next = { x: c.x + c.vx * dt * 3, z: c.z + c.vz * dt * 3 };
  const safetyRadius = navigation.clear(c, c, CONFIG.policeRadius + 0.05)
    ? CONFIG.policeRadius + 0.05
    : CONFIG.policeRadius - 0.02;
  if (!navigation.clear(c, next, safetyRadius)) {
    c.vx = 0;
    c.vz = 0;
    c.routeTimer = 0;
    c.blocked = (c.blocked || 0) + dt;
  } else c.blocked = 0;
}
// SAT uses the visible oriented body (width 2.1, length 3.6), rather than a
// short centre circle that let noses overlap without generating an impact.
export function policeContact(a, b) {
  const basis = (c) => [
    { x: Math.cos(c.angle), z: -Math.sin(c.angle) },
    { x: -Math.sin(c.angle), z: -Math.cos(c.angle) },
  ];
  const aa = basis(a),
    bb = basis(b),
    dx = b.x - a.x,
    dz = b.z - a.z;
  let depth = Infinity,
    normal = null;
  for (const axis of [...aa, ...bb]) {
    const project = (axes) =>
      Math.abs(axis.x * axes[0].x + axis.z * axes[0].z) * 1.05 +
      Math.abs(axis.x * axes[1].x + axis.z * axes[1].z) * 1.8;
    const offset = dx * axis.x + dz * axis.z,
      overlap = project(aa) + project(bb) - Math.abs(offset);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = offset >= 0 ? 1 : -1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { depth, ...normal };
}
export function collidePolice(a, b) {
  if (a.state !== "active" || b.state !== "active") return 0;
  const contact = policeContact(a, b);
  if (!contact) return 0;
  const { x: nx, z: nz, depth } = contact;
  // Body yaw is visual steering, not extra translational crash energy.
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  const correction = depth / 2 + 0.001;
  a.x -= nx * correction;
  a.z -= nz * correction;
  b.x += nx * correction;
  b.z += nz * correction;
  if (closing <= 0) return 0;
  const relative = Math.hypot(a.vx - b.vx, a.vz - b.vz);
  const peakSpeed = Math.max(Math.hypot(a.vx, a.vz), Math.hypot(b.vx, b.vz));
  const impulse = closing * 0.65;
  a.vx -= nx * impulse;
  a.vz -= nz * impulse;
  b.vx += nx * impulse;
  b.vz += nz * impulse;
  // Impulse/depenetration still applies, but a slow stationary cordon has no crash damage.
  if (
    closing < 5 ||
    relative < 10 ||
    peakSpeed < 8 ||
    (a.role === "contain" && b.role === "contain" && peakSpeed < 10)
  )
    return 0;
  const tangentSquared = Math.max(0, relative * relative - closing * closing);
  const impact = Math.sqrt(closing * closing + tangentSquared * 0.15);
  const damage = impactDamage(impact, CONFIG.pairDamageScale);
  let applied = 0;
  for (const car of [a, b])
    if ((car.pairCooldown || 0) <= 0 && damage > 0) {
      car.health = Math.max(0, car.health - damage);
      car.lastDamageCause = "vehicle";
      car.lastCollisionStrength = closing;
      car.pairCooldown = CONFIG.impactCooldown;
      applied = damage;
    }
  return applied;
}

export function impactDamage(impact, scale) {
  return Math.min(
    CONFIG.maxImpactDamage,
    Math.pow(Math.max(0, impact - CONFIG.minimumImpact), 1.15) * scale,
  );
}
export function wallImpact(car, impact, kind = "wall") {
  const damage = impactDamage(
    impact,
    kind === "barricade" ? CONFIG.barricadeDamageScale : CONFIG.wallDamageScale,
  );
  if ((car.wallCooldown || 0) > 0 || damage <= 0) return 0;
  car.health = Math.max(0, car.health - damage);
  car.lastDamageCause = kind;
  car.wallCooldown = CONFIG.impactCooldown;
  return damage;
}
