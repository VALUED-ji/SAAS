// 分公司设置-审批流程共享工具模块
// 存放审批流区块与页面主体共用的类型常量与纯计算函数。

import type { ApprovalFlow, ApprovalNode } from "@/lib/branchSettings";

export const flowTypeOptions = [
  { value: "contract", label: "合同审批" },
  { value: "quote", label: "报价审批" },
  { value: "deposit", label: "收款审批" },
  { value: "discount", label: "折扣审批" },
  { value: "refund", label: "退款审批" },
  { value: "payment", label: "付款审批" },
  { value: "material", label: "材料审批" },
  { value: "change_order", label: "变更单审批" },
  { value: "custom", label: "自定义" },
] as const;

export const flowTypeLabels = flowTypeOptions.reduce<Record<string, string>>((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

export const approverSourceOptions: { value: ApprovalNode["approverSource"]; label: string }[] = [
  { value: "customer_team_role", label: "客户服务团队" },
  { value: "project_team_role", label: "项目服务团队" },
  { value: "org_role", label: "分公司/公司角色" },
  { value: "direct_user", label: "指定员工" },
  { value: "initiator_manager", label: "发起人上级" },
];

export const approverSourceLabels = approverSourceOptions.reduce<Record<string, string>>((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

export function defaultFlowName(type: ApprovalFlow["type"]) {
  return `${flowTypeLabels[type] || "自定义"}流`;
}

export type RoleOption = {
  code: string;
  name: string;
  company_id?: string | null;
};

export type UserOption = {
  id: string;
  name: string;
  role: string;
  org_unit_id?: string | null;
  org_unit_name?: string;
};

export function makeLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export type BranchMaterialOption = {
  id: string;
  code?: string | null;
  name: string;
  brand?: string | null;
  product_name?: string | null;
  material_model?: string | null;
  color?: string | null;
  spec?: string | null;
  unit?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  category_name?: string | null;
  stock?: number | null;
  min_stock?: number | null;
  image?: string | null;
  images?: string[] | string | null;
};

export type BranchSupplierOption = {
  id: string;
  name: string;
  supplier_type?: string | null;
  contact?: string | null;
  phone?: string | null;
  material_count?: number | null;
};

export function formatQuantity(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

export function getMaterialSpec(item: BranchMaterialOption) {
  return [item.brand, item.product_name, item.material_model, item.color, item.spec].filter(Boolean).join(" / ");
}

export function getMaterialImage(item?: BranchMaterialOption | null) {
  if (!item) return "";
  if (item.image) return item.image;
  const images = item.images;
  if (Array.isArray(images)) return images[0] || "";
  if (typeof images === "string") {
    const text = images.trim();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return String(parsed[0] || "");
    } catch {
      return text.split(/[；;,]/).map((value) => value.trim()).filter(Boolean)[0] || "";
    }
  }
  return "";
}
