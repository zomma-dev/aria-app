# Aria App

Aria App is a local-first desktop agent forked from [UI-TARS Desktop](https://github.com/bytedance/UI-TARS-desktop). The main change in this fork is a shift away from a pure screenshot-to-click loop for Local Computer tasks and toward a typed planner/executor runtime.

The current direction is:

- keep execution and verification in the Electron desktop app
- use deterministic local tools first for Finder, Terminal, and filesystem tasks
- use the sibling backend as a planner that returns one typed next step at a time
- fall back to user clarification instead of guessing or looping blindly

## What Changed

The main Local Computer path has been rebuilt around a planner/executor flow:

- `aria-app` gathers structured local state such as:
  - frontmost app
  - Desktop entries
  - Finder front window path
  - recent step history
- the desktop app tries deterministic planning first for simple local file and folder tasks
- when local planning is insufficient, it calls the sibling backend `POST /v1/plan-step`
- the backend returns one typed planner step such as:
  - `open_path`
  - `focus_app`
  - `run_terminal_command`
  - `search_path`
  - `wait_for`
  - `ask_user`
  - `finish`
- the desktop app executes and verifies that step locally

This replaces the old default pattern for Local Computer:

```txt
screenshot -> VLM -> parse low-level action -> execute -> screenshot
```

That older loop still exists in inherited packages and compatibility paths, but Local Computer is now being moved to the planner/executor runtime first.

## Current Architecture

The desktop app now owns:

- local execution
- local verification
- OS-level tool adapters
- reusable run history and hints

The sibling backend currently owns:

- planner reasoning for non-trivial next-step selection
- a compatibility `POST /v1/chat/completions` path for older UI-TARS flows
- `POST /v1/feedback`

The current Local Computer runtime is intentionally narrow. It is meant to be strong first on local file and folder tasks, not broad autonomous desktop workflows.

## Current Scope

This repo currently includes:

- the Electron desktop app in [`apps/ui-tars`](./apps/ui-tars)
- the Local Computer planner/executor runtime
- reusable markdown hints injected into planner context
- input-only speech-to-text in the composer
- a sibling Python backend in `../backend`

## Local Computer Runtime

For Local Computer, the preferred flow is now:

1. collect structured local state
2. choose a deterministic next step locally when possible
3. otherwise call the backend planner for one typed next step
4. execute locally
5. verify using tool state first
6. ask the user instead of repeating unsafe or low-confidence loops

Examples of tasks this runtime is meant to handle first:

- open a folder on Desktop
- open a known file on Desktop
- open a known file inside a known folder
- focus Finder or Terminal
- run a short, safe terminal command

Examples of tasks that are not yet first-class in this runtime:

- arbitrary multi-step scripting
- document extraction pipelines
- open-ended receipt parsing or CSV generation
- broad visual desktop automation that depends on repeated screenshot reasoning

When a task falls outside the current deterministic/tool-backed path, the runtime should degrade to `ask_user` rather than inventing a long shell script.

## Reusable Hints

The app supports reusable markdown hints in settings.

These hints are:

- stored locally in settings
- injected into planner context on future runs
- editable manually
- draftable from successful runs in the Local Computer UI

The intent is to capture reusable operational guidance, not brittle screenshot-specific instructions or exact coordinates.

## Voice Input

The composer includes input-only speech-to-text support:

- record from the mic
- transcribe with ElevenLabs from Electron main
- optionally clean the transcript into a clearer desktop task prompt
- insert the result into the normal text composer

This feature is prompt input only. It does not narrate execution.

## Repo Layout

- [`apps/ui-tars`](./apps/ui-tars): Electron desktop app
- [`packages/ui-tars`](./packages/ui-tars): inherited SDK, parser, and shared packages from upstream
- [`docs/cash-api-contract.md`](./docs/cash-api-contract.md): earlier backend contract notes
- [`docs/hackathon-plan.md`](./docs/hackathon-plan.md): earlier implementation notes
- [`scripts/run_backend.sh`](./scripts/run_backend.sh): starts the sibling backend in `../backend`

## Requirements

- macOS for the current local-desktop flow
- Node.js `>=20`
- `pnpm` via Corepack
- Python 3 for the sibling backend
- Accessibility and Screen Recording permissions

## Local Development

From the repo root:

```bash
corepack enable
corepack pnpm install
corepack pnpm run dev:backend
corepack pnpm run dev:ui-tars
```

If you want to run only the desktop app package:

```bash
cd apps/ui-tars
corepack pnpm run build:deps
corepack pnpm run dev
```

## Backend Setup

The app expects a sibling backend checkout:

```txt
./aria-app
./backend
```

Run it from the `aria-app` repo root:

```bash
corepack pnpm run dev:backend
```

That forwards to:

```bash
../backend/run.sh
```

The backend uses `../backend/.env`. At minimum, it currently expects:

- `ANTHROPIC_API_KEY`
- `VLM_MODEL=claude-sonnet-4-6` or another allowed backend model

## Desktop App Settings

Use these settings in the desktop app:

- Base URL: `http://127.0.0.1:8000/v1`
- API Key: `dummy-key`
- Model name: `cuakg-default`

The Local Computer runtime now uses:

- `POST /v1/plan-step` for planner-style local execution
- `POST /v1/chat/completions` only for compatibility with older paths
- `POST /v1/feedback` for feedback submission

`Force Workflow Mode` is still present in inherited settings, but the new Local Computer runtime is no longer designed around graph-vs-baseline routing for simple local tasks.

## macOS Permissions

Enable both in `System Settings > Privacy & Security`:

- Accessibility
- Screen Recording

During development, macOS may attribute these permissions to either:

- the Electron dev app
- your terminal app

If local automation fails, fully restart both the terminal and the app after changing permissions.

## Useful Commands

From the repo root:

```bash
corepack pnpm run dev:backend
corepack pnpm run dev:ui-tars
corepack pnpm test
corepack pnpm lint
```

From [`apps/ui-tars`](./apps/ui-tars):

```bash
pnpm run dev
pnpm run typecheck
pnpm run test
```

## Notes

- This repo still contains inherited upstream packages and older UI-TARS execution paths.
- The Local Computer planner/executor runtime is the main active architecture change.
- Some screenshot-loop code is still present as compatibility or fallback logic and has not been fully removed yet.
- Persisted Electron settings can override `.env` defaults on machines that have already run the app.
