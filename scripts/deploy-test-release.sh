#!/usr/bin/env bash
set -euo pipefail

RELEASE_PATH="${1:-}"
APP_DIR="${TEST_APP_DIR:-/var/www/renovation-saas-test}"
PM2_NAME="${TEST_PM2_NAME:-}"
HEALTH_URL="${TEST_HEALTH_URL:-}"
BACKUP_ROOT="${TEST_BACKUP_ROOT:-/root/deploy-backups}"
WORK_ROOT="${TEST_WORK_ROOT:-/tmp/renovation-test-deploy}"
INSTALL_DEPS="${TEST_INSTALL_DEPS:-0}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE=""

rollback() {
  if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    echo "发布失败，开始回滚测试环境: $BACKUP_FILE" >&2
    rm -rf "$APP_DIR/src" "$APP_DIR/public" "$APP_DIR/scripts" "$APP_DIR/.next-build"
    tar -xzf "$BACKUP_FILE" -C "$APP_DIR"
    if [ -n "$PM2_NAME" ]; then
      pm2 restart "$PM2_NAME" --update-env >/dev/null || true
    fi
    echo "已回滚到发布前版本。" >&2
  fi
}

run_runtime_check() {
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
  db.prepare("SELECT COUNT(*) AS count FROM users").get();
  db.prepare("SELECT COUNT(*) AS count FROM companies").get();
} finally {
  db.close();
}

console.log("运行环境检查通过");
NODE
}

if [ -z "$RELEASE_PATH" ]; then
  echo "用法: bash scripts/deploy-test-release.sh /root/xxx.tar.gz" >&2
  exit 1
fi

if [ ! -f "$RELEASE_PATH" ]; then
  echo "发布包不存在: $RELEASE_PATH" >&2
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "测试环境目录不存在: $APP_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT" "$WORK_ROOT"
CANDIDATE_DIR="$WORK_ROOT/candidate-$STAMP"
rm -rf "$CANDIDATE_DIR"
mkdir -p "$CANDIDATE_DIR"

echo "[1/7] 解压发布包到临时目录"
tar -xzf "$RELEASE_PATH" -C "$CANDIDATE_DIR"

echo "[2/7] 检查发布包内容"
test -f "$CANDIDATE_DIR/package.json"
test -f "$CANDIDATE_DIR/package-lock.json"
test -f "$CANDIDATE_DIR/.next-build/BUILD_ID"
test -d "$CANDIDATE_DIR/.next-build/server"
test -d "$CANDIDATE_DIR/.next-build/static"

if tar -tzf "$RELEASE_PATH" | grep -Eq '(^|/)(\.env|dev\.db|uploads/|\.DS_Store|\._)'; then
  echo "发布包包含本地环境文件、数据库、上传文件或 macOS 元数据，已停止。" >&2
  exit 1
fi

echo "[3/7] 检查测试环境关键文件"
test -f "$APP_DIR/.env" || test -f "$APP_DIR/.env.local"
if [ -d "$APP_DIR/public/uploads" ]; then
  echo "上传目录存在，会保留: $APP_DIR/public/uploads"
fi

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
  echo "没有在 PM2 中找到测试环境服务。请指定 TEST_PM2_NAME，例如:" >&2
  echo "TEST_PM2_NAME=你的测试服务名 bash scripts/deploy-test-release.sh $RELEASE_PATH" >&2
  exit 1
fi

if [ -z "$HEALTH_URL" ]; then
  TEST_PORT="$(PM2_NAME="$PM2_NAME" node - <<'NODE'
const { execSync } = require("node:child_process");
const name = process.env.PM2_NAME;
try {
  const rows = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
  const match = rows.find((item) => item?.name === name);
  const env = match?.pm2_env?.env || {};
  process.stdout.write(String(env.PORT || match?.pm2_env?.PORT || "3001"));
} catch {
  process.stdout.write("3001");
}
NODE
)"
  HEALTH_URL="http://127.0.0.1:${TEST_PORT}/projects"
fi

echo "测试服务: $PM2_NAME"
echo "健康检查: $HEALTH_URL"

echo "[4/7] 发布前运行环境检查"
cd "$APP_DIR"
if ! run_runtime_check; then
  if [ "$INSTALL_DEPS" = "1" ]; then
    echo "运行环境不完整，按 TEST_INSTALL_DEPS=1 允许安装依赖"
    npm ci
    npm rebuild better-sqlite3 --build-from-source
    run_runtime_check
  else
    echo "运行环境检查失败，已停止发布。" >&2
    echo "请先手动修复测试环境依赖或配置；如确需脚本安装依赖，使用 TEST_INSTALL_DEPS=1。" >&2
    exit 1
  fi
fi

echo "[5/7] 备份当前测试环境"
BACKUP_FILE="$BACKUP_ROOT/test-before-$STAMP.tar.gz"
tar -czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='.next-build/cache' \
  --exclude='.next/cache' \
  -C "$APP_DIR" .
echo "备份完成: $BACKUP_FILE"
trap rollback ERR

echo "[6/7] 替换代码和本地构建，保留环境、数据库和上传文件"
rsync -a --delete \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='node_modules' \
  --exclude='prisma/*.db' \
  --exclude='prisma/*.db-*' \
  --exclude='prisma/backups' \
  --exclude='public/uploads' \
  "$CANDIDATE_DIR/" "$APP_DIR/"

echo "[7/7] 重启测试服务并检查"
cd "$APP_DIR"

run_runtime_check

pm2 restart "$PM2_NAME" --update-env
sleep 3
pm2 describe "$PM2_NAME" >/dev/null

HTTP_CODE="$(curl -L -s -o /tmp/renovation-test-health.html -w '%{http_code}' "$HEALTH_URL" || true)"
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "302" ]; then
  echo "测试环境健康检查失败，HTTP 状态: $HTTP_CODE" >&2
  echo "请查看 PM2 日志: pm2 logs $PM2_NAME --lines 80" >&2
  exit 1
fi

trap - ERR
echo "测试环境发布成功"
echo "发布包: $RELEASE_PATH"
echo "备份: $BACKUP_FILE"
echo "健康检查: $HEALTH_URL => $HTTP_CODE"
