import test from "node:test";
import assert from "node:assert/strict";
import { RoadNavigation, clearSegment } from "../src/game/navigation.js";
import { Simulation } from "../src/game/simulation.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import { makePolice } from "../src/game/police.js";
import { CONFIG } from "../src/game/config.js";
const tick = (s, t, input = {}) => {
  for (let i = 0; i < t * 60; i++) s.update(1 / 60, input);
};
test("A* goes around buildings with every waypoint segment clear", () => {
  const solids = [{ x: 15, z: 15, w: 18, d: 18 }],
    nav = new RoadNavigation(solids),
    from = { x: 0, z: 15 },
    to = { x: 30, z: 15 };
  assert.equal(nav.clear(from, to), false);
  const path = nav.findPath(from, to);
  assert.ok(path.length > 2);
  let previous = from;
  for (const node of path) {
    assert.ok(nav.clear(previous, node));
    previous = node;
  }
  assert.ok(path.some((n) => n.z === 0 || n.z === 30));
});
test("police routes around opposite side, replans on player reversal and never charges facade", () => {
  const s = new Simulation({ buildings: [{ x: 15, z: 15, w: 18, d: 18 }] });
  s.start();
  s.police = [
    Object.assign(makePolice(0), { x: 0, z: 15, angle: -Math.PI / 2 }),
  ];
  // Repositioning a stationary target is a fixture, not the autoplay benchmark.
  for (let i = 0; i < 600; i++) {
    Object.assign(s.player, {
      x: 30,
      z: i < 300 ? 15 : -15,
      vx: 0,
      vz: 0,
      speed: 0,
    });
    s.update(1 / 60, {});
  }
  const c = s.police[0];
  assert.ok(c.replans > 5);
  assert.ok(c.x > 20);
  assert.equal(s.stats.wallCollisions, 0);
  assert.equal(c.health, 100);
});
test("smoothed steering has no instant reversal and wall contact slides without damage or trapping", () => {
  const s = new Simulation({ buildings: [{ x: 0, z: 0, w: 8, d: 8 }] });
  s.start();
  s.police = [];
  s.update(1 / 60, { left: true });
  assert.ok(s.player.turn > 0 && s.player.turn < CONFIG.turnRate * 0.3);
  s.update(1 / 60, { right: true });
  assert.ok(Math.abs(s.player.turn) < CONFIG.turnRate * 0.4);
  Object.assign(s.player, {
    x: 0,
    z: 8,
    angle: 0,
    vx: 0,
    vz: -24,
    steering: 0,
  });
  tick(s, 5);
  assert.equal(s.health, 100);
  assert.ok(s.player.wallContacts > 0);
  assert.ok(Math.hypot(s.player.x, s.player.z - 5.15) > 8);
  for (const b of s.solids)
    assert.equal(resolveBuilding({ ...s.player }, b, 1.14), false);
});
test("initial fleet four, reinforcements use clear roads away from all vehicles, cap eight", () => {
  const s = new Simulation(createLayout());
  s.start();
  assert.equal(s.police.length, 4);
  // Force only encounter time/position in a deterministic recruitment fixture.
  for (let i = 0; i < 8; i++) {
    s.elapsed = 25 + i * 7;
    s.nextReinforcement = s.elapsed;
    Object.assign(s.player, { x: 0, z: 0 });
    s.update(1 / 60, {});
  }
  assert.equal(s.police.length, 8);
  assert.ok(s.police.every((c) => c.speed === 20));
  for (const c of s.police)
    for (const b of s.layout.buildings)
      assert.equal(resolveBuilding({ ...c }, b, 1.39), false);
});

test("reinforcement never falls back to teleporting across the map when safe nearby roads are full", () => {
  const nav = new RoadNavigation([]),
    p = { x: 0, z: 0, vx: 0, vz: -24 };
  const occupied = nav.nodes.map((n) => ({ ...n, state: "active" }));
  assert.equal(nav.spawn(p, occupied, 7), null);
  const spawn = nav.spawn(p, [], 7);
  assert.ok(Math.hypot(spawn.x - p.x, spawn.z - p.z) >= 27);
  assert.ok(Math.hypot(spawn.x - p.x, spawn.z - p.z) <= 48);
});
