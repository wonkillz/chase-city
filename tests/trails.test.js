import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { VehicleTrails, trailIntensity } from "../src/render/trails.js";
import { ChaseCamera } from "../src/render/camera.js";
import { soundTargets } from "../src/audio/sound.js";
test("rear particle and skid pools stay bounded, stop during briefing/pause and reset cleanly", () => {
  const scene = new THREE.Scene(),
    trails = new VehicleTrails(scene),
    p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24, turn: 1.75, slip: 3 };
  trails.update(p, 0.1, false);
  assert.ok(trails.dust.every((p) => !p.mesh.visible));
  for (let i = 0; i < 1200; i++) trails.update(p, 1 / 60, true);
  assert.equal(trails.dust.length, 48);
  assert.equal(trails.marks.length, 64);
  assert.equal(scene.children.length, 112);
  assert.ok(trails.dust.some((p) => p.mesh.visible && p.mesh.position.z > 0));
  assert.ok(trails.marks.some((m) => m.mesh.visible));
  const ages = trails.dust.map((p) => p.age);
  trails.update(p, 0, true);
  assert.deepEqual(
    trails.dust.map((p) => p.age),
    ages,
  );
  trails.reset();
  assert.ok(scene.children.every((m) => !m.visible));
});
test("turn/slip intensifies both rear effects and skid sound without a drift control", () => {
  const p = { x: 0, z: 0, angle: 0, vx: 0, vz: -24, turn: 0, slip: 0 },
    turning = { ...p, turn: 1.7, slip: 2 };
  assert.ok(trailIntensity(turning).turn > trailIntensity(p).turn);
  assert.ok(
    soundTargets({ player: turning, police: [] }).skidGain >
      soundTargets({ player: p, police: [] }).skidGain,
  );
});
test("shared real camera projection excludes behind-camera/off-screen points and opaque blockers", () => {
  const rig = new ChaseCamera(1100, 740),
    p = { x: 0, z: 8 };
  rig.update(p, 1);
  assert.ok(rig.visible({ x: 0, z: 8 }, []));
  assert.equal(rig.visible({ x: 2000, z: 2000 }, []), false);
  const b = { x: 15, z: 28, w: 12, d: 12, h: 40 };
  assert.equal(rig.visible({ x: 0, z: 8 }, [b]), false);
  assert.equal(
    rig.visible({ x: 0, z: 8 }, [{ bounds: b, opacity: 0.35 }]),
    true,
  );
});
