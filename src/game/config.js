export const CONFIG = Object.freeze({
  worldHalf: 110,
  spacing: 30,
  roadWidth: 11,
  playerSpeed: 24,
  policeSpeed: 20,
  turnRate: 2.15,
  radius: 1.15,
  maxHealth: 100,
  arrestSeconds: 4,
  policeCount: 4,
  policeHealth: 100,
  policeRadius: 1.4,
  explosionRadius: 10,
  explosionDamage: 135,
  wreckSeconds: 3,
  respawnSeconds: 5,
});
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const angleDelta = (a, b) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
