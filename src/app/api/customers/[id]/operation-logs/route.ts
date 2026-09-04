import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureOperationLogSchema } from "@/lib/operationLog";
import { canViewCustomers, customerBelongsToCompany, getAuthContext } from "@/lib/security/authorization";

function parseLogDetail(value?: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { content: value };
  }
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
  if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

  const db = getDb();
  ensureOperationLogSchema(db);

  const rows = db.prepare(`
    SELECT
      log.id,
      log.user_id,
      operator.name as operator_name,
      log.action,
      log.entity,
      log.entity_id,
      log.detail,
      log.ip_address,
      log.created_at
    FROM operation_logs log
    LEFT JOIN users operator ON operator.id = log.user_id
    WHERE log.entity = 'customer'
      AND log.entity_id = ?
    ORDER BY datetime(log.created_at) DESC, log.id DESC
    LIMIT 300
  `).all(params.id) as any[];

  return NextResponse.json(rows.map((row) => {
    const detail = parseLogDetail(row.detail);
    return {
      id: row.id,
      operator_id: row.user_id,
      operator_name: row.operator_name || "未知用户",
      action: row.action,
      module: String((detail as any).module || "客户"),
      title: String((detail as any).title || row.action || "操作记录"),
      content: String((detail as any).content || ""),
      target_name: String((detail as any).targetName || ""),
      changes: Array.isArray((detail as any).changes) ? (detail as any).changes : [],
      metadata: (detail as any).metadata || {},
      created_at: row.created_at,
      ip_address: row.ip_address || "",
    };
  }));
}
