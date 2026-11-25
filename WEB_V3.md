# RoboSynct Web V3

The workspace opens on an Overview with project switching, recent alerts, device status, the latest confirmed upload, and the last reported queue size. Devices, Datastreams, Events & Logs, Automations, Dashboard Studio, and Phone Sync have dedicated entry points.

Device cards show telemetry and authenticated control contact separately. The connection wizard uses the existing board profiles and setup paths. The stream directory shows virtual labels, GPIO wiring, input/output direction, and the timestamp associated with a saved reading or board acknowledgment. Queue and device diagnostics reflect the last available report.

Dashboards use the existing layout record and widget bindings. Editing supports named sections, compatible stream selection, previews in the widget library, drag or keyboard layout changes, and the phone layout editor. Analytics displays when samples were recorded and when a known upload delay occurred. The CSV includes both timestamps.

The relay switch displays the board-confirmed output. The RGB wheel sends the selected color on release, and the brightness control sends its final value when the adjustment ends. An expired request retains its own status. Status checks start immediately after cloud acceptance. The command deadlines, controller leases, board authentication, pairing, and Supabase authorization apply.

Dashboard options can add the motor preview for this project in the current browser. The motor setup page includes an L293D and L298N direction pad, six simulated pin levels, and firmware downloads for the original ESP32 DevKit V1. Live drive control and motor pin readings use the paired board through Android 1.24.0.

The guided event editor uses saved readings for tests. Cloud thresholds are available through the existing cloud rule service when enabled in Supabase. Phone Sync shows the saved layout and active pairings. Native Android updates follow the separate APK release process.

## Verification

- `python3 tools/verify_pages.py` checks both root hosting and a repository subdirectory.
- `node --test tools/*.test.mjs` checks connection and pairing routes, the stream and widget contracts, recorded-time freshness, and command-state handling.
- `python3 tools/workspace_smoke.py` exercises desktop and phone flows in Chromium with an in-memory Supabase fixture. Install Python Playwright and Chromium before running this check, or provide the executable with `--chromium`.
- Live ESP32 round-trip timing, physical output feedback, and native Android behavior require device testing. A slow board poll can still miss a command deadline.

## Rollback

Revert the Web V3 release commit on `main`. The GitHub Pages site then serves the previous web files from `docs/`. The existing Supabase and firmware deployments are used throughout.
