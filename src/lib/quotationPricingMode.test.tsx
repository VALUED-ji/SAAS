import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { customerUnitPrice, pricingConfigurationError } from "./quotationPricingMode";
import { QuotationPrintDocument } from "@/components/QuotationPrintDocument";
import { parseQuotaImport } from "@/app/quota/library/quota-library-shared";

describe("single customer price", () => {
  it.each([0, 180])("keeps customer price %s independent from retained split prices", (totalPrice) => {
    expect(customerUnitPrice({ pricingMode: "single", totalPrice, laborPrice: 52, materialPrice: 92 })).toBe(totalPrice);
    const html = renderToStaticMarkup(createElement(QuotationPrintDocument, {
      items: [{ id: "row", category: "base", name: "Test item", space: "Test space", quantity: 2, unit: "m2", unit_price: totalPrice, total_price: totalPrice * 2, labor_cost: 52, material_cost: 92, pricing_mode: "single" }],
      settings: {},
    }));
    const tables = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/g) || [];
    const details = tables.find((table) => table.includes("Test item"));
    expect(details).toContain("客户单价");
    expect(details).not.toContain(">人工<");
    expect(details).not.toContain(">材料<");
    expect(details).toContain((totalPrice * 2).toFixed(2));
  });

  it("rejects unavailable labor or material fee bases but accepts direct fees", () => {
    const item = { category: "base", pricing_mode: "single" };
    expect(pricingConfigurationError([item, { category: "other", fee_calc_method: "formula", fee_calc_base: "人工费 * 0.1" }])).toBeTruthy();
    expect(pricingConfigurationError([item, { category: "other", fee_calc_method: "percent", fee_calc_base: "base_material" }])).toBe("");
    expect(pricingConfigurationError([item], { discountScope: "base_material" })).toBeTruthy();
  });

  it("retains a single price when reimporting an export after split mode is enabled", () => {
    const result = parseQuotaImport("分类\t项目名称\t单位\t材料单价\t人工单价\t客户单价\n基装\tTest item\tm2\t\t\t180", [], ["Test store"], "Test store");
    expect(result.errors).toHaveLength(0);
    expect(result.items[0].pricingMode).toBe("single");
    expect(result.items[0].totalPrice).toBe(180);
  });

  it("imports zero customer price without requiring artificial split prices", () => {
    const result = parseQuotaImport("价格类型\t分类\t项目名称\t施工说明\t单位\t客户单价\n标准\t基装\tTest item\tTest spec\tm2\t0", [], ["Test store"], "Test store", true);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].pricingMode).toBe("single");
    expect(result.items[0].totalPrice).toBe(0);
  });
});
