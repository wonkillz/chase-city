import * as THREE from "three";
import { CONFIG } from "../game/config.js";
export class WreckRenderer {
  constructor(scene) {
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.puff = new THREE.IcosahedronGeometry(1, 0);
    this.materials = [0x20252a, 0x080b0d, 0xff6b00, 0xffd520, 0x17191b].map(
      (color, i) =>
        i === 2 || i === 3
          ? new THREE.MeshBasicMaterial({ color })
          : new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    this.pool = Array.from(
      { length: CONFIG.maxWrecks + CONFIG.maxPolice },
      () => {
        const group = new THREE.Group();
        scene.add(group);
        group.visible = false;
        const box = (x, y, z, w, h, d, mat = 0) => {
          const m = new THREE.Mesh(this.geometry, this.materials[mat]);
          m.position.set(x, y, z);
          m.scale.set(w, h, d);
          group.add(m);
          return m;
        };
        box(0, 0.55, 0, 2.1, 0.65, 3.6);
        box(0.1, 1, 0, 1.4, 0.45, 1.4);
        for (const x of [-1.05, 1.05])
          for (const z of [-1.1, 1.1]) box(x, 0.4, z, 0.35, 0.6, 0.65, 1);
        for (let i = 0; i < 4; i++) {
          const m = box(
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
        const flames = Array.from({ length: 3 }, (_, i) => {
          const m = new THREE.Mesh(this.puff, this.materials[2 + (i % 2)]);
          group.add(m);
          return m;
        });
        const smoke = Array.from({ length: 4 }, () => {
          const m = new THREE.Mesh(this.puff, this.materials[4]);
          group.add(m);
          return m;
        });
        return { group, flames, smoke, id: null };
      },
    );
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.sphere = new THREE.Sphere(new THREE.Vector3(), 6);
  }
  update(sim, camera) {
    sim.hasWreckVisibility = true;
    this.frustum.setFromProjectionMatrix(
      this.matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    const records = [...sim.wrecks, ...sim.retiringWrecks];
    const ids = new Set(records.map((w) => w.id));
    for (const slot of this.pool)
      if (!ids.has(slot.id)) {
        slot.id = null;
        slot.group.visible = false;
      }
    for (const w of records) {
      this.sphere.center.set(w.x, 3, w.z);
      w.visible = this.frustum.intersectsSphere(this.sphere);
      let slot =
        this.pool.find((s) => s.id === w.id) ||
        this.pool.find((s) => s.id === null);
      if (!slot) continue;
      slot.id = w.id;
      const age = sim.elapsed - w.born;
      slot.group.visible = age >= 0.9;
      slot.group.position.set(w.x, 0, w.z);
      slot.group.rotation.y = w.angle;
      slot.group.scale.setScalar(
        w.retiredAt === undefined
          ? 1
          : Math.max(0, 1 - (sim.elapsed - w.retiredAt) / 1.5),
      );
      slot.flames.forEach((m, i) => {
        const t = age * 5 + i * 2;
        m.position.set(
          Math.sin(i * 2.4) * 0.6,
          1 + Math.sin(t) * 0.15,
          Math.cos(i * 2.4) * 0.9,
        );
        m.scale.set(0.4, 0.65 + Math.sin(t) * 0.2, 0.4);
      });
      slot.smoke.forEach((m, i) => {
        const t = (age * 0.6 + i * 0.25) % 1;
        m.position.set(
          Math.sin(i * 2.4) * t,
          1.5 + t * 5,
          Math.cos(i * 2.4) * t,
        );
        m.scale.setScalar((0.25 + t * 0.8) * Math.sin(Math.PI * t));
      });
    }
  }
  reset() {
    for (const s of this.pool) {
      s.id = null;
      s.group.visible = false;
    }
  }
}
