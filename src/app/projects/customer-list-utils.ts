// 客户管理列表页工具模块
// 从 page.tsx 渐进拆出的列配置、常量与请求工具。

import { useEffect, useState } from "react";
import { parseAppDate } from "@/lib/utils";
import { Building2, Users } from "lucide-react";
import { Customer, CustomerListMeta, CustomerListMode, CustomerListResponse, CustomerOwnerScope, DepartmentFilterType } from "./customer-list-shared";
import styles from "./projects.module.css";

export const columnDefs = [
  { key: "name", label: "客户姓名" },
  { key: "intention", label: "客户意向" },
  { key: "duplicate", label: "重复次数" },
  { key: "contact", label: "手机号" },
  { key: "address", label: "房号" },
  { key: "area_size", label: "面积" },
  { key: "budget", label: "装修预算" },
  { key: "status", label: "客户状态/阶段" },
  { key: "advisor", label: "家装顾问" },
  { key: "business_department", label: "业务部门" },
  { key: "designer", label: "设计师" },
  { key: "design_department", label: "设计部门" },
  { key: "created_at", label: "创建时间" },
  { key: "last_followup", label: "最近跟进" },
  { key: "next_followup", label: "下次跟进时间" },
  { key: "service_store", label: "服务门店" },
  { key: "followup_status", label: "跟进状态" },
];

export const customerOwnerScopes: { value: Exclude<CustomerOwnerScope, "all">; label: string; icon: typeof Users }[] = [
  { value: "service", label: "我服务的", icon: Users },
  { value: "managed", label: "我管理的", icon: Building2 },
];

export const customerOwnerScopeTips: Record<Exclude<CustomerOwnerScope, "all">, string> = {
  service: "我参与服务团队、由我邀约创建，或我负责项目的客户",
  managed: "我负责的组织及其下级组织名下的客户",
};

export const departmentFilterTypes: { value: DepartmentFilterType; label: string }[] = [
  { value: "business", label: "业务部门" },
  { value: "design", label: "设计部门" },
  { value: "service_store", label: "服务门店" },
  { value: "participant", label: "全部参与部门" },
];

export const departmentFilterTypeTips: Record<DepartmentFilterType, string> = {
  business: "按客户的家装顾问、邀约人或创建人所在组织筛选",
  design: "按客户已分配设计师所在组织筛选",
  service_store: "按客户当前所属服务门店或组织名称筛选",
  participant: "按服务团队、其他人员、邀约人、创建人、项目经理等参与人员所在组织筛选",
};

export const lifecycleStatusClassNames: Record<string, string> = {
  NEW: styles.lifecycleStatusNew,
  CONTACTED: styles.lifecycleStatusContacted,
  INVITED: styles.lifecycleStatusInvited,
  MEASURED: styles.lifecycleStatusMeasured,
  DEPOSITED: styles.lifecycleStatusDeposited,
  PROPOSAL: styles.lifecycleStatusProposal,
  SIGNED: styles.lifecycleStatusSigned,
  LOST: styles.lifecycleStatusLost,
};

export const defaultColumns = columnDefs.map((column) => column.key);

export function mergeCustomerColumnOrder(savedColumns: unknown) {
  if (!Array.isArray(savedColumns)) return defaultColumns;
  const knownColumns = savedColumns.filter((key): key is string => typeof key === "string" && defaultColumns.includes(key));
  const knownSet = new Set(knownColumns);
  const missingSet = new Set(defaultColumns.filter((key) => !knownSet.has(key)));
  const merged: string[] = [];

  knownColumns.forEach((key) => {
    merged.push(key);
    const defaultIndex = defaultColumns.indexOf(key);
    let nextIndex = defaultIndex + 1;
    while (nextIndex < defaultColumns.length && missingSet.has(defaultColumns[nextIndex])) {
      merged.push(defaultColumns[nextIndex]);
      missingSet.delete(defaultColumns[nextIndex]);
      nextIndex += 1;
    }
  });

  const nextOrder = [...merged, ...defaultColumns.filter((key) => missingSet.has(key))];
  return ["name", ...nextOrder.filter((key) => key !== "name")];
}

export function isStarIntention(value?: string | null) {
  return /^★{1,5}$/.test(String(value || ""));
}

export function getCustomerPhoneKey(customer: Customer) {
  const phone = customer.phone?.trim();
  if (!phone || phone === "仅微信联系") return "";
  return phone;
}

export function getDateOnlyValue(value?: string | Date | null) {
  const date = parseAppDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getFollowupOverdueDays(nextFollowupAt?: string | Date | null, overdueDays?: number | string | null) {
  const parsedDays = Number(overdueDays || 0);
  if (Number.isFinite(parsedDays) && parsedDays > 0) return Math.floor(parsedDays);
  const nextDate = getDateOnlyValue(nextFollowupAt);
  const today = getDateOnlyValue(new Date());
  if (!nextDate || !today || nextDate >= today) return 0;
  const diff = (new Date(`${today}T00:00:00+08:00`).getTime() - new Date(`${nextDate}T00:00:00+08:00`).getTime()) / 86400000;
  return Number.isFinite(diff) ? Math.max(1, Math.floor(diff)) : 0;
}

export function getFollowupStatus(nextFollowupAt?: string | Date | null, hasOverdueFollowup?: number | boolean | null, overdueDays?: number | string | null) {
  if (hasOverdueFollowup === true || hasOverdueFollowup === 1) {
    const days = getFollowupOverdueDays(nextFollowupAt, overdueDays);
    return { label: days > 0 ? `跟进逾期${days}天` : "跟进逾期", className: "bg-red-50 text-red-700 ring-red-100" };
  }
  const nextDate = getDateOnlyValue(nextFollowupAt);
  if (!nextDate) {
    return { label: "未安排跟进", className: "bg-surface-100 text-surface-500 ring-surface-200" };
  }
  const today = getDateOnlyValue(new Date());
  if (!today) {
    return { label: "正常跟进", className: "bg-emerald-50 text-emerald-700 ring-emerald-100" };
  }
  if (nextDate < today) {
    const days = getFollowupOverdueDays(nextFollowupAt, overdueDays);
    return { label: days > 0 ? `跟进逾期${days}天` : "跟进逾期", className: "bg-red-50 text-red-700 ring-red-100" };
  }
  if (nextDate === today) {
    return { label: "今日跟进", className: "bg-amber-50 text-amber-700 ring-amber-100" };
  }
  return { label: "正常跟进", className: "bg-emerald-50 text-emerald-700 ring-emerald-100" };
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

export function buildCustomerListUrl({
  page,
  pageSize,
  filter,
  search,
  createdFrom,
  createdTo,
  sourceFilter,
  storeFilter,
  advisorFilter,
  designerFilter,
  intentionFilter,
  followupFilter,
  departmentType,
  departmentOrgId,
  departmentIncludeChildren,
  duplicateFilter,
  exportAll = false,
  includeMeta = true,
  duplicatePhone,
  ownerScope = "all",
  listMode = "active",
}: {
  page: number;
  pageSize: number;
  filter: string;
  search: string;
  createdFrom: string;
  createdTo: string;
  sourceFilter: string;
  storeFilter: string;
  advisorFilter: string;
  designerFilter: string;
  intentionFilter: string;
  followupFilter: string;
  departmentType: DepartmentFilterType;
  departmentOrgId: string;
  departmentIncludeChildren: boolean;
  duplicateFilter: string;
  exportAll?: boolean;
  includeMeta?: boolean;
  duplicatePhone?: string | null;
  ownerScope?: CustomerOwnerScope;
  listMode?: CustomerListMode;
}) {
  const params = new URLSearchParams({
    mode: "list",
    page: String(page),
    pageSize: String(pageSize),
    status: filter,
  });
  const append = (key: string, value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) params.set(key, trimmed);
  };
  append("search", search);
  append("createdFrom", createdFrom);
  append("createdTo", createdTo);
  append("source", sourceFilter);
  append("store", storeFilter);
  append("advisor", advisorFilter);
  append("designer", designerFilter);
  append("intention", intentionFilter);
  append("followup", followupFilter);
  append("departmentType", departmentOrgId ? departmentType : "");
  append("departmentOrgId", departmentOrgId);
  if (departmentOrgId && departmentIncludeChildren) params.set("departmentIncludeChildren", "1");
  append("duplicate", duplicateFilter);
  if (exportAll) params.set("export", "1");
  if (!includeMeta) params.set("includeMeta", "0");
  append("duplicatePhone", duplicatePhone);
  if (ownerScope !== "all") params.set("scope", ownerScope);
  if (listMode === "deleted") params.set("deleted", "1");
  return `/api/customers?${params.toString()}`;
}

export function buildCustomerListMetaUrl(options: Parameters<typeof buildCustomerListUrl>[0]) {
  const listUrl = buildCustomerListUrl({ ...options, page: 1, pageSize: 1, includeMeta: true });
  const [path, query = ""] = listUrl.split("?");
  const params = new URLSearchParams(query);
  params.set("mode", "list-meta");
  params.delete("page");
  params.delete("pageSize");
  params.delete("includeMeta");
  params.delete("export");
  params.delete("duplicatePhone");
  return `${path}?${params.toString()}`;
}

export async function fetchCustomerList(url: string, signal?: AbortSignal): Promise<CustomerListResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : null;
  const res = await fetch(url, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "客户列表加载失败");
  }
  return res.json();
}

export async function fetchCustomerMeta(url: string, signal?: AbortSignal): Promise<CustomerListMeta> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : null;
  const res = await fetch(url, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "客户筛选数据加载失败");
  }
  return res.json();
}

