import * as THREE from "three";

// Fragments that have landed are moved into a few InstancedMeshes so every
// piece of debris from the run stays on the road until RESTART at the cost of
// one draw call per material, however many explosions happen.
export class DebrisField {
  constructor(scene, geometry, materials, capacity = 256) {
    this.scene = scene;
    this.geometry = geometry;
    this.materials = materials;
    this.counts = materials.map(() => 0);
    this.meshes = materials.map(() => null);
    this.capacity = 0;
    this.grow(capacity);
  }
  grow(capacity) {
    this.meshes = this.meshes.map((old, i) => {
      const mesh = new THREE.InstancedMesh(
        this.geometry,
        this.materials[i],
        capacity,
      );
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.userData.debrisField = true;
      if (old) {
        for (let k = 0; k < this.counts[i]; k++)
          mesh.instanceMatrix.array.set(
            old.instanceMatrix.array.subarray(k * 16, k * 16 + 16),
            k * 16,
          );
        this.scene.remove(old);
        old.dispose();
      }
      mesh.count = this.counts[i];
      this.scene.add(mesh);
      return mesh;
    });
    this.capacity = capacity;
  }
  add(materialIndex, matrix) {
    if (this.counts[materialIndex] >= this.capacity)
      this.grow(this.capacity * 2);
    const mesh = this.meshes[materialIndex];
    mesh.setMatrixAt(this.counts[materialIndex]++, matrix);
    mesh.count = this.counts[materialIndex];
    mesh.instanceMatrix.needsUpdate = true;
  }
  get total() {
    return this.counts.reduce((a, b) => a + b, 0);
  }
  reset() {
    this.counts = this.counts.map(() => 0);
    for (const mesh of this.meshes) mesh.count = 0;
  }
}

// Time for a fragment launched upward at vy (from y = 1) to land at y = 0.2.
const landing = (vy) => (vy + Math.sqrt(vy * vy + 28.8)) / 18;

export class ExplosionEffects {
  constructor(scene, onStart = null) {
    this.scene = scene;
    this.onStart = onStart;
    this.active = [];
    this.lastEvent = 0;
    this.chunkGeometry = new THREE.BoxGeometry(0.4, 0.35, 0.55);
    this.puffGeometry = new THREE.IcosahedronGeometry(1, 0);
    this.chunkMaterials = [0x172c35, 0xf3f0df, 0xffb820].map(
      (color) => new THREE.MeshStandardMaterial({ color }),
    );
    this.debris = new DebrisField(
      scene,
      this.chunkGeometry,
      this.chunkMaterials,
    );
    this.matrix = new THREE.Matrix4();
  }
  spawn(event) {
    const group = new THREE.Group();
    group.position.set(event.x, 0, event.z);
    // Later links of a chain reaction are bigger: the fire has more fuel.
    const depth = event.chainDepth || 0,
      size = 1 + Math.min(depth, 3) * 0.22;
    group.scale.setScalar(size);
    group.visible = false;
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
      const vy = 5 + (i % 6);
      parts.push({
        mesh,
        kind: "debris",
        material: i % 3,
        vx: Math.sin(angle) * force,
        vz: Math.cos(angle) * force,
        vy,
        land: landing(vy),
      });
    }
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(this.puffGeometry, flameMaterial);
      group.add(mesh);
      parts.push({
        mesh,
        kind: "flame",
        vx: Math.sin(i * 2.4) * 1.7,
        vz: Math.cos(i * 2.4) * 1.7,
        vy: 2 + i * 0.3,
      });
    }
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(this.puffGeometry, smokeMaterial);
      group.add(mesh);
      parts.push({
        mesh,
        kind: "smoke",
        vx: Math.sin(i * 2.4) * 1.3,
        vz: Math.cos(i * 2.4) * 1.3,
        vy: 2.6 + i * 0.2,
      });
    }
    this.active.push({
      event,
      group,
      ring,
      core,
      parts,
      // Staged chain reactions start when their own link is reached.
      time: event.time + (event.delay || 0),
      started: false,
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
      const t = time - effect.time;
      if (t < 0) continue;
      if (!effect.started) {
        effect.started = true;
        effect.group.visible = true;
        this.onStart?.(effect.event);
      }
      if (t > 4) {
        this.settle(effect);
        this.remove(effect);
        continue;
      }
      effect.ring.scale.setScalar(1 + t * 12);
      effect.ring.material.opacity = Math.max(0, 0.9 - t * 1.8);
      effect.ring.visible = t < 0.5;
      effect.core.visible = t < 0.7;
      effect.core.scale.setScalar(
        1 + Math.sin(Math.min(t / 0.7, 1) * Math.PI) * 2.4,
      );
      effect.core.material.opacity = Math.max(0, 1 - t / 0.7);
      effect.flameMaterial.opacity = Math.max(0, 1 - t / 2);
      effect.smokeMaterial.opacity = Math.max(0, 0.65 * (1 - t / 4));
      for (const p of effect.parts) {
        if (p.kind === "debris") {
          // Fragments fly, then land and stop: they are not faded out.
          const h = Math.min(t, p.land);
          p.mesh.position.set(
            p.vx * h,
            Math.max(0.2, 1 + p.vy * h - 9 * h * h),
            p.vz * h,
          );
          p.mesh.rotation.set(h * 3, h * 4, h * 2);
        } else if (p.kind === "flame") {
          p.mesh.visible = t < 2;
          p.mesh.position.set(p.vx * t, 1 + p.vy * t, p.vz * t);
          p.mesh.scale.setScalar(
            1.2 + Math.sin(Math.min(t, 1) * Math.PI) * 1.7,
          );
        } else {
          p.mesh.position.set(p.vx * t, 1 + p.vy * t, p.vz * t);
          p.mesh.scale.setScalar(0.45 + t * 0.9);
        }
      }
    }
  }
  // Hand the landed fragments over to the permanent debris field.
  settle(effect) {
    effect.group.updateMatrixWorld(true);
    for (const p of effect.parts)
      if (p.kind === "debris") {
        const h = p.land;
        p.mesh.position.set(p.vx * h, 0.2, p.vz * h);
        p.mesh.rotation.set(h * 3, h * 4, h * 2);
        p.mesh.updateMatrixWorld(true);
        this.debris.add(p.material, this.matrix.copy(p.mesh.matrixWorld));
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
    this.debris.reset();
    this.lastEvent = 0;
  }
}
