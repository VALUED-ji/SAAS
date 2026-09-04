import type Database from "better-sqlite3";

type Db = Database.Database;

export type OrgManagerUser = {
  id: string;
  name: string;
  avatar?: string | null;
  role?: string | null;
  org_unit_id?: string | null;
  org_unit_name?: string | null;
  phone?: string | null;
  is_primary?: number;
};

function makeId() {
  return `OM${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function ensureOrgManagerTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_unit_managers (
      id TEXT PRIMARY KEY,
      org_unit_id TEXT NOT NULL REFERENCES org_units(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      is_primary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_org_unit_managers_org ON org_unit_managers(org_unit_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_org_unit_managers_user ON org_unit_managers(user_id, deleted_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_unit_managers_active_unique
      ON org_unit_managers(org_unit_id, user_id)
      WHERE deleted_at IS NULL;
  `);

  db.prepare(`
    INSERT OR IGNORE INTO org_unit_managers (id, org_unit_id, user_id, is_primary)
    SELECT
      'OM' || strftime('%s','now') || substr(hex(randomblob(4)), 1, 8),
      o.id,
      o.manager_id,
      1
    FROM org_units o
    INNER JOIN users u
      ON u.id = o.manager_id
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
    WHERE o.deleted_at IS NULL
      AND TRIM(COALESCE(o.manager_id, '')) != ''
      AND NOT EXISTS (
        SELECT 1
        FROM org_unit_managers om
        WHERE om.org_unit_id = o.id
          AND om.user_id = o.manager_id
          AND om.deleted_at IS NULL
      )
  `).run();
}

export function normalizeOrgManagerIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  return raw
    .map((item) => String(item || "").trim())
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function getActiveUsersByIds(db: Db, userIds: string[]): OrgManagerUser[] {
  const ids = normalizeOrgManagerIds(userIds);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT u.id, u.name, u.avatar, u.role, u.org_unit_id, org.name as org_unit_name, u.phone, COALESCE(u.is_active, 1) as is_active
    FROM users u
    LEFT JOIN org_units org ON org.id = u.org_unit_id AND org.deleted_at IS NULL
    WHERE u.id IN (${placeholders})
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
  `).all(...ids) as OrgManagerUser[];
  const map = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => map.get(id)).filter(Boolean) as OrgManagerUser[];
}

export function getActiveOrgManagers(db: Db, orgUnitId?: string | null): OrgManagerUser[] {
  if (!orgUnitId) return [];
  ensureOrgManagerTable(db);
  const rows = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.avatar,
      u.role,
      u.org_unit_id,
      org.name as org_unit_name,
      u.phone,
      COALESCE(om.is_primary, 0) as is_primary
    FROM org_unit_managers om
    INNER JOIN users u
      ON u.id = om.user_id
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
    LEFT JOIN org_units org ON org.id = u.org_unit_id AND org.deleted_at IS NULL
    WHERE om.org_unit_id = ?
      AND om.deleted_at IS NULL
    ORDER BY COALESCE(om.is_primary, 0) DESC, om.created_at ASC
  `).all(orgUnitId) as OrgManagerUser[];
  if (rows.length) return uniqueManagers(rows);

  const legacy = db.prepare(`
    SELECT u.id, u.name, u.avatar, u.role, u.org_unit_id, org.name as org_unit_name, u.phone, 1 as is_primary
    FROM org_units o
    INNER JOIN users u
      ON u.id = o.manager_id
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
    LEFT JOIN org_units org ON org.id = u.org_unit_id AND org.deleted_at IS NULL
    WHERE o.id = ? AND o.deleted_at IS NULL
    LIMIT 1
  `).get(orgUnitId) as OrgManagerUser | undefined;
  return legacy?.id ? [legacy] : [];
}

export function getOrgManagerMap(db: Db, orgUnitIds: string[]) {
  ensureOrgManagerTable(db);
  const ids = normalizeOrgManagerIds(orgUnitIds);
  const result = new Map<string, OrgManagerUser[]>();
  ids.forEach((id) => result.set(id, []));
  if (ids.length === 0) return result;
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT
      om.org_unit_id,
      u.id,
      u.name,
      u.avatar,
      u.role,
      u.org_unit_id as user_org_unit_id,
      org.name as org_unit_name,
      u.phone,
      COALESCE(om.is_primary, 0) as is_primary
    FROM org_unit_managers om
    INNER JOIN users u
      ON u.id = om.user_id
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
    LEFT JOIN org_units org ON org.id = u.org_unit_id AND org.deleted_at IS NULL
    WHERE om.org_unit_id IN (${placeholders})
      AND om.deleted_at IS NULL
    ORDER BY om.org_unit_id, COALESCE(om.is_primary, 0) DESC, om.created_at ASC
  `).all(...ids) as Array<OrgManagerUser & { org_unit_id: string; user_org_unit_id?: string | null }>;
  rows.forEach((row) => {
    const list = result.get(row.org_unit_id) || [];
    list.push({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      role: row.role,
      org_unit_id: row.user_org_unit_id || null,
      org_unit_name: row.org_unit_name,
      phone: row.phone,
      is_primary: row.is_primary,
    });
    result.set(row.org_unit_id, list);
  });

  const missingIds = ids.filter((id) => (result.get(id) || []).length === 0);
  if (missingIds.length) {
    const missingPlaceholders = missingIds.map(() => "?").join(",");
    const legacyRows = db.prepare(`
      SELECT
        o.id as org_unit_id,
        u.id,
        u.name,
        u.avatar,
        u.role,
        u.org_unit_id as user_org_unit_id,
        org.name as org_unit_name,
        u.phone,
        1 as is_primary
      FROM org_units o
      INNER JOIN users u
        ON u.id = o.manager_id
        AND u.deleted_at IS NULL
        AND COALESCE(u.is_active, 1) = 1
      LEFT JOIN org_units org ON org.id = u.org_unit_id AND org.deleted_at IS NULL
      WHERE o.id IN (${missingPlaceholders})
        AND o.deleted_at IS NULL
    `).all(...missingIds) as Array<OrgManagerUser & { org_unit_id: string; user_org_unit_id?: string | null }>;
    legacyRows.forEach((row) => {
      result.set(row.org_unit_id, [{
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        role: row.role,
        org_unit_id: row.user_org_unit_id || null,
        org_unit_name: row.org_unit_name,
        phone: row.phone,
        is_primary: 1,
      }]);
    });
  }

  return result;
}

export function setOrgManagers(db: Db, orgUnitId: string, managerIds: string[]) {
  ensureOrgManagerTable(db);
  const ids = normalizeOrgManagerIds(managerIds);
  const managers = getActiveUsersByIds(db, ids);
  if (managers.length !== ids.length) {
    throw new Error("管理人员不存在或已停用");
  }

  try {
    db.prepare("BEGIN").run();
    db.prepare(`
      UPDATE org_unit_managers
      SET deleted_at = datetime('now')
      WHERE org_unit_id = ? AND deleted_at IS NULL
    `).run(orgUnitId);

    ids.forEach((userId, index) => {
      db.prepare(`
        INSERT INTO org_unit_managers (id, org_unit_id, user_id, is_primary)
        VALUES (?, ?, ?, ?)
      `).run(makeId(), orgUnitId, userId, index === 0 ? 1 : 0);
    });

    const primary = managers[0];
    db.prepare(`
      UPDATE org_units
      SET manager_id = ?, manager_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(primary?.id || null, primary?.name || null, orgUnitId);
    db.prepare("COMMIT").run();
  } catch (error) {
    db.prepare("ROLLBACK").run();
    throw error;
  }
  return managers.map((manager, index) => ({ ...manager, is_primary: index === 0 ? 1 : 0 }));
}

export function formatOrgManagerNames(managers: OrgManagerUser[]) {
  const names = uniqueManagers(managers)
    .map((manager) => String(manager.name || "").trim())
    .filter(Boolean);
  return names.join("、");
}

export function uniqueManagers(users: OrgManagerUser[]) {
  const seen = new Set<string>();
  return users
    .filter((user) => user?.id && !seen.has(user.id))
    .map((user) => {
      seen.add(user.id);
      return user;
    });
}
