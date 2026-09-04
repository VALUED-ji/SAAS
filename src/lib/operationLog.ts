import type Database from "better-sqlite3";
import type { NextRequest } from "next/server";
import { getRequestSession } from "@/lib/security/session";
import { getRequestIp as getTrustedRequestIp } from "@/lib/security/requestIp";

type OperationLogDb = Database.Database;

export type OperationChange = {
  label: string;
  before: string;
  after: string;
};

type CustomerOperationInput = {
  userId?: string | null;
  customerId: string;
  action: string;
  title: string;
  content?: string | null;
  module?: string | null;
  targetName?: string | null;
  changes?: OperationChange[] | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

function makeOperationLogId() {
  return `OP${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function getRequestUserId(req: NextRequest) {
  return getRequestSession(req)?.userId || null;
}

export function getRequestIp(req: NextRequest) {
  const ip = getTrustedRequestIp(req);
  return ip === "unknown" ? null : ip;
}

export function ensureOperationLogSchema(db: OperationLogDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_operation_logs_user ON operation_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_operation_logs_entity ON operation_logs(entity, entity_id, created_at);
  `);
}

function isActiveUser(db: OperationLogDb, userId: string) {
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(userId) as { id: string } | undefined;
  return Boolean(user?.id);
}

export function recordCustomerOperation(db: OperationLogDb, input: CustomerOperationInput) {
  const userId = String(input.userId || "").trim();
  const customerId = String(input.customerId || "").trim();
  if (!userId || !customerId || !isActiveUser(db, userId)) return null;

  ensureOperationLogSchema(db);
  const detail = {
    title: input.title,
    content: input.content || "",
    module: input.module || "",
    targetName: input.targetName || "",
    changes: Array.isArray(input.changes) ? input.changes : [],
    metadata: input.metadata || {},
  };

  const id = makeOperationLogId();
  db.prepare(`
    INSERT INTO operation_logs (id, user_id, action, entity, entity_id, detail, ip_address, created_at)
    VALUES (?, ?, ?, 'customer', ?, ?, ?, datetime('now'))
  `).run(
    id,
    userId,
    input.action,
    customerId,
    JSON.stringify(detail),
    input.ipAddress || null,
  );
  return id;
}
