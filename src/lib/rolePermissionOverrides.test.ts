import { describe, expect, it } from "vitest";
import { applyRolePermissionOverrides } from "./rolePermissionOverrides";

describe("applyRolePermissionOverrides", () => {
  it("applies ancestor overrides in order with the deepest scope winning", () => {
    const result = applyRolePermissionOverrides(
      ["dashboard.view", "customers.view"],
      [
        { addPermissions: ["finance.view"], removePermissions: ["dashboard.view"], dataScope: "region" },
        { addPermissions: ["dashboard.view"], removePermissions: ["customers.view"], dataScope: "company" },
      ],
      "self",
    );
    expect(result.permissions.sort()).toEqual(["dashboard.view", "finance.view"]);
    expect(result.dataScope).toBe("company");
  });

  it("lets remove win over add within the same scope", () => {
    const result = applyRolePermissionOverrides(
      ["customers.view"],
      [{ addPermissions: ["finance.view"], removePermissions: ["finance.view"] }],
      "self",
    );
    expect(result.permissions).toEqual(["customers.view"]);
  });
});
