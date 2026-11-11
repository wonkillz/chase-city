export const CONFIG = Object.freeze({worldHalf:110, spacing:30, roadWidth:11, playerSpeed:18, driftSpeed:14, turnRate:1.9, radius:1.15, maxHealth:100, arrestSeconds:4, policeCount:4});
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
