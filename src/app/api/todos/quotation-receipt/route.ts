import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";

function ensureQuotationReceiptTodoTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_receipt_todos (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      designer_id TEXT NOT NULL REFERENCES users(id),
      sender_id TEXT REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      received_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_quotation_receipt_todos_designer ON quotation_receipt_todos(designer_id, status);
    CREATE INDEX IF NOT EXISTS idx_quotation_receipt_todos_quotation ON quotation_receipt_todos(quotation_id, designer_id, status);
  `);
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const db = getDb();
  ensureQuotationReceiptTodoTable(db);
  const items = db.prepare(`
    SELECT t.*, q.title, q.version, q.total_amount, q.final_amount, q.status as quotation_status,
      q.updated_at as quotation_updated_at, q.created_at as quotation_created_at,
      c.name as customer_name, c.phone as customer_phone,
      p.name as project_name, p.address as project_address, p.area as project_area,
      sender.name as sender_name
    FROM quotation_receipt_todos t
    INNER JOIN quotations q ON t.quotation_id = q.id
    LEFT JOIN projects p ON q.project_id = p.id
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users sender ON t.sender_id = sender.id
    WHERE t.designer_id = ? AND c.company_id = ? AND t.deleted_at IS NULL AND q.deleted_at IS NULL
    ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END, t.created_at DESC
  `).all(auth.userId, auth.companyId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();
    if (!id || action !== "receive") return NextResponse.json({ message: "操作无效" }, { status: 400 });

    const db = getDb();
    ensureQuotationReceiptTodoTable(db);
    const result = db.prepare(`
      UPDATE quotation_receipt_todos
      SET status = 'received', received_at = datetime('now')
      WHERE id = ? AND designer_id = ? AND deleted_at IS NULL
        AND customer_id IN (SELECT id FROM customers WHERE company_id = ? AND deleted_at IS NULL)
    `).run(id, auth.userId, auth.companyId);
    if (result.changes === 0) return NextResponse.json({ message: "待办不存在或无权限处理" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "处理失败" }, { status: 500 });
  }
}
