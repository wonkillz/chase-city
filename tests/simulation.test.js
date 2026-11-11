import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { CONFIG } from "../src/game/config.js";
import { makePolice, collidePolice } from "../src/game/police.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
const none = { left: false, right: false };
const create = (layout = { buildings: [] }) => {
  const sim = new Simulation(layout);
  sim.start();
  return sim;
};
const tick = (s, seconds, input = none) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) s.update(1 / 60, input);
};
function pair(speed) {
  const a = makePolice(0),
    b = makePolice(1);
  Object.assign(a, { x: 0, z: 0, vx: speed, vz: 0 });
  Object.assign(b, { x: 2, z: 0, vx: -speed, vz: 0 });
  return [a, b];
}
test("city contains solid buildings and traversable parks", () => {
  const l = createLayout();
  assert.ok(l.buildings.length > 100);
  assert.ok(l.parks.length > 5);
});
test("mission briefing freezes all vehicles and mission clock until START", () => {
  const s = new Simulation({ buildings: [] });
  const before = JSON.stringify([s.player, s.police]);
  tick(s, 3, { left: true });
  assert.equal(JSON.stringify([s.player, s.police]), before);
  assert.equal(s.elapsed, 0);
  assert.equal(s.mission.status, "pending");
  s.start();
  s.update(1 / 60, none);
  assert.ok(s.player.z < 8);
});
test("automatic forward and left/right steering; obsolete drift input has no effect", () => {
  const s = create(),
    other = create();
  s.police = [];
  other.police = [];
  tick(s, 0.5, { left: true });
  tick(other, 0.5, { left: true, drift: true });
  assert.ok(s.player.angle > 0.9);
  assert.deepEqual(s.player, other.player);
  const angle = s.player.angle;
  tick(s, 0.5, { right: true });
  assert.ok(s.player.angle < angle - 0.9);
});
test("player is 20% faster; normal police cannot close straight-line gap or gain time-based speed", () => {
  assert.equal(CONFIG.playerSpeed / CONFIG.policeSpeed, 1.2);
  const s = create();
  s.player.z = 70;
  s.police = [makePolice(0)];
  Object.assign(s.police[0], { x: 0, z: 100, vz: -20 });
  const gap = 30;
  tick(s, 5);
  assert.ok(s.police[0].z - s.player.z > gap + 15);
  assert.ok(Math.hypot(s.police[0].vx, s.police[0].vz) <= 20.001);
  s.elapsed = 55;
  tick(s, 1);
  assert.equal(s.police[0].speed, 20);
});
test("circle is expelled from all sides and inside a building", () => {
  const box = { x: 0, z: 0, w: 8, d: 8 };
  for (const p of [
    { x: 0, z: 0 },
    { x: 4.5, z: 0 },
    { x: -4.5, z: 0 },
    { x: 0, z: 4.5 },
    { x: 0, z: -4.5 },
  ]) {
    assert.ok(resolveBuilding(p, box));
    assert.ok(Math.abs(p.x) >= 5.149 || Math.abs(p.z) >= 5.149);
  }
});
test("building collision prevents tunnelling and reduces player durability", () => {
  const s = create({ buildings: [{ x: 0, z: 0, w: 8, d: 8 }] });
  s.police = [];
  tick(s, 1.5);
  assert.ok(s.player.z >= 5.149);
  assert.ok(s.health < 100);
});
test("police contacts separate vehicles, exchange impulse, and damage in proportion to impact", () => {
  const [a, b] = pair(4);
  const light = collidePolice(a, b);
  assert.ok(light > 0);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2.8);
  assert.ok(a.vx < 4 && b.vx > -4);
  const [c, d] = pair(10);
  assert.ok(collidePolice(c, d) > light);
  assert.equal(c.health, d.health);
});
test("separating and resting police contacts do not repeatedly damage cars", () => {
  const [a, b] = pair(-4);
  assert.equal(collidePolice(a, b), 0);
  assert.equal(a.health, 100);
  a.x = 0;
  b.x = 2;
  a.vx = 0;
  b.vx = 0;
  assert.equal(collidePolice(a, b), 0);
  assert.equal(b.health, 100);
});
test("several moderate impacts accumulate damage and high-energy impact is lethal", () => {
  const [a, b] = pair(6);
  for (let i = 0; i < 3; i++) {
    a.x = 0;
    b.x = 2;
    a.vx = 6;
    b.vx = -6;
    collidePolice(a, b);
  }
  assert.equal(a.health, 0);
  assert.equal(b.health, 0);
  const [c, d] = pair(20);
  assert.ok(collidePolice(c, d) >= 100);
  assert.equal(c.health, 0);
});
test("simulation resolves collision deaths into explosion events", () => {
  const s = create();
  s.police = pair(20);
  s.player.x = 50;
  s.player.z = 50;
  tick(s, 1 / 60);
  assert.ok(s.police.every((c) => c.state === "wreck"));
  assert.equal(s.events.length, 2);
});
test("blast impulses and weakened neighbors produce bounded chain reactions", () => {
  const s = create();
  s.police = [0, 4, 8, 30].map((x, i) =>
    Object.assign(makePolice(i), {
      x,
      z: 0,
      health: i === 1 || i === 2 ? 70 : 100,
    }),
  );
  s.explodePolice(s.police[0]);
  assert.deepEqual(
    s.police.map((c) => c.state),
    ["wreck", "wreck", "wreck", "active"],
  );
  assert.equal(s.events.length, 3);
  s.explodePolice(s.police[0]);
  assert.equal(s.events.length, 3);
  const s2 = create();
  s2.police = [
    Object.assign(makePolice(0), { x: 0, z: 0 }),
    Object.assign(makePolice(1), { x: 9, z: 0 }),
  ];
  s2.explodePolice(s2.police[0]);
  assert.ok(s2.police[1].vx > 0);
  assert.ok(s2.police[1].health < 100);
});
test("wrecks stop chasing and respawn on roads away from player after delay", () => {
  const s = create();
  s.police = [makePolice(0)];
  s.explodePolice(s.police[0]);
  const wreck = s.police[0];
  tick(s, 4);
  assert.equal(s.police[0], wreck);
  assert.equal(wreck.state, "wreck");
  tick(s, 1.1);
  const c = s.police[0];
  assert.equal(c.state, "active");
  assert.equal(c.generation, 1);
  assert.equal(c.health, 100);
  assert.ok(Math.hypot(c.x - s.player.x, c.z - s.player.z) > 25);
});
test("destroyed, arrested, and reset lifecycle is retained", () => {
  const s = create();
  s.health = 0;
  s.update(0.016, none);
  assert.equal(s.result, "destroyed");
  s.reset();
  assert.equal(s.health, 100);
  assert.equal(s.result, null);
  assert.equal(s.started, false);
  s.start();
  s.arrest = 3.99;
  s.player.speed = 0;
  s.player.vx = 0;
  s.player.vz = 0;
  s.police = [
    Object.assign(makePolice(0), { x: 3, z: 8, speed: 0 }),
    Object.assign(makePolice(1), { x: -3, z: 8, speed: 0 }),
  ];
  s.update(0.05, none);
  assert.equal(s.result, "arrested");
});
test("mission completes at 60 seconds, grants reward once, then freezes", () => {
  const s = create();
  s.police = [];
  s.elapsed = 59.95;
  s.update(0.025, none);
  assert.equal(s.result, null);
  s.update(0.05, none);
  assert.equal(s.result, "success");
  assert.equal(s.mission.status, "completed");
  assert.equal(s.credits, 300);
  const elapsed = s.elapsed;
  tick(s, 1);
  assert.equal(s.credits, 300);
  assert.equal(s.elapsed, elapsed);
  s.reset();
  assert.equal(s.credits, 0);
  assert.equal(s.mission.rewardGranted, false);
});
test("destroyed car cannot earn success on the same tick as mission deadline", () => {
  const s = create();
  s.elapsed = 59.99;
  s.health = 0;
  s.update(0.05, none);
  assert.equal(s.result, "destroyed");
  assert.equal(s.mission.status, "failed");
  assert.equal(s.credits, 0);
});
test("full city pursuit stays finite with intact building colliders", () => {
  const s = create(createLayout());
  for (let i = 0; i < 3000; i++) {
    if (s.result) (s.reset(), s.start());
    s.update(1 / 60, { left: i % 600 < 180, right: i % 600 > 400 });
    for (const c of [s.player, ...s.police]) {
      assert.ok(Number.isFinite(c.x + c.z + c.vx + c.vz));
      for (const b of s.layout.buildings)
        assert.equal(
          resolveBuilding({ ...c }, b, c === s.player ? 1.14 : 1.39),
          false,
        );
    }
  }
});

test("ordinary flanking pursuit produces police accidents without scripted explosions", () => {
  const s = create(createLayout());
  let explosions = 0;
  for (let i = 0; i < 2400; i++) {
    if (s.result) {
      explosions += s.events.length;
      s.reset();
      s.start();
    }
    s.update(1 / 60, { left: i % 480 < 110, right: i % 480 > 330 });
  }
  assert.ok(explosions + s.events.length > 0);
});
