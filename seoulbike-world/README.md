# SeoulBike World

[Open the public app](https://seoul.chanderrana096.chatgpt.site/) · [Watch the screen recording](https://seoul.chanderrana096.chatgpt.site/demo)

An interactive full-screen miniature city powered by an evaluated model of recorded Seoul bike rentals. Weather/calendar controls run inference; the resulting hourly estimate drives a deterministic trip scheduler. No language-model API or live feed is required.

## Run locally

Node 22.13+ is required.

```sh
npm install
npm run dev
```

The development server prints its local address. Keep it running when executing `npm test`, which includes real HTTP contract checks. `npm run typecheck` checks TypeScript; `npm run build` produces a Cloudflare-compatible Vinext Worker plus browser assets.

## Four responsibilities

- `training/`: official UCI data, reproducible chronological model selection, exported trees, evaluation and source attribution.
- `app/api/predict/route.ts` and `lib/inference.ts`: validated complete-vector inference, empirical support warnings, and ordered local explanations.
- `lib/world/simulation.ts`: deterministic journey starts, illustrative connected routes, docking approaches, fixed scale, and uninterrupted trip state.
- `components/world/City.tsx` and `app/page.tsx`: Three.js world, weather, camera, scenario states, notifications, comparisons and historical playback.

## Model and data

UCI Seoul Bike Sharing Demand, 8,760 hourly observations, December 2017–November 2018. Source: https://doi.org/10.24432/C5F62R. CC BY 4.0. The unmodified source CSV and checksum are included under `training/`.

Models were selected on earlier chronological validation observations, then refit on training plus validation. The final holdout is 19 September–30 November 2018 (1,752 hours). Selected gradient boosting: MAE **220.84** and RMSE **312.33 rentals/hour**. Calendar baseline: MAE **304.34**, RMSE **467.17**. Operating-only selected-model MAE is **253.05**. The model is not a present-day operations forecast.

Closed service is an explicit zero-departure rule, not an inference about unmet demand. No confidence interval is displayed. Ordered local input replacement describes a model response, depends on replacement order, and does not establish causality. Read `training/MODEL_REPORT.md` for parameters, slices, limitations and reproducibility.

Guided presets are complete historical rows from the training period. The featured 24-hour playback uses 20 September 2018, the earliest complete fully operating day in the final holdout, chosen independently of model error.

## Simulation contract

One visual journey represents **10 predicted recorded rentals**. At 1×, one real second advances one simulated minute. The model's selected hour remains fixed unless edited or advanced by historical playback. Higher predictions increase departure frequency; rider speeds and routes do not depend on the prediction. Trips retain their endpoints and departure time when predictions change. Simulation pauses while the browser tab is hidden.

Time range playback accepts start/end dates and hours, including overnight and multi-day periods. The end is exclusive; equal hours on the same date mean a full day. Each period uses actual sequential observations from `/api/history`, exported by `python3 training/export_history.py`. Continuous mode repeats the selected 24-hour window and clearly labels the cycle. Earlier source hours are demonstrations, not holdout evaluations.

One clock drives both journeys and the hourly model changes. Each hour advances exactly 3,600 simulated seconds (60 / 12 / 4 active seconds at 1× / 5× / 15×, plus prediction-loading pauses). Every boundary waits for a valid prediction. New runs reset the network; hourly transitions and continuous loops preserve journeys. Completed ranges stop automatically and the Play button replays the period. Totals include completed hours only.

Numeric notifications compare consecutive applied estimates: a signed rental count, the rounded before/after values, and percentage change. Pinned-baseline comparison is labeled separately. The event log retains messages after they fade.

Three generated surface textures add asphalt, brickwork and concrete paving; see `public/textures/README.txt`. Batched building geometry adds balconies, storefronts, awnings, parapets, solar panels and roof equipment, plus planters, seating, station signs and a fountain. Quality settings retain the same prediction and simulation behavior.

The compressed Seoul layout contains Yeouido island and the Saetgang channel, Namsan and its tower north of the Han, a palace/hanok quarter farther north, and a denser Gangnam/Jamsil skyline in the southeast. The expanded footprint adds western and southern neighborhoods, eastern river gardens, northern woodland trails and residential lanes. Twenty-four illustrative docking areas connect through 36 road junctions and five river bridges. The plan footprint is 234 × 171 units (previously 144 × 110); the nonlinear river transform is shared across the entire world. `lib/world/geography.ts` supplies the same river/road transform to scenery, road markings and journey paths. Curbs and dashes stop at junctions; approach crossings follow bridge heights. Geometry, station allocation and journey duration are illustrative; the dataset contains no station or trip-route records.

A/B replay intentionally resets to an empty network with seed **42317**, identical route configuration, scale and camera. Normal input edits preserve active journeys. Compare elapsed simulated time and departure totals, not an isolated rider count.

## City exploration and visual response

Explore Seoul provides eight camera views: overview, Han River, Namsan, Gangnam, western neighborhoods, eastern river park, northern hills and overhead map. Overview and map framing fit the expanded world to the current viewport; closer views retain detailed exploration. Activity columns respond immediately to the citywide model output (fixed scale: height 0–3,000 rentals/hour); they do not forecast individual stations. Rings pulse only on simulated departures. Cyclist halos and optional trails reference actual existing journeys. The readout separates visual starts/hour from currently riding cyclists, explains transition lag, and updates every 200 ms. FPS is measured separately over one-second windows. No visual setting changes the estimate, 10:1 scale, trip state or playback clock.

Ginkgo turns gold in autumn, cherry trees blossom in spring, deciduous crowns disappear in winter, and Namsan pines remain green. Water uses procedural ripples with variable-width curved banks, reeds, stone edges and a small cruise boat. Geometry is stylized and distances compressed; this is not a navigation map.

The richer city scene adds infill buildings with varied heights and stepped rooftops, four-sided mixed window lighting, winter branches, a market, bus shelters, parked cars and instanced pedestrians. Pedestrians are decorative and do not count as cyclists or rental starts. Their umbrellas follow rain; streetlight pools, bridge accents and river glimmers appear after dusk. The scene remains a Seoul-inspired miniature rather than a surveyed reconstruction.

Applied conditions drive a smooth day/night atmosphere, sparse drifting cloud banks, visibility-sensitive haze, independent wind-blown rain and snow particles, wet road materials, and directional snow cover on roofs, parks and pines. Cloud cover is an illustrative interpretation of humidity, precipitation and solar inputs. Snow cover remains visible with reduced motion enabled. Near-camera clouds fade to keep the city readable; phones use fewer pedestrians and weather particles. Weather updates mutate the existing scene and preserve the loaded canvas and camera.

Geographic references: [Seoul tourist map](https://english.seoul.go.kr/wp-content/uploads/2025/01/2025-seoul-tourist-mapENG.pdf), [Han River islands](https://english.seoul.go.kr/service/amusement/hangang/islands/), [Hangang cycling routes](https://english.seoul.go.kr/service/movement/seoul-public-bike/attractive-seoul-bike-tour-routes/), [Namsan planting](https://english.seoul.go.kr/april-namsan-mountain/), [ginkgo in Seoul](https://english.seoul.go.kr/marronnier-park/), [Saetgang ecology](https://english.seoul.go.kr/service/amusement/hangang/ecological-parks/).

## Video demo

`/demo` hosts a 20-second plain screen recording with native playback, a matching cover frame, a readable recording description, and an MP4 download. The city links to it from Explore Seoul and the desktop caption. Assets live in `public/demo/`; metadata preload avoids downloading the video when opening the city. The demo retains the Site's public access.

The recording shows actual controls and model results: rainy and snowy presets, holiday and service changes, numeric rental-change notifications, full-day configuration, river and Namsan views, and the completed state of a midnight-to-midnight historical run. Selected moments are trimmed and accelerated. No graphics, captions or music are added. Intermediate media and capture helpers remain in ignored `work/` and `outputs/` directories.

## Responsive layout

Desktop summaries use separate flowing side columns. Playback, camera tools and run status have a reserved bottom area. Tablets and short desktop viewports reflow into separate regions. On phones (up to 767px wide, plus short touch-screen landscape viewports), the city fills the space between a compact summary and bottom controls. Tap **Details** for current conditions, rental estimates and cycling activity. **Conditions**, **Views**, **Time range** and **More** open a bottom panel with a fixed close control and scrollable content; tapping outside also closes it. Camera selection returns directly to the city.

Mobile shows one compact signed rental-change message, with full text available in Event history. The larger weather, estimate and activity cards stay hidden until requested. Comparison, follow and historical playback status remain accessible in Details and More. Mobile update feedback replaces text within a fixed summary slot, so rental updates do not resize the loaded city. Genuine viewport changes are queued and applied immediately before rendering to avoid a blank frame. The renderer observes its own container and updates the drawing surface without resetting the camera. Rental updates, notifications and viewport changes preserve zoom, orbit and pan; selecting a viewpoint or Reset view deliberately reframes the city. The public LinkedIn post text file and its download link have been removed.

## Saved state and tools

Pinning writes a complete baseline to local browser storage. Downloads include inputs, unrounded prediction, model version, visual scale, route version, seed and baseline. Data is not shared with another user. The in-memory event log keeps the latest 1,000 events for the visit; messages can persist or fade.

Where supported, WebMCP exposes `read_seoulbike_scenario` and `apply_seoulbike_scenario`. They use the same application state and prediction service as the visible controls.

## Verification

See `VERIFICATION.md`. `npm test` covers exported-model parity, the actual prediction endpoint, deterministic scheduling, trip continuity, operating rules, bridge routes, local attribution totals, response races and retained state on service failure.
