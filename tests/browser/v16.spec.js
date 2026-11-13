import { test, expect } from "@playwright/test";
// These checks run in both engines. The first uses the normal native frame
// loop and legal inputs only; no stepping, police placement or health edits.
async function screenshot(page, info, name, hideOverlay = true) {
  await page.evaluate(() => {
    const { sim: s, renderer: r } = window.__CHASE__;
    r.renderer.setPixelRatio(1);
    r.renderer.setSize(innerWidth, innerHeight);
    r.renderer.shadowMap.needsUpdate = true;
    r.render(s, 0, false);
  });
  await page.screenshot({
    path: `test-results/v1.7-${info.project.name}-${name}.png`,
    style: hideOverlay ? "#overlay{visibility:hidden}" : "",
    timeout: 120000,
  });
  await page.evaluate(() => {
    const r = window.__CHASE__.renderer;
    r.renderer.setPixelRatio(0.5);
    r.renderer.setSize(innerWidth, innerHeight);
  });
}
test("normal START, native frames and legal steering: AI cordon progresses from zero to BUSTED without containment explosions", async ({
  page,
}, info) => {
  test.setTimeout(600000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await page.goto("/?debug");
  const initial = await page.evaluate(async () => {
    const { normalCordonControls, cordonSample } =
      await import("/scripts/reproduce-v16.js");
    const { sim: s, input, renderer: r } = window.__CHASE__;
    Object.defineProperty(input, "right", {
      configurable: true,
      get() {
        return (
          window.__CHASE__.state === "running" &&
          normalCordonControls(
            s.elapsed - 1 / 60,
            innerWidth < 700 ? "mobile" : "desktop",
          ).right
        );
      },
      set() {},
    });
    r.renderer.setPixelRatio(0.5);
    r.renderer.setSize(innerWidth, innerHeight);
    r.renderer.shadowMap.autoUpdate = false;
    window.__cordonTimeline = [cordonSample(s)];
    window.__lastCordonSample = -1;
    const observe = () => {
      const tick = Math.floor(s.elapsed * 5);
      if (tick !== window.__lastCordonSample || s.result) {
        if (
          tick !== window.__lastCordonSample ||
          window.__cordonTimeline.at(-1).result !== s.result
        )
          window.__cordonTimeline.push(cordonSample(s));
        window.__lastCordonSample = tick;
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
    return {
      player: { x: s.player.x, z: s.player.z },
      police: s.police.map((c) => ({ id: c.id, x: c.x, z: c.z })),
      started: s.started,
    };
  });
  expect(initial.started).toBe(false);
  expect(initial.player).toEqual({ x: 0, z: 8 });
  expect(initial.police.map((c) => [c.x, c.z])).toEqual([
    [-3, 30],
    [3, 39],
    [-3, 48],
    [3, 57],
  ]);
  await page.locator("#start").click();
  const stages = [];
  for (const [threshold, name] of [
    [0.05, "contact"],
    [1.5, "arrest-50"],
    [2.7, "arrest-90"],
  ]) {
    await page.waitForFunction(
      (value) => {
        const { sim: s } = window.__CHASE__;
        if (s.arrest >= value && window.__CHASE__.state === "running") {
          document.querySelector("#pause").click();
          return true;
        }
        if (s.result)
          throw Error(`Unexpected result before milestone: ${s.result}`);
        return false;
      },
      threshold,
      { polling: "raf", timeout: 300000 },
    );
    stages.push(
      await page.evaluate(() => ({
        time: window.__CHASE__.sim.elapsed,
        arrest: window.__CHASE__.sim.arrest,
        percent: document.querySelector("#arrest-bar").style.width,
        police: window.__CHASE__.sim.enclosure.nearby,
        explosions: window.__CHASE__.sim.stats.explosions,
      })),
    );
    await screenshot(page, info, name);
    await page.locator("#start").click();
  }
  await expect(page.locator("#eyebrow")).toHaveText("BUSTED!", {
    timeout: 90000,
  });
  await expect(page.locator("#title")).toHaveText("경찰에게 체포됨");
  const proof = await page.evaluate(() => ({
    result: window.__CHASE__.sim.result,
    state: window.__CHASE__.state,
    arrest: window.__CHASE__.sim.arrest,
    time: window.__CHASE__.sim.elapsed,
    explosions: window.__CHASE__.sim.stats.explosions,
    timeline: window.__cordonTimeline,
    soundRunning: window.__CHASE__.audio.running,
  }));
  expect(proof.arrest).toBe(3);
  expect(proof.result).toBe("arrested");
  const lastZero = proof.timeline.findLastIndex((r) => r.arrest < 0.05);
  const captureWindow = proof.timeline.slice(lastZero + 1);
  expect(captureWindow.length).toBeGreaterThan(5);
  expect(captureWindow.every((r) => r.explosions === proof.explosions)).toBe(
    true,
  );
  expect(proof.soundRunning).toBe(false);
  expect(
    proof.timeline.some(
      (r) =>
        r.trapped &&
        r.nearby >= 3 &&
        r.nearby <= 4 &&
        r.groundSpeed > 3 &&
        r.arrest > 0,
    ),
  ).toBe(true);
  expect(stages[0].arrest).toBeLessThan(stages[1].arrest);
  expect(stages[1].arrest).toBeLessThan(stages[2].arrest);
  await screenshot(page, info, "busted", false);
  await test.info().attach("normal-cordon-time-record", {
    body: JSON.stringify(
      {
        method:
          "Native requestAnimationFrame/normal START; legal project-specific right steering (desktop after five seconds, mobile from START). No simulation stepping, police placement, health, speed, mission or reinforcement edits. Internal rendering resolution reduced while running; screenshots at device-independent 1x resolution.",
        initial,
        stages,
        ...proof,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
test("permanent collision wreck/fire at 30 and 60 seconds, offscreen return, growth beyond cap, result freeze and restart", async ({
  page,
}, info) => {
  test.setTimeout(600000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await page.goto("/?debug");
  await page.locator("#start").click();
  await page.locator("#pause").click();
  await page.evaluate(async () => {
    const { makePolice, collidePolice } = await import("/src/game/police.js");
    const { sim: s, renderer: r } = window.__CHASE__;
    // Isolated collision fixture for long-duration fire; the normal-AI arrest
    // scenario above does not make any of these changes.
    s.reinforcementsEnabled = false;
    s.barricadesEnabled = false;
    s.police = [];
    const a = makePolice(100),
      b = makePolice(101);
    for (let i = 0; i < 2; i++) {
      Object.assign(a, { x: 0, z: -8, vx: 20, vz: 0, pairCooldown: 0 });
      Object.assign(b, { x: 2, z: -8, vx: -20, vz: 0, pairCooldown: 0 });
      collidePolice(a, b);
    }
    if (a.health !== 0 || b.health !== 0)
      throw Error("Collision fixture did not destroy officers");
    s.police = [a, b];
    s.explodePolice(a);
    window.__originalWreck = s.wrecks[0];
    window.__originalPose = {
      id: s.wrecks[0].id,
      x: s.wrecks[0].x,
      z: s.wrecks[0].z,
    };
    window.__persistenceRecords = [];
    r.renderer.setPixelRatio(0.5);
    r.renderer.setSize(innerWidth, innerHeight);
    r.renderer.shadowMap.autoUpdate = false;
  });
  const advance = async (age) =>
    page.evaluate((target) => {
      const { sim: s, renderer: r } = window.__CHASE__,
        w = window.__originalWreck;
      while (s.elapsed - w.born < target && !s.result)
        s.update(1 / 60, { left: true });
      if (s.result) throw Error(`Unexpected fixture game over: ${s.result}`);
      r.cameraRig.follow.set(w.x, 0, w.z);
      r.render(s, 0, false);
      const slot = r.wreckRenderer.slots.get(w.id);
      const record = {
        time: s.elapsed,
        age: s.elapsed - w.born,
        id: w.id,
        x: w.x,
        z: w.z,
        sameData: s.wrecks[0] === w,
        solid: s.navigation.solids.includes(w),
        visible: slot?.group.visible,
        flames: slot?.flames.length,
        smoke: slot?.smoke.length,
        smokeY: slot?.smoke.map((m) => m.position.y),
        count: s.wrecks.length,
      };
      window.__persistenceRecords.push(record);
      return record;
    }, age);
  const a = await advance(1);
  const respawn = await page.evaluate(() => {
    const s = window.__CHASE__.sim,
      w = window.__originalWreck;
    while (s.elapsed - w.born < 6.1 && !s.result)
      s.update(1 / 60, { left: true });
    const proof = {
      time: s.elapsed,
      age: s.elapsed - w.born,
      generations: s.police.map((c) => c.generation),
      sameData: s.wrecks[0] === w,
      count: s.wrecks.length,
    };
    s.police = []; // isolate long-duration persistence after verifying real reinsertion
    return proof;
  });
  expect(respawn.generations.every((g) => g >= 1)).toBe(true);
  expect(respawn.sameData).toBe(true);
  const b = await advance(30);
  await screenshot(page, info, "wreck-30");
  const c = await advance(60);
  await screenshot(page, info, "wreck-60");
  expect(a.sameData && b.sameData && c.sameData).toBe(true);
  expect(b.visible && c.visible && b.solid && c.solid).toBe(true);
  expect(b.flames).toBe(3);
  expect(c.smoke).toBe(4);
  expect(c.smokeY).not.toEqual(a.smokeY);
  const away = await page.evaluate(() => {
    const { sim: s, renderer: r } = window.__CHASE__;
    r.cameraRig.follow.set(200, 0, 200);
    r.render(s, 0, false);
    return {
      visible: r.wreckRenderer.slots.get(window.__originalWreck.id).group
        .visible,
      same: s.wrecks[0] === window.__originalWreck,
      count: s.wrecks.length,
    };
  });
  expect(away.visible).toBe(false);
  expect(away.same).toBe(true);
  await screenshot(page, info, "wreck-offscreen");
  const returned = await advance(61);
  expect(returned.visible).toBe(true);
  expect(returned.id).toBe(a.id);
  const growth = await page.evaluate(async () => {
    const { makePolice } = await import("/src/game/police.js");
    const { sim: s, renderer: r } = window.__CHASE__,
      first = window.__originalWreck,
      slot = r.wreckRenderer.slots.get(first.id);
    for (let i = 0; i < 40; i++) {
      const car = Object.assign(makePolice(200 + i), {
        x: -90 + (i % 7) * 30,
        z: -90 + Math.floor(i / 7) * 30,
        health: 0,
      });
      s.explodePolice(car);
    }
    while (s.elapsed - first.born < 62.2) s.update(1 / 60, { left: true });
    // Visit each wreck with the observer camera; data/cars never move for culling.
    for (const w of s.wrecks) {
      r.cameraRig.follow.set(w.x, 0, w.z);
      r.cameraRig.update(s.player, 0);
      r.wreckRenderer.update(s, r.camera);
    }
    r.cameraRig.follow.set(first.x, 0, first.z);
    r.render(s, 0, false);
    return {
      count: s.wrecks.length,
      slots: r.wreckRenderer.slots.size,
      pool: r.wreckRenderer.pool.length,
      sameData: s.wrecks[0] === first,
      sameSlot: r.wreckRenderer.slots.get(first.id) === slot,
      pose: { id: first.id, x: first.x, z: first.z },
      visible: slot.group.visible,
      age: s.elapsed - first.born,
    };
  });
  expect(growth.count).toBeGreaterThan(40);
  expect(growth.pool).toBeGreaterThan(24);
  expect(growth.slots).toBe(growth.count);
  expect(growth.sameData && growth.sameSlot && growth.visible).toBe(true);
  expect(growth.pose).toEqual({ id: a.id, x: a.x, z: a.z });
  await screenshot(page, info, "wreck-return-expanded");
  await page.evaluate(() => (window.__CHASE__.sim.health = 0));
  await page.locator("#start").click();
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!", {
    timeout: 45000,
  });
  const frozen = await page.evaluate(() => ({
    time: window.__CHASE__.sim.elapsed,
    count: window.__CHASE__.sim.wrecks.length,
    smoke: window.__CHASE__.renderer.wreckRenderer.slots
      .get(window.__originalWreck.id)
      .smoke.map((m) => m.position.y),
  }));
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => ({
      time: window.__CHASE__.sim.elapsed,
      count: window.__CHASE__.sim.wrecks.length,
      smoke: window.__CHASE__.renderer.wreckRenderer.slots
        .get(window.__originalWreck.id)
        .smoke.map((m) => m.position.y),
    })),
  ).toEqual(frozen);
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  expect(await page.evaluate(() => window.__CHASE__.sim.wrecks.length)).toBe(0);
  expect(
    await page.evaluate(
      () => window.__CHASE__.renderer.wreckRenderer.slots.size,
    ),
  ).toBe(0);
  await test.info().attach("permanent-wreck-time-record", {
    body: JSON.stringify(
      {
        method:
          "Collision/health fixture for initial explosion; fixed 60Hz simulation updates for age 1/30/60/61/62 seconds, no elapsed-time assignments. Two officers naturally respawn first; empty police fixture then isolates long-duration persistence. Forty further explosion fixtures exercise old-cap overflow. Observer camera only moves; wreck positions are unchanged.",
        records: [a, b, c, returned],
        away,
        respawn,
        growth,
        frozen,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
