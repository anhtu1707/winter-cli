thread_id: 019d3317-e6cc-7981-a0a8-dc0dbd3fccea
updated_at: 2026-03-30T08:38:12+00:00
rollout_path: C:\Users\PHUCANSOLUTIONS\.codex\sessions\2026\03\28\rollout-2026-03-28T13-18-17-019d3317-e6cc-7981-a0a8-dc0dbd3fccea.jsonl
cwd: \\?\E:\dev\18.03\my-translator
git_branch: main

# Overlay placement was tightened, then the app was rebuilt and repackaged into fresh portable and NSIS artifacts.

Rollout context: The user worked in `e:\dev\24.03\my-translator` / `e:\dev\24.03` and focused on the C++ OCR overlay app in `cpp/src/main.cpp` plus packaging scripts under `cpp/`. The key complaint was that the translated overlay was still too close to the OCR region, could still slip into the capture box, and when locked it needed to stay exactly where the user placed it. The user also repeatedly asked for fresh build artifacts after each fix.

## Task 1: Read the repo and establish packaging/runtime layout

Outcome: success

Preference signals:

- The user asked to “đọc kỹ dự án này” and later kept steering toward packaged deliverables, which suggests they want the repo understood from code/layout before any change and expect concrete artifacts after a fix.
- When the workspace contained many generated files, the agent explicitly ignored `node_modules`, `vendor`, and `dist-electron`; this matched the repo’s mixed source/build state and helped focus on the real source tree.

Key steps:

- Inspected `package.json`, `electron/*`, `src/js/*`, `src-tauri/*`, and the packaging scripts.
- Found the app is a hybrid desktop project with a C++ core in `cpp/`, Electron packaging scripts, and a large portable/installer pipeline.
- Verified `cpp/package_portable.ps1` and `cpp/package_nsis.ps1` are the canonical build paths for portable and NSIS outputs.

Failures and how to do differently:

- The repo contains many generated/bundled artifacts; a broad `rg --files` can become noisy. Narrow to source directories and packaging scripts first.

Reusable knowledge:

- For this repo, the truth for overlay behavior lives in `cpp/src/main.cpp`.
- Portable builds are produced by `cpp/package_portable.ps1`; NSIS installers are produced by `cpp/package_nsis.ps1` and can take a prebuilt portable folder as input.

References:

- [1] `package.json` showed the Electron/Tauri hybrid scripts and the repo’s packaged output folders.
- [2] `cpp/package_portable.ps1` and `cpp/package_nsis.ps1` are the packaging entrypoints.

## Task 2: Fix overlay docking so it stays outside the OCR region and behaves correctly when locked

Outcome: success

Preference signals:

- The user explicitly said the translated overlay was “bị quá sát region,” wanted it “cách ít nhất 10px,” and later insisted “khi khóa lại phải nằm cố định ở đó bắt buộc.”
- The user also demanded that “mỗi region và overlay dịch độc lập,” which indicates they expect each capture region to own its own overlay state and not be influenced by other regions.
- The repeated complaints that the overlay still “lọt text vào region” show the default acceptable behavior is stricter than simple proximity avoidance: the bar must never re-enter the capture box.

Key steps:

- Inspected `cpp/src/main.cpp` around overlay placement, drag handling, item reuse, and render flow.
- Added a region-aware overlay occupancy structure and changed collision logic so it only considers overlays belonging to the same capture region.
- Added helper functions to anchor overlays by the bar’s own region, constrain placement relative to the anchor side, and preserve stable source regions.
- Changed the drag/lock path so lock captures the current position, but the render path still constrains the locked bar away from the region.
- Increased the default dock gap from `4px` to `10px`.
- Adjusted the subtitle UI hint text to match the new behavior.
- Compile-checked with `g++.exe -fsyntax-only`, then rebuilt the C++ target.

Failures and how to do differently:

- The first lock implementation was too rigid: it preserved the locked coordinates but could still allow content to drift into the region when text height changed. The fix was to apply the same “outside region” constraint even in locked mode.
- A build initially failed because the app binary was still open and Windows locked the output file. The workaround was to build into a separate output tree (`cpp/build_overlayfix`) first, then rebuild the main `cpp/build` once the app was closed.

Reusable knowledge:

- `WM_EXITSIZEMOVE` is where manual drag state is captured; if lock should mean “freeze where the user left it,” the lock state needs its own stored coordinates, not just drag offsets.
- The overlay’s geometry must be constrained both in the auto-dock path and in the locked/manual path, otherwise a locked bar can still end up inside the region when its content size changes.
- The repo already has region-independent OCR controls via env vars `OCR_REGION_INDEPENDENT` and `OCR_ONE_LINE_PER_REGION`, but the overlay placement problem was separate from OCR grouping.

References:

- [1] `cpp/src/main.cpp:1573-1575` added locked-position state (`has_locked_position`, `locked_left`, `locked_top`).
- [2] `cpp/src/main.cpp:1808-1830` updated `set_subtitle_lock_state()` to snapshot current window position when lock turns on.
- [3] `cpp/src/main.cpp:2593` changed the default dock gap to `10`.
- [4] `cpp/src/main.cpp:2651-2656` applies locked coordinates but still constrains them outside the region.
- [5] `cpp/build/Release/tranlator monitor.exe` is the main rebuilt binary.
- [6] A separate rebuilt binary was also produced at `cpp/build_overlayfix/Release/tranlator monitor.exe` during the intermediate stage.

## Task 3: Rebuild and repack portable + NSIS artifacts after the overlay fix

Outcome: success

Preference signals:

- The user repeatedly asked “build lại portable mới” and “build luôn bảng nsis đi,” showing they want release artifacts updated immediately after code changes rather than just source edits.
- When the user said “1” after being offered choices, that indicated they want the main `Release` tree updated first, then packaging from that canonical binary.

Key steps:

- Rebuilt the main `cpp/build/Release` binary once the file lock was released.
- Packaged a new portable folder named `translator_monitor_portable_all_20260330_lockfix` from the updated Release binary using `cpp/package_portable.ps1` with `-TesseractLanguages all -PaddleLanguages all -SkipBuild -Zip`.
- Built a matching NSIS installer named `translator_monitor_nsis_all_20260330_lockfix.exe` from that portable folder using `cpp/package_nsis.ps1 -SkipPortableBuild`.
- Verified the installer size and that the packaging pipeline used the updated portable payload.

Failures and how to do differently:

- The packaging scripts are long-running; when they use downloaded OCR assets, they can take a long time and should be allowed to run to completion rather than being retried impatiently.

Reusable knowledge:

- `cpp/package_portable.ps1` can be pointed at a named portable output directory and can skip rebuilding if the Release binary is already current.
- `cpp/package_nsis.ps1` can consume a prebuilt portable directory and produce a separate installer exe.
- The latest artifact naming convention in this rollout is `lockfix`, and the older `overlayfix`/earlier portable or NSIS outputs should not be reused once the fix changes.

References:

- [1] `dist/translator_monitor_portable_all_20260330_lockfix`
- [2] `dist/translator_monitor_portable_all_20260330_lockfix.zip`
- [3] `dist/translator_monitor_nsis_all_20260330_lockfix.exe`
- [4] `cpp/package_portable.ps1 -OutputDir .\dist\translator_monitor_portable_all_20260330_lockfix -TesseractLanguages all -PaddleLanguages all -SkipBuild -Zip`
- [5] `cpp/package_nsis.ps1 -PortableDir .\dist\translator_monitor_portable_all_20260330_lockfix -OutputPath .\dist\translator_monitor_nsis_all_20260330_lockfix.exe -SkipPortableBuild`
