import { describe, expect, it } from "vitest";
import {
  makeQuotaItemFromLibrary,
  normalizeSpaceQuotaItem,
  type QuotaLibraryItem,
} from "./quota-templates-shared";

const sourceQuota: QuotaLibraryItem = {
  id: "quota-1",
  code: "PY2026090001",
  source: "standard",
  scope: "番禺店",
  category: "基装",
  priceScene: "标准",
  name: "石膏板吊顶",
  constructionDescription: "轻钢龙骨",
  unit: "㎡",
  laborPrice: 50,
  materialPrice: 80,
  totalPrice: 130,
  isSpecialPrice: false,
  status: "enabled",
  updatedAt: "2026-09-19",
};

describe("quota template source snapshot", () => {
  it("stores source version and snapshot when adding a quota library item", () => {
    const item = makeQuotaItemFromLibrary(sourceQuota);

    expect(item.sourceVersion).toBe("2026-09-19");
    expect(item.sourceSnapshot).toMatchObject({
      code: "PY2026090001",
      name: "石膏板吊顶",
      totalPrice: 130,
    });
    expect(item.overriddenFields).toEqual([]);
  });

  it("preserves source metadata when normalizing saved templates", () => {
    const item = normalizeSpaceQuotaItem({
      ...makeQuotaItemFromLibrary(sourceQuota),
      name: "石膏板吊顶（客厅）",
      overriddenFields: ["name"],
    }, 0);

    expect(item.name).toBe("石膏板吊顶（客厅）");
    expect(item.sourceVersion).toBe("2026-09-19");
    expect(item.sourceSnapshot?.name).toBe("石膏板吊顶");
    expect(item.overriddenFields).toEqual(["name"]);
  });
});
