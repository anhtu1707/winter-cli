## User Profile

The user works mostly in local Windows repos through PowerShell and expects the active codebase, runtime path, and visible UI state to be read before edits. They move across mixed frontend/backend monorepos, Next.js apps, Java game stacks, Electron + Python desktop apps, C++ packaging, OCR tooling, and Docker-backed local AI tools. They also do repo-publish and Windows packaging tasks where README quality, asset wiring, and the exact shipped artifact matter.

They are symptom-driven and terse. They usually point at the exact broken effect: a route that looks wrong, a screenshot that feels misleading, a stacktrace or log file, a missing button path, a fallback that should not happen, a port/tunnel issue, or a packaged app/runtime that fails on another machine. Good collaboration means tracing that exact path first, then fixing the smallest real cause instead of giving architectural speculation.

They care about practical delivery: verified routes, real API wiring instead of mock fallbacks, build/typecheck/smoke results, packaged runtime behavior, and UI that matches the source/example layout or screenshot being discussed. They also notice when a flow is technically present but visually misleading, too large, too hidden, or using the wrong source of truth.

Repeatedly useful defaults: confirm cwd and source-of-truth first, explain concrete errors from the failing line/runtime path, prefer fresh logs when a symptom persists after a fix, preserve accepted roadmap priorities when the user gives them, and keep user-facing flows operational rather than descriptive.

## User preferences

- When the user says `doc ky du an`, `doc lai toan bo du an`, or similar, start with a real repo/runtime map from source entrypoints and active routes/files before editing.
- Treat README claims, old plans, packaged artifacts, release outputs, and mock data as potentially misleading until the active source/runtime path is confirmed.
- When the user points at a concrete symptom, fix that path directly instead of broad refactors or abstract explanations.
- When the user pastes a build log and asks `sao loi vay`, explain the first hard blocker and the exact failing line/path before chasing warnings.
- When the user pastes runtime logs, explain them against the real runtime path and selected backend/provider rather than giving generic dependency advice.
- When the user says `ok lam di` after asking what still needs work, default to implementation rather than stopping at a review list.
- When the user asks for repo docs with `tiếng việt song song luôn`, default README-like documentation updates to bilingual EN/VI formatting.
- When the user wants screenshots in a README, keep the doc self-contained with in-repo images instead of text-only descriptions.
- When the user says `đẩy lên git đi bỏ không đẩy các thứ không liên quan`, start with `git status` and exclude build/runtime/temp files by default.
- When the user corrects `agent.md`, `claude.md`, `design.md`, or `plan.md` during a push/cleanup task, treat local agent/planning docs as non-essential unless explicitly asked to version them.
- When the user points at an obvious placeholder like `"owner": "your-github-username"`, replace it against the real remote/config instead of leaving stale metadata in place.
- When the user provides an exact local asset path such as `E:\dev\app\check-crack\logo.png`, treat that repo-local file as the source of truth and reuse it directly.
- When the user asks to `build 1 file`, default Windows packaging work to a one-file executable and verify the built artifact actually launches.
- When the user says `cho nao co dung AI cung them tuong tu vay nha`, apply the same provider pattern across all AI surfaces, not one page or route.
- When the user says `them 9router hoac custom api di chu dung moi openAI the hoi kho`, do not leave new AI features OpenAI-only by default.
- When the user explicitly says `https://github.com/PaddlePaddle/Paddle.js OCR thi dung nay`, treat Paddle.js as the preferred OCR direction instead of keeping OCR on a generic OpenAI-compatible path.
- When the user says EasyOCR/Tesseract should be `on dinh giong nhu paddle, dam bao tat ca logic`, preserve parity in retry/boost/strict/fallback behavior instead of treating backend work as import/init only.
- When the user says `tesseract khong chay bi fallback roi`, verify the exact selected backend and why fallback occurred; do not stop at "some OCR backend works".
- When the user points at a screenshot and asks about a specific area, inspect the first-render state, visible affordances, and hidden sections before answering from backend capability.
- If the UI visually emphasizes one provider or one path, assume the user cares about presentation clarity, not just technical support behind the scenes.
- When the user says a slide should be `o phia tren phan Tim chuyen bay phu hop`, place it as a sibling block above the form, not inside it.
- When the user objects that the slide/source layout still looks wrong, mirror the source structure more faithfully instead of simplifying it into a single nested image.
- When the user says history/refund should be `trong trang user luon`, prefer one consolidated user portal rather than scattered standalone pages.
- When the user says the refund flow should edit the form submitted by the customer, treat `refundRequests` as the source of truth instead of inventing an admin-created refund path.
- When the user says `khong sua truc tiep nhu vay phai co nut sua tranh bam nham`, gate edits behind an explicit edit action instead of leaving inputs open by default.
- When the user wants a panel to use empty space and not look `lech`, use a balanced layout and avoid awkward floating edit panels.
- When the user says `hien len dang popup giua man hinh di`, prefer a centered popup/modal over a bulky inline expansion for admin editing flows.
- When the user says `bam luu form thi popup tu dong dong di chu`, wire save flows so the popup closes naturally through redirect/reload while preserving the current page/filter state.
- When the user says `phan sua popup trong admin bi nav de kia`, treat popup stacking above nav chrome as part of the fix, not a cosmetic detail.
- When the user asks `panigation vi du tam 100 trang la phai bam trang sau tung cai ha??`, do not leave long lists on next/prev-only paging; add direct page navigation.
- When the user says `thay ghe qua vay` after a UI improvement, keep the control visually restrained rather than over-decorating it.
- When the user says `cai nen phan so kia voi o do cho nhap de den trang nhanh di`, include a direct page-jump input instead of only page pills.
- When the user later says `user nua`, apply the same accepted UX pattern to the user portal too, not only the admin page.
- When the user says `sao tu nhien o dau cung thay vay dau can hien nay co dung duoc dau ma`, remove decorative controls that do nothing instead of leaving them visible.
- When the user asks `cai nay lam gi` about a hashed CSS-module class, trace it back to the real source class and verify whether the UI element is actually functional.
- When the user asks to `ra lai responsive di`, inspect mobile/tablet table and modal behavior proactively instead of stopping at desktop polish.
- When the user says `BO YEU CAU HOAN TIEN TU LICH SU MUA VE DI`, remove the booking-history refund shortcut instead of keeping two competing refund paths.
- If the user says `loi thi sua di` after lint/test failures are reported, patch the blocking repo-level issues instead of only documenting them.
- When smoke scripts fail with `fetch failed` or `ECONNREFUSED`, check service/process/port reachability before editing the script.
- When the user says `workflow te qua`, fix the interaction model and canvas feel first, not just copy or backend plumbing.
- When the user asks for `chay song ngu anh viet tat ca, co nut chuyen doi`, treat visible bilingual coverage as a default, not a partial page-local translation.
- If the user gives a roadmap in order like `mui ten nho lai` then `snap-to-grid, marquee select, minimap, va reroute edge handle`, treat that as accepted priority order.
- When the user says `co checkin ma chua co checkout ne` or `nut checkout chua co chuc nang kia`, fix the actual checkout flow on the primary page rather than pointing at an existing API.
- When the user asks `vi du toi muon custom lam luon thu 7 thi sao`, treat workday configuration as part of the shift model, not a hard-coded weekday assumption.
- When the user keeps hitting `409 Conflict` / `Shift time overlaps...`, verify whether the validation rule is actually correct for the business flow before preserving it.
- When the user asks `phan assigned ... khong cho gan nhan vien theo shift a ??`, expose a real assign/unassign workflow rather than a placeholder count.
- When the user says timesheets are `chua dong bo` with shifts, sync timesheet behavior from shift configuration automatically.
- When the user asks for a password/config like `pass mysql la gi vay`, answer from the real env/config source quickly instead of starting with a broad code search.
- When the user pastes a stacktrace and asks whether it explains a visible game/client symptom, tie the diagnosis back to the user-visible effect.
- When the user says the game still enters but `van khong thao tac duoc`, collect fresh runtime logs, port ownership, and live process state instead of assuming the first fix solved everything.
- On list/detail UI issues, prefer the smallest direct route-wiring fix instead of redesigning shared components.

## General Tips

- Environment default is Windows + PowerShell. Use `Get-Content -LiteralPath` for App Router files with bracketed segments like `[id]`.
- Broad scans are often noisy. Start with targeted searches in the active source directory for routes, entrypoints, collection names, config keys, or the exact error string.
- On this machine, `rg.exe` may fail with `Access is denied`; switch immediately to PowerShell-native `Get-ChildItem`, `Select-String`, and `Get-Content -LiteralPath` when that happens.
- Use `npm.cmd` rather than `npm.ps1` when PowerShell execution policy may interfere.
- In Next.js App Router work, `npm.cmd run build` is often the fastest truth source for hard blockers; fix those before discussing warnings.
- `"use client"` is not enough for browser-only libraries imported at module scope. Use a dynamic wrapper with `ssr: false` when prerender still touches client-only code.
- In these repos, stale processes and caches are common false negatives: backend port `8081` may need restart, and deleting `.next` can be the reliable recovery path before `next build`.
- For OCR backend complaints in `E:\dev\24.03`, verify selected-backend behavior with real env vars and installed language data, not only import success.
- For Tesseract-specific fallback complaints, check `TESSERACT_EXE`, `TESSDATA_PREFIX`, installed `traineddata`, backend candidate ordering, and whether `OCR_TESSERACT_BRIDGE` changed the path.
- For config/credential lookups, inspect `.env`, `.env.example`, compose files, and app-root config before searching the whole repo, and never persist secret values into memory.
- If PowerShell `Get-Content` shows mojibake for Vietnamese text, verify the actual file content with `Select-String` before rewriting documentation that may already be correct on disk.
- For Java game/client debugging, silent catches and wrong port ownership are high-probability traps; add explicit stack traces early and confirm which process actually owns the live socket.
- For raw TCP game services, do not assume an HTTP tunnel is valid just because a connection exists; verify protocol fit before treating the tunnel as healthy.
- For OpenClaw/9router catalog work, compare `dashboard/providers` or `/api/models` against live `/v1/models` before overwriting model lists; `/v1/models` may be only the active subset.
- For Windows PyInstaller packaging, a clean build venv is often faster than repairing a noisy global Python environment.
- For elevated Windows batch launchers, force repo-local cwd with `cd /d "%~dp0"` and use absolute `%~dp0script.py` paths so UAC does not shift execution into `System32`.
- For packaged Windows app checks, validate from the staged or installed runtime tree rather than assuming the build tree proves deployment success. Related skill: `skills/windows-packaged-app-smoke-check/SKILL.md`.

## What's in Memory

### E:\dev\app\Chakra

#### 2026-05-11

- Chakra repo publish cleanup, bilingual README, and GitHub publish config: README.md, tiếng việt song song luôn, docs/images/login.png, git init, .gitignore, AGENTS.md, your-github-username, electron-builder
  - desc: Repo-publish work in `cwd=E:\dev\app\Chakra`, covering bilingual EN/VI README writing with embedded screenshots, first-time git init/push cleanup, and fixing `package.json` `build.publish` to match the real GitHub remote. Search this first for Chakra repo hygiene, README rewrite, screenshot embedding, or electron-builder GitHub metadata issues.
  - learnings: `Select-String` was the reliable Unicode check when PowerShell output looked mojibake; the accepted ignore/versioning rule excludes local planning/agent docs and build/runtime folders; and the final publish config matched `https://github.com/anhtu1707/Chakra.git` with `owner: "anhtu1707"` and `repo: "Chakra"`.

### E:\dev\app\check-crack

#### 2026-05-11

- GUI logo wiring, one-file PyInstaller build, and elevation-safe launchers: logo.png, app.ico, resource_path, _MEIPASS, .venv-build, WindowsAdminToolkit.exe, cd /d "%~dp0", System32
  - desc: Windows GUI packaging work in `cwd=E:\dev\app\check-crack`, covering wiring `logo.png` into the Tkinter app, generating icon assets, building a one-file `WindowsAdminToolkit.exe`, and fixing batch launchers so they still work after UAC elevation. Search this first for repo-local branding assets, one-file packaging requests, or launcher failures that point into `C:\Windows\System32`.
  - learnings: the stable build path was a dedicated `.venv-build` with PyInstaller `--onefile --windowed` plus bundled `logo.png`/`app.ico`; the launcher fix is `cd /d "%~dp0"` plus absolute `%~dp0...py` paths; and the validated smoke signals were `ICO_OK`, `APP_ICON_OK True`, and a still-running packaged exe.

### E:\dev\web-book

#### 2026-05-07

- Refund popup editing, page-jump pagination, and fake-control cleanup in `web-book-app`: refundRequests, /quan-ly-du-lieu, /tai-khoan, returnPath, paginationJump, filterActions, tableFilterButton, overflow-x auto
  - desc: Web-book app work in `cwd=E:\dev\web-book\web-book-app`, covering centered popup editing for submitted refund requests, compact direct-jump pagination in both admin and user history views, removal of fake `Filter` controls, and responsive cleanup for tables/modals. Search this first for refund edit UX disputes, long-list pagination complaints, `filterActions` or `tableFilterButton` confusion, or small-screen admin/user portal layout issues.
  - learnings: `refundRequests` remains the source-of-truth refund flow; the accepted admin pattern is read-only details plus an explicit popup editor with hidden `returnPath`, `revalidatePath("/quan-ly-du-lieu")`, redirect, and high `z-index`; pagination should keep section-specific params like `refundPage`, `bookingPage`, and `promoPage` and include a direct page-jump input without looking heavy.

#### 2026-05-06
- Database/env config discovery in the real app root: .env, .env.example, web-book-app, MongoDB, MONGODB_URI, MONGODB_DB_NAME, Get-ChildItem, Get-Content -LiteralPath, rg.exe Access is denied
  - desc: Repo-config lookup in `cwd=E:\dev\web-book` for cases where the user wants the concrete database password/config source quickly. Search this first for `.env` discovery, app-root identification, or "MySQL password" questions in this repo.
  - learnings: the actual app root is `web-book-app`; the repo uses MongoDB rather than MySQL; and on this machine `rg.exe` failed with `Access is denied`, so PowerShell-native file discovery/read commands were the reliable path.

### E:\dev\game

#### 2026-05-06

- GoiRong backend crash, desktop audio decode failure, and cloudflared port misuse: UseItemHandler, Item.write, ArrayIndexOutOfBoundsException, client-error.log, BitstreamException, Binary.java, cloudflared, port 2907
  - desc: Debugging in `cwd=E:\dev\game` across the Java server and LibGDX desktop client. Search this first when the user reports item-use crashes, black-screen or stuck-session symptoms, `client-error.log` failures, or a client that can enter the game but cannot interact.
  - learnings: `UseItemHandler.useItemTitle()` and `Item.write()` were the real backend crash path; `client-error.log` captured a LibGDX MP3 decode failure; port `2907` should be owned by the Java server, not `cloudflared.exe`, and the observed `cloudflared tunnel --url http://localhost:2907` setup was a protocol mismatch.

### Older Memory Topics

#### E:\dev\web-book\web-book-app

- User portal and smoke connectivity: /tai-khoan, web_book_user_session, booking-history, refund-request, SMOKE_TEST_FAILED, ECONNREFUSED
  - desc: User-facing account work in `cwd=E:\dev\web-book\web-book-app`, covering the consolidated `/tai-khoan` portal for booking history and refund requests plus the smoke-script connectivity failure. Use before touching account/history/refund UX or diagnosing `scripts/smoke-admin-rbac-refund.cjs`.
- Bayre247 hero slider above the search form plus lint cleanup: hero-search.tsx, hero-search.module.css, promoSlider, searchForm, #slider-banner, react-hooks/set-state-in-effect, eslint.config.mjs
  - desc: Homepage hero/search work in `cwd=E:\dev\web-book\web-book-app`, covering the source-faithful Bayre247 promo slider above the flight search form and the lint/build cleanup needed to land it. Use when the user points at source-site hero layout or asks why the slider placement still looks wrong.

#### E:\dev\quan tri he thong

- Attendance checkout, custom shift workdays, and assignment/timesheet sync: /checkin/me, /checkin/shifts, /checkin/timesheets, workDays, Shift time overlaps, 409 Conflict, /attendance/shift-assignments
  - desc: Attendance-area fixes in `cwd=E:\dev\quan tri he thong`, covering explicit checkout behavior on `/checkin/me`, custom workday support in shifts, removal of false overlap blocking, and real shift assignment UI/data that drives timesheets. Use when check-in/check-out behavior, shift overlap logic, or timesheet sync no longer matches business flow.
- Request workflow graph editor rewrite and accepted follow-up roadmap: request/workflows, workflow te qua, graph editor, LanguageProvider, smaller arrows, snap-to-grid, marquee select, minimap, reroute edge handle
  - desc: Workflow-editor work in `cwd=E:\dev\quan tri he thong`, covering the darker bilingual graph-canvas rewrite for `/request/workflows` and the accepted follow-up priority order. Use when the workflow page feels wrong visually or interaction upgrades need to preserve the prior roadmap.
- MFA/TOTP end-to-end across backend and web: prisma, totp.ts, verify-2fa, recovery codes, auth-mfa.e2e.test.ts
  - desc: Full monorepo auth implementation for `cwd=E:\dev\quan tri he thong`, covering Prisma migration, TOTP helpers, encrypted secret storage, recovery codes, and matching web flows. Use when the user wants real backend+web alignment or auth feature expansion.
- Tunnel/WebRTC call fix with TURN guidance: trycloudflare, INTERNAL_API_ORIGIN, NEXT_PUBLIC_WEBRTC_ICE_SERVERS, coturn, docker-compose.turn.yml
  - desc: Communications fix for the same monorepo, including API-origin parameterization, configurable ICE servers, and TURN deployment guidance. Use when tunnel URLs work for signaling but calls or media fail.
- Request list click-through to detail: request/all, request/all/[id], DataTable, onRowClick, useRouter
  - desc: Minimal routing fix in `cwd=E:\dev\quan tri he thong` for making `/request/all` rows open the existing detail route. Use when a list page already has a detail route but lacks drill-down.

#### E:\dev\openclaw\openclaw-dock

- OpenClaw opencode/oc model sync and runtime repair: openclaw, 9router, dashboard/providers, /api/models, /v1/models, router/oc/nemotron-3-super-free, cron/jobs.json
  - desc: Docker/OpenClaw workflow in `cwd=E:\dev\openclaw\openclaw-dock`, covering opencode/oc provider sync from local 9router, model-list regression repair, live `/home/node/.openclaw/openclaw.json` updates, and cron model verification. Use when OpenClaw models disappear, router catalogs differ, or runtime fallbacks fail.

#### E:\dev\openclaw\openclaw-dock\openclaw-workspace\tool-scv\tool-scv

- Tool SCV app hardening, provider abstraction, and Paddle.js OCR direction: tool-scv, /subtitles, /api/workflows, 9router, custom API, OpenAI-compatible, src/lib/settings/server.ts, getOpenAICompatibleProvider, Paddle.js
  - desc: Next.js App Router work in `cwd=E:\dev\openclaw\openclaw-dock\openclaw-workspace\tool-scv\tool-scv`, covering subtitle-page shell fit, replacing visible mock fallbacks with real server-backed behavior, and adding 9router/custom OpenAI-compatible provider support across AI routes and settings. Use when the user wants the whole app to actually work, wants non-OpenAI providers everywhere AI is used, or clarifies that OCR should use Paddle.js.

#### E:\dev\openclaw\openclaw-dock\openclaw-workspace\openworld

- Next.js build fix for StatsWidget and Leaflet SSR: Next.js, npm run build, StatsWidget.tsx, CurrencyRate[], Property 'rates' does not exist, /map, Leaflet, ReferenceError: window is not defined
  - desc: Production build debugging in `cwd=E:\dev\openclaw\openclaw-dock\openclaw-workspace\openworld`. Use when `npm run build` fails on a concrete TypeScript shape mismatch or a browser-only map dependency during prerender.

#### E:\dev\24.03

- OCR backend parity and Tesseract fallback behavior: PaddleOCR, EasyOCR, Tesseract, ocr_engine.py, cpp/scripts/ocr_bridge.py, OCR_EASYOCR_HOME, TESSDATA_PREFIX, OCR_TESSERACT_BRIDGE
  - desc: OCR backend stabilization in `cwd=E:\dev\24.03`, covering bridge/runtime parity across PaddleOCR, EasyOCR, and Tesseract, EasyOCR runtime packaging support, and the follow-up complaint that Tesseract still fell back. Use when `ocr_backend=Tesseract` does not stay selected or backend parity/regression work is needed.
- OCR overlay lock behavior and release packaging: cpp/src/main.cpp, WM_EXITSIZEMOVE, default gap 10, package_portable.ps1, package_nsis.ps1
  - desc: C++ overlay placement and packaging in `cwd=E:\dev\24.03`, covering keeping overlays outside OCR regions, preserving locked manual placement, and rebuilding portable/NSIS artifacts from the fixed Release binary.

#### E:\dev\07.03

- Qelasy timeout and lazy episode resolution: qelasy, cachedQelasyHtml, /api/movie/:slug/episode/:episodeSlug, WatchPage.jsx
  - desc: Qelasy-specific upstream timeout diagnosis and the metadata-first, episode-lazy-load fix in `cwd=E:\dev\07.03`. Use when `/phim` or watch pages block on stream scraping or when stream lookup should wait for the selected episode.
- Watch control instability triage: WatchPage.jsx, videoRef, hlsRef, handleTimeUpdateRef, stale closure
  - desc: Unresolved notes on intermittent watch-page control flakiness in `cwd=E:\dev\07.03`; use when the custom player bar behaves inconsistently and you need the likely state/event hotspots first.

#### E:\dev\autoipupdate

- Cloudflare-first appearance vs multi-provider support: web/index.html, web/app.js, providerSelect, showProviderFields, Cloudflare, DuckDNS, RFC2136, Sync Cloudflare IDs
  - desc: Web manager UI inspection in `cwd=E:\dev\autoipupdate` for why the form looked Cloudflare-only even though multiple providers exist. Use when the question is about what the user actually sees on first render or whether fields are only hidden.

#### E:\dev\video-platform

- Windows packaging and staged runtime: NSIS, Qt6, windeployqt, qt.conf, harfbuzz.dll was not found, dumpbin /dependents, C:\Program Files\video-platform
  - desc: C++/Qt packaging work in `cwd=E:\dev\video-platform`, covering staged-tree smoke checks, Qt plugin/QML path fixes, and installed-directory DLL drift. Use when the user reports runtime DLL/QML failures after packaging.

#### E:\dev\18.03\my-translator

- Electron runtime, latency, and Argos fallback diagnosis: electron/main.cjs, scripts/local_pipeline.py, btn-clear, lastPipelineActivityAt, argostranslate, vendor/runtime-template
  - desc: Current Electron + Python pipeline behavior in `cwd=E:\dev\18.03\my-translator`, covering repo re-orientation, mic/system latency tuning, Clear-button behavior, and why Argos fell back based on the real runtime-template path.
