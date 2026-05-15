thread_id: 019d8fe0-3e65-7642-8f4b-c60c307ac0c6
updated_at: 2026-04-15T06:56:09+00:00
rollout_path: C:\Users\PHUCANSOLUTIONS\.codex\sessions\2026\04\15\rollout-2026-04-15T13-42-11-019d8fe0-3e65-7642-8f4b-c60c307ac0c6.jsonl
cwd: \\?\E:\dev\07.03

# Investigated and partially fixed Qelasy timeout behavior, then the user reported watch-page control instability.

Rollout context: working directory was `E:\dev\07.03`. The repo is not a git repository at the root, so exploration and edits were done directly in `server/` and `client/`. The app serves a movie site with an Express backend (`server/index.js`) and Vite/React frontend (`client/src`).

## Task 1: Diagnose and reduce `/phim` timeouts on qelasy.com / Qelasy-backed movie pages

Outcome: success

Preference signals:

- The user asked: `https://qelasy.com/phim sao mà bị timeout quài luôn` -> they want the agent to trace the server-side cause first, not guess from the browser.
- The user’s follow-up focus was on `qelasy.com/phim` specifically -> similar incidents should be handled by checking the Qelasy path and upstream fetch flow, not broad app-wide speculation.

Key steps:

- Searched `server/index.js` for `phim`, `timeout`, `axios`, `fetch`, and found the Qelasy integration plus several timeout constants and merge logic.
- Confirmed the repo root is not a git repo (`fatal: not a git repository`), so work happened directly in `E:\dev\07.03`.
- Measured upstream Qelasy access from the dev machine; both `https://qelasy.com/` and `https://qelasy.com/phim` timed out after 30 seconds, so the upstream itself was slow/unreachable during the rollout.
- Read the Qelasy fetch path in `server/index.js`: list/detail fetches, episode scraping, and SEO fallback paths.
- Identified that `fetchQelasyMovieDetail()` was scraping many episode pages in chunks, which amplified latency when the upstream was already slow.
- Implemented a backend/frontend split so detail pages no longer scrape every episode up front:
  - `server/index.js` now has cached/stale HTML fallback for Qelasy, separate detail and episode caches, and a dedicated `/api/movie/:slug/episode/:episodeSlug` route.
  - `client/src/api/index.js` exports `fetchMovieEpisodeSource()`.
  - `client/src/pages/WatchPage.jsx` lazy-loads episode stream data and shows a loading state instead of blocking the whole page.
  - `buildMovieSeoPayload()` was updated so Qelasy slugs do not fall through to OPhim SEO lookups.
- Verified with `node --check server/index.js`, `npm test` in `server/`, and `npm run build` in `client/`; all passed.

Failures and how to do differently:

- Initial attempts to probe Qelasy directly with `Invoke-WebRequest` also timed out, confirming the issue was upstream and not just app logic.
- The first client patch failed because of encoding-mangled Vietnamese text in `WatchPage.jsx`; the fix was to inspect the exact rendered line and patch the ASCII-safe surrounding code.
- Avoid assuming the detail page should eagerly resolve every stream; for Qelasy, the reliable pattern is metadata first, stream resolution only for the currently selected episode.

Reusable knowledge:

- Qelasy is handled in `server/index.js` via `decodeMovieProviderSlug()` and `provider.source === 'qelasy'` branches.
- Qelasy HTML fetch path is `cachedQelasyHtml(...)`; after the patch it supports stale fallback and configurable timeout.
- The new episode resolver route is `GET /api/movie/:slug/episode/:episodeSlug`.
- Frontend watch pages should not block on all episode sources; they should render the player shell and resolve only the selected episode.
- `npm test` in `server/` and `npm run build` in `client/` both completed successfully after the change.

References:

- [1] Upstream probe from dev machine timed out: `Invoke-WebRequest -Uri 'https://qelasy.com/' ...` and `.../phim` both hit the 30s timeout.
- [2] `server/index.js:717` `async function cachedQelasyHtml(ttlMs, urlPath, params = {}, options = {})`
- [3] `server/index.js:1135` `async function fetchQelasyMovieDetail(rawSlug)`
- [4] `server/index.js:1179` `async function fetchQelasyEpisodeSource(rawSlug, rawEpisodeSlug = '')`
- [5] `server/index.js:1499` `app.get('/api/movie/:slug/episode/:episodeSlug', optionalAuth, async (req, res) => { ... })`
- [6] `client/src/api/index.js:123` `fetchMovieEpisodeSource(slug, episodeSlug)`
- [7] `client/src/pages/WatchPage.jsx:127` new `episodeSources` state and lazy-load path; `client/src/pages/WatchPage.jsx:1108` loading text for unresolved stream.
- [8] Validation outputs: `node --check server/index.js` exit 0; `npm test` in `server/` pass 16/16; `npm run build` in `client/` pass.

## Task 2: Watch control instability on watch pages

Outcome: uncertain

Preference signals:

- The user then said: `thanh control trong các trang watch nhiều lúc không ổn định` -> they are noticing instability in the watch-page control bar and want that area treated as a real issue, not ignored.
- Because the user framed it as “nhiều lúc không ổn định” (intermittent instability), future work should inspect event handling/state synchronization in the watch player instead of assuming a static UI bug.

Key steps:

- The rollout surfaced the watch-page control logic in `client/src/pages/WatchPage.jsx`, including custom play/pause, seek, speed, quality, skip intro, and auto-next handling.
- The page uses a mix of `useState`, refs for stable handlers, and direct video event listeners (`timeupdate`, `ended`), so control instability would likely live in this interaction layer rather than in simple routing.

Failures and how to do differently:

- No fix was completed for the control instability in this rollout.
- Future investigation should start by checking stale-closure paths, event listener cleanup, and state changes tied to `m3u8Url`, `currentEp`, `currentServer`, and `isLitePlayback`.

Reusable knowledge:

- The watch page custom player is in `client/src/pages/WatchPage.jsx` and is not a stock browser control bar.
- Relevant moving parts include `videoRef`, `hlsRef`, `handleTimeUpdateRef`, `handleEndedRef`, `episodeSources`, and the `useEffect` that binds video listeners.
- The player’s placeholder now shows a loading/error message while episode source resolution is pending, so future debugging should distinguish UI loading state from actual control breakage.

References:

- [1] `client/src/pages/WatchPage.jsx` custom player controls around the player box, speed menu, quality menu, skip intro, and auto-next toast.
- [2] `client/src/pages/WatchPage.jsx:241-244` episode derivation with `episodeSources` merge.
- [3] `client/src/pages/WatchPage.jsx:272-287` lazy load of episode source for Qelasy.
- [4] `client/src/pages/WatchPage.jsx:1108` placeholder text for unresolved stream.
- [5] `client/src/pages/WatchPage.jsx:387+` HLS setup and event listener wiring.

