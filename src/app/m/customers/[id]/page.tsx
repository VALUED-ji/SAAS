"use client";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import {
  BranchSettings, ContractSheet, ContractWorkspace, FollowupMentionMember, FollowupReplyTarget,
  FollowupSheet, MobileAttachment, MobileCustomer, MobileTeamMember, MoreSheet, PaymentSheet, TeamAssignmentSheet,
} from "@/components/mobile/CustomerDetailSheets";
import { MobileCustomerEditScreen } from "@/components/mobile/MobileCustomerEditScreen";
import {
  AlertTriangle, ArrowLeft, CalendarClock, Camera, Check, ChevronRight, CircleDollarSign, ClipboardCheck,
  ClipboardList, Clock3, FileText, FolderOpen, Image as ImageIcon, Loader2, MapPin,
  MessageCircle, MoreHorizontal, Phone, Plus, ReceiptText, Reply, Ruler, Store, Trash2, Upload, UserRound,
  UsersRound, WalletCards, X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMobileBack } from "@/lib/mobileNavigation";
import styles from "../../mobile.module.css";

type Customer = MobileCustomer & Record<string, any>;
type Followup = FollowupReplyTarget & {
  type?: string | null; next_date?: string | null; created_at?: string | null;
  user_id?: string | null; user_avatar?: string | null; reply_to_id?: string | null;
  reply_to_user_name?: string | null; deleted_at?: string | null; attachments?: MobileAttachment[];
};
type FollowupTreeNode = Followup & { replies: FollowupTreeNode[] };
type TeamMember = MobileTeamMember;
type DepositRecord = Record<string, any>;
type AssetView = "measure" | "design";

const assetViewConfig: Record<AssetView, { title: string; description: string; category: string }> = {
  measure: { title: "量房资料", description: "户型图、现场照片与尺寸记录", category: "量房资料" },
  design: { title: "设计方案", description: "平面方案、效果图与施工图纸", category: "设计方案" },
};

const assetSubtypeConfig = {
  measure: [
    { key: "户型图", label: "户型图", description: "原始户型与手绘图", icon: ClipboardList },
    { key: "现场照片", label: "现场照片", description: "房屋现场与细节照片", icon: Camera },
    { key: "尺寸记录", label: "尺寸记录", description: "测量数据与尺寸文件", icon: Ruler },
    { key: "原始结构图", label: "原始结构图", description: "原始结构与建筑图纸", icon: FileText },
    { key: "其他资料", label: "其他资料", description: "其他量房相关文件", icon: FolderOpen },
  ],
  design: [
    { key: "平面方案", label: "平面方案", description: "平面布局与方案图", icon: ClipboardList },
    { key: "效果图", label: "效果图", description: "空间效果与表现图", icon: ImageIcon },
    { key: "施工图", label: "施工图", description: "施工深化与节点图", icon: FileText },
    { key: "水电图", label: "水电图", description: "水电点位与线路图", icon: Ruler },
    { key: "软装方案", label: "软装方案", description: "家具配饰与软装搭配", icon: ImageIcon },
    { key: "其他资料", label: "其他资料", description: "其他设计相关文件", icon: FolderOpen },
  ],
} as const;

const lifecycle = [
  { key: "NEW", label: "新客户" }, { key: "CONTACTED", label: "已联系" },
  { key: "INVITED", label: "已到店" }, { key: "MEASURED", label: "已量房" },
  { key: "DEPOSITED", label: "已交定金" }, { key: "PROPOSAL", label: "方案报价" },
  { key: "SIGNED", label: "已签约" },
];
const detailTabs = [{ key: "overview", label: "概览" }, { key: "followup", label: "跟进" }, { key: "business", label: "业务" }, { key: "assets", label: "资料" }];
const businessViews = [{ key: "payment", label: "款项" }, { key: "quotation", label: "报价" }, { key: "contract", label: "合同" }, { key: "site", label: "工地" }];
const roleLabels: Record<string, string> = { ADVISOR: "家装顾问", DESIGNER: "设计师", PM: "项目经理", WORKER: "施工员", SALES: "销售顾问", OWNER: "负责人" };

function formatDate(value?: string | null) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(date);
}

function formatFullDate(value?: string | null) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(date);
}

function formatMoney(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number) : "0";
}

function formatCompactMoney(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number) >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 1 : 2).replace(/\.0+$/, "")}万`;
  return formatMoney(number);
}

function customerRoom(customer?: Customer | null) {
  if (!customer) return "";
  const room = [customer.building_no, customer.unit_no, customer.room_no].map((item) => String(item || "").trim()).filter(Boolean).join("-");
  return [customer.address || customer.house_address, room].filter(Boolean).join(" ") || "地址待完善";
}

function customerRoomNumber(customer?: Customer | null) {
  if (!customer || customer.no_room_number) return "暂无房号";
  return [customer.building_no, customer.unit_no, customer.room_no].map((item) => String(item || "").trim()).filter(Boolean).join("-") || "-";
}

function deliveredLabel(value: unknown) {
  if (value === undefined || value === null || value === "") return "未设置";
  return value === true || value === 1 || value === "1" || value === "已交房" ? "已交房" : "未交房";
}

function CustomerInfoField({ label, value, wide = false }: { label: string; value?: string | number | null; wide?: boolean }) {
  const displayValue = value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
  return <div className={styles.customerInfoField} data-wide={wide || undefined}><span>{label}</span><strong data-empty={displayValue === "-" || undefined}>{displayValue}</strong></div>;
}

function paymentStatus(record: DepositRecord) {
  if (record.refund_status === "pending_approval") return { label: "退款审批中", tone: "warning" };
  if (["refunded", "partial_refunded"].includes(record.refund_status)) return { label: record.refund_status === "refunded" ? "已退款" : "部分退款", tone: "danger" };
  if (record.status === "pending_approval" || record.approval?.status === "pending") return { label: "收款审批中", tone: "warning" };
  if (record.status === "pending") return { label: "待收款", tone: "neutral" };
  if (record.status === "rejected" || record.approval?.status === "rejected") return { label: "审批驳回", tone: "danger" };
  return { label: "已收款", tone: "success" };
}

function contractStatus(status: unknown) {
  const key = String(status || "DRAFT").toUpperCase();
  if (key === "PENDING_APPROVAL") return { label: "合同审批中", tone: "warning" };
  if (key === "SIGNED") return { label: "已签约", tone: "success" };
  if (key === "REJECTED") return { label: "审批驳回", tone: "danger" };
  if (key === "RESIGNED") return { label: "已重签", tone: "neutral" };
  return { label: "草稿", tone: "neutral" };
}

function buildFollowupTree(items: Followup[]) {
  const sorted = [...items].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")) || right.id.localeCompare(left.id));
  const byId = new Map(sorted.map((item) => [item.id, item]));
  const visibleIds = new Set(sorted.filter((item) => !item.deleted_at).map((item) => item.id));
  let changed = true;
  while (changed) {
    changed = false;
    sorted.forEach((item) => {
      if (!visibleIds.has(item.id) || !item.reply_to_id || visibleIds.has(item.reply_to_id)) return;
      if (byId.has(item.reply_to_id)) { visibleIds.add(item.reply_to_id); changed = true; }
    });
  }
  const nodes = new Map<string, FollowupTreeNode>();
  sorted.forEach((item) => { if (visibleIds.has(item.id)) nodes.set(item.id, { ...item, replies: [] }); });
  const roots: FollowupTreeNode[] = [];
  sorted.forEach((item) => {
    const node = nodes.get(item.id); if (!node) return;
    const parent = item.reply_to_id ? nodes.get(item.reply_to_id) : null;
    if (parent) parent.replies.push(node); else roots.push(node);
  });
  nodes.forEach((node) => node.replies.sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")) || left.id.localeCompare(right.id)));
  return roots;
}

function flattenReplies(nodes: FollowupTreeNode[], depth = 1): { item: FollowupTreeNode; depth: number }[] {
  return nodes.flatMap((item) => [{ item, depth }, ...flattenReplies(item.replies, depth + 1)]);
}

function renderMentionText(value?: string | null) {
  return String(value || "").split(/(@[^@\s]+)/g).map((part, index) => part.startsWith("@") ? <mark className={styles.followupMention} key={`${part}-${index}`}>{part}</mark> : part);
}

function isImageAttachment(file: MobileAttachment) {
  return String(file.mime_type || "").startsWith("image/") || /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(String(file.file_url || file.file_name || ""));
}

function isMeasureAttachment(file: MobileAttachment) {
  return String(file.category || "").trim().startsWith("量房资料");
}

function isDesignAttachment(file: MobileAttachment) {
  const category = String(file.category || "").trim();
  return category.startsWith("设计方案") || category.startsWith("设计图纸");
}

function getAssetSubtype(file: MobileAttachment, view: AssetView) {
  const category = String(file.category || "").trim().replaceAll("\\", "/");
  const prefixes = view === "measure" ? ["量房资料"] : ["设计方案", "设计图纸"];
  const prefix = prefixes.find((item) => category === item || category.startsWith(`${item}/`));
  if (!prefix) return "未分类";
  const subtype = category.slice(prefix.length).replace(/^\/+/, "").split("/")[0]?.trim();
  if (subtype) return subtype;
  return view === "design" && prefix === "设计图纸" ? "施工图" : "未分类";
}

function formatFileSize(value?: number | null) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "文件";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function MobileCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = String(params.id || "");
  const mobileBack = useMobileBack("/m/customers");
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [attachments, setAttachments] = useState<MobileAttachment[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [workspace, setWorkspace] = useState<ContractWorkspace>({ contracts: [], formalQuotations: [], paymentSchemes: [], branchBasicInfo: {}, contractTemplates: [], depositTotal: 0, project: null });
  const [quotations, setQuotations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [branchSettings, setBranchSettings] = useState<BranchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [businessView, setBusinessView] = useState("payment");
  const [followupOpen, setFollowupOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Followup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Followup | null>(null);
  const [deletingFollowupId, setDeletingFollowupId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [draftContract, setDraftContract] = useState<Record<string, any> | null>(null);
  const [loadingDraftContractId, setLoadingDraftContractId] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [teamAssignmentOpen, setTeamAssignmentOpen] = useState(false);
  const [customerInfoOpen, setCustomerInfoOpen] = useState(false);
  const [customerEditOpen, setCustomerEditOpen] = useState(false);
  const [teamActionMessage, setTeamActionMessage] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<MobileAttachment | null>(null);
  const [assetView, setAssetView] = useState<AssetView>("measure");
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetUploadMessage, setAssetUploadMessage] = useState("");
  const [assetUploadError, setAssetUploadError] = useState(false);
  const [assetTypePickerOpen, setAssetTypePickerOpen] = useState(false);
  const [pendingAssetSubtype, setPendingAssetSubtype] = useState("");
  const assetInputRef = useRef<HTMLInputElement>(null);
  const pendingAssetSubtypeRef = useRef("");
  useBodyScrollLock(Boolean(
    followupOpen || deleteTarget || paymentOpen || contractOpen || moreOpen || teamAssignmentOpen
    || customerInfoOpen || customerEditOpen || previewAttachment || assetTypePickerOpen,
  ));

  const loadDetail = useCallback(async () => {
    if (!customerId) return;
    setLoading(true); setError("");
    try {
      const customerData = await api.get<Customer>(`/api/customers/${customerId}`);
      setCustomer(customerData); setLoading(false);
      const [followupData, attachmentData, teamData, depositData, contractData, quotationData, projectData, branchData] = await Promise.all([
        api.get<Followup[]>(`/api/followups?customer_id=${encodeURIComponent(customerId)}`).catch(() => []),
        api.get<MobileAttachment[]>(`/api/upload?customer_id=${encodeURIComponent(customerId)}`).catch(() => []),
        api.get<TeamMember[]>(`/api/customers/${customerId}/team`).catch(() => []),
        api.get<DepositRecord[]>(`/api/customers/${customerId}/deposits`).catch(() => []),
        api.get<any>(`/api/customers/${customerId}/contracts?summary=1`).catch(() => ({ contracts: [] })),
        api.get<any[]>(`/api/quotations?customer_id=${encodeURIComponent(customerId)}&summary=1`).catch(() => []),
        api.get<any[]>(`/api/projects?customer_id=${encodeURIComponent(customerId)}`).catch(() => []),
        api.get<BranchSettings>(`/api/customers/${customerId}/branch-settings`).catch(() => null),
      ]);
      setFollowups(Array.isArray(followupData) ? followupData : []); setAttachments(Array.isArray(attachmentData) ? attachmentData : []); setTeam(Array.isArray(teamData) ? teamData : []); setDeposits(Array.isArray(depositData) ? depositData : []);
      setWorkspace({ contracts: Array.isArray(contractData?.contracts) ? contractData.contracts : [], formalQuotations: Array.isArray(contractData?.formalQuotations) ? contractData.formalQuotations : [], paymentSchemes: Array.isArray(contractData?.paymentSchemes) ? contractData.paymentSchemes : [], branchBasicInfo: contractData?.branchBasicInfo || {}, contractTemplates: Array.isArray(contractData?.contractTemplates) ? contractData.contractTemplates : [], depositTotal: Number(contractData?.depositTotal || 0), project: contractData?.project || null });
      setQuotations(Array.isArray(quotationData) ? quotationData : []); setProjects(Array.isArray(projectData) ? projectData : []); setBranchSettings(branchData);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "客户详情加载失败"); }
    finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  useEffect(() => {
    if (!previewAttachment) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewAttachment(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewAttachment]);

  useEffect(() => {
    if (!customerInfoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCustomerInfoOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [customerInfoOpen]);

  const status = normalizeCustomerStatus(customer?.status);
  const canMarkCustomerLost = status !== "SIGNED" && status !== "LOST";
  const currentStageIndex = lifecycle.findIndex((stage) => stage.key === status);
  const customerTeam = useMemo(() => {
    const rows = [...team];
    if (customer?.advisor_name && !rows.some((row) => row.user_name === customer.advisor_name)) rows.unshift({ user_name: customer.advisor_name, role: "ADVISOR", user_avatar: customer.advisor_avatar });
    if (customer?.designer_name && !rows.some((row) => row.user_name === customer.designer_name)) rows.push({ user_name: customer.designer_name, role: "DESIGNER", user_avatar: customer.designer_avatar });
    return rows;
  }, [customer, team]);
  const mentionMembers = useMemo<FollowupMentionMember[]>(() => Array.from(new Map(customerTeam.filter((member) => member.user_name?.trim()).map((member) => {
    const name = String(member.user_name || "").trim();
    const id = String(member.user_id || member.id || name);
    return [id, { id, name, role: member.role, avatar: member.user_avatar }];
  })).values()), [customerTeam]);
  const paymentSummary = useMemo(() => deposits.reduce((result, item) => ({ receivable: result.receivable + Number(item.receivable_amount || item.amount || 0), received: result.received + Number(item.amount || 0), pendingApprovals: result.pendingApprovals + (paymentStatus(item).label.includes("审批") ? 1 : 0) }), { receivable: 0, received: 0, pendingApprovals: 0 }), [deposits]);
  const quotationTotal = quotations.reduce((sum, item) => sum + Number(item.final_amount ?? item.total_amount ?? item.contract_amount ?? 0), 0);
  const assetFiles = useMemo(() => {
    const measure = attachments.filter(isMeasureAttachment);
    const design = attachments.filter(isDesignAttachment);
    return { measure, design };
  }, [attachments]);
  const activeAssetFiles = assetFiles[assetView];
  const activeAssetGroups = useMemo(() => {
    const grouped = new Map<string, MobileAttachment[]>();
    activeAssetFiles.forEach((file) => {
      const subtype = getAssetSubtype(file, assetView);
      grouped.set(subtype, [...(grouped.get(subtype) || []), file]);
    });
    const configuredOrder = assetSubtypeConfig[assetView].map((item) => item.key as string);
    const extraTypes = Array.from(grouped.keys()).filter((key) => key !== "未分类" && !configuredOrder.includes(key));
    return [...configuredOrder, ...extraTypes, "未分类"]
      .filter((key) => grouped.has(key))
      .map((key) => ({ key, files: grouped.get(key) || [] }));
  }, [activeAssetFiles, assetView]);
  const followupTree = useMemo(() => buildFollowupTree(followups), [followups]);
  const latestFollowup = followups.find((item) => !item.deleted_at);

  const openNewFollowup = () => { setReplyTarget(null); setFollowupOpen(true); };
  const openReply = (item: Followup) => { setReplyTarget(item); setFollowupOpen(true); };
  const closeFollowup = () => { setFollowupOpen(false); setReplyTarget(null); };
  const requestDelete = (item: Followup) => { setDeleteError(""); setDeleteTarget(item); };
  const closeDeleteConfirm = () => { if (deletingFollowupId) return; setDeleteError(""); setDeleteTarget(null); };
  const deleteFollowup = async () => {
    if (!deleteTarget?.id || deletingFollowupId) return;
    setDeletingFollowupId(deleteTarget.id); setDeleteError("");
    try {
      await api.del(`/api/followups?id=${encodeURIComponent(deleteTarget.id)}`);
      setDeleteTarget(null); await loadDetail(); setActiveTab("followup");
    } catch (deleteFailure) { setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "删除失败，请稍后重试"); }
    finally { setDeletingFollowupId(""); }
  };

  const uploadCustomerAssets = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    if (!files.length || assetUploading) return;
    const subtype = pendingAssetSubtypeRef.current || pendingAssetSubtype;
    if (!subtype) {
      setAssetUploadError(true);
      setAssetUploadMessage("请先选择资料类型");
      return;
    }
    const parentCategory = assetViewConfig[assetView].category;
    const category = `${parentCategory}/${subtype}`;
    let uploadedCount = 0;
    setAssetUploading(true); setAssetUploadMessage(""); setAssetUploadError(false);
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file); body.append("customer_id", customerId); body.append("category", category);
        const response = await fetch("/api/upload", { method: "POST", body });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || `${file.name} 上传失败`);
        setAttachments((current) => [result as MobileAttachment, ...current]);
        uploadedCount += 1;
      }
      setAssetUploadMessage(`${uploadedCount} 个文件已上传至${parentCategory} · ${subtype}`);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "资料上传失败";
      setAssetUploadError(true);
      setAssetUploadMessage(uploadedCount ? `已上传 ${uploadedCount} 个文件，${message}` : message);
    } finally {
      setAssetUploading(false);
      if (assetInputRef.current) assetInputRef.current.value = "";
      pendingAssetSubtypeRef.current = "";
      setPendingAssetSubtype("");
    }
  };

  const chooseAssetSubtype = (subtype: string) => {
    pendingAssetSubtypeRef.current = subtype;
    setPendingAssetSubtype(subtype);
    setAssetTypePickerOpen(false);
    assetInputRef.current?.click();
  };

  const openDraftContract = async (item: Record<string, any>) => {
    const draftId = String(item.id || "");
    if (!draftId) {
      setDraftContract(item); setContractOpen(true);
      return;
    }
    setLoadingDraftContractId(draftId);
    try {
      const response = await api.get<any>(`/api/customers/${customerId}/contracts?contract_id=${encodeURIComponent(draftId)}&includeContent=1`);
      const fullDraft = Array.isArray(response?.contracts) ? response.contracts.find((contract: any) => String(contract.id || "") === draftId) : null;
      setDraftContract(fullDraft || item); setContractOpen(true);
    } catch {
      setDraftContract(item); setContractOpen(true);
    } finally {
      setLoadingDraftContractId("");
    }
  };

  const renderFollowupAttachments = (files: MobileAttachment[]) => {
    const imageFiles = files.filter(isImageAttachment);
    const documentFiles = files.filter((file) => !isImageAttachment(file));
    return <div className={styles.followupAttachmentBlock}>
      {imageFiles.length > 0 && <div className={styles.followupImageGrid}>{imageFiles.map((file) => <button type="button" className={styles.followupImageThumb} key={file.id} onClick={() => setPreviewAttachment(file)} aria-label={`预览图片 ${file.file_name || "跟进附件"}`}><Image src={file.file_url} alt={file.file_name || "跟进图片"} fill sizes="96px" unoptimized /></button>)}</div>}
      {documentFiles.length > 0 && <div className={styles.followupFileList}>{documentFiles.map((file) => <a href={file.file_url} target="_blank" rel="noreferrer" key={file.id}><FileText /><span>{file.file_name || "附件"}</span><ChevronRight /></a>)}</div>}
    </div>;
  };

  const renderFollowup = (item: FollowupTreeNode, nested = false, depth = 0) => <article className={nested ? styles.timelineReply : styles.timelineItem} key={item.id} style={nested ? { marginLeft: `${Math.min(Math.max(depth - 1, 0), 2) * 10}px` } : undefined}>
    {!nested && <span className={styles.timelineDot} />}
    <div className={styles.timelineHeader}>
      <span className={styles.followupIdentity}>{item.deleted_at ? <span className={styles.followupAvatar} data-deleted>删</span> : <span className={styles.followupAvatar}>{item.user_avatar ? <Image src={item.user_avatar} alt="" width={24} height={24} unoptimized /> : item.user_name?.trim().slice(0, 1) || "人"}</span>}<span><b>{item.deleted_at ? (nested ? "已删除的回复" : "已删除的跟进") : item.user_name || "系统用户"}</b>{!item.deleted_at && <small>{nested ? `回复 ${item.reply_to_user_name || "团队成员"}` : item.type || "跟进"}</small>}</span></span>
      <time className={styles.timelineTime}>{formatDate(item.created_at)}</time>
    </div>
    <div className={item.deleted_at ? styles.timelineDeleted : styles.timelineContent}>{item.deleted_at ? (nested ? "该回复已删除" : "该跟进记录已删除") : item.content ? renderMentionText(item.content) : "上传了附件"}</div>
    {!item.deleted_at && item.attachments && item.attachments.length > 0 && renderFollowupAttachments(item.attachments)}
    {!item.deleted_at && item.next_date && <div className={styles.nextFollowup}><Clock3 />下次跟进 {formatDate(item.next_date)}</div>}
    {!item.deleted_at && <div className={styles.followupActions}><button type="button" onClick={() => openReply(item)}><Reply />回复</button>{item.user_id === user?.id && <button type="button" data-danger onClick={() => requestDelete(item)}><Trash2 />删除</button>}</div>}
    {!nested && item.replies.length > 0 && <div className={styles.timelineReplies}>{flattenReplies(item.replies).map(({ item: reply, depth: replyDepth }) => renderFollowup(reply, true, replyDepth))}</div>}
  </article>;

  if (loading) return <div className={styles.page}><div className={styles.loadingList}><Loader2 className="h-5 w-5 animate-spin" />正在加载客户详情</div></div>;
  if (error || !customer) return <div className={styles.page}><div className={styles.errorState}><div>{error || "客户不存在"}</div><button className={`${styles.secondaryButton} mt-4 w-full`} onClick={mobileBack}>返回</button></div></div>;

  const recommendation = workspace.contracts.length
    ? { title: "查看合同进度", note: `${workspace.contracts.length}份合同，${workspace.contracts.filter((item) => item.status === "PENDING_APPROVAL").length}份审批中`, icon: ClipboardCheck, action: () => { setActiveTab("business"); setBusinessView("contract"); } }
    : workspace.formalQuotations.length
      ? { title: "提交合同", note: "已有正式报价，可直接发起合同审批", icon: ClipboardCheck, action: () => setContractOpen(true) }
      : deposits.length
        ? { title: "继续完善报价", note: "款项已登记，下一步形成正式报价", icon: ReceiptText, href: `/projects/${customerId}?tab=quotation` }
        : { title: "登记客户款项", note: "记录定金或设计费，应收与实收分开", icon: WalletCards, action: () => setPaymentOpen(true) };
  const nextFollowupAt = latestFollowup?.next_date
    ? new Date(latestFollowup.next_date.includes("T") ? latestFollowup.next_date : `${latestFollowup.next_date.replace(" ", "T")}Z`)
    : null;
  const isFollowupOverdue = Boolean(nextFollowupAt && !Number.isNaN(nextFollowupAt.getTime()) && nextFollowupAt.getTime() < Date.now());
  const overdueDays = nextFollowupAt ? Math.max(0, Math.floor((Date.now() - nextFollowupAt.getTime()) / 86400000)) : 0;
  const headerFocus = isFollowupOverdue
    ? {
        eyebrow: "客户待办",
        title: overdueDays ? `跟进已逾期 ${overdueDays} 天` : "跟进已逾期",
        note: `原计划 ${formatDate(latestFollowup?.next_date)}，建议优先联系客户`,
        icon: Clock3,
        tone: "urgent",
        action: openNewFollowup,
      }
    : { eyebrow: "建议下一步", tone: "normal", ...recommendation };
  const HeaderFocusIcon = headerFocus.icon;
  const locationDetails = Array.from(new Set([customer.address_location_name, customer.address_location_address].map((item) => String(item || "").trim()).filter(Boolean))).join(" · ");
  const inviterName = customer.inviter_name || customer.created_by_name || "-";

  return <div className={styles.page} data-active-tab={activeTab} data-business-view={businessView}>
    <header className={styles.detailHeader}>
      <div className={styles.detailNav}><button className={styles.headerIconButton} onClick={mobileBack} aria-label="返回"><ArrowLeft /></button><div className={styles.detailNavActions}>{customer.phone && customer.phone !== "仅微信联系" && <a href={`tel:${customer.phone}`} className={styles.headerIconButton} aria-label={`拨打 ${customer.phone}`}><Phone /></a>}{canMarkCustomerLost && <button className={styles.headerIconButton} onClick={() => setMoreOpen(true)} aria-label="更多"><MoreHorizontal /></button>}</div></div>
      <div className={styles.profileHero}><div className={styles.heroAvatarSpacer} aria-hidden="true" /><div className={styles.heroIdentity}><div className={styles.heroNameLine}><h1 className={styles.heroName}>{customer.name || "未命名客户"}</h1><span className={styles.heroStage}>{customerStatusLabels[status] || status}</span></div><div className={styles.heroAddress}><MapPin /><span>{customerRoom(customer)}</span></div></div></div>
      <div className={styles.headerFocus} data-tone={headerFocus.tone}><span className={styles.headerFocusIcon}><HeaderFocusIcon /></span><span className={styles.headerFocusCopy}><small>{headerFocus.eyebrow}</small><b>{headerFocus.title}</b><em>{headerFocus.note}</em></span>{"href" in headerFocus ? <Link href={headerFocus.href || "#"} aria-label={headerFocus.title}><ChevronRight /></Link> : <button type="button" onClick={headerFocus.action} aria-label={headerFocus.title}><ChevronRight /></button>}</div>
    </header>

    <nav className={styles.detailTabs}>{detailTabs.map((tab) => <button key={tab.key} className={styles.detailTab} data-active={activeTab === tab.key || undefined} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}</nav>
    <div className={styles.detailContent}>
      {activeTab === "overview" && <>
        <section className={styles.businessSnapshot}><button onClick={() => { setActiveTab("business"); setBusinessView("payment"); }}><span>实收款项</span><strong>¥{formatCompactMoney(paymentSummary.received)}</strong><small>应收 ¥{formatCompactMoney(paymentSummary.receivable)}</small></button><button onClick={() => { setActiveTab("business"); setBusinessView("quotation"); }}><span>报价金额</span><strong>¥{formatCompactMoney(quotationTotal)}</strong><small>{quotations.length}份报价</small></button><button onClick={() => { setActiveTab("business"); setBusinessView("contract"); }}><span>合同进度</span><strong>{workspace.contracts.length}</strong><small>{workspace.contracts.length ? contractStatus(workspace.contracts[0]?.status).label : "暂未提交"}</small></button></section>
        <section className={styles.detailPanel}><div className={styles.panelHeading}><div className={styles.panelTitle}><CalendarClock />客户生命周期</div><span className={styles.panelAction}>{customerStatusLabels[status] || status}</span></div><div className={styles.lifecycle}>{lifecycle.map((stage, index) => <div key={stage.key} className={styles.lifecycleStep} data-complete={index < currentStageIndex || undefined} data-current={index === currentStageIndex || undefined}><span className={styles.stepDot}>{index < currentStageIndex ? <Check /> : index + 1}</span><span>{stage.label}</span></div>)}</div></section>
        {latestFollowup && <button className={styles.latestFollowup} onClick={() => setActiveTab("followup")}><span className={styles.businessIcon}><MessageCircle /></span><span><b>最近跟进 · {latestFollowup.type || "沟通"}</b><small>{latestFollowup.content || "上传了附件"}</small></span><time>{formatDate(latestFollowup.created_at)}</time><ChevronRight /></button>}
        <section className={styles.detailPanel}><div className={styles.panelHeading}><div className={styles.panelTitle}><UserRound />客户信息</div><button type="button" className={styles.panelAction} onClick={() => setCustomerInfoOpen(true)}>查看全部</button></div><div className={styles.infoGrid}>{[["联系电话", customer.phone], ["微信号", customer.weixin], ["装修面积", customer.area_size ? `${customer.area_size}㎡` : "-"], ["装修预算", customer.budget ? `¥${formatMoney(customer.budget)}` : "-"], ["客户来源", customer.source], ["客户意向", customer.intention], ["服务门店", customer.service_store], ["装修类型", customer.decoration_type]].map(([label, value]) => <div className={styles.infoCell} key={String(label)}><div className={styles.infoLabel}>{label}</div><div className={styles.infoValue}>{value || "-"}</div></div>)}</div><button type="button" className={styles.customerInfoMoreButton} onClick={() => setCustomerInfoOpen(true)}><span>完整资料包含房屋信息、户型与需求备注</span><ChevronRight /></button></section>
        <section className={styles.detailPanel}><div className={styles.panelHeading}><div className={styles.panelTitle}><UsersRound />服务团队</div><button type="button" className={styles.panelAction} onClick={() => { setTeamActionMessage(""); setTeamAssignmentOpen(true); }}>人员管理</button></div>{teamActionMessage && <div className={styles.teamActionMessage}><Check />{teamActionMessage}</div>}{customerTeam.length ? customerTeam.slice(0, 5).map((member, index) => <div className={styles.teamRow} key={member.id || member.user_id || `${member.user_name}-${index}`}><span className={styles.teamAvatar}>{member.user_avatar ? <Image src={member.user_avatar} alt="" width={36} height={36} unoptimized /> : member.user_name?.slice(0, 1) || "人"}</span><span className={styles.teamInfo}><span className={`${styles.teamName} block`}>{member.user_name || "未命名员工"}</span><span className={`${styles.teamRole} block`}>{roleLabels[String(member.role || "").toUpperCase()] || member.role || "服务人员"}</span></span></div>) : <div className={styles.emptyState}>暂无服务团队成员</div>}</section>
      </>}

      {activeTab === "followup" && <section className={styles.detailPanel}><div className={styles.panelHeading}><div className={styles.panelTitle}><MessageCircle />跟进记录</div><span className={styles.panelAction}>{followups.filter((item) => !item.deleted_at).length} 条</span></div>{followupTree.length ? <div className={styles.timeline}>{followupTree.map((item) => renderFollowup(item))}</div> : <div className={styles.emptyState}><div className={styles.emptyIcon}><MessageCircle /></div><div className={styles.emptyTitle}>还没有跟进记录</div><div className={styles.emptyText}>记录第一次联系，客户生命周期会自动更新。</div></div>}</section>}

      {activeTab === "business" && <>
        <div className={styles.businessSwitcher}>{businessViews.map((view) => <button key={view.key} data-active={businessView === view.key || undefined} onClick={() => setBusinessView(view.key)}>{view.label}</button>)}</div>
        {businessView === "payment" && <><section className={styles.financeSummary}><div><span>累计应收</span><strong>¥{formatMoney(paymentSummary.receivable)}</strong></div><div><span>累计实收</span><strong>¥{formatMoney(paymentSummary.received)}</strong></div><div><span>剩余待收</span><strong>¥{formatMoney(Math.max(0, paymentSummary.receivable - paymentSummary.received))}</strong></div></section><div className={styles.sectionToolbar}><div><b>款项流水</b><span>{paymentSummary.pendingApprovals ? `${paymentSummary.pendingApprovals}笔审批处理中` : "实时同步财务状态"}</span></div></div>{deposits.length ? <div className={styles.ledgerList}>{deposits.map((record) => { const meta = paymentStatus(record); const base = Number(record.receivable_amount || record.amount || 0); return <Link href={`/m/customers/${customerId}/payments/${record.id}`} key={record.id} className={styles.ledgerRow}><span className={styles.ledgerIcon} data-type={record.record_type || "deposit"}>{record.record_type === "design_fee" ? <CircleDollarSign /> : <WalletCards />}</span><div className={styles.ledgerMain}><div><b>{record.deposit_type || (record.record_type === "design_fee" ? "设计费" : "定金")}</b><span className={styles.statusPill} data-tone={meta.tone}>{meta.label}</span></div><small>{record.payment_channel || "待收款"} · {formatDate(record.received_at)}</small><div className={styles.amountProgress}><i style={{ width: `${Math.min(100, base ? Number(record.amount || 0) / base * 100 : 0)}%` }} /></div></div><div className={styles.ledgerAmount}><strong>¥{formatMoney(record.amount)}</strong><small>应收 ¥{formatMoney(base)}</small></div><ChevronRight className={styles.ledgerChevron} /></Link>; })}</div> : <div className={styles.emptyState}><div className={styles.emptyIcon}><WalletCards /></div><div className={styles.emptyTitle}>暂无款项记录</div><div className={styles.emptyText}>登记应收金额，实收可以留空后续补收。</div></div>}</>}
        {businessView === "quotation" && <><div className={styles.sectionToolbar}><div><b>预算报价</b><span>正式报价可直接用于提交合同</span></div></div>{quotations.length ? <div className={styles.documentList}>{quotations.map((item) => <Link href={`/m/quotations/${item.id}`} key={item.id}><span className={styles.documentIcon}><ReceiptText /></span><span><b>{item.title || "装修报价"}</b><small>{String(item.status).toUpperCase() === "APPROVED" ? "正式报价" : "报价草稿"} · {formatDate(item.updated_at || item.created_at)}</small></span><strong>¥{formatMoney(item.final_amount ?? item.total_amount)}</strong><ChevronRight /></Link>)}</div> : <div className={styles.emptyState}><div className={styles.emptyIcon}><ReceiptText /></div><div className={styles.emptyTitle}>还没有预算报价</div><div className={styles.emptyText}>从客户需求建立第一份报价。</div></div>}</>}
        {businessView === "contract" && <><div className={styles.sectionToolbar}><div><b>合同资料</b><span>合同状态和审批进度实时同步</span></div></div>{workspace.contracts.length ? <div className={styles.documentList}>{workspace.contracts.map((item) => { const meta = contractStatus(item.status); const statusKey = String(item.status || "DRAFT").toUpperCase(); const isLoadingDraft = loadingDraftContractId === String(item.id || ""); const content = <><span className={styles.documentIcon} data-tone="red">{isLoadingDraft ? <Loader2 className="animate-spin" /> : <ClipboardList />}</span><span><b>{item.title || "装修合同"}</b><small>{item.contract_no} · {formatDate(item.updated_at || item.created_at)}</small></span><div className={styles.documentStatus}><strong>¥{formatMoney(item.total_amount)}</strong><em data-tone={meta.tone}>{isLoadingDraft ? "加载中" : statusKey === "DRAFT" ? "继续提交" : meta.label}</em></div><ChevronRight /></>; return statusKey === "DRAFT" ? <button type="button" key={item.id} onClick={() => openDraftContract(item)} disabled={Boolean(loadingDraftContractId)} aria-label={`继续提交合同 ${item.title || item.contract_no || "草稿"}`}>{content}</button> : <Link href={`/m/customers/${customerId}/contracts/${item.id}`} key={item.id} aria-label={`${statusKey === "PENDING_APPROVAL" ? "查看审批" : "预览合同"} ${item.title || item.contract_no || "合同"}`}>{content}</Link>; })}</div> : <div className={styles.emptyState}><div className={styles.emptyIcon}><ClipboardList /></div><div className={styles.emptyTitle}>暂无合同</div><div className={styles.emptyText}>{workspace.formalQuotations.length ? "已有正式报价，可以在手机端直接提交合同。" : "提交合同前，需要先准备一份正式报价。"}</div></div>}</>}
        {businessView === "site" && <><div className={styles.sectionToolbar}><div><b>关联工地</b><span>签约后进入施工履约</span></div></div>{projects.length ? <div className={styles.documentList}>{projects.map((project) => <Link href={`/m/site/${project.id}`} key={project.id}><span className={styles.documentIcon} data-tone="green"><Store /></span><span><b>{project.name || customerRoom(customer)}</b><small>{project.current_phase || project.site_stage || "待开工"}</small></span><ChevronRight /></Link>)}</div> : <div className={styles.emptyState}><div className={styles.emptyIcon}><Store /></div><div className={styles.emptyTitle}>尚未生成工地</div><div className={styles.emptyText}>合同审批通过后，工地将在这里关联。</div></div>}</>}
      </>}

      {activeTab === "assets" && <section className={`${styles.detailPanel} ${styles.assetWorkspace}`}>
        <input ref={assetInputRef} hidden type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.zip,.rar,.7z,.mp4,.mov,.txt" onChange={uploadCustomerAssets} />
        <div className={styles.panelHeading}><div className={styles.panelTitle}><FolderOpen />客户资料</div><span className={styles.assetTotal}>{assetFiles.measure.length + assetFiles.design.length} 个文件</span></div>
        <div className={styles.assetViewSwitch} role="tablist" aria-label="客户资料分类">
          <button type="button" role="tab" aria-selected={assetView === "measure"} data-active={assetView === "measure" || undefined} onClick={() => { setAssetView("measure"); setAssetUploadMessage(""); setAssetUploadError(false); }}><span><Ruler /></span><div><b>量房资料</b><small>户型与现场记录</small></div><em>{assetFiles.measure.length}</em></button>
          <button type="button" role="tab" aria-selected={assetView === "design"} data-active={assetView === "design" || undefined} onClick={() => { setAssetView("design"); setAssetUploadMessage(""); setAssetUploadError(false); }}><span><ImageIcon /></span><div><b>设计方案</b><small>方案与施工图纸</small></div><em>{assetFiles.design.length}</em></button>
        </div>
        <div className={styles.assetSectionHeading}><div><b>{assetViewConfig[assetView].title}</b><small>{assetViewConfig[assetView].description}</small></div></div>
        {assetUploadMessage && <div className={styles.assetUploadMessage} data-error={assetUploadError || undefined}>{assetUploadMessage}</div>}
        {activeAssetFiles.length ? <div className={styles.assetContent}>
          {activeAssetGroups.map((group) => {
            const subtypeMeta = assetSubtypeConfig[assetView].find((item) => item.key === group.key);
            const GroupIcon = subtypeMeta?.icon || FolderOpen;
            const imageFiles = group.files.filter(isImageAttachment);
            const documentFiles = group.files.filter((file) => !isImageAttachment(file));
            return <section className={styles.assetGroup} key={group.key}>
              <div className={styles.assetGroupHeading}><span><GroupIcon /></span><div><b>{group.key}</b><small>{subtypeMeta?.description || "历史资料与其他文件"}</small></div><em>{group.files.length} 个</em></div>
              {imageFiles.length > 0 && <div className={styles.assetImageGrid}>{imageFiles.map((file) => <button type="button" key={file.id} className={styles.assetImageItem} onClick={() => setPreviewAttachment(file)} aria-label={`预览图片 ${file.file_name || group.key}`}><span><Image src={file.file_url} alt={file.file_name || group.key} fill sizes="110px" unoptimized /></span><b>{file.file_name || "未命名图片"}</b></button>)}</div>}
              {documentFiles.length > 0 && <div className={styles.assetDocumentList}>{documentFiles.map((file) => <a href={file.file_url} target="_blank" rel="noreferrer" key={file.id}><span><FileText /></span><div><b>{file.file_name || "未命名文件"}</b><small>{formatFileSize(file.file_size)}</small></div><ChevronRight /></a>)}</div>}
            </section>;
          })}
        </div> : <div className={styles.assetEmpty}><span>{assetView === "measure" ? <Camera /> : <ImageIcon />}</span><b>暂无{assetViewConfig[assetView].title}</b><p>{assetView === "measure" ? "上传户型图、现场照片或尺寸记录。" : "上传平面方案、效果图或施工图纸。"}</p></div>}
      </section>}
    </div>

    {activeTab !== "business" && activeTab !== "assets" && <div className={styles.detailBottomBar}><button className={styles.primaryButton} onClick={openNewFollowup}><MessageCircle />{activeTab === "followup" ? "新增跟进" : "写跟进"}</button></div>}
    {activeTab === "assets" && <div className={styles.detailBottomBar}><button className={styles.primaryButton} onClick={() => setAssetTypePickerOpen(true)} disabled={assetUploading}>{assetUploading ? <Loader2 className="animate-spin" /> : <Upload />}{assetUploading ? "正在上传" : `上传${assetViewConfig[assetView].title}`}</button></div>}
    {activeTab === "business" && businessView === "payment" && <div className={styles.detailBottomBar}><button className={styles.primaryButton} onClick={() => setPaymentOpen(true)}><CircleDollarSign />登记款项</button></div>}
    {activeTab === "business" && businessView === "quotation" && <div className={styles.detailBottomBar}><Link className={styles.primaryButton} href={`/projects/${customerId}?tab=quotation`}><Plus />新建报价</Link></div>}
    {activeTab === "business" && businessView === "contract" && <div className={styles.detailBottomBar}><button className={styles.primaryButton} onClick={() => { setDraftContract(null); setContractOpen(true); }}><ClipboardList />提交合同</button></div>}
    {assetTypePickerOpen && <div className={styles.sheetBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAssetTypePickerOpen(false)}><section className={`${styles.sheet} ${styles.assetTypeSheet}`} role="dialog" aria-modal="true" aria-labelledby="mobile-asset-type-title">
      <div className={styles.sheetHandle} />
      <div className={styles.sheetHeader}><div><div className={styles.sheetTitle} id="mobile-asset-type-title">选择{assetViewConfig[assetView].title}类型</div><div className={styles.sheetSubtitle}>选择后可一次上传多个文件</div></div><button type="button" className={styles.iconButton} onClick={() => setAssetTypePickerOpen(false)} aria-label="关闭"><X /></button></div>
      <div className={styles.sheetBody}><div className={styles.assetTypeList}>{assetSubtypeConfig[assetView].map((subtype) => { const SubtypeIcon = subtype.icon; const count = activeAssetFiles.filter((file) => getAssetSubtype(file, assetView) === subtype.key).length; return <button type="button" key={subtype.key} onClick={() => chooseAssetSubtype(subtype.key)}><span><SubtypeIcon /></span><div><b>{subtype.label}</b><small>{subtype.description}</small></div>{count > 0 && <em>{count}</em>}<ChevronRight /></button>; })}</div></div>
    </section></div>}
    {followupOpen && <FollowupSheet customerId={customerId} replyTo={replyTarget} mentionMembers={mentionMembers} onClose={closeFollowup} onSaved={() => { closeFollowup(); loadDetail(); setActiveTab("followup"); }} />}
    {deleteTarget && <div className={styles.confirmBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDeleteConfirm()}><div className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="mobile-followup-delete-title"><div className={styles.confirmHeader}><span className={styles.confirmIcon}><AlertTriangle /></span><div><h2 id="mobile-followup-delete-title">删除跟进记录</h2><p>删除后内容将不再显示，已有回复会保留。</p></div><button type="button" onClick={closeDeleteConfirm} disabled={Boolean(deletingFollowupId)} aria-label="关闭"><X /></button></div><div className={styles.confirmPreview}><span>{deleteTarget.type || "跟进"} · {deleteTarget.user_name || "系统用户"}</span><p>{deleteTarget.content || "上传了附件"}</p></div>{deleteError && <div className={styles.confirmError}>{deleteError}</div>}<div className={styles.confirmActions}><button type="button" className={styles.secondaryButton} onClick={closeDeleteConfirm} disabled={Boolean(deletingFollowupId)}>取消</button><button type="button" className={styles.dangerButton} onClick={deleteFollowup} disabled={Boolean(deletingFollowupId)}>{deletingFollowupId ? <Loader2 className="animate-spin" /> : <Trash2 />}{deletingFollowupId ? "删除中" : "确认删除"}</button></div></div></div>}
    {paymentOpen && <PaymentSheet customerId={customerId} branchSettings={branchSettings} onClose={() => setPaymentOpen(false)} onSaved={() => { setPaymentOpen(false); loadDetail(); setActiveTab("business"); setBusinessView("payment"); }} />}
    {contractOpen && <ContractSheet customer={customer} workspace={workspace} initialContract={draftContract} onClose={() => { setContractOpen(false); setDraftContract(null); setLoadingDraftContractId(""); }} onSaved={() => { setContractOpen(false); setDraftContract(null); setLoadingDraftContractId(""); loadDetail(); setActiveTab("business"); setBusinessView("contract"); }} />}
    {teamAssignmentOpen && <TeamAssignmentSheet customerId={customerId} members={customerTeam} designerAssignmentMode={branchSettings?.businessRules?.designerAssignmentMode || "direct"} onClose={() => setTeamAssignmentOpen(false)} onSaved={(message) => { setTeamAssignmentOpen(false); setTeamActionMessage(message); loadDetail(); }} />}
    {customerInfoOpen && <div className={styles.customerInfoScreenBackdrop} role="presentation"><section className={styles.customerInfoScreen} role="dialog" aria-modal="true" aria-labelledby="mobile-customer-info-title">
      <header className={styles.customerInfoScreenHeader}><button type="button" onClick={() => setCustomerInfoOpen(false)} aria-label="返回客户详情"><ArrowLeft /></button><div><h2 id="mobile-customer-info-title">完整客户信息</h2><p>{customer.name || "未命名客户"} · {customerRoom(customer)}</p></div>{status === "SIGNED" ? <span className={styles.customerInfoLocked}>已签约</span> : <button type="button" className={styles.customerInfoEditAction} onClick={() => setCustomerEditOpen(true)}>编辑</button>}</header>
      <div className={styles.customerInfoScreenBody}>
        <section className={styles.customerInfoSection}><div className={styles.customerInfoSectionTitle}><span><UserRound /></span><div><b>基础资料</b><small>客户身份与归属信息</small></div></div><div className={styles.customerInfoFieldGrid}>
          <CustomerInfoField label="客户姓名" value={customer.name} /><CustomerInfoField label="联系电话" value={customer.phone} />
          <CustomerInfoField label="微信号" value={customer.weixin} /><CustomerInfoField label="客户来源" value={customer.source} />
          <CustomerInfoField label="客户意向" value={customer.intention} /><CustomerInfoField label="服务门店" value={customer.service_store} />
          <CustomerInfoField label="邀约人" value={inviterName} /><CustomerInfoField label="创建时间" value={formatFullDate(customer.created_at)} />
        </div></section>
        <section className={styles.customerInfoSection}><div className={styles.customerInfoSectionTitle}><span data-tone="address"><MapPin /></span><div><b>房屋资料</b><small>地址、房号与房屋属性</small></div></div><div className={styles.customerInfoFieldGrid}>
          <CustomerInfoField label="小区 / 楼盘" value={customer.address || customer.area} wide /><CustomerInfoField label="房屋地址" value={customer.house_address} wide />
          {locationDetails && <CustomerInfoField label="地图定位" value={locationDetails} wide />}
          <CustomerInfoField label="房号" value={customerRoomNumber(customer)} /><CustomerInfoField label="楼栋" value={customer.no_room_number ? "暂无房号" : customer.building_no} />
          <CustomerInfoField label="单元" value={customer.no_room_number ? "暂无房号" : customer.unit_no} /><CustomerInfoField label="房室" value={customer.no_room_number ? "暂无房号" : customer.room_no} />
          <CustomerInfoField label="装修面积" value={customer.area_size ? `${customer.area_size}㎡` : "-"} /><CustomerInfoField label="户型" value={customer.house_type} />
          <CustomerInfoField label="是否交房" value={deliveredLabel(customer.is_delivered)} />
        </div></section>
        <section className={styles.customerInfoSection}><div className={styles.customerInfoSectionTitle}><span data-tone="decoration"><ClipboardList /></span><div><b>装修资料</b><small>装修方式与预算信息</small></div></div><div className={styles.customerInfoFieldGrid}>
          <CustomerInfoField label="装修类型" value={customer.decoration_type} /><CustomerInfoField label="装修预算" value={customer.budget ? `¥${formatMoney(customer.budget)}` : "-"} />
        </div></section>
        <section className={styles.customerInfoSection}><div className={styles.customerInfoSectionTitle}><span data-tone="team"><UsersRound /></span><div><b>服务归属</b><small>当前主要服务人员与部门</small></div></div><div className={styles.customerInfoFieldGrid}>
          <CustomerInfoField label="家装顾问" value={customer.advisor_name} /><CustomerInfoField label="业务部门" value={customer.business_department_name} />
          <CustomerInfoField label="设计师" value={customer.designer_name} /><CustomerInfoField label="设计部门" value={customer.design_department_name} />
        </div></section>
        <section className={styles.customerInfoSection}><div className={styles.customerInfoSectionTitle}><span data-tone="notes"><FileText /></span><div><b>需求与备注</b><small>新增客户时填写的补充信息</small></div></div><div className={styles.customerInfoNotes}>
          <div><span>装修需求</span><p>{customer.requirements || "-"}</p></div><div><span>备注</span><p>{customer.remarks || "-"}</p></div>
        </div></section>
      </div>
    </section></div>}
    {customerEditOpen && <MobileCustomerEditScreen customer={customer} onClose={() => setCustomerEditOpen(false)} onSaved={() => { setCustomerEditOpen(false); loadDetail(); }} />}
    {moreOpen && <MoreSheet customerId={customerId} onClose={() => setMoreOpen(false)} onSaved={() => { setMoreOpen(false); loadDetail(); }} />}
    {previewAttachment && <div className={styles.followupPreviewBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreviewAttachment(null)}><div className={styles.followupPreviewDialog} role="dialog" aria-modal="true" aria-label={`预览图片 ${previewAttachment.file_name || "跟进附件"}`}><header><span>{previewAttachment.file_name || "跟进图片"}</span><button type="button" onClick={() => setPreviewAttachment(null)} aria-label="关闭图片预览"><X /></button></header><div className={styles.followupPreviewStage}><Image src={previewAttachment.file_url} alt={previewAttachment.file_name || "跟进图片"} fill sizes="100vw" unoptimized priority /></div></div></div>}
  </div>;
}
