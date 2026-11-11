import test from "node:test";
import assert from "node:assert/strict";
import { SoundSystem, soundTargets } from "../src/audio/sound.js";
const sim = {
  player: { x: 0, z: 0, vx: 0, vz: -24, angle: 0, turn: 0 },
  police: [{ state: "active", x: 0, z: 10 }],
};
test("distance attenuates siren; speed pitches engine; hard turns trigger skid", () => {
  const near = soundTargets(sim),
    far = soundTargets({ ...sim, police: [{ state: "active", x: 0, z: 80 }] });
  assert.ok(near.sirenGain > far.sirenGain);
  assert.equal(far.sirenGain, 0);
  const idle = soundTargets({ ...sim, player: { ...sim.player, vz: 0 } });
  assert.ok(near.engineHz > idle.engineHz);
  assert.equal(near.skidGain, 0);
  assert.ok(
    soundTargets({ ...sim, player: { ...sim.player, turn: 2.15 } }).skidGain >
      0,
  );
  assert.equal(
    soundTargets({ ...sim, police: [{ state: "wreck", x: 0, z: 0 }] })
      .sirenGain,
    0,
  );
});
test("audio context is lazy and unavailable/failed initialization cannot break the game", async () => {
  let created = 0;
  const sound = new SoundSystem(() => {
    created++;
    return null;
  });
  assert.equal(created, 0);
  assert.equal(sound.muted, false);
  assert.equal(await sound.unlock(), false);
  assert.equal(created, 1);
  sound.setRunning(true);
  sound.update(sim);
  sound.setRunning(false);
  sound.finish(false);
  sound.setMuted(true);
  sound.reset();
  const broken = new SoundSystem(() => ({
    resume() {
      return Promise.reject(Error("blocked"));
    },
    createGain() {
      throw Error("unsupported");
    },
  }));
  assert.equal(await broken.unlock(), false);
  assert.doesNotThrow(() => {
    broken.setRunning(false);
    broken.setMuted(true);
    broken.finish(true);
  });
});
