#!/usr/bin/env bash
set -uo pipefail

MESSAGE="${1:-任务已完成}"
SOUND_VOLUME="${CODEX_SOUND_VOLUME:-5}"

printf '\a'

if command -v osascript >/dev/null 2>&1; then
  osascript -e 'beep 2' >/dev/null 2>&1 || true
fi

if command -v say >/dev/null 2>&1; then
  say -v Ting-Ting "$MESSAGE" >/dev/null 2>&1 || say "$MESSAGE" >/dev/null 2>&1 || true
fi

if command -v afplay >/dev/null 2>&1; then
  [ -f /System/Library/Sounds/Hero.aiff ] && afplay -v "$SOUND_VOLUME" /System/Library/Sounds/Hero.aiff >/dev/null 2>&1
  [ -f /System/Library/Sounds/Glass.aiff ] && afplay -v "$SOUND_VOLUME" /System/Library/Sounds/Glass.aiff >/dev/null 2>&1
fi

if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"$MESSAGE\" with title \"Codex\" sound name \"Glass\"" >/dev/null 2>&1 || true
fi

echo "Codex completion notice sent: $MESSAGE"
