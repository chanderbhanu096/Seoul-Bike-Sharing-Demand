/** Seoul-inspired, compressed geography. Not a surveyed street or station map. */
export type MapPoint = [number, number, number];
export const WORLD_WIDTH = 234,
  WORLD_DEPTH = 171;
export const ROAD_END_X = 115,
  ROAD_END_Z = 81;
export const ROAD_XS = [-88, -52, -20, 18, 50, 86];
export const ROAD_ZS = [-62, -36, -15, 15, 36, 62];
export const CORE_XS = [-52, -20, 18, 50];
export const BRIDGE_XS = [-88, -20, 18, 50, 86];
export const riverBend = (x: number) => 7 * Math.sin((x + 20) / 34) + x * 0.065;
export const riverStretch = (x: number) => 2.65 + 0.25 * Math.cos(x / 32);
export const riverHalfWidth = (x: number) => 6.5 * riverStretch(x);
export function toWorld(x: number, y: number, z: number): MapPoint {
  const scale = riverStretch(x);
  const offset =
    Math.abs(z) <= 6.5 ? z * scale : z + Math.sign(z) * 6.5 * (scale - 1);
  return [x, y, offset + riverBend(x)];
}
export function toPlan(x: number, y: number, z: number): MapPoint {
  const offset = z - riverBend(x),
    scale = riverStretch(x);
  return [
    x,
    y,
    Math.abs(offset) <= 6.5 * scale
      ? offset / scale
      : offset - Math.sign(offset) * 6.5 * (scale - 1),
  ];
}
export function bendPath(points: MapPoint[]): MapPoint[] {
  const result: MapPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      count = Math.max(
        1,
        Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.8),
      );
    for (let k = 0; k < count; k++) {
      const t = k / count;
      result.push(
        toWorld(
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ),
      );
    }
  }
  result.push(toWorld(...points.at(-1)!));
  return result;
}
export function dashCenters(start: number, end: number, crossings: number[]) {
  const result: number[] = [];
  for (let center = Math.ceil(start / 3) * 3; center <= end; center += 3)
    if (!crossings.some((c) => Math.abs(c - center) < 5)) result.push(center);
  return result;
}
export type CityView =
  | 'overview'
  | 'river'
  | 'namsan'
  | 'gangnam'
  | 'map'
  | 'west'
  | 'east'
  | 'hills';
export const CITY_VIEWS: {
  id: CityView;
  name: string;
  description: string;
  position: MapPoint;
  target: MapPoint;
}[] = [
  {
    id: 'overview',
    name: 'All of Seoul',
    description: 'River, districts and landmarks',
    position: [210, 215, 255],
    target: [0, 0, 0],
  },
  {
    id: 'river',
    name: 'Along the Han',
    description: 'Yeouido and the river bridges',
    position: [-88, 63, 95],
    target: [-15, 1, 1],
  },
  {
    id: 'namsan',
    name: 'Namsan & old Seoul',
    description: 'Wooded hill, tower and palace',
    position: [40, 53, 14],
    target: toWorld(0, 8, -30),
  },
  {
    id: 'gangnam',
    name: 'Gangnam skyline',
    description: 'Modern towers south of the river',
    position: [87, 61, 122],
    target: toWorld(27, 8, 34),
  },
  {
    id: 'west',
    name: 'Western neighborhoods',
    description: 'New streets and riverside blocks',
    position: toWorld(-50, 55, 28),
    target: toWorld(-88, 4, -22),
  },
  {
    id: 'east',
    name: 'Eastern river park',
    description: 'Open lawns, boardwalks and a new bridge',
    position: toWorld(145, 65, 93),
    target: toWorld(99, 2, 22),
  },
  {
    id: 'hills',
    name: 'Northern hills',
    description: 'Wooded slopes beyond the old city',
    position: toWorld(-10, 62, -12),
    target: toWorld(-36, 5, -72),
  },
  {
    id: 'map',
    name: 'Map from above',
    description: 'North at the top; see the road network',
    position: [0, 410, 75],
    target: [0, 0, 0],
  },
];

export function curbIntervals(start: number, end: number, crossings: number[]) {
  const ranges: [number, number][] = [];
  let cursor = start;
  for (const c of [...crossings].sort((a, b) => a - b)) {
    if (c + 3.05 <= start || c - 3.05 >= end) continue;
    const gapStart = Math.max(start, c - 3.05);
    if (gapStart > cursor) ranges.push([cursor, gapStart]);
    cursor = Math.max(cursor, c + 3.05);
  }
  if (cursor < end) ranges.push([cursor, end]);
  return ranges;
}
export function bridgeSurfaceHeight(z: number) {
  return Math.abs(z) <= 7.2
    ? 1.51
    : Math.abs(z) >= 15
      ? 0.4
      : 1.51 - ((Math.abs(z) - 7.2) / 7.8) * 1.11;
}
