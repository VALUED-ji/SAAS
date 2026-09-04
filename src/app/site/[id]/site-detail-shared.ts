// 工地详情页共享工具模块
// 存放页面主体与展示组件共用的类型、常量与纯计算函数，
// 避免 page.tsx 与 site-detail-bits.tsx 之间循环依赖。

export type ChangeOrderItemForm = {
  change_type: string;
  title: string;
  space: string;
  phase: string;
  description: string;
  unit_price: string;
  quantity: string;
  unit: string;
  amount: string;
  cost_estimate: string;
};

export type ChangeOrderForm = {
  discount_amount: string;
  discount_reason: string;
  owner_confirmed: boolean;
  items: ChangeOrderItemForm[];
};

export const phaseLabels: Record<string, string> = {
  DEMOLITION: "拆改",
  PLUMBING: "水电",
  MASONRY: "泥瓦",
  CARPENTRY: "木工",
  PAINTING: "油漆",
  INSTALLATION: "安装",
  DECORATION: "软装",
  INSPECTION: "验收",
};

export const phaseOptions = Object.entries(phaseLabels);

export const contractStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_APPROVAL: "审批中",
  REJECTED: "已驳回",
  SIGNED: "已签约",
  RESIGNED: "已重签",
};

export const materialOrderStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待下单",
  ORDERED: "已下单",
  PARTIAL: "部分到货",
  RECEIVED: "已到货",
  CANCELLED: "已取消",
};

export const materialOrderTypeLabels: Record<string, string> = {
  AUXILIARY_WAREHOUSE: "辅材仓配",
  AUXILIARY_MONTHLY: "辅材月结",
  MAIN_SUPPLIER: "主材下单",
};

export const changeOrderStatusLabels: Record<string, string> = {
  PENDING_APPROVAL: "待内部审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  CANCELLED: "已作废",
};

export function formatPlainAmount(value: number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function normalizeChangeLineType(value?: string | null) {
  return value === "DEDUCT" ? "DEDUCT" : "ADD";
}

export function getChangeOrderLineAmount(item: Partial<ChangeOrderItemForm> | any) {
  const unitPrice = Math.max(0, Number(item?.unit_price || 0) || 0);
  const quantity = Math.max(0, Number(item?.quantity || 0) || 0);
  const computed = Math.round(unitPrice * quantity * 100) / 100;
  if (computed > 0) return computed;
  return Math.max(0, Number(item?.amount || 0) || 0);
}

export function getChangeOrderAddAmountFromItems(items: Array<Partial<ChangeOrderItemForm> | any>) {
  return roundMoney(items.reduce((sum, item) => sum + (normalizeChangeLineType(item?.change_type) === "ADD" ? getChangeOrderLineAmount(item) : 0), 0));
}

export function getChangeOrderDeductAmountFromItems(items: Array<Partial<ChangeOrderItemForm> | any>) {
  return roundMoney(items.reduce((sum, item) => sum + (normalizeChangeLineType(item?.change_type) === "DEDUCT" ? getChangeOrderLineAmount(item) : 0), 0));
}

export function getChangeOrderFormDiscount(form: ChangeOrderForm) {
  return roundMoney(Math.max(0, Number(form.discount_amount || 0) || 0));
}

export function getChangeOrderFormSignedReceivable(form: ChangeOrderForm) {
  const addAmount = getChangeOrderAddAmountFromItems(form.items);
  const deductAmount = getChangeOrderDeductAmountFromItems(form.items);
  const discountAmount = Math.min(addAmount, getChangeOrderFormDiscount(form));
  return roundMoney(addAmount - deductAmount - discountAmount);
}
