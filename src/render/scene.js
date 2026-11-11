import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 350);
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
    for (const b of layout.buildings) {
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
    }
    for (let x = -90; x <= 90; x += 30)
      for (let z = -80; z <= 80; z += 30) {
        this.tree(x + 8, z);
        this.box(x - 7, 2.2, z, 0.14, 4.4, 0.14, 0x233c48);
        this.box(x - 6.4, 4.4, z, 1.4, 0.18, 0.4, 0xffeac3);
      }
    this.batchStatic();
    this.player = this.car(0xffcc08, false);
    const silhouette = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.8, 3.5),
      new THREE.MeshBasicMaterial({
        color: 0xffda16,
        transparent: true,
        opacity: 0.55,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
      }),
    );
    silhouette.position.y = 0.7;
    silhouette.renderOrder = 5;
    this.player.add(silhouette);
    this.police = Array.from({ length: 4 }, () => this.car(0xf2f0e5, true));
    this.skids = [];
    this.follow = new THREE.Vector3(0, 0, 0);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  batchStatic() {
    const groups = new Map();
    for (const mesh of [...this.scene.children]) {
      if (!mesh.isMesh) continue;
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
    for (const x of [-0.95, 0.95])
      for (const z of [-1.05, 1.05])
        this.box(x, 0.4, z, 0.3, 0.65, 0.65, 0x17252b, g);
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  render(sim, dt, drift) {
    const p = sim.player;
    this.player.position.set(p.x, 0, p.z);
    this.player.rotation.y = p.angle;
    this.player.rotation.z = drift ? Math.sin(sim.elapsed * 15) * 0.035 : 0;
    this.player.visible = !(
      sim.hitCooldown > 0.4 && Math.floor(sim.elapsed * 15) % 2
    );
    sim.police.forEach((c, i) => {
      const mesh = this.police[i];
      mesh.position.set(c.x, 0, c.z);
      mesh.rotation.y = c.angle;
      mesh.userData.red.visible = Math.floor(sim.elapsed * 8 + i) % 2 === 0;
      mesh.userData.blue.visible = !mesh.userData.red.visible;
    });
    if (
      drift &&
      Math.hypot(p.vx, p.vz) > 8 &&
      sim.elapsed - (this.lastSkid || 0) > 0.07
    ) {
      this.lastSkid = sim.elapsed;
      const mark = this.box(p.x, 0.18, p.z, 1.5, 0.015, 0.55, 0x1b2e2b);
      mark.rotation.y = p.angle;
      this.skids.push(mark);
      if (this.skids.length > 100) {
        const old = this.skids.shift();
        this.scene.remove(old);
        old.geometry.dispose();
      }
    }
    this.follow.lerp(new THREE.Vector3(p.x, 0, p.z), 1 - Math.exp(-dt * 5));
    const mobile = innerWidth < 700;
    this.camera.position.set(
      this.follow.x + (mobile ? 26 : 30),
      mobile ? 60 : 60,
      this.follow.z + 40,
    );
    this.camera.lookAt(this.follow.x, 0, this.follow.z - 6);
    this.renderer.render(this.scene, this.camera);
  }
  reset() {
    this.follow.set(0, 0, 8);
    for (const m of this.skids) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.skids = [];
    this.lastSkid = 0;
  }
}
