// Mission definitions own their progress/success rules; simulation owns the lifecycle.
// Additional collection, delivery and escape definitions can use the same contract.
export const MISSIONS = Object.freeze({
  survival60: Object.freeze({
    id: "survival60",
    title: "60초의 도주",
    objective: "경찰을 피해 60초간 생존하세요.",
    reward: Object.freeze({ type: "credits", amount: 300 }),
    target: 60,
    progressLabel: "생존",
    unit: "초",
    progress: (sim) => Math.min(sim.elapsed, 60),
    isComplete: (sim) => sim.elapsed >= 60,
  }),
});
export function createMission(id = "survival60") {
  const definition = MISSIONS[id];
  if (!definition) throw new Error(`Unknown mission: ${id}`);
  return { definition, progress: 0, status: "pending", rewardGranted: false };
}
export function updateMission(sim) {
  const mission = sim.mission;
  mission.progress = mission.definition.progress(sim);
  if (sim.result) {
    mission.status = "failed";
    return;
  }
  if (mission.definition.isComplete(sim)) {
    mission.status = "completed";
    if (!mission.rewardGranted) {
      sim.credits += mission.definition.reward.amount;
      mission.rewardGranted = true;
    }
    sim.result = "success";
  }
}
