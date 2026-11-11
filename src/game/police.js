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
  };
}
export function steerPolice(c, index, player, dt) {
  // Different prediction horizons and flanking offsets converge at corners:
  // officers try to intercept rather than gaining unlimited straight-line speed.
  const lead = [0, 0.85, 1.5, 0.5][index % 4];
  const flank = [0, 4, -4, 2][index % 4];
  const targetX = clamp(
    player.x + player.vx * lead + Math.cos(player.angle) * flank,
    -100,
    100,
  );
  const targetZ = clamp(
    player.z + player.vz * lead - Math.sin(player.angle) * flank,
    -100,
    100,
  );
  const roadX = Math.round(c.x / 30) * 30,
    roadZ = Math.round(c.z / 30) * 30;
  let tx = targetX,
    tz = targetZ;
  if (Math.hypot(player.x - c.x, player.z - c.z) > 16) {
    if (Math.abs(c.x - roadX) < Math.abs(c.z - roadZ)) {
      tx = roadX;
      tz = Math.round(targetZ / 30) * 30;
      if (Math.abs(c.z - tz) < 4) {
        tx = targetX;
        tz = targetZ;
      }
    } else {
      tx = Math.round(targetX / 30) * 30;
      tz = roadZ;
      if (Math.abs(c.x - tx) < 4) {
        tx = targetX;
        tz = targetZ;
      }
    }
  }
  if (c.stuck > 1) {
    tx = c.x + Math.sin(c.angle) * 12;
    tz = c.z + Math.cos(c.angle) * 12;
  }
  const desired = Math.atan2(-(tx - c.x), -(tz - c.z));
  const delta = clamp(angleDelta(desired, c.angle), -2.5 * dt, 2.5 * dt);
  c.angle += delta;
  c.turn = delta / dt;
  const grip = 1 - Math.exp(-3.5 * dt);
  c.vx += (-Math.sin(c.angle) * c.speed - c.vx) * grip;
  c.vz += (-Math.cos(c.angle) * c.speed - c.vz) * grip;
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
  const damage = Math.max(0, closing - 2) * 4;
  a.health = Math.max(0, a.health - damage);
  b.health = Math.max(0, b.health - damage);
  return damage;
}
