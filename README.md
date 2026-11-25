# RoboSynct on GitHub Pages

This repository contains the RoboSynct Web V3 release. See [Web V3](WEB_V3.md) for the changes, verification commands, and rollback. The dashboard, Studio and phone layout editor run from the static files in `docs/`. The existing Supabase project serves sign-in, telemetry, and authorized board commands. Hosting the interface requires no database import, schema changes, or firmware upload.

## Publish

The target repository is [joseph1234-web/Robosync](https://github.com/joseph1234-web/Robosync). If the files are already on the main branch, begin with step 3.

1. Extract this archive. Create or open the intended repository with GitHub Desktop. For a free GitHub account, use a public repository.
2. Copy this archive's contents into the repository directory, so `docs/index.html` is directly under the repository root's `docs` folder. Commit the files on `main` and publish or push that branch. The included `docs/.nojekyll` lets Pages serve the static assets directly.
3. Open the repository's **Settings → Pages → Build and deployment**. Select **Deploy from a branch**, **main**, and **/docs**. Save and wait for GitHub to display the site address.
4. In the existing Supabase project's **Authentication → URL Configuration → Redirect URLs**, add that exact site address, including the repository path and trailing slash. For example, use `https://joseph1234-web.github.io/Robosync/`. Keep the current website URL registered. Email confirmations and OAuth flows use this address.
5. Visit the new URL, sign in with your existing RoboSynct account, and open a known project. Verify the existing project and latest recorded time. Sign-in sessions and unsaved browser-local drafts are scoped to each website origin. Save any drafts on the original website before switching.

[GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [Supabase redirect URL settings](https://supabase.com/docs/guides/auth/redirect-urls)

## Edit the website with another account

Invite the other person's GitHub username under **Repository Settings → Collaborators** and grant the repository role they need. They can edit HTML, JavaScript and CSS in `docs/`, commit changes, and review or publish them through the configured branch. Only grant write access to people you trust with the site's sign-in code. RoboSynct project access is managed separately by the existing backend.

## Connections and updates

The ESP32 continues to upload directly to its configured Supabase endpoint. The open dashboard checks for saved readings roughly every five seconds. Actual freshness depends on the board's durable upload receipts and backlog. Cloud commands still require the existing authenticated route, an allowed output, and a board acknowledgement.

The public client configuration in `docs/public-config.js` contains the existing Supabase URL and publishable key. Keep private upload and control tokens, router passwords, account credentials and signing files outside this repository. Original release downloads and Android pairing QR codes use the existing RoboSynct host. Keep that site available for those links.

## Optional protected camera snapshots

The existing rs-media service permits the original website origin. To enable protected snapshots from Pages, the Supabase project operator can set the Edge Function environment variable `RS_PAGES_ORIGIN` to the exact GitHub Pages HTTPS origin, such as `https://joseph1234-web.github.io`, and deploy the included `supabase/functions/rs-media` to the same project using the existing function configuration. The variable contains only the origin, without a trailing slash or repository path. Browser origins cover all repositories hosted at the same account hostname, so use an account that serves trusted sites. Preserve the existing service settings. The handler still authorizes each protected request. This optional deployment is separate from publishing the static website.

## Local checks

Run `python3 tools/verify_pages.py` to check page links and module imports at both hosting paths. Run `node --test tools/*.test.mjs` with Node 22 or later to check sign-in redirect paths, Android pairing, and protected-media origin restrictions. For a local preview, run `python3 -m http.server --directory docs 8000` and open `http://localhost:8000/`. The public configuration points to the existing backend.
