import { test, expect } from "@playwright/test";
test("start, steering, drift, pause, game over and restart", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?debug");
  await expect(page.locator("#start")).toBeEnabled();
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__CHASE__.sim.player.z)).toBeLessThan(
    8,
  );
  if (info.project.name.includes("iphone")) {
    await expect(page.locator("#touch")).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('[data-control="left"]').addEventListener(
        "pointerdown",
        (e) => {
          window.__trustedTouch = e.isTrusted && e.pointerType === "touch";
        },
        { once: true },
      );
    });
    const touchButton = await page
      .locator('[data-control="left"]')
      .boundingBox();
    await page.touchscreen.tap(
      touchButton.x + touchButton.width / 2,
      touchButton.y + touchButton.height / 2,
    );
    expect(await page.evaluate(() => window.__trustedTouch)).toBe(true);
    expect(await page.evaluate(() => window.__CHASE__.input.left)).toBe(false);
    const result = await page.evaluate(() => {
      const left = document.querySelector('[data-control="left"]'),
        drift = document.querySelector('[data-control="drift"]');
      left.dispatchEvent(
        new PointerEvent("pointerdown", { pointerId: 11, bubbles: true }),
      );
      drift.dispatchEvent(
        new PointerEvent("pointerdown", { pointerId: 12, bubbles: true }),
      );
      return {
        left: window.__CHASE__.input.left,
        drift: window.__CHASE__.input.drift,
      };
    });
    expect(result).toEqual({ left: true, drift: true });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      for (const [control, id] of [
        ["left", 11],
        ["drift", 12],
      ])
        document
          .querySelector(`[data-control="${control}"]`)
          .dispatchEvent(
            new PointerEvent("pointerup", { pointerId: id, bubbles: true }),
          );
    });
    expect(await page.evaluate(() => window.__CHASE__.input.drift)).toBe(false);
    await page.setViewportSize({ width: 844, height: 390 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 664 });
  } else {
    await page.keyboard.down("ArrowLeft");
    await page.keyboard.down("Space");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("Space");
  }
  expect(
    await page.evaluate(() => window.__CHASE__.sim.player.angle),
  ).toBeGreaterThan(0.1);
  await page.locator("#pause").click();
  expect(await page.evaluate(() => window.__CHASE__.state)).toBe("paused");
  const t = await page.evaluate(() => window.__CHASE__.sim.elapsed);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__CHASE__.sim.elapsed)).toBe(t);
  await page.locator("#start").click();
  await page.evaluate(() => (window.__CHASE__.sim.health = 0));
  await expect(page.locator("#eyebrow")).toContainText("WRECKED");
  await page.locator("#start").click();
  expect(await page.evaluate(() => window.__CHASE__.sim.health)).toBe(100);
  await page.locator("#pause").click();
  await page.screenshot({
    timeout: 60000,
    path: `test-results/${info.project.name}.png`,
  });
  expect(errors).toEqual([]);
});
