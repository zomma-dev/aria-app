# Zomma

Zomma is a local-first desktop operator for grounded computer use. It is a product fork of the original [UI-TARS Desktop](https://github.com/bytedance/UI-TARS-desktop) project, adapted for backend-directed workflow routing, graph-aware execution, and post-run feedback.

The current focus of this repo is a hackathon demo and integration path for a grounded computer-use agent:

- `baseline`: normal agent behavior, no graph assist
- `grounded`: backend agent decides whether to retrieve and use a graph

Demo task:

> Find the Uber receipt in Downloads and create an expense report spreadsheet.

## Current Scope

This repo currently covers:

- the Electron desktop app in [`apps/ui-tars`](./apps/ui-tars)
- the Zomma renderer branding and local-first UI
- integration with a backend that exposes an OpenAI-compatible VLM endpoint
- optional post-run feedback capture
- a local stub backend for frontend testing

The desktop does not decide:

- whether a workflow has been seen before
- whether a query is similar enough to use a graph
- whether grounded behavior should fall back

Those decisions are owned by the backend.

## Product Contract

Default behavior:

- desktop sends the task normally
- backend decides whether the workflow is new, seen, or should use graph assistance

Optional demo/debug override:

- desktop exposes a `Force Workflow Mode` toggle in settings
- when enabled, desktop sends `X-Force-Workflow-Mode: baseline` or `X-Force-Workflow-Mode: grounded`
- when disabled, no force header is sent and backend owns routing

Feedback is not required to make grounded mode work. It is only used to collect signal and improve future behavior.

The backend contract is documented in [`docs/cash-api-contract.md`](./docs/cash-api-contract.md).

If you want to run this app against the sibling `desktop-agent` and `kg-agent`
projects instead of the local stub, use the bridge runbook in
[`docs/desktop-agent-bridge.md`](./docs/desktop-agent-bridge.md).

## Repo Layout

- [`apps/ui-tars`](./apps/ui-tars): Electron desktop app used for Zomma
- [`packages/ui-tars`](./packages/ui-tars): shared SDK and parsing packages inherited from the upstream stack
- [`docs/hackathon-plan.md`](./docs/hackathon-plan.md): implementation notes and demo runbook
- [`docs/cash-api-contract.md`](./docs/cash-api-contract.md): backend API contract
- [`docs/desktop-agent-bridge.md`](./docs/desktop-agent-bridge.md): run UI-TARS against `desktop-agent` with optional `kg-agent` grounding
- [`scripts/cash_stub.py`](./scripts/cash_stub.py): local stub backend for frontend testing
- [`scripts/run_ui_tars_windows.sh`](./scripts/run_ui_tars_windows.sh): one-command local verification launcher for WSL + Windows app development

## Requirements

- macOS for the current local operator workflow
- Node.js `>=20`
- `pnpm` via Corepack
- Accessibility and Screen Recording permissions

## Local Development

From the repo root:

```bash
corepack enable
corepack pnpm install
corepack pnpm run dev:ui-tars
```

If the root dev script is noisy:

```bash
cd apps/ui-tars
corepack pnpm run build:deps
corepack pnpm run dev
```

## Backend Setup

In the app settings, use:

- Provider: `Hugging Face for UI-TARS-1.5`
- Base URL: `http://127.0.0.1:8000/v1`
- API Key: `dummy-key`
- Model name: `cuakg-default`

Use `Force Workflow Mode` only when you want deterministic demo behavior:

- Off: backend-owned auto mode
- On + Baseline: force baseline behavior
- On + Grounded: force grounded behavior

## Local Stub

Run the stub backend from the repo root:

```bash
python3 scripts/cash_stub.py
```

Then point the app to:

```txt
http://127.0.0.1:8000/v1
```

You should be able to:

- start a local run
- see `POST /v1/chat/completions` hit the stub
- complete the run
- submit feedback
- see `POST /v1/feedback` hit the stub

## Desktop-Agent Bridge

If you want the Electron app to drive your local `desktop-agent` policy instead
of the safe stub, first install the Python backends into the same environment:

```bash
python3 -m pip install -e /path/to/desktop-agent
python3 -m pip install -e /path/to/kg-agent
```

Then start the packaged bridge:

```bash
desktop-agent-bridge \
  --model-provider moonshot \
  --controller-model kimi-k2.5 \
  --auto-mode grounded
```

If you are working from sibling checkouts and want explicit repo paths, you can
still pass:

```bash
desktop-agent-bridge \
  --desktop-agent-path /path/to/desktop-agent \
  --kg-agent-path /path/to/kg-agent \
  --model-provider moonshot \
  --controller-model kimi-k2.5 \
  --auto-mode grounded
```

Then point the app to:

```txt
http://127.0.0.1:8000/v1
```

Use `Force Workflow Mode` in the app settings for deterministic comparisons:

- `baseline`: `desktop-agent` without KG
- `grounded`: `desktop-agent` with `kg-agent`

See [`docs/desktop-agent-bridge.md`](./docs/desktop-agent-bridge.md) for the
full setup, including Neo4j and graph-memory requirements.

## macOS Permissions

Enable both of these in `System Settings > Privacy & Security`:

- Accessibility
- Screen Recording

During local development, macOS may associate those permissions with either the Electron dev app or your terminal app.

## Useful Commands

From the repo root:

```bash
corepack pnpm run dev:ui-tars
corepack pnpm test
corepack pnpm lint
```

From [`apps/ui-tars`](./apps/ui-tars):

```bash
pnpm run dev
pnpm run typecheck:web
pnpm run test
```

## Notes

- This repo started as a fork of UI-TARS Desktop and still contains inherited packages and infrastructure from the upstream workspace.
- The current Zomma product direction is local-first, with remote routes de-emphasized in the UI.
- Persisted Electron settings can override `.env` defaults on machines that have already run the app.
