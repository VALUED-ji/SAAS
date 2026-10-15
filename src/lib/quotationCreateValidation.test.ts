import { describe, expect, it } from "vitest";
import { buildCreateOverageDefaults, getCreateCustomerError, getCreatePricingError } from "./quotationCreateValidation";

describe("quotation creation steps", () => {
  const customer = { temporary: true, customerId: "", address: "测试工地", phone: "", area: "" };
  const pricing = { needsStore: false, storeId: "", packageMode: false, area: "", rules: [], actuals: {} };

  it("allows a temporary quote without creating a formal customer", () => {
    expect(getCreateCustomerError(customer)).toBe("");
    expect(getCreateCustomerError({ ...customer, temporary: false })).toBe("请先选择客户");
  });
  it("requires an address and validates optional contact and area fields", () => {
    expect(getCreateCustomerError({ ...customer, address: "  " })).toContain("地址");
    expect(getCreateCustomerError({ ...customer, phone: "123" })).toContain("手机号");
    expect(getCreateCustomerError({ ...customer, area: "." })).toContain("面积");
    expect(getCreateCustomerError({ ...customer, area: "-1" })).toContain("面积");
    expect(getCreateCustomerError({ ...customer, area: "123.45" })).toBe("");
  });
  it("only requires a positive pricing area for package modes", () => {
    expect(getCreatePricingError(pricing)).toBe("");
    for (const area of ["", "0", ".", "Infinity", "-2"]) {
      expect(getCreatePricingError({ ...pricing, packageMode: true, area })).toContain("计价面积");
    }
    expect(getCreatePricingError({ ...pricing, packageMode: true, area: "100.5" })).toBe("");
  });
  it("requires a store only when it cannot be inherited", () => {
    expect(getCreatePricingError({ ...pricing, needsStore: true })).toContain("门店");
    expect(getCreatePricingError({ ...pricing, needsStore: true, storeId: "store" })).toBe("");
  });
  it("resets quantities to the new template's defaults even when rule ids are reused", () => {
    expect(buildCreateOverageDefaults([{ id: "room", includedQuantity: 2 }])).toEqual({ room: "2" });
    expect(buildCreateOverageDefaults([{ id: "room", includedQuantity: 1 }])).toEqual({ room: "1" });
    expect(buildCreateOverageDefaults([])).toEqual({});
  });
  it("rejects blank or invalid overage quantities rather than silently treating them as zero", () => {
    const rules = [{ id: "room", name: "卧室超出", includedQuantity: 1 }];
    for (const room of ["", ".", "NaN", "-1"]) expect(getCreatePricingError({ ...pricing, rules, actuals: { room } })).toContain("实际数量");
    expect(getCreatePricingError({ ...pricing, rules, actuals: { room: "0" } })).toBe("");
    expect(getCreatePricingError({ ...pricing, rules, actuals: {} })).toBe("");
  });
});
