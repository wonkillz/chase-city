import { clamp } from "../game/config.js";
export function soundTargets(sim) {
  const p = sim.player,
    speed = Math.hypot(p.vx, p.vz);
  const lateral = Math.abs(p.vx * Math.cos(p.angle) - p.vz * Math.sin(p.angle));
  const nearest = Math.min(
    200,
    ...sim.police
      .filter((c) => c.state === "active")
      .map((c) => Math.hypot(c.x - p.x, c.z - p.z)),
  );
  return {
    engineHz: 45 + speed * 6,
    engineGain: 0.012 + clamp(speed / 24, 0, 1) * 0.035,
    sirenGain: 0.06 * Math.pow(clamp(1 - nearest / 75, 0, 1), 2),
    skidGain:
      0.045 *
      clamp(((Math.abs(p.turn) * speed) / 24 + lateral * 0.2 - 0.8) / 2, 0, 1),
  };
}
// All sounds are synthesized locally. No samples, network assets or autoplay.
export class SoundSystem {
  constructor(
    factory = () => {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Audio ? new Audio() : null;
    },
  ) {
    this.factory = factory;
    this.context = null;
    this.muted = false;
    this.running = false;
    this.available = true;
    this.voices = new Set();
    this.lastExplosion = 0;
    this.lastImpact = 0;
    this.cooldowns = {};
    this.lastTargets = null;
  }
  unlock() {
    try {
      if (!this.context) {
        const context = this.factory();
        if (!context) {
          this.available = false;
          return Promise.resolve(false);
        }
        this.context = context;
        this.build();
      }
      // Called directly within START/resume/mute user gestures, including Safari.
      return Promise.resolve(this.context.resume())
        .then(() => true)
        .catch(() => {
          this.available = false;
          return false;
        });
    } catch {
      this.available = false;
      return Promise.resolve(false);
    }
  }
  build() {
    const c = this.context;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.45;
    this.compressor = c.createDynamicsCompressor();
    Object.assign(this.compressor.threshold, { value: -12 });
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    this.compressor.connect(this.master);
    this.master.connect(c.destination);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = this.noise.getChannelData(0);
    let n = 12345;
    for (let i = 0; i < data.length; i++) {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      data[i] = n / 2147483648 - 1;
    }
    this.loops = {};
    for (const name of ["engine", "siren", "skid"]) {
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.connect(this.compressor);
      const filter = c.createBiquadFilter();
      filter.type = name === "skid" ? "bandpass" : "lowpass";
      filter.frequency.value =
        name === "skid" ? 1700 : name === "engine" ? 500 : 1800;
      filter.Q.value = 0.7;
      filter.connect(gain);
      let source;
      if (name === "skid") {
        source = c.createBufferSource();
        source.buffer = this.noise;
        source.loop = true;
      } else {
        source = c.createOscillator();
        source.type = name === "engine" ? "sawtooth" : "sine";
        source.frequency.value = name === "engine" ? 45 : 650;
      }
      source.connect(filter);
      source.start();
      this.loops[name] = { source, gain, filter };
    }
  }
  parameter(param, value, time = 0.04) {
    param.setTargetAtTime(value, this.context.currentTime, time);
  }
  setMuted(value) {
    this.muted = value;
    if (this.master) this.parameter(this.master.gain, value ? 0 : 0.45, 0.015);
    if (value) this.stopVoices();
  }
  setRunning(value) {
    this.running = value;
    if (!value && this.context) {
      for (const loop of Object.values(this.loops || {})) {
        try {
          this.parameter(loop.gain.gain, 0, 0.015);
        } catch {}
      }
      this.stopVoices();
    }
  }
  reset() {
    this.lastExplosion = 0;
    this.lastImpact = 0;
    this.cooldowns = {};
    this.stopVoices();
  }
  stopVoices() {
    for (const voice of [...this.voices]) {
      try {
        voice.source.stop();
      } catch {}
      voice.dispose();
    }
  }
  voice(kind, strength = 1, frequency = 200, delay = 0) {
    if (
      !this.context ||
      this.muted ||
      !this.available ||
      this.context.state !== "running"
    )
      return;
    const c = this.context,
      now = c.currentTime;
    if (kind !== "tone" && now - (this.cooldowns[kind] ?? -100) < 0.07) return;
    if (this.voices.size >= 6) return;
    this.cooldowns[kind] = now;
    const source =
      kind === "tone" ? c.createOscillator() : c.createBufferSource();
    const gain = c.createGain(),
      filter = c.createBiquadFilter();
    const duration =
      kind === "explosion" ? 0.85 : kind === "collision" ? 0.2 : 0.19;
    const start = now + delay,
      amplitude =
        ((kind === "explosion" ? 0.26 : kind === "collision" ? 0.14 : 0.07) *
          clamp(strength, 0.1, 1)) /
        Math.sqrt(1 + this.voices.size);
    if (kind === "tone") {
      source.type = "sine";
      source.frequency.value = frequency;
    } else {
      source.buffer = this.noise;
      source.playbackRate.value = kind === "explosion" ? 0.65 : 1;
    }
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      kind === "explosion" ? 1200 : kind === "collision" ? 2200 : 2500,
      start,
    );
    if (kind === "explosion")
      filter.frequency.exponentialRampToValueAtTime(90, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    const voice = {
      source,
      dispose: () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
      },
    };
    source.onended = voice.dispose;
    this.voices.add(voice);
    source.start(start);
    source.stop(start + duration + 0.03);
  }
  finish(success) {
    this.setRunning(false);
    [...(success ? [523, 659, 784] : [220, 164, 110])].forEach((hz, i) =>
      this.voice("tone", 1, hz, i * 0.12),
    );
  }
  update(sim) {
    if (!this.context || !this.available) return;
    if (!this.running) return;
    try {
      const targets = soundTargets(sim);
      this.lastTargets = targets;
      this.parameter(this.loops.engine.source.frequency, targets.engineHz);
      this.parameter(
        this.loops.siren.source.frequency,
        700 + 240 * Math.sin(this.context.currentTime * 5.5),
        0.025,
      );
      for (const name of ["engine", "siren", "skid"])
        this.parameter(this.loops[name].gain.gain, targets[`${name}Gain`]);
      for (const event of sim.events)
        if (event.id > this.lastExplosion) {
          this.lastExplosion = event.id;
          if (event.type === "explosion")
            this.voice(
              "explosion",
              1 -
                Math.min(
                  0.8,
                  Math.hypot(event.x - sim.player.x, event.z - sim.player.z) /
                    120,
                ),
            );
        }
      for (const event of sim.impacts)
        if (event.id > this.lastImpact) {
          this.lastImpact = event.id;
          this.voice("collision", event.strength / 25);
        }
    } catch {
      this.available = false;
      this.setRunning(false);
    }
  }
}
