thread_id: 019d99fc-52cf-7f81-8507-16101046d006
updated_at: 2026-04-17T07:19:01+00:00
rollout_path: C:\Users\PHUCANSOLUTIONS\.codex\sessions\2026\04\17\rollout-2026-04-17T12-49-03-019d99fc-52cf-7f81-8507-16101046d006.jsonl
cwd: \\?\E:\dev\18.03\my-translator
git_branch: main

# Investigating local translation pipeline behavior and Argos fallback issues in `my-translator`

Rollout context: User was working in `E:\dev\18.03\my-translator` and asked iterative questions about app behavior in Vietnamese/English. The codebase is an Electron desktop app with a local Python translation pipeline, a browser-based mic fallback, and a legacy/partial Tauri surface. During this rollout the user asked about project structure, then about sound quality, latency, why `Clear` seemed to stop listening, and finally why Argos was missing / falling back unexpectedly.

## Task 1: Read project structure / understand the app

Outcome: success

Preference signals:
- The user asked only “đọc lại dự án này” and accepted a broad read-through, indicating they want a quick project re-orientation rather than a deep rewrite by default.
- Later, when asking follow-up questions, the user stayed focused on concrete runtime behavior (“nghe vẫn bị delay”, “sao bấm clear cái nó tự ngắt nghe luôn vậy”, “ủa argo đâu”), indicating they care more about observed behavior than abstract architecture.

Key steps:
- The repo root contains `electron/`, `src/`, `scripts/`, `src-tauri/`, `vendor/`, `dist-electron/`, and prebuilt runtime assets.
- `package.json` shows the app is Electron-first (`main: electron/main.cjs`) with `src/js/app.js` as the front-end app entry, `electron/main.cjs` as the bridge/IPC host, and Python scripts (`scripts/local_pipeline.py`, `scripts/setup_mlx.py`) for local runtime setup and streaming pipeline.
- `src/js/app.js` is the real orchestrator for UI state, source selection, and pipeline start/stop; `src/js/ui.js` only renders transcript state.
- `scripts/local_pipeline.py` is the streaming ASR/translation engine and already supports multiple backends: local Whisper/MLX/faster-whisper, Argos offline translation, public Google/Microsoft fallback, and external AI translation.

Failures and how to do differently:
- The rollout included a legacy Tauri plan document (`docs/03_implementation_plan.md`) that no longer matched the active implementation; the current app behavior is governed by Electron + Python, not by the older Tauri design doc.
- The repo is large and contains packaged artifacts (`dist-electron`, `node_modules`, `vendor`); future orientation should rely on entrypoints and runtime scripts, not broad file listing alone.

Reusable knowledge:
- `src/js/app.js` is the best place to understand the actual user-facing runtime state machine.
- `electron/main.cjs` is the IPC bridge that decides which Python runtime/script to spawn and how settings are passed down.
- `scripts/local_pipeline.py` owns the ASR/translation fallback logic, and its log messages are the fastest way to diagnose why a translation path changed.

References:
- [1] `package.json` scripts: `dev -> node electron/launch.cjs`, `test -> npm run test:js && npm run test:py`, `pack:win -> ... electron-builder --win nsis`
- [2] `electron/main.cjs` bridge: `ipcMain.handle('tauri:invoke'...)`, `start_local_pipeline`, `check_mlx_setup`, `run_mlx_setup`
- [3] `scripts/local_pipeline.py` emits JSON lines like `{"type":"status"}`, `{"type":"ready"}`, `{"type":"result"}`

## Task 2: Improve “hearing” quality / reduce latency / fix clear button side-effect / diagnose Argos fallback

Outcome: partial

Preference signals:
- The user repeatedly asked for specific runtime symptoms to be improved or explained: “giờ làm sao cho app nghe tốt hơn nữa được không”, “nghe vẫn bị delay á”, “sao bấm clear cái nó tự ngắt nghe luôn vậy”, and “ủa argo đâu”. This indicates they prefer symptom-driven fixes and want the next step to target the observed problem directly.
- When `Clear` appeared to stop listening, the user did not ask for a redesign; they described the visible bad effect. That suggests future agents should inspect the exact UI action path before changing capture logic.
- When they pasted logs (`[pipeline:out] {... Argos translator is not installed...}`), they wanted the explanation tied to the concrete log output, not a generic “install deps” answer.

Key steps:
- Audio capture was tightened in `src/js/audio-capture.js` by lowering the processing buffer and enabling speech-friendly capture options for microphone input (`echoCancellation`, `noiseSuppression`, `autoGainControl`, `contentHint = speech`, plus a filter/compressor/gain chain for mic).
- The browser provisional update debounce in `src/js/app.js` was reduced so partial text appears sooner.
- The Python pipeline was tuned for lower latency: smaller stdin read size, faster polling, smaller thresholds for microphone profile, and a new `audioProfile` passed from `src/js/app.js` -> `electron/main.cjs` -> `scripts/local_pipeline.py`.
- The `Clear` button behavior was fixed so it no longer forces placeholder mode while the app is running; it now keeps `Listening...` visible if the app is still active.
- The Argos issue was traced to the local runtime template: `vendor/runtime-template/win-x64/local-ai-env` lacked `argostranslate`, while the `dist-electron/.../runtime-template/...` copy did include it.
- The Electron runtime-template selection logic was adjusted so a template without required packages is skipped, and the pipeline can switch to public translation fallback with correct status messaging instead of claiming “transcript-only” and then silently using Google.

Failures and how to do differently:
- The first “make it hear better” pass improved quality but could increase perceived delay. The rollout then pivoted to latency-specific tuning; future agents should separate “quality” changes from “latency” changes and avoid mixing them in one pass.
- `Clear` initially caused a misleading UI state change because it always called `showPlaceholder()`. The correct fix was to inspect the `btn-clear` event handler rather than the transcript renderer.
- The first fallback-message patch failed because the constructor shape in `scripts/local_pipeline.py` had changed; the next attempt succeeded after re-reading the exact signature. For large Python files in this repo, re-check the exact constructor before patching.
- The repo’s `vendor/runtime-template` copy can be stale or incomplete relative to `dist-electron`; do not assume whichever template is in `vendor/` is the one actually being used successfully.

Reusable knowledge:
- `src/js/audio-capture.js` is the first place to reduce capture-side latency in the browser path.
- `scripts/local_pipeline.py` already has profile-specific ASR tuning hooks (`_apply_audio_profile`, `_apply_asr_language_profile`, `_prepare_pcm_for_asr`) and can be tuned separately for `microphone` vs `system`.
- The `Clear` button should not imply stop/end-of-session; if the app is running, it should only clear transcript state and preserve listening state.
- Argos in this app is not a separate UI feature anymore; it is an offline translator backend in the Python pipeline. If it is missing, the app can legitimately fall back to Google/Microsoft translation depending on mode and configuration.
- A runtime template is only trustworthy if it contains both the marker and the required packages; for this rollout the missing package was `argostranslate`.

References:
- [1] `src/js/audio-capture.js`: reduced `PROCESSOR_BUFFER_SIZE` to `1024`, added mic-friendly capture options and processing chain.
- [2] `src/js/app.js`: `Clear` handler now checks `this.isRunning` and uses `showListening()` instead of always showing placeholder.
- [3] `src/js/app.js` / `electron/main.cjs` / `scripts/local_pipeline.py`: `audioProfile` was threaded through the pipeline configuration and CLI.
- [4] `scripts/local_pipeline.py`: `Argos translator is not installed. Falling back to transcript-only mode.` was emitted from the `argostranslate` import failure branch; later adjusted to support fallback messaging.
- [5] Verification snippets: `vendor/runtime-template/.../Scripts/python.exe -c "import argostranslate.translate"` failed with `ModuleNotFoundError`, while the `dist-electron/...` runtime-template Python succeeded with `runtime-template-ok`.
- [6] `electron/main.cjs`: `runtimeTemplateDirs()` now includes `dist-electron/win-unpacked/resources/runtime-template/win-x64/local-ai-env` and `runtimeTemplateHasRequiredPackages()` checks for `faster_whisper`, `argostranslate`, and `transformers` before trusting a template.
