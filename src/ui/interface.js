export const formatTime = (t) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
export class Interface {
  constructor() {
    this.overlay = document.querySelector("#overlay");
    this.start = document.querySelector("#start");
    this.best = 0;
    this.elements = Object.fromEntries(
      [
        "time",
        "health",
        "health-bar",
        "arrest",
        "arrest-bar",
        "mission-progress",
        "eyebrow",
        "title",
        "message",
        "mission-details",
      ].map((id) => [id, document.getElementById(id)]),
    );
    try {
      this.best = Number(localStorage.getItem("chase-city-best")) || 0;
    } catch {}
  }
  update(sim) {
    const e = this.elements;
    e.time.textContent = formatTime(sim.elapsed);
    e.health.textContent = `${Math.ceil(sim.health)}%`;
    e["health-bar"].style.width = `${sim.health}%`;
    e["arrest-bar"].style.width = `${(sim.arrest / 4) * 100}%`;
    e.arrest.textContent =
      sim.arrest > 0.1 ? "체포 위험! 속도를 높이세요" : "경찰을 따돌리세요";
    document.querySelector("#speed strong").textContent = Math.round(
      sim.started && !sim.result
        ? Math.hypot(sim.player.vx, sim.player.vz) * 3.6
        : 0,
    );
    e["mission-progress"].textContent =
      `${sim.mission.definition.progressLabel} ${Math.floor(sim.mission.progress)} / ${sim.mission.definition.target}${sim.mission.definition.unit}`;
  }
  show(eyebrow, title, message, button) {
    this.overlay.hidden = false;
    document.body.classList.remove("playing");
    this.elements.eyebrow.textContent = eyebrow;
    this.elements.title.textContent = title;
    this.elements.message.textContent = message;
    this.elements["mission-details"].hidden = true;
    this.start.textContent = button;
    this.start.focus({ preventScroll: true });
  }
  showMission(sim) {
    const mission = sim.mission.definition;
    this.show(
      "MISSION BRIEFING / V1.3",
      mission.title,
      mission.objective,
      "START →",
    );
    this.elements["mission-details"].hidden = false;
    document.querySelector("#mission-goal").textContent = mission.objective;
    document.querySelector("#mission-reward").textContent =
      `${mission.reward.amount} 크레딧`;
  }
  hide() {
    this.overlay.hidden = true;
    document.body.classList.add("playing");
  }
  showPause() {
    this.show(
      "TAKE A BREATHER",
      "잠시 정차 중.",
      "준비되면 다시 도시로 돌아가세요.",
      "계속 달리기 →",
    );
  }
  gameover(sim) {
    this.best = Math.max(this.best, Math.floor(sim.elapsed));
    try {
      localStorage.setItem("chase-city-best", String(this.best));
    } catch {}
    if (sim.result === "success") {
      this.show(
        "MISSION COMPLETE",
        "미션 성공!",
        `${sim.mission.definition.title} 완료 · 보상 ${sim.credits} 크레딧 획득`,
        "다음 도전 →",
      );
    } else {
      this.show(
        sim.result === "arrested"
          ? "BUSTED / 경찰 체포"
          : "WRECKED / 차량 파괴",
        "다시 도전할까요?",
        `도주 ${formatTime(sim.elapsed)} · 최고 기록 ${formatTime(this.best)}`,
        "미션 다시 준비 →",
      );
    }
  }
}
