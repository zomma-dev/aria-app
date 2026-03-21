# Cash Backend API Contract

## Goal

UI-TARS desktop should be able to:

- send normal computer-use requests to Cash's backend
- optionally force `baseline` or `grounded` mode for demo/debugging
- receive backend metadata about workflow status and feedback needs
- submit post-run feedback with the executed action trace

Frontend does not decide whether a workflow is new or seen.
Frontend does not perform query-similarity matching.
Backend owns routing, similarity, retrieval, and fallback behavior.

## Endpoint 1: OpenAI-Compatible VLM Proxy

```txt
POST /v1/chat/completions
```

The desktop app sends standard OpenAI-compatible chat completion requests from Electron main.

### Request headers

Optional headers used by UI-TARS:

```txt
X-Session-Id: <generated-agent-session-id>
X-Force-Workflow-Mode: baseline | grounded
```

Notes:

- `X-Session-Id` is already sent by the app and can be used for backend tracing/correlation.
- `X-Force-Workflow-Mode` is only sent when the user enables the force-mode toggle in VLM Settings.
- If `X-Force-Workflow-Mode` is absent, backend should use normal auto-routing.

### Request body

Example:

```json
{
  "model": "cuakg-default",
  "messages": [
    {
      "role": "system",
      "content": "<system prompt with action space definition>"
    },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Find the Uber receipt in Downloads and create an expense report spreadsheet" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ],
  "max_tokens": 65535,
  "temperature": 0,
  "top_p": 0.7
}
```

The exact `messages` array will include the running UI-TARS conversation and screenshots.

### Expected response body

Return normal OpenAI-compatible chat completion fields, plus optional top-level `backend_meta`.

Example:

```json
{
  "id": "chatcmpl_123",
  "object": "chat.completion",
  "created": 1761062400,
  "model": "cuakg-default",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Thought: I should open Downloads\nAction: click(start_box='(0.12, 0.55)')"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 56,
    "total_tokens": 1290
  },
  "backend_meta": {
    "workflowStatus": "new_workflow",
    "needsFeedback": true,
    "retrievalConfidence": 0.41,
    "runId": "run_abc123",
    "effectiveMode": "grounded"
  }
}
```

### `backend_meta` contract

All fields are optional, but these are the agreed names if provided:

```json
{
  "workflowStatus": "new_workflow | seen_workflow | seen_but_low_confidence",
  "needsFeedback": true,
  "retrievalConfidence": 0.82,
  "runId": "run_abc123",
  "effectiveMode": "auto | baseline | grounded"
}
```

Semantics:

- `workflowStatus`
  - `new_workflow`: backend believes this workflow is new
  - `seen_workflow`: backend recognizes this workflow confidently
  - `seen_but_low_confidence`: backend found a similar workflow but wants more signal
- `needsFeedback`
  - frontend uses this to make the post-run feedback prompt more prominent
- `retrievalConfidence`
  - optional numeric score for observability/debugging
- `runId`
  - backend-generated run identifier for correlating later feedback
- `effectiveMode`
  - backend's effective mode after applying auto-routing or force override

### Backend behavior

If header `X-Force-Workflow-Mode: baseline` is present:

- bypass graph usage
- run the normal non-grounded flow

If header `X-Force-Workflow-Mode: grounded` is present:

- run grounded behavior
- backend decides whether and how graph knowledge is used

If the force header is absent:

- backend owns routing completely
- frontend should not assume whether the workflow is new or seen

## Endpoint 2: Feedback Submission

```txt
POST /v1/feedback
```

The desktop app submits this request from Electron main after the run ends and the user clicks thumbs up/down.

### Request headers

```txt
Content-Type: application/json
Authorization: Bearer <vlm_api_key>     # sent when configured
X-Force-Workflow-Mode: baseline | grounded   # sent only when force mode is enabled
```

### Request body

Example:

```json
{
  "session_id": "local-session-id",
  "run_id": "run_abc123",
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
    },
    {
      "step": 2,
      "action_type": "click",
      "thought": "Open Downloads",
      "action_inputs": { "start_box": "(0.12, 0.55)" },
      "reflection": null
    }
  ],
  "total_steps": 2,
  "status": "end",
  "mode": "grounded",
  "workflow_status": "new_workflow",
  "retrieval_confidence": 0.41
}
```

### Field notes

- `session_id`
  - stable app-side session identifier
- `run_id`
  - backend-generated identifier from `backend_meta.runId` when available
- `feedback`
  - `positive` or `negative`
- `action_trace`
  - flattened action list with globally increasing step indices
- `status`
  - terminal run status from UI-TARS
- `mode`
  - if force mode is active, frontend sends the forced value
  - otherwise frontend sends `backend_meta.effectiveMode` when available, else `auto`

### Expected response

Any `2xx` response is acceptable.

Preferred response:

```json
{
  "ok": true
}
```

## Frontend Behavior Summary

- The feedback card appears after terminal states.
- If `backend_meta.needsFeedback` is `true`, frontend highlights the prompt.
- If `workflowStatus` is `new_workflow` or `seen_but_low_confidence`, frontend also highlights the prompt.
- Even for `seen_workflow`, frontend still allows feedback for future improvements.

## Important Constraint

If backend wants frontend to react to workflow state, the metadata must be returned as top-level `backend_meta` in the API response body.

Frontend is not parsing these signals from the model text output.
