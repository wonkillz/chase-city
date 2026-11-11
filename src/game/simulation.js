import { CONFIG, clamp, angleDelta } from "./config.js";
import { RoadNavigation } from "./navigation.js";
import { resolveBuilding } from "../world/layout.js";
import { chooseExit, constrainToWorld } from "./escape.js";
import { updateBarricades } from "./barricades.js";
import { createMission, updateMission } from "./missions.js";
import {
  makePolice,
  steerPolice,
  collidePolice,
  wallImpact,
} from "./police.js";
export class Simulation {
  constructor(layout, options = {}) {
    this.layout = layout;
    this.staticSolids = [...layout.buildings, ...(layout.obstacles || [])];
    this.random = options.random || Math.random;
    this.reinforcementsEnabled = options.reinforcements !== false;
    this.barricadesEnabled = options.barricades !== false;
    this.lastExitId = null;
    this.runNumber = 0;
    this.reset();
  }
  refreshNavigation() {
    this.solids = [...this.staticSolids, ...this.barricades];
    this.navigation.setSolids(this.solids);
    for (const car of this.police) {
      car.route = [];
      car.routeTimer = 0;
    }
  }
  openEscape() {
    this.escape.phase = "open";
    this.escape.openedAt = this.elapsed;
    this.barricades = [];
    this.barricadeWarning = null;
    this.refreshNavigation();
    this.navigation.addExit(this.escape.exit);
  }
  reset(missionId = "survival60") {
    this.runNumber++;
    this.barricades = [];
    this.barricadeEvents = [];
    this.barricadeWarnings = new Set();
    this.barricadeWarning = null;
    this.solids = [...this.staticSolids];
    this.navigation = new RoadNavigation(this.solids);
    const exit = chooseExit(this.staticSolids, this.random, this.lastExitId);
    this.lastExitId = exit.id;
    this.escape = { phase: "locked", exit, openedAt: null };
    this.previousPlayer = { x: 0, z: 8 };
    this.player = {
      x: 0,
      z: 8,
      angle: 0,
      vx: 0,
      vz: -CONFIG.playerSpeed,
      speed: CONFIG.playerSpeed,
      turn: 0,
      steering: 0,
      slip: 0,
      wallContacts: 0,
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
      barricadeCollisions: 0,
      barricadeDamage: 0,
      boostSeconds: 0,
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
  applyPoliceObstacleDamage(car, strength) {
    const kind = car.lastObstacleKind === "barricade" ? "barricade" : "wall";
    const damage = wallImpact(car, strength, kind);
    if (damage > 0) {
      if (kind === "barricade") {
        this.stats.barricadeCollisions++;
        this.stats.barricadeDamage += damage;
      } else {
        this.stats.wallCollisions++;
        this.stats.wallDamage += damage;
      }
      this.recordImpact(car, strength, `police-${kind}`);
    }
    return damage;
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
      this.hitCooldown = 1.0;
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
          body.lastObstacleKind = b.kind || "wall";
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
    constrainToWorld(body, this.escape, fallback);
    return hit || x !== body.x || z !== body.z;
  }
  move(body, dt, radius = CONFIG.radius) {
    let hit = false;
    body.lastImpact = 0;
    body.lastObstacleKind = null;
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
        if (length > 1e-8) {
          body.lastImpact = Math.max(
            body.lastImpact,
            Math.max(0, -(body.vx * nx + body.vz * nz) / length),
          );
          if (body === this.player) {
            const ux = nx / length,
              uz = nz / length,
              inward = Math.min(0, body.vx * ux + body.vz * uz);
            body.vx -= ux * inward;
            body.vz -= uz * inward;
            const side = body.steering < 0 ? -1 : 1;
            let tx = -uz * side,
              tz = ux * side;
            if (body.vx * tx + body.vz * tz < 0) {
              tx = -tx;
              tz = -tz;
            }
            body.escapeAngle = Math.atan2(-tx, -tz);
          }
        }
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
        cause: c.lastDamageCause || "unknown",
        x: c.x,
        z: c.z,
        time: this.elapsed,
        playerX: this.player.x,
        playerZ: this.player.z,
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
          if (beforeHealth > 0) {
            chained.add(other);
            other.lastDamageCause = "blast";
          }
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
    this.previousPlayer = { x: p.x, z: p.z };
    if (this.escape.phase === "locked" && this.barricadesEnabled)
      updateBarricades(this);
    const previous = new Map(
      [p, ...this.police].map((c) => [c, { x: c.x, z: c.z }]),
    );
    const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    p.steering =
      (p.steering || 0) +
      (steering - (p.steering || 0)) * (1 - Math.exp(-dt * 7));
    p.turn = p.steering * CONFIG.turnRate;
    p.angle += p.turn * dt;
    p.speed += (CONFIG.playerSpeed - p.speed) * (1 - Math.exp(-2 * dt));
    const grip = 1 - Math.exp(-10 * dt);
    p.vx += (-Math.sin(p.angle) * p.speed - p.vx) * grip;
    p.vz += (-Math.cos(p.angle) * p.speed - p.vz) * grip;
    if (this.move(p, dt)) {
      p.wallContacts++;
      if (p.lastObstacleKind === "barricade") {
        p.speed = Math.min(p.speed, 12);
        p.vx *= 0.55;
        p.vz *= 0.55;
      }
      if (this.elapsed - (p.lastWallSound || -1) > 0.5) {
        this.recordImpact(p, p.lastImpact, "player-wall");
        p.lastWallSound = this.elapsed;
      }
      // Preserve tangential movement. When head-on, smoothly choose a wall
      // tangent so auto-forward driving never locks the car against a facade.
      if (Math.hypot(p.vx, p.vz) < 5) {
        const desired =
          p.escapeAngle ?? p.angle + ((p.steering < 0 ? -1 : 1) * Math.PI) / 2;
        // At concave contacts, a single wall tangent can point into the next
        // facade. Find a genuinely clear short slide instead of oscillating.
        const directions = [
          desired,
          ...Array.from(
            { length: 16 },
            (_, i) => p.angle + (i / 16) * Math.PI * 2,
          ),
        ];
        const free = directions.filter((a) => {
          for (let step = 1; step <= 8; step++) {
            const pose = {
              x: p.x - Math.sin(a) * step * 0.5,
              z: p.z - Math.cos(a) * step * 0.5,
            };
            if (
              !this.navigation.allowed(pose) ||
              this.solids.some((b) =>
                resolveBuilding({ ...pose }, b, CONFIG.radius - 0.01),
              )
            )
              return false;
          }
          return true;
        });
        if (free.length) {
          const heading = free.sort(
            (a, b) =>
              Math.abs(angleDelta(a, desired)) -
              Math.abs(angleDelta(b, desired)),
          )[0];
          p.angle += clamp(angleDelta(heading, p.angle), -5 * dt, 5 * dt);
          p.vx = -Math.sin(heading) * 7;
          p.vz = -Math.cos(heading) * 7;
        } else p.angle += clamp(angleDelta(desired, p.angle), -3 * dt, 3 * dt);
      }
    }
    p.slip = Math.abs(p.vx * Math.cos(p.angle) - p.vz * Math.sin(p.angle));
    const desiredFleet = Math.min(
      CONFIG.maxPolice,
      4 + Math.floor((this.elapsed + 1e-7) / 10),
    );
    while (this.reinforcementsEnabled && this.police.length < desiredFleet) {
      const id = this.police.length,
        spawn = this.navigation.spawn(p, this.police, id);
      if (!spawn) break;
      const c = Object.assign(makePolice(id), spawn);
      c.angle = Math.atan2(c.x - p.x, c.z - p.z);
      this.police.push(c);
      previous.set(c, { x: c.x, z: c.z });
    }
    for (let i = 0; i < this.police.length; i++) {
      const c = this.police[i];
      if (c.state !== "active") {
        c.wreckAge += dt;
        if (c.wreckAge >= CONFIG.respawnSeconds) {
          const spawn = this.navigation.spawn(
            p,
            this.police,
            c.id,
            c.generation + 1,
          );
          if (!spawn) continue;
          this.police[i] = Object.assign(
            makePolice(c.id, c.generation + 1, p),
            spawn,
          );
          previous.set(this.police[i], {
            x: this.police[i].x,
            z: this.police[i].z,
          });
        }
        continue;
      }
      c.wallCooldown = Math.max(0, (c.wallCooldown || 0) - dt);
      c.pairCooldown = Math.max(0, (c.pairCooldown || 0) - dt);
      steerPolice(c, i, p, dt, this.navigation, this.police, this.elapsed);
      if (c.boostTimer > 0) this.stats.boostSeconds += dt;
      if (this.move(c, dt, CONFIG.policeRadius)) {
        this.applyPoliceObstacleDamage(c, c.lastImpact);
        c.stuck += dt;
        c.routeTimer = 0;
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
          this.recordImpact(a, a.lastCollisionStrength || speed, "police-pair");
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
        this.damage(5);
        p.speed = Math.max(12, p.speed - dt * 8);
      }
      if (d < 7) nearby++;
    }
    for (const c of [p, ...this.police]) {
      const before = { x: c.x, z: c.z };
      const hit = this.constrain(
        c,
        c === p ? CONFIG.radius : CONFIG.policeRadius,
        previous.get(c),
      );
      if (hit && c !== p && c.state === "active") {
        const nx = c.x - before.x,
          nz = c.z - before.z,
          length = Math.hypot(nx, nz);
        if (length > 1e-8)
          this.applyPoliceObstacleDamage(
            c,
            Math.max(0, -(c.vx * nx + c.vz * nz) / length),
          );
      }
    }
    for (const c of this.police)
      if (c.state === "active" && c.health <= 0) this.explodePolice(c);
    this.arrest = clamp(
      this.arrest + (nearby >= 2 && Math.hypot(p.vx, p.vz) < 6 ? dt : -dt),
      0,
      CONFIG.arrestSeconds,
    );
    if (this.health <= 0) this.result = "destroyed";
    else if (this.arrest >= CONFIG.arrestSeconds) this.result = "arrested";
    updateMission(this);
  }
}
