import { NextRequest, NextResponse } from "next/server";
import { ensureChangeOrderApprovalTables } from "@/lib/changeOrderApproval";
import { getDb } from "@/lib/db";
import {
  createDepositApprovalInstance,
  ensureDepositApprovalTables,
  ensureDepositRefundApprovalTables,
  getDepositApprovalFlowForCustomer,
  getDepositApprovalMapForDeposits,
  getDepositApprovalSummary,
  prepareDepositApprovalPlan,
  promoteCustomerToDeposited,
} from "@/lib/depositApproval";
import { syncCustomerProgress } from "@/lib/customerProgress";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { beijingLocalDateTimeToUtcSql, parseAppDate, utcNowSql } from "@/lib/utils";
import { getAuthContext, hasPermission, projectBelongsToCompany } from "@/lib/security/authorization";

export const dynamic = "force-dynamic";

type ReceiptCategoryKey = "deposit" | "design_fee" | "project_payment" | "change_payment";
type CollectionStatus = "unpaid" | "collecting" | "completed" | "refund" | "voided";
type ReceiptDirection = "collect" | "refund";
type RefundStatusFilter = "refund_pending_approval" | "refund_pending_refund" | "refund_paying" | "refund_refunded" | "refund_rejected";
type ReceiptStatusFilter = CollectionStatus | RefundStatusFilter;

type ProjectBasicInfo = {
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

type ReceiptApprovalStep = {
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

type ReceiptApprovalInfo = {
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

type ReceiptItem = {
  id: string;
  categoryKey: ReceiptCategoryKey;
  categoryLabel: string;
  collectionStatus: CollectionStatus;
  statusLabel: string;
  statusTone: "green" | "amber" | "red" | "blue" | "gray";
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
  sortOrder?: number | null;
  approval?: ReceiptApprovalInfo | null;
};

type ReceiptLedgerItem = {
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
  statusTone: "green" | "amber" | "red" | "blue" | "gray";
  sourceRecordId?: string | null;
  reversalOfRecordId?: string | null;
  canReverse?: boolean;
  reversedAt?: string | null;
};

type RefundRequestStatus = "pending_approval" | "pending_refund" | "paying" | "refunded" | "rejected";

type RefundRequestItem = {
  id: string;
  groupKey: string;
  categoryKey: ReceiptCategoryKey;
  sourceItemId: string;
  title: string;
  amount: number;
  status: RefundRequestStatus;
  statusLabel: string;
  statusTone: "green" | "amber" | "red" | "blue" | "gray";
  requestedAt: string | null;
  completedAt: string | null;
  applicant: string;
  currentApprover: string;
  reason: string;
  canConfirmRefund: boolean;
};

type RefundSummary = {
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

type CategorySummary = {
  key: ReceiptCategoryKey;
  label: string;
  description: string;
  receivableAmount: number;
  receivedAmount: number;
  refundAmount: number;
  remainingAmount: number;
  statusCounts: Partial<Record<ReceiptStatusFilter | "all", number>>;
};

type RelatedReceiptOrderSummary = {
  id: string;
  title: string;
  receivableAmount: number;
  receivedAmount: number;
  refundAmount: number;
  remainingAmount: number;
  itemCount: number;
  latestAt: string | null;
  statusLabel: string;
  statusTone: "green" | "amber" | "red" | "blue" | "gray";
};

type ProjectReceiptGroup = {
  id: string;
  categoryKey: ReceiptCategoryKey;
  categoryLabel: string;
  customerId: string | null;
  customerName: string;
  projectId: string | null;
  projectName: string;
  statusLabel: string;
  statusTone: "green" | "amber" | "red" | "blue" | "gray";
  statusFlags: Record<CollectionStatus, boolean>;
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
  relatedOrderSummaries: RelatedReceiptOrderSummary[];
};

const categories: Record<ReceiptCategoryKey, { key: ReceiptCategoryKey; label: string; description: string }> = {
  deposit: {
    key: "deposit",
    label: "定金",
    description: "客户定金收款、审批中定金和退定金",
  },
  design_fee: {
    key: "design_fee",
    label: "设计费",
    description: "设计费应收、收款确认和退设计费",
  },
  project_payment: {
    key: "project_payment",
    label: "工程款",
    description: "合同收款计划的待收款、收款中和已完成",
  },
  change_payment: {
    key: "change_payment",
    label: "变更款",
    description: "变更单产生的待收、审批中和减项退款",
  },
};

const categoryOrder: ReceiptCategoryKey[] = ["deposit", "design_fee", "project_payment", "change_payment"];

const projectStatusLabels: Record<string, string> = {
  LEAD: "线索",
  DESIGNED: "已设计",
  QUOTED: "已报价",
  SIGNED: "待开工",
  CONSTRUCTION: "施工中",
  COMPLETED: "已完工",
  CLOSED: "已结案",
};

const siteStageLabels: Record<string, string> = {
  PENDING_START: "待开工",
  START_CONFIRM: "开工确认",
  CONSTRUCTION: "施工中",
  OWNER_SETTLEMENT: "业主结算",
  SITE_SETTLEMENT: "工地结算",
};

const constructionPhaseLabels: Record<string, string> = {
  DEMOLITION: "拆改",
  PLUMBING: "水电",
  MASONRY: "泥瓦",
  CARPENTRY: "木工",
  PAINTING: "油漆",
  INSTALLATION: "安装",
  DECORATION: "软装",
  INSPECTION: "验收",
};

function toMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function parseJsonObject(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

function getContractDepositDeductionAmount(content: unknown) {
  const contractContent = parseJsonObject(content);
  const amountInfo = parseJsonObject(contractContent.amount_info);
  if (amountInfo.deposit_deducted === false) return 0;
  return toMoney(amountInfo.deposit_deduct_amount);
}

function getApprovedChangeRefundTotal(db: any, projectId: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(ABS(COALESCE(amount, 0))), 0) as amount
    FROM site_change_orders
    WHERE project_id = ?
      AND deleted_at IS NULL
      AND UPPER(COALESCE(status, '')) = 'APPROVED'
      AND UPPER(COALESCE(change_type, '')) = 'DEDUCT'
  `).get(projectId) as any;
  return toMoney(row?.amount);
}

function buildProjectPaymentFinanceMap(rows: any[], changeRefundTotals: Map<string, number>) {
  const byProject = new Map<string, any[]>();
  rows.forEach((row) => {
    const projectId = String(row.project_id || "");
    if (!projectId) return;
    const list = byProject.get(projectId) || [];
    list.push(row);
    byProject.set(projectId, list);
  });

  const financeMap = new Map<string, {
    receivableAmount: number;
    receivedAmount: number;
    depositDeductionAmount: number;
    changeRefundDeductionAmount: number;
    actualReceivableAmount: number;
    refundAmount: number;
    remainingAmount: number;
    collectionStatus: CollectionStatus;
    statusLabel: string;
    statusTone: "green" | "amber" | "red" | "blue" | "gray";
  }>();

  byProject.forEach((projectRows, projectId) => {
    let remainingChangeRefund = toMoney(changeRefundTotals.get(projectId) || 0);
    const orderedRows = [...projectRows].sort((a, b) => {
      const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.due_date || a.created_at || "").localeCompare(String(b.due_date || b.created_at || ""));
    });

    orderedRows.forEach((row) => {
      const planReceivableAmount = toMoney(row.amount);
      const cashReceivedAmount = toMoney(row.received_amount);
      const refundAmount = toMoney(row.refund_amount);
      const depositDeductionAmount = row.id === row.first_plan_id ? getContractDepositDeductionAmount(row.contract_content) : 0;
      const receivableAmount = toMoney(planReceivableAmount + depositDeductionAmount);
      const receivedAmount = toMoney(cashReceivedAmount + depositDeductionAmount);
      const cashReceivableAmount = Math.max(0, toMoney(receivableAmount - depositDeductionAmount));
      const unpaidCapacity = Math.max(0, toMoney(cashReceivableAmount - cashReceivedAmount + refundAmount));
      const changeRefundDeductionAmount = Math.min(remainingChangeRefund, unpaidCapacity);
      remainingChangeRefund = toMoney(remainingChangeRefund - changeRefundDeductionAmount);
      const actualReceivableAmount = Math.max(0, toMoney(cashReceivableAmount - changeRefundDeductionAmount));
      const remainingAmount = Math.max(0, toMoney(actualReceivableAmount - cashReceivedAmount + refundAmount));
      const collectionStatus: CollectionStatus = remainingAmount <= 0 ? "completed" : receivedAmount > 0 || refundAmount > 0 ? "collecting" : "unpaid";
      const statusLabel = remainingAmount <= 0 ? "已完成" : receivedAmount > 0 || refundAmount > 0 ? "收款中" : "待收款";
      const statusTone = remainingAmount <= 0 ? "green" : receivedAmount > 0 || refundAmount > 0 ? "amber" : "red";

      financeMap.set(row.id, {
        receivableAmount,
        receivedAmount,
        depositDeductionAmount,
        changeRefundDeductionAmount,
        actualReceivableAmount,
        refundAmount,
        remainingAmount,
        collectionStatus,
        statusLabel,
        statusTone,
      });
    });
  });

  return financeMap;
}

function getProjectPaymentFinanceContextForPlan(db: any, paymentPlanId: string) {
  const current = db.prepare("SELECT project_id FROM payment_plans WHERE id = ? LIMIT 1").get(paymentPlanId) as any;
  if (!current?.project_id) return null;
  const rows = db.prepare(`
    SELECT pp.*,
      COALESCE(SUM(CASE
        WHEN pr.amount > 0 THEN pr.amount
        WHEN pr.amount < 0 AND (pr.reversal_of_record_id IS NOT NULL OR pr.pay_method = '财务冲销') THEN pr.amount
        ELSE 0
      END), 0) as received_amount,
      COALESCE(SUM(CASE
        WHEN pr.amount < 0 AND pr.reversal_of_record_id IS NULL AND COALESCE(pr.pay_method, '') <> '财务冲销' THEN ABS(pr.amount)
        ELSE 0
      END), 0) as refund_amount,
      ctt.content as contract_content,
      (
        SELECT first_plan.id
        FROM payment_plans first_plan
        WHERE first_plan.contract_id = pp.contract_id
        ORDER BY first_plan.sort_order ASC, first_plan.created_at ASC, first_plan.id ASC
        LIMIT 1
      ) as first_plan_id
    FROM payment_plans pp
    LEFT JOIN payment_records pr ON pr.payment_plan_id = pp.id
    LEFT JOIN contracts ctt ON ctt.id = pp.contract_id AND ctt.deleted_at IS NULL
    WHERE pp.project_id = ?
    GROUP BY pp.id
  `).all(current.project_id) as any[];
  const changeRefundTotals = new Map<string, number>([[String(current.project_id), getApprovedChangeRefundTotal(db, String(current.project_id))]]);
  const financeMap = buildProjectPaymentFinanceMap(rows, changeRefundTotals);
  const plan = rows.find((row) => row.id === paymentPlanId);
  const finance = financeMap.get(paymentPlanId);
  return plan && finance ? { rows, financeMap, plan, finance } : null;
}

function getProjectPaymentFinanceForPlan(db: any, paymentPlanId: string) {
  const context = getProjectPaymentFinanceContextForPlan(db, paymentPlanId);
  return context ? { plan: context.plan, finance: context.finance } : null;
}

function sortPaymentPlanRows(a: any, b: any) {
  const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
  if (orderDiff !== 0) return orderDiff;
  const dateDiff = String(a.due_date || a.created_at || "").localeCompare(String(b.due_date || b.created_at || ""));
  if (dateDiff !== 0) return dateDiff;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function getSameContractRowsFromCurrent(context: NonNullable<ReturnType<typeof getProjectPaymentFinanceContextForPlan>>) {
  const currentContractId = String(context.plan.contract_id || "");
  const currentProjectId = String(context.plan.project_id || "");
  const contractRows = context.rows
    .filter((row) => {
      if (currentContractId) return String(row.contract_id || "") === currentContractId;
      return !row.contract_id && String(row.project_id || "") === currentProjectId;
    })
    .sort(sortPaymentPlanRows);
  const currentIndex = contractRows.findIndex((row) => row.id === context.plan.id);
  return currentIndex >= 0 ? contractRows.slice(currentIndex) : [context.plan];
}

function buildProjectPaymentAllocations(
  context: NonNullable<ReturnType<typeof getProjectPaymentFinanceContextForPlan>>,
  amount: number,
) {
  const rows = getSameContractRowsFromCurrent(context);
  const payableRows = rows
    .map((row) => ({ row, finance: context.financeMap.get(row.id) }))
    .filter((item): item is { row: any; finance: NonNullable<ReturnType<typeof context.financeMap.get>> } => Boolean(item.finance));
  const totalRemainingAmount = toMoney(payableRows.reduce((sum, item) => sum + Number(item.finance.remainingAmount || 0), 0));
  let undistributedAmount = amount;
  const allocations: { row: any; finance: NonNullable<ReturnType<typeof context.financeMap.get>>; amount: number }[] = [];

  for (const item of payableRows) {
    const itemRemainingAmount = toMoney(item.finance.remainingAmount);
    if (itemRemainingAmount <= 0) continue;
    const allocationAmount = toMoney(Math.min(itemRemainingAmount, undistributedAmount));
    if (allocationAmount <= 0) continue;
    allocations.push({ row: item.row, finance: item.finance, amount: allocationAmount });
    undistributedAmount = toMoney(undistributedAmount - allocationAmount);
    if (undistributedAmount <= 0.001) break;
  }

  return {
    allocations,
    totalRemainingAmount,
    undistributedAmount: Math.max(0, toMoney(undistributedAmount)),
  };
}

function labelFrom(map: Record<string, string>, value: unknown) {
  const key = String(value || "").trim();
  if (!key) return null;
  return map[key] || key;
}

function normalizeRoomPart(value: unknown, suffixes: string[]) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

function buildFullRoomName(row: any) {
  const community = String(row.customer_address || row.project_address || "").trim();
  if (row.customer_no_room_number === true || row.customer_no_room_number === 1) {
    return community || "暂无房号";
  }
  const building = normalizeRoomPart(row.customer_building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(row.customer_unit_no, ["单元"]);
  const room = normalizeRoomPart(row.customer_room_no, ["室", "房", "号"]);
  const roomNumber = [building, unit, room].filter(Boolean).join("-");
  if (community && roomNumber) return `${community}${roomNumber}`;
  if (community) return community;
  return String(row.customer_house_address || row.project_name || "").trim() || null;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRangeBounds(range: string) {
  if (range === "all") return { key: range, start: null as string | null, end: null as string | null, label: "全部时间" };
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const start = new Date(now);
  let label = "近30天";

  if (range === "thisMonth") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    label = "本月";
  } else if (range === "thisYear") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    label = "本年";
  } else {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }

  return { key: range, start: toDateKey(start), end: toDateKey(end), label };
}

function appendDateWhere(where: string[], params: unknown[], expression: string, range: ReturnType<typeof getRangeBounds>) {
  if (range.start) {
    where.push(`${expression} >= ?`);
    params.push(range.start);
  }
  if (range.end) {
    where.push(`${expression} < ?`);
    params.push(range.end);
  }
}

function normalizeLegacyBeijingLocalDateTime(value: unknown, createdAt?: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const createdDate = parseAppDate(String(createdAt || "").trim());
  const valueAsUtcDate = parseAppDate(text);
  if (createdDate && valueAsUtcDate) {
    const offsetMs = valueAsUtcDate.getTime() - createdDate.getTime();
    const isLikelyLegacyBeijingInput = offsetMs >= 7.5 * 60 * 60 * 1000 && offsetMs <= 8.5 * 60 * 60 * 1000;
    if (isLikelyLegacyBeijingInput) return beijingLocalDateTimeToUtcSql(text);
  }
  return text;
}

function normalizedPaymentRecordTimeSql(alias = "pr") {
  return `COALESCE(
    CASE
      WHEN ${alias}.pay_date IS NOT NULL
        AND ${alias}.created_at IS NOT NULL
        AND ABS(strftime('%s', ${alias}.pay_date) - strftime('%s', ${alias}.created_at) - 28800) <= 1800
      THEN datetime(${alias}.pay_date, '-8 hours')
      ELSE ${alias}.pay_date
    END,
    ${alias}.created_at
  )`;
}

function normalizeCategory(value: string | null): ReceiptCategoryKey {
  return categoryOrder.includes(value as ReceiptCategoryKey) ? value as ReceiptCategoryKey : "deposit";
}

function normalizeDirection(value: string | null): ReceiptDirection {
  return value === "refund" ? "refund" : "collect";
}

function normalizeStatus(value: string | null): ReceiptStatusFilter | "all" {
  if (
    [
      "unpaid",
      "collecting",
      "completed",
      "refund",
      "voided",
      "refund_pending_approval",
      "refund_pending_refund",
      "refund_paying",
      "refund_refunded",
      "refund_rejected",
    ].includes(String(value || ""))
  ) {
    return value as ReceiptStatusFilter;
  }
  return "all";
}

function getDepositCategory(recordType: unknown): ReceiptCategoryKey {
  return String(recordType || "deposit") === "design_fee" ? "design_fee" : "deposit";
}

function getRefundedAmount(row: any) {
  const approvedRefund = toMoney(row.approved_refund_amount);
  if (approvedRefund > 0) return approvedRefund;
  if (["refunded", "partial_refunded"].includes(String(row.refund_status || ""))) return toMoney(row.refund_amount);
  return 0;
}

function getPendingRefundAmount(row: any) {
  if (["pending", "pending_approval", "pending_refund", "approved", "paying", "refunding", "processing"].includes(String(row.refund_status || ""))) return toMoney(row.refund_amount);
  return 0;
}

function getPendingRefundRequestStatus(row: any): Exclude<RefundRequestStatus, "refunded" | "rejected"> {
  const status = String(row.refund_status || "");
  if (status === "pending_approval") return "pending_approval";
  if (["paying", "refunding", "processing"].includes(status)) return "paying";
  return "pending_refund";
}

function getPendingRefundStatusMeta(status: RefundRequestStatus) {
  if (status === "pending_approval") return { statusLabel: "审核中", statusTone: "amber" as const, currentApproverFallback: "待审批人处理" };
  if (status === "paying") return { statusLabel: "打款中", statusTone: "blue" as const, currentApproverFallback: "财务打款中" };
  return { statusLabel: "待打款", statusTone: "red" as const, currentApproverFallback: "财务" };
}

function getDepositStatus(row: any): Pick<ReceiptItem, "collectionStatus" | "statusLabel" | "statusTone"> {
  const status = String(row.status || "received");
  const receivedAmount = toMoney(row.amount);
  const receivableAmount = toMoney(row.receivable_amount || row.amount);
  if (status === "pending") {
    return { collectionStatus: "unpaid", statusLabel: "待收款", statusTone: "red" };
  }
  if (status === "pending_approval") {
    return { collectionStatus: "collecting", statusLabel: "收款中", statusTone: "amber" };
  }
  if (status === "received") {
    const remainingAmount = Math.max(0, toMoney(receivableAmount - receivedAmount));
    if (receivedAmount <= 0 && receivableAmount > 0) {
      return { collectionStatus: "unpaid", statusLabel: "待收款", statusTone: "red" };
    }
    if (remainingAmount > 0) {
      return { collectionStatus: "collecting", statusLabel: "收款中", statusTone: "amber" };
    }
    return { collectionStatus: "completed", statusLabel: "已完成", statusTone: "green" };
  }
  if (status === "rejected") return { collectionStatus: "voided", statusLabel: "已关闭", statusTone: "gray" };
  return { collectionStatus: "collecting", statusLabel: "收款中", statusTone: "amber" };
}

function getApprovalLabel(status: unknown) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "已通过";
  if (normalized === "rejected") return "已驳回";
  if (normalized === "pending") return "待审批";
  if (normalized === "waiting") return "未开始";
  if (normalized === "skipped") return "已跳过";
  return "未开始";
}

function buildReceiptApprovalInfo(approval: any): ReceiptApprovalInfo | null {
  const summary = getDepositApprovalSummary(approval);
  if (!summary) return null;
  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  return {
    id: String(summary.id || ""),
    status: String(summary.status || ""),
    statusLabel: getApprovalLabel(summary.status),
    flowName: String(summary.flow_name || ""),
    currentNodeName: String(summary.current_node_name || ""),
    currentApprovers: Array.isArray(summary.current_approvers) ? summary.current_approvers.map(String) : [],
    approvedNodes: Number(summary.approved_nodes || 0),
    totalNodes: Number(summary.total_nodes || 0),
    createdAt: summary.created_at || null,
    updatedAt: summary.updated_at || null,
    completedAt: summary.completed_at || null,
    errorMessage: String(summary.error_message || ""),
    steps: steps.map((step: any) => ({
      id: String(step.id || ""),
      nodeName: String(step.node_name || ""),
      sortOrder: Number(step.sort_order || 0),
      approverId: String(step.approver_id || ""),
      approverAvatar: step.approver_avatar || null,
      approverName: String(step.approver_name || ""),
      approveMode: String(step.approve_mode || "any"),
      canReject: step.can_reject !== 0 && step.can_reject !== false,
      status: String(step.status || ""),
      statusLabel: getApprovalLabel(step.status),
      comment: String(step.comment || ""),
      actionAt: step.action_at || null,
      signatureName: step.signature_name || null,
      signatureSignerName: step.signature_signer_name || null,
      signatureSignedAt: step.signature_signed_at || null,
      signatureUrl: step.signature_url || null,
    })),
  };
}

function pickDepositReceiptApproval(approvalBundle: any) {
  if (!approvalBundle) return null;
  if (approvalBundle.instance) return approvalBundle;
  if (approvalBundle.initial) return approvalBundle.initial;
  if (Array.isArray(approvalBundle.topUps) && approvalBundle.topUps.length > 0) {
    return approvalBundle.topUps[0];
  }
  return null;
}

function normalizeRecordType(value: unknown): "deposit" | "design_fee" {
  return String(value || "").trim() === "design_fee" ? "design_fee" : "deposit";
}

function getPaymentLabel(record: any) {
  return normalizeRecordType(record?.record_type) === "design_fee" ? "设计费" : "定金";
}

function getPendingDepositTopUpApprovalAmount(db: ReturnType<typeof getDb>, depositId: string) {
  ensureDepositApprovalTables(db);
  const row = db.prepare(`
    SELECT COALESCE(SUM(approval_amount), 0) as amount
    FROM deposit_approval_instances
    WHERE deposit_id = ?
      AND status = 'pending'
      AND deleted_at IS NULL
      AND approval_kind = 'top_up'
  `).get(depositId) as any;
  return toMoney(row?.amount);
}

function getDepositReceiptBlockedMessage(record: any) {
  const label = getPaymentLabel(record);
  const refundLabel = normalizeRecordType(record?.record_type) === "design_fee" ? "退设计费" : "退定金";
  const status = String(record.status || "");
  if (!["received", "pending"].includes(status)) {
    if (status === "pending_approval") return `该${label}正在收款审批中，暂不允许重复收款`;
    if (status === "rejected") return `该${label}已关闭，请先在客户详情中处理`;
    return `当前${label}状态不支持收款`;
  }
  if (record.approval_status === "pending") return `该${label}已有收款审批进行中，暂不允许重复收款`;
  if (record.refund_status === "pending_approval" || record.refund_status === "pending") return `该${label}正在${refundLabel}流程中，暂不允许收款`;
  if (["partial_refunded", "refunded", "rejected"].includes(String(record.refund_status || ""))) return `该${label}已有${refundLabel}记录，暂不允许收款`;
  if (record.waiver_status === "pending_approval") return `该${label}尾款减免审批中，暂不允许收款`;
  if (record.waiver_status === "approved") return `该${label}已有尾款减免，暂不允许收款`;
  return "";
}

function formatReceiptAmount(value: number) {
  return toMoney(value).toFixed(2);
}

function getChangeStatus(row: any): Pick<ReceiptItem, "collectionStatus" | "statusLabel" | "statusTone"> {
  const status = String(row.status || "").toUpperCase();
  const isDeduct = String(row.change_type || "").toUpperCase() === "DEDUCT";
  if (status === "APPROVED" && isDeduct) return { collectionStatus: "refund", statusLabel: "减项退款", statusTone: "red" };
  if (status === "APPROVED") return { collectionStatus: "unpaid", statusLabel: "待收款", statusTone: "blue" };
  if (status === "PENDING_APPROVAL" || status === "PENDING_OWNER") return { collectionStatus: "collecting", statusLabel: "收款中", statusTone: "amber" };
  if (status === "REJECTED" || status === "CANCELLED") return { collectionStatus: "voided", statusLabel: "已关闭", statusTone: "gray" };
  return { collectionStatus: "collecting", statusLabel: "收款中", statusTone: "amber" };
}

function normalizeMethod(row: any) {
  if (row.method === "qr") return "扫码支付";
  return row.payment_channel || row.pay_method || row.method || "-";
}

function makeBasicInfo(row: any): ProjectBasicInfo {
  return {
    projectAddress: row.project_address || null,
    fullRoomName: buildFullRoomName(row),
    area: row.project_area != null && Number.isFinite(Number(row.project_area)) ? Number(row.project_area) : null,
    serviceStore: row.service_store || null,
    designerName: row.designer_name || null,
    managerName: row.manager_name || null,
    projectStatus: labelFrom(projectStatusLabels, row.project_status),
    siteStage: labelFrom(siteStageLabels, row.site_stage),
    currentPhase: labelFrom(constructionPhaseLabels, row.current_phase),
    startDate: row.start_date || null,
    plannedEndDate: row.planned_end_date || null,
  };
}

function makeEmptyRefundSummary(): RefundSummary {
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

function addRefundRequestToSummary(summary: RefundSummary, request: RefundRequestItem) {
  if (request.status === "pending_approval") {
    summary.pendingApprovalCount += 1;
    summary.pendingApprovalAmount = toMoney(summary.pendingApprovalAmount + request.amount);
  } else if (request.status === "pending_refund") {
    summary.pendingRefundCount += 1;
    summary.pendingRefundAmount = toMoney(summary.pendingRefundAmount + request.amount);
  } else if (request.status === "paying") {
    summary.payingCount += 1;
    summary.payingAmount = toMoney(summary.payingAmount + request.amount);
  } else if (request.status === "refunded") {
    summary.refundedCount += 1;
    summary.refundedAmount = toMoney(summary.refundedAmount + request.amount);
  } else if (request.status === "rejected") {
    summary.rejectedCount += 1;
    summary.rejectedAmount = toMoney(summary.rejectedAmount + request.amount);
  }
}

function hasRefundProcess(summary?: RefundSummary | null) {
  if (!summary) return false;
  return summary.pendingApprovalCount > 0
    || summary.pendingRefundCount > 0
    || summary.payingCount > 0
    || summary.refundedCount > 0
    || summary.rejectedCount > 0;
}

function groupHasCollectDirection(group: ProjectReceiptGroup) {
  return group.items.some((item) => (
    item.collectionStatus === "voided"
    || (item.collectionStatus !== "refund" && (
      item.receivableAmount > 0
      || item.receivedAmount > 0
      || item.remainingAmount > 0
      || item.collectionStatus === "unpaid"
      || item.collectionStatus === "collecting"
      || item.collectionStatus === "completed"
    ))
  ));
}

function groupHasRefundDirection(group: ProjectReceiptGroup) {
  return group.statusFlags.refund
    || group.refundAmount > 0
    || hasRefundProcess(group.refundSummary)
    || group.items.some((item) => item.collectionStatus === "refund" || item.refundAmount > 0)
    || group.ledgerItems.some((item) => item.direction === "refund");
}

function getSitePaymentKey(group: ProjectReceiptGroup) {
  const roomText = group.basicInfo?.fullRoomName || group.basicInfo?.projectAddress || group.projectName;
  const roomKey = normalizeGroupPart(roomText && roomText !== "暂无房号" ? roomText : group.projectName || group.projectId);
  const customerKey = normalizeGroupPart(group.customerId || group.customerName);
  return `${customerKey || "unknown"}-${roomKey || normalizeGroupPart(group.projectId) || "unknown"}`;
}

function makeRelatedOrderSummary(group: ProjectReceiptGroup): RelatedReceiptOrderSummary {
  return {
    id: group.id,
    title: group.items[0]?.title || group.categoryLabel,
    receivableAmount: group.receivableAmount,
    receivedAmount: group.receivedAmount,
    refundAmount: group.refundAmount,
    remainingAmount: group.remainingAmount,
    itemCount: group.itemCount,
    latestAt: group.latestAt,
    statusLabel: group.statusLabel,
    statusTone: group.statusTone,
  };
}

function attachRelatedOrderSummaries(groups: ProjectReceiptGroup[]) {
  const relatedGroups = new Map<string, ProjectReceiptGroup[]>();
  groups.forEach((group) => {
    const key = `${getSitePaymentKey(group)}-${group.categoryKey}`;
    relatedGroups.set(key, [...(relatedGroups.get(key) || []), group]);
  });

  relatedGroups.forEach((sameTypeGroups) => {
    const summaries = sameTypeGroups
      .map(makeRelatedOrderSummary)
      .sort((a, b) => String(b.latestAt || "").localeCompare(String(a.latestAt || "")));
    sameTypeGroups.forEach((group) => {
      group.relatedOrderSummaries = summaries.filter((item) => item.id !== group.id);
    });
  });
}

function makeCategorySummaries(groups: ProjectReceiptGroup[]) {
  const summaries = new Map<ReceiptCategoryKey, CategorySummary>(
    categoryOrder.map((key) => [
      key,
      {
        ...categories[key],
        receivableAmount: 0,
        receivedAmount: 0,
        refundAmount: 0,
        remainingAmount: 0,
        statusCounts: { all: 0, unpaid: 0, collecting: 0, completed: 0, refund: 0, voided: 0 },
      },
    ]),
  );

  groups.forEach((group) => {
    const summary = summaries.get(group.categoryKey);
    if (!summary) return;
    summary.receivableAmount = toMoney(summary.receivableAmount + group.receivableAmount);
    summary.receivedAmount = toMoney(summary.receivedAmount + group.receivedAmount);
    summary.refundAmount = toMoney(summary.refundAmount + group.refundAmount);
    summary.remainingAmount = toMoney(summary.remainingAmount + group.remainingAmount);
    summary.statusCounts.all = (summary.statusCounts.all || 0) + 1;
    (["unpaid", "collecting", "completed", "refund", "voided"] as CollectionStatus[]).forEach((statusKey) => {
      if (group.statusFlags[statusKey]) summary.statusCounts[statusKey] = (summary.statusCounts[statusKey] || 0) + 1;
    });
  });

  return categoryOrder.map((key) => summaries.get(key) as CategorySummary);
}

function matchesGroupSearch(group: ProjectReceiptGroup, search: string) {
  if (!search) return true;
  const haystack = [
    group.customerName,
    group.projectName,
    group.basicInfo.fullRoomName,
    group.basicInfo.designerName,
    group.basicInfo.managerName,
    group.basicInfo.serviceStore,
    group.statusLabel,
    group.operator,
    ...group.items.flatMap((item) => [item.title, item.flowLabel, item.method, item.note, item.statusLabel]),
    ...group.ledgerItems.flatMap((item) => [item.title, item.flowLabel, item.method, item.operator, item.receiptVoucher, item.note, item.statusLabel]),
    ...group.refundRequests.flatMap((item) => [item.title, item.statusLabel, item.applicant, item.currentApprover, item.reason]),
  ].join(" ");
  return haystack.toLowerCase().includes(search.toLowerCase());
}

function sortItems(a: ReceiptItem, b: ReceiptItem) {
  if (a.categoryKey === "project_payment" && b.categoryKey === "project_payment") {
    const aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    const orderDiff = aOrder - bOrder;
    if (orderDiff !== 0) return orderDiff;
  }
  return String(b.occurredAt || b.dueDate || "").localeCompare(String(a.occurredAt || a.dueDate || ""));
}

function normalizeGroupPart(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

type ProjectPaymentGroupSource = Pick<ReceiptItem, "categoryKey" | "customerId" | "customerName" | "projectId"> & {
  id?: string | null;
  projectName?: string | null;
  basicInfo?: Pick<ProjectBasicInfo, "fullRoomName" | "projectAddress"> | null;
};

function makeReceiptOrderGroupKey(categoryKey: ReceiptCategoryKey, recordId: unknown) {
  return `${categoryKey}-order-${String(recordId || "unknown")}`;
}

function getDepositDesignOrderGroupKey(item: ProjectPaymentGroupSource) {
  const categoryKey = item.categoryKey;
  const id = String(item.id || "");
  const refundPrefix = `${categoryKey}-refund-`;
  const collectPrefix = `${categoryKey}-`;
  if (id.startsWith(refundPrefix)) return makeReceiptOrderGroupKey(categoryKey, id.slice(refundPrefix.length));
  if (id.startsWith(collectPrefix)) return makeReceiptOrderGroupKey(categoryKey, id.slice(collectPrefix.length));
  return makeReceiptOrderGroupKey(categoryKey, item.projectId || item.customerId || item.customerName);
}

function getProjectPaymentGroupKey(item: ProjectPaymentGroupSource) {
  const customerKey = normalizeGroupPart(item.customerId || item.customerName);
  const roomText = item.basicInfo?.fullRoomName || item.basicInfo?.projectAddress || item.projectName;
  const roomKey = normalizeGroupPart(roomText && roomText !== "暂无房号" ? roomText : item.projectName || item.projectId);
  return `${item.categoryKey}-${customerKey || "unknown"}-${roomKey || "unknown"}`;
}

function getGroupKey(item: ReceiptItem) {
  if (item.categoryKey === "deposit" || item.categoryKey === "design_fee") return getDepositDesignOrderGroupKey(item);
  if (item.categoryKey === "project_payment") return getProjectPaymentGroupKey(item);
  return `${item.categoryKey}-${item.projectId || item.customerId || item.customerName || "unknown"}`;
}

function updateGroupLatestAt(group: Pick<ProjectReceiptGroup, "latestAt">, occurredAt: string | null | undefined) {
  if (occurredAt && (!group.latestAt || occurredAt > group.latestAt)) group.latestAt = occurredAt;
}

function getLedgerGroupKey(item: ProjectPaymentGroupSource) {
  if (item.categoryKey === "deposit" || item.categoryKey === "design_fee") return getDepositDesignOrderGroupKey(item);
  if (item.categoryKey === "project_payment") return getProjectPaymentGroupKey(item);
  return `${item.categoryKey}-${item.projectId || item.customerId || item.customerName || "unknown"}`;
}

function sortLedgerItems(a: ReceiptLedgerItem, b: ReceiptLedgerItem, allItems: ReceiptLedgerItem[] = []) {
  const bySourceId = new Map(allItems.map((item) => [item.sourceRecordId, item]));
  const getGroupId = (item: ReceiptLedgerItem) => item.reversalOfRecordId || item.sourceRecordId || item.id;
  const getGroupTime = (item: ReceiptLedgerItem) => {
    const original = item.reversalOfRecordId ? bySourceId.get(item.reversalOfRecordId) : item;
    return original?.occurredAt || item.occurredAt || "";
  };

  const groupTimeDiff = String(getGroupTime(b)).localeCompare(String(getGroupTime(a)));
  if (groupTimeDiff !== 0) return groupTimeDiff;

  const groupIdDiff = String(getGroupId(a)).localeCompare(String(getGroupId(b)));
  if (groupIdDiff !== 0) return groupIdDiff;

  const typeWeight = (item: ReceiptLedgerItem) => item.reversalOfRecordId ? 1 : 0;
  const typeDiff = typeWeight(a) - typeWeight(b);
  if (typeDiff !== 0) return typeDiff;

  return String(b.occurredAt || "").localeCompare(String(a.occurredAt || ""));
}

function getGroupStatus(group: Pick<ProjectReceiptGroup, "receivedAmount" | "refundAmount" | "remainingAmount" | "items" | "refundSummary">) {
  const hasCollecting = group.items.some((item) => item.collectionStatus === "collecting");
  const hasUnpaid = group.items.some((item) => item.collectionStatus === "unpaid");
  const hasCompleted = group.items.some((item) => item.collectionStatus === "completed");
  const hasVoided = group.items.some((item) => item.collectionStatus === "voided");
  const hasRefund = group.refundAmount > 0 || group.items.some((item) => item.collectionStatus === "refund") || hasRefundProcess(group.refundSummary);
  const statusFlags: Record<CollectionStatus, boolean> = {
    unpaid: group.remainingAmount > 0 && group.receivedAmount <= 0 && (hasUnpaid || !hasCollecting),
    collecting: hasCollecting || (group.remainingAmount > 0 && group.receivedAmount > 0),
    completed: group.remainingAmount <= 0 && group.receivedAmount > 0 && hasCompleted,
    refund: hasRefund,
    voided: hasVoided,
  };

  if (statusFlags.collecting) return { statusFlags, statusLabel: "收款中", statusTone: "amber" as const };
  if (statusFlags.unpaid) return { statusFlags, statusLabel: "待收款", statusTone: "red" as const };
  if (statusFlags.refund) return { statusFlags, statusLabel: "有退款", statusTone: "red" as const };
  if (statusFlags.completed) return { statusFlags, statusLabel: "已完成", statusTone: "green" as const };
  if (statusFlags.voided) return { statusFlags, statusLabel: "已关闭", statusTone: "gray" as const };
  return { statusFlags, statusLabel: "收款中", statusTone: "amber" as const };
}

function makeProjectGroups(items: ReceiptItem[], ledgerItems: ReceiptLedgerItem[], refundRequests: RefundRequestItem[]) {
  const map = new Map<string, ProjectReceiptGroup>();
  items.forEach((item) => {
    const key = getGroupKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        id: key,
        categoryKey: item.categoryKey,
        categoryLabel: item.categoryLabel,
        customerId: item.customerId,
        customerName: item.customerName,
        projectId: item.projectId,
        projectName: item.projectName,
        statusLabel: "收款中",
        statusTone: "amber",
        statusFlags: { unpaid: false, collecting: false, completed: false, refund: false, voided: false },
        receivableAmount: 0,
        receivedAmount: 0,
        refundAmount: 0,
        remainingAmount: 0,
        itemCount: 0,
        latestAt: null,
        nextDueDate: null,
        operator: "-",
        basicInfo: item.basicInfo,
        items: [],
        ledgerItems: [],
        refundRequests: [],
        refundSummary: makeEmptyRefundSummary(),
        relatedOrderSummaries: [],
      });
    }
    const group = map.get(key) as ProjectReceiptGroup;
    group.receivableAmount = toMoney(group.receivableAmount + item.receivableAmount);
    group.receivedAmount = toMoney(group.receivedAmount + item.receivedAmount);
    group.refundAmount = toMoney(group.refundAmount + item.refundAmount);
    group.remainingAmount = toMoney(group.remainingAmount + item.remainingAmount);
    group.itemCount += 1;
    if (item.operator && item.operator !== "-") group.operator = item.operator;
    const itemLatest = item.occurredAt || item.dueDate;
    updateGroupLatestAt(group, itemLatest);
    if (item.dueDate && item.remainingAmount > 0 && (!group.nextDueDate || item.dueDate < group.nextDueDate)) group.nextDueDate = item.dueDate;
    group.items.push(item);
  });

  ledgerItems.forEach((ledger) => {
    const group = map.get(ledger.groupKey);
    if (!group) return;
    group.ledgerItems.push(ledger);
    updateGroupLatestAt(group, ledger.occurredAt);
  });

  refundRequests.forEach((request) => {
    const group = map.get(request.groupKey);
    if (!group) return;
    group.refundRequests.push(request);
    updateGroupLatestAt(group, request.completedAt || request.requestedAt);
    addRefundRequestToSummary(group.refundSummary, request);
  });

  return Array.from(map.values()).map((group) => {
    group.items.sort(sortItems);
    group.ledgerItems.sort((a, b) => sortLedgerItems(a, b, group.ledgerItems));
    group.refundRequests.sort((a, b) => String(b.completedAt || b.requestedAt || "").localeCompare(String(a.completedAt || a.requestedAt || "")));
    const statusInfo = getGroupStatus(group);
    return {
      ...group,
      statusLabel: statusInfo.statusLabel,
      statusTone: statusInfo.statusTone,
      statusFlags: statusInfo.statusFlags,
    };
  });
}

function groupMatchesStatus(group: ProjectReceiptGroup, status: CollectionStatus | "all") {
  if (status === "all") return true;
  if (status === "refund") return groupHasRefundDirection(group);
  return Boolean(group.statusFlags[status]);
}

function groupMatchesRefundStatus(group: ProjectReceiptGroup, status: ReceiptStatusFilter | "all") {
  const summary = group.refundSummary;
  if (!groupHasRefundDirection(group)) return false;
  if (status === "all" || status === "refund") return true;
  if (status === "refund_pending_approval") return summary.pendingApprovalCount > 0;
  if (status === "refund_pending_refund") return summary.pendingRefundCount > 0;
  if (status === "refund_paying") return summary.payingCount > 0;
  if (status === "refund_refunded") {
    return summary.refundedCount > 0
      || group.refundAmount > 0
      || group.items.some((item) => item.collectionStatus === "refund" || item.refundAmount > 0)
      || group.ledgerItems.some((item) => item.direction === "refund");
  }
  if (status === "refund_rejected") return summary.rejectedCount > 0;
  return true;
}

function groupMatchesDirectionStatus(group: ProjectReceiptGroup, direction: ReceiptDirection, status: ReceiptStatusFilter | "all") {
  if (direction === "refund") return groupMatchesRefundStatus(group, status);
  if (!groupHasCollectDirection(group)) return false;
  if (status === "all") return true;
  if (["refund_pending_approval", "refund_pending_refund", "refund_paying", "refund_refunded", "refund_rejected"].includes(status)) {
    return true;
  }
  return groupMatchesStatus(group, status as CollectionStatus | "all");
}

function makeStatusCounts(groups: ProjectReceiptGroup[], direction: ReceiptDirection) {
  const counts: Partial<Record<ReceiptStatusFilter | "all", number>> = {
    all: 0,
    unpaid: 0,
    collecting: 0,
    completed: 0,
    refund: 0,
    voided: 0,
    refund_pending_approval: 0,
    refund_pending_refund: 0,
    refund_paying: 0,
    refund_refunded: 0,
    refund_rejected: 0,
  };

  if (direction === "refund") {
    groups.forEach((group) => {
      if (!groupHasRefundDirection(group)) return;
      counts.all = (counts.all || 0) + 1;
      if (group.refundSummary.pendingApprovalCount > 0) counts.refund_pending_approval = (counts.refund_pending_approval || 0) + 1;
      if (group.refundSummary.pendingRefundCount > 0) counts.refund_pending_refund = (counts.refund_pending_refund || 0) + 1;
      if (group.refundSummary.payingCount > 0) counts.refund_paying = (counts.refund_paying || 0) + 1;
      if (
        group.refundSummary.refundedCount > 0
        || group.refundAmount > 0
        || group.items.some((item) => item.collectionStatus === "refund" || item.refundAmount > 0)
        || group.ledgerItems.some((item) => item.direction === "refund")
      ) {
        counts.refund_refunded = (counts.refund_refunded || 0) + 1;
      }
      if (group.refundSummary.rejectedCount > 0) counts.refund_rejected = (counts.refund_rejected || 0) + 1;
    });
    counts.refund = counts.all || 0;
    return counts;
  }

  groups.forEach((group) => {
    if (!groupHasCollectDirection(group)) return;
    counts.all = (counts.all || 0) + 1;
    (["unpaid", "collecting", "completed", "refund", "voided"] as CollectionStatus[]).forEach((statusKey) => {
      if (group.statusFlags[statusKey]) counts[statusKey] = (counts[statusKey] || 0) + 1;
    });
  });
  return counts;
}

function makeDirectionCounts(groups: ProjectReceiptGroup[]) {
  return {
    collect: groups.filter(groupHasCollectDirection).length,
    refund: groups.filter(groupHasRefundDirection).length,
  };
}

function getRefundSortWeight(group: ProjectReceiptGroup) {
  const summary = group.refundSummary;
  if (summary.pendingApprovalCount > 0) return 0;
  if (summary.pendingRefundCount > 0) return 1;
  if (summary.payingCount > 0) return 2;
  if (summary.refundedCount > 0) return 3;
  if (summary.rejectedCount > 0) return 4;
  return 5;
}

function getGroupSortTime(group: Pick<ProjectReceiptGroup, "latestAt" | "nextDueDate">) {
  return String(group.latestAt || group.nextDueDate || "");
}

function compareGroupsByLatest(a: ProjectReceiptGroup, b: ProjectReceiptGroup) {
  return getGroupSortTime(b).localeCompare(getGroupSortTime(a));
}

function sortGroups(a: ProjectReceiptGroup, b: ProjectReceiptGroup) {
  const timeDiff = compareGroupsByLatest(a, b);
  if (timeDiff !== 0) return timeDiff;

  const statusWeight: Record<string, number> = { collecting: 0, unpaid: 1, refund: 2, completed: 3, voided: 4, gray: 5 };
  const aKey = a.statusFlags.collecting ? "collecting" : a.statusFlags.unpaid ? "unpaid" : a.statusFlags.refund ? "refund" : a.statusFlags.completed ? "completed" : a.statusFlags.voided ? "voided" : "gray";
  const bKey = b.statusFlags.collecting ? "collecting" : b.statusFlags.unpaid ? "unpaid" : b.statusFlags.refund ? "refund" : b.statusFlags.completed ? "completed" : b.statusFlags.voided ? "voided" : "gray";
  const statusDiff = statusWeight[aKey] - statusWeight[bKey];
  if (statusDiff !== 0) return statusDiff;
  return String(a.id).localeCompare(String(b.id));
}

export async function GET(request: NextRequest) {
  const auth = getAuthContext(request);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "finance.view")) return NextResponse.json({ message: "没有财务查看权限" }, { status: 403 });
  const db = getDb();
  ensureDepositRefundApprovalTables(db);
  ensureChangeOrderApprovalTables(db);

  const { searchParams } = new URL(request.url);
  const category = normalizeCategory(searchParams.get("category"));
  const direction = normalizeDirection(searchParams.get("direction"));
  const status = normalizeStatus(searchParams.get("status"));
  const search = String(searchParams.get("search") || "").trim();
  const range = getRangeBounds(searchParams.get("range") || "all");
  const items: ReceiptItem[] = [];
  const ledgerItems: ReceiptLedgerItem[] = [];
  const refundRequests: RefundRequestItem[] = [];

  const depositWhere = ["d.company_id = ?", "d.deleted_at IS NULL"];
  const depositParams: unknown[] = [auth.companyId];
  appendDateWhere(depositWhere, depositParams, "COALESCE(d.received_at, d.created_at)", range);

  const depositRows = db.prepare(`
    SELECT d.*, c.name as customer_name, c.service_store,
      c.address as customer_address, c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      p.id as project_id, p.name as project_name, p.address as project_address, p.area as project_area,
      p.status as project_status, p.site_stage, p.current_phase, p.start_date, p.planned_end_date,
      manager.name as manager_name,
      creator.name as created_by_name,
      (
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_name,
      refund_requester.name as refund_requester_name,
      (
        SELECT GROUP_CONCAT(step.approver_name, '、')
        FROM deposit_refund_approval_instances instance
        INNER JOIN deposit_refund_approval_steps step ON step.instance_id = instance.id
        WHERE instance.deposit_id = d.id
          AND instance.deleted_at IS NULL
          AND step.deleted_at IS NULL
          AND instance.status = 'pending'
          AND step.status = 'pending'
      ) as refund_current_approvers,
      COALESCE(refund.approved_refund_amount, 0) as approved_refund_amount
    FROM customer_deposit_records d
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN projects p ON p.id = (
      SELECT p2.id FROM projects p2
      WHERE p2.customer_id = d.customer_id AND p2.deleted_at IS NULL
      ORDER BY p2.created_at DESC, p2.id DESC
      LIMIT 1
    )
    LEFT JOIN users manager ON manager.id = p.manager_id
    LEFT JOIN users creator ON creator.id = d.created_by_id
    LEFT JOIN users refund_requester ON refund_requester.id = d.refund_requested_by_id
    LEFT JOIN (
      SELECT deposit_id, COALESCE(SUM(refund_amount), 0) as approved_refund_amount
      FROM deposit_refund_approval_instances
      WHERE status = 'approved' AND deleted_at IS NULL
      GROUP BY deposit_id
    ) refund ON refund.deposit_id = d.id
    WHERE ${depositWhere.join(" AND ")}
    ORDER BY COALESCE(d.received_at, d.created_at) DESC, d.id DESC
    LIMIT 1000
  `).all(...depositParams) as any[];

  const depositApprovalMap = getDepositApprovalMapForDeposits(db, depositRows.map((row) => String(row.id)).filter(Boolean));

  depositRows.forEach((row) => {
    const categoryKey = getDepositCategory(row.record_type);
    const categoryLabel = categories[categoryKey].label;
    const refundedAmount = getRefundedAmount(row);
    const pendingRefundAmount = getPendingRefundAmount(row);
    const receivableAmount = toMoney(row.receivable_amount || row.amount);
    const paidAmount = row.status === "received" ? toMoney(row.amount) : 0;
    const statusInfo = getDepositStatus(row);
    const isClosed = statusInfo.collectionStatus === "voided";
    const happenedAt = normalizeLegacyBeijingLocalDateTime(row.received_at, row.created_at) || row.created_at;
    const basicInfo = makeBasicInfo(row);
    const approval = buildReceiptApprovalInfo(pickDepositReceiptApproval(depositApprovalMap.get(String(row.id))));
    const sourceItemId = `${categoryKey}-${row.id}`;
    const ledgerBase = {
      id: sourceItemId,
      categoryKey,
      customerId: row.customer_id || null,
      customerName: row.customer_name || "-",
      projectId: row.project_id || null,
    };
    const groupKey = getLedgerGroupKey(ledgerBase);
    const refundTitle = row.record_type === "design_fee" ? "退设计费" : "退定金";

    items.push({
      id: sourceItemId,
      categoryKey,
      categoryLabel,
      ...statusInfo,
      flowLabel: "收款",
      customerId: row.customer_id || null,
      customerName: row.customer_name || "-",
      projectId: row.project_id || null,
      projectName: row.project_name || row.project_address || row.service_store || "-",
      title: row.deposit_type || `${categoryLabel}收款`,
      receivableAmount,
      receivedAmount: paidAmount,
      depositDeductionAmount: 0,
      changeRefundDeductionAmount: 0,
      actualReceivableAmount: receivableAmount,
      refundAmount: 0,
      remainingAmount: isClosed ? 0 : Math.max(0, toMoney(receivableAmount - paidAmount)),
      method: normalizeMethod(row),
      operator: row.receiver_name || row.created_by_name || "-",
      dueDate: null,
      occurredAt: happenedAt,
      note: row.notes || "",
      basicInfo,
      approval,
    });

    if (paidAmount > 0 || statusInfo.collectionStatus === "collecting") {
      ledgerItems.push({
        id: `${categoryKey}-ledger-${row.id}`,
        groupKey,
        categoryKey,
        title: row.deposit_type || `${categoryLabel}收款`,
        flowLabel: "收款",
        direction: "receipt",
        amount: paidAmount > 0 ? paidAmount : receivableAmount,
        method: normalizeMethod(row),
        operator: row.receiver_name || row.created_by_name || "-",
        occurredAt: happenedAt,
        receiptVoucher: row.voucher_url || null,
        note: row.notes || "",
        statusLabel: statusInfo.statusLabel,
        statusTone: statusInfo.statusTone,
      });
    }

    if (refundedAmount > 0) {
      items.push({
        id: `${categoryKey}-refund-${row.id}`,
        categoryKey,
        categoryLabel,
        collectionStatus: "refund",
        statusLabel: "退款完成",
        statusTone: "red",
        flowLabel: refundTitle,
        customerId: row.customer_id || null,
        customerName: row.customer_name || "-",
        projectId: row.project_id || null,
        projectName: row.project_name || row.project_address || row.service_store || "-",
        title: refundTitle,
        receivableAmount: 0,
        receivedAmount: 0,
        depositDeductionAmount: 0,
        changeRefundDeductionAmount: 0,
        actualReceivableAmount: 0,
        refundAmount: refundedAmount,
        remainingAmount: 0,
        method: "退款",
        operator: row.receiver_name || row.created_by_name || "-",
        dueDate: null,
        occurredAt: row.refund_processed_at || row.refund_requested_at || happenedAt,
        note: row.refund_reason || row.notes || "",
        basicInfo,
      });
      ledgerItems.push({
        id: `${categoryKey}-refund-ledger-${row.id}`,
        groupKey,
        categoryKey,
        title: refundTitle,
        flowLabel: refundTitle,
        direction: "refund",
        amount: refundedAmount,
        method: "退款",
        operator: row.receiver_name || row.created_by_name || "-",
        occurredAt: row.refund_processed_at || row.refund_requested_at || happenedAt,
        receiptVoucher: row.voucher_url || null,
        note: row.refund_reason || row.notes || "",
        statusLabel: "退款完成",
        statusTone: "red",
      });
      refundRequests.push({
        id: `${categoryKey}-refund-request-${row.id}`,
        groupKey,
        categoryKey,
        sourceItemId,
        title: refundTitle,
        amount: refundedAmount,
        status: "refunded",
        statusLabel: "已退款",
        statusTone: "green",
        requestedAt: row.refund_requested_at || null,
        completedAt: row.refund_processed_at || row.refund_requested_at || happenedAt,
        applicant: row.refund_requester_name || row.created_by_name || row.receiver_name || "-",
        currentApprover: "-",
        reason: row.refund_reason || row.notes || "",
        canConfirmRefund: false,
      });
    }

    if (pendingRefundAmount > 0) {
      const refundStatus = getPendingRefundRequestStatus(row);
      const refundMeta = getPendingRefundStatusMeta(refundStatus);
      refundRequests.push({
        id: `${categoryKey}-refund-pending-${row.id}`,
        groupKey,
        categoryKey,
        sourceItemId,
        title: `${refundTitle}申请`,
        amount: pendingRefundAmount,
        status: refundStatus,
        statusLabel: refundMeta.statusLabel,
        statusTone: refundMeta.statusTone,
        requestedAt: row.refund_requested_at || happenedAt,
        completedAt: null,
        applicant: row.refund_requester_name || row.created_by_name || row.receiver_name || "-",
        currentApprover: refundStatus === "pending_approval" ? row.refund_current_approvers || refundMeta.currentApproverFallback : refundMeta.currentApproverFallback,
        reason: row.refund_reason || "",
        canConfirmRefund: refundStatus === "pending_refund",
      });
    }

    if (row.refund_status === "rejected" && toMoney(row.refund_amount) > 0) {
      refundRequests.push({
        id: `${categoryKey}-refund-rejected-${row.id}`,
        groupKey,
        categoryKey,
        sourceItemId,
        title: `${refundTitle}申请`,
        amount: toMoney(row.refund_amount),
        status: "rejected",
        statusLabel: "已关闭",
        statusTone: "gray",
        requestedAt: row.refund_requested_at || happenedAt,
        completedAt: row.refund_processed_at || null,
        applicant: row.refund_requester_name || row.created_by_name || row.receiver_name || "-",
        currentApprover: "-",
        reason: row.refund_reason || "",
        canConfirmRefund: false,
      });
    }
  });

  const planWhere = ["p.company_id = ?", "p.deleted_at IS NULL"];
  const planParams: unknown[] = [auth.companyId];
  appendDateWhere(planWhere, planParams, "COALESCE(pp.due_date, pp.created_at)", range);
  const planLatestPayAtSql = normalizedPaymentRecordTimeSql("pr");
  const planRows = db.prepare(`
    SELECT pp.*,
      COALESCE(SUM(CASE
        WHEN pr.amount > 0 THEN pr.amount
        WHEN pr.amount < 0 AND (pr.reversal_of_record_id IS NOT NULL OR pr.pay_method = '财务冲销') THEN pr.amount
        ELSE 0
      END), 0) as received_amount,
      COALESCE(SUM(CASE
        WHEN pr.amount < 0 AND pr.reversal_of_record_id IS NULL AND COALESCE(pr.pay_method, '') <> '财务冲销' THEN ABS(pr.amount)
        ELSE 0
      END), 0) as refund_amount,
      MAX(${planLatestPayAtSql}) as latest_pay_at,
      p.id as project_id, p.name as project_name, p.address as project_address, p.area as project_area,
      p.status as project_status, p.site_stage, p.current_phase, p.start_date, p.planned_end_date,
      ctt.id as contract_id, ctt.contract_no, ctt.title as contract_title, ctt.content as contract_content,
      (
        SELECT first_plan.id
        FROM payment_plans first_plan
        WHERE first_plan.contract_id = pp.contract_id
        ORDER BY first_plan.sort_order ASC, first_plan.created_at ASC, first_plan.id ASC
        LIMIT 1
      ) as first_plan_id,
      c.id as customer_id, c.name as customer_name, c.service_store,
      c.address as customer_address, c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      manager.name as manager_name,
      payer.name as latest_operator,
      (
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_name
    FROM payment_plans pp
    INNER JOIN projects p ON p.id = pp.project_id AND p.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users manager ON manager.id = p.manager_id
    LEFT JOIN payment_records pr ON pr.payment_plan_id = pp.id
    LEFT JOIN users payer ON payer.id = pr.user_id
    LEFT JOIN contracts ctt ON ctt.id = pp.contract_id AND ctt.deleted_at IS NULL
    WHERE ${planWhere.join(" AND ")}
    GROUP BY pp.id
    ORDER BY COALESCE(pp.due_date, pp.created_at) DESC, pp.sort_order ASC
    LIMIT 1000
  `).all(...planParams) as any[];

  const changeRefundTotals = new Map<string, number>();
  Array.from(new Set(planRows.map((row) => String(row.project_id || "")).filter(Boolean))).forEach((projectId) => {
    changeRefundTotals.set(projectId, getApprovedChangeRefundTotal(db, projectId));
  });
  const projectPaymentFinanceMap = buildProjectPaymentFinanceMap(planRows, changeRefundTotals);

  planRows.forEach((row) => {
    const planReceivableAmount = toMoney(row.amount);
    const cashReceivedAmount = toMoney(row.received_amount);
    const rowRefundAmount = toMoney(row.refund_amount);
    const finance = projectPaymentFinanceMap.get(row.id) || {
      receivableAmount: planReceivableAmount,
      receivedAmount: cashReceivedAmount,
      depositDeductionAmount: 0,
      changeRefundDeductionAmount: 0,
      actualReceivableAmount: planReceivableAmount,
      refundAmount: rowRefundAmount,
      remainingAmount: Math.max(0, toMoney(planReceivableAmount - cashReceivedAmount + rowRefundAmount)),
      collectionStatus: cashReceivedAmount <= 0 && rowRefundAmount <= 0 ? "unpaid" as const : "collecting" as const,
      statusLabel: cashReceivedAmount <= 0 && rowRefundAmount <= 0 ? "待收款" : "收款中",
      statusTone: cashReceivedAmount <= 0 && rowRefundAmount <= 0 ? "red" as const : "amber" as const,
    };
    const basicInfo = makeBasicInfo(row);

    items.push({
      id: `project-payment-${row.id}`,
      categoryKey: "project_payment",
      categoryLabel: categories.project_payment.label,
      collectionStatus: finance.collectionStatus,
      statusLabel: finance.statusLabel,
      statusTone: finance.statusTone,
      flowLabel: "工程款",
      customerId: row.customer_id || null,
      customerName: row.customer_name || "-",
      projectId: row.project_id || null,
      projectName: row.project_name || row.project_address || "-",
      contractId: row.contract_id || null,
      contractNo: row.contract_no || null,
      contractTitle: row.contract_title || null,
      title: row.milestone || "工程款收款",
      receivableAmount: finance.receivableAmount,
      receivedAmount: finance.receivedAmount,
      depositDeductionAmount: finance.depositDeductionAmount,
      changeRefundDeductionAmount: finance.changeRefundDeductionAmount,
      actualReceivableAmount: finance.actualReceivableAmount,
      refundAmount: finance.refundAmount,
      remainingAmount: finance.remainingAmount,
      method: row.latest_pay_at ? "合同收款" : "待收款",
      operator: row.latest_operator || "-",
      dueDate: row.due_date || null,
      occurredAt: row.latest_pay_at || row.updated_at || row.created_at,
      note: "",
      basicInfo,
      sortOrder: Number(row.sort_order || 0),
    });
  });

  const paymentRecordTimeSql = normalizedPaymentRecordTimeSql("pr");
  const paymentRecordWhere = ["p.company_id = ?", "p.deleted_at IS NULL"];
  const paymentRecordParams: unknown[] = [auth.companyId];
  appendDateWhere(paymentRecordWhere, paymentRecordParams, paymentRecordTimeSql, range);
  const paymentRecordRows = db.prepare(`
    SELECT pr.*, pp.milestone, pp.project_id, pp.amount as plan_amount,
      p.name as project_name, p.address as project_address,
      c.id as customer_id, c.name as customer_name,
      c.address as customer_address, c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      u.name as operator_name
    FROM payment_records pr
    INNER JOIN payment_plans pp ON pp.id = pr.payment_plan_id
    INNER JOIN projects p ON p.id = pp.project_id AND p.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users u ON u.id = pr.user_id
    WHERE ${paymentRecordWhere.join(" AND ")}
    ORDER BY ${paymentRecordTimeSql} DESC, pr.id DESC
    LIMIT 1000
  `).all(...paymentRecordParams) as any[];

  paymentRecordRows.forEach((row) => {
    const amount = toMoney(row.amount);
    const method = String(row.pay_method || "");
    const isRefund = amount < 0 && !row.reversal_of_record_id && method !== "财务冲销";
    const isReversal = amount < 0 && !isRefund;
    const isReversed = Boolean(row.reversed_at);
    const basicInfo = {
      fullRoomName: buildFullRoomName(row),
      projectAddress: row.project_address || null,
    };
    const ledgerBase = {
      categoryKey: "project_payment" as const,
      customerId: row.customer_id || null,
      customerName: row.customer_name || "-",
      projectId: row.project_id || null,
      projectName: row.project_name || row.project_address || "-",
      basicInfo,
    };
    ledgerItems.push({
      id: `project-payment-ledger-${row.id}`,
      groupKey: getLedgerGroupKey(ledgerBase),
      categoryKey: "project_payment",
      title: row.milestone || "工程款收款",
      flowLabel: isRefund ? "退款" : isReversal ? "财务冲销" : "工程款",
      direction: isRefund ? "refund" : isReversal ? "reversal" : "receipt",
      amount: Math.abs(amount),
      method: row.pay_method || "合同收款",
      operator: row.operator_name || "-",
      occurredAt: normalizeLegacyBeijingLocalDateTime(row.pay_date, row.created_at) || row.created_at,
      receiptVoucher: row.receipt_no || row.id || null,
      note: row.notes || row.reversal_reason || "",
      statusLabel: isRefund ? "退款完成" : isReversal ? "冲销记录" : isReversed ? "已冲销" : "已完成",
      statusTone: isRefund ? "red" : isReversal || isReversed ? "gray" : "green",
      sourceRecordId: row.id,
      reversalOfRecordId: row.reversal_of_record_id || null,
      canReverse: !isReversal && !isReversed && amount > 0,
      reversedAt: row.reversed_at || null,
    });
  });

  const changeWhere = ["p.company_id = ?", "change_order.deleted_at IS NULL"];
  const changeParams: unknown[] = [auth.companyId];
  appendDateWhere(changeWhere, changeParams, "COALESCE(change_order.approved_at, change_order.created_at)", range);
  const changeRows = db.prepare(`
    SELECT change_order.*, p.id as project_id, p.name as project_name, p.address as project_address,
      p.area as project_area, p.status as project_status, p.site_stage, p.current_phase, p.start_date, p.planned_end_date,
      c.id as customer_id, c.name as customer_name, c.service_store,
      c.address as customer_address, c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      manager.name as manager_name,
      creator.name as created_by_name,
      (
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_name
    FROM site_change_orders change_order
    INNER JOIN projects p ON p.id = change_order.project_id AND p.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users manager ON manager.id = p.manager_id
    LEFT JOIN users creator ON creator.id = change_order.created_by
    WHERE ${changeWhere.join(" AND ")}
    ORDER BY COALESCE(change_order.approved_at, change_order.created_at) DESC, change_order.id DESC
    LIMIT 1000
  `).all(...changeParams) as any[];

  changeRows.forEach((row) => {
    const amount = toMoney(row.amount);
    const isDeduct = String(row.change_type || "").toUpperCase() === "DEDUCT";
    const statusInfo = getChangeStatus(row);
    const isRefund = statusInfo.collectionStatus === "refund";
    const isVoided = statusInfo.collectionStatus === "voided";
    const basicInfo = makeBasicInfo(row);

    items.push({
      id: `change-payment-${row.id}`,
      categoryKey: "change_payment",
      categoryLabel: categories.change_payment.label,
      ...statusInfo,
      flowLabel: isDeduct ? "减项" : "增项",
      customerId: row.customer_id || null,
      customerName: row.customer_name || "-",
      projectId: row.project_id || null,
      projectName: row.project_name || row.project_address || "-",
      title: `${row.change_no || "变更单"} · ${row.title || "变更款"}`,
      receivableAmount: isRefund || isVoided ? 0 : amount,
      receivedAmount: 0,
      depositDeductionAmount: 0,
      changeRefundDeductionAmount: 0,
      actualReceivableAmount: isRefund || isVoided ? 0 : amount,
      refundAmount: isRefund ? amount : 0,
      remainingAmount: isRefund || isVoided ? 0 : amount,
      method: "变更单",
      operator: row.created_by_name || "-",
      dueDate: null,
      occurredAt: row.approved_at || row.created_at,
      note: row.discount_reason || row.description || "",
      basicInfo,
      isAccrual: true,
    });
  });

  const groups = makeProjectGroups(items, ledgerItems, refundRequests);
  attachRelatedOrderSummaries(groups);
  const categorySummaries = makeCategorySummaries(groups);
  const categoryGroups = groups.filter((group) => group.categoryKey === category);
  const directionCounts = makeDirectionCounts(categoryGroups);
  const statusCounts = makeStatusCounts(categoryGroups, direction);
  const filteredGroups = categoryGroups
    .filter((group) => groupMatchesDirectionStatus(group, direction, status))
    .filter((group) => matchesGroupSearch(group, search))
    .sort((a, b) => {
      const timeDiff = compareGroupsByLatest(a, b);
      if (timeDiff !== 0) return timeDiff;
      if (direction === "refund") {
        const refundDiff = getRefundSortWeight(a) - getRefundSortWeight(b);
        if (refundDiff !== 0) return refundDiff;
      }
      return sortGroups(a, b);
    })
    .slice(0, 300);

  return NextResponse.json({
    range,
    activeCategory: category,
    activeDirection: direction,
    activeStatus: status,
    categorySummaries,
    directionCounts,
    statusCounts,
    groups: filteredGroups,
  });
}

export async function POST(request: NextRequest) {
  const auth = getAuthContext(request);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "finance.view")) return NextResponse.json({ message: "没有财务操作权限" }, { status: 403 });
  try {
    const db = getDb();
    const body = await request.json();
    const action = String(body.action || "").trim();
    if (action !== "collect" && action !== "reverse") {
      return NextResponse.json({ message: "无效操作" }, { status: 400 });
    }

    if (action === "reverse") {
      const ledgerId = String(body.ledgerId || body.recordId || "").trim();
      const match = ledgerId.match(/^project-payment-ledger-(.+)$/);
      const recordId = match ? match[1] : ledgerId;
      const reason = String(body.reason || "").trim();
      if (!recordId) return NextResponse.json({ message: "缺少要冲销的流水" }, { status: 400 });
      if (!reason) return NextResponse.json({ message: "请填写冲销原因" }, { status: 400 });

      const record = db.prepare(`
        SELECT pr.*, pp.amount as plan_amount, pp.project_id
        FROM payment_records pr
        INNER JOIN payment_plans pp ON pp.id = pr.payment_plan_id
        INNER JOIN projects p ON p.id = pp.project_id
        WHERE pr.id = ? AND p.company_id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(recordId, auth.companyId) as any;
      if (!record) return NextResponse.json({ message: "收款流水不存在" }, { status: 404 });
      if (Number(record.amount || 0) <= 0 || record.reversal_of_record_id) {
        return NextResponse.json({ message: "该流水不是可冲销的收款记录" }, { status: 400 });
      }
      if (record.reversed_at) {
        return NextResponse.json({ message: "该流水已冲销，不能重复冲销" }, { status: 400 });
      }

      const existingReversal = db.prepare("SELECT id FROM payment_records WHERE reversal_of_record_id = ? LIMIT 1").get(recordId) as any;
      if (existingReversal) {
        return NextResponse.json({ message: "该流水已存在冲销记录" }, { status: 400 });
      }

      const receivedRow = db.prepare(`
        SELECT COALESCE(SUM(CASE
          WHEN amount > 0 THEN amount
          WHEN amount < 0 AND (reversal_of_record_id IS NOT NULL OR pay_method = '财务冲销') THEN amount
          ELSE 0
        END), 0) as received_amount
        FROM payment_records
        WHERE payment_plan_id = ?
      `).get(record.payment_plan_id) as any;
      const recordAmount = toMoney(record.amount);
      const receivedAmount = toMoney(receivedRow?.received_amount);
      if (recordAmount > receivedAmount + 0.001) {
        return NextResponse.json({ message: "当前已收金额不足，不能冲销该笔流水" }, { status: 400 });
      }

      const userId = auth.userId;

      const reversalId = makeId("REV");
      const reversalNo = reversalId;
      const now = utcNowSql();
      const nextReceivedAmount = Math.max(0, toMoney(receivedAmount - recordAmount));
      const financeInfo = getProjectPaymentFinanceForPlan(db, record.payment_plan_id);
      const actualReceivableAmount = financeInfo?.finance.actualReceivableAmount ?? toMoney(record.plan_amount);
      const refundAmount = financeInfo?.finance.refundAmount ?? 0;
      const nextRemainingAmount = Math.max(0, toMoney(actualReceivableAmount - nextReceivedAmount + refundAmount));
      const nextStatus = nextReceivedAmount <= 0.001 ? "PENDING" : nextRemainingAmount <= 0.001 ? "PAID" : "PARTIAL";

      const tx = (db as any).transaction(() => {
        db.prepare(`
          UPDATE payment_records
          SET reversed_at = datetime('now'), reversed_by_id = ?, reversal_reason = ?
          WHERE id = ?
        `).run(userId, reason, recordId);
        db.prepare(`
          INSERT INTO payment_records (
            id, payment_plan_id, user_id, amount, pay_method, pay_date, receipt_no,
            notes, reversal_of_record_id, reversal_reason, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          reversalId,
          record.payment_plan_id,
          userId,
          -recordAmount,
          "财务冲销",
          now,
          reversalNo,
          reason,
          recordId,
          reason,
        );
        db.prepare("UPDATE payment_plans SET status = ?, updated_at = datetime('now') WHERE id = ?").run(nextStatus, record.payment_plan_id);
      });
      tx();

      return NextResponse.json({
        id: reversalId,
        message: "冲销已完成",
        reversedRecordId: recordId,
        receivedAmount: nextReceivedAmount,
        status: nextStatus,
      }, { status: 201 });
    }

    const itemId = String(body.itemId || "").trim();
    const depositMatch = itemId.match(/^(deposit|design_fee)-(.+)$/);
    if (depositMatch) {
      const recordId = depositMatch[2];
      const record = db.prepare(`
        SELECT d.*,
          c.name as customer_name,
          c.status as customer_status,
          c.company_id as customer_company_id,
          (
            SELECT status
            FROM deposit_approval_instances dai
            WHERE dai.deposit_id = d.id
              AND dai.deleted_at IS NULL
              AND dai.status = 'pending'
            ORDER BY datetime(dai.created_at) DESC, dai.id DESC
            LIMIT 1
          ) as approval_status
        FROM customer_deposit_records d
        INNER JOIN customers c ON c.id = d.customer_id
        WHERE d.id = ?
          AND d.company_id = ?
          AND c.company_id = ?
          AND d.deleted_at IS NULL
          AND c.deleted_at IS NULL
        LIMIT 1
      `).get(recordId, auth.companyId, auth.companyId) as any;
      if (!record) return NextResponse.json({ message: "款项记录不存在" }, { status: 404 });

      const blockedMessage = getDepositReceiptBlockedMessage(record);
      if (blockedMessage) return NextResponse.json({ message: blockedMessage }, { status: 400 });

      const amount = toMoney(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ message: "收款金额必须大于 0" }, { status: 400 });
      }
      const receivableAmount = toMoney(record.receivable_amount ?? record.amount ?? 0);
      const currentAmount = toMoney(record.amount);
      const pendingTopUpAmount = getPendingDepositTopUpApprovalAmount(db, recordId);
      const remainingAmount = Math.max(0, toMoney(receivableAmount - currentAmount - pendingTopUpAmount));
      if (remainingAmount <= 0) {
        return NextResponse.json({ message: pendingTopUpAmount > 0 ? `该${getPaymentLabel(record)}已有收款审批占用待收金额，审批完成前不能重复收款` : `该${getPaymentLabel(record)}已收满，无需收款` }, { status: 400 });
      }
      if (amount > remainingAmount + 0.005) {
        return NextResponse.json({ message: `收款金额不能大于待收金额 ${formatReceiptAmount(remainingAmount)}` }, { status: 400 });
      }

      const mode = String(body.mode || "manual") === "online" ? "online" : "manual";
      const payMethod = String(body.payMethod || (mode === "online" ? "在线收款" : "手动收款")).trim();
      const payDateInput = String(body.payDate || "").trim();
      if (!payDateInput) return NextResponse.json({ message: "请选择收款时间" }, { status: 400 });
      if (!payMethod) return NextResponse.json({ message: "请选择收款方式" }, { status: 400 });
      const notes = String(body.notes || "").trim();
      const createdById = auth.userId;
      const label = getPaymentLabel(record);
      const approvalFlow = getDepositApprovalFlowForCustomer(db, record.customer_id, amount);
      if (approvalFlow && !createdById) return NextResponse.json({ message: `缺少提交人，无法发起${label}收款审批` }, { status: 400 });
      const approvalPlan = approvalFlow
        ? prepareDepositApprovalPlan(db, {
          customerId: record.customer_id,
          branchOrgUnitId: approvalFlow.branchOrgUnitId,
          flow: approvalFlow.flow,
          initiatorId: createdById || "",
        })
        : null;
      const nextAmount = toMoney(currentAmount + amount);
      const noteParts = [
        String(record.notes || "").trim(),
        `${mode === "online" ? "在线收款" : "手动收款"}：${formatReceiptAmount(amount)} 元，方式：${payMethod}，时间：${payDateInput}${notes ? `，备注：${notes}` : ""}`,
      ].filter(Boolean);

      const tx = (db as any).transaction(() => {
        if (approvalPlan) {
          createDepositApprovalInstance(db, approvalPlan, {
            depositId: recordId,
            customerId: record.customer_id,
            createdById: createdById!,
            title: record.customer_name || "客户",
            amount,
            recordType: normalizeRecordType(record.record_type),
            approvalKind: "top_up",
            approvalMeta: {
              received_at: payDateInput,
              payment_channel: payMethod,
              receiver_name: "",
              voucher_url: "",
              notes,
            },
          });
        } else {
          db.prepare(`
            UPDATE customer_deposit_records
            SET amount = ?,
                status = 'received',
                received_at = CASE WHEN COALESCE(amount, 0) <= 0 THEN ? ELSE received_at END,
                payment_channel = COALESCE(NULLIF(payment_channel, ''), ?),
                notes = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(
            nextAmount,
            beijingLocalDateTimeToUtcSql(payDateInput),
            payMethod,
            noteParts.join("\n"),
            recordId,
          );
        }
      });
      tx();

      if (!approvalPlan) {
        if (normalizeRecordType(record.record_type) === "deposit") {
          promoteCustomerToDeposited(db, { id: record.customer_id, status: record.customer_status });
        } else {
          syncCustomerProgress(db, record.customer_id);
        }
      }
      recordCustomerOperation(db, {
        userId: auth.userId,
        customerId: record.customer_id,
        action: approvalPlan ? "customer.payment.top_up_submit_approval" : "customer.payment.top_up",
        module: "款项记录",
        title: approvalPlan ? `提交${label}收款审批` : `收取${label}`,
        content: approvalPlan
          ? `${label}收款金额：${formatReceiptAmount(amount)} 元，方式：${payMethod}，已提交审批`
          : `${label}收款金额：${formatReceiptAmount(amount)} 元，累计实收：${formatReceiptAmount(nextAmount)} 元`,
        targetName: label,
        metadata: { recordId, amount, totalReceivedAmount: approvalPlan ? currentAmount : nextAmount, receivableAmount, recordType: normalizeRecordType(record.record_type), approvalRequired: Boolean(approvalPlan) },
        ipAddress: getRequestIp(request),
      });

      return NextResponse.json({
        id: recordId,
        message: approvalPlan ? `${label}收款已提交审批，审批通过后计入实收` : "收款已保存",
        approvalRequired: Boolean(approvalPlan),
        receivedAmount: approvalPlan ? currentAmount : nextAmount,
      }, { status: 201 });
    }

    const match = itemId.match(/^project-payment-(.+)$/);
    if (!match) {
      return NextResponse.json({ message: "当前本页弹窗暂支持工程款收款" }, { status: 400 });
    }

    const paymentPlanId = match[1];
    const amount = toMoney(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: "收款金额必须大于 0" }, { status: 400 });
    }

    const financeContext = getProjectPaymentFinanceContextForPlan(db, paymentPlanId);
    if (!financeContext) return NextResponse.json({ message: "收款计划不存在" }, { status: 404 });

    const { plan } = financeContext;
    if (!projectBelongsToCompany(auth, plan.project_id)) return NextResponse.json({ message: "收款计划不存在" }, { status: 404 });
    const allocationResult = buildProjectPaymentAllocations(financeContext, amount);
    if (allocationResult.totalRemainingAmount <= 0) {
      return NextResponse.json({ message: "该合同从当前款项起已无剩余应收" }, { status: 400 });
    }
    if (allocationResult.undistributedAmount > 0.001) {
      return NextResponse.json({
        message: `收款金额不能大于当前款项及后续款项剩余应收 ${allocationResult.totalRemainingAmount.toFixed(2)}`,
      }, { status: 400 });
    }

    const mode = String(body.mode || "manual") === "online" ? "online" : "manual";
    const payMethod = String(body.payMethod || (mode === "online" ? "在线收款" : "手动收款")).trim();
    const payDate = beijingLocalDateTimeToUtcSql(body.payDate);
    const notes = String(body.notes || "").trim();
    const userId = auth.userId;

    const receiptNo = makeId("PAY");
    const allocationCount = allocationResult.allocations.length;

    const tx = (db as any).transaction(() => {
      const insertRecord = db.prepare(`
        INSERT INTO payment_records (id, payment_plan_id, user_id, amount, pay_method, pay_date, receipt_no, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      const updatePlan = db.prepare("UPDATE payment_plans SET status = ?, updated_at = datetime('now') WHERE id = ?");

      allocationResult.allocations.forEach((allocation, index) => {
        const recordId = index === 0 ? receiptNo : makeId("PAY");
        const allocationNote = allocationCount > 1
          ? `${notes ? `${notes}；` : ""}自动分摊 ${index + 1}/${allocationCount}，收据号 ${receiptNo}`
          : notes || null;
        const nextReceivedAmount = toMoney(Number(allocation.row.received_amount || 0) + allocation.amount);
        const nextRemainingAmount = Math.max(0, toMoney(allocation.finance.actualReceivableAmount - nextReceivedAmount + allocation.finance.refundAmount));
        const nextStatus = nextReceivedAmount <= 0.001 ? "PENDING" : nextRemainingAmount <= 0.001 ? "PAID" : "PARTIAL";

        insertRecord.run(
          recordId,
          allocation.row.id,
          userId,
          allocation.amount,
          payMethod,
          payDate,
          receiptNo,
          allocationNote,
        );
        updatePlan.run(nextStatus, allocation.row.id);
      });
    });
    tx();

    return NextResponse.json({
      id: receiptNo,
      message: allocationCount > 1 ? `收款已保存，已自动分摊到 ${allocationCount} 个款项` : "收款已保存",
      allocatedCount: allocationCount,
      allocatedAmount: amount,
      allocations: allocationResult.allocations.map((allocation) => ({
        paymentPlanId: allocation.row.id,
        milestone: allocation.row.milestone || "工程款",
        amount: allocation.amount,
      })),
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "保存收款失败" }, { status: 500 });
  }
}
