# RoboSynct Professional UI Refresh — v2.0

## Scope

This is a presentation-only update of the existing GitHub Pages website. The visual system is loaded from `docs/robosynct-ui-refresh.css?v=2.0.0` on all 26 HTML pages in `docs/`.

- Workspace: sign-in, projects, account navigation, project summary
- Dashboard: live sensor cards, progress/gauge/chart widgets, relay and RGB command surfaces, edit mode, responsive phone layout
- Dashboard Studio: edit toolbars, card controls, preview and saved layout surfaces
- Companion: Android information/downloads, phone web companion, QR pairing UI
- Supporting pages: firmware assistant, connection guides, DHT and USB sensor guides, classrooms, events/alerts, experiments, stream rules, library reviews, layout editor, widget appearance and gallery

## Design

- Professional, restrained spacing, typography, navigation and card elevation
- Existing theme palette variables remain the source of colors for Mint, Midnight, Ocean, Violet, Sunrise and Contrast
- Mobile touch areas and responsive grids remain compatible with the dashboard's existing phone columns
- Visible keyboard focus and `prefers-reduced-motion` improvements
- The stylesheet is loaded **after** each page's existing CSS to allow precise visual overrides without changing its behavior

## Not changed

- No JavaScript, HTML IDs, form names or event wiring changed
- No Supabase schema, records, policies or authentication changes
- No relay/RGB control timing, command acknowledgements, automatic replays or firmware changes
- No dashboard saved widget models, phone layout semantics or editor geometry changes
- Native Android APK is not modified by a GitHub Pages CSS update

## Smoke checks to perform after GitHub Pages deployment

1. Open the website in desktop Chrome and narrow mobile viewport; sign in/out and create/open a project.
2. Review Dashboard and Edit mode, drag-and-drop, widget settings, saved layouts and theme switching.
3. Verify that relay/RGB **requested** and **last applied** values remain distinct; CSS does not fix transport errors.
4. Visit Dashboard Studio, Android/phone companion, device/setup guides and widget gallery.
5. Confirm legibility and horizontal scrolling in Mint, Midnight and Contrast themes.
6. Compare status captions and command controls while the ESP32 is disconnected and reconnected.
7. Check keyboard navigation, focus rings and reduced-motion preference.

## Rollback

Remove the `robosynct-ui-refresh.css?v=2.0.0` link from each HTML file, or restore its prior commit; no backend or database rollback is needed.

## Release limitations

Source edits and stylesheet references were checked in GitHub. Real-browser visual validation and GitHub Pages live deployment status have **not** been confirmed.
