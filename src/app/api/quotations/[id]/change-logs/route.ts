import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getQuotationChangeLogs } from "@/lib/quotationChangeLogs";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";

export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(_req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价查看权限" }, { status: 403 });

  const db = getDb();
  const quotation = db.prepare(`
    SELECT id, title
    FROM quotations
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(params.id, auth.companyId) as any;
  if (!quotation) return NextResponse.json({ message: "报价不存在" }, { status: 404 });

  return NextResponse.json({
    quotation,
    logs: getQuotationChangeLogs(db, params.id, auth.companyId),
  });
}
