"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth";
import {
  CheckSquare, Phone, MessageCircle, Clock, AlertTriangle,
  Calendar, Loader2, User, Home, Store, FileText, Download, Printer, Eye, Bell,
  DollarSign, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/data";
const ContractSummaryModal = dynamic(() => import("@/components/ContractSummaryModal"), {
  ssr: false,
  loading: () => null,
});
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import { createQuotationPrintPreviewUrl } from "@/lib/quotationShareClient";
import ApprovalSignatureModal from "@/components/approval/ApprovalSignatureModal";
import ApprovalSignaturePreview from "@/components/approval/ApprovalSignaturePreview";
import { cn } from "@/lib/utils";
import styles from "./todos.module.css";
import {
  CategoryAllIcon,
  CategoryChangeIcon,
  CategoryContractIcon,
  CategoryDesignerIcon,
  CategoryMentionIcon,
  CategoryNoticeIcon,
  CategoryPaymentIcon,
  CategoryQuotationIcon,
  CategoryRefundIcon,
} from "./todo-category-icons";

type SignatureApprovalKind = "contract" | "deposit" | "deposit_refund" | "change_order";
type SignatureApprovalAction = "approve" | "reject";

const typeIcons: Record<string, React.ElementType> = {
  "电话": Phone, "微信": MessageCircle, "到店": Store, "上门": Home, "其他": FileText,
};

const pageClass = `todo-center-ui ${styles.page}`;
const todoListCardClass = styles.todoCard;
const todoCardRowClass = styles.todoCardRow;
const todoAvatarClass = styles.todoAvatar;
const todoActionRailClass = styles.actionRail;
const todoActionRailWideClass = styles.actionRailWide;
const emptyStateClass = styles.emptyState;
const actionButtonClass = styles.actionButton;
const approveButtonClass = styles.approveButton;
const rejectButtonClass = styles.rejectButton;

function getPaymentRecordLabel(item: any) {
  return item?.record_type === "design_fee" ? "设计费" : "定金";
}

function getRefundActionLabel(item: any) {
  return item?.record_type === "design_fee" ? "退设计费" : "退定金";
}

function isDesignerAssignmentActionable(item: any) {
  return Number(item?.is_actionable || 0) === 1;
}

function getDesignerAssignmentStatusLabel(item: any) {
  const status = String(item?.status || "");
  if (status === "pending_dispatch") return "待分派处理人";
  if (status === "pending_handler") return "待分配设计师";
  if (status === "pending") return "待分配设计师";
  if (status === "completed" || status === "approved") return "已完成";
  if (status === "rejected") return "已驳回";
  return "已处理";
}

function getDesignerAssignmentDescription(item: any) {
  const preferred = item?.preferred_designer_name ? `，意向设计师：${item.preferred_designer_name}` : "";
  const dispatcherLabel = item?.dispatcher_label || "客户所属门店负责人";
  if (item?.status === "pending_dispatch") {
    return `客户「${item.customer_name || "未知客户"}」申请分配设计师${preferred}。你是本次${dispatcherLabel}，请直接分配设计师或先分派处理人。`;
  }
  if (item?.status === "pending_handler") {
    return `客户「${item.customer_name || "未知客户"}」已由「${item.dispatched_by_name || "派单处理人"}」分派给你，请完成设计师分配${preferred}。`;
  }
  if (item?.status === "pending") {
    return `客户「${item.customer_name || "未知客户"}」申请分配设计师${preferred}。你是本次${dispatcherLabel}，请进入客户详情完成分配。`;
  }
  return `客户「${item.customer_name || "未知客户"}」的设计师分配已处理${item?.assigned_user_name ? `，已分配给「${item.assigned_user_name}」` : ""}。`;
}

function TodoLoadingState() {
  return (
    <div className={styles.skeletonList} aria-label="待办事项加载中">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={styles.skeletonRow}>
          <span className={styles.skeletonAvatar} />
          <span className={styles.skeletonCopy}>
            <span className={styles.skeletonLine} />
            <span className={cn(styles.skeletonLine, styles.skeletonLineShort)} />
          </span>
          <span className={styles.skeletonButton} />
        </div>
      ))}
    </div>
  );
}

export default function TodosPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [data, setData] = useState<any[]>([]);
  const [designerItems, setDesignerItems] = useState<any[]>([]);
  const [quotationItems, setQuotationItems] = useState<any[]>([]);
  const [contractItems, setContractItems] = useState<any[]>([]);
  const [depositItems, setDepositItems] = useState<any[]>([]);
  const [depositRefundItems, setDepositRefundItems] = useState<any[]>([]);
  const [changeOrderItems, setChangeOrderItems] = useState<any[]>([]);
  const [notificationItems, setNotificationItems] = useState<any[]>([]);
  const [contractProcessingId, setContractProcessingId] = useState("");
  const [depositProcessingId, setDepositProcessingId] = useState("");
  const [depositRefundProcessingId, setDepositRefundProcessingId] = useState("");
  const [changeOrderProcessingId, setChangeOrderProcessingId] = useState("");
  const [contractSummary, setContractSummary] = useState<any | null>(null);
  const [contractSummaryLoadingId, setContractSummaryLoadingId] = useState("");
  const [signatureApproval, setSignatureApproval] = useState<{ kind: SignatureApprovalKind; id: string; action: SignatureApprovalAction } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTodos = () => {
    setLoading(true);
    const token = localStorage.getItem("zxgj_token");
    Promise.all([
      fetch("/api/followups?scope=todo", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/todos/designer-assignment", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch("/api/todos/quotation-receipt", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch("/api/todos/contract-approval", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch("/api/todos/deposit-approval", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch("/api/todos/deposit-refund-approval", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch("/api/todos/change-order-approval", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch("/api/notifications?scope=result", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
    ])
      .then(([followups, designerData, quotationData, contractData, depositData, depositRefundData, changeOrderData, notificationData]) => {
        setData(followups || []);
        setDesignerItems(Array.isArray(designerData?.items) ? designerData.items : []);
        setQuotationItems(Array.isArray(quotationData?.items) ? quotationData.items : []);
        setContractItems(Array.isArray(contractData?.items) ? contractData.items : []);
        setDepositItems(Array.isArray(depositData?.items) ? depositData.items : []);
        setDepositRefundItems(Array.isArray(depositRefundData?.items) ? depositRefundData.items : []);
        setChangeOrderItems(Array.isArray(changeOrderData?.items) ? changeOrderData.items : []);
        setNotificationItems(Array.isArray(notificationData?.items) ? notificationData.items : []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const getDelay = (d: string) => {
    if (!d) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t = new Date(d); t.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - t.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  };

  const userName = user?.name || "";
  const isMentionedOrRepliedToMe = (f: any) => {
    const mentionedByContent = userName ? f.content?.includes("@" + userName) : false;
    const repliedToMe = user?.id
      ? f.reply_to_user_id === user.id && f.user_id !== user.id
      : Boolean(userName && f.reply_to_user_name === userName && f.user_name !== userName);
    return mentionedByContent || repliedToMe;
  };
  const myMentioned = data.filter(isMentionedOrRepliedToMe);
  const router = useRouter();
  const list = myMentioned;
  const [ignoredIds, setIgnoredIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("todos_ignored") || "[]"); }
    catch { return []; }
  });
  const handleIgnore = (id: string) => {
    const next = [...ignoredIds, id];
    setIgnoredIds(next);
    localStorage.setItem("todos_ignored", JSON.stringify(next));
    window.dispatchEvent(new Event("todos:changed"));
  };

  const [subTab, setSubTab] = useState("pending");
  const [processedIds, setProcessedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("todos_processed") || "[]"); }
    catch { return []; }
  });
  const handleProcess = (id: string) => {
    const next = [...processedIds, id];
    setProcessedIds(next);
    localStorage.setItem("todos_processed", JSON.stringify(next));
    window.dispatchEvent(new Event("todos:changed"));
  };

  const handleReceiveQuotation = async (id: string) => {
    const token = localStorage.getItem("zxgj_token");
    await fetch("/api/todos/quotation-receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id, action: "receive" }),
    });
    loadTodos();
    window.dispatchEvent(new Event("todos:changed"));
  };

  const openQuotationPrint = async (quotationId: string) => {
    try {
      const url = await createQuotationPrintPreviewUrl(quotationId);
      const previewWindow = window.open(url, "_blank");
      if (!previewWindow) window.location.href = url;
    } catch (error: any) {
      window.alert(error?.message || "生成打印链接失败");
    }
  };

  const handleContractApproval = async (id: string, action: "approve" | "reject", signatureId = "", approvalComment = "") => {
    const comment = approvalComment;
    if (!signatureId) {
      setSignatureApproval({ kind: "contract", id, action });
      return false;
    }
    const token = localStorage.getItem("zxgj_token");
    setContractProcessingId(id + action);
    try {
      const res = await fetch("/api/todos/contract-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, action, comment, signature_id: signatureId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.message || "处理失败");
        return false;
      }
      loadTodos();
      window.dispatchEvent(new Event("todos:changed"));
      return true;
    } finally {
      setContractProcessingId("");
    }
  };

  const handleDepositApproval = async (id: string, action: "approve" | "reject", signatureId = "", approvalComment = "") => {
    const comment = approvalComment;
    if (!signatureId) {
      setSignatureApproval({ kind: "deposit", id, action });
      return false;
    }
    const token = localStorage.getItem("zxgj_token");
    setDepositProcessingId(id + action);
    try {
      const res = await fetch("/api/todos/deposit-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, action, comment, signature_id: signatureId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.message || "处理失败");
        return false;
      }
      loadTodos();
      window.dispatchEvent(new Event("todos:changed"));
      return true;
    } finally {
      setDepositProcessingId("");
    }
  };

  const handleDepositRefundApproval = async (id: string, action: "approve" | "reject", signatureId = "", approvalComment = "") => {
    const comment = approvalComment;
    if (!signatureId) {
      setSignatureApproval({ kind: "deposit_refund", id, action });
      return false;
    }
    const token = localStorage.getItem("zxgj_token");
    setDepositRefundProcessingId(id + action);
    try {
      const res = await fetch("/api/todos/deposit-refund-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, action, comment, signature_id: signatureId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.message || "处理失败");
        return false;
      }
      loadTodos();
      window.dispatchEvent(new Event("todos:changed"));
      return true;
    } finally {
      setDepositRefundProcessingId("");
    }
  };

  const handleChangeOrderApproval = async (id: string, action: "approve" | "reject", signatureId = "", approvalComment = "") => {
    const comment = approvalComment;
    if (!signatureId) {
      setSignatureApproval({ kind: "change_order", id, action });
      return false;
    }
    const token = localStorage.getItem("zxgj_token");
    setChangeOrderProcessingId(id + action);
    try {
      const res = await fetch("/api/todos/change-order-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, action, comment, signature_id: signatureId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.message || "处理失败");
        return false;
      }
      loadTodos();
      window.dispatchEvent(new Event("todos:changed"));
      return true;
    } finally {
      setChangeOrderProcessingId("");
    }
  };

  const openContractSummary = async (item: any) => {
    if (!item?.customer_id) {
      alert("缺少客户信息，无法加载合同纪要");
      return;
    }
    const token = localStorage.getItem("zxgj_token");
    setContractSummaryLoadingId(item.id || item.contract_id || "");
    try {
      const res = await fetch(`/api/customers/${item.customer_id}/contracts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "合同信息加载失败");
      const contracts = Array.isArray(data?.contracts) ? data.contracts : [];
      const contract = contracts.find((record: any) => record.id === item.contract_id)
        || contracts.find((record: any) => record.contract_no === item.contract_no);
      if (!contract) throw new Error("未找到对应合同，可能已被删除或无权限查看");
      setContractSummary(contract);
    } catch (err: any) {
      alert(err.message || "合同信息加载失败");
    } finally {
      setContractSummaryLoadingId("");
    }
  };

  const handleReadNotification = async (item: any) => {
    const token = localStorage.getItem("zxgj_token");
    if (!item.is_read) {
      await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: item.id, action: "read" }),
      }).catch(() => {});
      setNotificationItems((prev) => prev.map((notice) => notice.id === item.id ? { ...notice, is_read: 1 } : notice));
      window.dispatchEvent(new Event("todos:changed"));
    }
    if (item.link_url) router.push(item.link_url);
  };

  const handleReadAllNotifications = async () => {
    const unreadItems = notificationItems.filter((item) => !item.is_read);
    if (unreadItems.length === 0) return;
    const token = localStorage.getItem("zxgj_token");
    await Promise.all(unreadItems.map((item) => fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id: item.id, action: "read" }),
    }).catch(() => null)));
    setNotificationItems((prev) => prev.map((notice) => ({ ...notice, is_read: 1 })));
    window.dispatchEvent(new Event("todos:changed"));
  };

  const items = list.filter((f: any) => f.customer_name);
  const visibleItems = items.filter(f => {
    if (subTab === "pending") return !processedIds.includes(f.id) && !ignoredIds.includes(f.id);
    if (subTab === "processed") return processedIds.includes(f.id);
    return !ignoredIds.includes(f.id) || processedIds.includes(f.id);
  });
  const pendingCount = items.filter(f => !ignoredIds.includes(f.id) && !processedIds.includes(f.id)).length;
  const processedCount = items.filter(f => processedIds.includes(f.id)).length;
  const allCount = items.filter(f => !ignoredIds.includes(f.id) || processedIds.includes(f.id)).length;
  const pendingDesignerItems = designerItems.filter(isDesignerAssignmentActionable);
  const completedDesignerItems = designerItems.filter((item) => !isDesignerAssignmentActionable(item));
  const visibleDesignerItems =
    subTab === "pending" ? pendingDesignerItems :
    subTab === "processed" ? completedDesignerItems :
    designerItems;
  const pendingQuotationItems = quotationItems.filter((item) => item.status === "pending");
  const completedQuotationItems = quotationItems.filter((item) => item.status !== "pending");
  const visibleQuotationItems =
    subTab === "pending" ? pendingQuotationItems :
    subTab === "processed" ? completedQuotationItems :
    quotationItems;
  const pendingContractItems = contractItems.filter((item) => item.status === "pending");
  const completedContractItems = contractItems.filter((item) => item.status !== "pending");
  const visibleContractItems =
    subTab === "pending" ? pendingContractItems :
    subTab === "processed" ? completedContractItems :
    contractItems;
  const pendingDepositItems = depositItems.filter((item) => item.status === "pending");
  const completedDepositItems = depositItems.filter((item) => item.status !== "pending");
  const visibleDepositItems =
    subTab === "pending" ? pendingDepositItems :
    subTab === "processed" ? completedDepositItems :
    depositItems;
  const pendingDepositRefundItems = depositRefundItems.filter((item) => item.status === "pending");
  const completedDepositRefundItems = depositRefundItems.filter((item) => item.status !== "pending");
  const visibleDepositRefundItems =
    subTab === "pending" ? pendingDepositRefundItems :
    subTab === "processed" ? completedDepositRefundItems :
    depositRefundItems;
  const pendingChangeOrderItems = changeOrderItems.filter((item) => item.status === "pending");
  const completedChangeOrderItems = changeOrderItems.filter((item) => item.status !== "pending");
  const visibleChangeOrderItems =
    subTab === "pending" ? pendingChangeOrderItems :
    subTab === "processed" ? completedChangeOrderItems :
    changeOrderItems;
  const unreadNotificationItems = notificationItems.filter((item) => !item.is_read);
  const readNotificationItems = notificationItems.filter((item) => item.is_read);
  const visibleNotificationItems =
    subTab === "pending" ? unreadNotificationItems :
    subTab === "processed" ? readNotificationItems :
    notificationItems;
  const allOverviewItems = [
    ...visibleContractItems.map((item) => ({
      id: `contract_${item.id}`,
      title: `合同审批 · ${item.contract_title || item.contract_no || "未命名合同"}`,
      description: `客户「${item.customer_name || "未知客户"}」合同金额 ${formatCurrency(item.total_amount || 0)}，当前节点：${item.node_name || item.flow_name || "合同审批"}。`,
      facts: [
        { label: "客户", value: item.customer_name || "未知客户" },
        { label: "合同金额", value: formatCurrency(item.total_amount || 0), emphasis: true },
        { label: "当前节点", value: item.node_name || item.flow_name || "合同审批" },
      ],
      href: `/projects/${item.customer_id}?tab=contract`,
      badge: item.status === "pending" ? "待审批" : item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理",
      badgeClass: item.status === "pending" ? "bg-[#EDF4FF] text-[#407AFF]" : item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]",
      icon: FileText,
      iconClass: "bg-[#EDF4FF] text-[#407AFF]",
      meta: [`发起人：${item.created_by_name || "未知"}`, formatDate(item.created_at)],
    })),
    ...visibleDepositItems.map((item) => {
      const paymentLabel = getPaymentRecordLabel(item);
      const isTopUpApproval = item.approval_kind === "top_up";
      const actionLabel = isTopUpApproval ? `补收${paymentLabel}` : paymentLabel;
      const approvalAmount = Number(item.approval_amount || item.amount || 0);
      return {
        id: `deposit_${item.id}`,
        title: `${actionLabel}审批 · ${item.customer_name || "未知客户"}`,
        description: `提交 ${formatCurrency(approvalAmount)} ${actionLabel}，类型：${item.deposit_type || "未填写"}，当前节点：${item.node_name || item.flow_name || `${actionLabel}审批`}。`,
        facts: [
          { label: "客户", value: item.customer_name || "未知客户" },
          { label: `${actionLabel}金额`, value: formatCurrency(approvalAmount), emphasis: true },
          { label: "收款类型", value: item.deposit_type || "未填写" },
          { label: "当前节点", value: item.node_name || item.flow_name || `${actionLabel}审批` },
        ],
        href: `/projects/${item.customer_id}?tab=deposit`,
        badge: item.status === "pending" ? "待审批" : item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理",
        badgeClass: item.status === "pending" ? "bg-amber-50 text-amber-700" : item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]",
        icon: DollarSign,
        iconClass: "bg-amber-50 text-amber-700",
        meta: [`门店：${item.branch_name || "未知"}`, formatDate(item.created_at)],
      };
    }),
    ...visibleDepositRefundItems.map((item) => {
      const refundLabel = getRefundActionLabel(item);
      const refundAmount = Number(item.refund_amount || item.approval_refund_amount || 0);
      return {
        id: `deposit_refund_${item.id}`,
        title: `${refundLabel}审批 · ${item.customer_name || "未知客户"}`,
        description: `申请${refundLabel} ${formatCurrency(refundAmount)}，当前节点：${item.node_name || item.flow_name || `${refundLabel}审批`}。`,
        facts: [
          { label: "客户", value: item.customer_name || "未知客户" },
          { label: `${refundLabel}金额`, value: formatCurrency(refundAmount), emphasis: true },
          { label: "当前节点", value: item.node_name || item.flow_name || `${refundLabel}审批` },
        ],
        href: `/projects/${item.customer_id}?tab=deposit`,
        badge: item.status === "pending" ? "待处理" : item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理",
        badgeClass: item.status === "pending" ? "bg-red-50 text-red-700" : item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]",
        icon: DollarSign,
        iconClass: "bg-red-50 text-red-600",
        meta: [`申请人：${item.created_by_name || "未知"}`, formatDate(item.refund_requested_at || item.created_at)],
      };
    }),
    ...visibleChangeOrderItems.map((item) => {
      const discountAmount = item.change_type === "DEDUCT" ? 0 : Math.max(0, Number(item.discount_amount || 0) || 0);
      return {
        id: `change_order_${item.id}`,
        title: `变更单审批 · ${item.change_no || item.title || "未命名变更单"}`,
        description: `客户「${item.customer_name || "未知客户"}」${item.change_type === "DEDUCT" ? "减项" : "增项"} ${formatCurrency(Number(item.amount || 0))}${discountAmount > 0 ? `，已优惠 ${formatCurrency(discountAmount)}` : ""}，当前节点：${item.node_name || item.flow_name || "变更单审批"}。`,
        facts: [
          { label: "客户", value: item.customer_name || "未知客户" },
          { label: "变更类型", value: item.change_type === "DEDUCT" ? "减项" : "增项" },
          { label: "变更金额", value: formatCurrency(Number(item.amount || 0)), emphasis: true },
          ...(discountAmount > 0 ? [{ label: "已优惠", value: formatCurrency(discountAmount) }] : []),
          { label: "当前节点", value: item.node_name || item.flow_name || "变更单审批" },
        ],
        href: `/site/${item.project_id}?tab=changes`,
        badge: item.status === "pending" ? "待审批" : item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理",
        badgeClass: item.status === "pending" ? "bg-cyan-50 text-cyan-700" : item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]",
        icon: ClipboardCheck,
        iconClass: "bg-cyan-50 text-cyan-700",
        meta: [`发起人：${item.created_by_name || "未知"}`, formatDate(item.created_at || item.change_order_created_at)],
      };
    }),
    ...visibleDesignerItems.map((item) => ({
      id: `designer_${item.id}`,
      title: `设计师分配 · ${item.customer_name || "未知客户"}`,
      description: getDesignerAssignmentDescription(item),
      href: `/projects/${item.customer_id}`,
      badge: getDesignerAssignmentStatusLabel(item),
      badgeClass: isDesignerAssignmentActionable(item) ? "bg-amber-50 text-amber-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
      icon: User,
      iconClass: isDesignerAssignmentActionable(item) ? "bg-amber-50 text-amber-700" : "bg-[#EDF4FF] text-[#407AFF]",
      meta: [`门店：${item.store_name || item.service_store || "未知"}`, formatDate(item.created_at)],
    })),
    ...visibleQuotationItems.map((item) => ({
      id: `quotation_${item.id}`,
      title: `待接收报价单 · ${item.customer_name || "未知客户"}`,
      description: `${item.sender_name || "系统"}发送了「${item.title || "装修报价单"}」，金额 ${formatCurrency(item.final_amount ?? item.total_amount ?? 0)}。`,
      facts: [
        { label: "客户", value: item.customer_name || "未知客户" },
        { label: "发送人", value: item.sender_name || "系统" },
        { label: "报价金额", value: formatCurrency(item.final_amount ?? item.total_amount ?? 0), emphasis: true },
      ],
      href: `/quotations/${item.quotation_id}`,
      badge: item.status === "pending" ? "待接收" : "已接收",
      badgeClass: item.status === "pending" ? "bg-[#EDF4FF] text-[#407AFF]" : "bg-emerald-50 text-emerald-700",
      icon: FileText,
      iconClass: "bg-[#EDF4FF] text-[#407AFF]",
      meta: [`客户：${item.customer_name || "未知"}`, formatDate(item.created_at)],
    })),
    ...visibleItems.map((item) => {
      const delay = getDelay(item.next_date);
      const Icon = typeIcons[item.type] || FileText;
      return {
        id: `follow_${item.id}`,
        title: `提及与回复 · ${item.customer_name || "未知客户"}`,
        description: item.content || "你有一条跟进消息需要处理。",
        href: `/projects/${item.customer_id}`,
        badge: delay > 0 ? `延期 ${delay} 天` : "待处理",
        badgeClass: delay > 0 ? "bg-red-50 text-red-700" : "bg-[#EDF4FF] text-[#407AFF]",
        icon: Icon,
        iconClass: delay > 0 ? "bg-red-50 text-red-600" : "bg-[#eef4fb] text-[#52647b]",
        meta: [`跟进人：${item.user_name || "未知"}`, formatDate(item.created_at)],
      };
    }),
  ];
  const currentVisibleItems =
    tab === "all" ? allOverviewItems :
    tab === "designer_assignment" ? visibleDesignerItems :
    tab === "quotation_receipt" ? visibleQuotationItems :
    tab === "contract_approval" ? visibleContractItems :
    tab === "deposit_approval" ? visibleDepositItems :
    tab === "deposit_refund_approval" ? visibleDepositRefundItems :
    tab === "change_order_approval" ? visibleChangeOrderItems :
    tab === "notifications" ? visibleNotificationItems :
    visibleItems;
  const todoPagination = useDataPagination(currentVisibleItems, [tab, subTab].join("|"));
  const designerPendingCount = pendingDesignerItems.length;
  const quotationPendingCount = pendingQuotationItems.length;
  const contractPendingCount = pendingContractItems.length;
  const depositPendingCount = pendingDepositItems.length;
  const depositRefundPendingCount = pendingDepositRefundItems.length;
  const changeOrderPendingCount = pendingChangeOrderItems.length;
  const notificationPendingCount = unreadNotificationItems.length;
  const totalPendingCount = pendingCount + designerPendingCount + quotationPendingCount + contractPendingCount + depositPendingCount + depositRefundPendingCount + changeOrderPendingCount;
  const totalProcessedCount = processedCount + completedDesignerItems.length + completedQuotationItems.length + completedContractItems.length + completedDepositItems.length + completedDepositRefundItems.length + completedChangeOrderItems.length;
  const totalAllCount = allCount + designerItems.length + quotationItems.length + contractItems.length + depositItems.length + depositRefundItems.length + changeOrderItems.length;
  const visibleCount = currentVisibleItems.length;
  const subTabCounts =
    tab === "all" ? { pending: totalPendingCount, processed: totalProcessedCount, all: totalAllCount } :
    tab === "designer_assignment" ? { pending: designerPendingCount, processed: completedDesignerItems.length, all: designerItems.length } :
    tab === "quotation_receipt" ? { pending: quotationPendingCount, processed: completedQuotationItems.length, all: quotationItems.length } :
    tab === "contract_approval" ? { pending: contractPendingCount, processed: completedContractItems.length, all: contractItems.length } :
    tab === "deposit_approval" ? { pending: depositPendingCount, processed: completedDepositItems.length, all: depositItems.length } :
    tab === "deposit_refund_approval" ? { pending: depositRefundPendingCount, processed: completedDepositRefundItems.length, all: depositRefundItems.length } :
    tab === "change_order_approval" ? { pending: changeOrderPendingCount, processed: completedChangeOrderItems.length, all: changeOrderItems.length } :
    tab === "notifications" ? { pending: notificationPendingCount, processed: readNotificationItems.length, all: notificationItems.length } :
    { pending: pendingCount, processed: processedCount, all: allCount };
  const todoCategories = [
    { key: "all", title: "全部待办", description: "今日最急事项集中处理", count: totalPendingCount, icon: CategoryAllIcon, color: "#407AFF" },
    { key: "notifications", title: "消息提醒", description: "审批结果和系统通知", count: notificationPendingCount, icon: CategoryNoticeIcon, color: "#F59E0B" },
    { key: "mentioned", title: "提及与回复", description: "@我、回复我的跟进", count: pendingCount, icon: CategoryMentionIcon, color: "#8B5CF6" },
    { key: "designer_assignment", title: "设计师分配", description: "客户待分配设计师", count: designerPendingCount, icon: CategoryDesignerIcon, color: "#06B6D4" },
    { key: "deposit_approval", title: "收款审批", description: "定金和设计费收款", count: depositPendingCount, icon: CategoryPaymentIcon, color: "#18A058" },
    { key: "deposit_refund_approval", title: "退款审批", description: "退定金和退款处理", count: depositRefundPendingCount, icon: CategoryRefundIcon, color: "#EF4444" },
    { key: "change_order_approval", title: "变更单审批", description: "工地增减项审批", count: changeOrderPendingCount, icon: CategoryChangeIcon, color: "#0EA5E9" },
    { key: "quotation_receipt", title: "报价接收", description: "设计师报价单确认", count: quotationPendingCount, icon: CategoryQuotationIcon, color: "#F97316" },
    { key: "contract_approval", title: "合同审批", description: "合同流程与签约审批", count: contractPendingCount, icon: CategoryContractIcon, color: "#2563EB" },
  ];
  const activeCategory = todoCategories.find((category) => category.key === tab) || todoCategories[0];
  const isNotificationTab = tab === "notifications";
  const statusFilterHelper = isNotificationTab ? "消息提醒按未读、已读查看，不要求逐条点开处理。" : "按处理状态缩小任务范围，优先完成待处理事项。";
  const statusFilterOptions = isNotificationTab
    ? [
        { key: "pending", label: "未读", count: subTabCounts.pending },
        { key: "processed", label: "已读", count: subTabCounts.processed },
        { key: "all", label: "全部", count: subTabCounts.all },
      ]
    : [
        { key: "pending", label: "待处理", count: subTabCounts.pending },
        { key: "processed", label: "已处理", count: subTabCounts.processed },
        { key: "all", label: "全部", count: subTabCounts.all },
      ];

  return (
    <div className={pageClass}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <div className={styles.titleGroup}>
            <span className={styles.titleIcon}>
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h1 className={styles.pageTitle}>待办中心</h1>
              <p className={styles.pageSubtitle}>集中查看审批、分配、提醒与跟进任务，当前分类共 {visibleCount} 条</p>
            </div>
          </div>
          <div className={styles.summaryStrip} aria-label="待办汇总">
            <div className={cn(styles.summaryItem, styles.summaryPending)}>
              <span className={styles.summaryLabel}>待处理</span>
              <strong className={styles.summaryValue}>{totalPendingCount}</strong>
            </div>
            <div className={cn(styles.summaryItem, styles.summaryProcessed)}>
              <span className={styles.summaryLabel}>已处理</span>
              <strong className={styles.summaryValue}>{totalProcessedCount}</strong>
            </div>
            <div className={cn(styles.summaryItem, styles.summaryUnread)}>
              <span className={styles.summaryLabel}>未读消息</span>
              <strong className={styles.summaryValue}>{notificationPendingCount}</strong>
            </div>
          </div>
        </header>

        <section className={styles.workspace}>
          <aside className={styles.categoryRail} aria-label="待办业务分类">
            <div className={styles.railHeader}>
              <p className={styles.railTitle}>业务分类</p>
              <p className={styles.railHelper}>选择分类后默认显示待处理事项</p>
            </div>
            <nav className={styles.categoryList}>
              {todoCategories.map((category) => {
                const CategoryIcon = category.icon;
                const selected = tab === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => {
                      setTab(category.key);
                      setSubTab("pending");
                    }}
                    aria-pressed={selected}
                    className={cn(styles.categoryButton, selected && styles.categoryButtonActive)}
                    style={{ "--category-color": category.color } as CSSProperties}
                  >
                    <span className={styles.categoryIcon}>
                      <CategoryIcon className={styles.categorySvg} aria-hidden="true" />
                    </span>
                    <span className={styles.categoryCopy}>
                      <span className={styles.categoryTitle}>{category.title}</span>
                      <span className={styles.categoryDescription}>{category.description}</span>
                    </span>
                    <span className={styles.categoryCount}>{category.count}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className={styles.taskPane}>
            <div className={styles.taskToolbar}>
              <div>
                <p className={styles.taskTitle}>{activeCategory.title}</p>
                <p className={styles.taskHelper}>{statusFilterHelper}</p>
              </div>
              <div className={styles.toolbarActions}>
                {isNotificationTab && notificationPendingCount > 0 && (
                  <button type="button" onClick={handleReadAllNotifications} className={styles.readAllButton}>
                    全部已读
                  </button>
                )}
                <div className={`${styles.segmented} system-status-segmented`}>
                  {statusFilterOptions.map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setSubTab(st.key)}
                      className={cn(styles.segmentButton, "system-status-option", subTab === st.key && styles.segmentButtonActive, subTab === st.key && "system-status-option-active")}
                    >
                      {st.label}<span className={`${styles.segmentCount} system-status-count`}>{st.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.taskContent}>

      {loading ? (
        <TodoLoadingState />
      ) : tab === "all" ? (
        allOverviewItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <CheckSquare className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无待办事项</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => {
              const OverviewIcon = item.icon || FileText;
              const content = (
                <div className={todoListCardClass}>
                  <div className={todoCardRowClass}>
                    <span className={`${todoAvatarClass} ${item.iconClass || "bg-[#eef4fb] text-[#52647b]"}`}>
                      <OverviewIcon className="h-4 w-4" />
                    </span>
                    <div className={styles.overviewBody}>
                      <div className={styles.overviewHeading}>
                        <p className={styles.overviewTitle}>{item.title}</p>
                        <span className={cn(styles.overviewBadge, item.badgeClass || "bg-[#eef4fb] text-[#8b9aaf]")}>{item.badge}</span>
                      </div>
                      {Array.isArray(item.facts) && item.facts.length > 0 ? (
                        <div className={styles.overviewFacts}>
                          {item.facts.map((fact: { label: string; value: string; emphasis?: boolean }, index: number) => (
                            <span key={`${fact.label}_${index}`} className={styles.overviewFact}>
                              <span className={styles.overviewFactLabel}>{fact.label}</span>
                              <strong className={cn(styles.overviewFactValue, fact.emphasis && styles.overviewFactValueEmphasis)}>{fact.value}</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.overviewDescription}>{item.description}</p>
                      )}
                      <div className={styles.overviewMeta}>
                        {(item.meta || []).map((meta: string, index: number) => (
                          <span key={index}>
                            {index === 0 ? <User className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {meta}
                          </span>
                        ))}
                      </div>
                    </div>
                    {item.href && (
                      <span className={todoActionRailClass}>
                        <span className={actionButtonClass}><Eye className="h-3.5 w-3.5" />查看详情</span>
                      </span>
                    )}
                  </div>
                </div>
              );

              return item.href ? (
                <Link key={item.id} href={item.href} className="group block">
                  {content}
                </Link>
              ) : (
                <div key={item.id}>{content}</div>
              );
            })}
          </div>
        )
      ) : tab === "designer_assignment" ? (
        visibleDesignerItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <CheckSquare className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无待分配设计师</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => (
              <div key={item.id} className={todoListCardClass}>
                <div className={todoCardRowClass}>
                  <Link href={"/projects/" + item.customer_id}
                    className={`${todoAvatarClass} bg-[#EDF4FF] text-[#407AFF] hover:bg-[#DDE7FF]`}
                  >{(item.customer_name || "?")[0]}</Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={"/projects/" + item.customer_id} className="text-sm font-black text-[#162033] hover:text-[#407AFF]">{item.customer_name}</Link>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        isDesignerAssignmentActionable(item)
                          ? "bg-amber-50 text-amber-700"
                          : item.status === "rejected"
                            ? "bg-red-50 text-red-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}>
                        <User className="h-3 w-3" />{getDesignerAssignmentStatusLabel(item)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b]">{getDesignerAssignmentDescription(item)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                      <span className="flex items-center gap-1"><Store className="h-3 w-3" />{item.store_name || item.service_store || "未知门店"}</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.requester_name || "未知申请人"}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                  {isDesignerAssignmentActionable(item) && (
                    <div className={todoActionRailClass}>
                      <button onClick={() => router.push("/projects/" + item.customer_id)}
                        className={actionButtonClass}>{item.status === "pending_dispatch" ? "去分派" : "去分配"}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "quotation_receipt" ? (
        visibleQuotationItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <CheckSquare className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无待接收报价单</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => (
              <div key={item.id} className={todoListCardClass}>
                <div className={todoCardRowClass}>
                  <Link href={"/projects/" + item.customer_id}
                    className={`${todoAvatarClass} bg-[#EDF4FF] text-[#407AFF] hover:bg-[#DDE7FF]`}
                  >{(item.customer_name || "?")[0]}</Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={"/projects/" + item.customer_id} className="text-sm font-black text-[#162033] hover:text-[#407AFF]">{item.customer_name || "未知客户"}</Link>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EDF4FF] px-2 py-0.5 text-[11px] font-bold text-[#407AFF]">
                        <FileText className="h-3 w-3" />待接收报价单
                      </span>
                      {item.status !== "pending" && (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">已接收</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b]">
                      {item.sender_name || "系统"}发送了「{item.title || "装修报价单"}」，金额 {formatCurrency(item.final_amount ?? item.total_amount ?? 0)}。
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                      <span className="flex items-center gap-1"><Home className="h-3 w-3" />{item.project_address || item.project_name || "未填写地址"}</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.customer_phone || "未填写手机号"}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                  <div className={todoActionRailWideClass}>
                    <Link href={"/quotations/" + item.quotation_id} className={actionButtonClass}><Eye className="mr-1 h-3.5 w-3.5" />查看</Link>
                    <button type="button" onClick={() => openQuotationPrint(item.quotation_id)} className={actionButtonClass}><Printer className="mr-1 h-3.5 w-3.5" />打印PDF</button>
                    <a href={"/api/quotations/" + item.quotation_id + "/export"} className={actionButtonClass}><Download className="mr-1 h-3.5 w-3.5" />下载</a>
                    {item.status === "pending" && (
                      <button onClick={() => handleReceiveQuotation(item.id)}
                        className={approveButtonClass}>确认接收</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "contract_approval" ? (
        visibleContractItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <CheckSquare className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无待审批合同</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => {
              const isPending = item.status === "pending";
              const approveLoading = contractProcessingId === item.id + "approve";
              const rejectLoading = contractProcessingId === item.id + "reject";
              return (
                <div key={item.id} className={todoListCardClass}>
                  <div className={todoCardRowClass}>
                    <Link href={"/projects/" + item.customer_id + "?tab=contract"}
                      className={`${todoAvatarClass} bg-[#EDF4FF] text-[#407AFF] hover:bg-[#DDE7FF]`}
                    >{(item.customer_name || "?")[0]}</Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={"/projects/" + item.customer_id + "?tab=contract"} className="text-sm font-black text-[#162033] hover:text-[#407AFF]">{item.customer_name || "未知客户"}</Link>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EDF4FF] px-2 py-0.5 text-[11px] font-bold text-[#407AFF]">
                          <FileText className="h-3 w-3" />待审批合同
                        </span>
                        {!isPending && (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]"}`}>
                            {item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b]">
                        合同「{item.contract_title || item.contract_no || "未命名合同"}」正在「{item.node_name || item.flow_name || "合同审批"}」，金额 {formatCurrency(item.total_amount || 0)}。
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                        <span className="flex items-center gap-1"><Home className="h-3 w-3" />{item.project_address || item.project_name || "未填写地址"}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />发起人：{item.created_by_name || "未知"}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.created_at)}</span>
                      </div>
                      <ApprovalSignaturePreview step={item} compact />
                    </div>
                    <div className={todoActionRailWideClass}>
                      <button
                        type="button"
                        onClick={() => openContractSummary(item)}
                        disabled={contractSummaryLoadingId === item.id}
                        className={actionButtonClass}
                      >
                        {contractSummaryLoadingId === item.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                        查看
                      </button>
                      {isPending && (
                        <>
                          <button onClick={() => handleContractApproval(item.id, "approve")} disabled={Boolean(contractProcessingId)}
                            className={approveButtonClass}>
                            {approveLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            同意
                          </button>
                          <button onClick={() => handleContractApproval(item.id, "reject")} disabled={Boolean(contractProcessingId) || !item.can_reject}
                            className={rejectButtonClass}>
                            {rejectLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            驳回
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === "deposit_approval" ? (
        visibleDepositItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <CheckSquare className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无款项审批</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => {
              const isPending = item.status === "pending";
              const approveLoading = depositProcessingId === item.id + "approve";
              const rejectLoading = depositProcessingId === item.id + "reject";
              const paymentLabel = getPaymentRecordLabel(item);
              return (
                <div key={item.id} className={todoListCardClass}>
                  <div className={todoCardRowClass}>
                    <Link href={"/projects/" + item.customer_id + "?tab=deposit"}
                      className={`${todoAvatarClass} bg-amber-50 text-amber-700 hover:bg-amber-100`}
                    >{(item.customer_name || "?")[0]}</Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={"/projects/" + item.customer_id + "?tab=deposit"} className="text-sm font-black text-[#162033] hover:text-[#407AFF]">{item.customer_name || "未知客户"}</Link>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          <DollarSign className="h-3 w-3" />{paymentLabel}审批
                        </span>
                        {!isPending && (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]"}`}>
                            {item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b]">
                        客户「{item.customer_name || "未知客户"}」提交了 {formatCurrency(Number(item.approval_amount || item.amount || 0))} {item.approval_kind === "top_up" ? `补收${paymentLabel}` : paymentLabel}，类型：{item.deposit_type || "未填写"}，正在「{item.node_name || item.flow_name || `${item.approval_kind === "top_up" ? `补收${paymentLabel}` : paymentLabel}审批`}」。
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                        <span className="flex items-center gap-1"><Home className="h-3 w-3" />{item.house_address || item.customer_address || "未填写地址"}</span>
                        <span className="flex items-center gap-1"><Store className="h-3 w-3" />{item.branch_name || "未知门店"}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />发起人：{item.created_by_name || "未知"}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.created_at)}</span>
                      </div>
                      <ApprovalSignaturePreview step={item} compact />
                    </div>
                    <div className={todoActionRailWideClass}>
                      <Link
                        href={"/projects/" + item.customer_id + "?tab=deposit"}
                        className={actionButtonClass}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        查看
                      </Link>
                      {isPending && (
                        <>
                          <button onClick={() => handleDepositApproval(item.id, "approve")} disabled={Boolean(depositProcessingId)}
                            className={approveButtonClass}>
                            {approveLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            同意
                          </button>
                          <button onClick={() => handleDepositApproval(item.id, "reject")} disabled={Boolean(depositProcessingId) || !item.can_reject}
                            className={rejectButtonClass}>
                            {rejectLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            驳回
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === "deposit_refund_approval" ? (
        visibleDepositRefundItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <CheckSquare className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无退款审批</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => {
              const isPending = item.status === "pending";
              const approveLoading = depositRefundProcessingId === item.id + "approve";
              const rejectLoading = depositRefundProcessingId === item.id + "reject";
              const refundAmount = Number(item.refund_amount || item.approval_refund_amount || 0);
              const refundReason = item.refund_reason || item.approval_refund_reason || "未填写";
              const refundLabel = getRefundActionLabel(item);
              return (
                <div key={item.id} className={todoListCardClass}>
                  <div className={todoCardRowClass}>
                    <Link href={"/projects/" + item.customer_id + "?tab=deposit"}
                      className={`${todoAvatarClass} bg-red-50 text-red-600 hover:bg-red-100`}
                    >{(item.customer_name || "?")[0]}</Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={"/projects/" + item.customer_id + "?tab=deposit"} className="text-sm font-black text-[#162033] hover:text-[#407AFF]">{item.customer_name || "未知客户"}</Link>
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                          <DollarSign className="h-3 w-3" />{refundLabel}审批
                        </span>
                        {!isPending && (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]"}`}>
                            {item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b]">
                        客户「{item.customer_name || "未知客户"}」申请{refundLabel} {formatCurrency(refundAmount)}，正在「{item.node_name || item.flow_name || `${refundLabel}审批`}」。
                      </p>
                      <p className="mt-1 text-xs text-[#8b9aaf] line-clamp-1">{refundLabel}原因：{refundReason}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                        <span className="flex items-center gap-1"><Home className="h-3 w-3" />{item.house_address || item.customer_address || "未填写地址"}</span>
                        <span className="flex items-center gap-1"><Store className="h-3 w-3" />{item.branch_name || "未知门店"}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />申请人：{item.created_by_name || "未知"}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.refund_requested_at || item.created_at)}</span>
                      </div>
                      <ApprovalSignaturePreview step={item} compact />
                    </div>
                    <div className={todoActionRailWideClass}>
                      <Link
                        href={"/projects/" + item.customer_id + "?tab=deposit"}
                        className={actionButtonClass}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        查看
                      </Link>
                      {isPending && (
                        <>
                          <button onClick={() => handleDepositRefundApproval(item.id, "approve")} disabled={Boolean(depositRefundProcessingId)}
                            className={approveButtonClass}>
                            {approveLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            同意
                          </button>
                          <button onClick={() => handleDepositRefundApproval(item.id, "reject")} disabled={Boolean(depositRefundProcessingId) || !item.can_reject}
                            className={rejectButtonClass}>
                            {rejectLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            驳回
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === "change_order_approval" ? (
        visibleChangeOrderItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <ClipboardCheck className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无变更单审批</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => {
              const isPending = item.status === "pending";
              const approveLoading = changeOrderProcessingId === item.id + "approve";
              const rejectLoading = changeOrderProcessingId === item.id + "reject";
              const changeTypeLabel = item.change_type === "DEDUCT" ? "减项" : "增项";
              const discountAmount = item.change_type === "DEDUCT" ? 0 : Math.max(0, Number(item.discount_amount || 0) || 0);
              return (
                <div key={item.id} className={todoListCardClass}>
                  <div className={todoCardRowClass}>
                    <Link href={"/site/" + item.project_id + "?tab=changes"}
                      className={`${todoAvatarClass} bg-cyan-50 text-cyan-700 hover:bg-cyan-100`}
                    >{(item.customer_name || "?")[0]}</Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={"/site/" + item.project_id + "?tab=changes"} className="text-sm font-black text-[#162033] hover:text-[#407AFF]">{item.customer_name || "未知客户"}</Link>
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-700">
                          <ClipboardCheck className="h-3 w-3" />变更单审批
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${item.change_type === "DEDUCT" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {changeTypeLabel}
                        </span>
                        {!isPending && (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-[#eef4fb] text-[#8b9aaf]"}`}>
                            {item.status === "approved" ? "已同意" : item.status === "rejected" ? "已驳回" : "已处理"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b]">
                        变更单「{item.change_no || item.title || "未命名"}」金额 {formatCurrency(Number(item.amount || 0))}{discountAmount > 0 ? `，已优惠 ${formatCurrency(discountAmount)}` : ""}，正在「{item.node_name || item.flow_name || "变更单审批"}」。
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                        <span className="flex items-center gap-1"><Home className="h-3 w-3" />{item.house_address || item.project_address || item.customer_address || item.project_name || "未填写房号"}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />发起人：{item.created_by_name || "未知"}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.change_order_created_at || item.created_at)}</span>
                      </div>
                      <ApprovalSignaturePreview step={item} compact />
                    </div>
                    <div className={todoActionRailWideClass}>
                      <Link
                        href={"/site/" + item.project_id + "?tab=changes"}
                        className={actionButtonClass}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        查看
                      </Link>
                      {isPending && (
                        <>
                          <button onClick={() => handleChangeOrderApproval(item.id, "approve")} disabled={Boolean(changeOrderProcessingId)}
                            className={approveButtonClass}>
                            {approveLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            同意
                          </button>
                          <button onClick={() => handleChangeOrderApproval(item.id, "reject")} disabled={Boolean(changeOrderProcessingId) || !item.can_reject}
                            className={rejectButtonClass}>
                            {rejectLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            驳回
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : tab === "notifications" ? (
        visibleNotificationItems.length === 0 ? (
          <div className={emptyStateClass}>
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
              <Bell className="mb-3 h-10 w-10 text-[#c4d2e3]" />
              <p className="text-sm">暂无消息提醒</p>
            </div>
          </div>
        ) : (
          <div className={styles.taskList}>
            {todoPagination.pageItems.map((item: any) => {
              const unread = !item.is_read;
              const isRejected = String(item.title || "").includes("驳回");
              return (
                <div key={item.id} className={todoListCardClass}>
                  <div className={todoCardRowClass}>
                    <div className={`${todoAvatarClass} ${
                      isRejected ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                    }`}>
                      <Bell className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-[#162033]">{item.title || "消息提醒"}</span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          unread ? "bg-[#EDF4FF] text-[#407AFF]" : "bg-[#eef4fb] text-[#8b9aaf]"
                        }`}>
                          {unread ? "未读" : "已读"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b] line-clamp-2">{item.content || "你有一条新的审批消息。"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                    <div className={todoActionRailClass}>
                      <button
                        onClick={() => handleReadNotification(item)}
                        className={actionButtonClass}
                      >
                        {item.link_url ? "查看" : unread ? "标记已读" : "已读"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : visibleItems.length === 0 ? (
        <div className={emptyStateClass}>
          <div className="flex flex-col items-center justify-center py-12 text-[#9aa8bb]">
            <CheckSquare className="mb-3 h-10 w-10 text-[#c4d2e3]" />
            <p className="text-sm">{tab === "mentioned" ? "暂无提及或回复你的跟进" : "暂无待办事项"}</p>
          </div>
        </div>
      ) : (
        <div className={styles.taskList}>
          {todoPagination.pageItems.map((f: any) => {
            const Icon = typeIcons[f.type] || FileText;
            const delay = getDelay(f.next_date);
            return (
              <div key={f.id} className={todoListCardClass}>
                <div className={todoCardRowClass}>
                  <Link href={"/projects/" + f.customer_id}
                    className={`${todoAvatarClass} bg-[#EDF4FF] text-[#407AFF] hover:bg-[#DDE7FF]`}
                  >{(f.customer_name || "?")[0]}</Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={"/projects/" + f.customer_id} className="text-sm font-black text-[#162033] hover:text-[#407AFF]">{f.customer_name}</Link>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4fb] px-2 py-0.5 text-[11px] font-bold text-[#8b9aaf]">
                        <Icon className="h-3 w-3" />{f.type}
                      </span>
                      {delay > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">
                          <AlertTriangle className="h-3 w-3" />延期 {delay} 天
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#52647b] line-clamp-2">{f.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#8b9aaf]">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{f.user_name || "未知"}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(f.created_at)}</span>
                      {f.next_date && (
                        <span className={"flex items-center gap-1 " + (delay > 0 ? "text-red-500 font-medium" : "text-amber-600")}>
                          <Calendar className="h-3 w-3" />下次：{f.next_date}
                        </span>
                      )}
                    </div>
                  </div>
                  {subTab !== "processed" && !processedIds.includes(f.id) && (
                    <div className={todoActionRailClass}>
                      <button onClick={() => handleProcess(f.id)}
                        className={actionButtonClass}>处理</button>
                      <button onClick={() => handleIgnore(f.id)}
                        className={actionButtonClass}>忽略</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
            </div>
      {!loading && visibleCount > 0 && (
        <DataPagination
          total={visibleCount}
          page={todoPagination.page}
          pageSize={todoPagination.pageSize}
          onPageChange={todoPagination.setPage}
          onPageSizeChange={todoPagination.setPageSize}
          itemName="条待办"
          className={styles.pagination}
        />
      )}
          </div>
        </section>
      <ContractSummaryModal
        contract={contractSummary}
        currentUserId={user?.id}
        approvalProcessingId={contractProcessingId}
        onClose={() => setContractSummary(null)}
        onApprovalAction={async (stepId, action) => {
          const success = await handleContractApproval(stepId, action);
          if (success) setContractSummary(null);
        }}
      />
      <ApprovalSignatureModal
        open={Boolean(signatureApproval)}
        action={signatureApproval?.action || "approve"}
        title={signatureApproval?.action === "reject" ? "确认审批驳回" : "确认审批通过"}
        processing={Boolean(contractProcessingId || depositProcessingId || depositRefundProcessingId || changeOrderProcessingId)}
        onClose={() => setSignatureApproval(null)}
        onConfirm={async (signatureId, comment) => {
          if (!signatureApproval) return;
          const { kind, id, action } = signatureApproval;
          const success = kind === "contract"
            ? await handleContractApproval(id, action, signatureId, comment)
            : kind === "deposit"
              ? await handleDepositApproval(id, action, signatureId, comment)
              : kind === "deposit_refund"
                ? await handleDepositRefundApproval(id, action, signatureId, comment)
                : await handleChangeOrderApproval(id, action, signatureId, comment);
          if (success) {
            setSignatureApproval(null);
            if (kind === "contract") setContractSummary(null);
          }
        }}
      />
      </div>
    </div>
  );
}
