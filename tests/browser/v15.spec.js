import { test, expect } from "@playwright/test";
test("real cordon produces BUSTED, releases no explosions, stops sound and restarts; destruction is WRECKED", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?debug");
  await page.locator("#start").click();
  const before = await page.evaluate(async () => {
    const { makePolice } = await import("/src/game/police.js");
    const s = window.__CHASE__.sim;
    s.reinforcementsEnabled = false;
    s.barricadesEnabled = false;
    s.reset();
    s.start();
    Object.assign(s.player, { x: 0, z: 0, vx: 0, vz: 0, speed: 0 });
    s.police = Array.from({ length: 4 }, (_, i) =>
      Object.assign(makePolice(i), {
        x: Math.sin((i * Math.PI) / 2) * 3.4,
        z: Math.cos((i * Math.PI) / 2) * 3.4,
        angle: (i * Math.PI) / 2,
      }),
    );
    for (let i = 0; i < 174; i++) s.update(1 / 60);
    return { arrest: s.arrest, result: s.result };
  });
  expect(before.result).toBeNull();
  expect(before.arrest).toBeGreaterThan(2.7);
  await expect(page.locator("#eyebrow")).toHaveText("BUSTED!", {
    timeout: 45000,
  });
  await expect(page.locator("#title")).toHaveText("경찰에게 체포됨");
  await expect(page.locator("#start")).toHaveText("RESTART →");
  const captured = await page.evaluate(() => {
    const { sim: s, audio: a } = window.__CHASE__;
    return {
      explosions: s.events.length,
      health: s.police.map((c) => c.health),
      time: s.elapsed,
      running: a.running,
      run: s.runNumber,
    };
  });
  expect(captured.explosions).toBe(0);
  expect(captured.health).toEqual([100, 100, 100, 100]);
  expect(captured.running).toBe(false);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__CHASE__.sim.elapsed)).toBe(
    captured.time,
  );
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await page.waitForFunction(
    (previous) =>
      window.__CHASE__.state === "running" &&
      window.__CHASE__.sim.runNumber > previous &&
      window.__CHASE__.sim.elapsed > 0,
    captured.run,
    { timeout: 45000 },
  );
  expect(await page.evaluate(() => window.__CHASE__.sim.started)).toBe(true);
  await page.evaluate(() => (window.__CHASE__.sim.health = 0));
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!", {
    timeout: 45000,
  });
  await expect(page.locator("#title")).toHaveText("차량 파괴");
  expect(await page.evaluate(() => window.__CHASE__.audio.running)).toBe(false);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Math.max(
            ...Object.values(window.__CHASE__.audio.loops).map(
              (l) => l.gain.gain.value,
            ),
          ),
        ),
      { timeout: 15000 },
    )
    .toBeLessThan(0.00001);
  expect(errors).toEqual([]);
});
test("yellow full roadblock and persistent burned body/fire/smoke/debris render after eight seconds and reset", async ({
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
  await page.locator("#pause").click();
  const measured = await page.evaluate(async () => {
    const { makePolice } = await import("/src/game/police.js");
    const { updateWrecks } = await import("/src/game/wrecks.js");
    const { planBarricade } = await import("/src/game/barricades.js");
    const { sim: s, renderer: r } = window.__CHASE__;
    s.reinforcementsEnabled = false;
    s.barricadesEnabled = false;
    s.reset();
    s.start();
    r.reset();
    s.police = [Object.assign(makePolice(0), { x: 0, z: -8, angle: 0.3 })];
    s.explodePolice(s.police[0]);
    s.elapsed = 8;
    s.police[0].wreckAge = 8;
    updateWrecks(s);
    const b = planBarricade(s.player, s.navigation, s.staticSolids, [], [], 1);
    s.barricades = [b];
    s.refreshNavigation();
    r.cameraRig.follow.set(s.player.x, 0, s.player.z);
    r.render(s, 0.1, false);
    const slot = r.wreckRenderer.pool.find((v) => v.group.visible),
      smoke = slot.smoke.map((m) => m.position.y);
    s.elapsed = 9;
    s.mission.progress = 9;
    r.render(s, 0.1, false);
    const barrier = r.roadEvents.barriers[0];
    return {
      body: slot.group.visible,
      age: s.elapsed - s.wrecks[0].born,
      flames: slot.flames.filter((m) => m.visible).length,
      smoke: slot.smoke.length,
      animated: slot.smoke.some((m, i) => m.position.y !== smoke[i]),
      fragments: slot.group.children.filter((m) => m.position.y < 0.3).length,
      solid: s.navigation.solids.includes(s.wrecks[0]),
      pool: r.wreckRenderer.pool.length,
      yellow: barrier.children[0].material.color.getHex(),
      width: barrier.children[0].geometry.parameters.width,
      striped: barrier.children.some(
        (m) =>
          m.material.color.getHex() === 0x101820 &&
          Math.abs(m.rotation.z) > 0.3,
      ),
      detour: b.detour.length,
    };
  });
  expect(measured).toMatchObject({
    body: true,
    age: 9,
    flames: 3,
    smoke: 4,
    animated: true,
    solid: true,
    yellow: 0xffd500,
    width: 11.2,
    striped: true,
    pool: 24,
  });
  expect(measured.fragments).toBeGreaterThanOrEqual(4);
  expect(measured.detour).toBeGreaterThanOrEqual(4);
  await page.screenshot({
    path: `test-results/v1.5-${info.project.name}-wreck-roadblock.png`,
    style: "#overlay{visibility:hidden}",
    timeout: 120000,
  });
  await page.evaluate(() => {
    const { sim: s, renderer: r } = window.__CHASE__;
    s.reset();
    r.reset();
    r.render(s, 0, false);
  });
  expect(await page.evaluate(() => window.__CHASE__.sim.wrecks.length)).toBe(0);
  expect(
    await page.evaluate(() =>
      window.__CHASE__.renderer.wreckRenderer.pool.every(
        (p) => !p.group.visible,
      ),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
