import type Database from "better-sqlite3";
import crypto from "crypto";

export function ensureSiteCheckinTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_checkin_codes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      disabled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS site_checkin_records (
      id TEXT PRIMARY KEY,
      code_id TEXT NOT NULL REFERENCES site_checkin_codes(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT REFERENCES users(id),
      checkin_source TEXT DEFAULT 'external',
      person_name TEXT NOT NULL,
      phone TEXT,
      role TEXT,
      company_name TEXT,
      remark TEXT,
      location_name TEXT,
      latitude REAL,
      longitude REAL,
      distance_meters REAL,
      user_agent TEXT,
      signed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS site_checkin_photos (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL REFERENCES site_checkin_records(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_site_checkin_records_project ON site_checkin_records(project_id, signed_at);
    CREATE INDEX IF NOT EXISTS idx_site_checkin_records_code ON site_checkin_records(code_id, signed_at);
    CREATE INDEX IF NOT EXISTS idx_site_checkin_photos_record ON site_checkin_photos(record_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_site_checkin_photos_project ON site_checkin_photos(project_id, created_at);
  `);
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const ensureProjectColumn = (name: string, definition: string) => {
    if (!projectColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`).run();
    }
  };
  const customerColumns = db.prepare("PRAGMA table_info(customers)").all() as { name: string }[];
  const ensureCustomerColumn = (name: string, definition: string) => {
    if (!customerColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE customers ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureCustomerColumn("address_location_name", "TEXT");
  ensureCustomerColumn("address_location_address", "TEXT");
  ensureCustomerColumn("address_latitude", "REAL");
  ensureCustomerColumn("address_longitude", "REAL");
  ensureProjectColumn("site_location_name", "TEXT");
  ensureProjectColumn("site_location_address", "TEXT");
  ensureProjectColumn("site_latitude", "REAL");
  ensureProjectColumn("site_longitude", "REAL");
  const recordColumns = db.prepare("PRAGMA table_info(site_checkin_records)").all() as { name: string }[];
  if (!recordColumns.some((column) => column.name === "user_id")) {
    db.prepare("ALTER TABLE site_checkin_records ADD COLUMN user_id TEXT REFERENCES users(id)").run();
  }
  if (!recordColumns.some((column) => column.name === "checkin_source")) {
    db.prepare("ALTER TABLE site_checkin_records ADD COLUMN checkin_source TEXT DEFAULT 'external'").run();
  }
  if (!recordColumns.some((column) => column.name === "distance_meters")) {
    db.prepare("ALTER TABLE site_checkin_records ADD COLUMN distance_meters REAL").run();
  }
}

function makeCheckinCode(projectId: string) {
  const projectPart = projectId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "SITE";
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `SC${projectPart}${timePart}${randomPart}`;
}

export function getOrCreateSiteCheckinCode(db: Database.Database, projectId: string) {
  ensureSiteCheckinTables(db);
  const existing = db.prepare("SELECT * FROM site_checkin_codes WHERE project_id = ?").get(projectId);
  if (existing) return existing;

  const id = `SCC${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  let code = makeCheckinCode(projectId);
  for (let index = 0; index < 3; index += 1) {
    const duplicate = db.prepare("SELECT id FROM site_checkin_codes WHERE code = ?").get(code);
    if (!duplicate) break;
    code = makeCheckinCode(projectId);
  }

  db.prepare(`
    INSERT INTO site_checkin_codes (id, project_id, code, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
  `).run(id, projectId, code);

  return db.prepare("SELECT * FROM site_checkin_codes WHERE id = ?").get(id);
}
