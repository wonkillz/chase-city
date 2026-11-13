import * as THREE from "three";
import { CONFIG } from "../game/config.js";

// V1.8: a wreck is the burnt-out police car itself, resting on its roof in
// exactly the pose the crash animation ends in (see wreckPose), with a scorch
// mark, ground fragments, a fire that keeps burning and a tall smoke column.
// Everything persists until RESTART; offscreen wrecks keep their data and slot
// but are detached from the scene so they cost nothing to draw.
export const WRECK_ROLL = 0.18;
export const WRECK_LIFT = 1.75;
export const FLAME_COUNT = 5;
export const SMOKE_COUNT = 6;

// Crash animation pose for a police car t seconds after its explosion. At
// t >= CONFIG.wreckSeconds it equals the persistent wreck pose.
export function wreckPose(t) {
  const time = Math.max(0, t),
    f = Math.min(1, time / CONFIG.wreckSeconds);
  return {
    y: Math.max(0, 9 * time - 10 * time * time) * (1 - f) + WRECK_LIFT * f,
    pitch: Math.PI * f,
    roll: WRECK_ROLL * f,
  };
}

export class WreckRenderer {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.puff = new THREE.IcosahedronGeometry(1, 0);
    this.disc = new THREE.CircleGeometry(1, 20);
    const standard = (color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 1 });
    // Shared by every wreck: 0 charred paint, 1 black, 2 orange flame,
    // 3 yellow flame, 4 dark smoke, 5 grey smoke, 6 dim red lamp,
    // 7 dim blue lamp, 8 scorch decal, 9 ember glow.
    this.materials = [
      standard(0x8a877f),
      standard(0x0b0d0e),
      new THREE.MeshBasicMaterial({ color: 0xff6b00 }),
      new THREE.MeshBasicMaterial({ color: 0xffd520 }),
      standard(0x17191b),
      standard(0x4b4f52),
      standard(0x5a1418),
      standard(0x13304f),
      new THREE.MeshBasicMaterial({
        color: 0x050505,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      new THREE.MeshBasicMaterial({
        color: 0xff7a18,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    ];
    this.createSlot = () => {
      const group = new THREE.Group();
      group.visible = false;
      const box = (parent, x, y, z, w, h, d, mat = 0) => {
        const m = new THREE.Mesh(this.geometry, this.materials[mat]);
        m.position.set(x, y, z);
        m.scale.set(w, h, d);
        parent.add(m);
        return m;
      };
      // Same proportions as the live police car model in scene.js.
      const body = new THREE.Group();
      body.rotation.order = "XYZ";
      group.add(body);
      box(body, 0, 0.65, 0, 1.8, 0.65, 3.4, 0);
      box(body, 0, 1.15, 0.15, 1.5, 0.6, 1.6, 1);
      box(body, 0, 1.5, 0.2, 1.55, 0.12, 1.45, 0);
      box(body, 0, 0.72, -0.95, 1.82, 0.15, 0.65, 1);
      box(body, -0.4, 1.65, 0.2, 0.65, 0.22, 0.4, 6);
      box(body, 0.4, 1.65, 0.2, 0.65, 0.22, 0.4, 7);
      for (const x of [-0.95, 0.95])
        for (const z of [-1.05, 1.05]) box(body, x, 0.4, z, 0.3, 0.65, 0.65, 1);
      const scorch = new THREE.Mesh(this.disc, this.materials[8]);
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = 0.2;
      scorch.scale.setScalar(3.4);
      group.add(scorch);
      const glow = new THREE.Mesh(this.disc, this.materials[9]);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.22;
      group.add(glow);
      for (let i = 0; i < 4; i++) {
        const m = box(
          group,
          Math.sin(i * 2.4) * 2.5,
          0.22,
          Math.cos(i * 2.4) * 2.5,
          0.45,
          0.25,
          0.7,
          i % 2,
        );
        m.rotation.y = i;
      }
      const flames = Array.from({ length: FLAME_COUNT }, (_, i) => {
        const m = new THREE.Mesh(this.puff, this.materials[2 + (i % 2)]);
        group.add(m);
        return m;
      });
      const smoke = Array.from({ length: SMOKE_COUNT }, (_, i) => {
        const m = new THREE.Mesh(this.puff, this.materials[4 + (i % 2)]);
        group.add(m);
        return m;
      });
      return { group, body, glow, flames, smoke, id: null };
    };
    this.pool = Array.from(
      { length: CONFIG.initialWreckSlots },
      this.createSlot,
    );
    this.slots = new Map();
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.sphere = new THREE.Sphere(new THREE.Vector3(), 8);
  }
  update(sim, camera) {
    this.frustum.setFromProjectionMatrix(
      this.matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    for (const w of sim.wrecks) {
      this.sphere.center.set(w.x, 4, w.z);
      const visible =
        this.frustum.intersectsSphere(this.sphere) &&
        sim.elapsed - w.born >= CONFIG.wreckSeconds;
      let slot = this.slots.get(w.id);
      // Offscreen data survives without allocating or animating render objects.
      if (!visible) {
        if (slot) {
          slot.group.visible = false;
          this.scene.remove(slot.group);
        }
        continue;
      }
      if (!slot) {
        slot = this.pool.find((s) => s.id === null);
        if (!slot) {
          slot = this.createSlot();
          this.pool.push(slot);
        }
        slot.id = w.id;
        slot.lastEffectTime = -Infinity;
        this.slots.set(w.id, slot);
        slot.group.position.set(w.x, 0, w.z);
        // Identical Euler (order XYZ) to the police mesh in scene.js, so the
        // car does not jump when the crash animation hands over to the wreck.
        slot.body.rotation.set(Math.PI, w.angle, WRECK_ROLL);
        slot.body.position.y = WRECK_LIFT;
      }
      const reentered = !slot.group.visible;
      if (!slot.group.parent) this.scene.add(slot.group);
      slot.group.visible = true;
      const distance = camera.position.distanceTo(slot.group.position);
      const interval = distance > 100 ? 0.2 : distance > 60 ? 0.1 : 0;
      if (!reentered && sim.elapsed - slot.lastEffectTime < interval) continue;
      slot.lastEffectTime = sim.elapsed;
      const age = sim.elapsed - w.born;
      // A fresh wreck burns hardest, then settles into a steady fire that
      // never goes out before RESTART.
      const fury = 1 + 0.6 * Math.exp(-Math.max(0, age - 0.9) / 4);
      slot.glow.scale.setScalar(2.4 + Math.sin(age * 9) * 0.25 + fury * 0.4);
      slot.flames.forEach((m, i) => {
        const t = age * 5.5 + i * 1.7;
        m.position.set(
          Math.sin(i * 2.4) * 0.7,
          1.9 + Math.abs(Math.sin(t)) * 0.45 * fury + (i % 2) * 0.2,
          Math.cos(i * 2.4) * 1.1,
        );
        m.scale.set(
          0.45 * fury,
          (0.75 + Math.sin(t) * 0.25) * fury,
          0.45 * fury,
        );
      });
      slot.smoke.forEach((m, i) => {
        const t = (age * 0.45 + i / SMOKE_COUNT) % 1;
        m.position.set(
          Math.sin(i * 2.4) * t * 1.4 + t * 1.2,
          2.4 + t * 8,
          Math.cos(i * 2.4) * t * 1.4,
        );
        m.scale.setScalar((0.35 + t * 1.3) * Math.sin(Math.PI * t));
      });
    }
  }
  reset() {
    this.slots.clear();
    for (const s of this.pool) {
      s.id = null;
      s.group.visible = false;
      this.scene.remove(s.group);
    }
  }
}
