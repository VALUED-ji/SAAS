import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  Hammer,
  HardHat,
  X,
  Loader2,
  MapPin,
  HandCoins,
  Palette,
  QrCode,
  RotateCcw,
  Ruler,
  Search,
  Store,
  Upload,
  UserRound,
  WalletCards,
} from "lucide-react";
import SystemSelect from "@/components/ui/SystemSelect";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemDateInput from "@/components/ui/SystemDateInput";
import { formatDate, formatDateTime, toDatetimeLocalValue } from "@/lib/utils";
import NativeImage from "@/components/ui/NativeImage";
import ApprovalSignaturePreview from "@/components/approval/ApprovalSignaturePreview";
import styles from "./owner-receipts.module.css";
import {
  ReceiptItem,
  ReceiptLedgerItem,
  RefundRequestItem,
  StatusTone,
  ProjectReceiptGroup,
  ContractReceiptGroup,
  ProactiveReceiptCustomer,
  ProactiveCollectionRules,
  ProactiveFormalQuotation,
  ProactiveReceiptForm,
  ReceiptActionMode,
  ReceiptActionState,
  ReceiptDirection,
  ReceiptViewKey,
  RefundRequestStatus,
  ReceiptViewSummary,
  ReversalActionState,
  ApprovalActionState,
  areaText,
  defaultProactiveReceiptForm,
  depositPaymentChannels,
  depositTypes,
  designFeeCalculationModes,
  designFeeTypes,
  designerLevelPriceOptions,
  getApprovalNodeStatus,
  getClientAuthHeaders,
  getDesignFeeModeLabel,
  getDesignerLevelDefaultPrice,
  getItemRefundRequest,
  getLatestPaymentAt,
  getQuotationAmount,
  getQuotationDirectAmount,
  getRefundSummary,
  groupApprovalSteps,
  inputControlClass,
  isAutoCalculatedDesignFeeMode,
  isQuotationBasedDesignFeeMode,
  money,
  secondaryButtonClass,
  statusClass,
  statusTagClass,
  tableHeaderClass,
  tableRowClass,
  textOrDash,
  toMoney,
  useDebouncedValue,
} from "./owner-receipt-shared";
export function RefundProcessCell({ group }: { group: ProjectReceiptGroup }) {
  const summary = getRefundSummary(group);
  if (
    summary.pendingApprovalCount <= 0
    && summary.pendingRefundCount <= 0
    && summary.payingCount <= 0
    && summary.refundedCount <= 0
    && summary.rejectedCount <= 0
  ) {
    return <span className="text-xs font-bold text-[#9aa8bb]">-</span>;
  }

  if (summary.pendingRefundCount > 0) {
    return (
      <div className="text-center">
        <p className="text-xs font-black text-red-600">待打款 {summary.pendingRefundCount} 笔</p>
        <p className="mt-1 text-xs font-black tabular-nums text-red-600">{money(summary.pendingRefundAmount)}</p>
      </div>
    );
  }
  if (summary.payingCount > 0) {
    return (
      <div className="text-center">
        <p className="text-xs font-black text-[#407AFF]">打款中 {summary.payingCount} 笔</p>
        <p className="mt-1 text-xs font-black tabular-nums text-[#407AFF]">{money(summary.payingAmount)}</p>
      </div>
    );
  }
  if (summary.pendingApprovalCount > 0) {
    return (
      <div className="text-center">
        <p className="text-xs font-black text-amber-700">审核中 {summary.pendingApprovalCount} 笔</p>
        <p className="mt-1 text-xs font-black tabular-nums text-amber-700">{money(summary.pendingApprovalAmount)}</p>
      </div>
    );
  }
  if (summary.refundedCount > 0) {
    return (
      <div className="text-center">
        <p className="text-xs font-black text-emerald-700">已退款 {summary.refundedCount} 笔</p>
        <p className="mt-1 text-xs font-black tabular-nums text-emerald-700">{money(summary.refundedAmount)}</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <p className="text-xs font-black text-[#6f7f96]">已关闭 {summary.rejectedCount} 笔</p>
      <p className="mt-1 text-xs font-black tabular-nums text-[#6f7f96]">{money(summary.rejectedAmount)}</p>
    </div>
  );
}

export function RefundItemProcessCell({ item, refundRequests }: { item: ReceiptItem; refundRequests: RefundRequestItem[] }) {
  const request = getItemRefundRequest(item, refundRequests);
  if (request) {
    const actionText = request.status === "pending_refund"
      ? "需财务打款"
      : request.status === "pending_approval"
        ? "等待审核"
        : request.status === "paying"
          ? "打款处理中"
          : request.status === "refunded"
            ? "已完成"
            : "已关闭";
    return (
      <div className="text-center">
        <p className={`text-xs font-black ${statusClass(request.statusTone)}`}>{request.statusLabel}</p>
        <p className={`mt-1 text-xs font-black tabular-nums ${statusClass(request.statusTone)}`}>{money(request.amount)}</p>
        <p className="mt-1 text-[11px] font-bold text-[#7c8aa0]">{actionText}</p>
      </div>
    );
  }
  if (item.collectionStatus === "refund" || item.refundAmount > 0) {
    return (
      <div className="text-center">
        <p className="text-xs font-black text-emerald-700">已退款</p>
        <p className="mt-1 text-xs font-black tabular-nums text-emerald-700">{money(item.refundAmount)}</p>
      </div>
    );
  }
  return <p className="text-center text-xs font-bold text-[#9aa8bb]">-</p>;
}

export function ReceiptSplitViewButton({
  views,
  activeViewKey,
  onSelect,
}: {
  views: ReceiptViewSummary[];
  activeViewKey: ReceiptViewKey;
  onSelect: (view: ReceiptViewSummary) => void;
}) {
  return (
    <div className={styles.viewGroup}>
      {views.map((view) => {
        const Icon = view.icon;
        const active = view.key === activeViewKey;
        return (
          <button
            key={view.key}
            type="button"
            onClick={() => onSelect(view)}
            aria-pressed={active}
            className={`${styles.viewButton} ${active ? styles.viewButtonActive : ""}`}
          >
            <span className={styles.viewIcon}><Icon className="h-4 w-4" /></span>
            <span className={styles.viewCopy}>
              <span className={styles.viewLabel}>{view.label}</span>
              <span className={styles.viewDescription}>{view.description}</span>
            </span>
            <span className={styles.viewCount}>{view.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AmountCell({ value, tone = "default" }: { value: number; tone?: "default" | "red" | "amber" }) {
  const toneClass = tone === "red" ? styles.amountRed : tone === "amber" ? styles.amountAmber : "";
  return <p className={`${styles.amountCell} ${toneClass}`}>{money(value)}</p>;
}

function getReceivableRatioText(item: ReceiptItem, totalReceivableAmount: number) {
  if (item.categoryKey !== "project_payment" || item.receivableAmount <= 0 || totalReceivableAmount <= 0) return "-";
  const ratio = Math.round((item.receivableAmount / totalReceivableAmount) * 1000) / 10;
  return `${Number.isInteger(ratio) ? ratio.toFixed(0) : ratio.toFixed(1)}%`;
}

export function ReceiptRateCell({ item, totalReceivableAmount }: { item: ReceiptItem; totalReceivableAmount: number }) {
  const ratioText = getReceivableRatioText(item, totalReceivableAmount);
  if (ratioText === "-") return <p className="text-center text-xs font-bold text-[#9aa8bb]">-</p>;

  return (
    <span className="text-sm font-black tabular-nums text-[#7a4a00]">
      {ratioText}
    </span>
  );
}

export function DepositDeductionCell({ amount }: { amount: number }) {
  if (amount <= 0) return <p className="text-center text-xs font-bold text-[#9aa8bb]">-</p>;
  return <AmountCell value={amount} tone="amber" />;
}

export function ReceiptMethodDropdown({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative mt-1"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`${inputControlClass} flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-[#f8fbff] disabled:text-[#9aa8bb]`}
      >
        <span className="truncate">{value || "请选择收款方式"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#8a98ad] transition ${open ? "rotate-180 text-[#407AFF]" : ""}`} />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-full overflow-hidden rounded-[12px] border border-[#dce8f8] bg-white p-1 shadow-[0_16px_32px_rgba(21,35,62,0.12)]">
          {options.map((option) => {
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center justify-between rounded-[9px] px-3 text-left text-sm font-bold transition ${
                  active
                    ? "bg-[#EDF4FF] text-[#407AFF]"
                    : "text-[#34445a] hover:bg-[#f8fbff] hover:text-[#162033]"
                }`}
              >
                <span>{option}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[#407AFF]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getReceiptActionDisabledReason(item: ReceiptItem) {
  if (item.collectionStatus === "refund") return "退款类款项不需要收款操作";
  if (item.collectionStatus === "voided") return "已关闭款项不允许收款";
  if (item.remainingAmount <= 0) return "该款项收款已完成";
  return "";
}

export function ReceiptActionButton({
  item,
  mode,
  onOpen,
}: {
  item: ReceiptItem;
  mode: ReceiptActionMode;
  onOpen: (item: ReceiptItem, mode: ReceiptActionMode) => void;
}) {
  const disabledReason = getReceiptActionDisabledReason(item);
  const disabled = Boolean(disabledReason);
  const Icon = mode === "online" ? QrCode : HandCoins;
  const label = mode === "online" ? "在线收款" : "手动收款";

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? disabledReason : label}
      onClick={() => {
        if (disabled) return;
        onOpen(item, mode);
      }}
      className={`${styles.receiptActionButton} ${mode === "online" ? styles.receiptActionPrimary : styles.receiptActionSecondary}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.stateIcon}><WalletCards className="h-5 w-5" /></span>
      <p>{text}</p>
    </div>
  );
}

export function DetailAmount({
  label,
  value,
  tone = "default",
  prominent = false,
}: {
  label: string;
  value: number;
  tone?: "default" | "red" | "amber" | "green" | "blue";
  prominent?: boolean;
}) {
  const toneClass = tone === "red"
    ? styles.detailAmountRed
    : tone === "amber"
      ? styles.detailAmountAmber
      : tone === "green"
        ? styles.detailAmountGreen
        : tone === "blue"
          ? styles.detailAmountBlue
          : "";
  return (
    <div className={`${styles.detailAmount} ${toneClass} ${prominent ? styles.detailAmountProminent : ""}`}>
      <p className={styles.detailAmountLabel}>{label}</p>
      <p className={styles.detailAmountValue}>{money(value)}</p>
    </div>
  );
}

export function RelatedOrderOverview({ group }: { group: ProjectReceiptGroup }) {
  const relatedOrders = Array.isArray(group.relatedOrderSummaries) ? group.relatedOrderSummaries : [];
  const totalRemaining = relatedOrders.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);
  const totalNetReceived = relatedOrders.reduce((sum, item) => sum + Number(item.receivedAmount || 0) - Number(item.refundAmount || 0), 0);

  return (
    <section className={`${styles.detailPanel} ${styles.relatedSection}`}>
      <div className={styles.detailSectionHeader}>
        <div>
          <h2 className={styles.detailSectionTitle}>本工地其他{group.categoryLabel}单据</h2>
          <p className={styles.detailSectionDescription}>只显示同一工地、同一款项类型的其他单据。</p>
        </div>
        <div className={styles.detailSummaryTags}>
          <span className={styles.summaryTagBlue}>{relatedOrders.length} 笔其他单据</span>
          {relatedOrders.length > 0 && (
            <>
              <span className={styles.summaryTagGreen}>净收 {money(totalNetReceived)}</span>
              <span className={totalRemaining > 0 ? styles.summaryTagRed : styles.summaryTagNeutral}>剩余 {money(totalRemaining)}</span>
            </>
          )}
        </div>
      </div>
      {relatedOrders.length === 0 ? (
        <div className={styles.detailEmptyWrap}>
          <div className={styles.detailInlineEmpty}>
            本工地暂无其他{group.categoryLabel}单据
          </div>
        </div>
      ) : (
        <ThinScrollArea className={styles.detailTableScroller}>
          <table className={`${styles.detailTable} ${styles.relatedOrdersTable}`}>
            <colgroup>
              <col style={{ width: 260 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 126 }} />
              <col style={{ width: 126 }} />
              <col style={{ width: 126 }} />
              <col style={{ width: 126 }} />
              <col style={{ width: 126 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 182 }} />
            </colgroup>
            <thead className={tableHeaderClass}>
              <tr>
                <th className="border-b border-r border-[#e7eff9] px-4 py-3 text-left">单据名称</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">状态</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">应收金额</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">已收金额</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">退款金额</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">净收金额</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">剩余应收</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">记录数</th>
                <th className="border-b border-[#e7eff9] px-3 py-3 text-center">最近记录</th>
              </tr>
            </thead>
            <tbody>
              {relatedOrders.map((item) => {
                const netReceived = Number(item.receivedAmount || 0) - Number(item.refundAmount || 0);
                return (
                  <tr key={item.id} className={tableRowClass}>
                    <td className="border-b border-r border-[#e7eff9] px-4 py-3 align-middle">
                      <div className="min-w-0">
                        <p className="truncate font-black text-[#162033]" title={item.title}>{item.title}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-[#7c8aa0]">同工地{group.categoryLabel}</p>
                      </div>
                    </td>
                    <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                      <span className={`${styles.statusTag} ${statusTagClass(item.statusTone)}`}>{item.statusLabel}</span>
                    </td>
                    <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.receivableAmount} /></td>
                    <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.receivedAmount} /></td>
                    <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.refundAmount} tone={item.refundAmount > 0 ? "red" : "default"} /></td>
                    <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={netReceived} tone={netReceived < 0 ? "red" : "default"} /></td>
                    <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.remainingAmount} tone={item.remainingAmount > 0 ? "red" : "default"} /></td>
                    <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                      <span className="text-xs font-black tabular-nums text-[#52647b]">{item.itemCount} 项</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                      {item.latestAt ? formatDateTime(item.latestAt) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ThinScrollArea>
      )}
    </section>
  );
}

export function PaymentItemMarker() {
  return (
    <span className={styles.paymentMarker}>
      款
    </span>
  );
}

export function InfoCell({
  icon: Icon,
  label,
  value,
  tone,
  wide = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "blue" | "teal" | "amber" | "slate" | "orange" | "green" | "purple" | "rose";
  wide?: boolean;
}) {
  const toneClass = tone === "teal"
    ? styles.detailInfoTeal
    : tone === "amber"
      ? styles.detailInfoAmber
      : tone === "slate"
        ? styles.detailInfoSlate
        : tone === "orange"
          ? styles.detailInfoOrange
          : tone === "green"
            ? styles.detailInfoGreen
            : tone === "purple"
              ? styles.detailInfoPurple
              : tone === "rose"
                ? styles.detailInfoRose
                : tone === "blue"
                  ? styles.detailInfoBlue
                  : "";
  return (
    <div className={`${styles.detailInfoCell} ${toneClass} ${wide ? "lg:col-span-2" : ""}`}>
      <div className={styles.detailInfoContent}>
        <span className={styles.detailInfoIcon}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className={styles.detailInfoLabel}>{label}</p>
          <p className={styles.detailInfoValue} title={value}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export function HeaderMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "red" | "green" | "blue" }) {
  const toneClass = tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-700" : tone === "blue" ? "text-[#407AFF]" : "text-[#162033]";
  return (
    <div className={styles.headerMetric}>
      <p className={styles.headerMetricLabel}>{label}</p>
      <p className={`${styles.headerMetricValue} ${toneClass}`} title={value}>{value}</p>
    </div>
  );
}

function getRefundStatusDisplay(status: RefundRequestStatus) {
  if (status === "pending_approval") return { label: "审核中", tone: "amber" as StatusTone, action: "等待审核" };
  if (status === "pending_refund") return { label: "待打款", tone: "red" as StatusTone, action: "需财务打款" };
  if (status === "paying") return { label: "打款中", tone: "blue" as StatusTone, action: "打款处理中" };
  if (status === "refunded") return { label: "退款完成", tone: "green" as StatusTone, action: "已完成" };
  return { label: "已关闭", tone: "gray" as StatusTone, action: "无需打款" };
}

function getPrimaryRefundRequest(group: ProjectReceiptGroup) {
  const statusWeight: Record<RefundRequestStatus, number> = {
    pending_approval: 0,
    pending_refund: 1,
    paying: 2,
    refunded: 3,
    rejected: 4,
  };
  return [...(group.refundRequests || [])].sort((a, b) => {
    const statusDiff = statusWeight[a.status] - statusWeight[b.status];
    if (statusDiff !== 0) return statusDiff;
    return String(b.requestedAt || b.completedAt || "").localeCompare(String(a.requestedAt || a.completedAt || ""));
  })[0] || null;
}

export function ReceiptApprovalStatusCell({
  item,
  group,
  onOpen,
}: {
  item: ReceiptItem;
  group: ProjectReceiptGroup;
  onOpen: (item: ReceiptItem, group: ProjectReceiptGroup) => void;
}) {
  const canOpenApproval = Boolean(item.approval) || item.statusLabel.includes("审批");
  const content = <span className={`${styles.statusTag} ${statusTagClass(item.statusTone)}`}>{item.statusLabel}</span>;

  if (!canOpenApproval) return content;

  return (
    <button
      type="button"
      onClick={() => onOpen(item, group)}
      className={styles.approvalStatusButton}
      title="查看收款审批详情"
    >
      {content}
    </button>
  );
}

export function ReceiptApprovalModal({
  action,
  currentUserId,
  processingId = "",
  onClose,
  onApprovalAction,
}: {
  action: ApprovalActionState;
  currentUserId?: string | null;
  processingId?: string;
  onClose: () => void;
  onApprovalAction?: (target: { stepId: string; action: "approve" | "reject" }) => void;
}) {
  if (!action) return null;

  const { item } = action;
  const approval = item.approval || null;
  const nodeGroups = groupApprovalSteps(approval?.steps);
  const flowName = approval?.flowName || "收款审批流";
  const headerStatus = approval?.status === "approved"
    ? { label: "已完成", className: "bg-emerald-50 text-emerald-700 ring-emerald-100" }
    : approval?.status === "rejected"
      ? { label: "已驳回", className: "bg-red-50 text-red-700 ring-red-100" }
      : { label: item.collectionStatus === "collecting" ? "收款中" : item.statusLabel, className: "bg-amber-50 text-amber-700 ring-amber-100" };
  const currentApprovers = approval?.currentApprovers?.length ? approval.currentApprovers.join("、") : "待审批人处理";
  const flowSummary = approval?.status === "approved"
    ? "本次收款审批已通过"
    : approval?.status === "rejected"
      ? "本次收款审批已驳回"
      : approval
        ? `当前等待 ${currentApprovers}`
        : "当前款项暂无完整审批流程详情";
  const nodeMeta = (state: string) => {
    if (state === "approved") return {
      icon: CheckCircle2,
      dotClassName: "bg-emerald-500",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      label: "已完成",
    };
    if (state === "rejected") return {
      icon: CircleX,
      dotClassName: "bg-red-500",
      className: "border-red-200 bg-red-50 text-red-700",
      label: "已驳回",
    };
    if (state === "pending") return {
      icon: Clock3,
      dotClassName: "bg-[#2f6feb]",
      className: "border-[#cfe0ff] bg-[#edf4ff] text-[#2f6feb]",
      label: "等待处理",
    };
    return {
      icon: CircleDashed,
      dotClassName: "bg-[#c4d2e3]",
      className: "border-[#dfe5ed] bg-[#f8fafc] text-[#667085]",
      label: "未完成",
    };
  };
  const approvalAvatar = (name?: string | null, avatar?: string | null, pending = false) => {
    const initial = String(name || "审").trim().slice(0, 1) || "审";
    return (
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ring-1 ring-inset ${
        avatar
          ? "bg-white text-[#667085] ring-[#dfe5ed]"
          : pending
          ? "bg-[#edf4ff] text-[#2f6feb] ring-[#cfe0ff]"
          : "bg-[#f8fafc] text-[#667085] ring-[#dfe5ed]"
      }`}>
        {avatar ? (
          <NativeImage src={avatar} alt={`${name || "审批人"}头像`} className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/28 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="approval-flow-modal-shell relative z-10 flex max-h-[calc(100dvh-40px)] w-[calc(100vw-56px)] max-w-[880px] flex-col overflow-hidden rounded-[10px] border border-[#dfe5ed] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#dfe5ed] bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-[#182230]">审批进度</h3>
              <span className={`inline-flex min-h-[24px] items-center rounded-[7px] border px-2.5 text-xs font-semibold ${headerStatus.className.replace(/ring-/g, "border-")}`}>
                {headerStatus.label}
              </span>
            </div>
            <p className="mt-1 truncate text-xs leading-5 text-[#667085]">{flowSummary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#dce4ef] bg-white text-[#667085] transition-colors hover:border-[#cfe0ff] hover:bg-[#edf4ff] hover:text-[#2f6feb]"
            aria-label="关闭审批详情"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f8fafc]">
          {!approval ? (
            <div className="m-5 rounded-[10px] border border-dashed border-[#dce4ef] bg-white px-5 py-8 text-center">
              <Clock3 className="mx-auto mb-3 h-8 w-8 text-amber-500" />
              <p className="font-semibold text-[#182230]">{item.statusLabel}</p>
              <p className="mt-2 text-sm text-[#667085]">当前款项暂无完整审批流程详情，可能是历史数据或审批流记录尚未同步。</p>
            </div>
          ) : nodeGroups.length === 0 ? (
            <div className="m-5 rounded-[10px] border border-dashed border-[#f0d39c] bg-[#fff7e8] px-5 py-8 text-center text-amber-700">
              <p className="font-semibold">审批流程暂无节点</p>
              <p className="mt-2 text-sm">请检查分公司收款审批流配置。</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 border-b border-[#dfe5ed] bg-[#f8fafc] p-5 md:grid-cols-4">
                <div className="rounded-[10px] border border-[#dce4ef] bg-white px-3.5 py-3">
                  <p className="text-xs font-medium text-[#667085]">审批流程</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{flowName}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce4ef] bg-white px-3.5 py-3">
                  <p className="text-xs font-medium text-[#667085]">当前处理人</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]" title={currentApprovers}>{currentApprovers}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce4ef] bg-white px-3.5 py-3">
                  <p className="text-xs font-medium text-[#667085]">审批进度</p>
                  <p className="mt-1 truncate text-[13px] font-semibold tabular-nums text-[#182230]">{approval.approvedNodes || 0}/{approval.totalNodes || 0}</p>
                </div>
                <div className="rounded-[10px] border border-[#dce4ef] bg-white px-3.5 py-3">
                  <p className="text-xs font-medium text-[#667085]">发起时间</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{formatDateTime(approval.createdAt)}</p>
                </div>
              </div>
              <section className="bg-white">
                <div className="flex items-center justify-between border-b border-[#e6eaf0] px-5 py-3.5">
                  <div>
                    <h4 className="text-sm font-semibold text-[#182230]">审批节点</h4>
                    <p className="mt-0.5 text-xs text-[#667085]">按流程顺序展示审批人和处理记录</p>
                  </div>
                  <span className="text-xs tabular-nums text-[#667085]">共 {nodeGroups.length} 个节点</span>
                </div>

                <div className="px-5 py-1">
                  {nodeGroups.map((node, index) => {
                    const status = getApprovalNodeStatus(node.steps);
                    const meta = nodeMeta(status);
                    const NodeIcon = meta.icon;
                    const approveMode = node.steps[0]?.approveMode === "all" ? "全部人审批" : "任一人审批";
                    const isCurrentNode = status === "pending";

                    return (
                      <div key={`${node.sortOrder}-${node.nodeName}`} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                        <div className="relative flex justify-center pt-4">
                          <span className={`z-10 flex h-7 w-7 items-center justify-center rounded-full text-white ring-4 ring-white ${meta.dotClassName}`}>
                            <NodeIcon className="h-3.5 w-3.5" />
                          </span>
                          {index < nodeGroups.length - 1 && <span className="absolute bottom-0 top-10 w-px bg-[#dfe5ed]" />}
                        </div>

                        <div className={`border-b border-[#edf0f4] py-4 ${index === nodeGroups.length - 1 ? "border-b-0" : ""}`}>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-[#182230]">{index + 1}. {node.nodeName}</span>
                              <span className={`inline-flex min-h-[22px] items-center rounded-[7px] border px-2 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                            </div>
                            <span className="text-xs text-[#667085]">{approveMode}</span>
                          </div>

                          <div className={`divide-y divide-[#e8edf3] border-y border-[#e8edf3] ${isCurrentNode ? "bg-[#f3f7ff]" : "bg-[#f8fafc]"}`}>
                            {node.steps.map((step) => {
                              const stepStatus = step.status === "approved" ? "approved" : step.status === "rejected" ? "rejected" : step.status === "pending" ? "pending" : "waiting";
                              const stepMeta = nodeMeta(stepStatus);
                              const canHandleCurrentStep = step.status === "pending" && String(step.approverId || "") === String(currentUserId || "") && Boolean(onApprovalAction);
                              const approveLoading = processingId === step.id + "approve";
                              const rejectLoading = processingId === step.id + "reject";
                              const timingText = step.actionAt
                                ? `处理时间 ${formatDateTime(step.actionAt)}`
                                : step.status === "pending"
                                  ? "等待当前审批人处理"
                                  : "尚未到达该审批人";

                              return (
                                <div key={step.id} className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex min-w-0 items-start gap-3">
                                    {approvalAvatar(step.approverName, step.approverAvatar, step.status === "pending")}
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-semibold text-[#182230]">{step.approverName || "审批人"}</p>
                                        <span className={`inline-flex min-h-[22px] items-center rounded-[7px] border px-2 text-xs font-medium ${stepMeta.className}`}>{step.statusLabel || stepMeta.label}</span>
                                      </div>
                                      <p className="mt-0.5 text-xs text-[#667085]">{timingText}</p>
                                      {step.signatureUrl && (
                                        <ApprovalSignaturePreview
                                          step={{
                                            signature_url: step.signatureUrl,
                                            signature_name: step.signatureName,
                                            signature_signer_name: step.signatureSignerName,
                                            signature_signed_at: step.signatureSignedAt,
                                          }}
                                          compact
                                        />
                                      )}
                                      {step.comment && (
                                        <p className="mt-2 border-l-2 border-[#cbd5e1] pl-2 text-xs leading-5 text-[#475467]">
                                          审批意见：{step.comment}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {canHandleCurrentStep && (
                                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                                      <button
                                        type="button"
                                        onClick={() => onApprovalAction?.({ stepId: step.id, action: "reject" })}
                                        disabled={Boolean(processingId) || !step.canReject}
                                        className="inline-flex h-8 items-center justify-center rounded-[8px] border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {rejectLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                        驳回
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onApprovalAction?.({ stepId: step.id, action: "approve" })}
                                        disabled={Boolean(processingId)}
                                        className="inline-flex h-8 items-center justify-center rounded-[8px] border border-emerald-600 bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors hover:border-emerald-700 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {approveLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                        同意
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReceiptCollectionModal({
  action,
  onClose,
  onCollected,
}: {
  action: ReceiptActionState;
  onClose: () => void;
  onCollected: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payDate, setPayDate] = useState(toDatetimeLocalValue());
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!action) return;
    setAmount(String(action.item.remainingAmount || ""));
    setPayMethod(action.mode === "online" ? "微信收款" : "银行转账");
    setPayDate(toDatetimeLocalValue());
    setNotes("");
    setMessage("");
    setSaving(false);
  }, [action]);

  if (!action) return null;

  const { item, group, mode } = action;
  const Icon = mode === "online" ? QrCode : HandCoins;
  const title = mode === "online" ? "在线收款" : "手动收款";
  const roomName = textOrDash(group.basicInfo.fullRoomName || group.basicInfo.projectAddress || group.projectName);
  const ratioText = getReceivableRatioText(item, group.receivableAmount);
  const supported = item.categoryKey === "project_payment" || item.categoryKey === "deposit" || item.categoryKey === "design_fee";
  const amountValue = Number(amount);
  const amountInvalid = !Number.isFinite(amountValue) || amountValue <= 0;
  const willAutoAllocate = supported && Number.isFinite(amountValue) && amountValue > item.remainingAmount && item.remainingAmount > 0;
  const payMethods = mode === "online"
    ? ["微信收款", "支付宝", "银行卡"]
    : ["银行转账", "现金", "微信", "支付宝", "刷卡", "其他"];

  const submitReceipt = async () => {
    if (!supported || amountInvalid || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/finance/owner-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          action: "collect",
          itemId: item.id,
          mode,
          amount: amountValue,
          payMethod,
          payDate: payDate ? payDate.replace("T", " ") : "",
          notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "收款保存失败");
      onCollected();
      onClose();
    } catch (err: any) {
      setMessage(err?.message || "收款保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.receiptCollectOverlay} role="dialog" aria-modal="true">
      <div className={styles.receiptCollectModal}>
        <div className={styles.receiptCollectHeader}>
          <div className={styles.receiptCollectTitleGroup}>
            <span className={styles.receiptCollectIcon}>
              <Icon className="h-5 w-5" />
            </span>
            <div className={styles.receiptCollectTitleText}>
              <div className={styles.receiptCollectKicker}>{mode === "online" ? "ONLINE RECEIPT" : "MANUAL RECEIPT"}</div>
              <h3>{title}</h3>
              <p>{item.title} · {roomName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.receiptCollectClose}
            aria-label="关闭收款弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={styles.receiptCollectBody}>
          <section className={styles.receiptCollectHero}>
            <div className={styles.receiptCollectHeroMain}>
              <span className={styles.receiptCollectHeroLabel}>本次待收金额</span>
              <strong className={styles.receiptCollectHeroAmount}>{money(item.remainingAmount)}</strong>
              <span className={styles.receiptCollectHeroMeta}>实际应收 {money(item.actualReceivableAmount)} · 已收 {money(item.receivedAmount)}</span>
            </div>
            <div className={styles.receiptCollectHeroStatus}>
              <span className={`${styles.statusTag} ${statusTagClass(item.statusTone)}`}>{item.statusLabel}</span>
              <span>{item.categoryLabel} / {item.flowLabel}</span>
            </div>
          </section>

          <section className={styles.receiptCollectGrid}>
            <div className={styles.receiptCollectPanel}>
              <div className={styles.receiptCollectPanelHead}>
                <div>
                  <h4>金额核对</h4>
                  <p>保存前确认应收、抵扣、退款与剩余金额。</p>
                </div>
              </div>
              <div className={styles.receiptCollectAmountGrid}>
                <DetailAmount label="应收金额" value={item.receivableAmount} />
                <DetailAmount label="定金抵扣" value={item.depositDeductionAmount} tone={item.depositDeductionAmount > 0 ? "amber" : "default"} />
                <DetailAmount label="变更单退款抵扣" value={item.changeRefundDeductionAmount} tone={item.changeRefundDeductionAmount > 0 ? "amber" : "default"} />
                <DetailAmount label="历史退款金额" value={item.refundAmount} tone={item.refundAmount > 0 ? "red" : "default"} />
              </div>
            </div>

            <div className={styles.receiptCollectPanel}>
              <div className={styles.receiptCollectPanelHead}>
                <div>
                  <h4>客户核对</h4>
                  <p>确保收款对象与业务单据一致。</p>
                </div>
              </div>
              <div className={styles.receiptCollectInfoGrid}>
                <InfoCell icon={UserRound} label="客户姓名" value={textOrDash(group.customerName)} />
                <InfoCell icon={MapPin} label="房号" value={roomName} tone="green" />
                <InfoCell icon={FileText} label="款项类型" value={`${item.categoryLabel} · ${item.flowLabel}`} />
                <InfoCell icon={BadgeDollarSign} label="收款比例" value={ratioText} />
              </div>
            </div>
          </section>

          {!supported && (
            <div className={styles.receiptCollectWarning}>
              当前本页弹窗暂不支持{item.categoryLabel}收款，请走对应业务流程，避免收款记录写错。
            </div>
          )}

          <section className={`${styles.receiptCollectFormSection} ${mode === "online" ? styles.receiptCollectFormWithQr : ""}`}>
            <div className={styles.receiptCollectPanel}>
              <div className={styles.receiptCollectPanelHead}>
                <div>
                  <h4>收款录入</h4>
                  <p>填写到账金额、方式、时间和备注。</p>
                </div>
              </div>
              <div className={styles.receiptCollectFormGrid}>
                <label className={styles.receiptCollectField}>
                  <span className={styles.receiptCollectFieldLabel}>收款金额</span>
                  <span className={styles.receiptCollectMoneyInputWrap}>
                    <span className={styles.receiptCollectMoneyPrefix}>¥</span>
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      disabled={!supported}
                      className={styles.receiptCollectMoneyInput}
                      inputMode="decimal"
                    />
                  </span>
                </label>
                <label className={styles.receiptCollectField}>
                  <span className={styles.receiptCollectFieldLabel}>收款方式</span>
                  <ReceiptMethodDropdown
                    value={payMethod}
                    onChange={setPayMethod}
                    disabled={!supported}
                    options={payMethods}
                  />
                </label>
                <label className={styles.receiptCollectField}>
                  <span className={styles.receiptCollectFieldLabel}>收款时间</span>
                  <SystemDateInput
                    type="datetime-local"
                    value={payDate}
                    onChange={setPayDate}
                    disabled={!supported}
                    className={`${inputControlClass} ${styles.receiptCollectInput} w-full`}
                  />
                </label>
                <label className={styles.receiptCollectField}>
                  <span className={styles.receiptCollectFieldLabel}>备注</span>
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    disabled={!supported}
                    className={`${inputControlClass} ${styles.receiptCollectInput} w-full`}
                    placeholder="可填写流水号、付款说明"
                  />
                </label>
              </div>
              {amountInvalid && supported && (
                <p className="mt-3 text-xs font-bold text-red-600">收款金额必须大于 0。</p>
              )}
              {willAutoAllocate && (
                <p className={styles.receiptCollectHint}>
                  超出当前款项剩余应收的部分，将自动流转到同一合同的后续款项。
                </p>
              )}
              {message && <p className="mt-3 text-xs font-bold text-red-600">{message}</p>}
            </div>

            {mode === "online" && (
              <div className={styles.receiptCollectQrPanel}>
                <span>
                  <QrCode className="h-6 w-6" />
                </span>
                <p>在线收款确认</p>
                <small>客户完成付款后，在这里确认到账并生成收款记录。</small>
              </div>
            )}
          </section>
        </div>

        <div className={styles.receiptCollectFooter}>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>取消</button>
          <button
            type="button"
            onClick={submitReceipt}
            disabled={!supported || amountInvalid || saving}
            className={styles.receiptCollectSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {mode === "online" ? "确认到账" : "保存收款"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProactiveReceiptModal({
  open,
  onClose,
  onCollected,
}: {
  open: boolean;
  onClose: () => void;
  onCollected: (recordType: "deposit" | "design_fee") => void;
}) {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<ProactiveReceiptCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<ProactiveReceiptCustomer | null>(null);
  const [mode, setMode] = useState<"manual" | "qr">("manual");
  const [form, setForm] = useState<ProactiveReceiptForm>(() => defaultProactiveReceiptForm());
  const [collectionRules, setCollectionRules] = useState<ProactiveCollectionRules | null>(null);
  const [formalQuotations, setFormalQuotations] = useState<ProactiveFormalQuotation[]>([]);
  const [actorName, setActorName] = useState("");
  const [voucherByMode, setVoucherByMode] = useState<{ manual: string; qr: string }>({ manual: "", qr: "" });
  const [searching, setSearching] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const debouncedSearch = useDebouncedValue(search, 260);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setCustomers([]);
    setSelectedCustomer(null);
    setMode("manual");
    setForm(defaultProactiveReceiptForm());
    setCollectionRules(null);
    setFormalQuotations([]);
    setActorName("");
    setVoucherByMode({ manual: "", qr: "" });
    setSearching(false);
    setDetailLoading(false);
    setUploading(false);
    setSaving(false);
    setMessage("");
  }, [open]);

  useEffect(() => {
    if (!open || selectedCustomer || !debouncedSearch.trim()) {
      setCustomers([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    fetch(`/api/finance/owner-receipts/proactive?search=${encodeURIComponent(debouncedSearch.trim())}`, {
      headers: getClientAuthHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "客户搜索失败");
        return payload;
      })
      .then((payload) => setCustomers(Array.isArray(payload?.customers) ? payload.customers : []))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setCustomers([]);
        setMessage(err?.message || "客户搜索失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
    });
    return () => controller.abort();
  }, [debouncedSearch, open, selectedCustomer]);

  const selectedCustomerId = selectedCustomer?.id;
  const selectedCustomerAreaSize = selectedCustomer?.areaSize;

  useEffect(() => {
    if (!open || !selectedCustomerId) return;
    const fallbackCustomerId = selectedCustomerId;
    const fallbackCustomerAreaSize = selectedCustomerAreaSize;
    const controller = new AbortController();
    setDetailLoading(true);
    setCollectionRules(null);
    setFormalQuotations([]);
    fetch(`/api/finance/owner-receipts/proactive?customerId=${encodeURIComponent(selectedCustomerId)}`, {
      headers: getClientAuthHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "客户收款资料加载失败");
        return payload;
      })
      .then((payload) => {
        const rules = payload?.collectionRules || {};
        const customer = payload?.customer || { id: fallbackCustomerId, areaSize: fallbackCustomerAreaSize };
        const nextActorName = String(payload?.actorName || "");
        setCollectionRules(rules);
        setFormalQuotations(Array.isArray(payload?.formalQuotations) ? payload.formalQuotations : []);
        setActorName(nextActorName);
        setSelectedCustomer((current) => current?.id === customer.id ? { ...current, ...customer } : current);
        setForm((current) => {
          const receiverName = mode === "qr"
            ? String(rules.paymentAccountName || current.receiver_name || nextActorName || "")
            : String(current.receiver_name || nextActorName || rules.paymentAccountName || "");
          return {
            ...current,
            receiver_name: receiverName,
            design_fee_rate: String(rules.designFeeRate || current.design_fee_rate || 3),
            design_fee_area: current.design_fee_area || (customer.areaSize ? String(customer.areaSize) : ""),
          };
        });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setCollectionRules(null);
        setFormalQuotations([]);
        setMessage(err?.message || "客户收款资料加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [mode, open, selectedCustomerAreaSize, selectedCustomerId]);

  if (!open) return null;

  const isDesignFeeForm = form.record_type === "design_fee";
  const hasReceiptType = form.record_type === "deposit" || form.record_type === "design_fee";
  const paymentLabel = isDesignFeeForm ? "设计费" : form.record_type === "deposit" ? "定金" : "款项";
  const selectedQuotation = formalQuotations.find((quotation) => quotation.id === form.quotation_id) || null;
  const quotationAmount = selectedQuotation ? toMoney(getQuotationAmount(selectedQuotation)) : Number(form.quotation_amount || 0);
  const quotationDirectAmount = selectedQuotation ? getQuotationDirectAmount(selectedQuotation) : Number(form.design_fee_base_amount || 0);
  const designFeeBaseAmount = form.design_fee_mode === "direct_fee_ratio" ? quotationDirectAmount : quotationAmount;
  const designFeeRate = Number(form.design_fee_rate || 0);
  const designFeeArea = Number(form.design_fee_area || 0);
  const designFeeUnitPrice = Number(form.design_fee_unit_price || 0);
  const computedDesignFeeAmount = isDesignFeeForm
    ? isQuotationBasedDesignFeeMode(form.design_fee_mode) && designFeeBaseAmount > 0 && designFeeRate > 0
      ? toMoney(designFeeBaseAmount * designFeeRate / 100)
      : form.design_fee_mode === "designer_level_area" && designFeeArea > 0 && designFeeUnitPrice > 0
        ? toMoney(designFeeArea * designFeeUnitPrice)
        : 0
    : 0;
  const amountValue = Number(isDesignFeeForm ? (form.receivable_amount || form.amount) : form.amount);
  const amountInvalid = !Number.isFinite(amountValue) || amountValue <= 0;

  const switchMode = (nextMode: "manual" | "qr") => {
    setMode(nextMode);
    setForm((current) => ({
      ...current,
      payment_channel: nextMode === "qr" ? "扫码支付" : current.payment_channel === "扫码支付" ? "微信" : current.payment_channel,
      receiver_name: nextMode === "qr"
        ? String(collectionRules?.paymentAccountName || current.receiver_name || actorName || "")
        : String(actorName || current.receiver_name || collectionRules?.paymentAccountName || ""),
      voucher_url: voucherByMode[nextMode],
    }));
    setMessage("");
  };

  const switchRecordType = (nextType: "deposit" | "design_fee") => {
    setForm(defaultProactiveReceiptForm(
      form.receiver_name,
      nextType,
      collectionRules?.designFeeRate || form.design_fee_rate || 3,
      selectedCustomer?.areaSize || form.design_fee_area || "",
    ));
    setVoucherByMode({ manual: "", qr: "" });
    setMessage("");
  };

  const applyDesignFeeQuotation = (quotationId: string, rateValue = form.design_fee_rate, modeValue = form.design_fee_mode) => {
    const quotation = formalQuotations.find((item) => item.id === quotationId);
    const quoteAmount = quotation ? toMoney(getQuotationAmount(quotation)) : 0;
    const directAmount = quotation ? getQuotationDirectAmount(quotation) : 0;
    const baseAmount = modeValue === "direct_fee_ratio" ? directAmount : quoteAmount;
    const rate = Number(rateValue || 0);
    const feeAmount = baseAmount > 0 && rate > 0 ? toMoney(baseAmount * rate / 100) : 0;
    setForm((current) => ({
      ...current,
      quotation_id: quotationId,
      quotation_amount: quoteAmount ? String(quoteAmount) : "",
      design_fee_base_amount: baseAmount ? String(baseAmount) : "",
      design_fee_rate: String(rateValue || ""),
      receivable_amount: feeAmount ? String(feeAmount) : "",
      amount: feeAmount ? String(feeAmount) : current.amount,
    }));
  };

  const updateDesignFeeMode = (nextMode: string) => {
    setForm((current) => {
      const defaultArea = current.design_fee_area || (selectedCustomer?.areaSize ? String(selectedCustomer.areaSize) : "");
      const defaultLevel = current.designer_level || designerLevelPriceOptions[0].level;
      const defaultUnitPrice = current.design_fee_unit_price || String(getDesignerLevelDefaultPrice(defaultLevel) || "");
      const next = {
        ...current,
        design_fee_mode: nextMode,
        quotation_id: isQuotationBasedDesignFeeMode(nextMode) ? current.quotation_id : "",
        quotation_amount: isQuotationBasedDesignFeeMode(nextMode) ? current.quotation_amount : "",
        design_fee_base_amount: isQuotationBasedDesignFeeMode(nextMode) ? current.design_fee_base_amount : "",
        design_fee_area: nextMode === "designer_level_area" ? defaultArea : "",
        design_fee_unit_price: nextMode === "designer_level_area" ? defaultUnitPrice : "",
        designer_level: nextMode === "designer_level_area" ? defaultLevel : "",
        receivable_amount: isAutoCalculatedDesignFeeMode(nextMode) ? "" : current.receivable_amount || current.amount,
      };
      if (isQuotationBasedDesignFeeMode(nextMode) && current.quotation_id) {
        const quotation = formalQuotations.find((item) => item.id === current.quotation_id);
        const quoteAmount = quotation ? toMoney(getQuotationAmount(quotation)) : Number(current.quotation_amount || 0);
        const directAmount = quotation ? getQuotationDirectAmount(quotation) : Number(current.design_fee_base_amount || 0);
        const baseAmount = nextMode === "direct_fee_ratio" ? directAmount : quoteAmount;
        const rate = Number(current.design_fee_rate || 0);
        const feeAmount = baseAmount > 0 && rate > 0 ? toMoney(baseAmount * rate / 100) : 0;
        next.quotation_amount = quoteAmount ? String(quoteAmount) : "";
        next.design_fee_base_amount = baseAmount ? String(baseAmount) : "";
        next.receivable_amount = feeAmount ? String(feeAmount) : "";
        next.amount = feeAmount ? String(feeAmount) : current.amount;
      } else if (nextMode === "designer_level_area") {
        const area = Number(defaultArea || 0);
        const unitPrice = Number(defaultUnitPrice || 0);
        const feeAmount = area > 0 && unitPrice > 0 ? toMoney(area * unitPrice) : 0;
        next.receivable_amount = feeAmount ? String(feeAmount) : "";
        next.amount = feeAmount ? String(feeAmount) : current.amount;
      }
      return next;
    });
  };

  const handleVoucherUpload = async (file?: File | null) => {
    if (!file || !selectedCustomer || !hasReceiptType || uploading) return;
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customer_id", selectedCustomer.id);
      formData.append("category", isDesignFeeForm ? "设计费凭证" : "定金凭证");
      const response = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "上传失败");
      const fileUrl = payload.file_url || "";
      setVoucherByMode((current) => ({ ...current, [mode]: fileUrl }));
      setForm((current) => ({ ...current, voucher_url: fileUrl }));
      setMessage("收款凭证已上传");
    } catch (err: any) {
      setMessage(err?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCustomer || saving || detailLoading) return;
    if (!hasReceiptType) {
      setMessage("请先选择收款类型：定金或设计费");
      return;
    }
    const submittedRecordType: "deposit" | "design_fee" = form.record_type === "design_fee" ? "design_fee" : "deposit";
    if (amountInvalid) return;
    if (isDesignFeeForm) {
      if (isQuotationBasedDesignFeeMode(form.design_fee_mode) && !form.quotation_id) {
        setMessage("请选择用于计算设计费的正式报价");
        return;
      }
      if (form.design_fee_mode === "designer_level_area" && (!form.designer_level || designFeeArea <= 0 || designFeeUnitPrice <= 0)) {
        setMessage("请完整填写设计师等级、计费面积和等级单价");
        return;
      }
    }
    if (!form.received_at) {
      setMessage("请选择收款时间");
      return;
    }
    if (mode === "qr" && !collectionRules?.paymentQrCodeUrl) {
      setMessage("当前分公司未配置收款码，请先到分公司设置中配置");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/finance/owner-receipts/proactive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          ...form,
          customerId: selectedCustomer.id,
          recordType: form.record_type,
          amount: amountValue,
          receivable_amount: isDesignFeeForm ? Number(form.receivable_amount || amountValue) : amountValue,
          quotation_amount: isDesignFeeForm ? Number(form.quotation_amount || 0) : undefined,
          design_fee_base_amount: isDesignFeeForm ? Number(form.design_fee_base_amount || 0) : undefined,
          design_fee_rate: isDesignFeeForm ? Number(form.design_fee_rate || 0) : undefined,
          design_fee_area: isDesignFeeForm ? Number(form.design_fee_area || 0) : undefined,
          design_fee_unit_price: isDesignFeeForm ? Number(form.design_fee_unit_price || 0) : undefined,
          designer_level: isDesignFeeForm ? form.designer_level : undefined,
          method: mode,
          payment_channel: mode === "qr" ? "扫码支付" : form.payment_channel,
          payMethod: mode === "qr" ? "扫码支付" : form.payment_channel,
          payDate: form.received_at ? form.received_at.replace("T", " ") : "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "主动收款保存失败");
      onCollected(submittedRecordType);
      onClose();
    } catch (err: any) {
      setMessage(err?.message || "主动收款保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a]/28 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="proactive-receipt-title">
      <div className="absolute inset-0" onClick={() => !saving && onClose()} />
      <div className="relative z-10 flex h-[760px] max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-none border border-[#E5EAF2] bg-white shadow-none">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-[#CDD9FF] bg-[#EDF4FF] text-[#407AFF]">
              {mode === "qr" ? <QrCode className="h-5 w-5" /> : <WalletCards className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <h3 id="proactive-receipt-title" className="text-base font-black text-[#162033]">主动收款</h3>
              <p className="mt-0.5 text-xs font-semibold text-[#7c8aa0]">财务直接登记定金或设计费，信息结构与客户款项记录保持一致。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[#E5EAF2] bg-white text-[#52647b] transition hover:border-[#CDD9FF] hover:bg-[#EDF4FF] hover:text-[#407AFF] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="关闭主动收款弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          <div className="grid grid-cols-2 gap-px rounded-none border border-[#E5EAF2] bg-[#E5EAF2] p-0">
            <button
              type="button"
              onClick={() => switchMode("manual")}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-none text-sm font-semibold transition ${
                mode === "manual" ? "bg-white text-[#162033]" : "bg-[#F8FAFC] text-[#7c8aa0] hover:bg-white hover:text-[#407AFF]"
              }`}
            >
              <WalletCards className="h-4 w-4" />
              手动记录
            </button>
            <button
              type="button"
              onClick={() => switchMode("qr")}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-none text-sm font-semibold transition ${
                mode === "qr" ? "bg-white text-[#162033]" : "bg-[#F8FAFC] text-[#7c8aa0] hover:bg-white hover:text-[#407AFF]"
              }`}
            >
              <QrCode className="h-4 w-4" />
              扫码支付
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
          <div className="grid min-h-[500px] gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col rounded-none border border-[#E5EAF2] bg-[#F8FAFC] p-4">
              <div className="relative">
                <label className="mb-1.5 block text-xs font-black text-[#52647b]">客户</label>
            {selectedCustomer ? (
              <div className="flex min-h-11 items-center gap-3 rounded-none border border-[#CDD9FF] bg-white px-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-[#EDF4FF] text-xs font-black text-[#407AFF]">{selectedCustomer.name.slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-[#162033]">{selectedCustomer.name}</p>
                  <p className="truncate text-xs font-semibold text-[#7c8aa0]">{selectedCustomer.fullRoomName} · {selectedCustomer.serviceStore}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  disabled={saving}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-[#7c8aa0] transition hover:bg-[#EDF4FF] hover:text-[#407AFF] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="重新选择客户"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-[#8a98ad]" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setMessage("");
                  }}
                  className={`${inputControlClass} w-full pl-10`}
                  placeholder="搜索客户姓名或完整房号"
                  autoComplete="off"
                />
                {(searching || customers.length > 0 || (debouncedSearch.trim() && !searching)) && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-none border border-[#E5EAF2] bg-white p-1 shadow-none">
                    {searching ? (
                      <div className="flex h-11 items-center justify-center gap-2 text-xs font-bold text-[#7c8aa0]">
                        <Loader2 className="h-4 w-4 animate-spin text-[#407AFF]" />
                        正在搜索
                      </div>
                    ) : customers.length > 0 ? customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setSearch("");
                          setCustomers([]);
                          setMessage("");
                        }}
                        className="flex min-h-12 w-full items-center gap-3 rounded-none px-3 text-left transition hover:bg-[#F8FAFC]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-[#EDF4FF] text-xs font-black text-[#407AFF]">{customer.name.slice(0, 1)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-[#162033]">{customer.name}</span>
                          <span className="block truncate text-xs font-semibold text-[#7c8aa0]">{customer.fullRoomName} · {customer.serviceStore}</span>
                        </span>
                      </button>
                    )) : (
                      <div className="px-3 py-3 text-xs font-semibold text-[#7c8aa0]">没有找到匹配客户</div>
                    )}
                  </div>
                )}
              </>
            )}
              </div>

              {mode === "qr" ? (
                <div className="mt-4 flex-1">
                  {collectionRules?.paymentQrCodeUrl ? (
                    <div className="rounded-none border border-[#E5EAF2] bg-white p-4">
                      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-none bg-white">
                        <NativeImage src={collectionRules.paymentQrCodeUrl} alt="分公司收款码" className="max-h-full max-w-full object-contain" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[238px] flex-col items-center justify-center rounded-none border border-dashed border-red-200 bg-red-50 text-center text-red-600">
                      <QrCode className="mb-3 h-10 w-10" />
                      <p className="text-sm font-black">未配置收款码</p>
                      <p className="mt-1 max-w-52 text-xs font-semibold leading-5">请先到分公司设置中配置收款码，或切换为手动记录。</p>
                    </div>
                  )}
                  <div className="mt-3 grid gap-2">
                    <div className="rounded-none border border-[#E5EAF2] bg-white px-3 py-2">
                      <p className="text-xs font-bold text-[#7c8aa0]">收款码名称</p>
                      <p className="mt-0.5 font-black text-[#162033]">{collectionRules?.paymentQrCodeName || "分公司收款码"}</p>
                    </div>
                    <div className="rounded-none border border-[#E5EAF2] bg-white px-3 py-2">
                      <p className="text-xs font-bold text-[#7c8aa0]">收款账户/收款人</p>
                      <p className="mt-0.5 font-black text-[#162033]">{collectionRules?.paymentAccountName || form.receiver_name || "-"}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex-1">
                  <div className="rounded-none border border-[#E5EAF2] bg-white p-4">
                    <p className="text-xs font-bold text-[#7c8aa0]">本次{paymentLabel}实收</p>
                    <p className="mt-2 text-3xl font-black tabular-nums text-red-600">{amountValue > 0 ? money(amountValue) : "0.00"}</p>
                    {isDesignFeeForm && (
                      <p className="mt-2 text-xs font-bold text-[#7c8aa0]">应收 {money(Number(form.receivable_amount || form.amount || 0))}</p>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="rounded-none border border-[#E5EAF2] bg-white px-3 py-2">
                      <p className="text-xs font-bold text-[#7c8aa0]">收款方式</p>
                      <p className="mt-0.5 font-black text-[#162033]">{form.payment_channel || "-"}</p>
                    </div>
                    <div className="rounded-none border border-[#E5EAF2] bg-white px-3 py-2">
                      <p className="text-xs font-bold text-[#7c8aa0]">款项说明</p>
                      <p className="mt-0.5 font-black text-[#162033]">{form.deposit_type || "-"}</p>
                    </div>
                    {isDesignFeeForm && (
                      <div className="rounded-none border border-[#E5EAF2] bg-white px-3 py-2">
                        <p className="text-xs font-bold text-[#7c8aa0]">计算方式</p>
                        <p className="mt-0.5 font-black text-[#162033]">{getDesignFeeModeLabel(form.design_fee_mode)}</p>
                      </div>
                    )}
                    <div className="rounded-none border border-[#E5EAF2] bg-white px-3 py-2">
                      <p className="text-xs font-bold text-[#7c8aa0]">收款时间</p>
                      <p className="mt-0.5 font-black text-[#162033]">{form.received_at ? formatDateTime(form.received_at) : "-"}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-none border border-[#CDD9FF] bg-[#EDF4FF] px-3 py-2 text-xs font-bold leading-5 text-[#407AFF]">
                {isDesignFeeForm
                  ? "设计费为独立设计服务收入，不抵扣工程款；如启用审批，审批通过后计入已收款。"
                  : "保存后生成定金流水；如分公司启用收款审批，审批通过后再同步客户进度。"}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-4">
              <section className={`rounded-none border p-3 ${hasReceiptType ? "border-[#CDD9FF] bg-[#F8FAFC]" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-black text-[#162033]">
                      收款类型 <span className="text-red-600">*</span>
                    </p>
                    <p className={`mt-1 text-xs font-semibold ${hasReceiptType ? "text-[#7c8aa0]" : "text-amber-700"}`}>
                      请先确认本次收的是定金还是设计费，选错会影响客户款项记录。
                    </p>
                  </div>
                  {!hasReceiptType && (
                    <span className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-none border border-amber-200 bg-white px-3 text-xs font-black text-amber-700">
                      必须选择
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([
                    { key: "deposit", label: "定金", helper: "订金、意向金、合同定金" },
                    { key: "design_fee", label: "设计费", helper: "独立设计服务收入" },
                  ] as const).map((option) => {
                    const active = form.record_type === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => switchRecordType(option.key)}
                        className={`flex min-h-[64px] items-center justify-between gap-3 rounded-none border px-4 text-left transition ${
                          active
                            ? "border-[#407AFF] bg-[#407AFF] text-white"
                            : "border-[#dce8f8] bg-white text-[#162033] hover:border-[#cfe1ff] hover:bg-[#f4f8ff]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-black">{option.label}</span>
                          <span className={`mt-1 block truncate text-xs font-semibold ${active ? "text-white/75" : "text-[#7c8aa0]"}`}>{option.helper}</span>
                        </span>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-none ${active ? "bg-white text-[#407AFF]" : "bg-[#EDF4FF] text-[#8a98ad]"}`}>
                          {active ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                {isDesignFeeForm && (
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-[#52647b]">设计费计算方式</span>
                    <SystemSelect
                      value={form.design_fee_mode}
                      onChange={(event) => updateDesignFeeMode(event.target.value)}
                      className={`${inputControlClass} w-full py-0`}
                    >
                      {designFeeCalculationModes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </SystemSelect>
                  </label>
                )}
                {isDesignFeeForm && isQuotationBasedDesignFeeMode(form.design_fee_mode) && (
                  <>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">关联正式报价 <span className="text-red-600">*</span></span>
                      <SystemSelect
                        value={form.quotation_id}
                        onChange={(event) => applyDesignFeeQuotation(event.target.value, form.design_fee_rate, form.design_fee_mode)}
                        className={`${inputControlClass} w-full py-0`}
                      >
                        <option value="">请选择正式报价</option>
                        {formalQuotations.map((quotation) => (
                          <option key={quotation.id} value={quotation.id}>
                            {quotation.title || "装修报价单"} · 合计 {money(getQuotationAmount(quotation))} · 直接费 {money(getQuotationDirectAmount(quotation))}
                          </option>
                        ))}
                      </SystemSelect>
                      {formalQuotations.length === 0 && (
                        <p className="mt-1 text-xs font-bold text-amber-600">当前客户暂无正式报价，无法按报价或直接费比例计算设计费。</p>
                      )}
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">{form.design_fee_mode === "direct_fee_ratio" ? "直接费基数" : "报价合计"}</span>
                      <input value={designFeeBaseAmount ? money(designFeeBaseAmount) : ""} readOnly className={`${inputControlClass} w-full bg-[#f8fbff] text-[#7c8aa0]`} placeholder="选择报价后自动带出" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">设计费比例（%） <span className="text-red-600">*</span></span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.design_fee_rate}
                        onChange={(event) => {
                          const rate = event.target.value;
                          if (form.quotation_id) applyDesignFeeQuotation(form.quotation_id, rate, form.design_fee_mode);
                          else setForm((current) => ({ ...current, design_fee_rate: rate }));
                        }}
                        className={`${inputControlClass} w-full`}
                        placeholder="例如：3"
                      />
                    </label>
                  </>
                )}
                {isDesignFeeForm && form.design_fee_mode === "designer_level_area" && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">设计师等级 <span className="text-red-600">*</span></span>
                      <SystemSelect
                        value={form.designer_level}
                        onChange={(event) => {
                          const level = event.target.value;
                          const defaultUnitPrice = getDesignerLevelDefaultPrice(level);
                          setForm((current) => {
                            const unitPrice = defaultUnitPrice > 0 ? defaultUnitPrice : Number(current.design_fee_unit_price || 0);
                            const area = Number(current.design_fee_area || 0);
                            const feeAmount = area > 0 && unitPrice > 0 ? toMoney(area * unitPrice) : 0;
                            return {
                              ...current,
                              designer_level: level,
                              design_fee_unit_price: unitPrice ? String(unitPrice) : "",
                              receivable_amount: feeAmount ? String(feeAmount) : "",
                              amount: feeAmount ? String(feeAmount) : current.amount,
                            };
                          });
                        }}
                        className={`${inputControlClass} w-full py-0`}
                      >
                        <option value="">请选择设计师等级</option>
                        {designerLevelPriceOptions.map((item) => (
                          <option key={item.level} value={item.level}>{item.level}{item.unitPrice ? ` · ${item.unitPrice}元/㎡` : ""}</option>
                        ))}
                      </SystemSelect>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">计费面积（㎡） <span className="text-red-600">*</span></span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.design_fee_area}
                        onChange={(event) => {
                          const areaValue = event.target.value;
                          const unitPrice = Number(form.design_fee_unit_price || 0);
                          const feeAmount = Number(areaValue || 0) > 0 && unitPrice > 0 ? toMoney(Number(areaValue) * unitPrice) : 0;
                          setForm((current) => ({ ...current, design_fee_area: areaValue, receivable_amount: feeAmount ? String(feeAmount) : "", amount: feeAmount ? String(feeAmount) : current.amount }));
                        }}
                        className={`${inputControlClass} w-full`}
                        placeholder="默认取客户装修面积"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">等级单价（元/㎡） <span className="text-red-600">*</span></span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.design_fee_unit_price}
                        onChange={(event) => {
                          const priceValue = event.target.value;
                          const area = Number(form.design_fee_area || 0);
                          const feeAmount = area > 0 && Number(priceValue || 0) > 0 ? toMoney(area * Number(priceValue)) : 0;
                          setForm((current) => ({ ...current, design_fee_unit_price: priceValue, receivable_amount: feeAmount ? String(feeAmount) : "", amount: feeAmount ? String(feeAmount) : current.amount }));
                        }}
                        className={`${inputControlClass} w-full`}
                        placeholder="例如：120"
                      />
                    </label>
                  </>
                )}
                {isDesignFeeForm && (
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-[#52647b]">应收设计费（元） <span className="text-red-600">*</span></span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.receivable_amount}
                      onChange={(event) => setForm((current) => ({ ...current, receivable_amount: event.target.value, amount: event.target.value }))}
                      className={`${inputControlClass} w-full ${isAutoCalculatedDesignFeeMode(form.design_fee_mode) ? "bg-[#f8fbff] text-[#7c8aa0]" : ""}`}
                      readOnly={isAutoCalculatedDesignFeeMode(form.design_fee_mode)}
                      placeholder={isAutoCalculatedDesignFeeMode(form.design_fee_mode) ? "填写计算条件后自动计算" : "例如：3000"}
                    />
                    {isAutoCalculatedDesignFeeMode(form.design_fee_mode) && computedDesignFeeAmount > 0 && (
                      <p className="mt-1 text-xs font-semibold text-[#7c8aa0]">
                        系统按{form.design_fee_mode === "direct_fee_ratio" ? "直接费 × 比例" : form.design_fee_mode === "designer_level_area" ? "等级单价 × 面积" : "报价合计 × 比例"}自动计算，实收设计费同步应收金额。
                      </p>
                    )}
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-[#52647b]">{isDesignFeeForm ? "实收设计费" : form.record_type === "deposit" ? "定金金额" : "收款金额"}（元） <span className="text-red-600">*</span></span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={isDesignFeeForm ? (form.receivable_amount || form.amount) : form.amount}
                    onChange={(event) => {
                      if (isDesignFeeForm || !hasReceiptType) return;
                      setForm((current) => ({ ...current, amount: event.target.value }));
                    }}
                    readOnly={isDesignFeeForm || !hasReceiptType}
                    className={`${inputControlClass} w-full text-right tabular-nums ${isDesignFeeForm || !hasReceiptType ? "bg-[#f8fbff] text-[#7c8aa0]" : ""}`}
                    placeholder={!hasReceiptType ? "请先选择收款类型" : isDesignFeeForm ? "例如：3000" : "例如：5000"}
                  />
                  {isDesignFeeForm && <p className="mt-1 text-xs font-semibold text-[#7c8aa0]">实收设计费自动等于应收设计费，避免绕过设计费计算规则。</p>}
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-[#52647b]">收款时间 <span className="text-red-600">*</span></span>
                  <SystemDateInput
                    type="datetime-local"
                    value={form.received_at}
                    onChange={(nextValue) => setForm((current) => ({ ...current, received_at: nextValue }))}
                    className={`${inputControlClass} w-full`}
                  />
                </label>
                {mode === "manual" ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-[#52647b]">收款方式 <span className="text-red-600">*</span></span>
                    <SystemSelect
                      value={form.payment_channel}
                      onChange={(event) => setForm((current) => ({ ...current, payment_channel: event.target.value }))}
                      className={`${inputControlClass} w-full py-0`}
                    >
                      {depositPaymentChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </SystemSelect>
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-[#52647b]">收款方式</span>
                    <input value="扫码支付" readOnly className={`${inputControlClass} w-full bg-[#f8fbff] text-[#7c8aa0]`} />
                  </label>
                )}
                {hasReceiptType && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">{isDesignFeeForm ? "设计费类型" : "定金类型"} <span className="text-red-600">*</span></span>
                      <SystemSelect
                        value={form.deposit_type}
                        onChange={(event) => setForm((current) => ({ ...current, deposit_type: event.target.value }))}
                        className={`${inputControlClass} w-full py-0`}
                      >
                        {(isDesignFeeForm ? designFeeTypes : depositTypes).map((item) => <option key={item} value={item}>{item}</option>)}
                      </SystemSelect>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-[#52647b]">是否可退</span>
                      <SystemSelect
                        value={form.is_refundable ? "1" : "0"}
                        onChange={(event) => setForm((current) => ({ ...current, is_refundable: event.target.value === "1" }))}
                        className={`${inputControlClass} w-full py-0`}
                      >
                        <option value="0">不可退</option>
                        <option value="1">可退</option>
                      </SystemSelect>
                    </label>
                  </>
                )}
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-[#52647b]">收款人</span>
                  <input
                    value={form.receiver_name}
                    onChange={(event) => setForm((current) => ({ ...current, receiver_name: event.target.value }))}
                    className={`${inputControlClass} w-full`}
                    placeholder={mode === "qr" ? "默认取分公司收款账户" : "例如：张三"}
                  />
                </label>
                <div className="md:col-span-2">
                  <span className="mb-1 block text-sm font-bold text-[#52647b]">收款凭证</span>
                  <div className="flex flex-col gap-3 rounded-none border border-[#E5EAF2] bg-white px-3 py-3 sm:flex-row sm:items-center">
                    <label className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-none border border-[#E5EAF2] bg-white px-3.5 text-sm font-bold text-[#52647b] transition hover:border-[#CDD9FF] hover:bg-[#EDF4FF] hover:text-[#407AFF] ${!selectedCustomer || !hasReceiptType || uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? "上传中..." : "上传凭证"}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        disabled={!selectedCustomer || !hasReceiptType || uploading}
                        onChange={(event) => handleVoucherUpload(event.target.files?.[0])}
                      />
                    </label>
                    <div className="min-w-0 flex-1 text-sm font-semibold text-[#7c8aa0]">
                      {form.voucher_url ? (
                        <a href={form.voucher_url} target="_blank" rel="noreferrer" className="font-black text-[#407AFF] hover:text-[#001f73]">
                          已上传凭证，点击查看
                        </a>
                      ) : (
                        "支持付款截图或 PDF，便于后续财务复核"
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <label className="flex min-h-[132px] flex-1 flex-col">
                <span className="mb-1 block text-sm font-bold text-[#52647b]">备注</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className={`${inputControlClass} min-h-0 flex-1 resize-none py-3`}
                  placeholder="例如：客户已支付设计定金，后续安排量房。"
                  maxLength={500}
                />
              </label>
            </div>
          </div>

          {detailLoading && (
            <div className="mt-4 flex h-10 items-center justify-center gap-2 rounded-none border border-[#E5EAF2] bg-[#F8FAFC] text-xs font-bold text-[#7c8aa0]">
              <Loader2 className="h-4 w-4 animate-spin text-[#407AFF]" />
              正在加载客户收款资料
            </div>
          )}
          {amountInvalid && (form.amount || form.receivable_amount) && <p className="mt-4 text-xs font-bold text-red-600">收款金额必须大于 0。</p>}
          {message && (
            <p className={`mt-4 rounded-none border px-3 py-2 text-xs font-bold ${
              message.includes("已上传") ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
            }`}>
              {message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClass}>取消</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedCustomer || !hasReceiptType || amountInvalid || saving || detailLoading || uploading || (mode === "qr" && !collectionRules?.paymentQrCodeUrl)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-none bg-[#407AFF] px-4 text-sm font-black text-white transition hover:bg-[#2F66E8] disabled:cursor-not-allowed disabled:bg-[#a8b6d8]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "保存中..." : hasReceiptType ? `确认收${paymentLabel}` : "先选择收款类型"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LedgerAmountCell({ item }: { item: ReceiptLedgerItem }) {
  const isDeduction = item.direction === "refund" || item.direction === "reversal";
  const toneClass = item.direction === "refund" ? "text-red-600" : item.direction === "reversal" ? "text-[#52647b]" : "text-emerald-700";
  const prefix = isDeduction ? "-" : "+";
  return <p className={`whitespace-nowrap text-right text-sm font-black tabular-nums ${toneClass}`}>{prefix}{money(item.amount)}</p>;
}

export function ReceiptVoucherCell({ value }: { value?: string | null }) {
  const text = String(value || "").trim();
  if (!text) return <span className="text-xs font-semibold text-[#9aa8bb]">-</span>;
  const isLink = /^(https?:\/\/|\/|data:)/i.test(text);

  if (isLink) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full items-center justify-center rounded-[8px] bg-[#EDF4FF] px-2 py-1 text-xs font-black text-[#407AFF] transition hover:bg-[#dfe8ff]"
      >
        查看凭证
      </a>
    );
  }

  return <span className="block truncate text-xs font-semibold text-[#52647b]" title={text}>{text}</span>;
}

export function ReversalButton({ item, onOpen }: { item: ReceiptLedgerItem; onOpen: (item: ReceiptLedgerItem) => void }) {
  if (item.canReverse) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="inline-flex h-8 items-center justify-center gap-1 rounded-[9px] border border-[#dce8f8] bg-white px-2.5 text-xs font-black text-[#52647b] transition hover:border-red-100 hover:bg-red-50 hover:text-red-600"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        冲销
      </button>
    );
  }
  if (item.reversedAt || item.statusLabel === "已冲销") {
    return <span className="text-xs font-black text-[#8a98ad]">已冲销</span>;
  }
  return <span className="text-xs font-semibold text-[#9aa8bb]">-</span>;
}

export function ReceiptReversalModal({
  action,
  onClose,
  onReversed,
}: {
  action: ReversalActionState;
  onClose: () => void;
  onReversed: () => void;
}) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!action) return;
    setReason("");
    setMessage("");
    setSaving(false);
  }, [action]);

  if (!action) return null;

  const { item, group } = action;
  const reasonInvalid = reason.trim().length === 0;
  const submitReversal = async () => {
    if (!item.canReverse || reasonInvalid || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/finance/owner-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          action: "reverse",
          ledgerId: item.id,
          reason: reason.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "冲销失败");
      onReversed();
      onClose();
    } catch (err: any) {
      setMessage(err?.message || "冲销失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/28 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="flex max-h-[calc(100vh-48px)] w-full max-w-[620px] flex-col overflow-hidden rounded-[14px] border border-white/80 bg-white shadow-[0_22px_60px_rgba(21,35,62,0.18)]">
        <div className="flex items-center justify-between gap-4 border-b border-[#e7eff9] bg-[#f8fbff] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-red-50 text-red-600 ring-1 ring-red-100">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-[#162033]">财务冲销</h3>
              <p className="mt-0.5 truncate text-xs font-semibold text-[#7c8aa0]">{item.title} · {textOrDash(group.customerName)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#dce8f8] bg-white text-[#52647b] transition hover:bg-[#EDF4FF] hover:text-[#407AFF]"
            aria-label="关闭冲销弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InfoCell icon={BadgeDollarSign} label="冲销金额" value={money(item.amount)} />
            <InfoCell icon={FileText} label="收款方式" value={textOrDash(item.method)} />
            <InfoCell icon={CalendarDays} label="原流水时间" value={formatDateTime(item.occurredAt)} />
          </div>
          <div className="rounded-[12px] border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-700">
            冲销会新增一笔反向流水抵减原收款，原收款记录会保留并标记为已冲销。
          </div>
          <label className="block">
            <span className="text-xs font-black text-[#52647b]">冲销原因</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={`${inputControlClass} mt-1 min-h-[96px] w-full resize-none py-2 leading-5`}
              placeholder="请填写冲销原因，例如：收款录错、重复入账、客户付款撤回"
            />
          </label>
          {reasonInvalid && <p className="text-xs font-bold text-red-600">请填写冲销原因，便于后续财务追溯。</p>}
          {message && <p className="text-xs font-bold text-red-600">{message}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e7eff9] bg-white px-5 py-4">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>取消</button>
          <button
            type="button"
            onClick={submitReversal}
            disabled={reasonInvalid || saving || !item.canReverse}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            确认冲销
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReceiptLedgerSection({ group, onOpenReverse }: { group: ProjectReceiptGroup; onOpenReverse: (item: ReceiptLedgerItem) => void }) {
  const ledgerItems = group.ledgerItems || [];
  const receiptAmount = ledgerItems
    .filter((item) => item.direction === "receipt")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const refundAmount = ledgerItems
    .filter((item) => item.direction === "refund")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const reversalAmount = ledgerItems
    .filter((item) => item.direction === "reversal")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <section className={`${styles.detailPanel} ${styles.ledgerSection}`}>
      <div className={styles.detailSectionHeader}>
        <div>
          <h2 className={styles.detailSectionTitle}>款项流水</h2>
          <p className={styles.detailSectionDescription}>当前订单已发生的收款、退款和冲销流水。</p>
        </div>
        <div className={styles.detailSummaryTags}>
          <span className={styles.summaryTagBlue}>共 {ledgerItems.length} 笔</span>
          <span className={styles.summaryTagGreen}>收款 {money(receiptAmount)}</span>
          <span className={styles.summaryTagNeutral}>冲销 {money(reversalAmount)}</span>
          <span className={styles.summaryTagRed}>退款 {money(refundAmount)}</span>
        </div>
      </div>

      {ledgerItems.length === 0 ? (
        <div className={styles.detailSectionEmpty}>
          暂无款项流水
        </div>
      ) : (
        <ThinScrollArea className={styles.detailTableScroller}>
          <table className={`${styles.detailTable} ${styles.ledgerTable}`}>
            <colgroup>
              <col style={{ width: 132 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 126 }} />
              <col style={{ width: 118 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 168 }} />
              <col style={{ width: 98 }} />
              <col style={{ width: 220 }} />
            </colgroup>
            <thead className={tableHeaderClass}>
              <tr>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">流水时间</th>
                <th className="border-b border-r border-[#e7eff9] px-4 py-3 text-left">款项</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">类型</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">金额</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">收款方式</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">经办人</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">收款凭证</th>
                <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">操作</th>
                <th className="border-b border-[#e7eff9] px-4 py-3 text-left">备注</th>
              </tr>
            </thead>
            <tbody>
              {ledgerItems.map((item) => (
                <tr key={item.id} className={tableRowClass}>
                  <td className="whitespace-nowrap border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                    {formatDateTime(item.occurredAt)}
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-4 py-3 align-middle">
                    <p className="truncate font-black text-[#162033]" title={item.title}>{item.title}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[#8a98ad]">{item.flowLabel}</p>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                    <span className={`${styles.statusTag} ${statusTagClass(item.statusTone)}`}>
                      {item.statusLabel}
                    </span>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><LedgerAmountCell item={item} /></td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                    <span className="block truncate" title={item.method || "-"}>{item.method || "-"}</span>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                    <span className="block truncate" title={item.operator || "-"}>{item.operator || "-"}</span>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                    <ReceiptVoucherCell value={item.receiptVoucher} />
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                    <ReversalButton item={item} onOpen={onOpenReverse} />
                  </td>
                  <td className="border-b border-[#e7eff9] px-4 py-3 align-middle text-xs font-semibold leading-5 text-[#52647b]">
                    <span className="line-clamp-2" title={item.note || ""}>{item.note || "-"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ThinScrollArea>
      )}
    </section>
  );
}

function getContractStatus(contract: Pick<ContractReceiptGroup, "receivedAmount" | "refundAmount" | "remainingAmount">) {
  if (contract.remainingAmount <= 0) return { statusLabel: "已完成", statusTone: "green" as const };
  if (contract.receivedAmount > 0 || contract.refundAmount > 0) return { statusLabel: "收款中", statusTone: "amber" as const };
  return { statusLabel: "待收款", statusTone: "red" as const };
}

function buildContractReceiptGroups(items: ReceiptItem[]) {
  const map = new Map<string, ContractReceiptGroup>();
  items.forEach((item) => {
    const key = item.contractId || `no-contract-${item.projectId || item.customerId || "unknown"}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        contractId: item.contractId || null,
        contractNo: item.contractNo || null,
        contractTitle: item.contractTitle || "未关联合同",
      statusLabel: "待收款",
        statusTone: "red",
        receivableAmount: 0,
        depositDeductionAmount: 0,
        changeRefundDeductionAmount: 0,
        actualReceivableAmount: 0,
        receivedAmount: 0,
        refundAmount: 0,
        remainingAmount: 0,
        nextDueDate: null,
        items: [],
      });
    }

    const contract = map.get(key) as ContractReceiptGroup;
    contract.receivableAmount += Number(item.receivableAmount || 0);
    contract.depositDeductionAmount += Number(item.depositDeductionAmount || 0);
    contract.changeRefundDeductionAmount += Number(item.changeRefundDeductionAmount || 0);
    contract.actualReceivableAmount += Number(item.actualReceivableAmount || 0);
    contract.receivedAmount += Number(item.receivedAmount || 0);
    contract.refundAmount += Number(item.refundAmount || 0);
    contract.remainingAmount += Number(item.remainingAmount || 0);
    if (item.dueDate && item.remainingAmount > 0 && (!contract.nextDueDate || item.dueDate < contract.nextDueDate)) {
      contract.nextDueDate = item.dueDate;
    }
    contract.items.push(item);
  });

  return Array.from(map.values()).map((contract) => {
    const status = getContractStatus(contract);
    return {
      ...contract,
      receivableAmount: Number(contract.receivableAmount.toFixed(2)),
      depositDeductionAmount: Number(contract.depositDeductionAmount.toFixed(2)),
      changeRefundDeductionAmount: Number(contract.changeRefundDeductionAmount.toFixed(2)),
      actualReceivableAmount: Number(contract.actualReceivableAmount.toFixed(2)),
      receivedAmount: Number(contract.receivedAmount.toFixed(2)),
      refundAmount: Number(contract.refundAmount.toFixed(2)),
      remainingAmount: Number(contract.remainingAmount.toFixed(2)),
      statusLabel: status.statusLabel,
      statusTone: status.statusTone,
    };
  });
}

export function ContractHeaderAmount({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "red" | "amber" }) {
  const toneClass = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : "text-[#162033]";
  return (
    <span className="min-w-[104px] text-right">
      <span className="block text-[11px] font-bold text-[#8a98ad]">{label}</span>
      <span className={`mt-0.5 block text-sm font-black tabular-nums ${toneClass}`}>{money(value)}</span>
    </span>
  );
}

export function ReceiptItemsTable({
  items,
  totalReceivableAmount,
  refundRequests = [],
  onOpenReceipt,
  group,
  onOpenApproval,
}: {
  items: ReceiptItem[];
  totalReceivableAmount: number;
  refundRequests?: RefundRequestItem[];
  onOpenReceipt: (item: ReceiptItem, mode: ReceiptActionMode) => void;
  group: ProjectReceiptGroup;
  onOpenApproval: (item: ReceiptItem, group: ProjectReceiptGroup) => void;
}) {
  return (
    <ThinScrollArea className={styles.detailTableScroller} scrollClassName={styles.receiptItemsViewport}>
      <table className={`${styles.detailTable} ${styles.receiptItemsTable}`}>
        <colgroup>
          <col style={{ width: 230 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 136 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 116 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 122 }} />
          <col style={{ width: 138 }} />
          <col style={{ width: 104 }} />
          <col style={{ width: 200 }} />
          <col style={{ width: 176 }} />
        </colgroup>
        <thead className={tableHeaderClass}>
          <tr>
            <th className="border-b border-r border-[#e7eff9] px-4 py-3 text-left">款项类型</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">收款比例</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">状态</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">应收金额</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">定金抵扣</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">变更单退款抵扣</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">实际应收</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">已收金额</th>
              <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">历史退款金额</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">剩余应收</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">退款处理</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">最近收款时间</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">经办人</th>
            <th className="border-b border-r border-[#e7eff9] px-4 py-3 text-left">备注</th>
            <th className="border-b border-[#e7eff9] px-3 py-3 text-center">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={tableRowClass}>
              <td className="border-b border-r border-[#e7eff9] px-4 py-3 align-middle">
                <div className="flex min-w-0 items-start gap-2">
                  <PaymentItemMarker />
                  <div className="min-w-0">
                    <p className="truncate font-black text-[#162033]">{item.title}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[#7c8aa0]">
                      {item.flowLabel}{item.method && item.method !== "-" ? ` · ${item.method}` : ""}
                    </p>
                  </div>
                </div>
              </td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                <ReceiptRateCell item={item} totalReceivableAmount={totalReceivableAmount} />
              </td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                <ReceiptApprovalStatusCell item={item} group={group} onOpen={onOpenApproval} />
              </td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.receivableAmount} /></td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><DepositDeductionCell amount={item.depositDeductionAmount} /></td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><DepositDeductionCell amount={item.changeRefundDeductionAmount} /></td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.actualReceivableAmount} /></td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.receivedAmount} /></td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.refundAmount} tone={item.refundAmount > 0 ? "red" : "default"} /></td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.remainingAmount} tone="red" /></td>
              <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle">
                <RefundItemProcessCell item={item} refundRequests={refundRequests} />
              </td>
              <td className="whitespace-nowrap border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">{formatDateTime(item.occurredAt)}</td>
              <td className="whitespace-nowrap border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">{item.operator || "-"}</td>
              <td className="max-w-[240px] border-b border-r border-[#e7eff9] px-4 py-3 align-middle text-xs font-semibold leading-5 text-[#52647b]">
                {item.note || (item.isAccrual ? "变更单口径，需与实际到账核对。" : "-")}
              </td>
              <td className="border-b border-[#e7eff9] px-3 py-3 text-center align-middle">
                <div className="flex items-center justify-center gap-2">
                  <ReceiptActionButton item={item} mode="online" onOpen={onOpenReceipt} />
                  <ReceiptActionButton item={item} mode="manual" onOpen={onOpenReceipt} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ThinScrollArea>
  );
}

export function ContractReceiptGroupsView({
  items,
  refundRequests = [],
  onOpenReceipt,
  group,
  onOpenApproval,
}: {
  items: ReceiptItem[];
  refundRequests?: RefundRequestItem[];
  onOpenReceipt: (item: ReceiptItem, mode: ReceiptActionMode) => void;
  group: ProjectReceiptGroup;
  onOpenApproval: (item: ReceiptItem, group: ProjectReceiptGroup) => void;
}) {
  const contracts = buildContractReceiptGroups(items);
  return (
    <div className={styles.contractGroups}>
      {contracts.map((contract) => (
        <details
          key={contract.key}
          open={contract.remainingAmount > 0}
          className={`${styles.contractGroup} group`}
        >
          <summary className={styles.contractSummary}>
            <div className="flex min-w-0 items-start gap-3">
              <span className={styles.contractMaterialIconWrap} aria-hidden="true">
                <span className={`${styles.contractMaterialIconBadge} ${styles.contractMaterialIconContract}`}>
                  <ClipboardList className="h-[17px] w-[17px]" strokeWidth={1.85} />
                </span>
                <span className={styles.contractEntryChevron}>
                  <ChevronRight className="h-3 w-3 transition group-open:rotate-90" />
                </span>
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-black text-[#162033]">{contract.contractTitle}</p>
                  <span className={`${styles.statusTag} ${statusTagClass(contract.statusTone)}`}>{contract.statusLabel}</span>
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-[#7c8aa0]">
                  {contract.contractNo ? `合同编号：${contract.contractNo}` : "暂无合同编号"} · {contract.items.length} 项收款计划
                  {contract.nextDueDate ? ` · 最近计划：${formatDate(contract.nextDueDate)}` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 xl:flex xl:items-center xl:gap-5">
              <ContractHeaderAmount label="应收金额" value={contract.receivableAmount} />
              <ContractHeaderAmount label="实际应收" value={contract.actualReceivableAmount} />
              <ContractHeaderAmount label="已收金额" value={contract.receivedAmount} />
              <ContractHeaderAmount label="历史退款金额" value={contract.refundAmount} tone={contract.refundAmount > 0 ? "red" : "default"} />
              <ContractHeaderAmount label="剩余应收" value={contract.remainingAmount} tone="red" />
            </div>
          </summary>
          <div className={styles.contractItems}>
            <ReceiptItemsTable
              items={contract.items}
              totalReceivableAmount={contract.receivableAmount}
              refundRequests={refundRequests}
              onOpenReceipt={onOpenReceipt}
              group={group}
              onOpenApproval={onOpenApproval}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

export function RefundRequestSection({ group }: { group: ProjectReceiptGroup }) {
  const requests = group.refundRequests || [];
  if (requests.length === 0) return null;
  const pendingApprovalAmount = requests
    .filter((item) => item.status === "pending_approval")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingRefundAmount = requests
    .filter((item) => item.status === "pending_refund")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const payingAmount = requests
    .filter((item) => item.status === "paying")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <section className={`${styles.detailPanel} ${styles.refundSection}`}>
      <div className={styles.detailSectionHeader}>
        <div>
          <h2 className={styles.detailSectionTitle}>退款申请记录</h2>
          <p className={styles.detailSectionDescription}>审核中和待打款只展示在这里，实际到账退款以款项流水为准。</p>
        </div>
        <div className={styles.detailSummaryTags}>
          <span className={styles.summaryTagBlue}>共 {requests.length} 笔</span>
          {pendingApprovalAmount > 0 && <span className={styles.summaryTagAmber}>审核中 {money(pendingApprovalAmount)}</span>}
          {pendingRefundAmount > 0 && <span className={styles.summaryTagRed}>待打款 {money(pendingRefundAmount)}</span>}
          {payingAmount > 0 && <span className={styles.summaryTagBlue}>打款中 {money(payingAmount)}</span>}
        </div>
      </div>

      <ThinScrollArea className={styles.detailTableScroller}>
        <table className={`${styles.detailTable} ${styles.refundRequestsTable}`}>
          <colgroup>
            <col style={{ width: 150 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 126 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 136 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 256 }} />
          </colgroup>
          <thead className={tableHeaderClass}>
            <tr>
              <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">申请时间</th>
              <th className="border-b border-r border-[#e7eff9] px-4 py-3 text-left">款项</th>
              <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">申请金额</th>
              <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">状态</th>
              <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">申请人</th>
              <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">当前处理人</th>
              <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">操作</th>
              <th className="border-b border-[#e7eff9] px-4 py-3 text-left">原因</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((item) => {
              const actionText = item.status === "pending_refund"
                ? "待财务打款"
                : item.status === "pending_approval"
                  ? "等待审核"
                  : item.status === "paying"
                    ? "打款处理中"
                    : item.status === "refunded"
                      ? "已退款"
                      : "已关闭";
              return (
                <tr key={item.id} className={tableRowClass}>
                  <td className="whitespace-nowrap border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                    {formatDateTime(item.requestedAt)}
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-4 py-3 align-middle">
                    <p className="truncate font-black text-[#162033]" title={item.title}>{item.title}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[#8a98ad]">{item.categoryKey === "design_fee" ? "设计费" : item.categoryKey === "deposit" ? "定金" : item.categoryKey === "change_payment" ? "变更款" : "工程款"}</p>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={item.amount} tone={item.status === "refunded" || item.status === "pending_refund" ? "red" : "default"} /></td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                    <span className={`${styles.statusTag} ${statusTagClass(item.statusTone)}`}>{item.statusLabel}</span>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                    <span className="block truncate" title={item.applicant || "-"}>{item.applicant || "-"}</span>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                    <span className="block truncate" title={item.currentApprover || "-"}>{item.currentApprover || "-"}</span>
                  </td>
                  <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                    <span className={`text-xs font-black ${item.status === "pending_refund" ? "text-red-600" : statusClass(item.statusTone)}`}>{actionText}</span>
                  </td>
                  <td className="border-b border-[#e7eff9] px-4 py-3 align-middle text-xs font-semibold leading-5 text-[#52647b]">
                    <span className="line-clamp-2" title={item.reason || ""}>{item.reason || "-"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ThinScrollArea>
    </section>
  );
}

export function DepositRefundGroupsTable({
  groups,
  baseIndex,
  onSelect,
}: {
  groups: ProjectReceiptGroup[];
  baseIndex: number;
  onSelect: (group: ProjectReceiptGroup) => void;
}) {
  return (
    <ThinScrollArea className={styles.tableScroller} scrollClassName={styles.tableViewport}>
      <table className={styles.table}>
        <colgroup>
          <col style={{ width: 52 }} />
          <col style={{ width: 108 }} />
          <col style={{ width: 208 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 108 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 104 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 124 }} />
          <col style={{ width: 132 }} />
          <col style={{ width: 132 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 94 }} />
          <col style={{ width: 194 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">序号</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-left">客户姓名</th>
            <th className="border-b border-r border-[#e7eff9] px-4 py-3 text-left">房号</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">服务门店</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">设计师</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">项目经理</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-left">款项订单</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">退款状态</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">申请金额</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">当前处理人</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">申请时间</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">完成时间</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">申请人</th>
            <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">操作</th>
            <th className="border-b border-[#e7eff9] px-4 py-3 text-left">退款原因</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const request = getPrimaryRefundRequest(group);
            const status = request ? getRefundStatusDisplay(request.status) : null;
            const fullRoomName = textOrDash(group.basicInfo.fullRoomName || group.basicInfo.projectAddress || group.projectName);
            return (
              <tr
                key={group.id}
                onClick={() => onSelect(group)}
                className={styles.tableRow}
              >
                <td className={`${styles.sequence} whitespace-nowrap text-center`}>
                  {String(baseIndex + index + 1).padStart(2, "0")}
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle">
                  <p className={styles.primaryText} title={group.customerName}>{group.customerName}</p>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-4 py-3 align-middle">
                  <p className={`${styles.primaryText} ${styles.projectNameText}`} title={fullRoomName}>{fullRoomName}</p>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                  <span className="block truncate" title={textOrDash(group.basicInfo.serviceStore)}>{textOrDash(group.basicInfo.serviceStore)}</span>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                  <span className="block truncate" title={textOrDash(group.basicInfo.designerName)}>{textOrDash(group.basicInfo.designerName)}</span>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                  <span className="block truncate" title={textOrDash(group.basicInfo.managerName)}>{textOrDash(group.basicInfo.managerName)}</span>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle">
                  <p className="truncate text-xs font-black text-[#162033]" title={request?.title || group.items[0]?.title || "-"}>{request?.title || group.items[0]?.title || "-"}</p>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                  <span className={`${styles.statusTag} ${status ? statusTagClass(status.tone) : styles.statusGray}`}>{status?.label || "-"}</span>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle">
                  <AmountCell value={request?.amount || 0} tone={request && request.status !== "rejected" ? "red" : "default"} />
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                  <span className="block truncate" title={request?.currentApprover || "-"}>{request?.currentApprover || "-"}</span>
                </td>
                <td className="whitespace-nowrap border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                  {formatDateTime(request?.requestedAt)}
                </td>
                <td className="whitespace-nowrap border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                  {formatDateTime(request?.completedAt)}
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                  <span className="block truncate" title={request?.applicant || "-"}>{request?.applicant || "-"}</span>
                </td>
                <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                  <span className={styles.detailAction}>
                    查看明细
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </td>
                <td className="border-b border-[#e7eff9] px-4 py-3 align-middle text-xs font-semibold leading-5 text-[#52647b]">
                  <span className="line-clamp-2" title={request?.reason || ""}>{request?.reason || "-"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ThinScrollArea>
  );
}

export function ProjectReceiptDetailView({
  group,
  direction,
  onBack,
  onOpenReceipt,
  onOpenReverse,
  onOpenApproval,
}: {
  group: ProjectReceiptGroup;
  direction: ReceiptDirection;
  onBack: () => void;
  onOpenReceipt: (item: ReceiptItem, mode: ReceiptActionMode) => void;
  onOpenReverse: (item: ReceiptLedgerItem) => void;
  onOpenApproval: (item: ReceiptItem, group: ProjectReceiptGroup) => void;
}) {
  const info = group.basicInfo || {};
  const amountSummary = group.items.reduce(
    (summary, item) => ({
      depositDeductionAmount: summary.depositDeductionAmount + Number(item.depositDeductionAmount || 0),
      changeRefundDeductionAmount: summary.changeRefundDeductionAmount + Number(item.changeRefundDeductionAmount || 0),
      actualReceivableAmount: summary.actualReceivableAmount + Number(item.actualReceivableAmount || 0),
    }),
    { depositDeductionAmount: 0, changeRefundDeductionAmount: 0, actualReceivableAmount: 0 },
  );
  const netReceivedAmount = group.receivedAmount - group.refundAmount;
  const roomName = textOrDash(info.fullRoomName || info.projectAddress || group.projectName);
  const contractCount = group.categoryKey === "project_payment"
    ? new Set(group.items.map((item) => item.contractId || item.contractNo || item.contractTitle).filter(Boolean)).size || 1
    : 0;
  const collectionBaseAmount = amountSummary.actualReceivableAmount > 0 ? amountSummary.actualReceivableAmount : group.receivableAmount;
  const collectionProgress = collectionBaseAmount > 0
    ? Math.min(100, Math.max(0, Math.round((Math.max(0, netReceivedAmount) / collectionBaseAmount) * 100)))
    : group.remainingAmount <= 0 ? 100 : 0;
  const latestPaymentAt = getLatestPaymentAt(group);
  const staffLine = [
    info.designerName ? `设计师：${info.designerName}` : "",
    info.managerName ? `项目经理：${info.managerName}` : "",
  ].filter(Boolean).join(" · ") || "暂无服务人员";
  const isRefundDirection = direction === "refund";

  return (
    <div className={styles.detailWorkspace}>
      <section className={styles.detailHero}>
        <div className={styles.detailTopbar}>
          <div className={styles.detailTopbarIdentity}>
            <button
              type="button"
              onClick={onBack}
              className={styles.detailBackButton}
              aria-label="返回列表"
              title="返回业主收款列表"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className={styles.detailPageTitle}>收款明细</h1>
              <p className={styles.detailPageSubtitle}>{group.categoryLabel} · {group.itemCount} 项款项</p>
            </div>
          </div>
          <span className={`${styles.statusTag} ${statusTagClass(group.statusTone)}`}>{group.statusLabel}</span>
        </div>

        <div className={styles.detailOverview}>
            <div className={styles.projectIdentityPanel}>
              <div className={styles.projectIdentityContent}>
                <span className={styles.projectIdentityIcon}>
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className={styles.projectTitleLine}>
                    <h2 className={styles.projectTitle} title={roomName}>{roomName}</h2>
                    <span className={styles.customerName}>{group.customerName}</span>
                  </div>
                  <p className={styles.projectStaff} title={staffLine}>{staffLine}</p>
                  <div className={styles.collectionProgressBlock}>
                    <div className={styles.collectionProgressHeader}>
                      <span>收款进度</span>
                      <span>{collectionProgress}%</span>
                    </div>
                    <div className={styles.collectionProgressTrack}>
                      <div className={styles.collectionProgressValue} style={{ width: `${collectionProgress}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.headerMetricsGrid}>
                <HeaderMetric label="合同数量" value={group.categoryKey === "project_payment" ? `${contractCount} 个` : "-"} tone="blue" />
                <HeaderMetric label="款项数量" value={`${group.itemCount} 项`} />
                <HeaderMetric label="最近收款" value={formatDateTime(latestPaymentAt)} />
                <HeaderMetric label="下次应收" value={formatDate(group.nextDueDate)} tone={group.nextDueDate ? "red" : "default"} />
              </div>
            </div>

            <div className={styles.detailInfoGrid}>
              <InfoCell icon={Store} label="服务门店" value={textOrDash(info.serviceStore)} tone="orange" />
              <InfoCell icon={Ruler} label="面积" value={areaText(info.area)} tone="teal" />
              <InfoCell icon={Palette} label="设计师" value={textOrDash(info.designerName)} tone="purple" />
              <InfoCell icon={HardHat} label="项目经理" value={textOrDash(info.managerName)} tone="green" />
              <InfoCell icon={ClipboardCheck} label="工程状态" value={textOrDash(info.projectStatus)} tone="amber" />
              <InfoCell icon={Hammer} label="施工阶段" value={textOrDash(info.currentPhase || info.siteStage)} tone="rose" />
              <InfoCell icon={CalendarDays} label="开工日期" value={formatDate(info.startDate)} tone="slate" />
              <InfoCell icon={CalendarDays} label="计划完工" value={formatDate(info.plannedEndDate)} tone="slate" />
            </div>
        </div>
      </section>

      <section className={styles.amountSummaryPanel}>
          <div className={styles.amountSummaryGrid}>
            <DetailAmount label="本单应收" value={amountSummary.actualReceivableAmount} tone="blue" prominent />
            <DetailAmount label="已收金额" value={group.receivedAmount} tone="green" prominent />
            <DetailAmount label="剩余应收" value={group.remainingAmount} tone={group.remainingAmount > 0 ? "red" : "default"} prominent />
          </div>
      </section>

      {isRefundDirection && <RefundRequestSection group={group} />}

      <section className={`${styles.detailPanel} ${styles.paymentSection}`}>
        <div className={styles.detailSectionHeader}>
          <div>
            <h2 className={styles.detailSectionTitle}>具体款项</h2>
            <p className={styles.detailSectionDescription}>该工地在当前收款类型下的全部款项明细。</p>
          </div>
          {group.nextDueDate && (
            <span className={styles.summaryTagAmber}>
              最近计划 {formatDate(group.nextDueDate)}
            </span>
          )}
        </div>

        {group.categoryKey === "project_payment" ? (
          <ContractReceiptGroupsView
            items={group.items}
            refundRequests={group.refundRequests}
            onOpenReceipt={onOpenReceipt}
            group={group}
            onOpenApproval={onOpenApproval}
          />
        ) : (
          <ReceiptItemsTable
            items={group.items}
            totalReceivableAmount={group.receivableAmount}
            refundRequests={group.refundRequests}
            onOpenReceipt={onOpenReceipt}
            group={group}
            onOpenApproval={onOpenApproval}
          />
        )}
      </section>

      <RelatedOrderOverview group={group} />

      {!isRefundDirection && <RefundRequestSection group={group} />}
      <ReceiptLedgerSection group={group} onOpenReverse={onOpenReverse} />
    </div>
  );
}
