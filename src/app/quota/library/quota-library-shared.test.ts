import { describe, expect, it } from "vitest";
import { buildQuotaExportRows, calculateQuotaExportLayout, parseQuotaImport, quotaExportHeaders, quotaImportHeaders, type QuotaItem } from "./quota-library-shared";

describe("quota library export", () => {
  it("keeps the export headers and item values aligned", () => {
    const item: QuotaItem = {
      id: "quota-1",
      code: "PY2026090001",
      scope: "番禺店",
      priceScene: "标准",
      category: "泥瓦工程",
      workTypeId: "work-1",
      workTypeName: "泥工",
      materialCategoryId: "material-1",
      materialCategoryName: "瓷砖",
      name: "墙砖铺贴",
      constructionDescription: "基层清理后铺贴",
      unit: "㎡",
      laborPrice: 52,
      materialPrice: 10,
      internalLaborCost: 38,
      internalMaterialCost: 7,
      costLossRate: 3,
      totalPrice: 62,
      isSpecialPrice: true,
      status: "enabled",
      updatedAt: "2026-09-18",
    };

    const row = buildQuotaExportRows([item])[0];
    expect(quotaExportHeaders).toEqual([
      "定额编码",
      "分类",
      "项目名称",
      "单位",
      "材料单价",
      "人工单价",
      "客户单价",
      "施工说明",
      "适用门店",
      "价格类型",
      "状态",
    ]);
    expect(row).toEqual([
      "PY2026090001",
      "泥瓦工程",
      "墙砖铺贴",
      "㎡",
      10,
      52,
      62,
      "基层清理后铺贴",
      "番禺店",
      "标准",
      "启用",
    ]);
  });

  it("calculates wrapped row heights from the longest export text", () => {
    const rows = [
      quotaExportHeaders,
      ["PY2026090001", "泥瓦工程", "墙砖铺贴 300x600", "㎡", 10, 52, 62, "基层清理后水泥砂浆铺贴并控制空鼓率，阴阳角顺直，勾缝均匀，完工后清理现场并做好成品保护。墙砖铺贴前完成排版与对缝确认，非整砖尽量放在隐蔽位置，铺贴完成后逐块检查空鼓并处理。", "番禺店", "标准", "启用"],
    ];
    const layout = calculateQuotaExportLayout(rows);
    expect(layout.widths[2]).toBeGreaterThanOrEqual(18);
    expect(layout.widths[7]).toBeGreaterThanOrEqual(72);
    expect(layout.widths[7]).toBeLessThanOrEqual(116);
    expect(layout.rowHeights[1]).toBeGreaterThan(30);
    expect(layout.rowHeights[1]).toBeLessThanOrEqual(120);
  });
});

describe("quota library import", () => {
  it("keeps the import template price columns aligned with the list", () => {
    expect(quotaImportHeaders.slice(5, 7)).toEqual(["材料单价", "人工单价"]);
  });

  it("imports the new template order as material price before labor price", () => {
    const text = [
      quotaImportHeaders.join("\t"),
      ["标准", "泥瓦工程", "墙砖铺贴", "基层清理后铺贴", "㎡", "10", "52", "7", "3", "0", "否"].join("\t"),
    ].join("\n");

    const result = parseQuotaImport(text, [], ["番禺店"], "番禺店");

    expect(result.errors).toEqual([]);
    expect(result.items[0]).toMatchObject({
      materialPrice: 10,
      laborPrice: 52,
      totalPrice: 62,
    });
  });

  it("still imports old header order by column labels", () => {
    const text = [
      ["价格类型", "分类", "项目名称", "施工说明", "单位", "人工单价", "材料单价", "内部人工成本", "内部材料成本", "损耗率", "是否特价"].join("\t"),
      ["标准", "泥瓦工程", "墙砖铺贴", "基层清理后铺贴", "㎡", "52", "10", "3", "7", "0", "否"].join("\t"),
    ].join("\n");

    const result = parseQuotaImport(text, [], ["番禺店"], "番禺店");

    expect(result.errors).toEqual([]);
    expect(result.items[0]).toMatchObject({
      materialPrice: 10,
      laborPrice: 52,
      totalPrice: 62,
    });
  });
});
