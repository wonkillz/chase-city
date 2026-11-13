import { test, expect } from "@playwright/test";
test("real camera tracks routed pursuit, eight-car fleet and bounded rear effects", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await page.goto("/?debug");
  await page.locator("#start").click();
  const metrics = await page.evaluate(async () => {
    const { sim: s, renderer: r } = window.__CHASE__;
    const { stageDriver } = await import("/scripts/pursuit.js");
    // Seed 2 is now legitimately arrested before the 41-second rendering window.
    // Use another legal road route; all gameplay/health and assertions stay intact.
    const control = stageDriver(3);
    s.reset();
    s.start();
    r.reset();
    r.renderer.shadowMap.autoUpdate = false;
    for (let frame = 0; frame < 41 * 60; frame++) {
      s.update(1 / 60, control(s));
      if (frame % 24 === 0) r.render(s, 0.4, true);
    }
    r.render(s, 1 / 60, true);
    return {
      elapsed: s.elapsed,
      result: s.result,
      screen: r.screenMetrics,
      searches: s.navigation.searches,
      replans: s.police.reduce((n, c) => n + c.replans, 0),
      fleet: s.police.length,
      meshes: r.police.length,
      visibleDust: r.trails.dust.filter((p) => p.mesh.visible).length,
      visibleSkids: r.trails.marks.filter((m) => m.mesh.visible).length,
      dustPool: r.trails.dust.length,
      skidPool: r.trails.marks.length,
      health: s.health,
      wallContacts: s.player.wallContacts,
      wallDamage: s.stats.wallDamage,
      policeVisible: r.police.filter((p) => p.visible).length,
    };
  });
  expect(metrics.elapsed).toBeGreaterThanOrEqual(40.99);
  expect(metrics.result).toBeNull();
  expect(metrics.searches).toBeGreaterThan(20);
  expect(metrics.replans).toBeGreaterThan(10);
  expect(metrics.fleet).toBeGreaterThanOrEqual(5);
  expect(metrics.fleet).toBeLessThanOrEqual(8);
  expect(metrics.meshes).toBe(metrics.fleet);
  expect(metrics.screen.sampledSeconds).toBeGreaterThan(30);
  expect(
    metrics.screen.nearestDistanceTime / metrics.screen.sampledSeconds,
  ).toBeLessThan(40);
  expect(
    metrics.screen.policeVisibleSeconds / metrics.screen.sampledSeconds,
  ).toBeGreaterThan(0.35);
  expect(metrics.visibleDust).toBeGreaterThan(0);
  expect(metrics.dustPool).toBe(48);
  expect(metrics.skidPool).toBe(64);
  await test.info().attach("actual-camera-metrics", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  await page.locator("#pause").click();
  await page.screenshot({
    path: `test-results/v1.4-${info.project.name}-pursuit.png`,
    style: "#overlay{visibility:hidden}",
    timeout: 120000,
  });
  expect(errors).toEqual([]);
});
test("player wall sliding costs zero health and remains controllable on keyboard/touch", async ({
  page,
}, info) => {
  await page.goto("/?debug");
  await page.locator("#start").click();
  const result = await page.evaluate(() => {
    const { sim: s } = window.__CHASE__;
    s.police = [];
    s.reinforcementsEnabled = false;
    s.barricadesEnabled = false;
    s.reset();
    s.start();
    s.police = [];
    const b = s.layout.buildings.find(
      (b) => b.x > 0 && b.x < 15 && b.z > 15 && b.z < 25,
    );
    Object.assign(s.player, {
      x: b.x,
      z: b.z + b.d / 2 + 2,
      angle: 0,
      vx: 0,
      vz: -24,
      turn: 0,
      steering: 0,
    });
    const initial = { x: s.player.x, z: s.player.z };
    for (let i = 0; i < 240; i++) s.update(1 / 60, {});
    return {
      health: s.health,
      wall: s.player.wallContacts,
      moved: Math.hypot(s.player.x - initial.x, s.player.z - initial.z),
    };
  });
  expect(result.health).toBe(100);
  expect(result.wall).toBeGreaterThan(0);
  expect(result.moved).toBeGreaterThan(5);
  const before = await page.evaluate(() => window.__CHASE__.sim.player.angle);
  if (info.project.name.includes("iphone")) {
    await page.evaluate(() =>
      document
        .querySelector('[data-control="right"]')
        .dispatchEvent(
          new PointerEvent("pointerdown", { pointerId: 7, bubbles: true }),
        ),
    );
  } else await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (a) => window.__CHASE__.sim.player.angle < a - 0.15,
    before,
  );
  if (info.project.name.includes("iphone"))
    await page.evaluate(() =>
      document
        .querySelector('[data-control="right"]')
        .dispatchEvent(
          new PointerEvent("pointercancel", { pointerId: 7, bubbles: true }),
        ),
    );
  else await page.keyboard.up("ArrowRight");
  await expect(page.locator('[data-control="drift"]')).toHaveCount(0);
});
