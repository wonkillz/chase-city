import test from "node:test";
import assert from "node:assert/strict";
import {
  segmentHitsBuilding,
  approachOpacity,
  BuildingOcclusion,
} from "../src/render/occlusion.js";
const b = { x: 0, z: 0, w: 6, d: 6, h: 12 };
test("only buildings between camera and vehicle occlude, including camera-inside case", () => {
  assert.equal(
    segmentHitsBuilding({ x: 0, y: 15, z: 15 }, { x: 0, y: 1, z: -10 }, b),
    true,
  );
  assert.equal(
    segmentHitsBuilding({ x: 0, y: 15, z: 15 }, { x: 0, y: 1, z: 10 }, b),
    false,
  );
  assert.equal(
    segmentHitsBuilding({ x: 30, y: 15, z: 15 }, { x: 30, y: 1, z: -10 }, b),
    false,
  );
  assert.equal(
    segmentHitsBuilding({ x: 0, y: 40, z: 15 }, { x: 0, y: 30, z: -10 }, b),
    false,
  );
  assert.equal(
    segmentHitsBuilding({ x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: -10 }, b),
    true,
  );
});
test("opacity transitions smoothly to 35 percent, restores exactly opaque and resets", () => {
  const e = {
    bounds: b,
    opacity: 1,
    mesh: { material: { opacity: 1, transparent: false, depthWrite: true } },
  };
  const c = new BuildingOcclusion([e]);
  const snapshot = JSON.stringify(b);
  c.update({ x: 0, y: 15, z: 15 }, { x: 0, z: -10 }, 1 / 60);
  assert.ok(e.opacity < 1 && e.opacity > 0.35);
  assert.equal(e.mesh.material.transparent, true);
  for (let i = 0; i < 120; i++)
    c.update({ x: 0, y: 15, z: 15 }, { x: 0, z: -10 }, 1 / 60);
  assert.equal(e.opacity, 0.35);
  for (let i = 0; i < 120; i++)
    c.update({ x: 30, y: 15, z: 15 }, { x: 30, z: -10 }, 1 / 60);
  assert.equal(e.opacity, 1);
  assert.equal(e.mesh.material.transparent, false);
  assert.equal(e.mesh.material.depthWrite, true);
  assert.equal(JSON.stringify(b), snapshot);
  c.update({ x: 0, y: 15, z: 15 }, { x: 0, z: -10 }, 0.1);
  c.reset();
  assert.equal(e.opacity, 1);
});
test("fade is independent of frame rate and paused dt does not advance opacity", () => {
  let slow = 1,
    fast = 1;
  for (let i = 0; i < 30; i++) slow = approachOpacity(slow, true, 1 / 30);
  for (let i = 0; i < 120; i++) fast = approachOpacity(fast, true, 1 / 120);
  assert.ok(Math.abs(slow - fast) < 0.003);
  assert.equal(approachOpacity(0.7, true, 0), 0.7);
});

test("broad-phase overlap does not fade geometry that misses the exact ray test", () => {
  const e = {
    bounds: b,
    opacity: 1,
    mesh: { material: {} },
    intersects: () => false,
  };
  const controller = new BuildingOcclusion([e]);
  controller.update({ x: 0, y: 15, z: 15 }, { x: 0, z: -10 }, 1);
  assert.equal(e.occluded, false);
  assert.equal(e.opacity, 1);
});

test("transparent shader variants are invalidated for body/roof/window materials and restored", async () => {
  const { MeshStandardMaterial } = await import("three");
  const { applyBuildingOpacity } = await import("../src/render/occlusion.js");
  const materials = Array.from({ length: 4 }, () => new MeshStandardMaterial());
  const e = { meshes: materials.map((material) => ({ material })), opacity: 1 };
  const versions = materials.map((m) => m.version);
  applyBuildingOpacity(e, 0.35);
  materials.forEach((m, i) => {
    assert.ok(m.version > versions[i]);
    assert.equal(m.transparent, true);
    assert.equal(m.opacity, 0.35);
  });
  const faded = materials.map((m) => m.version);
  applyBuildingOpacity(e, 0.3);
  materials.forEach((m, i) => assert.equal(m.version, faded[i]));
  applyBuildingOpacity(e, 1);
  materials.forEach((m, i) => {
    assert.ok(m.version > faded[i]);
    assert.equal(m.transparent, false);
    assert.equal(m.depthWrite, true);
    m.dispose();
  });
});
