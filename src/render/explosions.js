import * as THREE from "three";
export class ExplosionEffects {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.lastEvent = 0;
    this.chunkGeometry = new THREE.BoxGeometry(0.4, 0.35, 0.55);
    this.puffGeometry = new THREE.IcosahedronGeometry(1, 0);
    this.chunkMaterials = [0x172c35, 0xf3f0df, 0xffb820].map(
      (color) => new THREE.MeshStandardMaterial({ color }),
    );
  }
  spawn(event) {
    const group = new THREE.Group();
    group.position.set(event.x, 0, event.z);
    this.scene.add(group);
    const flameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb218,
      transparent: true,
      depthWrite: false,
    });
    const smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0x42505a,
      transparent: true,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.07, 4, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffef9d,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.28;
    group.add(ring);
    const core = new THREE.Mesh(
      this.puffGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xfff4ad,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    core.position.y = 1.6;
    group.add(core);
    const parts = [];
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.399 + event.id,
        force = 3 + (i % 5) * 1.3;
      const mesh = new THREE.Mesh(
        this.chunkGeometry,
        this.chunkMaterials[i % 3],
      );
      mesh.castShadow = true;
      group.add(mesh);
      parts.push({
        mesh,
        kind: "debris",
        vx: Math.sin(angle) * force,
        vz: Math.cos(angle) * force,
        vy: 5 + (i % 6),
      });
    }
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(this.puffGeometry, flameMaterial);
      group.add(mesh);
      parts.push({
        mesh,
        kind: "flame",
        vx: Math.sin(i * 2.4) * 1.5,
        vz: Math.cos(i * 2.4) * 1.5,
        vy: 2 + i * 0.3,
      });
    }
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(this.puffGeometry, smokeMaterial);
      group.add(mesh);
      parts.push({
        mesh,
        kind: "smoke",
        vx: Math.sin(i * 2.4) * 1.2,
        vz: Math.cos(i * 2.4) * 1.2,
        vy: 2.5 + i * 0.18,
      });
    }
    this.active.push({
      group,
      ring,
      core,
      parts,
      time: event.time,
      flameMaterial,
      smokeMaterial,
    });
  }
  update(events, time) {
    for (const event of events)
      if (event.id > this.lastEvent) {
        this.spawn(event);
        this.lastEvent = event.id;
      }
    for (const effect of [...this.active]) {
      const t = Math.max(0, time - effect.time);
      if (t > 4) {
        this.remove(effect);
        continue;
      }
      effect.ring.scale.setScalar(1 + t * 12);
      effect.ring.material.opacity = Math.max(0, 0.9 - t * 1.8);
      effect.ring.visible = t < 0.5;
      effect.core.visible = t < 0.7;
      effect.core.scale.setScalar(
        1 + Math.sin(Math.min(t / 0.7, 1) * Math.PI) * 2,
      );
      effect.core.material.opacity = Math.max(0, 1 - t / 0.7);
      effect.flameMaterial.opacity = Math.max(0, 1 - t / 1.65);
      effect.smokeMaterial.opacity = Math.max(0, 0.6 * (1 - t / 4));
      for (const p of effect.parts) {
        if (p.kind === "debris") {
          p.mesh.position.set(
            p.vx * t,
            Math.max(0.2, 1 + p.vy * t - 9 * t * t),
            p.vz * t,
          );
          p.mesh.rotation.set(t * 3, t * 4, t * 2);
          p.mesh.scale.setScalar(Math.max(0.05, 1 - Math.max(0, t - 2) / 2));
        } else if (p.kind === "flame") {
          p.mesh.visible = t < 1.65;
          p.mesh.position.set(p.vx * t, 1 + p.vy * t, p.vz * t);
          p.mesh.scale.setScalar(
            1.1 + Math.sin(Math.min(t, 1) * Math.PI) * 1.5,
          );
        } else {
          p.mesh.position.set(p.vx * t, 1 + p.vy * t, p.vz * t);
          p.mesh.scale.setScalar(0.4 + t * 0.85);
        }
      }
    }
  }
  remove(effect) {
    this.scene.remove(effect.group);
    effect.core.material.dispose();
    effect.ring.geometry.dispose();
    effect.ring.material.dispose();
    effect.flameMaterial.dispose();
    effect.smokeMaterial.dispose();
    this.active.splice(this.active.indexOf(effect), 1);
  }
  reset() {
    for (const effect of [...this.active]) this.remove(effect);
    this.lastEvent = 0;
  }
}
