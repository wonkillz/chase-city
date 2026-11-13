import * as THREE from "three";
// Test the entire expanded world-space hull against the actual view frustum.
// Buildings never make an on-screen position eligible: occlusion is irrelevant.
export function spawnView(camera) {
  if (!camera) return null;
  camera.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
  return { camera, frustum, matrix };
}
export function spawnHull(candidate, angle = 0, margin = 8) {
  const c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle));
  const x = 1.3 * c + 2.2 * s + margin,
    z = 2.2 * c + 1.3 * s + margin;
  return new THREE.Box3(
    new THREE.Vector3(candidate.x - x, -margin, candidate.z - z),
    new THREE.Vector3(candidate.x + x, 2.4 + margin, candidate.z + z),
  );
}
export function inspectSpawn(view, point, angle = 0, margin = 8) {
  if (!view) return { outside: false, reason: "camera-unavailable" };
  const box = spawnHull(point, angle, margin),
    outside = !view.frustum.intersectsBox(box);
  const projected = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(view.camera);
        projected.push([p.x, p.y, p.z]);
      }
  return {
    outside,
    projected,
    margin,
    aspect: view.camera.aspect,
    fov: view.camera.fov,
    cameraPosition: view.camera.position.toArray(),
    viewMatrix: view.camera.matrixWorldInverse.toArray(),
    projectionMatrix: view.camera.projectionMatrix.toArray(),
  };
}
