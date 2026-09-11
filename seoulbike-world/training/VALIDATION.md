# Model artifact verification

Completed on Apple M2 (arm64), Node 22.23.2, Python 3.14.6, NumPy 2.5.3, pandas 3.0.5 and scikit-learn 1.9.1. This checks standalone inference, not browser rendering performance.

- Source integrity: 8,760 rows, no missing values, unique consecutive hourly timestamps, and all 295 closed-service source hours have zero recorded rentals. SHA-256 appears in metadata.
- Split integrity: chronological 5,256/1,752/1,752 hours. No final-heldout observation is used to fit preprocessing, models or support thresholds, or to select model parameters or presets.
- Export parity: Python traversal of the serialized tree values versus scikit-learn for all 8,760 source rows. Maximum absolute difference **6.821210263296962e-13** rentals/hour; required tolerance 1e-9.
- Independent TypeScript parity: **21 fixtures passed** on Node, including historical observations, closure and synthetic single-factor verification inputs. Maximum absolute difference **1.4210854715202004e-13** rentals/hour; required tolerance 1e-8.
- Playback: all **24 consecutive hours of 20 September 2018** are in the final holdout and operating. Selection uses only chronological order, completeness and functioning state. Every playback estimate matches TypeScript inference within 1e-8.
- Preset integrity: all five presets are actual full source vectors from before final test. Date/season consistency and required fields pass. All five have zero similarity/range warnings as expected for stored training observations.
- Operating gate: `functioning:false` produces exactly zero. This is an availability rule, independent of model-implied activity.
- Explanation integrity: ordered local contributions sum to final prediction minus pinned-baseline prediction within 1e-8, for each preset. A zero pinned baseline yields `percentChange:null`.
- Invalid inputs: malformed calendar dates, NaN humidity, nonboolean functioning state and hour 24 are rejected.
- On this device, 100 repeated full prediction-plus-support checks averaged **0.18 ms** in the recorded run. This is a small local inference benchmark, not a Cloudflare SLA or full application performance test.

Re-run with `node --experimental-strip-types verify.mjs`. Machine-readable standalone test output is in `verification.json`. Training also asserts export parity before writing artifacts. Model candidate, final-test and slice evaluation outputs are recorded in `artifacts/evaluation.json`.
