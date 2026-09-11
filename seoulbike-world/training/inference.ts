/** Exact, dependency-free inference for the exported scikit-learn GradientBoostingRegressor.
 * The same implementation can run in a Cloudflare Worker. No training or LLM call occurs.
 */
export type Season = 'Winter' | 'Spring' | 'Summer' | 'Autumn';
export type Scenario = {
  date: string; hour: number; temperature: number; humidity: number; windSpeed: number;
  visibility: number; dewPoint: number; solarRadiation: number; rainfall: number; snowfall: number;
  season: Season; holiday: boolean; functioning: boolean;
};
export type Tree = { left: number[]; right: number[]; feature: number[]; threshold: number[]; value: number[] };
export type Model = { format: string; version: string; features: string[]; initialPrediction: number; learningRate: number; trees: Tree[] };
export type Support = {
  features: string[]; center: number[]; scale: number[]; threshold: number; referenceVectors: number[][];
  ranges: Record<string, { min: number; max: number; p01: number; p99: number }>;
  trainingDateStart: string; trainingDateEnd: string; trainingRows: number;
};
const numeric = ['temperature', 'humidity', 'windSpeed', 'visibility', 'dewPoint', 'solarRadiation', 'rainfall', 'snowfall'] as const;
const seasons = ['Winter', 'Spring', 'Summer', 'Autumn'] as const;
const twoPi = 2 * Math.PI;
export function seasonForDate(date: string): Season {
  const month = Number(date.slice(5, 7));
  return month === 12 || month < 3 ? 'Winter' : month < 6 ? 'Spring' : month < 9 ? 'Summer' : 'Autumn';
}
export function validateScenario(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['Scenario must be an object.'];
  const s = value as Scenario;
  const errors: string[] = [];
  const date = new Date(`${s.date}T00:00:00.000Z`);
  if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== s.date) errors.push('Date must be a valid YYYY-MM-DD calendar date.');
  if (!Number.isInteger(s.hour) || s.hour < 0 || s.hour > 23) errors.push('Hour must be an integer from 0 to 23.');
  for (const key of numeric) if (typeof s[key] !== 'number' || !Number.isFinite(s[key])) errors.push(`${key} must be a finite number.`);
  for (const key of ['windSpeed', 'visibility', 'solarRadiation', 'rainfall', 'snowfall'] as const) if (s[key] < 0) errors.push(`${key} cannot be negative.`);
  if (s.humidity < 0 || s.humidity > 100) errors.push('Humidity must be between 0 and 100%.');
  if (!seasons.includes(s.season)) errors.push('Season must be Winter, Spring, Summer or Autumn.');
  if (typeof s.holiday !== 'boolean' || typeof s.functioning !== 'boolean') errors.push('Holiday and functioning must be booleans.');
  return errors;
}
export function expandFeatures(s: Scenario): number[] {
  // UTC here avoids device timezone drift; the date and hour remain Seoul's source local clock.
  const d = new Date(`${s.date}T00:00:00.000Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // Python Monday=0
  const dayIndex = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
  return [
    s.hour, ...numeric.map(k => s[k]), Number(s.holiday), Number(weekday >= 5),
    Math.sin(s.hour * twoPi / 24), Math.cos(s.hour * twoPi / 24),
    Math.sin(dayIndex * twoPi / 365.25), Math.cos(dayIndex * twoPi / 365.25),
    ...Array.from({ length: 7 }, (_, i) => Number(weekday === i)),
    ...seasons.map(season => Number(s.season === season)),
    ...Array.from({ length: 24 }, (_, i) => Number(s.hour === i)),
  ];
}
export function predict(model: Model, scenario: Scenario): number {
  const issues = validateScenario(scenario);
  if (issues.length) throw new Error(issues.join(' '));
  if (!scenario.functioning) return 0; // Explicit availability rule, not inferred willingness to rent.
  const x = expandFeatures(scenario).map(Math.fround); // sklearn tree input conversion is float32.
  if (x.length !== model.features.length) throw new Error('Model feature schema does not match inference.');
  let prediction = model.initialPrediction;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.left[node] !== -1) node = x[tree.feature[node]] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
    prediction += model.learningRate * tree.value[node];
  }
  if (!Number.isFinite(prediction)) throw new Error('The model returned an invalid prediction.');
  return Math.max(0, prediction);
}
export function scenarioWarnings(model: Model, support: Support, s: Scenario): string[] {
  const warnings: string[] = [];
  if (!s.functioning) warnings.push('Service closed: new rentals are set to zero by an operating rule. This does not measure unmet demand.');
  if (seasonForDate(s.date) !== s.season) warnings.push('Experimental calendar: selected season and date disagree.');
  if (s.date < '2017-12-01' || s.date > '2018-11-30') warnings.push('This date is outside the source observation year. Current travel patterns are not represented.');
  const outside = Object.entries(support.ranges).filter(([k, range]) => (s[k as keyof Scenario] as number) < range.min || (s[k as keyof Scenario] as number) > range.max).map(([k]) => k);
  if (outside.length) warnings.push(`Outside training range: ${outside.join(', ')}.`);
  // Similarity is heuristic support information, not a confidence interval.
  const expanded = expandFeatures(s);
  const indices = support.features.map(k => model.features.indexOf(k));
  const raw = indices.map(i => expanded[i]);
  let nearestSquared = Infinity;
  for (const row of support.referenceVectors) {
    let distanceSquared = 0;
    for (let j = 0; j < raw.length; j++) distanceSquared += ((raw[j] - row[j]) / support.scale[j]) ** 2;
    if (distanceSquared < nearestSquared) nearestSquared = distanceSquared;
  }
  if (Math.sqrt(nearestSquared) > support.threshold) warnings.push('Unusual combination: few operating training examples resemble these conditions. Interpret this estimate cautiously.');
  return warnings;
}
export type LocalContribution = { label: string; fields: (keyof Scenario)[]; from: Record<string, unknown>; to: Record<string, unknown>; delta: number };
export function explainChange(model: Model, baseline: Scenario, scenario: Scenario) {
  const groups: { label: string; fields: (keyof Scenario)[] }[] = [
    { label: 'Calendar', fields: ['date', 'season', 'holiday'] },
    { label: 'Hour', fields: ['hour'] },
    ...numeric.map(field => ({ label: field, fields: [field] })),
    { label: 'Service availability', fields: ['functioning'] },
  ];
  let intermediate = { ...baseline };
  const baselinePrediction = predict(model, baseline);
  let previous = baselinePrediction;
  const contributions: LocalContribution[] = [];
  for (const group of groups) {
    if (group.fields.every(key => baseline[key] === scenario[key])) continue;
    const from = Object.fromEntries(group.fields.map(key => [key, intermediate[key]]));
    const to = Object.fromEntries(group.fields.map(key => [key, scenario[key]]));
    intermediate = { ...intermediate, ...to };
    const next = predict(model, intermediate);
    contributions.push({ ...group, from, to, delta: next - previous });
    previous = next;
  }
  const prediction = predict(model, scenario);
  return {
    method: 'Ordered input replacement: calendar, hour, temperature, humidity, wind, visibility, dew point, solar, rain, snow, availability. Contributions depend on this order and intermediate combinations. They describe the model, not causal effects.',
    baselinePrediction, prediction, delta: prediction - baselinePrediction,
    percentChange: baselinePrediction === 0 ? null : 100 * (prediction - baselinePrediction) / baselinePrediction,
    contributions,
  };
}
