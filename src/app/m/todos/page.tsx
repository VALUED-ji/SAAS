"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markMobileNavigation } from "@/lib/mobileNavigation";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckSquare,
  ChevronLeft,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileText,
  Loader2,
  MessageCircle,
  PenLine,
  ReceiptText,
  RefreshCw,
  Store,
  UserRound,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/data";
import styles from "../mobile.module.css";

type TodoKind =
  | "all"
  | "notifications"
  | "mentioned"
  | "designer_assignment"
  | "deposit_approval"
  | "deposit_refund_approval"
  | "change_order_approval"
  | "quotation_receipt"
  | "contract_approval";

type TodoStatus = string;

type MobileTodo = {
  id: string;
  rawId?: string;
  kind: TodoKind;
  title: string;
  subtitle: string;
  customerName?: string;
  amount?: number;
  status: string;
  statusLabel: string;
  meta: string[];
  href?: string;
  icon: React.ElementType;
  tone: "green" | "amber" | "red" | "blue" | "cyan" | "purple" | "neutral";
  pending: boolean;
  unread?: boolean;
  action?: "receive_quotation" | "read_notification" | "process_mention" | "ignore_mention";
};

const categoryGroups = [
  { key: "message", label: "消息类" },
  { key: "business", label: "业务类" },
  { key: "project", label: "工程类" },
] as const;

const categories: Array<{ key: TodoKind; group: (typeof categoryGroups)[number]["key"]; label: string; hint: string; icon: React.ElementType; tone: MobileTodo["tone"] }> = [
  { key: "all", group: "message", label: "全部待办", hint: "集中查看所有事项", icon: CheckSquare, tone: "green" },
  { key: "notifications", group: "message", label: "消息提醒", hint: "审批结果通知", icon: Bell, tone: "amber" },
  { key: "mentioned", group: "message", label: "提及回复", hint: "@我和回复", icon: MessageCircle, tone: "purple" },
  { key: "designer_assignment", group: "business", label: "设计分配", hint: "分配设计师", icon: UserRound, tone: "cyan" },
  { key: "deposit_approval", group: "business", label: "收款审批", hint: "定金设计费", icon: CircleDollarSign, tone: "green" },
  { key: "deposit_refund_approval", group: "business", label: "退款审批", hint: "退款退定金", icon: RefreshCw, tone: "red" },
  { key: "quotation_receipt", group: "business", label: "报价接收", hint: "报价单确认", icon: ReceiptText, tone: "amber" },
  { key: "contract_approval", group: "business", label: "合同审批", hint: "合同签约审批", icon: FileText, tone: "blue" },
  { key: "change_order_approval", group: "project", label: "变更审批", hint: "工地增减项", icon: ClipboardCheck, tone: "cyan" },
];

type TodoStatusTab = { key: TodoStatus; label: string };

const defaultStatusTabs: TodoStatusTab[] = [
  { key: "pending", label: "待处理" },
  { key: "processed", label: "已处理" },
  { key: "all", label: "全部" },
];

const todoStatusTabsByKind: Partial<Record<TodoKind, TodoStatusTab[]>> = {
  notifications: [
    { key: "unread", label: "未读" },
    { key: "read", label: "已读" },
    { key: "all", label: "全部" },
  ],
  mentioned: defaultStatusTabs,
  designer_assignment: [
    { key: "pending_dispatch", label: "待分派" },
    { key: "pending_handler", label: "待分配" },
    { key: "completed", label: "已完成" },
    { key: "rejected", label: "已驳回" },
  ],
  quotation_receipt: [
    { key: "pending", label: "待接收" },
    { key: "received", label: "已接收" },
    { key: "all", label: "全部" },
  ],
  deposit_approval: [
    { key: "pending", label: "待审批" },
    { key: "waiting", label: "待他人审批" },
    { key: "approved", label: "已审批" },
    { key: "rejected", label: "已驳回" },
  ],
  deposit_refund_approval: [
    { key: "pending", label: "待审批" },
    { key: "waiting", label: "待他人审批" },
    { key: "approved", label: "已审批" },
    { key: "rejected", label: "已驳回" },
  ],
  contract_approval: [
    { key: "pending", label: "待审批" },
    { key: "waiting", label: "待他人审批" },
    { key: "approved", label: "已审批" },
    { key: "rejected", label: "已驳回" },
  ],
  change_order_approval: [
    { key: "pending", label: "待审批" },
    { key: "waiting", label: "待他人审批" },
    { key: "approved", label: "已审批" },
    { key: "rejected", label: "已驳回" },
  ],
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function paymentLabel(item: any) {
  return item?.record_type === "design_fee" ? "设计费" : "定金";
}

function refundLabel(item: any) {
  return item?.record_type === "design_fee" ? "退设计费" : "退定金";
}

function designerStatusLabel(item: any) {
  const status = String(item?.status || "");
  if (status === "pending_dispatch") return "待分派";
  if (status === "pending_handler" || status === "pending") return "待分配";
  if (status === "rejected") return "已驳回";
  return "已完成";
}

function isDesignerPending(item: any) {
  return Number(item?.is_actionable || 0) === 1;
}

function isPendingStatus(item: any) {
  return String(item?.status || "") === "pending";
}

function approvalStatusLabel(item: any) {
  const status = String(item?.status || "");
  if (status === "pending") return "待审批";
  if (status === "waiting") return "待他人审批";
  if (status === "approved" || status === "skipped") return "已审批";
  if (status === "rejected" || String(item?.instance_status || "") === "rejected") return "已驳回";
  return "已处理";
}

function approvalTone(item: any, pendingTone: MobileTodo["tone"]): MobileTodo["tone"] {
  const status = String(item?.status || "");
  if (status === "pending") return pendingTone;
  if (status === "waiting") return "neutral";
  if (status === "rejected" || String(item?.instance_status || "") === "rejected") return "red";
  return "green";
}

function getDefaultStatusForKind(kind: TodoKind) {
  return (todoStatusTabsByKind[kind] || defaultStatusTabs)[0]?.key || "pending";
}

function isApprovalDone(status: string) {
  return status === "approved" || status === "skipped";
}

function getMentionDelay(nextDate: string) {
  if (!nextDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(nextDate);
  next.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - next.getTime()) / 86400000));
}

function toMobileHref(href?: string) {
  if (!href) return "";
  if (href.startsWith("/projects/")) {
    const [path, query = ""] = href.split("?");
    const id = path.replace("/projects/", "");
    return `/m/customers/${id}${query ? `?${query}` : ""}`;
  }
  if (href.startsWith("/quotations/")) return href.replace("/quotations/", "/m/quotations/");
  return href;
}

export default function MobileTodosPage() {
  const router = useRouter();
  const [activeKind, setActiveKind] = useState<TodoKind | null>(null);
  const [activeStatus, setActiveStatus] = useState<TodoStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState("");
  const [error, setError] = useState("");
  const [followups, setFollowups] = useState<any[]>([]);
  const [designerItems, setDesignerItems] = useState<any[]>([]);
  const [quotationItems, setQuotationItems] = useState<any[]>([]);
  const [contractItems, setContractItems] = useState<any[]>([]);
  const [depositItems, setDepositItems] = useState<any[]>([]);
  const [depositRefundItems, setDepositRefundItems] = useState<any[]>([]);
  const [changeOrderItems, setChangeOrderItems] = useState<any[]>([]);
  const [notificationItems, setNotificationItems] = useState<any[]>([]);
  const [processedMentionIds, setProcessedMentionIds] = useState<string[]>([]);
  const [ignoredMentionIds, setIgnoredMentionIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      setProcessedMentionIds(JSON.parse(localStorage.getItem("todos_processed") || "[]"));
      setIgnoredMentionIds(JSON.parse(localStorage.getItem("todos_ignored") || "[]"));
    } catch {
      setProcessedMentionIds([]);
      setIgnoredMentionIds([]);
    }
  }, []);

  const loadTodos = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = authHeaders();
      const [
        followupData,
        designerData,
        quotationData,
        contractData,
        depositData,
        depositRefundData,
        changeOrderData,
        notificationData,
      ] = await Promise.all([
        fetch("/api/followups?scope=todo", { headers }).then((res) => (res.ok ? res.json() : [])),
        fetch("/api/todos/designer-assignment", { headers }).then((res) => (res.ok ? res.json() : { items: [] })),
        fetch("/api/todos/quotation-receipt", { headers }).then((res) => (res.ok ? res.json() : { items: [] })),
        fetch("/api/todos/contract-approval", { headers }).then((res) => (res.ok ? res.json() : { items: [] })),
        fetch("/api/todos/deposit-approval", { headers }).then((res) => (res.ok ? res.json() : { items: [] })),
        fetch("/api/todos/deposit-refund-approval", { headers }).then((res) => (res.ok ? res.json() : { items: [] })),
        fetch("/api/todos/change-order-approval", { headers }).then((res) => (res.ok ? res.json() : { items: [] })),
        fetch("/api/notifications?scope=result", { headers }).then((res) => (res.ok ? res.json() : { items: [] })),
      ]);
      setFollowups(Array.isArray(followupData) ? followupData : []);
      setDesignerItems(Array.isArray(designerData?.items) ? designerData.items : []);
      setQuotationItems(Array.isArray(quotationData?.items) ? quotationData.items : []);
      setContractItems(Array.isArray(contractData?.items) ? contractData.items : []);
      setDepositItems(Array.isArray(depositData?.items) ? depositData.items : []);
      setDepositRefundItems(Array.isArray(depositRefundData?.items) ? depositRefundData.items : []);
      setChangeOrderItems(Array.isArray(changeOrderData?.items) ? changeOrderData.items : []);
      setNotificationItems(Array.isArray(notificationData?.items) ? notificationData.items : []);
    } catch (err: any) {
      setError(err?.message || "待办加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const todoItems = useMemo<MobileTodo[]>(() => {
    const mentioned = followups
      .filter((item) => item.customer_name)
      .filter((item) => !ignoredMentionIds.includes(item.id) || processedMentionIds.includes(item.id))
      .map((item) => {
        const delay = getMentionDelay(item.next_date);
        const processed = processedMentionIds.includes(item.id);
        return {
          id: `mentioned_${item.id}`,
          rawId: item.id,
          kind: "mentioned" as const,
          title: item.customer_name || "客户跟进",
          subtitle: item.content || "你有一条跟进消息需要处理",
          customerName: item.customer_name,
          status: processed ? "processed" : "pending",
          statusLabel: processed ? "已处理" : delay > 0 ? `延期${delay}天` : "待处理",
          meta: [`跟进人 ${item.user_name || "未知"}`, formatDate(item.created_at), item.next_date ? `下次 ${item.next_date}` : ""].filter(Boolean),
          href: `/m/customers/${item.customer_id}`,
          icon: MessageCircle,
          tone: delay > 0 ? "red" as const : "purple" as const,
          pending: !processed,
          action: processed ? undefined : "process_mention" as const,
        };
      });

    const designers = designerItems.map((item) => {
      const pending = isDesignerPending(item);
        return {
          id: `designer_${item.id}`,
          kind: "designer_assignment" as const,
        title: item.customer_name || "设计师分配",
        subtitle: item.status === "pending_dispatch"
          ? `需要为客户分派处理人${item.preferred_designer_name ? `，意向设计师 ${item.preferred_designer_name}` : ""}`
          : `需要完成设计师分配${item.preferred_designer_name ? `，意向设计师 ${item.preferred_designer_name}` : ""}`,
        customerName: item.customer_name,
          status: String(item.status || (pending ? "pending" : "completed")),
          statusLabel: designerStatusLabel(item),
        meta: [`门店 ${item.store_name || item.service_store || "未知"}`, `申请人 ${item.requester_name || "未知"}`, formatDate(item.created_at)],
        href: `/m/customers/${item.customer_id}`,
        icon: UserRound,
        tone: pending ? "amber" as const : "green" as const,
        pending,
      };
    });

    const quotations = quotationItems.map((item) => {
      const pending = isPendingStatus(item);
      const status = String(item.status || (pending ? "pending" : "received"));
      return {
        id: `quotation_${item.id}`,
        rawId: item.id,
        kind: "quotation_receipt" as const,
        title: item.title || "待接收报价单",
        subtitle: `${item.sender_name || "系统"}发送给 ${item.customer_name || "未知客户"}，等待确认接收`,
        customerName: item.customer_name,
        amount: Number(item.final_amount ?? item.total_amount ?? 0),
        status,
        statusLabel: status === "pending" ? "待接收" : "已接收",
        meta: [`客户 ${item.customer_name || "未知"}`, item.project_address || item.project_name || "未填写地址", formatDate(item.created_at)],
        href: `/m/quotations/${item.quotation_id}`,
        icon: ReceiptText,
        tone: pending ? "amber" as const : "green" as const,
        pending,
        action: pending ? "receive_quotation" as const : undefined,
      };
    });

    const contracts = contractItems.map((item) => {
      const pending = isPendingStatus(item);
      const status = String(item.status || "");
      return {
        id: `contract_${item.id}`,
        kind: "contract_approval" as const,
        title: item.contract_title || item.contract_no || "合同审批",
        subtitle: `${item.customer_name || "未知客户"}的合同正在「${item.node_name || item.flow_name || "合同审批"}」`,
        customerName: item.customer_name,
        amount: Number(item.total_amount || 0),
        status,
        statusLabel: approvalStatusLabel(item),
        meta: [`客户 ${item.customer_name || "未知"}`, `金额 ${formatCurrency(item.total_amount || 0)}`, formatDate(item.created_at)],
        href: `/m/customers/${item.customer_id}`,
        icon: FileText,
        tone: approvalTone(item, "blue"),
        pending,
      };
    });

    const deposits = depositItems.map((item) => {
      const pending = isPendingStatus(item);
      const label = item.approval_kind === "top_up" ? `补收${paymentLabel(item)}` : paymentLabel(item);
      const amount = Number(item.approval_amount || item.amount || 0);
      const status = String(item.status || "");
      return {
        id: `deposit_${item.id}`,
        kind: "deposit_approval" as const,
        title: `${label}审批`,
        subtitle: `正在「${item.node_name || item.flow_name || `${label}审批`}」`,
        customerName: item.customer_name,
        amount,
        status,
        statusLabel: approvalStatusLabel(item),
        meta: [`门店 ${item.branch_name || "未知"}`, item.deposit_type || "未填写类型", formatDate(item.created_at)],
        href: `/m/customers/${item.customer_id}/payments/${item.deposit_id || item.id}`,
        icon: CircleDollarSign,
        tone: approvalTone(item, "amber"),
        pending,
      };
    });

    const refunds = depositRefundItems.map((item) => {
      const pending = isPendingStatus(item);
      const amount = Number(item.refund_amount || item.approval_refund_amount || 0);
      const status = String(item.status || "");
      return {
        id: `refund_${item.id}`,
        kind: "deposit_refund_approval" as const,
        title: `${refundLabel(item)}审批`,
        subtitle: `申请${refundLabel(item)}，等待审批处理`,
        customerName: item.customer_name,
        amount,
        status,
        statusLabel: approvalStatusLabel(item),
        meta: [`申请人 ${item.created_by_name || "未知"}`, item.refund_reason || item.approval_refund_reason || "未填写原因", formatDate(item.refund_requested_at || item.created_at)],
        href: `/m/customers/${item.customer_id}`,
        icon: RefreshCw,
        tone: approvalTone(item, "red"),
        pending,
      };
    });

    const changes = changeOrderItems.map((item) => {
      const pending = isPendingStatus(item);
      const amount = Number(item.amount || 0);
      const status = String(item.status || "");
      return {
        id: `change_${item.id}`,
        kind: "change_order_approval" as const,
        title: item.change_no || item.title || "变更单审批",
        subtitle: `${item.change_type === "DEDUCT" ? "减项" : "增项"}变更，等待审批处理`,
        customerName: item.customer_name,
        amount,
        status,
        statusLabel: approvalStatusLabel(item),
        meta: [`发起人 ${item.created_by_name || "未知"}`, item.house_address || item.project_address || "未填写房号", formatDate(item.created_at || item.change_order_created_at)],
        href: toMobileHref(`/site/${item.project_id}?tab=changes`),
        icon: ClipboardCheck,
        tone: approvalTone(item, "cyan"),
        pending,
      };
    });

    const notices = notificationItems.map((item) => {
      const unread = !item.is_read;
      const rejected = String(item.title || "").includes("驳回");
      return {
        id: `notice_${item.id}`,
        rawId: item.id,
        kind: "notifications" as const,
        title: item.title || "消息提醒",
        subtitle: item.content || "你有一条新的审批消息",
        status: unread ? "unread" : "read",
        statusLabel: unread ? "未读" : "已读",
        meta: [formatDate(item.created_at)],
        href: toMobileHref(item.link_url),
        icon: Bell,
        tone: rejected ? "red" as const : unread ? "amber" as const : "green" as const,
        pending: unread,
        unread,
        action: unread ? "read_notification" as const : undefined,
      };
    });

    return [...contracts, ...deposits, ...refunds, ...changes, ...designers, ...quotations, ...mentioned, ...notices];
  }, [changeOrderItems, contractItems, depositItems, depositRefundItems, designerItems, followups, ignoredMentionIds, notificationItems, processedMentionIds, quotationItems]);

  const activeCategory = categories.find((item) => item.key === activeKind) || categories[0];
  const activeStatusTabs = todoStatusTabsByKind[activeCategory.key] || defaultStatusTabs;
  const activeStatusLabel = activeStatusTabs.find((tab) => tab.key === activeStatus)?.label || activeStatusTabs[0]?.label || "";

  const visibleItems = todoItems.filter((item) => {
    if (!activeKind) return false;
    if (activeKind !== "all" && item.kind !== activeKind) return false;

    if (activeKind === "all") {
      if (activeStatus === "pending") return item.pending;
      if (activeStatus === "processed") return !item.pending;
      return true;
    }

    if (activeKind === "notifications") {
      if (activeStatus === "unread") return item.status === "unread";
      if (activeStatus === "read") return item.status === "read";
      return true;
    }

    if (activeKind === "mentioned") {
      if (activeStatus === "pending") return item.status === "pending";
      if (activeStatus === "processed") return item.status === "processed";
      return true;
    }

    if (activeKind === "designer_assignment") {
      if (activeStatus === "completed") return !["pending", "pending_dispatch", "pending_handler", "rejected"].includes(item.status);
      return item.status === activeStatus;
    }

    if (activeKind === "quotation_receipt") {
      if (activeStatus === "all") return true;
      return item.status === activeStatus;
    }

    if (["deposit_approval", "deposit_refund_approval", "contract_approval", "change_order_approval"].includes(activeKind)) {
      if (activeStatus === "approved") return isApprovalDone(item.status);
      return item.status === activeStatus;
    }

    if (activeStatus === "pending") return item.pending;
    if (activeStatus === "processed") return !item.pending;
    return true;
  });

  const pendingCount = todoItems.filter((item) => item.pending).length;

  const countsByKind = useMemo(() => {
    return categories.reduce<Record<string, number>>((acc, category) => {
      acc[category.key] = category.key === "all"
        ? pendingCount
        : todoItems.filter((item) => item.kind === category.key && item.pending).length;
      return acc;
    }, {});
  }, [pendingCount, todoItems]);

  const setMentionProcessed = (id: string) => {
    const next = Array.from(new Set([...processedMentionIds, id]));
    setProcessedMentionIds(next);
    localStorage.setItem("todos_processed", JSON.stringify(next));
    window.dispatchEvent(new Event("todos:changed"));
  };

  const setMentionIgnored = (id: string) => {
    const next = Array.from(new Set([...ignoredMentionIds, id]));
    setIgnoredMentionIds(next);
    localStorage.setItem("todos_ignored", JSON.stringify(next));
    window.dispatchEvent(new Event("todos:changed"));
  };

  const handleQuickAction = async (item: MobileTodo, action: NonNullable<MobileTodo["action"]>) => {
    if (!item.rawId) return;
    if (action === "process_mention") {
      setMentionProcessed(item.rawId);
      return;
    }
    if (action === "ignore_mention") {
      setMentionIgnored(item.rawId);
      return;
    }

    setProcessingId(item.id);
    try {
      const headers = { "Content-Type": "application/json", ...authHeaders() };
      if (action === "receive_quotation") {
        const res = await fetch("/api/todos/quotation-receipt", {
          method: "POST",
          headers,
          body: JSON.stringify({ id: item.rawId, action: "receive" }),
        });
        if (!res.ok) throw new Error("接收失败");
      }
      if (action === "read_notification") {
        const res = await fetch("/api/notifications", {
          method: "POST",
          headers,
          body: JSON.stringify({ id: item.rawId, action: "read" }),
        });
        if (!res.ok) throw new Error("标记失败");
        if (item.href) {
          markMobileNavigation("forward");
          router.push(item.href);
        }
      }
      await loadTodos();
      window.dispatchEvent(new Event("todos:changed"));
    } catch (err: any) {
      setError(err?.message || "处理失败，请稍后重试");
    } finally {
      setProcessingId("");
    }
  };

  return (
    <div className={`${styles.page} ${styles.todoMobilePage}`}>
      {!activeKind && <section className={styles.todoCategoryScroller} aria-label="待办类型">
        <div className={styles.todoCategoryHeader}>
          <b>待办类型</b>
          <span>{loading ? "正在同步" : `${pendingCount} 条待处理`}</span>
        </div>
        {categoryGroups.map((group) => (
          <div key={group.key} className={styles.todoCategoryGroup}>
            <div className={styles.todoCategoryGroupTitle}>{group.label}</div>
            <div className={styles.todoCategoryGrid}>
              {categories.filter((category) => category.group === group.key).map((category) => {
                const Icon = category.icon;
                const active = activeKind === category.key;
                const count = countsByKind[category.key] || 0;
                return (
                  <button
                    key={category.key}
                    type="button"
                    className={styles.todoCategoryChip}
                    data-active={active || undefined}
                    data-tone={category.tone}
                    onClick={() => {
                      setActiveKind(category.key);
                      setActiveStatus(getDefaultStatusForKind(category.key));
                    }}
                  >
                    <span className={styles.todoCategoryIcon}><Icon /></span>
                    <span className={styles.todoCategoryCopy}>
                      <b>{category.label}</b>
                    </span>
                    {count > 0 && (
                      <span className={styles.todoCategoryMetric}>
                        <strong>{count}</strong>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>}

      {activeKind && <section className={styles.todoStatusPanel}>
        <div className={styles.todoDetailHeader}>
          <button
            type="button"
            onClick={() => {
              setActiveKind(null);
              setActiveStatus(getDefaultStatusForKind("all"));
            }}
            aria-label="返回待办类型"
          >
            <ChevronLeft />
          </button>
          <div>
            <span>待办类型</span>
            <b>{activeCategory.key === "all" ? "全部待办" : activeCategory.label}</b>
            <small>{visibleItems.length} 条 · {activeStatusLabel}</small>
          </div>
        </div>
        <div className={styles.todoStatusTabs}>
          {activeStatusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-active={activeStatus === tab.key || undefined}
              onClick={() => setActiveStatus(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>}

      {error && (
        <div className={styles.todoError}>
          <AlertTriangle />
          <span>{error}</span>
        </div>
      )}

      {activeKind && <main className={styles.todoList}>
        {loading ? (
          Array.from({ length: 5 }, (_, index) => (
            <div key={index} className={styles.todoSkeletonCard}>
              <span />
              <div><i /><i /></div>
            </div>
          ))
        ) : visibleItems.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><Check /></span>
            <div className={styles.emptyTitle}>暂无待办</div>
            <div className={styles.emptyText}>当前分类没有需要处理的内容。</div>
          </div>
        ) : (
          visibleItems.map((item) => {
            const Icon = item.icon;
            const isAmountFocusCard = item.amount !== undefined;
            const visibleMeta = item.meta
              .filter((meta) => !(item.amount !== undefined && meta.startsWith("金额 ")))
              .filter((meta) => !(isAmountFocusCard && meta.startsWith("门店 ")))
              .filter((meta) => !(isAmountFocusCard && meta.startsWith("客户 ")))
              .slice(0, 3);
            const content = (
              <article className={styles.todoCard} data-tone={item.tone} data-focus={isAmountFocusCard || undefined}>
                <div className={styles.todoCardHead}>
                  <span className={styles.todoCardIcon}><Icon /></span>
                  <div className={styles.todoCardTitle}>
                    <div className={styles.todoCardTitleRow}>
                      <h2>{item.title}</h2>
                      <span className={styles.todoStatusBadge} data-pending={item.pending || undefined}>
                        {item.statusLabel}
                      </span>
                    </div>
                    <p>{item.subtitle}</p>
                  </div>
                </div>
                <div className={styles.todoCardBody}>
                  {isAmountFocusCard ? (
                    <div className={styles.todoApprovalFocus}>
                      <div>
                        <span>审批对象</span>
                        <strong>{item.customerName || item.title}</strong>
                      </div>
                      <em>{formatCurrency(item.amount || 0)}</em>
                    </div>
                  ) : null}
                  {!isAmountFocusCard && (
                    <div className={styles.todoMetaLine}>
                      {visibleMeta.map((meta, index) => (
                        <span key={`${item.id}_${index}`}>
                          {index === 0 ? <UserRound /> : index === 1 ? <Store /> : <Clock3 />}
                          {meta}
                        </span>
                      ))}
                    </div>
                  )}
                  {(item.amount !== undefined || item.href || item.action) && (
                    <div className={styles.todoCardBottom}>
                      {isAmountFocusCard ? (
                        <div className={styles.todoFocusMeta}>
                          {visibleMeta.map((meta, index) => (
                            <span key={`${item.id}_focus_${index}`}>{meta}</span>
                          ))}
                        </div>
                      ) : item.amount !== undefined ? (
                        <div className={styles.todoCardAmountBox}>
                          <span>相关金额</span>
                          <strong className={styles.todoCardAmount}>{formatCurrency(item.amount)}</strong>
                        </div>
                      ) : <span />}
                      <div className={styles.todoCardActions}>
                        {item.href && <span className={styles.todoEnterAction}><PenLine />查看</span>}
                        {item.action && (
                          <button
                            type="button"
                            className={styles.todoInlineAction}
                            disabled={processingId === item.id}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleQuickAction(item, item.action!);
                            }}
                          >
                            {processingId === item.id ? <Loader2 className="animate-spin" /> : <Check />}
                            {item.action === "receive_quotation" ? "确认接收" : item.action === "read_notification" ? "已读" : "处理"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );

            return item.href ? (
              <Link key={item.id} href={item.href} className={styles.todoCardLink}>
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            );
          })
        )}
      </main>}
    </div>
  );
}
