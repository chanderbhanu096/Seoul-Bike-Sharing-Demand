# Release verification — 11 September 2026

## Automated checks

- Exact Python tree-export parity: all 8,760 source rows, maximum absolute discrepancy 6.82e-13 rentals/hour.
- TypeScript parity against independent Python fixtures, all 24 held-out playback hours, and local-explanation additivity.
- 1,000 versus 600 predicted rentals over one simulated hour: 100 versus 60 visual starts, exactly 40% fewer.
- Deterministic seed replay and independence from render frame partitions.
- Demand updates preserve active journey IDs, departure times and routes.
- Closed service stops new departures while active riders finish; reopening has no accumulated backlog.
- 1,000 sampled routes connect real scene docking positions and cross the river only on the shared bridge decks.
- Input validation rejects malformed scenarios; actual HTTP inference matches the exported model.
- UI-state tests resolve requests out of order and during debounce: stale responses do not replace the new scenario.
- UI-state service-failure test retains previous applied inputs and prediction with visible error state.
- Zero-baseline comparisons avoid invalid percentages.

## Browser checks

Performed in the Codex In-app Browser on an Apple M2 Mac (Mac14,7), macOS 27.0.

- Canvas CSS and render dimensions verified at 1920 × 1080. Opening the overlay preserves those dimensions.
- Observed frame-rate samples: 60 fps with detailed shadows and approximately 30 active riders. This is a local browser measurement, not a guarantee for other hardware.
- Guided rain preset: complete scenario applies, estimate 50.04/hour versus dry baseline 1,364.58/hour; UI reports 96.3% below baseline. Active activity settles gradually.
- A/B buttons return to an empty simulation with zero starts and the corresponding estimates, preserving the camera.
- Guided and single-factor panels, keyboard slider interaction, accessible controls, and current/previous prediction state inspected.
- WebMCP tools registered with expected schemas and annotations. Valid complete input changes the visible app and returns the actual result. Invalid input rejects and read-back confirms the previous scenario remains applied.
- Visual inspection caught and fixed a hidden river surface and a tree intersecting a route. Dock approach segments now share definitions with the rendered stations.

## Version 2 additions

- Numeric notification tests verify signed changes, rounded before/after values, percentage changes, zero baselines, fading, and retention in the event log.
- Historical time-window tests cover overnight, equal-hour full days, multiple dates, continuous cycles with hidden end fields, and source-boundary rejection.
- Real historical endpoint checks independently known observed totals: 6–22 September 4 = 24,502; 22–6 overnight = 6,158; 15–15 = 31,440.
- Clock tests clamp exactly to each hour. A 1,000-rental hour followed by a 600-rental hour produces 160 visual departures.
- UI checks cover hourly prediction pauses, exact range completion, replay reset, continuous 24-hour wrap without network reset, and stopping after prediction failure.
- Browser: 23:00 September 4 to 01:00 September 5 crossed midnight and stopped at 01:00, with 2,255 rounded model rentals versus 2,216 recorded rentals. Replay reproduced the totals. Both +369 and −369 popup messages visibly showed their before/after values.
- Browser: added-detail continuous playback measured 60 fps with detailed shadows and 12 active riders at 1920 × 1080 on the same M2 Mac. No browser errors were logged.
- Browser: 390 × 844 continuous controls fit without horizontal clipping; the longer panel scrolls. Desktop layout inspected at 1920 × 1080. Brick, asphalt and paving textures, rooftop details, balconies, storefronts, park furniture and nighttime windows rendered successfully.

## Version 3 additions

- Shared map transform round-trip checks cover roads, river center and both banks. Sampled routes cross water only on the three shared bridge centerlines and terminate at rendered docking positions.
- Center dashes use regular spacing with clearance for junctions and zebra crossings. Both curb directions leave junctions open. Bridge-approach zebra crossings use the ramp's surface height.
- Trail sampling reads historical positions without mutating journey state. Existing deterministic scheduler, 10:1 mapping, response-race and timeline tests remain passing.
- Activity readout changes to 5.0 visual trips/hour when the model estimate becomes 50/hour. Changing camera view leaves the model result and simulation reset counter unchanged.
- Browser: corrected curbs/crossings inspected from the overhead map; no roads intersect the expanded river outside its bridges. River noise, Yeouido, Namsan, palace, skyline and spring/autumn foliage rendered successfully.
- Browser: at 1920 × 1080 with detailed shadows and activity layers enabled, 59 fps observed with 37 active riders on the same M2 Mac and Codex In-app Browser.
- Browser: 1,364.58 → 50.04 model rentals/hour changed the departure display from 136.5 → 5.0 visual trips/hour and reduced the columns immediately, while 34 existing riders continued. The numeric popup matched the model delta. This preserves the intended distinction between new starts and concurrent riders.

## Version 4 additions

- Expanded the plan footprint from 144 × 110 to 234 × 171 units; more than twice the former area, populated on all four sides.
- Route regression checks validate 36 nodes, 24 unique valid docks, endpoints beyond every former map edge, all five bridge crossings, finite in-bounds path positions, and full-world transform/road-marking clearance. All 19 core checks and nine UI checks pass.
- Read-only route review sampled a further 5,000 journeys and reached all 24 docks and five bridges without invalid coordinates or water-level crossings. The 10:1 departure rate, fixed rider speed, deterministic replay and time-window behavior remain unchanged.
- Visual inspection caught two building overlaps in the new eastern blocks; the secondary building was moved away from the road and the pavilion garden was kept clear.
- Browser at 1920 × 1080 on the same M2 Mac: the busy commute estimate of 2,944.98/hour produced roughly 80–105 simultaneous riders; observed performance samples were 40–60 fps with detailed shadows and cycling activity layers enabled at 15×. These are local samples, not cross-device guarantees.
- The larger world fits the overview after viewport resizing. New river park, western neighborhoods and woodland viewpoints are selectable through Explore Seoul. Terrain uses varied elevations, surface shading, pines, rocks and walking trails.

## Version 5 additions (video superseded below)

- Added `/demo` with native inline video controls, a poster, optional WebVTT captions, an accessible text transcript, downloads and a return link to the city. Added a discoverable link within Explore Seoul for mobile and desktop.
- Local `/` and `/demo` both return HTTP 200. The MP4 serves `video/mp4` with HTTP 206 for a byte-range request, verifying seeking support. Poster, caption and post-text assets return HTTP 200; the WebVTT file has a valid `WEBVTT` header.
- The shipped MP4 was decoded end to end during creation and key frames were reviewed for the rental deltas and overnight hour changes. It is 1080 × 1080, approximately 45 seconds, H.264 and 23,593,840 bytes.

## Version 6 additions

- Replaced the stylized demo with a plain recording of the real public app: 20.03 seconds, 1912 × 958, 30 fps, H.264/yuv420p, 5,335,045 bytes, silent, with fast-start metadata. Only trimming, playback acceleration, browser-edge cropping and encoding were applied; no captions or graphics were added.
- Captured rainy and snowy presets, numeric increase/decrease notifications, holiday and service availability controls, a configured full day, overview/river/Namsan cameras, and the completed midnight-to-midnight run. The final video uses selected moments from the 24-hour run rather than showing every intervening hour.
- Updated both demo links, player aspect ratio/dimensions, download filename, description and chapter timings. Removed obsolete caption tracks from the superseded video and replaced its cover with an actual frame.
- Application type checking and production build passed. The final 601-frame video decoded end to end without errors; contact-sheet and targeted frame review verified the rental deltas, camera changes, completion display and exclusion of browser chrome/private screens.

## Version 7 additions

- Replaced independent HUD offsets with flowing conditions/estimate stacks, a dedicated city viewport on compact screens, and a reserved control/status bar. Compact mode handles narrow widths and short heights; the page and long inspectors scroll instead of clipping controls.
- Browser checks at 320 × 568, 390 × 844, 700 × 430 (a reduced viewport typical of desktop zoom), and 1440 × 900 found no intersections between summary cards, status text, camera tools, playback controls and the footer, and no horizontal page overflow. The 320px timeline panel fit its viewport and date fields; a full-day run started successfully. The demo header reflows at 320px.
- Cinematic mode still hides the HUD and fills its viewport. The renderer observes container resizing and disconnects that observer on cleanup. Read-only review also covered compact night-caption contrast and single-column metric panels.
- All 19 core/HTTP checks and nine UI checks passed; TypeScript and the production build passed. The historical prediction/simulation contract is unchanged.
- Shortened the public address to https://seoul.chanderrana096.chatgpt.site/. The hosting account portion is retained, as requested after explaining the custom-domain requirement.

## Version 8 additions

- Phone layouts at 320×568 and 390×844 keep the main city viewport at approximately 61% and 73% of screen height respectively, with no horizontal overflow. Large summary cards and the eight-icon desktop rail are hidden on phones.
- Verified Details and More, panel close and outside-tap dismissal, scrollable time controls at 320px, full-day start at 15×, stopping playback from Details, and river-view selection returning to the city. Full desktop controls remain visible at 1440×900.
- Mobile retains one signed rental-change notification at a time and links to full event history. Panel changes reset their scroll position.
- Removed the public LinkedIn post text asset and the demo-page download link.

## Version 9 additions

- Camera resizing now updates only the renderer dimensions and perspective projection. Initial framing and explicit viewpoint/reset actions retain their existing behavior.
- Regression coverage uses a real Three.js perspective camera with a custom zoom and orientation. Repeated mobile status-row height changes and device-size changes preserve its position, orientation and zoom while updating the projection correctly. Duplicate, zero and non-finite dimensions do not affect the camera or drawing surface.

## Scope and limits

This is an evaluated scenario explorer using a single historical year. Spatial geometry, routing, durations and station activity are illustrative. It does not provide live operations, real station occupancy, causal claims, or calibrated prediction intervals. Performance on lower-powered devices and long-running memory use has not been exhaustively benchmarked.
