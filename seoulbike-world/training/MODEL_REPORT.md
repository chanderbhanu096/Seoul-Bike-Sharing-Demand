# SeoulBike World model card

The deployed model estimates recorded citywide bike rentals during one hour. It does not estimate unmet requests, concurrent riders, station occupancy or neighborhood demand.

## Source and license

[Seoul Bike Sharing Demand, UCI dataset 560](https://archive.ics.uci.edu/dataset/560/seoul+bike+sharing+demand), [DOI 10.24432/C5F62R](https://doi.org/10.24432/C5F62R). UCI licenses this dataset under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: *Seoul Bike Sharing Demand [Dataset]. (2020). UCI Machine Learning Repository. https://doi.org/10.24432/C5F62R.*

The official CSV contains 8,760 consecutive hourly observations from 1 December 2017 to 30 November 2018. Dates are parsed explicitly as day/month/year. No missing values, duplicate timestamps or gaps were found. The model pipeline renames columns and expands calendar features; the included CSV is unmodified. SHA-256: `373339b71a8935d69e9af0abf26a70744632119862eeb3919efb389a7b749c60`.

Weather units preserve the source: °C temperature and dew point, % humidity, m/s wind, **10 m visibility** (2000 means 20 km), MJ/m² solar radiation, mm rainfall, cm snowfall.

## Evaluation design

Observations are sorted by timestamp. The first 60% train candidate models, the next 20% select the family/configuration by MAE, and the final 20% are reserved for evaluation. No random train/test shuffling is used.

| Partition | Inclusive period | Hours | Operating hours |
| --- | --- | ---: | ---: |
| Candidate training | 2017-12-01 00:00–2018-07-07 23:00 | 5,256 | 5,208 |
| Validation | 2018-07-08 00:00–2018-09-18 23:00 | 1,752 | 1,728 |
| Final untouched test | 2018-09-19 00:00–2018-11-30 23:00 | 1,752 | 1,529 |
| Final model fit | 2017-12-01 00:00–2018-09-18 23:00 | 7,008 | 6,936 |

Predictors fit only operating training hours. Every model uses the same explicit service rule: **when `functioning` is false, recorded rentals are zero**. Non-operating hours remain in evaluation and are also reported separately. This rule represents availability, not an inference about whether people wanted bikes. All source closed hours have zero recorded rentals.

The calendar baseline uses the operating-training mean by hour × weekend × season, falling back to hour × weekend and then the overall mean. Ridge uses standardized features, with the scaler fitted only on active training observations. Both boosted-tree candidates use 450 trees, learning rate 0.05, squared-error loss, minimum leaf size 12 and fixed random state 20260911; only maximum depth differs. Calendar features contain raw hour, cyclic hour/day-of-year, weekday/hour/season indicator variables, weekend and holiday. No lagged targets are needed for arbitrary scenarios.

| Candidate | Validation MAE | Validation RMSE | Final-test MAE | Final-test RMSE |
| --- | ---: | ---: | ---: | ---: |
| Calendar baseline | 367.42 | 531.17 | 304.34 | 467.17 |
| Ridge, α = 100 | 520.41 | 612.83 | 228.22 | 330.81 |
| Gradient boosting, depth 3 | 271.94 | 364.44 | 235.87 | 333.70 |
| **Gradient boosting, depth 4 — selected** | **252.97** | **344.95** | **220.84** | **312.33** |

Metrics are in rentals/hour. Selection used validation MAE only. The selected configuration was then refitted to the earlier 80%; final-test scores did not drive any model revision or preset selection. The fixed pipeline can be rerun to reproduce all results. Final-test MAE improves 27.44% over the calendar baseline. **On operating test hours alone, MAE is 253.05 and RMSE is 334.33**, since the aggregate includes 223 explicit zero-availability hours.

## Final-test slices for the selected model

| Slice | Hours | MAE | RMSE |
| --- | ---: | ---: | ---: |
| Dry | 1,672 | 222.73 | 314.92 |
| Rain | 80 | 181.33 | 252.17 |
| Snow | 51 | 166.34 | 215.14 |
| At/below 0°C | 22 | 276.78 | 394.92 |
| Operating | 1,529 | 253.05 | 334.33 |
| Closed | 223 | 0.00 | 0.00 |
| 00:00–05:00 | 438 | 92.94 | 127.04 |
| 07:00–09:00 | 219 | 357.24 | 460.23 |
| 10:00–16:00 | 511 | 187.28 | 255.18 |
| 17:00–19:00 | 219 | 405.47 | 497.54 |
| 20:00–23:00 | 292 | 261.16 | 314.19 |

Weather slices overlap and have unequal sample counts. Cold/snow conclusions are limited by small samples. Large peak-hour errors and seasonal shift are material limitations; “95% accurate” would be an unsupported description.

## Portable inference and verification

`artifacts/model.json` is a 454 kB exact tree export, identified as `seoulbike-uci560-gbr-v1`. `inference.ts` has no external dependencies and can run on a Cloudflare Worker. For each tree, traverse from node zero using `feature <= threshold`; the leaf contribution is multiplied by the learning rate and added to the initial prediction. Expanded features are converted to float32 before comparison, matching scikit-learn's tree input precision. The result is clamped to zero, with the service gate applied first. Do not round until display.

Python export traversal matches scikit-learn for **all 8,760 observations**, maximum absolute difference below 7e-13 rentals/hour. Independent Node execution of the TypeScript implementation passes 21 fixtures, the 24 held-out playback hours, closed-service zero, invalid-input rejection, zero-baseline percentage handling and additive explanation checks. Runtime/version details and tolerance are recorded in JSON.

`artifacts/support.json` adds an empirical similarity heuristic. It compares the scenario to 6,936 operating training observations in standardized weather, cyclic hour, weekend and holiday features. Its distance warning threshold is the 99th percentile of training leave-one-out nearest-neighbor distance. Range warnings use final-training extrema. The support check does **not** provide uncertainty or a probability of error. No prediction interval is displayed because interval coverage has not been evaluated.

## Presets, playback and local explanations

Five presets carry complete, actual historical feature bundles: a sunny dry autumn afternoon, rainy afternoon, winter snow, evening commute and quiet night. They are selected from pre-test observations with declared weather/time criteria, not low model errors. `sourceRow` is the one-based CSV line including its header. Their `partition` explicitly says whether they were candidate training observations or validation observations reused in the final fit. They are demonstration inputs, not final-test evidence.

`artifacts/playback.json` contains every hour of **20 September 2018**, the earliest complete final-heldout day with all 24 hours operating (selected solely on availability and completeness). It includes observed recorded rentals and estimates from the deployed final-fit model. No fit uses these rows.

`explainChange` computes a local, additive explanation by ordered replacement from the pinned baseline: calendar (date, season and holiday together), hour, temperature, humidity, wind, visibility, dew point, solar, rain, snow and service availability. Each displayed contribution is an actual difference between predictions. Contributions sum to the final estimate change, but depend on replacement order and sometimes implausible intermediate combinations. They are **associative model descriptions, not causal weather effects**. This limitation must appear in the explanation panel.

## Integration contract

- Keep the complete Scenario vector in state; changes must preserve unedited values. Guided presets replace the complete vector. Guided date edits also derive the season. Mark isolated input edits as experimental.
- Return the model's unrounded estimate and version. Show loading/failure states; retain the previous estimate on failure and reject stale responses.
- The world scheduler should consume this single estimate with one documented, fixed visual sampling scale. Weather must not apply a second demand multiplier. Active journeys finish when estimates change.
- `scenarioWarnings` covers training ranges, unusual joint combinations, date/season mismatch, dates outside the observed year and service closure.
- Save the full input vector, unrounded prediction, model version, simulation seed and visual scale with each saved scenario.
- Keep source attribution accessible in the product. Clearly label city routes and station activity as illustrative. Data from 2017–2018 do not represent current travel patterns or real station-level forecasts.

## Reproduce

Create a Python environment, install `requirements.txt`, then run `python train.py` from this directory. The script downloads the official archive only when the CSV is absent. Model selection, data validation, support fitting, export verification and all JSON generation happen in this one pipeline. Use `node --experimental-strip-types verify.mjs` (Node 22+) for independent TypeScript verification. Download metadata, runtime versions, model parameters and full numeric results are in `artifacts/metadata.json` and `artifacts/evaluation.json`.
