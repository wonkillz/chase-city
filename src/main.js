import "./style.css";
import { SoundSystem } from "./audio/sound.js";
const audio = new SoundSystem();
import { createLayout } from "./world/layout.js";
import { Simulation } from "./game/simulation.js";
import { Input } from "./game/input.js";
import { CityRenderer } from "./render/scene.js";
import { Interface } from "./ui/interface.js";
const ui = new Interface(),
  sim = new Simulation(createLayout());
let renderer,
  state = "ready";
function pause() {
  if (state === "running") {
    state = "paused";
    input.clear();
    audio.setRunning(false);
    ui.showPause();
  } else if (state === "paused") {
    state = "running";
    audio.unlock();
    audio.setRunning(true);
    ui.hide();
  }
}
const input = new Input(pause);
try {
  renderer = new CityRenderer(document.querySelector("#game"), sim.layout);
} catch (error) {
  document.querySelector("#message").textContent =
    "3D 그래픽을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 시도하세요.";
  ui.start.disabled = true;
  console.error(error);
}
ui.start.addEventListener("click", () => {
  if (!renderer) return;
  if (state === "over") {
    sim.reset();
    renderer.reset();
    audio.reset();
    state = "ready";
    input.clear();
    ui.showMission(sim);
    return;
  }
  audio.unlock();
  if (state === "ready") {
    sim.start();
    audio.reset();
  }
  audio.setRunning(true);
  state = "running";
  input.clear();
  ui.hide();
});
document.querySelector("#pause").addEventListener("click", pause);
const mute = document.querySelector("#mute");
mute.addEventListener("click", () => {
  audio.setMuted(!audio.muted);
  if (!audio.muted && state === "running") audio.unlock();
  mute.textContent = audio.muted ? "소리 OFF" : "소리 ON";
  mute.setAttribute("aria-pressed", String(audio.muted));
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "running") pause();
});
window.addEventListener("blur", () => {
  if (state === "running") pause();
});
let last = 0,
  accumulator = 0;
function frame(ms) {
  requestAnimationFrame(frame);
  const dt = Math.min((ms - last) / 1000, 0.1);
  last = ms;
  if (state === "running") {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      sim.update(1 / 60, input);
      accumulator -= 1 / 60;
      if (sim.result) {
        state = "over";
        audio.finish(sim.result === "success");
        ui.gameover(sim);
        break;
      }
    }
  } else accumulator = 0;
  if (state === "running") audio.update(sim);
  ui.update(sim);
  renderer?.render(
    sim,
    state === "running" || state === "ready" ? dt : 0,
    state === "running",
  );
}
if (renderer) ui.showMission(sim);
requestAnimationFrame(frame);
// Opt-in diagnostics for automated local tests; never enabled by normal play.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("debug"))
  window.__CHASE__ = {
    sim,
    input,
    renderer,
    audio,
    get state() {
      return state;
    },
  };
