> Production paid AI defaults OFF. Optional protected Friends Beta setup is documented in [FRIENDS_BETA.md](FRIENDS_BETA.md). MyMemory translation remains independent.


# Vercel deployment — translation is a release gate

## Architecture

React + Vite still builds the frontend to `dist`. PDF uploads, highlighting, keyboard navigation, browser IndexedDB notes, word translation, and the translation panel are unchanged.

`server/app.mjs` exports the shared Express API. `api/index.mjs` exports that same app as a Vercel Node function, without opening a listener, loading a `.env` file, or starting Vite. `server/index.mjs` remains the local/Render launcher, including `.env`, inherited proxy support and local/static frontend serving.

`vercel.json` routes `/api/*` to the Node function before the SPA fallback. The browser continues to POST to the same-origin `/api/translate`; there is no separate backend URL, client-side translation proxy, or replacement with external links. The MyMemory implementation, chunking, response format and failure behavior are unchanged. Word translation uses the same endpoint when optional AI is unconfigured.

## Settings (when deployment is authorized)

- Import `HotCrispyGranny/reading-aid` from GitHub; use the root containing `package.json`.
- Framework: Vite. Install: `npm ci --include=dev`. Build: `npm run build`. Output: `dist`.
- Node: 24.x. No `npm start` command is needed on Vercel.
- Function duration: 120 seconds, configured in `vercel.json`; keep Fluid Compute enabled and confirm the selected account/plan accepts this duration. Translation retains its 45-second timeout; optional AI retains 60 seconds.
- No environment variable or AI key is required for MyMemory translation. Optional server-only AI variables are `AI_API_KEY`, `AI_MODEL`; the full protected beta configuration is in `FRIENDS_BETA.md` (`AI_BASE_URL` is obsolete). Never prefix secrets with `VITE_`.
- `PORT`, `HOST`, the Render `NODE_VERSION` variable, `.env` files and this development environment's proxy variables are not required on Vercel. Vercel injects environment settings into the function process directly.
- `postinstall` prepares the fonts, CMaps and WASM under `public/pdf-assets`; Vite copies them into `dist`.

The free Hobby plan is subject to Vercel's current personal/non-commercial eligibility and usage limits. Publishing a cloud development environment is not a Vercel deployment. No deployment is performed by this change.

## Verification already performed

- Build/type check.
- Real HTTP requests to the exact exported function handler: full-sentence and single-word translation, cache, input validation, malformed JSON, same-origin protection, MyMemory quota/network failure, status/library/optional AI endpoints, JSON 404s.
- MyMemory is mocked only at the upstream HTTP boundary for deterministic tests. The local live MyMemory request was blocked by the development proxy with CONNECT HTTP 403. No real upstream translation success is claimed.
- Browser regression tests run against the built frontend with the production launcher. The actual Vercel routing, runtime and outbound service must still pass the post-deployment checks below. Importing the function locally is not a Vercel cloud deployment test.

## Mandatory post-deployment acceptance checks

Do not call the release successful until real in-panel translation passes. Set `SITE_URL` below to the actual Vercel URL (not a localhost address).

```bash
SITE_URL='https://YOUR-ACTUAL-DEPLOYMENT.vercel.app'
curl --fail-with-body "$SITE_URL/api/status"
curl --fail-with-body "$SITE_URL/api/translate" \
  -H 'Content-Type: application/json' \
  --data '{"text":"The temperature was maintained at 25 degrees Celsius."}'
curl --fail-with-body "$SITE_URL/api/translate" \
  -H 'Content-Type: application/json' \
  --data '{"text":"impeller"}'
```

Expected: HTTP 200 JSON with a nonempty, genuine Chinese `translation`, `provider: "MyMemory"`, and a `created` timestamp. Confirm temperature/number/negation and technical meaning against the English source. An HTML response means the API has incorrectly reached the SPA fallback. A 502 is not a passing translation check: inspect function logs and MyMemory connectivity/quota; never insert a placeholder to hide it. For protected preview deployments, log in through the browser or use Vercel's authorized protection-bypass mechanism; a login page is not an API response.

Then in the browser:

1. Upload a text-based PDF, click a sentence spanning lines, navigate with ↑/↓ and zoom. Confirm overlay alignment and full sentence boundaries.
2. Click **Translate to Chinese**. Verify an actual Chinese result appears in the panel without an AI key. Move to a second sentence and translate; delayed first results must not replace it.
3. Click a word in the source quote; verify Chinese translation and saving to vocabulary.
4. Save a permanent highlight and a note; refresh and confirm both persist. Check input arrows do not move the reading sentence.
5. Verify PDF fonts, CMaps, WASM and worker assets have no 404s. On a fresh browser/device, upload a PDF: local records intentionally do not sync between visitors.

## Remaining provider/platform limits

MyMemory has shared free-IP quotas and can rate-limit shared hosting egress. A correct deployment cannot guarantee unlimited availability or specialist translation quality. If the provider fails the real acceptance check, translation remains release-blocked even if the frontend loads. Existing retry and external-link helpers remain available, but neither counts as satisfying the in-site translation requirement.

Server caches, concurrency counters and rate limits are best-effort per warm function instance, not distributed state. Browser translation caches and notes remain durable in IndexedDB. No database is required by this change. `.local/papers` stays ignored and is not bundled; `/api/library` returns an empty list when no local papers exist, while personal PDF upload remains supported. Optional AI functionality remains intact and still needs its own server key.
