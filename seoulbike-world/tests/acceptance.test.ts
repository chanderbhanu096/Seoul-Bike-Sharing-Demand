import test from 'node:test';
import {
  toWorld,
  toPlan,
  riverHalfWidth,
  riverBend,
  BRIDGE_XS,
  dashCenters,
  curbIntervals,
  bridgeSurfaceHeight,
  WORLD_WIDTH,
  WORLD_DEPTH,
  ROAD_XS,
  ROAD_ZS,
  ROAD_END_X,
  ROAD_END_Z,
} from '../lib/world/geography';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Simulation,
  routeFor,
  stations,
  nodes,
  stationPositions,
  ROUTE_VERSION,
  VISUAL_SCALE,
} from '../lib/world/simulation';
import {
  predict,
  validateScenario,
  explainChange,
  scenarioWarnings,
  type Model,
  type Scenario,
  type Support,
} from '../lib/inference';
import { seasonForDate, deltaText, rentalChange } from '../lib/scenario';
import {
  timelineWindow,
  timelineStepBudget,
  timelineClock,
} from '../lib/timeline';
const json = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const model = json('../data/model/model.json') as Model,
  support = json('../data/model/support.json') as Support;
const fixtures = json('../data/model/fixtures.json'),
  presets = json('../data/presets.json'),
  playback = json('../public/data/playback.json');
const initial = presets[0].scenario as Scenario;
test('portable model exactly matches independent sklearn fixtures', () => {
  for (const f of fixtures.fixtures)
    assert.ok(
      Math.abs(predict(model, f.scenario) - f.expected) < fixtures.tolerance,
    );
});
test('all held-out playback rows match model and remain out of training', () => {
  assert.equal(playback.rows.length, 24);
  for (const [i, row] of playback.rows.entries()) {
    assert.equal(row.scenario.hour, i);
    assert.ok(row.scenario.date > '2018-09-18');
    assert.equal(row.scenario.functioning, true);
    assert.ok(Math.abs(predict(model, row.scenario) - row.prediction) < 1e-8);
  }
});
test('1000 versus 600 rentals create exactly 40 percent fewer starts', () => {
  const a = new Simulation(),
    b = new Simulation();
  a.step(3600, 1000);
  b.step(3600, 600);
  assert.equal(a.departures, 100);
  assert.equal(b.departures, 60);
  assert.equal(VISUAL_SCALE, 10);
});
test('scheduler is independent of render frame sizes and deterministic', () => {
  const a = new Simulation(9123),
    b = new Simulation(9123);
  a.step(3600, 1364.578);
  for (let i = 0; i < 12000; i++) b.step(0.3, 1364.578);
  assert.equal(a.departures, b.departures);
  assert.deepEqual(
    a.journeys.map((j) => [j.id, j.points]),
    b.journeys.map((j) => [j.id, j.points]),
  );
  for (const j of a.journeys) {
    const k = b.journeys.find((v) => v.id === j.id)!;
    assert.ok(Math.abs(j.departure - k.departure) < 1e-7);
    a.position(j).position.forEach((v, i) =>
      assert.ok(Math.abs(v - b.position(k).position[i]) < 1e-7),
    );
  }
});
test('changing predictions preserves active journey identities and endpoints', () => {
  const sim = new Simulation();
  sim.step(180, 1500);
  assert.ok(sim.journeys.length);
  const before = structuredClone(sim.journeys);
  sim.step(1, 50);
  for (const j of before) {
    const after = sim.journeys.find((v) => v.id === j.id)!;
    assert.deepEqual(after, j);
  }
});
test('closure gates only starts and reopening produces no backlog', () => {
  const sim = new Simulation();
  sim.step(180, 1200);
  const departed = sim.departures;
  sim.step(100, 1200, false);
  assert.equal(sim.departures, departed);
  assert.ok(sim.journeys.length);
  sim.step(1, 1200, true);
  assert.ok(sim.departures - departed <= 1);
  assert.equal(predict(model, { ...initial, functioning: false }), 0);
  assert.ok(predict(model, { ...initial, functioning: true }) > 0);
});
test('explicit comparison reset reproduces exact sequence', () => {
  const sim = new Simulation(42317);
  sim.step(3600, 1000);
  const saved = structuredClone({
    journeys: sim.journeys,
    departures: sim.departures,
  });
  sim.reset();
  sim.step(3600, 1000);
  assert.deepEqual(
    { journeys: sim.journeys, departures: sim.departures },
    saved,
  );
  assert.equal(ROUTE_VERSION, 'seoul-expanded-network-v3');
});
test('all sampled routes start/end at stations and cross river on bridge decks', () => {
  const usedBridges = new Set<number>(),
    usedDocks = new Set<number>();
  for (let id = 0; id < 1000; id++) {
    const path = routeFor(42317, id);
    for (const endpoint of [path[0], path.at(-1)!])
      usedDocks.add(
        stationPositions.findIndex((p) => p.every((v, i) => v === endpoint[i])),
      );
    for (const p of path) {
      const [x, y, z] = toPlan(...p);
      assert.ok([x, y, z].every(Number.isFinite));
      assert.ok(Math.abs(x) < WORLD_WIDTH / 2 && Math.abs(z) < WORLD_DEPTH / 2);
    }
    assert.ok(
      stationPositions.some(
        (n) => JSON.stringify(n) === JSON.stringify(path[0]),
      ),
    );
    assert.ok(
      stationPositions.some(
        (n) => JSON.stringify(n) === JSON.stringify(path.at(-1)),
      ),
    );
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      assert.ok(Math.hypot(...a.map((v, k) => v - b[k])) < 39);
      for (let j = 0; j <= 10; j++) {
        const z = a[2] + ((b[2] - a[2]) * j) / 10,
          x = a[0] + ((b[0] - a[0]) * j) / 10,
          y = a[1] + ((b[1] - a[1]) * j) / 10;
        if (Math.abs(toPlan(x, y, z)[2]) < 6.5) {
          assert.ok(BRIDGE_XS.includes(x));
          usedBridges.add(x);
          assert.ok(y >= 1.49);
        }
      }
    }
  }
  assert.deepEqual(
    [...usedBridges].sort((a, b) => a - b),
    BRIDGE_XS,
  );
  assert.equal(usedDocks.size, 24);
  assert.ok(!usedDocks.has(-1));
});
test('expanded network includes unique valid docks beyond every former city edge', () => {
  assert.equal(nodes.length, 36);
  assert.equal(stations.length, 24);
  assert.equal(new Set(stations).size, stations.length);
  assert.ok(stations.every((s) => s >= 0 && s < nodes.length));
  assert.ok(WORLD_WIDTH * WORLD_DEPTH > 2 * 144 * 110);
  for (const sign of [-1, 1]) {
    assert.ok(stations.some((s) => nodes[s][0] * sign > 72));
    assert.ok(stations.some((s) => nodes[s][2] * sign > 55));
  }
});
test('local explanations exactly sum to the scenario difference', () => {
  for (const p of presets) {
    const e = explainChange(model, initial, p.scenario);
    assert.ok(
      Math.abs(e.contributions.reduce((s, c) => s + c.delta, 0) - e.delta) <
        1e-8,
    );
  }
  const zero = explainChange(
    model,
    { ...initial, functioning: false },
    initial,
  );
  assert.equal(zero.percentChange, null);
  assert.ok(!deltaText(20, 0).includes('Infinity'));
});
test('calendar, schema and unusual-scenario handling', () => {
  assert.equal(seasonForDate('2018-12-01'), 'Winter');
  assert.equal(seasonForDate('2018-06-01'), 'Summer');
  for (const p of presets) {
    assert.deepEqual(validateScenario(p.scenario), []);
    assert.equal(p.scenario.season, seasonForDate(p.scenario.date));
  }
  for (const s of [
    { ...initial, hour: 24 },
    { ...initial, date: '2018-02-30' },
    { ...initial, humidity: 110 },
    { ...initial, rainfall: -1 },
    { ...initial, windSpeed: NaN },
    { ...initial, solarRadiation: undefined },
  ])
    assert.ok(validateScenario(s).length);
  assert.ok(
    scenarioWarnings(model, support, { ...initial, rainfall: 99 }).length,
  );
});
test('server contract accepts complete scenarios and rejects missing inputs', async () => {
  const good = await fetch('http://localhost:3000/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: initial, baseline: presets[1].scenario }),
  });
  assert.equal(good.status, 200);
  const body: any = await good.json();
  assert.equal(body.modelVersion, model.version);
  assert.ok(Math.abs(body.prediction - predict(model, initial)) < 1e-9);
  const bad = await fetch('http://localhost:3000/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: { temperature: 20 } }),
  });
  assert.equal(bad.status, 422);
  const malformed = await fetch('http://localhost:3000/api/predict', {
    method: 'POST',
    body: 'bad json',
  });
  assert.equal(malformed.status, 400);
});

test('rental notifications show matching signed counts and before/after estimates', () => {
  const down = rentalChange(1364.578, 50.0387);
  assert.equal(down.difference, -1315);
  assert.equal(down.headline, '−1,315 rentals/hour');
  assert.equal(down.detail, '1,365 → 50 rentals/hour · 96.3% decrease');
  assert.equal(rentalChange(50.0387, 1364.578).headline, '+1,315 rentals/hour');
  assert.equal(rentalChange(0, 123).percent, null);
  assert.equal(rentalChange(100.1, 100.2).direction, 'unchanged');
});
test('time windows support overnight, equal-hour full days, multiple dates and hidden continuous end fields', () => {
  const overnight = timelineWindow('2018-09-04', 22, '2018-09-04', 6, 'range');
  assert.equal(overnight.end, '2018-09-05T06:00');
  assert.equal(overnight.hours, 8);
  assert.equal(
    timelineWindow('2018-09-04', 15, '2018-09-04', 15, 'range').hours,
    24,
  );
  assert.equal(
    timelineWindow('2018-09-04', 6, '2018-09-06', 22, 'range').hours,
    64,
  );
  assert.equal(
    timelineWindow('2018-09-04', 6, '', NaN, 'continuous').hours,
    24,
  );
  for (const args of [
    ['2018-02-30', 0, '2018-03-02', 0, 'range'],
    ['2018-09-04', 6, '2018-09-03', 22, 'range'],
    ['2018-11-30', 6, '2018-11-30', 6, 'continuous'],
    ['2018-09-04', 24, '2018-09-05', 6, 'range'],
  ] as const)
    assert.throws(() =>
      timelineWindow(args[0], args[1], args[2], args[3], args[4]),
    );
});
test('one clock stops exactly at model boundaries and integrates each hourly departure rate', () => {
  const sim = new Simulation();
  for (const [index, prediction] of [1000, 600].entries()) {
    const boundary = (index + 1) * 3600;
    while (sim.time < boundary)
      sim.step(timelineStepBudget(sim.time, 713, boundary), prediction);
    assert.equal(sim.time, boundary);
    assert.equal(timelineStepBudget(sim.time, 713, boundary), 0);
  }
  assert.equal(sim.departures, 160);
  assert.equal(timelineClock(23, 3600), '00:00');
  assert.equal(timelineClock(6, 65), '06:01');
});
test('historical endpoint returns actual next-day rows and independently known period totals', async () => {
  for (const [start, end, hours, total] of [
    [6, 22, 16, 24502],
    [22, 6, 8, 6158],
    [15, 15, 24, 31440],
  ]) {
    const res = await fetch(
      `http://localhost:3000/api/history?date=2018-09-04&start=${start}&endDate=2018-09-04&end=${end}&mode=range`,
    );
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.hours, hours);
    assert.equal(body.rows.length, hours);
    assert.equal(
      body.rows.reduce((sum: number, r: any) => sum + r.observed, 0),
      total,
    );
    body.rows.forEach((r: any) =>
      assert.deepEqual(validateScenario(r.scenario), []),
    );
    if (start === 22) assert.equal(body.rows[2].scenario.date, '2018-09-05');
  }
  const bad = await fetch(
    'http://localhost:3000/api/history?date=2018-11-30&start=22&mode=continuous',
  );
  assert.equal(bad.status, 422);
});

test('river and road geometry share a reversible transform and centered, intersection-free dashes', () => {
  for (let x = -WORLD_WIDTH / 2; x <= WORLD_WIDTH / 2; x += 1.5)
    for (const z of [
      -WORLD_DEPTH / 2,
      ...ROAD_ZS,
      -6.5,
      0,
      6.5,
      WORLD_DEPTH / 2,
    ]) {
      const world = toWorld(x, 0.4, z),
        plan = toPlan(...world);
      assert.ok(Math.abs(plan[0] - x) < 1e-8 && Math.abs(plan[2] - z) < 1e-8);
      if (Math.abs(z) === 6.5)
        assert.ok(
          Math.abs(Math.abs(world[2] - riverBend(x)) - riverHalfWidth(x)) <
            1e-8,
        );
    }
  for (const c of dashCenters(-ROAD_END_X + 2, ROAD_END_X - 2, ROAD_XS)) {
    assert.ok(ROAD_XS.every((x) => Math.abs(c - x) >= 5));
    assert.equal(Math.abs(c % 3), 0);
  }
  assert.ok(riverHalfWidth(0) > 18);
  assert.equal(BRIDGE_XS.length, 5);
});
test('trails sample actual earlier journey positions without altering simulation', () => {
  const sim = new Simulation();
  sim.step(300, 1500);
  const j = sim.journeys.at(-1)!;
  const before = structuredClone(j);
  const now = sim.position(j),
    past = sim.position(j, sim.time - 14);
  assert.ok(past.position.every(Number.isFinite));
  assert.deepEqual(j, before);
  assert.equal(sim.time, 300);
  assert.deepEqual(sim.position(j), now);
});

test('intersection curbs leave every junction open and crossing height follows bridge slopes', () => {
  for (const [start, end, crossings] of [
    [-ROAD_END_X, ROAD_END_X, ROAD_XS],
    [15, ROAD_END_Z, ROAD_ZS.filter((z) => z > 0)],
  ] as [number, number, number[]][])
    for (const [a, b] of curbIntervals(start, end, crossings))
      for (const x of crossings)
        assert.ok(b <= x - 3.05 + 1e-8 || a >= x + 3.05 - 1e-8);
  assert.equal(bridgeSurfaceHeight(15), 0.4);
  assert.equal(bridgeSurfaceHeight(0), 1.51);
  assert.ok(bridgeSurfaceHeight(11.35) > 0.9);
  assert.equal(bridgeSurfaceHeight(11.35), bridgeSurfaceHeight(-11.35));
});
