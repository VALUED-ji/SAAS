const permissionCatalog = new Set([
  "dashboard.view",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.import_export",
  "customers.assign",
  "team.view",
  "team.manage",
  "organization.manage",
  "roles.manage",
  "settings.manage",
  "quotations.manage",
  "materials.manage",
  "finance.view",
  "logs.view",
]);

export function cleanRolePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item)).filter((item) => (
    permissionCatalog.has(item) || /^menu\.[a-z0-9_]+$/.test(item)
  ))));
}
