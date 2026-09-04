import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultRoles, getDb } from "@/lib/db";
import { canManageRoles, getAuthContext } from "@/lib/security/authorization";

const permissionCatalog = new Set([
  "dashboard.view",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.import_export",
  "customers.assign",
  "team.view",
  "team.manage",
  "organization.manage",
  "roles.manage",
  "settings.manage",
  "quotations.manage",
  "materials.manage",
  "finance.view",
  "logs.view",
]);

const dataScopes = new Set(["self", "team", "dept", "store", "company", "region", "group"]);

function cleanPermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item)).filter((item) => (
    permissionCatalog.has(item) || /^menu\.[a-z0-9_]+$/.test(item)
  ))));
}

function cleanDataScope(value: unknown): string {
  const scope = String(value || "self");
  return dataScopes.has(scope) ? scope : "self";
}

function makeRoleCode(name: string): string {
  const normalized = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CUSTOM_${normalized || "ROLE"}_${suffix}`;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const db = getDb();
  ensureDefaultRoles(db);
  const rows = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM users u WHERE u.company_id = r.company_id AND u.role = r.code AND u.deleted_at IS NULL) as user_count
    FROM roles r
    WHERE r.company_id = ? AND r.deleted_at IS NULL
    ORDER BY r.is_system DESC, r.sort_order ASC, r.created_at ASC
  `).all(auth.companyId);
  return NextResponse.json(rows.map((row: any) => ({
    ...row,
    permissions: JSON.parse(row.permissions || "[]"),
  })));
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageRoles(auth)) return NextResponse.json({ message: "没有角色管理权限" }, { status: 403 });
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const permissions = cleanPermissions(body.permissions);
    const dataScope = cleanDataScope(body.data_scope);
    if (!name) return NextResponse.json({ message: "角色名称为必填项" }, { status: 400 });

    const db = getDb();
    ensureDefaultRoles(db);
    const companyId = auth.companyId;
    let code = makeRoleCode(name);
    while (db.prepare("SELECT id FROM roles WHERE company_id = ? AND code = ?").get(companyId, code)) {
      code = makeRoleCode(name);
    }
    const id = `ROLE_${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    db.prepare(`
      INSERT INTO roles (id, company_id, code, name, description, permissions, data_scope, is_system, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 100, datetime('now'), datetime('now'))
    `).run(id, companyId, code, name, description || null, JSON.stringify(permissions), dataScope);

    const role = db.prepare(`
      SELECT r.*, 0 as user_count
      FROM roles r
      WHERE r.id = ? AND r.company_id = ?
    `).get(id, auth.companyId) as any;
    return NextResponse.json({ ...role, permissions: JSON.parse(role.permissions || "[]") }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "创建角色失败" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageRoles(auth)) return NextResponse.json({ message: "没有角色管理权限" }, { status: 403 });
  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const permissions = cleanPermissions(body.permissions);
    const dataScope = cleanDataScope(body.data_scope);
    const isActive = body.is_active === false || body.is_active === 0 || body.is_active === "0" ? 0 : 1;
    if (!id) return NextResponse.json({ message: "缺少角色 ID" }, { status: 400 });
    if (!name) return NextResponse.json({ message: "角色名称为必填项" }, { status: 400 });

    const db = getDb();
    ensureDefaultRoles(db);
    const role = db.prepare("SELECT * FROM roles WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(id, auth.companyId) as any;
    if (!role) return NextResponse.json({ message: "角色不存在或已删除" }, { status: 404 });
    const userCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE company_id = ? AND role = ? AND deleted_at IS NULL")
      .get(auth.companyId, role.code) as any)?.count || 0;
    if (!isActive && userCount > 0) {
      return NextResponse.json({ message: "该角色已有员工使用，不能停用" }, { status: 400 });
    }

    db.prepare(`
      UPDATE roles
      SET name = ?, description = ?, permissions = ?, data_scope = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(name, description || null, JSON.stringify(permissions), dataScope, isActive, id, auth.companyId);

    const updated = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM users u WHERE u.company_id = r.company_id AND u.role = r.code AND u.deleted_at IS NULL) as user_count
      FROM roles r
      WHERE r.id = ? AND r.company_id = ?
    `).get(id, auth.companyId) as any;
    return NextResponse.json({ ...updated, permissions: JSON.parse(updated.permissions || "[]") });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存角色失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageRoles(auth)) return NextResponse.json({ message: "没有角色管理权限" }, { status: 403 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ message: "缺少角色 ID" }, { status: 400 });
    const db = getDb();
    ensureDefaultRoles(db);
    const role = db.prepare("SELECT * FROM roles WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(id, auth.companyId) as any;
    if (!role) return NextResponse.json({ message: "角色不存在或已删除" }, { status: 404 });
    if (role.is_system) return NextResponse.json({ message: "系统内置角色不能删除" }, { status: 400 });
    const userCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE company_id = ? AND role = ? AND deleted_at IS NULL")
      .get(auth.companyId, role.code) as any)?.count || 0;
    if (userCount > 0) return NextResponse.json({ message: "该角色已有员工使用，不能删除" }, { status: 400 });
    db.prepare("UPDATE roles SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND company_id = ?")
      .run(id, auth.companyId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "删除角色失败" }, { status: 500 });
  }
}
