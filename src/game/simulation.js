import { CONFIG, clamp } from "./config.js";
import { resolveBuilding } from "../world/layout.js";
import { createMission, updateMission } from "./missions.js";
import {
  makePolice,
  steerPolice,
  collidePolice,
  wallImpact,
} from "./police.js";
export class Simulation {
  constructor(layout) {
    this.layout = layout;
    this.solids = [...layout.buildings, ...(layout.obstacles || [])];
    this.reset();
  }
  reset(missionId = "survival60") {
    this.player = {
      x: 0,
      z: 8,
      angle: 0,
      vx: 0,
      vz: -CONFIG.playerSpeed,
      speed: CONFIG.playerSpeed,
      turn: 0,
    };
    this.health = 100;
    this.elapsed = 0;
    this.arrest = 0;
    this.hitCooldown = 0;
    this.result = null;
    this.collisions = 0;
    this.started = false;
    this.credits = 0;
    this.mission = createMission(missionId);
    this.events = [];
    this.eventId = 0;
    this.impactId = 0;
    this.impacts = [];
    this.stats = {
      explosions: 0,
      chainExplosions: 0,
      wallCollisions: 0,
      pairCollisions: 0,
      wallDamage: 0,
      pairDamage: 0,
    };
    this.police = Array.from({ length: CONFIG.policeCount }, (_, i) =>
      makePolice(i),
    );
  }
  start() {
    if (!this.result) {
      this.started = true;
      this.mission.status = "active";
    }
  }
  recordImpact(body, strength, kind) {
    if (strength < CONFIG.minimumImpact) return;
    this.impacts.push({
      id: ++this.impactId,
      type: "collision",
      x: body.x,
      z: body.z,
      strength,
      kind,
      time: this.elapsed,
    });
    if (this.impacts.length > 64) this.impacts.shift();
  }
  damage(amount) {
    if (this.hitCooldown <= 0) {
      this.health = Math.max(0, this.health - amount);
      this.hitCooldown = 0.65;
      this.collisions++;
    }
  }
  constrain(body, radius, fallback) {
    let hit = false;
    // Tight alleys can be narrower than a car. Iterate neighboring contacts,
    // then keep the last valid pose instead of pushing through another wall.
    for (let pass = 0; pass < 8; pass++) {
      let contact = false;
      for (const b of this.solids)
        if (resolveBuilding(body, b, radius)) {
          contact = true;
          hit = true;
        }
      if (!contact) break;
    }
    if (
      this.solids.some((b) => resolveBuilding({ ...body }, b, radius - 1e-6))
    ) {
      body.x = fallback.x;
      body.z = fallback.z;
      hit = true;
    }
    const x = body.x,
      z = body.z;
    body.x = clamp(x, -106, 106);
    body.z = clamp(z, -106, 106);
    return hit || x !== body.x || z !== body.z;
  }
  move(body, dt, radius = CONFIG.radius) {
    let hit = false;
    body.lastImpact = 0;
    const steps = Math.ceil((Math.hypot(body.vx, body.vz) * dt) / 0.5) || 1;
    for (let i = 0; i < steps; i++) {
      const previous = { x: body.x, z: body.z };
      body.x += (body.vx * dt) / steps;
      body.z += (body.vz * dt) / steps;
      const predicted = { x: body.x, z: body.z };
      if (this.constrain(body, radius, previous)) {
        hit = true;
        const nx = body.x - predicted.x,
          nz = body.z - predicted.z,
          length = Math.hypot(nx, nz);
        if (length > 1e-8)
          body.lastImpact = Math.max(
            body.lastImpact,
            Math.max(0, -(body.vx * nx + body.vz * nz) / length),
          );
      }
    }
    return hit;
  }
  explodePolice(car) {
    if (car.state !== "active") return;
    const queue = [car];
    const chained = new Set();
    while (queue.length) {
      const c = queue.shift();
      if (c.state !== "active") continue;
      this.stats.explosions++;
      if (chained.has(c)) this.stats.chainExplosions++;
      c.state = "wreck";
      c.health = 0;
      c.wreckAge = 0;
      c.vx = 0;
      c.vz = 0;
      this.events.push({
        id: ++this.eventId,
        type: "explosion",
        x: c.x,
        z: c.z,
        time: this.elapsed,
      });
      if (this.events.length > 64) this.events.shift();
      for (const other of this.police) {
        if (other === c || other.state !== "active") continue;
        const dx = other.x - c.x,
          dz = other.z - c.z,
          d = Math.hypot(dx, dz);
        if (d >= CONFIG.explosionRadius) continue;
        const strength = 1 - d / CONFIG.explosionRadius;
        const beforeHealth = other.health;
        other.health = Math.max(
          0,
          other.health - CONFIG.explosionDamage * strength,
        );
        other.vx += (d ? dx / d : 1) * strength * 12;
        other.vz += (d ? dz / d : 0) * strength * 12;
        if (other.health <= 0) {
          if (beforeHealth > 0) chained.add(other);
          queue.push(other);
        }
      }
    }
  }
  update(dt, input = {}) {
    if (!this.started || this.result || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.hitCooldown -= dt;
    const p = this.player;
    const previous = new Map(
      [p, ...this.police].map((c) => [c, { x: c.x, z: c.z }]),
    );
    p.turn = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * CONFIG.turnRate;
    p.angle += p.turn * dt;
    p.speed += (CONFIG.playerSpeed - p.speed) * (1 - Math.exp(-2 * dt));
    const grip = 1 - Math.exp(-10 * dt);
    p.vx += (-Math.sin(p.angle) * p.speed - p.vx) * grip;
    p.vz += (-Math.cos(p.angle) * p.speed - p.vz) * grip;
    if (this.move(p, dt)) {
      if (this.hitCooldown <= 0)
        this.recordImpact(p, p.lastImpact, "player-wall");
      this.damage(12);
      p.speed = 7;
      p.vx *= 0.55;
      p.vz *= 0.55;
    }
    for (let i = 0; i < this.police.length; i++) {
      const c = this.police[i];
      if (c.state !== "active") {
        c.wreckAge += dt;
        if (c.wreckAge >= CONFIG.respawnSeconds) {
          this.police[i] = makePolice(c.id, c.generation + 1, p);
          previous.set(this.police[i], {
            x: this.police[i].x,
            z: this.police[i].z,
          });
        }
        continue;
      }
      c.wallCooldown = Math.max(0, (c.wallCooldown || 0) - dt);
      c.pairCooldown = Math.max(0, (c.pairCooldown || 0) - dt);
      steerPolice(c, i, p, dt);
      if (this.move(c, dt, CONFIG.policeRadius)) {
        const damage = wallImpact(c, c.lastImpact);
        if (damage > 0) {
          this.stats.wallCollisions++;
          this.stats.wallDamage += damage;
          this.recordImpact(c, c.lastImpact, "police-wall");
        }
        c.stuck += dt;
        c.angle += dt * 2;
        c.vx *= 0.75;
        c.vz *= 0.75;
      } else c.stuck = Math.max(0, c.stuck - dt * 0.5);
      if (c.stuck > 2.5) c.stuck = 0;
    }
    // Contacts use the same fixed simulation step as vehicle movement.
    for (let i = 0; i < this.police.length; i++)
      for (let j = 0; j < i; j++) {
        const a = this.police[i],
          b = this.police[j];
        const speed = Math.hypot(a.vx - b.vx, a.vz - b.vz);
        const damage = collidePolice(a, b);
        if (damage > 0) {
          this.stats.pairCollisions++;
          this.stats.pairDamage += damage * 2;
          this.recordImpact(a, speed, "police-pair");
        }
      }
    for (const c of this.police)
      if (c.state === "active" && c.health <= 0) this.explodePolice(c);
    let nearby = 0;
    for (const c of this.police) {
      if (c.state !== "active") continue;
      const dx = p.x - c.x,
        dz = p.z - c.z,
        d = Math.hypot(dx, dz);
      if (d < 2.55) {
        const nx = d > 1e-6 ? dx / d : 1,
          nz = d > 1e-6 ? dz / d : 0,
          overlap = (2.55 - d) / 2;
        p.x += nx * overlap;
        p.z += nz * overlap;
        c.x -= nx * overlap;
        c.z -= nz * overlap;
        if (this.hitCooldown <= 0)
          this.recordImpact(
            p,
            Math.hypot(p.vx - c.vx, p.vz - c.vz),
            "player-police",
          );
        this.damage(8);
        p.speed = Math.max(3, p.speed - dt * 15);
      }
      if (d < 7) nearby++;
    }
    for (const c of [p, ...this.police]) {
      this.constrain(
        c,
        c === p ? CONFIG.radius : CONFIG.policeRadius,
        previous.get(c),
      );
    }
    this.arrest = clamp(
      this.arrest +
        (nearby >= 2 && Math.hypot(p.vx, p.vz) < 10 ? dt : -dt * 0.7),
      0,
      CONFIG.arrestSeconds,
    );
    if (this.health <= 0) this.result = "destroyed";
    else if (this.arrest >= CONFIG.arrestSeconds) this.result = "arrested";
    updateMission(this);
  }
}
