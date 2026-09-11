# SeoulBike World — portable evaluated model

This folder contains the reproducible training pipeline, original public data, and exported model artifacts. The application uses copies in `data/model` and the exact inference implementation in `lib/inference.ts`. After retraining, revalidate the export before replacing those files.

| File | Purpose |
| --- | --- |
| `artifacts/model.json` | Exact portable trained gradient-boosted model, ~454 kB |
| `inference.ts` | Shared Scenario type, validation, inference, warnings and local explanation |
| `artifacts/support.json` | Empirical joint-scenario support references, ~459 kB |
| `artifacts/presets.json` | Five complete actual historical input bundles |
| `artifacts/playback.json` | 24 consecutive operating final-heldout hours, 20 September 2018 |
| `artifacts/evaluation.json` | Reproducible candidate/slice metrics, split and model parameters |
| `artifacts/metadata.json` | Official source, license, units, retrieval date and CSV hash |
| `artifacts/fixtures.json` | Independent JS/Python prediction parity fixtures |
| `MODEL_REPORT.md` | Evaluation, limitations, assumptions and integration details |
| `VALIDATION.md` | Exact export and standalone TypeScript checks |
| `train.py`, `requirements.txt` | Reproducible training and export pipeline |
| `data/SeoulBikeData.csv` | Unmodified official UCI CSV |
| `verify.mjs` | Independent TypeScript tests using Node 22+ |

Selected version: `seoulbike-uci560-gbr-v1`. Held-out MAE 220.84 and RMSE 312.33 rentals/hour (operating-only MAE 253.05, RMSE 334.33). Temporal model selection and explicit closed-service gate are documented in `MODEL_REPORT.md`.

Suggested prediction-service use:

```ts
const errors = validateScenario(body);
if (errors.length) return Response.json({ error: errors.join(' ') }, { status: 400 });
const prediction = predict(model, body);
const warnings = scenarioWarnings(model, support, body);
return Response.json({ prediction, modelVersion: model.version, warnings });
```

Keep the unrounded estimate in state, and round only for labels. `predict` returns zero for closed-service inputs. Optionally obtain model-only output with `{ ...scenario, functioning: true }`, but label it as hypothetical model output; it is not a measurement of unmet demand or evidence that anyone wanted to rent during closure.

Reproduce with `python -m pip install -r requirements.txt`, `python train.py`, then `node --experimental-strip-types verify.mjs`. If the official UCI hostname fails DNS in your environment, download the exact `downloadUrl` listed in metadata separately, extract `SeoulBikeData.csv` under `data/`, and verify its SHA-256. Training never substitutes another dataset or fabricated rules.
