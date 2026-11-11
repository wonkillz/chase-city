import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import {
  EXIT_CANDIDATES,
  chooseExit,
  constrainToWorld,
} from "../src/game/escape.js";
import { RoadNavigation, clearSegment } from "../src/game/navigation.js";
import { makePolice, wallImpact } from "../src/game/police.js";
import {
  BARRICADE_TIMES,
  overlap,
  planBarricade,
} from "../src/game/barricades.js";
const create = () => {
  const s = new Simulation(createLayout(), { random: () => 0.3 });
  s.start();
  return s;
};
test("all 12 exit candidates are connected to city roads with a clear outside corridor", () => {
  const layout = createLayout(),
    solids = [...layout.buildings, ...layout.obstacles];
  assert.equal(EXIT_CANDIDATES.length, 12);
  for (const e of EXIT_CANDIDATES) {
    const nav = new RoadNavigation(solids);
    nav.addExit(e);
    assert.ok(nav.findPath({ x: 0, z: 0 }, e).length);
    assert.ok(clearSegment(e.anchor, e, solids, 2));
  }
});
test("restart chooses a new candidate, even with a deterministic RNG; no locked exit reward", () => {
  const s = create(),
    seen = new Set();
  for (let i = 0; i < 24; i++) {
    const previous = s.escape.exit.id;
    seen.add(previous);
    s.reset();
    assert.notEqual(s.escape.exit.id, previous);
    assert.equal(s.escape.phase, "locked");
    assert.equal(s.credits, 0);
  }
  assert.ok(seen.size > 1);
});
test("escape opens after 60, removes roadblocks, extends A* and continues police/timer", () => {
  const s = create();
  s.elapsed = 59.99;
  s.update(0.05, {});
  assert.equal(s.escape.phase, "open");
  assert.equal(s.result, null);
  assert.equal(s.credits, 0);
  assert.equal(s.barricades.length, 0);
  const t = s.elapsed,
    c = { x: s.police[0].x, z: s.police[0].z };
  s.update(0.05, {});
  assert.ok(s.elapsed > t);
  assert.ok(Math.hypot(s.police[0].x - c.x, s.police[0].z - c.z) > 0);
  assert.ok(s.navigation.findPath({ x: 0, z: 0 }, s.escape.exit).length);
});
test("a premature gate position does not clear; open escape failure wins over gate crossing", () => {
  const s = create();
  const e = s.escape.exit;
  Object.assign(s.player, { x: e.x, z: e.z });
  s.update(0.016, {});
  assert.equal(s.result, null);
  assert.equal(s.credits, 0);
  s.elapsed = 60;
  s.update(0.016, {});
  Object.assign(s.player, {
    x: e.x - e.dx * 0.1,
    z: e.z - e.dz * 0.1,
    vx: e.dx * 24,
    vz: e.dz * 24,
    angle: Math.atan2(-e.dx, -e.dz),
  });
  s.health = 0;
  s.update(0.016, {});
  assert.equal(s.result, "destroyed");
  assert.equal(s.credits, 0);
});
test("outside shoulders clamp locally instead of teleporting the player back into the city", () => {
  const e = EXIT_CANDIDATES.find((e) => e.id === "east-0"),
    escape = { phase: "open", exit: e };
  const p = { x: 130, z: 8.4 };
  constrainToWorld(p, escape, { x: 129.8, z: 8 });
  assert.equal(p.x, 130);
  assert.equal(p.z, 8);
  const city = { x: 107, z: 60 };
  constrainToWorld(city, escape, { x: 106, z: 60 });
  assert.equal(city.x, 106);
  assert.equal(city.z, 60);
});
test("10/20/30/40/50 road controls warn two seconds ahead and leave a car-width passage", () => {
  const s = create();
  s.police = [];
  for (const time of BARRICADE_TIMES) {
    Object.assign(s.player, { x: 0, z: 70, vx: 0, vz: -24, angle: 0 });
    s.elapsed = time - 2 - 0.02;
    s.update(0.02, {});
    assert.equal(s.barricadeWarning.time, time);
    s.elapsed = time - 0.02;
    s.update(0.02, {});
    const event = s.barricadeEvents.find((e) => e.time === time);
    assert.ok(event.placed);
    assert.ok(Math.abs(event.actualTime - time) < 0.001);
    const b = s.barricades.find((b) => b.id === time / 10);
    assert.ok(b.gap.width >= 4.5);
    assert.ok(s.staticSolids.every((box) => !overlap(b, box, 1.5)));
    const a = b.vertical
        ? { x: b.gap.x, z: b.z - 7 }
        : { x: b.x - 7, z: b.gap.z },
      c = b.vertical ? { x: b.gap.x, z: b.z + 7 } : { x: b.x + 7, z: b.gap.z };
    assert.ok(clearSegment(a, c, s.solids, 1.5));
    const before = b.vertical
        ? { x: b.road.x, z: b.z - 10 }
        : { x: b.x - 10, z: b.road.z },
      after = b.vertical
        ? { x: b.road.x, z: b.z + 10 }
        : { x: b.x + 10, z: b.road.z };
    assert.ok(s.navigation.findPath(before, after).length);
  }
  assert.deepEqual(
    s.barricadeEvents.map((e) => e.time),
    BARRICADE_TIMES,
  );
});
test("player roadblock collision slows without damage; police take two/three strong barrier impacts", () => {
  const s = create();
  s.police = [];
  const b = planBarricade(
    { x: 0, z: 70, vx: 0, vz: -24, angle: 0 },
    s.navigation,
    s.staticSolids,
    [],
    [],
    1,
  );
  Object.assign(b, { born: 0, expires: 100, passedAt: null });
  s.barricades = [b];
  s.refreshNavigation();
  Object.assign(s.player, {
    x: b.x,
    z: b.z + 2,
    angle: 0,
    vx: 0,
    vz: -24,
    steering: 0,
  });
  for (let i = 0; i < 8; i++) s.update(1 / 60, {});
  assert.equal(s.health, 100);
  assert.ok(s.player.speed < 24);
  const c = makePolice(0);
  for (let i = 0; i < 3; i++) {
    c.wallCooldown = 0;
    wallImpact(c, 20, "barricade");
  }
  assert.equal(c.health, 0);
  assert.equal(c.lastDamageCause, "barricade");
});
test("fleet grows to 4/5/6/7/8 on the requested schedule and never exceeds eight", () => {
  const s = create();
  for (const [time, count] of [
    [0, 4],
    [10, 5],
    [20, 6],
    [30, 7],
    [40, 8],
    [50, 8],
  ]) {
    s.elapsed = time;
    Object.assign(s.player, { x: 0, z: 0 });
    s.update(1 / 60, {});
    assert.equal(s.police.length, count);
  }
});

test("a real vehicle impulse into a barrier applies obstacle damage in the same simulation tick", () => {
  const s = new Simulation(
    { buildings: [] },
    { reinforcements: false, barricades: false },
  );
  s.start();
  s.barricades = [
    {
      id: 1,
      x: 0,
      z: 0,
      w: 5.8,
      d: 1.2,
      kind: "barricade",
      born: 0,
      expires: 100,
      road: { x: 0, z: 0 },
      gap: { x: 3, z: 0 },
      forward: { x: 0, z: -1 },
      passedAt: null,
    },
  ];
  s.refreshNavigation();
  Object.assign(s.player, { x: 0, z: 20, speed: 0, vx: 0, vz: 0 });
  s.police = [
    Object.assign(makePolice(0), { x: 0, z: 2.01, angle: 0, vx: 0, vz: 0 }),
    Object.assign(makePolice(1), { x: 0, z: 4.5, angle: 0, vx: 0, vz: -22 }),
  ];
  s.update(1 / 60, {});
  assert.ok(s.stats.pairCollisions > 0);
  assert.ok(s.stats.barricadeCollisions > 0);
  assert.ok(s.stats.barricadeDamage > 0);
  assert.ok(s.police[0].health < 100);
});
test("passed and expired roadblocks are removed from both physics and pathfinding", () => {
  const s = create();
  s.police = [];
  s.reinforcementsEnabled = false;
  const b = planBarricade(
    { x: 0, z: 70, vx: 0, vz: -24, angle: 0 },
    s.navigation,
    s.staticSolids,
    [],
    [],
    1,
  );
  Object.assign(b, { born: 0, expires: 14, passedAt: null });
  s.barricades = [b];
  s.refreshNavigation();
  s.barricadesEnabled = true;
  s.elapsed = 14;
  s.update(0.016, {});
  assert.ok(!s.barricades.includes(b));
  assert.ok(!s.navigation.solids.includes(b));
});

test("every cardinal exit clears only on outward final-gate crossing and pays exactly once", () => {
  for (const e of EXIT_CANDIDATES) {
    const s = new Simulation(createLayout(), {
      reinforcements: false,
      barricades: false,
    });
    s.start();
    s.police = [];
    s.escape.exit = e;
    s.elapsed = 60;
    s.openEscape();
    Object.assign(s.player, {
      x: e.x + e.dx * 0.1,
      z: e.z + e.dz * 0.1,
      vx: -e.dx * 24,
      vz: -e.dz * 24,
      angle: Math.atan2(e.dx, e.dz),
    });
    s.update(1 / 60);
    assert.equal(s.result, null, `inward ${e.id}`);
    assert.equal(s.credits, 0);
    Object.assign(s.player, {
      x: e.x - e.dx * 0.1,
      z: e.z - e.dz * 0.1,
      vx: e.dx * 24,
      vz: e.dz * 24,
      angle: Math.atan2(-e.dx, -e.dz),
      steering: 0,
    });
    s.update(1 / 60);
    assert.equal(s.result, "success", e.id);
    assert.equal(s.credits, 500);
    const time = s.elapsed;
    for (let i = 0; i < 60; i++) s.update(1 / 60);
    assert.equal(s.elapsed, time);
    assert.equal(s.credits, 500);
  }
});

test("escape pursuit follows the extended road instead of targeting the old city edge", () => {
  const s = new Simulation(createLayout(), {
    reinforcements: false,
    barricades: false,
  });
  const e = EXIT_CANDIDATES.find((e) => e.id === "north-0");
  s.start();
  s.escape.exit = e;
  s.openEscape();
  Object.assign(s.player, { x: 0, z: -130, vx: 0, vz: -24 });
  s.police = [
    Object.assign(makePolice(0), { x: 0, z: -90, vx: 0, vz: 0, angle: 0 }),
  ];
  for (let i = 0; i < 60; i++) {
    // Stationary external target isolates routing from final-gate completion.
    Object.assign(s.player, { x: 0, z: -130, vx: 0, vz: 0, speed: 0 });
    s.update(1 / 60);
  }
  assert.ok(s.police[0].z < -105);
  assert.equal(s.stats.wallCollisions, 0);
});

test("rounded building-corner contact slides out without losing health or entering solids", () => {
  const s = new Simulation(createLayout(), {
    reinforcements: false,
    barricades: false,
  });
  s.start();
  s.police = [];
  Object.assign(s.player, {
    x: -6.56365,
    z: 74.99971,
    angle: -5.08,
    vx: 0,
    vz: 0,
  });
  const initial = { ...s.player };
  for (let i = 0; i < 180; i++) {
    s.update(1 / 60);
    assert.ok(
      s.staticSolids.every((b) => !resolveBuilding({ ...s.player }, b, 1.149)),
    );
  }
  assert.equal(s.health, 100);
  assert.ok(Math.hypot(s.player.x - initial.x, s.player.z - initial.z) > 5);
});
