#!/bin/bash

set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
next_env="$project_dir/next-env.d.ts"
tsconfig_build="$project_dir/tsconfig.build.json"
next_env_backup="$(mktemp "${TMPDIR:-/tmp}/renovation-next-env.XXXXXX")"
tsconfig_build_backup="$(mktemp "${TMPDIR:-/tmp}/renovation-tsconfig-build.XXXXXX")"
build_id="$(date +%Y%m%d%H%M%S)-$$"
candidate_dir=".next-build-candidate-${build_id}"
candidate_path="$project_dir/$candidate_dir"

cp "$next_env" "$next_env_backup"
cp "$tsconfig_build" "$tsconfig_build_backup"
restore_next_env() {
  cp "$next_env_backup" "$next_env"
  cp "$tsconfig_build_backup" "$tsconfig_build"
  rm -f "$next_env_backup"
  rm -f "$tsconfig_build_backup"
}
trap restore_next_env EXIT

cd "$project_dir"
rm -rf "$candidate_path"

echo "[build] Building Next.js into $candidate_dir"
NEXT_DIST_DIR="$candidate_dir" NEXT_TS_CONFIG=tsconfig.build.json "$project_dir/node_modules/.bin/next" build

if [ ! -f "$candidate_path/BUILD_ID" ] || [ ! -d "$candidate_path/server" ] || [ ! -d "$candidate_path/static" ]; then
  echo "[build] Candidate build is incomplete; keeping existing .next-build untouched." >&2
  exit 1
fi

if [ -d "$project_dir/.next-build" ]; then
  backup_dir="$project_dir/.next-build-previous-${build_id}"
  echo "[build] Moving current .next-build to $(basename "$backup_dir")"
  mv "$project_dir/.next-build" "$backup_dir"
fi

echo "[build] Promoting $candidate_dir to .next-build"
mv "$candidate_path" "$project_dir/.next-build"
echo "[build] Done. Restart the app when you are ready."
