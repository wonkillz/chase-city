import { WreckRenderer } from "./wrecks.js";
import * as THREE from "three";
import { RoadEventsRenderer } from "./road-events.js";
import { ChaseCamera } from "./camera.js";
import { VehicleTrails } from "./trails.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CONFIG } from "../game/config.js";
import { BuildingOcclusion } from "./occlusion.js";
import { ExplosionEffects } from "./explosions.js";
const palette = [0xf34b32, 0xffbf22, 0x087cba, 0x13a783, 0xf38617, 0x2364ce];
export class CityRenderer {
  constructor(canvas, layout) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x83c8d3);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x83c8d3, 105, 240);
    this.cameraRig = new ChaseCamera(innerWidth, innerHeight);
    this.camera = this.cameraRig.camera;
    this.scene.add(new THREE.HemisphereLight(0xe9f9ff, 0x35513c, 2.2));
    const sun = new THREE.DirectionalLight(0xffefd6, 3);
    sun.position.set(-45, 90, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -90,
      right: 90,
      top: 90,
      bottom: -90,
      far: 220,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.sun = sun;
    this.materials = new Map();
    this.box(0, -0.7, 0, 225, 1, 225, 0x116748);
    this.box(0, -0.12, 0, 216, 0.3, 216, 0x38535a);
    for (let n = -90; n <= 90; n += 30) {
      this.box(n, 0.06, 0, 11, 0.08, 216, 0x23373e);
      this.box(0, 0.07, n, 216, 0.08, 11, 0x23373e);
      for (let k = -104; k < 108; k += 6) {
        if (Math.abs(k % 30) < 7 || Math.abs(k % 30) > 23) continue;
        this.box(n, 0.13, k, 0.16, 0.025, 2.4, 0xf8eab6);
        this.box(k, 0.14, n, 2.4, 0.025, 0.16, 0xf8eab6);
      }
      for (let m = -90; m <= 90; m += 30) {
        for (let side of [-1, 1])
          for (let t = -3; t <= 3; t += 1.2) {
            this.box(n + t, 0.15, m + side * 7, 0.65, 0.03, 2.5, 0xdce8dc);
            this.box(n + side * 7, 0.15, m + t, 2.5, 0.03, 0.65, 0xdce8dc);
          }
      }
    }
    for (let x = -75; x <= 105; x += 30)
      for (let z = -75; z <= 105; z += 30)
        if (x < 100 && z < 100) this.box(x, 0.15, z, 19, 0.4, 19, 0xc1bba2);
    for (const p of layout.parks) {
      this.box(p.x, 0.39, p.z, 18, 0.2, 18, 0x55ae22);
      this.box(p.x, 0.51, p.z, 2, 0.05, 18, 0xe9cf8a);
      this.box(p.x, 0.52, p.z, 18, 0.05, 2, 0xe9cf8a);
      for (const dx of [-6, 6])
        for (const dz of [-6, 6]) this.tree(p.x + dx, p.z + dz);
      this.box(p.x + 4, 0.75, p.z, 3, 0.5, 0.8, 0xa84b1e);
    }
    this.buildings = [];
    const occlusionRay = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3(),
      rayTarget = new THREE.Vector3(),
      rayDirection = new THREE.Vector3();
    for (const b of layout.buildings) {
      const previous = new Set(this.scene.children);
      this.box(b.x, b.h / 2 + 0.4, b.z, b.w, b.h, b.d, palette[b.color]);
      this.box(b.x, b.h + 0.55, b.z, b.w + 0.35, 0.3, b.d + 0.35, 0xf8e6bd);
      this.box(b.x + 1, b.h + 1, b.z, 2, 0.8, 2, 0x71878b);
      for (let y = 2; y < b.h; y += 2.4)
        for (let o = -2.2; o <= 2.2; o += 2.2) {
          this.box(b.x + o, y, b.z + b.d / 2 + 0.025, 1, 0.95, 0.05, 0x173e50);
          this.box(b.x - b.w / 2 - 0.025, y, b.z + o, 0.05, 0.95, 1, 0x173e50);
        }
      this.box(b.x, 1.3, b.z + b.d / 2 + 0.12, 2.4, 1.8, 0.2, 0x113a46);
      this.box(b.x, 2.4, b.z + b.d / 2 + 0.7, 3.8, 0.2, 1.5, 0xffd021);
      const pieces = this.scene.children.filter(
        (child) => !previous.has(child),
      );
      const geometries = pieces.map((piece) => {
        piece.updateMatrix();
        const geometry = piece.geometry.clone().applyMatrix4(piece.matrix);
        const color = piece.material.color;
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = color.r;
          colors[i + 1] = color.g;
          colors[i + 2] = color.b;
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        this.scene.remove(piece);
        piece.geometry.dispose();
        return geometry;
      });
      const mesh = new THREE.Mesh(
        mergeGeometries(geometries),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      );
      geometries.forEach((g) => g.dispose());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.building = true;
      mesh.userData.components = [
        "body",
        "roof",
        "rooftop",
        "windows",
        "door",
        "sign",
      ];
      mesh.geometry.computeBoundingBox();
      this.scene.add(mesh);
      mesh.updateMatrixWorld(true);
      this.buildings.push({
        mesh,
        bounds: b,
        visualBounds: mesh.geometry.boundingBox,
        opacity: 1,
        occluded: false,
        intersects(camera, target) {
          rayOrigin.set(camera.x, camera.y, camera.z);
          rayTarget.set(target.x, target.y, target.z);
          rayDirection.subVectors(rayTarget, rayOrigin);
          const distance = rayDirection.length();
          occlusionRay.set(rayOrigin, rayDirection.normalize());
          occlusionRay.far = Math.max(0, distance - 0.05);
          return occlusionRay.intersectObject(mesh, false).length > 0;
        },
      });
    }
    for (let x = -90; x <= 90; x += 30)
      for (let z = -80; z <= 80; z += 30) {
        this.tree(x + 8, z);
        this.box(x - 7, 2.2, z, 0.14, 4.4, 0.14, 0x233c48);
        this.box(x - 6.4, 4.4, z, 1.4, 0.18, 0.4, 0xffeac3);
      }
    this.batchStatic();
    this.player = this.car(0xffcc08, false);
    this.police = Array.from({ length: CONFIG.policeCount }, () =>
      this.car(0xf2f0e5, true),
    );
    this.occlusion = new BuildingOcclusion(this.buildings);
    this.effects = new ExplosionEffects(this.scene);
    this.trails = new VehicleTrails(this.scene);
    this.wreckRenderer = new WreckRenderer(this.scene);
    this.roadEvents = new RoadEventsRenderer(this.scene);
    this.resetMetrics();
    this.follow = new THREE.Vector3(0, 0, 0);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  batchStatic() {
    const groups = new Map();
    for (const mesh of [...this.scene.children]) {
      if (!mesh.isMesh || mesh.userData.building) continue;
      mesh.updateMatrix();
      const key = mesh.material;
      const bucket = groups.get(key) || [];
      bucket.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
      groups.set(key, bucket);
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const [material, geometries] of groups) {
      const geometry = mergeGeometries(geometries);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
  }
  box(x, y, z, w, h, d, color, parent = this.scene) {
    let mat = this.materials.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      this.materials.set(color, mat);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = h > 0.3;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  tree(x, z) {
    this.box(x, 1, z, 0.45, 2, 0.45, 0x7f4926);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x168a37, flatShading: true }),
    );
    crown.position.set(x, 3, z);
    crown.scale.y = 1.25;
    crown.castShadow = true;
    this.scene.add(crown);
  }
  car(color, cop) {
    const g = new THREE.Group();
    this.scene.add(g);
    this.box(0, 0.65, 0, 1.8, 0.65, 3.4, color, g);
    this.box(0, 1.15, 0.15, 1.5, 0.6, 1.6, cop ? 0x173749 : 0x1a4955, g);
    this.box(0, 1.5, 0.2, 1.55, 0.12, 1.45, color, g);
    g.userData.wheels = [];
    for (const x of [-0.95, 0.95])
      for (const z of [-1.05, 1.05])
        g.userData.wheels.push(
          this.box(x, 0.4, z, 0.3, 0.65, 0.65, 0x17252b, g),
        );
    for (const x of [-0.55, 0.55]) {
      this.box(x, 0.7, -1.73, 0.45, 0.22, 0.06, 0xfff3c4, g);
      this.box(x, 0.7, 1.73, 0.45, 0.2, 0.06, 0xff3028, g);
    }
    if (cop) {
      g.userData.red = this.box(-0.4, 1.65, 0.2, 0.65, 0.22, 0.4, 0xff263c, g);
      g.userData.blue = this.box(0.4, 1.65, 0.2, 0.65, 0.22, 0.4, 0x1689ff, g);
      this.box(0, 0.72, -0.95, 1.82, 0.15, 0.65, 0x132a36, g);
    } else this.box(0, 1, 1.45, 2, 0.15, 0.4, 0x172d36, g);
    return g;
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h);
    this.cameraRig.resize(w, h);
  }
  render(sim, dt, running = sim.started && !sim.result) {
    const p = sim.player;
    this.player.position.set(p.x, 0, p.z);
    this.player.rotation.y = p.angle;
    this.player.rotation.z +=
      (-p.turn * 0.045 - this.player.rotation.z) * (1 - Math.exp(-dt * 9));
    for (const wheel of this.player.userData.wheels) {
      wheel.rotation.x = -sim.elapsed * p.speed;
      wheel.rotation.y = wheel.position.z < 0 ? p.turn * 0.15 : 0;
    }
    this.player.visible = !(
      sim.hitCooldown > 0.4 && Math.floor(sim.elapsed * 15) % 2
    );
    while (this.police.length < sim.police.length)
      this.police.push(this.car(0xf2f0e5, true));
    for (let i = sim.police.length; i < this.police.length; i++)
      this.police[i].visible = false;
    sim.police.forEach((c, i) => {
      const mesh = this.police[i];
      mesh.visible = c.state === "active" || c.wreckAge < CONFIG.wreckSeconds;
      const t = c.wreckAge;
      mesh.position.set(
        c.x,
        c.state === "wreck" ? Math.max(0, 9 * t - 10 * t * t) : 0,
        c.z,
      );
      mesh.rotation.set(
        c.state === "wreck" ? Math.min(t * 3, Math.PI) : 0,
        c.angle,
        c.state === "wreck" ? Math.min(t * 2, 1.5) : -c.turn * 0.04,
      );
      mesh.userData.red.visible =
        c.state === "active" && Math.floor(sim.elapsed * 8 + i) % 2 === 0;
      mesh.userData.blue.visible =
        c.state === "active" && !mesh.userData.red.visible;
      for (const wheel of mesh.userData.wheels) {
        wheel.rotation.x = -sim.elapsed * c.speed;
        wheel.rotation.y = wheel.position.z < 0 ? c.turn * 0.15 : 0;
      }
    });
    this.effects.update(sim.events, sim.elapsed);
    this.cameraRig.update(p, dt);
    this.trails.update(p, dt, running);
    this.camera.updateMatrixWorld(true);
    this.player.updateMatrixWorld(true);
    this.roadEvents.update(sim, this.camera);
    this.wreckRenderer.update(sim, this.camera);
    this.occlusion.update(this.camera.position, p, dt);
    if (running) this.sampleMetrics(sim, dt);
    this.renderer.render(this.scene, this.camera);
  }
  captureFrame(width, height) {
    const target = new THREE.WebGLRenderTarget(width, height);
    const previous = this.renderer.getRenderTarget();
    const pixels = new Uint8Array(width * height * 4);
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      return pixels;
    } finally {
      this.renderer.setRenderTarget(previous);
      target.dispose();
    }
  }
  resetMetrics() {
    this.screenMetrics = {
      sampledSeconds: 0,
      policeVisibleSeconds: 0,
      visibleExplosions: 0,
      explosions: 0,
      nearestDistanceTime: 0,
      chaseSeconds: 0,
    };
    this.metricTime = 0;
    this.lastExplosionMetric = 0;
  }
  sampleMetrics(sim, dt) {
    for (const event of sim.events)
      if (event.id > this.lastExplosionMetric) {
        this.lastExplosionMetric = event.id;
        this.screenMetrics.explosions++;
        if (this.cameraRig.visible({ ...event, y: 2 }, this.buildings))
          this.screenMetrics.visibleExplosions++;
      }
    this.metricTime += dt;
    if (this.metricTime < 0.2) return;
    const duration = this.metricTime;
    this.metricTime = 0;
    const active = sim.police.filter((c) => c.state === "active");
    const nearest = Math.min(
      220,
      ...active.map((c) => Math.hypot(c.x - sim.player.x, c.z - sim.player.z)),
    );
    this.screenMetrics.sampledSeconds += duration;
    this.screenMetrics.nearestDistanceTime += nearest * duration;
    if (nearest < 35) this.screenMetrics.chaseSeconds += duration;
    if (active.some((c) => this.cameraRig.visible(c, this.buildings)))
      this.screenMetrics.policeVisibleSeconds += duration;
  }
  reset() {
    this.roadEvents.reset();
    this.wreckRenderer.reset();
    this.cameraRig.reset();
    this.trails.reset();
    this.resetMetrics();
    this.follow.set(0, 0, 8);
    this.occlusion.reset();
    this.effects.reset();
    this.player.rotation.set(0, 0, 0);
  }
}
