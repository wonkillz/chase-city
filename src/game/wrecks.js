import { CONFIG } from "./config.js";
export function retireWreck(sim, w) {
  sim.wrecks = sim.wrecks.filter((x) => x !== w);
  if (w.visible !== false)
    sim.retiringWrecks.push({ ...w, retiredAt: sim.elapsed });
}
export function addWreck(sim, car) {
  if (sim.wrecks.length >= CONFIG.maxWrecks) {
    const oldest = [...sim.wrecks].sort(
      (a, b) =>
        Number(a.visible !== false) - Number(b.visible !== false) ||
        a.born - b.born,
    )[0];
    retireWreck(sim, oldest);
  }
  const c = Math.abs(Math.cos(car.angle)),
    s = Math.abs(Math.sin(car.angle));
  sim.wrecks.push({
    id: ++sim.wreckId,
    x: car.x,
    z: car.z,
    angle: car.angle,
    w: 2.1 * c + 3.6 * s,
    d: 3.6 * c + 2.1 * s,
    kind: "wreck",
    born: sim.elapsed,
    solid: false,
    visible: true,
  });
}
export function updateWrecks(sim) {
  let changed = false;
  for (const w of [...sim.wrecks]) {
    // Headless simulation conservatively protects nearby wrecks. A rendered
    // frame supplies the actual camera-frustum visibility when available.
    if (!sim.hasWreckVisibility)
      w.visible = Math.hypot(w.x - sim.player.x, w.z - sim.player.z) < 75;
    const age = sim.elapsed - w.born;
    if (!w.solid && age >= 0.9) {
      w.solid = true;
      changed = true;
    }
    if (age >= CONFIG.wreckLifetime || (age >= 18 && w.visible === false)) {
      retireWreck(sim, w);
      changed = true;
    }
  }
  sim.retiringWrecks = sim.retiringWrecks.filter(
    (w) => sim.elapsed - w.retiredAt < 1.5,
  );
  // At most eight police can explode before the five-second respawn delay.
  sim.retiringWrecks = sim.retiringWrecks.slice(-CONFIG.maxPolice);
  if (changed) sim.refreshNavigation();
}
