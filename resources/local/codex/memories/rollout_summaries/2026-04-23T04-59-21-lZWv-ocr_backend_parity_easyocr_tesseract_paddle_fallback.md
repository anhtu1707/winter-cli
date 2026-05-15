thread_id: 019db8b4-fb31-7e32-a482-f3fa9a711367
updated_at: 2026-04-23T05:21:09+00:00
rollout_path: C:\Users\PHUCANSOLUTIONS\.codex\sessions\2026\04\23\rollout-2026-04-23T11-59-21-019db8b4-fb31-7e32-a482-f3fa9a711367.jsonl
cwd: \\?\E:\dev\24.03

# OCR backend stabilization across PaddleOCR, EasyOCR, and Tesseract in `E:\dev\24.03`

Rollout context: the user wanted the OCR backend layer to behave like PaddleOCR, but with EasyOCR and Tesseract also stable and all logic preserved. The work touched the Python OCR bridge, the C++ OCR engine, the app/backend selection logic, portable packaging, and onefile bootstrap env setup.

## Task 1: Make EasyOCR/Tesseract behave more like PaddleOCR in the OCR pipeline

Outcome: success

Preference signals:

- The user asked: “phần ocr backend, có paddleocr, easyocr, tesseract nhưng chỉ có paddle chạy ổn giờ tôi cần làm easyocr, tesseract chạy ổn định giống như paddle, đảm bảo tất cả logic nhé” -> future work should treat “keep all logic” as a requirement to preserve retry/boost/fallback/strict behavior, not just make backend init succeed.
- The user’s wording focused on parity with PaddleOCR (“chạy ổn định giống như paddle”) -> future similar requests should default to checking whether EasyOCR/Tesseract are using the same preprocessing/retry path rather than only adding support superficially.

Key steps:

- Inspected `cpp/scripts/ocr_bridge.py`, `ocr_engine.py`, `cpp/src/ocr_engine.cpp`, `cpp/src/main.cpp`, and packaging/bootstrap files to find the real split: Paddle/EasyOCR go through Python bridge, while Tesseract had a native C++ path with its own TSV parsing.
- Verified that EasyOCR init worked but downloaded its models on first run, while `tesseract` was not available in the dev PATH and Tesseract support needed explicit executable + tessdata handling.
- Built a smoke image (`build/ocr_smoke_english.png`) and verified all three backends could read it through the bridge after the fixes.
- Verified bridge stdio mode by sending a JSON OCR request and receiving the expected JSON response.
- Rebuilt the C++ target successfully after a temporary linker lock on `cpp\build\Release\tranlator monitor.exe` cleared.

Failures and how to do differently:

- The initial C++ build failed because `cpp\build\Release\tranlator monitor.exe` was locked by a running process. A separate build directory (`cpp\build_ocr_backend_fix`) confirmed the source compiled; afterward the main build succeeded once the lock cleared.
- Tesseract’s existing Python-side path could look “healthy” even when executable/language data was missing. Future Tesseract work should verify both executable and language pack availability explicitly.

Reusable knowledge:

- `ocr_engine.py` now has backend-specific language mapping instead of reusing Paddle mappings for every backend.
- EasyOCR got `OCR_EASYOCR_HOME` support so portable/runtime builds can pin its model cache.
- Tesseract now resolves and validates `tesseract.exe` and `TESSDATA_PREFIX` in Python, and can fail fast with a clear “Missing Tesseract language data for …” message.
- The bridge script now suppresses OCR stdout/stderr noise during model loading and OCR calls so JSON protocol responses are not polluted.
- The bridge retry/boost logic was generalized beyond Paddle to also apply to EasyOCR and Tesseract.
- In C++, the parsing of Python bridge OCR results no longer drops retry results by reapplying the `min_score` filter; it parses with `0.0f` and relies on the bridge to filter appropriately.
- `cpp/src/main.cpp` now treats `Tesseract` as a heavy OCR backend for scheduling/fallback behavior, and backend fallback order was extended so EasyOCR/Tesseract can fall back to Paddle too.
- `app.py` was adjusted so backend fallback candidates are symmetric: Paddle can fall back to EasyOCR/Tesseract, EasyOCR can also fall back to Paddle/Tesseract, and Tesseract can fall back to Paddle/EasyOCR.
- Portable packaging now supports EasyOCR prefetch into `runtime\easyocr_home` via `-EasyOcrLanguages` and writes a `portable_easyocr_langs.txt` manifest.

References:

- [1] Smoke OCR results:
  - Paddle: `{"blocks": [{"left": 41, "top": 46, "right": 538, "bottom": 90, "text": "HELLO WORLD 123", "score": 0.9693211913108826}]}"
  - EasyOCR: `{"blocks": [{"left": 33, "top": 35, "right": 549, "bottom": 103, "text": "HELLO WORLD 123", "score": 0.9880458029866969}]}"
  - Tesseract: `{"blocks": [{"left": 44, "top": 48, "right": 203, "bottom": 89, "text": "HELLO"}, ...]}`
- [2] Stdio server smoke for EasyOCR:
  - ready: `{"ok": true, "event": "ready"}`
  - response: `{"id": 1, "ok": true, "blocks": [{"left": 33, "top": 35, "right": 549, "bottom": 103, "text": "HELLO WORLD 123", "score": 0.9880458029866969}]}`
- [3] Stdio server smoke for Tesseract:
  - ready: `{"ok": true, "event": "ready"}`
  - response: `{"id": 1, "ok": true, "blocks": [{"left": 44, "top": 48, "right": 203, "bottom": 89, "text": "HELLO", ...}, ...]}`
- [4] Build verification: `cmake --build cpp\build --config Release --target trans_monitor_cpp` completed successfully and produced `E:\dev\24.03\cpp\build\Release\tranlator monitor.exe`.
- [5] Syntax/parse checks: `python -m py_compile ocr_engine.py cpp\scripts\ocr_bridge.py app.py` and PowerShell parse of `cpp\package_portable.ps1` both succeeded.

## Task 2: Tesseract fallback complaint after the backend changes

Outcome: partial

Preference signals:

- The user later said: “tesseract không chạy bị fallback rồi” -> future similar runs should assume the user notices and cares when Tesseract silently falls back to another backend instead of staying on Tesseract.
- This implies a strong preference for backend selection transparency: if Tesseract is chosen, future agents should make sure the app either uses Tesseract directly or reports exactly why it could not.

Key steps:

- The rollout identified that Tesseract could still fall back to other backends if its executable/lang data were missing or if the backend init path preferred another engine.
- A partial mitigation was added: Tesseract now has a bridge fallback path and more explicit environment validation, but the rollout ended with the user still reporting fallback behavior.

Failures and how to do differently:

- If the user explicitly wants Tesseract and it falls back, future agents should verify the exact reason: missing `tesseract.exe`, missing `TESSDATA_PREFIX`/traineddata, unsupported language mapping, or backend candidate ordering.
- Do not assume “backend works” just because another engine initializes successfully; confirm the selected backend is the one actually used at runtime.

Reusable knowledge:

- `cpp/src/main.cpp` backend candidate ordering is what determines fallback behavior in the C++ app.
- `cpp/src/ocr_engine.cpp` can use a Python bridge fallback even for Tesseract if `OCR_TESSERACT_BRIDGE` is not disabled.
- `ocr_engine.py` now checks Tesseract executable and language data explicitly; failure there should be surfaced clearly instead of silently switching engines.

References:

- [1] User complaint: `tesseract không chạy bị fallback rồi`
- [2] Relevant runtime knobs added in the rollout:
  - `OCR_TESSERACT_BRIDGE`
  - `TESSERACT_EXE`
  - `TESSDATA_PREFIX`
- [3] Build and smoke verification were successful for the combined backend work, but the user’s last message indicates the Tesseract-specific fallback behavior still needed follow-up.

