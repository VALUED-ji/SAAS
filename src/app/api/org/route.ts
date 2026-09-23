import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { formatOrgManagerNames, getOrgManagerMap, normalizeOrgManagerIds, setOrgManagers } from "@/lib/orgManagers";
import { normalizeOrgUnitDisplayName, normalizeOrgUnitNameKey } from "@/lib/orgUnitDuplicates";
import { canManageOrganization, getAuthContext } from "@/lib/security/authorization";

function ensureOrgColumns(db: ReturnType<typeof getDb>) {
  const columns = db.prepare("PRAGMA table_info(org_units)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "manager_id")) {
    db.prepare("ALTER TABLE org_units ADD COLUMN manager_id TEXT REFERENCES users(id)").run();
  }
  if (!columns.some((column) => column.name === "manager_name")) {
    db.prepare("ALTER TABLE org_units ADD COLUMN manager_name TEXT").run();
  }
  if (!columns.some((column) => column.name === "is_active")) {
    db.prepare("ALTER TABLE org_units ADD COLUMN is_active INTEGER DEFAULT 1").run();
  }
  if (!columns.some((column) => column.name === "sort_order")) {
    db.prepare("ALTER TABLE org_units ADD COLUMN sort_order INTEGER DEFAULT 0").run();
  }
}

function getManagerIdsFromBody(body: any) {
  if (Array.isArray(body?.manager_ids)) return normalizeOrgManagerIds(body.manager_ids);
  if (body?.manager_id !== undefined) return normalizeOrgManagerIds(body.manager_id);
  return undefined;
}

function getOrgTypeLabel(type: unknown) {
  const labels: Record<string, string> = {
    group: "集团",
    region: "大区",
    company: "公司",
    store: "门店",
    dept: "部门",
    team: "小组",
  };
  return labels[String(type || "").trim()] || "组织";
}

function getDescendantOrgIds(db: ReturnType<typeof getDb>, id: string, companyId: string): string[] {
  const children = db.prepare("SELECT id FROM org_units WHERE parent_id = ? AND company_id = ? AND deleted_at IS NULL")
    .all(id, companyId) as { id: string }[];
  return children.flatMap((child) => [child.id, ...getDescendantOrgIds(db, child.id, companyId)]);
}

function countMembersByOrgIds(db: ReturnType<typeof getDb>, ids: string[], companyId: string) {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM users
    WHERE company_id = ? AND org_unit_id IN (${placeholders}) AND deleted_at IS NULL
  `).get(companyId, ...ids) as { count: number } | undefined;
  return Number(row?.count || 0);
}

function getOrgNamesByIds(db: ReturnType<typeof getDb>, ids: string[], companyId: string) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return (db.prepare(`
    SELECT TRIM(COALESCE(name, '')) as name
    FROM org_units
    WHERE company_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL
  `).all(companyId, ...ids) as { name: string }[])
    .map((row) => row.name)
    .filter(Boolean);
}

function countCustomersByStoreNames(db: ReturnType<typeof getDb>, names: string[], companyId: string) {
  const normalizedNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (normalizedNames.length === 0) return 0;
  const placeholders = normalizedNames.map(() => "?").join(",");
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL
      AND TRIM(COALESCE(service_store, '')) IN (${placeholders})
  `).get(companyId, ...normalizedNames) as { count: number } | undefined;
  return Number(row?.count || 0);
}

function getCustomerCountMap(db: ReturnType<typeof getDb>, companyId: string) {
  const rows = db.prepare(`
    SELECT TRIM(COALESCE(service_store, '')) as name, COUNT(*) as count
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL AND TRIM(COALESCE(service_store, '')) != ''
    GROUP BY TRIM(COALESCE(service_store, ''))
  `).all(companyId) as { name: string; count: number }[];
  return new Map(rows.map((row) => [row.name, Number(row.count || 0)]));
}

function managersBelongToCompany(db: ReturnType<typeof getDb>, managerIds: string[], companyId: string) {
  if (!managerIds.length) return true;
  const placeholders = managerIds.map(() => "?").join(",");
  const row = db.prepare(`
    SELECT COUNT(*) as total
    FROM users
    WHERE company_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
  `).get(companyId, ...managerIds) as { total?: number } | undefined;
  return Number(row?.total || 0) === managerIds.length;
}

function findDuplicateOrgUnit(
  db: ReturnType<typeof getDb>,
  companyId: string,
  name: string,
  type: string,
  parentId: string | null | undefined,
  excludeId?: string,
) {
  const rows = db.prepare(`
    SELECT id, name
    FROM org_units
    WHERE company_id = ?
      AND type = ?
      AND COALESCE(parent_id, '') = COALESCE(?, '')
      AND deleted_at IS NULL
      AND (? IS NULL OR id <> ?)
  `).all(companyId, type, parentId || null, excludeId || null, excludeId || null) as { id: string; name: string }[];
  const normalizedName = normalizeOrgUnitNameKey(name);
  return rows.find((row) => normalizeOrgUnitNameKey(row.name) === normalizedName) || null;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const db = getDb();
  ensureOrgColumns(db);
  const customerCountMap = getCustomerCountMap(db, auth.companyId);
  const units = db.prepare(`
    SELECT o.*, COALESCE(o.is_active, 1) as is_active, u.name as manager_user_name
    FROM org_units o
    LEFT JOIN users u ON o.manager_id = u.id AND u.company_id = o.company_id AND u.deleted_at IS NULL
    WHERE o.company_id = ? AND o.deleted_at IS NULL
    ORDER BY
      CASE WHEN o.parent_id IS NULL THEN 0 ELSE 1 END,
      COALESCE(o.parent_id, ''),
      o.type,
      COALESCE(o.sort_order, 0),
      COALESCE(o.created_at, ''),
      o.id
  `).all(auth.companyId) as any[];
  const managerMap = getOrgManagerMap(db, units.map((unit) => unit.id));
  const duplicateGroupSizes = new Map<string, number>();
  units.forEach((unit) => {
    const key = [
      String(unit.parent_id || ""),
      String(unit.type || "").toLowerCase(),
      normalizeOrgUnitNameKey(unit.name),
    ].join("::");
    duplicateGroupSizes.set(key, (duplicateGroupSizes.get(key) || 0) + 1);
  });
  return NextResponse.json(units.map((unit) => {
    const duplicateKey = [
      String(unit.parent_id || ""),
      String(unit.type || "").toLowerCase(),
      normalizeOrgUnitNameKey(unit.name),
    ].join("::");
    const duplicateGroupSize = duplicateGroupSizes.get(duplicateKey) || 1;
    return {
    ...unit,
    managers: managerMap.get(unit.id) || [],
    manager_ids: (managerMap.get(unit.id) || []).map((manager) => manager.id),
    manager_names: formatOrgManagerNames(managerMap.get(unit.id) || []),
    manager_user_name: formatOrgManagerNames(managerMap.get(unit.id) || []) || unit.manager_user_name,
    is_active: Number(unit.is_active ?? 1),
    customer_count: customerCountMap.get(String(unit.name || "").trim()) || 0,
    duplicate_group_size: duplicateGroupSize,
    is_duplicate: duplicateGroupSize > 1,
    };
  }));
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageOrganization(auth)) return NextResponse.json({ message: "没有组织管理权限" }, { status: 403 });
  try {
    const body = await req.json();
    const { type, parent_id } = body;
    const name = normalizeOrgUnitDisplayName(body.name);
    const managerIds = getManagerIdsFromBody(body) || [];
    if (!name || !type) return NextResponse.json({ message: "名称和类型不能为空" }, { status: 400 });
    const db = getDb();
    ensureOrgColumns(db);
    if (!managersBelongToCompany(db, managerIds, auth.companyId)) {
      return NextResponse.json({ message: "管理人员不存在、已停用或不属于当前公司" }, { status: 400 });
    }
    if (parent_id) {
      const parent = db.prepare("SELECT id, COALESCE(is_active, 1) as is_active FROM org_units WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
        .get(parent_id, auth.companyId) as any;
      if (!parent) return NextResponse.json({ message: "上级组织不存在" }, { status: 400 });
      if (Number(parent.is_active ?? 1) !== 1) return NextResponse.json({ message: "停用组织下不能新增下级组织" }, { status: 400 });
    }
    const duplicate = findDuplicateOrgUnit(db, auth.companyId, name, String(type), parent_id);
    if (duplicate) {
      return NextResponse.json({
        code: "ORG_DUPLICATE_NAME",
        message: `同一上级下已存在${getOrgTypeLabel(type)}「${name}」，不能重复创建`,
      }, { status: 409 });
    }
    const id = `OG${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const sortOrderRow = parent_id
      ? db.prepare(`
          SELECT COALESCE(MAX(sort_order), 0) + 10 as next_sort_order
          FROM org_units
          WHERE company_id = ? AND parent_id = ? AND type = ? AND deleted_at IS NULL
        `).get(auth.companyId, parent_id, type) as { next_sort_order?: number } | undefined
      : db.prepare(`
          SELECT COALESCE(MAX(sort_order), 0) + 10 as next_sort_order
          FROM org_units
          WHERE company_id = ? AND parent_id IS NULL AND type = ? AND deleted_at IS NULL
        `).get(auth.companyId, type) as { next_sort_order?: number } | undefined;
    db.prepare("INSERT INTO org_units (id, company_id, parent_id, name, type, sort_order) VALUES (?,?,?,?,?,?)")
      .run(id, auth.companyId, parent_id || null, name, type, Number(sortOrderRow?.next_sort_order || 10));
    try {
      setOrgManagers(db, id, managerIds);
    } catch (error: any) {
      db.prepare("UPDATE org_units SET deleted_at = datetime('now') WHERE id = ?").run(id);
      return NextResponse.json({ message: error.message || "管理人员不存在或已停用" }, { status: 400 });
    }
    const unit = db.prepare("SELECT * FROM org_units WHERE id = ?").get(id);
    return NextResponse.json(unit, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "创建失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageOrganization(auth)) return NextResponse.json({ message: "没有组织管理权限" }, { status: 403 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    const body = await req.json();
    const { type, credit_code, manager_name, address, is_active } = body;
    const name = body.name === undefined ? undefined : normalizeOrgUnitDisplayName(body.name);
    const managerIds = getManagerIdsFromBody(body);
    if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
    const db = getDb();
    ensureOrgColumns(db);
    const target = db.prepare("SELECT id, name, type, parent_id FROM org_units WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(id, auth.companyId) as { id: string; name: string; type: string; parent_id: string | null } | undefined;
    if (!target) return NextResponse.json({ message: "组织不存在或已删除" }, { status: 404 });
    if (managerIds !== undefined && !managersBelongToCompany(db, managerIds, auth.companyId)) {
      return NextResponse.json({ message: "管理人员不存在、已停用或不属于当前公司" }, { status: 400 });
    }
    const nextName = name === undefined ? target.name : name;
    const nextType = type === undefined ? target.type : String(type);
    if (!nextName.trim()) return NextResponse.json({ message: "组织名称不能为空" }, { status: 400 });
    const duplicate = findDuplicateOrgUnit(db, auth.companyId, nextName, nextType, target.parent_id, id);
    if (duplicate) {
      return NextResponse.json({
        code: "ORG_DUPLICATE_NAME",
        message: `同一上级下已存在同名组织「${nextName}」，不能保存重复名称`,
      }, { status: 409 });
    }
    if (name !== undefined) db.prepare("UPDATE org_units SET name = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(nextName, id, auth.companyId);
    if (type) db.prepare("UPDATE org_units SET type = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(type, id, auth.companyId);
    if (credit_code !== undefined) db.prepare("UPDATE org_units SET credit_code = ? WHERE id = ? AND company_id = ?").run(credit_code, id, auth.companyId);
    if (managerIds !== undefined) {
      try {
        setOrgManagers(db, id, managerIds);
      } catch (error: any) {
        return NextResponse.json({ message: error.message || "管理人员不存在或已停用" }, { status: 400 });
      }
    } else if (manager_name !== undefined) {
      db.prepare("UPDATE org_units SET manager_name = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(manager_name, id, auth.companyId);
    }
    if (address !== undefined) db.prepare("UPDATE org_units SET address = ? WHERE id = ? AND company_id = ?").run(address, id, auth.companyId);
    if (is_active !== undefined) {
      const nextActive = is_active === true || is_active === 1 || is_active === "1" ? 1 : 0;
      db.prepare("UPDATE org_units SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?").run(nextActive, id, auth.companyId);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageOrganization(auth)) return NextResponse.json({ message: "没有组织管理权限" }, { status: 403 });
  try {
    const body = await req.json();
    const orderedIds = Array.from(new Set(
      (Array.isArray(body?.ordered_ids) ? body.ordered_ids : [])
        .map((id: unknown) => String(id || "").trim())
        .filter(Boolean),
    ));
    if (orderedIds.length < 2) {
      return NextResponse.json({ message: "至少需要两个组织才能排序" }, { status: 400 });
    }

    const db = getDb();
    ensureOrgColumns(db);
    const placeholders = orderedIds.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT id, parent_id, type
      FROM org_units
      WHERE company_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL
    `).all(auth.companyId, ...orderedIds) as { id: string; parent_id: string | null; type: string }[];
    if (rows.length !== orderedIds.length) {
      return NextResponse.json({ message: "排序数据已变化，请刷新后重试" }, { status: 409 });
    }

    const first = rows[0];
    const sameScope = rows.every((row) => (
      row.parent_id === first.parent_id
      && row.type === first.type
    ));
    if (!sameScope) {
      return NextResponse.json({ message: "只能在同一上级、同一组织类型内调整顺序" }, { status: 400 });
    }

    const updateOrder = db.prepare(`
      UPDATE org_units
      SET sort_order = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `);
    db.exec("BEGIN");
    try {
      orderedIds.forEach((id, index) => {
        updateOrder.run((index + 1) * 10, id, auth.companyId);
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "排序保存失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageOrganization(auth)) return NextResponse.json({ message: "没有组织管理权限" }, { status: 403 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
    const db = getDb();
    ensureOrgColumns(db);

    const unit = db.prepare("SELECT id, TRIM(COALESCE(name, '')) as name FROM org_units WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(id, auth.companyId) as { id: string; name: string } | undefined;
    if (!unit) return NextResponse.json({ message: "组织不存在或已删除" }, { status: 404 });

    const directChildren = db.prepare("SELECT id FROM org_units WHERE parent_id = ? AND company_id = ? AND deleted_at IS NULL")
      .all(id, auth.companyId) as { id: string }[];
    const descendantIds = getDescendantOrgIds(db, id, auth.companyId);
    const directMembers = countMembersByOrgIds(db, [id], auth.companyId);
    const descendantMembers = countMembersByOrgIds(db, descendantIds, auth.companyId);
    const descendantNames = getOrgNamesByIds(db, descendantIds, auth.companyId);
    const directCustomers = countCustomersByStoreNames(db, [unit.name], auth.companyId);
    const descendantCustomers = countCustomersByStoreNames(db, descendantNames, auth.companyId);

    if (descendantIds.length > 0 || directMembers + descendantMembers > 0 || directCustomers + descendantCustomers > 0) {
      return NextResponse.json({
        message: "该组织下仍有下级组织、关联成员或客户数据，暂不能删除",
        details: {
          direct_children: directChildren.length,
          descendant_orgs: descendantIds.length,
          direct_members: directMembers,
          descendant_members: descendantMembers,
          direct_customers: directCustomers,
          descendant_customers: descendantCustomers,
        },
      }, { status: 409 });
    }

    db.prepare("UPDATE org_units SET deleted_at = datetime('now') WHERE id = ? AND company_id = ?").run(id, auth.companyId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
