import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getRequestSession, setSessionCookie, signSessionToken } from "@/lib/security/session";
import { getCompanyShortNameForOrgUnit, getSidebarBrandLogoUrlForOrgUnit, getSidebarBrandNameForOrgUnit, getSidebarBrandSubtitleForOrgUnit } from "@/lib/branchSettingsLookup";
import { ensureQuotationAccessColumns, parseQuotationAccessOrgUnitIds } from "@/lib/quotationOrgAccess";

function parsePermissions(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const decoded = getRequestSession(req);
  if (!decoded) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  try {
    const db = getDb();
    ensureQuotationAccessColumns(db);
    const user = db.prepare(`
      SELECT id, company_id, name, phone, avatar, role, org_unit_id, quotation_access_org_unit_ids, COALESCE(session_version, 0) as session_version
      FROM users
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND is_active = 1
    `).get(decoded.userId, decoded.companyId) as any;
    const company = db.prepare("SELECT name FROM companies WHERE id = ? AND deleted_at IS NULL").get(decoded.companyId) as any;

    if (!user) {
      return NextResponse.json({ message: "用户不存在" }, { status: 401 });
    }
    if (Number(user.session_version || 0) !== decoded.sessionVersion) {
      return NextResponse.json({ message: "登录已失效，请重新登录" }, { status: 401 });
    }
    const role = db.prepare(`
      SELECT permissions
      FROM roles
      WHERE company_id = ? AND code = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
      LIMIT 1
    `).get(user.company_id, user.role) as any;
    const companyShortName = getCompanyShortNameForOrgUnit(db, user.org_unit_id, user.company_id);
    const sidebarBrandName = getSidebarBrandNameForOrgUnit(db, user.org_unit_id, user.company_id);
    const sidebarBrandLogoUrl = getSidebarBrandLogoUrlForOrgUnit(db, user.org_unit_id, user.company_id);
    const sidebarBrandSubtitle = getSidebarBrandSubtitleForOrgUnit(db, user.org_unit_id, user.company_id);

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET last_seen_at = ?,
          last_login_at = COALESCE(last_login_at, ?),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(now, now, decoded.userId);

    const response = NextResponse.json({
      id: user.id,
      company_id: user.company_id,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
      permissions: parsePermissions(role?.permissions),
      org_unit_id: user.org_unit_id,
      quotation_access_org_unit_ids: parseQuotationAccessOrgUnitIds(user.quotation_access_org_unit_ids),
      companyName: company?.name || "",
      companyShortName,
      sidebarBrandName,
      sidebarBrandLogoUrl,
      sidebarBrandSubtitle,
    });
    setSessionCookie(response, signSessionToken({
      userId: decoded.userId,
      companyId: decoded.companyId,
      role: decoded.role,
      sessionVersion: decoded.sessionVersion,
    }));
    return response;
  } catch {
    return NextResponse.json({ message: "登录状态校验失败" }, { status: 500 });
  }
}
