import { getDb } from "@/lib/db";

type Db = ReturnType<typeof getDb>;

export type QuotationOrgUnit = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function parseQuotationAccessOrgUnitIds(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? unique(parsed.map(String)) : [];
  } catch {
    return [];
  }
}

export function serializeQuotationAccessOrgUnitIds(values: unknown[]) {
  return JSON.stringify(unique(values.map((value) => String(value || ""))));
}

export function ensureQuotationAccessColumns(db: Db) {
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userColumns.some((column) => column.name === "quotation_access_org_unit_ids")) {
    db.prepare("ALTER TABLE users ADD COLUMN quotation_access_org_unit_ids TEXT DEFAULT '[]'").run();
  }

  const quotationColumns = db.prepare("PRAGMA table_info(quotations)").all() as { name: string }[];
  if (!quotationColumns.some((column) => column.name === "quotation_org_unit_id")) {
    db.prepare("ALTER TABLE quotations ADD COLUMN quotation_org_unit_id TEXT REFERENCES org_units(id)").run();
  }
  if (!quotationColumns.some((column) => column.name === "quotation_org_unit_name")) {
    db.prepare("ALTER TABLE quotations ADD COLUMN quotation_org_unit_name TEXT").run();
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_quotations_org_unit ON quotations(quotation_org_unit_id, deleted_at, updated_at);");
}

export function getOrgTreeIds(db: Db, rootId?: string | null, companyId?: string | null) {
  const normalizedRootId = String(rootId || "").trim();
  if (!normalizedRootId) return [];
  return (db.prepare(`
    WITH RECURSIVE org_tree(id) AS (
      SELECT id
      FROM org_units
      WHERE id = ?
        AND (? = '' OR company_id = ?)
        AND deleted_at IS NULL
      UNION ALL
      SELECT child.id
      FROM org_units child
      INNER JOIN org_tree parent ON child.parent_id = parent.id
      WHERE (? = '' OR child.company_id = ?)
        AND child.deleted_at IS NULL
    )
    SELECT id FROM org_tree
  `).all(normalizedRootId, companyId || "", companyId || "", companyId || "", companyId || "") as { id: string }[])
    .map((row) => String(row.id || ""))
    .filter(Boolean);
}

export function getOrgNamesForIds(db: Db, orgIds: string[], companyId: string) {
  const ids = unique(orgIds);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return (db.prepare(`
    SELECT DISTINCT TRIM(COALESCE(name, '')) as name
    FROM org_units
    WHERE company_id = ?
      AND id IN (${placeholders})
      AND deleted_at IS NULL
      AND TRIM(COALESCE(name, '')) != ''
  `).all(companyId, ...ids) as { name: string }[])
    .map((row) => String(row.name || "").trim())
    .filter(Boolean);
}

export function getUserQuotationAccessRootIds(db: Db, userId: string, companyId: string) {
  ensureQuotationAccessColumns(db);
  const user = db.prepare(`
    SELECT org_unit_id, quotation_access_org_unit_ids
    FROM users
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(userId, companyId) as { org_unit_id?: string | null; quotation_access_org_unit_ids?: string | null } | undefined;
  return unique([
    String(user?.org_unit_id || ""),
    ...parseQuotationAccessOrgUnitIds(user?.quotation_access_org_unit_ids),
  ]);
}

export function getUserQuotationAccessibleOrgIds(db: Db, userId: string, companyId: string) {
  return unique(getUserQuotationAccessRootIds(db, userId, companyId).flatMap((orgId) => getOrgTreeIds(db, orgId, companyId)));
}

export function getUserQuotationStoreOptions(db: Db, userId: string, companyId: string) {
  const orgIds = getUserQuotationAccessibleOrgIds(db, userId, companyId);
  if (orgIds.length === 0) return [] as QuotationOrgUnit[];
  const placeholders = orgIds.map(() => "?").join(",");
  return db.prepare(`
    SELECT id, name, type, parent_id
    FROM org_units
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND COALESCE(is_active, 1) = 1
      AND type = 'store'
      AND id IN (${placeholders})
    ORDER BY sort_order ASC, name ASC
  `).all(companyId, ...orgIds) as QuotationOrgUnit[];
}

export function getOrgById(db: Db, orgUnitId: string, companyId: string) {
  const id = String(orgUnitId || "").trim();
  if (!id) return null;
  const org = db.prepare(`
    SELECT id, name, type, parent_id
    FROM org_units
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(id, companyId) as QuotationOrgUnit | undefined;
  return org || null;
}

export function getStoreOrgByName(db: Db, storeName: string, companyId: string) {
  const name = String(storeName || "").trim();
  if (!name) return null;
  const org = db.prepare(`
    SELECT id, name, type, parent_id
    FROM org_units
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND COALESCE(is_active, 1) = 1
      AND type = 'store'
      AND TRIM(COALESCE(name, '')) = ?
    ORDER BY sort_order ASC
    LIMIT 1
  `).get(companyId, name) as QuotationOrgUnit | undefined;
  return org || null;
}

export function canAccessQuotationOrg(db: Db, userId: string, companyId: string, orgUnitId?: string | null) {
  const id = String(orgUnitId || "").trim();
  if (!id) return false;
  return getUserQuotationAccessibleOrgIds(db, userId, companyId).includes(id);
}
