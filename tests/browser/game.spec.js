import { test, expect } from "@playwright/test";
const open = async (page) => {
  await page.goto("/?debug");
  await expect(page.locator("#start")).toHaveText("START →");
};
const launch = async (page) => {
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await page.waitForFunction(() => window.__CHASE__.sim.elapsed > 0, null, {
    timeout: 45000,
  });
};
test("mission briefing freezes cars; keyboard/touch steering, pause, destruction and retry", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator("#mission-reward")).toContainText("500");
  const initial = await page.evaluate(() =>
    JSON.stringify([window.__CHASE__.sim.player, window.__CHASE__.sim.police]),
  );
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() =>
      JSON.stringify([
        window.__CHASE__.sim.player,
        window.__CHASE__.sim.police,
      ]),
    ),
  ).toBe(initial);
  expect(await page.evaluate(() => window.__CHASE__.sim.elapsed)).toBe(0);
  await expect(page.locator('[data-control="drift"]')).toHaveCount(0);
  await expect(page.locator(".instructions")).not.toContainText("SPACE");
  await launch(page);
  await expect
    .poll(() => page.evaluate(() => window.__CHASE__.sim.player.z), {
      timeout: 15000,
    })
    .toBeLessThan(8);
  if (info.project.name.includes("iphone")) {
    await expect(page.locator("#touch")).toBeVisible();
    await page.evaluate(() => {
      document
        .querySelector('[data-control="left"]')
        .addEventListener(
          "pointerdown",
          (e) =>
            (window.__trustedTouch = e.isTrusted && e.pointerType === "touch"),
          { once: true },
        );
    });
    await page.locator('[data-control="left"]').tap();
    expect(await page.evaluate(() => window.__trustedTouch)).toBe(true);
    expect(await page.evaluate(() => window.__CHASE__.input.left)).toBe(false);
    await page.evaluate(() =>
      document
        .querySelector('[data-control="left"]')
        .dispatchEvent(
          new PointerEvent("pointerdown", { pointerId: 11, bubbles: true }),
        ),
    );
    await page.waitForFunction(() => window.__CHASE__.sim.player.angle > 0.5);
    await page.evaluate(() =>
      document
        .querySelector('[data-control="left"]')
        .dispatchEvent(
          new PointerEvent("pointercancel", { pointerId: 11, bubbles: true }),
        ),
    );
    expect(await page.evaluate(() => window.__CHASE__.input.left)).toBe(false);
    await page.setViewportSize({ width: 844, height: 390 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 664 });
  } else {
    await page.keyboard.down("ArrowLeft");
    await page.waitForFunction(() => window.__CHASE__.sim.player.angle > 0.5);
    await page.keyboard.up("ArrowLeft");
    const angle = await page.evaluate(() => window.__CHASE__.sim.player.angle);
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(
      (previous) => window.__CHASE__.sim.player.angle < previous - 0.15,
      angle,
    );
    await page.keyboard.up("ArrowRight");
    expect(
      await page.evaluate(() => window.__CHASE__.sim.player.angle),
    ).toBeLessThan(angle);
    await page.keyboard.press("Space");
    expect(
      await page.evaluate(() => window.__CHASE__.input.drift),
    ).toBeUndefined();
  }
  expect(
    await page.evaluate(() => window.__CHASE__.sim.player.angle),
  ).toBeGreaterThan(0.1);
  await page.locator("#pause").click();
  expect(await page.evaluate(() => window.__CHASE__.state)).toBe("paused");
  const t = await page.evaluate(() => window.__CHASE__.sim.elapsed);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__CHASE__.sim.elapsed)).toBe(t);
  await launch(page);
  await page.evaluate(() => (window.__CHASE__.sim.health = 0));
  await expect(page.locator("#eyebrow")).toContainText("WRECKED");
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  expect(
    await page.evaluate(() => ({
      health: window.__CHASE__.sim.health,
      started: window.__CHASE__.sim.started,
      fresh: window.__CHASE__.sim.elapsed < 2,
    })),
  ).toEqual({ health: 100, started: true, fresh: true });
  expect(errors).toEqual([]);
});
test("survival opens escape without payout; final gate succeeds once and retry resets", async ({
  page,
}) => {
  await open(page);
  await launch(page);
  await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    s.police = [];
    s.reinforcementsEnabled = false;
    s.elapsed = 59.99;
  });
  await expect(page.locator("#notice")).toHaveText("ESCAPE ROUTE OPEN!");
  expect(await page.evaluate(() => window.__CHASE__.sim.result)).toBeNull();
  expect(await page.evaluate(() => window.__CHASE__.sim.credits)).toBe(0);
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
  await expect(page.locator("#message")).toContainText("500 크레딧");
  const result = await page.evaluate(() => ({
    t: window.__CHASE__.sim.elapsed,
    c: window.__CHASE__.sim.credits,
  }));
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => ({
      t: window.__CHASE__.sim.elapsed,
      c: window.__CHASE__.sim.credits,
    })),
  ).toEqual(result);
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  expect(await page.evaluate(() => window.__CHASE__.sim.credits)).toBe(0);
});
test("real building materials fade and restore; chain explosions render debris/fire/smoke, launch wrecks and respawn", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const report = await page.evaluate(() => {
    const r = window.__CHASE__.renderer,
      entry = r.buildings[0],
      b = entry.bounds;
    const camera = { x: b.x, y: b.h + 5, z: b.z + 20 },
      target = { x: b.x, z: b.z - 10 };
    for (let i = 0; i < 120; i++) r.occlusion.update(camera, target, 1 / 60);
    const faded = {
      opacity: entry.mesh.material.opacity,
      transparent: entry.mesh.material.transparent,
    };
    const other = r.buildings.find(
      (e) => Math.abs(e.bounds.x - b.x) > 40 && Math.abs(e.bounds.z - b.z) > 40,
    );
    const untouched = other.mesh.material.opacity;
    for (let i = 0; i < 120; i++)
      r.occlusion.update({ x: 200, y: 40, z: 200 }, { x: 210, z: 210 }, 1 / 60);
    return {
      faded,
      untouched,
      restored: entry.mesh.material.opacity,
      depthWrite: entry.mesh.material.depthWrite,
      colliderStillPresent: window.__CHASE__.sim.layout.buildings.includes(b),
    };
  });
  expect(report).toEqual({
    faded: { opacity: 0.35, transparent: true },
    untouched: 1,
    restored: 1,
    depthWrite: true,
    colliderStillPresent: true,
  });
  await launch(page);
  await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    for (let i = 0; i < 3; i++)
      Object.assign(s.police[i], {
        x: 0,
        z: s.player.z - 12 + i * 4,
        health: i === 0 ? 100 : 50,
        vx: 0,
        vz: 0,
      });
    Object.assign(s.police[3], { x: -60, z: 0 });
    s.explodePolice(s.police[0]);
  });
  // Observe a short-lived animation on the browser's frame clock, then freeze
  // that exact frame so software-rendering/host delays cannot miss the effect.
  await page.waitForFunction(
    () => {
      const { sim, renderer } = window.__CHASE__;
      if (
        renderer.effects.active.length === 3 &&
        sim.police[0].wreckAge >= 0.3 &&
        renderer.police.some((mesh) => mesh.position.y > 0)
      ) {
        document.querySelector("#pause").click();
        return true;
      }
      return false;
    },
    null,
    { polling: "raf", timeout: 45000 },
  );
  const effects = await page.evaluate(() => {
    const { sim, renderer } = window.__CHASE__;
    return {
      wrecks: sim.police.filter((c) => c.state === "wreck").length,
      kinds: [
        ...new Set(renderer.effects.active[0].parts.map((p) => p.kind)),
      ].sort(),
      launched: renderer.police.some((m) => m.position.y > 0),
      count: renderer.effects.active[0].group.children.length,
    };
  });
  expect(effects.wrecks).toBe(3);
  expect(effects.kinds).toEqual(["debris", "flame", "smoke"]);
  expect(effects.launched).toBe(true);
  expect(effects.count).toBeGreaterThan(30);
  await page.screenshot({
    path: `test-results/v1.1-${info.project.name}-explosions.png`,
    style: "#overlay{visibility:hidden}",
    timeout: 60000,
  });
  await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    s.player.x = 60;
    s.player.z = 60;
    for (const c of s.police) if (c.state === "wreck") c.wreckAge = 4.99;
    s.update(1 / 60, {});
    window.__CHASE__.renderer.render(s, 1 / 60);
  });
  expect(
    await page.evaluate(
      () =>
        window.__CHASE__.sim.police.filter((c) => c.state === "active").length,
    ),
  ).toBe(4);
  expect(
    await page.evaluate(
      () =>
        window.__CHASE__.sim.police.filter((c) => c.generation === 1).length,
    ),
  ).toBe(3);
  expect(errors).toEqual([]);
});
