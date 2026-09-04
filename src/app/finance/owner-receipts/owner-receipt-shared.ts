// 业主收款页共享工具模块
// 存放页面主体与视图组件共用的类型、常量与纯计算函数，
// 避免 page.tsx 与 owner-receipt-views.tsx 之间循环依赖。

import type { LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { ArrowDownLeft, CalendarDays, CheckCircle2, Clock3, HandCoins, Loader2, RotateCcw, WalletCards, X } from "lucide-react";
import { toDatetimeLocalValue } from "@/lib/utils";
import styles from "./owner-receipts.module.css";

export type ReceiptCategoryKey = "deposit" | "design_fee" | "project_payment" | "change_payment";
export type ReceiptViewKey = `${ReceiptCategoryKey}_${ReceiptDirection}`;
export type CollectionStatus = "all" | "unpaid" | "collecting" | "completed" | "refund" | "voided";
export type ReceiptDirection = "collect" | "refund";
export type RefundStatusFilter = "refund_pending_approval" | "refund_pending_refund" | "refund_paying" | "refund_refunded" | "refund_rejected";
export type ReceiptStatusFilter = CollectionStatus | RefundStatusFilter;
export type ItemStatus = Exclude<CollectionStatus, "all">;
export type StatusTone = "green" | "amber" | "red" | "blue" | "gray";
export type StatusCountMap = Partial<Record<ReceiptStatusFilter | "voided", number>>;

export type CategorySummary = {
  key: ReceiptCategoryKey;
  label: string;
  description: string;
  receivableAmount: number;
  receivedAmount: number;
  refundAmount: number;
  remainingAmount: number;
  statusCounts: StatusCountMap;
};

export type ReceiptViewSummary = {
  key: ReceiptViewKey;
  categoryKey: ReceiptCategoryKey;
  direction: ReceiptDirection;
  label: string;
  description: string;
  count: number;
  icon: LucideIcon;
};

export type ProjectBasicInfo = {
  projectAddress: string | null;
  fullRoomName: string | null;
  area: number | null;
  serviceStore: string | null;
  designerName: string | null;
  managerName: string | null;
  projectStatus: string | null;
  siteStage: string | null;
  currentPhase: string | null;
  startDate: string | null;
  plannedEndDate: string | null;
};

export type ReceiptApprovalStep = {
  id: string;
  nodeName: string;
  sortOrder: number;
  approverId: string;
  approverAvatar?: string | null;
  approverName: string;
  approveMode: string;
  canReject: boolean;
  status: string;
  statusLabel: string;
  comment: string;
  actionAt: string | null;
  signatureName?: string | null;
  signatureSignerName?: string | null;
  signatureSignedAt?: string | null;
  signatureUrl?: string | null;
};

export type ReceiptApprovalInfo = {
  id: string;
  status: string;
  statusLabel: string;
  flowName: string;
  currentNodeName: string;
  currentApprovers: string[];
  approvedNodes: number;
  totalNodes: number;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  errorMessage: string;
  steps: ReceiptApprovalStep[];
};

export type ReceiptItem = {
  id: string;
  categoryKey: ReceiptCategoryKey;
  categoryLabel: string;
  collectionStatus: ItemStatus;
  statusLabel: string;
  statusTone: StatusTone;
  flowLabel: string;
  customerId: string | null;
  customerName: string;
  projectId: string | null;
  projectName: string;
  contractId?: string | null;
  contractNo?: string | null;
  contractTitle?: string | null;
  title: string;
  receivableAmount: number;
  receivedAmount: number;
  depositDeductionAmount: number;
  changeRefundDeductionAmount: number;
  actualReceivableAmount: number;
  refundAmount: number;
  remainingAmount: number;
  method: string;
  operator: string;
  dueDate: string | null;
  occurredAt: string | null;
  note: string;
  basicInfo: ProjectBasicInfo;
  isAccrual?: boolean;
  approval?: ReceiptApprovalInfo | null;
};

export type ContractReceiptGroup = {
  key: string;
  contractId: string | null;
  contractNo: string | null;
  contractTitle: string;
  statusLabel: string;
  statusTone: StatusTone;
  receivableAmount: number;
  depositDeductionAmount: number;
  changeRefundDeductionAmount: number;
  actualReceivableAmount: number;
  receivedAmount: number;
  refundAmount: number;
  remainingAmount: number;
  nextDueDate: string | null;
  items: ReceiptItem[];
};

export type ReceiptLedgerItem = {
  id: string;
  groupKey: string;
  categoryKey: ReceiptCategoryKey;
  title: string;
  flowLabel: string;
  direction: "receipt" | "refund" | "reversal";
  amount: number;
  method: string;
  operator: string;
  occurredAt: string | null;
  receiptVoucher: string | null;
  note: string;
  statusLabel: string;
  statusTone: StatusTone;
  sourceRecordId?: string | null;
  reversalOfRecordId?: string | null;
  canReverse?: boolean;
  reversedAt?: string | null;
};

export type RefundRequestStatus = "pending_approval" | "pending_refund" | "paying" | "refunded" | "rejected";

export type RefundRequestItem = {
  id: string;
  groupKey: string;
  categoryKey: ReceiptCategoryKey;
  sourceItemId: string;
  title: string;
  amount: number;
  status: RefundRequestStatus;
  statusLabel: string;
  statusTone: StatusTone;
  requestedAt: string | null;
  completedAt: string | null;
  applicant: string;
  currentApprover: string;
  reason: string;
  canConfirmRefund: boolean;
};

export type RefundSummary = {
  pendingApprovalCount: number;
  pendingApprovalAmount: number;
  pendingRefundCount: number;
  pendingRefundAmount: number;
  payingCount: number;
  payingAmount: number;
  refundedCount: number;
  refundedAmount: number;
  rejectedCount: number;
  rejectedAmount: number;
};

export type RelatedReceiptOrderSummary = {
  id: string;
  title: string;
  receivableAmount: number;
  receivedAmount: number;
  refundAmount: number;
  remainingAmount: number;
  itemCount: number;
  latestAt: string | null;
  statusLabel: string;
  statusTone: StatusTone;
};

export type ProjectReceiptGroup = {
  id: string;
  categoryKey: ReceiptCategoryKey;
  categoryLabel: string;
  customerId: string | null;
  customerName: string;
  projectId: string | null;
  projectName: string;
  statusLabel: string;
  statusTone: StatusTone;
  statusFlags: Record<Exclude<CollectionStatus, "all">, boolean>;
  receivableAmount: number;
  receivedAmount: number;
  refundAmount: number;
  remainingAmount: number;
  itemCount: number;
  latestAt: string | null;
  nextDueDate: string | null;
  operator: string;
  basicInfo: ProjectBasicInfo;
  items: ReceiptItem[];
  ledgerItems: ReceiptLedgerItem[];
  refundRequests: RefundRequestItem[];
  refundSummary: RefundSummary;
  relatedOrderSummaries?: RelatedReceiptOrderSummary[];
};

export type OwnerReceiptsData = {
  range: { key: string; label: string };
  activeCategory: ReceiptCategoryKey;
  activeDirection: ReceiptDirection;
  activeStatus: ReceiptStatusFilter;
  categorySummaries: CategorySummary[];
  directionCounts: Record<ReceiptDirection, number>;
  statusCounts: StatusCountMap;
  groups: ProjectReceiptGroup[];
};

export type ReceiptActionMode = "online" | "manual";
export type ReceiptActionState = {
  mode: ReceiptActionMode;
  item: ReceiptItem;
  group: ProjectReceiptGroup;
} | null;

export type ProactiveReceiptCustomer = {
  id: string;
  name: string;
  fullRoomName: string;
  serviceStore: string;
  areaSize?: number | null;
};

export type ProactiveFormalQuotation = {
  id: string;
  title: string;
  total_amount?: number | null;
  final_amount?: number | null;
  direct_amount?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type ProactiveCollectionRules = {
  designFeeRate?: number | string;
  paymentQrCodeUrl?: string;
  paymentQrCodeName?: string;
  paymentAccountName?: string;
  paymentQrNote?: string;
};

export type ProactiveReceiptForm = {
  record_type: "" | "deposit" | "design_fee";
  amount: string;
  receivable_amount: string;
  design_fee_mode: string;
  quotation_id: string;
  quotation_amount: string;
  design_fee_base_amount: string;
  design_fee_rate: string;
  design_fee_area: string;
  design_fee_unit_price: string;
  designer_level: string;
  received_at: string;
  payment_channel: string;
  deposit_type: string;
  is_refundable: boolean;
  receiver_name: string;
  voucher_url: string;
  notes: string;
};

export type ReversalActionState = {
  item: ReceiptLedgerItem;
  group: ProjectReceiptGroup;
} | null;

export type ApprovalActionState = {
  item: ReceiptItem;
  group: ProjectReceiptGroup;
} | null;

export const pageClass = styles.page;
export const inputControlClass = "enterprise-input h-9 px-3 text-sm outline-none transition";
export const secondaryButtonClass = "enterprise-btn-secondary inline-flex shrink-0 items-center justify-center gap-2 px-3.5 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-60";
export const tableHeaderClass = "sticky top-0 z-10 bg-[#F8FAFC] text-xs font-semibold text-[#4B5563]";
export const tableRowClass = "bg-white transition hover:bg-[#F7FAFF]";

export const collectStatusFilters: { key: ReceiptStatusFilter; label: string; icon: LucideIcon; hint: string }[] = [
  { key: "all", label: "全部", icon: WalletCards, hint: "当前分类所有工地" },
  { key: "unpaid", label: "待收款", icon: Clock3, hint: "工地还有应收但未到账" },
  { key: "collecting", label: "收款中", icon: CalendarDays, hint: "工地存在审批中、收款中或待确认款项" },
  { key: "completed", label: "已完成", icon: CheckCircle2, hint: "工地当前分类款项已完成收款" },
  { key: "voided", label: "已关闭", icon: X, hint: "收款审批被拒绝或已关闭的订单" },
];

export const refundStatusFilters: { key: ReceiptStatusFilter; label: string; icon: LucideIcon; hint: string }[] = [
  { key: "all", label: "全部退款", icon: ArrowDownLeft, hint: "当前分类下所有退款记录" },
  { key: "refund_pending_approval", label: "审核中", icon: Clock3, hint: "退款申请正在审批" },
  { key: "refund_pending_refund", label: "待打款", icon: HandCoins, hint: "审批后等待财务打款" },
  { key: "refund_paying", label: "打款中", icon: Loader2, hint: "财务正在处理打款" },
  { key: "refund_refunded", label: "退款完成", icon: CheckCircle2, hint: "已完成退款" },
  { key: "refund_rejected", label: "已关闭", icon: RotateCcw, hint: "退款审批被拒绝或已关闭" },
];

export const depositPaymentChannels = ["现金", "微信", "支付宝", "银行转账", "POS机", "其他"];
export const depositTypes = ["设计定金", "量房定金", "意向金", "合同定金", "其他"];
export const designFeeTypes = ["设计费", "平面方案设计费", "效果图设计费", "深化设计费", "其他"];
export const designFeeCalculationModes = [
  { key: "fixed", label: "固定金额" },
  { key: "quotation_ratio", label: "按报价合计比例" },
  { key: "direct_fee_ratio", label: "按直接费比例" },
  { key: "designer_level_area", label: "按设计师等级" },
];
export const designerLevelPriceOptions = [
  { level: "普通设计师", unitPrice: 80 },
  { level: "主任设计师", unitPrice: 120 },
  { level: "首席设计师", unitPrice: 180 },
  { level: "设计总监", unitPrice: 260 },
  { level: "自定义等级", unitPrice: 0 },
];

export function toMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function normalizeDesignFeeMode(value?: string | null) {
  return ["quotation_ratio", "direct_fee_ratio", "designer_level_area"].includes(String(value || "")) ? String(value) : "fixed";
}

export function isQuotationBasedDesignFeeMode(mode?: string | null) {
  return ["quotation_ratio", "direct_fee_ratio"].includes(normalizeDesignFeeMode(mode));
}

export function isAutoCalculatedDesignFeeMode(mode?: string | null) {
  return ["quotation_ratio", "direct_fee_ratio", "designer_level_area"].includes(normalizeDesignFeeMode(mode));
}

export function getDesignFeeModeLabel(mode?: string | null) {
  const normalized = normalizeDesignFeeMode(mode);
  return designFeeCalculationModes.find((item) => item.key === normalized)?.label || "固定金额";
}

export function getDesignerLevelDefaultPrice(level?: string | null) {
  return designerLevelPriceOptions.find((item) => item.level === level)?.unitPrice || 0;
}

export function getQuotationAmount(quotation?: ProactiveFormalQuotation | null) {
  return Number(quotation?.final_amount ?? quotation?.total_amount ?? 0);
}

export function getQuotationDirectAmount(quotation?: ProactiveFormalQuotation | null) {
  const amount = Number(quotation?.direct_amount || 0);
  return Number.isFinite(amount) ? toMoney(amount) : 0;
}

export function defaultProactiveReceiptForm(
  receiverName = "",
  recordType: "" | "deposit" | "design_fee" = "",
  designFeeRate: number | string = 3,
  designFeeArea: number | string = "",
): ProactiveReceiptForm {
  const isDesignFee = recordType === "design_fee";
  return {
    record_type: recordType,
    amount: "",
    receivable_amount: "",
    design_fee_mode: "fixed",
    quotation_id: "",
    quotation_amount: "",
    design_fee_base_amount: "",
    design_fee_rate: String(designFeeRate || 3),
    design_fee_area: designFeeArea ? String(designFeeArea) : "",
    design_fee_unit_price: "",
    designer_level: "",
    received_at: toDatetimeLocalValue(),
    payment_channel: "微信",
    deposit_type: isDesignFee ? "设计费" : recordType === "deposit" ? "设计定金" : "",
    is_refundable: isDesignFee,
    receiver_name: receiverName,
    voucher_url: "",
    notes: isDesignFee ? "设计费独立收取，不抵扣工程款。" : "",
  };
}

export function useDebouncedValue<T>(value: T, delay = 280) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

export function money(value: number) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

export function statusClass(tone: StatusTone) {
  if (tone === "green") return "text-emerald-700";
  if (tone === "amber") return "text-amber-700";
  if (tone === "red") return "text-red-600";
  if (tone === "blue") return "text-[#407AFF]";
  return "text-[#6f7f96]";
}

export function statusTagClass(tone: StatusTone) {
  if (tone === "green") return styles.statusGreen;
  if (tone === "amber") return styles.statusAmber;
  if (tone === "red") return styles.statusRed;
  if (tone === "blue") return styles.statusBlue;
  return styles.statusGray;
}

export function groupApprovalSteps(steps?: ReceiptApprovalStep[]) {
  const groups = new Map<number, ReceiptApprovalStep[]>();
  (Array.isArray(steps) ? steps : []).forEach((step) => {
    const order = Number(step.sortOrder || 0);
    groups.set(order, [...(groups.get(order) || []), step]);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([sortOrder, group]) => ({ sortOrder, nodeName: group[0]?.nodeName || `审批节点 ${sortOrder + 1}`, steps: group }));
}

export function getApprovalNodeStatus(steps: ReceiptApprovalStep[]) {
  if (steps.some((step) => step.status === "rejected")) return "rejected";
  if (steps.some((step) => step.status === "pending")) return "pending";
  if (steps.some((step) => step.status === "approved")) return "approved";
  if (steps.every((step) => step.status === "skipped")) return "skipped";
  return "waiting";
}

export function emptyRefundSummary(): RefundSummary {
  return {
    pendingApprovalCount: 0,
    pendingApprovalAmount: 0,
    pendingRefundCount: 0,
    pendingRefundAmount: 0,
    payingCount: 0,
    payingAmount: 0,
    refundedCount: 0,
    refundedAmount: 0,
    rejectedCount: 0,
    rejectedAmount: 0,
  };
}

export function getRefundSummary(group?: Pick<ProjectReceiptGroup, "refundSummary"> | null) {
  return group?.refundSummary || emptyRefundSummary();
}

export function getItemRefundRequest(item: ReceiptItem, requests: RefundRequestItem[]) {
  const exact = requests.find((request) => request.sourceItemId === item.id);
  if (exact) return exact;
  if (item.collectionStatus === "refund" || item.refundAmount > 0) {
    return requests.find((request) => request.status === "refunded" && request.title === item.title) || null;
  }
  return null;
}

export function getLatestPaymentAt(group: ProjectReceiptGroup) {
  return group.items.reduce<string | null>((latest, item) => {
    if (!(item.receivedAmount > 0 || item.refundAmount > 0) || !item.occurredAt) return latest;
    return !latest || item.occurredAt > latest ? item.occurredAt : latest;
  }, null);
}

export function textOrDash(value?: string | number | null) {
  const text = String(value ?? "").trim();
  return text || "-";
}

export function areaText(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${Number(value)}㎡`;
}

export function getClientAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zxgj_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
