import fs from 'node:fs';
import assert from 'node:assert/strict';
import { predict, explainChange, scenarioWarnings, validateScenario, seasonForDate } from './inference.ts';
const root = new URL('./artifacts/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const model = read('model.json'), suite = read('fixtures.json'), support = read('support.json');
let maxError = 0;
for (const item of suite.fixtures) {
  const actual = predict(model, item.scenario), error = Math.abs(actual - item.expected);
  maxError = Math.max(maxError, error);
  assert(error < suite.tolerance, `Parity failure ${item.sourceRow ?? item.label}: ${error}`);
}
const presets = read('presets.json'), baseline = presets[0].scenario;
for (const preset of presets) {
  const explanation = explainChange(model, baseline, preset.scenario);
  assert(Math.abs(explanation.contributions.reduce((sum, x) => sum + x.delta, 0) - explanation.delta) < 1e-8);
  assert.equal(validateScenario(preset.scenario).length, 0);
  assert.equal(seasonForDate(preset.scenario.date), preset.scenario.season);
}
assert.equal(predict(model, { ...baseline, functioning: false }), 0);
assert(validateScenario({ ...baseline, date: '2018-02-31' }).length);
assert(validateScenario({ ...baseline, humidity: NaN }).length);
assert(validateScenario({ ...baseline, functioning: 1 }).length);
assert(validateScenario({ ...baseline, hour: 24 }).length);
assert.equal(explainChange(model, { ...baseline, functioning: false }, baseline).percentChange, null);
const playback = read('playback.json');
assert.equal(playback.rows.length, 24);
for (let i = 0; i < 24; i++) {
  assert.equal(playback.rows[i].scenario.hour, i);
  assert.equal(playback.rows[i].partition, 'final holdout');
  assert(Math.abs(predict(model, playback.rows[i].scenario) - playback.rows[i].prediction) < 1e-8);
}
const started = performance.now();
for (let i = 0; i < 100; i++) {
  predict(model, baseline);
  scenarioWarnings(model, support, { ...baseline, rainfall: i / 4 });
}
console.log(JSON.stringify({ fixtureCount: suite.fixtures.length, maxError, explanationTelescoping: 'pass', availabilityZero: 'pass', validation: 'pass', playbackHours: 24, meanPredictionAndSupportMilliseconds: (performance.now() - started) / 100, presetWarnings: presets.map(p => ({ id: p.id, warnings: scenarioWarnings(model, support, p.scenario) })) }, null, 2));
