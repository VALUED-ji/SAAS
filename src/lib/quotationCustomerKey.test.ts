import { describe, expect, it } from "vitest";
import { getQuotationCustomerGroupKey } from "./quotationCustomerKey";

describe("quotation customer group key", () => {
  it("groups temporary quotations by phone first", () => {
    expect(getQuotationCustomerGroupKey({ is_unbound: 1, id: "q1", customer_phone: "13800000000", customer_name: "张三" })).toBe("unbound:phone:13800000000");
    expect(getQuotationCustomerGroupKey({ is_unbound: 1, id: "q2", customer_phone: "13800000000", customer_name: "李四" })).toBe("unbound:phone:13800000000");
  });

  it("falls back to weixin, profile, then quotation id", () => {
    expect(getQuotationCustomerGroupKey({ is_unbound: 1, id: "q1", customer_weixin: "wx-1" })).toBe("unbound:weixin:wx-1");
    expect(getQuotationCustomerGroupKey({ is_unbound: 1, id: "q1", customer_name: "张三", customer_address: "测试小区1栋101" })).toBe("unbound:profile:张三:测试小区1栋101");
    expect(getQuotationCustomerGroupKey({ is_unbound: 1, id: "q1" })).toBe("unbound:quote:q1");
  });

  it("keeps bound customers grouped by customer id", () => {
    expect(getQuotationCustomerGroupKey({ id: "q1", customer_id: "customer-1" })).toBe("customer-1");
  });
});
