import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureQuotationChangeLogSchema, recordQuotationItemChanges } from "./quotationChangeLogs";

function createMemoryDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE quotations (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT);
    INSERT INTO companies (id, name) VALUES ('company-a', '测试装饰');
    INSERT INTO quotations (id, company_id) VALUES ('quotation-a', 'company-a');
    INSERT INTO users (id, company_id, name) VALUES ('user-a', 'company-a', '系统管理员');
  `);
  ensureQuotationChangeLogSchema(db);
  return db;
}

describe("quotation change logs", () => {
  it("records only human editable item changes and ignores computed fee changes", () => {
    const db = createMemoryDb();
    const beforeItems = [
      { id: "item-base", category: "base", space: "客厅", name: "贴门槛石", quantity: 0, unit_price: 0, material_cost: 0, labor_cost: 0 },
      { id: "item-fee", category: "other", name: "管理费", quantity: 1, unit_price: 53.62, total_price: 53.62, fee_rate: 5 },
    ];
    const afterItems = [
      { id: "item-base", category: "base", space: "客厅", name: "贴门槛石", quantity: 2, unit_price: 4.04, material_cost: 1.04, labor_cost: 3 },
      { id: "item-fee", category: "other", name: "管理费", quantity: 1, unit_price: 62.72, total_price: 62.72, fee_rate: 5 },
    ];

    const result = recordQuotationItemChanges({
      db,
      companyId: "company-a",
      quotationId: "quotation-a",
      userId: "user-a",
      action: "quotation_save",
      beforeItems,
      afterItems,
    });

    expect(result?.changeCount).toBe(3);
    const rows = db.prepare("SELECT item_name, category, field_key FROM quotation_change_log_items ORDER BY field_key").all() as any[];
    expect(rows).toEqual([
      { item_name: "贴门槛石", category: "base", field_key: "labor_cost" },
      { item_name: "贴门槛石", category: "base", field_key: "material_cost" },
      { item_name: "贴门槛石", category: "base", field_key: "quantity" },
    ]);
    db.close();
  });
});
