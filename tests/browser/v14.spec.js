import { test, expect } from "@playwright/test";
test("two-second road-control warning, actual barrier meshes and escape-clear navigation", async ({
  page,
}) => {
  await page.goto("/?debug");
  await page.locator("#start").click();
  await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    s.police = [];
    s.reinforcementsEnabled = false;
    Object.assign(s.player, { x: 0, z: 70, vx: 0, vz: -24, angle: 0 });
    s.elapsed = 7.99;
    s.update(0.02, {});
  });
  await expect(page.locator("#notice")).toContainText("2초 후 전방 도로 통제");
  const result = await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    s.elapsed = 9.99;
    s.update(0.02, {});
    return {
      events: s.barricadeEvents,
      gap: s.barricades[0].gap.width,
      physics: s.navigation.solids.includes(s.barricades[0]),
    };
  });
  expect(result.events[0].time).toBe(10);
  expect(result.events[0].placed).toBe(true);
  expect(result.gap).toBeGreaterThanOrEqual(4.5);
  expect(result.physics).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__CHASE__.renderer.roadEvents.barriers.filter((m) => m.visible)
            .length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    s.elapsed = 59.99;
    s.update(0.02, {});
  });
  await expect(page.locator("#notice")).toHaveText("ESCAPE ROUTE OPEN!");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__CHASE__.renderer.roadEvents.barriers.filter((m) => m.visible)
            .length,
      ),
    )
    .toBe(0);
  expect(
    await page.evaluate(() => window.__CHASE__.sim.barricades.length),
  ).toBe(0);
});
test("green outside gate, direction/distance UI, post-60 chase and final ESCAPED reward", async ({
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
  await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    s.reinforcementsEnabled = false;
    s.police = [];
    s.elapsed = 59.99;
  });
  await expect(page.locator("#notice")).toHaveText("ESCAPE ROUTE OPEN!");
  await expect(page.locator("#escape-guidance")).toBeVisible();
  await expect(page.locator("#escape-distance")).toHaveText(/\d+ m/);
  await page.waitForFunction(() => window.__CHASE__.sim.elapsed > 60.05);
  const exitId = await page.evaluate(() => window.__CHASE__.sim.escape.exit.id);
  expect(await page.evaluate(() => window.__CHASE__.sim.credits)).toBe(0);
  expect(await page.evaluate(() => window.__CHASE__.sim.result)).toBeNull();
  await page.locator("#pause").click();
  const geometry = await page.evaluate(() => {
    const { sim: s, renderer: r } = window.__CHASE__,
      e = s.escape.exit;
    Object.assign(s.player, {
      x: e.x - e.dx * 20,
      z: e.z - e.dz * 20,
      angle: Math.atan2(-e.dx, -e.dz),
      vx: 0,
      vz: 0,
    });
    r.cameraRig.follow.set(s.player.x, 0, s.player.z);
    r.render(s, 0.1, false);
    return {
      gate: r.roadEvents.gate.visible,
      beam: r.roadEvents.beam.visible,
      children: r.roadEvents.gate.children.length,
      dist: Math.hypot(e.x - s.player.x, e.z - s.player.z),
      outside: Math.max(Math.abs(s.player.x), Math.abs(s.player.z)) > 106,
    };
  });
  expect(geometry.gate).toBe(true);
  expect(geometry.beam).toBe(true);
  expect(geometry.children).toBeGreaterThan(20);
  expect(geometry.outside).toBe(true);
  const bounds = await page.locator("#escape-guidance").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    page.viewportSize().width,
  );
  await page.screenshot({
    path: `test-results/v1.4-${info.project.name}-exit.png`,
    style: "#overlay{visibility:hidden}",
    timeout: 120000,
  });
  await page.locator("#start").click();
  await page.evaluate(() => {
    const s = window.__CHASE__.sim,
      e = s.escape.exit;
    Object.assign(s.player, {
      x: e.x - e.dx * 0.1,
      z: e.z - e.dz * 0.1,
      vx: e.dx * 24,
      vz: e.dz * 24,
      angle: Math.atan2(-e.dx, -e.dz),
      steering: 0,
      speed: 24,
    });
  });
  await expect(page.locator("#eyebrow")).toHaveText("ESCAPED!");
  expect(await page.evaluate(() => window.__CHASE__.sim.credits)).toBe(500);
  const time = await page.evaluate(() => window.__CHASE__.sim.elapsed);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__CHASE__.sim.elapsed)).toBe(time);
  expect(await page.evaluate(() => window.__CHASE__.sim.credits)).toBe(500);
  await page.locator("#start").click();
  expect(
    await page.evaluate(() => window.__CHASE__.sim.escape.exit.id),
  ).not.toBe(exitId);
  await expect(page.locator("#escape-guidance")).toBeHidden();
  expect(await page.evaluate(() => window.__CHASE__.sim.credits)).toBe(0);
  expect(errors).toEqual([]);
});
