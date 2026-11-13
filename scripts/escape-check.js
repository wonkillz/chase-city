import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { random } from "./autoplay.js";
import { stageDriver } from "./pursuit.js";
export function measureEscape(
  seeds = Array.from({ length: 12 }, (_, i) => i + 1),
  limit = 180,
) {
  const runs = [];
  for (const seed of seeds) {
    const sim = new Simulation(createLayout(), {
        random: random(seed + 40000),
      }),
      control = stageDriver(seed);
    sim.start();
    for (let frame = 0; frame < limit * 60 && !sim.result; frame++)
      sim.update(1 / 60, control(sim));
    runs.push({
      seed,
      exit: sim.escape.exit.id,
      result: sim.result || "timeout",
      elapsed: sim.elapsed,
      escapeOpenedAt: sim.escape.openedAt,
      credits: sim.credits,
      health: sim.health,
      arrest: sim.arrest,
      remaining: Math.hypot(
        sim.escape.exit.x - sim.player.x,
        sim.escape.exit.z - sim.player.z,
      ),
    });
  }
  return {
    version: "1.7",
    method:
      "Legal roadblock-aware left/right controller through the full mission, no position/health edits or forced completion; 180-second limit.",
    runs,
    successes: runs.filter((r) => r.result === "success").length,
    successRate:
      runs.filter((r) => r.result === "success").length / runs.length,
  };
}
if (
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("/escape-check.js")
)
  console.log(JSON.stringify(measureEscape(), null, 2));
