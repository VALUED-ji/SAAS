#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/releases"
RELEASE_NAME="${1:-stability-phase3-$(date +%Y%m%d-%H%M%S)}"
ARCHIVE_PATH="${RELEASE_DIR}/${RELEASE_NAME}.tar.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"
INCLUDE_BUILD="${INCLUDE_BUILD:-0}"

mkdir -p "${RELEASE_DIR}"
cd "${ROOT_DIR}"

COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude='.DS_Store' \
  --exclude='._*' \
  --exclude='*.backup' \
  --exclude='*.backup-*' \
  --exclude='*backup-before*' \
  --exclude='* 2' \
  --exclude='* 2.*' \
  --exclude='public/uploads' \
  --exclude='prisma/*.db' \
  --exclude='prisma/*.db-*' \
  --exclude='prisma/backups' \
  -czf "${ARCHIVE_PATH}" \
  AGENTS.md \
  README.md \
  src \
  public \
  prisma/schema.prisma \
  scripts \
  package.json \
  package-lock.json \
  next.config.js \
  next-env.d.ts \
  tsconfig.json \
  tsconfig.build.json \
  tailwind.config.ts \
  postcss.config.js \
  postcss.config.mjs \
  eslint.config.mjs

if [ "${INCLUDE_BUILD}" = "1" ]; then
  if [ ! -f "${ROOT_DIR}/.next-build/BUILD_ID" ] || [ ! -d "${ROOT_DIR}/.next-build/server" ] || [ ! -d "${ROOT_DIR}/.next-build/static" ]; then
    echo "[release] Refusing archive because .next-build is missing or incomplete. Run npm run build locally first." >&2
    rm -f "${ARCHIVE_PATH}"
    exit 1
  fi

  tmp_archive="${ARCHIVE_PATH}.tmp"
  rm -f "${tmp_archive}"
  COPYFILE_DISABLE=1 tar --no-xattrs \
    --exclude='.DS_Store' \
    --exclude='._*' \
    --exclude='*.backup' \
    --exclude='*.backup-*' \
    --exclude='*backup-before*' \
    --exclude='* 2' \
    --exclude='* 2.*' \
    --exclude='public/uploads' \
    --exclude='prisma/*.db' \
    --exclude='prisma/*.db-*' \
    --exclude='prisma/backups' \
    --exclude='.next-build/cache' \
    -czf "${tmp_archive}" \
    AGENTS.md \
    README.md \
    src \
    public \
    prisma/schema.prisma \
    scripts \
    package.json \
    package-lock.json \
    next.config.js \
    next-env.d.ts \
    tsconfig.json \
    tsconfig.build.json \
    tailwind.config.ts \
    postcss.config.js \
    postcss.config.mjs \
    eslint.config.mjs \
    .next-build
  mv "${tmp_archive}" "${ARCHIVE_PATH}"
fi

if ! tar -tzf "${ARCHIVE_PATH}" | grep -qx 'tsconfig.build.json'; then
  echo "[release] Refusing archive because tsconfig.build.json is missing." >&2
  rm -f "${ARCHIVE_PATH}"
  exit 1
fi

if tar -tzf "${ARCHIVE_PATH}" | grep -Eq '(^|/)(\.env|dev\.db|uploads/|\.DS_Store|\._)'; then
  echo "[release] Refusing archive because it contains local data or macOS metadata." >&2
  rm -f "${ARCHIVE_PATH}"
  exit 1
fi

shasum -a 256 "${ARCHIVE_PATH}" > "${CHECKSUM_PATH}"
echo "[release] Created ${ARCHIVE_PATH}"
echo "[release] Checksum ${CHECKSUM_PATH}"
