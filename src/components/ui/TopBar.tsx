"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/group-dashboard": { title: "集团总览", subtitle: "掌握省份/大区、分公司、客户漏斗和工地阶段表现" },
  "/dashboard": { title: "经营总览", subtitle: "掌握线索、签约、施工与回款节奏" },
  "/todos": { title: "待办中心", subtitle: "聚合跟进、提醒和协作任务" },
  "/projects": { title: "客户管理", subtitle: "从线索到项目的全流程管理" },
  "/quotations": { title: "报价合同", subtitle: "管理报价、合同和签约节点" },
  "/site": { title: "工地管理", subtitle: "推进施工进度、巡检整改、日志和材料下单" },
  "/orders": { title: "订单管理", subtitle: "管理材料下单、到货与结算进度" },
  "/materials": { title: "材料管理", subtitle: "维护材料库、供应商和采购数据" },
  "/settings": { title: "系统设置", subtitle: "维护系统级主数据和基础规则" },
  "/suppliers": { title: "供应商管理", subtitle: "维护供应商档案、合作状态与结算信息" },
  "/team": { title: "团队管理", subtitle: "协调设计、施工和运营角色" },
  "/roles": { title: "角色管理", subtitle: "配置员工角色和权限范围" },
  "/branch-settings": { title: "分公司设置", subtitle: "维护各分公司的业务规则和功能开关" },
  "/finance": { title: "财务中心", subtitle: "追踪营收、成本与利润表现" },
  "/quota": { title: "定额管理", subtitle: "维护定额库、定额模板和造价基础数据" },
  "/organization": { title: "组织管理", subtitle: "维护组织架构和门店关系" },
};

export default function TopBar() {
  const pathname = usePathname();
  const pageInfo =
    Object.entries(pageTitles)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([href]) => pathname === href || pathname.startsWith(href + "/"))?.[1] ??
    pageTitles["/dashboard"];
  const isCompactTopBarPage =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/group-dashboard" ||
    pathname.startsWith("/group-dashboard/") ||
    pathname === "/todos" ||
    pathname.startsWith("/todos/") ||
    pathname === "/quotations" ||
    pathname.startsWith("/quotations/") ||
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/site" ||
    pathname.startsWith("/site/") ||
    pathname === "/orders" ||
    pathname.startsWith("/orders/") ||
    pathname === "/materials" ||
    pathname.startsWith("/materials/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/suppliers" ||
    pathname.startsWith("/suppliers/") ||
    pathname === "/team" ||
    pathname.startsWith("/team/") ||
    pathname === "/roles" ||
    pathname.startsWith("/roles/") ||
    pathname === "/branch-settings" ||
    pathname.startsWith("/branch-settings/") ||
    pathname === "/finance" ||
    pathname.startsWith("/finance/") ||
    pathname === "/quota" ||
    pathname.startsWith("/quota/") ||
    pathname === "/organization" ||
    pathname.startsWith("/organization/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/");

  if (isCompactTopBarPage) return null;

  return (
    <header className="flex h-[76px] items-center justify-between gap-5 border-b border-surface-200/80 bg-white/65 px-5 backdrop-blur lg:px-7">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-surface-900">{pageInfo.title}</p>
        <p className="mt-0.5 hidden truncate text-xs text-surface-500 sm:block">{pageInfo.subtitle}</p>
      </div>

      <div className="hidden min-h-10 w-full max-w-xl items-center gap-3 rounded-lg border border-surface-200 bg-white px-3.5 text-sm text-surface-400 shadow-[0_8px_18px_rgba(31,41,53,0.035)] xl:flex">
        <Search className="h-4 w-4 shrink-0" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-surface-400"
          placeholder="搜索客户、楼盘、项目或合同"
          type="search"
        />
      </div>
    </header>
  );
}
