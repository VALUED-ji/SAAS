import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";

function ensureNotificationsTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      is_read INTEGER DEFAULT 0,
      link_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  `);
}

function buildScopeCondition(scope: string) {
  if (scope === "result") return "AND title IN ('合同审批通过', '合同审批驳回', '收款审批通过', '收款审批驳回', '退款审批通过', '退款审批驳回', '变更单审批通过', '变更单审批驳回', '定金审批通过', '定金审批驳回', '设计费审批通过', '设计费审批驳回', '退定金审批通过', '退定金审批驳回', '退设计费审批通过', '退设计费审批驳回', '设计师分配完成')";
  return "";
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const userId = auth.userId;

  const db = getDb();
  ensureNotificationsTable(db);
  const scope = String(req.nextUrl.searchParams.get("scope") || "").trim();
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const scopeCondition = buildScopeCondition(scope);
  const readCondition = unreadOnly ? "AND COALESCE(is_read, 0) = 0" : "";

  const items = db.prepare(`
    SELECT id, type, title, content, is_read, link_url, created_at
    FROM notifications
    WHERE user_id = ?
      ${scopeCondition}
      ${readCondition}
    ORDER BY COALESCE(is_read, 0) ASC, created_at DESC
    LIMIT 100
  `).all(userId);
  const unread = db.prepare(`
    SELECT COUNT(*) as count
    FROM notifications
    WHERE user_id = ?
      ${scopeCondition}
      AND COALESCE(is_read, 0) = 0
  `).get(userId) as any;

  return NextResponse.json({ items, unreadCount: Number(unread?.count || 0) });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const userId = auth.userId;

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();
    if (!id || action !== "read") return NextResponse.json({ message: "操作无效" }, { status: 400 });

    const db = getDb();
    ensureNotificationsTable(db);
    const result = db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND user_id = ?
    `).run(id, userId);
    if (result.changes === 0) return NextResponse.json({ message: "消息不存在或无权限处理" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "处理失败" }, { status: 500 });
  }
}
