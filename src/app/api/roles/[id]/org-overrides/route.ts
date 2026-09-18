import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cleanRolePermissions } from "@/lib/rolePermissions";
import { ensureRolePermissionOverrideSchema } from "@/lib/rolePermissionOverrides";
import { canManageRoles, getAuthContext } from "@/lib/security/authorization";

const dataScopes = new Set(["self", "team", "dept", "store", "company", "region", "group"]);

function parsePermissions(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeScope(value: unknown) {
  const scope = String(value || "").trim();
  return dataScopes.has(scope) ? scope : null;
}

function getRole(db: ReturnType<typeof getDb>, companyId: string, roleId: string) {
  return db.prepare(`
    SELECT id, code, permissions, data_scope
    FROM roles
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(roleId, companyId) as {
    id: string;
    code: string;
    permissions: string | null;
    data_scope: string | null;
  } | undefined;
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageRoles(auth)) return NextResponse.json({ message: "没有角色管理权限" }, { status: 403 });
  const { id: roleId } = await paramsPromise;
  const db = getDb();
  ensureRolePermissionOverrideSchema(db);
  const role = getRole(db, auth.companyId, roleId);
  if (!role) return NextResponse.json({ message: "角色不存在或已删除" }, { status: 404 });

  const orgUnits = db.prepare(`
    SELECT id, name, parent_id, type, COALESCE(is_active, 1) as is_active
    FROM org_units
    WHERE company_id = ? AND deleted_at IS NULL
  `).all(auth.companyId) as {
    id: string;
    name: string;
    parent_id: string | null;
    type: string;
    is_active: number;
  }[];
  const orgById = new Map(orgUnits.map((unit) => [unit.id, unit]));
  const pathOf = (orgUnitId: string) => {
    const names: string[] = [];
    let current = orgById.get(orgUnitId);
    while (current) {
      names.unshift(current.name);
      current = current.parent_id ? orgById.get(current.parent_id) : undefined;
    }
    return names.join(" / ");
  };
  const overrides = db.prepare(`
    SELECT id, org_unit_id, add_permissions, remove_permissions, data_scope, updated_at
    FROM role_org_permission_overrides
    WHERE company_id = ? AND role_id = ? AND deleted_at IS NULL
  `).all(auth.companyId, roleId) as {
    id: string;
    org_unit_id: string;
    add_permissions: string | null;
    remove_permissions: string | null;
    data_scope: string | null;
    updated_at: string | null;
  }[];
  const overrideByOrgId = new Map(overrides.map((row) => [row.org_unit_id, row]));

  return NextResponse.json({
    role: {
      id: role.id,
      code: role.code,
      permissions: parsePermissions(role.permissions),
      data_scope: role.data_scope || "self",
    },
    items: orgUnits
      .filter((unit) => unit.type === "company")
      .map((unit) => {
        const override = overrideByOrgId.get(unit.id);
        return {
          org_unit_id: unit.id,
          name: unit.name,
          path: pathOf(unit.id),
          is_active: Number(unit.is_active ?? 1),
          has_override: Boolean(override),
          add_permissions: override ? parsePermissions(override.add_permissions) : [],
          remove_permissions: override ? parsePermissions(override.remove_permissions) : [],
          data_scope: override?.data_scope || null,
          updated_at: override?.updated_at || null,
        };
      }),
  });
}

export async function PUT(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageRoles(auth)) return NextResponse.json({ message: "没有角色管理权限" }, { status: 403 });
  try {
    const { id: roleId } = await paramsPromise;
    const body = await req.json();
    const orgUnitId = String(body?.org_unit_id || "").trim();
    if (!orgUnitId) return NextResponse.json({ message: "请选择分公司" }, { status: 400 });
    const addPermissions = cleanRolePermissions(body?.add_permissions);
    const removePermissions = cleanRolePermissions(body?.remove_permissions)
      .filter((permission) => !addPermissions.includes(permission));
    const dataScope = normalizeScope(body?.data_scope);

    const db = getDb();
    ensureRolePermissionOverrideSchema(db);
    const role = getRole(db, auth.companyId, roleId);
    if (!role) return NextResponse.json({ message: "角色不存在或已删除" }, { status: 404 });
    const orgUnit = db.prepare(`
      SELECT id
      FROM org_units
      WHERE id = ? AND company_id = ? AND type = 'company' AND deleted_at IS NULL
      LIMIT 1
    `).get(orgUnitId, auth.companyId) as { id?: string } | undefined;
    if (!orgUnit?.id) return NextResponse.json({ message: "分公司不存在或已删除" }, { status: 404 });

    const existing = db.prepare(`
      SELECT id
      FROM role_org_permission_overrides
      WHERE company_id = ? AND role_id = ? AND org_unit_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(auth.companyId, roleId, orgUnitId) as { id?: string } | undefined;

    if (addPermissions.length === 0 && removePermissions.length === 0 && !dataScope) {
      if (existing?.id) {
        db.prepare(`
          UPDATE role_org_permission_overrides
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(existing.id, auth.companyId);
      }
      return NextResponse.json({ success: true, inherited: true });
    }

    if (existing?.id) {
      db.prepare(`
        UPDATE role_org_permission_overrides
        SET add_permissions = ?, remove_permissions = ?, data_scope = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(JSON.stringify(addPermissions), JSON.stringify(removePermissions), dataScope, existing.id, auth.companyId);
    } else {
      const id = `ROLE_ORG_OVERRIDE_${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      db.prepare(`
        INSERT INTO role_org_permission_overrides (
          id, company_id, role_id, org_unit_id, add_permissions, remove_permissions, data_scope, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        auth.companyId,
        roleId,
        orgUnitId,
        JSON.stringify(addPermissions),
        JSON.stringify(removePermissions),
        dataScope,
      );
    }
    return NextResponse.json({ success: true, inherited: false });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存分公司权限失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageRoles(auth)) return NextResponse.json({ message: "没有角色管理权限" }, { status: 403 });
  try {
    const { id: roleId } = await paramsPromise;
    const orgUnitId = req.nextUrl.searchParams.get("org_unit_id") || "";
    if (!orgUnitId) return NextResponse.json({ message: "缺少分公司 ID" }, { status: 400 });
    const db = getDb();
    ensureRolePermissionOverrideSchema(db);
    db.prepare(`
      UPDATE role_org_permission_overrides
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE company_id = ? AND role_id = ? AND org_unit_id = ? AND deleted_at IS NULL
    `).run(auth.companyId, roleId, orgUnitId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "恢复继承失败" }, { status: 500 });
  }
}
