import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getBranchSettingsForOrgUnit } from "./branchSettingsLookup";

function createMemoryDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE org_units (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT,
      type TEXT NOT NULL,
      parent_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE branch_settings (
      org_unit_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      settings TEXT,
      deleted_at TEXT
    );
    INSERT INTO org_units (id, company_id, name, type, parent_id) VALUES
      ('company-1', 'company-1', '广州星艺装饰', 'company', NULL),
      ('store-1', 'company-1', '天河店', 'store', 'company-1');
    INSERT INTO branch_settings (org_unit_id, company_id, settings) VALUES (
      'company-1',
      'company-1',
      '{"basicInfo":{"legalCompanyName":"广州星艺装饰工程有限公司","companyShortName":"星艺装饰"}}'
    );
  `);
  return db;
}

describe("branch settings lookup", () => {
  it("resolves legal company settings from a quotation org unit without a customer", () => {
    const db = createMemoryDb();
    const result = getBranchSettingsForOrgUnit(db, "store-1", "company-1");

    expect(result.org_unit_id).toBe("company-1");
    expect(result.settings.basicInfo.legalCompanyName).toBe("广州星艺装饰工程有限公司");
    expect(result.settings.basicInfo.companyShortName).toBe("星艺装饰");
    db.close();
  });
});
