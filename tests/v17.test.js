import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Simulation } from "../src/game/simulation.js";
import { RoadNavigation } from "../src/game/navigation.js";
import { createLayout } from "../src/world/layout.js";
import { ChaseCamera } from "../src/render/camera.js";
import { inspectSpawn, spawnView, spawnHull } from "../src/game/spawning.js";
import { makePolice, collidePolice } from "../src/game/police.js";
const rig = (width = 1100, height = 740, p = { x: 0, z: 0 }) => {
  const r = new ChaseCamera(width, height);
  r.follow.set(p.x, 0, p.z);
  r.update(p, 0);
  return r;
};
test("all successful spawns use the actual PC/phone/landscape camera hull, including camera rotations", () => {
  let success = 0;
  for (const [w, h] of [
    [1100, 740],
    [390, 664],
    [844, 390],
  ])
    for (const angle of [0, 0.8, 1.7, 3.1]) {
      const p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24 },
        r = rig(w, h, p);
      r.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      r.camera.lookAt(0, 0, 0);
      r.camera.updateMatrixWorld(true);
      const nav = new RoadNavigation([]),
        n = nav.spawn(p, [], 4, 0, r.camera);
      if (!n) continue;
      success++;
      assert.ok(n.spawnProof.outside);
      assert.ok(n.spawnProof.forward <= -12);
      assert.ok(n.spawnProof.distance >= 45 && n.spawnProof.distance <= 115);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
          r.camera.projectionMatrix,
          r.camera.matrixWorldInverse,
        ),
      );
      assert.equal(frustum.intersectsBox(spawnHull(n, n.angle, 8)), false);
      assert.ok(nav.clear(n, n));
      assert.ok(n.route.length >= 2);
    }
  assert.ok(success >= 4);
});
test("a missing camera or a camera showing every eligible rear road defers creation, with no fallback", () => {
  const p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24 },
    nav = new RoadNavigation([]);
  assert.equal(nav.spawn(p, [], 4), null);
  const c = new THREE.PerspectiveCamera(150, 1, 0.1, 2000);
  c.position.set(0, 400, 0);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  assert.equal(nav.spawn(p, [], 4, 0, c), null);
});
test("an offscreen centre is insufficient if the body or safety margin still intersects the view", () => {
  const r = rig(),
    view = spawnView(r.camera);
  let found = false;
  for (let x = -120; x <= 120; x += 2)
    for (let z = -120; z <= 120; z += 2) {
      const p = new THREE.Vector3(x, 1, z).project(r.camera);
      if (
        (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) &&
        p.z < 1 &&
        !inspectSpawn(view, { x, z }, 0).outside
      ) {
        found = true;
        break;
      }
    }
  assert.ok(found);
});
test("reinforcement and 2.5-second respawn share safe rear-road rules and leave permanent wrecks", () => {
  for (const [width, height] of [
    [1100, 740],
    [390, 664],
  ]) {
    const s = new Simulation(createLayout(), {
      width,
      height,
      reinforcements: false,
      barricades: false,
    });
    s.start();
    s.police = [makePolice(0)];
    s.explodePolice(s.police[0]);
    const w = s.wrecks[0];
    for (let f = 0; f < 5 * 60 && !s.spawnEvents.length; f++) s.update(1 / 60);
    assert.ok(s.spawnEvents.length);
    const e = s.spawnEvents[0];
    assert.equal(e.kind, "respawn");
    assert.ok(e.respawnDelay >= 2.5);
    assert.ok(e.outside && e.forward <= -12);
    assert.equal(s.wrecks[0], w);
  }
});
test("a newly opened exit at 99 percent cannot be converted into BUSTED by grace time", () => {
  const s = new Simulation(
    { buildings: [], obstacles: [] },
    { reinforcements: false, barricades: false },
  );
  s.start();
  Object.assign(s.player, { x: 0, z: 0, vx: 0, vz: 0, speed: 0 });
  s.police = Array.from({ length: 4 }, (_, i) =>
    Object.assign(makePolice(i), {
      x: Math.sin((i * Math.PI) / 2) * 3.4,
      z: Math.cos((i * Math.PI) / 2) * 3.4,
      angle: (i * Math.PI) / 2,
    }),
  );
  for (let i = 0; i < 120; i++) s.update(1 / 60);
  s.arrest = 2.99;
  Object.assign(s.police[2], { x: 30, z: 30 });
  for (let i = 0; i < 70; i++) s.update(1 / 60);
  assert.equal(s.result, null);
  assert.equal(s.arrest, 0);
});
test("chase impact damage distinguishes glancing and head-on crashes, but low-speed containment remains zero", () => {
  const pair = (vx, vz) => [
    Object.assign(makePolice(0), { x: 0, z: 0, vx, vz, mode: "pursuit" }),
    Object.assign(makePolice(1), {
      x: 2,
      z: 0,
      vx: -vx,
      vz: 0,
      mode: "pursuit",
    }),
  ];
  let [a, b] = pair(20, 0);
  const head = collidePolice(a, b);
  assert.equal(head, 60);
  [a, b] = pair(5, 20);
  const side = collidePolice(a, b);
  assert.ok(side > 0 && side < head);
  [a, b] = pair(6, 0);
  for (const c of [a, b]) {
    c.mode = "contain";
    c.role = "contain";
  }
  assert.equal(collidePolice(a, b), 0);
  assert.equal(a.health, 100);
});
test("normal fixed starts and different legal right-steering routes can both produce genuine arrests", () => {
  for (const [width, delay] of [
    [1100, 0],
    [1100, 5],
    [390, 0],
    [390, 3],
  ]) {
    const s = new Simulation(createLayout(), {
      width,
      height: width === 390 ? 664 : 740,
      random: () => 0.3,
    });
    s.start();
    let rows = [];
    for (let f = 0; f < 3600 && !s.result; f++) {
      s.update(1 / 60, { right: Math.round(s.elapsed * 60) > delay * 60 });
      if (f % 12 === 0) rows.push({ a: s.arrest, e: s.stats.explosions });
    }
    assert.equal(s.result, "arrested", `${width}/${delay}`);
    const lastZero = rows.findLastIndex((r) => r.a < 0.05),
      capture = rows.slice(lastZero + 1);
    assert.ok(capture.length > 5);
    assert.ok(capture.every((r) => r.e === s.stats.explosions));
  }
});
