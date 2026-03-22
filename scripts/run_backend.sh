#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARIA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ROOT="${ARIA_ROOT}/../backend"

if [[ ! -d "${BACKEND_ROOT}" ]]; then
  echo "Backend folder not found at ${BACKEND_ROOT}" >&2
  echo "Expected sibling folder: ../backend" >&2
  exit 1
fi

if [[ ! -f "${BACKEND_ROOT}/run.sh" ]]; then
  echo "Backend run script not found at ${BACKEND_ROOT}/run.sh" >&2
  exit 1
fi

echo "Starting backend from ${BACKEND_ROOT}"
cd "${BACKEND_ROOT}"
exec bash ./run.sh
