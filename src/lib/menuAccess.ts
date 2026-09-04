"use client";

type UserLike = {
  role?: string | null;
  permissions?: string[] | null;
};

type MenuRoute = {
  href: string;
  menuKey: string;
  children?: MenuRoute[];
};

const menuPermissionPrefix = "menu.";

const menuRoutes: MenuRoute[] = [
  { href: "/group-dashboard", menuKey: "group_dashboard" },
  { href: "/dashboard", menuKey: "dashboard" },
  { href: "/todos", menuKey: "todos" },
  { href: "/projects", menuKey: "customers" },
  { href: "/quotations", menuKey: "quotations" },
  { href: "/site", menuKey: "site" },
  {
    href: "/finance/owner-receipts",
    menuKey: "finance",
    children: [
      { href: "/finance/owner-receipts", menuKey: "finance_owner_receipts" },
      { href: "/finance/labor-settlement", menuKey: "finance_labor_settlement" },
    ],
  },
  {
    href: "/quota",
    menuKey: "quota",
    children: [
      { href: "/quota/library", menuKey: "quota_library" },
      { href: "/quota/templates", menuKey: "quota_templates" },
    ],
  },
  {
    href: "/orders",
    menuKey: "orders",
    children: [
      { href: "/orders/auxiliary", menuKey: "orders_auxiliary" },
    ],
  },
  {
    href: "/materials",
    menuKey: "materials",
    children: [
      { href: "/materials/library", menuKey: "materials_library" },
      { href: "/materials/products", menuKey: "materials_products" },
      { href: "/materials/inbound", menuKey: "materials_inbound" },
      { href: "/materials/inventory", menuKey: "materials_inventory" },
    ],
  },
  {
    href: "/suppliers",
    menuKey: "suppliers",
    children: [
      { href: "/suppliers/info", menuKey: "suppliers_info" },
    ],
  },
  {
    href: "/organization",
    menuKey: "organization",
    children: [
      { href: "/organization", menuKey: "organization_manage" },
      { href: "/team", menuKey: "team_manage" },
      { href: "/roles", menuKey: "role_manage" },
    ],
  },
  { href: "/branch-settings", menuKey: "branch_settings" },
  {
    href: "/settings",
    menuKey: "settings",
    children: [
      { href: "/settings/materials", menuKey: "material_categories" },
      { href: "/settings/work-types", menuKey: "work_types" },
    ],
  },
];

const legacyMenuPermissionMap: Record<string, string[]> = {
  group_dashboard: ["dashboard.view"],
  dashboard: ["dashboard.view"],
  todos: ["dashboard.view", "customers.view", "quotations.manage"],
  customers: ["customers.view", "customers.create", "customers.edit", "customers.import_export", "customers.assign"],
  quotations: ["quotations.manage"],
  site: ["customers.view", "quotations.manage", "materials.manage", "finance.view"],
  finance_owner_receipts: ["finance.view"],
  finance_labor_settlement: ["finance.view"],
  quota_library: ["quotations.manage", "settings.manage"],
  quota_templates: ["quotations.manage", "settings.manage"],
  orders_auxiliary: ["materials.manage"],
  materials_library: ["materials.manage"],
  materials_products: ["materials.manage"],
  materials_inbound: ["materials.manage"],
  materials_inventory: ["materials.manage"],
  suppliers_info: ["materials.manage"],
  organization_manage: ["organization.manage"],
  team_manage: ["team.view", "team.manage"],
  role_manage: ["roles.manage"],
  branch_settings: ["organization.manage", "settings.manage"],
  material_categories: ["settings.manage", "materials.manage"],
  work_types: ["settings.manage", "quotations.manage"],
};

function isAdmin(user?: UserLike | null) {
  const role = String(user?.role || "").toUpperCase();
  return role === "OWNER" || role === "ADMIN";
}

function getPermissionSet(user?: UserLike | null) {
  return new Set((Array.isArray(user?.permissions) ? user.permissions : []).map(String));
}

function canShowMenu(user: UserLike | null | undefined, menuKey: string) {
  if (isAdmin(user)) return true;
  const permissionSet = getPermissionSet(user);
  const permissions = Array.from(permissionSet);
  const hasMenuMarkers = permissions.some((permission) => permission.startsWith(menuPermissionPrefix));
  if (hasMenuMarkers) return permissionSet.has(`${menuPermissionPrefix}${menuKey}`);
  const legacyPermissions = legacyMenuPermissionMap[menuKey] || [];
  return legacyPermissions.some((permission) => permissionSet.has(permission));
}

function isSameOrChildPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getDefaultAuthorizedPath(user: UserLike | null | undefined) {
  for (const route of menuRoutes) {
    if (route.children?.length) {
      const firstChild = route.children.find((child) => canShowMenu(user, child.menuKey));
      if (firstChild) return firstChild.href;
    } else if (canShowMenu(user, route.menuKey)) {
      return route.href;
    }
  }
  return "/profile";
}

export function getAuthorizedRedirectPath(user: UserLike | null | undefined, requestedPath: string) {
  const pathname = requestedPath.split("?")[0] || "/";
  if (!pathname || pathname === "/" || pathname === "/login") return getDefaultAuthorizedPath(user);
  if (canAccessMenuPath(user, pathname)) return requestedPath;
  return getDefaultAuthorizedPath(user);
}

export function canAccessMenuPath(user: UserLike | null | undefined, pathname: string) {
  if (isAdmin(user)) return true;
  const guardedRoute = menuRoutes
    .flatMap((route) => [route, ...(route.children || [])])
    .filter((route) => isSameOrChildPath(pathname, route.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!guardedRoute) return true;
  if (guardedRoute.children?.length) {
    return guardedRoute.children.some((child) => canShowMenu(user, child.menuKey));
  }
  return canShowMenu(user, guardedRoute.menuKey);
}
