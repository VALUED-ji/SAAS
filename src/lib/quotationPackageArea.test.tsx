import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildAreaPricingItem, buildAreaPricingItems, calculateAreaQuotePrice } from "./quotationPackageArea";
import { normalizeTemplate } from "@/app/quota/templates/quota-templates-shared";
import { normalizeQuotaTemplate } from "@/app/quotations/quotation-list-shared";
import { QuotationPrintDocument } from "@/components/QuotationPrintDocument";

describe("square package pricing", () => {
  it.each([true, false])("keeps included spaces in saved detail order with extra items: %s", (withExtras) => {
    const included = [
      { id: "a", category: "base", space: "卧室", name: "卧室套餐项目", package_scope: "included", quantity: 1, unit_price: 0 },
      { id: "b", category: "base", space: "卧室4", name: "卧室4套餐项目", package_scope: "included", quantity: 1, unit_price: 0 },
      { id: "c", category: "base", space: "全屋", name: "全屋套餐项目", package_scope: "included", quantity: 1, unit_price: 0 },
    ];
    const extras = withExtras ? [
      { id: "extra-a", category: "base", space: "卧室", name: "卧室另计项目", package_scope: "extra", quantity: 1, unit_price: 0 },
      { id: "extra-b", category: "base", space: "卧室4", name: "卧室4另计项目", package_scope: "extra", quantity: 1, unit_price: 0 },
    ] : [];
    const html = renderToStaticMarkup(createElement(QuotationPrintDocument, {
      items: [buildAreaPricingItem({ areaUnitPrice: 1000 }, 100), ...extras, ...included],
      settings: { quoteSpaces: ["卧室4", "卧室", "全屋"] },
    }));
    const tables = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/g) || [];
    const includedTables = tables.filter((table) => table.includes("套餐内项目"));
    expect(includedTables).toHaveLength(withExtras ? 2 : 1);
    for (const table of includedTables) {
      const section = table.slice(table.indexOf("套餐内项目"));
      expect(section.indexOf("卧室套餐项目")).toBeLessThan(section.indexOf("卧室4套餐项目"));
      expect(section.indexOf("卧室4套餐项目")).toBeLessThan(section.indexOf("全屋套餐项目"));
    }
    if (withExtras) {
      const extraTable = tables.find((table) => table.includes("套餐外另计项目"))!;
      expect(extraTable.indexOf("卧室4另计项目")).toBeLessThan(extraTable.indexOf("卧室另计项目"));
    }
  });

  it("prices the whole area at its matching tier and preserves tier boundaries", () => {
    const config = { areaTiers: [{ maxArea: 100, unitPrice: 1000 }, { maxArea: 200, unitPrice: 900 }] };
    expect(calculateAreaQuotePrice(config, 100).totalAmount).toBe(100000);
    expect(calculateAreaQuotePrice(config, 101).totalAmount).toBe(90900);
    expect(calculateAreaQuotePrice(config, 250).totalAmount).toBe(225000);
  });

  it("handles decimals, empty areas and a minimum charge without changing the stored rate", () => {
    expect(calculateAreaQuotePrice({ areaUnitPrice: 1000 }, 100.123).totalAmount).toBe(100123);
    expect(calculateAreaQuotePrice({ areaUnitPrice: 1000, minChargeAmount: 100000 }, 0).totalAmount).toBe(0);
    const item = buildAreaPricingItem({ areaUnitPrice: 1000, minChargeAmount: 100000 }, 80);
    expect(item.total_price).toBe(100000);
    expect(item.quantity * item.unit_price).toBe(100000);
    expect(item.remark).toContain("1000.00");
  });

  it("adds package overage fees without merging them into the base area item", () => {
    const config = {
      areaUnitPrice: 1000,
      overageRules: [{ id: "bathroom", name: "卫生间超标加价", includedQuantity: 1, actualQuantity: 2, unit: "个", unitPrice: 10000 }],
    };
    const pricing = calculateAreaQuotePrice(config, 100);
    expect(pricing.baseAmount).toBe(100000);
    expect(pricing.overageAmount).toBe(10000);
    expect(pricing.totalAmount).toBe(110000);
    const items = buildAreaPricingItems(config, 100);
    expect(items.map((item) => item.category)).toEqual(["套餐平方", "套餐超标加价"]);
    expect(items[0].total_price).toBe(100000);
    expect(items[1].total_price).toBe(10000);
  });

  it("preserves extra items through both template loaders and defaults old items to included", () => {
    const raw = { id: "template", name: "套餐", quoteConfig: { mode: "area", areaUnitPrice: 1000 }, spaces: [{ id: "space", name: "厨房", quotaItems: [{ id: "a", name: "墙面" }, { id: "b", name: "增项", packageScope: "extra" }] }] };
    const template = normalizeTemplate(raw, 0)!;
    const loaded = normalizeQuotaTemplate(template)!;
    expect(template.spaces[0].quotaItems.map((item) => item.packageScope)).toEqual(["included", "extra"]);
    expect(loaded.spaces[0].quotaItems.map((item) => item.packageScope)).toEqual(["included", "extra"]);
    expect(loaded.quoteConfig?.areaUnitPrice).toBe(1000);
  });

  it("prints package sections and excludes included reference prices from sales totals", () => {
    const items = [
      buildAreaPricingItem({ areaUnitPrice: 1000 }, 100),
      ...buildAreaPricingItems({ areaUnitPrice: 1000, overageRules: [{ id: "bathroom", name: "卫生间超标加价", includedQuantity: 1, actualQuantity: 2, unit: "个", unitPrice: 10000 }] }, 100).slice(1),
      { category: "base", space: "厨房", name: "套餐墙面", unit: "㎡", quantity: 10, unit_price: 300, material_cost: 200, labor_cost: 100, package_scope: "included" },
      { category: "base", space: "厨房", name: "套餐外增项", unit: "项", quantity: 2, unit_price: 1000, material_cost: 700, labor_cost: 300, package_scope: "extra" },
    ];
    const html = renderToStaticMarkup(createElement(QuotationPrintDocument, { items, settings: { appendixNote: "套餐附注", budgetCompilationHtml: "<p>预算编制测试</p>" } }));
    expect(html.indexOf("套餐平方明细")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("套餐平方明细")).toBeLessThan(html.indexOf("基装明细"));
    expect(html.indexOf("套餐外另计项目")).toBeLessThan(html.indexOf("套餐内项目"));
    const packageAreaSectionHtml = html.slice(html.indexOf("套餐平方明细"), html.indexOf("基装明细"));
    expect(packageAreaSectionHtml).toContain("套餐项目");
    expect(packageAreaSectionHtml).toContain("计价数量");
    expect(packageAreaSectionHtml).toContain("单价");
    expect(packageAreaSectionHtml).toContain("套餐金额");
    expect(packageAreaSectionHtml).toContain("计价说明");
    expect(packageAreaSectionHtml).toContain("套餐小计");
    expect(packageAreaSectionHtml).not.toContain("材料名称");
    expect(packageAreaSectionHtml).not.toContain("规格");
    expect(packageAreaSectionHtml).not.toContain("型号");
    expect(packageAreaSectionHtml).not.toContain("产品小计");
    expect(packageAreaSectionHtml).not.toContain("未指定空间");
    expect(packageAreaSectionHtml).toContain("卫生间超标加价");
    expect(packageAreaSectionHtml).toContain("套餐包含 1个，实际 2个，超出 1个");
    expect(packageAreaSectionHtml).toContain("110000.00");
    expect(packageAreaSectionHtml.match(/<table /g)).toHaveLength(1);
    expect(packageAreaSectionHtml.match(/>套餐小计</g)).toHaveLength(1);
    expect(html).not.toContain("套餐超标加价明细");
    expect(html).not.toContain("超标加价小计");
    expect(html).toContain("套餐内项目");
    expect(html).toContain("套餐外另计项目");
    const includedStart = html.indexOf("套餐内项目");
    const includedEnd = html.indexOf("</tbody></table>", includedStart);
    const extraStart = html.indexOf("套餐外另计项目");
    const packageBaseTableHtml = html.slice(html.lastIndexOf("<table ", extraStart), includedEnd);
    expect(packageBaseTableHtml.match(/<table /g)).toHaveLength(1);
    expect(packageBaseTableHtml).not.toContain("</table>");
    const printTables = html.match(/<table\b[^>]*quotation-print-package-print-table[^>]*>[\s\S]*?<\/table>/g) || [];
    expect(printTables).toHaveLength(2);
    const extraPrintHeader = (printTables[0] || "").split("</thead>")[0];
    const includedPrintHeader = (printTables[1] || "").split("</thead>")[0];
    expect(extraPrintHeader).toContain(">材料</th>");
    expect(includedPrintHeader).toContain("施工工艺及材料说明");
    expect(includedPrintHeader).not.toMatch(/>材料<\/th>|>人工<\/th>|>小计<\/th>/);
    expect(printTables[1]).toContain('quotation-print-base-col-sequence text-center">2</td>');
    const includedSectionHtml = html.slice(includedStart, includedEnd);
    expect(includedSectionHtml).not.toMatch(/>材料<\/th>/);
    expect(includedSectionHtml).not.toMatch(/>人工<\/th>/);
    expect(includedSectionHtml).not.toMatch(/>小计<\/th>/);
    expect(html).not.toContain("套餐内包含");
    expect(html).not.toContain("（套餐外另计）");
    expect(html).toContain("112000.00");
    expect(html).not.toContain("105000.00");
    expect(html).toContain("套餐附注");
    expect(html).toContain("预算编制测试");
  });
});
