import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canViewCustomers, getAuthContext } from "@/lib/security/authorization";

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地查看权限" }, { status: 403 });
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, c.name as customer_name, c.phone as customer_phone, u.name as manager_name, u.avatar as manager_avatar
    FROM projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE p.id = ? AND p.company_id = ? AND p.deleted_at IS NULL
  `).get(params.id, auth.companyId);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tasks = db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY planned_start").all(params.id);
  const paymentPlans = db.prepare("SELECT * FROM payment_plans WHERE project_id = ? ORDER BY sort_order").all(params.id);

  return NextResponse.json({ ...project as any, tasks, paymentPlans });
}
