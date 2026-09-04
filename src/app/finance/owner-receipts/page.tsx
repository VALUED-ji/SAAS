"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  BadgeDollarSign,
  ChevronRight,
  FileText,
  HandCoins,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  WalletCards,
} from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import ApprovalSignatureModal from "@/components/approval/ApprovalSignatureModal";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import styles from "./owner-receipts.module.css";
import {
  ApprovalActionState,
  OwnerReceiptsData,
  ReceiptActionState,
  ReceiptCategoryKey,
  ReceiptDirection,
  ReceiptStatusFilter,
  ReceiptViewKey,
  ReceiptViewSummary,
  ReversalActionState,
  StatusCountMap,
  collectStatusFilters,
  getLatestPaymentAt,
  pageClass,
  refundStatusFilters,
  statusTagClass,
  textOrDash,
  useDebouncedValue,
} from "./owner-receipt-shared";
import {
  AmountCell,
  DepositRefundGroupsTable,
  EmptyState,
  ProactiveReceiptModal,
  ProjectReceiptDetailView,
  ReceiptApprovalModal,
  ReceiptCollectionModal,
  ReceiptReversalModal,
  ReceiptSplitViewButton,
  RefundProcessCell,
} from "./owner-receipt-views";

export default function OwnerReceiptsPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<ReceiptCategoryKey>("deposit");
  const [direction, setDirection] = useState<ReceiptDirection>("collect");
  const [status, setStatus] = useState<ReceiptStatusFilter>("all");
  const range = "all";
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [receiptAction, setReceiptAction] = useState<ReceiptActionState>(null);
  const [showProactiveReceipt, setShowProactiveReceipt] = useState(false);
  const [reversalAction, setReversalAction] = useState<ReversalActionState>(null);
  const [approvalAction, setApprovalAction] = useState<ApprovalActionState>(null);
  const [approvalProcessingId, setApprovalProcessingId] = useState("");
  const [signatureApprovalTarget, setSignatureApprovalTarget] = useState<{ stepId: string; action: "approve" | "reject" } | null>(null);
  const [data, setData] = useState<OwnerReceiptsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ category, direction, status, range });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    setLoading(true);
    setError("");

    fetch(`/api/finance/owner-receipts?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("业主收款数据加载失败");
        return response.json();
      })
      .then((payload: OwnerReceiptsData) => setData(payload))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "业主收款数据加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [category, debouncedSearch, direction, range, refreshKey, status]);

  useEffect(() => {
    setSelectedGroupId("");
  }, [category, debouncedSearch, direction, range, status]);

  const groups = data?.groups || [];
  const receiptPagination = useDataPagination(groups, [category, direction, status, debouncedSearch].join("|"));
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const statusCounts: StatusCountMap = data?.statusCounts || { all: 0, unpaid: 0, collecting: 0, completed: 0, refund: 0, voided: 0 };
  const summaryByKey = new Map((data?.categorySummaries || []).map((item) => [item.key, item]));
  const receiptViewGroups: ReceiptViewSummary[][] = [
    [
      {
        key: "deposit_collect",
        categoryKey: "deposit",
        direction: "collect",
        label: "收定金",
        description: "定金收款",
        count: Number(summaryByKey.get("deposit")?.statusCounts?.all || 0),
        icon: BadgeDollarSign,
      },
      {
        key: "deposit_refund",
        categoryKey: "deposit",
        direction: "refund",
        label: "退定金",
        description: "退款审核",
        count: Number(summaryByKey.get("deposit")?.statusCounts?.refund || 0),
        icon: ArrowDownLeft,
      },
    ],
    [
      {
        key: "design_fee_collect",
        categoryKey: "design_fee",
        direction: "collect",
        label: "收设计费",
        description: "设计费收款",
        count: Number(summaryByKey.get("design_fee")?.statusCounts?.all || 0),
        icon: FileText,
      },
      {
        key: "design_fee_refund",
        categoryKey: "design_fee",
        direction: "refund",
        label: "退设计费",
        description: "设计费退款",
        count: Number(summaryByKey.get("design_fee")?.statusCounts?.refund || 0),
        icon: ArrowDownLeft,
      },
    ],
    [
      {
        key: "project_payment_collect",
        categoryKey: "project_payment",
        direction: "collect",
        label: "收工程款",
        description: "工程款收款",
        count: Number(summaryByKey.get("project_payment")?.statusCounts?.all || 0),
        icon: WalletCards,
      },
      {
        key: "project_payment_refund",
        categoryKey: "project_payment",
        direction: "refund",
        label: "退工程款",
        description: "工程款退款",
        count: Number(summaryByKey.get("project_payment")?.statusCounts?.refund || 0),
        icon: ArrowDownLeft,
      },
    ],
    [
      {
        key: "change_payment_collect",
        categoryKey: "change_payment",
        direction: "collect",
        label: "收变更款",
        description: "增项收款",
        count: Number(summaryByKey.get("change_payment")?.statusCounts?.all || 0),
        icon: RotateCcw,
      },
      {
        key: "change_payment_refund",
        categoryKey: "change_payment",
        direction: "refund",
        label: "退变更款",
        description: "减项退款",
        count: Number(summaryByKey.get("change_payment")?.statusCounts?.refund || 0),
        icon: ArrowDownLeft,
      },
    ],
  ];
  const activeViewKey = `${category}_${direction}` as ReceiptViewKey;
  const activeStatusFilters = direction === "refund"
    ? refundStatusFilters
    : collectStatusFilters.filter((item) => item.key !== "voided" || category === "deposit" || category === "design_fee");
  const isRefundView = direction === "refund";
  const isOrderDimensionView = category === "deposit" || category === "design_fee";
  const useRefundRequestTable = isRefundView && (category === "deposit" || category === "design_fee");

  const handleDepositApprovalAction = async (stepId: string, action: "approve" | "reject", comment = "", signatureId = "") => {
    const token = localStorage.getItem("zxgj_token");
    setApprovalProcessingId(stepId + action);
    try {
      const res = await fetch("/api/todos/deposit-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: stepId, action, comment, signature_id: signatureId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "审批处理失败");
      setRefreshKey((value) => value + 1);
      setApprovalAction(null);
      window.dispatchEvent(new Event("todos:changed"));
      return true;
    } catch (err: any) {
      window.alert(err?.message || "审批处理失败");
      return false;
    } finally {
      setApprovalProcessingId("");
    }
  };

  if (selectedGroup) {
    return (
      <main className={pageClass}>
        <ProjectReceiptDetailView
          group={selectedGroup}
          direction={direction}
          onBack={() => {
            setApprovalAction(null);
            setSelectedGroupId("");
          }}
          onOpenReceipt={(item, mode) => setReceiptAction({ item, mode, group: selectedGroup })}
          onOpenReverse={(item) => setReversalAction({ item, group: selectedGroup })}
          onOpenApproval={(item, group) => setApprovalAction({ item, group })}
        />
        <ReceiptApprovalModal
          action={approvalAction}
          currentUserId={user?.id}
          processingId={approvalProcessingId}
          onClose={() => setApprovalAction(null)}
          onApprovalAction={(target) => setSignatureApprovalTarget(target)}
        />
        <ApprovalSignatureModal
          open={Boolean(signatureApprovalTarget)}
          action={signatureApprovalTarget?.action || "approve"}
          title={signatureApprovalTarget?.action === "reject" ? "确认审批驳回" : "确认审批通过"}
          processing={Boolean(approvalProcessingId)}
          onClose={() => setSignatureApprovalTarget(null)}
          onConfirm={async (signatureId, comment) => {
            if (!signatureApprovalTarget) return;
            const target = signatureApprovalTarget;
            const success = await handleDepositApprovalAction(target.stepId, target.action, comment, signatureId);
            if (success) setSignatureApprovalTarget(null);
          }}
        />
        <ReceiptCollectionModal
          action={receiptAction}
          onClose={() => setReceiptAction(null)}
          onCollected={() => setRefreshKey((value) => value + 1)}
        />
        <ReceiptReversalModal
          action={reversalAction}
          onClose={() => setReversalAction(null)}
          onReversed={() => setRefreshKey((value) => value + 1)}
        />
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div className={styles.workspace}>
        <header className={styles.pageHeader}>
          <div className={styles.headerIdentity}>
            <span className={styles.headerIcon}><WalletCards className="h-4 w-4" /></span>
            <div className={styles.headerCopy}>
              <h1 className={styles.pageTitle}>业主收款</h1>
              <p className={styles.pageSubtitle}>{isOrderDimensionView ? "定金和设计费按订单展示，点击订单查看具体款项。" : "一个工地一行，点击工地查看具体款项。"}</p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => setShowProactiveReceipt(true)}
              className={styles.primaryButton}
            >
              <HandCoins className="h-4 w-4" />
              主动收款
            </button>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              className={styles.secondaryButton}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        </header>

        <section className={styles.viewPanel}>
          <div className={styles.viewGrid}>
            {receiptViewGroups.map((views) => (
              <ReceiptSplitViewButton
                key={views[0]?.categoryKey}
                views={views}
                activeViewKey={activeViewKey}
                onSelect={(item) => {
                  setCategory(item.categoryKey);
                  setDirection(item.direction);
                  setStatus("all");
                }}
              />
            ))}
            {!data && loading && (
              <div className={styles.viewLoading}>
                <Loader2 className="h-5 w-5 animate-spin text-[#407AFF]" /> 正在加载收款类型
              </div>
            )}
          </div>
        </section>

        <section className={styles.listPanel}>
          <div className={styles.toolbar}>
            <div className={`${styles.statusFilters} system-status-segmented`}>
              {activeStatusFilters.map((item) => {
                const Icon = item.icon;
                const active = status === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    title={item.hint}
                    onClick={() => setStatus(item.key)}
                    className={`${styles.statusButton} system-status-option ${active ? `${styles.statusButtonActive} system-status-option-active` : ""}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${item.key === "refund_paying" && active ? "animate-spin" : ""}`} />
                    {item.label}
                    <span className={`${styles.statusCount} system-status-count`}>{statusCounts[item.key] || 0}</span>
                  </button>
                );
              })}
            </div>
            <label className={styles.searchField}>
              <Search className={styles.searchIcon} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={styles.searchInput}
                placeholder={isRefundView ? "搜索客户、工地、退款原因" : "搜索客户、工地、款项"}
              />
            </label>
          </div>

          {error ? (
            <div className={styles.errorState}>
              <span className={styles.stateIcon}><RotateCcw className="h-5 w-5" /></span>
              <p>{error}</p>
              <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className={styles.reloadButton}>重新加载</button>
            </div>
          ) : groups.length === 0 && !loading ? (
            <EmptyState text={isOrderDimensionView ? "当前分类和状态下暂无订单记录" : "当前分类和状态下暂无工地收款记录"} />
          ) : (
            <div className={styles.tableRegion}>
              {useRefundRequestTable ? (
                <DepositRefundGroupsTable
                  groups={receiptPagination.pageItems}
                  baseIndex={(receiptPagination.page - 1) * receiptPagination.pageSize}
                  onSelect={(group) => setSelectedGroupId(group.id)}
                />
              ) : (
                <ThinScrollArea className={styles.tableScroller} scrollClassName={styles.tableViewport}>
                  <table className={styles.table}>
                  <colgroup>
                    <col style={{ width: 50 }} />
                    <col style={{ width: 106 }} />
                    <col style={{ width: 214 }} />
                    <col style={{ width: 98 }} />
                    <col style={{ width: 98 }} />
                    <col style={{ width: 108 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 96 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 118 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 138 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 98 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">序号</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-left">客户姓名</th>
                      <th className="border-b border-r border-[#e7eff9] px-4 py-3 text-left">房号</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">服务门店</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">设计师</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">项目经理</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">收款状态</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">款项</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">应收金额</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">已收金额</th>
                    <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">历史退款金额</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">退款处理</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-right">剩余应收</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">最近收款</th>
                      <th className="border-b border-r border-[#e7eff9] px-3 py-3 text-center">经办人</th>
                      <th className="border-b border-[#e7eff9] px-3 py-3 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptPagination.pageItems.map((group, index) => {
                      const latestPaymentAt = getLatestPaymentAt(group);
                      const fullRoomName = textOrDash(group.basicInfo.fullRoomName || group.basicInfo.projectAddress || group.projectName);
                      return (
                        <tr
                          key={group.id}
                          onClick={() => setSelectedGroupId(group.id)}
                          className={styles.tableRow}
                        >
                          <td className={`${styles.sequence} whitespace-nowrap text-center`}>
                            {String((receiptPagination.page - 1) * receiptPagination.pageSize + index + 1).padStart(2, "0")}
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
                            <div className="flex justify-center">
                              <span className={`${styles.statusTag} ${statusTagClass(group.statusTone)}`}>{group.statusLabel}</span>
                            </div>
                          </td>
                          <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle">
                            {isOrderDimensionView ? (
                              <span className={styles.itemTag} title={group.items[0]?.title || "-"}>{group.items[0]?.title || "-"}</span>
                            ) : (
                              <span className={styles.itemTag}>{group.itemCount} 项</span>
                            )}
                          </td>
                          <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={group.receivableAmount} /></td>
                          <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={group.receivedAmount} /></td>
                          <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={group.refundAmount} tone={group.refundAmount > 0 ? "red" : "default"} /></td>
                          <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle">
                            <RefundProcessCell group={group} />
                          </td>
                          <td className="border-b border-r border-[#e7eff9] px-3 py-3 align-middle"><AmountCell value={group.remainingAmount} tone={group.remainingAmount > 0 ? "red" : "default"} /></td>
                          <td className="whitespace-nowrap border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                            {formatDateTime(latestPaymentAt)}
                          </td>
                          <td className="border-b border-r border-[#e7eff9] px-3 py-3 text-center align-middle text-xs font-semibold text-[#52647b]">
                            <span className="block truncate" title={group.operator || "-"}>{group.operator || "-"}</span>
                          </td>
                          <td className="border-b border-[#e7eff9] px-3 py-3 text-center align-middle">
                            <span className={styles.detailAction}>
                              查看明细
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </ThinScrollArea>
              )}
              <DataPagination
                total={groups.length}
                page={receiptPagination.page}
                pageSize={receiptPagination.pageSize}
                onPageChange={receiptPagination.setPage}
                onPageSizeChange={receiptPagination.setPageSize}
                itemName={isOrderDimensionView ? "笔订单" : "个工地"}
                className={styles.pagination}
              />
            </div>
          )}
        </section>
        <ProactiveReceiptModal
          open={showProactiveReceipt}
          onClose={() => setShowProactiveReceipt(false)}
          onCollected={(recordType) => {
            setCategory(recordType);
            setDirection("collect");
            setStatus("all");
            setRefreshKey((value) => value + 1);
          }}
        />
      </div>
    </main>
  );
}
