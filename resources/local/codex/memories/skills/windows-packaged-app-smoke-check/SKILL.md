---
name: windows-packaged-app-smoke-check
description: Validate Windows desktop/package outputs when a repo has already built an installer or portable artifact and the real question is "does it actually run from the packaged tree?"
user-invocable: false
allowed-tools:
  - Read
  - Grep
  - Bash
---

# Windows Packaged App Smoke Check

Use this when:
- A Windows desktop app or CLI has been built and the user cares about "chạy liền không cần cài thêm gì", staged install behavior, or runtime DLL/plugin issues.
- The repo has a packaged tree, `win-unpacked`, NSIS artifact, or staged install directory that may differ from the build tree.

Do not use this when:
- The task is only source-level orientation with no packaged artifacts.
- The task is mobile/web-only and there is no Windows runtime payload to validate.

Inputs / context to gather
1. Identify the packaged artifact or staged tree the user will actually run.
2. Identify the app type and runtime handles:
   - Electron: `dist-electron/win-unpacked/resources`, `app.asar`, bundled runtime folders.
   - Qt/C++: exe path, `qt.conf`, plugin/QML directories, runtime DLLs.
   - Driver-assisted desktop apps: installer scripts, bundled tools, target-machine policy constraints.
3. Read the packaging config/scripts before debugging runtime symptoms.

Procedure
1. Validate from the packaged tree, not only the build tree.
   - Prefer the staged install directory, `win-unpacked`, or installed output over local debug binaries.
2. Smoke-test the smallest runnable surfaces first.
   - CLI: run a cheap command such as `version`.
   - Desktop GUI: launch from the packaged tree and look for a stable startup success signal or a concrete error.
3. Inventory the packaged payload.
   - Confirm runtime folders and config files are actually present beside the packaged app.
   - For Electron, check bundled runtime/template/helper folders under `resources`.
   - For Qt, check `qt.conf`, plugins, QML imports, and DLL placement.
4. If runtime startup fails, inspect dependencies before rewriting code.
   - For Qt/C++ on Windows, use `dumpbin /dependents` on the exe and relevant DLLs/plugins.
   - For Electron apps, compare source expectations against `win-unpacked/resources` and any packaged template/runtime copy.
5. If the packaging scripts generate multiple artifacts, verify names and output directories do not collide.
6. If a driver/device install is involved, separate packaging bugs from machine-policy blockers.
   - Ask for the target-machine log after any BIOS/reboot/security change.

Efficiency plan
- Start with the exact packaged tree the user will run; this avoids false confidence from debug builds.
- Use one or two concrete smoke tests first; only then expand into dependency tracing.
- Cache the verified success signal, artifact path, and runtime payload layout in notes so later checks do not repeat the same inspection.
- Stop once the packaged tree both contains the expected payload and reproduces the intended startup behavior.

Pitfalls and fixes
- Symptom: packaged app builds but fails with missing DLL/plugin errors.
  Likely cause: runtime assets were not deployed into the packaged tree.
  Fix: inspect packaged dependencies, then update install/deploy rules and retest from the staged tree.
- Symptom: one artifact overwrites another.
  Likely cause: `portable` and `nsis` targets share an output name.
  Fix: give each target a distinct `artifactName`.
- Symptom: target machine still fails after packaging fixes.
  Likely cause: machine policy or external dependency, not packaging.
  Fix: get the new machine log and separate Secure Boot/test-signing/network dependency issues from packaging issues.
- Symptom: source runtime template looks wrong but packaged app works.
  Likely cause: the packaged runtime copy is healthier than the source/vendor copy.
  Fix: compare against the actual packaged runtime and trust the one that passed imports/smoke checks.

Verification checklist
- The packaged/staged tree contains the expected runtime payload and config files.
- The app/CLI launches from that tree with a concrete success signal.
- Any dependency error strings are either resolved or explicitly traced to an external machine-policy limitation.
- Artifact names and output paths are unambiguous.
- Notes capture the exact artifact path and the smoke-test command/signal used.

