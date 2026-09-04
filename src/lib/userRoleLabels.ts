export const defaultUserRoleLabels: Record<string, string> = {
  OWNER: "老板",
  ADMIN: "管理员",
  PM: "项目经理",
  DESIGNER: "设计师",
  FINANCE: "财务",
  SALES: "销售/跟单",
  CLIENT: "客户",
};

export function formatUserRoleLabel(role?: string | null, roleName?: string | null) {
  const configuredName = String(roleName || "").trim();
  const rawRole = String(role || "").trim();
  if (configuredName && configuredName.toUpperCase() !== rawRole.toUpperCase()) {
    return defaultUserRoleLabels[configuredName.toUpperCase()] || configuredName;
  }
  return defaultUserRoleLabels[rawRole.toUpperCase()] || rawRole || "未设置角色";
}
