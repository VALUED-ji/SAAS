import { describe, expect, it } from "vitest";
import { formatQuotationChangeDateTime } from "./quotationChangeLogDisplay";

describe("quotation change log display", () => {
  it("converts SQLite UTC timestamps to Beijing time", () => {
    expect(formatQuotationChangeDateTime("2026-09-19 06:25:04")).toBe("2026/09/19 14:25:04");
  });
});
