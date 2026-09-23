import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { mergeOrgUnitData } from "@/lib/orgUnitMerge";

function createMemoryDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE org_units (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      parent_id TEXT REFERENCES org_units(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      manager_id TEXT,
      manager_name TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      org_unit_id TEXT REFERENCES org_units(id),
      quotation_access_org_unit_ids TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE org_unit_managers (
      id TEXT PRIMARY KEY,
      org_unit_id TEXT NOT NULL REFERENCES org_units(id),
      user_id TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      deleted_at TEXT
    );
    CREATE TABLE branch_settings (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      org_unit_id TEXT NOT NULL REFERENCES org_units(id),
      settings TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX branch_settings_org_unique ON branch_settings(org_unit_id);
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      service_store TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE quotations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      quotation_org_unit_id TEXT REFERENCES org_units(id),
      quotation_org_unit_name TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );

    INSERT INTO org_units (id, company_id, parent_id, name, type) VALUES
      ('group-1', 'company-1', NULL, '星艺装饰集团', 'group'),
      ('source', 'company-1', 'group-1', '南昌大区', 'region'),
      ('target', 'company-1', 'group-1', '南昌大区', 'region'),
      ('child', 'company-1', 'source', '上饶分公司', 'company');
    INSERT INTO users (id, org_unit_id, quotation_access_org_unit_ids) VALUES
      ('user-1', 'source', '["source"]');
    INSERT INTO org_unit_managers (id, org_unit_id, user_id, is_primary) VALUES
      ('manager-1', 'source', 'user-1', 1);
    INSERT INTO branch_settings (id, company_id, org_unit_id, settings) VALUES
      ('settings-1', 'company-1', 'source', '{"basicInfo":{"companyShortName":"南昌"}}');
    INSERT INTO customers (id, company_id, service_store) VALUES
      ('customer-1', 'company-1', ' 南昌 大区 ');
    INSERT INTO quotations (id, company_id, quotation_org_unit_id, quotation_org_unit_name) VALUES
      ('quotation-1', 'company-1', 'source', '南昌大区');
  `);
  return db;
}

describe("organization merge", () => {
  it("moves children, members, managers and direct references to the retained organization", () => {
    const db = createMemoryDb();
    const source = db.prepare("SELECT * FROM org_units WHERE id = 'source'").get() as any;
    const target = db.prepare("SELECT * FROM org_units WHERE id = 'target'").get() as any;

    mergeOrgUnitData(db, source, target, 1);

    expect(db.prepare("SELECT parent_id FROM org_units WHERE id = 'child'").get()).toEqual({ parent_id: "target" });
    expect(db.prepare("SELECT org_unit_id FROM users WHERE id = 'user-1'").get()).toEqual({ org_unit_id: "target" });
    expect(db.prepare("SELECT org_unit_id, is_primary FROM org_unit_managers WHERE id = 'manager-1'").get()).toEqual({
      org_unit_id: "target",
      is_primary: 1,
    });
    expect(db.prepare("SELECT org_unit_id FROM branch_settings WHERE id = 'settings-1'").get()).toEqual({ org_unit_id: "target" });
    expect(db.prepare("SELECT quotation_org_unit_id, quotation_org_unit_name FROM quotations WHERE id = 'quotation-1'").get()).toEqual({
      quotation_org_unit_id: "target",
      quotation_org_unit_name: "南昌大区",
    });
    expect(db.prepare("SELECT service_store FROM customers WHERE id = 'customer-1'").get()).toEqual({ service_store: "南昌大区" });
    expect(db.prepare("SELECT quotation_access_org_unit_ids FROM users WHERE id = 'user-1'").get()).toEqual({
      quotation_access_org_unit_ids: '["target"]',
    });
    expect((db.prepare("SELECT deleted_at FROM org_units WHERE id = 'source'").get() as any).deleted_at).toBeTruthy();
    db.close();
  });
});
