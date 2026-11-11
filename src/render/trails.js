import * as THREE from "three";
import { clamp } from "../game/config.js";
export function trailIntensity(player) {
  const speed = Math.hypot(player.vx, player.vz);
  return {
    speed,
    turn: clamp(
      Math.abs(player.turn) / 1.75 + (player.slip || 0) * 0.12,
      0,
      1.7,
    ),
    active: speed > 4,
  };
}
// Fixed pools: no geometry/material allocations while driving or on restart.
export class VehicleTrails {
  constructor(scene) {
    this.dustGeometry = new THREE.IcosahedronGeometry(0.22, 0);
    this.markGeometry = new THREE.PlaneGeometry(0.11, 0.8);
    this.dust = Array.from({ length: 48 }, () => {
      const mesh = new THREE.Mesh(
        this.dustGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffca3a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, age: 99, life: 1, vx: 0, vz: 0 };
    });
    this.marks = Array.from({ length: 64 }, () => {
      const mesh = new THREE.Mesh(
        this.markGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x172e31,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, age: 99 };
    });
    this.reset();
  }
  reset() {
    this.clock = 0;
    this.dustIndex = 0;
    this.markIndex = 0;
    this.emission = 0;
    this.markTime = 0;
    for (const p of this.dust) {
      p.age = 99;
      p.mesh.visible = false;
    }
    for (const m of this.marks) {
      m.age = 99;
      m.mesh.visible = false;
    }
  }
  update(player, dt, running) {
    if (dt <= 0) return;
    const state = trailIntensity(player);
    this.clock += dt;
    for (const p of this.dust) {
      p.age += dt;
      if (p.age >= p.life) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.position.y += dt * 0.45;
      p.mesh.scale.setScalar(1 + p.age * 2);
      p.mesh.material.opacity = (1 - p.age / p.life) * 0.55;
    }
    for (const m of this.marks) {
      m.age += dt;
      m.mesh.visible = m.age < 4;
      m.mesh.material.opacity = Math.max(0, 0.5 - m.age / 8);
    }
    if (!running || !state.active) return;
    this.emission += dt;
    const interval = state.turn > 0.7 ? 0.035 : 0.075;
    if (this.emission >= interval) {
      this.emission = 0;
      const p = this.dust[this.dustIndex++ % this.dust.length];
      const side = this.dustIndex % 2 ? 1 : -1;
      p.age = 0;
      p.life = 0.2 + state.speed / 120 + state.turn * 0.12;
      p.mesh.position.set(
        player.x +
          Math.sin(player.angle) * 1.8 +
          Math.cos(player.angle) * side * 0.65,
        0.28,
        player.z +
          Math.cos(player.angle) * 1.8 -
          Math.sin(player.angle) * side * 0.65,
      );
      p.vx =
        Math.sin(player.angle) * (1 + state.speed * 0.09) +
        Math.cos(player.angle) * side * state.turn;
      p.vz =
        Math.cos(player.angle) * (1 + state.speed * 0.09) -
        Math.sin(player.angle) * side * state.turn;
      p.mesh.visible = true;
      p.mesh.material.opacity = 0.55;
    }
    this.markTime += dt;
    if (state.turn > 0.65 && this.markTime > 0.08) {
      this.markTime = 0;
      for (const side of [-1, 1]) {
        const m = this.marks[this.markIndex++ % this.marks.length];
        m.age = 0;
        m.mesh.visible = true;
        m.mesh.position.set(
          player.x +
            Math.sin(player.angle) * 1.1 +
            Math.cos(player.angle) * side * 0.75,
          0.175,
          player.z +
            Math.cos(player.angle) * 1.1 -
            Math.sin(player.angle) * side * 0.75,
        );
        m.mesh.rotation.set(-Math.PI / 2, 0, player.angle);
      }
    }
  }
}
