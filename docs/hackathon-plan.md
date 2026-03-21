# Hackathon Plan: Jihyun's Workstream - Desktop App + Integration

## Context

We're building a grounded computer use agent that learns from human feedback. The demo shows the same task in two modes:

- `baseline`: normal agent behavior, no graph assist
- `grounded`: backend agent decides whether to retrieve and use a graph

Task for the demo:
"Find the Uber receipt in Downloads and create an expense report spreadsheet."

Jihyun owns:

- UI-TARS desktop app setup on macOS
- integration with Cash's backend
- optional feedback UI in the desktop app
- demo environment and runbook

Constraint: about 4-6 hours.

## Working Assumptions

1. Desktop does not decide whether a task has been seen before.
2. Desktop does not decide whether a query is "similar enough" to use a graph.
3. Backend owns graph lookup, similarity, retrieval, fallback, and execution policy.
4. Desktop should default to backend-owned routing, with an optional force-mode override for demo/debugging.

## Demo Contract

### Mode selection

Default behavior:

- desktop sends the task normally
- backend decides whether the workflow is new, seen, or should use graph assistance

Demo/debug override:

- desktop exposes a `Force Workflow Mode` toggle in settings
- when enabled, desktop sends `X-Force-Workflow-Mode: baseline` or `X-Force-Workflow-Mode: grounded`
- when disabled, no force header is sent and backend owns routing

Everything else stays the same:

- `VLM_PROVIDER=Hugging Face for UI-TARS-1.5`
- `VLM_BASE_URL=http://localhost:8000/v1`
- `VLM_API_KEY=dummy-key`

### Backend responsibility

When force mode is `baseline`:

- do not use graph retrieval
- run normal VLM-backed behavior

When force mode is `grounded`:

- backend agent decides whether to fetch and use a graph
- backend agent decides whether the query is similar enough
- backend agent handles fallback if no graph should be used

When no force mode header is present:

- backend owns normal routing
- frontend behaves identically regardless of whether the workflow is new or seen

### Feedback responsibility

Feedback is not a prerequisite for the grounded run.

Feedback is only for:

- collecting positive or negative signal
- saving traces for future learning
- supporting the story of "learning from human feedback"

## Phase 1: Get UI-TARS Running (60 min, hard time-box)

### Steps

```bash
cd UI-TARS-desktop
pnpm install
pnpm run dev:ui-tars
```

Fallback if the root dev script is noisy:

```bash
cd UI-TARS-desktop/apps/ui-tars
pnpm run build:deps
pnpm run dev
```

### macOS permissions

Grant when prompted:

- System Settings -> Privacy & Security -> Accessibility -> add UI-TARS
- System Settings -> Privacy & Security -> Screen Recording -> enable UI-TARS

### Verify

- app launches
- home screen shows operator options
- "Local Computer" opens the local operator chat UI

### Potential issues

- `sharp` native module: run `pnpm rebuild sharp`
- `@computer-use/nut-js` requires Accessibility permission
- Node `>=20.x` required

### Fallback

If local build is not usable after 45-60 minutes:

- use the pre-built DMG from GitHub Releases
- configure model settings through the Settings UI

## Phase 2: Point UI-TARS at Cash's Backend (20 min)

### Preferred approach

Use the Settings UI, not only `.env`.

Reason:

- `.env` only provides defaults
- persisted `electron-store` settings can override `.env` on a machine that has already run the app

### Settings to enter

For both modes:

- Provider: `Hugging Face for UI-TARS-1.5`
- Base URL: `http://localhost:8000/v1`
- API Key: `dummy-key`

Leave the normal model name alone.

Use the `Force Workflow Mode` toggle only when you need deterministic demo behavior:

- Off: normal backend-owned auto mode
- On + Baseline: force baseline behavior
- On + Grounded: force grounded behavior

### Optional `.env`

Use `.env` only if starting from a clean settings state.

Example base config:

```env
VLM_PROVIDER=Hugging Face for UI-TARS-1.5
VLM_BASE_URL=http://localhost:8000/v1
VLM_API_KEY=dummy-key
VLM_MODEL_NAME=cuakg-default
```

### Verify

- open DevTools
- send a test instruction
- confirm requests go to `http://localhost:8000/v1/chat/completions`

## Phase 3: Backend Contract to Share With Cash (share immediately)

### Endpoint 1: VLM proxy

```txt
POST http://localhost:8000/v1/chat/completions
```

UI-TARS will send standard OpenAI-compatible chat completion requests.

Normal product flow:

- backend decides routing with no frontend override

Optional demo/debug override:

- `X-Force-Workflow-Mode: baseline`
- `X-Force-Workflow-Mode: grounded`

Example request shape:

```json
{
  "model": "cuakg-default",
  "messages": [
    { "role": "system", "content": "<system prompt with action space>" },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "<instruction or <image>>" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ],
  "max_tokens": 65535,
  "temperature": 0,
  "top_p": 0.7
}
```

Example response shape:

```json
{
  "choices": [
    {
      "message": {
        "content": "Thought: I should open Downloads\nAction: click(start_box='(0.12, 0.55)')"
      }
    }
  ],
  "usage": {
    "total_tokens": 100
  }
}
```

### Backend behavior

If header `X-Force-Workflow-Mode: baseline` is present:

- bypass graph usage
- run default VLM behavior

If header `X-Force-Workflow-Mode: grounded` is present:

- backend agent decides whether to retrieve a graph
- backend agent decides whether the instruction is similar enough
- backend agent decides whether to use graph guidance, partial graph guidance, or fallback behavior

Desktop should not implement any query similarity logic.

If no force header is present:

- backend decides normal routing on its own

### Endpoint 2: Feedback

```txt
POST http://localhost:8000/v1/feedback
```

Suggested payload:

```json
{
  "session_id": "stable-session-id",
  "instruction": "Find the Uber receipt in Downloads and create an expense report spreadsheet",
  "feedback": "positive",
  "timestamp": "2026-03-21T14:30:00Z",
  "action_trace": [
    {
      "step": 1,
      "action_type": "click",
      "thought": "Open Finder",
      "action_inputs": { "start_box": "(0.45, 0.32)" },
      "reflection": null
    }
  ],
  "total_steps": 6,
  "status": "end",
  "mode": "grounded"
}
```

Notes:

- use a stable run or session id, not a fresh random id created at submit time
- feedback is optional for the demo path, but useful for capture and storytelling

## Phase 4: Feedback UI - Thumbs Up/Down (90 min, optional but valuable)

### Goal

Add a simple feedback component that appears after the agent run ends and posts the run trace to Cash's backend.

### Scope

- only show after terminal states: `end`, `error`, or `max_loop`
- submit `positive` or `negative`
- include instruction, status, trace, and stable session id
- do not block user flow if the request fails

### Important implementation notes

- source the instruction from app state or the active input/session model, not from `RouterState`
- compute action steps with globally increasing indices
- if direct renderer `fetch` hits CORS issues, move feedback submission to Electron main via IPC

### Fallback

If the feedback POST is slowing the demo down:

- keep the buttons
- log the payload locally
- narrate that the production path posts to backend

## Phase 5: Demo Environment Setup (45 min)

1. Put receipt images in `~/Downloads/`
   - `receipt_uber_march.png`
   - `receipt_lunch_march.jpg`

2. Create a blank spreadsheet on `~/Desktop/Expense_Report.xlsx`
   - columns: Date, Vendor, Amount, Category

3. Clean desktop state
   - close distracting apps
   - keep Finder state predictable

4. Use a standard screen resolution
   - `1440x900` or `1920x1080`

5. Keep file names and locations fixed between runs
   - the backend may use them as part of its grounding logic

## Phase 6: Demo Runbook (30 min)

### Baseline run

Preferred:

- enable `Force Workflow Mode`
- set forced mode to `baseline`
- record this run in advance
- capture the slow or fumbling behavior once

Instruction:

```txt
Find the Uber receipt in Downloads and create an expense report spreadsheet
```

### Grounded run

- keep `Force Workflow Mode` enabled
- switch forced mode to `grounded`
- keep the same instruction
- keep the same desktop state and files
- run this live during the demo

### Demo framing

Say explicitly:

- baseline and grounded use the same desktop app and same backend endpoint
- the only demo-specific switch is the force-mode toggle
- outside demo mode, the backend decides whether to retrieve and use graph knowledge

## Timeline

| Phase | Time | Deliverable |
|---|---:|---|
| 1. Get running | 60 min | App launches and controls local computer |
| 2. Backend config | 20 min | Settings point to `localhost:8000` |
| 3. Backend contract | 0 min | Shared request/response contract |
| 4. Feedback UI | 90 min | Optional thumbs up/down wired to backend |
| 5. Demo env | 45 min | Stable receipts, spreadsheet, desktop state |
| 6. Demo runbook | 30 min | Recorded baseline + rehearsed grounded live run |
| Buffer | ~30 min | Debugging and rehearsal |

## Fallbacks

- If Phase 1 slips: use the pre-built DMG
- If backend is unstable: keep the same contract and let backend return deterministic stubbed behavior for the demo
- If feedback UI slips: skip it and keep focus on the mode-switch demo
- If baseline is too risky live: always use a prerecorded baseline
- If grounded fails live: retry once after resetting desktop state

## Verification

1. Launch app and confirm local operator works on macOS.
2. With force mode off, verify the app still runs normally against `localhost:8000`.
3. With force mode on and set to baseline, verify requests include `X-Force-Workflow-Mode: baseline`.
4. With force mode on and set to grounded, verify requests include `X-Force-Workflow-Mode: grounded`.
5. If feedback UI ships, confirm thumbs up/down appears after terminal states and the payload reaches backend.
6. Rehearse the exact spoken demo flow once before presenting.
