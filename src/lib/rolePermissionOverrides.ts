import { getDb } from "./db";

export type RolePermissionOverride = {
  addPermissions: string[];
  removePermissions: string[];
  dataScope?: string | null;
};

type Database = ReturnType<typeof getDb>;

const globalRoleOverrideState = globalThis as typeof globalThis & {
  __renovationSaasRoleOverrideSchemaReady?: boolean;
};

function parsePermissionList(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}

export function ensureRolePermissionOverrideSchema(db: Database = getDb()) {
  if (globalRoleOverrideState.__renovationSaasRoleOverrideSchemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_org_permission_overrides (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      role_id TEXT NOT NULL REFERENCES roles(id),
      org_unit_id TEXT NOT NULL REFERENCES org_units(id),
      add_permissions TEXT NOT NULL DEFAULT '[]',
      remove_permissions TEXT NOT NULL DEFAULT '[]',
      data_scope TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_org_permission_override
      ON role_org_permission_overrides(role_id, org_unit_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_role_org_permission_company
      ON role_org_permission_overrides(company_id, role_id, deleted_at);
  `);
  globalRoleOverrideState.__renovationSaasRoleOverrideSchemaReady = true;
}

export function getOrgAncestorIds(db: Database, companyId: string, orgUnitId: string | null) {
  if (!orgUnitId) return [];
  return (db.prepare(`
    WITH RECURSIVE ancestors(id, parent_id, depth) AS (
      SELECT id, parent_id, 0
      FROM org_units
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      UNION ALL
      SELECT parent.id, parent.parent_id, ancestors.depth + 1
      FROM org_units parent
      INNER JOIN ancestors ON parent.id = ancestors.parent_id
      WHERE parent.company_id = ? AND parent.deleted_at IS NULL
    )
    SELECT id FROM ancestors ORDER BY depth ASC
  `).all(orgUnitId, companyId, companyId) as { id: string }[]).map((row) => row.id);
}

export function applyRolePermissionOverrides(
  basePermissions: string[],
  overrides: RolePermissionOverride[],
  baseDataScope: string,
) {
  const permissions = new Set(basePermissions);
  let dataScope = baseDataScope;
  overrides.forEach((override) => {
    override.addPermissions.forEach((permission) => permissions.add(permission));
    override.removePermissions.forEach((permission) => permissions.delete(permission));
    if (override.dataScope) dataScope = override.dataScope;
  });
  return {
    permissions: Array.from(permissions),
    dataScope,
  };
}

export function getEffectiveRolePermissions(
  db: Database,
  companyId: string,
  roleCode: string,
  _orgUnitId: string | null,
) {
  const role = db.prepare(`
    SELECT id, permissions, data_scope
    FROM roles
    WHERE company_id = ? AND code = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(companyId, roleCode) as { id: string; permissions: string | null; data_scope: string | null } | undefined;
  if (!role) return null;
  return {
    roleId: role.id,
    permissions: parsePermissionList(role.permissions),
    dataScope: String(role.data_scope || "self"),
  };
}
