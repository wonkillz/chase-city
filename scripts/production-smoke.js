import { chromium, webkit, devices, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
// Run against npm run preview, never the development server.
const baseURL = process.argv[2] || "http://127.0.0.1:4173";
const results = [];
for (const [name, engine, options] of [
  ["desktop-chromium", chromium, { viewport: { width: 1100, height: 740 } }],
  ["iphone-webkit", webkit, { ...devices["iPhone 13"] }],
]) {
  const browser = await engine.launch(
    name === "desktop-chromium"
      ? {
          args: [
            "--no-sandbox",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {},
  );
  try {
    const context = await browser.newContext(options),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(baseURL + "/?debug");
    await expect(page).toHaveTitle(/CHASE CITY V1\.8/);
    expect(await page.evaluate(() => window.__CHASE__ === undefined)).toBe(
      true,
    );
    await expect(page.locator("#eyebrow")).toHaveText(
      "MISSION BRIEFING / V1.8",
    );
    await page.locator("#start").click();
    await expect(page.locator("#overlay")).toBeHidden();
    await page.waitForFunction(
      () => document.querySelector("#time").textContent !== "00:00",
      null,
      { timeout: 60000 },
    );
    await page.locator("#mute").click();
    await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#pause").click();
    await expect(page.locator("#overlay")).toBeVisible();
    const time = await page.locator("#time").textContent();
    await page.waitForTimeout(350);
    expect(await page.locator("#time").textContent()).toBe(time);
    await page.locator("#start").click();
    await expect(page.locator("#overlay")).toBeHidden();
    expect(errors).toEqual([]);
    results.push({
      name,
      title: await page.title(),
      startAndTimer: true,
      mute: true,
      pauseFreezesTimer: true,
      resume: true,
      developmentHookExcluded: true,
      pageErrors: errors,
    });
  } finally {
    await browser.close();
  }
}
await writeFile(
  "docs/production-smoke-v1.8.json",
  JSON.stringify({ version: "1.8", baseURL, results }, null, 2) + "\n",
);
console.log(JSON.stringify(results, null, 2));
