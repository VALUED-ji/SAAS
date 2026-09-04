import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "finance.view")) return NextResponse.json({ message: "没有财务查看权限" }, { status: 403 });

  const db = getDb();

  const totalRevenue = db.prepare(`SELECT COALESCE(SUM(contract_amount),0) as total FROM projects WHERE company_id = ? AND deleted_at IS NULL AND status NOT IN ('LEAD','DESIGNED','QUOTED')`).get(auth.companyId) as any;
  const totalCost = db.prepare(`SELECT COALESCE(SUM(p.contract_amount)*0.65,0) as total FROM projects p WHERE p.company_id = ? AND p.deleted_at IS NULL AND p.status NOT IN ('LEAD','DESIGNED','QUOTED')`).get(auth.companyId) as any;
  const projects = db.prepare(`SELECT id, name, contract_amount, status FROM projects WHERE company_id = ? AND deleted_at IS NULL AND contract_amount > 0 ORDER BY contract_amount DESC LIMIT 5`).all(auth.companyId);

  return NextResponse.json({
    totalRevenue: totalRevenue.total,
    totalCost: totalCost.total,
    totalProfit: totalRevenue.total - totalCost.total,
    profitRate: totalRevenue.total > 0 ? ((totalRevenue.total - totalCost.total) / totalRevenue.total) * 100 : 0,
    topProjects: projects,
  });
}
