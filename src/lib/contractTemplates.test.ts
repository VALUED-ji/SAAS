import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  buildContractTemplateSnapshot,
  createDefaultTemplate,
  ensureContractTemplateTables,
  renderContractTemplateHtml,
} from "./contractTemplates";

function createMemoryDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE org_units (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL);
    INSERT INTO companies (id, name) VALUES ('company-a', '测试装饰');
    INSERT INTO org_units (id, company_id, name) VALUES ('branch-a', 'company-a', '广州分公司');
    INSERT INTO users (id, company_id, name) VALUES ('user-a', 'company-a', '测试员工');
  `);
  ensureContractTemplateTables(db);
  return db;
}

function createContract() {
  return {
    id: "contract-a",
    title: "张三施工合同",
    contract_no: "HT20260810001",
    total_amount: 100000,
    signed_at: "2026-08-10",
    content: {
      contract_type: "装修施工合同",
      party_a: { name: "张三", phone: "13800000000" },
      party_b: { name: "测试装饰", contact: "李经理" },
      project_info: {
        address: "广州天河星艺小区",
        area: "120",
        planned_start: "2026-08-12",
        planned_end: "2026-10-12",
        duration_days: "60",
        construction_scope: "按预算报价执行",
      },
      amount_info: {
        total_amount: 100000,
        deposit_deduct_amount: 10000,
        payable_amount: 90000,
        quotation_title: "正式报价A",
        quotation_amount: 100000,
        payment_stages: [
          { name: "首期款", ratio: 50, trigger: "开工前", amount: 45000 },
          { name: "尾款", ratio: 50, trigger: "竣工验收", amount: 45000 },
        ],
      },
    },
  };
}

describe("contract templates", () => {
  it("creates a default template and renders variables plus dynamic blocks", () => {
    const db = createMemoryDb();
    const template = createDefaultTemplate(db, {
      companyId: "company-a",
      orgUnitId: "branch-a",
      contractType: "装修施工合同",
      userId: "user-a",
    });
    expect(template?.status).toBe("published");

    const rendered = renderContractTemplateHtml(template?.html || "", {
      customer: { name: "张三", phone: "13800000000" },
      project: { address: "广州天河星艺小区" },
      contract: createContract(),
      branchBasicInfo: { legalCompanyName: "测试装饰工程有限公司", contactPhone: "020-88888888" },
    });
    expect(rendered.html).toContain("张三");
    expect(rendered.html).toContain("首期款");
    expect(rendered.html).toContain("测试装饰工程有限公司");
    db.close();
  });

  it("builds an immutable print snapshot from a template version", () => {
    const db = createMemoryDb();
    const template = createDefaultTemplate(db, {
      companyId: "company-a",
      orgUnitId: "branch-a",
      contractType: "装修施工合同",
      userId: "user-a",
    });
    const snapshot = buildContractTemplateSnapshot({
      template: template!,
      customer: { name: "张三" },
      project: {},
      contract: createContract(),
      branchBasicInfo: { legalCompanyName: "测试装饰工程有限公司" },
      frozen: true,
    });

    expect(snapshot.frozen).toBe(true);
    expect(snapshot.template_version_id).toBeTruthy();
    expect(snapshot.rendered_html).toContain("HT20260810001");
    expect(snapshot.rendered_html).toContain("张三");
    db.close();
  });
});
