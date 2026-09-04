// 客户管理列表页共享工具模块
// 存放页面主体与客户弹窗组件共用的类型与纯计算函数。

import type { ReactNode } from "react";
import NativeImage from "@/components/ui/NativeImage";
import styles from "./projects.module.css";

export type Customer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  weixin?: string | null;
  source?: string | null;
  address?: string | null;
  house_address?: string | null;
  building_no?: string | null;
  unit_no?: string | null;
  room_no?: string | null;
  no_room_number?: number | boolean | null;
  area?: string | null;
  area_size?: number | string | null;
  budget?: number | string | null;
  status?: string | null;
  intention?: string | null;
  created_by_name?: string | null;
  created_by_avatar?: string | null;
  advisor_name?: string | null;
  advisor_avatar?: string | null;
  business_department_name?: string | null;
  inviter_name?: string | null;
  inviter_avatar?: string | null;
  inviter_id?: string | null;
  designer_name?: string | null;
  designer_avatar?: string | null;
  design_department_name?: string | null;
  last_followup_at?: string | Date | null;
  next_followup_at?: string | Date | null;
  has_overdue_followup?: number | boolean | null;
  overdue_followup_days?: number | string | null;
  created_at?: string | Date | null;
  service_store?: string | null;
  service_store_is_active?: number | string | null;
  house_type?: string | null;
  decoration_type?: string | null;
  is_delivered?: number | boolean | null;
  requirements?: string | null;
  remarks?: string | null;
  phone_duplicate_count?: number | string | null;
  deleted_at?: string | Date | null;
};

export type OrgUnit = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active?: number;
};

export type OrgOption = OrgUnit & {
  depth: number;
  path: string;
};

export function isOrgActive(unit?: OrgUnit | null) {
  return Number(unit?.is_active ?? 1) === 1;
}

export function normalizeRoomPart(value: string | null | undefined, suffixes: string[]) {
  const cleaned = value?.trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

export function buildCustomerRoomNumber(customer: Customer) {
  if (customer.no_room_number === true || customer.no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(customer.building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(customer.unit_no, ["单元"]);
  const room = normalizeRoomPart(customer.room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

export function getCustomerRoomDisplay(customer: Customer) {
  const community = customer.address?.trim();
  const roomNumber = buildCustomerRoomNumber(customer);
  if (community && roomNumber && roomNumber !== "暂无房号") return `${community}${roomNumber}`;
  return community || customer.house_address?.trim() || customer.area?.trim() || "";
}

export function getStaffInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "人";
}

export function StaffInlineAvatar({
  name,
  avatar,
  emptyText = "-",
  className = "",
}: {
  name?: string | null;
  avatar?: string | null;
  emptyText?: ReactNode;
  className?: string;
}) {
  const displayName = name?.trim();

  if (!displayName || displayName === "-") {
    return <span className={styles.emptyValue}>{emptyText}</span>;
  }

  return (
    <span className={`${styles.staffInline} ${className}`} title={displayName}>
      <span className={styles.staffAvatar} aria-hidden="true">
        {avatar ? (
          <NativeImage src={avatar} alt={`${displayName}头像`} className="h-full w-full object-cover" />
        ) : (
          getStaffInitial(displayName)
        )}
      </span>
      <span className={styles.staffName}>{displayName}</span>
    </span>
  );
}

export function buildOrgOptions(units: OrgUnit[]): OrgOption[] {
  const map = new Map<string, OrgUnit & { children: OrgUnit[] }>();
  units.forEach((unit) => map.set(unit.id, { ...unit, children: [] }));
  const roots: (OrgUnit & { children: OrgUnit[] })[] = [];
  units.forEach((unit) => {
    const node = map.get(unit.id);
    if (!node) return;
    if (unit.parent_id && map.has(unit.parent_id)) {
      map.get(unit.parent_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const options: OrgOption[] = [];
  const walk = (node: OrgUnit & { children: OrgUnit[] }, depth: number, ancestors: string[]) => {
    const pathParts = [...ancestors, node.name];
    options.push({ ...node, depth, path: pathParts.join(" / ") });
    node.children.forEach((child) => walk(child as OrgUnit & { children: OrgUnit[] }, depth + 1, pathParts));
  };
  roots.forEach((root) => walk(root, 0, []));
  return options;
}

export type CustomerOwnerScope = "all" | "service" | "managed";
export type DepartmentFilterType = "business" | "design" | "service_store" | "participant";

export const orgTypeLabels: Record<string, string> = {
  group: "集团",
  region: "大区",
  company: "公司",
  store: "门店",
  dept: "部门",
  team: "小组",
};

export const secondaryButtonClass = `${styles.secondaryButton} inline-flex shrink-0 items-center gap-2 px-3.5 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-60`;
export const primaryButtonClass = `${styles.primaryButton} inline-flex shrink-0 items-center gap-2 px-3.5 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-60`;

export type CustomerListMode = "active" | "deleted";

export type CustomerListResponse = {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
  sourceOptions: string[];
  storeOptions: string[];
  advisorOptions: CustomerFilterOption[];
  designerOptions: CustomerFilterOption[];
  intentionOptions: string[];
};

export type CustomerFilterOption = {
  value: string;
  label: string;
};

export type CustomerListMeta = Pick<
  CustomerListResponse,
  "statusCounts" | "sourceOptions" | "storeOptions" | "advisorOptions" | "designerOptions" | "intentionOptions"
>;
