import { test, expect } from "@playwright/test";

// V1.8 native chase on the real requestAnimationFrame loop. Only legal
// left/right steering from stageDriver(5, "evasive") is used: no simulation
// stepping, no police/health placement and no forced explosions.
test("V1.8 native chase: side/front pressure, staged multi-explosions, persistent wrecks and debris", async ({
  page,
}, info) => {
  test.setTimeout(900000);
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
    window.__v18 = {
      samples: 0,
      front: 0,
      side: 0,
      frontVisible: 0,
      shown: [],
      maxShake: 0,
      last: -1,
    };
    const observe = () => {
      const log = window.__v18;
      if (Math.floor(s.elapsed * 5) !== log.last && !s.result) {
        log.last = Math.floor(s.elapsed * 5);
        log.samples++;
        const active = s.police.filter((c) => c.state === "active");
        const front = active.filter((c) => c.pressure === "front");
        if (front.length) log.front++;
        if (active.some((c) => c.pressure === "side")) log.side++;
        if (front.some((c) => r.cameraRig.visible(c, r.buildings)))
          log.frontVisible++;
      }
      log.maxShake = Math.max(log.maxShake, r.cameraRig.shake || 0);
      // Record each explosion when its (possibly staged) effect is shown.
      for (const e of s.events)
        if (
          s.elapsed >= e.time + (e.delay || 0) &&
          !log.shown.some((v) => v.id === e.id)
        )
          log.shown.push({
            id: e.id,
            root: e.chainRoot,
            depth: e.chainDepth,
            shown: e.time + (e.delay || 0),
            visible: r.cameraRig.visible({ ...e, y: 2 }, r.buildings),
          });
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await page.locator("#start").click();
  const checkpoints = [];
  for (const stage of ["front", "multi", "sixty"]) {
    await page.waitForFunction(
      (stage) => {
        const { sim: s, renderer: r, state } = window.__CHASE__;
        if (s.result) throw Error(`Unexpected ${s.result} at ${s.elapsed}`);
        const shown = window.__v18.shown.filter((e) => e.visible);
        const ok =
          stage === "front"
            ? s.police.some(
                (c) =>
                  c.state === "active" &&
                  c.pressure === "front" &&
                  r.cameraRig.visible(c, r.buildings),
              )
            : stage === "multi"
              ? shown.some(
                  (a) =>
                    s.elapsed - a.shown > 0.15 &&
                    s.elapsed - a.shown < 0.8 &&
                    shown.some(
                      (b) => b !== a && Math.abs(b.shown - a.shown) <= 1.2,
                    ),
                )
              : s.elapsed >= 60;
        if (ok && state === "running") {
          document.querySelector("#pause").click();
          return true;
        }
        return false;
      },
      stage,
      { polling: "raf", timeout: 600000 },
    );
    checkpoints.push(
      await page.evaluate((stage) => {
        const { sim: s, renderer: r } = window.__CHASE__;
        return {
          stage,
          time: s.elapsed,
          explosions: s.stats.explosions,
          wreckIds: s.wrecks.map((w) => w.id),
          renderedWrecks: r.wreckRenderer.pool.filter((p) => p.group.visible)
            .length,
          debris: r.effects.debris.total,
        };
      }, stage),
    );
    await page.evaluate(() => {
      const { sim: s, renderer: r } = window.__CHASE__;
      r.renderer.setPixelRatio(1);
      r.renderer.setSize(innerWidth, innerHeight);
      r.renderer.shadowMap.needsUpdate = true;
      r.render(s, 0, false);
    });
    await page.screenshot({
      path: `test-results/v1.8-${info.project.name}-${stage}.png`,
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
    // Every wreck is still on the map; the ones in view are drawn as the
    // burnt-out police car with fire/smoke.
    const inView = s.wrecks.filter(
      (w) =>
        s.elapsed - w.born > 1 &&
        r.cameraRig.visible({ x: w.x, y: 1, z: w.z }, []),
    );
    const drawn = inView.filter((w) =>
      r.wreckRenderer.pool.some(
        (p) => p.id === w.id && p.group.visible && p.group.parent,
      ),
    );
    return {
      method:
        "Normal START; native RAF; legal stageDriver(5,evasive) steering only (seeded road-control RNG). No simulation stepping, police/health placement or forced explosions.",
      viewport: { width: innerWidth, height: innerHeight },
      elapsed: s.elapsed,
      result: s.result,
      stats: s.stats,
      wrecks: s.wrecks.length,
      wrecksInView: inView.length,
      wrecksDrawn: drawn.length,
      debris: r.effects.debris.total,
      explosions: s.events.map((e) => ({
        id: e.id,
        cause: e.cause,
        delay: e.delay,
        depth: e.chainDepth,
        root: e.chainRoot,
      })),
      screen: r.screenMetrics,
      ...window.__v18,
    };
  });
  await info.attach("v18-native-chase-record", {
    body: JSON.stringify({ ...proof, checkpoints }, null, 2),
    contentType: "application/json",
  });
  expect(proof.result).toBe(null);
  // Pressure comes from beside and in front of the player, not only behind.
  expect(proof.front).toBeGreaterThan(0);
  expect(proof.side).toBeGreaterThan(0);
  expect(proof.frontVisible).toBeGreaterThan(0);
  // Natural multi-car crashes: at least one on-screen moment with two or more
  // explosions, and real chain links staged after their source.
  const visible = proof.shown.filter((e) => e.visible);
  expect(visible.length).toBeGreaterThanOrEqual(2);
  expect(proof.explosions.some((e) => e.depth > 0 && e.delay > 0)).toBe(true);
  expect(proof.explosions.every((e) => e.cause !== "unknown")).toBe(true);
  expect(proof.maxShake).toBeGreaterThan(0.1);
  // Wrecks and debris stay until the end of the run.
  expect(proof.wrecks).toBe(proof.stats.explosions);
  const [, multi, sixty] = checkpoints;
  expect(multi.wreckIds.every((id) => sixty.wreckIds.includes(id))).toBe(true);
  expect(sixty.debris).toBeGreaterThanOrEqual(multi.debris);
  expect(sixty.debris).toBeGreaterThan(0);
  expect(sixty.debris % 18).toBe(0);
  expect(proof.wrecksDrawn).toBe(proof.wrecksInView);
  expect(errors).toEqual([]);
});
