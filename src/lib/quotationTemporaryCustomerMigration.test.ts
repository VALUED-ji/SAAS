import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateQuotationCreatedCustomersToTemporary } from "./quotationTemporaryCustomerMigration";

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      weixin TEXT,
      address TEXT,
      house_address TEXT,
      address_location_name TEXT,
      address_location_address TEXT,
      address_latitude REAL,
      address_longitude REAL,
      building_no TEXT,
      unit_no TEXT,
      room_no TEXT,
      no_room_number INTEGER,
      area_size REAL,
      decoration_type TEXT,
      designer_name_manual TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE quotations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      project_id TEXT,
      temp_customer_name TEXT,
      temp_customer_designer_name TEXT,
      temp_customer_phone TEXT,
      temp_customer_weixin TEXT,
      temp_customer_address TEXT,
      temp_customer_house_address TEXT,
      temp_customer_address_location_name TEXT,
      temp_customer_address_location_address TEXT,
      temp_customer_address_latitude REAL,
      temp_customer_address_longitude REAL,
      temp_customer_building_no TEXT,
      temp_customer_unit_no TEXT,
      temp_customer_room_no TEXT,
      temp_customer_no_room_number INTEGER,
      temp_customer_area REAL,
      temp_customer_decoration_type TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT,
      deleted_at TEXT
    );
    CREATE TABLE operation_logs (
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL
    );
  `);
  return db;
}

describe("quotation temporary customer migration", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb();
  });

  it("migrates quotation-created customers into unbound temporary quotations", () => {
    db.exec(`
      INSERT INTO customers (id, company_id, name, phone, address, area_size)
      VALUES ('customer-1', 'company-1', '张三', '13800000000', '测试小区1栋101', 100);
      INSERT INTO projects (id, company_id, customer_id)
      VALUES ('project-1', 'company-1', 'customer-1');
      INSERT INTO quotations (id, company_id, project_id)
      VALUES ('quotation-1', 'company-1', 'project-1');
      INSERT INTO operation_logs (entity, entity_id, action)
      VALUES ('customer', 'customer-1', 'customer.create.from_quotation');
    `);

    const result = migrateQuotationCreatedCustomersToTemporary(db, "company-1");
    const quotation = db.prepare("SELECT * FROM quotations WHERE id = 'quotation-1'").get() as any;
    const customer = db.prepare("SELECT deleted_at FROM customers WHERE id = 'customer-1'").get() as any;
    const project = db.prepare("SELECT deleted_at FROM projects WHERE id = 'project-1'").get() as any;

    expect(result).toEqual({ migratedCustomers: 1, migratedQuotations: 1 });
    expect(quotation.project_id).toBeNull();
    expect(quotation.temp_customer_name).toBe("张三");
    expect(quotation.temp_customer_phone).toBe("13800000000");
    expect(quotation.temp_customer_address).toBe("测试小区1栋101");
    expect(customer.deleted_at).toBeTruthy();
    expect(project.deleted_at).toBeTruthy();
  });

  it("keeps quotation-created customers that have signed contracts", () => {
    db.exec(`
      INSERT INTO customers (id, company_id, name)
      VALUES ('customer-1', 'company-1', '张三');
      INSERT INTO projects (id, company_id, customer_id)
      VALUES ('project-1', 'company-1', 'customer-1');
      INSERT INTO quotations (id, company_id, project_id)
      VALUES ('quotation-1', 'company-1', 'project-1');
      INSERT INTO contracts (id, company_id, project_id, status)
      VALUES ('contract-1', 'company-1', 'project-1', 'SIGNED');
      INSERT INTO operation_logs (entity, entity_id, action)
      VALUES ('customer', 'customer-1', 'customer.create.from_quotation');
    `);

    const result = migrateQuotationCreatedCustomersToTemporary(db, "company-1");
    const quotation = db.prepare("SELECT project_id FROM quotations WHERE id = 'quotation-1'").get() as any;
    const customer = db.prepare("SELECT deleted_at FROM customers WHERE id = 'customer-1'").get() as any;

    expect(result).toEqual({ migratedCustomers: 0, migratedQuotations: 0 });
    expect(quotation.project_id).toBe("project-1");
    expect(customer.deleted_at).toBeNull();
  });

  it("soft-deletes quotation-created customers after their quotations were deleted", () => {
    db.exec(`
      INSERT INTO customers (id, company_id, name)
      VALUES ('customer-1', 'company-1', '张三');
      INSERT INTO projects (id, company_id, customer_id)
      VALUES ('project-1', 'company-1', 'customer-1');
      INSERT INTO operation_logs (entity, entity_id, action)
      VALUES ('customer', 'customer-1', 'customer.create.from_quotation');
    `);

    const result = migrateQuotationCreatedCustomersToTemporary(db, "company-1");
    const customer = db.prepare("SELECT deleted_at FROM customers WHERE id = 'customer-1'").get() as any;
    const project = db.prepare("SELECT deleted_at FROM projects WHERE id = 'project-1'").get() as any;

    expect(result).toEqual({ migratedCustomers: 1, migratedQuotations: 0 });
    expect(customer.deleted_at).toBeTruthy();
    expect(project.deleted_at).toBeTruthy();
  });
});
