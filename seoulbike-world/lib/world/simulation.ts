import { bendPath, toWorld, BRIDGE_XS, ROAD_XS, ROAD_ZS } from './geography';
export const VISUAL_SCALE = 10;
export const ROUTE_VERSION = 'seoul-expanded-network-v3';
export type Point = [number, number, number];
export const XS = ROAD_XS,
  ZS = ROAD_ZS;
export const nodes: Point[] = ZS.flatMap((z) =>
  XS.map((x) => [x, 0.4, z] as Point),
);
const dockCoordinates = [
  [-52, -36],
  [-20, -36],
  [18, -36],
  [50, -36],
  [-52, -15],
  [50, -15],
  [-52, 15],
  [50, 15],
  [-52, 36],
  [-20, 36],
  [18, 36],
  [50, 36],
  [-88, -62],
  [-20, -62],
  [50, -62],
  [86, -62],
  [-88, -36],
  [86, -36],
  [-88, 15],
  [86, -15],
  [-88, 62],
  [-20, 62],
  [50, 62],
  [86, 62],
];
export const stations = dockCoordinates.map(([x, z]) =>
  nodes.findIndex((p) => p[0] === x && p[2] === z),
);
export const stationPlanPositions = stations.map(
  (n) =>
    [
      nodes[n][0] + 6.2,
      0.62,
      nodes[n][2] + (nodes[n][2] > 0 ? 3.9 : -3.9),
    ] as Point,
);
export const stationPositions = stationPlanPositions.map((p) => toWorld(...p));
const adjacent = (n: number) => {
  const columns = XS.length,
    r = Math.floor(n / columns),
    c = n % columns;
  const canCross = (nextRow: number) =>
    ZS[r] * ZS[nextRow] >= 0 || BRIDGE_XS.includes(XS[c]);
  return [
    c > 0 ? n - 1 : -1,
    c < columns - 1 ? n + 1 : -1,
    r > 0 && canCross(r - 1) ? n - columns : -1,
    r < ZS.length - 1 && canCross(r + 1) ? n + columns : -1,
  ].filter((v) => v >= 0);
};
export function hash(seed: number, id: number, stream = 0) {
  let a =
    (seed ^
      Math.imul(id + 1, 0x45d9f3b) ^
      Math.imul(stream + 1, 0x27d4eb2d)) >>>
    0;
  a = Math.imul(a ^ (a >>> 16), 0x45d9f3b);
  return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
}
function roundCorners(points: Point[]): Point[] {
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    if (Math.abs(b[1] - a[1]) > 0.05 || Math.abs(c[1] - b[1]) > 0.05) {
      out.push(b);
      continue;
    }
    const l1 = Math.hypot(...b.map((v, k) => v - a[k])),
      l2 = Math.hypot(...c.map((v, k) => v - b[k]));
    const r = Math.min(0.9, l1 / 3, l2 / 3);
    const start = b.map((v, k) => v + ((a[k] - v) * r) / l1) as Point,
      end = b.map((v, k) => v + ((c[k] - v) * r) / l2) as Point;
    out.push(start);
    for (let step = 1; step <= 5; step++) {
      const t = step / 5;
      out.push(
        start.map(
          (v, k) => (1 - t) ** 2 * v + 2 * (1 - t) * t * b[k] + t * t * end[k],
        ) as Point,
      );
    }
  }
  out.push(points.at(-1)!);
  return out;
}
export function routeFor(seed: number, id: number): Point[] {
  const start = stations[Math.floor(hash(seed, id, 1) * stations.length)];
  let end = stations[Math.floor(hash(seed, id, 2) * stations.length)];
  if (end === start)
    end = stations[(stations.indexOf(start) + 6) % stations.length];
  const queue = [[start]],
    visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift()!,
      n = path.at(-1)!;
    if (n === end) {
      const pathPoints = path.map((i) => [...nodes[i]] as Point);
      const expanded: Point[] = [];
      pathPoints.forEach((p, i) => {
        if (i > 0 && p[2] * pathPoints[i - 1][2] < 0) {
          const prev = pathPoints[i - 1];
          expanded.push(
            [p[0], 1.51, prev[2] * 0.48],
            [p[0], 1.51, p[2] * 0.48],
          );
        }
        expanded.push(p);
      });
      const from = stationPlanPositions[stations.indexOf(start)],
        to = stationPlanPositions[stations.indexOf(end)];
      return bendPath(
        roundCorners([
          from,
          [from[0], 0.4, nodes[start][2]],
          ...expanded,
          [to[0], 0.4, nodes[end][2]],
          to,
        ]),
      );
    }
    for (const next of adjacent(n))
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
  }
  throw new Error('The illustrative cycling network is disconnected.');
}
export type Journey = {
  id: number;
  departure: number;
  duration: number;
  points: Point[];
  distances: number[];
  length: number;
  speed: number;
};
export class Simulation {
  time = 0;
  fraction = 0;
  nextId = 0;
  departures = 0;
  journeys: Journey[] = [];
  seed: number;
  constructor(seed = 42317) {
    this.seed = seed;
  }
  reset() {
    this.time = 0;
    this.fraction = 0;
    this.nextId = 0;
    this.departures = 0;
    this.journeys = [];
  }
  step(seconds: number, prediction: number, operating = true) {
    if (seconds <= 0) return;
    const rate = operating ? Math.max(0, prediction) / VISUAL_SCALE / 3600 : 0;
    const initial = this.fraction;
    const quantity = initial + seconds * rate;
    const count = Math.floor(quantity + 1e-10);
    for (let k = 1; k <= count; k++) {
      const id = this.nextId++,
        departure = this.time + (k - initial) / rate,
        points = routeFor(this.seed, id),
        distances = [0];
      for (let j = 1; j < points.length; j++)
        distances.push(
          distances[j - 1] +
            Math.hypot(...points[j].map((v, a) => v - points[j - 1][a])),
        );
      const length = distances.at(-1)!,
        speed = 0.12 + hash(this.seed, id, 3) * 0.04;
      this.journeys.push({
        id,
        departure,
        points,
        distances,
        length,
        speed,
        duration: 24 + length / speed,
      });
      this.departures++;
    }
    this.fraction = quantity - count;
    this.time += seconds;
    this.journeys = this.journeys.filter(
      (j) => this.time - j.departure <= j.duration,
    );
  }
  position(j: Journey, atTime = this.time): { position: Point; angle: number } {
    const d = Math.max(
      0,
      Math.min(j.length, (atTime - j.departure - 12) * j.speed),
    );
    let seg = j.distances.findIndex((v, i) => i > 0 && v >= d);
    if (seg < 1) seg = j.points.length - 1;
    const a = j.points[seg - 1],
      b = j.points[seg],
      t =
        (d - j.distances[seg - 1]) / (j.distances[seg] - j.distances[seg - 1]);
    return {
      position: a.map((v, i) => v + (b[i] - v) * t) as Point,
      angle: Math.atan2(b[0] - a[0], b[2] - a[2]),
    };
  }
}
