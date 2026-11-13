import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { RoadNavigation } from "../src/game/navigation.js";
import { makePolice, steerPolice } from "../src/game/police.js";
import { CONFIG } from "../src/game/config.js";
import { updateWrecks } from "../src/game/wrecks.js";
import {
  WreckRenderer,
  wreckPose,
  WRECK_LIFT,
  WRECK_ROLL,
} from "../src/render/wrecks.js";
import { ExplosionEffects } from "../src/render/explosions.js";
import { ChaseCamera } from "../src/render/camera.js";

const empty = () => {
  const s = new Simulation(
    { buildings: [], obstacles: [] },
    { reinforcements: false, barricades: false },
  );
  s.start();
  return s;
};
// Player heading -z at full speed, as if fleeing down a long road.
const fleeing = () => ({
  x: 0,
  z: 0,
  angle: 0,
  vx: 0,
  vz: -24,
  speed: 24,
  netSpeed: 24,
  fleeSpeed: 24,
  groundSpeed: 24,
});

test("a fleeing player is pressed from behind, alongside and in front", () => {
  const nav = new RoadNavigation([]),
    player = fleeing();
  const fleet = [
    Object.assign(makePolice(0), { x: 0, z: 6 }),
    Object.assign(makePolice(1), { x: 3, z: 14 }),
    Object.assign(makePolice(2), { x: -3, z: 20 }),
    Object.assign(makePolice(3), { x: 3, z: 28 }),
  ];
  for (const c of fleet) c.vz = -20;
  fleet.forEach((c, i) => steerPolice(c, i, player, 1 / 60, nav, fleet, 20));
  assert.deepEqual(
    fleet.map((c) => c.role),
    ["pursuit", "flank", "front", "front"],
  );
  // Blockers out-run the 24-unit player to get in front of it.
  assert.ok(fleet[2].effectiveSpeed > CONFIG.playerSpeed);
  assert.ok(fleet[1].effectiveSpeed > CONFIG.playerSpeed);
  // A blocker already in front brakes into a roadblock, it does not charge.
  const blocker = Object.assign(makePolice(2), { x: 0, z: -16, vz: 0 });
  const trio = [fleet[0], fleet[1], blocker];
  for (let i = 0; i < 60; i++) steerPolice(blocker, 2, player, 1 / 60, nav, trio, 20);
  assert.equal(blocker.role, "front");
  assert.equal(blocker.pressure, "front");
  assert.ok(
    Math.hypot(blocker.vx, blocker.vz) <=
      CONFIG.blockerApproachSpeed + (16 - 6) * 0.6 + 1e-9,
  );
});

test("a slow or pinned player is converged on by every officer so the cordon can form", () => {
  const nav = new RoadNavigation([]),
    player = { ...fleeing(), vz: -3, netSpeed: 3, fleeSpeed: 3 };
  const fleet = [0, 1, 2, 3].map((i) =>
    Object.assign(makePolice(i), { x: (i - 1.5) * 4, z: 14 + i * 3 }),
  );
  fleet.forEach((c, i) => steerPolice(c, i, player, 1 / 60, nav, fleet, 20));
  assert.ok(fleet.every((c) => c.role === "pursuit"));
});

test("a blocker routes around the player via a parallel street (A* avoid)", () => {
  const layout = createLayout(),
    nav = new RoadNavigation(layout.buildings);
  const start = { x: 0, z: 60 },
    goal = { x: 0, z: -30 },
    player = { x: 0, z: 30 };
  const straight = nav.findPath(start, goal);
  const around = nav.findPath(start, goal, undefined, {
    ...player,
    radius: 16,
    penalty: 70,
  });
  const nearPlayer = (path) =>
    path.filter((n) => Math.hypot(n.x - player.x, n.z - player.z) < 16).length;
  assert.ok(straight.length && around.length);
  assert.ok(nearPlayer(around) < nearPlayer(straight));
});

test("same-lane officers keep a gap instead of rear-ending into self-destruction", () => {
  const s = empty();
  Object.assign(s.player, { x: 0, z: -40 });
  // Leader and a faster follower in the same lane, behind the player.
  const leader = Object.assign(makePolice(0), { x: 0, z: 0, vz: -20 });
  const follower = Object.assign(makePolice(1), { x: 0, z: 6, vz: -26 });
  s.police = [leader, follower];
  for (let i = 0; i < 90; i++) s.update(1 / 60, {});
  assert.equal(s.stats.pairCollisions, 0);
  assert.equal(leader.health, 100);
  assert.equal(follower.health, 100);
});

test("far from the player, oncoming officers keep right; near it, crashes stay physical", () => {
  const nav = new RoadNavigation([]);
  // Player far down the same road: route runs straight at the oncoming car.
  const far = { ...fleeing(), x: 0, z: -90 };
  const a = Object.assign(makePolice(0), { x: 0, z: 0, angle: 0, vz: -20 }),
    b = Object.assign(makePolice(1), {
      x: 0,
      z: -7,
      angle: Math.PI,
      vz: 20,
    });
  steerPolice(a, 0, far, 1 / 60, nav, [a, b], 20);
  assert.equal(a.overtaking, true);
  // The same encounter right next to the player is not avoided.
  const near = { ...fleeing(), x: 0, z: -12 };
  const c = Object.assign(makePolice(0), { x: 0, z: 0, angle: 0, vz: -20 }),
    d = Object.assign(makePolice(1), { x: 0, z: -7, angle: Math.PI, vz: 20 });
  steerPolice(c, 0, near, 1 / 60, nav, [c, d], 20);
  assert.equal(c.overtaking, false);
});

test("chain reactions are staged link by link and lose energy at each step", () => {
  const s = empty();
  Object.assign(s.player, { x: 80, z: 80 });
  // Five damaged cars in a row, 3 units apart.
  s.police = [0, 3, 6, 9, 12].map((x, i) =>
    Object.assign(makePolice(i), { x, z: 0, health: i ? 60 : 100 }),
  );
  s.explodePolice(s.police[0]);
  const events = s.events.filter((e) => e.type === "explosion");
  // 0.62 falloff: the chain reaches the 2nd and 3rd links, then dies out.
  assert.equal(events.length, 3);
  assert.deepEqual(
    s.police.map((c) => c.state),
    ["wreck", "wreck", "wreck", "active", "active"],
  );
  assert.deepEqual(
    events.map((e) => e.delay),
    [0, CONFIG.chainStepSeconds, CONFIG.chainStepSeconds * 2],
  );
  assert.ok(events.every((e) => e.chainRoot === events[0].id));
  // Each wreck lands, and each officer starts its crash animation, with its
  // own staged explosion.
  assert.deepEqual(
    s.wrecks.map((w) => w.born),
    events.map((e) => e.time + e.delay),
  );
  assert.deepEqual(
    s.police.slice(0, 3).map((c) => c.wreckAge),
    events.map((e) => 0 - e.delay),
  );
});

test("the crash animation ends exactly in the persistent wreck pose", () => {
  const start = wreckPose(0),
    end = wreckPose(CONFIG.wreckSeconds),
    later = wreckPose(60);
  assert.deepEqual(start, { y: 0, pitch: 0, roll: 0 });
  assert.ok(wreckPose(-0.3).y === 0, "staged links wait on the road");
  for (const pose of [end, later]) {
    assert.ok(Math.abs(pose.y - WRECK_LIFT) < 1e-9);
    assert.ok(Math.abs(pose.pitch - Math.PI) < 1e-9);
    assert.ok(Math.abs(pose.roll - WRECK_ROLL) < 1e-9);
  }
  // The wreck model uses the same Euler as the police mesh at that pose.
  const scene = new THREE.Scene(),
    r = new WreckRenderer(scene),
    s = empty();
  s.police = [Object.assign(makePolice(0), { x: 0, z: 0, angle: 0.7 })];
  s.explodePolice(s.police[0]);
  s.elapsed = 1;
  updateWrecks(s);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(20, 30, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  r.update(s, camera);
  const slot = r.pool.find((p) => p.id === s.wrecks[0].id);
  assert.ok(slot.group.visible);
  assert.deepEqual(
    [slot.body.rotation.x, slot.body.rotation.y, slot.body.rotation.z],
    [Math.PI, 0.7, WRECK_ROLL],
  );
  assert.equal(slot.body.position.y, WRECK_LIFT);
  // Still burning and still the same object long afterwards.
  for (let t = 2; t <= 180; t += 0.5) {
    s.elapsed = t;
    r.update(s, camera);
  }
  assert.ok(slot.group.visible && slot.id === s.wrecks[0].id);
  assert.ok(slot.flames.every((f) => f.scale.y > 0.3));
  assert.ok(slot.smoke.some((m) => m.position.y > 5));
});

test("explosion fragments land and stay until RESTART; staged links wait their turn", () => {
  const scene = new THREE.Scene(),
    started = [],
    fx = new ExplosionEffects(scene, (e) => started.push(e.id));
  const events = [
    { id: 1, type: "explosion", x: 0, z: 0, time: 10, delay: 0, chainDepth: 0 },
    { id: 2, type: "explosion", x: 4, z: 0, time: 10, delay: 0.22, chainDepth: 1 },
  ];
  fx.update(events, 10.1);
  assert.deepEqual(started, [1]);
  assert.equal(fx.active.length, 2);
  assert.equal(fx.active[1].group.visible, false);
  fx.update(events, 10.3);
  assert.deepEqual(started, [1, 2]);
  // The later chain link is bigger.
  assert.ok(fx.active[1].group.scale.x > fx.active[0].group.scale.x);
  for (let t = 10.3; t < 16; t += 0.1) fx.update(events, t);
  assert.equal(fx.active.length, 0);
  assert.equal(fx.debris.total, 36);
  for (const mesh of fx.debris.meshes) assert.ok(scene.children.includes(mesh));
  // Grows past its initial capacity without losing fragments.
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: 3 + i,
    type: "explosion",
    x: i,
    z: 0,
    time: 20,
    delay: 0,
  }));
  fx.update(many, 20);
  fx.update(many, 25);
  assert.equal(fx.debris.total, 36 + 60 * 18);
  fx.reset();
  assert.equal(fx.debris.total, 0);
  assert.ok(fx.debris.meshes.every((m) => m.count === 0));
});

test("camera shake only applies to the drawn frame and decays", () => {
  const rig = new ChaseCamera(1100, 740);
  rig.update({ x: 0, z: 0 }, 0);
  const before = rig.camera.position.clone();
  rig.kick(0.8);
  let during = null;
  rig.withShake(1 / 60, 3.1, () => (during = rig.camera.position.clone()));
  assert.ok(during.distanceTo(before) > 0.05);
  assert.ok(rig.camera.position.distanceTo(before) < 1e-9);
  for (let i = 0; i < 120; i++) rig.withShake(1 / 60, i, () => {});
  assert.ok(rig.shake < 0.01);
});
