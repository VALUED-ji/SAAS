import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import { canViewCustomers, customerBelongsToCompany, getAuthContext } from "@/lib/security/authorization";

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
  if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

  const db = getDb();
  const customer = db.prepare("SELECT id FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(params.id, auth.companyId) as any;

  if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

  const { org_unit_id, settings } = getBranchSettingsForCustomer(db, params.id);

  return NextResponse.json({
    org_unit_id,
    collectionRules: settings.collectionRules,
    businessRules: settings.businessRules,
  });
}
