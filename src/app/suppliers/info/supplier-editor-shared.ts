// 供应商信息页共享工具模块
// 存放页面主体与供应商编辑组件共用的类型、常量与纯计算函数。

export type Supplier = {
  id: string;
  company_id?: string;
  name: string;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  remark?: string | null;
  supplier_type?: string | null;
  settlement_cycle?: string | null;
  bank_account?: string | null;
  tax_no?: string | null;
  cooperation_status?: string | null;
  owner_name?: string | null;
  settlement_method?: string | null;
  main_categories?: string | null;
  rating?: string | null;
  material_count?: number;
  order_count?: number;
  order_amount?: number;
  last_order_date?: string | null;
  updated_at?: string | null;
  account_count?: number;
  accounts?: SupplierAccount[];
};

export type SupplierAccount = {
  id?: string;
  login_account: string;
  display_name: string;
  phone: string;
  role: string;
  is_active: boolean | number;
  remark: string;
  last_login_at?: string | null;
};

export type SupplierForm = {
  id?: string;
  name: string;
  supplier_type: string;
  cooperation_status: string;
  rating: string;
  main_categories: string;
  contact: string;
  phone: string;
  owner_name: string;
  address: string;
  settlement_cycle: string;
  settlement_method: string;
  tax_no: string;
  bank_account: string;
  accounts: SupplierAccount[];
  remark: string;
};

export const supplierTypeLabels: Record<string, string> = {
  MAIN_MATERIAL: "主材供应商",
  AUXILIARY: "辅材供应商",
  CUSTOM: "定制供应商",
  SOFT_DECOR: "软装供应商",
  COMPANY_WAREHOUSE: "公司直营仓",
  OTHER: "综合其他仓",
};

export const legacySupplierTypeMap: Record<string, string> = {
  GENERAL: "OTHER",
  AUXILIARY_SETTLEMENT: "AUXILIARY",
  WAREHOUSE: "COMPANY_WAREHOUSE",
  LABOR: "AUXILIARY",
  SERVICE: "SOFT_DECOR",
};

export const statusLabels: Record<string, string> = {
  ACTIVE: "合作中",
  PENDING: "待审核",
  PAUSED: "暂停合作",
  BLACKLIST: "黑名单",
};

export const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  PENDING: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  PAUSED: "bg-surface-100 text-surface-600 ring-1 ring-surface-200",
  BLACKLIST: "bg-red-50 text-red-700 ring-1 ring-red-100",
};

export const ratingLabels: Record<string, string> = {
  A: "A级",
  B: "B级",
  C: "C级",
  UNRATED: "未评级",
};

export const settlementCycleLabels: Record<string, string> = {
  IMMEDIATE: "现结",
  WEEKLY: "周结",
  MONTHLY: "月结",
  PROJECT: "按项目结",
  CREDIT: "账期",
};

export const supplierTypeValues = Object.fromEntries(Object.entries(supplierTypeLabels).map(([value, label]) => [label, value]));
Object.assign(supplierTypeValues, {
  综合供应商: "OTHER",
  综合其他: "OTHER",
  综合其他仓: "OTHER",
  辅材月结商: "AUXILIARY",
  直营仓: "COMPANY_WAREHOUSE",
  直营辅材仓: "COMPANY_WAREHOUSE",
  人工班组: "AUXILIARY",
  服务商: "SOFT_DECOR",
});
export const statusValues = Object.fromEntries(Object.entries(statusLabels).map(([value, label]) => [label, value]));
export const ratingValues = Object.fromEntries(Object.entries(ratingLabels).map(([value, label]) => [label, value]));
export const settlementCycleValues = Object.fromEntries(Object.entries(settlementCycleLabels).map(([value, label]) => [label, value]));
export const supplierImportHeaders = ["供应商名称", "类型", "合作状态", "评级", "主营品类", "联系人", "电话", "内部负责人", "结算周期", "结算方式", "地址", "税号", "收款账户", "备注"];
export const supplierImportExamples = [
  ["东鹏瓷砖成都总代", "主材供应商", "合作中", "A级", "瓷砖、岩板", "张经理", "13800000000", "王材料", "月结", "公对公转账", "成都市武侯区材料市场1栋", "91510100XXXXXXXXXX", "建设银行成都分行 6222********", "支持送货上楼，需提前2天下单"],
  ["城南水泥沙供应商", "辅材供应商", "合作中", "B级", "水泥、河沙、红砖", "李老板", "13900000000", "陈项目", "月结", "微信/对公", "成都市高新区天府大道附近", "", "", "每月25日对账"],
];
export const supplierImportRules = [
  ["供应商名称", "必填", "供应商的正式名称，导入时不能为空。同名供应商会更新已有资料。", "东鹏瓷砖成都总代"],
  ["类型", "选填", `可填：${Object.values(supplierTypeLabels).join("、")}`, "主材供应商"],
  ["合作状态", "选填", `可填：${Object.values(statusLabels).join("、")}`, "合作中"],
  ["评级", "选填", `可填：${Object.values(ratingLabels).join("、")}`, "A级"],
  ["结算周期", "选填", `可填：${Object.values(settlementCycleLabels).join("、")}`, "月结"],
  ["主营品类", "选填", "多个品类可用顿号、逗号或斜杠分隔。", "瓷砖、洁具"],
  ["联系人/电话/地址", "选填", "建议填写，方便材料下单和财务对账。", "张经理 / 13800000000"],
  ["税号/收款账户", "选填", "用于开票、付款、对账，可后续补充。", "纳税人识别号 / 开户行账号"],
];

export function makeDefaultForm(): SupplierForm {
  return {
    name: "",
    supplier_type: "MAIN_MATERIAL",
    cooperation_status: "ACTIVE",
    rating: "UNRATED",
    main_categories: "",
    contact: "",
    phone: "",
    owner_name: "",
    address: "",
    settlement_cycle: "MONTHLY",
    settlement_method: "",
    tax_no: "",
    bank_account: "",
    accounts: [],
    remark: "",
  };
}

export function normalizeSupplierType(value?: string | null) {
  const input = String(value || "").trim();
  if (supplierTypeLabels[input]) return input;
  return legacySupplierTypeMap[input] || "MAIN_MATERIAL";
}

export function normalizeMobile(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}
