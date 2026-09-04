#!/usr/bin/env bash
set -euo pipefail

MESSAGE="${1:-任务已完成}"

npm run typecheck
npm run lint

scripts/codex-task-done.sh "$MESSAGE"
