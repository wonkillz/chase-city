import * as THREE from "three";
import { segmentHitsBuilding } from "./occlusion.js";
export class ChaseCamera {
  constructor(width = 1100, height = 740) {
    this.camera = new THREE.PerspectiveCamera(43, width / height, 0.1, 350);
    this.follow = new THREE.Vector3(0, 0, 8);
    this.mobile = width < 700;
    this.camera.fov = this.mobile ? 48 : 43;
    this.camera.updateProjectionMatrix();
    this.point = new THREE.Vector3();
  }
  resize(width, height) {
    this.mobile = width < 700;
    this.camera.aspect = width / height;
    this.camera.fov = this.mobile ? 48 : 43;
    this.camera.updateProjectionMatrix();
  }
  reset() {
    this.follow.set(0, 0, 8);
    this.shake = 0;
  }
  // V1.8 crash shake. It is only added around the actual draw call (see
  // withShake), so spawning/visibility maths never see a shaken camera.
  kick(amount) {
    this.shake = Math.min(1.1, (this.shake || 0) + amount);
  }
  withShake(dt, time, draw) {
    this.shake = (this.shake || 0) * Math.exp(-dt * 5);
    if (this.shake < 0.01) return draw();
    const s = this.shake,
      offset = this.point.set(
        Math.sin(time * 53) * s,
        Math.sin(time * 41) * s * 0.6,
        Math.cos(time * 47) * s,
      ),
      x = offset.x,
      y = offset.y,
      z = offset.z;
    this.camera.position.x += x;
    this.camera.position.y += y;
    this.camera.position.z += z;
    this.camera.updateMatrixWorld(true);
    try {
      return draw();
    } finally {
      this.camera.position.x -= x;
      this.camera.position.y -= y;
      this.camera.position.z -= z;
      this.camera.updateMatrixWorld(true);
    }
  }
  update(player, dt) {
    this.follow.lerp(
      this.point.set(player.x, 0, player.z),
      1 - Math.exp(-dt * 5),
    );
    this.camera.position.set(
      this.follow.x + (this.mobile ? 26 : 30),
      this.mobile ? 64 : 60,
      this.follow.z + 40,
    );
    this.camera.lookAt(this.follow.x, 0, this.follow.z - 6);
    this.camera.updateMatrixWorld(true);
  }
  visible(point, entries, player = null) {
    const target = { x: point.x, y: point.y ?? 1.1, z: point.z };
    const ndc = this.point
      .set(target.x, target.y, target.z)
      .project(this.camera);
    if (
      Math.abs(ndc.x) > 0.98 ||
      Math.abs(ndc.y) > 0.98 ||
      ndc.z < -1 ||
      ndc.z > 1
    )
      return false;
    return !entries.some((entry) => {
      const bounds = entry.bounds || entry;
      if (entry.opacity !== undefined && entry.opacity < 0.6) return false;
      if (
        player &&
        entry.opacity === undefined &&
        segmentHitsBuilding(
          this.camera.position,
          { x: player.x, y: 1, z: player.z },
          bounds,
        )
      )
        return false;
      return (
        segmentHitsBuilding(
          this.camera.position,
          target,
          bounds,
          entry.visualBounds,
        ) &&
        (!entry.intersects || entry.intersects(this.camera.position, target))
      );
    });
  }
}
