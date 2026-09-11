import modelJson from '@/data/model/model.json';
import supportJson from '@/data/model/support.json';
import {
  predict,
  validateScenario,
  scenarioWarnings,
  explainChange,
  type Scenario,
  type Model,
  type Support,
} from '@/lib/inference';
const model = modelJson as Model,
  support = supportJson as Support;
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 16000)
      return Response.json(
        { error: 'Scenario request is too large.' },
        { status: 413 },
      );
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return Response.json(
        { error: 'A complete JSON scenario is required.' },
        { status: 400 },
      );
    }
    const errors = validateScenario(parsed.scenario);
    if (parsed.baseline) errors.push(...validateScenario(parsed.baseline));
    if (errors.length)
      return Response.json({ error: errors.join(' ') }, { status: 422 });
    const s = parsed.scenario as Scenario;
    const prediction = predict(model, s),
      warnings = scenarioWarnings(model, support, s);
    if (s.dewPoint > s.temperature)
      warnings.push(
        'Dew point exceeds air temperature. This combination is physically unusual.',
      );
    return Response.json(
      {
        prediction,
        rawPrediction: predict(model, { ...s, functioning: true }),
        modelVersion: model.version,
        warnings,
        scenario: s,
        explanation: parsed.baseline
          ? explainChange(model, parsed.baseline, s)
          : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        error:
          'Prediction unavailable. The last applied estimate is still active. Please retry.',
      },
      { status: 503 },
    );
  }
}
