"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import NativeImage from "@/components/ui/NativeImage";
import LogoutConfirmDialog from "@/components/ui/LogoutConfirmDialog";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  LayoutDashboard,
  ClipboardList,
  FileText,
  Handshake,
  Package,
  UsersRound,
  Wallet,
  Calculator,
  CheckSquare,
  Hammer,
  ShoppingCart,
  PanelLeftClose,
  PanelLeft,
  Settings,
  SlidersHorizontal,
  ChevronDown,
  LogOut,
} from "lucide-react";

type SidebarNavItem = {
  href: string;
  label: string;
  menuKey: string;
  icon: LucideIcon;
  children?: {
    href: string;
    label: string;
    menuKey: string;
  }[];
};

const navItems: SidebarNavItem[] = [
 { href: "/group-dashboard", label: "集团总览", menuKey: "group_dashboard", icon: Building2 },
 { href: "/dashboard", label: "经营总览", menuKey: "dashboard", icon: LayoutDashboard },
 { href: "/todos", label: "待办中心", menuKey: "todos", icon: CheckSquare },
  { href: "/projects", label: "客户管理", menuKey: "customers", icon: ClipboardList },
  { href: "/quotations", label: "报价合同", menuKey: "quotations", icon: FileText },
  { href: "/site", label: "工地管理", menuKey: "site", icon: Hammer },
  { href: "/finance/owner-receipts", label: "财务中心", menuKey: "finance", icon: Wallet, children: [
    { href: "/finance/owner-receipts", label: "业主收款", menuKey: "finance_owner_receipts" },
    { href: "/finance/labor-settlement", label: "人工结算", menuKey: "finance_labor_settlement" },
  ] },
  { href: "/quota", label: "定额管理", menuKey: "quota", icon: Calculator, children: [
    { href: "/quota/library", label: "基装定额", menuKey: "quota_library" },
    { href: "/quota/templates", label: "预算模版", menuKey: "quota_templates" },
  ] },
  { href: "/orders", label: "订单管理", menuKey: "orders", icon: ShoppingCart, children: [
    { href: "/orders/auxiliary", label: "辅材订单", menuKey: "orders_auxiliary" },
  ] },
  { href: "/materials", label: "材料管理", menuKey: "materials", icon: Package, children: [
    { href: "/materials/library", label: "辅材管理", menuKey: "materials_library" },
    { href: "/materials/products", label: "主材产品", menuKey: "materials_products" },
    { href: "/materials/inbound", label: "采购入库", menuKey: "materials_inbound" },
    { href: "/materials/inventory", label: "库存管理", menuKey: "materials_inventory" },
  ] },
  { href: "/suppliers", label: "供应商管理", menuKey: "suppliers", icon: Handshake, children: [
    { href: "/suppliers/info", label: "供应商信息", menuKey: "suppliers_info" },
  ] },
  { href: "/organization", label: "组织权限", menuKey: "organization", icon: UsersRound, children: [
    { href: "/organization", label: "组织管理", menuKey: "organization_manage" },
    { href: "/team", label: "团队管理", menuKey: "team_manage" },
    { href: "/roles", label: "角色管理", menuKey: "role_manage" },
  ] },
  { href: "/branch-settings", label: "分公司设置", menuKey: "branch_settings", icon: SlidersHorizontal },
  { href: "/settings", label: "系统设置", menuKey: "settings", icon: Settings, children: [
    { href: "/settings/materials", label: "材料分类", menuKey: "material_categories" },
    { href: "/settings/work-types", label: "工种设置", menuKey: "work_types" },
  ] },
];

const adminOnlyNavHrefs = new Set(["/settings"]);
const menuPermissionPrefix = "menu.";
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

function readStoredIds(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function PersonAvatar({
  avatar,
  name,
  className,
}: {
  avatar?: string | null;
  name?: string | null;
  className: string;
}) {
  const initial = name?.[0] || "管";
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden", className)}>
      {avatar ? <NativeImage src={avatar} alt={`${name || "当前账号"}头像`} className="h-full w-full object-cover" loading="eager" /> : initial}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [, startRouteTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [todoCount, setTodoCount] = useState(0);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [pendingHref, setPendingHref] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [collapsedSubmenu, setCollapsedSubmenu] = useState<{ item: SidebarNavItem; top: number } | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const collapsedSubmenuTimerRef = useRef<number | null>(null);
  const todoCountRequestRef = useRef<Promise<void> | null>(null);
  const lastTodoCountFetchAtRef = useRef(0);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());
  const brandName = useMemo(() => {
    const orgBrandName = String(user?.sidebarBrandName || "").trim();
    if (orgBrandName) return orgBrandName;
    const shortName = String(user?.companyShortName || "").trim();
    return shortName ? Array.from(shortName).slice(0, 6).join("") : "星艺装饰";
  }, [user?.companyShortName, user?.sidebarBrandName]);
  const brandLogoUrl = String(user?.sidebarBrandLogoUrl || "").trim();
  const brandInitials = Array.from(brandName.replace(/\s/g, "")).slice(0, 2).join("") || "企";
  const brandSubtitle = String(user?.sidebarBrandSubtitle || "").trim();
  const visibleNavItems = useMemo(() => {
    const role = String(user?.role || "").toUpperCase();
    if (role === "OWNER" || role === "ADMIN") return navItems;
    const permissions = Array.isArray(user?.permissions) ? user.permissions.map(String) : [];
    const permissionSet = new Set(permissions);
    const hasMenuMarkers = permissions.some((permission) => permission.startsWith(menuPermissionPrefix));
    const canShowMenu = (menuKey: string) => {
      if (hasMenuMarkers) return permissionSet.has(`${menuPermissionPrefix}${menuKey}`);
      const legacyPermissions = legacyMenuPermissionMap[menuKey] || [];
      return legacyPermissions.some((permission) => permissionSet.has(permission));
    };
    return navItems.flatMap((item) => {
      if (adminOnlyNavHrefs.has(item.href) && !["OWNER", "ADMIN"].includes(role)) {
        const children = item.children?.filter((child) => canShowMenu(child.menuKey)) || [];
        return children.length ? [{ ...item, children, href: children[0].href }] : [];
      }
      if (item.children?.length) {
        const children = item.children.filter((child) => canShowMenu(child.menuKey));
        return children.length ? [{ ...item, children, href: children[0].href }] : [];
      }
      return canShowMenu(item.menuKey) ? [item] : [];
    });
  }, [user?.permissions, user?.role]);
  const defaultNavHref = visibleNavItems[0]?.href || "/dashboard";

  useEffect(() => {
    document.documentElement.style.setProperty("--active-sidebar-width", collapsed ? "76px" : "var(--sidebar-width)");
    if (!collapsed) setCollapsedSubmenu(null);
  }, [collapsed]);

  useEffect(() => {
    setPendingHref("");
  }, [pathname]);

  const navigateTo = useCallback((href: string) => {
    if (!href || pathname === href) return;
    setPendingHref(href);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("app:navigation-start", { detail: { href } }));
    }
    startRouteTransition(() => {
      router.push(href);
    });
  }, [pathname, router, startRouteTransition]);

  const prefetchRoute = useCallback((href: string) => {
    if (!href || prefetchedRoutesRef.current.has(href)) return;
    prefetchedRoutesRef.current.add(href);
    router.prefetch(href);
  }, [router]);

  const prefetchNavItem = useCallback((item: SidebarNavItem) => {
    prefetchRoute(item.href);
    item.children?.forEach((child) => prefetchRoute(child.href));
  }, [prefetchRoute]);

  const clearCollapsedSubmenuTimer = useCallback(() => {
    if (collapsedSubmenuTimerRef.current) {
      window.clearTimeout(collapsedSubmenuTimerRef.current);
      collapsedSubmenuTimerRef.current = null;
    }
  }, []);

  const openCollapsedSubmenu = useCallback((item: SidebarNavItem, target: HTMLElement) => {
    if (!collapsed) return;
    clearCollapsedSubmenuTimer();
    const sidebarRect = sidebarRef.current?.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const panelHeight = item.children?.length ? 58 + item.children.length * 38 : 44;
    const sidebarHeight = sidebarRect?.height || window.innerHeight;
    const rawTop = targetRect.top - (sidebarRect?.top || 0) - 8;
    const maxTop = Math.max(12, sidebarHeight - panelHeight - 12);
    setCollapsedSubmenu({
      item,
      top: Math.min(Math.max(12, rawTop), maxTop),
    });
  }, [clearCollapsedSubmenuTimer, collapsed]);

  const scheduleCloseCollapsedSubmenu = useCallback(() => {
    clearCollapsedSubmenuTimer();
    collapsedSubmenuTimerRef.current = window.setTimeout(() => {
      setCollapsedSubmenu(null);
      collapsedSubmenuTimerRef.current = null;
    }, 140);
  }, [clearCollapsedSubmenuTimer]);

  useEffect(() => {
    const routes = visibleNavItems.flatMap((item) => [item.href, ...(item.children || []).map((child) => child.href)]);
    if (typeof window === "undefined") return;
    const timerIds = routes.map((href, index) => window.setTimeout(() => {
      if (href !== pathname) prefetchRoute(href);
    }, 250 + index * 160));
    const prefetchRemaining = () => {
      routes.forEach((href) => {
        if (href !== pathname) prefetchRoute(href);
      });
    };
    const idleCallback = window.requestIdleCallback || ((callback: IdleRequestCallback) => window.setTimeout(callback, 800));
    const cancelIdleCallback = window.cancelIdleCallback || window.clearTimeout;
    const idleId = idleCallback(prefetchRemaining, { timeout: 2500 });
    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      cancelIdleCallback(idleId);
    };
  }, [pathname, prefetchRoute, visibleNavItems]);

  useEffect(() => {
    const activeGroup = visibleNavItems.find((item) => {
      if (!item.children?.length) return false;
      const activeHref = item.href.split("?")[0];
      return (
        pathname === activeHref ||
        pathname.startsWith(activeHref + "/") ||
        item.children.some((child) => pathname === child.href || pathname.startsWith(child.href + "/"))
      );
    });
    if (activeGroup) setOpenGroups({ [activeGroup.href]: true });
  }, [pathname, visibleNavItems]);

  useEffect(() => {
    if (!user?.id && !user?.name) return;
    let cancelled = false;
    const updateTodoCount = (force = false) => {
      const now = Date.now();
      if (!force && now - lastTodoCountFetchAtRef.current < 15000) return;
      if (todoCountRequestRef.current) return;
      lastTodoCountFetchAtRef.current = now;
      const token = localStorage.getItem("zxgj_token");
      const request = Promise.all([
        fetch("/api/followups?scope=todo", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : []).catch(() => []),
        fetch("/api/todos/designer-assignment", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : { items: [] }).catch(() => ({ items: [] })),
        fetch("/api/todos/quotation-receipt", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : { items: [] }).catch(() => ({ items: [] })),
        fetch("/api/todos/contract-approval", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : { items: [] }).catch(() => ({ items: [] })),
        fetch("/api/todos/deposit-approval", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : { items: [] }).catch(() => ({ items: [] })),
        fetch("/api/todos/deposit-refund-approval", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : { items: [] }).catch(() => ({ items: [] })),
        fetch("/api/todos/change-order-approval", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : { items: [] }).catch(() => ({ items: [] })),
        fetch("/api/notifications?scope=result&unread=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((res) => res.ok ? res.json() : { unreadCount: 0 }).catch(() => ({ unreadCount: 0 })),
      ])
        .then(([data, designerData, quotationData, contractData, depositData, depositRefundData, changeOrderData, notificationData]) => {
          const ignoredIds = readStoredIds("todos_ignored");
          const processedIds = readStoredIds("todos_processed");
          const pendingItems = (data || []).filter((item: any) =>
            item.customer_name &&
            (
              item.content?.includes("@" + user.name) ||
              (user.id ? item.reply_to_user_id === user.id && item.user_id !== user.id : item.reply_to_user_name === user.name && item.user_name !== user.name)
            ) &&
            !ignoredIds.includes(item.id) &&
            !processedIds.includes(item.id)
          );
          const designerCount = (designerData?.items || []).filter((item: any) => Number(item?.is_actionable || 0) === 1).length;
          const quotationCount = (quotationData?.items || []).filter((item: any) => item.status === "pending").length;
          const contractCount = (contractData?.items || []).filter((item: any) => item.status === "pending").length;
          const depositCount = (depositData?.items || []).filter((item: any) => item.status === "pending").length;
          const depositRefundCount = (depositRefundData?.items || []).filter((item: any) => item.status === "pending").length;
          const changeOrderCount = (changeOrderData?.items || []).filter((item: any) => item.status === "pending").length;
          const notificationCount = Number(notificationData?.unreadCount || 0);
          if (!cancelled) {
            setTodoCount(pendingItems.length + designerCount + quotationCount + contractCount + depositCount + depositRefundCount + changeOrderCount + notificationCount);
          }
        })
        .catch(() => {})
        .finally(() => {
          todoCountRequestRef.current = null;
        });
      todoCountRequestRef.current = request;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") updateTodoCount(true);
    };

    updateTodoCount(true);
    const intervalId = window.setInterval(() => updateTodoCount(false), 60000);
    const handleImmediateTodoRefresh = () => updateTodoCount(true);
    const handleFocusTodoRefresh = () => updateTodoCount(false);
    window.addEventListener("storage", handleImmediateTodoRefresh);
    window.addEventListener("todos:changed", handleImmediateTodoRefresh);
    window.addEventListener("focus", handleFocusTodoRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      clearCollapsedSubmenuTimer();
      window.removeEventListener("storage", handleImmediateTodoRefresh);
      window.removeEventListener("todos:changed", handleImmediateTodoRefresh);
      window.removeEventListener("focus", handleFocusTodoRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearCollapsedSubmenuTimer, user?.id, user?.name]);

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        "enterprise-shell-sidebar relative flex shrink-0 border-[#DDE6F2] text-[#182230] transition-all duration-300 md:flex-col md:border-r",
        collapsed ? "is-collapsed w-[76px]" : "w-[--sidebar-width]",
        "max-md:w-full max-md:border-b"
      )}
    >
      {/* Logo */}
      <div className="flex h-[76px] shrink-0 items-center justify-between border-[#DDE6F2] bg-white/86 px-3 md:border-b max-md:w-[76px] max-md:justify-center max-md:px-3">
        {!collapsed && (
          <Link
            href={defaultNavHref}
            prefetch
            onPointerEnter={() => prefetchRoute(defaultNavHref)}
            onFocus={() => prefetchRoute(defaultNavHref)}
            onClick={(event) => {
              event.preventDefault();
              navigateTo(defaultNavHref);
            }}
            className="enterprise-brand-link flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2"
          >
            <div className="enterprise-brand-mark flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] bg-[#f3f6fb] text-[13px] font-bold text-[#52647b] ring-1 ring-inset ring-[#dbe4ef]">
              {brandLogoUrl ? (
                <NativeImage src={brandLogoUrl} alt={`${brandName}标识`} className="h-full w-full object-contain" loading="eager" />
              ) : (
                <span>{brandInitials}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-center max-md:hidden">
              <span className="block truncate text-[16px] font-semibold text-[#182230]">{brandName}</span>
              {brandSubtitle && (
                <span className="block truncate text-[10px] font-medium text-[#7c8aa0]">{brandSubtitle}</span>
              )}
            </div>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "enterprise-collapse-button flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[#DDE6F2] bg-white text-[#7c8aa0] transition-colors hover:bg-[#F6F8FB] hover:text-[#2f6feb]",
            collapsed && "mx-auto",
            !collapsed && "ml-2",
            "max-md:hidden"
          )}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="scrollbar-none flex-1 gap-1 overflow-auto px-4 py-4 md:space-y-1 max-md:flex max-md:items-center">
        {visibleNavItems.map((item) => {
          const activeHref = item.href.split("?")[0];
          const isRouteActive =
            pathname === activeHref ||
            pathname.startsWith(activeHref + "/") ||
            Boolean(item.children?.some((child) => pathname === child.href || pathname.startsWith(child.href + "/")));
          const isPendingActive = Boolean(pendingHref) && (
            pendingHref === activeHref ||
            pendingHref.startsWith(activeHref + "/") ||
            Boolean(item.children?.some((child) => pendingHref === child.href || pendingHref.startsWith(child.href + "/")))
          );
          const isActive = pendingHref ? isPendingActive : isRouteActive;
          const itemPending = Boolean(pendingHref) && isPendingActive;
          const Icon = item.icon;
	          const hasChildren = Boolean(item.children?.length);
	          const isOpen = Boolean(openGroups[item.href]);
	          const showTodoBadge = item.href === "/todos" && todoCount > 0;
	          const todoBadgeText = todoCount > 99 ? "99+" : String(todoCount);

	          return (
            <div key={item.href} className="enterprise-menu-block">
              {hasChildren && !collapsed ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onPointerEnter={() => prefetchNavItem(item)}
                  onFocus={() => prefetchNavItem(item)}
                  onClick={() => {
                    prefetchNavItem(item);
                    if (!isRouteActive) {
                      setOpenGroups({ [item.href]: true });
                      navigateTo(item.href);
                      return;
                    }
                    setOpenGroups(isOpen ? {} : { [item.href]: true });
                  }}
                  className={cn(
                    "enterprise-menu-item group relative flex min-h-10 w-full items-center gap-2.5 rounded-[8px] border border-transparent px-2.5 py-2 text-left text-sm font-medium text-[#475467] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#CFE0FF]",
                    isActive && "is-active",
                    itemPending && "opacity-80",
                    "max-md:justify-center max-md:px-2"
                  )}
                >
                  <span className={cn(
                    "enterprise-menu-indicator absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-150",
                    isActive ? "bg-[#407AFF] opacity-100" : "bg-transparent opacity-0"
                  )} />
                  <span
                    className={cn(
                      "enterprise-menu-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[#A8B2C1] transition-colors duration-150",
                      isActive && "is-active",
                      itemPending && "animate-pulse"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
	                  <span className="min-w-0 flex-1 truncate max-md:hidden">{item.label}</span>
	                  {showTodoBadge && !collapsed && (
	                    <span className="enterprise-menu-count ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white max-md:hidden">
	                      {todoBadgeText}
	                    </span>
	                  )}
	                  <span className={cn(
                    "enterprise-menu-chevron ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[#A8B2C1] transition-all duration-150 max-md:hidden",
                    isOpen && "text-[#7c8aa0]"
                  )}>
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
                  </span>
                </button>
              ) : (
                <Link
                  href={item.href}
                  prefetch
                  onPointerEnter={(event) => {
                    if (hasChildren) prefetchNavItem(item);
                    else prefetchRoute(item.href);
                    if (collapsed) openCollapsedSubmenu(item, event.currentTarget);
                  }}
                  onPointerLeave={collapsed ? scheduleCloseCollapsedSubmenu : undefined}
                  onFocus={(event) => {
                    prefetchRoute(item.href);
                    if (collapsed) openCollapsedSubmenu(item, event.currentTarget);
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    setCollapsedSubmenu(null);
                    setPendingHref(item.href);
                    setOpenGroups({});
                    navigateTo(item.href);
                  }}
                  className={cn(
                    "enterprise-menu-item relative flex min-h-10 items-center gap-2.5 rounded-[8px] border border-transparent px-2.5 py-2 text-sm font-medium text-[#475467] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#CFE0FF]",
                    isActive && "is-active",
                    itemPending && "opacity-80",
                    collapsed && "justify-center px-2",
                    "max-md:justify-center max-md:px-2"
                  )}
                >
                  <span className={cn(
                    "enterprise-menu-indicator absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-150",
                    isActive ? "bg-[#407AFF] opacity-100" : "bg-transparent opacity-0"
                  )} />
                  <span
                    className={cn(
                      "enterprise-menu-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[#A8B2C1] transition-colors duration-150",
                      isActive && "is-active",
                      itemPending && "animate-pulse"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
	                  {!collapsed && <span className="min-w-0 flex-1 truncate max-md:hidden">{item.label}</span>}
	                  {showTodoBadge && (
	                    <span
	                      className={cn(
	                        "enterprise-menu-count inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white",
	                        collapsed ? "absolute right-1 top-1" : "ml-auto max-md:hidden"
	                      )}
	                    >
	                      {todoBadgeText}
	                    </span>
	                  )}
	                </Link>
	              )}
              {hasChildren && !collapsed && (
                <div
                  className={cn(
                    "enterprise-submenu-wrap grid overflow-hidden transition-[grid-template-rows,opacity,transform,margin-top] duration-200 ease-out max-md:hidden",
                    isOpen ? "mt-1 grid-rows-[1fr] translate-y-0 opacity-100" : "pointer-events-none mt-0 grid-rows-[0fr] -translate-y-1 opacity-0"
                  )}
                  aria-hidden={!isOpen}
                >
                  <div className="min-h-0 space-y-1 py-1 pl-10">
                    {item.children?.map((child) => {
                      const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
                      const childPending = pendingHref === child.href;
                      const childCurrent = pendingHref ? childPending : childActive;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          prefetch
                          onPointerEnter={() => prefetchRoute(child.href)}
                          onFocus={() => prefetchRoute(child.href)}
                          onClick={(event) => {
                            event.preventDefault();
                            setPendingHref(child.href);
                            navigateTo(child.href);
                          }}
                          className={cn(
                            "enterprise-submenu-item group/sub flex min-h-9 items-center rounded-[7px] border border-transparent px-2 text-sm font-medium text-[#667085] transition-colors duration-150",
                            childCurrent && "is-active"
                          )}
                        >
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {collapsed && collapsedSubmenu ? (
        <div
          className={cn(
            "enterprise-collapsed-submenu absolute left-[68px] z-[80] rounded-[12px] border border-[#DDE6F2] bg-white p-1.5 shadow-[0_18px_38px_rgba(24,34,48,0.14)]",
            collapsedSubmenu.item.children?.length ? "w-[178px]" : "w-auto min-w-[132px]"
          )}
          style={{ top: collapsedSubmenu.top }}
          onPointerEnter={clearCollapsedSubmenuTimer}
          onPointerLeave={scheduleCloseCollapsedSubmenu}
        >
          <div className={cn(
            "flex items-center gap-2 px-2.5 py-2",
            collapsedSubmenu.item.children?.length && "mb-1 border-b border-[#EDF2F8]"
          )}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF4FF] text-[#2f6feb]">
              <collapsedSubmenu.item.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate text-[13px] font-semibold leading-5 text-[#182230]">
              {collapsedSubmenu.item.label}
            </span>
          </div>
          {collapsedSubmenu.item.children?.length ? (
          <div className="space-y-1">
            {collapsedSubmenu.item.children.map((child) => {
              const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
              const childPending = pendingHref === child.href;
              const childCurrent = pendingHref ? childPending : childActive;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  prefetch
                  onPointerEnter={() => prefetchRoute(child.href)}
                  onFocus={() => prefetchRoute(child.href)}
                  onClick={(event) => {
                    event.preventDefault();
                    setCollapsedSubmenu(null);
                    setPendingHref(child.href);
                    navigateTo(child.href);
                  }}
                  className={cn(
                    "flex min-h-9 items-center rounded-[8px] px-3 text-[13px] font-medium text-[#667085] transition-colors duration-150 hover:bg-[#F6F8FB] hover:text-[#182230] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#CFE0FF]",
                    childCurrent && "bg-[#EAF2FF] text-[#2f6feb]"
                  )}
                >
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
          ) : null}
        </div>
      ) : null}

      {/* Bottom */}
      <div className={cn("enterprise-account-footer relative border-t border-[#DDE6F2] p-3 max-md:hidden", collapsed && "px-2")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onPointerEnter={() => prefetchRoute("/profile")}
              onFocus={() => prefetchRoute("/profile")}
              onClick={() => navigateTo("/profile")}
              className="rounded-full"
              aria-label="个人中心"
            >
              <PersonAvatar
                avatar={user?.avatar}
                name={user?.name}
                className="enterprise-account-avatar h-10 w-10 rounded-full bg-[#EDF4FF] text-sm font-black text-[#2f6feb] ring-1 ring-[#CFE0FF]"
              />
            </button>
          </div>
        ) : (
          <div className="enterprise-account-card">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onPointerEnter={() => prefetchRoute("/profile")}
                onFocus={() => prefetchRoute("/profile")}
                onClick={() => navigateTo("/profile")}
                className="enterprise-account-link"
              >
                <PersonAvatar
                  avatar={user?.avatar}
                  name={user?.name}
                  className="enterprise-account-avatar h-10 w-10 rounded-full bg-[#EDF4FF] text-sm font-black text-[#2f6feb] ring-1 ring-[#CFE0FF]"
                />
                <span className="min-w-0 flex-1">
                  <span className="enterprise-account-name">{user?.name || "加载中"}</span>
                  <span className="enterprise-account-role">{user?.role === "OWNER" ? "管理员" : "员工"}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(true)}
                className="enterprise-account-logout"
                aria-label="退出登录"
                title="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <LogoutConfirmDialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={logout}
      />
    </aside>
  );
}
