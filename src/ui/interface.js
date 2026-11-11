import { CONFIG } from "../game/config.js";
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
  update(sim, escapeView = null) {
    const e = this.elements;
    e.time.textContent = formatTime(sim.elapsed);
    e.health.textContent = `${Math.ceil(sim.health)}%`;
    e["health-bar"].style.width = `${sim.health}%`;
    e["arrest-bar"].style.width =
      `${(sim.arrest / CONFIG.arrestSeconds) * 100}%`;
    e.arrest.textContent =
      sim.arrest > 0.1
        ? "포위 위험! 열린 방향으로 탈출하세요"
        : "경찰을 따돌리세요";
    document.querySelector("#speed strong").textContent = Math.round(
      sim.started && !sim.result
        ? Math.hypot(sim.player.vx, sim.player.vz) * 3.6
        : 0,
    );
    e["mission-progress"].textContent =
      sim.escape.phase === "locked"
        ? `${sim.mission.definition.progressLabel} ${Math.floor(sim.mission.progress)} / 60초`
        : "탈출 · 최종 게이트로 이동";
    const notice = document.querySelector("#notice");
    if (sim.escape.phase === "open" && sim.elapsed - sim.escape.openedAt < 4)
      notice.textContent = "ESCAPE ROUTE OPEN!";
    else if (sim.barricadeWarning)
      notice.textContent = `${Math.max(1, Math.ceil(sim.barricadeWarning.time - sim.elapsed))}초 후 전방 도로 통제 · 다른 도로로 우회하세요`;
    else notice.textContent = "";
    const guidance = document.querySelector("#escape-guidance");
    guidance.hidden = sim.escape.phase !== "open";
    if (escapeView) {
      document.querySelector("#escape-arrow").style.transform =
        `rotate(${escapeView.angle}deg)`;
      document.querySelector("#escape-distance").textContent =
        `${Math.ceil(escapeView.distance)} m`;
      document.querySelector("#escape-name").textContent = escapeView.name;
    }
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
      "MISSION BRIEFING / V1.6",
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
        "ESCAPED!",
        "도시 탈출 성공!",
        `${sim.mission.definition.title} 완료 · 보상 ${sim.credits} 크레딧 획득`,
        "다음 도전 →",
      );
    } else {
      this.show(
        sim.result === "arrested" ? "BUSTED!" : "WRECKED!",
        sim.result === "arrested" ? "경찰에게 체포됨" : "차량 파괴",
        `${sim.result === "arrested" ? "포위에서 빠져나오지 못했습니다." : "차량 내구도가 모두 소진됐습니다."} 도주 ${formatTime(sim.elapsed)} · 최고 기록 ${formatTime(this.best)}`,
        "RESTART →",
      );
    }
  }
}
