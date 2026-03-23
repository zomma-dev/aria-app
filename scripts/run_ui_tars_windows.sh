#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PYTHON_BIN="${UI_TARS_PYTHON_BIN:-python3}"
BRIDGE_HOST="${UI_TARS_BRIDGE_HOST:-127.0.0.1}"
BRIDGE_PORT="${UI_TARS_BRIDGE_PORT:-8000}"
BRIDGE_MODEL_PROVIDER="${UI_TARS_BRIDGE_MODEL_PROVIDER:-moonshot}"
BRIDGE_CONTROLLER_MODEL="${UI_TARS_BRIDGE_CONTROLLER_MODEL:-kimi-k2.5}"
BRIDGE_AUTO_MODE="${UI_TARS_BRIDGE_AUTO_MODE:-grounded}"
BRIDGE_RESPONSE_MODEL="${UI_TARS_BRIDGE_RESPONSE_MODEL:-cuakg-default}"
APP_MODE="${UI_TARS_APP_MODE:-preview}"
MODEL_TIMEOUT_MS="${UI_TARS_MODEL_TIMEOUT_MS:-300000}"

VLM_PROVIDER_VALUE="${VLM_PROVIDER:-Hugging Face for UI-TARS-1.5}"
VLM_BASE_URL_VALUE="${VLM_BASE_URL:-http://${BRIDGE_HOST}:${BRIDGE_PORT}/v1}"
VLM_API_KEY_VALUE="${VLM_API_KEY:-dummy-key}"
VLM_MODEL_NAME_VALUE="${VLM_MODEL_NAME:-$BRIDGE_RESPONSE_MODEL}"
WINDOWS_USERPROFILE_RAW="$(
  cmd.exe /d /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r' | tail -n 1
)"
WINDOWS_MIRROR_ROOT="${UI_TARS_WINDOWS_MIRROR:-${WINDOWS_USERPROFILE_RAW}\\aria-app-win}"
WINDOWS_MIRROR_ROOT_WSL="$(
  wslpath -u "$WINDOWS_MIRROR_ROOT" 2>/dev/null || true
)"

run_local_app() {
  echo "Starting UI-TARS on the current OS from $REPO_ROOT"
  (
    unset ELECTRON_RUN_AS_NODE
    export UI_TARS_BOOTSTRAP_VLM_SETTINGS=1
    export VLM_PROVIDER="$VLM_PROVIDER_VALUE"
    export VLM_BASE_URL="$VLM_BASE_URL_VALUE"
    export VLM_API_KEY="$VLM_API_KEY_VALUE"
    export VLM_MODEL_NAME="$VLM_MODEL_NAME_VALUE"
    export UI_TARS_MODEL_TIMEOUT_MS="$MODEL_TIMEOUT_MS"

    corepack pnpm --dir "$REPO_ROOT" install --ignore-scripts
    corepack pnpm --dir "$REPO_ROOT/apps/ui-tars" run build:deps

    if [[ "$APP_MODE" == "dev" ]]; then
      corepack pnpm --dir "$REPO_ROOT/apps/ui-tars" run dev
    elif [[ "$APP_MODE" == "build" ]]; then
      corepack pnpm --dir "$REPO_ROOT/apps/ui-tars" run build:dist
    else
      corepack pnpm --dir "$REPO_ROOT/apps/ui-tars" run build:dist
      corepack pnpm --dir "$REPO_ROOT/apps/ui-tars" run start:dist
    fi
  )
}

sync_windows_mirror() {
  if [[ -z "$WINDOWS_MIRROR_ROOT_WSL" ]]; then
    echo "Could not resolve the Windows mirror path into WSL." >&2
    exit 1
  fi
  if ! command -v rsync >/dev/null 2>&1; then
    echo "rsync is required to mirror the repo into Windows from WSL." >&2
    exit 1
  fi

  mkdir -p "$WINDOWS_MIRROR_ROOT_WSL"
  echo "Mirroring repo to: $WINDOWS_MIRROR_ROOT"
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.turbo' \
    --exclude 'dist' \
    --exclude 'out' \
    --exclude '.next' \
    --exclude 'pnpm-debug.log' \
    "$REPO_ROOT"/ "$WINDOWS_MIRROR_ROOT_WSL"/
}

run_windows_app() {
  local windows_cmd
  windows_cmd="cd /d $WINDOWS_MIRROR_ROOT&&set ELECTRON_RUN_AS_NODE=&&set UI_TARS_BOOTSTRAP_VLM_SETTINGS=1&&set VLM_PROVIDER=$VLM_PROVIDER_VALUE&&set VLM_BASE_URL=$VLM_BASE_URL_VALUE&&set VLM_API_KEY=$VLM_API_KEY_VALUE&&set VLM_MODEL_NAME=$VLM_MODEL_NAME_VALUE&&set UI_TARS_MODEL_TIMEOUT_MS=$MODEL_TIMEOUT_MS&&corepack pnpm install --ignore-scripts&&corepack pnpm --dir apps\\ui-tars run build:deps"

  if [[ "$APP_MODE" == "dev" ]]; then
    windows_cmd="$windows_cmd&&corepack pnpm --dir apps\\ui-tars run dev"
  elif [[ "$APP_MODE" == "build" ]]; then
    windows_cmd="$windows_cmd&&corepack pnpm --dir apps\\ui-tars run build:dist"
  else
    windows_cmd="$windows_cmd&&corepack pnpm --dir apps\\ui-tars run build:dist&&corepack pnpm --dir apps\\ui-tars run start:dist"
  fi

  cmd.exe /d /c "$windows_cmd"
}

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python interpreter not found: $PYTHON_BIN" >&2
  exit 1
fi

if ! "$PYTHON_BIN" -c "import desktop_agent.bridge" >/dev/null 2>&1; then
  cat >&2 <<EOF
desktop_agent.bridge is not importable from $PYTHON_BIN.

Activate the Python environment where desktop-agent is installed, or point this
script at the right interpreter:

  UI_TARS_PYTHON_BIN=/path/to/python bash scripts/run_ui_tars_windows.sh

If you still need to install the packages:

  python3 -m pip install -e /path/to/desktop-agent
  python3 -m pip install -e /path/to/kg-agent
EOF
  exit 1
fi

bridge_args=(
  -m
  desktop_agent.bridge
  --host
  "$BRIDGE_HOST"
  --port
  "$BRIDGE_PORT"
  --model-provider
  "$BRIDGE_MODEL_PROVIDER"
  --controller-model
  "$BRIDGE_CONTROLLER_MODEL"
  --auto-mode
  "$BRIDGE_AUTO_MODE"
  --response-model
  "$BRIDGE_RESPONSE_MODEL"
)

if [[ -n "${DESKTOP_AGENT_PATH:-}" ]]; then
  bridge_args+=(--desktop-agent-path "$DESKTOP_AGENT_PATH")
fi

if [[ -n "${KG_AGENT_PATH:-}" ]]; then
  bridge_args+=(--kg-agent-path "$KG_AGENT_PATH")
fi

if [[ -n "${DESKTOP_AGENT_MODEL_ENDPOINT:-}" ]]; then
  bridge_args+=(--model-endpoint "$DESKTOP_AGENT_MODEL_ENDPOINT")
fi

if [[ "${UI_TARS_BRIDGE_DEBUG_GRAPH:-0}" == "1" ]]; then
  bridge_args+=(--debug-graph)
fi

echo "Starting packaged desktop-agent bridge with $PYTHON_BIN"
BRIDGE_PID=""
STARTED_BRIDGE=0

if curl -fsS "http://${BRIDGE_HOST}:${BRIDGE_PORT}/healthz" >/dev/null 2>&1; then
  echo "Reusing existing bridge at http://${BRIDGE_HOST}:${BRIDGE_PORT}"
else
  "$PYTHON_BIN" "${bridge_args[@]}" &
  BRIDGE_PID=$!
  STARTED_BRIDGE=1
fi

cleanup() {
  if [[ "$STARTED_BRIDGE" == "1" ]] && kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
    kill "$BRIDGE_PID" >/dev/null 2>&1 || true
    wait "$BRIDGE_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "Waiting for bridge health check at http://${BRIDGE_HOST}:${BRIDGE_PORT}/healthz"
for _ in {1..30}; do
  if curl -fsS "http://${BRIDGE_HOST}:${BRIDGE_PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://${BRIDGE_HOST}:${BRIDGE_PORT}/healthz" >/dev/null 2>&1; then
  echo "Bridge failed to come up on http://${BRIDGE_HOST}:${BRIDGE_PORT}" >&2
  exit 1
fi

if [[ "$STARTED_BRIDGE" == "1" ]] && ! kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
  wait "$BRIDGE_PID"
  exit 1
fi

echo "Bridge is healthy."

if ! command -v cmd.exe >/dev/null 2>&1; then
  echo "cmd.exe is not available from this shell."
  echo "Falling back to a local app launch on the current OS."
  run_local_app
else
  echo "Repo root: $REPO_ROOT"
  echo "Starting UI-TARS in Windows from the WSL checkout..."
  echo "Using bridge: $VLM_BASE_URL_VALUE"
  echo "App mode: $APP_MODE"
  sync_windows_mirror
  run_windows_app
fi
