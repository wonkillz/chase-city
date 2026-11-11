export const CONFIG = Object.freeze({
  worldHalf: 110,
  spacing: 30,
  roadWidth: 11,
  playerSpeed: 24,
  policeSpeed: 22,
  turnRate: 1.75,
  radius: 1.15,
  maxHealth: 100,
  arrestSeconds: 5,
  policeCount: 4,
  maxPolice: 8,
  policeHealth: 100,
  impactCooldown: 0.8,
  wallDamageScale: 1.7,
  pairDamageScale: 2.1,
  minimumImpact: 6,
  barricadeDamageScale: 1.9,
  maxImpactDamage: 60,
  policeRadius: 1.4,
  explosionRadius: 10,
  explosionDamage: 90,
  wreckSeconds: 3,
  respawnSeconds: 5,
});
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const angleDelta = (a, b) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
