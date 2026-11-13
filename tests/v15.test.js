import { ChaseCamera } from "../src/render/camera.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Simulation } from "../src/game/simulation.js";
import { CONFIG } from "../src/game/config.js";
import { makePolice, collidePolice, steerPolice } from "../src/game/police.js";
import { inspectEnclosure } from "../src/game/arrest.js";
import { addWreck, updateWrecks } from "../src/game/wrecks.js";
import { RoadNavigation } from "../src/game/navigation.js";
import { EXIT_CANDIDATES } from "../src/game/escape.js";
import { planBarricade } from "../src/game/barricades.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import { WreckRenderer } from "../src/render/wrecks.js";
const make = () => {
  const s = new Simulation(
    { buildings: [], obstacles: [] },
    { reinforcements: false, barricades: false },
  );
  s.start();
  Object.assign(s.player, { x: 0, z: 0, vx: 0, vz: 0, speed: 0 });
  return s;
};
const ring = (d = 3.4) =>
  Array.from({ length: 4 }, (_, i) =>
    Object.assign(makePolice(i), {
      x: Math.sin((i * Math.PI) / 2) * d,
      z: Math.cos((i * Math.PI) / 2) * d,
      angle: (i * Math.PI) / 2,
    }),
  );
const tick = (s, t) => {
  for (let i = 0; i < t * 60; i++) s.update(1 / 60);
};
test("four real low-speed containment officers arrest in three seconds without damage or explosions", () => {
  const s = make();
  s.police = ring();
  tick(s, 2.9);
  assert.equal(s.result, null);
  assert.ok(s.arrest > 2.8);
  assert.ok(s.police.every((c) => c.health === 100));
  assert.equal(s.events.length, 0);
  tick(s, 0.2);
  assert.equal(s.result, "arrested");
  assert.ok(s.elapsed >= 3 && s.elapsed < 3.2);
  const t = s.elapsed;
  tick(s, 1);
  assert.equal(s.elapsed, t);
});
test("stationary and low-speed three/four-car contact never accumulates durability damage", () => {
  for (const count of [3, 4]) {
    const cars = ring(2.5).slice(0, count);
    for (let frame = 0; frame < 600; frame++)
      for (let i = 0; i < cars.length; i++)
        for (let j = 0; j < i; j++) {
          Object.assign(cars[i], { x: 0, z: 0, vx: 4, vz: 0, pairCooldown: 0 });
          Object.assign(cars[j], {
            x: 2,
            z: 0,
            vx: -4,
            vz: 0,
            pairCooldown: 0,
          });
          assert.equal(collidePolice(cars[i], cars[j]), 0);
        }
    assert.ok(cars.every((c) => c.health === 100));
  }
});
test("open space and a removed cordon officer clear the gauge quickly instead of false arrest", () => {
  assert.equal(inspectEnclosure({ x: 0, z: 0 }, ring(7), []).trapped, false);
  assert.equal(
    inspectEnclosure({ x: 0, z: 0 }, [ring()[0], ring()[1], ring()[3]], [])
      .trapped,
    false,
  );
  const s = make();
  s.police = ring();
  tick(s, 1.6);
  assert.ok(s.arrest > 1.5);
  Object.assign(s.police[2], { x: 30, z: 30 });
  tick(s, 0.75);
  assert.equal(s.arrest, 0);
  assert.equal(s.result, null);
});
test("high-speed impacts still destroy a police car after two strong real contacts", () => {
  const a = makePolice(0),
    b = makePolice(1);
  for (let i = 0; i < 2; i++) {
    Object.assign(a, { x: 0, z: 0, vx: 20, vz: 0, pairCooldown: 0 });
    Object.assign(b, { x: 2, z: 0, vx: -20, vz: 0, pairCooldown: 0 });
    assert.equal(collidePolice(a, b), 60);
  }
  assert.equal(a.health, 0);
  assert.equal(b.health, 0);
});
test("containment uses four distinct sides and arrives gently rather than ramming its slots", () => {
  const s = make();
  s.police = ring(6);
  s.player.contained = true;
  s.player.cordonHeading = 0;
  for (let i = 0; i < s.police.length; i++)
    steerPolice(s.police[i], i, s.player, 0.05, s.navigation, s.police, 40);
  assert.ok(
    s.police.every((c) => c.role === "contain" && Math.hypot(c.vx, c.vz) < 7),
  );
});
test("full-width barriers physically stop both vehicle types and every planned barrier has a street detour", () => {
  const layout = createLayout(),
    solids = [...layout.buildings, ...layout.obstacles],
    nav = new RoadNavigation(solids);
  let placed = 0;
  for (const x of [-60, 0, 60])
    for (const z of [-60, 0, 60])
      for (const sign of [-1, 1]) {
        const b = planBarricade(
          { x, z, vx: 0, vz: sign * 24, angle: 0 },
          nav,
          solids,
          [],
          [],
          1,
        );
        if (!b) continue;
        placed++;
        assert.ok(b.detour.length >= 4);
        assert.equal(b.gap, undefined);
        const trial = new RoadNavigation([...solids, b]);
        for (let i = 1; i < b.detour.length; i++)
          assert.ok(trial.clear(b.detour[i - 1], b.detour[i]));
        const s = make();
        s.staticSolids = [];
        s.barricades = [b];
        s.refreshNavigation();
        for (const radius of [CONFIG.radius, CONFIG.policeRadius])
          for (const lateral of [-5, -2.5, 0, 2.5, 5]) {
            const body = {
              x: b.x + (b.vertical ? lateral : -4),
              z: b.z + (b.vertical ? -4 : lateral),
              vx: b.vertical ? 0 : 24,
              vz: b.vertical ? 24 : 0,
              steering: 0,
            };
            for (let i = 0; i < 30; i++) s.move(body, 1 / 60, radius);
            assert.ok(b.vertical ? body.z < b.z : body.x < b.x);
          }
      }
  assert.equal(placed, 18);
});
test("landed wrecks persist after officer replacement, block movement, and invalidate navigation", () => {
  const s = make();
  s.police = [Object.assign(makePolice(0), { x: 0, z: 20 })];
  s.explodePolice(s.police[0]);
  const rev = s.navigation.revision;
  tick(s, 1);
  assert.equal(s.wrecks.length, 1);
  assert.ok(s.wrecks[0].solid);
  assert.ok(s.navigation.revision > rev);
  assert.ok(s.solids.includes(s.wrecks[0]));
  const p = { x: 0, z: 16, vx: 0, vz: 24 };
  for (let i = 0; i < 30; i++) s.move(p, 1 / 60);
  assert.ok(p.z < 20);
  tick(s, 5);
  assert.equal(s.police[0].state, "active");
  assert.equal(s.wrecks.length, 1);
});
test("wreck bypass nodes preserve a clear A-star route on the single outside escape road", () => {
  const s = make();
  s.escape.exit = EXIT_CANDIDATES.find((e) => e.id === "north-0");
  s.openEscape();
  addWreck(s, { x: 0, z: -115, angle: 0 });
  s.elapsed = 1;
  updateWrecks(s);
  const path = s.navigation.findPath({ x: 0, z: -100 }, { x: 0, z: -140 });
  assert.ok(path.length > 0);
  assert.ok(path.some((n) => Math.abs(n.x) > 2));
  for (let i = 1; i < path.length; i++)
    assert.ok(s.navigation.clear(path[i - 1], path[i]));
});
test("wreck data survives age, offscreen travel and growth beyond the former cap until restart", () => {
  const s = make();
  for (let i = 0; i < 64; i++)
    addWreck(s, {
      x: (i % 8) * 6 - 21,
      z: Math.floor(i / 8) * 6 - 21,
      angle: 0,
    });
  const records = [...s.wrecks],
    poses = records.map((w) => [w.x, w.z, w.angle, w.id]);
  for (const time of [1, 30, 60, 120]) {
    s.elapsed = time;
    updateWrecks(s);
    assert.equal(s.wrecks.length, 64);
    assert.ok(records.every((w, i) => s.wrecks[i] === w));
    assert.deepEqual(
      s.wrecks.map((w) => [w.x, w.z, w.angle, w.id]),
      poses,
    );
  }
  assert.ok(s.wrecks.every((w) => w.solid));
  s.reset();
  assert.deepEqual(s.wrecks, []);
});
test("persistent fire, smoke and fragments reuse shared materials without per-frame growth", () => {
  const scene = new THREE.Scene(),
    r = new WreckRenderer(scene),
    s = make();
  s.police = [];
  addWreck(s, { x: 0, z: 0, angle: 0 });
  s.elapsed = 8;
  updateWrecks(s);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(20, 30, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  r.update(s, camera);
  const count = scene.children.length;
  for (let i = 0; i < 200; i++) {
    s.elapsed += 0.01;
    r.update(s, camera);
  }
  assert.equal(scene.children.length, count);
  assert.equal(r.pool.length, CONFIG.initialWreckSlots);
  const slot = r.pool.find((p) => p.group.visible);
  assert.ok(slot);
  assert.equal(slot.flames.length, 3);
  assert.equal(slot.smoke.length, 4);
  assert.ok(slot.smoke.some((m) => m.position.y > 2));
  assert.ok(slot.group.children.filter((m) => m.position.y < 0.3).length >= 4);
  assert.equal(r.pool[0].flames[0].material, r.pool[1].flames[0].material);
  r.reset();
  assert.ok(r.pool.every((p) => !p.group.visible && p.id === null));
});

test("a circle-only offset gap is not an exit when the full car cannot steer through", () => {
  const poses = [
    [-1.2927676331812241, 4.506179473992953, 0.4185317602020452],
    [3.257897159577368, -0.22795014265363095, 1.7660351310004763],
    [-0.6469196055244033, -4.914353691042187, 2.7534098574753485],
    [-4.370949070152568, -0.5544684454647655, 5.98412190196549],
  ];
  const cops = poses.map(([x, z, angle], i) =>
    Object.assign(makePolice(i), { x, z, angle }),
  );
  const result = inspectEnclosure({ x: 0, z: 0 }, cops, []);
  assert.equal(result.trapped, true);
  assert.equal(result.reason, "no-drivable-exit");
});
test("reinforcements stay on actual roads rather than spawning on wreck bypass corners", () => {
  const nav = new RoadNavigation([]);
  nav.setSolids([{ x: 0, z: 0, w: 2.1, d: 3.6, kind: "wreck" }]);
  assert.ok(nav.nodes.some((n) => n.x % 30 !== 0 && n.z % 30 !== 0));
  for (let i = 0; i < 20; i++) {
    const p = { x: 0, z: -30, vx: 0, vz: 24, angle: Math.PI };
    const rig = new ChaseCamera();
    rig.follow.set(p.x, 0, p.z);
    rig.update(p, 0);
    const spawn = nav.spawn(p, [], i, i, rig.camera);
    assert.ok(spawn);
    assert.ok(spawn.x % 30 === 0 || spawn.z % 30 === 0);
  }
});
