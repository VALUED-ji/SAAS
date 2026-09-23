import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  countCustomersByOrgUnitName,
  getOrgUnitDescendantIds,
  mergeOrgUnitData,
  type OrgUnitMergeRecord,
} from "@/lib/orgUnitMerge";
import { normalizeOrgUnitNameKey } from "@/lib/orgUnitDuplicates";
import { canManageOrganization, getAuthContext } from "@/lib/security/authorization";

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function ensureMergeLogTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_unit_merge_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      target_type TEXT,
      moved_children INTEGER DEFAULT 0,
      affected_members INTEGER DEFAULT 0,
      affected_customers INTEGER DEFAULT 0,
      created_by_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_org_unit_merge_logs_company
      ON org_unit_merge_logs(company_id, created_at DESC);
  `);
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageOrganization(auth)) return NextResponse.json({ message: "没有组织管理权限" }, { status: 403 });

  try {
    const body = await req.json();
    const sourceId = String(body?.source_id || "").trim();
    const targetId = String(body?.target_id || "").trim();
    const mode = String(body?.mode || "duplicate").trim() === "general" ? "general" : "duplicate";
    if (!sourceId || !targetId) return NextResponse.json({ message: "请选择要合并和被保留的组织" }, { status: 400 });
    if (sourceId === targetId) return NextResponse.json({ message: "不能合并到自身" }, { status: 400 });

    const db = getDb();
    const source = db.prepare(`
      SELECT id, company_id, parent_id, name, type, manager_id, manager_name, COALESCE(is_active, 1) AS is_active
      FROM org_units
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `).get(sourceId, auth.companyId) as OrgUnitMergeRecord | undefined;
    const target = db.prepare(`
      SELECT id, company_id, parent_id, name, type, manager_id, manager_name, COALESCE(is_active, 1) AS is_active
      FROM org_units
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `).get(targetId, auth.companyId) as OrgUnitMergeRecord | undefined;
    if (!source || !target) return NextResponse.json({ message: "组织不存在或已删除" }, { status: 404 });

    const sameScope = String(source.parent_id || "") === String(target.parent_id || "")
      && String(source.type || "").toLowerCase() === String(target.type || "").toLowerCase()
      && normalizeOrgUnitNameKey(source.name) === normalizeOrgUnitNameKey(target.name);
    if (mode === "duplicate" && !sameScope) {
      return NextResponse.json({ message: "重复组织合并只能选择同上级、同类型且同名的组织" }, { status: 400 });
    }
    if (mode === "general" && Number(target.is_active ?? 1) !== 1) {
      return NextResponse.json({ message: "保留组织必须处于启用状态" }, { status: 400 });
    }

    const descendantIds = getOrgUnitDescendantIds(db, auth.companyId, source.id);
    if (mode === "general" && descendantIds.includes(target.id)) {
      return NextResponse.json({ message: "不能把组织合并到自己的下级组织" }, { status: 400 });
    }
    const directChildCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM org_units
      WHERE company_id = ? AND parent_id = ? AND deleted_at IS NULL
    `).get(auth.companyId, source.id) as { count: number } | undefined;
    const memberIds = [source.id, ...descendantIds];
    const placeholders = memberIds.map(() => "?").join(",");
    const memberRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE company_id = ? AND deleted_at IS NULL AND org_unit_id IN (${placeholders})
    `).get(auth.companyId, ...memberIds) as { count: number } | undefined;
    const affectedCustomers = countCustomersByOrgUnitName(db, auth.companyId, source.name);

    const mergeResult = mergeOrgUnitData(db, source, target, Number(directChildCount?.count || 0));
    ensureMergeLogTable(db);
    db.prepare(`
      INSERT INTO org_unit_merge_logs (
        id, company_id, mode,
        source_id, source_name, source_type,
        target_id, target_name, target_type,
        moved_children, affected_members, affected_customers, created_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      makeId("OML"),
      auth.companyId,
      mode,
      source.id,
      source.name,
      source.type,
      target.id,
      target.name,
      target.type,
      mergeResult.moved_children,
      Number(memberRow?.count || 0),
      affectedCustomers,
      auth.userId,
    );
    return NextResponse.json({
      success: true,
      mode,
      source_id: source.id,
      target_id: target.id,
      moved_children: mergeResult.moved_children,
      affected_members: Number(memberRow?.count || 0),
      affected_customers: affectedCustomers,
    });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "合并组织失败" }, { status: 500 });
  }
}
