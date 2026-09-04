import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canViewCustomers, getAuthContext } from "@/lib/security/authorization";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地查看权限" }, { status: 403 });
  const db = getDb();
  const customerId = String(req.nextUrl.searchParams.get("customer_id") || req.nextUrl.searchParams.get("customerId") || "").trim();
  const projects = db.prepare(`
    SELECT p.*, c.name as customer_name, u.name as manager_name, u.avatar as manager_avatar
    FROM projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE p.company_id = ? AND p.deleted_at IS NULL
      ${customerId ? "AND p.customer_id = ?" : ""}
    ORDER BY p.created_at DESC
  `).all(...(customerId ? [auth.companyId, customerId] : [auth.companyId]));
  return NextResponse.json(projects);
}
