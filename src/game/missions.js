import { crossedExit } from "./escape.js";
export const MISSIONS = Object.freeze({
  survival60: Object.freeze({
    id: "survival60",
    title: "도시 탈출",
    objective: "60초간 버틴 뒤 외곽 탈출 도로의 최종 게이트를 통과하세요.",
    reward: Object.freeze({ type: "credits", amount: 500 }),
    target: 60,
    progressLabel: "생존",
    unit: "초",
    progress: (sim) => Math.min(sim.elapsed, 60),
    isComplete: (sim) =>
      sim.escape.phase === "open" &&
      crossedExit(sim.previousPlayer, sim.player, sim.escape.exit),
  }),
});
export function createMission(id = "survival60") {
  const definition = MISSIONS[id];
  if (!definition) throw new Error(`Unknown mission: ${id}`);
  return { definition, progress: 0, status: "pending", rewardGranted: false };
}
export function updateMission(sim) {
  const m = sim.mission;
  m.progress = m.definition.progress(sim);
  if (sim.result) {
    m.status = "failed";
    return;
  }
  if (sim.elapsed + 1e-7 >= 60 && sim.escape.phase === "locked") {
    sim.openEscape();
    m.status = "escape";
    return;
  }
  if (m.definition.isComplete(sim)) {
    sim.escape.phase = "escaped";
    m.status = "completed";
    if (!m.rewardGranted) {
      sim.credits += m.definition.reward.amount;
      m.rewardGranted = true;
    }
    sim.result = "success";
  }
}
