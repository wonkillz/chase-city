// Wreck identity and collision data belong to the run, not an officer or a
// renderer slot. Only Simulation.reset() discards them.
export function addWreck(sim, car) {
  const c = Math.abs(Math.cos(car.angle)),
    s = Math.abs(Math.sin(car.angle));
  const wreck = {
    id: ++sim.wreckId,
    x: car.x,
    z: car.z,
    angle: car.angle,
    w: 2.1 * c + 3.6 * s,
    d: 3.6 * c + 2.1 * s,
    kind: "wreck",
    born: sim.elapsed,
    solid: false,
  };
  sim.wrecks.push(wreck);
  return wreck;
}
export function updateWrecks(sim) {
  let changed = false;
  for (const wreck of sim.wrecks)
    if (!wreck.solid && sim.elapsed - wreck.born >= 0.9) {
      wreck.solid = true;
      changed = true;
    }
  if (changed) sim.refreshNavigation();
}
