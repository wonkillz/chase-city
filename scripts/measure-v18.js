// V1.8 pressure / multi-explosion measurement. Usage:
//   node scripts/measure-v18.js [projectRoot] [output.json]
// projectRoot defaults to this checkout, so the same measurement can be run
// against a V1.7 checkout for an apples-to-apples comparison.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] || new URL("..", import.meta.url).pathname);
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { Simulation } = await load("src/game/simulation.js");
const { createLayout } = await load("src/world/layout.js");
const { stageDriver } = await load("scripts/pursuit.js");
const { random } = await load("scripts/autoplay.js");

export const MULTI_WINDOW = 1.2;

function pressureSample(s) {
  const p = s.player,
    fx = -Math.sin(p.angle),
    fz = -Math.cos(p.angle);
  let within15 = 0,
    front = false,
    side = false;
  for (const c of s.police) {
    if (c.state !== "active") continue;
    const rx = c.x - p.x,
      rz = c.z - p.z,
      dist = Math.hypot(rx, rz),
      along = rx * fx + rz * fz,
      lateral = rx * -fz + rz * fx;
    if (dist < 15) within15++;
    if (along > 3 && along < 22 && Math.abs(lateral) < 7) front = true;
    if (Math.abs(along) < 4.5 && Math.abs(lateral) > 1.5 && Math.abs(lateral) < 7)
      side = true;
  }
  return { within15, front, side };
}

export function measure(seeds = [1, 2, 3, 4, 5, 6], seconds = 60) {
  const runs = [];
  for (const width of [1100, 390])
    for (const mode of ["roads", "evasive"])
      for (const seed of seeds) {
        const height = width === 390 ? 664 : 740;
        const s = new Simulation(createLayout(), {
          width,
          height,
          random: random(seed + 40000),
        });
        let drive = stageDriver(seed, mode);
        s.start();
        const run = {
          width,
          mode,
          seed,
          results: { arrested: 0, destroyed: 0, success: 0 },
          explosions: [],
          frames: 0,
          within15: 0,
          front: 0,
          side: 0,
          frontOrSide: 0,
          surround3: 0,
          arrestSeconds: 0,
        };
        let last = 0,
          restarts = 0;
        for (let f = 0; f < seconds * 60; f++) {
          if (s.result) {
            run.results[s.result] = (run.results[s.result] || 0) + 1;
            s.reset();
            s.start();
            restarts++;
            drive = stageDriver(seed + restarts, mode);
            last = 0;
          }
          s.update(1 / 60, drive(s));
          for (const e of s.events)
            if (e.id > last) {
              last = e.id;
              const visible = s.cameraRig.visible(
                { ...e, y: 2 },
                s.layout.buildings,
                s.player,
              );
              run.explosions.push({
                run: restarts,
                time: f / 60 + (e.delay || 0),
                cause: e.cause,
                chainRoot: e.chainRoot === undefined ? undefined : `${restarts}:${e.chainRoot}`,
                frameKey: `${restarts}:${f}`,
                visible,
                distance: Math.hypot(e.x - e.playerX, e.z - e.playerZ),
              });
            }
          const ps = pressureSample(s);
          run.frames++;
          run.within15 += ps.within15;
          if (ps.front) run.front++;
          if (ps.side) run.side++;
          if (ps.front || ps.side) run.frontOrSide++;
          if (ps.within15 >= 3) run.surround3++;
          if (s.arrest > 0) run.arrestSeconds += 1 / 60;
        }
        run.restarts = restarts;
        runs.push(run);
      }
  return runs;
}

// Visible multi-explosion moments: two or more on-screen explosions whose
// visual start times fall in the same 1.2-second window.
export function multiMoments(explosions) {
  const visible = explosions.filter((e) => e.visible).sort((a, b) => a.time - b.time);
  let moments = 0,
    i = 0;
  while (i < visible.length) {
    let j = i;
    while (j + 1 < visible.length && visible[j + 1].time - visible[i].time <= MULTI_WINDOW) j++;
    if (j > i) moments++;
    i = j + 1;
  }
  return moments;
}

export function summarize(runs) {
  const n = runs.length,
    frames = runs.reduce((a, r) => a + r.frames, 0);
  const all = runs.flatMap((r) => r.explosions);
  // V1.7 has no chainRoot: its chain steps all share one frame, so explosions
  // from the same run/frame form one group. V1.8 records the root explicitly.
  const chains = new Map();
  runs.forEach((r, i) =>
    r.explosions.forEach((e) => {
      const key = `${i}:${e.chainRoot ?? e.frameKey}`;
      chains.set(key, (chains.get(key) || 0) + 1);
    }),
  );
  const chainSizes = [...chains.values()];
  const pct = (k) => +((runs.reduce((a, r) => a + r[k], 0) / frames) * 100).toFixed(1);
  return {
    runs: n,
    arrests: runs.reduce((a, r) => a + r.results.arrested, 0),
    destroyed: runs.reduce((a, r) => a + r.results.destroyed, 0),
    avgPoliceWithin15: +(runs.reduce((a, r) => a + r.within15, 0) / frames).toFixed(2),
    frontPressurePct: pct("front"),
    sidePressurePct: pct("side"),
    frontOrSidePct: pct("frontOrSide"),
    threeWithin15Pct: pct("surround3"),
    explosionsPerRun: +(all.length / n).toFixed(2),
    visibleExplosionsPerRun: +(all.filter((e) => e.visible).length / n).toFixed(2),
    visibleSharePct: +((all.filter((e) => e.visible).length / Math.max(1, all.length)) * 100).toFixed(1),
    farExplosionsPerRun: +(all.filter((e) => e.distance > 40).length / n).toFixed(2),
    visibleMultiMomentsPerRun: +(runs.reduce((a, r) => a + multiMoments(r.explosions), 0) / n).toFixed(2),
    chainGroups2to3PerRun: +(chainSizes.filter((k) => k >= 2 && k <= 3).length / n).toFixed(2),
    chainGroups4plusPerRun: +(chainSizes.filter((k) => k >= 4).length / n).toFixed(2),
    causes: all.reduce((a, e) => ((a[e.cause] = (a[e.cause] || 0) + 1), a), {}),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seedCount = Number(process.env.SEEDS || 12);
  const runs = measure(Array.from({ length: seedCount }, (_, i) => i + 1));
  const summary = summarize(runs);
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv[3])
    writeFileSync(
      process.argv[3],
      JSON.stringify(
        {
          root,
          summary,
          runs: runs.map((r) => ({ ...r, multiMoments: multiMoments(r.explosions) })),
        },
        null,
        1,
      ),
    );
}
