import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { angleDelta } from "../src/game/config.js";
export function random(seed) {
  let n = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
// Legal left/right controls only. Seeded road-loop drivers choose turn timing,
// direction, lane and a few late turns; they never edit health, cars or events.
export function driver(seed) {
  const rng = random(seed),
    direction = rng() > 0.5 ? 1 : -1,
    extent = rng() > 0.65 ? 90 : 60;
  const points = [
    [0, -extent],
    [direction * extent, -extent],
    [direction * extent, extent],
    [-direction * extent, extent],
    [-direction * extent, -extent],
  ];
  let index = 0,
    previousTime = 0,
    changedAt = 0,
    turnDistance = 10 + rng() * 4;
  return (sim) => {
    if (sim.elapsed < previousTime) {
      index = 0;
      changedAt = 0;
    }
    previousTime = sim.elapsed;
    const p = sim.player;
    let target = points[index];
    if (
      Math.hypot(target[0] - p.x, target[1] - p.z) < turnDistance ||
      sim.elapsed - changedAt > 12
    ) {
      index = (index + 1) % points.length;
      changedAt = sim.elapsed;
      turnDistance = 10 + rng() * 4;
      target = points[index];
    }
    const desired = Math.atan2(-(target[0] - p.x), -(target[1] - p.z));
    const delta = angleDelta(desired, p.angle);
    return { left: delta > 0.06, right: delta < -0.06 };
  };
}
export function runAutoplay(
  seeds = Array.from({ length: 40 }, (_, i) => i + 1),
  seconds = 60,
  SimulationType = Simulation,
) {
  const runs = [];
  for (const seed of seeds) {
    const sim = new SimulationType(createLayout());
    const controls = driver(seed);
    sim.start();
    let restarts = 0,
      totals = {
        explosions: 0,
        chainExplosions: 0,
        wallCollisions: 0,
        pairCollisions: 0,
        wallDamage: 0,
        pairDamage: 0,
      };
    for (let frame = 0; frame < seconds * 60; frame++) {
      if (sim.result) {
        for (const key in totals)
          totals[key] +=
            sim.stats?.[key] ??
            (key === "explosions"
              ? sim.events.filter((e) => e.type === "explosion").length
              : 0);
        sim.reset();
        sim.start();
        restarts++;
      }
      sim.update(1 / 60, controls(sim));
    }
    for (const key in totals)
      totals[key] +=
        sim.stats?.[key] ??
        (key === "explosions"
          ? sim.events.filter((e) => e.type === "explosion").length
          : 0);
    runs.push({ seed, seconds, restarts, ...totals });
  }
  const average = runs.reduce((sum, r) => sum + r.explosions, 0) / runs.length;
  return {
    version: "1.2",
    seconds,
    seeds,
    seeding:
      "mixed-seed LCG road-loop input driver; fixed city and normal four-officer simulation",
    method:
      "60 seconds of played simulation per seed; normal death/arrest restarts counted, no health overrides or forced explosions",
    averageExplosions: average,
    minimum: Math.min(...runs.map((r) => r.explosions)),
    maximum: Math.max(...runs.map((r) => r.explosions)),
    runs,
  };
}
if (process.argv[1]?.endsWith("/autoplay.js")) {
  const seeds = [
    ...Array.from({ length: 40 }, (_, i) => i + 1),
    ...Array.from({ length: 20 }, (_, i) => 1001 + i),
  ];
  const report = runAutoplay(seeds);
  report.cohorts = [
    {
      name: "initial",
      seeds: 40,
      average:
        report.runs.slice(0, 40).reduce((n, r) => n + r.explosions, 0) / 40,
    },
    {
      name: "held-out",
      seeds: 20,
      average: report.runs.slice(40).reduce((n, r) => n + r.explosions, 0) / 20,
    },
  ];
  report.targetMet =
    report.averageExplosions >= 2 && report.averageExplosions <= 4;
  console.log(JSON.stringify(report, null, 2));
  if (!report.targetMet) process.exitCode = 1;
}
