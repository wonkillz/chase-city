import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
// Normal launch, neutral steering for five seconds, then hold right. No car,
// police, health, mission, clock or reinforcement overrides.
export function normalCordonControls(elapsed) {
  return { left: false, right: Math.round(elapsed * 60) > 300 };
}
export function cordonSample(sim) {
  const near = sim.police.filter(
    (c) =>
      c.state === "active" &&
      Math.hypot(c.x - sim.player.x, c.z - sim.player.z) < 8,
  );
  return {
    time: sim.elapsed,
    arrest: sim.arrest,
    percent: (100 * sim.arrest) / 3,
    groundSpeed: sim.player.groundSpeed || 0,
    effectiveEscapeSpeed: sim.player.effectiveEscapeSpeed || 0,
    nearby: near.length,
    nearbyIds: near.map((c) => c.id),
    trapped: sim.enclosure.trapped,
    reason: sim.enclosure.reason || null,
    explosions: sim.stats.explosions,
    health: sim.health,
    minimumPoliceHealth: Math.min(100, ...near.map((c) => c.health)),
    x: sim.player.x,
    z: sim.player.z,
    result: sim.result,
  };
}
export function reproduceCordon(limit = 60) {
  const sim = new Simulation(createLayout(), { random: () => 0.3 });
  const initial = {
    player: { ...sim.player },
    police: sim.police.map((c) => ({ id: c.id, x: c.x, z: c.z })),
  };
  sim.start();
  const timeline = [cordonSample(sim)];
  for (let frame = 0; frame < limit * 60 && !sim.result; frame++) {
    sim.update(1 / 60, normalCordonControls(sim.elapsed));
    if (frame % 12 === 11 || sim.result) timeline.push(cordonSample(sim));
  }
  return {
    version: "1.6",
    method:
      "Normal START and legal right steering after five seconds; fixed 60 Hz. No police placement, health edits, invulnerability or forced results.",
    initial,
    result: sim.result,
    elapsed: sim.elapsed,
    explosions: sim.stats.explosions,
    timeline,
  };
}
if (
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("/reproduce-v16.js")
)
  console.log(JSON.stringify(reproduceCordon(), null, 2));
