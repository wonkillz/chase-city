import { clearSegment } from "./navigation.js";
export const EXIT_CANDIDATES = Object.freeze([
  ...[-60, 0, 60].flatMap((lane) => [
    {
      id: `north-${lane}`,
      x: lane,
      z: -140,
      dx: 0,
      dz: -1,
      anchor: { x: lane, z: -90 },
      name: "NORTH GATE",
    },
    {
      id: `south-${lane}`,
      x: lane,
      z: 140,
      dx: 0,
      dz: 1,
      anchor: { x: lane, z: 90 },
      name: "SOUTH GATE",
    },
    {
      id: `east-${lane}`,
      x: 140,
      z: lane,
      dx: 1,
      dz: 0,
      anchor: { x: 90, z: lane },
      name: "EAST GATE",
    },
    {
      id: `west-${lane}`,
      x: -140,
      z: lane,
      dx: -1,
      dz: 0,
      anchor: { x: -90, z: lane },
      name: "WEST GATE",
    },
  ]),
]);
export function chooseExit(solids, rng = Math.random, lastId = null) {
  const candidates = EXIT_CANDIDATES.filter(
    (e) => e.id !== lastId && clearSegment(e.anchor, e, solids, 2),
  );
  if (!candidates.length) throw new Error("No reachable exit road");
  return candidates[
    Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
  ];
}
export function exitCoordinates(point, exit) {
  return {
    forward: point.x * exit.dx + point.z * exit.dz,
    lateral: (point.x - exit.x) * exit.dz - (point.z - exit.z) * exit.dx,
  };
}
export function crossedExit(previous, player, exit) {
  const a = exitCoordinates(previous, exit),
    b = exitCoordinates(player, exit);
  return a.forward < 140 && b.forward >= 140 && Math.abs(b.lateral) <= 7.1;
}
export function constrainToWorld(body, escape, previous = null) {
  const e = escape?.phase === "open" ? escape.exit : null;
  if (e) {
    const coords = exitCoordinates(body, e);
    if (
      (coords.forward >= 94 && Math.abs(coords.lateral) <= 9.5) ||
      (coords.forward > 106 &&
        previous &&
        exitCoordinates(previous, e).forward > 106)
    ) {
      const forward = Math.max(94, Math.min(154, coords.forward));
      const lateral = Math.max(-8, Math.min(8, coords.lateral));
      body.x = e.dx * forward + e.dz * lateral + (e.dx === 0 ? e.x : 0);
      body.z = e.dz * forward - e.dx * lateral + (e.dz === 0 ? e.z : 0);
      return;
    }
  }
  body.x = Math.max(-106, Math.min(106, body.x));
  body.z = Math.max(-106, Math.min(106, body.z));
}
