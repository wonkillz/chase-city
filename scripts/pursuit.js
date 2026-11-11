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
function steerTo(sim, target) {
  const p = sim.player,
    desired = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  const error =
    Math.atan2(Math.sin(desired - p.angle), Math.cos(desired - p.angle)) -
    p.turn * 0.18;
  return { left: error > 0.045, right: error < -0.045 };
}
export function stageDriver(seed, mode = "roads") {
  const base = mode === "evasive" ? evasiveDriver(seed) : driver(seed);
  let exitPath = [],
    pathAt = -100,
    exitId = null,
    detour = [],
    detourId = null,
    previousTime = -1;
  const passed = new Set();
  return (sim) => {
    if (sim.elapsed < previousTime) {
      detour = [];
      detourId = null;
      exitPath = [];
      exitId = null;
      passed.clear();
    }
    previousTime = sim.elapsed;
    const p = sim.player;
    if (sim.escape?.phase === "open") {
      const e = sim.escape.exit,
        goal = { x: e.x + e.dx * 10, z: e.z + e.dz * 10 };
      if (exitId !== e.id || sim.elapsed - pathAt > 0.8 || !exitPath.length) {
        const raw = sim.navigation.findPath(p, goal, 1.12);
        exitPath = [];
        for (let i = 0; i < raw.length; i++)
          if (
            i === 0 ||
            i === raw.length - 1 ||
            raw[i].x - raw[i - 1].x !== raw[i + 1].x - raw[i].x ||
            raw[i].z - raw[i - 1].z !== raw[i + 1].z - raw[i].z
          )
            exitPath.push(raw[i]);
        pathAt = sim.elapsed;
        exitId = e.id;
      }
      while (
        exitPath.length > 1 &&
        Math.hypot(exitPath[0].x - p.x, exitPath[0].z - p.z) < 16
      )
        exitPath.shift();
      return steerTo(sim, exitPath[0] || goal);
    }
    if (detour.length) {
      while (
        detour.length &&
        Math.hypot(detour[0].x - p.x, detour[0].z - p.z) < 12
      )
        detour.shift();
      if (detour.length) return steerTo(sim, detour[0]);
      passed.add(detourId);
    }
    const speed = Math.hypot(p.vx, p.vz),
      fx = speed > 3 ? p.vx / speed : -Math.sin(p.angle),
      fz = speed > 3 ? p.vz / speed : -Math.cos(p.angle);
    const roadblock = (sim.barricades || [])
      .filter((b) => {
        const ahead = (b.road.x - p.x) * fx + (b.road.z - p.z) * fz;
        return (
          !passed.has(b.id) &&
          Math.abs((b.road.x - p.x) * fz - (b.road.z - p.z) * fx) < 8 &&
          (b.vertical ? Math.abs(fz) > 0.8 : Math.abs(fx) > 0.8) &&
          ahead > -5 &&
          ahead < 44 &&
          Math.hypot(b.x - p.x, b.z - p.z) < 48
        );
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
      )[0];
    if (roadblock) {
      const b = roadblock,
        axis = b.vertical
          ? { x: 0, z: Math.sign(fz) || -1 }
          : { x: Math.sign(fx) || -1, z: 0 };
      const raw = sim.navigation.findPath(
        p,
        { x: b.road.x + axis.x * 20, z: b.road.z + axis.z * 20 },
        1.12,
      );
      detour = raw.filter(
        (n, i) =>
          i === raw.length - 1 ||
          i === 0 ||
          n.x - raw[i - 1].x !== raw[i + 1].x - n.x ||
          n.z - raw[i - 1].z !== raw[i + 1].z - n.z,
      );
      detourId = b.id;
      while (
        detour.length &&
        Math.hypot(detour[0].x - p.x, detour[0].z - p.z) < 12
      )
        detour.shift();
      if (detour.length) return steerTo(sim, detour[0]);
    }
    return base(sim);
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
      sim = new SimulationType(layout, { random: random(seed + 40000) }),
      controls = stageDriver(seed, mode);
    sim.start();
    const desktop = new ChaseCamera(1100, 740),
      mobile = new ChaseCamera(390, 664);
    const explosionCauses = {
      vehicle: 0,
      wall: 0,
      barricade: 0,
      blast: 0,
      unknown: 0,
    };
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
      wallDamage = 0,
      boostSeconds = 0,
      barricadeCollisions = 0;
    const barricadeEvents = [];
    for (let frame = 0; frame < seconds * 60; frame++) {
      if (sim.result) {
        barricadeEvents.push(...(sim.barricadeEvents || []));
        boostSeconds += sim.stats.boostSeconds || 0;
        barricadeCollisions += sim.stats.barricadeCollisions || 0;
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
      boostSeconds: boostSeconds + (sim.stats.boostSeconds || 0),
      barricadeCollisions:
        barricadeCollisions + (sim.stats.barricadeCollisions || 0),
      barricadeEvents: [...barricadeEvents, ...(sim.barricadeEvents || [])],
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
    version: "1.5",
    mode,
    method:
      "Roadblock-aware normal left/right seeded driving, fixed 60Hz; camera projection plus building line-of-sight, 5Hz visibility sampling; faded player-occluding buildings count as transparent. No health edits, teleports or forced explosions.",
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
    wallAvoidance: road.meanWallCollisions < 2,
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
