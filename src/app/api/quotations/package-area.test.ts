import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as Database.Database | null, authenticated: true }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db")>(),
  getDb: () => { if (!state.db) throw new Error("Missing isolated test database"); return state.db; },
}));
vi.mock("@/lib/security/authorization", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/security/authorization")>(),
  getAuthContext: () => state.authenticated ? { userId: "test-user", companyId: "test-company", role: "OWNER", isAdmin: true, orgUnitId: "test-store", permissions: ["quotations.manage"], dataScope: "all" } : null,
}));
vi.mock("@/lib/security/quotationShare", () => ({ signQuotationShareToken: () => "test-share", verifyQuotationShareToken: () => null }));
import { ensureDatabaseSchema } from "@/lib/db";
import { POST as createQuotation } from "./route";
import { GET as readQuotation, PUT as saveQuotation, POST as quotationAction } from "./[id]/route";
import { GET as exportQuotation } from "./[id]/export/route";
import { POST as createCustomQuota, PUT as updateCustomQuota } from "../quota/custom-library/route";

function request(url: string, body?: unknown, method = "POST") {
  return new NextRequest(`http://localhost:3459${url}`, { method: body ? method : "GET", headers: { "content-type": "application/json", origin: "http://localhost:3459" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

const template = {
  id: "test-template", name: "平方套餐测试", quoteConfig: { mode: "area", areaUnitPrice: 1000 },
  comprehensiveFeeMode: "formula",
  comprehensiveFees: [{ id: "direct", name: "工程直接费", isFinalTotal: true, valueSource: "direct", fee_calc_method: "reference", fee_calc_base: "直接费" }],
  spaces: [{ id: "kitchen", name: "厨房", quotaItems: [
    { id: "included", name: "套餐墙面", unit: "㎡", quantity: 10, totalPrice: 300, materialPrice: 200, laborPrice: 100, quoteScope: "foundation" },
    { id: "extra", name: "套餐外增项", unit: "项", quantity: 2, totalPrice: 1000, materialPrice: 700, laborPrice: 300, quoteScope: "foundation", packageScope: "extra" },
  ] }], appendixNote: "套餐附注", budgetCompilationHtml: "<p>预算编制测试</p>",
};

async function create(mode = "area", area = 100) {
  const response = await createQuotation(request("/api/quotations", {
    create_mode: "temporary", temp_customer: { name: "测试客户", address: "测试地址", area },
    quotation_org_unit_id: "test-store", templatePricing: { area }, template: { ...template, quoteConfig: { ...template.quoteConfig, mode } },
  }));
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(201);
  return data.id as string;
}

async function read(id: string) {
  const response = await readQuotation(request(`/api/quotations/${id}`), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(() => {
  state.db = new Database(":memory:");
  state.authenticated = true;
  ensureDatabaseSchema(state.db);
  state.db.exec(`
    INSERT INTO companies (id, name) VALUES ('test-company', '测试公司');
    INSERT INTO org_units (id, company_id, name, type) VALUES ('test-store', 'test-company', '测试门店', 'store');
    INSERT INTO users (id, company_id, name, phone, role, org_unit_id) VALUES ('test-user', 'test-company', '测试用户', 'test-phone', 'OWNER', 'test-store');
  `);
});
afterEach(() => { state.db?.close(); state.db = null; });

describe("area package quotation lifecycle", () => {
  function singleBranch() {
    state.db!.exec("INSERT INTO org_units (id, company_id, name, type) VALUES ('test-branch', 'test-company', 'Test branch', 'company'); UPDATE org_units SET parent_id = 'test-branch' WHERE id = 'test-store';");
    state.db!.prepare("INSERT INTO branch_settings (id, company_id, org_unit_id, settings) VALUES (?, ?, ?, ?)").run("test-settings", "test-company", "test-branch", JSON.stringify({ printSettings: { splitCustomerPrice: false } }));
  }

  it("keeps single customer price, costs, historical mode and copied mode through save and Excel", async () => {
    singleBranch();
    const createResponse = await createQuotation(request("/api/quotations", {
      create_mode: "temporary", temp_customer: { name: "Test customer", address: "Test address", area: 100 }, quotation_org_unit_id: "test-store",
      template: { ...template, quoteConfig: { mode: "list" }, spaces: [{ id: "space", name: "Test space", quotaItems: [{ id: "line", name: "Single line", unit: "m2", quantity: 2, totalPrice: 180, laborPrice: 52, materialPrice: 92, internalLaborCost: 20, internalMaterialCost: 35, quoteScope: "foundation" }] }] },
    }));
    expect(createResponse.status, await createResponse.clone().text()).toBe(201);
    const { id } = await createResponse.json();
    let data = await read(id);
    let line = data.items.find((item: any) => item.name === "Single line");
    expect(line.pricing_mode).toBe("single");
    expect(line.unit_price).toBe(180);
    expect(data.totals.finalAmount).toBe(360);
    state.db!.prepare("UPDATE branch_settings SET settings = ?").run(JSON.stringify({ printSettings: { splitCustomerPrice: true } }));
    line.unit_price = 200;
    let response = await saveQuotation(request("/api/quotations/" + id, { settings: data.settings, items: data.items }, "PUT"), { params: Promise.resolve({ id }) });
    expect(response.status, await response.clone().text()).toBe(200);
    data = await read(id);
    line = data.items.find((item: any) => item.name === "Single line");
    expect(line.unit_price).toBe(200);
    expect(line.material_cost).toBe(92);
    expect(line.labor_cost).toBe(52);
    expect(line.cost_material_unit).toBe(35);
    expect(line.cost_labor_unit).toBe(20);
    expect(data.totals.finalAmount).toBe(400);
    const copyResponse = await quotationAction(request("/api/quotations/" + id, { action: "copy" }), { params: Promise.resolve({ id }) });
    expect(copyResponse.status, await copyResponse.clone().text()).toBe(200);
    const copied = await read((await copyResponse.json()).id);
    expect(copied.items.find((item: any) => item.name === "Single line").pricing_mode).toBe("single");
    expect(copied.totals.finalAmount).toBe(400);
    const exported = await exportQuotation(request("/api/quotations/" + id + "/export"), { params: Promise.resolve({ id }) });
    expect(exported.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()) as any);
    const cells: unknown[] = [];
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.value))));
    expect(cells).toContain("客户单价");
    let customerPriceHeaders = 0;
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
      if (cell.value !== "客户单价" || cell.master.address !== cell.address) return;
      customerPriceHeaders += 1;
      expect(sheet.getCell(Number(cell.row) + 1, Number(cell.col)).master.address).toBe(cell.address);
      expect(cell.alignment.vertical).toBe("middle");
    })));
    expect(customerPriceHeaders).toBeGreaterThan(0);
    expect(cells).toContain(400);
    line.unit_price = 0;
    response = await saveQuotation(request("/api/quotations/" + id, { settings: data.settings, items: data.items }, "PUT"), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect((await read(id)).totals.finalAmount).toBe(0);
  });

  it("persists zero single prices in custom quota without erasing retained split values", async () => {
    singleBranch();
    const response = await createCustomQuota(request("/api/quota/custom-library", { name: "Custom single", unit: "m2", category: "基装", orgUnitId: "test-store", storeName: "测试门店", totalPrice: 0, laborPrice: 52, materialPrice: 92 }));
    expect(response.status, await response.clone().text()).toBe(200);
    const { item } = await response.json();
    expect(item.pricingMode).toBe("single");
    expect(item.totalPrice).toBe(0);
    const updated = await updateCustomQuota(request("/api/quota/custom-library", { ...item, totalPrice: 180, laborPrice: 0, materialPrice: 0 }, "PUT"));
    expect(updated.status, await updated.clone().text()).toBe(200);
    const saved = (await updated.json()).item;
    expect(saved.totalPrice).toBe(180);
    expect(saved.laborPrice).toBe(52);
    expect(saved.materialPrice).toBe(92);
  });

  it("creates, saves, reloads and exports without charging package items twice", async () => {
    const id = await create();
    const initial = await read(id);
    expect(initial.totals.finalAmount).toBe(102000);
    expect(initial.items.find((item: any) => item.name === "套餐墙面").package_scope).toBe("included");
    const response = await saveQuotation(request(`/api/quotations/${id}`, { ...initial.quotation, settings: initial.settings, items: initial.items }, "PUT"), { params: Promise.resolve({ id }) });
    expect(response.status, await response.text()).toBe(200);
    const saved = await read(id);
    expect(saved.totals.finalAmount).toBe(102000);
    const exported = await exportQuotation(request(`/api/quotations/${id}/export`), { params: Promise.resolve({ id }) });
    expect(exported.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()) as any);
    const cells: unknown[] = [];
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.value))));
    expect(cells).toContain("套餐平方明细");
    expect(cells).toContain("套餐项目");
    expect(cells).toContain("计价面积");
    expect(cells).toContain("套餐单价");
    expect(cells).toContain("套餐金额");
    expect(cells).toContain("计价说明");
    expect(cells).toContain("套餐小计");
    expect(cells.indexOf("套餐平方明细")).toBeLessThan(cells.indexOf("基装明细"));
    expect(cells).toContain("套餐外另计项目");
    expect(cells).toContain("套餐内项目");
    expect(cells.indexOf("套餐外另计项目")).toBeLessThan(cells.indexOf("套餐内项目"));
    const includedStart = cells.indexOf("套餐内项目");
    const includedEnd = cells.indexOf("综合费用和总费用") > includedStart ? cells.indexOf("综合费用和总费用") : cells.length;
    const includedCells = cells.slice(includedStart, includedEnd);
    expect(includedCells.indexOf("材料")).toBe(-1);
    expect(includedCells.indexOf("人工")).toBe(-1);
    expect(includedCells.indexOf("小计")).toBe(-1);
    expect(cells.some((cell) => String(cell).includes("套餐内包含"))).toBe(false);
    expect(cells.some((cell) => String(cell).includes(" · 套餐外另计"))).toBe(false);
    expect(cells).not.toContain("产品小计");
    expect(cells).toContain(102000);
    expect(cells).not.toContain(105000);
  });

  it("creates and exports package area overage fees as a separate section", async () => {
    const overageTemplate = {
      ...template,
      quoteConfig: {
        ...template.quoteConfig,
        overageRules: [{ id: "bathroom", name: "卫生间超标加价", includedQuantity: 1, unit: "个", unitPrice: 10000 }],
      },
    };
    const response = await createQuotation(request("/api/quotations", {
      create_mode: "temporary",
      temp_customer: { name: "测试客户", address: "测试地址", area: 100 },
      quotation_org_unit_id: "test-store",
      templatePricing: { area: 100, overageRules: [{ id: "bathroom", actualQuantity: 2 }] },
      template: overageTemplate,
    }));
    const created = await response.json();
    expect(response.status, JSON.stringify(created)).toBe(201);
    const data = await read(created.id);
    expect(data.settings.templatePricing.baseAmount).toBe(100000);
    expect(data.settings.templatePricing.overageAmount).toBe(10000);
    expect(data.totals.finalAmount).toBe(112000);
    expect(data.items.find((item: any) => item.category === "套餐超标加价").name).toBe("卫生间超标加价");
    const exported = await exportQuotation(request(`/api/quotations/${created.id}/export`), { params: Promise.resolve({ id: created.id }) });
    expect(exported.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()) as any);
    const cells: unknown[] = [];
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.value))));
    expect(cells.indexOf("套餐平方明细")).toBeLessThan(cells.indexOf("套餐超标加价明细"));
    expect(cells.indexOf("套餐超标加价明细")).toBeLessThan(cells.indexOf("基装明细"));
    expect(cells).toContain("套餐包含");
    expect(cells).toContain("实际数量");
    expect(cells).toContain("超出数量");
    expect(cells).toContain("加价金额");
    expect(cells).toContain("卫生间超标加价");
    expect(cells).toContain(112000);
  });

  it("recalculates changed area and package scope while retaining reference prices", async () => {
    const id = await create();
    const data = await read(id);
    data.settings.templatePricing.area = 120;
    data.items.find((item: any) => item.name === "套餐墙面").package_scope = "extra";
    const response = await saveQuotation(request(`/api/quotations/${id}`, { settings: data.settings, items: data.items }, "PUT"), { params: Promise.resolve({ id }) });
    expect(response.status, await response.text()).toBe(200);
    const saved = await read(id);
    expect(saved.totals.finalAmount).toBe(125000);
    expect(saved.items.filter((item: any) => item.category === "套餐平方")).toHaveLength(1);
    expect(saved.items.find((item: any) => item.name === "套餐墙面").unit_price).toBe(300);
  });

  it("leaves list quotes billed by item even when a template carries package flags", async () => {
    const id = await create("list");
    const data = await read(id);
    expect(data.totals.finalAmount).toBe(5000);
    expect(data.items.every((item: any) => !item.package_scope)).toBe(true);
  });

  it("rejects missing area and unauthenticated requests without creating a quotation", async () => {
    const response = await createQuotation(request("/api/quotations", { create_mode: "temporary", temp_customer: { address: "测试地址" }, quotation_org_unit_id: "test-store", template }));
    expect(response.status).toBe(400);
    expect((state.db!.prepare("SELECT COUNT(*) AS n FROM quotations").get() as any).n).toBe(0);
    state.authenticated = false;
    expect((await createQuotation(request("/api/quotations", {}))).status).toBe(401);
  });

  it("preserves package scope when copying a whole quote", async () => {
    const id = await create();
    const response = await quotationAction(request(`/api/quotations/${id}`, { action: "copy" }), { params: Promise.resolve({ id }) });
    expect(response.status, await response.clone().text()).toBe(200);
    const result = await response.json();
    const copied = await read(result.id);
    expect(copied.totals.finalAmount).toBe(102000);
    expect(copied.items.find((item: any) => item.name === "套餐墙面").package_scope).toBe("included");
  });

  it("retains the area-based price when copying only items and clearing item quantities", async () => {
    const id = await create();
    const response = await quotationAction(request(`/api/quotations/${id}`, { action: "copy", copy_content_mode: "items_only" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    const copiedId = (await response.json()).id;
    const copied = await read(copiedId);
    expect(copied.settings.templatePricing.area).toBe(100);
    expect(copied.items.find((item: any) => item.category === "套餐平方").quantity).toBe(100);
    expect(copied.items.find((item: any) => item.name === "套餐外增项").quantity).toBe(0);
    expect(copied.totals.finalAmount).toBe(100000);
    expect((state.db!.prepare("SELECT final_amount FROM quotations WHERE id = ?").get(copiedId) as any).final_amount).toBe(100000);
  });

  it("recreates a missing base without inheriting item metadata and removes duplicate bases", async () => {
    const id = await create();
    const data = await read(id);
    const base = data.items.find((item: any) => item.category === "套餐平方");
    const details = data.items.filter((item: any) => item.category !== "套餐平方");
    details[0].quota_source_id = "unrelated-quota";
    details[0].cost_material_unit = 99;
    for (const items of [details, [...details, { ...base, quantity: 1 }, { ...base, id: "duplicate-base", quantity: 2 }]]) {
      const response = await saveQuotation(request(`/api/quotations/${id}`, { settings: data.settings, items }, "PUT"), { params: Promise.resolve({ id }) });
      expect(response.status, await response.text()).toBe(200);
      const saved = await read(id);
      const bases = saved.items.filter((item: any) => item.category === "套餐平方");
      expect(bases).toHaveLength(1);
      expect(bases[0].quantity).toBe(100);
      expect(bases[0].quota_source_id).toBeNull();
      expect(bases[0].cost_material_unit).toBe(0);
      expect(saved.totals.finalAmount).toBe(102000);
    }
  });

  it("copies a space with billing determined by the destination quotation mode", async () => {
    const source = await create();
    for (const mode of ["area", "list"]) {
      const target = await create(mode);
      const response = await quotationAction(request(`/api/quotations/${source}`, { action: "copySpaceCategoryToQuotation", target_quotation_id: target, source_space: "厨房" }), { params: Promise.resolve({ id: source }) });
      expect(response.status, await response.text()).toBe(200);
      const copied = await read(target);
      const included = copied.items.filter((item: any) => item.name === "套餐墙面");
      expect(included).toHaveLength(2);
      expect(included.every((item: any) => item.total_price === (mode === "area" ? 0 : 3000))).toBe(true);
      expect(copied.totals.finalAmount).toBe(mode === "area" ? 104000 : 10000);
    }
  });
});
