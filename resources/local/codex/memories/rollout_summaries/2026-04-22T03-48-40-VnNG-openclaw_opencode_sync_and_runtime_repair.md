thread_id: 019db34d-e8ff-7873-bf94-8c67b47c5b5c
updated_at: 2026-04-22T04:14:30+00:00
rollout_path: C:\Users\PHUCANSOLUTIONS\.codex\sessions\2026\04\22\rollout-2026-04-22T10-48-40-019db34d-e8ff-7873-bf94-8c67b47c5b5c.jsonl
cwd: \\?\E:\dev\openclaw\openclaw-dock

# Added OpenCode/oc model support to OpenClaw, then repaired a bad sync that had dropped many models.

Rollout context: The repo is `E:\dev\openclaw\openclaw-dock`, with OpenClaw running in Docker and 9router/9router dashboard at `http://localhost:4000`. The user first asked to add `opencode` from 9router into OpenClaw, then reported that a bunch of existing models had disappeared, and finally clarified that the source of truth is the 9router dashboard providers page (`http://localhost:4000/dashboard/providers`).

## Task 1: Add opencode to OpenClaw model sync
Outcome: partial

Preference signals:
- The user said: `bên 9router có Providers opencode kìa thêm vào model bên openclaw đi` -> they wanted OpenClaw to include the new 9router provider/model set, not just discuss it.
- After the first sync issue, the user corrected the source with: `http://localhost:4000/dashboard/providers dùng kho này hiểu không` -> future runs should treat the dashboard/providers catalog as the source of truth for router-side model inventory.

Key steps:
- Inspected `docker-compose.yml`, `router-config.yaml`, and sync scripts to find where OpenClaw model defaults are built.
- Found that `sync-openclaw-available-models.ps1` was syncing from `/v1/models`, which only returned active runtime models, not the full dashboard catalog.
- Patched `scripts/sync-openclaw-available-models.ps1` to support extra catalog providers `oc` and `opencode`, and patched `scripts/sync-model-aliases.ps1` to try both `opencode/*` and `oc/*` for free-model aliases.
- Ran the sync successfully once and observed that the live router at that moment did not yet expose any `oc/*` or `opencode/*` models through the endpoints queried.

Failures and how to do differently:
- The first sync logic was too narrow because it used `/v1/models`; that led to a reduced model set and later loss of many defaults.
- The correct source for the router inventory is the dashboard/provider catalog, not just the active `/v1/models` list.
- The `opencode` catalog in this environment actually appears as `oc/*` in OpenClaw/router config, so future sync logic should normalize both prefixes.

Reusable knowledge:
- `sync-openclaw-available-models.ps1` now has a generic catalog expansion path for extra provider codes and label mapping for `oc`/`opencode` -> `OPENCODE`.
- `sync-model-aliases.ps1` now attempts both `opencode/...` and `oc/...` for free-model alias targets.
- Live verification showed `9router /api/models` had a much larger catalog than `/v1/models`.

References:
- `scripts/sync-openclaw-available-models.ps1`
- `scripts/sync-model-aliases.ps1`
- `docker-compose.yml`
- `router-config.yaml`
- `http://localhost:4000/dashboard/providers`
- `http://localhost:4000/api/models`
- `http://localhost:4000/v1/models`
- Observed live `oc` models in logs later included: `oc/nemotron-3-super-free`, `oc/minimax-m2.5-free`, `oc/trinity-large-preview-free`, `oc/big-pickle`

## Task 2: Restore the OpenClaw runtime after many models disappeared
Outcome: success

Preference signals:
- The user complained: `ê mất một đống models đang có luôn á` -> future work should treat model-list regressions as urgent and verify preservation against the prior-good config before making changes.

Key steps:
- Compared the live OpenClaw config inside the container with the repo snapshots and found a major reduction: the live model list had dropped from the larger catalog to only 67 router models.
- Discovered the live runtime was still using a broken fallback chain (`router/cx/gpt-5.4 -> router/cx/gpt-5.3-codex -> router/qw/qwen3-coder-plus -> router/nvidia/z-ai/glm4.7 -> router/gh/gpt-4.1`) that repeatedly failed with `max_output_tokens` schema errors, expired tokens, rate limits, and timeouts.
- Copied `openclaw.json` and cron jobs out of the container, patched the runtime config to use working `oc` models, and copied the patched files back into the container.
- Restarted OpenClaw and verified the gateway booted with `router/oc/nemotron-3-super-free` as the active model.
- Verified live routing in `9router` logs: `POST /v1/responses | oc/nemotron-3-super-free ... complete` and `oc/trinity-large-preview-free ... complete`.
- Verified the cron job `coding-plan-morning` was updated to use `router/oc/nemotron-3-super-free` and completed successfully (`lastRunStatus: ok`, `lastDurationMs: 29662`).

Failures and how to do differently:
- The CLI command `openclaw cron run coding-plan-morning` failed because the CLI requires a job id, not the cron name (`unknown cron job id` / missing `--id`). Use the numeric/UUID job id with `openclaw cron run --id ...` or the equivalent direct id form.
- Trying to run the older fallback chain kept causing `Unsupported parameter: max_output_tokens` and other provider errors; the effective fix was to switch to the `oc/*` chain that 9router actually routes successfully.
- A temporary runtime-fix directory was created locally and then removed after use; future agents should avoid leaving token-bearing config copies behind.

Reusable knowledge:
- The live OpenClaw config is stored at `/home/node/.openclaw/openclaw.json` inside the container.
- Cron state is stored at `/home/node/.openclaw/cron/jobs.json`.
- After the fix, the effective default/fallbacks were:
  - primary: `router/oc/nemotron-3-super-free`
  - fallbacks: `router/oc/minimax-m2.5-free`, `router/oc/trinity-large-preview-free`
- The `9router` logs show `oc/* -> opencode/*` routing, confirming `oc` is the externally visible prefix in this deployment.
- The working live test path was `/v1/responses` on `oc/nemotron-3-super-free`, which completed in about `10.5s` and returned usage successfully.
- OpenClaw restart was needed for the runtime model update to take effect.

References:
- Live config path: `/home/node/.openclaw/openclaw.json`
- Cron path: `/home/node/.openclaw/cron/jobs.json`
- Patched runtime values: `router/oc/nemotron-3-super-free`, `router/oc/minimax-m2.5-free`, `router/oc/trinity-large-preview-free`
- Verification evidence:
  - `gateway agent model: router/oc/nemotron-3-super-free`
  - `POST /v1/responses | oc/nemotron-3-super-free | 2 msgs | 24 tools`
  - `PENDING END | provider=opencode | model=nemotron-3-super-free`
  - `cron show 91f8f629-fb23-4765-abf9-85e9649aa9be` showed `lastRunStatus: ok`
- Important error strings encountered before the fix:
  - `Unsupported parameter: max_output_tokens`
  - `invalid access token or token expired`
  - `unknown cron job id: coding-plan-morning`
  - `Model ... not supported`

