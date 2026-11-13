import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { stageDriver } from "./pursuit.js";
import { random } from "./autoplay.js";
export function measureV17(seeds = [1, 2, 3, 4, 5, 6], seconds = 60) {
  const results = [];
  for (const width of [1100, 390])
    for (const mode of ["roads", "evasive", "straight"])
      for (const seed of mode === "straight" ? [1, 2] : seeds) {
        const height = width === 390 ? 664 : 740,
          s = new Simulation(createLayout(), {
            width,
            height,
            random: random(seed + 40000),
          });
        let drive = stageDriver(seed, mode === "evasive" ? "evasive" : "roads");
        s.start();
        let explosions = 0,
          visible = 0,
          restarts = 0,
          last = 0,
          contacts = 0,
          deferrals = 0,
          spawnCount = 0,
          unsafe = 0,
          front = 0,
          chaseVisible = 0,
          lastSpawns = 0;
        const spawnLog = [],
          collisionLog = [],
          events = [];
        for (let f = 0; f < seconds * 60; f++) {
          if (s.result) {
            collisionLog.push(...s.contactEvents);
            contacts += s.stats.pairCollisions;
            deferrals += s.stats.spawnDeferrals;
            s.reset();
            s.start();
            drive = stageDriver(
              seed + restarts,
              mode === "evasive" ? "evasive" : "roads",
            );
            last = 0;
            lastSpawns = 0;
            restarts++;
          }
          s.update(1 / 60, mode === "straight" ? {} : drive(s));
          for (const e of s.events)
            if (e.id > last) {
              last = e.id;
              explosions++;
              const seen = s.cameraRig.visible(
                { ...e, y: 2 },
                s.layout.buildings,
                s.player,
              );
              if (seen) visible++;
              events.push({ ...e, visible: seen, run: restarts });
            }
          for (const e of s.spawnEvents.slice(lastSpawns)) {
            spawnCount++;
            if (!e.outside) unsafe++;
            if (e.forward > -12) front++;
            spawnLog.push({ ...e, run: restarts });
          }
          lastSpawns = s.spawnEvents.length;
          if (
            f % 12 === 0 &&
            s.police.some(
              (c) =>
                c.state === "active" &&
                s.cameraRig.visible(c, s.layout.buildings, s.player),
            )
          )
            chaseVisible += 0.2;
        }
        contacts += s.stats.pairCollisions;
        deferrals += s.stats.spawnDeferrals;
        collisionLog.push(...s.contactEvents);
        results.push({
          width,
          height,
          mode,
          seed,
          seconds,
          explosions,
          visibleExplosions: visible,
          contacts,
          restarts,
          spawnCount,
          unsafeSpawns: unsafe,
          frontSpawns: front,
          deferrals,
          policeVisibleRatio: chaseVisible / seconds,
          events,
          spawnLog,
          collisionLog,
        });
      }
  const aggregates = [];
  for (const width of [1100, 390])
    for (const mode of ["roads", "evasive", "straight"]) {
      const runs = results.filter((r) => r.width === width && r.mode === mode),
        avg = (k) => runs.reduce((v, r) => v + r[k], 0) / runs.length;
      aggregates.push({
        width,
        mode,
        runs: runs.length,
        meanExplosions: avg("explosions"),
        meanVisibleExplosions: avg("visibleExplosions"),
        meanContacts: avg("contacts"),
        restarts: runs.reduce((v, r) => v + r.restarts, 0),
        spawns: runs.reduce((v, r) => v + r.spawnCount, 0),
        unsafeSpawns: runs.reduce((v, r) => v + r.unsafeSpawns, 0),
        frontSpawns: runs.reduce((v, r) => v + r.frontSpawns, 0),
        meanPoliceVisibleRatio: avg("policeVisibleRatio"),
      });
    }
  return {
    version: "1.7",
    method:
      "Normal left/right steering, actual per-project camera, fixed 60 Hz for 60 seconds played; ordinary failures restart. No forced placement, damage, explosions or health edits. Visibility is camera projection plus building-ray occlusion.",
    seeds,
    seconds,
    aggregates,
    results,
  };
}
if (
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("/measure-v17.js")
)
  console.log(JSON.stringify(measureV17(), null, 2));
