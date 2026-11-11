import { test, expect } from "@playwright/test";
const open = async (page) => {
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await page.goto("/?debug");
  await page.waitForFunction(() => !!window.__CHASE__);
};
test("rendered pixels reveal the whole car through complete building geometry and restore", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await open(page);
  const result = await page.evaluate(async () => {
    const { renderer: r, sim } = window.__CHASE__;

    // Use the actual scene meshes and production camera, including an initially
    // opaque compiled shader. Read the GPU framebuffer, not just opacity fields.
    r.reset();
    sim.player.x = 0;
    sim.player.z = 8;
    r.render(sim, 0);
    const shadowAutoUpdate = r.renderer.shadowMap.autoUpdate;
    r.renderer.shadowMap.autoUpdate = false;
    const oldAspect = r.camera.aspect;
    r.camera.aspect = 640 / 480;
    r.camera.updateProjectionMatrix();
    const snapshot = () => r.captureFrame(480, 360);
    const contribution = () => {
      r.player.visible = true;
      const withCar = snapshot();
      r.player.visible = false;
      const withoutCar = snapshot();
      r.player.visible = true;
      let pixels = 0,
        energy = 0;
      for (let i = 0; i < withCar.length; i += 4) {
        const delta =
          Math.abs(withCar[i] - withoutCar[i]) +
          Math.abs(withCar[i + 1] - withoutCar[i + 1]) +
          Math.abs(withCar[i + 2] - withoutCar[i + 2]);
        if (delta > 12) {
          pixels++;
          energy += delta;
        }
      }
      return { pixels, energy };
    };
    r.player.traverse((mesh) => {
      if (mesh.isMesh) mesh.castShadow = false;
    });
    r.occlusion.reset();
    const opaque = contribution();
    // Negative control reproduces V1.1: change blend/opacity without invalidating
    // the already compiled OPAQUE shader. GPU pixels should remain occluded.
    r.occlusion.update(r.camera.position, sim.player, 0);
    const blockers = r.buildings.filter((e) => e.occluded);
    for (const e of blockers) {
      e.mesh.material.transparent = true;
      e.mesh.material.opacity = 0.35;
      e.mesh.material.depthWrite = false;
    }
    const legacyFaded = contribution();
    for (const e of blockers) {
      e.mesh.material.transparent = false;
      e.mesh.material.opacity = 1;
      e.mesh.material.depthWrite = true;
    }

    for (let i = 0; i < 90; i++)
      r.occlusion.update(r.camera.position, sim.player, 1 / 60);
    const entries = r.buildings.filter((e) => e.occluded);
    const faded = contribution();
    const opacities = entries.map((e) => e.mesh.material.opacity);
    const components = entries.map((e) => e.mesh.userData.components);
    // A known clear line must restore every affected part and its shader variant.
    for (let i = 0; i < 90; i++)
      r.occlusion.update({ x: 220, y: 50, z: 220 }, { x: 225, z: 225 }, 1 / 60);
    const restored = contribution();
    const restoredMaterials = entries.every(
      (e) => e.mesh.material.opacity === 1 && !e.mesh.material.transparent,
    );
    r.renderer.shadowMap.autoUpdate = shadowAutoUpdate;
    r.renderer.setRenderTarget(null);
    r.camera.aspect = oldAspect;
    r.camera.updateProjectionMatrix();

    r.player.visible = true;
    return {
      opaque,
      legacyFaded,
      faded,
      restored,
      opacities,
      components,
      restoredMaterials,
      colliders: sim.layout.buildings.length,
    };
  });
  expect(result.opacities.length).toBeGreaterThan(0);
  expect(result.opacities.every((a) => a >= 0.25 && a <= 0.35)).toBe(true);
  expect(
    result.components.every((c) =>
      ["body", "roof", "windows", "sign"].every((part) => c.includes(part)),
    ),
  ).toBe(true);
  expect(result.legacyFaded.pixels).toBe(result.opaque.pixels);
  expect(result.faded.pixels).toBeGreaterThan(result.opaque.pixels + 8);
  expect(result.faded.energy).toBeGreaterThan(result.opaque.energy + 200);
  expect(result.restored.pixels).toBe(result.opaque.pixels);
  expect(result.restoredMaterials).toBe(true);
  expect(result.colliders).toBeGreaterThan(100);
  await test.info().attach("framebuffer-measurements", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  // Leave the ordinary live scene in the same occluded pose for visual review.
  await page.evaluate(() => {
    const { renderer: r, sim } = window.__CHASE__;
    r.reset();
    for (let i = 0; i < 90; i++)
      r.occlusion.update(r.camera.position, sim.player, 1 / 60);
    r.renderer.render(r.scene, r.camera);
  });
  await page.screenshot({
    path: `test-results/v1.2-${info.project.name}-occlusion.png`,
    style: "#overlay{visibility:hidden}",
    timeout: 60000,
  });
});
test("real Web Audio unlock, engine/siren/skid, mute, pause and UI sounds", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  expect(await page.evaluate(() => window.__CHASE__.audio.context)).toBeNull();
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#start").click();
  await page.waitForFunction(
    () => window.__CHASE__.audio.context?.state === "running",
  );
  await page.waitForFunction(() => !!window.__CHASE__.audio.lastTargets);
  const params = await page.evaluate(() => {
    const { audio, sim } = window.__CHASE__;
    return {
      loops: Object.keys(audio.loops).sort(),
      pitch: audio.lastTargets.engineHz,
      compressor: audio.compressor.ratio.value,
      master: audio.master.gain.value,
    };
  });
  expect(params.loops).toEqual(["engine", "siren", "skid"]);
  expect(params.pitch).toBeGreaterThan(45);
  expect(params.compressor).toBeGreaterThanOrEqual(10);
  expect(params.master).toBeLessThanOrEqual(0.5);
  await page.evaluate(() => {
    const a = window.__CHASE__.audio;
    const analyser = a.context.createAnalyser();
    analyser.fftSize = 2048;
    a.master.connect(analyser);
    window.__soundAnalyser = analyser;
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = new Float32Array(2048);
        window.__soundAnalyser.getFloatTimeDomainData(data);
        return data.reduce((sum, n) => sum + n * n, 0);
      }),
    )
    .toBeGreaterThan(0.000001);
  await page.locator("#mute").click();
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.evaluate(() => window.__CHASE__.audio.master.gain.value))
    .toBeLessThan(0.00001);
  await page.locator("#mute").click();
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    const a = window.__CHASE__.audio;
    for (let i = 0; i < 40; i++) {
      a.voice("collision", 1);
      a.voice("explosion", 1);
    }
    window.__peakVoices = a.voices.size;
  });
  expect(await page.evaluate(() => window.__peakVoices)).toBeLessThanOrEqual(6);
  await page.locator("#pause").click();
  expect(await page.evaluate(() => window.__CHASE__.audio.running)).toBe(false);
  expect(await page.evaluate(() => window.__CHASE__.audio.voices.size)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.max(
          ...Object.values(window.__CHASE__.audio.loops).map(
            (l) => l.gain.gain.value,
          ),
        ),
      ),
    )
    .toBeLessThan(0.00001);
  await page.locator("#start").click();
  await page.evaluate(() => (window.__CHASE__.sim.health = 0));
  await expect(page.locator("#eyebrow")).toContainText("WRECKED");
  expect(await page.evaluate(() => window.__CHASE__.audio.running)).toBe(false);
  await expect
    .poll(() => page.evaluate(() => window.__CHASE__.audio.voices.size), {
      timeout: 10000,
    })
    .toBe(0);
  const successNotes = await page.evaluate(() => {
    const a = window.__CHASE__.audio;
    a.finish(true);
    const notes = [...a.voices].map((v) => v.source.frequency?.value);
    a.setRunning(false);
    return notes;
  });
  expect(successNotes).toEqual([523, 659, 784]);
  expect(errors).toEqual([]);
});
test("unavailable Web Audio leaves START, pause and gameplay working", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: undefined,
      configurable: true,
    });
  });
  await open(page);
  await page.locator("#start").click();
  await page.waitForFunction(() => window.__CHASE__.sim.elapsed > 0);
  expect(await page.evaluate(() => window.__CHASE__.audio.available)).toBe(
    false,
  );
  await page.locator("#pause").click();
  expect(await page.evaluate(() => window.__CHASE__.state)).toBe("paused");
  await page.locator("#mute").click();
  await page.locator("#start").click();
  expect(await page.evaluate(() => window.__CHASE__.state)).toBe("running");
});

test("HUD sound and pause buttons fit phone viewports with fallback fonts", async ({
  page,
}) => {
  await open(page);
  for (const width of [320, 375, 390, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 700 });
    const bounds = await page.evaluate(() =>
      ["#mute", "#pause"].map((selector) => {
        const b = document.querySelector(selector).getBoundingClientRect();
        return {
          left: b.left,
          right: b.right,
          top: b.top,
          bottom: b.bottom,
          width: innerWidth,
          height: innerHeight,
        };
      }),
    );
    for (const b of bounds) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(b.width);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(b.height);
    }
  }
});
