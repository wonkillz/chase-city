import { test, expect } from "@playwright/test";

test("V1.7 native chase: natural crashes and offscreen road reinforcements", async ({
  page,
}, info) => {
  test.setTimeout(600000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?debug");
  await page.evaluate(async () => {
    const { stageDriver } = await import("/scripts/pursuit.js");
    const { random } = await import("/scripts/autoplay.js");
    const { sim: s, input, renderer: r } = window.__CHASE__;
    // V1.8: the same seeded road-control RNG as scripts/measure-v18.js, so
    // this native-frame run is repeatable (Math.random made it a coin flip
    // under V1.8's stronger pressure). Route 5 survives 60 s on PC/phone.
    s.random = random(40003);
    s.lastExitId = null;
    s.reset();
    r.reset();
    const drive = stageDriver(5, "evasive");
    let tick = -1,
      controls = {};
    for (const key of ["left", "right"])
      Object.defineProperty(input, key, {
        configurable: true,
        get() {
          if (window.__CHASE__.state !== "running") return false;
          if (tick !== s.elapsed) {
            tick = s.elapsed;
            const previous = Object.create(s);
            previous.elapsed = s.elapsed - 1 / 60;
            controls = drive(previous);
          }
          return !!controls[key];
        },
        set() {},
      });
    r.renderer.setPixelRatio(0.5);
    r.renderer.setSize(innerWidth, innerHeight);
    r.renderer.shadowMap.autoUpdate = false;
    window.__v17 = { samples: [], visible: [], last: -1 };
    const observe = () => {
      const log = window.__v17;
      if (Math.floor(s.elapsed * 5) !== log.last) {
        log.last = Math.floor(s.elapsed * 5);
        log.samples.push({
          time: s.elapsed,
          arrest: s.arrest,
          health: s.health,
          result: s.result,
          police: s.police
            .filter((c) => c.state === "active")
            .map((c) => ({
              id: c.id,
              generation: c.generation,
              x: c.x,
              z: c.z,
            })),
          wrecks: s.wrecks.length,
        });
      }
      for (const e of s.events)
        if (
          !log.visible.some((v) => v.id === e.id) &&
          s.elapsed - e.time < 1 &&
          r.cameraRig.visible({ ...e, y: 2 }, r.buildings)
        )
          log.visible.push({ ...e, observed: s.elapsed });
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await page.locator("#start").click();
  const checkpoints = [];
  for (const stage of ["spawn", "entry", "explosion", "sixty"]) {
    await page.waitForFunction(
      (stage) => {
        const { sim: s, renderer: r, state } = window.__CHASE__;
        if (s.result) throw Error(`Unexpected ${s.result} at ${s.elapsed}`);
        const ok =
          stage === "spawn"
            ? s.spawnEvents.length > 0
            : stage === "entry"
              ? r.spawnEntries.length > 0
              : stage === "explosion"
                ? window.__v17.visible.some(
                    (e) => s.elapsed - e.time > 0.2 && s.elapsed - e.time < 1,
                  )
                : s.elapsed >= 60;
        if (ok && state === "running") {
          document.querySelector("#pause").click();
          return true;
        }
        return false;
      },
      stage,
      { polling: "raf", timeout: 300000 },
    );
    checkpoints.push(
      await page.evaluate(
        (stage) => ({
          stage,
          time: window.__CHASE__.sim.elapsed,
          spawns: window.__CHASE__.sim.spawnEvents.length,
          entries: window.__CHASE__.renderer.spawnEntries.length,
          explosions: window.__CHASE__.sim.stats.explosions,
        }),
        stage,
      ),
    );
    await page.evaluate(() => {
      const { sim: s, renderer: r } = window.__CHASE__;
      r.renderer.setPixelRatio(1);
      r.renderer.setSize(innerWidth, innerHeight);
      r.renderer.shadowMap.needsUpdate = true;
      r.render(s, 0, false);
    });
    await page.screenshot({
      path: `test-results/v1.7-${info.project.name}-${stage}.png`,
      style: "#overlay{visibility:hidden}",
      timeout: 120000,
    });
    await page.evaluate(() => {
      const r = window.__CHASE__.renderer;
      r.renderer.setPixelRatio(0.5);
      r.renderer.setSize(innerWidth, innerHeight);
    });
    if (stage !== "sixty") await page.locator("#start").click();
  }
  const proof = await page.evaluate(() => {
    const { sim: s, renderer: r } = window.__CHASE__;
    return {
      method:
        "Normal START; native RAF; legal stageDriver(5,evasive) steering only (seeded road-control RNG). No simulation stepping, police/health placement or forced explosions.",
      viewport: { width: innerWidth, height: innerHeight },
      elapsed: s.elapsed,
      result: s.result,
      stats: s.stats,
      spawnEvents: s.spawnEvents,
      firstFrames: r.spawnDisplayLog,
      entries: r.spawnEntries,
      collisions: s.contactEvents,
      explosions: s.events,
      wrecks: s.wrecks.map((w) => ({ id: w.id, x: w.x, z: w.z, age: w.age })),
      escape: s.escape,
      screen: r.screenMetrics,
      ...window.__v17,
    };
  });
  await info.attach("v17-natural-chase-record", {
    body: JSON.stringify({ ...proof, checkpoints }, null, 2),
    contentType: "application/json",
  });
  expect(proof.result).toBe(null);
  expect(proof.visible.length).toBeGreaterThan(0);
  expect(proof.collisions.some((c) => c.damage > 0)).toBe(true);
  expect(proof.entries.length).toBeGreaterThan(0);
  expect(proof.entries.every((e) => e.age > 0)).toBe(true);
  expect(
    proof.spawnEvents.every(
      (e) => e.outside && e.forward <= -12 && e.distance >= 45 && e.road,
    ),
  ).toBe(true);
  expect(
    proof.spawnEvents
      .filter((e) => e.kind === "respawn")
      .every((e) => e.respawnDelay >= 2.5),
  ).toBe(true);
  expect(proof.firstFrames.every((e) => e.bodyOutside && e.safeOutside)).toBe(
    true,
  );
  expect(
    Math.max(...proof.samples.map((s) => s.police.length)),
  ).toBeLessThanOrEqual(8);
  expect(proof.wrecks.length).toBe(proof.stats.explosions);
  expect(errors).toEqual([]);
});
