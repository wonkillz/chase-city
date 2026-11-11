import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { ChaseCamera } from "../src/render/camera.js";
import { driver, random } from "./autoplay.js";
export function evasiveDriver(seed) {
  const roads = driver(seed),
    rng = random(seed + 9000),
    sign = rng() > 0.5 ? 1 : -1;
  return (sim) => {
    const phase = sim.elapsed % 9;
    if (phase > 3.5 && phase < 5.1) return { left: sign > 0, right: sign < 0 };
    if (phase >= 5.1 && phase < 6.1) return { left: sign < 0, right: sign > 0 };
    return roads(sim);
  };
}
export function measurePursuit(
  seeds = Array.from({ length: 12 }, (_, i) => i + 1),
  seconds = 60,
  mode = "roads",
  SimulationType = Simulation,
) {
  const runs = [];
  for (const seed of seeds) {
    const layout = createLayout(),
      sim = new SimulationType(layout),
      controls = mode === "evasive" ? evasiveDriver(seed) : driver(seed);
    sim.start();
    const desktop = new ChaseCamera(1100, 740),
      mobile = new ChaseCamera(390, 664);
    const explosionCauses = { vehicle: 0, wall: 0, blast: 0, unknown: 0 };
    let nearestTime = 0,
      allDistanceTime = 0,
      chaseSeconds = 0,
      longestChase = 0,
      currentChase = 0,
      visibleDesktop = 0,
      visibleMobile = 0,
      explosions = 0,
      visibleExplosionDesktop = 0,
      visibleExplosionMobile = 0,
      lastId = 0,
      maxFleet = 4,
      restarts = 0,
      wallHits = 0,
      pairHits = 0,
      wallDamage = 0;
    for (let frame = 0; frame < seconds * 60; frame++) {
      if (sim.result) {
        wallHits += sim.stats.wallCollisions;
        pairHits += sim.stats.pairCollisions;
        wallDamage += sim.stats.wallDamage;
        sim.reset();
        sim.start();
        lastId = 0;
        restarts++;
      }
      sim.update(1 / 60, controls(sim));
      desktop.update(sim.player, 1 / 60);
      mobile.update(sim.player, 1 / 60);
      maxFleet = Math.max(maxFleet, sim.police.length);
      for (const e of sim.events)
        if (e.id > lastId) {
          lastId = e.id;
          explosions++;
          explosionCauses[e.cause || "unknown"]++;
          if (desktop.visible({ ...e, y: 2 }, layout.buildings, sim.player))
            visibleExplosionDesktop++;
          if (mobile.visible({ ...e, y: 2 }, layout.buildings, sim.player))
            visibleExplosionMobile++;
        }
      if (frame % 12 === 0) {
        const active = sim.police.filter((c) => c.state === "active"),
          distances = active.map((c) =>
            Math.hypot(c.x - sim.player.x, c.z - sim.player.z),
          );
        const nearest = Math.min(220, ...distances);
        nearestTime += nearest * 0.2;
        allDistanceTime +=
          (distances.reduce((a, b) => a + b, 0) / (distances.length || 1)) *
          0.2;
        if (nearest < 35) {
          chaseSeconds += 0.2;
          currentChase += 0.2;
          longestChase = Math.max(longestChase, currentChase);
        } else currentChase = 0;
        if (
          active.some((c) => desktop.visible(c, layout.buildings, sim.player))
        )
          visibleDesktop += 0.2;
        if (active.some((c) => mobile.visible(c, layout.buildings, sim.player)))
          visibleMobile += 0.2;
      }
    }
    runs.push({
      seed,
      seconds,
      explosionCauses,
      restarts,
      maxFleet,
      meanNearestDistance: nearestTime / seconds,
      meanAllPoliceDistance: allDistanceTime / seconds,
      chaseSeconds,
      longestChase,
      policeVisibleRatioDesktop: visibleDesktop / seconds,
      policeVisibleRatioMobile: visibleMobile / seconds,
      explosions,
      visibleExplosionDesktop,
      visibleExplosionMobile,
      wallCollisions: wallHits + sim.stats.wallCollisions,
      pairCollisions: pairHits + sim.stats.pairCollisions,
      wallDamage: wallDamage + sim.stats.wallDamage,
    });
  }
  const mean = (key) => runs.reduce((sum, r) => sum + r[key], 0) / runs.length;
  return {
    version: "1.3",
    mode,
    method:
      "Normal left/right seeded driving, fixed 60Hz; camera projection plus building line-of-sight, 5Hz visibility sampling; faded player-occluding buildings count as transparent. No health edits, teleports or forced explosions.",
    seconds,
    seeds,
    meanNearestDistance: mean("meanNearestDistance"),
    meanAllPoliceDistance: mean("meanAllPoliceDistance"),
    meanChaseSeconds: mean("chaseSeconds"),
    meanLongestChase: mean("longestChase"),
    policeVisibleRatioDesktop: mean("policeVisibleRatioDesktop"),
    policeVisibleRatioMobile: mean("policeVisibleRatioMobile"),
    meanExplosions: mean("explosions"),
    meanVisibleExplosionsDesktop: mean("visibleExplosionDesktop"),
    meanVisibleExplosionsMobile: mean("visibleExplosionMobile"),
    meanWallCollisions: mean("wallCollisions"),
    meanPairCollisions: mean("pairCollisions"),
    runs,
  };
}
export function assessPursuit(report) {
  const road = report.roads,
    evasive = report.evasive;
  return {
    nearDistance: road.meanNearestDistance < 30,
    chaseDuration: road.meanChaseSeconds >= 45,
    desktopVisibility: road.policeVisibleRatioDesktop >= 0.75,
    mobileVisibility: road.policeVisibleRatioMobile >= 0.6,
    wallAvoidance: road.meanWallCollisions < 1,
    visibleNaturalAccidents:
      evasive.meanVisibleExplosionsDesktop > 0 &&
      evasive.meanVisibleExplosionsMobile > 0,
  };
}
if (
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("/pursuit.js")
) {
  const report = {
    roads: measurePursuit(),
    evasive: measurePursuit(undefined, 60, "evasive"),
  };
  report.checks = assessPursuit(report);
  report.passed = Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
