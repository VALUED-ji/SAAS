import { describe, expect, it } from "vitest";
import { cleanRolePermissions } from "./rolePermissions";

describe("cleanRolePermissions", () => {
  it("keeps supported permission codes and menu markers", () => {
    expect(cleanRolePermissions([
      "quotations.manage",
      "menu.quota_library",
      "unknown.permission",
      "quotations.manage",
    ])).toEqual(["quotations.manage", "menu.quota_library"]);
  });

  it("returns an empty list for invalid input", () => {
    expect(cleanRolePermissions(null)).toEqual([]);
    expect(cleanRolePermissions("quotations.manage")).toEqual([]);
  });
});
