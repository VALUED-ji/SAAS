#!/usr/bin/env bash
set -euo pipefail

RELEASE_PATH="${1:-}"
APP_DIR="${PROD_APP_DIR:-/var/www/renovation-saas}"
PM2_NAME="${PROD_PM2_NAME:-}"
HEALTH_URL="${PROD_HEALTH_URL:-}"
BACKUP_ROOT="${PROD_BACKUP_ROOT:-/root/deploy-backups/production}"
WORK_ROOT="${PROD_WORK_ROOT:-/tmp/renovation-production-deploy}"
INSTALL_DEPS="${PROD_INSTALL_DEPS:-0}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE=""
DB_BACKUP_FILE=""
PM2_STATUS_FILE=""

rollback() {
  local rollback_dir="$WORK_ROOT/rollback-$STAMP"
  if [ ! -f "$BACKUP_FILE" ] || [ ! -d "$rollback_dir" ]; then
    echo "正式环境回滚材料不完整，请检查备份: $BACKUP_FILE" >&2
    return 1
  fi

  echo "发布失败，开始回滚正式环境代码和构建..." >&2
  rsync -a --delete \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='node_modules' \
    --exclude='prisma/*.db' \
    --exclude='prisma/*.db-*' \
    --exclude='prisma/backups' \
    --exclude='public/uploads' \
    --exclude='.next-build-previous-*' \
    --exclude='releases' \
    --exclude='backups' \
    "$rollback_dir/" "$APP_DIR/"

  if [ -n "$PM2_NAME" ]; then
    pm2 restart "$PM2_NAME" --update-env >/dev/null || true
  fi
  echo "正式环境已回滚到发布前版本。" >&2
}

run_runtime_check() {
  local target_dir="$1"
  (
    cd "$target_dir"
    node - <<'NODE'
require("dotenv").config();
const path = require("node:path");

const secret = String(process.env.JWT_SECRET || "").trim();
if (secret.length < 32 || secret === "zxgj-dev-secret-key-2026") {
  throw new Error("JWT_SECRET 缺失或长度不足 32 位");
}

require("next/package.json");
require("react/package.json");

const Database = require("better-sqlite3");
const db = new Database(path.join(process.cwd(), "prisma", "dev.db"), { readonly: true });
try {
  const integrity = db.prepare("PRAGMA integrity_check").get();
  if (String(integrity?.integrity_check || "").toLowerCase() !== "ok") {
    throw new Error(`数据库完整性检查失败: ${JSON.stringify(integrity)}`);
  }
  db.prepare("SELECT COUNT(*) AS count FROM users").get();
  db.prepare("SELECT COUNT(*) AS count FROM companies").get();
} finally {
  db.close();
}

console.log("正式运行环境检查通过");
NODE
  )
}

if [ -z "$RELEASE_PATH" ]; then
  echo "用法: bash scripts/deploy-production-release.sh /root/xxx.tar.gz" >&2
  exit 1
fi

if [ ! -f "$RELEASE_PATH" ]; then
  echo "发布包不存在: $RELEASE_PATH" >&2
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "正式环境目录不存在: $APP_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT" "$WORK_ROOT"
CANDIDATE_DIR="$WORK_ROOT/candidate-$STAMP"
ROLLBACK_DIR="$WORK_ROOT/rollback-$STAMP"
rm -rf "$CANDIDATE_DIR" "$ROLLBACK_DIR"
mkdir -p "$CANDIDATE_DIR" "$ROLLBACK_DIR"

echo "[1/9] 解压并检查发布包"
tar -xzf "$RELEASE_PATH" -C "$CANDIDATE_DIR"
test -f "$CANDIDATE_DIR/package.json"
test -f "$CANDIDATE_DIR/package-lock.json"
test -f "$CANDIDATE_DIR/.next-build/BUILD_ID"
test -d "$CANDIDATE_DIR/.next-build/server"
test -d "$CANDIDATE_DIR/.next-build/static"

if tar -tzf "$RELEASE_PATH" | grep -Eq '(^|/)(\.env|dev\.db|uploads/|\.DS_Store|\._)'; then
  echo "发布包包含本地环境文件、数据库、上传文件或 macOS 元数据，已停止。" >&2
  exit 1
fi

echo "[2/9] 检查正式环境关键文件和数据库"
test -f "$APP_DIR/.env" || test -f "$APP_DIR/.env.local"
test -f "$APP_DIR/prisma/dev.db"
command -v sqlite3 >/dev/null

if [ -z "$PM2_NAME" ]; then
  PM2_NAME="$(APP_DIR="$APP_DIR" node - <<'NODE'
const { execSync } = require("node:child_process");
const appDir = process.env.APP_DIR;
try {
  const rows = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
  const match = rows.find((item) => item?.pm2_env?.pm_cwd === appDir);
  if (match?.name) process.stdout.write(match.name);
} catch {}
NODE
)"
fi

if [ -z "$PM2_NAME" ]; then
  echo "没有在 PM2 中找到正式环境服务。请指定 PROD_PM2_NAME，例如:" >&2
  echo "PROD_PM2_NAME=renovation-saas bash scripts/deploy-production-release.sh $RELEASE_PATH" >&2
  exit 1
fi

if [ -z "$HEALTH_URL" ]; then
  APP_DIR="$APP_DIR" PM2_NAME="$PM2_NAME" node - <<'NODE' > "$WORK_ROOT/health-url-$STAMP.txt"
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
require("dotenv").config({ path: path.join(process.env.APP_DIR, ".env"), quiet: true });
require("dotenv").config({ path: path.join(process.env.APP_DIR, ".env.local"), override: true, quiet: true });
const publicUrl = String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
if (publicUrl) {
  process.stdout.write(`${publicUrl}/login`);
  process.exit(0);
}
let port = "3000";
try {
  const rows = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
  const match = rows.find((item) => item?.name === process.env.PM2_NAME);
  port = String(match?.pm2_env?.env?.PORT || match?.pm2_env?.PORT || port);
} catch {}
process.stdout.write(`http://127.0.0.1:${port}/login`);
NODE
  HEALTH_URL="$(cat "$WORK_ROOT/health-url-$STAMP.txt")"
fi

echo "正式服务: $PM2_NAME"
echo "健康检查: $HEALTH_URL"

echo "[3/9] 发布前运行环境检查"
run_runtime_check "$APP_DIR"

echo "[4/9] 备份正式数据库、环境、上传文件、源码和旧构建"
DB_BACKUP_FILE="$BACKUP_ROOT/prod-db-$STAMP.db"
PM2_STATUS_FILE="$BACKUP_ROOT/prod-pm2-status-$STAMP.txt"
BACKUP_FILE="$BACKUP_ROOT/prod-before-$STAMP.tar.gz"
sqlite3 "$APP_DIR/prisma/dev.db" ".timeout 5000" ".backup '$DB_BACKUP_FILE'"
pm2 jlist > "$PM2_STATUS_FILE"
tar -czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='.next*/cache' \
  --exclude='.next-build-previous-*' \
  --exclude='releases' \
  --exclude='backups' \
  -C "$APP_DIR" .
tar -xzf "$BACKUP_FILE" -C "$ROLLBACK_DIR" \
  --exclude='./.env' \
  --exclude='./.env.local' \
  --exclude='./node_modules' \
  --exclude='./prisma/dev.db' \
  --exclude='./prisma/dev.db-*' \
  --exclude='./prisma/backups' \
  --exclude='./public/uploads' \
  --exclude='./releases' \
  --exclude='./backups'
echo "完整备份: $BACKUP_FILE"
echo "数据库备份: $DB_BACKUP_FILE"
echo "PM2 状态: $PM2_STATUS_FILE"

echo "[5/9] 准备候选运行环境"
if ! run_runtime_check "$APP_DIR"; then
  if [ "$INSTALL_DEPS" = "1" ]; then
    echo "运行环境不完整，按 PROD_INSTALL_DEPS=1 安装依赖"
    cd "$APP_DIR"
    npm ci
    npm rebuild better-sqlite3 --build-from-source
    run_runtime_check "$APP_DIR"
  else
    echo "运行环境检查失败，已停止发布。" >&2
    exit 1
  fi
fi

trap 'status=$?; if [ "$status" -ne 0 ]; then rollback || true; fi; exit "$status"' ERR

echo "[6/9] 替换正式代码和本地构建，保留数据与环境配置"
rsync -a --delete \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='node_modules' \
  --exclude='prisma/*.db' \
  --exclude='prisma/*.db-*' \
  --exclude='prisma/backups' \
  --exclude='public/uploads' \
  --exclude='.next-build-previous-*' \
  --exclude='releases' \
  --exclude='backups' \
  "$CANDIDATE_DIR/" "$APP_DIR/"

echo "[7/9] 重启正式服务并检查 PM2"
cd "$APP_DIR"
run_runtime_check "$APP_DIR"
pm2 restart "$PM2_NAME" --update-env
sleep 4
PM2_NAME="$PM2_NAME" APP_DIR="$APP_DIR" node - <<'NODE'
const { execSync } = require("node:child_process");
const rows = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
const processRow = rows.find((item) => item?.name === process.env.PM2_NAME);
if (!processRow) throw new Error("PM2 中找不到正式服务");
if (String(processRow?.pm2_env?.status || "") !== "online") {
  throw new Error(`正式服务状态异常: ${processRow?.pm2_env?.status}`);
}
if (String(processRow?.pm2_env?.pm_cwd || "") !== process.env.APP_DIR) {
  throw new Error(`PM2 工作目录异常: ${processRow?.pm2_env?.pm_cwd}`);
}
console.log(`PM2 检查通过: ${process.env.PM2_NAME} / online`);
NODE

echo "[8/9] 检查正式环境健康状态"
HTTP_CODE=""
for attempt in 1 2 3 4 5 6; do
  HTTP_CODE="$(curl -L -s -o /tmp/renovation-prod-health.html -w '%{http_code}' "$HEALTH_URL" || true)"
  if [ "$HTTP_CODE" = "200" ]; then break; fi
  sleep 3
done
if [ "$HTTP_CODE" != "200" ]; then
  echo "正式环境健康检查失败，HTTP 状态: $HTTP_CODE" >&2
  echo "最近错误日志:" >&2
  pm2 logs "$PM2_NAME" --nostream --lines 60 --err >&2 || true
  false
fi

echo "[9/9] 再次检查数据库完整性"
run_runtime_check "$APP_DIR"
trap - ERR

echo "正式环境发布成功"
echo "发布包: $RELEASE_PATH"
echo "发布前完整备份: $BACKUP_FILE"
echo "发布前数据库备份: $DB_BACKUP_FILE"
echo "发布前 PM2 状态: $PM2_STATUS_FILE"
echo "当前旧构建: $APP_DIR/.next-build-previous-*"
echo "健康检查: $HEALTH_URL => $HTTP_CODE"
