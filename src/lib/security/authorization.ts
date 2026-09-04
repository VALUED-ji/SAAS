import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getRequestSession } from "@/lib/security/session";
import { isSameOriginMutation } from "@/lib/security/requestOrigin";

export { isSameOriginMutation };

export type AuthContext = {
  userId: string;
  companyId: string;
  role: string;
  orgUnitId: string | null;
  permissions: string[];
  dataScope: string;
  isAdmin: boolean;
};

function parsePermissions(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export function getAuthContext(req: NextRequest): AuthContext | null {
  const session = getRequestSession(req);
  if (!session) return null;

  const db = getDb();
  const user = db.prepare(`
    SELECT id, company_id, role, org_unit_id, COALESCE(session_version, 0) as session_version
    FROM users
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(session.userId, session.companyId) as any;
  if (!user) return null;
  if (Number(user.session_version || 0) !== session.sessionVersion) return null;

  const roleRow = db.prepare(`
    SELECT permissions, data_scope
    FROM roles
    WHERE company_id = ? AND code = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(user.company_id, user.role) as any;
  const role = String(user.role || "").toUpperCase();
  return {
    userId: String(user.id),
    companyId: String(user.company_id),
    role,
    orgUnitId: user.org_unit_id ? String(user.org_unit_id) : null,
    permissions: parsePermissions(roleRow?.permissions),
    dataScope: String(roleRow?.data_scope || "self"),
    isAdmin: role === "OWNER" || role === "ADMIN",
  };
}

export function hasPermission(auth: AuthContext, permission: string) {
  return auth.isAdmin || auth.permissions.includes(permission);
}

export function canManageOrganization(auth: AuthContext) {
  return hasPermission(auth, "organization.manage");
}

export function canManageTeam(auth: AuthContext) {
  return hasPermission(auth, "team.manage");
}

export function canManageRoles(auth: AuthContext) {
  return hasPermission(auth, "roles.manage");
}

export function canViewCustomers(auth: AuthContext) {
  return hasPermission(auth, "customers.view");
}

export function canEditCustomers(auth: AuthContext) {
  return hasPermission(auth, "customers.edit");
}

export function canAssignCustomers(auth: AuthContext) {
  return hasPermission(auth, "customers.assign") || canManageTeam(auth);
}

export function canViewDashboard(auth: AuthContext) {
  return hasPermission(auth, "dashboard.view");
}

export function canManageMaterials(auth: AuthContext) {
  return hasPermission(auth, "materials.manage");
}

export function customerBelongsToCompany(auth: AuthContext, customerId: string) {
  if (!customerId) return false;
  const row = getDb().prepare(`
    SELECT id
    FROM customers
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(customerId, auth.companyId) as { id?: string } | undefined;
  return Boolean(row?.id);
}

export function projectBelongsToCompany(auth: AuthContext, projectId: string) {
  if (!projectId) return false;
  const row = getDb().prepare(`
    SELECT id
    FROM projects
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(projectId, auth.companyId) as { id?: string } | undefined;
  return Boolean(row?.id);
}

export function orgBelongsToCompany(auth: AuthContext, orgUnitId: string) {
  if (!orgUnitId) return false;
  const row = getDb().prepare(`
    SELECT id
    FROM org_units
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(orgUnitId, auth.companyId) as { id?: string } | undefined;
  return Boolean(row?.id);
}
