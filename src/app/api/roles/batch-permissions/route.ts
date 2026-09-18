import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultRoles, getDb } from "@/lib/db";
import { cleanRolePermissions } from "@/lib/rolePermissions";
import { canManageRoles, getAuthContext } from "@/lib/security/authorization";

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageRoles(auth)) return NextResponse.json({ message: "没有角色管理权限" }, { status: 403 });

  try {
    const body = await req.json();
    const roleIds = Array.from(new Set(
      (Array.isArray(body?.role_ids) ? body.role_ids : [])
        .map((id: unknown) => String(id || "").trim())
        .filter(Boolean),
    ));
    const permissions = cleanRolePermissions(body?.permissions);
    if (roleIds.length === 0) {
      return NextResponse.json({ message: "请至少选择一个角色" }, { status: 400 });
    }
    if (permissions.length === 0) {
      return NextResponse.json({ message: "请至少选择一项权限" }, { status: 400 });
    }

    const db = getDb();
    ensureDefaultRoles(db);
    const placeholders = roleIds.map(() => "?").join(",");
    const roles = db.prepare(`
      SELECT id, permissions
      FROM roles
      WHERE company_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL
    `).all(auth.companyId, ...roleIds) as { id: string; permissions: string | null }[];
    if (roles.length !== roleIds.length) {
      return NextResponse.json({ message: "部分角色已删除或不存在，请刷新后重试" }, { status: 409 });
    }

    const updateRole = db.prepare(`
      UPDATE roles
      SET permissions = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `);
    let updatedRoleCount = 0;
    let addedPermissionCount = 0;
    let skippedPermissionCount = 0;

    db.exec("BEGIN");
    try {
      roles.forEach((role) => {
        let existingPermissions: string[] = [];
        try {
          const parsed = JSON.parse(role.permissions || "[]");
          existingPermissions = Array.isArray(parsed)
            ? Array.from(new Set(parsed.map((permission) => String(permission || "").trim()).filter(Boolean)))
            : [];
        } catch {
          existingPermissions = [];
        }
        const existingSet = new Set(existingPermissions);
        const nextPermissions = [...existingPermissions];
        permissions.forEach((permission) => {
          if (existingSet.has(permission)) {
            skippedPermissionCount += 1;
            return;
          }
          existingSet.add(permission);
          nextPermissions.push(permission);
          addedPermissionCount += 1;
        });
        if (nextPermissions.length !== existingPermissions.length) {
          updateRole.run(JSON.stringify(nextPermissions), role.id, auth.companyId);
          updatedRoleCount += 1;
        }
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return NextResponse.json({
      success: true,
      updated_role_count: updatedRoleCount,
      added_permission_count: addedPermissionCount,
      skipped_permission_count: skippedPermissionCount,
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "批量增加权限失败" }, { status: 500 });
  }
}
