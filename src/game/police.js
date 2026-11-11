import { CONFIG, clamp, angleDelta } from "./config.js";
export function makePolice(i, generation = 0, player = null) {
  let x = (i % 2 ? 1 : -1) * 3,
    z = 30 + i * 9;
  if (player) {
    // Reinforcements arrive on roads 35+ units away, never on the player's car.
    const candidates = [];
    for (let a = -90; a <= 90; a += 30)
      for (let b = -90; b <= 90; b += 30) {
        const distance = Math.hypot(a - player.x, b - player.z);
        if (distance >= 35 && distance <= 70) candidates.push({ x: a, z: b });
      }
    const spawn = candidates[(i * 7 + generation * 11) % candidates.length] || {
      x: 0,
      z: 90,
    };
    x = spawn.x;
    z = spawn.z;
  }
  return {
    id: i,
    generation,
    x,
    z,
    angle: player ? Math.atan2(x - player.x, z - player.z) : 0,
    vx: 0,
    vz: 0,
    speed: CONFIG.policeSpeed,
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
    replans: 0,
    blocked: 0,
  };
}
export function steerPolice(c, index, player, dt, navigation, fleet = []) {
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
  const lead = c.role === "pursuit" ? 0 : 1.1 + (index % 3) * 0.55;
  const prediction = {
    x: clamp(player.x + player.vx * lead, -95, 95),
    z: clamp(player.z + player.vz * lead, -95, 95),
  };
  const direct = close < 22 && navigation.clear(c, player);
  let waypoint;
  if (direct) {
    waypoint = player;
    c.route = [];
    c.routeTimer = 0;
  } else {
    const goal = navigation.nearest(prediction);
    if (c.routeTimer <= 0 || !c.route?.length || c.goalId !== goal?.id) {
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
  const speed = c.speed * corner;
  const grip = 1 - Math.exp(-dt * 7);
  c.vx += ((dx / (d || 1)) * speed - c.vx) * grip;
  c.vz += ((dz / (d || 1)) * speed - c.vz) * grip;
  const next = { x: c.x + c.vx * dt * 3, z: c.z + c.vz * dt * 3 };
  if (!navigation.clear(c, next, CONFIG.policeRadius - 0.02)) {
    c.vx = 0;
    c.vz = 0;
    c.routeTimer = 0;
    c.blocked = (c.blocked || 0) + dt;
  } else c.blocked = 0;
}
// Equal-mass contact impulse: only closing velocity damages cars. Resting and
// separating contacts are depenetrated without repeated contact damage.
export function collidePolice(a, b) {
  if (a.state !== "active" || b.state !== "active") return 0;
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.hypot(dx, dz),
    diameter = CONFIG.policeRadius * 2;
  if (d >= diameter) return 0;
  const nx = d > 1e-6 ? dx / d : 1,
    nz = d > 1e-6 ? dz / d : 0;
  const correction = (diameter - d) / 2 + 0.001;
  a.x -= nx * correction;
  a.z -= nz * correction;
  b.x += nx * correction;
  b.z += nz * correction;
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing <= 0) return 0;
  const impulse = closing * 0.65;
  a.vx -= nx * impulse;
  a.vz -= nz * impulse;
  b.vx += nx * impulse;
  b.vz += nz * impulse;
  const damage = impactDamage(closing, CONFIG.pairDamageScale);
  let applied = 0;
  for (const car of [a, b])
    if ((car.pairCooldown || 0) <= 0 && damage > 0) {
      car.health = Math.max(0, car.health - damage);
      car.lastDamageCause = "vehicle";
      car.pairCooldown = CONFIG.impactCooldown;
      applied = damage;
    }
  return applied;
}

export function impactDamage(impact, scale) {
  return Math.pow(Math.max(0, impact - CONFIG.minimumImpact), 1.4) * scale;
}
export function wallImpact(car, impact) {
  const damage = impactDamage(impact, CONFIG.wallDamageScale);
  if ((car.wallCooldown || 0) > 0 || damage <= 0) return 0;
  car.health = Math.max(0, car.health - damage);
  car.lastDamageCause = "wall";
  car.wallCooldown = CONFIG.impactCooldown;
  return damage;
}
