#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def extract_instruction(messages: list[dict[str, Any]]) -> str:
    for message in messages:
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        if isinstance(content, list):
            for item in content:
                if (
                    isinstance(item, dict)
                    and item.get("type") == "text"
                    and isinstance(item.get("text"), str)
                    and item["text"].strip()
                    and item["text"].strip() != "<image>"
                ):
                    return item["text"].strip()
    return ""


def infer_workflow_status(
    force_mode: str | None,
    instruction: str,
) -> tuple[str, bool, float, str]:
    lowered = instruction.lower()

    if force_mode == "baseline":
        return ("seen_workflow", False, 0.0, "baseline")
    if force_mode == "grounded":
        return ("seen_but_low_confidence", True, 0.42, "grounded")

    if "new workflow" in lowered or "never seen" in lowered:
        return ("new_workflow", True, 0.19, "auto")
    if "low confidence" in lowered or "ambiguous" in lowered:
        return ("seen_but_low_confidence", True, 0.47, "auto")
    return ("new_workflow", True, 0.31, "auto")


@dataclass
class SessionState:
    request_count: int = 0
    instruction: str = ""
    run_id: str = ""
    feedback_events: list[dict[str, Any]] = field(default_factory=list)


SESSION_STATE: dict[str, SessionState] = {}


class CashStubHandler(BaseHTTPRequestHandler):
    server_version = "CashStub/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def _write_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path == "/v1/chat/completions":
            self.handle_chat_completions()
            return

        if self.path == "/v1/feedback":
            self.handle_feedback()
            return

        self._write_json(404, {"error": f"unknown path: {self.path}"})

    def handle_chat_completions(self) -> None:
        body = self._read_json()
        force_mode = self.headers.get("X-Force-Workflow-Mode")
        session_id = self.headers.get("X-Session-Id", "no-session-id")
        instruction = extract_instruction(body.get("messages", []))

        state = SESSION_STATE.setdefault(session_id, SessionState())
        state.request_count += 1
        if instruction:
            state.instruction = instruction
        if not state.run_id:
            state.run_id = f"run_{session_id.replace('-', '_')}"

        workflow_status, needs_feedback, retrieval_confidence, effective_mode = (
            infer_workflow_status(force_mode, state.instruction)
        )

        wait_cycles = getattr(self.server, "wait_cycles", 0)
        response_delay_ms = getattr(self.server, "response_delay_ms", 0)
        linger_seconds = getattr(self.server, "linger_seconds", 0)

        if response_delay_ms > 0:
            time.sleep(response_delay_ms / 1000)

        if state.request_count <= wait_cycles:
            response_text = (
                "Thought: This is a safe local frontend test. "
                f"I saw force mode={force_mode or 'auto'} and request #{state.request_count}. "
                f"Holding the run open for longer. {linger_seconds}s remaining wait step budget.\n"
                "Action: wait()"
            )
        else:
            response_text = (
                "Thought: This is a safe local frontend test. "
                f"I saw force mode={force_mode or 'auto'} and request #{state.request_count}. "
                "The stub is finishing now.\n"
                "Action: finished(content='Stub run completed safely. "
                "Check the feedback card and backend metadata badges in the UI.')"
            )

        print("\n=== CHAT REQUEST ===")
        print("session_id:", session_id)
        print("force_mode:", force_mode or "auto")
        print("instruction:", state.instruction)
        print("request_count:", state.request_count)
        print("wait_cycles:", wait_cycles)
        print("response_delay_ms:", response_delay_ms)
        print("model:", body.get("model"))

        self._write_json(
            200,
            {
                "id": f"chatcmpl_{session_id}_{state.request_count}",
                "object": "chat.completion",
                "created": int(datetime.now(timezone.utc).timestamp()),
                "model": body.get("model", "cuakg-default"),
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": response_text,
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 12,
                    "total_tokens": 22,
                },
                "backend_meta": {
                    "workflowStatus": workflow_status,
                    "needsFeedback": needs_feedback,
                    "retrievalConfidence": retrieval_confidence,
                    "runId": state.run_id,
                    "effectiveMode": effective_mode,
                },
            },
        )

    def handle_feedback(self) -> None:
        body = self._read_json()
        session_id = body.get("session_id", "no-session-id")
        state = SESSION_STATE.setdefault(session_id, SessionState())
        state.feedback_events.append(body)

        print("\n=== FEEDBACK REQUEST ===")
        print("session_id:", session_id)
        print("force_mode_header:", self.headers.get("X-Force-Workflow-Mode", "auto"))
        print("authorization:", "present" if self.headers.get("Authorization") else "missing")
        print(json.dumps(body, indent=2))

        self._write_json(
            200,
            {
                "ok": True,
                "received_at": utc_now(),
                "feedback_count_for_session": len(state.feedback_events),
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Local Cash backend stub for UI-TARS frontend testing")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--wait-cycles",
        type=int,
        default=2,
        help="Number of safe wait() loops before finished(...). Each wait loop sleeps 5s inside the operator.",
    )
    parser.add_argument(
        "--response-delay-ms",
        type=int,
        default=0,
        help="Artificial server delay before each chat response.",
    )
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), CashStubHandler)
    server.wait_cycles = max(args.wait_cycles, 0)
    server.response_delay_ms = max(args.response_delay_ms, 0)
    server.linger_seconds = server.wait_cycles * 5
    print(f"Cash stub listening on http://{args.host}:{args.port}")
    print(
        "Safe mode: uses wait() for a configurable number of loops, then returns finished(...), "
        "and never emits real click/type actions."
    )
    print(f"Configured wait cycles: {server.wait_cycles} ({server.linger_seconds}s total hold time)")
    print(f"Configured artificial response delay: {server.response_delay_ms}ms")
    server.serve_forever()


if __name__ == "__main__":
    main()
