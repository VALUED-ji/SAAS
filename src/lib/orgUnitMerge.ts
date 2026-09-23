import type Database from "better-sqlite3";
import { normalizeOrgUnitNameKey } from "@/lib/orgUnitDuplicates";

type Db = Database.Database;

export type OrgUnitMergeRecord = {
  id: string;
  company_id: string;
  parent_id: string | null;
  name: string;
  type: string;
  manager_id?: string | null;
  manager_name?: string | null;
  is_active?: number | null;
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function tableExists(db: Db, table: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function tableColumns(db: Db, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
}

function parseStringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function getOrgUnitDescendantIds(db: Db, companyId: string, rootId: string) {
  const result: string[] = [];
  const visit = (parentId: string) => {
    const children = db.prepare(`
      SELECT id
      FROM org_units
      WHERE company_id = ? AND parent_id = ? AND deleted_at IS NULL
    `).all(companyId, parentId) as { id: string }[];
    children.forEach((child) => {
      result.push(child.id);
      visit(child.id);
    });
  };
  visit(rootId);
  return result;
}

export function countCustomersByOrgUnitName(db: Db, companyId: string, name: string) {
  const nameKey = normalizeOrgUnitNameKey(name);
  return (db.prepare(`
    SELECT service_store
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL AND TRIM(COALESCE(service_store, '')) != ''
  `).all(companyId) as { service_store: string }[])
    .filter((row) => normalizeOrgUnitNameKey(row.service_store) === nameKey)
    .length;
}

function mergeOrgManagers(db: Db, sourceId: string, targetId: string) {
  if (!tableExists(db, "org_unit_managers")) return;
  const targetManagers = db.prepare(`
    SELECT id, user_id, COALESCE(is_primary, 0) AS is_primary
    FROM org_unit_managers
    WHERE org_unit_id = ? AND deleted_at IS NULL
  `).all(targetId) as { id: string; user_id: string; is_primary: number }[];
  const sourceManagers = db.prepare(`
    SELECT id, user_id, COALESCE(is_primary, 0) AS is_primary
    FROM org_unit_managers
    WHERE org_unit_id = ? AND deleted_at IS NULL
  `).all(sourceId) as { id: string; user_id: string; is_primary: number }[];

  if (targetManagers.length === 0 && sourceManagers.length > 0) {
    db.prepare(`
      UPDATE org_unit_managers
      SET org_unit_id = ?, is_primary = CASE WHEN user_id = ? THEN 1 ELSE 0 END
      WHERE org_unit_id = ? AND deleted_at IS NULL
    `).run(targetId, sourceManagers[0].user_id, sourceId);
    return;
  }

  const targetUserIds = new Set(targetManagers.map((manager) => manager.user_id));
  sourceManagers.forEach((manager) => {
    if (!targetUserIds.has(manager.user_id)) {
      db.prepare(`
        INSERT INTO org_unit_managers (id, org_unit_id, user_id, is_primary)
        VALUES (?, ?, ?, 0)
      `).run(makeId("OM"), targetId, manager.user_id);
    }
  });
  db.prepare(`
    UPDATE org_unit_managers
    SET deleted_at = datetime('now')
    WHERE org_unit_id = ? AND deleted_at IS NULL
  `).run(sourceId);
}

function mergeBranchSettings(db: Db, sourceId: string, targetId: string) {
  if (!tableExists(db, "branch_settings")) return;
  const source = db.prepare(`
    SELECT id, settings, deleted_at
    FROM branch_settings
    WHERE org_unit_id = ?
    ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).get(sourceId) as { id: string; settings: string; deleted_at?: string | null } | undefined;
  if (!source) return;
  const target = db.prepare(`
    SELECT id, deleted_at
    FROM branch_settings
    WHERE org_unit_id = ?
    ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).get(targetId) as { id: string; deleted_at?: string | null } | undefined;

  if (!target) {
    db.prepare("UPDATE branch_settings SET org_unit_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(targetId, source.id);
    return;
  }

  if (target.deleted_at && !source.deleted_at) {
    db.prepare(`
      UPDATE branch_settings
      SET settings = ?, deleted_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(source.settings, target.id);
  }
  db.prepare("UPDATE branch_settings SET deleted_at = datetime('now') WHERE id = ?").run(source.id);
}

function mergeRoleOverrides(db: Db, sourceId: string, targetId: string) {
  if (!tableExists(db, "role_org_permission_overrides")) return;
  const columns = new Set(tableColumns(db, "role_org_permission_overrides"));
  if (!columns.has("org_unit_id") || !columns.has("role_id")) return;

  const sourceRows = db.prepare(`
    SELECT *
    FROM role_org_permission_overrides
    WHERE org_unit_id = ? AND deleted_at IS NULL
  `).all(sourceId) as any[];

  sourceRows.forEach((source) => {
    const target = db.prepare(`
      SELECT *
      FROM role_org_permission_overrides
      WHERE company_id = ? AND role_id = ? AND org_unit_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(source.company_id, source.role_id, targetId) as any;

    if (!target) {
      db.prepare("UPDATE role_org_permission_overrides SET org_unit_id = ?, updated_at = datetime('now') WHERE id = ?")
        .run(targetId, source.id);
      return;
    }

    const addPermissions = Array.from(new Set([
      ...parseStringArray(target.add_permissions),
      ...parseStringArray(source.add_permissions),
    ]));
    const removePermissions = Array.from(new Set([
      ...parseStringArray(target.remove_permissions),
      ...parseStringArray(source.remove_permissions),
    ]));
    db.prepare(`
      UPDATE role_org_permission_overrides
      SET add_permissions = ?, remove_permissions = ?, data_scope = COALESCE(data_scope, ?), updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JSON.stringify(addPermissions),
      JSON.stringify(removePermissions),
      source.data_scope || null,
      target.id,
    );
    db.prepare("UPDATE role_org_permission_overrides SET deleted_at = datetime('now') WHERE id = ?").run(source.id);
  });
}

function updateDirectOrgReferences(db: Db, sourceId: string, targetId: string) {
  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as { name: string }[];

  tables.forEach(({ name: table }) => {
    if (["org_unit_managers", "branch_settings", "role_org_permission_overrides"].includes(table)) return;
    const columns = tableColumns(db, table);
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string }[];
    foreignKeys
      .filter((foreignKey) => foreignKey.table === "org_units" && columns.includes(foreignKey.from))
      .forEach((foreignKey) => {
        db.prepare(`UPDATE ${table} SET ${foreignKey.from} = ? WHERE ${foreignKey.from} = ?`)
          .run(targetId, sourceId);
      });
  });
}

function updateDenormalizedNames(db: Db, source: OrgUnitMergeRecord, target: OrgUnitMergeRecord) {
  const sourceNameKey = normalizeOrgUnitNameKey(source.name);
  const customerColumns = tableColumns(db, "customers");
  if (customerColumns.includes("service_store")) {
    const customers = db.prepare(`
      SELECT id, service_store
      FROM customers
      WHERE company_id = ? AND deleted_at IS NULL AND TRIM(COALESCE(service_store, '')) != ''
    `).all(source.company_id) as { id: string; service_store: string }[];
    const updateCustomer = db.prepare("UPDATE customers SET service_store = ?, updated_at = datetime('now') WHERE id = ?");
    customers.forEach((customer) => {
      if (normalizeOrgUnitNameKey(customer.service_store) === sourceNameKey) {
        updateCustomer.run(target.name, customer.id);
      }
    });
  }

  if (tableExists(db, "quotations") && tableColumns(db, "quotations").includes("quotation_org_unit_name")) {
    db.prepare(`
      UPDATE quotations
      SET quotation_org_unit_name = ?, updated_at = datetime('now')
      WHERE company_id = ? AND quotation_org_unit_id = ?
    `).run(target.name, source.company_id, source.id);
  }

  if (tableExists(db, "custom_quota_items") && tableColumns(db, "custom_quota_items").includes("store_name")) {
    db.prepare(`
      UPDATE custom_quota_items
      SET store_name = ?, updated_at = datetime('now')
      WHERE company_id = ? AND org_unit_id = ?
    `).run(target.name, source.company_id, source.id);
  }
}

function updateUserQuotationScopes(db: Db, sourceId: string, targetId: string) {
  if (!tableExists(db, "users") || !tableColumns(db, "users").includes("quotation_access_org_unit_ids")) return;
  const users = db.prepare(`
    SELECT id, quotation_access_org_unit_ids
    FROM users
    WHERE deleted_at IS NULL
  `).all() as { id: string; quotation_access_org_unit_ids: string | null }[];
  const update = db.prepare("UPDATE users SET quotation_access_org_unit_ids = ?, updated_at = datetime('now') WHERE id = ?");
  users.forEach((user) => {
    const ids = parseStringArray(user.quotation_access_org_unit_ids);
    if (!ids.includes(sourceId)) return;
    const nextIds = Array.from(new Set(ids.map((id) => id === sourceId ? targetId : id)));
    update.run(JSON.stringify(nextIds), user.id);
  });
}

export function mergeOrgUnitData(
  db: Db,
  source: OrgUnitMergeRecord,
  target: OrgUnitMergeRecord,
  directChildCount = 0,
) {
  const merge = (db as any).transaction(() => {
    db.prepare(`
      UPDATE org_units
      SET parent_id = ?, updated_at = datetime('now')
      WHERE company_id = ? AND parent_id = ? AND deleted_at IS NULL
    `).run(target.id, source.company_id, source.id);

    mergeOrgManagers(db, source.id, target.id);
    mergeBranchSettings(db, source.id, target.id);
    mergeRoleOverrides(db, source.id, target.id);
    updateDenormalizedNames(db, source, target);
    updateDirectOrgReferences(db, source.id, target.id);
    updateUserQuotationScopes(db, source.id, target.id);

    if (!target.manager_id && source.manager_id) {
      db.prepare(`
        UPDATE org_units
        SET manager_id = ?, manager_name = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(source.manager_id, source.manager_name || null, target.id);
    }

    db.prepare(`
      UPDATE org_units
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(source.id, source.company_id);
  });

  merge();
  return { moved_children: Number(directChildCount || 0) };
}
