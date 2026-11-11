import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { makePolice, collidePolice, steerPolice } from "../src/game/police.js";
import { addWreck, updateWrecks } from "../src/game/wrecks.js";
import { WreckRenderer } from "../src/render/wrecks.js";
import { CONFIG } from "../src/game/config.js";
import { inspectEnclosure } from "../src/game/arrest.js";
import { reproduceCordon } from "../scripts/reproduce-v16.js";
const empty = () => {
  const s = new Simulation(
    { buildings: [], obstacles: [] },
    { reinforcements: false, barricades: false },
  );
  s.start();
  return s;
};
test("normal START and legal steering lead real AI to 100 percent arrest with no explosions", () => {
  const r = reproduceCordon();
  assert.equal(r.result, "arrested");
  assert.equal(r.explosions, 0);
  assert.deepEqual(
    r.initial.police.map((c) => [c.x, c.z]),
    [
      [-3, 30],
      [3, 39],
      [-3, 48],
      [3, 57],
    ],
  );
  assert.equal(r.timeline[0].percent, 0);
  assert.equal(r.timeline.at(-1).percent, 100);
  assert.ok(
    r.timeline.some(
      (p) =>
        p.trapped &&
        p.nearby >= 3 &&
        p.nearby <= 4 &&
        p.groundSpeed > 3 &&
        p.arrest > 0,
    ),
  );
  assert.ok(r.timeline.every((p) => p.explosions === 0));
  assert.ok(r.elapsed < 45);
});
test("translating the formation preserves a sealed cordon and its capture geometry", () => {
  const s = empty();
  Object.assign(s.player, { x: 0, z: 0, vx: 0, vz: 0, speed: 0 });
  s.police = Array.from({ length: 4 }, (_, i) =>
    Object.assign(makePolice(i), {
      x: Math.sin((i * Math.PI) / 2) * 3.4,
      z: Math.cos((i * Math.PI) / 2) * 3.4,
      angle: (i * Math.PI) / 2,
    }),
  );
  for (let frame = 0; frame < 190 && !s.result; frame++) {
    // External contact displacement of the whole formation, with the same
    // relative geometry. Normal AI and contact solving still run each step.
    for (const c of [s.player, ...s.police]) c.x += 0.1;
    s.update(1 / 60);
  }
  assert.equal(s.result, "arrested");
  assert.equal(s.stats.explosions, 0);
});
test("entering containment brakes a fast officer before contacts while normal high-speed pursuit still damages", () => {
  const s = empty();
  Object.assign(s.player, {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    contained: true,
    cordonHeading: 0,
  });
  const c = Object.assign(makePolice(0), { x: 0, z: 10, vx: 0, vz: -27 });
  steerPolice(c, 0, s.player, 1 / 60, s.navigation, [c], 20);
  assert.equal(c.role, "contain");
  assert.ok(Math.hypot(c.vx, c.vz) <= 6.01);
  assert.equal(c.boostTimer, 0);
  const a = Object.assign(makePolice(1), { x: 0, z: 0, vx: 20, vz: 0 }),
    b = Object.assign(makePolice(2), { x: 2, z: 0, vx: -20, vz: 0 });
  assert.equal(collidePolice(a, b), 60);
});
test("a low-speed arrest cordon survives nearby blast chains; high-speed damaged neighbors still chain", () => {
  const s = empty();
  Object.assign(s.player, { x: 0, z: 0, contained: true });
  const source = Object.assign(makePolice(0), { x: 0, z: 5 });
  const captor = Object.assign(makePolice(1), {
    x: 2,
    z: 3,
    role: "contain",
    health: 2,
    vx: 0,
    vz: 0,
  });
  const pursuit = Object.assign(makePolice(2), {
    x: -2,
    z: 5,
    health: 2,
    role: "pursuit",
    vx: 20,
    vz: 0,
  });
  const alreadyDestroyed = Object.assign(makePolice(3), {
    x: 0,
    z: 7,
    role: "contain",
    health: 0,
    vx: 0,
    vz: 0,
  });
  s.police = [source, captor, pursuit, alreadyDestroyed];
  s.explodePolice(source);
  assert.equal(captor.state, "active");
  assert.ok(captor.health >= 1);
  assert.equal(pursuit.state, "wreck");
  assert.equal(alreadyDestroyed.state, "wreck");
});
test("real repeated collision wrecks remain independent of respawn and keep IDs/positions for 30 and 60 seconds", () => {
  const s = empty();
  Object.assign(s.player, { x: 60, z: 60 });
  const a = makePolice(0),
    b = makePolice(1);
  s.police = [a, b];
  for (let hit = 0; hit < 2; hit++) {
    Object.assign(a, { x: 0, z: 0, vx: 20, vz: 0, pairCooldown: 0 });
    Object.assign(b, { x: 2, z: 0, vx: -20, vz: 0, pairCooldown: 0 });
    collidePolice(a, b);
  }
  assert.equal(a.health, 0);
  s.explodePolice(a);
  const first = s.wrecks[0],
    pose = [first.x, first.z, first.id];
  for (let i = 0; i < 6 * 60; i++) s.update(1 / 60);
  assert.ok(s.police.some((c) => c.generation > 0));
  assert.equal(s.wrecks[0], first);
  for (const age of [30, 60, 180]) {
    s.elapsed = first.born + age;
    updateWrecks(s);
    assert.equal(s.wrecks[0], first);
    assert.deepEqual([first.x, first.z, first.id], pose);
  }
});
test("more than the old render cap expands slots without evicting, and offscreen fire resumes in the same slot", () => {
  const s = empty();
  s.police = [];
  const scene = new THREE.Scene(),
    r = new WreckRenderer(scene);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.set(20, 40, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  for (let i = 0; i < 48; i++)
    addWreck(s, { x: (i % 6) * 0.1, z: Math.floor(i / 6) * 0.1, angle: 0 });
  s.elapsed = 1;
  updateWrecks(s);
  r.update(s, camera);
  assert.equal(r.slots.size, 48);
  assert.ok(r.pool.length > CONFIG.initialWreckSlots);
  const first = r.slots.get(1),
    ids = r.pool.map((p) => p.id);
  const before = first.smoke.map((m) => m.position.y);
  camera.position.set(220, 40, 220);
  camera.lookAt(220, 0, 180);
  camera.updateMatrixWorld(true);
  s.elapsed = 30;
  r.update(s, camera);
  assert.equal(first.group.visible, false);
  assert.equal(scene.children.length, 0);
  assert.equal(s.wrecks.length, 48);
  assert.deepEqual(
    r.pool.map((p) => p.id),
    ids,
  );
  camera.position.set(20, 40, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  s.elapsed = 60.3;
  r.update(s, camera);
  assert.equal(r.slots.get(1), first);
  assert.equal(first.group.visible, true);
  assert.equal(scene.children.length, 48);
  assert.ok(first.smoke.some((m, i) => m.position.y !== before[i]));
  assert.equal(first.group.position.x, s.wrecks[0].x);
  assert.equal(first.group.position.z, s.wrecks[0].z);
  const t = first.lastEffectTime;
  r.update(s, camera);
  assert.equal(first.lastEffectTime, t);
  s.result = "destroyed";
  const records = [...s.wrecks];
  s.update(1 / 60);
  assert.ok(records.every((w, i) => s.wrecks[i] === w));
  s.reset();
  r.reset();
  assert.equal(s.wrecks.length, 0);
  assert.equal(r.slots.size, 0);
  assert.ok(r.pool.every((p) => p.id === null && !p.group.visible));
});

test("a larger closed pocket is not reported as an escape merely because many poses need searching", () => {
  const cops = [-2.5, 0, 2.5].map((x, i) =>
    Object.assign(makePolice(i), { x, z: -5, angle: 0 }),
  );
  const walls = [
    { x: -7, z: 0, w: 1, d: 15 },
    { x: 7, z: 0, w: 1, d: 15 },
    { x: 0, z: 7, w: 15, d: 1 },
    { x: -5, z: -7, w: 5, d: 1 },
    { x: 5, z: -7, w: 5, d: 1 },
  ];
  const result = inspectEnclosure({ x: 0, z: 0, angle: 0 }, cops, walls);
  assert.equal(result.trapped, true);
  assert.equal(result.exits, 0);
  assert.ok(result.searched > 5000);
});
