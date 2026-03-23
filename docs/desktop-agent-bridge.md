# Desktop-Agent + KG-Agent Bridge

The easiest way to use this from `aria-app` is to install the sibling
`desktop-agent` and `kg-agent` repos into one Python environment, then start the
packaged `desktop-agent-bridge` command.

The bridge lets `aria-app` / UI-TARS keep its Electron UI and local operator, while the next-action policy comes from your sibling `desktop-agent` repo:

- `baseline`: plain `desktop-agent`
- `grounded`: `desktop-agent` with `kg-agent` graph review / grounding enabled

That gives you a clean demo surface for the story:

1. run the exact same task in the same desktop app
2. toggle `Force Workflow Mode`
3. show that the grounded run takes fewer steps or drifts less

## What The Bridge Does

The bridge exposes the same endpoints `aria-app` already expects:

- `POST /v1/chat/completions`
- `POST /v1/feedback`
- `GET /healthz`

Internally it:

- parses the UI-TARS request
- extracts the current screenshot and original task instruction
- calls `desktop-agent`'s `KimiAgent.predict(...)`
- optionally injects `GraphHintProvider` when mode is `grounded`
- translates the returned `pyautogui` action into UI-TARS action syntax
- returns `backend_meta` so the frontend can show workflow state and submit feedback

## Important Limitation

The bridge is best for normal desktop-productivity tasks such as Finder, browser, spreadsheet, or file-dialog workflows.

It is not a good fit for game-like actions that depend on:

- long key holds
- `mouseDown()` / `mouseUp()`
- raw cursor movement without a click target

That limitation comes from the mismatch between:

- `desktop-agent` action output: `pyautogui`
- UI-TARS action space: `click`, `type`, `drag`, `hotkey`, `scroll`, `wait`, `finished`

For your expense-report / receipt demo, that tradeoff is usually fine.

## Prerequisites

You need all three projects present as sibling folders:

- `/path/to/aria-app`
- `/path/to/desktop-agent`
- `/path/to/kg-agent`

You also need a Python environment that can import both `desktop-agent` and `kg-agent`.

At minimum, grounded mode needs:

- `neo4j` Python package
- KG dependencies from `kg-agent`
- `GEMINI_API_KEY`
- a running Neo4j instance

Baseline mode needs the `desktop-agent` runtime dependencies and your controller model credentials, such as:

- `KIMI_API_KEY` for `--model-provider moonshot`
- `ANTHROPIC_API_KEY` for `--model-provider anthropic`

## Step 0: Install The Python Backends

Recommended setup:

```bash
python3 -m pip install -e /path/to/desktop-agent
python3 -m pip install -e /path/to/kg-agent
```

That gives you a stable CLI entrypoint:

```bash
desktop-agent-bridge
```

If you are not installing `kg-agent` into the same environment yet, you can
still point the bridge at the checkout with `--kg-agent-path`.

## Step 1: Make Sure The KG Has Memory

Grounded mode only helps if the graph already contains a successful memory for the task or a closely related task.

If you have not ingested that memory yet, do that first from the `kg-agent` repo.

The `kg-agent` README already includes example commands for:

- rebuilding the graph from a known successful trajectory
- running a desktop eval with graph hints enabled

If your demo task is:

> Find the Uber receipt in Downloads and create an expense report spreadsheet

then the best setup is to ingest one successful run of that task, or a close variant, before the live comparison.

## Step 2: Start The Bridge Backend

Run the bridge from the Python environment where you installed `desktop-agent`
and `kg-agent`.

Example:

```bash
desktop-agent-bridge \
  --model-provider moonshot \
  --controller-model kimi-k2.5 \
  --auto-mode grounded
```

If you want Anthropic instead:

```bash
desktop-agent-bridge \
  --model-provider anthropic \
  --controller-model claude-sonnet-4-5 \
  --auto-mode grounded
```

If you prefer explicit sibling-repo paths during local development:

```bash
desktop-agent-bridge \
  --desktop-agent-path /path/to/desktop-agent \
  --kg-agent-path /path/to/kg-agent \
  --model-provider moonshot \
  --controller-model kimi-k2.5 \
  --auto-mode grounded
```

Helpful behavior:

- `X-Force-Workflow-Mode: baseline` -> no KG
- `X-Force-Workflow-Mode: grounded` -> KG enabled
- no force header -> uses `--auto-mode`

Check that it is up:

```bash
curl -s http://127.0.0.1:8000/healthz
```

## Step 3: Start aria-app

From this repo:

```bash
cd /path/to/aria-app
corepack enable
corepack pnpm install
corepack pnpm run dev:ui-tars
```

If the root dev script is noisy:

```bash
cd /path/to/aria-app/apps/ui-tars
corepack pnpm run build:deps
corepack pnpm run dev
```

## Step 4: Point The App At The Bridge

In Settings:

- Provider: `Hugging Face for UI-TARS-1.5`
- Base URL: `http://127.0.0.1:8000/v1`
- API Key: `dummy-key`
- Model name: `cuakg-default`

Then use `Force Workflow Mode` for deterministic demos:

- `Baseline`: plain desktop-agent
- `Grounded`: desktop-agent + kg-agent

## Step 5: Run The Comparison Demo

Recommended flow:

1. Put the desktop into the same clean start state before each run.
2. Run the task once with `Force Workflow Mode = Baseline`.
3. Record the total step count from the run or feedback payload.
4. Reset the desktop to the same start state.
5. Run the same task with `Force Workflow Mode = Grounded`.
6. Compare:
   baseline step count vs grounded step count
   drift / retries / unnecessary detours

The bridge logs the useful signals directly to stdout:

- requested mode
- effective mode
- raw `desktop-agent` code
- translated UI-TARS action
- workflow metadata

The frontend feedback POST also includes:

- `total_steps`
- `mode`
- `workflow_status`
- `retrieval_confidence`

That is usually enough to support the claim that KG grounding improves the run.

## Demo Tips

- Use the exact same desktop state and files for both runs.
- Use a task that has already been ingested into Neo4j.
- Keep the task in the productivity-UI regime rather than raw games or free-camera apps.
- Watch the bridge logs during grounded mode to confirm that the graph path is active.

## If Grounded Mode Fails To Start

The most common causes are:

- `neo4j` Python package is missing
- Neo4j is not running
- `GEMINI_API_KEY` is not set
- the Python environment only has `desktop-agent` deps but not `kg-agent` deps

If baseline works and grounded fails immediately, that almost always points to KG runtime setup rather than the Electron app.
