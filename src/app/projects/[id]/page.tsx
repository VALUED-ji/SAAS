"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Phone, MessageCircle, MapPin, Ruler,
  Layers, DollarSign, CheckCircle, FileText,
  User, Store, Loader2, ClipboardList, Palette,
  Plus, Send, Clock, ReceiptText, Eye, QrCode, Upload, Trash2, WalletCards, ImageIcon, Pencil, Download, X, CircleCheck, CircleX, CircleDashed, Reply, UserMinus,
  Copy, CheckCircle2, Link as LinkIcon, Printer,
  AlertTriangle, ChevronDown, Paperclip, FolderOpen, Smartphone,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/data";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/lib/auth";
import { useCustomer, useProjects, useFollowups, useQuotations } from "@/lib/queries";
import { api } from "@/lib/api";
import { customerStatusFlow, customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import { customerActionOptions } from "@/lib/customerAction";
const ContractSummaryModal = dynamic(() => import("@/components/ContractSummaryModal"), {
  ssr: false,
  loading: () => null,
});
const AddCustomerModal = dynamic(() => import("@/components/ui/AddCustomerModal"), {
  ssr: false,
  loading: () => null,
});
import { formatDateTime, parseAppDate, toDatetimeLocalValue } from "@/lib/utils";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import SystemDateInput from "@/components/ui/SystemDateInput";
import { createQuotationPrintPreviewUrl, createQuotationShareUrl } from "@/lib/quotationShareClient";
import NativeImage from "@/components/ui/NativeImage";
import ApprovalSignatureModal from "@/components/approval/ApprovalSignatureModal";
import ApprovalSignaturePreview from "@/components/approval/ApprovalSignaturePreview";

import {
  DesignerAssignmentFlowModal,
  TeamMemberPickerPanel,
} from "./designer-assignment-modals";
import {
  CustomerAttachment,
  formatFileSize,
  isImageAttachment,
  isLinkAttachment,
  isPdfAttachment,
} from "./project-detail-shared";
import {
  AttachmentLinkPreviewFrame,
  AttachmentPreviewModal,
  InfoRow,
  RequirementGroup,
} from "./project-detail-bits";
import {
  AddressPinIcon,
  AdvisorIcon,
  AreaMeasureIcon,
  BedroomIcon,
  BudgetCoinIcon,
  BuildingNoIcon,
  CommunityIcon,
  CreateTimeIcon,
  CustomerProfileIcon,
  DecorationIcon,
  DeliveryCheckIcon,
  DepartmentIcon,
  DesignerPenIcon,
  IntentionStarIcon,
  LayoutIcon,
  MobilePhoneIcon,
  RoomCardIcon,
  SourceCompassIcon,
  StoreFrontIcon,
  UnitDoorIcon,
  WechatBubbleIcon,
} from "./customer-info-icons";

// ========== Constants ==========
const defaultTeamRoles = [
  { role: "ADVISOR", label: "家装顾问" },
  { role: "PM", label: "项目经理" },
  { role: "DESIGNER", label: "设计师" },
  { role: "WORKER", label: "施工员" },
];

const roleLabels: Record<string, string> = {
  OWNER: "负责人", PM: "项目经理", DESIGNER: "设计师",
  SALES: "销售顾问", ADVISOR: "家装顾问", WORKER: "施工员", ADMIN: "施工人员", FINANCE: "财务",
};
const teamPickerRoleOptions = [
  { value: "ALL", label: "全部人员" },
  { value: "SALES", label: "销售顾问" },
  { value: "DESIGNER", label: "设计师" },
  { value: "PM", label: "项目经理" },
  { value: "ADMIN", label: "施工人员" },
  { value: "FINANCE", label: "财务" },
  { value: "OWNER", label: "负责人" },
];
const serviceRoleDefaultStaffRole: Record<string, string> = {
  ADVISOR: "SALES",
  PM: "PM",
  DESIGNER: "DESIGNER",
  WORKER: "ADMIN",
};
type TeamPickerMember = {
  id: string;
  name: string;
  avatar?: string | null;
  role?: string | null;
  employee_no?: string | null;
  org_unit_name?: string | null;
  project_count?: number | null;
};
function getDefaultTeamPickerRole(serviceRole?: string | null) {
  return serviceRoleDefaultStaffRole[String(serviceRole || "").toUpperCase()] || "ALL";
}
const lifecycleStages = customerStatusFlow
  .filter((stage) => stage.value !== "LOST")
  .map((stage) => ({ key: stage.value, label: stage.label }));
const projectStages = [
  { key: "CONSTRUCTION", label: "施工中" },
  { key: "COMPLETED", label: "已完工" },
];
const lifecycleStageDescriptions: Record<string, string> = {
  NEW: "新线索阶段，需尽快联系客户",
  CONTACTED: "已联系客户，继续确认需求和预算",
  INVITED: "客户已到店，继续推动量房和方案沟通",
  MEASURED: "已量房，准备设计方案和预算",
  DEPOSITED: "客户已交定金，推进方案深化和正式报价",
  PROPOSAL: "方案报价中，跟进客户反馈和调整意见",
  SIGNED: "已签约，准备进场施工",
  CONSTRUCTION: "正在施工中",
  COMPLETED: "项目已完工",
};
const lifecyclePrimaryActions: Record<string, { label: string; tab: string }> = {
  NEW: { label: "写跟进", tab: "followup" },
  CONTACTED: { label: "查看跟进", tab: "followup" },
  INVITED: { label: "上传量房", tab: "measure" },
  MEASURED: { label: "登记款项", tab: "deposit" },
  DEPOSITED: { label: "创建报价", tab: "quotation" },
  PROPOSAL: { label: "查看报价", tab: "quotation" },
  SIGNED: { label: "合同资料", tab: "contract" },
  CONSTRUCTION: { label: "查看记录", tab: "operations" },
  COMPLETED: { label: "查看记录", tab: "operations" },
};
type FollowupIconType = "phone" | "wechat" | "store" | "home" | "note";
const followupTypes: Array<{ value: string; label: string; icon: FollowupIconType }> = [
  { value: "电话", label: "电话", icon: "phone" },
  { value: "微信", label: "微信", icon: "wechat" },
  { value: "到店", label: "到店", icon: "store" },
  { value: "上门", label: "上门", icon: "home" },
  { value: "其他", label: "其他", icon: "note" },
];
type FollowupTone = {
  icon: string;
  badge: string;
  selected: string;
};
const followupTypeTones: Record<string, FollowupTone> = {
  电话: {
    icon: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]",
    badge: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    selected: "border-[#bfdbfe] bg-white text-[#2563eb] shadow-[0_0_0_1px_#bfdbfe]",
  },
  微信: {
    icon: "border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a]",
    badge: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
    selected: "border-[#bbf7d0] bg-white text-[#16a34a] shadow-[0_0_0_1px_#bbf7d0]",
  },
  到店: {
    icon: "border-[#fed7aa] bg-[#fff7ed] text-[#ea580c]",
    badge: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
    selected: "border-[#fed7aa] bg-white text-[#ea580c] shadow-[0_0_0_1px_#fed7aa]",
  },
  上门: {
    icon: "border-[#ddd6fe] bg-[#f5f3ff] text-[#7c3aed]",
    badge: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
    selected: "border-[#ddd6fe] bg-white text-[#7c3aed] shadow-[0_0_0_1px_#ddd6fe]",
  },
  其他: {
    icon: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
    badge: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
    selected: "border-[#cbd5e1] bg-white text-[#475569] shadow-[0_0_0_1px_#cbd5e1]",
  },
};
const defaultFollowupTone: FollowupTone = followupTypeTones["其他"];
function getFollowupTypeTone(type?: string | null) {
  return followupTypeTones[String(type || "")] || defaultFollowupTone;
}

function IconfontFollowupIcon({ type, className = "" }: { type: FollowupIconType; className?: string }) {
  if (type === "phone") {
    return (
      <svg viewBox="0 0 1024 1024" aria-hidden="true" className={className} fill="currentColor">
        <path d="M326.4 181.3c23.7-13.7 54-6 68.4 17.3l73.7 119.5c13.2 21.4 8.8 49.2-10.4 65.5l-49.5 42c43.6 86.5 109.3 152.2 195.9 195.8l42-49.4c16.3-19.2 44-23.7 65.5-10.5l119.4 73.8c23.3 14.4 31 44.7 17.4 68.4l-42.3 73.2c-17.8 30.8-52.2 47.9-87.5 43.6C464.6 789.4 234.6 559.4 203.5 305c-4.3-35.3 12.8-69.7 43.6-87.5l79.3-36.2Zm25.9 51.9-76.4 44.1c-11.3 6.5-17.5 19-15.9 31.9 27.9 228.5 234.3 434.9 462.8 462.8 12.9 1.6 25.4-4.6 31.9-15.9l44.1-76.4-112.9-69.8-56.3 66.2c-8.3 9.8-22.1 13-33.9 7.8-113.9-50.6-203.1-139.8-253.6-253.6-5.2-11.8-2-25.6 7.8-33.9l66.2-56.3-63.8-106.9Z" />
      </svg>
    );
  }
  if (type === "wechat") {
    return (
      <svg viewBox="0 0 1024 1024" aria-hidden="true" className={className} fill="currentColor">
        <path d="M414.7 244.7c-171.3 0-310.2 111.6-310.2 249.3 0 78.5 45.1 148.6 115.7 194.3l-24.5 76.5c-4.2 13.1 9.8 24.4 21.6 17.3l91.5-54.5c33.1 10.1 68.8 15.7 105.9 15.7 171.3 0 310.2-111.6 310.2-249.3S586 244.7 414.7 244.7Zm-107.2 201a42.3 42.3 0 1 1 0-84.6 42.3 42.3 0 0 1 0 84.6Zm214.4 0a42.3 42.3 0 1 1 0-84.6 42.3 42.3 0 0 1 0 84.6Z" />
        <path d="M714.3 480.3c111.2 33.4 188.6 114.4 188.6 208.5 0 62-33.6 117.6-86.4 154l18.8 58.8c3.7 11.5-8.6 21.4-18.9 15.3l-70-41.7a300.8 300.8 0 0 1-88.4 13.1c-116.6 0-216.3-57.8-256.9-139.2h15.6c197.1 0 357.5-129.3 357.5-288.2 0-6.4-.3-12.8-.8-19.1Zm-10.7 199.4a34.6 34.6 0 1 0 0-69.2 34.6 34.6 0 0 0 0 69.2Zm-139.1 0a34.6 34.6 0 1 0 0-69.2 34.6 34.6 0 0 0 0 69.2Z" opacity="0.72" />
      </svg>
    );
  }
  if (type === "store") {
    return (
      <svg viewBox="0 0 1024 1024" aria-hidden="true" className={className} fill="currentColor">
        <path d="M204.8 213.3h614.4c25.1 0 46.8 17.5 52.1 42.1l42.7 196.6c12.2 56.2-30.6 109.3-88.1 109.3-29.9 0-56.5-14.5-72.9-36.8-16.4 22.3-43 36.8-72.9 36.8s-56.5-14.5-72.9-36.8c-16.4 22.3-43 36.8-72.9 36.8s-56.5-14.5-72.9-36.8c-16.4 22.3-43 36.8-72.9 36.8s-56.5-14.5-72.9-36.8c-16.4 22.3-43 36.8-72.9 36.8-57.5 0-100.3-53.1-88.1-109.3l42.7-196.6c5.3-24.6 27-42.1 52.1-42.1Z" />
        <path d="M213.3 584.5c20.1 13.4 44.2 21.3 70.1 21.3 27.7 0 53.3-8.9 74.2-24.1 20.9 15.2 46.5 24.1 74.2 24.1s53.3-8.9 74.2-24.1c20.9 15.2 46.5 24.1 74.2 24.1s53.3-8.9 74.2-24.1c20.9 15.2 46.5 24.1 74.2 24.1 25.9 0 50-7.9 70.1-21.3v196.3c0 35.3-28.7 64-64 64H289.3c-35.3 0-64-28.7-64-64V584.5Zm230.4 81.1v179.2h136.6V665.6H443.7Z" opacity="0.82" />
      </svg>
    );
  }
  if (type === "home") {
    return (
      <svg viewBox="0 0 1024 1024" aria-hidden="true" className={className} fill="currentColor">
        <path d="M140.8 499.2 484.9 193c15.4-13.7 38.7-13.7 54.1 0l344.2 306.2c18.3 16.3 19.9 44.4 3.6 62.7-16.3 18.3-44.4 19.9-62.7 3.6l-39.5-35.1v292.3c0 35.3-28.7 64-64 64H601.6V665.6c0-23.6-19.1-42.7-42.7-42.7h-93.8c-23.6 0-42.7 19.1-42.7 42.7v221.1H303.5c-35.3 0-64-28.7-64-64V530.4L200 565.5c-18.3 16.3-46.4 14.7-62.7-3.6-16.4-18.3-14.8-46.4 3.5-62.7Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true" className={className} fill="currentColor">
      <path d="M256 149.3h384l149.3 149.4V832c0 35.3-28.7 64-64 64H256c-35.3 0-64-28.7-64-64V213.3c0-35.3 28.7-64 64-64Zm341.3 64v128h128l-128-128Z" />
      <path d="M320 469.3h384v64H320v-64Zm0 128h384v64H320v-64Zm0 128h256v64H320v-64Z" fill="white" opacity="0.58" />
    </svg>
  );
}

function getClientAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zxgj_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getDesignerAssignmentDispatcherLabel(source?: string | null) {
  if (source === "org_manager") return "指定组织负责人";
  if (source === "role") return "指定岗位人员";
  if (source === "user") return "指定员工";
  return "客户所属门店负责人";
}

const followupTemplateGroups = [
  {
    key: "first_contact",
    label: "首次联系",
    templates: [
      "您好，我是星艺装饰的家装顾问，刚看到您的装修需求，想先了解一下房子的交付情况、装修预算和计划开工时间，方便后续给您匹配合适的设计方案。",
      "已首次联系客户，客户目前主要关注装修时间、预算范围和设计效果，后续需要继续确认房屋情况和量房意向。",
    ],
  },
  {
    key: "measure_invite",
    label: "邀约量房",
    templates: [
      "已与客户沟通量房时间，客户意向较明确，重点关注户型改造、预算控制和施工落地效果，需提前确认小区地址、房号及可量房时间。",
      "客户愿意进一步了解方案，已邀约设计师上门量房，下一步需确认具体时间并提醒客户准备户型图或房屋资料。",
    ],
  },
  {
    key: "after_measure",
    label: "量房后回访",
    templates: [
      "已完成量房沟通，客户主要关注空间利用、收纳设计和整体预算，下一步需安排设计师整理方案并约定初步方案沟通时间。",
      "量房后已回访客户，客户对现场沟通认可，需持续跟进方案出图时间，并提前说明后续报价沟通安排。",
    ],
  },
  {
    key: "after_quote",
    label: "报价后回访",
    templates: [
      "已向客户沟通报价内容，客户重点关注总价、施工项目和材料品牌，需继续解释报价差异并推动客户确认方案。",
      "报价已发送客户，客户暂未明确表态，下一步重点跟进客户疑问、预算接受度和竞品对比情况。",
    ],
  },
  {
    key: "deposit_contract",
    label: "定金/签约",
    templates: [
      "客户对方案和报价认可度较高，已沟通定金/签约事项，下一步需确认付款方式、合同信息和后续设计深化安排。",
      "已提醒客户确认合同信息、付款节点和开工前准备事项，需持续跟进客户最终签约时间。",
    ],
  },
  {
    key: "silent_follow",
    label: "未回复跟进",
    templates: [
      "客户近期未回复，已再次发送问候并确认是否继续推进装修计划，建议后续保持低频跟进，避免打扰客户。",
      "已尝试通过电话/微信联系客户，暂未取得有效反馈，下一步建议间隔跟进并关注客户装修时间是否变化。",
    ],
  },
  {
    key: "lost_recall",
    label: "流失挽回",
    templates: [
      "已尝试挽回客户，重点了解未继续推进的原因，包括预算、方案、时间安排或竞品影响，后续可根据原因制定二次沟通策略。",
      "客户推进意愿下降，已表达可继续协助优化方案和预算，后续如客户装修计划恢复可再次跟进。",
    ],
  },
];

function getFollowupSceneLabel(scene?: string | null) {
  return followupTemplateGroups.find((group) => group.key === scene)?.label || "";
}
type FollowupSceneTone = {
  badge: string;
  selected: string;
};
const followupSceneTones: Record<string, FollowupSceneTone> = {
  first_contact: {
    badge: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    selected: "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]",
  },
  measure_invite: {
    badge: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]",
    selected: "border-[#7dd3fc] bg-[#f0f9ff] text-[#0369a1]",
  },
  after_measure: {
    badge: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
    selected: "border-[#86efac] bg-[#f0fdf4] text-[#15803d]",
  },
  after_quote: {
    badge: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
    selected: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]",
  },
  deposit_contract: {
    badge: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
    selected: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]",
  },
  silent_follow: {
    badge: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
    selected: "border-[#94a3b8] bg-[#f8fafc] text-[#475569]",
  },
  lost_recall: {
    badge: "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]",
    selected: "border-[#fca5a5] bg-[#fef2f2] text-[#dc2626]",
  },
};
const defaultFollowupSceneTone: FollowupSceneTone = {
  badge: "border-[#d7dde7] bg-[#f8fafc] text-[#667085]",
  selected: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
};
function getFollowupSceneTone(scene?: string | null) {
  return followupSceneTones[String(scene || "")] || defaultFollowupSceneTone;
}

const MEASURE_CATEGORY_BASE = "量房资料";
const measureAttachmentTypes = [
  { key: "原始户型图", label: "原始户型图" },
  { key: "现场照片", label: "现场照片" },
  { key: "尺寸标注", label: "尺寸标注" },
  { key: "水电点位", label: "水电点位" },
  { key: "门窗梁位", label: "门窗梁位" },
  { key: "复尺补充", label: "复尺补充" },
  { key: "其他资料", label: "其他资料" },
];
const DESIGN_CATEGORY_BASE = "设计方案";
const LEGACY_DESIGN_CATEGORY = "设计图纸";
const designAttachmentTypes = [
  { key: "平面方案", label: "平面方案" },
  { key: "效果图/全景图", label: "效果图/全景图" },
  { key: "施工图纸", label: "施工图纸" },
  { key: "水电图纸", label: "水电图纸" },
  { key: "立面节点", label: "立面节点" },
  { key: "选材软装", label: "选材软装" },
  { key: "客户确认版", label: "客户确认版" },
  { key: "其他资料", label: "其他资料" },
];
const tabs = [
  { key: "info", label: "客户信息", icon: User },
  { key: "followup", label: "跟进记录", icon: MessageCircle },
  { key: "measure", label: "量房资料", icon: Ruler },
  { key: "deposit", label: "款项记录", icon: DollarSign },
  { key: "design", label: "设计方案", icon: Palette },
  { key: "quotation", label: "预算报价", icon: ReceiptText },
  { key: "contract", label: "合同资料", icon: ClipboardList },
  { key: "operations", label: "操作记录", icon: Clock },
];

const pageClass = "-m-5 min-h-[calc(100vh-72px)] bg-[#f5f7fa] p-4 text-[#182230] sm:p-5 lg:-m-7 lg:p-6 2xl:p-7";
const panelClass = "overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white";
const detailActionButtonClass = "inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border border-[#e2e7ee] bg-white px-3.5 text-sm font-medium text-[#475467] transition hover:border-[#cfd7e3] hover:bg-[#f8fafc] hover:text-[#182230] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#2f6feb]/20 disabled:cursor-not-allowed disabled:opacity-60";
const dangerActionButtonClass = "inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border border-red-200 bg-red-50 px-3.5 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-red-500/15";
const successActionButtonClass = "inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-500/15";
const designFeeActionButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-amber-300 bg-amber-50 px-3.5 text-sm font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60";
const CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS = "min-h-[480px]";

function formatPlainAmount(value: number) {
  const amount = Number(value);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function escapePrintHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}
function getRecordTimeValue(value: any) {
  return parseAppDate(value)?.getTime() || 0;
}

function makeMeasureCategory(type: string) {
  return `${MEASURE_CATEGORY_BASE}/${type || "其他资料"}`;
}

function makeDesignCategory(type: string) {
  return `${DESIGN_CATEGORY_BASE}/${type || "其他资料"}`;
}

function isMeasureAttachment(file?: CustomerAttachment | null) {
  const category = String(file?.category || "");
  return category === MEASURE_CATEGORY_BASE || category.startsWith(`${MEASURE_CATEGORY_BASE}/`);
}

function isDesignAttachment(file?: CustomerAttachment | null) {
  const category = String(file?.category || "");
  return category === DESIGN_CATEGORY_BASE || category === LEGACY_DESIGN_CATEGORY || category.startsWith(`${DESIGN_CATEGORY_BASE}/`);
}

function getMeasureAttachmentGroup(file?: CustomerAttachment | null) {
  const category = String(file?.category || "");
  if (!category || category === MEASURE_CATEGORY_BASE) return "未分类";
  if (category.startsWith(`${MEASURE_CATEGORY_BASE}/`)) {
    return category.slice(`${MEASURE_CATEGORY_BASE}/`.length) || "未分类";
  }
  return "未分类";
}

function getDesignAttachmentGroup(file?: CustomerAttachment | null) {
  const category = String(file?.category || "");
  if (!category || category === DESIGN_CATEGORY_BASE || category === LEGACY_DESIGN_CATEGORY) return "未分类";
  if (category.startsWith(`${DESIGN_CATEGORY_BASE}/`)) {
    return category.slice(`${DESIGN_CATEGORY_BASE}/`.length) || "未分类";
  }
  return "未分类";
}

function formatAttachmentCategory(category: string) {
  if (category.startsWith(`${MEASURE_CATEGORY_BASE}/`)) return category.slice(`${MEASURE_CATEGORY_BASE}/`.length);
  if (category.startsWith(`${DESIGN_CATEGORY_BASE}/`)) return category.slice(`${DESIGN_CATEGORY_BASE}/`.length);
  return category;
}

const contractHolidayDates = new Set([
  "2026-01-01", "2026-01-02", "2026-01-03",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
]);

function parseDateOnly(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateContractPlannedEnd(
  plannedStart: string,
  durationDays: string,
  options: { weekendConstruction: boolean; holidayConstruction: boolean },
) {
  const startDate = parseDateOnly(plannedStart);
  const days = Math.ceil(Number(durationDays));
  if (!startDate || !Number.isFinite(days) || days <= 0) return "";
  const cursor = new Date(startDate);
  let remaining = days;
  let guard = 0;
  while (remaining > 0 && guard < 2000) {
    const dateKey = formatDateOnly(cursor);
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const isHoliday = contractHolidayDates.has(dateKey);
    if ((options.weekendConstruction || !isWeekend) && (options.holidayConstruction || !isHoliday)) {
      remaining -= 1;
    }
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return formatDateOnly(cursor);
}

const depositPaymentChannels = ["现金", "微信", "支付宝", "银行转账", "POS机", "其他"];
const depositTypes = ["设计定金", "量房定金", "意向金", "合同定金", "其他"];
const designFeeTypes = ["设计费", "平面方案设计费", "效果图设计费", "深化设计费", "其他"];
const designFeeCalculationModes = [
  { key: "fixed", label: "固定金额" },
  { key: "quotation_ratio", label: "按报价合计比例" },
  { key: "direct_fee_ratio", label: "按直接费比例" },
  { key: "designer_level_area", label: "按设计师等级" },
];
const designerLevelPriceOptions = [
  { level: "普通设计师", unitPrice: 80 },
  { level: "主任设计师", unitPrice: 120 },
  { level: "首席设计师", unitPrice: 180 },
  { level: "设计总监", unitPrice: 260 },
  { level: "自定义等级", unitPrice: 0 },
];
const paymentRecordTypeTabs = [
  { key: "all", label: "全部" },
  { key: "deposit", label: "定金" },
  { key: "design_fee", label: "设计费" },
];
const DEPOSIT_VOUCHER_CATEGORY = "收款凭证";
const depositStatusMeta: Record<string, { label: string; className: string }> = {
  received: { label: "已收款", className: "bg-emerald-50 text-emerald-700" },
  pending: { label: "待收款", className: "bg-red-50 text-red-700" },
  pending_approval: { label: "收款审批中", className: "bg-amber-50 text-amber-700" },
  rejected: { label: "已驳回", className: "bg-red-50 text-red-700" },
};
const refundStatusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "退款待处理", className: "bg-amber-50 text-amber-700" },
  pending_approval: { label: "退款审批中", className: "bg-primary-50 text-primary-700" },
  partial_refunded: { label: "部分已退", className: "bg-emerald-50 text-emerald-700" },
  refunded: { label: "已退款", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "退款驳回", className: "bg-red-50 text-red-700" },
};
const waiverStatusMeta: Record<string, { label: string; className: string }> = {
  pending_approval: { label: "减免审批中", className: "bg-primary-50 text-primary-700" },
  approved: { label: "已减免", className: "bg-violet-50 text-violet-700" },
  rejected: { label: "减免驳回", className: "bg-red-50 text-red-700" },
};
function getDepositStatusMeta(status?: string | null) {
  return depositStatusMeta[String(status || "received")] || { label: "已收款", className: "bg-emerald-50 text-emerald-700" };
}
function getDepositCollectionStatusMeta(record: DepositRecord) {
  const refundMeta = getDepositRefundStatusMeta(record);
  if (refundMeta && record.refund_status) {
    return refundMeta;
  }
  const waiverMeta = getDepositWaiverStatusMeta(record);
  if (record.waiver_status === "pending_approval") return waiverMeta || waiverStatusMeta.pending_approval;
  if (record.status === "received") {
    const receivableAmount = getPaymentRecordReceivable(record);
    const actualReceivedAmount = getDepositActualReceivedAmount(record);
    const waivedAmount = getDepositWaivedAmount(record);
    if (actualReceivedAmount <= 0) return { label: "待收款", className: "bg-red-50 text-red-700" };
    if (receivableAmount <= actualReceivedAmount + waivedAmount + 0.005) {
      return waivedAmount > 0 ? { label: "已结清 · 含减免", className: "bg-violet-50 text-violet-700" } : { label: "已收款", className: "bg-emerald-50 text-emerald-700" };
    }
    return { label: "部分收款", className: "bg-amber-50 text-amber-700" };
  }
  return getDepositStatusMeta(record.status);
}
function normalizePaymentRecordType(value?: string | null) {
  return value === "design_fee" ? "design_fee" : "deposit";
}
function normalizeDesignFeeMode(value?: string | null) {
  return ["quotation_ratio", "direct_fee_ratio", "designer_level_area"].includes(String(value || "")) ? String(value) : "fixed";
}
function isQuotationBasedDesignFeeMode(mode?: string | null) {
  return ["quotation_ratio", "direct_fee_ratio"].includes(normalizeDesignFeeMode(mode));
}
function isAutoCalculatedDesignFeeMode(mode?: string | null) {
  return ["quotation_ratio", "direct_fee_ratio", "designer_level_area"].includes(normalizeDesignFeeMode(mode));
}
function getDesignFeeModeLabel(mode?: string | null) {
  const normalized = normalizeDesignFeeMode(mode);
  return designFeeCalculationModes.find((item) => item.key === normalized)?.label || "固定金额";
}
function getDesignerLevelDefaultPrice(level?: string | null) {
  return designerLevelPriceOptions.find((item) => item.level === level)?.unitPrice || 0;
}
function getQuotationDirectAmount(quotation: any) {
  const amount = Number(quotation?.direct_amount || 0);
  return Number.isFinite(amount) ? toMoney(amount) : 0;
}
function getPaymentRecordLabel(record?: Pick<DepositRecord, "record_type"> | null) {
  return normalizePaymentRecordType(record?.record_type) === "design_fee" ? "设计费" : "定金";
}
function getRefundActionLabel(record?: Pick<DepositRecord, "record_type"> | null) {
  return normalizePaymentRecordType(record?.record_type) === "design_fee" ? "退设计费" : "退定金";
}
function getPaymentRecordReceivable(record: DepositRecord) {
  const receivable = Number(record.receivable_amount ?? record.amount ?? 0);
  return Number.isFinite(receivable) ? receivable : Number(record.amount || 0);
}
function getRefundStatusMeta(status?: string | null) {
  return refundStatusMeta[String(status || "")] || null;
}
function getDepositWaiverStatusMeta(record: DepositRecord) {
  return waiverStatusMeta[String(record.waiver_status || "")] || null;
}
function getDepositRefundedAmount(record: DepositRecord) {
  const value = Number(record.refunded_amount ?? 0);
  if (value > 0) return Math.round(value * 100) / 100;
  if (["refunded", "partial_refunded"].includes(String(record.refund_status || ""))) {
    return Math.round(Number(record.refund_amount || 0) * 100) / 100;
  }
  return 0;
}
function getDepositWaivedAmount(record: DepositRecord) {
  const value = Number(record.waived_amount ?? 0);
  if (value > 0 && record.waiver_status !== "rejected") return Math.round(value * 100) / 100;
  return 0;
}
function getDepositRemainingRefundAmount(record: DepositRecord) {
  const remaining = record.refundable_remaining_amount ?? (Number(record.amount || 0) - getDepositRefundedAmount(record));
  return Math.max(0, Math.round(Number(remaining || 0) * 100) / 100);
}
function getDepositActualReceivedAmount(record: DepositRecord) {
  if (record.status !== "received") return 0;
  return Math.max(0, Math.round((Number(record.amount || 0) - getDepositRefundedAmount(record)) * 100) / 100);
}
function getDepositPendingTopUpAmount(record: DepositRecord) {
  return (record.top_up_approvals || [])
    .filter((approval) => approval?.status === "pending")
    .reduce((sum, approval) => {
      const amount = Number(approval.approval_amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
}
function getDepositPendingWaiverAmount(record: DepositRecord) {
  return (record.waiver_approvals || [])
    .filter((approval) => approval?.status === "pending")
    .reduce((sum, approval) => {
      const amount = Number(approval.approval_amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
}
function getDepositApprovedTopUpAmount(record: DepositRecord) {
  return (record.top_up_approvals || [])
    .filter((approval) => approval?.status === "approved")
    .reduce((sum, approval) => {
      const amount = Number(approval.approval_amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
}
function getDepositRemainingReceiveAmount(record: DepositRecord) {
  const remaining = getPaymentRecordReceivable(record) - getDepositActualReceivedAmount(record) - getDepositWaivedAmount(record) - getDepositPendingTopUpAmount(record) - getDepositPendingWaiverAmount(record);
  return Math.max(0, Math.round(remaining * 100) / 100);
}
function parseApprovalMeta(approval?: any) {
  if (!approval?.approval_meta) return {};
  if (typeof approval.approval_meta === "object") return approval.approval_meta;
  try {
    return JSON.parse(approval.approval_meta);
  } catch {
    return {};
  }
}
function getDepositCollectionLedger(record: DepositRecord) {
  const sourceRecords = (record._source_records && record._source_records.length > 0 ? record._source_records : [record])
    .slice()
    .sort((a, b) => getRecordTimeValue(a.received_at || a.created_at) - getRecordTimeValue(b.received_at || b.created_at));
  const initialRecord = sourceRecords[0] || record;
  const approvedTopUpAmount = getDepositApprovedTopUpAmount(record);
  const initialAmount = Math.max(0, toMoney(Number(record.amount || 0) - approvedTopUpAmount));
  const entries = [{
    id: `${initialRecord.id}-initial`,
    label: "首次收款",
    amount: initialAmount,
    status: initialRecord.status || "received",
    statusText: getDepositStatusMeta(initialRecord.status).label,
    occurredAt: initialRecord.received_at,
    channel: initialRecord.method === "qr" ? "扫码支付" : initialRecord.payment_channel || "手动记录",
    receiver: initialRecord.receiver_name || initialRecord.created_by_name || "-",
    voucherUrl: initialRecord.voucher_url || "",
    notes: initialRecord.notes || "",
  }];
  const topUpApprovals = (record.top_up_approvals || [])
    .slice()
    .sort((a, b) => getRecordTimeValue(a.created_at || a.updated_at) - getRecordTimeValue(b.created_at || b.updated_at));
  topUpApprovals.forEach((approval, index) => {
    const meta = parseApprovalMeta(approval);
    entries.push({
      id: approval.id || `${record.id}-top-up-${index}`,
      label: `第 ${index + 1} 次补收`,
      amount: Math.max(0, Math.round(Number(approval.approval_amount || 0) * 100) / 100),
      status: approval.status,
      statusText: approval.status === "approved" ? "已入账" : approval.status === "pending" ? "审批中" : approval.status === "rejected" ? "已驳回" : "待处理",
      occurredAt: meta.received_at || approval.created_at,
      channel: meta.payment_channel || "-",
      receiver: meta.receiver_name || "-",
      voucherUrl: meta.voucher_url || "",
      notes: meta.notes || approval.error_message || "",
    });
  });
  const waiverApprovals = (record.waiver_approvals || [])
    .slice()
    .sort((a, b) => getRecordTimeValue(a.created_at || a.updated_at) - getRecordTimeValue(b.created_at || b.updated_at));
  waiverApprovals.forEach((approval, index) => {
    const meta = parseApprovalMeta(approval);
    entries.push({
      id: approval.id || `${record.id}-waiver-${index}`,
      label: `尾款减免${waiverApprovals.length > 1 ? ` ${index + 1}` : ""}`,
      amount: Math.max(0, Math.round(Number(approval.approval_amount || 0) * 100) / 100),
      status: approval.status,
      statusText: approval.status === "approved" ? "减免通过" : approval.status === "pending" ? "审批中" : approval.status === "rejected" ? "已驳回" : "待处理",
      occurredAt: approval.completed_at || approval.created_at,
      channel: "尾款减免",
      receiver: "-",
      voucherUrl: "",
      notes: meta.reason || meta.notes || approval.error_message || "",
    });
  });
  return entries;
}
function getDepositReceivableGroupKey(record: DepositRecord) {
  return [
    normalizePaymentRecordType(record.record_type),
    record.deposit_type || "",
    formatPlainAmount(getPaymentRecordReceivable(record)),
    normalizeDesignFeeMode(record.design_fee_mode),
    record.quotation_id || "",
    formatPlainAmount(Number(record.quotation_amount || 0)),
    formatPlainAmount(Number(record.design_fee_base_amount || 0)),
    formatPlainAmount(Number(record.design_fee_rate || 0)),
    formatPlainAmount(Number(record.design_fee_area || 0)),
    formatPlainAmount(Number(record.design_fee_unit_price || 0)),
    record.designer_level || "",
  ].join("|");
}
function mergeDepositReceivableRecords(records: DepositRecord[]) {
  const map = new Map<string, DepositRecord>();
  records.forEach((record) => {
    const key = getDepositReceivableGroupKey(record);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...record,
        top_up_approvals: [...(record.top_up_approvals || [])],
        waiver_approvals: [...(record.waiver_approvals || [])],
        _source_records: [record],
      });
      return;
    }
    const existingAmount = Number(existing.amount || 0);
    const recordAmount = Number(record.amount || 0);
    const mergedTopUps = [...(existing.top_up_approvals || []), ...(record.top_up_approvals || [])]
      .filter((approval, index, list) => approval?.id && list.findIndex((item) => item?.id === approval.id) === index)
      .sort((a, b) => getRecordTimeValue(b.created_at || b.updated_at) - getRecordTimeValue(a.created_at || a.updated_at));
    const mergedWaivers = [...(existing.waiver_approvals || []), ...(record.waiver_approvals || [])]
      .filter((approval, index, list) => approval?.id && list.findIndex((item) => item?.id === approval.id) === index)
      .sort((a, b) => getRecordTimeValue(b.created_at || b.updated_at) - getRecordTimeValue(a.created_at || a.updated_at));
    const sourceRecords = [...(existing._source_records || [existing]), record]
      .sort((a, b) => getRecordTimeValue(a.received_at || a.created_at) - getRecordTimeValue(b.received_at || b.created_at));
    const latestReceivedRecord = sourceRecords
      .filter((item) => item.status === "received")
      .sort((a, b) => getRecordTimeValue(b.received_at || b.created_at) - getRecordTimeValue(a.received_at || a.created_at))[0];
    map.set(key, {
      ...existing,
      amount: toMoney(Math.max(existingAmount, recordAmount)),
      received_at: getRecordTimeValue(record.received_at) > getRecordTimeValue(existing.received_at) ? record.received_at : existing.received_at,
      voucher_url: existing.voucher_url || record.voucher_url,
      notes: [existing.notes, record.notes].filter(Boolean).join("\n"),
      status: latestReceivedRecord?.status || existing.status || record.status,
      top_up_approvals: mergedTopUps,
      top_up_approval: mergedTopUps[0] || existing.top_up_approval || record.top_up_approval || null,
      waiver_approvals: mergedWaivers,
      waiver_approval: mergedWaivers[0] || existing.waiver_approval || record.waiver_approval || null,
      _source_records: sourceRecords,
    });
  });
  return Array.from(map.values()).sort((a, b) => getRecordTimeValue(b.received_at || b.created_at) - getRecordTimeValue(a.received_at || a.created_at));
}
function getDepositRefundStatusMeta(record: DepositRecord) {
  const status = String(record.refund_status || "");
  const normalizeMeta = (meta: { label: string; className: string } | null) => {
    if (!meta || normalizePaymentRecordType(record.record_type) !== "design_fee") return meta;
    return { ...meta, label: meta.label.replace(/退定金/g, "退设计费") };
  };
  if ((status === "refunded" || status === "partial_refunded") && getDepositRemainingRefundAmount(record) > 0) {
    return normalizeMeta(refundStatusMeta.partial_refunded);
  }
  return normalizeMeta(getRefundStatusMeta(record.refund_status));
}
function getDepositActiveRefundAmount(record: DepositRecord) {
  if (record.refund_status === "pending_approval" && record.refund_approval?.refund_amount) return Number(record.refund_approval.refund_amount || 0);
  if (record.refund_status === "pending") return Number(record.refund_amount || 0);
  return getDepositRefundedAmount(record);
}
function isPositiveDepositMessage(message: string) {
  if (!message) return false;
  if (["不允许", "不能", "失败", "错误", "缺少", "不存在", "无效", "必须", "暂不", "请勿", "请选择"].some((keyword) => message.includes(keyword))) return false;
  return ["已上传", "已提交", "已保存", "已更新", "审批通过"].some((keyword) => message.includes(keyword));
}
const contractTypes = ["装修施工合同", "设计合同", "主材合同", "增补合同", "整装合同", "软装合同", "其他"];
const contractSteps = [
  { title: "基本信息", desc: "类型、名称、编号" },
  { title: "签约双方", desc: "甲方与乙方信息" },
  { title: "项目条款", desc: "地址、工期、施工约定" },
  { title: "金额收款", desc: "金额、定金、收款比例" },
  { title: "合同附件", desc: "合同文件与备注" },
];

type DepositRecord = {
  id: string;
  amount: number;
  received_at: string;
  method: "manual" | "qr";
  payment_channel?: string | null;
  record_type?: "deposit" | "design_fee" | string | null;
  deposit_type?: string | null;
  receivable_amount?: number | null;
  design_fee_mode?: "fixed" | "quotation_ratio" | "direct_fee_ratio" | "designer_level_area" | string | null;
  quotation_id?: string | null;
  quotation_title?: string | null;
  quotation_amount?: number | null;
  design_fee_base_amount?: number | null;
  design_fee_rate?: number | null;
  design_fee_area?: number | null;
  design_fee_unit_price?: number | null;
  designer_level?: string | null;
  is_refundable?: number | boolean | null;
  receiver_name?: string | null;
  voucher_url?: string | null;
  notes?: string | null;
  status?: string | null;
  approval_status?: string | null;
  approval_flow_name?: string | null;
  refund_status?: string | null;
  refund_amount?: number | null;
  refunded_amount?: number | null;
  refundable_remaining_amount?: number | null;
  refund_reason?: string | null;
  refund_requested_at?: string | null;
  waived_amount?: number | null;
  waiver_status?: string | null;
  waiver_reason?: string | null;
  waiver_requested_at?: string | null;
  waiver_processed_at?: string | null;
  created_by_name?: string | null;
  created_by_avatar?: string | null;
  branch_name?: string | null;
  created_at?: string | null;
  approval?: any;
  top_up_approval?: any;
  top_up_approvals?: any[];
  waiver_approval?: any;
  waiver_approvals?: any[];
  _source_records?: DepositRecord[];
  refund_approval?: any;
};

type ApprovalCommentKind = "contract" | "deposit" | "depositRefund";
type ApprovalAction = "approve" | "reject";
type ApprovalCommentTarget = {
  kind: ApprovalCommentKind;
  stepId: string;
  action: ApprovalAction;
};

function getDepositApprovalView(record: DepositRecord) {
  const approval = record.approval;
  const label = getPaymentRecordLabel(record);
  if (!approval) return { title: "不走审批", caption: `分公司未启用${label}审批流`, className: "text-surface-500" };
  if (approval.status === "approved") return { title: "审批通过", caption: `${approval.flow_name || `${label}审批流`} · ${approval.total_nodes || 0} 步`, className: "text-emerald-700" };
  if (approval.status === "rejected") return { title: "审批驳回", caption: approval.error_message || approval.flow_name || `${label}审批流`, className: "text-red-700" };
  if (approval.status === "pending") {
    const total = Number(approval.total_nodes || 0);
    const done = Number(approval.approved_nodes || 0);
    const approvers = Array.isArray(approval.current_approvers) ? approval.current_approvers.join("、") : "";
    return {
      title: approval.current_node_name || "待审批",
      caption: `${approval.flow_name || `${label}审批流`} · ${done}/${total}${approvers ? ` · ${approvers}` : ""}`,
      className: "text-primary-700",
    };
  }
  return { title: "审批异常", caption: approval.error_message || "请检查审批流配置", className: "text-amber-700" };
}

function getDepositTopUpApprovalView(record: DepositRecord, approval = record.top_up_approval) {
  const label = getPaymentRecordLabel(record);
  if (!approval) return null;
  if (approval.status === "approved") return { title: "补收审批通过", caption: `${approval.flow_name || `补收${label}审批流`} · ${approval.total_nodes || 0} 步`, className: "text-emerald-700" };
  if (approval.status === "rejected") return { title: "补收审批驳回", caption: approval.error_message || approval.flow_name || `补收${label}审批流`, className: "text-red-700" };
  if (approval.status === "pending") {
    const total = Number(approval.total_nodes || 0);
    const done = Number(approval.approved_nodes || 0);
    return {
      title: approval.current_node_name || "补收待审批",
      caption: `${approval.flow_name || `补收${label}审批流`} · ${done}/${total}`,
      className: "text-primary-700",
    };
  }
  return { title: "补收审批异常", caption: approval.error_message || "请检查审批流配置", className: "text-amber-700" };
}

function getDepositWaiverApprovalView(record: DepositRecord, approval = record.waiver_approval) {
  const label = getPaymentRecordLabel(record);
  const statusMeta = getDepositWaiverStatusMeta(record);
  if (!approval) return {
    title: statusMeta?.label || "未减免",
    caption: record.waiver_status ? `分公司未启用${label}尾款减免审批流` : "暂无尾款减免",
    className: record.waiver_status === "rejected" ? "text-red-700" : record.waiver_status === "approved" ? "text-violet-700" : "text-surface-500",
  };
  if (approval.status === "approved") return { title: "减免审批通过", caption: `${approval.flow_name || `${label}尾款减免审批流`} · ${approval.total_nodes || 0} 步`, className: "text-violet-700" };
  if (approval.status === "rejected") return { title: "减免审批驳回", caption: approval.error_message || approval.flow_name || `${label}尾款减免审批流`, className: "text-red-700" };
  if (approval.status === "pending") {
    const total = Number(approval.total_nodes || 0);
    const done = Number(approval.approved_nodes || 0);
    return {
      title: approval.current_node_name || "减免待审批",
      caption: `${approval.flow_name || `${label}尾款减免审批流`} · ${done}/${total}`,
      className: "text-primary-700",
    };
  }
  return { title: "减免审批异常", caption: approval.error_message || "请检查审批流配置", className: "text-amber-700" };
}

function getDepositRefundApprovalView(record: DepositRecord) {
  const approval = record.refund_approval;
  const statusMeta = getDepositRefundStatusMeta(record);
  const refundLabel = getRefundActionLabel(record);
  if (!approval) return {
    title: statusMeta?.label || "未申请",
    caption: record.refund_status ? `分公司未启用${refundLabel}审批流` : `暂无${refundLabel}申请`,
    className: record.refund_status === "rejected" ? "text-red-700" : record.refund_status === "refunded" ? "text-emerald-700" : "text-surface-500",
  };
  if (approval.status === "approved") return { title: "审批通过", caption: `${approval.flow_name || `${refundLabel}审批流`} · ${approval.total_nodes || 0} 步`, className: "text-emerald-700" };
  if (approval.status === "rejected") return { title: "审批驳回", caption: approval.error_message || approval.flow_name || `${refundLabel}审批流`, className: "text-red-700" };
  if (approval.status === "pending") {
    const total = Number(approval.total_nodes || 0);
    const done = Number(approval.approved_nodes || 0);
    const approvers = Array.isArray(approval.current_approvers) ? approval.current_approvers.join("、") : "";
    return {
      title: approval.current_node_name || "待审批",
      caption: `${approval.flow_name || `${refundLabel}审批流`} · ${done}/${total}${approvers ? ` · ${approvers}` : ""}`,
      className: "text-primary-700",
    };
  }
  return { title: "审批异常", caption: approval.error_message || "请检查审批流配置", className: "text-amber-700" };
}

function getDepositEditBlockedReason(record: DepositRecord) {
  const label = getPaymentRecordLabel(record);
  const refundLabel = getRefundActionLabel(record);
  if (record.status === "pending_approval") return `收款审批中的${label}暂不允许编辑`;
  if (record.approval?.status === "approved" || record.approval_status === "approved") return `收款审批已通过的${label}不允许编辑`;
  if (record.refund_status === "pending_approval") return `${refundLabel}审批中的${label}暂不允许编辑`;
  if (record.refund_status === "pending") return `已提交${refundLabel}申请的${label}暂不允许编辑`;
  if (record.refund_status === "partial_refunded") return `已有${refundLabel}审批通过的${label}不允许编辑`;
  if (record.refund_status === "refunded") return `已完成${refundLabel}的${label}不允许编辑`;
  if (record.refund_status === "rejected") return `${refundLabel}审批已完成的${label}不允许编辑`;
  if (record.waiver_status === "pending_approval") return `尾款减免审批中的${label}暂不允许编辑`;
  if (record.waiver_status === "approved") return `已有尾款减免的${label}不允许编辑`;
  return "";
}

function getDepositRefundBlockedReason(record: DepositRecord) {
  const label = getPaymentRecordLabel(record);
  const refundLabel = getRefundActionLabel(record);
  if (record.status === "pending_approval") return `该${label}正在收款审批中，审批通过后才可申请${refundLabel}`;
  if (record.status !== "received") return `只有已收款${label}支持申请${refundLabel}`;
  if (record.refund_status === "pending_approval") return `该${label}正在${refundLabel}审批中，请勿重复提交`;
  if (record.refund_status === "pending") return `该${label}已提交${refundLabel}申请，请勿重复提交`;
  if (getDepositRemainingRefundAmount(record) <= 0) return `该${label}已全部退完`;
  return "";
}

function getDepositTopUpBlockedReason(record: DepositRecord) {
  const label = getPaymentRecordLabel(record);
  const refundLabel = getRefundActionLabel(record);
  if (!["received", "pending"].includes(String(record.status || ""))) return `只有已收款或待收款${label}支持补收`;
  if (record.approval?.status === "pending" || record.approval_status === "pending") return `该${label}已有收款审批进行中，暂不允许重复补收`;
  if (record.refund_status === "pending_approval" || record.refund_status === "pending") return `${refundLabel}流程中的${label}暂不允许补收`;
  if (["partial_refunded", "refunded", "rejected"].includes(String(record.refund_status || ""))) return `已有${refundLabel}记录的${label}暂不允许补收`;
  if (record.waiver_status === "pending_approval") return `该${label}尾款减免审批中，暂不允许补收`;
  if (record.waiver_status === "approved") return `该${label}已有尾款减免，暂不允许补收`;
  if (getDepositRemainingReceiveAmount(record) <= 0) {
    return getDepositPendingTopUpAmount(record) > 0 ? `该${label}已有补收审批占用待补金额，审批完成前不能重复补收` : `${label}已收满，无需补收`;
  }
  return "";
}

function getDepositWaiverBlockedReason(record: DepositRecord) {
  const label = getPaymentRecordLabel(record);
  const refundLabel = getRefundActionLabel(record);
  if (record.status !== "received") return `只有已收款${label}支持尾款减免`;
  if (record.approval?.status === "pending" || record.approval_status === "pending") return `该${label}已有收款审批进行中，暂不允许尾款减免`;
  if (record.refund_status === "pending_approval" || record.refund_status === "pending") return `${refundLabel}流程中的${label}暂不允许尾款减免`;
  if (["partial_refunded", "refunded", "rejected"].includes(String(record.refund_status || ""))) return `已有${refundLabel}记录的${label}暂不允许尾款减免`;
  if (record.waiver_status === "pending_approval") return `该${label}已有尾款减免审批中，请勿重复提交`;
  if (record.waiver_status === "approved") return `该${label}已有尾款减免记录`;
  if (getDepositRemainingReceiveAmount(record) <= 0) return getDepositPendingWaiverAmount(record) > 0 ? `该${label}已有尾款减免审批占用待收金额` : `${label}已结清，无需尾款减免`;
  return "";
}

type BranchCollectionRules = {
  paymentQrCodeUrl: string;
  paymentQrCodeName: string;
  paymentAccountName: string;
  paymentQrNote: string;
  designFeeRate: number;
};

type PaymentSchemeOption = {
  id: string;
  name: string;
  isDefault?: boolean;
  stages: { id: string; name: string; ratio: number; trigger?: string }[];
};

type ContractTemplateOption = {
  id: string;
  name: string;
  contract_type: string;
  status: string;
  is_default?: number;
  current_version?: number;
};

type ContractRecord = {
  id: string;
  contract_no: string;
  title: string;
  total_amount: number;
  status?: string | null;
  signed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  created_by_avatar?: string | null;
  content?: any;
  payment_plans?: any[];
  approval?: any;
};

type CustomerOperationLog = {
  id: string;
  operator_id?: string | null;
  operator_name?: string | null;
  action?: string | null;
  module?: string | null;
  title?: string | null;
  content?: string | null;
  target_name?: string | null;
  changes?: { label?: string; before?: string; after?: string }[];
  created_at?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown>;
};

type LifecycleCompletion = {
  stage: string;
  completed: boolean;
  operator_name?: string | null;
  completed_at?: string | null;
  source?: string | null;
};

function isTemporaryContractDraft(contract: ContractRecord) {
  return contract.status === "DRAFT" && contract.content?.is_temporary_draft === true;
}

function getContractStatusView(contract: ContractRecord) {
  if (isTemporaryContractDraft(contract)) return { label: "暂存", className: "border-amber-200 bg-amber-50 text-amber-700" };
  if (contract.status === "PENDING_APPROVAL") return { label: "待审批", className: "border-primary-200 bg-primary-50 text-primary-700" };
  if (contract.status === "REJECTED") return { label: "已驳回", className: "border-red-200 bg-red-50 text-red-700" };
  if (contract.status === "SIGNED") return { label: "已签约", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (contract.status === "RESIGNED") return { label: "已重签", className: "border-surface-300 bg-surface-100 text-surface-600" };
  if (contract.status === "APPROVED") return { label: "已审批", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: "草稿", className: "border-surface-200 bg-white text-surface-700" };
}

function getContractApprovalView(contract: ContractRecord) {
  const approval = contract.approval;
  if (contract.status === "RESIGNED") return { title: "历史合同", caption: "已由新合同重签替代", className: "text-surface-500" };
  if (isTemporaryContractDraft(contract)) return { title: "暂未提交", caption: "创建后判断审批流", className: "text-surface-400" };
  if (!approval) return { title: "不走审批", caption: "分公司未启用合同审批流", className: "text-surface-500" };
  if (approval.status === "approved") return { title: "审批通过", caption: `${approval.flow_name || "合同审批流"} · ${approval.total_nodes || 0} 步`, className: "text-emerald-700" };
  if (approval.status === "rejected") return { title: "审批驳回", caption: approval.error_message || approval.flow_name || "合同审批流", className: "text-red-700" };
  if (approval.status === "pending") {
    const total = Number(approval.total_nodes || 0);
    const done = Number(approval.approved_nodes || 0);
    const approvers = Array.isArray(approval.current_approvers) ? approval.current_approvers.join("、") : "";
    return {
      title: approval.current_node_name || "待审批",
      caption: `${approval.flow_name || "合同审批流"} · ${done}/${total}${approvers ? ` · ${approvers}` : ""}`,
      className: "text-primary-700",
    };
  }
  return { title: "审批异常", caption: approval.error_message || "请检查审批流配置", className: "text-amber-700" };
}

function getOperationModuleLabel(module?: string | null) {
  const text = String(module || "").trim();
  return text || "客户";
}

function getOperationTitle(log: CustomerOperationLog) {
  const title = String(log.title || "").trim();
  if (title) return title;
  return "记录了一次操作";
}

function getOperationContent(log: CustomerOperationLog) {
  const content = String(log.content || "").trim();
  if (content) return content;
  return "系统已记录该客户相关操作";
}

function getOperationChanges(log: CustomerOperationLog) {
  return Array.isArray(log.changes)
    ? log.changes
        .map((change) => ({
          label: String(change?.label || "").trim(),
          before: String(change?.before || "").trim() || "未填写",
          after: String(change?.after || "").trim() || "未填写",
        }))
        .filter((change) => change.label)
    : [];
}

function getApprovalStatusMeta(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return { label: "已通过", className: "border-emerald-200 bg-emerald-50 text-emerald-700", dotClassName: "bg-emerald-500", icon: CircleCheck };
  if (normalized === "rejected") return { label: "已驳回", className: "border-red-200 bg-red-50 text-red-700", dotClassName: "bg-red-500", icon: CircleX };
  if (normalized === "pending") return { label: "待审批", className: "border-primary-200 bg-primary-50 text-primary-700", dotClassName: "bg-primary-600", icon: Clock };
  if (normalized === "waiting") return { label: "未开始", className: "border-surface-200 bg-surface-50 text-surface-500", dotClassName: "bg-surface-300", icon: CircleDashed };
  if (normalized === "skipped") return { label: "已跳过", className: "border-surface-200 bg-surface-50 text-surface-500", dotClassName: "bg-surface-300", icon: CircleDashed };
  return { label: "未开始", className: "border-surface-200 bg-surface-50 text-surface-500", dotClassName: "bg-surface-300", icon: CircleDashed };
}

function getApprovalInstanceStatusText(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "审批通过";
  if (normalized === "rejected") return "审批驳回";
  if (normalized === "pending") return "审批中";
  return "未发起";
}

function groupApprovalSteps(steps?: any[]) {
  const groups = new Map<number, any[]>();
  (Array.isArray(steps) ? steps : []).forEach((step) => {
    const order = Number(step.sort_order || 0);
    groups.set(order, [...(groups.get(order) || []), step]);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([sortOrder, group]) => ({ sortOrder, nodeName: group[0]?.node_name || `审批节点 ${sortOrder + 1}`, steps: group }));
}

function getApprovalNodeStatus(steps: any[]) {
  if (steps.some((step) => step.status === "rejected")) return "rejected";
  if (steps.some((step) => step.status === "pending")) return "pending";
  if (steps.some((step) => step.status === "approved")) return "approved";
  if (steps.every((step) => step.status === "skipped")) return "skipped";
  return "waiting";
}

function ApprovalUserAvatar({
  name,
  avatar,
  size = "md",
  pending = false,
}: {
  name?: string | null;
  avatar?: string | null;
  size?: "sm" | "md";
  pending?: boolean;
}) {
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-xs";
  const initial = String(name || "审").trim().slice(0, 1) || "审";
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClass} ${
      avatar
        ? "bg-white ring-1 ring-inset ring-[#dfe5ed]"
        : pending
          ? "bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]"
          : "bg-[#f8fafc] text-[#667085] ring-1 ring-inset ring-[#dfe5ed]"
    }`}>
      {avatar ? (
        <NativeImage src={avatar} alt={`${name || "审批人"}头像`} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

function PaymentApprovalTimeline({
  nodeGroups,
  processingId,
  userId,
  kind,
  onAction,
  headerAction,
}: {
  nodeGroups: ReturnType<typeof groupApprovalSteps>;
  processingId: string;
  userId?: string | null;
  kind: "deposit" | "depositRefund";
  onAction: (target: ApprovalCommentTarget) => void;
  headerAction?: ReactNode;
}) {
  return (
    <section className="bg-white">
      <div className="flex items-center justify-between border-b border-[#e6eaf0] px-5 py-3.5">
        <div>
          <h4 className="text-sm font-semibold text-[#182230]">审批节点</h4>
          <p className="mt-0.5 text-xs text-[#667085]">按流程顺序展示审批人和处理记录</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {headerAction}
          <span className="text-xs tabular-nums text-[#667085]">共 {nodeGroups.length} 个节点</span>
        </div>
      </div>

      <div className="px-5 py-1">
        {nodeGroups.map((group, index) => {
          const nodeStatus = getApprovalNodeStatus(group.steps);
          const nodeMeta = getApprovalStatusMeta(nodeStatus);
          const NodeIcon = nodeMeta.icon;
          const approveMode = group.steps[0]?.approve_mode === "all" ? "全部人审批" : "任一人审批";
          const isCurrentNode = nodeStatus === "pending";

          return (
            <div key={`${group.sortOrder}-${group.nodeName}`} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <div className="relative flex justify-center pt-4">
                <span className={`z-10 flex h-7 w-7 items-center justify-center rounded-full text-white ring-4 ring-white ${nodeMeta.dotClassName}`}>
                  <NodeIcon className="h-3.5 w-3.5" />
                </span>
                {index < nodeGroups.length - 1 && <span className="absolute bottom-0 top-10 w-px bg-[#dfe5ed]" />}
              </div>

              <div className={`border-b border-[#edf0f4] py-4 ${index === nodeGroups.length - 1 ? "border-b-0" : ""}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#182230]">{index + 1}. {group.nodeName}</span>
                    <span className={`inline-flex min-h-[22px] items-center rounded-[7px] border px-2 text-xs font-medium ${nodeMeta.className}`}>{nodeMeta.label}</span>
                  </div>
                  <span className="text-xs text-[#667085]">{approveMode}</span>
                </div>

                <div className={`divide-y divide-[#e8edf3] border-y border-[#e8edf3] ${isCurrentNode ? "bg-[#f3f7ff]" : "bg-[#f8fafc]"}`}>
                  {group.steps.map((step: any) => {
                    const stepMeta = getApprovalStatusMeta(step.status);
                    const canHandleCurrentStep = step.status === "pending" && step.approver_id === userId;
                    const approveLoading = processingId === step.id + "approve";
                    const rejectLoading = processingId === step.id + "reject";
                    const timingText = step.action_at
                      ? `处理时间 ${formatDateTime(step.action_at)}`
                      : step.status === "pending"
                        ? "等待当前审批人处理"
                        : "尚未到达该审批人";

                    return (
                      <div key={step.id} className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <ApprovalUserAvatar name={step.approver_name} avatar={step.approver_avatar} size="sm" pending={step.status === "pending"} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[13px] font-semibold text-[#182230]">{step.approver_name || "审批人"}</p>
                              <span className={`inline-flex min-h-[22px] items-center rounded-[7px] border px-2 text-xs font-medium ${stepMeta.className}`}>{stepMeta.label}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-[#667085]">{timingText}</p>
                            <ApprovalSignaturePreview step={step} compact />
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
                              onClick={() => onAction({ kind, stepId: step.id, action: "reject" })}
                              disabled={Boolean(processingId) || !step.can_reject}
                              className="inline-flex h-8 items-center justify-center rounded-[8px] border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {rejectLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                              驳回
                            </button>
                            <button
                              type="button"
                              onClick={() => onAction({ kind, stepId: step.id, action: "approve" })}
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
  );
}

function normalizeRoomPart(value: string | null | undefined, suffixes: string[]) {
  const cleaned = value?.trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

function buildCustomerRoomNumber(customer?: any) {
  if (!customer) return "";
  if (customer.no_room_number === true || customer.no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(customer.building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(customer.unit_no, ["单元"]);
  const room = normalizeRoomPart(customer.room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

function getCustomerRoomDisplay(customer?: any) {
  if (!customer) return "";
  const community = customer.address?.trim();
  const houseAddress = customer.house_address?.trim();
  const roomNumber = buildCustomerRoomNumber(customer);
  if (community && roomNumber && roomNumber !== "暂无房号") return `${community}${roomNumber}`;
  if (houseAddress && houseAddress !== community) return houseAddress;
  return community || houseAddress || customer.area?.trim() || "";
}

function getCustomerProjectAddress(customer?: any, project?: any) {
  return getCustomerRoomDisplay(customer) || project?.address?.trim?.() || customer?.area?.trim?.() || "";
}

type ContractForm = {
  id: string;
  resign_source_contract_id: string;
  contract_type: string;
  contract_template_id: string;
  title: string;
  contract_no: string;
  quotation_id: string;
  status: string;
  signed_at: string;
  party_a_name: string;
  party_a_contact: string;
  party_a_phone: string;
  party_a_id_no: string;
  party_b_name: string;
  party_b_contact: string;
  party_b_phone: string;
  party_b_license: string;
  project_address: string;
  project_area: string;
  planned_start: string;
  planned_end: string;
  duration_days: string;
  weekend_construction: boolean;
  holiday_construction: boolean;
  construction_scope: string;
  construction_terms: string;
  quality_standard: string;
  warranty_terms: string;
  total_amount: string;
  deposit_deducted: boolean;
  deposit_deduct_amount: string;
  payment_scheme_id: string;
  attachments: CustomerAttachment[];
  remarks: string;
};

type ContractRequiredFieldKey =
  | "contract_type"
  | "title"
  | "contract_no"
  | "party_a_name"
  | "party_a_phone"
  | "party_b_name"
  | "party_b_contact"
  | "project_address"
  | "planned_start"
  | "duration_days"
  | "planned_end"
  | "construction_scope"
  | "quotation_id"
  | "total_amount"
  | "deposit_deduct_amount"
  | "payment_scheme_id";

function defaultDepositForm(receiverName = "", recordType: "deposit" | "design_fee" = "deposit", designFeeRate = 3, designFeeArea: number | string = "") {
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
    deposit_type: isDesignFee ? "设计费" : "设计定金",
    is_refundable: true,
    receiver_name: receiverName,
    voucher_url: "",
    notes: isDesignFee ? "设计费独立收取，不抵扣工程款。" : "",
  };
}

function defaultContractForm(customer?: any, project?: any, company?: any, schemeId = ""): ContractForm {
  const customerName = customer?.name || "客户";
  const address = getCustomerProjectAddress(customer, project);
  return {
    id: "",
    resign_source_contract_id: "",
    contract_type: "装修施工合同",
    contract_template_id: "",
    title: `${customerName}${address ? `-${address}` : ""}装修施工合同`,
    contract_no: makeContractNo(),
    quotation_id: "",
    status: "DRAFT",
    signed_at: new Date().toISOString().slice(0, 10),
    party_a_name: customer?.name || "",
    party_a_contact: customer?.name || "",
    party_a_phone: customer?.phone || "",
    party_a_id_no: "",
    party_b_name: company?.legalCompanyName || company?.name || "",
    party_b_contact: company?.managerName || "",
    party_b_phone: company?.contactPhone || company?.phone || "",
    party_b_license: company?.businessLicenseNo || "",
    project_address: address,
    project_area: String(project?.area || customer?.area_size || ""),
    planned_start: "",
    planned_end: "",
    duration_days: "",
    weekend_construction: false,
    holiday_construction: false,
    construction_scope: "按双方确认的设计方案、预算报价及施工图纸执行。",
    construction_terms: "乙方应按约定工期组织施工，因甲方变更、材料确认延迟或不可抗力导致延期的，工期相应顺延。",
    quality_standard: "工程质量按国家、地方及行业现行住宅装饰装修验收规范执行。",
    warranty_terms: "基础工程按合同约定保修，隐蔽工程和防水工程按国家及公司标准执行。",
    total_amount: "",
    deposit_deducted: true,
    deposit_deduct_amount: "",
    payment_scheme_id: schemeId,
    attachments: [],
    remarks: "",
  };
}

function contractRecordToForm(contract: ContractRecord): ContractForm {
  const content = contract.content || {};
  const partyA = content.party_a || {};
  const partyB = content.party_b || {};
  const projectInfo = content.project_info || {};
  const amountInfo = content.amount_info || {};
  const constructionTerms = content.construction_terms || {};
  return {
    id: contract.id,
    resign_source_contract_id: content.resign_source_contract_id || "",
    contract_type: content.contract_type || "装修施工合同",
    contract_template_id: content.contract_template_id || content.document_snapshot?.template_id || "",
    title: contract.title || "",
    contract_no: contract.contract_no || "",
    quotation_id: amountInfo.quotation_id || content.quotation_id || "",
    status: contract.status || "DRAFT",
    signed_at: contract.signed_at || "",
    party_a_name: partyA.name || "",
    party_a_contact: partyA.contact || "",
    party_a_phone: partyA.phone || "",
    party_a_id_no: partyA.id_no || "",
    party_b_name: partyB.name || "",
    party_b_contact: partyB.contact || "",
    party_b_phone: partyB.phone || "",
    party_b_license: partyB.license_no || "",
    project_address: projectInfo.address || "",
    project_area: projectInfo.area ? String(projectInfo.area) : "",
    planned_start: projectInfo.planned_start || "",
    planned_end: projectInfo.planned_end || "",
    duration_days: projectInfo.duration_days ? String(projectInfo.duration_days) : "",
    weekend_construction: Boolean(projectInfo.weekend_construction),
    holiday_construction: Boolean(projectInfo.holiday_construction),
    construction_scope: projectInfo.construction_scope || "",
    construction_terms: constructionTerms.schedule || "",
    quality_standard: constructionTerms.quality || "",
    warranty_terms: constructionTerms.warranty || "",
    total_amount: String(contract.total_amount || amountInfo.total_amount || ""),
    deposit_deducted: Boolean(amountInfo.deposit_deducted),
    deposit_deduct_amount: amountInfo.deposit_deduct_amount ? String(amountInfo.deposit_deduct_amount) : "",
    payment_scheme_id: amountInfo.payment_scheme_id || "",
    attachments: Array.isArray(content.attachments) ? content.attachments : [],
    remarks: content.remarks || "",
  };
}

function makeContractNo(prefix = "HT") {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = String(now.getTime()).slice(-5);
  return `${prefix}${datePart}${suffix}`;
}

// ========== Page Component ==========
function CustomerDetailPageContent() {
  const { user } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState("info");
  const [followForm, setFollowForm] = useState({ type: "电话", content: "", next_date: "", scene: "", attachments: [] as CustomerAttachment[] });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const followupTimelineScrollRef = useRef<HTMLDivElement>(null);
  const pendingFollowupScrollTopRef = useRef(false);
  const followAttachmentInputRef = useRef<HTMLInputElement>(null);
  const measureInputRef = useRef<HTMLInputElement>(null);
  const designInputRef = useRef<HTMLInputElement>(null);
  const customerDetailContentRef = useRef<HTMLDivElement | null>(null);
  const [customerDetailContentHeight, setCustomerDetailContentHeight] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionMenuPosition, setMentionMenuPosition] = useState({ top: 12, left: 12, width: 320 });
  const [replyingToFollowup, setReplyingToFollowup] = useState<{ id: string; user_name?: string | null; content: string } | null>(null);
  const [followSubmitting, setFollowSubmitting] = useState(false);
  const [followAttachmentUploading, setFollowAttachmentUploading] = useState(false);
  const [followAttachmentMessage, setFollowAttachmentMessage] = useState("");
  const [deletingFollowupId, setDeletingFollowupId] = useState("");
  const [followupDeleteTarget, setFollowupDeleteTarget] = useState<any>(null);
  const [followupDeleteError, setFollowupDeleteError] = useState("");
  const [showFollowupTemplates, setShowFollowupTemplates] = useState(false);
  const [showCustomerEditModal, setShowCustomerEditModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState(customerActionOptions.LOST[0] || "");
  const [lostRemark, setLostRemark] = useState("");
  const [lostSubmitting, setLostSubmitting] = useState(false);
  const [lostMessage, setLostMessage] = useState("");
  const [showRecoverModal, setShowRecoverModal] = useState(false);
  const [recoverRemark, setRecoverRemark] = useState("");
  const [recoverSubmitting, setRecoverSubmitting] = useState(false);
  const [recoverMessage, setRecoverMessage] = useState("");

  const [manualTeam, setManualTeam] = useState<any[]>([]);
  const [designerAssignmentMode, setDesignerAssignmentMode] = useState<"direct" | "approval" | "dispatch" | "loading">("loading");
  const [designerAssignmentDispatcherLabel, setDesignerAssignmentDispatcherLabel] = useState("客户所属门店负责人");
  const [designerAssignmentRequest, setDesignerAssignmentRequest] = useState<any>(null);
  const [teamMessage, setTeamMessage] = useState("");
  const [showDesignerRequestModal, setShowDesignerRequestModal] = useState(false);
  const [showDesignerAssignmentFlow, setShowDesignerAssignmentFlow] = useState(false);
  const [showDesignerDispatchModal, setShowDesignerDispatchModal] = useState(false);
  const [preferredDesignerId, setPreferredDesignerId] = useState("");
  const [dispatchHandlerId, setDispatchHandlerId] = useState("");
  const [dispatchPickerQuery, setDispatchPickerQuery] = useState("");
  const [dispatchPickerMembers, setDispatchPickerMembers] = useState<TeamPickerMember[]>([]);
  const [dispatchPickerTotal, setDispatchPickerTotal] = useState(0);
  const [dispatchPickerHasMore, setDispatchPickerHasMore] = useState(false);
  const [dispatchPickerLoading, setDispatchPickerLoading] = useState(false);
  const [dispatchPickerError, setDispatchPickerError] = useState("");
  const [dispatchingDesignerRequest, setDispatchingDesignerRequest] = useState(false);
  const [assignModalRole, setAssignModalRole] = useState<string | null>(null);
  const [assignSelectedUserId, setAssignSelectedUserId] = useState("");
  const [teamPickerQuery, setTeamPickerQuery] = useState("");
  const [teamPickerRoleFilter, setTeamPickerRoleFilter] = useState("ALL");
  const [teamPickerMembers, setTeamPickerMembers] = useState<TeamPickerMember[]>([]);
  const [teamPickerTotal, setTeamPickerTotal] = useState(0);
  const [teamPickerHasMore, setTeamPickerHasMore] = useState(false);
  const [teamPickerLoading, setTeamPickerLoading] = useState(false);
  const [teamPickerError, setTeamPickerError] = useState("");
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);
  const [customRoleName, setCustomRoleName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [teamRemovalTarget, setTeamRemovalTarget] = useState<{ role: string; memberName: string; roleLabel: string } | null>(null);
  const [teamRemovalError, setTeamRemovalError] = useState("");
  const [teamRemoving, setTeamRemoving] = useState(false);
  const [branchCollectionRules, setBranchCollectionRules] = useState<BranchCollectionRules | null>(null);
  const [depositRecords, setDepositRecords] = useState<DepositRecord[]>([]);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositUploading, setDepositUploading] = useState(false);
  const [depositMessage, setDepositMessage] = useState("");
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositMode, setDepositMode] = useState<"manual" | "qr">("manual");
  const [depositForm, setDepositForm] = useState(defaultDepositForm());
  const [paymentRecordFilter, setPaymentRecordFilter] = useState("all");
  const [depositVoucherByMode, setDepositVoucherByMode] = useState<{ manual: string; qr: string }>({ manual: "", qr: "" });
  const [depositVoucherQrOpen, setDepositVoucherQrOpen] = useState(false);
  const [depositVoucherLinkCopied, setDepositVoucherLinkCopied] = useState(false);
  const [depositVoucherSyncing, setDepositVoucherSyncing] = useState(false);
  const [editingDepositId, setEditingDepositId] = useState<string | null>(null);
  const [depositApprovalDetailRecord, setDepositApprovalDetailRecord] = useState<DepositRecord | null>(null);
  const [depositApprovalFlowView, setDepositApprovalFlowView] = useState<"initial" | "top_up" | "waiver">("initial");
  const [selectedTopUpApprovalId, setSelectedTopUpApprovalId] = useState("");
  const [selectedWaiverApprovalId, setSelectedWaiverApprovalId] = useState("");
  const [depositApprovalProcessingId, setDepositApprovalProcessingId] = useState("");
  const [refundApprovalDetailRecord, setRefundApprovalDetailRecord] = useState<DepositRecord | null>(null);
  const [refundApprovalProcessingId, setRefundApprovalProcessingId] = useState("");
  const [refundModalRecord, setRefundModalRecord] = useState<DepositRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const [paymentLedgerRecord, setPaymentLedgerRecord] = useState<DepositRecord | null>(null);
  const [topUpModalRecord, setTopUpModalRecord] = useState<DepositRecord | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpReceivedAt, setTopUpReceivedAt] = useState("");
  const [topUpPaymentChannel, setTopUpPaymentChannel] = useState("微信");
  const [topUpReceiverName, setTopUpReceiverName] = useState("");
  const [topUpVoucherUrl, setTopUpVoucherUrl] = useState("");
  const [topUpNotes, setTopUpNotes] = useState("");
  const [topUpSaving, setTopUpSaving] = useState(false);
  const [topUpUploading, setTopUpUploading] = useState(false);
  const [waiverModalRecord, setWaiverModalRecord] = useState<DepositRecord | null>(null);
  const [waiverAmount, setWaiverAmount] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [waiverNotes, setWaiverNotes] = useState("");
  const [waiverSaving, setWaiverSaving] = useState(false);

  useEffect(() => {
    if (!depositMessage) return;
    const timer = window.setTimeout(() => setDepositMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [depositMessage]);

  useEffect(() => {
    if (depositApprovalFlowView === "top_up" && depositApprovalDetailRecord && !(depositApprovalDetailRecord.top_up_approvals || []).some((approval) => approval.id === selectedTopUpApprovalId)) {
      setDepositApprovalFlowView("initial");
      setSelectedTopUpApprovalId("");
    }
  }, [depositApprovalDetailRecord, depositApprovalFlowView, selectedTopUpApprovalId]);

  useEffect(() => {
    if (depositApprovalFlowView === "waiver" && depositApprovalDetailRecord && !(depositApprovalDetailRecord.waiver_approvals || []).some((approval) => approval.id === selectedWaiverApprovalId)) {
      setDepositApprovalFlowView("initial");
      setSelectedWaiverApprovalId("");
    }
  }, [depositApprovalDetailRecord, depositApprovalFlowView, selectedWaiverApprovalId]);

  const [customerFiles, setCustomerFiles] = useState<CustomerAttachment[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [previewFile, setPreviewFile] = useState<CustomerAttachment | null>(null);
  const [selectedMeasureAttachmentType, setSelectedMeasureAttachmentType] = useState(measureAttachmentTypes[0].key);
  const [measureViewFilter, setMeasureViewFilter] = useState("ALL");
  const [measureDialog, setMeasureDialog] = useState<"qr" | "requirements" | null>(null);
  const [measureLinkCopied, setMeasureLinkCopied] = useState(false);
  const [customerFileDeleteTarget, setCustomerFileDeleteTarget] = useState<CustomerAttachment | null>(null);
  const [customerFileDeleting, setCustomerFileDeleting] = useState(false);
  const [customerFileDeleteError, setCustomerFileDeleteError] = useState("");
  const [selectedDesignAttachmentType, setSelectedDesignAttachmentType] = useState(designAttachmentTypes[0].key);
  const [designViewFilter, setDesignViewFilter] = useState("ALL");
  const [designDialog, setDesignDialog] = useState<"qr" | "requirements" | null>(null);
  const [designLinkCopied, setDesignLinkCopied] = useState(false);
  const [showDesignLinkModal, setShowDesignLinkModal] = useState(false);
  const [designLinkForm, setDesignLinkForm] = useState({ name: "", url: "", type: "效果图/全景图" });
  const [designLinkSaving, setDesignLinkSaving] = useState(false);
  const contractFileInputRef = useRef<HTMLInputElement>(null);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractMessage, setContractMessage] = useState("");
  const [quotationMessage, setQuotationMessage] = useState("");
  const [quotationActionId, setQuotationActionId] = useState("");
  const [quotationCopiedLinkId, setQuotationCopiedLinkId] = useState("");
  const [quotationNotesTarget, setQuotationNotesTarget] = useState<any | null>(null);
  const [quotationNotesDraft, setQuotationNotesDraft] = useState("");
  const [quotationCopyTarget, setQuotationCopyTarget] = useState<any | null>(null);
  const [quotationDeleteTarget, setQuotationDeleteTarget] = useState<any | null>(null);
  const [operationLogs, setOperationLogs] = useState<CustomerOperationLog[]>([]);
  const [operationLogsLoading, setOperationLogsLoading] = useState(false);
  const [operationLogsError, setOperationLogsError] = useState("");
  const [lifecycleCompletions, setLifecycleCompletions] = useState<Record<string, LifecycleCompletion>>({});
  const [lifecycleCompletionsLoading, setLifecycleCompletionsLoading] = useState(false);
  const [lifecycleCompletionsError, setLifecycleCompletionsError] = useState("");
  const [selectedLifecycleStageKey, setSelectedLifecycleStageKey] = useState("");

  useEffect(() => {
    if (!quotationMessage) return;
    const timer = window.setTimeout(() => setQuotationMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [quotationMessage]);

  const [showContractModal, setShowContractModal] = useState(false);
  const [approvalDetailContract, setApprovalDetailContract] = useState<ContractRecord | null>(null);
  const [summaryContract, setSummaryContract] = useState<ContractRecord | null>(null);
  const [approvalProcessingId, setApprovalProcessingId] = useState("");
  const [signatureApprovalTarget, setSignatureApprovalTarget] = useState<ApprovalCommentTarget | null>(null);
  const [contractDeletingId, setContractDeletingId] = useState("");
  const [contractStep, setContractStep] = useState(0);
  const [contractOpening, setContractOpening] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractForm, setContractForm] = useState<ContractForm>(() => defaultContractForm());
  const [contractMissingFields, setContractMissingFields] = useState<Partial<Record<ContractRequiredFieldKey, number>>>({});
  const [paymentSchemes, setPaymentSchemes] = useState<PaymentSchemeOption[]>([]);
  const [contractTemplates, setContractTemplates] = useState<ContractTemplateOption[]>([]);
  const [contractFormalQuotations, setContractFormalQuotations] = useState<any[]>([]);
  const [contractDepositTotal, setContractDepositTotal] = useState(0);
  const [contractProject, setContractProject] = useState<any>(null);
  const [branchBasicInfo, setBranchBasicInfo] = useState<any>(null);
  const [latestQuotation, setLatestQuotation] = useState<any>(null);
  const { data: customer, isLoading: custLoading, refetch: refetchCustomer } = useCustomer(id);
  const { data: projects, isLoading: projLoading, refetch: refetchProjects } = useProjects();
  const { data: followups, isLoading: fuLoading, refetch: refetchFollowups } = useFollowups(id);
  const { data: quotations, refetch: refetchQuotations } = useQuotations();

  const refreshCustomerProgress = async () => {
    await Promise.all([refetchCustomer(), refetchProjects()]);
  };

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && tabs.some((item) => item.key === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    const updateContentHeight = () => {
      const element = customerDetailContentRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const computedHeight = Number.parseFloat(window.getComputedStyle(element).height);
      const visualScale = computedHeight > 0 && rect.height > 0 ? rect.height / computedHeight : 1;
      const availableHeight = window.innerHeight - rect.top - 16;
      const nextHeight = Math.max(480, Math.floor(availableHeight / Math.max(visualScale, 0.5)));

      setCustomerDetailContentHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    };

    const frame = window.requestAnimationFrame(updateContentHeight);
    const timer = window.setTimeout(updateContentHeight, 120);
    window.addEventListener("resize", updateContentHeight);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateContentHeight);
    };
  }, [activeTab, paymentRecordFilter, custLoading, projLoading]);

  // Fetch manual team assignments
  useEffect(() => {
    if (!id) return;
    fetch(`/api/customers/${id}/team`)
      .then((response) => response.json())
      .then((data) => setManualTeam(Array.isArray(data) ? data : []))
      .catch(() => setManualTeam([]));
    setDesignerAssignmentMode("loading");
    fetch(`/api/customers/${id}/branch-settings`)
      .then(r => r.json())
      .then((data) => {
        const assignmentMode = data?.businessRules?.designerAssignmentMode;
        setDesignerAssignmentMode(assignmentMode === "dispatch" ? "dispatch" : assignmentMode === "approval" ? "approval" : "direct");
        setDesignerAssignmentDispatcherLabel(getDesignerAssignmentDispatcherLabel(data?.businessRules?.designerAssignmentDispatcher?.source));
        setBranchCollectionRules({
          paymentQrCodeUrl: data?.collectionRules?.paymentQrCodeUrl || "",
          paymentQrCodeName: data?.collectionRules?.paymentQrCodeName || "",
          paymentAccountName: data?.collectionRules?.paymentAccountName || "",
          paymentQrNote: data?.collectionRules?.paymentQrNote || "",
          designFeeRate: Number(data?.charging?.designFeeRate || 3),
        });
      })
      .catch(() => {
        setDesignerAssignmentMode("direct");
        setDesignerAssignmentDispatcherLabel("客户所属门店负责人");
        setBranchCollectionRules(null);
      });
    const token = localStorage.getItem("zxgj_token");
    fetch(`/api/customers/${id}/designer-assignment`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((data) => setDesignerAssignmentRequest(data?.request || null))
      .catch(() => setDesignerAssignmentRequest(null));
  }, [id]);

  const fetchDepositRecords = useCallback(async () => {
    if (!id) return [];
    setDepositLoading(true);
    try {
      const data = await fetch(`/api/customers/${id}/deposits`).then((r) => r.json());
      const records = Array.isArray(data) ? data : [];
      setDepositRecords(records);
      return records;
    } catch {
      setDepositRecords([]);
      return [];
    } finally {
      setDepositLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== "deposit") return;
    fetchDepositRecords();
  }, [activeTab, fetchDepositRecords, id]);

  const fetchCustomerFiles = useCallback(async () => {
    if (!id) return;
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/upload?customer_id=${encodeURIComponent(id)}`, { headers: getClientAuthHeaders() });
      const data = await res.json();
      setCustomerFiles(Array.isArray(data) ? data : []);
    } catch {
      setCustomerFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || (activeTab !== "measure" && activeTab !== "design")) return;
    setAttachmentMessage("");
    fetchCustomerFiles();
  }, [activeTab, fetchCustomerFiles, id]);

  const handleCustomerFileUpload = async (category: string, input?: File | File[] | FileList | null) => {
    const selectedFiles = input instanceof FileList ? Array.from(input) : Array.isArray(input) ? input : input ? [input] : [];
    if (selectedFiles.length === 0) return;
    setUploadingCategory(category);
    setAttachmentMessage("");
    try {
      const uploaded: CustomerAttachment[] = [];
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("customer_id", id);
        formData.append("category", category);
        const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "上传失败");
        if (data?.id && data?.file_url) uploaded.push(data);
      }
      if (uploaded.length > 0) {
        const uploadedIds = new Set(uploaded.map((item) => item.id));
        setCustomerFiles((prev) => [...uploaded, ...prev.filter((item) => !uploadedIds.has(item.id))]);
      } else {
        await fetchCustomerFiles();
      }
      setAttachmentMessage(`${formatAttachmentCategory(category)}已上传${selectedFiles.length > 1 ? ` ${selectedFiles.length} 个文件` : ""}`);
      await refreshCustomerProgress();
    } catch (err: any) {
      setAttachmentMessage(err.message || "上传失败");
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleSaveDesignLink = async () => {
    if (!designLinkForm.url.trim()) {
      setAttachmentMessage("请填写效果图链接");
      return;
    }
    setDesignLinkSaving(true);
    setAttachmentMessage("");
    try {
      const formData = new FormData();
      formData.append("customer_id", id);
      formData.append("category", makeDesignCategory(designLinkForm.type));
      formData.append("link_name", designLinkForm.name.trim() || "效果图链接");
      formData.append("link_url", designLinkForm.url.trim());
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "保存失败");
      if (data?.id && data?.file_url) {
        setCustomerFiles((prev) => [data, ...prev.filter((item) => item.id !== data.id)]);
      } else {
        await fetchCustomerFiles();
      }
      setDesignLinkForm({ name: "", url: "", type: "效果图/全景图" });
      setShowDesignLinkModal(false);
      setAttachmentMessage("效果图链接已添加");
      await refreshCustomerProgress();
    } catch (err: any) {
      setAttachmentMessage(err.message || "保存失败");
    } finally {
      setDesignLinkSaving(false);
    }
  };

  const requestDeleteCustomerFile = (fileId: string) => {
    const file = customerFiles.find((item) => item.id === fileId);
    if (!file) return;
    setCustomerFileDeleteError("");
    setCustomerFileDeleteTarget(file);
  };

  const closeCustomerFileDeleteConfirm = () => {
    if (customerFileDeleting) return;
    setCustomerFileDeleteError("");
    setCustomerFileDeleteTarget(null);
  };

  const handleDeleteCustomerFile = async () => {
    const fileId = customerFileDeleteTarget?.id;
    if (!fileId) return;
    setCustomerFileDeleting(true);
    setCustomerFileDeleteError("");
    try {
      const res = await fetch(`/api/upload?id=${encodeURIComponent(fileId)}`, { method: "DELETE", headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "删除失败");
      setCustomerFiles((prev) => prev.filter((file) => file.id !== fileId));
      setCustomerFileDeleteTarget(null);
      setAttachmentMessage("文件已删除");
      await refreshCustomerProgress();
    } catch (err: any) {
      setCustomerFileDeleteError(err.message || "删除失败，请稍后重试");
    } finally {
      setCustomerFileDeleting(false);
    }
  };

  const handleCopyMeasureUploadLink = async () => {
    try {
      await navigator.clipboard.writeText(measureUploadUrl);
      setMeasureLinkCopied(true);
      window.setTimeout(() => setMeasureLinkCopied(false), 1800);
    } catch {
      setAttachmentMessage("复制失败，请使用二维码上传");
    }
  };

  const handleCopyDesignUploadLink = async () => {
    try {
      await navigator.clipboard.writeText(designUploadUrl);
      setDesignLinkCopied(true);
      window.setTimeout(() => setDesignLinkCopied(false), 1800);
    } catch {
      setAttachmentMessage("复制失败，请使用二维码上传");
    }
  };

  const handleCopyDepositVoucherUploadLink = async () => {
    try {
      await navigator.clipboard.writeText(depositVoucherUploadUrl);
      setDepositVoucherLinkCopied(true);
      window.setTimeout(() => setDepositVoucherLinkCopied(false), 1800);
    } catch {
      setDepositMessage("复制失败，请使用二维码上传");
    }
  };

  const syncLatestDepositVoucher = useCallback(async (silent = false) => {
    if (!id) return false;
    if (!silent) setDepositVoucherSyncing(true);
    try {
      const res = await fetch(`/api/upload?customer_id=${encodeURIComponent(id)}`, { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "获取上传凭证失败");
      const latestVoucher = (Array.isArray(data) ? data : [])
        .filter((file) => String(file?.category || "") === DEPOSIT_VOUCHER_CATEGORY && file?.file_url)
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
      if (!latestVoucher?.file_url) {
        if (!silent) setDepositMessage("还没有检测到手机上传的收款凭证");
        return false;
      }
      setCustomerFiles(Array.isArray(data) ? data : []);
      setDepositVoucherByMode((prev) => ({ ...prev, [depositMode]: latestVoucher.file_url || "" }));
      setDepositForm((prev) => ({ ...prev, voucher_url: latestVoucher.file_url || "" }));
      setDepositMessage("已同步手机上传的收款凭证");
      setDepositVoucherQrOpen(false);
      setDepositVoucherLinkCopied(false);
      return true;
    } catch (err: any) {
      if (!silent) setDepositMessage(err?.message || "获取上传凭证失败");
      return false;
    } finally {
      if (!silent) setDepositVoucherSyncing(false);
    }
  }, [depositMode, id]);

  useEffect(() => {
    if (!depositVoucherQrOpen) return;
    const timer = window.setInterval(() => {
      syncLatestDepositVoucher(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [depositVoucherQrOpen, syncLatestDepositVoucher]);

  const handlePreviewCustomerFile = (file: CustomerAttachment) => {
    if (isLinkAttachment(file) && !isImageAttachment(file) && !isPdfAttachment(file)) {
      window.open(file.file_url, "_blank", "noopener,noreferrer");
      return;
    }
    setPreviewFile(file);
  };

  const fetchContracts = useCallback(async () => {
    if (!id) return;
    setContractsLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}/contracts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "加载合同失败");
      const schemes = Array.isArray(data.paymentSchemes) ? data.paymentSchemes : [];
      setContracts(Array.isArray(data.contracts) ? data.contracts : []);
      setPaymentSchemes(schemes);
      setContractTemplates(Array.isArray(data.contractTemplates) ? data.contractTemplates : []);
      setContractFormalQuotations(Array.isArray(data.formalQuotations) ? data.formalQuotations : []);
      setContractDepositTotal(Number(data.depositTotal || 0));
      setContractProject(data.project || null);
      setBranchBasicInfo(data.branchBasicInfo || null);
      setLatestQuotation(data.latestQuotation || null);
      return data;
    } catch (err: any) {
      setContractMessage(err.message || "加载合同失败");
      return null;
    } finally {
      setContractsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== "contract") return;
    fetchContracts();
  }, [activeTab, fetchContracts, id]);

  const fetchOperationLogs = useCallback(async () => {
    if (!id) return;
    setOperationLogsLoading(true);
    setOperationLogsError("");
    try {
      const data = await api.get<CustomerOperationLog[]>(`/api/customers/${id}/operation-logs`);
      setOperationLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setOperationLogs([]);
      setOperationLogsError(err.message || "加载操作记录失败");
    } finally {
      setOperationLogsLoading(false);
    }
  }, [id]);

  const fetchLifecycleCompletions = useCallback(async () => {
    if (!id) return;
    setLifecycleCompletionsLoading(true);
    setLifecycleCompletionsError("");
    try {
      const data = await api.get<LifecycleCompletion[]>(`/api/customers/${id}/lifecycle`);
      const completionMap = (Array.isArray(data) ? data : []).reduce<Record<string, LifecycleCompletion>>((result, item) => {
        if (item?.stage) result[item.stage] = item;
        return result;
      }, {});
      setLifecycleCompletions(completionMap);
    } catch (err: any) {
      setLifecycleCompletions({});
      setLifecycleCompletionsError(err.message || "加载生命周期记录失败");
    } finally {
      setLifecycleCompletionsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== "operations") return;
    fetchOperationLogs();
  }, [activeTab, fetchOperationLogs, id]);

  const selectedPaymentScheme = paymentSchemes.find((scheme) => scheme.id === contractForm.payment_scheme_id) || paymentSchemes.find((scheme) => scheme.isDefault) || paymentSchemes[0];
  const contractTotalAmount = Number(contractForm.total_amount || 0);
  const getMaxContractDepositDeduct = (totalAmount: number, depositTotal = contractDepositTotal) => {
    const safeTotal = Number.isFinite(totalAmount) ? Math.max(0, totalAmount) : 0;
    const safeDeposit = Number.isFinite(Number(depositTotal)) ? Math.max(0, Number(depositTotal)) : 0;
    return toMoney(Math.min(safeDeposit, safeTotal));
  };
  const normalizeContractDepositDeduct = (value: unknown, totalAmount: number, depositTotal = contractDepositTotal) => {
    const raw = Number(value || 0);
    const safeRaw = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    return toMoney(Math.min(safeRaw, getMaxContractDepositDeduct(totalAmount, depositTotal)));
  };
  const contractDepositDeductAmount = contractForm.deposit_deducted
    ? normalizeContractDepositDeduct(contractForm.deposit_deduct_amount, contractTotalAmount)
    : 0;
  const contractPayableAmount = Math.max(0, contractTotalAmount - contractDepositDeductAmount);
  const contractPaymentStages = (selectedPaymentScheme?.stages || []).map((stage) => ({
    ...stage,
    amount: toMoney(contractPayableAmount * Number(stage.ratio || 0) / 100),
  }));
  const contractPaymentRatioTotal = toMoney(contractPaymentStages.reduce((sum, stage) => sum + Number(stage.ratio || 0), 0));

  const getQuotationAmount = (quotation: any) => Number(quotation?.final_amount ?? quotation?.total_amount ?? 0);
  const getQuotationCostSummary = (quotation: any) => {
    const toSummaryAmount = (value: unknown) => {
      const amount = Number(value || 0);
      return Number.isFinite(amount) ? amount : 0;
    };
    const items = [
      { label: "基装", amount: toSummaryAmount(quotation?.base_amount) },
      { label: "主材", amount: toSummaryAmount(quotation?.main_material_amount) },
      { label: "扩展项", amount: toSummaryAmount(quotation?.custom_direct_amount) },
      { label: "综合费用", amount: toSummaryAmount(quotation?.other_amount), alwaysShow: true },
    ].filter((item) => item.alwaysShow || Math.abs(item.amount) >= 0.01);

    return items.map((item) => `${item.label}${formatPlainAmount(item.amount)}`).join("、");
  };
  const getTimeValue = (value: any) => parseAppDate(value)?.getTime() || 0;
  const customerQuotations = (quotations ?? [])
    .filter((quotation: any) => quotation.customer_id === id)
    .sort((a: any, b: any) => getTimeValue(b.updated_at || b.created_at) - getTimeValue(a.updated_at || a.created_at));
  const displayPaymentRecords = mergeDepositReceivableRecords(depositRecords);
  const filteredPaymentRecords = displayPaymentRecords.filter((record) => paymentRecordFilter === "all" || normalizePaymentRecordType(record.record_type) === paymentRecordFilter);
  const depositReceivableTotal = displayPaymentRecords.reduce((sum, record) => sum + getPaymentRecordReceivable(record), 0);
  const depositActualReceivedTotal = displayPaymentRecords.reduce((sum, record) => sum + getDepositActualReceivedAmount(record), 0);
  const depositWaivedTotal = displayPaymentRecords.reduce((sum, record) => sum + getDepositWaivedAmount(record), 0);
  const depositRefundedTotal = displayPaymentRecords.reduce((sum, record) => sum + getDepositRefundedAmount(record), 0);
  const pendingDepositApprovalCount = displayPaymentRecords.filter((record) => record.status === "pending_approval" || record.refund_status === "pending_approval" || record.waiver_status === "pending_approval" || (record.top_up_approvals || []).some((approval) => approval?.status === "pending") || (record.waiver_approvals || []).some((approval) => approval?.status === "pending")).length;
  const getPaymentRecordCount = (recordType: string) => recordType === "all"
    ? displayPaymentRecords.length
    : displayPaymentRecords.filter((record) => normalizePaymentRecordType(record.record_type) === recordType).length;
  const depositPagination = useDataPagination(filteredPaymentRecords, activeTab === "deposit" ? `${paymentRecordFilter}-${filteredPaymentRecords.length}` : "deposit");
  const quotationPagination = useDataPagination(customerQuotations, activeTab === "quotation" ? String(customerQuotations.length) : "quotation");
  const contractPagination = useDataPagination(contracts, activeTab === "contract" ? String(contracts.length) : "contract");
  const formalCustomerQuotations = customerQuotations.filter((quotation: any) => String(quotation.status || "").toUpperCase() === "APPROVED");
  const sentCustomerQuotationCount = customerQuotations.filter((quotation: any) => String(quotation.status || "").toUpperCase() === "SENT").length;
  const draftCustomerQuotationCount = customerQuotations.filter((quotation: any) => {
    const status = String(quotation.status || "").toUpperCase();
    return status !== "APPROVED" && status !== "SENT";
  }).length;
  const customerQuotationTotalAmount = customerQuotations.reduce((sum: number, quotation: any) => sum + getQuotationAmount(quotation), 0);
  const contractQuotationOptions = (contractFormalQuotations.length ? contractFormalQuotations : formalCustomerQuotations)
    .slice()
    .sort((a: any, b: any) => getTimeValue(b.updated_at || b.created_at) - getTimeValue(a.updated_at || a.created_at));
  const selectedContractQuotation = contractQuotationOptions.find((quotation: any) => quotation.id === contractForm.quotation_id) || null;
  const contractTemplateOptions = contractTemplates
    .filter((template) => template.contract_type === contractForm.contract_type && template.status === "published")
    .sort((a, b) => Number(b.is_default || 0) - Number(a.is_default || 0));
  const selectedContractTemplate = contractTemplateOptions.find((template) => template.id === contractForm.contract_template_id)
    || contractTemplateOptions.find((template) => template.is_default)
    || contractTemplateOptions[0]
    || null;
  const designFeeQuotationOptions = formalCustomerQuotations;
  const selectedDesignFeeQuotation = designFeeQuotationOptions.find((quotation: any) => quotation.id === depositForm.quotation_id) || null;

  const isContractRequiredFieldInvalid = (field: ContractRequiredFieldKey) => {
    switch (field) {
      case "contract_type":
        return !contractForm.contract_type;
      case "title":
        return !contractForm.title.trim();
      case "contract_no":
        return !contractForm.contract_no.trim();
      case "party_a_name":
        return !contractForm.party_a_name.trim();
      case "party_a_phone":
        return !contractForm.party_a_phone.trim();
      case "party_b_name":
        return !contractForm.party_b_name.trim();
      case "party_b_contact":
        return !contractForm.party_b_contact.trim();
      case "project_address":
        return !contractForm.project_address.trim();
      case "planned_start":
        return !contractForm.planned_start;
      case "duration_days": {
        const duration = Math.ceil(Number(contractForm.duration_days || 0));
        return !Number.isFinite(duration) || duration <= 0;
      }
      case "planned_end":
        return !contractForm.planned_end;
      case "construction_scope":
        return !contractForm.construction_scope.trim();
      case "quotation_id":
        return contractQuotationOptions.length === 0 || !contractForm.quotation_id || !selectedContractQuotation;
      case "total_amount":
        return !Number.isFinite(contractTotalAmount) || contractTotalAmount <= 0;
      case "deposit_deduct_amount":
        return Boolean(contractForm.deposit_deducted && contractDepositDeductAmount > contractTotalAmount);
      case "payment_scheme_id":
        return !contractForm.payment_scheme_id || contractPaymentStages.length === 0 || contractPaymentRatioTotal !== 100;
      default:
        return false;
    }
  };

  const isContractMissingFieldActive = (field: ContractRequiredFieldKey) => Boolean(contractMissingFields[field]) && isContractRequiredFieldInvalid(field);
  const contractRequiredFieldClassName = (field: ContractRequiredFieldKey, extraClassName = "") => [
    "input-field",
    isContractMissingFieldActive(field) ? "contract-required-field-missing" : "",
    extraClassName,
  ].filter(Boolean).join(" ");

  const markContractMissingFields = (fields: ContractRequiredFieldKey[]) => {
    if (fields.length === 0) return;
    const nextFields = fields.reduce<Partial<Record<ContractRequiredFieldKey, number>>>((result, field) => {
      result[field] = Date.now();
      return result;
    }, {});
    setContractMissingFields({});
    window.requestAnimationFrame(() => setContractMissingFields(nextFields));
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-contract-required-field="${fields[0]}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus?.({ preventScroll: true });
    }, 80);
  };

  const clearContractMissingFields = () => setContractMissingFields({});

  const printApprovalFlow = (params: {
    title: string;
    subtitle?: string;
    approval?: any;
    summary?: { label: string; value: string }[];
    reasonLabel?: string;
    reason?: string | null;
    onBlocked?: (message: string) => void;
  }) => {
    const printWindow = window.open("", "_blank", "width=980,height=860");
    if (!printWindow) {
      params.onBlocked?.("浏览器拦截了打印窗口，请允许弹窗后重试");
      return;
    }
    const approval = params.approval;
    const nodeGroups = groupApprovalSteps(approval?.steps);
    const statusText = approval ? getApprovalInstanceStatusText(approval.status) : "暂无审批";
    const printProject = relatedProjects[0] || contractProject || null;
    const projectAddress = getCustomerProjectAddress(customer, printProject);
    const printTitlePrefix = customerRoomDisplay || projectAddress || customerHouseAddress || "";
    const printTitle = printTitlePrefix && !params.title.includes(printTitlePrefix)
      ? `${printTitlePrefix} ${params.title}`
      : params.title;
    const roomNumber = customerRoomNumber || (customer?.no_room_number ? "暂无房号" : "");
    const getPrintStatusClass = (status?: string | null) => {
      const normalized = String(status || "").toLowerCase();
      if (normalized === "approved") return "status-approved";
      if (normalized === "rejected") return "status-rejected";
      if (normalized === "pending") return "status-pending";
      return "status-waiting";
    };
    const nodeRows = nodeGroups.length
      ? nodeGroups.map((group, index) => {
        const nodeStatus = getApprovalNodeStatus(group.steps);
        const nodeMeta = getApprovalStatusMeta(nodeStatus);
        const approveMode = group.steps[0]?.approve_mode === "all" ? "全部人审批" : "任一人审批";
        const stepRows = group.steps.map((step: any) => {
          const stepMeta = getApprovalStatusMeta(step.status);
          const signatureUrl = step.signature_url || step.signature_image_url;
          const signatureHtml = signatureUrl
            ? `<div class="signature-box"><img class="signature" src="${escapePrintHtml(signatureUrl)}" alt="审批签名" /></div>`
            : "";
          const actionText = step.action_at
            ? formatDateTime(step.action_at)
            : step.status === "pending"
              ? "等待当前审批人处理"
              : "尚未到达该审批人";
          return `
            <div class="approver-row">
              <div class="avatar">${escapePrintHtml(String(step.approver_name || "审").trim().slice(0, 1) || "审")}</div>
              <div class="approver-main">
                <div class="approver-head">
                  <strong>${escapePrintHtml(step.approver_name || "审批人")}</strong>
                  <span class="status-pill ${getPrintStatusClass(step.status)}">${escapePrintHtml(stepMeta.label)}</span>
                </div>
                <p class="time-text">${escapePrintHtml(actionText)}</p>
                ${signatureHtml}
                ${step.comment ? `<p class="comment">审批意见：${escapePrintHtml(step.comment)}</p>` : ""}
              </div>
            </div>
          `;
        }).join("");
        return `
          <section class="timeline-node">
            <div class="node-rail">
              <span class="node-dot ${getPrintStatusClass(nodeStatus)}">${nodeStatus === "approved" ? "✓" : nodeStatus === "rejected" ? "×" : nodeStatus === "pending" ? "…" : ""}</span>
              ${index < nodeGroups.length - 1 ? `<span class="node-line"></span>` : ""}
            </div>
            <div class="node-card">
              <div class="node-title">
                <div>
                  <strong>${index + 1}. ${escapePrintHtml(group.nodeName)}</strong>
                  <p>${escapePrintHtml(approveMode)}</p>
                </div>
                <span class="status-pill ${getPrintStatusClass(nodeStatus)}">${escapePrintHtml(nodeMeta.label)}</span>
              </div>
              <div class="approver-list">${stepRows}</div>
            </div>
          </section>
        `;
      }).join("")
      : `<div class="empty">审批流程暂无节点</div>`;
    const amountSummary = (params.summary || []).find((item) => /金额/.test(item.label));
    const detailBusinessRows = (params.summary || []).filter((item) => item !== amountSummary);
    const heroSummaryRows = [
      { label: "客户", value: customer?.name || "-" },
      { label: "房号", value: roomNumber || "-" },
      { label: amountSummary?.label || "审批金额", value: amountSummary?.value || "-" },
      { label: "审批状态", value: statusText },
    ];
    const detailSummaryRows = [
      { label: "联系电话", value: customer?.phone || "-" },
      { label: "小区/楼盘", value: customer?.address || customer?.area || "-" },
      ...detailBusinessRows,
      { label: "审批流程", value: approval?.flow_name || "-" },
      { label: "审批进度", value: approval ? `${approval.approved_nodes || 0}/${approval.total_nodes || 0}` : "-" },
    ];
    const addressSummaryHtml = `
      <div class="address-row"><span>完整地址</span><strong>${escapePrintHtml(projectAddress || customerRoomDisplay || customerHouseAddress || "-")}</strong></div>
    `;
    const heroSummaryHtml = heroSummaryRows.map((item) => `
      <div class="hero-cell"><span>${escapePrintHtml(item.label)}</span><strong>${escapePrintHtml(item.value)}</strong></div>
    `).join("");
    const paddedDetailSummaryRows = [
      ...detailSummaryRows,
      ...Array.from({ length: (3 - (detailSummaryRows.length % 3)) % 3 }, () => ({ label: "", value: "" })),
    ];
    const detailSummaryHtml = paddedDetailSummaryRows.map((item) => `
      <div class="detail-cell ${item.label ? "" : "is-empty"}"><span>${escapePrintHtml(item.label)}</span><strong>${escapePrintHtml(item.value)}</strong></div>
    `).join("");
    const reasonHtml = params.reason ? `
      <section class="reason">
        <span>${escapePrintHtml(params.reasonLabel || "原因")}</span>
        <p>${escapePrintHtml(params.reason)}</p>
      </section>
    ` : "";

    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapePrintHtml(printTitle)}</title>
        <style>
          * { box-sizing: border-box; }
          :root { --print-scale: 1; }
          body { margin: 0; background: #f3f6fa; color: #182230; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
          .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; max-width: 980px; margin: 18px auto 10px; padding: 10px 12px; border: 1px solid #dfe5ed; background: #fff; }
          .toolbar button { height: 34px; border: 1px solid #2f6feb; background: #2f6feb; color: #fff; padding: 0 14px; font-weight: 700; cursor: pointer; }
          .page { max-width: 980px; margin: 0 auto 24px; background: #fff; border: 1px solid #dfe5ed; padding: 28px; }
          header { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #182230; padding-bottom: 16px; }
          h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
          .subtitle { margin-top: 8px; color: #667085; font-size: 13px; }
          .doc-meta { color: #667085; font-size: 12px; line-height: 1.8; text-align: right; white-space: nowrap; }
          .section-title { margin: 22px 0 10px; font-size: 15px; font-weight: 800; color: #182230; }
          .business-card { border: 1px solid #dfe5ed; background: #fff; }
          .hero-summary { display: grid; grid-template-columns: 1.05fr 1fr 1fr 1fr; background: linear-gradient(180deg, #fbfdff 0%, #f6f9fe 100%); }
          .hero-cell { min-height: 74px; border-right: 1px solid #dfe5ed; padding: 14px 16px; }
          .hero-cell:last-child { border-right: 0; }
          .hero-cell span,
          .detail-cell span { display: block; color: #667085; font-size: 12px; }
          .hero-cell strong { display: block; margin-top: 7px; color: #182230; font-size: 18px; line-height: 1.35; word-break: break-word; }
          .hero-cell:nth-child(3) strong { color: #c4322b; font-variant-numeric: tabular-nums; }
          .hero-cell:nth-child(4) strong { color: #027a48; }
          .detail-summary { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid #dfe5ed; background: #fff; }
          .detail-cell { min-height: 54px; border-right: 1px solid #edf0f4; border-bottom: 1px solid #edf0f4; padding: 10px 16px; }
          .detail-cell:nth-child(3n) { border-right: 0; }
          .detail-cell strong { display: block; margin-top: 5px; color: #182230; font-size: 13px; line-height: 1.45; word-break: break-word; }
          .detail-cell.is-empty { color: transparent; }
          .address-row { border-top: 1px solid #dfe5ed; padding: 11px 16px; background: #fff; }
          .address-row span { display: block; color: #667085; font-size: 12px; }
          .address-row strong { display: block; margin-top: 5px; color: #182230; font-size: 14px; line-height: 1.5; word-break: break-word; }
          .reason { margin-top: 14px; border: 1px solid #dfe5ed; background: #f8fafc; padding: 12px; }
          .reason span { color: #667085; font-size: 12px; }
          .reason p { margin: 6px 0 0; white-space: pre-wrap; line-height: 1.7; }
          .timeline { margin-top: 8px; }
          .timeline-node { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; break-inside: avoid; }
          .node-rail { position: relative; display: flex; justify-content: center; padding-top: 14px; }
          .node-dot { position: relative; z-index: 1; display: flex; width: 24px; height: 24px; align-items: center; justify-content: center; border-radius: 999px; color: #fff; font-size: 13px; font-weight: 800; }
          .node-line { position: absolute; top: 38px; bottom: -12px; width: 1px; background: #dfe5ed; }
          .node-card { margin-bottom: 12px; border: 1px solid #dfe5ed; background: #fff; }
          .node-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 14px; background: #f8fafc; border-bottom: 1px solid #dfe5ed; }
          .node-title strong { font-size: 14px; }
          .node-title p { margin: 4px 0 0; color: #667085; font-size: 12px; }
          .status-pill { display: inline-flex; min-height: 22px; align-items: center; border: 1px solid currentColor; padding: 1px 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
          .status-approved { background: #ecfdf3; color: #027a48; }
          .status-rejected { background: #fef3f2; color: #b42318; }
          .status-pending { background: #edf4ff; color: #2f6feb; }
          .status-waiting { background: #f2f4f7; color: #667085; }
          .approver-list { padding: 0 14px; }
          .approver-row { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 10px; padding: 12px 0; border-bottom: 1px solid #edf0f4; }
          .approver-row:last-child { border-bottom: 0; }
          .avatar { display: flex; width: 30px; height: 30px; align-items: center; justify-content: center; border-radius: 999px; background: #edf4ff; color: #2f6feb; font-size: 12px; font-weight: 800; }
          .approver-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
          .approver-head strong { font-size: 13px; }
          .time-text { margin: 4px 0 0; color: #667085; font-size: 12px; }
          .comment { margin: 8px 0 0; border-left: 2px solid #cbd5e1; padding-left: 8px; color: #475467; font-size: 12px; line-height: 1.6; }
          .signature-box { margin-top: 8px; }
          .signature { display: block; max-width: 130px; max-height: 58px; object-fit: contain; }
          .empty { margin-top: 18px; border: 1px dashed #cbd5e1; padding: 32px; text-align: center; color: #667085; }
          @media print {
            @page { size: A4 portrait; margin: 8mm; }
            body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .toolbar { display: none; }
            .page { width: calc(100% / var(--print-scale)); max-width: none; margin: 0; border: 0; padding: 0; transform: scale(var(--print-scale)); transform-origin: top left; }
            header { padding-bottom: 9px; border-bottom-width: 1px; }
            h1 { font-size: 18px; }
            .subtitle { margin-top: 4px; font-size: 10px; }
            .doc-meta { font-size: 9px; line-height: 1.45; }
            .section-title { margin: 9px 0 5px; font-size: 11px; }
            .hero-cell { min-height: 42px; padding: 6px 8px; }
            .hero-cell span,
            .detail-cell span,
            .address-row span,
            .reason span { font-size: 8.5px; }
            .hero-cell strong { margin-top: 3px; font-size: 11px; line-height: 1.2; }
            .address-row { padding: 5px 8px; }
            .address-row strong { margin-top: 3px; font-size: 10px; line-height: 1.25; }
            .detail-cell { min-height: 35px; padding: 5px 8px; }
            .detail-cell strong { margin-top: 2px; font-size: 9.5px; line-height: 1.25; }
            .reason { margin-top: 6px; padding: 6px 8px; }
            .reason p { margin-top: 3px; font-size: 9px; line-height: 1.35; }
            .timeline { margin-top: 4px; }
            .timeline-node { grid-template-columns: 22px minmax(0, 1fr); gap: 7px; break-inside: avoid; page-break-inside: avoid; }
            .node-rail { padding-top: 8px; }
            .node-dot { width: 14px; height: 14px; font-size: 8px; }
            .node-line { top: 23px; bottom: -6px; }
            .node-card { margin-bottom: 6px; }
            .node-title { padding: 6px 8px; }
            .node-title strong { font-size: 9.5px; }
            .node-title p { margin-top: 2px; font-size: 8px; }
            .status-pill { min-height: 15px; padding: 0 5px; font-size: 8px; }
            .approver-list { padding: 0 8px; }
            .approver-row { grid-template-columns: 20px minmax(0, 1fr); gap: 6px; padding: 6px 0; }
            .avatar { width: 18px; height: 18px; font-size: 8px; }
            .approver-head { gap: 5px; }
            .approver-head strong { font-size: 9px; }
            .time-text { margin-top: 2px; font-size: 8px; }
            .comment { margin-top: 4px; padding-left: 5px; font-size: 8px; line-height: 1.3; }
            .signature-box { margin-top: 4px; }
            .signature { max-width: 72px; max-height: 28px; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar"><span>审批流打印预览</span><button onclick="window.print()">打印</button></div>
        <main class="page">
          <header>
            <div>
              <h1>${escapePrintHtml(printTitle)}</h1>
              ${params.subtitle ? `<div class="subtitle">${escapePrintHtml(params.subtitle)}</div>` : ""}
            </div>
            <div class="doc-meta">
              <div>打印时间：${escapePrintHtml(formatDateTime(new Date()))}</div>
              <div>打印人：${escapePrintHtml(user?.name || "-")}</div>
            </div>
          </header>
          <h2 class="section-title">业务信息</h2>
          <section class="business-card">
            <div class="hero-summary">${heroSummaryHtml}</div>
            ${addressSummaryHtml}
            <div class="detail-summary">${detailSummaryHtml}</div>
          </section>
          ${reasonHtml}
          <h2 class="section-title">审批节点</h2>
          <section class="timeline">${nodeRows}</section>
        </main>
        <script>
          (function () {
            function fitOnePage() {
              var page = document.querySelector(".page");
              if (!page) return;
              document.documentElement.style.setProperty("--print-scale", "1");
              var availableHeight = 1040;
              var contentHeight = page.scrollHeight;
              var scale = Math.min(1, Math.max(0.62, availableHeight / Math.max(contentHeight, 1)));
              document.documentElement.style.setProperty("--print-scale", String(scale));
            }
            window.addEventListener("load", fitOnePage);
            window.addEventListener("beforeprint", fitOnePage);
            setTimeout(fitOnePage, 60);
          })();
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 350);
  };
  const designFeeQuotationAmount = selectedDesignFeeQuotation ? toMoney(getQuotationAmount(selectedDesignFeeQuotation)) : Number(depositForm.quotation_amount || 0);
  const designFeeDirectAmount = selectedDesignFeeQuotation ? getQuotationDirectAmount(selectedDesignFeeQuotation) : Number(depositForm.design_fee_base_amount || 0);
  const designFeeBaseAmount = depositForm.design_fee_mode === "direct_fee_ratio" ? designFeeDirectAmount : designFeeQuotationAmount;
  const designFeeRate = Number(depositForm.design_fee_rate || 0);
  const designFeeArea = Number(depositForm.design_fee_area || 0);
  const designFeeUnitPrice = Number(depositForm.design_fee_unit_price || 0);
  const computedDesignFeeAmount = depositForm.record_type === "design_fee"
    ? isQuotationBasedDesignFeeMode(depositForm.design_fee_mode) && designFeeBaseAmount > 0 && designFeeRate > 0
      ? toMoney(designFeeBaseAmount * designFeeRate / 100)
      : depositForm.design_fee_mode === "designer_level_area" && designFeeArea > 0 && designFeeUnitPrice > 0
        ? toMoney(designFeeArea * designFeeUnitPrice)
        : 0
    : 0;
  const isDesignFeeForm = depositForm.record_type === "design_fee";
  const depositFormLabel = isDesignFeeForm ? "设计费" : "定金";

  const getLatestQuotationDate = (quotation: any) => quotation?.updated_at || quotation?.created_at;
  const getCustomerQuotationDetailHref = (quotationId: string) =>
    `/quotations/${quotationId}?returnTo=${encodeURIComponent(`/projects/${id}?tab=quotation`)}`;

  const runCustomerQuotationAction = async (quotationId: string, action: () => Promise<void>, successMessage?: string) => {
    setQuotationActionId(quotationId);
    setQuotationMessage("");
    try {
      await action();
      await refetchQuotations();
      await refreshCustomerProgress();
      if (successMessage) setQuotationMessage(successMessage);
      return true;
    } catch (err: any) {
      setQuotationMessage(err.message || "操作失败");
      return false;
    } finally {
      setQuotationActionId("");
    }
  };

  const copyCustomerQuotation = (quotation: any) => {
    setQuotationMessage("");
    setQuotationCopyTarget(quotation);
  };

  const confirmCopyCustomerQuotation = async () => {
    if (!quotationCopyTarget) return;
    const quotation = quotationCopyTarget;
    const succeeded = await runCustomerQuotationAction(quotation.id, async () => {
      await api.post<{ id: string }>(`/api/quotations/${quotation.id}`, { action: "copy" });
    }, "报价副本已创建");
    if (succeeded) setQuotationCopyTarget(null);
  };

  const setCustomerQuotationStatus = (quotation: any, status: string) => runCustomerQuotationAction(quotation.id, async () => {
    await api.post(`/api/quotations/${quotation.id}`, { action: "setStatus", status });
  }, status === "APPROVED" ? "已设为正式报价" : "已撤销正式报价");

  const sendCustomerQuotationToDesigner = (quotation: any) => runCustomerQuotationAction(quotation.id, async () => {
    await api.post(`/api/quotations/${quotation.id}`, { action: "sendToDesigner" });
    window.dispatchEvent(new Event("todos:changed"));
  }, "报价单已发送设计师");

  const cancelSendCustomerQuotationToDesigner = (quotation: any) => runCustomerQuotationAction(quotation.id, async () => {
    await api.post(`/api/quotations/${quotation.id}`, { action: "cancelSendToDesigner" });
    window.dispatchEvent(new Event("todos:changed"));
  }, "已撤销发送");

  const updateCustomerQuotationNotes = (quotation: any) => {
    setQuotationMessage("");
    setQuotationNotesTarget(quotation);
    setQuotationNotesDraft(quotation.notes || "");
  };

  const saveCustomerQuotationNotes = async () => {
    if (!quotationNotesTarget) return;
    const quotation = quotationNotesTarget;
    const succeeded = await runCustomerQuotationAction(quotation.id, async () => {
      await api.post(`/api/quotations/${quotation.id}`, { action: "updateNotes", notes: quotationNotesDraft });
    }, "报价备注已保存");
    if (succeeded) {
      setQuotationNotesTarget(null);
      setQuotationNotesDraft("");
    }
  };

  const deleteCustomerQuotation = (quotation: any) => {
    setQuotationMessage("");
    setQuotationDeleteTarget(quotation);
  };

  const confirmDeleteCustomerQuotation = async () => {
    if (!quotationDeleteTarget) return;
    const quotation = quotationDeleteTarget;
    const succeeded = await runCustomerQuotationAction(quotation.id, async () => {
      await api.del(`/api/quotations/${quotation.id}`);
    }, "报价已删除");
    if (succeeded) setQuotationDeleteTarget(null);
  };

  const copyCustomerQuotationShareLink = async (quotation: any) => {
    try {
      const url = await createQuotationShareUrl(quotation.id);
      if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持自动复制，请手动复制链接");
      await navigator.clipboard.writeText(url);
      setQuotationMessage("报价分享链接已复制");
      setQuotationCopiedLinkId(quotation.id);
      window.setTimeout(() => {
        setQuotationCopiedLinkId((current) => current === quotation.id ? "" : current);
      }, 2000);
    } catch (err: any) {
      setQuotationMessage(err.message || "复制链接失败");
    }
  };

  const printCustomerQuotation = async (quotation: any) => {
    const previewUrl = await createQuotationPrintPreviewUrl(quotation.id).catch((err) => {
      setQuotationMessage(err.message || "生成打印链接失败");
      return "";
    });
    if (!previewUrl) return;
    const previewWindow = window.open(previewUrl, "_blank");
    if (!previewWindow) window.location.href = previewUrl;
  };

  const applyContractQuotation = (quotationId: string) => {
    const quotation = contractQuotationOptions.find((item: any) => item.id === quotationId);
    const nextTotalAmount = quotation ? toMoney(getQuotationAmount(quotation)) : 0;
    setContractForm((prev) => ({
      ...prev,
      quotation_id: quotationId,
      total_amount: quotation ? String(nextTotalAmount) : "",
      deposit_deduct_amount: prev.deposit_deducted ? String(getMaxContractDepositDeduct(nextTotalAmount)) : "",
    }));
  };

  const applyDesignFeeQuotation = (quotationId: string, rateValue = depositForm.design_fee_rate, modeValue = depositForm.design_fee_mode) => {
    const quotation = designFeeQuotationOptions.find((item: any) => item.id === quotationId);
    const quoteAmount = quotation ? toMoney(getQuotationAmount(quotation)) : 0;
    const directAmount = quotation ? getQuotationDirectAmount(quotation) : 0;
    const baseAmount = modeValue === "direct_fee_ratio" ? directAmount : quoteAmount;
    const rate = Number(rateValue || 0);
    const feeAmount = baseAmount > 0 && rate > 0 ? toMoney(baseAmount * rate / 100) : 0;
    setDepositForm((prev) => ({
      ...prev,
      quotation_id: quotationId,
      quotation_amount: quoteAmount ? String(quoteAmount) : "",
      design_fee_base_amount: baseAmount ? String(baseAmount) : "",
      design_fee_rate: String(rateValue || ""),
      receivable_amount: feeAmount ? String(feeAmount) : "",
    }));
  };

  const openContractModal = async () => {
    setContractOpening(true);
    setContractMessage("");
    try {
      const fresh = (!branchBasicInfo || paymentSchemes.length === 0) ? await fetchContracts() : null;
      const schemes = Array.isArray(fresh?.paymentSchemes) ? fresh.paymentSchemes : paymentSchemes;
      const defaultScheme = schemes.find((scheme: PaymentSchemeOption) => scheme.isDefault) || schemes[0];
      const seedCustomer = fresh?.customer || customer;
      const seedProject = fresh?.project || contractProject || relatedProjects[0] || {};
      const customerCompany = seedCustomer as any;
      const seedCompany = fresh?.branchBasicInfo || branchBasicInfo || {
        name: customerCompany?.company_name,
        phone: customerCompany?.company_phone,
        address: customerCompany?.company_address,
      };
      const freshFormalQuotations = Array.isArray(fresh?.formalQuotations) ? fresh.formalQuotations : contractQuotationOptions;
      const freshTemplates = Array.isArray(fresh?.contractTemplates) ? fresh.contractTemplates : contractTemplates;
      const quote = freshFormalQuotations[0] || ((fresh?.latestQuotation?.status === "APPROVED" ? fresh.latestQuotation : null) || (latestQuotation?.status === "APPROVED" ? latestQuotation : null));
      const depositTotal = fresh ? Number(fresh.depositTotal || 0) : contractDepositTotal;
      const form = defaultContractForm(seedCustomer, seedProject, seedCompany, defaultScheme?.id || "");
      const defaultTemplate = freshTemplates.find((template: ContractTemplateOption) => template.contract_type === form.contract_type && template.is_default)
        || freshTemplates.find((template: ContractTemplateOption) => template.contract_type === form.contract_type);
      form.contract_template_id = defaultTemplate?.id || "";
      const quoteAmount = getQuotationAmount(quote);
      form.quotation_id = quote?.id || "";
      form.total_amount = quoteAmount > 0 ? String(toMoney(quoteAmount)) : "";
      form.deposit_deduct_amount = quoteAmount > 0 ? String(getMaxContractDepositDeduct(quoteAmount, depositTotal)) : "";
      setContractForm(form);
      setContractStep(0);
      clearContractMissingFields();
      setShowContractModal(true);
    } finally {
      setContractOpening(false);
    }
  };

  const openContractEditor = (contract: ContractRecord) => {
    setContractForm(contractRecordToForm(contract));
    const draftStep = Number(contract.content?.draft_step ?? 0);
    setContractStep(Number.isFinite(draftStep) ? Math.max(0, Math.min(4, draftStep)) : 0);
    setContractMessage("");
    clearContractMissingFields();
    setShowContractModal(true);
  };

  const openContractResign = (contract: ContractRecord) => {
    if (String(contract.status || "").toUpperCase() !== "SIGNED") {
      setContractMessage("只有已签约合同可以发起重签");
      return;
    }
    const form = contractRecordToForm(contract);
    setContractForm({
      ...form,
      id: "",
      resign_source_contract_id: contract.id,
      title: `${contract.title || "装修施工合同"}-重签`,
      contract_no: makeContractNo("CQ"),
      status: "DRAFT",
      signed_at: new Date().toISOString().slice(0, 10),
    });
    setContractStep(0);
    setContractMessage("");
    clearContractMissingFields();
    setShowContractModal(true);
  };

  const openApprovalCommentModal = (target: ApprovalCommentTarget) => {
    setSignatureApprovalTarget(target);
  };

  const handleContractApprovalAction = async (stepId: string, action: ApprovalAction, comment = "", signatureId = "") => {
    const token = localStorage.getItem("zxgj_token");
    setApprovalProcessingId(stepId + action);
    setContractMessage("");
    try {
      const res = await fetch("/api/todos/contract-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: stepId, action, comment, signature_id: signatureId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "审批处理失败");
      const fresh = await fetchContracts();
      const activeContractId = approvalDetailContract?.id || summaryContract?.id;
      const updatedContract = (fresh?.contracts || []).find((item: ContractRecord) => item.id === activeContractId);
      if (updatedContract && approvalDetailContract?.id === updatedContract.id) setApprovalDetailContract(updatedContract);
      if (updatedContract && summaryContract?.id === updatedContract.id) setSummaryContract(updatedContract);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
      setContractMessage(action === "approve" ? "合同审批已同意" : "合同审批已驳回");
      return true;
    } catch (err: any) {
      setContractMessage(err.message || "审批处理失败");
      return false;
    } finally {
      setApprovalProcessingId("");
    }
  };

  const handleDepositApprovalAction = async (stepId: string, action: ApprovalAction, comment = "", signatureId = "") => {
    const token = localStorage.getItem("zxgj_token");
    setDepositApprovalProcessingId(stepId + action);
    setDepositMessage("");
    try {
      const res = await fetch("/api/todos/deposit-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: stepId, action, comment, signature_id: signatureId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "审批处理失败");
      const fresh = await fetchDepositRecords();
      const updatedRecord = (fresh || []).find((item: DepositRecord) => item.id === depositApprovalDetailRecord?.id);
      if (updatedRecord) setDepositApprovalDetailRecord(updatedRecord);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
      setDepositMessage(action === "approve" ? "收款审批已同意" : "收款审批已驳回");
      return true;
    } catch (err: any) {
      setDepositMessage(err.message || "审批处理失败");
      return false;
    } finally {
      setDepositApprovalProcessingId("");
    }
  };

  const handleDepositRefundApprovalAction = async (stepId: string, action: ApprovalAction, comment = "", signatureId = "") => {
    const token = localStorage.getItem("zxgj_token");
    setRefundApprovalProcessingId(stepId + action);
    setDepositMessage("");
    try {
      const res = await fetch("/api/todos/deposit-refund-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: stepId, action, comment, signature_id: signatureId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "审批处理失败");
      const fresh = await fetchDepositRecords();
      const updatedRecord = (fresh || []).find((item: DepositRecord) => item.id === refundApprovalDetailRecord?.id);
      if (updatedRecord) setRefundApprovalDetailRecord(updatedRecord);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
      setDepositMessage(action === "approve" ? "退款审批已同意" : "退款审批已驳回");
      return true;
    } catch (err: any) {
      setDepositMessage(err.message || "审批处理失败");
      return false;
    } finally {
      setRefundApprovalProcessingId("");
    }
  };

  const handleDeleteContract = async (contract: ContractRecord) => {
    if (["SIGNED", "RESIGNED"].includes(String(contract.status || "").toUpperCase())) {
      setContractMessage("已签约或已重签合同不允许删除");
      return;
    }
    if (!window.confirm(`确定删除合同「${contract.title || "未命名合同"}」吗？删除后合同资料列表将不再显示。`)) return;
    const token = localStorage.getItem("zxgj_token");
    setContractDeletingId(contract.id);
    setContractMessage("");
    try {
      const res = await fetch(`/api/customers/${id}/contracts?contract_id=${encodeURIComponent(contract.id)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "删除合同失败");
      setContracts((prev) => prev.filter((item) => item.id !== contract.id));
      if (approvalDetailContract?.id === contract.id) setApprovalDetailContract(null);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
      setContractMessage("合同已删除");
    } catch (err: any) {
      setContractMessage(err.message || "删除合同失败");
    } finally {
      setContractDeletingId("");
    }
  };

  const openContractPrint = (contract: ContractRecord, autoPrint = false) => {
    if (!contract?.id) return;
    const url = `/api/customers/${id}/contracts/${contract.id}/print${autoPrint ? "#print" : ""}`;
    const previewWindow = window.open(url, "_blank");
    if (!previewWindow) window.location.href = url;
  };

  const getContractStepValidation = (stepToValidate = contractStep): { message: string; fields: ContractRequiredFieldKey[] } => {
    const fields: ContractRequiredFieldKey[] = [];
    let message = "";
    const addMissingField = (field: ContractRequiredFieldKey, nextMessage: string) => {
      fields.push(field);
      if (!message) message = nextMessage;
    };

    if (stepToValidate === 0) {
      if (!contractForm.contract_type) addMissingField("contract_type", "请选择合同类型");
      if (!contractForm.title.trim()) addMissingField("title", "请填写合同名称");
      if (!contractForm.contract_no.trim()) addMissingField("contract_no", "请填写合同编号");
      return { message, fields };
    }
    if (stepToValidate === 1) {
      if (!contractForm.party_a_name.trim()) addMissingField("party_a_name", "请完善甲方姓名和手机号");
      if (!contractForm.party_a_phone.trim()) addMissingField("party_a_phone", "请完善甲方姓名和手机号");
      if (!contractForm.party_b_name.trim()) addMissingField("party_b_name", "请完善乙方公司和联系人");
      if (!contractForm.party_b_contact.trim()) addMissingField("party_b_contact", "请完善乙方公司和联系人");
      return { message, fields };
    }
    if (stepToValidate === 2) {
      if (!contractForm.project_address.trim()) addMissingField("project_address", "请填写项目地址");
      if (!contractForm.planned_start) addMissingField("planned_start", "请选择计划开工日期");
      const duration = Math.ceil(Number(contractForm.duration_days || 0));
      if (!Number.isFinite(duration) || duration <= 0) addMissingField("duration_days", "请填写大于 0 的签约工期");
      if (!contractForm.planned_end) addMissingField("planned_end", "请确认计划竣工日期");
      if (!contractForm.construction_scope.trim()) addMissingField("construction_scope", "请填写施工范围");
      return { message, fields };
    }
    if (stepToValidate === 3) {
      if (contractQuotationOptions.length === 0) {
        addMissingField("quotation_id", "该客户暂无正式报价，请先将预算报价设为正式报价");
        return { message, fields };
      }
      if (!contractForm.quotation_id || !selectedContractQuotation) addMissingField("quotation_id", "请选择状态为正式报价的预算");
      if (!Number.isFinite(contractTotalAmount) || contractTotalAmount <= 0) addMissingField("total_amount", "合同金额必须大于 0");
      if (contractForm.deposit_deducted && contractDepositDeductAmount > contractTotalAmount) addMissingField("deposit_deduct_amount", "定金抵扣金额不能大于合同金额");
      if (!contractForm.payment_scheme_id) addMissingField("payment_scheme_id", "请选择收款比例模板");
      else if (contractPaymentStages.length === 0) addMissingField("payment_scheme_id", "收款模板至少需要一个收款阶段");
      else if (contractPaymentRatioTotal !== 100) addMissingField("payment_scheme_id", "收款比例合计必须是 100%");
      return { message, fields };
    }
    return { message, fields };
  };

  const nextContractStep = () => {
    const { message, fields } = getContractStepValidation();
    if (message) {
      setContractMessage(message);
      markContractMissingFields(fields);
      return;
    }
    setContractMessage("");
    clearContractMissingFields();
    setContractStep((step) => Math.min(step + 1, 4));
  };

  const handleContractAttachmentUpload = async (file?: File | null) => {
    if (!file) return;
    setContractUploading(true);
    setContractMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customer_id", id);
      formData.append("category", "合同附件");
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "上传失败");
      setContractForm((prev) => ({ ...prev, attachments: [data, ...prev.attachments] }));
    } catch (err: any) {
      setContractMessage(err.message || "上传失败");
    } finally {
      setContractUploading(false);
    }
  };

  const updateContractSchedule = (
    patch: Partial<Pick<ContractForm, "planned_start" | "duration_days" | "weekend_construction" | "holiday_construction">>,
  ) => {
    setContractForm((prev) => {
      const next = { ...prev, ...patch };
      return {
        ...next,
        planned_end: calculateContractPlannedEnd(next.planned_start, next.duration_days, {
          weekendConstruction: next.weekend_construction,
          holidayConstruction: next.holiday_construction,
        }),
      };
    });
  };

  const removeContractAttachment = (fileId: string) => {
    setContractForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((file) => file.id !== fileId),
    }));
  };

  const buildContractPayload = (action: "save_draft" | "create") => ({
    id: contractForm.id || undefined,
    resign_source_contract_id: contractForm.resign_source_contract_id || undefined,
    action,
    draft_step: contractStep,
    contract_type: contractForm.contract_type,
    contract_template_id: selectedContractTemplate?.id || contractForm.contract_template_id || "",
    title: contractForm.title,
    contract_no: contractForm.contract_no,
    quotation_id: contractForm.quotation_id,
    status: contractForm.status,
    signed_at: contractForm.signed_at,
    total_amount: contractTotalAmount,
    deposit_deducted: contractForm.deposit_deducted,
    deposit_deduct_amount: contractDepositDeductAmount,
    payment_scheme_id: selectedPaymentScheme?.id || contractForm.payment_scheme_id || "",
    payment_scheme_name: selectedPaymentScheme?.name || "",
    payment_stages: contractPaymentStages,
    party_a: {
      name: contractForm.party_a_name,
      contact: contractForm.party_a_contact,
      phone: contractForm.party_a_phone,
      id_no: contractForm.party_a_id_no,
    },
    party_b: {
      name: contractForm.party_b_name,
      contact: contractForm.party_b_contact,
      phone: contractForm.party_b_phone,
      license_no: contractForm.party_b_license,
    },
    project_info: {
      address: contractForm.project_address,
      area: contractForm.project_area,
      planned_start: contractForm.planned_start,
      planned_end: contractForm.planned_end,
      duration_days: contractForm.duration_days,
      weekend_construction: contractForm.weekend_construction,
      holiday_construction: contractForm.holiday_construction,
      construction_scope: contractForm.construction_scope,
    },
    construction_terms: {
      schedule: contractForm.construction_terms,
      quality: contractForm.quality_standard,
      warranty: contractForm.warranty_terms,
    },
    attachments: contractForm.attachments,
    remarks: contractForm.remarks,
  });

  const persistContract = async (action: "save_draft" | "create") => {
    const token = localStorage.getItem("zxgj_token");
    const res = await fetch(`/api/customers/${id}/contracts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(buildContractPayload(action)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || (action === "save_draft" ? "暂存失败" : "创建合同失败"));
    setContracts((prev) => [data, ...prev.filter((item) => item.id !== data.id)]);
    setContractForm((prev) => ({ ...prev, id: data.id || prev.id }));
    return data;
  };

  const handleSaveContractDraft = async () => {
    if (!contractForm.contract_type) {
      setContractMessage("请选择合同类型");
      setContractStep(0);
      markContractMissingFields(["contract_type"]);
      return;
    }
    if (!contractForm.title.trim()) {
      setContractMessage("请填写合同名称后再暂存");
      setContractStep(0);
      markContractMissingFields(["title"]);
      return;
    }
    if (!contractForm.contract_no.trim()) {
      setContractMessage("请填写合同编号后再暂存");
      setContractStep(0);
      markContractMissingFields(["contract_no"]);
      return;
    }
    setContractSaving(true);
    setContractMessage("");
    clearContractMissingFields();
    try {
      await persistContract("save_draft");
      setShowContractModal(false);
      setContractMessage("合同已暂存，可在合同资料列表继续编辑");
    } catch (err: any) {
      setContractMessage(err.message || "暂存失败");
    } finally {
      setContractSaving(false);
    }
  };

  const handleSaveContract = async () => {
    const invalidStep = [0, 1, 2, 3].find((step) => getContractStepValidation(step).message);
    const { message, fields } = invalidStep === undefined ? { message: "", fields: [] } : getContractStepValidation(invalidStep);
    if (message) {
      if (invalidStep !== undefined) setContractStep(invalidStep);
      setContractMessage(message);
      markContractMissingFields(fields);
      return;
    }
    setContractSaving(true);
    setContractMessage("");
    clearContractMissingFields();
    try {
      await persistContract("create");
      setShowContractModal(false);
      setContractMessage(contractForm.resign_source_contract_id ? "重签合同已创建" : "合同已创建");
      await refreshCustomerProgress();
    } catch (err: any) {
      setContractMessage(err.message || "创建合同失败");
    } finally {
      setContractSaving(false);
    }
  };

  const relatedProjects = useMemo(() => (projects ?? []).filter((p: any) => p.customer_id === id), [id, projects]);
  const customerRoomNumber = buildCustomerRoomNumber(customer);
  const customerRoomDisplay = getCustomerRoomDisplay(customer);
  const customerHouseAddress = customer?.house_address?.trim() || "";
  const normalizedCustomerStatus = normalizeCustomerStatus(customer?.status);
  const canEditCustomerProfile = normalizedCustomerStatus !== "SIGNED";
  const canMarkCustomerLost = normalizedCustomerStatus !== "SIGNED" && normalizedCustomerStatus !== "LOST";
  const canRecoverCustomer = normalizedCustomerStatus === "LOST";
  const manualAdvisor = manualTeam.find((t: any) => String(t.role || "").toUpperCase() === "ADVISOR" && !t.is_auto);
  const manualDesigner = manualTeam.find((t: any) => String(t.role || "").toUpperCase() === "DESIGNER" && !t.is_auto);
  const autoAdvisorName = customer?.inviter_name || customer?.created_by_name || "";
  const advisorName = manualAdvisor?.user_name || customer?.advisor_name || autoAdvisorName;
  const designerName = manualDesigner?.user_name || customer?.designer_name || "";
  const businessDepartmentName = customer?.business_department_name || "";
  const designDepartmentName = customer?.design_department_name || "";
  const canEditServiceAdvisor = normalizedCustomerStatus !== "SIGNED";
  const pmNames = useMemo(() => Array.from(new Set(relatedProjects.map((p: any) => p.manager_name).filter(Boolean))), [relatedProjects]);
  const pmAvatars = useMemo(() => Array.from(new Set(relatedProjects.map((p: any) => p.manager_avatar).filter(Boolean))), [relatedProjects]);
  const measureFiles = customerFiles.filter(isMeasureAttachment);
  const designFiles = customerFiles.filter(isDesignAttachment);
  const measureCategoryCounts = new Map(measureAttachmentTypes.map((item) => [item.key, 0]));
  measureFiles.forEach((file) => {
    const group = getMeasureAttachmentGroup(file);
    measureCategoryCounts.set(group, (measureCategoryCounts.get(group) || 0) + 1);
  });
  const measureUnclassifiedCount = measureFiles.filter((file) => getMeasureAttachmentGroup(file) === "未分类").length;
  const visibleMeasureFiles = measureViewFilter === "ALL"
    ? measureFiles
    : measureFiles.filter((file) => getMeasureAttachmentGroup(file) === measureViewFilter);
  const measureViewTitle = measureViewFilter === "ALL"
    ? "全部量房资料"
    : measureViewFilter === "未分类"
      ? "未分类资料"
      : measureAttachmentTypes.find((item) => item.key === measureViewFilter)?.label || "量房资料";
  const designCategoryCounts = new Map(designAttachmentTypes.map((item) => [item.key, 0]));
  designFiles.forEach((file) => {
    const group = getDesignAttachmentGroup(file);
    designCategoryCounts.set(group, (designCategoryCounts.get(group) || 0) + 1);
  });
  const designUnclassifiedCount = designFiles.filter((file) => getDesignAttachmentGroup(file) === "未分类").length;
  const visibleDesignFiles = designViewFilter === "ALL"
    ? designFiles
    : designFiles.filter((file) => getDesignAttachmentGroup(file) === designViewFilter);
  const designViewTitle = designViewFilter === "ALL"
    ? "全部设计方案"
    : designViewFilter === "未分类"
      ? "未分类资料"
      : designAttachmentTypes.find((item) => item.key === designViewFilter)?.label || "设计方案";
  const isUploadingMeasureFile = Boolean(uploadingCategory && (uploadingCategory === MEASURE_CATEGORY_BASE || uploadingCategory.startsWith(`${MEASURE_CATEGORY_BASE}/`)));
  const isUploadingDesignFile = Boolean(uploadingCategory && (uploadingCategory === DESIGN_CATEGORY_BASE || uploadingCategory === LEGACY_DESIGN_CATEGORY || uploadingCategory.startsWith(`${DESIGN_CATEGORY_BASE}/`)));
  const measureUploadUrl = typeof window !== "undefined"
    ? `${window.location.origin}/projects/upload/${id}?target=customer&category=${encodeURIComponent("量房资料")}`
    : "";
  const designUploadUrl = typeof window !== "undefined"
    ? `${window.location.origin}/projects/upload/${id}?target=customer&category=${encodeURIComponent(DESIGN_CATEGORY_BASE)}`
    : "";
  const depositVoucherUploadUrl = typeof window !== "undefined"
    ? `${window.location.origin}/projects/upload/${id}?target=customer&category=${encodeURIComponent(DEPOSIT_VOUCHER_CATEGORY)}`
    : "";

  const getTeamAssignment = useCallback((role: string) => {
    const normalizedRole = String(role || "").toUpperCase();
    const manual = manualTeam.find((t: any) => String(t.role || "").toUpperCase() === normalizedRole && !t.is_auto);
    if (manual) return { name: manual.user_name, avatar: manual.user_avatar || null, userId: manual.user_id, isManual: true };
    if (normalizedRole === "ADVISOR" && autoAdvisorName) return { name: autoAdvisorName, avatar: customer?.inviter_avatar || customer?.created_by_avatar || null, userId: customer?.inviter_id || customer?.created_by_id || null, isManual: false };
    if (normalizedRole === "PM" && pmNames.length > 0) return { name: pmNames.join(", "), avatar: pmAvatars.length === 1 ? pmAvatars[0] : null, userId: null, isManual: false };
    return null;
  }, [autoAdvisorName, customer?.created_by_avatar, customer?.created_by_id, customer?.inviter_avatar, customer?.inviter_id, manualTeam, pmAvatars, pmNames]);

  const additionalMembers = manualTeam.filter((t: any) => !t.is_auto && !defaultTeamRoles.find(dr => dr.role === t.role));
  const serviceTeamAssignedCount = defaultTeamRoles.filter((dr) => getTeamAssignment(dr.role)).length + additionalMembers.length;
  const serviceTeamSlotCount = defaultTeamRoles.length + additionalMembers.length;
  const designerAssignmentApproverIds = Array.isArray(designerAssignmentRequest?.approver_ids)
    ? designerAssignmentRequest.approver_ids.map((approverId: unknown) => String(approverId || ""))
    : [];
  const designerAssignmentStatus = String(designerAssignmentRequest?.status || "");
  const hasActiveDesignerAssignment = ["pending", "pending_dispatch", "pending_handler"].includes(designerAssignmentStatus);
  const isDesignerAssignmentApprover = Boolean(user?.id) && (
    String(designerAssignmentRequest?.approver_id || "") === String(user?.id || "")
    || designerAssignmentApproverIds.includes(String(user?.id || ""))
  );
  const isDesignerAssignmentHandler = Boolean(user?.id)
    && String(designerAssignmentRequest?.handler_id || "") === String(user?.id || "");
  const canDispatchDesignerFromFlow = designerAssignmentStatus === "pending_dispatch" && isDesignerAssignmentApprover;
  const canAssignDesignerFromFlow = Boolean(
    (designerAssignmentStatus === "pending" && isDesignerAssignmentApprover)
    || (designerAssignmentStatus === "pending_dispatch" && isDesignerAssignmentApprover)
    || (designerAssignmentStatus === "pending_handler" && isDesignerAssignmentHandler)
  );
  const assignDialogRole = assignModalRole ? defaultTeamRoles.find(dr => dr.role === assignModalRole) : null;
  const teamPickerOpen = Boolean(assignModalRole || showAddPersonnel || showDesignerRequestModal);
  const effectiveTeamPickerRole =
    showDesignerRequestModal
      ? "DESIGNER"
      : teamPickerRoleFilter === "MATCH"
        ? getDefaultTeamPickerRole(assignModalRole)
        : teamPickerRoleFilter;
  const assignPickerRoleOptions = assignDialogRole
    ? [{ value: "MATCH", label: `匹配${assignDialogRole.label}` }, ...teamPickerRoleOptions]
    : teamPickerRoleOptions;

  useEffect(() => {
    if (!assignModalRole) return;
    const assigned = getTeamAssignment(assignModalRole);
    setAssignSelectedUserId(assigned?.userId || "");
    setTeamPickerQuery("");
    setTeamPickerRoleFilter("MATCH");
  }, [assignModalRole, getTeamAssignment]);

  useEffect(() => {
    if (!showAddPersonnel) return;
    setTeamPickerQuery("");
    setTeamPickerRoleFilter("ALL");
  }, [showAddPersonnel]);

  useEffect(() => {
    if (!showDesignerRequestModal) return;
    setTeamPickerQuery("");
    setTeamPickerRoleFilter("DESIGNER");
  }, [showDesignerRequestModal]);

  useEffect(() => {
    if (!teamPickerOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setTeamPickerLoading(true);
      setTeamPickerError("");
      try {
        const params = new URLSearchParams({ picker: "1", limit: "50", customer_id: id });
        const keyword = teamPickerQuery.trim();
        if (keyword) params.set("q", keyword);
        if (effectiveTeamPickerRole && effectiveTeamPickerRole !== "ALL") {
          params.set("role", effectiveTeamPickerRole);
        }
        const res = await fetch(`/api/team?${params.toString()}`, {
          headers: getClientAuthHeaders(),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "人员加载失败");
        setTeamPickerMembers(Array.isArray(data.items) ? data.items : []);
        setTeamPickerTotal(Number(data.total || 0));
        setTeamPickerHasMore(Boolean(data.hasMore));
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setTeamPickerMembers([]);
        setTeamPickerTotal(0);
        setTeamPickerHasMore(false);
        setTeamPickerError(err?.message || "人员加载失败");
      } finally {
        if (!controller.signal.aborted) setTeamPickerLoading(false);
      }
    }, teamPickerQuery.trim() ? 260 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [effectiveTeamPickerRole, id, teamPickerOpen, teamPickerQuery]);

  useEffect(() => {
    if (!showDesignerDispatchModal) return;
    setDispatchHandlerId("");
    setDispatchPickerQuery("");
    setDispatchPickerError("");
  }, [showDesignerDispatchModal]);

  useEffect(() => {
    if (!showDesignerDispatchModal) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDispatchPickerLoading(true);
      setDispatchPickerError("");
      try {
        const params = new URLSearchParams({ picker: "1", limit: "50", customer_id: id });
        const keyword = dispatchPickerQuery.trim();
        if (keyword) params.set("q", keyword);
        const res = await fetch(`/api/team?${params.toString()}`, {
          headers: getClientAuthHeaders(),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "人员加载失败");
        setDispatchPickerMembers(Array.isArray(data.items) ? data.items : []);
        setDispatchPickerTotal(Number(data.total || 0));
        setDispatchPickerHasMore(Boolean(data.hasMore));
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setDispatchPickerMembers([]);
        setDispatchPickerTotal(0);
        setDispatchPickerHasMore(false);
        setDispatchPickerError(err?.message || "人员加载失败");
      } finally {
        if (!controller.signal.aborted) setDispatchPickerLoading(false);
      }
    }, dispatchPickerQuery.trim() ? 260 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dispatchPickerQuery, id, showDesignerDispatchModal]);

  const handleTeamAssign = async (role: string, userId: string) => {
    if (!userId) { setAssignModalRole(null); return; }
    try {
      const token = localStorage.getItem("zxgj_token");
      const normalizedAssignedRole = String(role || "").toUpperCase();
      const assignThroughWorkflow = normalizedAssignedRole === "DESIGNER" && hasActiveDesignerAssignment;
      const res = await fetch(assignThroughWorkflow ? `/api/customers/${id}/designer-assignment` : `/api/customers/${id}/team`, {
        method: assignThroughWorkflow ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(assignThroughWorkflow ? { action: "assign_designer", designer_id: userId } : { user_id: userId, role }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "分配失败");
      const data = await fetch(`/api/customers/${id}/team`).then(r => r.json());
      setManualTeam(Array.isArray(data) ? data : []);
      if (normalizedAssignedRole === "ADVISOR") {
        await refetchCustomer();
        setTeamMessage("家装顾问已更新");
      }
      if (normalizedAssignedRole === "DESIGNER") {
        await refetchCustomer();
        await refreshDesignerAssignmentRequest();
        window.dispatchEvent(new Event("todos:changed"));
      }
    } catch (err: any) {
      setTeamMessage(err.message || "分配失败");
      console.error(err);
    }
      setAssignModalRole(null);
  };

  const handleConfirmTeamAssign = () => {
    if (!assignModalRole || !assignSelectedUserId) return;
    handleTeamAssign(assignModalRole, assignSelectedUserId);
  };

  const refreshDesignerAssignmentRequest = async () => {
    const token = localStorage.getItem("zxgj_token");
    const data = await fetch(`/api/customers/${id}/designer-assignment`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => r.json());
    const request = data?.request || null;
    setDesignerAssignmentRequest(request);
    return request;
  };

  const handleDesignerAssignmentRequest = async () => {
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(`/api/customers/${id}/designer-assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ preferred_designer_id: preferredDesignerId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "申请失败");
      const request = await refreshDesignerAssignmentRequest();
      const dispatcherLabel = request?.dispatcher_label || data?.request?.dispatcher_label || designerAssignmentDispatcherLabel;
      setTeamMessage(designerAssignmentMode === "dispatch" ? `已发起设计师分配申请，等待${dispatcherLabel}分派处理人` : `已发起设计师分配申请，等待${dispatcherLabel}分配设计师`);
      setShowDesignerRequestModal(false);
      setPreferredDesignerId("");
      window.dispatchEvent(new Event("todos:changed"));
    } catch (err: any) {
      setTeamMessage(err.message || "申请失败");
    }
  };

  const handleDesignerAssignmentDispatch = async () => {
    if (!dispatchHandlerId || dispatchingDesignerRequest) return;
    setDispatchingDesignerRequest(true);
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(`/api/customers/${id}/designer-assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "dispatch_handler", handler_id: dispatchHandlerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "分派失败");
      setDesignerAssignmentRequest(data?.request || null);
      setTeamMessage("已分派处理人，等待其分配设计师");
      setShowDesignerDispatchModal(false);
      setShowDesignerAssignmentFlow(false);
      window.dispatchEvent(new Event("todos:changed"));
    } catch (err: any) {
      setTeamMessage(err.message || "分派失败");
    } finally {
      setDispatchingDesignerRequest(false);
    }
  };

  const handleAddPersonnel = async () => {
    if (!selectedUserId || !customRoleName.trim()) return;
    const token = localStorage.getItem("zxgj_token");
    try {
      await fetch(`/api/customers/${id}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ user_id: selectedUserId, role: customRoleName.trim() }),
      });
      const data = await fetch(`/api/customers/${id}/team`).then(r => r.json());
      setManualTeam(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    setShowAddPersonnel(false);
    setCustomRoleName("");
    setSelectedUserId("");
  };

  const requestTeamRemoval = (role: string, memberName: string, roleLabel: string) => {
    setTeamRemovalError("");
    setTeamRemovalTarget({ role, memberName, roleLabel });
  };

  const closeTeamRemovalConfirm = () => {
    if (teamRemoving) return;
    setTeamRemovalTarget(null);
    setTeamRemovalError("");
  };

  const confirmTeamRemoval = async () => {
    if (!teamRemovalTarget || teamRemoving) return;
    const { role, memberName, roleLabel } = teamRemovalTarget;
    setTeamRemoving(true);
    setTeamRemovalError("");
    try {
      const res = await fetch(`/api/customers/${id}/team?role=${encodeURIComponent(role)}`, {
        method: "DELETE",
        headers: getClientAuthHeaders(),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "移除失败");
      const data = await fetch(`/api/customers/${id}/team`, { headers: getClientAuthHeaders() }).then(r => r.json());
      setManualTeam(Array.isArray(data) ? data : []);
      if (String(role || "").toUpperCase() === "ADVISOR") {
        await refetchCustomer();
        setTeamMessage("家装顾问已恢复为默认顾问");
      }
      if (String(role || "").toUpperCase() === "DESIGNER") {
        await refetchCustomer();
      }
      setTeamMessage(`${roleLabel}「${memberName}」已移出服务团队`);
      setTeamRemovalTarget(null);
    } catch (err: any) {
      const message = err.message || "移除失败";
      setTeamRemovalError(message);
      setTeamMessage(message);
      console.error(err);
    } finally {
      setTeamRemoving(false);
    }
  };

  // Lifecycle progress index
  const getCurrentStageIdx = () => {
    if (!customer) return -1;
    const constrProj = relatedProjects.find((p: any) => p.status === "CONSTRUCTION");
    const complProj = relatedProjects.find((p: any) => p.status === "COMPLETED");
    if (complProj) return lifecycleStages.length + 1;
    if (constrProj) return lifecycleStages.length;
    const customerStatus = normalizeCustomerStatus(customer.status);
    if (customerStatus === "LOST") return -1;
    return lifecycleStages.findIndex(s => s.key === customerStatus);
  };
  const currentIdx = getCurrentStageIdx();
  const allStages = [...lifecycleStages, ...projectStages];
  const isLostLifecycle = normalizedCustomerStatus === "LOST";
  const defaultLifecycleStageKey = currentIdx >= 0 ? allStages[currentIdx]?.key || "NEW" : "NEW";
  const selectedLifecycleStage = allStages.find((stage) => stage.key === selectedLifecycleStageKey) || allStages[currentIdx] || allStages[0];
  const selectedLifecycleStageIdx = allStages.findIndex((stage) => stage.key === selectedLifecycleStage?.key);
  const selectedLifecycleCompletion = selectedLifecycleStage ? lifecycleCompletions[selectedLifecycleStage.key] : undefined;
  const selectedLifecycleReached = selectedLifecycleStageIdx >= 0 && selectedLifecycleStageIdx <= currentIdx;
  const selectedLifecyclePrimaryAction = selectedLifecycleStage ? lifecyclePrimaryActions[selectedLifecycleStage.key] : undefined;

  useEffect(() => {
    if (isLostLifecycle) return;
    setSelectedLifecycleStageKey(defaultLifecycleStageKey);
  }, [defaultLifecycleStageKey, id, isLostLifecycle]);

  useEffect(() => {
    if (!id || activeTab !== "info" || isLostLifecycle) return;
    fetchLifecycleCompletions();
  }, [activeTab, currentIdx, fetchLifecycleCompletions, id, isLostLifecycle]);

  const isLoading = custLoading || projLoading;

  // Submit follow-up
  const handleAddFollowup = async () => {
    if (!followForm.content.trim() && followForm.attachments.length === 0) return;
    setFollowSubmitting(true);
    try {
      const token = localStorage.getItem("zxgj_token");
      await fetch("/api/followups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          customer_id: id,
          type: followForm.type,
          content: followForm.content,
          next_date: followForm.next_date || null,
          scene: followForm.scene || null,
          reply_to_id: replyingToFollowup?.id || null,
          attachment_ids: followForm.attachments.map((file) => file.id),
        }),
      });
      setFollowForm({ type: "电话", content: "", next_date: "", scene: "", attachments: [] });
      setReplyingToFollowup(null);
      setFollowAttachmentMessage("");
      pendingFollowupScrollTopRef.current = true;
      await refetchFollowups();
      await refreshCustomerProgress();
    } catch (err) {
      console.error("Failed to add follow-up", err);
    } finally {
      setFollowSubmitting(false);
    }
  };

  const handleFollowAttachmentUpload = async (files?: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;
    setFollowAttachmentUploading(true);
    setFollowAttachmentMessage("");
    try {
      const uploaded: CustomerAttachment[] = [];
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("customer_id", id);
        formData.append("category", "跟进附件");
        const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "上传失败");
        if (data?.id && data?.file_url) uploaded.push(data);
      }
      if (uploaded.length > 0) {
        setFollowForm((prev) => ({
          ...prev,
          attachments: [...prev.attachments, ...uploaded].filter((file, index, list) =>
            list.findIndex((item) => item.id === file.id) === index
          ),
        }));
      }
      setFollowAttachmentMessage(`已上传 ${uploaded.length} 个附件，保存跟进后生效`);
    } catch (err: any) {
      setFollowAttachmentMessage(err.message || "附件上传失败");
    } finally {
      setFollowAttachmentUploading(false);
    }
  };

  const handleRemovePendingFollowAttachment = async (fileId: string) => {
    setFollowForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((file) => file.id !== fileId),
    }));
    await fetch(`/api/upload?id=${encodeURIComponent(fileId)}`, { method: "DELETE", headers: getClientAuthHeaders() }).catch(() => {});
  };

  const serviceMentionMap = new Map<string, { id: string; name: string; role?: string | null; avatar?: string | null }>();
  const addServiceMentionMember = (member: { id?: string | null; name?: string | null; role?: string | null; avatar?: string | null }) => {
    const name = String(member.name || "").trim();
    if (!name) return;
    const key = String(member.id || name);
    const existing = serviceMentionMap.get(key);
    serviceMentionMap.set(key, {
      id: key,
      name,
      role: member.role || existing?.role || null,
      avatar: member.avatar || existing?.avatar || null,
    });
  };
  addServiceMentionMember({ id: customer?.created_by_id, name: customer?.created_by_name, role: "SALES", avatar: customer?.created_by_avatar });
  addServiceMentionMember({ id: customer?.inviter_id, name: customer?.inviter_name, role: "SALES", avatar: customer?.inviter_avatar });
  relatedProjects.forEach((project: any) => addServiceMentionMember({ id: project.manager_id, name: project.manager_name, role: "PM", avatar: project.manager_avatar }));
  manualTeam.forEach((member: any) => addServiceMentionMember({ id: member.user_id, name: member.user_name, role: member.role, avatar: member.user_avatar }));
  const serviceMentionMembers = Array.from(serviceMentionMap.values());
  const mentionFiltered = mentionStart >= 0 ? serviceMentionMembers.filter((m: any) =>
    m.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 8) : [];
  const activeFollowupTemplates = followupTemplateGroups.find((group) => group.key === followForm.scene);

  const renderWithMentions = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@[^\s@，。！？、,.!?;；:：]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return <span key={i} className="text-primary-600 font-medium">{part}</span>;
      }
      return part;
    });
  };

  const getLegacyReplyTargetName = (content?: string | null) => {
    const match = String(content || "").trimStart().match(/^回复\s+@([^：:\s]+)[：:]\s*/);
    return match?.[1] || "";
  };

  const stripLegacyReplyPrefix = (content?: string | null) => {
    return String(content || "").trimStart().replace(/^回复\s+@([^：:\s]+)[：:]\s*/, "");
  };

  const focusFollowupComposer = () => {
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }, 0);
  };

  const getReplyMention = (name?: string | null) => `@${name || "同事"} `;

  const handleReplyFollowup = (fu: any) => {
    const previousMention = replyingToFollowup ? getReplyMention(replyingToFollowup.user_name) : "";
    setReplyingToFollowup({
      id: fu.id,
      user_name: fu.user_name,
      content: fu.content || "",
    });
    setFollowForm((prev) => {
      const rawContent = prev.content.trimStart();
      const contentWithoutPreviousReply =
        previousMention && rawContent.startsWith(previousMention)
          ? rawContent.slice(previousMention.length).trimStart()
          : rawContent;
      return {
        ...prev,
        type: "其他",
        content: contentWithoutPreviousReply,
      };
    });
    setMentionStart(-1);
    focusFollowupComposer();
  };

  const handleCancelReplyFollowup = () => {
    const replyMention = replyingToFollowup ? getReplyMention(replyingToFollowup.user_name) : "";
    setReplyingToFollowup(null);
    if (!replyMention) return;
    setFollowForm((prev) => {
      const rawContent = prev.content.trimStart();
      return {
        ...prev,
        content: rawContent.startsWith(replyMention)
          ? rawContent.slice(replyMention.length).trimStart()
          : prev.content,
      };
    });
  };

  const requestDeleteFollowup = (followup: any) => {
    setFollowupDeleteError("");
    setFollowupDeleteTarget(followup);
  };

  const closeFollowupDeleteConfirm = () => {
    if (deletingFollowupId) return;
    setFollowupDeleteError("");
    setFollowupDeleteTarget(null);
  };

  const handleDeleteFollowup = async () => {
    const followupId = followupDeleteTarget?.id;
    if (!followupId) return;
    setFollowupDeleteError("");
    setDeletingFollowupId(followupId);
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(`/api/followups?id=${encodeURIComponent(followupId)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "删除失败");
      if (replyingToFollowup?.id === followupId) {
        setReplyingToFollowup(null);
      }
      setFollowupDeleteTarget(null);
      await refetchFollowups();
      await refreshCustomerProgress();
    } catch (err: any) {
      setFollowupDeleteError(err.message || "删除失败，请稍后重试");
    } finally {
      setDeletingFollowupId("");
    }
  };

  const insertFollowupTemplate = (template: string) => {
    const el = textareaRef.current;
    const current = followForm.content || "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const spacerBefore = before && !before.endsWith("\n") ? "\n" : "";
    const spacerAfter = after && !after.startsWith("\n") ? "\n" : "";
    const nextContent = `${before}${spacerBefore}${template}${spacerAfter}${after}`;
    const nextCursor = before.length + spacerBefore.length + template.length;
    setFollowForm((prev) => ({ ...prev, content: nextContent }));
    setMentionStart(-1);
    setMentionQuery("");
    setTimeout(() => {
      const nextEl = textareaRef.current;
      if (!nextEl) return;
      nextEl.focus();
      nextEl.selectionStart = nextCursor;
      nextEl.selectionEnd = nextCursor;
    }, 0);
  };

  const insertMention = (member: any) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = followForm.content.slice(0, mentionStart);
    const after = followForm.content.slice(cursor);
    const mention = "@" + member.name + " ";
    const newContent = before + mention + after;
    setFollowForm({ ...followForm, content: newContent });
    setMentionStart(-1);
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = (before + mention).length; }, 0);
  };

  const updateMentionMenuPosition = (content: string, cursor: number, optionCount: number) => {
    const el = textareaRef.current;
    if (!el || typeof window === "undefined") return;

    const computedStyle = window.getComputedStyle(el);
    const mirror = document.createElement("div");
    const marker = document.createElement("span");
    const copiedProperties = [
      "box-sizing", "width", "padding-top", "padding-right", "padding-bottom", "padding-left",
      "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
      "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "line-height",
      "text-align", "text-transform", "text-indent", "word-spacing", "tab-size",
    ];

    copiedProperties.forEach((property) => mirror.style.setProperty(property, computedStyle.getPropertyValue(property)));
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.top = "-9999px";
    mirror.style.left = "0";
    mirror.style.height = "auto";
    mirror.style.maxHeight = "none";
    mirror.style.overflow = "visible";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";
    mirror.textContent = content.slice(0, cursor);
    marker.textContent = content.charAt(cursor) || "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || Number.parseFloat(computedStyle.fontSize) * 1.5;
    const caretTop = marker.offsetTop - el.scrollTop;
    const caretLeft = marker.offsetLeft;
    mirror.remove();

    const menuWidth = Math.min(360, Math.max(160, el.clientWidth - 16));
    const menuHeight = Math.min(216, Math.max(72, optionCount * 44 + 8));
    const shouldOpenUpward = el.clientHeight - (caretTop + lineHeight) < menuHeight + 8;
    const top = Math.round(shouldOpenUpward ? Math.max(8, caretTop - menuHeight - 4) : Math.max(8, caretTop + lineHeight + 4));
    const left = Math.round(Math.max(8, Math.min(caretLeft, el.clientWidth - menuWidth - 8)));

    setMentionMenuPosition((previous) => (
      previous.top === top && previous.left === left && previous.width === menuWidth
        ? previous
        : { top, left, width: menuWidth }
    ));
  };

  const handleContentChange = (value: string) => {
    setFollowForm({ ...followForm, content: value });
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = value.slice(0, cursor);
    const match = before.match(/@([^\s@]*)$/);
    if (match) {
      setMentionStart(before.length - match[0].length);
      setMentionQuery(match[1]);
      setMentionIndex(0);
      const matchedMemberCount = serviceMentionMembers.filter((member) =>
        member.name.toLowerCase().includes(match[1].toLowerCase())
      ).slice(0, 8).length;
      requestAnimationFrame(() => updateMentionMenuPosition(value, cursor, matchedMemberCount));
      return;
    }
    setMentionStart(-1);
  };

  const handleContentKeyDown = (e: React.KeyboardEvent) => {
    if (mentionStart < 0 || mentionFiltered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionFiltered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && mentionFiltered[mentionIndex]) { e.preventDefault(); insertMention(mentionFiltered[mentionIndex]); }
    else if (e.key === "Escape") { setMentionStart(-1); }
  };

  const getDelayDays = (dateStr: string) => {
    if (!dateStr) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const sortedFollowups = [...(followups ?? [])].sort((a: any, b: any) => {
    const timeCompare = String(b.created_at || "").localeCompare(String(a.created_at || ""));
    return timeCompare || String(b.id || "").localeCompare(String(a.id || ""));
  });
  const activeFollowups = sortedFollowups.filter((fu: any) => !fu.deleted_at);
  const followupIdSet = new Set(sortedFollowups.map((fu: any) => fu.id));
  const legacyReplyParentById = new Map<string, string>();
  const legacyReplyParentCandidates = activeFollowups.filter((fu: any) => !fu.reply_to_id && !getLegacyReplyTargetName(fu.content));
  sortedFollowups.forEach((fu: any) => {
    if (fu.deleted_at || fu.reply_to_id) return;
    const targetName = getLegacyReplyTargetName(fu.content);
    if (!targetName) return;
    const parent = legacyReplyParentCandidates.find((candidate: any) =>
      candidate.id !== fu.id &&
      candidate.user_name === targetName &&
      String(candidate.created_at || "") <= String(fu.created_at || "")
    );
    if (parent) {
      legacyReplyParentById.set(fu.id, parent.id);
    }
  });
  const followupParentById = new Map<string, string>();
  sortedFollowups.forEach((fu: any) => {
    const parentId = fu.reply_to_id && followupIdSet.has(fu.reply_to_id) ? fu.reply_to_id : legacyReplyParentById.get(fu.id);
    if (parentId) followupParentById.set(fu.id, parentId);
  });
  const visibleFollowupIds = new Set(activeFollowups.map((fu: any) => fu.id));
  let addedDeletedParent = true;
  while (addedDeletedParent) {
    addedDeletedParent = false;
    sortedFollowups.forEach((fu: any) => {
      if (!fu.deleted_at || visibleFollowupIds.has(fu.id)) return;
      const hasVisibleChild = sortedFollowups.some((child: any) => visibleFollowupIds.has(child.id) && followupParentById.get(child.id) === fu.id);
      if (hasVisibleChild) {
        visibleFollowupIds.add(fu.id);
        addedDeletedParent = true;
      }
    });
  }
  const followupRepliesByParent = new Map<string, any[]>();
  sortedFollowups.forEach((fu: any) => {
    if (!visibleFollowupIds.has(fu.id)) return;
    const parentId = followupParentById.get(fu.id);
    if (!parentId || !visibleFollowupIds.has(parentId)) return;
    const replies = followupRepliesByParent.get(parentId) || [];
    replies.push(fu);
    followupRepliesByParent.set(parentId, replies);
  });
  followupRepliesByParent.forEach((items) => {
    items.sort((a: any, b: any) => {
      const timeCompare = String(a.created_at || "").localeCompare(String(b.created_at || ""));
      return timeCompare || String(a.id || "").localeCompare(String(b.id || ""));
    });
  });
  const timelineFollowups = sortedFollowups.filter((fu: any) => {
    if (!visibleFollowupIds.has(fu.id)) return false;
    const parentId = followupParentById.get(fu.id);
    return !parentId || !visibleFollowupIds.has(parentId);
  });
  const latestTimelineFollowupId = timelineFollowups[0]?.id || "";
  const canDeleteFollowup = (followup: any) => Boolean(user?.id && followup?.user_id === user.id);

  useEffect(() => {
    if (!pendingFollowupScrollTopRef.current || activeTab !== "followup" || !latestTimelineFollowupId) return;
    pendingFollowupScrollTopRef.current = false;
    requestAnimationFrame(() => {
      followupTimelineScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [activeTab, latestTimelineFollowupId]);

  const renderFollowupAttachments = (files?: CustomerAttachment[]) => {
    const list = Array.isArray(files) ? files : [];
    if (list.length === 0) return null;
    return (
      <div className="mt-3 flex max-w-full flex-wrap gap-2" aria-label="跟进附件">
        {list.map((file) => {
          const isImage = isImageAttachment(file);
          if (isImage) {
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => handlePreviewCustomerFile(file)}
                className="group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] transition-colors hover:border-[#afc6ff] focus:outline-none focus:ring-[3px] focus:ring-[#2f6feb]/20"
                title={`点击预览：${file.file_name}`}
              >
                <NativeImage
                  src={file.file_url}
                  alt={file.file_name || "跟进附件图片"}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-[#182230]/75 px-1.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Eye className="h-3 w-3" />
                  预览
                </span>
              </button>
            );
          }

          return (
            <button
              key={file.id}
              type="button"
              onClick={() => handlePreviewCustomerFile(file)}
              className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-3 text-xs font-medium text-[#475467] transition-colors hover:border-[#afc6ff] hover:bg-[#edf4ff] hover:text-[#2f6feb]"
              title={file.file_name}
            >
              {isLinkAttachment(file) ? <Eye className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{file.file_name}</span>
              <span className="shrink-0 text-[#98a2b3]">{isLinkAttachment(file) ? "链接" : formatFileSize(file.file_size)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderFollowupUserIdentity = ({
    name,
    avatar,
    deleted,
    deletedLabel,
    size = "md",
    textClassName = "text-[#182230]",
  }: {
    name?: string | null;
    avatar?: string | null;
    deleted?: boolean;
    deletedLabel: string;
    size?: "sm" | "md";
    textClassName?: string;
  }) => {
    const displayName = deleted ? deletedLabel : (name || "未知用户");
    const initial = String(name || "未知用户").trim().charAt(0) || "?";
    const avatarSizeClass = size === "sm" ? "h-3.5 w-3.5 text-[8px]" : "h-4 w-4 text-[9px]";
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle">
        {!deleted && (
          <span className={`${avatarSizeClass} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#edf4ff] font-semibold leading-none text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]`}>
            {avatar ? (
              <NativeImage src={avatar} alt={`${displayName}头像`} className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
        )}
        <span className={`max-w-full truncate font-semibold ${textClassName}`}>{displayName}</span>
      </span>
    );
  };

  const renderFollowupReplies = (parentId: string, depth = 0) => {
    const replies = followupRepliesByParent.get(parentId) || [];
    if (replies.length === 0) return null;
    return (
      <div className="mt-4 space-y-3 border-l-2 border-[#dbe7f8] pl-4">
        {replies.map((reply: any) => (
          <div
            key={reply.id}
            className={`w-full rounded-[8px] px-3 py-3 ${reply.deleted_at ? "bg-[#f2f4f7]" : "bg-[#f8fafc]"} ${depth > 0 ? "ml-2" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {renderFollowupUserIdentity({
                    name: reply.user_name,
                    avatar: reply.user_avatar,
                    deleted: Boolean(reply.deleted_at),
                    deletedLabel: "已删除的回复",
                    size: "sm",
                    textClassName: "text-[#344054]",
                  })}
                  {!reply.deleted_at && <span className="rounded-[6px] bg-white px-1.5 py-0.5 text-[#667085] ring-1 ring-inset ring-[#e2e7ee]">回复</span>}
                  <span className="text-[#98a2b3]">{formatDate(reply.created_at)}</span>
                </div>
                {reply.deleted_at ? (
                  <p className="mt-1.5 text-sm text-[#98a2b3]">该回复已删除</p>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#344054]">
                    {renderWithMentions(legacyReplyParentById.has(reply.id) ? stripLegacyReplyPrefix(reply.content) : reply.content)}
                  </p>
                )}
                {!reply.deleted_at && reply.next_date && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />下次跟进 {reply.next_date}</span>
                    {getDelayDays(reply.next_date) > 0 && <span className="inline-flex min-h-[22px] items-center rounded-[8px] border border-red-200 bg-red-50 px-2 font-medium text-red-700">延期 {getDelayDays(reply.next_date)} 天</span>}
                  </div>
                )}
                {!reply.deleted_at && renderFollowupAttachments(reply.attachments)}
              </div>
              {!reply.deleted_at && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleReplyFollowup(reply)}
                    className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-xs font-medium text-[#2f6feb] transition-colors hover:bg-[#edf4ff]"
                  >
                    <Reply className="h-3.5 w-3.5" />
                    回复
                  </button>
                  {canDeleteFollowup(reply) && (
                    <button
                      type="button"
                      onClick={() => requestDeleteFollowup(reply)}
                      disabled={deletingFollowupId === reply.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#98a2b3] transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="删除跟进"
                      title="删除"
                    >
                      {deletingFollowupId === reply.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              )}
            </div>
            {renderFollowupReplies(reply.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  const handleMarkCustomerLost = async () => {
    if (!lostReason) {
      setLostMessage("请选择流失/失败原因");
      return;
    }
    setLostSubmitting(true);
    setLostMessage("");
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: "LOST", current_action: lostReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "操作失败");

      const remark = lostRemark.trim();
      await fetch("/api/followups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          customer_id: id,
          type: "其他",
          content: remark ? `标记为失败/流失：${lostReason}\n${remark}` : `标记为失败/流失：${lostReason}`,
          next_date: null,
        }),
      }).catch(() => null);

      setShowLostModal(false);
      setLostRemark("");
      setLostReason(customerActionOptions.LOST[0] || "");
      await refreshCustomerProgress();
      await refetchFollowups();
    } catch (err: any) {
      setLostMessage(err.message || "操作失败");
    } finally {
      setLostSubmitting(false);
    }
  };

  const handleRecoverCustomer = async () => {
    setRecoverSubmitting(true);
    setRecoverMessage("");
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: "NEW" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "恢复失败");

      const remark = recoverRemark.trim();
      await fetch("/api/followups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          customer_id: id,
          type: "其他",
          content: remark ? `恢复/拣回客户：重新进入有效客户池\n${remark}` : "恢复/拣回客户：重新进入有效客户池",
          next_date: null,
        }),
      }).catch(() => null);

      setShowRecoverModal(false);
      setRecoverRemark("");
      await refreshCustomerProgress();
      await refetchFollowups();
    } catch (err: any) {
      setRecoverMessage(err.message || "恢复失败");
    } finally {
      setRecoverSubmitting(false);
    }
  };

  const openDepositModal = (mode: "manual" | "qr" = "manual", recordType: "deposit" | "design_fee" = "deposit") => {
    const receiverName = mode === "qr"
      ? branchCollectionRules?.paymentAccountName || user?.name || ""
      : user?.name || branchCollectionRules?.paymentAccountName || "";
    setDepositMode(mode);
    setDepositForm(defaultDepositForm(receiverName, recordType, branchCollectionRules?.designFeeRate || 3, customer?.area_size || ""));
    setDepositVoucherByMode({ manual: "", qr: "" });
    setEditingDepositId(null);
    setDepositMessage("");
    setShowDepositModal(true);
  };

  const openEditDepositModal = (record: DepositRecord) => {
    const mode = record.method === "qr" ? "qr" : "manual";
    setDepositMode(mode);
    setDepositForm({
      record_type: normalizePaymentRecordType(record.record_type),
      amount: String(record.amount ?? ""),
      receivable_amount: String(record.receivable_amount ?? record.amount ?? ""),
      design_fee_mode: normalizeDesignFeeMode(record.design_fee_mode),
      quotation_id: record.quotation_id || "",
      quotation_amount: record.quotation_amount ? String(record.quotation_amount) : "",
      design_fee_base_amount: record.design_fee_base_amount ? String(record.design_fee_base_amount) : "",
      design_fee_rate: record.design_fee_rate ? String(record.design_fee_rate) : String(branchCollectionRules?.designFeeRate || 3),
      design_fee_area: record.design_fee_area ? String(record.design_fee_area) : "",
      design_fee_unit_price: record.design_fee_unit_price ? String(record.design_fee_unit_price) : "",
      designer_level: record.designer_level || "",
      received_at: toDatetimeLocalValue(record.received_at),
      payment_channel: record.payment_channel || (mode === "qr" ? "扫码支付" : "微信"),
      deposit_type: record.deposit_type || (normalizePaymentRecordType(record.record_type) === "design_fee" ? "设计费" : "设计定金"),
      is_refundable: true,
      receiver_name: record.receiver_name || "",
      voucher_url: record.voucher_url || "",
      notes: record.notes || "",
    });
    setDepositVoucherByMode({
      manual: mode === "manual" ? record.voucher_url || "" : "",
      qr: mode === "qr" ? record.voucher_url || "" : "",
    });
    setEditingDepositId(record.id);
    setDepositMessage("");
    setShowDepositModal(true);
  };

  const handleDepositVoucherUpload = async (file?: File | null) => {
    if (!file) return;
    setDepositUploading(true);
    setDepositMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customer_id", id);
      formData.append("category", DEPOSIT_VOUCHER_CATEGORY);
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "上传失败");
      setDepositVoucherByMode((prev) => ({ ...prev, [depositMode]: data.file_url || "" }));
      setDepositForm((prev) => ({ ...prev, voucher_url: data.file_url || "" }));
      setDepositMessage("收款凭证已上传");
    } catch (err: any) {
      setDepositMessage(err.message || "上传失败");
    } finally {
      setDepositUploading(false);
    }
  };

  const handleSaveDeposit = async () => {
    const isDesignFee = depositForm.record_type === "design_fee";
    const paymentLabel = isDesignFee ? "设计费" : "定金";
    const amountText = String(depositForm.amount || "").trim();
    const amount = amountText ? Number(amountText) : 0;
    const receivableAmount = Number(depositForm.receivable_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setDepositMessage(`${paymentLabel}实收金额不能小于 0`);
      return;
    }
    if (!Number.isFinite(receivableAmount) || receivableAmount <= 0) {
      setDepositMessage(`${paymentLabel}应收金额必须大于 0`);
      return;
    }
    if (isDesignFee) {
      if (isQuotationBasedDesignFeeMode(depositForm.design_fee_mode)) {
        if (!depositForm.quotation_id) {
          setDepositMessage("请选择用于计算设计费的正式报价");
          return;
        }
        const rate = Number(depositForm.design_fee_rate);
        if (!Number.isFinite(rate) || rate <= 0) {
          setDepositMessage("设计费比例必须大于 0");
          return;
        }
      }
      if (depositForm.design_fee_mode === "designer_level_area") {
        if (!depositForm.designer_level) {
          setDepositMessage("请选择设计师等级");
          return;
        }
        if (!Number.isFinite(Number(depositForm.design_fee_area)) || Number(depositForm.design_fee_area) <= 0) {
          setDepositMessage("计费面积必须大于 0");
          return;
        }
        if (!Number.isFinite(Number(depositForm.design_fee_unit_price)) || Number(depositForm.design_fee_unit_price) <= 0) {
          setDepositMessage("设计师等级单价必须大于 0");
          return;
        }
      }
    }
    if (!depositForm.received_at) {
      setDepositMessage("请选择收款时间");
      return;
    }
    if (depositMode === "qr" && !branchCollectionRules?.paymentQrCodeUrl) {
      setDepositMessage("当前分公司未配置收款码，请先到分公司设置中配置");
      return;
    }

    setDepositSaving(true);
    setDepositMessage("");
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(`/api/customers/${id}/deposits`, {
        method: editingDepositId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...depositForm,
          record_id: editingDepositId || undefined,
          amount,
          receivable_amount: receivableAmount,
          quotation_amount: isDesignFee ? Number(depositForm.quotation_amount || 0) : undefined,
          design_fee_base_amount: isDesignFee ? Number(depositForm.design_fee_base_amount || 0) : undefined,
          design_fee_rate: isDesignFee ? Number(depositForm.design_fee_rate || 0) : undefined,
          design_fee_area: isDesignFee ? Number(depositForm.design_fee_area || 0) : undefined,
          design_fee_unit_price: isDesignFee ? Number(depositForm.design_fee_unit_price || 0) : undefined,
          designer_level: isDesignFee ? depositForm.designer_level : undefined,
          method: depositMode,
          payment_channel: depositMode === "qr" ? "扫码支付" : depositForm.payment_channel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "保存失败");
      setDepositRecords((prev) => {
        if (editingDepositId) {
          return prev.map((record) => record.id === editingDepositId ? data : record);
        }
        return [data, ...prev];
      });
      setShowDepositModal(false);
      setDepositForm(defaultDepositForm());
      setEditingDepositId(null);
      setDepositMessage(data.status === "pending_approval" ? `${paymentLabel}已提交审批，审批通过后计入已收款` : editingDepositId ? `${paymentLabel}记录已保存` : `${paymentLabel}记录已保存`);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
    } catch (err: any) {
      setDepositMessage(err.message || "保存失败");
    } finally {
      setDepositSaving(false);
    }
  };

  const openTopUpModal = (record: DepositRecord) => {
    const blockedReason = getDepositTopUpBlockedReason(record);
    if (blockedReason) {
      setDepositMessage(blockedReason);
      return;
    }
    const remaining = getDepositRemainingReceiveAmount(record);
    setTopUpModalRecord(record);
    setTopUpAmount(remaining ? String(remaining) : "");
    setTopUpReceivedAt(toDatetimeLocalValue());
    setTopUpPaymentChannel(record.method === "qr" ? "扫码支付" : record.payment_channel || "微信");
    setTopUpReceiverName(user?.name || record.receiver_name || "");
    setTopUpVoucherUrl("");
    setTopUpNotes("");
    setDepositMessage("");
  };

  const handleTopUpVoucherUpload = async (file?: File | null) => {
    if (!file) return;
    setTopUpUploading(true);
    setDepositMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customer_id", id);
      formData.append("category", DEPOSIT_VOUCHER_CATEGORY);
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "上传失败");
      setTopUpVoucherUrl(data.file_url || "");
      setDepositMessage("补收凭证已上传");
    } catch (err: any) {
      setDepositMessage(err.message || "上传失败");
    } finally {
      setTopUpUploading(false);
    }
  };

  const handleSaveTopUp = async () => {
    if (!topUpModalRecord) return;
    const amount = Number(topUpAmount);
    const remaining = getDepositRemainingReceiveAmount(topUpModalRecord);
    const label = getPaymentRecordLabel(topUpModalRecord);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDepositMessage("补收金额必须大于 0");
      return;
    }
    if (amount > remaining + 0.005) {
      setDepositMessage(`补收金额不能大于待补金额 ${formatPlainAmount(remaining)}`);
      return;
    }
    if (!topUpReceivedAt) {
      setDepositMessage("请选择补收时间");
      return;
    }
    if (!topUpPaymentChannel.trim()) {
      setDepositMessage("请选择补收方式");
      return;
    }
    setTopUpSaving(true);
    setDepositMessage("");
    try {
      const res = await fetch(`/api/customers/${id}/deposits`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          action: "top_up_payment",
          record_id: topUpModalRecord.id,
          amount,
          received_at: topUpReceivedAt,
          payment_channel: topUpPaymentChannel,
          receiver_name: topUpReceiverName,
          voucher_url: topUpVoucherUrl,
          notes: topUpNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "补收失败");
      setDepositRecords((prev) => prev.map((record) => record.id === topUpModalRecord.id ? data : record));
      setTopUpModalRecord(null);
      setTopUpAmount("");
      setTopUpVoucherUrl("");
      setTopUpNotes("");
      setDepositMessage(data.approval?.status === "pending" ? `补收${label}已提交审批，审批通过后计入实收` : `${label}补收已保存`);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
    } catch (err: any) {
      setDepositMessage(err.message || "补收失败");
    } finally {
      setTopUpSaving(false);
    }
  };

  const openWaiverModal = (record: DepositRecord) => {
    const blockedReason = getDepositWaiverBlockedReason(record);
    if (blockedReason) {
      setDepositMessage(blockedReason);
      return;
    }
    const remaining = getDepositRemainingReceiveAmount(record);
    setWaiverModalRecord(record);
    setWaiverAmount(remaining ? String(remaining) : "");
    setWaiverReason("");
    setWaiverNotes("");
    setDepositMessage("");
  };

  const handleWaiverRequest = async () => {
    if (!waiverModalRecord) return;
    const amount = Number(waiverAmount);
    const remaining = getDepositRemainingReceiveAmount(waiverModalRecord);
    const label = getPaymentRecordLabel(waiverModalRecord);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDepositMessage("减免金额必须大于 0");
      return;
    }
    if (amount > remaining + 0.005) {
      setDepositMessage(`减免金额不能大于待收金额 ${formatPlainAmount(remaining)}`);
      return;
    }
    if (!waiverReason.trim()) {
      setDepositMessage("请填写尾款减免原因");
      return;
    }
    setWaiverSaving(true);
    setDepositMessage("");
    try {
      const res = await fetch(`/api/customers/${id}/deposits`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          action: "waiver_request",
          record_id: waiverModalRecord.id,
          waiver_amount: amount,
          waiver_reason: waiverReason.trim(),
          notes: waiverNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "尾款减免提交失败");
      setDepositRecords((prev) => prev.map((record) => record.id === waiverModalRecord.id ? data : record));
      setWaiverModalRecord(null);
      setWaiverAmount("");
      setWaiverReason("");
      setWaiverNotes("");
      setDepositMessage(data.waiver_status === "pending_approval" ? `${label}尾款减免已提交审批` : `${label}尾款减免已保存`);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
    } catch (err: any) {
      setDepositMessage(err.message || "尾款减免提交失败");
    } finally {
      setWaiverSaving(false);
    }
  };

  const openDepositApprovalDetail = (record: DepositRecord, view: "initial" | "top_up" | "waiver" = "initial", approvalId = "") => {
    const topUpApprovals = record.top_up_approvals || [];
    const waiverApprovals = record.waiver_approvals || [];
    const fallbackTopUpId = approvalId || topUpApprovals[0]?.id || "";
    const fallbackWaiverId = approvalId || waiverApprovals[0]?.id || "";
    setDepositApprovalFlowView(view === "top_up" && fallbackTopUpId ? "top_up" : view === "waiver" && fallbackWaiverId ? "waiver" : "initial");
    setSelectedTopUpApprovalId(fallbackTopUpId);
    setSelectedWaiverApprovalId(fallbackWaiverId);
    setDepositApprovalDetailRecord(record);
  };

  const openRefundModal = (record: DepositRecord) => {
    const remaining = getDepositRemainingRefundAmount(record);
    setRefundModalRecord(record);
    setRefundAmount(String(remaining || record.amount || ""));
    setRefundReason("");
    setDepositMessage("");
  };

  const handleRefundRequest = async () => {
    if (!refundModalRecord) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDepositMessage("退款金额必须大于 0");
      return;
    }
    const remainingAmount = getDepositRemainingRefundAmount(refundModalRecord);
    if (amount > remainingAmount) {
      setDepositMessage(`退款金额不能大于剩余可退金额 ${formatPlainAmount(remainingAmount)}`);
      return;
    }
    if (!refundReason.trim()) {
      setDepositMessage(`请填写${getRefundActionLabel(refundModalRecord)}原因`);
      return;
    }
    setRefundSaving(true);
    setDepositMessage("");
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(`/api/customers/${id}/deposits`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "refund_request",
          record_id: refundModalRecord.id,
          refund_amount: amount,
          refund_reason: refundReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "申请失败");
      setDepositRecords((prev) => prev.map((record) => record.id === refundModalRecord.id ? data : record));
      setRefundModalRecord(null);
      setRefundAmount("");
      setRefundReason("");
      const refundLabel = getRefundActionLabel(data);
      setDepositMessage(data.refund_status === "pending_approval" ? `${refundLabel}申请已提交审批` : `已提交${refundLabel}申请`);
      await refreshCustomerProgress();
      window.dispatchEvent(new Event("todos:changed"));
    } catch (err: any) {
      setDepositMessage(err.message || "申请失败");
    } finally {
      setRefundSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="-m-5 flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f5f7fa] p-5 lg:-m-7 lg:p-7">
        <div className="flex min-h-40 w-full max-w-xl items-center justify-center rounded-[12px] border border-[#e2e7ee] bg-white text-sm font-medium text-[#667085]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#2f6feb]" />
          正在加载客户详情...
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="-m-5 flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f5f7fa] p-5 lg:-m-7 lg:p-7">
        <div className="flex min-h-52 w-full max-w-xl flex-col items-center justify-center rounded-[12px] border border-dashed border-[#cfd7e3] bg-white px-6 text-center">
          <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f1f4f8] text-[#667085]">
            <User className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-[#182230]">客户不存在或已删除</p>
          <p className="mt-1 text-xs leading-5 text-[#667085]">该客户可能已被删除，或当前账号没有查看权限。</p>
          <Link href="/projects" className="mt-4 inline-flex min-h-9 items-center rounded-[8px] border border-[#e2e7ee] bg-white px-3 text-sm font-medium text-[#475467] transition hover:border-[#cfd7e3] hover:bg-[#f8fafc] hover:text-[#182230]">返回客户管理</Link>
        </div>
      </div>
    );
  }

  const customerDetailContentStyle = customerDetailContentHeight > 0 ? { height: `${customerDetailContentHeight}px` } : undefined;

  return (
    <>
    <div className={`${pageClass} customer-detail-soft-ui`}>
    <div className="w-full space-y-4">
      <Link href="/projects" className="inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-1 text-sm font-medium text-[#667085] transition hover:text-[#2f6feb] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#2f6feb]/20">
        <ArrowLeft className="h-4 w-4" />
        返回客户列表
      </Link>

      <section className={panelClass} data-customer-summary>
        <div className="border-b border-[#e2e7ee] px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-xl font-semibold text-[#182230]">{customer.name || "未命名客户"}</h1>
                  <StatusBadge status={normalizeCustomerStatus(customer.status).toLowerCase()} label={customerStatusLabels[normalizeCustomerStatus(customer.status)] || customer.status} />
                  <span className="inline-flex h-[22px] items-center rounded-full border border-[#e2e7ee] bg-[#f1f4f8] px-2 text-xs font-medium text-[#475467]">
                    {customer.source || "未填写来源"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-[#667085]">
                  {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>}
                  {customer.weixin && <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{customer.weixin}</span>}
                  {(customerRoomDisplay || customerHouseAddress) && <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{customerRoomDisplay || customerHouseAddress}</span></span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canEditCustomerProfile && (
                <button className={detailActionButtonClass} onClick={() => setShowCustomerEditModal(true)}>
                  <Pencil className="h-4 w-4" />
                  编辑客户
                </button>
              )}
              {canMarkCustomerLost && (
                <button
                  className={dangerActionButtonClass}
                  onClick={() => {
                    setLostMessage("");
                    setShowLostModal(true);
                  }}
                >
                  <CircleX className="h-4 w-4" />
                  标记流失/失败
                </button>
              )}
              {canRecoverCustomer && (
                <button
                  className={successActionButtonClass}
                  onClick={() => {
                    setRecoverMessage("");
                    setShowRecoverModal(true);
                  }}
                >
                  <CircleCheck className="h-4 w-4" />
                  恢复/拣回
                </button>
              )}
              <button className={detailActionButtonClass}><Phone className="h-4 w-4" />联系客户</button>
            </div>
          </div>
        </div>

        {/* ===== Tab Bar ===== */}
        <div className="system-page-tabs" data-customer-tabs aria-label="客户详情导航">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                data-active={isActive ? "true" : undefined}
                aria-current={isActive ? "page" : undefined}
                className="system-page-tab"
              >
                <Icon className="system-page-tab-icon" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ===== Tab Content ===== */}

      {/* ---- Tab: 客户信息 ---- */}
      {activeTab === "info" && (
        <div ref={customerDetailContentRef} className={`grid items-stretch gap-4 max-lg:!h-auto ${CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]`} style={customerDetailContentStyle} data-customer-info-layout>
          <div className="flex min-h-0 flex-col gap-4 lg:h-full">
            {/* Lifecycle Progress */}
            <div className={`${panelClass} shrink-0 p-5`} data-customer-progress>
              <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold text-surface-900">
                <Layers className="h-4 w-4 text-[#2f6feb]" /> 客户生命周期
              </h3>
              {isLostLifecycle ? (
                <div className="flex min-h-10 items-center gap-2 rounded-[8px] border border-red-100 bg-red-50 px-3 text-sm text-red-700" data-customer-lifecycle-lost>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" />
                  <span className="font-semibold">失败/流失</span>
                  <span className="text-red-600">客户已脱离正常生命周期，可记录原因用于后续复盘。</span>
                </div>
              ) : (
                <>
                  <div>
                    <div data-customer-lifecycle>
                      {allStages.map((stage, idx) => {
                        const lifecycleState = idx < currentIdx ? "done" : idx === currentIdx ? "current" : "upcoming";
                        return (
                          <button
                            key={stage.key}
                            type="button"
                            aria-label={`查看${stage.label}完成记录`}
                            aria-pressed={selectedLifecycleStage?.key === stage.key}
                            data-lifecycle-node
                            data-state={lifecycleState}
                            data-selected={selectedLifecycleStage?.key === stage.key ? "true" : "false"}
                            onClick={() => setSelectedLifecycleStageKey(stage.key)}
                          >
                            <span data-lifecycle-dot>
                              {lifecycleState === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span>{idx + 1}</span>}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span data-lifecycle-label>{stage.label}</span>
                              <span data-lifecycle-hint>{lifecycleState === "current" ? "当前阶段" : "查看记录"}</span>
                            </span>
                            <ArrowRight data-lifecycle-arrow className="h-3.5 w-3.5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-4">
                    {lifecycleCompletionsLoading ? (
                      <div className="flex min-h-[52px] items-center rounded-[10px] border border-[#e2e7ee] bg-[#f8fafc] px-3.5 text-sm font-medium text-[#667085]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#2f6feb]" /> 正在加载完成记录...
                      </div>
                    ) : lifecycleCompletionsError ? (
                      <div className="flex min-h-[52px] items-center rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-amber-700">
                        <AlertTriangle className="mr-2 h-4 w-4" /> 完成记录暂时无法加载
                      </div>
                    ) : (
                      <div className="flex min-h-[74px] flex-col justify-center rounded-[12px] border border-[#dfe7f1] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3 text-sm text-[#475467] shadow-[0_1px_0_rgba(15,23,42,0.03)] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${selectedLifecycleReached ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#d7dee9] bg-white text-[#8a97a8]"}`}>
                            {selectedLifecycleReached ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-xs font-semibold text-[#8a97a8]">当前查看</span>
                              <strong className="text-[15px] font-black text-[#182230]">{selectedLifecycleStage?.label || "未分配状态"}</strong>
                              {selectedLifecycleStage && (
                                <span className={`inline-flex h-5 items-center rounded-full border px-1.5 text-[11px] font-bold ${selectedLifecycleReached ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#d7dee9] bg-white text-[#667085]"}`}>
                                  {selectedLifecycleReached ? "已完成" : "未完成"}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#667085]">
                              {selectedLifecycleStage && selectedLifecycleReached && selectedLifecycleCompletion?.completed_at ? (
                                <>
                                  <span>完成人：<strong className="font-semibold text-[#344054]">{selectedLifecycleCompletion.operator_name || "未知用户"}</strong></span>
                                  <span className="text-[#c5ccd6]">|</span>
                                  <Clock className="h-3.5 w-3.5" />
                                  <span className="tabular-nums">{formatDateTime(selectedLifecycleCompletion.completed_at)}</span>
                                </>
                              ) : selectedLifecycleStage && selectedLifecycleReached ? (
                                <span>该阶段已完成，暂无历史完成人记录</span>
                              ) : selectedLifecycleStage ? (
                                <span>{lifecycleStageDescriptions[selectedLifecycleStage.key]}</span>
                              ) : (
                                <span>尚未分配状态</span>
                              )}
                            </div>
                            {selectedLifecyclePrimaryAction && (
                              <p className="mt-1 text-xs font-medium text-[#8a97a8]">
                                下一步建议：{selectedLifecycleReached ? "查看该阶段相关记录" : selectedLifecyclePrimaryAction.label}
                              </p>
                            )}
                          </div>
                        </div>
                        {selectedLifecyclePrimaryAction && (
                          <button
                            type="button"
                            onClick={() => setActiveTab(selectedLifecyclePrimaryAction.tab)}
                            className="mt-3 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-[#d6e4ff] bg-white px-3.5 text-xs font-bold text-[#2f6feb] transition hover:border-[#adc8ff] hover:bg-[#edf4ff] sm:mt-0"
                          >
                            {selectedLifecycleReached ? "查看记录" : selectedLifecyclePrimaryAction.label}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Customer Info */}
            <div className={`${panelClass} flex min-h-0 flex-1 flex-col p-5`} data-customer-info-panel>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-surface-900">
                <CustomerProfileIcon className="h-5 w-5" /> 客户信息
              </h3>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-x-6 text-sm md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-customer-info-grid>
                <InfoRow icon={CustomerProfileIcon} iconBadgeClassName="material-category-icon-general" label="客户姓名" value={customer.name} />
                <InfoRow icon={MobilePhoneIcon} iconBadgeClassName="material-category-icon-strong-cable" label="手机号" value={customer.phone} />
                <InfoRow icon={WechatBubbleIcon} iconBadgeClassName="material-category-icon-sanitary" label="微信号" value={customer.weixin || "-"} />
                <InfoRow icon={CommunityIcon} iconBadgeClassName="material-category-icon-cement" label="小区/楼盘" value={customer.address || customer.area || "-"} />
                <InfoRow icon={RoomCardIcon} iconBadgeClassName="material-category-icon-tile" label="房号" value={customerRoomNumber || "-"} />
                <InfoRow icon={AddressPinIcon} iconBadgeClassName="material-category-icon-drain-pipe" label="房屋地址" value={customerHouseAddress || "-"} />
                <InfoRow icon={BuildingNoIcon} iconBadgeClassName="material-category-icon-board" label="楼栋" value={customer.no_room_number ? "暂无房号" : customer.building_no || "-"} />
                <InfoRow icon={UnitDoorIcon} iconBadgeClassName="material-category-icon-door" label="单元" value={customer.no_room_number ? "暂无房号" : customer.unit_no || "-"} />
                <InfoRow icon={BedroomIcon} iconBadgeClassName="material-category-icon-floor-door" label="房室" value={customer.no_room_number ? "暂无房号" : customer.room_no || "-"} />
                <InfoRow icon={AreaMeasureIcon} iconBadgeClassName="material-category-icon-tile-stone" label="装修面积" value={customer.area_size ? `${customer.area_size}㎡` : "-"} />
                <InfoRow icon={LayoutIcon} iconBadgeClassName="material-category-icon-floor" label="户型" value={customer.house_type || "-"} />
                <InfoRow icon={DeliveryCheckIcon} iconBadgeClassName="material-category-icon-breaker" label="是否交房" value={customer.is_delivered ? "已交房" : "未交房"} />
                <InfoRow icon={DecorationIcon} iconBadgeClassName="material-category-icon-carpentry" label="装修类型" value={customer.decoration_type || "-"} />
                <InfoRow icon={BudgetCoinIcon} iconBadgeClassName="material-category-icon-wood" label="装修预算" value={customer.budget ? formatCurrency(customer.budget) : "-"} />
                <InfoRow icon={IntentionStarIcon} iconBadgeClassName="material-category-icon-lighting" label="客户意向" value={customer.intention || "-"} />
                <InfoRow icon={SourceCompassIcon} iconBadgeClassName="material-category-icon-pipe" label="客户来源" value={customer.source || "-"} />
                <InfoRow icon={StoreFrontIcon} iconBadgeClassName="material-category-icon-cabinet" label="服务门店" value={customer.service_store || "-"} />
                <InfoRow icon={AdvisorIcon} iconBadgeClassName="material-category-icon-sanitary" label="家装顾问" value={advisorName || "-"} />
                <InfoRow icon={DepartmentIcon} iconBadgeClassName="material-category-icon-weak-box" label="业务部门" value={businessDepartmentName || "-"} />
                <InfoRow icon={DesignerPenIcon} iconBadgeClassName="material-category-icon-paint" label="设计师" value={designerName || "-"} />
                <InfoRow icon={DepartmentIcon} iconBadgeClassName="material-category-icon-weak-box" label="设计部门" value={designDepartmentName || "-"} />
                <InfoRow icon={CreateTimeIcon} iconBadgeClassName="material-category-icon-general" label="创建时间" value={formatDate(customer.created_at)} />
              </div>
              {(customer.requirements || customer.remarks) && (
                <div className="mt-4 space-y-3 border-t border-surface-100 pt-4">
                  {customer.requirements && <div><p className="mb-1 text-xs font-medium text-surface-500">装修需求</p><p className="text-sm text-surface-700">{customer.requirements}</p></div>}
                  {customer.remarks && <div><p className="mb-1 text-xs font-medium text-surface-500">备注</p><p className="text-sm text-surface-700">{customer.remarks}</p></div>}
                </div>
              )}
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="flex min-h-0 lg:h-full">
            <div className={`${panelClass} flex min-h-0 flex-1 flex-col`} data-service-team>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e2e7ee] bg-[#f8fafc] px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-[#cfe0ff]">
                    <User className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#182230]">服务团队</h3>
                    <p className="mt-0.5 text-xs font-normal text-[#667085]">核心岗位与其他参与人员</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[#f1f4f8] px-2.5 py-1 text-xs font-medium text-[#475467] ring-1 ring-[#e2e7ee]">
                  {serviceTeamAssignedCount}/{serviceTeamSlotCount}
                </span>
              </div>
              {teamMessage && (
                <div className="mx-4 mt-4 rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  {teamMessage}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="space-y-3">
                  {defaultTeamRoles.map((dr) => {
                    const assigned = getTeamAssignment(dr.role);
                    const isAdvisorRole = dr.role === "ADVISOR";
                    const requiresDesignerAssignmentFlow = dr.role === "DESIGNER" && (designerAssignmentMode === "approval" || designerAssignmentMode === "dispatch");
                    const isLoadingAssignmentMode = dr.role === "DESIGNER" && designerAssignmentMode === "loading";
                    const pendingDesignerRequest = dr.role === "DESIGNER" && hasActiveDesignerAssignment;
                    const statusText = pendingDesignerRequest
                      ? designerAssignmentStatus === "pending_dispatch"
                        ? "待分派"
                        : designerAssignmentStatus === "pending_handler"
                          ? "处理中"
                          : "审批中"
                      : assigned?.isManual
                        ? "手动分配"
                        : assigned && dr.role === "PM"
                          ? "来自工地"
                          : assigned
                            ? "系统默认"
                            : requiresDesignerAssignmentFlow
                              ? "需申请"
                              : "待分配";
                    const statusClass = pendingDesignerRequest
                      ? "bg-amber-50 text-amber-700 ring-amber-100"
                      : assigned
                        ? "bg-[#f8fafc] text-[#52647b] ring-[#e4eaf3]"
                        : "bg-[#f1f5f9] text-[#7c8aa0] ring-[#e2e8f0]";
                    const teamPrimaryActionClass = "inline-flex h-9 shrink-0 items-center justify-center rounded-[8px] bg-transparent px-3 text-xs font-medium leading-none text-[#2f6feb] transition hover:bg-[#edf4ff]";
                    const teamMutedActionClass = "inline-flex h-9 shrink-0 items-center justify-center rounded-[8px] bg-[#f1f4f8] px-3 text-xs font-medium leading-none text-[#98a2b3]";
                    const teamDangerActionClass = "inline-flex h-9 shrink-0 items-center justify-center rounded-[8px] border border-red-100 bg-white px-3 text-xs font-medium leading-none text-red-600 transition hover:bg-red-50";
                    return (
                      <div key={dr.role} className="rounded-[8px] border border-[#e2e7ee] bg-white px-3.5 py-3 transition hover:border-[#cfd7e3] hover:bg-[#f8fafc]" data-team-row>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className={"flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ring-1 " + (assigned ? "bg-[#f8fafc] text-[#667085] ring-[#e2e7ee]" : "bg-[#f1f4f8] text-[#98a2b3] ring-[#e2e7ee]")}>
                            {assigned?.avatar ? (
                              <NativeImage src={assigned.avatar} alt={`${assigned.name || "团队成员"}头像`} className="h-full w-full object-cover" />
                            ) : assigned ? (assigned.name?.charAt(0) || "?") : "?"}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-[#162033]">{dr.label}</p>
                                <span className={`inline-flex h-[22px] items-center gap-1.5 rounded-[8px] px-2 text-[11px] font-medium ring-1 ${statusClass}`} data-team-status>
                                  {statusText}
                                </span>
                              </div>
                              <p className={"mt-1 truncate text-sm font-semibold " + (assigned ? "text-[#52647b]" : "text-[#9aa8bb]")}>{assigned ? assigned.name : "暂未分配人员"}</p>
                              {pendingDesignerRequest && designerAssignmentRequest?.preferred_designer_name && (
                                <p className="mt-1 truncate text-xs font-semibold text-amber-700">意向设计师：{designerAssignmentRequest.preferred_designer_name}</p>
                              )}
                              {pendingDesignerRequest && designerAssignmentRequest?.handler_name && (
                                <p className="mt-1 truncate text-xs font-semibold text-[#52647b]">当前处理人：{designerAssignmentRequest.handler_name}</p>
                              )}
                            </div>
                          </div>
                          {isAdvisorRole && assigned && canEditServiceAdvisor ? (
                          <button className={teamPrimaryActionClass} onClick={() => setAssignModalRole(dr.role)}>修改</button>
                        ) : isAdvisorRole && !assigned && canEditServiceAdvisor ? (
                          <button className={teamPrimaryActionClass} onClick={() => setAssignModalRole(dr.role)}>分配</button>
                        ) : isAdvisorRole ? (
                          <span className={teamMutedActionClass}>已锁定</span>
                        ) : assigned && assigned.isManual ? (
                          <button className={teamDangerActionClass} onClick={() => requestTeamRemoval(dr.role, assigned.name || "该人员", dr.label)}>移除</button>
                        ) : assigned ? (
                          <span className={teamMutedActionClass}>自动</span>
                        ) : isLoadingAssignmentMode ? (
                          <span className={`${teamMutedActionClass} gap-1`}><Loader2 className="h-3 w-3 animate-spin" />加载</span>
                        ) : pendingDesignerRequest ? (
                          <button
                            type="button"
                            className="inline-flex h-9 shrink-0 items-center justify-center bg-amber-50 px-3 text-xs font-black leading-none text-amber-700 ring-1 ring-amber-100 transition hover:bg-amber-100 hover:text-amber-800"
                            onClick={async () => {
                              await refreshDesignerAssignmentRequest();
                              setShowDesignerAssignmentFlow(true);
                            }}
                          >
                            已申请
                          </button>
                        ) : requiresDesignerAssignmentFlow ? (
                          <button className={teamPrimaryActionClass} onClick={() => setShowDesignerRequestModal(true)}>申请分配</button>
                        ) : (
                          <button className={teamPrimaryActionClass} onClick={() => setAssignModalRole(dr.role)}>分配</button>
                        )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {additionalMembers.length > 0 && (
                  <div className="mt-4 border-t border-[#e7eff9] pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-black text-[#52647b]">其他人员</p>
                      <span className="bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-black text-[#7c8aa0]">{additionalMembers.length} 人</span>
                    </div>
                    <div className="space-y-2">
                      {additionalMembers.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#e2e7ee] bg-white px-3 py-2.5 transition hover:border-[#cfd7e3] hover:bg-[#f8fafc]" data-team-row>
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f8fafc] text-xs font-semibold text-[#667085] ring-1 ring-[#e2e7ee]">
                              {m.user_avatar ? (
                                <NativeImage src={m.user_avatar} alt={`${m.user_name || "团队成员"}头像`} className="h-full w-full object-cover" />
                              ) : (
                                (m.user_name || "?")[0]
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-[#162033]">{m.user_name}</p>
                              <p className="text-xs font-semibold text-[#7c8aa0]">{m.role}</p>
                            </div>
                          </div>
                          <button className="shrink-0 rounded-[8px] border border-red-100 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50" onClick={() => requestTeamRemoval(m.role, m.user_name || "该人员", m.role || "其他人员")}>移除</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-4 border-t border-[#e7eff9] pt-4">
                  <button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#afc6ff] bg-white text-sm font-medium text-[#2f6feb] transition hover:border-[#2f6feb] hover:bg-[#edf4ff] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#2f6feb]/20" onClick={() => setShowAddPersonnel(true)}>
                    <Plus className="h-4 w-4" />
                    添加其他人员
                  </button>
                </div>
              </div>
            </div>


          </div>
        </div>
      )}

      {/* ---- Tab: 跟进记录 ---- */}
      {activeTab === "followup" && (
        <div ref={customerDetailContentRef} className={`grid items-stretch gap-4 max-xl:!h-auto ${CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} xl:grid-cols-[minmax(440px,1fr)_minmax(0,1.7fr)]`} style={customerDetailContentStyle} data-followup-workbench>
          <section className={`${panelClass} relative order-1 flex h-auto min-h-[520px] flex-col xl:h-full xl:min-h-0`} aria-labelledby="followup-composer-title">
            <input
              ref={followAttachmentInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (event) => {
                const input = event.currentTarget;
                await handleFollowAttachmentUpload(input.files);
                input.value = "";
              }}
            />
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e2e7ee] bg-[#f8fafc] px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${replyingToFollowup ? "bg-[#eef4ff] text-[#2f6feb]" : "bg-[#f0fdf4] text-[#17a34a]"}`}>
                  {replyingToFollowup ? <Reply className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <h3 id="followup-composer-title" className="text-[15px] font-semibold text-[#182230]">{replyingToFollowup ? "回复跟进" : "记录本次跟进"}</h3>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">{replyingToFollowup ? `回复 ${replyingToFollowup.user_name || "团队成员"}` : "补充沟通结果和后续安排"}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFollowupTemplates((open) => !open)}
                  aria-expanded={showFollowupTemplates}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs font-medium transition-colors ${showFollowupTemplates ? "border-[#afc6ff] bg-[#edf4ff] text-[#2f6feb]" : "border-[#e2e7ee] bg-white text-[#475467] hover:border-[#cfd7e3] hover:bg-white"}`}
                >
                  <ClipboardList className="h-4 w-4" />
                  快捷话术
                  <ChevronDown className={`h-4 w-4 transition-transform ${showFollowupTemplates ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {showFollowupTemplates && (
              <>
              <button type="button" className="absolute inset-0 z-20 cursor-default bg-transparent" onClick={() => setShowFollowupTemplates(false)} aria-label="收起快捷话术" />
              <div className="absolute right-3 top-[68px] z-30 max-h-[calc(100%-84px)] w-[calc(100%-24px)] overflow-y-auto rounded-[12px] border border-[#d9e2ef] bg-white p-3 shadow-[0_8px_24px_rgba(17,24,39,0.12)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#182230]">快捷话术</p>
                    <p className="mt-0.5 text-xs text-[#667085]">选择场景后插入正文</p>
                  </div>
                  <button type="button" onClick={() => setShowFollowupTemplates(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭快捷话术"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {followupTemplateGroups.map((group) => {
                    const tone = getFollowupSceneTone(group.key);
                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => setFollowForm((previous) => ({ ...previous, scene: previous.scene === group.key ? "" : group.key }))}
                        aria-pressed={followForm.scene === group.key}
                        className={`min-h-8 rounded-[8px] border px-2.5 text-xs font-medium transition-colors ${
                          followForm.scene === group.key
                            ? tone.selected
                            : "border-[#e2e7ee] bg-white text-[#475467] hover:border-[#cfd7e3] hover:bg-[#f8fafc]"
                        }`}
                      >
                        {group.label}
                      </button>
                    );
                  })}
                </div>
                {activeFollowupTemplates ? (
                  <div className="mt-3 grid gap-2">
                    {activeFollowupTemplates.templates.map((template, index) => (
                      <button
                        key={`${activeFollowupTemplates.key}-${index}`}
                        type="button"
                        onClick={() => { insertFollowupTemplate(template); setShowFollowupTemplates(false); }}
                        className="group flex min-w-0 items-start gap-3 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-3 py-2.5 text-left transition-colors hover:border-[#afc6ff] hover:bg-[#edf4ff]"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-white text-[11px] font-semibold text-[#667085] ring-1 ring-inset ring-[#e2e7ee]">{index + 1}</span>
                        <span className="min-w-0 flex-1 text-xs leading-5 text-[#475467]">{template}</span>
                        <Plus className="mt-0.5 h-4 w-4 shrink-0 text-[#98a2b3] group-hover:text-[#2f6feb]" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-[8px] bg-[#f8fafc] px-3 py-4 text-center text-xs text-[#98a2b3]">请选择一个跟进场景</div>
                )}
              </div>
              </>
            )}

            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-4 shrink-0">
                <label className="mb-1.5 block text-xs font-medium text-[#667085]">跟进方式</label>
                <div className="grid grid-cols-5 gap-1 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] p-1">
                  {followupTypes.map((ft) => {
                    const tone = getFollowupTypeTone(ft.value);
                    return (
                      <button
                        key={ft.value}
                        type="button"
                        onClick={() => setFollowForm({ ...followForm, type: ft.value })}
                        aria-pressed={followForm.type === ft.value}
                        className={`inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-[6px] border px-1 text-xs font-medium transition-colors ${
                          followForm.type === ft.value
                            ? tone.selected
                            : "border-transparent text-[#667085] hover:bg-white hover:text-[#182230]"
                        }`}
                      >
                        <IconfontFollowupIcon type={ft.icon} className="h-4 w-4 shrink-0" /><span className="truncate">{ft.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {replyingToFollowup && (
                <div className="mb-3 flex items-center gap-3 rounded-[8px] border border-[#cfe0ff] bg-[#edf4ff] px-3 py-2.5 text-sm text-[#2f6feb]">
                  <Reply className="h-4 w-4 shrink-0" />
                  <span className="shrink-0 font-semibold">回复 {replyingToFollowup.user_name || "团队成员"}</span>
                  <span className="min-w-0 flex-1 truncate text-[#52647b]">{replyingToFollowup.content || "这条跟进记录"}</span>
                  <button type="button" onClick={handleCancelReplyFollowup} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-white hover:text-[#182230]" aria-label="取消回复">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col">
                  <label htmlFor="followup-content" className="mb-1.5 block text-sm font-medium text-[#344054]">跟进内容</label>
                  <div className="relative min-h-0 flex-1">
                    <textarea
                      id="followup-content"
                      ref={textareaRef}
                      value={followForm.content}
                      onChange={(e) => handleContentChange(e.target.value)}
                      onKeyDown={handleContentKeyDown}
                      onScroll={(event) => {
                        if (mentionStart < 0) return;
                        const target = event.currentTarget;
                        updateMentionMenuPosition(target.value, target.selectionStart ?? target.value.length, mentionFiltered.length);
                      }}
                      className="input-field h-full min-h-[320px] resize-none px-3.5 py-3 leading-6"
                      placeholder="记录客户反馈、沟通结论和待办事项，可输入 @ 提及服务团队成员"
                      rows={12}
                    />
                    {mentionStart >= 0 && mentionFiltered.length > 0 && (
                      <div className="absolute z-20 max-h-72 overflow-y-auto rounded-[12px] border border-[#e2e7ee] bg-white py-1 shadow-[0_2px_8px_rgba(17,24,39,0.08)]" style={mentionMenuPosition}>
                        {mentionFiltered.map((m, i) => (
                          <button
                            key={m.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertMention(m)}
                            className={`flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm transition-colors ${i === mentionIndex ? "bg-[#edf4ff] text-[#182230]" : "text-[#344054] hover:bg-[#f8fafc]"}`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#edf4ff] text-xs font-semibold text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
                              {m.avatar ? (
                                <NativeImage src={m.avatar} alt={`${m.name || "团队成员"}头像`} className="h-full w-full object-cover" />
                              ) : (
                                (m.name || "?")[0]
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                            <span className="shrink-0 text-xs text-[#98a2b3]">{roleLabels[String(m.role || "")] || m.role || "团队成员"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {followForm.attachments.length > 0 && (
                  <div className="mt-4 grid max-h-32 shrink-0 gap-2 overflow-y-auto border-t border-[#e2e7ee] pt-4">
                    {followForm.attachments.map((file) => (
                      <div key={file.id} className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-2.5">
                        {isImageAttachment(file) ? <ImageIcon className="h-4 w-4 shrink-0 text-[#667085]" /> : <FileText className="h-4 w-4 shrink-0 text-[#667085]" />}
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#475467]">{file.file_name}</span>
                        <span className="shrink-0 text-[11px] text-[#98a2b3]">{formatFileSize(file.file_size)}</span>
                        <button type="button" onClick={() => handleRemovePendingFollowAttachment(file.id)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[#98a2b3] hover:bg-red-50 hover:text-red-600" title="移除附件" aria-label={`移除附件 ${file.file_name}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-auto grid shrink-0 grid-cols-2 gap-3 border-t border-[#e2e7ee] pt-4">
                  <div className="flex min-w-0 flex-col">
                    <label htmlFor="next-date-picker" className="mb-1.5 flex h-5 items-center text-sm font-medium text-[#344054]">下次跟进时间</label>
                    <SystemDateInput id="next-date-picker" value={followForm.next_date} onChange={(nextValue) => setFollowForm({ ...followForm, next_date: nextValue })} className="input-field !h-10 !min-h-10 cursor-pointer !py-0" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <div className="mb-1.5 flex h-5 items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[#344054]">附件</span>
                      {followForm.attachments.length > 0 && <span className="text-xs text-[#667085]">{followForm.attachments.length} 个待保存</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => followAttachmentInputRef.current?.click()}
                      disabled={followAttachmentUploading}
                      className="inline-flex h-10 min-h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#cfd7e3] bg-[#f8fafc] px-3 py-0 text-sm font-medium text-[#475467] transition-colors hover:border-[#afc6ff] hover:bg-[#edf4ff] hover:text-[#2f6feb] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {followAttachmentUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                      {followAttachmentUploading ? "上传中..." : "添加附件"}
                    </button>
                    {followAttachmentMessage && <p className={`mt-1.5 text-xs ${followAttachmentMessage.includes("失败") ? "text-red-600" : "text-emerald-600"}`}>{followAttachmentMessage}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddFollowup}
                    disabled={followSubmitting || followAttachmentUploading || (!followForm.content.trim() && followForm.attachments.length === 0)}
                    className="btn-primary col-span-2 min-h-10 w-full"
                  >
                    {followSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {followSubmitting ? "保存中..." : replyingToFollowup ? "提交回复" : "保存跟进"}
                  </button>
                </div>
              </div>

            </div>
          </section>

          <section className={`${panelClass} order-2 flex h-[520px] min-h-0 flex-col xl:h-full`} aria-labelledby="followup-timeline-title">
            <div className="flex shrink-0 flex-col gap-2 border-b border-[#e2e7ee] bg-[#f8fafc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><MessageCircle className="h-4 w-4" /></span>
                <div>
                  <h3 id="followup-timeline-title" className="text-[15px] font-semibold text-[#182230]">跟进动态</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">共 {activeFollowups.length} 条记录</p>
                </div>
              </div>
              <p className="text-xs text-[#667085]">最近更新 <span className="font-medium text-[#344054]">{activeFollowups[0] ? formatDate(activeFollowups[0].created_at) : "暂无"}</span></p>
            </div>
            {fuLoading ? (
              <div className="flex min-h-48 flex-1 items-center justify-center text-sm text-[#667085]"><Loader2 className="mr-2 h-5 w-5 animate-spin text-[#2f6feb]" />加载跟进记录...</div>
            ) : timelineFollowups.length > 0 ? (
              <div ref={followupTimelineScrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="relative space-y-4">
                  {timelineFollowups.map((fu: any, idx: number) => {
                    const typeIcon = followupTypes.find(t => t.value === fu.type)?.icon || "note";
                    const typeTone = getFollowupTypeTone(fu.type);
                    const sceneTone = getFollowupSceneTone(fu.scene);
                    const isLast = idx === timelineFollowups.length - 1;
                    const delayDays = fu.next_date ? getDelayDays(fu.next_date) : 0;
                    return (
                      <article key={fu.id} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-3">
                        {!isLast && <span className="absolute bottom-[-16px] left-[19px] top-10 w-px bg-[#dbe2ea]" />}
                        <span className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border ${fu.deleted_at ? "border-[#e2e7ee] bg-[#f2f4f7] text-[#98a2b3]" : typeTone.icon}`}>
                          <IconfontFollowupIcon type={typeIcon} className="h-4 w-4" />
                        </span>
                        <div className={`min-w-0 rounded-[8px] border px-4 py-3.5 ${fu.deleted_at ? "border-[#e2e7ee] bg-[#f8fafc]" : "border-[#e2e7ee] bg-white hover:border-[#cfd7e3]"}`}>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="min-w-0 max-w-full text-sm">
                                  {renderFollowupUserIdentity({
                                    name: fu.user_name,
                                    avatar: fu.user_avatar,
                                    deleted: Boolean(fu.deleted_at),
                                    deletedLabel: "已删除的跟进",
                                  })}
                                </span>
                                <span className={`inline-flex min-h-[22px] items-center gap-1 rounded-[8px] border px-2 text-xs font-medium ${fu.deleted_at ? "border-[#e2e7ee] bg-[#f8fafc] text-[#667085]" : typeTone.badge}`}>
                                  <IconfontFollowupIcon type={typeIcon} className="h-3 w-3" />{fu.deleted_at ? "已删除" : fu.type}
                                </span>
                                {!fu.deleted_at && getFollowupSceneLabel(fu.scene) && <span className={`inline-flex min-h-[22px] items-center rounded-[8px] border px-2 text-xs font-medium ${sceneTone.badge}`}>{getFollowupSceneLabel(fu.scene)}</span>}
                                <span className="text-xs text-[#98a2b3]">{formatDate(fu.created_at)}</span>
                              </div>
                              {fu.deleted_at ? (
                                <p className="mt-2 text-sm text-[#98a2b3]">该跟进内容已删除</p>
                              ) : (
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#344054]">{renderWithMentions(fu.content)}</p>
                              )}
                              {!fu.deleted_at && fu.next_date && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 text-xs text-[#667085]"><Clock className="h-3.5 w-3.5" />下次跟进 {fu.next_date}</span>
                                  {delayDays > 0 && <span className="inline-flex min-h-[22px] items-center rounded-[8px] border border-red-200 bg-red-50 px-2 text-xs font-medium text-red-700">延期 {delayDays} 天</span>}
                                </div>
                              )}
                              {!fu.deleted_at && renderFollowupAttachments(fu.attachments)}
                            </div>
                            {!fu.deleted_at && (
                              <div className="flex shrink-0 items-center gap-1">
                                <button type="button" onClick={() => handleReplyFollowup(fu)} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium text-[#2f6feb] transition-colors hover:bg-[#edf4ff]">
                                  <Reply className="h-3.5 w-3.5" />回复
                                </button>
                                {canDeleteFollowup(fu) && (
                                  <button type="button" onClick={() => requestDeleteFollowup(fu)} disabled={deletingFollowupId === fu.id} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#98a2b3] transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60" aria-label="删除跟进" title="删除">
                                    {deletingFollowupId === fu.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {renderFollowupReplies(fu.id)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex min-h-52 flex-1 flex-col items-center justify-center px-6 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f2f4f7] text-[#98a2b3]"><MessageCircle className="h-5 w-5" /></span>
                <p className="text-sm font-semibold text-[#344054]">暂无跟进记录</p>
                <p className="mt-1 text-xs text-[#667085]">保存第一条跟进后，沟通轨迹会显示在这里</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ---- Tab: 量房资料 ---- */}
      {activeTab === "measure" && (
        <div ref={customerDetailContentRef} className={`grid items-stretch gap-4 max-xl:!h-auto ${CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_280px]`} style={customerDetailContentStyle} data-measure-workbench>
          <input
            ref={measureInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              await handleCustomerFileUpload(makeMeasureCategory(selectedMeasureAttachmentType), input.files);
              input.value = "";
            }}
          />

          <aside className={`${panelClass} flex h-auto min-h-[420px] flex-col bg-[#f8fafc] lg:h-[560px] xl:h-full xl:min-h-0`} aria-label="量房资料分类">
            <div className="border-b border-[#e2e7ee] px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><Ruler className="h-4 w-4" /></span>
                <div>
                  <h3 className="text-sm font-semibold text-[#182230]">资料分类</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">共 {measureFiles.length} 个文件</p>
                </div>
              </div>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2.5">
              <button
                type="button"
                onClick={() => setMeasureViewFilter("ALL")}
                className={`flex min-h-10 w-full items-center justify-between rounded-[8px] px-3 text-sm transition-colors ${measureViewFilter === "ALL" ? "bg-white font-semibold text-[#2f6feb] ring-1 ring-inset ring-[#d7e3fb]" : "font-medium text-[#475467] hover:bg-white"}`}
              >
                <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />全部资料</span>
                <span className="text-xs text-[#98a2b3]">{measureFiles.length}</span>
              </button>
              {measureAttachmentTypes.map((item) => {
                const active = measureViewFilter === item.key;
                const count = measureCategoryCounts.get(item.key) || 0;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setMeasureViewFilter(item.key);
                      setSelectedMeasureAttachmentType(item.key);
                    }}
                    className={`flex min-h-10 w-full items-center justify-between rounded-[8px] px-3 text-sm transition-colors ${active ? "bg-white font-semibold text-[#2f6feb] ring-1 ring-inset ring-[#d7e3fb]" : "font-medium text-[#475467] hover:bg-white"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${count > 0 ? "bg-emerald-500" : "bg-[#cfd7e3]"}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-[#98a2b3]">{count}</span>
                  </button>
                );
              })}
              {measureUnclassifiedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setMeasureViewFilter("未分类")}
                  className={`flex min-h-10 w-full items-center justify-between rounded-[8px] px-3 text-sm transition-colors ${measureViewFilter === "未分类" ? "bg-white font-semibold text-[#2f6feb] ring-1 ring-inset ring-[#d7e3fb]" : "font-medium text-[#475467] hover:bg-white"}`}
                >
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" />未分类</span>
                  <span className="text-xs text-[#98a2b3]">{measureUnclassifiedCount}</span>
                </button>
              )}
            </nav>
          </aside>

          <section className={`${panelClass} flex h-[560px] min-h-0 flex-col xl:h-full`} aria-labelledby="measure-files-title">
            <div className="shrink-0 border-b border-[#e2e7ee] bg-white px-4 py-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 id="measure-files-title" className="truncate text-[15px] font-semibold text-[#182230]">{measureViewTitle}</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">当前显示 {visibleMeasureFiles.length} 个文件</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-primary min-h-10" disabled={isUploadingMeasureFile} onClick={() => measureInputRef.current?.click()}>
                    {isUploadingMeasureFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {isUploadingMeasureFile ? "上传中..." : `上传${selectedMeasureAttachmentType}`}
                  </button>
                </div>
              </div>
              {attachmentMessage && (
                <p className={`mt-3 rounded-[8px] border px-3 py-2 text-sm ${attachmentMessage.includes("失败") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{attachmentMessage}</p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] p-4">
              {filesLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-52 animate-pulse rounded-[8px] border border-[#e2e7ee] bg-white" />)}
                </div>
              ) : visibleMeasureFiles.length === 0 ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-[8px] border border-dashed border-[#cfd7e3] bg-white px-6 text-center">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f2f4f7] text-[#98a2b3]"><FolderOpen className="h-5 w-5" /></span>
                  <p className="text-sm font-semibold text-[#344054]">{measureViewFilter === "ALL" ? "暂未归档量房资料" : `暂无${measureViewTitle}`}</p>
                  <p className="mt-1 text-xs leading-5 text-[#667085]">上传时将文件归入正确分类，后续设计和复核会更高效</p>
                  <button type="button" onClick={() => measureInputRef.current?.click()} disabled={isUploadingMeasureFile} className="btn-primary mt-4 min-h-10">
                    <Upload className="h-4 w-4" />上传{selectedMeasureAttachmentType}
                  </button>
                  <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f8fafc] px-3 py-1.5 text-xs text-[#667085] ring-1 ring-inset ring-[#eef1f5]">
                    <Smartphone className="h-3.5 w-3.5 shrink-0 text-[#98a2b3]" />
                    <span className="truncate">手机里有照片？也可以扫码上传</span>
                    <button type="button" onClick={() => setMeasureDialog("qr")} className="shrink-0 font-semibold text-[#2f6feb] hover:text-[#1f5fd7]">
                      打开二维码
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {visibleMeasureFiles.map((file) => {
                    const isImage = isImageAttachment(file);
                    const group = getMeasureAttachmentGroup(file);
                    return (
                      <article key={file.id} className="group min-w-0 overflow-hidden rounded-[8px] border border-[#e2e7ee] bg-white transition-colors hover:border-[#afc6ff]">
                        <button type="button" onClick={() => handlePreviewCustomerFile(file)} className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-[#eef2f6] text-[#667085]">
                          {isImage ? (
                            <NativeImage src={file.file_url} alt={file.file_name || "量房资料图片"} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" loading="lazy" />
                          ) : (
                            <FileText className="h-9 w-9 text-[#98a2b3]" />
                          )}
                          <span className="absolute left-2 top-2 inline-flex min-h-[22px] items-center rounded-[8px] border border-white/80 bg-white/95 px-2 text-xs font-medium text-[#475467]">{group}</span>
                          <span className="absolute inset-0 flex items-center justify-center bg-[#182230]/0 text-white opacity-0 transition group-hover:bg-[#182230]/25 group-hover:opacity-100"><Eye className="h-5 w-5" /></span>
                        </button>
                        <div className="px-3 py-3">
                          <p className="truncate text-sm font-semibold text-[#344054]" title={file.file_name}>{file.file_name}</p>
                          <p className="mt-1 flex items-center justify-between gap-2 text-xs text-[#98a2b3]">
                            <span>{formatFileSize(file.file_size) || (isImage ? "图片" : "文件")}</span>
                            <span className="truncate">{file.created_at ? formatDate(file.created_at) : ""}</span>
                          </p>
                        </div>
                        <div className="flex items-center justify-end gap-1 border-t border-[#eef1f5] px-2 py-1.5">
                          <button type="button" onClick={() => handlePreviewCustomerFile(file)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#edf4ff] hover:text-[#2f6feb]" title="预览" aria-label={`预览 ${file.file_name}`}><Eye className="h-4 w-4" /></button>
                          <a href={file.file_url} download className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] hover:text-[#182230]" title="下载" aria-label={`下载 ${file.file_name}`}><Download className="h-4 w-4" /></a>
                          <button type="button" onClick={() => requestDeleteCustomerFile(file.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#98a2b3] hover:bg-red-50 hover:text-red-600" title="删除" aria-label={`删除 ${file.file_name}`}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className={`${panelClass} flex h-auto min-h-[300px] flex-col lg:col-span-2 xl:col-span-1 xl:h-full xl:min-h-0`} aria-label="量房资料辅助工具">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <section>
                <p className="text-sm font-semibold text-[#344054]">归档规范</p>
                <ul className="mt-3 space-y-2.5 text-xs leading-5 text-[#667085]">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17a34a]" />关键尺寸统一使用 mm</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17a34a]" />现场照片按空间名称归档</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17a34a]" />复尺资料保留原始版本</li>
                </ul>
                <button type="button" onClick={() => setMeasureDialog("requirements")} className="btn-secondary mt-4 min-h-9 w-full justify-center text-xs"><ClipboardList className="h-4 w-4" />查看完整标准</button>
              </section>
            </div>
          </aside>

        </div>
      )}

      {/* ---- Tab: 设计方案 ---- */}
      {activeTab === "design" && (
        <div ref={customerDetailContentRef} className={`grid items-stretch gap-4 max-xl:!h-auto ${CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_280px]`} style={customerDetailContentStyle} data-design-workbench>
          <input
            ref={designInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              await handleCustomerFileUpload(makeDesignCategory(selectedDesignAttachmentType), input.files);
              input.value = "";
            }}
          />

          <aside className={`${panelClass} flex h-auto min-h-[420px] flex-col bg-[#f8fafc] lg:h-[560px] xl:h-full xl:min-h-0`} aria-label="设计方案分类">
            <div className="border-b border-[#e2e7ee] px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700"><Palette className="h-4 w-4" /></span>
                <div>
                  <h3 className="text-sm font-semibold text-[#182230]">方案分类</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">共 {designFiles.length} 个文件</p>
                </div>
              </div>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2.5">
              <button type="button" onClick={() => setDesignViewFilter("ALL")} className={`flex min-h-10 w-full items-center justify-between rounded-[8px] px-3 text-sm transition-colors ${designViewFilter === "ALL" ? "bg-white font-semibold text-[#2f6feb] ring-1 ring-inset ring-[#d7e3fb]" : "font-medium text-[#475467] hover:bg-white"}`}>
                <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />全部方案</span>
                <span className="text-xs text-[#98a2b3]">{designFiles.length}</span>
              </button>
              {designAttachmentTypes.map((item) => {
                const active = designViewFilter === item.key;
                const count = designCategoryCounts.get(item.key) || 0;
                return (
                  <button key={item.key} type="button" onClick={() => { setDesignViewFilter(item.key); setSelectedDesignAttachmentType(item.key); }} className={`flex min-h-10 w-full items-center justify-between rounded-[8px] px-3 text-sm transition-colors ${active ? "bg-white font-semibold text-[#2f6feb] ring-1 ring-inset ring-[#d7e3fb]" : "font-medium text-[#475467] hover:bg-white"}`}>
                    <span className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${count > 0 ? "bg-emerald-500" : "bg-[#cfd7e3]"}`} /><span className="truncate">{item.label}</span></span>
                    <span className="shrink-0 text-xs text-[#98a2b3]">{count}</span>
                  </button>
                );
              })}
              {designUnclassifiedCount > 0 && (
                <button type="button" onClick={() => setDesignViewFilter("未分类")} className={`flex min-h-10 w-full items-center justify-between rounded-[8px] px-3 text-sm transition-colors ${designViewFilter === "未分类" ? "bg-white font-semibold text-[#2f6feb] ring-1 ring-inset ring-[#d7e3fb]" : "font-medium text-[#475467] hover:bg-white"}`}>
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" />未分类</span>
                  <span className="text-xs text-[#98a2b3]">{designUnclassifiedCount}</span>
                </button>
              )}
            </nav>
          </aside>

          <section className={`${panelClass} flex h-[560px] min-h-0 flex-col xl:h-full`} aria-labelledby="design-files-title">
            <div className="shrink-0 border-b border-[#e2e7ee] bg-white px-4 py-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 id="design-files-title" className="truncate text-[15px] font-semibold text-[#182230]">{designViewTitle}</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">当前显示 {visibleDesignFiles.length} 个文件或链接</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { setDesignLinkForm({ name: "", url: "", type: "效果图/全景图" }); setAttachmentMessage(""); setShowDesignLinkModal(true); }} className="btn-secondary min-h-10 px-3 text-sm"><LinkIcon className="h-4 w-4" />添加在线链接</button>
                  <button type="button" className="btn-primary min-h-10" disabled={isUploadingDesignFile} onClick={() => designInputRef.current?.click()}>
                    {isUploadingDesignFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {isUploadingDesignFile ? "上传中..." : `上传${selectedDesignAttachmentType}`}
                  </button>
                </div>
              </div>
              {attachmentMessage && <p className={`mt-3 rounded-[8px] border px-3 py-2 text-sm ${attachmentMessage.includes("失败") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{attachmentMessage}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] p-4">
              {filesLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-52 animate-pulse rounded-[8px] border border-[#e2e7ee] bg-white" />)}</div>
              ) : visibleDesignFiles.length === 0 ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-[8px] border border-dashed border-[#cfd7e3] bg-white px-6 text-center">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700"><Palette className="h-5 w-5" /></span>
                  <p className="text-sm font-semibold text-[#344054]">{designViewFilter === "ALL" ? "暂未归档设计方案" : `暂无${designViewTitle}`}</p>
                  <p className="mt-1 text-xs leading-5 text-[#667085]">按方案类型归档图纸和在线链接，便于后续报价、确认与施工</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => { setDesignLinkForm({ name: "", url: "", type: "效果图/全景图" }); setAttachmentMessage(""); setShowDesignLinkModal(true); }} className="btn-secondary min-h-10"><LinkIcon className="h-4 w-4" />添加在线链接</button>
                    <button type="button" onClick={() => designInputRef.current?.click()} disabled={isUploadingDesignFile} className="btn-primary min-h-10"><Upload className="h-4 w-4" />上传{selectedDesignAttachmentType}</button>
                  </div>
                  <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f8fafc] px-3 py-1.5 text-xs text-[#667085] ring-1 ring-inset ring-[#eef1f5]">
                    <Smartphone className="h-3.5 w-3.5 shrink-0 text-[#98a2b3]" />
                    <span className="truncate">手机里有方案图？也可以扫码上传</span>
                    <button type="button" onClick={() => setDesignDialog("qr")} className="shrink-0 font-semibold text-amber-700 hover:text-amber-800">
                      打开二维码
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {visibleDesignFiles.map((file) => {
                    const isImage = isImageAttachment(file);
                    const isLink = isLinkAttachment(file);
                    const group = getDesignAttachmentGroup(file);
                    return (
                      <article key={file.id} className="group min-w-0 overflow-hidden rounded-[8px] border border-[#e2e7ee] bg-white transition-colors hover:border-[#afc6ff]">
                        <button type="button" onClick={() => handlePreviewCustomerFile(file)} className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-[#eef2f6] text-[#667085]">
                          {isLink ? <AttachmentLinkPreviewFrame file={file} /> : isImage ? <NativeImage src={file.file_url} alt={file.file_name || "设计方案图片"} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" loading="lazy" /> : <FileText className="h-9 w-9 text-[#98a2b3]" />}
                          <span className="absolute left-2 top-2 inline-flex min-h-[22px] items-center rounded-[8px] border border-white/80 bg-white/95 px-2 text-xs font-medium text-[#475467]">{group}</span>
                          {isLink && <span className="absolute right-2 top-2 inline-flex min-h-[22px] items-center gap-1 rounded-[8px] border border-[#cfe0ff] bg-[#edf4ff] px-2 text-xs font-medium text-[#2f6feb]"><LinkIcon className="h-3 w-3" />在线链接</span>}
                          <span className="absolute inset-0 flex items-center justify-center bg-[#182230]/0 text-white opacity-0 transition group-hover:bg-[#182230]/25 group-hover:opacity-100"><Eye className="h-5 w-5" /></span>
                        </button>
                        <div className="px-3 py-3">
                          <p className="truncate text-sm font-semibold text-[#344054]" title={file.file_name}>{file.file_name}</p>
                          <p className="mt-1 flex items-center justify-between gap-2 text-xs text-[#98a2b3]"><span>{isLink ? "在线方案" : formatFileSize(file.file_size) || (isImage ? "图片" : "文件")}</span><span className="truncate">{file.created_at ? formatDate(file.created_at) : ""}</span></p>
                        </div>
                        <div className="flex items-center justify-end gap-1 border-t border-[#eef1f5] px-2 py-1.5">
                          <button type="button" onClick={() => handlePreviewCustomerFile(file)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#edf4ff] hover:text-[#2f6feb]" title={isLink ? "打开链接" : "预览"} aria-label={`${isLink ? "打开" : "预览"} ${file.file_name}`}>{isLink ? <LinkIcon className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                          {!isLink && <a href={file.file_url} download className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] hover:text-[#182230]" title="下载" aria-label={`下载 ${file.file_name}`}><Download className="h-4 w-4" /></a>}
                          <button type="button" onClick={() => requestDeleteCustomerFile(file.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#98a2b3] hover:bg-red-50 hover:text-red-600" title="删除" aria-label={`删除 ${file.file_name}`}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className={`${panelClass} flex h-auto min-h-[300px] flex-col lg:col-span-2 xl:col-span-1 xl:h-full xl:min-h-0`} aria-label="设计方案辅助工具">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <section>
                <p className="text-sm font-semibold text-[#344054]">交付规范</p>
                <ul className="mt-3 space-y-2.5 text-xs leading-5 text-[#667085]">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17a34a]" />图纸空间名称和尺寸保持统一</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17a34a]" />文件名标明方案版本与日期</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17a34a]" />客户确认版单独归档保留</li>
                </ul>
                <button type="button" onClick={() => setDesignDialog("requirements")} className="btn-secondary mt-4 min-h-9 w-full justify-center text-xs"><ClipboardList className="h-4 w-4" />查看完整标准</button>
              </section>
            </div>
          </aside>
        </div>
      )}

      {/* ---- Tab: 款项记录 ---- */}
      {activeTab === "deposit" && (
        <div ref={customerDetailContentRef} className={CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} style={customerDetailContentStyle}>
          <div className={`${panelClass} flex h-full min-h-0 flex-col`}>
            <div className="flex shrink-0 flex-col gap-3 border-b border-[#e2e7ee] bg-white px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><DollarSign className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-[#182230]">款项记录</h3>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">定金与设计费的收款、审批和退款留痕</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={designFeeActionButtonClass} onClick={() => openDepositModal("manual", "design_fee")}><Plus className="h-4 w-4" />添加设计费</button>
                <button className="btn-primary min-h-10" onClick={() => openDepositModal("manual", "deposit")}><Plus className="h-4 w-4" />添加定金</button>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e2e7ee] bg-[#f8fafc] px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-y-2">
                <div className="flex items-baseline gap-2 pr-5"><span className="text-xs text-[#667085]">应收</span><strong className="text-sm font-semibold tabular-nums text-[#182230]">¥ {formatPlainAmount(depositReceivableTotal)}</strong></div>
                <div className="flex items-baseline gap-2 border-l border-[#dce2ea] px-5"><span className="text-xs text-[#667085]">实收</span><strong className="text-sm font-semibold tabular-nums text-emerald-700">¥ {formatPlainAmount(depositActualReceivedTotal)}</strong></div>
                <div className="flex items-baseline gap-2 border-l border-[#dce2ea] px-5"><span className="text-xs text-[#667085]">减免</span><strong className="text-sm font-semibold tabular-nums text-violet-700">¥ {formatPlainAmount(depositWaivedTotal)}</strong></div>
                <div className="flex items-baseline gap-2 border-l border-[#dce2ea] px-5"><span className="text-xs text-[#667085]">已退</span><strong className="text-sm font-semibold tabular-nums text-red-600">¥ {formatPlainAmount(depositRefundedTotal)}</strong></div>
                <div className="flex items-center gap-2 border-l border-[#dce2ea] pl-5"><span className="text-xs text-[#667085]">待审批</span><strong className="text-sm font-semibold tabular-nums text-[#182230]">{pendingDepositApprovalCount}</strong>{pendingDepositApprovalCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" />}</div>
              </div>
              <div className="inline-flex rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] p-1">
                {paymentRecordTypeTabs.map((tab) => {
                  const active = paymentRecordFilter === tab.key;
                  return (
                    <button key={tab.key} type="button" onClick={() => setPaymentRecordFilter(tab.key)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-[6px] px-3 text-xs font-medium transition ${active ? "bg-white text-[#2f6feb] shadow-[0_0_0_1px_#d7e3fb]" : "text-[#667085] hover:bg-white hover:text-[#182230]"}`}>
                      {tab.label}<span className="text-[#98a2b3]">{getPaymentRecordCount(tab.key)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {depositMessage && !showDepositModal && (
              <div className={`mx-5 mt-4 rounded-[8px] border px-3 py-2 text-sm ${isPositiveDepositMessage(depositMessage) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {depositMessage}
              </div>
            )}
            {depositLoading ? (
              <div className="min-h-0 flex-1 overflow-hidden bg-white">
                <div className="h-10 border-b border-[#dce2ea] bg-[#f3f5f8]" />
                {[0, 1, 2, 3].map((item) => <div key={item} className="h-[68px] animate-pulse border-b border-[#eef1f5] bg-white px-5 py-3"><div className="h-full rounded-[6px] bg-[#f2f4f7]" /></div>)}
              </div>
            ) : filteredPaymentRecords.length > 0 ? (
              <>
              <ThinScrollArea className="deposit-ledger-scroll min-h-0 flex-1 bg-white" scrollClassName="h-full">
                <table className="w-full min-w-[2820px] table-fixed border-separate border-spacing-0 text-[13px]">
                  <colgroup>
                    <col className="w-[250px]" />
                    <col className="w-[140px]" />
                    <col className="w-[140px]" />
                    <col className="w-[130px]" />
                    <col className="w-[240px]" />
                    <col className="w-[180px]" />
                    <col className="w-[238px]" />
                    <col className="w-[220px]" />
                    <col className="w-[150px]" />
                    <col className="w-[220px]" />
                    <col className="w-[170px]" />
                    <col className="w-[110px]" />
                    <col className="w-[280px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#f3f5f8]">
                    <tr className="h-10 text-xs font-medium text-[#667085]">
                      <th className="border-b border-[#dce2ea] px-4 text-left">款项</th>
                      <th className="border-b border-[#dce2ea] px-4 text-right">应收金额</th>
                      <th className="border-b border-[#dce2ea] px-4 text-right">实收金额</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">收款状态</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">收款审批进度</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">收款时间</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">收款方式</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">计费方式</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">收款人</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">备注</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">退款审批进度</th>
                      <th className="border-b border-[#dce2ea] px-4 text-center">凭证</th>
                      <th className="sticky right-0 border-b border-l border-[#dce2ea] bg-[#f3f5f8] px-3 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositPagination.pageItems.map((record) => {
                      const approvalView = getDepositApprovalView(record);
                      const topUpApprovals = record.top_up_approvals || [];
                      const latestTopUpApproval = topUpApprovals[0];
                      const topUpApprovalView = latestTopUpApproval ? getDepositTopUpApprovalView(record, latestTopUpApproval) : null;
                      const waiverApprovals = record.waiver_approvals || [];
                      const latestWaiverApproval = waiverApprovals[0];
                      const waiverApprovalView = latestWaiverApproval ? getDepositWaiverApprovalView(record, latestWaiverApproval) : null;
                      const refundApprovalView = getDepositRefundApprovalView(record);
                      const refundStatus = getDepositRefundStatusMeta(record);
                      const editBlockedReason = getDepositEditBlockedReason(record);
                      const refundBlockedReason = getDepositRefundBlockedReason(record);
                      const topUpBlockedReason = getDepositTopUpBlockedReason(record);
                      const waiverBlockedReason = getDepositWaiverBlockedReason(record);
                      const remainingReceiveAmount = getDepositRemainingReceiveAmount(record);
                      const actualReceivedAmount = getDepositActualReceivedAmount(record);
                      const waivedAmount = getDepositWaivedAmount(record);
                      const paymentLabel = getPaymentRecordLabel(record);
                      const refundLabel = getRefundActionLabel(record);
                      const receivableAmount = getPaymentRecordReceivable(record);
                      const isDesignFee = normalizePaymentRecordType(record.record_type) === "design_fee";
                      return (
                        <tr key={record.id} className="group h-[68px] transition-colors hover:bg-[#f8fafc]">
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] ${isDesignFee ? "bg-[#edf4ff] text-[#2f6feb]" : "bg-amber-50 text-amber-700"}`}>{isDesignFee ? <Palette className="h-3.5 w-3.5" /> : <WalletCards className="h-3.5 w-3.5" />}</span>
                              <div className="flex min-w-0 items-center gap-2"><span className="truncate text-[13px] font-semibold text-[#182230]">{record.deposit_type || paymentLabel}</span><span className={`inline-flex min-h-[22px] shrink-0 items-center rounded-[8px] border px-2 text-xs font-medium ${isDesignFee ? "border-[#cfe0ff] bg-[#edf4ff] text-[#2f6feb]" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{paymentLabel}</span></div>
                            </div>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 text-right align-middle">
                            <p className="text-[13px] font-semibold tabular-nums text-[#182230]">¥ {formatPlainAmount(receivableAmount)}</p>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 text-right align-middle">
                            <button
                              type="button"
                              onClick={() => setPaymentLedgerRecord(record)}
                              className={`inline-flex items-center justify-end gap-1 rounded-[6px] px-1.5 py-1 text-[13px] font-semibold tabular-nums hover:bg-emerald-50 ${actualReceivedAmount > 0 ? "text-emerald-700" : "text-[#98a2b3]"}`}
                              title="查看实收流水"
                            >
                              ¥ {formatPlainAmount(actualReceivedAmount)}
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <div className="space-y-1">
                              <span className={`inline-flex min-h-[22px] items-center rounded-[8px] px-2 text-xs font-medium ${getDepositCollectionStatusMeta(record).className}`}>{getDepositCollectionStatusMeta(record).label}</span>
                              {waivedAmount > 0 && <p className="text-xs font-medium tabular-nums text-violet-700">减免 ¥ {formatPlainAmount(waivedAmount)}</p>}
                            </div>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2 align-middle">
                            <div className="space-y-1">
                              <button
                                type="button"
                                onClick={() => openDepositApprovalDetail(record, "initial")}
                                className="flex w-full min-w-0 items-center justify-between gap-2 rounded-[6px] px-1 py-1 text-left hover:text-[#2f6feb]"
                              >
                                <span className="min-w-0">
                                  <span className={`block truncate text-[13px] font-medium ${approvalView.className}`}>{approvalView.title}</span>
                                  <span className="mt-0.5 block truncate text-xs text-[#98a2b3]">{approvalView.caption}</span>
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#98a2b3]" />
                              </button>
                              {topUpApprovalView && (
                                <button
                                  type="button"
                                  onClick={() => openDepositApprovalDetail(record, "top_up", latestTopUpApproval?.id || "")}
                                  className={`block w-full truncate rounded-[6px] px-1 py-0.5 text-left text-xs font-medium hover:bg-[#edf4ff] ${topUpApprovalView.className}`}
                                >
                                  补收：{topUpApprovalView.title} · ¥ {formatPlainAmount(Number(latestTopUpApproval?.approval_amount || 0))}
                                </button>
                              )}
                              {waiverApprovalView && (
                                <button
                                  type="button"
                                  onClick={() => openDepositApprovalDetail(record, "waiver", latestWaiverApproval?.id || "")}
                                  className={`block w-full truncate rounded-[6px] px-1 py-0.5 text-left text-xs font-medium hover:bg-violet-50 ${waiverApprovalView.className}`}
                                >
                                  减免：{waiverApprovalView.title} · ¥ {formatPlainAmount(Number(latestWaiverApproval?.approval_amount || 0))}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <p className="text-[13px] text-[#344054]">{formatDateTime(record.received_at)}</p>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <p className="text-[13px] text-[#344054]">{record.method === "qr" ? "扫码支付" : record.payment_channel || "手动记录"}</p>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <p className="truncate text-[13px] text-[#344054]">{isDesignFee ? (record.design_fee_mode === "designer_level_area" ? `${record.designer_level || "设计师等级"} · ${formatPlainAmount(Number(record.design_fee_area || 0))}㎡ × ${formatPlainAmount(Number(record.design_fee_unit_price || 0))}元/㎡` : record.design_fee_mode === "quotation_ratio" || record.design_fee_mode === "direct_fee_ratio" ? `${record.design_fee_mode === "direct_fee_ratio" ? "直接费" : "报价合计"} × ${Number(record.design_fee_rate || 0)}%` : "固定金额") : record.deposit_type || "定金"}</p>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <p className="truncate text-[13px] text-[#344054]">{record.receiver_name || record.created_by_name || "-"}</p>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <p className="truncate text-[13px] text-[#667085]" title={record.notes || ""}>{record.notes || "-"}</p>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            {record.refund_approval ? (
                              <button type="button" onClick={() => setRefundApprovalDetailRecord(record)} className={`flex max-w-full items-center gap-1 text-[13px] font-medium ${refundApprovalView.className} hover:text-red-700`}>
                                <span className="truncate">{refundApprovalView.title}</span>
                                <ArrowRight className="h-3 w-3 shrink-0" />
                              </button>
                            ) : refundStatus ? <span className={`inline-flex min-h-[22px] items-center rounded-[8px] px-2 text-xs font-medium ${refundStatus.className}`}>{refundStatus.label}</span> : <span className="text-xs text-[#98a2b3]">暂无退款</span>}
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 text-center align-middle">
                            {record.voucher_url ? <a href={record.voucher_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-xs font-medium text-[#2f6feb] hover:bg-[#edf4ff]" title="查看收款凭证"><ImageIcon className="h-3.5 w-3.5" />查看</a> : <span className="text-xs text-[#98a2b3]">无</span>}
                          </td>
                          <td className="sticky right-0 border-b border-l border-[#eef1f5] bg-white px-3 py-2.5 align-middle group-hover:bg-[#f8fafc]">
                            <div className="flex items-center justify-center gap-1.5">
                              {remainingReceiveAmount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => { if (topUpBlockedReason) { setDepositMessage(topUpBlockedReason); return; } openTopUpModal(record); }}
                                  aria-disabled={Boolean(topUpBlockedReason)}
                                  title={topUpBlockedReason || `补收${formatPlainAmount(remainingReceiveAmount)}元`}
                                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border px-2.5 text-xs font-medium transition-colors ${topUpBlockedReason ? "cursor-help border-[#e2e7ee] bg-[#f8fafc] text-[#98a2b3]" : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"}`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  补收
                                </button>
                              )}
                              {remainingReceiveAmount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => { if (waiverBlockedReason) { setDepositMessage(waiverBlockedReason); return; } openWaiverModal(record); }}
                                  aria-disabled={Boolean(waiverBlockedReason)}
                                  title={waiverBlockedReason || `减免尾款${formatPlainAmount(remainingReceiveAmount)}元`}
                                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border px-2.5 text-xs font-medium transition-colors ${waiverBlockedReason ? "cursor-help border-[#e2e7ee] bg-[#f8fafc] text-[#98a2b3]" : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"}`}
                                >
                                  <CircleCheck className="h-3.5 w-3.5" />
                                  减免
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { if (editBlockedReason) { setDepositMessage(editBlockedReason); return; } openEditDepositModal(record); }}
                                aria-disabled={Boolean(editBlockedReason)}
                                title={editBlockedReason || "编辑款项"}
                                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border px-2.5 text-xs font-medium transition-colors ${editBlockedReason ? "cursor-help border-[#e2e7ee] bg-[#f8fafc] text-[#98a2b3]" : "border-[#cfe0ff] bg-white text-[#2f6feb] hover:bg-[#edf4ff]"}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {editBlockedReason ? "编辑受限" : "编辑"}
                              </button>
                              <button
                                type="button"
                                onClick={() => { if (refundBlockedReason) { setDepositMessage(refundBlockedReason); return; } openRefundModal(record); }}
                                aria-disabled={Boolean(refundBlockedReason)}
                                title={refundBlockedReason || refundLabel}
                                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border px-2.5 text-xs font-medium transition-colors ${refundBlockedReason ? "cursor-help border-[#e2e7ee] bg-[#f8fafc] text-[#98a2b3]" : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"}`}
                              >
                                <ReceiptText className="h-3.5 w-3.5" />
                                {refundBlockedReason ? "退款受限" : refundLabel}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ThinScrollArea>
                <DataPagination
                  total={filteredPaymentRecords.length}
                  page={depositPagination.page}
                  pageSize={depositPagination.pageSize}
                  onPageChange={depositPagination.setPage}
                  onPageSizeChange={depositPagination.setPageSize}
                  itemName="条款项记录"
                />
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#f8fafc] px-6 py-16 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] bg-white text-[#98a2b3] ring-1 ring-inset ring-[#e2e7ee]"><DollarSign className="h-5 w-5" /></span>
                <h3 className="text-sm font-semibold text-[#344054]">暂无款项记录</h3>
                <p className="mb-5 mt-1 text-xs text-[#667085]">添加定金或设计费后，收款、审批和退款都会在这里留痕</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button className={designFeeActionButtonClass} onClick={() => openDepositModal("manual", "design_fee")}><Plus className="h-4 w-4" />添加设计费</button>
                  <button className="btn-primary" onClick={() => openDepositModal("manual", "deposit")}><Plus className="h-4 w-4" />添加定金</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {depositApprovalDetailRecord && (
        <div className="fixed bottom-0 right-0 top-0 z-50 bg-[#111827]/45 md:left-[var(--active-sidebar-width)] max-md:left-0">
          <div className="absolute inset-0" onClick={() => setDepositApprovalDetailRecord(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="deposit-approval-title" className="approval-flow-modal-shell absolute left-1/2 top-1/2 z-10 flex max-h-[calc(100dvh-40px)] w-[calc(100%-24px)] max-w-[880px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] border border-[#dfe5ed] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e6eaf0] bg-white px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
                  <DollarSign className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <h3 id="deposit-approval-title" className="truncate text-base font-semibold text-[#182230]">{getPaymentRecordLabel(depositApprovalDetailRecord)}审批流程</h3>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">
                    {depositApprovalDetailRecord.deposit_type || getPaymentRecordLabel(depositApprovalDetailRecord)} · ¥ {formatPlainAmount(Number(depositApprovalDetailRecord.approval?.approval_amount || depositApprovalDetailRecord.amount || 0))}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDepositApprovalDetailRecord(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#98a2b3] transition-colors hover:bg-[#f2f4f7] hover:text-[#344054]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto bg-white">
              {depositMessage && (
                <div className={`mx-5 mt-4 rounded-[8px] border px-3 py-2 text-sm ${
                  isPositiveDepositMessage(depositMessage) ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
                }`}>
                  {depositMessage}
                </div>
              )}
              {(() => {
                const initialApproval = depositApprovalDetailRecord.approval;
                const topUpApprovals = depositApprovalDetailRecord.top_up_approvals || [];
                const waiverApprovals = depositApprovalDetailRecord.waiver_approvals || [];
                const selectedTopUpApproval = topUpApprovals.find((approval) => approval.id === selectedTopUpApprovalId) || topUpApprovals[0] || null;
                const selectedWaiverApproval = waiverApprovals.find((approval) => approval.id === selectedWaiverApprovalId) || waiverApprovals[0] || null;
                const selectedTopUpApprovalView = selectedTopUpApproval ? getDepositTopUpApprovalView(depositApprovalDetailRecord, selectedTopUpApproval) : null;
                const selectedWaiverApprovalView = selectedWaiverApproval ? getDepositWaiverApprovalView(depositApprovalDetailRecord, selectedWaiverApproval) : null;
                const shouldShowTopUpFlow = depositApprovalFlowView === "top_up" && Boolean(selectedTopUpApproval);
                const shouldShowWaiverFlow = depositApprovalFlowView === "waiver" && Boolean(selectedWaiverApproval);
                const approval = shouldShowTopUpFlow ? selectedTopUpApproval : shouldShowWaiverFlow ? selectedWaiverApproval : initialApproval;
                const approvalView = shouldShowTopUpFlow && selectedTopUpApprovalView ? selectedTopUpApprovalView : shouldShowWaiverFlow && selectedWaiverApprovalView ? selectedWaiverApprovalView : getDepositApprovalView(depositApprovalDetailRecord);
                const flowTitle = shouldShowTopUpFlow ? `补收${getPaymentRecordLabel(depositApprovalDetailRecord)}审批流程` : shouldShowWaiverFlow ? `${getPaymentRecordLabel(depositApprovalDetailRecord)}尾款减免审批流程` : "首次收款审批流程";
                const instanceMeta = getApprovalStatusMeta(approval?.status);
                const nodeGroups = groupApprovalSteps(approval?.steps);
                const approvedNodes = Number(approval?.approved_nodes || 0);
                const totalNodes = Number(approval?.total_nodes || 0);
                const progressPercent = totalNodes > 0 ? Math.min(100, Math.round((approvedNodes / totalNodes) * 100)) : 0;
                const approvalAmount = Number(approval?.approval_amount || depositApprovalDetailRecord.amount || 0);

                return (
                  <>
                    <section className="border-b border-[#e6eaf0] bg-[#f7f9fc] px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex min-h-[24px] items-center rounded-[7px] border px-2.5 text-xs font-semibold ${approval ? instanceMeta.className : "border-[#dfe5ed] bg-white text-[#667085]"}`}>
                              {approval ? getApprovalInstanceStatusText(approval.status) : approvalView.title}
                            </span>
                            <p className="truncate text-sm font-semibold text-[#182230]">{flowTitle}</p>
                          </div>
                          <p className="mt-1 text-xs text-[#667085]">{approval?.flow_name || approvalView.caption}</p>
                        </div>
                        <div className="w-full shrink-0 sm:w-[180px]">
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-[#667085]">审批进度</span>
                            <span className="font-semibold tabular-nums text-[#344054]">{approval ? `${approvedNodes}/${totalNodes}` : "-"}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#dfe5ed]">
                            <div className="h-full rounded-full bg-[#2f6feb] transition-[width]" style={{ width: `${progressPercent}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setDepositApprovalFlowView("initial")}
                          className={`rounded-[8px] border px-3 py-2 text-left transition-colors ${!shouldShowTopUpFlow ? "border-[#2f6feb] bg-white text-[#182230] shadow-[0_0_0_1px_rgba(47,111,235,0.08)]" : "border-[#e1e6ed] bg-white text-[#667085] hover:border-[#cfe0ff] hover:text-[#2f6feb]"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold">首次收款审批</span>
                            <span className="text-xs tabular-nums">¥ {formatPlainAmount(Number(initialApproval?.approval_amount || depositApprovalDetailRecord.amount || 0))}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-[#98a2b3]">{initialApproval ? getApprovalInstanceStatusText(initialApproval.status) : "暂无审批"}</p>
                        </button>
                        {topUpApprovals.map((topUpApproval, index) => {
                          const view = getDepositTopUpApprovalView(depositApprovalDetailRecord, topUpApproval);
                          const isSelected = shouldShowTopUpFlow && selectedTopUpApproval?.id === topUpApproval.id;
                          if (!view) return null;
                          return (
                            <button
                              key={topUpApproval.id || index}
                              type="button"
                              onClick={() => { setDepositApprovalFlowView("top_up"); setSelectedTopUpApprovalId(topUpApproval.id || ""); }}
                              className={`rounded-[8px] border px-3 py-2 text-left transition-colors ${isSelected ? "border-[#2f6feb] bg-white text-[#182230] shadow-[0_0_0_1px_rgba(47,111,235,0.08)]" : "border-[#cfe0ff] bg-white text-[#667085] hover:border-[#2f6feb] hover:text-[#2f6feb]"}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`truncate text-[13px] font-semibold ${view.className}`}>第 {topUpApprovals.length - index} 次补收审批</span>
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-[#c4322b]">¥ {formatPlainAmount(Number(topUpApproval.approval_amount || 0))}</span>
                              </div>
                              <p className="mt-1 truncate text-xs text-[#98a2b3]">{view.title} · {view.caption}</p>
                            </button>
                          );
                        })}
                        {waiverApprovals.map((waiverApproval, index) => {
                          const view = getDepositWaiverApprovalView(depositApprovalDetailRecord, waiverApproval);
                          const isSelected = shouldShowWaiverFlow && selectedWaiverApproval?.id === waiverApproval.id;
                          if (!view) return null;
                          return (
                            <button
                              key={waiverApproval.id || index}
                              type="button"
                              onClick={() => { setDepositApprovalFlowView("waiver"); setSelectedWaiverApprovalId(waiverApproval.id || ""); }}
                              className={`rounded-[8px] border px-3 py-2 text-left transition-colors ${isSelected ? "border-violet-400 bg-white text-[#182230] shadow-[0_0_0_1px_rgba(124,58,237,0.08)]" : "border-violet-100 bg-white text-[#667085] hover:border-violet-300 hover:text-violet-700"}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`truncate text-[13px] font-semibold ${view.className}`}>尾款减免审批</span>
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-violet-700">¥ {formatPlainAmount(Number(waiverApproval.approval_amount || 0))}</span>
                              </div>
                              <p className="mt-1 truncate text-xs text-[#98a2b3]">{view.title} · {view.caption}</p>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 grid grid-cols-2 border-t border-[#e1e6ed] pt-3 sm:grid-cols-4">
                        <div className="pr-3">
                          <p className="text-[11px] text-[#667085]">{shouldShowTopUpFlow ? "本次补收金额" : shouldShowWaiverFlow ? "本次减免金额" : `${getPaymentRecordLabel(depositApprovalDetailRecord)}金额`}</p>
                          <p className="mt-1 truncate text-[13px] font-semibold tabular-nums text-[#c4322b]">¥ {formatPlainAmount(approvalAmount)}</p>
                        </div>
                        <div className="border-l border-[#e1e6ed] pl-3 sm:px-3">
                          <p className="text-[11px] text-[#667085]">收款状态</p>
                          <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{getDepositStatusMeta(depositApprovalDetailRecord.status).label}</p>
                        </div>
                        <div className="mt-3 pr-3 sm:mt-0 sm:border-l sm:border-[#e1e6ed] sm:px-3">
                          <p className="text-[11px] text-[#667085]">收款时间</p>
                          <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{formatDateTime(depositApprovalDetailRecord.received_at)}</p>
                        </div>
                        <div className="mt-3 border-l border-[#e1e6ed] pl-3 sm:mt-0">
                          <p className="text-[11px] text-[#667085]">发起人</p>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5">
                            <ApprovalUserAvatar name={depositApprovalDetailRecord.created_by_name} avatar={depositApprovalDetailRecord.created_by_avatar} size="sm" />
                            <p className="truncate text-[13px] font-semibold text-[#182230]">{depositApprovalDetailRecord.created_by_name || "-"}</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    {!approval ? (
                      <div className="px-5 py-10 text-center">
                        <CircleDashed className="mx-auto mb-2.5 h-8 w-8 text-[#98a2b3]" />
                        <p className="text-sm font-semibold text-[#344054]">{approvalView.title}</p>
                        <p className="mt-1 text-xs text-[#667085]">{approvalView.caption}</p>
                      </div>
                    ) : nodeGroups.length === 0 ? (
                      <div className="bg-amber-50 px-5 py-8 text-center text-amber-700">
                        <p className="text-sm font-semibold">审批流程暂无节点</p>
                        <p className="mt-1 text-xs">请检查分公司{getPaymentRecordLabel(depositApprovalDetailRecord)}审批流配置。</p>
                      </div>
                    ) : (
                      <PaymentApprovalTimeline
                        nodeGroups={nodeGroups}
                        processingId={depositApprovalProcessingId}
                        userId={user?.id}
                        kind="deposit"
                        onAction={openApprovalCommentModal}
                        headerAction={(
                          <button
                            type="button"
                            onClick={() => {
                              const approvalMeta = parseApprovalMeta(approval);
                              printApprovalFlow({
                                title: "收款审批流程",
                                subtitle: `${depositApprovalDetailRecord.deposit_type || getPaymentRecordLabel(depositApprovalDetailRecord)} · ${customer?.name || "-"}`,
                                approval,
                                summary: [
                                  { label: "审批类型", value: flowTitle.replace(/审批流程$/, "") },
                                  { label: "款项类型", value: depositApprovalDetailRecord.deposit_type || getPaymentRecordLabel(depositApprovalDetailRecord) },
                                  { label: shouldShowTopUpFlow ? "本次补收金额" : shouldShowWaiverFlow ? "本次减免金额" : "首次收款金额", value: `¥ ${formatPlainAmount(approvalAmount)}` },
                                  { label: "收款状态", value: getDepositCollectionStatusMeta(depositApprovalDetailRecord).label },
                                  { label: "收款时间", value: formatDateTime(depositApprovalDetailRecord.received_at) },
                                  { label: "发起人", value: depositApprovalDetailRecord.created_by_name || "-" },
                                ],
                                reasonLabel: shouldShowWaiverFlow ? "减免原因" : undefined,
                                reason: shouldShowWaiverFlow ? (approvalMeta.reason || depositApprovalDetailRecord.waiver_reason || "") : "",
                                onBlocked: setDepositMessage,
                              });
                            }}
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-[8px] border border-[#d6deea] bg-white px-3 text-xs font-semibold text-[#344054] transition-colors hover:border-[#2f6feb] hover:text-[#2f6feb]"
                          >
                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                            打印
                          </button>
                        )}
                      />
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {refundApprovalDetailRecord && (
        <div className="fixed bottom-0 right-0 top-0 z-50 bg-[#111827]/45 md:left-[var(--active-sidebar-width)] max-md:left-0">
          <div className="absolute inset-0" onClick={() => setRefundApprovalDetailRecord(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="refund-approval-title" className="approval-flow-modal-shell absolute left-1/2 top-1/2 z-10 flex max-h-[calc(100dvh-40px)] w-[calc(100%-24px)] max-w-[880px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] border border-[#dfe5ed] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e6eaf0] bg-white px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-red-50 text-red-600 ring-1 ring-inset ring-red-100">
                  <ReceiptText className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <h3 id="refund-approval-title" className="truncate text-base font-semibold text-[#182230]">{getRefundActionLabel(refundApprovalDetailRecord)}审批流程</h3>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">{refundApprovalDetailRecord.deposit_type || getPaymentRecordLabel(refundApprovalDetailRecord)} · 申请{getRefundActionLabel(refundApprovalDetailRecord)} ¥ {formatPlainAmount(getDepositActiveRefundAmount(refundApprovalDetailRecord))}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRefundApprovalDetailRecord(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#98a2b3] transition-colors hover:bg-[#f2f4f7] hover:text-[#344054]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto bg-white">
              {depositMessage && (
                <div className={`mx-5 mt-4 rounded-[8px] border px-3 py-2 text-sm ${
                  isPositiveDepositMessage(depositMessage) ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
                }`}>
                  {depositMessage}
                </div>
              )}
              {(() => {
                const approval = refundApprovalDetailRecord.refund_approval;
                const approvalView = getDepositRefundApprovalView(refundApprovalDetailRecord);
                const instanceMeta = getApprovalStatusMeta(approval?.status);
                const nodeGroups = groupApprovalSteps(approval?.steps);
                const approvedNodes = Number(approval?.approved_nodes || 0);
                const totalNodes = Number(approval?.total_nodes || 0);
                const progressPercent = totalNodes > 0 ? Math.min(100, Math.round((approvedNodes / totalNodes) * 100)) : 0;

                return (
                  <>
                    <section className="border-b border-[#e6eaf0] bg-[#f7f9fc] px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex min-h-[24px] items-center rounded-[7px] border px-2.5 text-xs font-semibold ${approval ? instanceMeta.className : "border-[#dfe5ed] bg-white text-[#667085]"}`}>
                              {approval ? getApprovalInstanceStatusText(approval.status) : approvalView.title}
                            </span>
                            <p className="truncate text-sm font-semibold text-[#182230]">{approval?.flow_name || approvalView.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-[#667085]">{approvalView.caption}</p>
                        </div>
                        <div className="w-full shrink-0 sm:w-[180px]">
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-[#667085]">审批进度</span>
                            <span className="font-semibold tabular-nums text-[#344054]">{approval ? `${approvedNodes}/${totalNodes}` : "-"}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#dfe5ed]">
                            <div className="h-full rounded-full bg-[#2f6feb] transition-[width]" style={{ width: `${progressPercent}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 border-t border-[#e1e6ed] pt-3 sm:grid-cols-4">
                        <div className="pr-3">
                          <p className="text-[11px] text-[#667085]">申请退款金额</p>
                          <p className="mt-1 truncate text-[13px] font-semibold tabular-nums text-[#c4322b]">¥ {formatPlainAmount(getDepositActiveRefundAmount(refundApprovalDetailRecord))}</p>
                        </div>
                        <div className="border-l border-[#e1e6ed] pl-3 sm:px-3">
                          <p className="text-[11px] text-[#667085]">原{getPaymentRecordLabel(refundApprovalDetailRecord)}金额</p>
                          <p className="mt-1 truncate text-[13px] font-semibold tabular-nums text-[#182230]">¥ {formatPlainAmount(Number(refundApprovalDetailRecord.amount || 0))}</p>
                        </div>
                        <div className="mt-3 pr-3 sm:mt-0 sm:border-l sm:border-[#e1e6ed] sm:px-3">
                          <p className="text-[11px] text-[#667085]">申请时间</p>
                          <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{formatDateTime(refundApprovalDetailRecord.refund_requested_at)}</p>
                        </div>
                        <div className="mt-3 border-l border-[#e1e6ed] pl-3 sm:mt-0">
                          <p className="text-[11px] text-[#667085]">退款状态</p>
                          <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{getDepositRefundStatusMeta(refundApprovalDetailRecord)?.label || "-"}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-3 border-t border-[#e1e6ed] pt-3 text-xs">
                        <span className="shrink-0 text-[#667085]">{getRefundActionLabel(refundApprovalDetailRecord)}原因</span>
                        <p className="min-w-0 whitespace-pre-wrap leading-5 text-[#344054]">{refundApprovalDetailRecord.refund_reason || "-"}</p>
                      </div>
                    </section>

                    {!approval ? (
                      <div className="px-5 py-10 text-center">
                        <CircleDashed className="mx-auto mb-2.5 h-8 w-8 text-[#98a2b3]" />
                        <p className="text-sm font-semibold text-[#344054]">{approvalView.title}</p>
                        <p className="mt-1 text-xs text-[#667085]">{approvalView.caption}</p>
                      </div>
                    ) : nodeGroups.length === 0 ? (
                      <div className="bg-amber-50 px-5 py-8 text-center text-amber-700">
                        <p className="text-sm font-semibold">审批流程暂无节点</p>
                        <p className="mt-1 text-xs">请检查分公司{getRefundActionLabel(refundApprovalDetailRecord)}审批流配置。</p>
                      </div>
                    ) : (
                      <PaymentApprovalTimeline
                        nodeGroups={nodeGroups}
                        processingId={refundApprovalProcessingId}
                        userId={user?.id}
                        kind="depositRefund"
                        onAction={openApprovalCommentModal}
                        headerAction={(
                          <button
                            type="button"
                            onClick={() => {
                              const refundLabel = getRefundActionLabel(refundApprovalDetailRecord);
                              printApprovalFlow({
                                title: `${refundLabel}审批流程`,
                                subtitle: `${refundApprovalDetailRecord.deposit_type || getPaymentRecordLabel(refundApprovalDetailRecord)} · ${customer?.name || "-"}`,
                                approval,
                                summary: [
                                  { label: "申请退款金额", value: `¥ ${formatPlainAmount(getDepositActiveRefundAmount(refundApprovalDetailRecord))}` },
                                  { label: `原${getPaymentRecordLabel(refundApprovalDetailRecord)}金额`, value: `¥ ${formatPlainAmount(Number(refundApprovalDetailRecord.amount || 0))}` },
                                  { label: "申请时间", value: formatDateTime(refundApprovalDetailRecord.refund_requested_at) },
                                  { label: "退款状态", value: getDepositRefundStatusMeta(refundApprovalDetailRecord)?.label || "-" },
                                ],
                                reasonLabel: `${refundLabel}原因`,
                                reason: refundApprovalDetailRecord.refund_reason || "",
                                onBlocked: setDepositMessage,
                              });
                            }}
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-[8px] border border-[#d6deea] bg-white px-3 text-xs font-semibold text-[#344054] transition-colors hover:border-[#2f6feb] hover:text-[#2f6feb]"
                          >
                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                            打印
                          </button>
                        )}
                      />
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <ApprovalSignatureModal
        open={Boolean(signatureApprovalTarget)}
        action={signatureApprovalTarget?.action || "approve"}
        title={signatureApprovalTarget?.action === "reject" ? "确认审批驳回" : "确认审批通过"}
        processing={Boolean(approvalProcessingId || depositApprovalProcessingId || refundApprovalProcessingId)}
        onClose={() => setSignatureApprovalTarget(null)}
        onConfirm={async (signatureId, comment) => {
          if (!signatureApprovalTarget) return;
          const target = signatureApprovalTarget;
          const success = target.kind === "contract"
            ? await handleContractApprovalAction(target.stepId, target.action, comment, signatureId)
            : target.kind === "depositRefund"
              ? await handleDepositRefundApprovalAction(target.stepId, target.action, comment, signatureId)
              : await handleDepositApprovalAction(target.stepId, target.action, comment, signatureId);
          if (success) setSignatureApprovalTarget(null);
        }}
      />

      {/* ---- Tab: 预算报价 ---- */}
      {activeTab === "quotation" && (
        <div ref={customerDetailContentRef} className={CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} style={customerDetailContentStyle}>
          <div className={`${panelClass} flex h-full min-h-0 flex-col overflow-hidden`}>
            <div className="flex shrink-0 flex-col gap-3 border-b border-[#e2e7ee] bg-white px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]">
                  <ReceiptText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-[#182230]">预算报价</h3>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">管理报价版本、正式状态与设计协作</p>
                </div>
              </div>
              <Link href="/quotations" className="btn-primary min-h-10 shrink-0">
                <Plus className="h-3.5 w-3.5" />
                新建报价
              </Link>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e2e7ee] bg-[#f8fafc] px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-y-2">
                <div className="flex items-baseline gap-2 pr-5"><span className="text-xs text-[#667085]">共</span><strong className="text-sm font-semibold tabular-nums text-[#182230]">{customerQuotations.length}</strong><span className="text-xs text-[#667085]">份报价</span></div>
                <div className="flex items-baseline gap-2 border-l border-[#dce2ea] px-5"><span className="text-xs text-[#667085]">正式</span><strong className="text-sm font-semibold tabular-nums text-emerald-700">{formalCustomerQuotations.length}</strong></div>
                <div className="flex items-baseline gap-2 border-l border-[#dce2ea] px-5"><span className="text-xs text-[#667085]">已发送</span><strong className="text-sm font-semibold tabular-nums text-[#2f6feb]">{sentCustomerQuotationCount}</strong></div>
                <div className="flex items-baseline gap-2 border-l border-[#dce2ea] px-5"><span className="text-xs text-[#667085]">草稿</span><strong className="text-sm font-semibold tabular-nums text-[#667085]">{draftCustomerQuotationCount}</strong></div>
                <div className="flex items-baseline gap-2 border-l border-[#dce2ea] pl-5"><span className="text-xs text-[#667085]">报价合计</span><strong className="text-sm font-semibold tabular-nums text-[#182230]">¥ {formatPlainAmount(customerQuotationTotalAmount)}</strong></div>
              </div>
            </div>
            {quotationMessage && (
              <div className={`mx-5 mt-4 rounded-[8px] border px-3 py-2 text-sm ${
                quotationMessage.includes("已") ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
              }`}>
                {quotationMessage}
              </div>
            )}
            {customerQuotations.length > 0 ? (
              <>
                <div className="quotation-ledger-scroll hidden min-h-[160px] flex-1 overflow-auto bg-white">
                <table className="quotation-ledger-table w-full min-w-[1580px] table-fixed border-separate border-spacing-0 bg-white text-[13px] leading-5">
                  <colgroup>
                    <col className="w-[300px]" />
                    <col className="w-[130px]" />
                    <col className="w-[145px]" />
                    <col className="w-[170px]" />
                    <col className="w-[200px]" />
                    <col className="w-[635px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#f3f5f8]">
                    <tr className="h-10 text-[12px] font-medium text-[#667085]">
                      <th className="border-b border-[#dce2ea] px-4 text-left">报价版本</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">状态</th>
                      <th className="border-b border-[#dce2ea] px-4 text-right">报价金额</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">更新时间</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">备注</th>
                      <th className="border-b border-[#dce2ea] px-4 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationPagination.pageItems.map((quotation: any) => {
                      const busy = quotationActionId === quotation.id;
                      const isFormal = String(quotation.status || "").toUpperCase() === "APPROVED";
                      const isSent = String(quotation.status || "").toUpperCase() === "SENT";
                      const rowActionBaseClass = "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border px-2 text-[12px] font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";
                      const rowPrimaryActionClass = `${rowActionBaseClass} border-[#2f6feb] bg-[#2f6feb] px-2.5 text-white shadow-none hover:border-[#2459c7] hover:bg-[#2459c7] focus-visible:ring-[#2f6feb]/20`;
                      const rowSecondaryActionClass = `${rowActionBaseClass} border-[#cfd7e3] bg-white text-[#344054] shadow-none hover:border-[#b8c2d0] hover:bg-[#f8fafc] hover:text-[#182230] focus-visible:ring-[#2f6feb]/15`;
                      const rowSoftActionClass = `${rowActionBaseClass} border-[#dce4ef] bg-[#fbfcfe] text-[#475467] shadow-none hover:border-[#c8d9ff] hover:bg-[#edf4ff] hover:text-[#2f6feb] focus-visible:ring-[#2f6feb]/15`;
                      const rowDangerActionClass = `${rowActionBaseClass} border-[#f3c5c0] bg-white text-[#d92d20] shadow-none hover:border-[#fda29b] hover:bg-[#fef3f2] focus-visible:ring-[#d92d20]/15`;
                      return (
                        <tr key={quotation.id} className="group h-[72px] bg-white transition-colors hover:bg-[#f8fafc]">
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <Link href={getCustomerQuotationDetailHref(quotation.id)} className="flex min-w-0 items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb] transition group-hover:bg-[#dbeafe]">
                                <ReceiptText className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 truncate text-[13px] font-semibold text-[#24324b] transition-colors group-hover:text-[#2f6feb]">{quotation.title || "装修报价单"}</span>
                            </Link>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <span className={`inline-flex min-h-[22px] items-center gap-1.5 rounded-[8px] px-2 text-xs font-medium ring-1 ring-inset ${
                              isFormal
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : isSent
                                  ? "bg-[#edf4ff] text-[#2f6feb] ring-[#c8d9ff]"
                                  : "bg-[#f2f4f7] text-[#667085] ring-[#e2e7ee]"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${isFormal ? "bg-emerald-500" : isSent ? "bg-[#2f6feb]" : "bg-[#98a2b3]"}`} />
                              {isFormal ? "正式报价" : isSent ? "已发送设计师" : "草稿报价"}
                            </span>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 text-right align-middle"><span className="text-[13px] font-semibold tabular-nums text-[#24324b]">¥ {formatPlainAmount(getQuotationAmount(quotation))}</span></td>
                          <td className="whitespace-nowrap border-b border-[#eef1f5] px-4 py-2.5 align-middle"><span className="text-[13px] tabular-nums text-[#667085]">{formatDateTime(getLatestQuotationDate(quotation))}</span></td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <button type="button" onClick={() => updateCustomerQuotationNotes(quotation)} className="flex min-h-8 max-w-full items-center gap-1.5 rounded-[7px] px-2 py-1 text-left text-[13px] text-[#667085] transition hover:bg-[#edf4ff] hover:text-[#2f6feb]">
                              <Pencil className="h-3.5 w-3.5 shrink-0" />
                              <span className={`truncate ${quotation.notes ? "" : "text-[#98a2b3]"}`} title={quotation.notes || "添加备注"}>{quotation.notes || "添加备注"}</span>
                            </button>
                          </td>
                          <td className="border-b border-[#eef1f5] px-4 py-2.5 align-middle">
                            <div className="quotation-row-actions flex max-w-full flex-wrap items-center justify-start gap-1.5">
                              <Link href={getCustomerQuotationDetailHref(quotation.id)} className={rowPrimaryActionClass}>
                                <Eye className="h-3.5 w-3.5" />打开报价
                              </Link>
                              <button type="button" disabled={busy} onClick={() => setCustomerQuotationStatus(quotation, isFormal ? "DRAFT" : "APPROVED")} className={isFormal ? `${rowActionBaseClass} border-[#a6e7c0] bg-[#ecfdf3] text-[#027a48] shadow-none hover:border-[#75d99a] hover:bg-[#dcfae6] focus-visible:ring-[#12b76a]/20` : rowSecondaryActionClass}>
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{isFormal ? "撤销正式" : "设为正式"}
                              </button>
                              <button type="button" disabled={busy} onClick={() => isSent ? cancelSendCustomerQuotationToDesigner(quotation) : sendCustomerQuotationToDesigner(quotation)} className={isSent ? `${rowActionBaseClass} border-[#c8d9ff] bg-[#edf4ff] text-[#2f6feb] shadow-none hover:border-[#9ebdff] hover:bg-[#e3edff] focus-visible:ring-[#2f6feb]/20` : rowSecondaryActionClass}>
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{isSent ? "撤销发送" : "发送设计师"}
                              </button>
                              <span className="mx-0.5 h-5 w-px shrink-0 bg-[#dce4ef]" aria-hidden="true" />
                              <button type="button" onClick={() => printCustomerQuotation(quotation)} className={rowSoftActionClass}>
                                <Printer className="h-3.5 w-3.5" />打印
                              </button>
                              <button type="button" disabled={busy} onClick={() => copyCustomerQuotation(quotation)} className={rowSoftActionClass}>
                                <Copy className="h-3.5 w-3.5" />复制
                              </button>
                              <button type="button" onClick={() => copyCustomerQuotationShareLink(quotation)} className={quotationCopiedLinkId === quotation.id ? `${rowActionBaseClass} border-[#a6e7c0] bg-[#ecfdf3] text-[#027a48] shadow-none hover:border-[#75d99a] hover:bg-[#dcfae6] focus-visible:ring-[#12b76a]/20` : rowSoftActionClass}>
                                {quotationCopiedLinkId === quotation.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}{quotationCopiedLinkId === quotation.id ? "已复制" : "分享"}
                              </button>
                              <a href={`/api/quotations/${quotation.id}/export`} className={rowSoftActionClass}>
                                <Download className="h-3.5 w-3.5" />导出
                              </a>
                              <span className="mx-0.5 h-5 w-px shrink-0 bg-[#dce4ef]" aria-hidden="true" />
                              <button type="button" disabled={busy} onClick={() => deleteCustomerQuotation(quotation)} className={rowDangerActionClass}>
                                <Trash2 className="h-3.5 w-3.5" />删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] p-3">
                <div className="space-y-3">
                  {quotationPagination.pageItems.map((quotation: any) => {
                    const busy = quotationActionId === quotation.id;
                    const isFormal = String(quotation.status || "").toUpperCase() === "APPROVED";
                    const isSent = String(quotation.status || "").toUpperCase() === "SENT";
                    const costSummary = getQuotationCostSummary(quotation);
                    const quickActionBase = "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border px-3 text-[12px] font-semibold leading-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";
                    const quickPrimaryAction = `${quickActionBase} border-[#2f6feb] bg-[#2f6feb] text-white shadow-[0_8px_18px_rgba(47,111,235,0.18)] hover:border-[#2459c7] hover:bg-[#2459c7] hover:shadow-[0_10px_22px_rgba(47,111,235,0.24)] focus-visible:ring-[#2f6feb]/20`;
                    const quickNeutralAction = `${quickActionBase} border-[#dbe3ee] bg-white text-[#344054] shadow-[0_1px_1px_rgba(15,23,42,0.03)] hover:border-[#b9c6d7] hover:bg-[#f8fafc] hover:text-[#182230] hover:shadow-[0_7px_16px_rgba(15,23,42,0.07)] focus-visible:ring-[#2f6feb]/15`;
                    const quickSoftAction = `${quickActionBase} border-[#dbe3ee] bg-[#fbfcfe] text-[#475467] shadow-[0_1px_1px_rgba(15,23,42,0.03)] hover:border-[#c8d9ff] hover:bg-[#f1f6ff] hover:text-[#2f6feb] hover:shadow-[0_7px_16px_rgba(47,111,235,0.1)] focus-visible:ring-[#2f6feb]/15`;
                    const quickSuccessAction = `${quickActionBase} border-[#a6e7c0] bg-[#ecfdf3] text-[#027a48] shadow-[0_1px_1px_rgba(15,23,42,0.03)] hover:border-[#75d99a] hover:bg-[#dcfae6] hover:shadow-[0_7px_16px_rgba(18,183,106,0.12)] focus-visible:ring-[#12b76a]/20`;
                    const quickSentAction = `${quickActionBase} border-[#c8d9ff] bg-[#edf4ff] text-[#2f6feb] shadow-[0_1px_1px_rgba(15,23,42,0.03)] hover:border-[#9ebdff] hover:bg-[#e3edff] hover:shadow-[0_7px_16px_rgba(47,111,235,0.12)] focus-visible:ring-[#407aff]/20`;
                    const quickDangerAction = `${quickActionBase} border-[#f3c5c0] bg-white text-[#d92d20] shadow-[0_1px_1px_rgba(15,23,42,0.03)] hover:border-[#fda29b] hover:bg-[#fff5f4] hover:shadow-[0_7px_16px_rgba(217,45,32,0.1)] focus-visible:ring-[#d92d20]/15`;
                    return (
                      <article key={quotation.id} className="grid gap-4 rounded-[8px] border border-[#e2e7ee] bg-white p-4 xl:grid-cols-[minmax(0,1fr)_minmax(560px,44%)] xl:items-start">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3 xl:block">
                            <div className="min-w-0">
                              <Link href={getCustomerQuotationDetailHref(quotation.id)} className="block truncate text-sm font-semibold text-[#182230]">{quotation.title || "装修报价单"}</Link>
                              <p className="mt-1 text-xs text-[#667085]">{formatDateTime(getLatestQuotationDate(quotation))}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset xl:hidden ${isFormal ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : isSent ? "bg-[#edf4ff] text-[#2f6feb] ring-[#c8d9ff]" : "bg-[#f2f4f7] text-[#667085] ring-[#e2e7ee]"}`}>{isFormal ? "正式报价" : isSent ? "已发送" : "草稿报价"}</span>
                          </div>
                          <p className="mt-4 text-xl font-semibold leading-7 text-red-600">
                            <span className="tabular-nums">¥ {formatPlainAmount(getQuotationAmount(quotation))}</span>
                            {costSummary ? <span className="ml-1.5 align-baseline text-[12px] font-medium tabular-nums text-[#667085]">（{costSummary}）</span> : null}
                          </p>
                          <button type="button" onClick={() => updateCustomerQuotationNotes(quotation)} className={`mt-2 inline-flex max-w-full items-start gap-1.5 rounded-[7px] px-1.5 py-1 text-left text-xs leading-5 transition hover:bg-[#edf4ff] hover:text-[#2f6feb] ${quotation.notes ? "text-[#667085]" : "text-[#98a2b3]"}`} title={quotation.notes || "添加备注"}>
                            <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2">{quotation.notes || "添加备注"}</span>
                          </button>
                        </div>
                        <div className="rounded-[10px] border border-[#e4eaf2] bg-gradient-to-b from-[#ffffff] to-[#f7fafc] p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#667085]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#2f6feb]" />
                              快捷操作
                            </span>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${isFormal ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : isSent ? "bg-[#edf4ff] text-[#2f6feb] ring-[#c8d9ff]" : "bg-[#f2f4f7] text-[#667085] ring-[#e2e7ee]"}`}>{isFormal ? "正式报价" : isSent ? "已发送" : "草稿报价"}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                            <Link href={getCustomerQuotationDetailHref(quotation.id)} className={quickPrimaryAction}><Eye className="h-3.5 w-3.5" />打开报价</Link>
                            <button type="button" disabled={busy} onClick={() => setCustomerQuotationStatus(quotation, isFormal ? "DRAFT" : "APPROVED")} className={isFormal ? quickSuccessAction : quickNeutralAction}><CheckCircle2 className="h-3.5 w-3.5" />{isFormal ? "撤销正式" : "设为正式"}</button>
                            <button type="button" disabled={busy} onClick={() => isSent ? cancelSendCustomerQuotationToDesigner(quotation) : sendCustomerQuotationToDesigner(quotation)} className={isSent ? quickSentAction : quickNeutralAction}><Send className="h-3.5 w-3.5" />{isSent ? "撤销发送" : "发送设计师"}</button>
                            <button type="button" onClick={() => printCustomerQuotation(quotation)} className={quickSoftAction}><Printer className="h-3.5 w-3.5" />打印 PDF</button>
                            <button type="button" disabled={busy} onClick={() => copyCustomerQuotation(quotation)} className={quickSoftAction}><Copy className="h-3.5 w-3.5" />复制报价</button>
                            <button type="button" onClick={() => copyCustomerQuotationShareLink(quotation)} className={quotationCopiedLinkId === quotation.id ? quickSuccessAction : quickSoftAction}><LinkIcon className="h-3.5 w-3.5" />{quotationCopiedLinkId === quotation.id ? "链接已复制" : "分享链接"}</button>
                            <a href={`/api/quotations/${quotation.id}/export`} className={quickSoftAction}><Download className="h-3.5 w-3.5" />导出表格</a>
                            <button type="button" disabled={busy} onClick={() => deleteCustomerQuotation(quotation)} className={quickDangerAction}><Trash2 className="h-3.5 w-3.5" />删除报价</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <DataPagination
                total={customerQuotations.length}
                page={quotationPagination.page}
                pageSize={quotationPagination.pageSize}
                onPageChange={quotationPagination.setPage}
                onPageSizeChange={quotationPagination.setPageSize}
                itemName="份报价"
                className="shrink-0 border-t border-[#e2e7ee] bg-white px-4 py-3 text-xs"
              />
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-white px-6 py-12 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb]">
                <ReceiptText className="h-6 w-6" />
              </span>
              <h3 className="text-base font-semibold text-[#182230]">还没有预算报价</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#667085]">创建第一份报价后，可在这里管理正式版本、发送设计师并导出交付文件。</p>
              <Link href="/quotations" className="btn-primary mt-5 min-h-10">
                <Plus className="h-4 w-4" />
                新建报价
              </Link>
            </div>
          )}
          </div>
        </div>
      )}

      {quotationNotesTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" disabled={quotationActionId === quotationNotesTarget.id} onClick={() => { setQuotationNotesTarget(null); setQuotationNotesDraft(""); }} aria-label="关闭报价备注弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="quotation-notes-title" className="relative z-10 w-full max-w-[540px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><Pencil className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h3 id="quotation-notes-title" className="text-base font-semibold text-[#182230]">编辑报价备注</h3>
                  <p className="mt-1 truncate text-sm text-[#667085]">{quotationNotesTarget.title || "装修报价单"}</p>
                </div>
              </div>
              <button type="button" disabled={quotationActionId === quotationNotesTarget.id} onClick={() => { setQuotationNotesTarget(null); setQuotationNotesDraft(""); }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 px-5 py-5">
              <div>
                <label htmlFor="quotation-notes" className="mb-2 block text-sm font-medium text-[#344054]">报价备注</label>
                <textarea id="quotation-notes" autoFocus value={quotationNotesDraft} onChange={(event) => setQuotationNotesDraft(event.target.value)} rows={6} placeholder="记录客户关注项、版本差异或内部协作说明" className="w-full resize-y rounded-[8px] border border-[#d5dae1] bg-white px-3 py-2.5 text-sm leading-6 text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#2f6feb] focus:ring-2 focus:ring-[#2f6feb]/15" />
                <p className="mt-1.5 text-right text-xs tabular-nums text-[#98a2b3]">{quotationNotesDraft.length} 字</p>
              </div>
              {quotationMessage && <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quotationMessage}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" disabled={quotationActionId === quotationNotesTarget.id} onClick={() => { setQuotationNotesTarget(null); setQuotationNotesDraft(""); }}>取消</button>
              <button type="button" className="btn-primary" disabled={quotationActionId === quotationNotesTarget.id} onClick={saveCustomerQuotationNotes}>{quotationActionId === quotationNotesTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{quotationActionId === quotationNotesTarget.id ? "保存中..." : "保存备注"}</button>
            </div>
          </div>
        </div>
      )}

      {quotationCopyTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" disabled={quotationActionId === quotationCopyTarget.id} onClick={() => setQuotationCopyTarget(null)} aria-label="关闭复制报价确认弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="quotation-copy-title" className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><Copy className="h-5 w-5" /></span>
                <div><h3 id="quotation-copy-title" className="text-base font-semibold text-[#182230]">复制报价副本</h3><p className="mt-1 text-sm text-[#667085]">将保留原报价内容并创建一个新版本。</p></div>
              </div>
              <button type="button" disabled={quotationActionId === quotationCopyTarget.id} onClick={() => setQuotationCopyTarget(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="flex min-w-0 items-center gap-3 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#667085] ring-1 ring-inset ring-[#e2e7ee]"><ReceiptText className="h-4 w-4" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#344054]">{quotationCopyTarget.title || "装修报价单"}</p><p className="mt-0.5 text-xs tabular-nums text-[#667085]">¥ {formatPlainAmount(getQuotationAmount(quotationCopyTarget))}</p></div>
              </div>
              {quotationMessage && <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quotationMessage}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" disabled={quotationActionId === quotationCopyTarget.id} onClick={() => setQuotationCopyTarget(null)}>取消</button>
              <button type="button" className="btn-primary" disabled={quotationActionId === quotationCopyTarget.id} onClick={confirmCopyCustomerQuotation}>{quotationActionId === quotationCopyTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}{quotationActionId === quotationCopyTarget.id ? "复制中..." : "创建副本"}</button>
            </div>
          </div>
        </div>
      )}

      {quotationDeleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" disabled={quotationActionId === quotationDeleteTarget.id} onClick={() => setQuotationDeleteTarget(null)} aria-label="关闭删除报价确认弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="quotation-delete-title" className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
                <div>
                  <h3 id="quotation-delete-title" className="text-base font-semibold text-[#182230]">删除报价</h3>
                  <p className="mt-1 text-sm text-[#667085]">删除后会移入回收站，可在「报价合同」模块打开该客户的预算记录后恢复。</p>
                </div>
              </div>
              <button type="button" disabled={quotationActionId === quotationDeleteTarget.id} onClick={() => setQuotationDeleteTarget(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="flex min-w-0 items-center gap-3 rounded-[8px] border border-red-100 bg-red-50/60 px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-white text-red-600 ring-1 ring-inset ring-red-100"><ReceiptText className="h-4 w-4" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#344054]">{quotationDeleteTarget.title || "装修报价单"}</p><p className="mt-0.5 text-xs tabular-nums text-[#667085]">¥ {formatPlainAmount(getQuotationAmount(quotationDeleteTarget))}</p></div>
              </div>
              {quotationMessage && <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quotationMessage}</p>}
              <div className="rounded-[8px] border border-[#dce4ef] bg-[#f8fafc] px-3 py-2.5 text-sm leading-6 text-[#667085]">
                <p>恢复路径：报价合同 → 找到该客户 → 打开预算记录 → 右上角「回收站」。</p>
                <Link href="/quotations" className="mt-1 inline-flex text-xs font-semibold text-[#2f6feb] hover:text-[#2459c7]">
                  前往报价合同列表
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" disabled={quotationActionId === quotationDeleteTarget.id} onClick={() => setQuotationDeleteTarget(null)}>取消</button>
              <button type="button" disabled={quotationActionId === quotationDeleteTarget.id} onClick={confirmDeleteCustomerQuotation} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-red-600 bg-red-600 px-4 text-sm font-medium text-white transition hover:border-red-700 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">{quotationActionId === quotationDeleteTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{quotationActionId === quotationDeleteTarget.id ? "删除中..." : "确认删除"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Tab: 合同资料 ---- */}
      {activeTab === "contract" && (
        <div ref={customerDetailContentRef} className={`${panelClass} contract-list-workbench flex ${CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} flex-col overflow-hidden`} style={customerDetailContentStyle}>
          <div className="flex flex-col gap-3 border-b border-[#D9E2EF] bg-white px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#CFE0FF] bg-[#EDF4FF] text-[#407AFF]">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold tracking-tight text-[#162033]">合同资料</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#6F7F96]">管理客户施工合同、签约金额、收款计划和合同附件</p>
              </div>
            </div>
            <button
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-4 text-sm font-bold text-white transition hover:border-[#2f66e8] hover:bg-[#2f66e8] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={openContractModal}
              disabled={contractOpening}
            >
              {contractOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {contractOpening ? "加载中..." : "新建合同"}
            </button>
          </div>
          {contractMessage && !showContractModal && (
            <div className={`mx-5 mt-4 rounded-[12px] border px-3.5 py-2.5 text-sm font-semibold ${
              contractMessage.includes("已创建") || contractMessage.includes("已暂存") || contractMessage.includes("已删除")
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-red-100 bg-red-50 text-red-700"
            }`}>
              {contractMessage}
            </div>
          )}
          {contractsLoading ? (
            <div className="mx-5 mb-5 mt-4 flex min-h-0 flex-1 items-center justify-center rounded-[14px] border border-[#D9E2EF] bg-[#F8FAFC] text-sm font-semibold text-[#6F7F96]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#407AFF]" />
              加载合同资料...
            </div>
          ) : contracts.length > 0 ? (
            <div className="mx-5 mb-5 mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#D9E2EF] bg-white">
              <ThinScrollArea className="min-h-0 flex-1" scrollClassName="h-full">
                <table className="w-full min-w-[1160px] table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup>
                    <col className="w-[64px]" />
                    <col />
                    <col className="w-[158px]" />
                    <col className="w-[142px]" />
                    <col className="w-[132px]" />
                    <col className="w-[112px]" />
                    <col className="w-[210px]" />
                    <col className="w-[128px]" />
                    <col className="w-[150px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#F6F8FB]">
                    <tr className="text-xs font-bold text-[#52647B]">
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-center">序号</th>
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-left">合同名称</th>
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-center">合同编号</th>
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-right">合同金额</th>
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-center">签约日期</th>
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-center">状态</th>
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-left">审批流程</th>
                      <th className="border-b border-r border-[#D9E2EF] px-4 py-3 text-center">收款计划</th>
                      <th className="border-b border-[#D9E2EF] px-4 py-3 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractPagination.pageItems.map((contract, index) => {
                      const statusView = getContractStatusView(contract);
                      const approvalView = getContractApprovalView(contract);
                      const canEditContract = isTemporaryContractDraft(contract) || contract.status === "REJECTED";
                      const normalizedContractStatus = String(contract.status || "").toUpperCase();
                      const canResignContract = normalizedContractStatus === "SIGNED";
                      const canDeleteContract = !["SIGNED", "RESIGNED"].includes(normalizedContractStatus);
                      return (
                        <tr key={contract.id} className="group h-[64px] align-middle transition-colors hover:bg-[#F7FAFF]">
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3 text-center text-xs font-semibold tabular-nums text-[#6F7F96]">{(contractPagination.page - 1) * contractPagination.pageSize + index + 1}</td>
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => setSummaryContract(contract)}
                                className="block max-w-full truncate text-left text-sm font-extrabold text-[#162033] transition hover:text-[#407AFF]"
                                title="查看合同完整纪要"
                              >
                                {contract.title}
                              </button>
                              <p className="mt-1 truncate text-xs font-semibold text-[#8B9AAF]">{contract.content?.contract_type || "合同"}</p>
                            </div>
                          </td>
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSummaryContract(contract)}
                              className="font-semibold tabular-nums tracking-wide text-[#344966] transition hover:text-[#407AFF]"
                              title="查看合同完整纪要"
                            >
                              {contract.contract_no}
                            </button>
                          </td>
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3 text-right font-extrabold tabular-nums text-[#162033]">{formatPlainAmount(contract.total_amount || 0)}</td>
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3 text-center font-semibold tabular-nums text-[#52647B]">{contract.signed_at || "-"}</td>
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3 text-center">
                            <span className={`inline-flex min-w-[58px] justify-center rounded-full border px-2.5 py-1 text-xs font-bold ${statusView.className}`}>
                              {statusView.label}
                            </span>
                          </td>
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3 text-left">
                            <button
                              type="button"
                              onClick={() => setApprovalDetailContract(contract)}
                              className="group/approval w-full rounded-[10px] border border-transparent px-2.5 py-2 text-left transition hover:border-[#CFE0FF] hover:bg-[#EDF4FF]"
                            >
                              <span className="flex min-w-0 items-center justify-between gap-2">
                                <span className={`truncate text-sm font-extrabold ${approvalView.className}`}>{approvalView.title}</span>
                                <span className="shrink-0 text-[11px] font-bold text-[#407AFF] opacity-0 transition-opacity group-hover/approval:opacity-100">查看</span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs font-semibold text-[#8B9AAF]">{approvalView.caption}</span>
                            </button>
                          </td>
                          <td className="border-b border-r border-[#E7EFF9] px-4 py-3 text-center">
                            <span className="inline-flex min-w-[54px] items-center justify-center rounded-full border border-[#D9E2EF] bg-[#F8FAFC] px-2.5 py-1 text-xs font-bold text-[#52647B]">
                              {contract.payment_plans?.length || 0} 期
                            </span>
                          </td>
                          <td className="border-b border-[#E7EFF9] px-4 py-3 text-center">
                            {canEditContract || canResignContract || canDeleteContract || contract.id ? (
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] border border-[#CFE0FF] bg-white px-3 text-xs font-bold text-[#407AFF] transition hover:bg-[#EDF4FF]"
                                  onClick={() => openContractPrint(contract)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  合同预览
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] border border-[#D9E2EF] bg-white px-3 text-xs font-bold text-[#52647B] transition hover:border-[#CFE0FF] hover:bg-[#EDF4FF] hover:text-[#407AFF]"
                                  onClick={() => openContractPrint(contract, true)}
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  打印合同
                                </button>
                                {canEditContract && (
                                  <button type="button" className="inline-flex h-8 items-center justify-center rounded-[9px] border border-[#D9E2EF] bg-white px-3 text-xs font-bold text-[#52647B] transition hover:border-[#CFE0FF] hover:bg-[#EDF4FF] hover:text-[#407AFF]" onClick={() => openContractEditor(contract)}>
                                    {contract.status === "REJECTED" ? "重新编辑" : "继续编辑"}
                                  </button>
                                )}
                                {canResignContract && (
                                  <button
                                    type="button"
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] border border-[#CFE0FF] bg-white px-3 text-xs font-bold text-[#407AFF] transition hover:bg-[#EDF4FF]"
                                    onClick={() => openContractResign(contract)}
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    重签合同
                                  </button>
                                )}
                                {canDeleteContract && (
                                  <button
                                    type="button"
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] border border-red-100 bg-white px-3 text-xs font-bold text-red-600 transition hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => handleDeleteContract(contract)}
                                    disabled={contractDeletingId === contract.id}
                                  >
                                    {contractDeletingId === contract.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    删除
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-[#A3AEC2]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ThinScrollArea>
              <DataPagination
                total={contracts.length}
                page={contractPagination.page}
                pageSize={contractPagination.pageSize}
                onPageChange={contractPagination.setPage}
                onPageSizeChange={contractPagination.setPageSize}
                itemName="份合同"
              />
            </div>
          ) : (
            <div className="mx-5 mb-5 mt-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-[14px] border border-dashed border-[#CFE0FF] bg-[#F8FAFC] px-6 py-16 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] border border-[#CFE0FF] bg-[#EDF4FF] text-[#407AFF]">
                <ClipboardList className="h-8 w-8" />
              </span>
              <h3 className="mb-2 text-base font-extrabold text-[#162033]">暂无合同资料</h3>
              <p className="mb-6 text-sm font-semibold text-[#6F7F96]">创建合同后可同步生成收款计划并归档合同附件</p>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-4 text-sm font-bold text-white transition hover:border-[#2f66e8] hover:bg-[#2f66e8] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={openContractModal}
                disabled={contractOpening}
              >
                {contractOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {contractOpening ? "加载中..." : "新建合同"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- Tab: 操作记录 ---- */}
      {activeTab === "operations" && (
        <div ref={customerDetailContentRef} className={`${panelClass} operation-audit-ui flex ${CUSTOMER_DETAIL_CONTENT_HEIGHT_CLASS} flex-col`} style={customerDetailContentStyle}>
          <div className="flex flex-col gap-3 border-b border-[#e2e7ee] bg-white px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[#182230]">
                  操作记录
              </h3>
                <p className="mt-1 text-xs leading-5 text-[#667085]">共 {operationLogs.length} 条记录 · 追踪客户资料、跟进、款项、报价和合同变化</p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#dce4ef] bg-white px-4 text-sm font-semibold text-[#475467] transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] hover:text-[#182230] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={fetchOperationLogs}
              disabled={operationLogsLoading}
            >
              {operationLogsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              刷新记录
            </button>
          </div>

          <div className="operation-log-scroll min-h-0 flex-1 overflow-y-auto bg-[#f6f8fb] px-5 py-4">
            {operationLogsLoading ? (
              <div className="flex h-full min-h-[260px] items-center justify-center rounded-[12px] border border-[#dfe7f1] bg-white text-sm font-semibold text-[#667085]">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#2f6feb]" />
                加载操作记录...
              </div>
            ) : operationLogsError ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-[12px] border border-[#fecdca] bg-[#fef3f2] px-4 text-center">
                <p className="text-sm font-semibold text-[#b42318]">{operationLogsError}</p>
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-9 items-center justify-center rounded-[10px] border border-[#fecdca] bg-white px-3 text-sm font-semibold text-[#b42318] hover:bg-[#fff8f7]"
                  onClick={fetchOperationLogs}
                >
                  重新加载
                </button>
              </div>
            ) : operationLogs.length > 0 ? (
              <div className="operation-log-list relative space-y-3">
                {operationLogs.map((log, index) => {
                  const changes = getOperationChanges(log);
                  return (
                    <article key={log.id} className="operation-log-entry relative grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                      <div className="relative flex justify-center pt-4">
                        {index < operationLogs.length - 1 && <span aria-hidden="true" className="absolute bottom-[-18px] top-11 w-px bg-[#dfe7f1]" />}
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#cfe0ff] bg-[#edf4ff] text-[#2f6feb] ring-4 ring-[#f6f8fb]">
                          <Clock className="h-3.5 w-3.5" />
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[#dfe7f1] bg-white transition hover:border-[#cfe0ff] hover:bg-[#fbfdff]">
                        <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_176px] lg:items-start lg:gap-4">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            <span className="inline-flex h-6 items-center rounded-full border border-[#cfe0ff] bg-[#edf4ff] px-2.5 text-xs font-semibold text-[#2f6feb]">
                              {getOperationModuleLabel(log.module)}
                            </span>
                              <h4 className="text-sm font-semibold text-[#182230]">{getOperationTitle(log)}</h4>
                          </div>
                            <p className="mt-2 break-words text-sm font-medium leading-6 text-[#475467]">{getOperationContent(log)}</p>
                          {log.target_name && (
                              <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[#667085]">
                              <span className="shrink-0 text-[#98a2b3]">关联对象</span>
                              <span className="min-w-0 truncate text-[#344054]">{log.target_name}</span>
                            </div>
                          )}
                          {changes.length > 0 && (
                              <div className="operation-change-list mt-3 space-y-2">
                              {changes.map((change, changeIndex) => (
                                  <div key={`${log.id}-${change.label}-${changeIndex}`} className="rounded-[10px] border border-[#e2e7ee] bg-[#f8fafc] px-3 py-2.5 text-xs">
                                    <div className="mb-2 font-semibold text-[#344054]">{change.label}</div>
                                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] md:items-center">
                                      <div className="min-w-0 rounded-[8px] border border-[#e2e7ee] bg-white px-2.5 py-2">
                                        <span className="mr-1.5 text-[#98a2b3]">原值</span>
                                        <span className="break-words font-semibold text-[#667085]">{change.before}</span>
                                  </div>
                                      <ArrowRight className="hidden h-4 w-4 justify-self-center text-[#98a2b3] md:block" />
                                      <div className="min-w-0 rounded-[8px] border border-[#cfe0ff] bg-white px-2.5 py-2 ring-1 ring-inset ring-[#edf4ff]">
                                        <span className="mr-1.5 text-[#667085]">新值</span>
                                        <span className="break-words font-semibold text-[#182230]">{change.after}</span>
                                      </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                          <div className="operation-log-meta shrink-0 border-t border-[#eef2f6] pt-3 text-left lg:border-t-0 lg:pt-0 lg:text-right">
                            <p className="text-sm font-semibold tabular-nums text-[#182230]">{formatDateTime(log.created_at)}</p>
                            <p className="mt-1 text-xs font-medium text-[#667085]">
                              操作人：<span className="font-semibold text-[#344054]">{log.operator_name || "未知用户"}</span>
                          </p>
                        </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#cbd5e1] bg-white text-center">
                <Clock className="mb-3 h-10 w-10 text-[#98a2b3]" />
                <h3 className="text-base font-semibold text-[#182230]">暂无操作记录</h3>
                <p className="mt-1 text-sm font-medium text-[#667085]">后续客户资料、跟进、款项、报价、合同等操作会显示在这里</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>

      {approvalDetailContract && (
        <div className="fixed bottom-0 right-0 top-0 z-50 bg-[#111827]/32 backdrop-blur-[1px] md:left-[var(--active-sidebar-width)] max-md:left-0">
          <div className="absolute inset-0" onClick={() => setApprovalDetailContract(null)} />
          <div className="approval-flow-modal-shell contract-approval-flow-ui absolute left-1/2 top-1/2 z-10 flex max-h-[calc(100dvh-40px)] w-[calc(100vw-56px)] max-w-[1080px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] border border-[#dce4ef] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.13)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-[#182230]">合同审批流程</h3>
                  <p className="mt-1 truncate text-xs leading-5 text-[#667085]">{approvalDetailContract.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApprovalDetailContract(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#667085] transition hover:bg-[#f2f6fb] hover:text-[#182230]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f8fb] px-5 py-4">
              {contractMessage && (
                <div className={`mb-4 rounded-[10px] border px-3 py-2 text-sm ${
                  contractMessage.includes("已同意") || contractMessage.includes("已创建") || contractMessage.includes("已暂存")
                    ? "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]"
                    : contractMessage.includes("已驳回")
                      ? "border-[#fedf89] bg-[#fffaeb] text-[#b54708]"
                      : "border-[#fecdca] bg-[#fef3f2] text-[#b42318]"
                }`}>
                  {contractMessage}
                </div>
              )}
              {(() => {
                const approval = approvalDetailContract.approval;
                const approvalView = getContractApprovalView(approvalDetailContract);
                const instanceMeta = getApprovalStatusMeta(approval?.status);
                const nodeGroups = groupApprovalSteps(approval?.steps);

                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_1.7fr_0.8fr]">
                      <div className="rounded-[12px] border border-[#dfe7f1] bg-white px-4 py-3">
                        <p className="text-xs font-medium text-[#667085]">整体状态</p>
                        <div className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${approval ? instanceMeta.className : "border-[#dce4ef] bg-[#f2f6fb] text-[#475467]"}`}>
                          {approval ? getApprovalInstanceStatusText(approval.status) : approvalView.title}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[#dfe7f1] bg-white px-4 py-3">
                        <p className="text-xs font-medium text-[#667085]">审批流程</p>
                        <p className="mt-2 truncate text-sm font-semibold text-[#182230]">{approval?.flow_name || approvalView.title}</p>
                      </div>
                      <div className="rounded-[12px] border border-[#dfe7f1] bg-white px-4 py-3">
                        <p className="text-xs font-medium text-[#667085]">审批进度</p>
                        <p className="mt-2 text-lg font-semibold tabular-nums text-[#182230]">
                          {approval ? `${approval.approved_nodes || 0}/${approval.total_nodes || 0}` : "-"}
                        </p>
                      </div>
                    </div>

                    {!approval ? (
                      <div className="rounded-[12px] border border-dashed border-[#cbd5e1] bg-white px-5 py-8 text-center">
                        <CircleDashed className="mx-auto mb-3 h-10 w-10 text-[#98a2b3]" />
                        <p className="font-semibold text-[#182230]">{approvalView.title}</p>
                        <p className="mt-2 text-sm text-[#667085]">{approvalView.caption}</p>
                      </div>
                    ) : nodeGroups.length === 0 ? (
                      <div className="rounded-[12px] border border-dashed border-[#fedf89] bg-[#fffaeb] px-5 py-8 text-center text-[#b54708]">
                        <p className="font-semibold">审批流程暂无节点</p>
                        <p className="mt-2 text-sm">请检查分公司合同审批流配置。</p>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
                        <div className="flex items-center justify-between gap-3 border-b border-[#e2e7ee] bg-white px-5 py-4">
                          <div>
                            <p className="text-[15px] font-semibold text-[#182230]">流程明细</p>
                            <p className="mt-1 text-xs leading-5 text-[#667085]">按审批顺序展示每个节点、审批人和处理记录。</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              printApprovalFlow({
                                title: "合同审批流程",
                                subtitle: approvalDetailContract.title,
                                approval,
                                summary: [
                                  { label: "合同名称", value: approvalDetailContract.title || "-" },
                                  { label: "合同编号", value: approvalDetailContract.contract_no || "-" },
                                  { label: "合同金额", value: `¥ ${formatPlainAmount(Number(approvalDetailContract.total_amount || 0))}` },
                                  { label: "合同状态", value: getContractStatusView(approvalDetailContract).label },
                                  { label: "创建人", value: approvalDetailContract.created_by_name || "-" },
                                ],
                                onBlocked: setContractMessage,
                              });
                            }}
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-[8px] border border-[#d6deea] bg-white px-3 text-xs font-semibold text-[#344054] transition-colors hover:border-[#2f6feb] hover:text-[#2f6feb]"
                          >
                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                            打印
                          </button>
                        </div>
                        <div className="p-4">
                          <div className="space-y-3">
                            {nodeGroups.map((group, index) => {
                              const nodeStatus = getApprovalNodeStatus(group.steps);
                              const nodeMeta = getApprovalStatusMeta(nodeStatus);
                              const NodeIcon = nodeMeta.icon;
                              const approveMode = group.steps[0]?.approve_mode === "all" ? "全部人审批" : "任一人审批";
                              return (
                                <div key={`${group.sortOrder}-${group.nodeName}`} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                                  <div className="relative flex justify-center">
                                    <span className={`z-10 flex h-8 w-8 items-center justify-center rounded-full text-white ring-4 ring-white ${nodeMeta.dotClassName}`}>
                                      <NodeIcon className="h-4 w-4" />
                                    </span>
                                    {index < nodeGroups.length - 1 && <span className="absolute top-8 h-[calc(100%+12px)] w-px bg-[#dfe7f1]" />}
                                  </div>
                                  <div>
                                    <div className="rounded-[12px] border border-[#dfe7f1] bg-[#f8fafc] p-4">
                                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-[#182230]">{index + 1}. {group.nodeName}</span>
                                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${nodeMeta.className}`}>{nodeMeta.label}</span>
                                          </div>
                                          <p className="mt-1 text-xs text-[#667085]">{approveMode}</p>
                                        </div>
                                      </div>

                                      <div className="mt-3 grid gap-2">
                                        {group.steps.map((step: any) => {
                                          const stepMeta = getApprovalStatusMeta(step.status);
                                          const canHandleCurrentStep = step.status === "pending" && step.approver_id === user?.id;
                                          const approveLoading = approvalProcessingId === step.id + "approve";
                                          const rejectLoading = approvalProcessingId === step.id + "reject";
                                          return (
                                            <div key={step.id} className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-3">
                                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div className="flex min-w-0 items-start gap-3">
                                                  <ApprovalUserAvatar name={step.approver_name} avatar={step.approver_avatar} pending={step.status === "pending"} />
                                                  <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                      <p className="font-semibold text-[#182230]">{step.approver_name || "审批人"}</p>
                                                      <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-semibold ${stepMeta.className}`}>{stepMeta.label}</span>
                                                    </div>
                                                    <p className="mt-1 text-xs leading-5 text-[#667085]">{step.action_at ? `处理时间：${formatDateTime(step.action_at)}` : step.status === "pending" ? "等待当前审批人处理" : "尚未到达该审批人"}</p>
                                                  <ApprovalSignaturePreview step={step} compact />
                                                  </div>
                                                </div>
                                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                  {canHandleCurrentStep && (
                                                    <>
                                                      <button
                                                        type="button"
                                                        onClick={() => openApprovalCommentModal({ kind: "contract", stepId: step.id, action: "approve" })}
                                                        disabled={Boolean(approvalProcessingId)}
                                                        className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[#abefc6] bg-[#ecfdf3] px-3 text-xs font-semibold text-[#027a48] transition hover:border-[#75e0a7] hover:bg-[#dcfae6] disabled:opacity-60"
                                                      >
                                                        {approveLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                                        同意
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => openApprovalCommentModal({ kind: "contract", stepId: step.id, action: "reject" })}
                                                        disabled={Boolean(approvalProcessingId) || !step.can_reject}
                                                        className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[#fecdca] bg-[#fef3f2] px-3 text-xs font-semibold text-[#d92d20] transition hover:border-[#fda29b] hover:bg-[#fee4e2] disabled:opacity-60"
                                                      >
                                                        {rejectLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                                        驳回
                                                      </button>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                              {step.comment && (
                                                <div className="mt-3 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-3 py-2 text-xs leading-5 text-[#667085]">
                                                  审批意见：{step.comment}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <ContractSummaryModal
        contract={summaryContract}
        currentUserId={user?.id}
        approvalProcessingId={approvalProcessingId}
        onClose={() => setSummaryContract(null)}
        onApprovalAction={(stepId, action) => openApprovalCommentModal({ kind: "contract", stepId, action })}
      />

      {/* Contract Modal */}
      {showContractModal && (
        <div className="fixed bottom-0 right-0 top-0 z-50 bg-[#111827]/32 backdrop-blur-[1px] md:left-[var(--active-sidebar-width)] max-md:left-0">
          <div className="absolute inset-0" onClick={() => setShowContractModal(false)} />
          <div className="contract-workbench-ui absolute left-1/2 top-1/2 z-10 flex h-[calc(100dvh-32px)] max-h-[880px] w-[calc(100vw-56px)] max-w-[1240px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] border border-[#dce4ef] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.13)]">
            <div className="border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-[#182230]">
                    {contractForm.resign_source_contract_id ? "重签合同" : contractForm.id ? "编辑暂存合同" : "新建合同"}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[#667085]">
                  {contractForm.resign_source_contract_id ? "重签会生成一份新合同，原合同保留为历史归档。" : "可随时暂存当前填写内容，最终创建后再同步生成收款计划。"}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f8fb] px-5 py-4">
              {contractForm.resign_source_contract_id && (
                <div className="mb-4 rounded-[10px] border border-[#cfe0ff] bg-[#edf4ff] px-3 py-2 text-sm text-[#2459c7]">
                  当前正在发起合同重签。新合同签约成功后，原已签约合同会自动标记为“已重签”并保留历史记录。
                </div>
              )}
              <div className="mb-4 rounded-[12px] border border-[#dfe7f1] bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#2f6feb]">第 {contractStep + 1} 步</p>
                    <h4 className="mt-0.5 text-[15px] font-semibold text-[#182230]">{contractSteps[contractStep]?.title}</h4>
                    <p className="mt-0.5 text-xs leading-5 text-[#667085]">{contractSteps[contractStep]?.desc}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#f2f6fb] px-3 py-1.5 text-xs font-semibold text-[#475467] ring-1 ring-[#dce4ef]">
                    {contractStep + 1}/{contractSteps.length}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-1 rounded-[10px] bg-[#f2f6fb] p-1">
                  {contractSteps.map((step, index) => {
                    const active = contractStep === index;
                    const done = contractStep > index;
                    const available = index <= contractStep;
                    return (
                      <button
                        key={step.title}
                        type="button"
                        onClick={() => {
                          if (available) {
                            setContractStep(index);
                            setContractMessage("");
                            clearContractMissingFields();
                          }
                        }}
                        className={`group flex min-h-9 items-center justify-center gap-2 rounded-[8px] px-2 text-[13px] font-semibold transition-all ${
                          active
                            ? "bg-white text-[#2f6feb] ring-1 ring-[#dbe7ff]"
                            : done
                              ? "text-[#344054] hover:bg-white/80"
                              : "cursor-default text-[#98a2b3]"
                        }`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-xs ${
                          active ? "bg-[#2f6feb] text-white" : done ? "bg-[#ecfdf3] text-[#027a48] ring-1 ring-[#abefc6]" : "bg-white text-[#98a2b3] ring-1 ring-[#d0d7e2]"
                        }`}>
                          {done ? <CheckCircle className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <span className="truncate">{step.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {contractStep === 0 && (
                <div className="grid min-h-[520px] gap-4 xl:grid-cols-[minmax(0,1fr)_292px]">
                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4">
                      <h4 className="text-[15px] font-semibold text-[#182230]">合同基本信息</h4>
                      <p className="mt-1 text-xs leading-5 text-[#667085]">合同编号需保持唯一，合同名称建议包含客户姓名和小区房号。</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-surface-700">合同类型 <span className="text-red-600">*</span></span>
                        <SystemSelect
                          value={contractForm.contract_type}
                          onChange={(event) => {
                            const nextType = event.target.value;
                            const defaultTemplate = contractTemplates.find((template) => template.contract_type === nextType && template.status === "published" && template.is_default)
                              || contractTemplates.find((template) => template.contract_type === nextType && template.status === "published");
                            setContractForm((prev) => ({
                              ...prev,
                              contract_type: nextType,
                              contract_template_id: defaultTemplate?.id || "",
                            }));
                          }}
                          className={contractRequiredFieldClassName("contract_type")}
                          data-contract-required-field="contract_type"
                        >
                          {contractTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </SystemSelect>
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-surface-700">合同模板</span>
                        <SystemSelect
                          value={selectedContractTemplate?.id || contractForm.contract_template_id}
                          onChange={(event) => setContractForm((prev) => ({ ...prev, contract_template_id: event.target.value }))}
                          className="input-field"
                        >
                          {contractTemplateOptions.length === 0 && <option value="">暂无模板，创建时使用标准模板</option>}
                          {contractTemplateOptions.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}{template.is_default ? "（默认）" : ""} · v{template.current_version || 1}
                            </option>
                          ))}
                        </SystemSelect>
                        <p className="mt-1 text-xs text-surface-500">
                          模板在分公司设置维护；提交审批或创建合同时会冻结当前模板版本，历史合同不会被后续模板修改影响。
                        </p>
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-surface-700">合同名称 <span className="text-red-600">*</span></span>
                        <input
                          value={contractForm.title}
                          onChange={(event) => setContractForm((prev) => ({ ...prev, title: event.target.value }))}
                          className={contractRequiredFieldClassName("title")}
                          data-contract-required-field="title"
                          placeholder="例如：张三-天河某小区装修施工合同"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">合同编号 <span className="text-red-600">*</span></span>
                        <input
                          value={contractForm.contract_no}
                          onChange={(event) => setContractForm((prev) => ({ ...prev, contract_no: event.target.value }))}
                          className={contractRequiredFieldClassName("contract_no")}
                          data-contract-required-field="contract_no"
                          placeholder="例如：HT20260621001"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">签约日期</span>
                        <SystemDateInput
                          value={contractForm.signed_at}
                          onChange={(nextValue) => setContractForm((prev) => ({ ...prev, signed_at: nextValue }))}
                          className="input-field"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="rounded-[12px] border border-[#dfe7f1] bg-[#f8fafc] p-4">
                      <h4 className="text-[15px] font-semibold text-[#182230]">合同概览</h4>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                          <p className="text-xs text-[#667085]">客户</p>
                          <p className="mt-1 font-semibold text-[#182230]">{customer?.name || "-"}</p>
                        </div>
                        <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                          <p className="text-xs text-[#667085]">项目地址</p>
                          <p className="mt-1 break-words font-semibold leading-5 text-[#182230]">{contractForm.project_address || customer?.address || "-"}</p>
                        </div>
                        <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                          <p className="text-xs text-[#667085]">最新报价金额</p>
                          <p className="mt-1 font-semibold tabular-nums text-[#d92d20]">
                            {latestQuotation ? formatPlainAmount(getQuotationAmount(latestQuotation)) : "-"}
                          </p>
                        </div>
                        <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                          <p className="text-xs text-[#667085]">已收定金</p>
                          <p className="mt-1 font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(contractDepositTotal)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[12px] border border-[#cfe0ff] bg-[#edf4ff] p-4 text-sm leading-6 text-[#2459c7]">
                      <div>
                        <p className="font-semibold text-[#175cd3]">填写建议</p>
                        <p className="mt-2">施工合同可以用“客户姓名 + 小区房号 + 合同类型”命名，后续查找、打印和财务对账会更清晰。</p>
                      </div>
                      <div className="mt-4 rounded-full bg-white/80 px-3 py-2 text-xs text-[#2f6feb]">
                        当前步骤完成后，可继续确认签约双方和项目条款。
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {contractStep === 1 && (
                <div className="grid min-h-[520px] gap-4 lg:grid-cols-2">
                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-[15px] font-semibold text-[#182230]">甲方信息</h4>
                        <p className="text-xs leading-5 text-[#667085]">通常为业主或客户本人</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">甲方姓名 <span className="text-red-600">*</span></span>
                        <input value={contractForm.party_a_name} onChange={(event) => setContractForm((prev) => ({ ...prev, party_a_name: event.target.value, party_a_contact: event.target.value || prev.party_a_contact }))} className={contractRequiredFieldClassName("party_a_name")} data-contract-required-field="party_a_name" />
                      </label>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">联系人</span>
                          <input value={contractForm.party_a_contact} onChange={(event) => setContractForm((prev) => ({ ...prev, party_a_contact: event.target.value }))} className="input-field" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">手机号 <span className="text-red-600">*</span></span>
                          <input value={contractForm.party_a_phone} onChange={(event) => setContractForm((prev) => ({ ...prev, party_a_phone: event.target.value }))} className={contractRequiredFieldClassName("party_a_phone")} data-contract-required-field="party_a_phone" />
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">身份证号/证件号</span>
                        <input value={contractForm.party_a_id_no} onChange={(event) => setContractForm((prev) => ({ ...prev, party_a_id_no: event.target.value }))} className="input-field" placeholder="可选，用于正式合同归档" />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#f2f6fb] text-[#475467] ring-1 ring-inset ring-[#dce4ef]">
                        <Store className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-[15px] font-semibold text-[#182230]">乙方信息</h4>
                        <p className="text-xs leading-5 text-[#667085]">自动带出客户所属分公司法定信息</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">乙方公司 <span className="text-red-600">*</span></span>
                        <input value={contractForm.party_b_name} onChange={(event) => setContractForm((prev) => ({ ...prev, party_b_name: event.target.value }))} className={contractRequiredFieldClassName("party_b_name")} data-contract-required-field="party_b_name" placeholder="请输入签约公司名称" />
                      </label>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">联系人 <span className="text-red-600">*</span></span>
                          <input value={contractForm.party_b_contact} onChange={(event) => setContractForm((prev) => ({ ...prev, party_b_contact: event.target.value }))} className={contractRequiredFieldClassName("party_b_contact")} data-contract-required-field="party_b_contact" placeholder="例如：门店负责人" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">联系电话</span>
                          <input value={contractForm.party_b_phone} onChange={(event) => setContractForm((prev) => ({ ...prev, party_b_phone: event.target.value }))} className="input-field" />
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">营业执照号</span>
                        <input value={contractForm.party_b_license} onChange={(event) => setContractForm((prev) => ({ ...prev, party_b_license: event.target.value }))} className="input-field" placeholder="统一社会信用代码" />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {contractStep === 2 && (
                <div className="flex min-h-[520px] flex-col gap-4">
                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4">
                      <h4 className="text-[15px] font-semibold text-[#182230]">项目信息</h4>
                      <p className="mt-1 text-xs leading-5 text-[#667085]">明确施工地址、面积和合同工期，方便后续施工管理承接。</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <label className="block md:col-span-3">
                        <span className="mb-1 block text-sm font-medium text-surface-700">项目地址 <span className="text-red-600">*</span></span>
                        <input value={contractForm.project_address} onChange={(event) => setContractForm((prev) => ({ ...prev, project_address: event.target.value }))} className={contractRequiredFieldClassName("project_address")} data-contract-required-field="project_address" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">面积（㎡）</span>
                        <input type="number" min="0" step="0.01" value={contractForm.project_area} onChange={(event) => setContractForm((prev) => ({ ...prev, project_area: event.target.value }))} className="input-field" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">计划开工 <span className="text-red-600">*</span></span>
                        <SystemDateInput
                          value={contractForm.planned_start}
                          onChange={(nextValue) => updateContractSchedule({ planned_start: nextValue })}
                          className={contractRequiredFieldClassName("planned_start")}
                          data-contract-required-field="planned_start"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">签约工期（天） <span className="text-red-600">*</span></span>
                        <input type="number" min="1" value={contractForm.duration_days} onChange={(event) => updateContractSchedule({ duration_days: event.target.value })} className={contractRequiredFieldClassName("duration_days")} data-contract-required-field="duration_days" />
                      </label>
                      <div className="contract-switch-field block">
	                        <span className="mb-1 block text-sm font-medium text-surface-700">周末施工</span>
                        <label className="input-field contract-toggle-field flex cursor-pointer items-center justify-between gap-3">
                          <span>{contractForm.weekend_construction ? "周末施工" : "周末不施工"}</span>
                          <input
                            type="checkbox"
                            checked={contractForm.weekend_construction}
                            onChange={(event) => updateContractSchedule({ weekend_construction: event.currentTarget.checked })}
                            className="h-4 w-4 shrink-0 accent-primary-600"
	                            aria-label="周末施工"
                          />
                        </label>
                      </div>
                      <div className="contract-switch-field block">
	                        <span className="mb-1 block text-sm font-medium text-surface-700">节假日施工</span>
                        <label className="input-field contract-toggle-field flex cursor-pointer items-center justify-between gap-3">
                          <span>{contractForm.holiday_construction ? "节假日施工" : "节假日不施工"}</span>
                          <input
                            type="checkbox"
                            checked={contractForm.holiday_construction}
                            onChange={(event) => updateContractSchedule({ holiday_construction: event.currentTarget.checked })}
                            className="h-4 w-4 shrink-0 accent-primary-600"
	                            aria-label="节假日施工"
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">计划竣工 <span className="text-red-600">*</span></span>
                        <SystemDateInput
                          value={contractForm.planned_end}
                          readOnly
                          className={contractRequiredFieldClassName("planned_end", "bg-surface-50 text-surface-700")}
                          data-contract-required-field="planned_end"
                        />
                      </label>
                      <div className="flex items-end text-sm text-surface-500 md:col-span-3">
                        <div className="rounded-[10px] border border-[#dfe7f1] bg-[#f8fafc] px-3 py-2.5 text-xs leading-5 text-[#667085]">
	                          计划竣工将按计划开工、签约工期、周末施工/节假日施工设置自动推算；节假日按系统内置法定节假日判断。
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-[12px] border border-[#dfe7f1] bg-white p-5 lg:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">施工范围 <span className="text-red-600">*</span></span>
                      <textarea value={contractForm.construction_scope} onChange={(event) => setContractForm((prev) => ({ ...prev, construction_scope: event.target.value }))} className={contractRequiredFieldClassName("construction_scope", "min-h-[130px] resize-y")} data-contract-required-field="construction_scope" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">施工条款</span>
                      <textarea value={contractForm.construction_terms} onChange={(event) => setContractForm((prev) => ({ ...prev, construction_terms: event.target.value }))} className="input-field min-h-[130px] resize-y" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">质量标准</span>
                      <textarea value={contractForm.quality_standard} onChange={(event) => setContractForm((prev) => ({ ...prev, quality_standard: event.target.value }))} className="input-field min-h-[110px] resize-y" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">保修条款</span>
                      <textarea value={contractForm.warranty_terms} onChange={(event) => setContractForm((prev) => ({ ...prev, warranty_terms: event.target.value }))} className="input-field min-h-[110px] resize-y" />
                    </label>
                  </div>
                </div>
              )}

              {contractStep === 3 && (
                <div className="flex min-h-[520px] flex-col gap-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                      <div className="mb-4">
                        <h4 className="text-[15px] font-semibold text-[#182230]">合同金额与定金抵扣</h4>
                        <p className="mt-1 text-xs leading-5 text-[#667085]">请选择已设为正式报价的预算，合同金额会按该预算带出。</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block md:col-span-2">
                          <span className="mb-1 block text-sm font-medium text-surface-700">预算报价 <span className="text-red-600">*</span></span>
                          <SystemSelect
                            value={contractForm.quotation_id}
                            onChange={(event) => applyContractQuotation(event.target.value)}
                            className={contractRequiredFieldClassName("quotation_id")}
                            data-contract-required-field="quotation_id"
                          >
                            <option value="">{contractQuotationOptions.length > 0 ? "请选择正式报价" : "暂无正式报价可选"}</option>
                            {contractQuotationOptions.map((quotation: any) => (
                              <option key={quotation.id} value={quotation.id}>
                                {quotation.title || "装修报价单"} · {formatPlainAmount(getQuotationAmount(quotation))} · {formatDateTime(quotation.updated_at || quotation.created_at)}
                              </option>
                            ))}
                          </SystemSelect>
                          {contractQuotationOptions.length === 0 ? (
                            <p className="mt-1 text-xs text-red-600">该客户暂无正式报价，请先在预算报价中将一份报价设为正式报价。</p>
                          ) : (
                            <p className="mt-1 text-xs text-surface-500">这里只能选择状态为“正式报价”的预算。</p>
                          )}
                        </label>
                        {selectedContractQuotation && (
                          <div className="rounded-[10px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2 text-sm text-[#027a48] md:col-span-2">
                            已选择正式报价：{selectedContractQuotation.title || "装修报价单"}，金额 {formatPlainAmount(getQuotationAmount(selectedContractQuotation))}
                          </div>
                        )}
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">合同总金额（元） <span className="text-red-600">*</span></span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={contractForm.total_amount}
                            onChange={(event) => {
                              const nextTotal = Number(event.target.value || 0);
                              setContractForm((prev) => ({
                                ...prev,
                                total_amount: event.target.value,
                                deposit_deduct_amount: prev.deposit_deducted ? String(normalizeContractDepositDeduct(prev.deposit_deduct_amount, nextTotal)) : "",
                              }));
                            }}
                            className={contractRequiredFieldClassName("total_amount")}
                            data-contract-required-field="total_amount"
                            placeholder="请输入合同总金额"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">收款比例模板 <span className="text-red-600">*</span></span>
                          <SystemSelect
                            value={contractForm.payment_scheme_id}
                            onChange={(event) => setContractForm((prev) => ({ ...prev, payment_scheme_id: event.target.value }))}
                            className={contractRequiredFieldClassName("payment_scheme_id")}
                            data-contract-required-field="payment_scheme_id"
                          >
                            {paymentSchemes.length === 0 && <option value="">暂无可用模板</option>}
                            {paymentSchemes.map((scheme) => (
                              <option key={scheme.id} value={scheme.id}>{scheme.name}{scheme.isDefault ? "（默认）" : ""}</option>
                            ))}
                          </SystemSelect>
                        </label>
                        <div className="flex min-h-[118px] flex-col justify-between rounded-[10px] border border-[#dfe7f1] bg-[#f8fafc] px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-5 text-[#182230]">定金是否抵扣</p>
                              <p className="mt-1 text-xs leading-5 text-[#667085]">当前已收定金</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setContractForm((prev) => {
                                const nextDeducted = !prev.deposit_deducted;
                                return {
                                  ...prev,
                                  deposit_deducted: nextDeducted,
                                  deposit_deduct_amount: nextDeducted ? String(getMaxContractDepositDeduct(Number(prev.total_amount || 0))) : "",
                                };
                              })}
                              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${contractForm.deposit_deducted ? "bg-[#2f6feb]" : "bg-[#d0d7e2]"}`}
                              aria-label="定金是否抵扣"
                            >
                              <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,0.2)] transition-transform ${contractForm.deposit_deducted ? "translate-x-5" : "translate-x-0"}`} />
                            </button>
                          </div>
                          <p className="text-lg font-semibold leading-6 tabular-nums text-[#d92d20]">{formatPlainAmount(contractDepositTotal)}</p>
                        </div>
                        <label className="flex min-h-[118px] flex-col justify-between rounded-[10px] border border-[#dfe7f1] bg-[#f8fafc] px-4 py-3.5">
                          <span className="block text-sm font-semibold leading-5 text-[#182230]">本次抵扣定金（元）</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!contractForm.deposit_deducted}
                            value={contractForm.deposit_deducted ? String(contractDepositDeductAmount) : ""}
                            onChange={(event) => setContractForm((prev) => ({
                              ...prev,
                              deposit_deduct_amount: String(normalizeContractDepositDeduct(event.target.value, Number(prev.total_amount || 0))),
                            }))}
                            className={contractRequiredFieldClassName("deposit_deduct_amount", contractForm.deposit_deducted ? "" : "bg-surface-50 text-surface-400")}
                            data-contract-required-field="deposit_deduct_amount"
                            placeholder={contractForm.deposit_deducted ? "请输入抵扣金额" : "不抵扣时为空"}
                          />
                          <p className="text-xs leading-5 text-surface-500">最多可抵扣 {formatPlainAmount(getMaxContractDepositDeduct(contractTotalAmount))}，取已收定金和合同金额中的较小值。</p>
                        </label>
                      </div>
                      {paymentSchemes.length === 0 && (
                        <div className="mt-4 rounded-[10px] border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-sm text-[#b42318]">
                          当前分公司未配置收款比例模板，请先到分公司设置维护合同收款方案。
                        </div>
                      )}
                    </div>

                    <div className="rounded-[12px] border border-[#dfe7f1] bg-[#f8fafc] p-4">
                      <h4 className="text-[15px] font-semibold text-[#182230]">金额汇总</h4>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[#667085]">合同总金额</span>
                          <span className="font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(contractTotalAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#667085]">定金抵扣</span>
                          <span className="font-semibold tabular-nums text-[#182230]">{formatPlainAmount(contractDepositDeductAmount)}</span>
                        </div>
                        <div className="border-t border-[#dfe7f1] pt-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#182230]">应收合同款</span>
                            <span className="text-xl font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(contractPayableAmount)}</span>
                          </div>
                        </div>
                        <div className={`rounded-[10px] px-3 py-2 text-xs font-semibold ${
                          contractPaymentRatioTotal === 100 ? "bg-[#ecfdf3] text-[#027a48] ring-1 ring-[#abefc6]" : "bg-[#fef3f2] text-[#b42318] ring-1 ring-[#fecdca]"
                        }`}>
                          收款比例合计：{formatPlainAmount(contractPaymentRatioTotal).replace(".00", "")}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e2e7ee] bg-[#f8fafc] px-4 py-3">
                      <div>
                        <h4 className="text-[15px] font-semibold text-[#182230]">收款计划预览</h4>
                        <p className="mt-1 text-xs text-[#667085]">按应收合同款和选择的收款比例自动生成</p>
                      </div>
                      {selectedPaymentScheme && (
                        <span className="rounded-full border border-[#dce4ef] bg-white px-3 py-1 text-xs font-semibold text-[#344054]">
                          {selectedPaymentScheme.name}
                        </span>
                      )}
                    </div>
                    {contractPaymentStages.length > 0 ? (
                      <ThinScrollArea>
                        <table className="w-full min-w-[760px] text-sm">
                          <thead className="bg-[#f8fafc]">
                            <tr className="border-b border-[#e2e7ee] text-xs font-semibold text-[#475467]">
                              <th className="px-4 py-3 text-center">期数</th>
                              <th className="px-4 py-3 text-left">收款阶段</th>
                              <th className="px-4 py-3 text-center">比例</th>
                              <th className="px-4 py-3 text-left">触发条件</th>
                              <th className="px-4 py-3 text-right">应收金额</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#eef2f6]">
                            {contractPaymentStages.map((stage, index) => (
                              <tr key={stage.id || index} className="hover:bg-[#f8fafc]">
                                <td className="px-4 py-3 text-center text-[#667085]">{index + 1}</td>
                                <td className="px-4 py-3 font-medium text-[#182230]">{stage.name || `第${index + 1}期款`}</td>
                                <td className="px-4 py-3 text-center text-[#475467]">{Number(stage.ratio || 0)}%</td>
                                <td className="px-4 py-3 text-[#667085]">{stage.trigger || "-"}</td>
                                <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(stage.amount || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ThinScrollArea>
                    ) : (
                      <div className="py-12 text-center text-sm text-surface-400">请选择收款比例模板</div>
                    )}
                  </div>
                </div>
              )}

              {contractStep === 4 && (
                <div className="grid min-h-[520px] gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-[15px] font-semibold text-[#182230]">合同附件</h4>
                        <p className="mt-1 text-xs leading-5 text-[#667085]">可上传合同扫描件、签字页、补充协议、客户确认截图等资料。</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary shrink-0"
                        onClick={() => contractFileInputRef.current?.click()}
                        disabled={contractUploading}
                      >
                        {contractUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {contractUploading ? "上传中..." : "上传附件"}
                      </button>
                      <input
                        ref={contractFileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(event) => {
                          handleContractAttachmentUpload(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>

                    {contractForm.attachments.length > 0 ? (
                      <div className="space-y-2">
                        {contractForm.attachments.map((file) => (
                          <div key={file.id} className="flex items-center gap-3 rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5 hover:bg-[#f8fafc]">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb]">
                              {file.mime_type?.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[#182230]">{file.file_name}</p>
                              <p className="mt-0.5 text-xs text-[#98a2b3]">{formatFileSize(file.file_size) || "合同附件"}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePreviewCustomerFile(file)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#edf4ff] hover:text-[#2f6feb]"
                              title="预览"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeContractAttachment(file.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#fef3f2] hover:text-[#d92d20]"
                              title="从本合同移除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] text-center text-sm text-[#667085]">
                        <Upload className="mb-3 h-8 w-8 text-[#98a2b3]" />
                        <p>暂未上传合同附件</p>
                        <p className="mt-1 text-xs">可先创建合同，后续再补充归档。</p>
                      </div>
                    )}

                    <label className="mt-5 block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">合同备注</span>
                      <textarea
                        value={contractForm.remarks}
                        onChange={(event) => setContractForm((prev) => ({ ...prev, remarks: event.target.value }))}
                        className="input-field min-h-[120px] resize-y"
                        placeholder="例如：客户要求本周内完成签约归档，补充协议另行上传。"
                      />
                    </label>
                  </div>

                  <div className="rounded-[12px] border border-[#dfe7f1] bg-[#f8fafc] p-4">
                    <h4 className="text-[15px] font-semibold text-[#182230]">创建前确认</h4>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                        <p className="text-xs text-[#667085]">合同名称</p>
                        <p className="mt-1 break-words font-semibold leading-5 text-[#182230]">{contractForm.title || "-"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                          <p className="text-xs text-[#667085]">合同类型</p>
                          <p className="mt-1 font-semibold text-[#182230]">{contractForm.contract_type || "-"}</p>
                        </div>
                        <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                          <p className="text-xs text-[#667085]">收款期数</p>
                          <p className="mt-1 font-semibold text-[#182230]">{contractPaymentStages.length} 期</p>
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5">
                        <p className="text-xs text-[#667085]">应收合同款</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(contractPayableAmount)}</p>
                      </div>
                      <div className="rounded-[10px] border border-[#fedf89] bg-[#fffaeb] px-3 py-2 text-xs leading-5 text-[#b54708]">
                        创建后会生成合同记录、收款计划，并将客户进度更新为合同已创建。合同内容后续可继续完善查看。
                      </div>
                    </div>
                    <div className="mt-4 rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-3 text-xs leading-5 text-[#667085]">
                      附件不是必填项。若纸质合同尚未扫描，可以先完成合同创建，后续从合同资料中补充上传。
                    </div>
                  </div>
                </div>
              )}

              {contractMessage && (
                <div className={`mt-4 rounded-[10px] border px-3 py-2 text-sm ${
                  contractMessage.includes("已上传") || contractMessage.includes("已创建") || contractMessage.includes("已暂存") ? "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]" : "border-[#fecdca] bg-[#fef3f2] text-[#b42318]"
                }`}>
                  {contractMessage}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowContractModal(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSaveContractDraft}
                  disabled={contractSaving || contractUploading}
                >
                  {contractSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {contractSaving ? "暂存中..." : "暂存"}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setContractStep((step) => Math.max(step - 1, 0));
                    setContractMessage("");
                  }}
                  disabled={contractStep === 0 || contractSaving}
                >
                  上一步
                </button>
                {contractStep < contractSteps.length - 1 ? (
                  <button type="button" className="btn-primary" onClick={nextContractStep} disabled={contractSaving}>
                    下一步
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={handleSaveContract} disabled={contractSaving || contractUploading}>
                    {contractSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {contractSaving ? "创建中..." : contractForm.id ? "完成创建" : "创建合同"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Designer Assignment Request Modal */}
      {showDesignerRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/32 p-4 backdrop-blur-[1px]">
          <div className="absolute inset-0" onClick={() => setShowDesignerRequestModal(false)} />
          <div className="relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[12px] border border-[#dce4ef] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.13)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-[#182230]">申请分配设计师</h3>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">提交后由{designerAssignmentDispatcherLabel}确认分配</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDesignerRequestModal(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#dce4ef] bg-white text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f6f8fb] p-4">
              <button
                type="button"
                onClick={() => setPreferredDesignerId("")}
                className={`flex w-full items-center justify-between gap-3 rounded-[10px] border px-4 py-3 text-left transition ${
                  preferredDesignerId
                    ? "border-[#e2e7ee] bg-white text-[#475467] hover:border-[#cfe0ff] hover:bg-[#fbfdff]"
                    : "border-[#b8d1ff] bg-[#edf4ff] text-[#2f6feb]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">不指定意向设计师</span>
                  <span className="mt-1 block truncate text-xs opacity-80">由{designerAssignmentDispatcherLabel}处理时决定具体设计师</span>
                </span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${preferredDesignerId ? "border-[#cfd7e3] bg-white" : "border-[#2f6feb] bg-[#2f6feb] text-white"}`}>
                  {!preferredDesignerId && <CheckCircle2 className="h-3.5 w-3.5" />}
                </span>
              </button>
              <div className="overflow-hidden rounded-[10px] border border-[#e2e7ee] bg-white">
                <div className="flex flex-col gap-2 border-b border-[#e2e7ee] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#182230]">指定意向设计师（可选）</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#667085]">
                      点击下方设计师卡片后，会作为本次申请的意向设计师提交。
                    </p>
                  </div>
                  {preferredDesignerId && (
                    <button
                      type="button"
                      onClick={() => setPreferredDesignerId("")}
                      className="inline-flex min-h-8 shrink-0 items-center justify-center self-start rounded-[8px] border border-[#cfe0ff] bg-[#edf4ff] px-2.5 text-xs font-medium text-[#2f6feb] transition hover:bg-white sm:self-auto"
                      aria-label="已指定意向设计师，点击改为不指定"
                      title="已指定意向设计师，点击改为不指定"
                    >
                      清除选择
                    </button>
                  )}
                </div>
                <div className="p-3">
                  <TeamMemberPickerPanel
                    members={teamPickerMembers}
                    loading={teamPickerLoading}
                    error={teamPickerError}
                    query={teamPickerQuery}
                    onQueryChange={setTeamPickerQuery}
                    roleFilter={teamPickerRoleFilter}
                    onRoleFilterChange={setTeamPickerRoleFilter}
                    roleOptions={[]}
                    selectedUserId={preferredDesignerId}
                    onSelect={setPreferredDesignerId}
                    total={teamPickerTotal}
                    hasMore={teamPickerHasMore}
                    actionHint="点击卡片指定意向设计师"
                    emptyTitle="没有找到设计师"
                    emptyDescription="可以输入姓名、工号、手机号或组织继续查找"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-white px-5 py-4">
              <button className="btn-secondary min-h-10" onClick={() => setShowDesignerRequestModal(false)}>取消</button>
              <button className="btn-primary min-h-10" onClick={handleDesignerAssignmentRequest}>提交申请</button>
            </div>
          </div>
        </div>
      )}

      {showDesignerAssignmentFlow && designerAssignmentRequest && (
        <DesignerAssignmentFlowModal
          request={designerAssignmentRequest}
          canAssign={canAssignDesignerFromFlow}
          canDispatch={canDispatchDesignerFromFlow}
          onAssign={() => {
            setShowDesignerAssignmentFlow(false);
            setAssignModalRole("DESIGNER");
          }}
          onDispatch={() => {
            setShowDesignerAssignmentFlow(false);
            setShowDesignerDispatchModal(true);
          }}
          onClose={() => setShowDesignerAssignmentFlow(false)}
        />
      )}

      {showDesignerDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/28 p-4 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => !dispatchingDesignerRequest && setShowDesignerDispatchModal(false)} />
          <div className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-[18px] border border-white/80 bg-white shadow-[0_22px_60px_rgba(21,35,62,0.18)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e7eff9] bg-[#f8fbff] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#EDF4FF] text-[#407AFF] ring-1 ring-[#cfe0ff]">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-[#162033]">分派设计师处理人</h3>
                  <p className="mt-0.5 text-xs font-semibold leading-5 text-[#7c8aa0]">可从客户所属分公司的全部在职员工中选择。处理人只可办理当前客户这一次设计师分配。</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDesignerDispatchModal(false)}
                disabled={dispatchingDesignerRequest}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#dce8f8] bg-white text-[#52647b] transition hover:bg-[#EDF4FF] hover:text-[#407AFF] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <TeamMemberPickerPanel
                members={dispatchPickerMembers}
                loading={dispatchPickerLoading}
                error={dispatchPickerError}
                query={dispatchPickerQuery}
                onQueryChange={setDispatchPickerQuery}
                roleFilter="ALL"
                onRoleFilterChange={() => {}}
                roleOptions={[]}
                selectedUserId={dispatchHandlerId}
                onSelect={setDispatchHandlerId}
                total={dispatchPickerTotal}
                hasMore={dispatchPickerHasMore}
                actionHint="点击人员卡片指定处理人"
                emptyTitle="没有找到可分派人员"
                emptyDescription="可以输入姓名、工号、手机号或组织继续查找"
              />
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[#e7eff9] bg-white px-5 py-4">
              <button className="btn-secondary text-sm" disabled={dispatchingDesignerRequest} onClick={() => setShowDesignerDispatchModal(false)}>取消</button>
              <button className="btn-primary text-sm" disabled={!dispatchHandlerId || dispatchPickerLoading || dispatchingDesignerRequest} onClick={handleDesignerAssignmentDispatch}>
                {dispatchingDesignerRequest && <Loader2 className="h-4 w-4 animate-spin" />}
                {dispatchingDesignerRequest ? "分派中..." : "确认分派"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6">
          <button type="button" className="fixed inset-0 cursor-default" onClick={() => setShowDepositModal(false)} aria-label="关闭款项弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="payment-entry-title" className="payment-entry-modal-shell relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[10px] border border-[#dfe5ed] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e6eaf0] bg-white px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ring-1 ring-inset ${isDesignFeeForm ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-[#edf4ff] text-[#2f6feb] ring-[#cfe0ff]"}`}>
                  {isDesignFeeForm ? <Palette className="h-[18px] w-[18px]" /> : <WalletCards className="h-[18px] w-[18px]" />}
                </span>
                <div className="min-w-0">
                  <h3 id="payment-entry-title" className="truncate text-base font-semibold text-[#182230]">{editingDepositId ? `编辑${depositFormLabel}记录` : `添加${depositFormLabel}`}</h3>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">{editingDepositId ? `修改并更新这条${depositFormLabel}流水` : isDesignFeeForm ? "记录设计服务收入及计费依据" : "记录客户定金到账信息"}</p>
                </div>
              </div>
              <button type="button" onClick={() => { setShowDepositModal(false); setEditingDepositId(null); }} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#98a2b3] transition-colors hover:bg-[#f2f4f7] hover:text-[#344054]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex flex-col gap-3 border-b border-[#e1e6ed] bg-[#f7f9fc] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-white text-[#2f6feb] ring-1 ring-inset ring-[#dfe5ed]"><ReceiptText className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#182230]">收款方式</p>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">选择本次款项的到账确认方式</p>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-1 rounded-[8px] border border-[#dfe5ed] bg-[#eef2f6] p-1 sm:w-[300px]">
                <button
                  type="button"
                  onClick={() => {
                    setDepositMode("manual");
                    setDepositForm((prev) => ({
                      ...prev,
                      payment_channel: prev.payment_channel === "扫码支付" ? "微信" : prev.payment_channel,
                      receiver_name: user?.name || prev.receiver_name,
                      voucher_url: depositVoucherByMode.manual,
                    }));
                    setDepositMessage("");
                  }}
                  className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-semibold transition-colors ${
                    depositMode === "manual" ? "bg-white text-[#2f6feb] shadow-[0_1px_3px_rgba(17,24,39,0.08),0_0_0_1px_#cfe0ff]" : "text-[#667085] hover:bg-white/70 hover:text-[#344054]"
                  }`}
                >
                  <WalletCards className="h-4 w-4" />
                  手动记录
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDepositMode("qr");
                    setDepositForm((prev) => ({
                      ...prev,
                      payment_channel: "扫码支付",
                      receiver_name: branchCollectionRules?.paymentAccountName || prev.receiver_name,
                      voucher_url: depositVoucherByMode.qr,
                    }));
                    setDepositMessage("");
                  }}
                  className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-semibold transition-colors ${
                    depositMode === "qr" ? "bg-white text-[#2f6feb] shadow-[0_1px_3px_rgba(17,24,39,0.08),0_0_0_1px_#cfe0ff]" : "text-[#667085] hover:bg-white/70 hover:text-[#344054]"
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  扫码支付
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
              <div className={depositMode === "qr" ? "grid gap-4 px-5 py-5 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-stretch" : "space-y-4 px-5 py-5"}>
                {depositMode === "qr" && (
                  <div className="payment-entry-qr-panel rounded-[10px] border border-[#dfe5ed] bg-white p-5">
                    <div className="flex h-full flex-col justify-between gap-5">
                      <div className="flex min-w-0 shrink-0 flex-col items-center">
                        {branchCollectionRules?.paymentQrCodeUrl ? (
                          <div className="flex h-[300px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#e2e7ee] bg-[#fbfdff] p-3">
                            <NativeImage src={branchCollectionRules.paymentQrCodeUrl} alt="分公司收款码" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="flex h-[300px] w-full shrink-0 flex-col items-center justify-center rounded-[10px] border border-dashed border-red-200 bg-red-50 px-3 text-center text-red-600">
                            <QrCode className="mb-2 h-6 w-6" />
                            <p className="text-xs font-semibold">未配置收款码</p>
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <div className="w-full min-w-0">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className="inline-flex h-7 items-center rounded-full border border-[#cfe0ff] bg-[#edf4ff] px-2.5 text-xs font-semibold text-[#2f6feb]">扫码收款</span>
                            <p className="truncate text-[13px] font-semibold text-[#182230]">公司收款信息</p>
                          </div>
                          <div className="mt-3 grid gap-2">
                            <div className="min-w-0 rounded-[8px] bg-[#f8fafc] px-3 py-2">
                              <p className="text-[11px] text-[#667085]">收款码名称</p>
                              <p className="mt-0.5 truncate text-[13px] font-semibold text-[#182230]">{branchCollectionRules?.paymentQrCodeName || "分公司收款码"}</p>
                            </div>
                            <div className="min-w-0 rounded-[8px] bg-[#f8fafc] px-3 py-2">
                              <p className="text-[11px] text-[#667085]">收款对象</p>
                              <p className="mt-0.5 truncate text-[13px] font-semibold text-[#182230]">{branchCollectionRules?.paymentAccountName || "-"}</p>
                            </div>
                          </div>
                          <p className="mt-3 rounded-[8px] bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                            {branchCollectionRules?.paymentQrNote || `请客户付款后备注姓名和小区房号，财务确认到账后再保存${depositFormLabel}记录。`}
                          </p>
                        </div>
                        <div className="mt-4 grid shrink-0 grid-cols-2 gap-3 border-t border-[#eef1f5] pt-4 text-xs">
                          <div>
                            <p className="text-[#667085]">本次实收</p>
                            <p className="mt-1 truncate text-lg font-semibold tabular-nums text-red-600">{depositForm.amount ? formatPlainAmount(Number(depositForm.amount)) : "0.00"}</p>
                          </div>
                          <div>
                            <p className="text-[#667085]">收款时间</p>
                            <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{formatDateTime(depositForm.received_at)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="payment-entry-form min-h-0 rounded-[10px] border border-[#dfe5ed] bg-white px-5 py-4">
                  <div className="mb-4 flex items-start gap-3 border-b border-[#e8edf3] pb-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] ${isDesignFeeForm ? "bg-amber-50 text-amber-700" : "bg-[#edf4ff] text-[#2f6feb]"}`}>
                      {isDesignFeeForm ? <Palette className="h-3.5 w-3.5" /> : <ReceiptText className="h-3.5 w-3.5" />}
                    </span>
                    <div>
                      <h4 className="text-[13px] font-semibold text-[#182230]">{isDesignFeeForm ? "计费与收款信息" : "定金收款信息"}</h4>
                      <p className="mt-0.5 text-xs text-[#667085]">{isDesignFeeForm ? `当前按「${getDesignFeeModeLabel(depositForm.design_fee_mode)}」计费，先确认计算依据` : "带红色星号的项目为必填项"}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="hidden">
                      <span className="mb-1 block text-sm font-medium text-surface-700">款项类型</span>
                      <input value={depositFormLabel} readOnly className="input-field bg-surface-50 text-surface-500" />
                    </label>
                    {isDesignFeeForm && (
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-surface-700">设计费计算方式</span>
                        <SystemSelect
                          value={depositForm.design_fee_mode}
                          onChange={(event) => {
                            const nextMode = event.target.value;
                            setDepositForm((prev) => {
                              const defaultArea = prev.design_fee_area || (customer?.area_size ? String(customer.area_size) : "");
                              const defaultLevel = prev.designer_level || designerLevelPriceOptions[0].level;
                              const defaultUnitPrice = prev.design_fee_unit_price || String(getDesignerLevelDefaultPrice(defaultLevel) || "");
                              const next = {
                                ...prev,
                                design_fee_mode: nextMode,
                                quotation_id: isQuotationBasedDesignFeeMode(nextMode) ? prev.quotation_id : "",
                                quotation_amount: isQuotationBasedDesignFeeMode(nextMode) ? prev.quotation_amount : "",
                                design_fee_base_amount: isQuotationBasedDesignFeeMode(nextMode) ? prev.design_fee_base_amount : "",
                                design_fee_area: nextMode === "designer_level_area" ? defaultArea : "",
                                design_fee_unit_price: nextMode === "designer_level_area" ? defaultUnitPrice : "",
                                designer_level: nextMode === "designer_level_area" ? defaultLevel : "",
                                receivable_amount: isAutoCalculatedDesignFeeMode(nextMode) ? "" : prev.receivable_amount || prev.amount,
                              };
                              if (isQuotationBasedDesignFeeMode(nextMode) && prev.quotation_id) {
                                const quotation = designFeeQuotationOptions.find((item: any) => item.id === prev.quotation_id);
                                const quoteAmount = quotation ? toMoney(getQuotationAmount(quotation)) : Number(prev.quotation_amount || 0);
                                const directAmount = quotation ? getQuotationDirectAmount(quotation) : Number(prev.design_fee_base_amount || 0);
                                const baseAmount = nextMode === "direct_fee_ratio" ? directAmount : quoteAmount;
                                const rate = Number(prev.design_fee_rate || 0);
                                const feeAmount = baseAmount > 0 && rate > 0 ? toMoney(baseAmount * rate / 100) : 0;
                                next.quotation_amount = quoteAmount ? String(quoteAmount) : "";
                                next.design_fee_base_amount = baseAmount ? String(baseAmount) : "";
                                next.receivable_amount = feeAmount ? String(feeAmount) : "";
                              } else if (nextMode === "designer_level_area") {
                                const area = Number(defaultArea || 0);
                                const unitPrice = Number(defaultUnitPrice || 0);
                                const feeAmount = area > 0 && unitPrice > 0 ? toMoney(area * unitPrice) : 0;
                                next.receivable_amount = feeAmount ? String(feeAmount) : "";
                              }
                              return next;
                            });
                          }}
                          className="input-field"
                          menuClassName="payment-entry-select-menu"
                          optionClassName="payment-entry-select-option"
                        >
                          {designFeeCalculationModes.map((mode) => (
                            <option key={mode.key} value={mode.key}>{mode.label}</option>
                          ))}
                        </SystemSelect>
                      </label>
                    )}
                    {isDesignFeeForm && isQuotationBasedDesignFeeMode(depositForm.design_fee_mode) && (
                      <>
                        <label className="block md:col-span-2">
                          <span className="mb-1 block text-sm font-medium text-surface-700">关联正式报价 <span className="text-red-600">*</span></span>
                          <SystemSelect
                            value={depositForm.quotation_id}
                            onChange={(event) => applyDesignFeeQuotation(event.target.value, depositForm.design_fee_rate, depositForm.design_fee_mode)}
                            className="input-field"
                            menuClassName="payment-entry-select-menu"
                            optionClassName="payment-entry-select-option"
                          >
                            <option value="">请选择正式报价</option>
                            {designFeeQuotationOptions.map((quotation: any) => {
                              const amount = toMoney(getQuotationAmount(quotation));
                              const directAmount = getQuotationDirectAmount(quotation);
                              return (
                                <option key={quotation.id} value={quotation.id}>
                                  {quotation.title || "装修报价单"} · 合计 {formatPlainAmount(amount)} · 直接费 {formatPlainAmount(directAmount)}
                                </option>
                              );
                            })}
                          </SystemSelect>
                          {designFeeQuotationOptions.length === 0 && (
                            <p className="mt-1 text-xs text-amber-600">当前客户暂无正式报价，无法按报价或直接费比例计算设计费。</p>
                          )}
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">{depositForm.design_fee_mode === "direct_fee_ratio" ? "直接费基数" : "报价合计"}</span>
                          <input value={designFeeBaseAmount ? formatPlainAmount(designFeeBaseAmount) : ""} readOnly className="input-field bg-surface-50 text-surface-500" placeholder="选择报价后自动带出" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">设计费比例（%） <span className="text-red-600">*</span></span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={depositForm.design_fee_rate}
                            onChange={(event) => {
                              const rate = event.target.value;
                              if (depositForm.quotation_id) {
                                applyDesignFeeQuotation(depositForm.quotation_id, rate, depositForm.design_fee_mode);
                              } else {
                                setDepositForm((prev) => ({ ...prev, design_fee_rate: rate }));
                              }
                            }}
                            className="input-field"
                            placeholder="例如：3"
                          />
                        </label>
                      </>
                    )}
                    {isDesignFeeForm && depositForm.design_fee_mode === "designer_level_area" && (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">设计师等级 <span className="text-red-600">*</span></span>
                          <SystemSelect
                            value={depositForm.designer_level}
                            onChange={(event) => {
                              const level = event.target.value;
                              const defaultUnitPrice = getDesignerLevelDefaultPrice(level);
                              setDepositForm((prev) => {
                                const unitPrice = defaultUnitPrice > 0 ? defaultUnitPrice : Number(prev.design_fee_unit_price || 0);
                                const area = Number(prev.design_fee_area || 0);
                                const feeAmount = area > 0 && unitPrice > 0 ? toMoney(area * unitPrice) : 0;
                                return {
                                  ...prev,
                                  designer_level: level,
                                  design_fee_unit_price: unitPrice ? String(unitPrice) : "",
                                  receivable_amount: feeAmount ? String(feeAmount) : "",
                                };
                              });
                            }}
                            className="input-field"
                            menuClassName="payment-entry-select-menu"
                            optionClassName="payment-entry-select-option"
                          >
                            <option value="">请选择设计师等级</option>
                            {designerLevelPriceOptions.map((item) => (
                              <option key={item.level} value={item.level}>{item.level}{item.unitPrice ? ` · ${item.unitPrice}元/㎡` : ""}</option>
                            ))}
                          </SystemSelect>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">计费面积（㎡） <span className="text-red-600">*</span></span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={depositForm.design_fee_area}
                            onChange={(event) => {
                              const areaValue = event.target.value;
                              const unitPrice = Number(depositForm.design_fee_unit_price || 0);
                              const feeAmount = Number(areaValue || 0) > 0 && unitPrice > 0 ? toMoney(Number(areaValue) * unitPrice) : 0;
                              setDepositForm((prev) => ({ ...prev, design_fee_area: areaValue, receivable_amount: feeAmount ? String(feeAmount) : "" }));
                            }}
                            className="input-field"
                            placeholder="默认取客户装修面积"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-surface-700">等级单价（元/㎡） <span className="text-red-600">*</span></span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={depositForm.design_fee_unit_price}
                            onChange={(event) => {
                              const priceValue = event.target.value;
                              const area = Number(depositForm.design_fee_area || 0);
                              const feeAmount = area > 0 && Number(priceValue || 0) > 0 ? toMoney(area * Number(priceValue)) : 0;
                              setDepositForm((prev) => ({ ...prev, design_fee_unit_price: priceValue, receivable_amount: feeAmount ? String(feeAmount) : "" }));
                            }}
                            className="input-field"
                            placeholder="例如：120"
                          />
                        </label>
                      </>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">应收{depositFormLabel}（元） <span className="text-red-600">*</span></span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositForm.receivable_amount}
                        onChange={(event) => setDepositForm((prev) => ({
                          ...prev,
                          receivable_amount: event.target.value,
                        }))}
                        className="input-field"
                        readOnly={isDesignFeeForm && isAutoCalculatedDesignFeeMode(depositForm.design_fee_mode)}
                        placeholder={isDesignFeeForm && isAutoCalculatedDesignFeeMode(depositForm.design_fee_mode) ? "填写计算条件后自动计算" : isDesignFeeForm ? "例如：3000" : "例如：5000"}
                      />
                      {isDesignFeeForm && isAutoCalculatedDesignFeeMode(depositForm.design_fee_mode) && computedDesignFeeAmount > 0 && (
                        <p className="mt-1 text-xs text-surface-500">
                          系统按{depositForm.design_fee_mode === "direct_fee_ratio" ? "直接费 × 比例" : depositForm.design_fee_mode === "designer_level_area" ? "等级单价 × 面积" : "报价合计 × 比例"}自动计算应收设计费，实收可留空后续补收。
                        </p>
                      )}
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">实收{depositFormLabel}（元）</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositForm.amount}
                        onChange={(event) => setDepositForm((prev) => ({ ...prev, amount: event.target.value }))}
                        className="input-field"
                        placeholder={isDesignFeeForm ? "可不填，后续补收" : "可不填，后续补收"}
                      />
                      <p className="mt-1 text-xs text-surface-500">未实际到账可留空，保存后作为待收款项处理。</p>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">收款时间 <span className="text-red-600">*</span></span>
                      <SystemDateInput
                        type="datetime-local"
                        value={depositForm.received_at}
                        onChange={(nextValue) => setDepositForm((prev) => ({ ...prev, received_at: nextValue }))}
                        className="input-field"
                      />
                    </label>
                    {depositMode === "manual" ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-surface-700">收款方式 <span className="text-red-600">*</span></span>
                    <SystemSelect
                      value={depositForm.payment_channel}
                      onChange={(event) => setDepositForm((prev) => ({ ...prev, payment_channel: event.target.value }))}
                      className="input-field"
                      menuClassName="payment-entry-select-menu"
                      optionClassName="payment-entry-select-option"
                    >
                      {depositPaymentChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </SystemSelect>
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-surface-700">收款方式</span>
                    <input value="扫码支付" readOnly className="input-field bg-surface-50 text-surface-500" />
                  </label>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">{isDesignFeeForm ? "设计费类型" : "定金类型"} <span className="text-red-600">*</span></span>
                      <SystemSelect
                        value={depositForm.deposit_type}
                        onChange={(event) => setDepositForm((prev) => ({ ...prev, deposit_type: event.target.value }))}
                        className="input-field"
                        menuClassName="payment-entry-select-menu"
                        optionClassName="payment-entry-select-option"
                      >
                        {(isDesignFeeForm ? designFeeTypes : depositTypes).map((type) => <option key={type} value={type}>{type}</option>)}
                      </SystemSelect>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-surface-700">收款人</span>
                      <input
                        value={depositForm.receiver_name}
                        onChange={(event) => setDepositForm((prev) => ({ ...prev, receiver_name: event.target.value }))}
                        className="input-field"
                        placeholder={depositMode === "qr" ? "默认取分公司收款账户" : "例如：张三"}
                      />
                    </label>
                    <div className="border-t border-[#e8edf3] pt-4 md:col-span-2">
                      <span className="mb-2 block text-xs font-medium text-[#475467]">收款凭证</span>
                      <div className="flex min-h-[74px] flex-col justify-center gap-3 border border-dashed border-[#cfd7e3] bg-[#f8fafc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 text-xs text-[#667085]">
                          {depositForm.voucher_url ? (
                            <a href={depositForm.voucher_url} target="_blank" rel="noreferrer" className="font-medium text-[#2f6feb] hover:text-[#245fd1]">凭证已上传，点击查看</a>
                          ) : (
                            "支持付款截图或 PDF，便于后续财务复核"
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          <button type="button" className="btn-secondary justify-center !text-xs" onClick={() => setDepositVoucherQrOpen(true)}>
                            <QrCode className="h-4 w-4" />
                            手机扫码上传
                          </button>
                          <label className="btn-secondary cursor-pointer justify-center !text-xs">
                            {depositUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {depositUploading ? "上传中..." : "上传凭证"}
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={(event) => handleDepositVoucherUpload(event.target.files?.[0])}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                  <label className="mt-4 block border-t border-[#e8edf3] pt-4">
                    <span className="mb-2 block text-xs font-medium text-[#475467]">备注</span>
                    <textarea
                      value={depositForm.notes}
                      onChange={(event) => setDepositForm((prev) => ({ ...prev, notes: event.target.value }))}
                      className="input-field min-h-[112px] resize-y"
                      placeholder="例如：客户已支付设计定金，后续安排量房。"
                    />
                  </label>
                </div>
              </div>

              {depositMessage && (
                <div className={`mx-5 mb-5 rounded-[8px] border px-3 py-2 text-sm ${
                  isPositiveDepositMessage(depositMessage) ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
                }`}>
                  {depositMessage}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-[#e2e7ee] bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#667085]">保存后生成款项流水{isDesignFeeForm ? "，设计费不会抵扣工程款" : "；如启用审批，通过后同步客户进度"}</p>
              <div className="flex items-center justify-end gap-2">
                <button className="btn-secondary !min-h-9 !px-4 !text-xs" onClick={() => { setShowDepositModal(false); setEditingDepositId(null); }}>取消</button>
                <button className="btn-primary !min-h-9 !px-4 !text-xs" onClick={handleSaveDeposit} disabled={depositSaving || depositUploading || (depositMode === "qr" && !branchCollectionRules?.paymentQrCodeUrl)}>
                  {depositSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {editingDepositId ? (depositSaving ? "保存中..." : "保存修改") : depositMode === "qr" ? (depositSaving ? "确认中..." : "确认已收款") : (depositSaving ? "保存中..." : `保存${depositFormLabel}`)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {depositVoucherQrOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => { setDepositVoucherQrOpen(false); setDepositVoucherLinkCopied(false); }} aria-label="关闭收款凭证手机上传弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="deposit-voucher-qr-title" className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><Smartphone className="h-5 w-5" /></span>
                <div>
                  <h3 id="deposit-voucher-qr-title" className="text-base font-semibold text-[#182230]">通过手机上传收款凭证</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">扫码后从手机相册或相机上传付款截图</p>
                </div>
              </div>
              <button type="button" onClick={() => { setDepositVoucherQrOpen(false); setDepositVoucherLinkCopied(false); }} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-5">
              <div className="mx-auto flex w-fit rounded-[12px] border border-[#e2e7ee] bg-white p-3">
                {typeof window !== "undefined" && (
                  <NativeImage src={"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(depositVoucherUploadUrl)} alt="收款凭证手机上传二维码" width={220} height={220} className="h-[220px] w-[220px]" />
                )}
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-[#667085]">手机上传成功后，电脑端会自动同步到当前收款凭证；如果未自动同步，可以点击下方按钮。</p>
              <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] p-2">
                <span className="min-w-0 flex-1 truncate px-1 text-xs text-[#667085]">{depositVoucherUploadUrl}</span>
                <button type="button" onClick={handleCopyDepositVoucherUploadLink} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#e2e7ee] bg-white px-2.5 text-xs font-medium text-[#475467] hover:border-[#afc6ff] hover:text-[#2f6feb]">
                  {depositVoucherLinkCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{depositVoucherLinkCopied ? "已复制" : "复制链接"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" onClick={() => syncLatestDepositVoucher(false)} disabled={depositVoucherSyncing}>
                {depositVoucherSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {depositVoucherSyncing ? "检测中..." : "我已上传，立即同步"}
              </button>
              <a href={"https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=" + encodeURIComponent(depositVoucherUploadUrl)} download={"deposit_voucher_qrcode_" + id + ".png"} className="btn-primary"><Download className="h-4 w-4" />下载二维码</a>
            </div>
          </div>
        </div>
      )}

      {paymentLedgerRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6">
          <button type="button" className="fixed inset-0 cursor-default" onClick={() => setPaymentLedgerRecord(null)} aria-label="关闭实收流水弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="payment-ledger-title" className="relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-700"><ReceiptText className="h-5 w-5" /></span>
                <div>
                  <h3 id="payment-ledger-title" className="text-base font-semibold text-[#182230]">{getPaymentRecordLabel(paymentLedgerRecord)}实收流水</h3>
                  <p className="mt-1 text-xs leading-5 text-[#667085]">{paymentLedgerRecord.deposit_type || getPaymentRecordLabel(paymentLedgerRecord)} · 应收 ¥ {formatPlainAmount(getPaymentRecordReceivable(paymentLedgerRecord))} · 已收 ¥ {formatPlainAmount(getDepositActualReceivedAmount(paymentLedgerRecord))}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPaymentLedgerRecord(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-5 py-5">
              <div className="space-y-3">
                {getDepositCollectionLedger(paymentLedgerRecord).map((entry, index) => {
                  const isPosted = entry.status === "received" || entry.status === "approved";
                  const isPending = entry.status === "pending";
                  const statusClass = isPosted ? "bg-emerald-50 text-emerald-700" : isPending ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
                  return (
                    <div key={entry.id} className="grid gap-3 border border-[#e2e7ee] bg-white px-4 py-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-start">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${isPosted ? "bg-emerald-50 text-emerald-700" : isPending ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{index + 1}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#182230]">{entry.label}</p>
                          <span className={`inline-flex min-h-[22px] items-center rounded-[7px] px-2 text-xs font-medium ${statusClass}`}>{entry.statusText}</span>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-[#667085] sm:grid-cols-2">
                          <p>时间：<span className="font-medium text-[#344054]">{formatDateTime(entry.occurredAt)}</span></p>
                          <p>方式：<span className="font-medium text-[#344054]">{entry.channel}</span></p>
                          <p>收款人：<span className="font-medium text-[#344054]">{entry.receiver}</span></p>
                          <p>凭证：{entry.voucherUrl ? <a href={entry.voucherUrl} target="_blank" rel="noreferrer" className="font-medium text-[#2f6feb] hover:text-[#245fd1]">查看</a> : <span className="font-medium text-[#98a2b3]">无</span>}</p>
                        </div>
                        {entry.notes && <p className="mt-2 truncate text-xs text-[#98a2b3]" title={entry.notes}>备注：{entry.notes}</p>}
                      </div>
                      <p className={`text-right text-base font-semibold tabular-nums ${isPosted ? "text-emerald-700" : isPending ? "text-amber-700" : "text-red-700"}`}>¥ {formatPlainAmount(entry.amount)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end border-t border-[#e2e7ee] bg-white px-5 py-4">
              <button type="button" className="btn-secondary !min-h-9 !px-4 !text-xs" onClick={() => setPaymentLedgerRecord(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Top Up Modal */}
      {topUpModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6">
          <button type="button" className="fixed inset-0 cursor-default" onClick={() => setTopUpModalRecord(null)} aria-label="关闭补收弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="top-up-payment-title" className="relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[640px] flex-col overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-700"><WalletCards className="h-5 w-5" /></span>
                <div>
                  <h3 id="top-up-payment-title" className="text-base font-semibold text-[#182230]">补收{getPaymentRecordLabel(topUpModalRecord)}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#667085]">只补充实收金额，应收金额保持不变。</p>
                </div>
              </div>
              <button type="button" onClick={() => setTopUpModalRecord(null)} disabled={topUpSaving} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[8px] border border-[#e2e7ee] bg-white px-4 py-3">
                  <p className="text-xs text-[#667085]">应收金额</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#182230]">¥ {formatPlainAmount(getPaymentRecordReceivable(topUpModalRecord))}</p>
                </div>
                <div className="rounded-[8px] border border-[#e2e7ee] bg-white px-4 py-3">
                  <p className="text-xs text-[#667085]">已收金额</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">¥ {formatPlainAmount(getDepositActualReceivedAmount(topUpModalRecord))}</p>
                </div>
                <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-700">待补金额</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-amber-700">¥ {formatPlainAmount(getDepositRemainingReceiveAmount(topUpModalRecord))}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-surface-700">本次补收金额（元） <span className="text-red-600">*</span></span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={topUpAmount}
                    onChange={(event) => setTopUpAmount(event.target.value)}
                    className="input-field"
                    placeholder="请输入本次补收金额"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-surface-700">补收时间 <span className="text-red-600">*</span></span>
                  <SystemDateInput
                    type="datetime-local"
                    value={topUpReceivedAt}
                    onChange={setTopUpReceivedAt}
                    className="input-field"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-surface-700">补收方式 <span className="text-red-600">*</span></span>
                  <SystemSelect
                    value={topUpPaymentChannel}
                    onChange={(event) => setTopUpPaymentChannel(event.target.value)}
                    className="input-field"
                    menuClassName="payment-entry-select-menu"
                    optionClassName="payment-entry-select-option"
                  >
                    {topUpPaymentChannel === "扫码支付" && <option value="扫码支付">扫码支付</option>}
                    {depositPaymentChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                  </SystemSelect>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-surface-700">收款人</span>
                  <input
                    value={topUpReceiverName}
                    onChange={(event) => setTopUpReceiverName(event.target.value)}
                    className="input-field"
                    placeholder="例如：张三"
                  />
                </label>
                <div className="md:col-span-2">
                  <span className="mb-2 block text-xs font-medium text-[#475467]">补收凭证</span>
                  <div className="flex min-h-[70px] flex-col justify-center gap-3 border border-dashed border-[#cfd7e3] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-xs text-[#667085]">
                      {topUpVoucherUrl ? (
                        <a href={topUpVoucherUrl} target="_blank" rel="noreferrer" className="font-medium text-[#2f6feb] hover:text-[#245fd1]">凭证已上传，点击查看</a>
                      ) : (
                        "可上传本次补收的付款截图或 PDF"
                      )}
                    </div>
                    <label className="btn-secondary cursor-pointer justify-center !text-xs">
                      {topUpUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {topUpUploading ? "上传中..." : "上传凭证"}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(event) => handleTopUpVoucherUpload(event.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-xs font-medium text-[#475467]">补收备注</span>
                  <textarea
                    value={topUpNotes}
                    onChange={(event) => setTopUpNotes(event.target.value)}
                    className="input-field min-h-[96px] resize-y"
                    placeholder="例如：客户补齐剩余定金。"
                  />
                </label>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 border-t border-[#e2e7ee] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#667085]">保存后该条记录的实收金额会累计增加，收款状态自动刷新。</p>
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn-secondary !min-h-9 !px-4 !text-xs" onClick={() => setTopUpModalRecord(null)} disabled={topUpSaving}>取消</button>
                <button type="button" className="btn-primary !min-h-9 !px-4 !text-xs" onClick={handleSaveTopUp} disabled={topUpSaving || topUpUploading}>
                  {topUpSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {topUpSaving ? "保存中..." : "保存补收"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Waiver Modal */}
      {waiverModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6">
          <button type="button" className="fixed inset-0 cursor-default" onClick={() => setWaiverModalRecord(null)} aria-label="关闭尾款减免弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="payment-waiver-title" className="relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[640px] flex-col overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-violet-50 text-violet-700"><CircleCheck className="h-5 w-5" /></span>
                <div>
                  <h3 id="payment-waiver-title" className="text-base font-semibold text-[#182230]">{getPaymentRecordLabel(waiverModalRecord)}尾款减免</h3>
                  <p className="mt-1 text-xs leading-5 text-[#667085]">用于客户剩余款项确认不再收取，实收金额不变，减免金额单独留痕。</p>
                </div>
              </div>
              <button type="button" onClick={() => setWaiverModalRecord(null)} disabled={waiverSaving} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[8px] border border-[#e2e7ee] bg-white px-4 py-3">
                  <p className="text-xs text-[#667085]">应收金额</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#182230]">¥ {formatPlainAmount(getPaymentRecordReceivable(waiverModalRecord))}</p>
                </div>
                <div className="rounded-[8px] border border-[#e2e7ee] bg-white px-4 py-3">
                  <p className="text-xs text-[#667085]">已收金额</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">¥ {formatPlainAmount(getDepositActualReceivedAmount(waiverModalRecord))}</p>
                </div>
                <div className="rounded-[8px] border border-violet-200 bg-violet-50 px-4 py-3">
                  <p className="text-xs text-violet-700">可减免尾款</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-violet-700">¥ {formatPlainAmount(getDepositRemainingReceiveAmount(waiverModalRecord))}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-surface-700">本次减免金额（元） <span className="text-red-600">*</span></span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={waiverAmount}
                    onChange={(event) => setWaiverAmount(event.target.value)}
                    className="input-field"
                    placeholder="请输入本次减免金额"
                  />
                </label>
                <div className="rounded-[8px] border border-violet-100 bg-white px-4 py-3 text-xs leading-5 text-[#667085]">
                  审批通过后，状态会按“实收 + 减免”判断是否结清；原始应收金额不会被改小。
                </div>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-surface-700">减免原因 <span className="text-red-600">*</span></span>
                  <textarea
                    value={waiverReason}
                    onChange={(event) => setWaiverReason(event.target.value)}
                    className="input-field min-h-[96px] resize-y"
                    placeholder="例如：客户尾款经负责人确认不再收取。"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-surface-700">备注</span>
                  <textarea
                    value={waiverNotes}
                    onChange={(event) => setWaiverNotes(event.target.value)}
                    className="input-field min-h-[80px] resize-y"
                    placeholder="可填写沟通记录、确认人或补充说明。"
                  />
                </label>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 border-t border-[#e2e7ee] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#667085]">尾款减免会保留在实收流水中，便于后续财务对账。</p>
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn-secondary !min-h-9 !px-4 !text-xs" onClick={() => setWaiverModalRecord(null)} disabled={waiverSaving}>取消</button>
                <button type="button" className="btn-primary !min-h-9 !px-4 !text-xs" onClick={handleWaiverRequest} disabled={waiverSaving}>
                  {waiverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {waiverSaving ? "提交中..." : "提交减免"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Refund Modal */}
      {refundModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6">
          <button type="button" className="fixed inset-0 cursor-default" onClick={() => setRefundModalRecord(null)} aria-label="关闭退款申请弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="refund-request-title" className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-red-50 text-red-600"><ReceiptText className="h-5 w-5" /></span>
                <div><h3 id="refund-request-title" className="text-base font-semibold text-[#182230]">申请{getRefundActionLabel(refundModalRecord)}</h3><p className="mt-1 text-xs leading-5 text-[#667085]">提交后将按分公司规则进入退款审批或待处理状态。</p></div>
              </div>
              <button type="button" onClick={() => setRefundModalRecord(null)} disabled={refundSaving} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 bg-[#f8fafc] px-5 py-5">
              <div className="rounded-[8px] border border-[#e2e7ee] bg-white px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">原{getPaymentRecordLabel(refundModalRecord)}金额</span>
                  <span className="font-semibold text-red-600">{formatPlainAmount(refundModalRecord.amount || 0)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-surface-500">收款时间</span>
                  <span className="font-medium text-surface-800">{formatDateTime(refundModalRecord.received_at)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-surface-500">已退金额</span>
                  <span className="font-medium text-emerald-700">{formatPlainAmount(getDepositRefundedAmount(refundModalRecord))}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-surface-500">剩余可退</span>
                  <span className="font-semibold text-red-600">{formatPlainAmount(getDepositRemainingRefundAmount(refundModalRecord))}</span>
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-surface-700">退款金额 <span className="text-red-600">*</span></span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundAmount}
                  onChange={(event) => setRefundAmount(event.target.value)}
                  className="input-field"
                  placeholder="请输入本次申请退款金额"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-surface-700">{getRefundActionLabel(refundModalRecord)}原因 <span className="text-red-600">*</span></span>
                <textarea
                  value={refundReason}
                  onChange={(event) => setRefundReason(event.target.value)}
                  className="input-field min-h-[110px] resize-y"
                  placeholder={normalizePaymentRecordType(refundModalRecord.record_type) === "design_fee" ? "例如：客户取消设计服务，申请退还设计费。" : "例如：客户暂缓装修，申请退还设计定金。"}
                />
              </label>
              {depositMessage && (
                <div className={`rounded-lg border px-3 py-2 text-sm ${
                  depositMessage.includes("已提交") ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
                }`}>
                  {depositMessage}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-white px-5 py-4">
              <button className="btn-secondary" onClick={() => setRefundModalRecord(null)}>取消</button>
              <button className="btn-primary" onClick={handleRefundRequest} disabled={refundSaving}>
                {refundSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {refundSaving ? "提交中..." : "提交申请"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <AttachmentPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {measureDialog === "qr" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => { setMeasureDialog(null); setMeasureLinkCopied(false); }} aria-label="关闭通过手机上传弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="measure-qr-title" className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><Smartphone className="h-5 w-5" /></span>
                <div>
                  <h3 id="measure-qr-title" className="text-base font-semibold text-[#182230]">通过手机上传</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">扫码后可从手机相册或相机上传量房资料</p>
                </div>
              </div>
              <button type="button" onClick={() => { setMeasureDialog(null); setMeasureLinkCopied(false); }} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-5">
              <div className="mx-auto flex w-fit rounded-[12px] border border-[#e2e7ee] bg-white p-3">
                {typeof window !== "undefined" && (
                  <NativeImage src={"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(measureUploadUrl)} alt="量房资料手机上传二维码" width={220} height={220} className="h-[220px] w-[220px]" />
                )}
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-[#667085]">二维码仅用于当前客户的量房资料上传，请勿转发给无关人员。</p>
              <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] p-2">
                <span className="min-w-0 flex-1 truncate px-1 text-xs text-[#667085]">{measureUploadUrl}</span>
                <button type="button" onClick={handleCopyMeasureUploadLink} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#e2e7ee] bg-white px-2.5 text-xs font-medium text-[#475467] hover:border-[#afc6ff] hover:text-[#2f6feb]">
                  {measureLinkCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{measureLinkCopied ? "已复制" : "复制链接"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" onClick={() => { setMeasureDialog(null); setMeasureLinkCopied(false); }}>关闭</button>
              <a href={"https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=" + encodeURIComponent(measureUploadUrl)} download={"qrcode_" + id + ".png"} className="btn-primary"><Download className="h-4 w-4" />下载二维码</a>
            </div>
          </div>
        </div>
      )}

      {measureDialog === "requirements" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setMeasureDialog(null)} aria-label="关闭量房标准弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="measure-requirements-title" className="relative z-10 flex max-h-[82vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span>
                <div>
                  <h3 id="measure-requirements-title" className="text-base font-semibold text-[#182230]">量房资料标准</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">上传前请按以下要求核对资料完整性</p>
                </div>
              </div>
              <button type="button" onClick={() => setMeasureDialog(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <RequirementGroup title="必须上传" items={["原始户型草图或电子量房图", "每个空间的长宽高、梁位、门窗洞口尺寸", "水电点位、排水口、地漏、燃气、强弱电箱位置", "现场照片：客餐厅、卧室、厨房、卫生间、阳台、入户门"]} />
                <RequirementGroup title="测量要求" items={["尺寸单位统一为 mm，关键尺寸需标注清楚", "墙体厚度、门洞高度、窗台高度、梁高需单独标注", "异形空间、斜墙、转角、管道井需补充局部尺寸", "无法测量的位置需写明原因和估算依据"]} />
                <RequirementGroup title="照片要求" items={["照片保持清晰并优先横向拍摄", "每个空间至少 2 张全景照，复杂位置增加细节照", "照片需对应空间名称", "渗水、开裂、空鼓、倾斜、管线异常需单独拍照"]} />
                <RequirementGroup title="提交规范" items={["文件命名建议：客户姓名-小区房号-量房日期", "同一客户资料放在同一批次上传", "核对面积、户型、空间名称与客户信息一致", "复尺时补充复尺说明并保留原始版本"]} />
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end border-t border-[#e2e7ee] bg-white px-5 py-4"><button type="button" className="btn-primary" onClick={() => setMeasureDialog(null)}><CheckCircle2 className="h-4 w-4" />我已了解</button></div>
          </div>
        </div>
      )}

      {designDialog === "qr" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => { setDesignDialog(null); setDesignLinkCopied(false); }} aria-label="关闭设计方案手机上传弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="design-qr-title" className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700"><Smartphone className="h-5 w-5" /></span>
                <div>
                  <h3 id="design-qr-title" className="text-base font-semibold text-[#182230]">通过手机上传设计方案</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">扫码后可从手机相册或文件中上传设计资料</p>
                </div>
              </div>
              <button type="button" onClick={() => { setDesignDialog(null); setDesignLinkCopied(false); }} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-5">
              <div className="mx-auto flex w-fit rounded-[12px] border border-[#e2e7ee] bg-white p-3">
                {typeof window !== "undefined" && <NativeImage src={"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(designUploadUrl)} alt="设计方案手机上传二维码" width={220} height={220} className="h-[220px] w-[220px]" />}
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-[#667085]">二维码仅用于当前客户的设计方案上传，请勿转发给无关人员。</p>
              <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] p-2">
                <span className="min-w-0 flex-1 truncate px-1 text-xs text-[#667085]">{designUploadUrl}</span>
                <button type="button" onClick={handleCopyDesignUploadLink} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#e2e7ee] bg-white px-2.5 text-xs font-medium text-[#475467] hover:border-[#afc6ff] hover:text-[#2f6feb]">
                  {designLinkCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{designLinkCopied ? "已复制" : "复制链接"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" onClick={() => { setDesignDialog(null); setDesignLinkCopied(false); }}>关闭</button>
              <a href={"https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=" + encodeURIComponent(designUploadUrl)} download={"design_qrcode_" + id + ".png"} className="btn-primary"><Download className="h-4 w-4" />下载二维码</a>
            </div>
          </div>
        </div>
      )}

      {designDialog === "requirements" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setDesignDialog(null)} aria-label="关闭设计方案标准弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="design-requirements-title" className="relative z-10 flex max-h-[82vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700"><CheckCircle2 className="h-5 w-5" /></span>
                <div>
                  <h3 id="design-requirements-title" className="text-base font-semibold text-[#182230]">设计方案交付标准</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">上传或提交客户确认前，请按以下要求核对</p>
                </div>
              </div>
              <button type="button" onClick={() => setDesignDialog(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <RequirementGroup title="必须上传" items={["平面布置图：标明空间名称、家具尺寸和主要动线", "效果图或意向图：客餐厅、主卧、重点空间需覆盖", "施工图核心图纸：拆改、新建、天花、地面、立面、水电点位", "设计说明：风格定位、主材方向、特殊工艺和客户确认点"]} />
                <RequirementGroup title="图纸要求" items={["图纸比例、尺寸和房屋结构需与量房资料一致", "所有空间名称必须统一，避免报价和施工阶段对不上", "改造墙体、门洞、柜体、设备点位需标注清楚", "复杂节点需补充大样图或局部说明，不能只放效果图"]} />
                <RequirementGroup title="交付规范" items={["文件建议同时上传可编辑源文件和 PDF/图片预览版", "命名建议：客户姓名-小区房号-方案版本-日期", "每次方案调整需保留版本号，如 V1、V2、最终确认版", "客户已确认的方案需在备注或文件名中标明确认日期"]} />
                <RequirementGroup title="提交前核对" items={["面积、户型、承重结构和现场限制已复核", "设计方案与客户预算、生活需求、家庭成员信息匹配", "图纸可支持报价拆项，不缺少关键空间和关键尺寸", "如涉及封窗、定制柜、设备、软装等专项，需单独上传对应方案"]} />
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end border-t border-[#e2e7ee] bg-white px-5 py-4"><button type="button" className="btn-primary" onClick={() => setDesignDialog(null)}><CheckCircle2 className="h-4 w-4" />我已了解</button></div>
          </div>
        </div>
      )}

      {customerFileDeleteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" onClick={closeCustomerFileDeleteConfirm} aria-label="关闭文件删除确认弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="customer-file-delete-title" className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
                <div>
                  <h3 id="customer-file-delete-title" className="text-base font-semibold text-[#182230]">删除资料文件</h3>
                  <p className="mt-1 text-sm text-[#667085]">删除后无法从当前客户资料中恢复。</p>
                </div>
              </div>
              <button type="button" onClick={closeCustomerFileDeleteConfirm} disabled={customerFileDeleting} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="flex min-w-0 items-center gap-3 rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#667085] ring-1 ring-inset ring-[#e2e7ee]"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#344054]">{customerFileDeleteTarget.file_name}</p><p className="mt-0.5 text-xs text-[#98a2b3]">{formatAttachmentCategory(customerFileDeleteTarget.category || "资料文件")} · {formatFileSize(customerFileDeleteTarget.file_size) || "文件"}</p></div>
              </div>
              {customerFileDeleteError && <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{customerFileDeleteError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" disabled={customerFileDeleting} onClick={closeCustomerFileDeleteConfirm}>取消</button>
              <button type="button" onClick={handleDeleteCustomerFile} disabled={customerFileDeleting} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-red-600 bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">{customerFileDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{customerFileDeleting ? "删除中..." : "确认删除"}</button>
            </div>
          </div>
        </div>
      )}

      {followupDeleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 p-4">
          <button type="button" className="absolute inset-0 cursor-default" onClick={closeFollowupDeleteConfirm} aria-label="关闭删除确认弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="followup-delete-title" className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-red-50 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 id="followup-delete-title" className="text-base font-semibold text-[#182230]">删除跟进记录</h3>
                  <p className="mt-1 text-sm text-[#667085]">删除后内容将不再显示，已有回复会保留。</p>
                </div>
              </div>
              <button type="button" onClick={closeFollowupDeleteConfirm} disabled={Boolean(deletingFollowupId)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] hover:text-[#182230] disabled:opacity-50" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                  <span className="font-semibold text-[#344054]">{followupDeleteTarget.user_name || "未知用户"}</span>
                  <span>{followupDeleteTarget.type || "跟进"}</span>
                  <span>{formatDate(followupDeleteTarget.created_at)}</span>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[#475467]">{followupDeleteTarget.content || "仅包含附件的跟进记录"}</p>
              </div>
              {followupDeleteError && <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{followupDeleteError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-[#f8fafc] px-5 py-4">
              <button type="button" className="btn-secondary" disabled={Boolean(deletingFollowupId)} onClick={closeFollowupDeleteConfirm}>取消</button>
              <button type="button" disabled={Boolean(deletingFollowupId)} onClick={handleDeleteFollowup} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-red-600 bg-red-600 px-4 text-sm font-medium text-white transition hover:border-red-700 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                {deletingFollowupId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deletingFollowupId ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AddCustomerModal
        isOpen={showCustomerEditModal}
        onClose={() => setShowCustomerEditModal(false)}
        onSuccess={() => {
          setShowCustomerEditModal(false);
          refetchCustomer();
        }}
        customer={customer}
      />

      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="fixed inset-0 bg-black/50" onClick={() => !lostSubmitting && setShowLostModal(false)} />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-lg">
            <div className="border-b border-surface-100 bg-surface-50/80 px-5 py-4">
              <h3 className="text-lg font-semibold text-surface-900">标记流失/失败</h3>
              <p className="mt-1 text-sm text-surface-500">适用于无效客户、明确不合作、联系不上或暂缓装修等情况。</p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                标记后客户状态会变为“失败/流失”，并自动写入一条跟进记录，方便后续复盘。
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-surface-700">流失/失败原因 <span className="text-red-600">*</span></span>
                <SystemSelect
                  value={lostReason}
                  onChange={(event) => setLostReason(event.target.value)}
                  className="input-field"
                >
                  {customerActionOptions.LOST.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </SystemSelect>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-surface-700">补充说明</span>
                <textarea
                  value={lostRemark}
                  onChange={(event) => setLostRemark(event.target.value)}
                  className="input-field min-h-[120px] resize-y"
                  placeholder="例如：客户已选择同行，报价超预算，后续暂不跟进。"
                />
              </label>
              {lostMessage && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {lostMessage}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-surface-100 px-5 py-4">
              <button className="btn-secondary" onClick={() => setShowLostModal(false)} disabled={lostSubmitting}>取消</button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-600 bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_20px_rgba(220,38,38,0.16)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleMarkCustomerLost}
                disabled={lostSubmitting}
              >
                {lostSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleX className="h-4 w-4" />}
                {lostSubmitting ? "提交中..." : "确认标记"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="fixed inset-0 bg-black/50" onClick={() => !recoverSubmitting && setShowRecoverModal(false)} />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-lg">
            <div className="border-b border-surface-100 bg-surface-50/80 px-5 py-4">
              <h3 className="text-lg font-semibold text-surface-900">恢复/拣回客户</h3>
              <p className="mt-1 text-sm text-surface-500">适用于流失客户重新沟通、重新回到有效客户池的情况。</p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                恢复后客户会重新出现在客户管理“全部”列表，并按已有操作自动判断客户进度，同时写入一条跟进记录。
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-surface-700">拣回说明</span>
                <textarea
                  value={recoverRemark}
                  onChange={(event) => setRecoverRemark(event.target.value)}
                  className="input-field min-h-[120px] resize-y"
                  placeholder="例如：客户重新咨询装修，已加微信，准备重新确认需求。"
                />
              </label>
              {recoverMessage && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {recoverMessage}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-surface-100 px-5 py-4">
              <button className="btn-secondary" onClick={() => setShowRecoverModal(false)} disabled={recoverSubmitting}>取消</button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_20px_rgba(5,150,105,0.16)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleRecoverCustomer}
                disabled={recoverSubmitting}
              >
                {recoverSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
                {recoverSubmitting ? "恢复中..." : "确认恢复"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDesignLinkModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 px-4 py-6">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setShowDesignLinkModal(false)} aria-label="关闭添加在线链接弹窗" />
          <div role="dialog" aria-modal="true" aria-labelledby="design-link-title" className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700"><LinkIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h3 id="design-link-title" className="text-base font-semibold text-[#182230]">添加在线设计方案</h3>
                  <p className="mt-0.5 text-xs text-[#667085]">支持酷家乐、三维家、720 全景图或云盘预览链接</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowDesignLinkModal(false)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7]" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 bg-[#f8fafc] px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#475467]">方案类型</span>
                <SystemSelect
                  value={designLinkForm.type}
                  onChange={(event) => setDesignLinkForm((prev) => ({ ...prev, type: event.target.value }))}
                  className="input-field"
                  menuClassName="payment-entry-select-menu"
                  optionClassName="payment-entry-select-option"
                >
                  {designAttachmentTypes.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </SystemSelect>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#475467]">方案名称</span>
                <input
                  value={designLinkForm.name}
                  onChange={(event) => setDesignLinkForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="input-field"
                  placeholder="例如：客餐厅效果图、全屋720全景"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#475467]">在线链接 <span className="text-red-600">*</span></span>
                <input
                  value={designLinkForm.url}
                  onChange={(event) => setDesignLinkForm((prev) => ({ ...prev, url: event.target.value }))}
                  className="input-field"
                  placeholder="https://..."
                />
              </label>
              {attachmentMessage && (
                <div className={`rounded-[8px] border px-3 py-2 text-sm ${
                  attachmentMessage.includes("已添加") ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
                }`}>
                  {attachmentMessage}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e2e7ee] bg-white px-5 py-4">
              <button className="btn-secondary" onClick={() => setShowDesignLinkModal(false)}>取消</button>
              <button className="btn-primary" onClick={handleSaveDesignLink} disabled={designLinkSaving}>
                {designLinkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                {designLinkSaving ? "保存中..." : "保存链接"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Assignment Modal */}
      {assignModalRole && assignDialogRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/28 p-4 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => setAssignModalRole(null)} />
          <div className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-[18px] border border-white/80 bg-white shadow-[0_22px_60px_rgba(21,35,62,0.18)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e7eff9] bg-[#f8fbff] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#EDF4FF] text-[#407AFF] ring-1 ring-[#cfe0ff]">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-[#162033]">分配{assignDialogRole.label}</h3>
                  <p className="mt-0.5 truncate text-xs font-semibold text-[#7c8aa0]">支持按姓名、工号、手机号、组织快速查找人员</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalRole(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#dce8f8] bg-white text-[#52647b] transition hover:bg-[#EDF4FF] hover:text-[#407AFF]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <TeamMemberPickerPanel
                members={teamPickerMembers}
                loading={teamPickerLoading}
                error={teamPickerError}
                query={teamPickerQuery}
                onQueryChange={setTeamPickerQuery}
                roleFilter={teamPickerRoleFilter}
                onRoleFilterChange={setTeamPickerRoleFilter}
                roleOptions={assignPickerRoleOptions}
                selectedUserId={assignSelectedUserId}
                onSelect={setAssignSelectedUserId}
                total={teamPickerTotal}
                hasMore={teamPickerHasMore}
                emptyTitle="没有找到可分配人员"
                emptyDescription="可以切换岗位范围，或输入姓名、工号、手机号继续查找"
              />
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[#e7eff9] bg-white px-5 py-4">
              <button className="btn-secondary text-sm" onClick={() => setAssignModalRole(null)}>取消</button>
              <button className="btn-primary text-sm" disabled={!assignSelectedUserId || teamPickerLoading} onClick={handleConfirmTeamAssign}>确认分配</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Personnel Modal */}
      {showAddPersonnel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/28 p-4 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => { setShowAddPersonnel(false); setCustomRoleName(""); setSelectedUserId(""); }} />
          <div className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-[18px] border border-white/80 bg-white shadow-[0_22px_60px_rgba(21,35,62,0.18)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e7eff9] bg-[#f8fbff] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#EDF4FF] text-[#407AFF] ring-1 ring-[#cfe0ff]">
                  <Plus className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-[#162033]">添加服务人员</h3>
                  <p className="mt-0.5 truncate text-xs font-semibold text-[#7c8aa0]">用于补充监理、财务、客服等参与角色</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddPersonnel(false); setCustomRoleName(""); setSelectedUserId(""); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#dce8f8] bg-white text-[#52647b] transition hover:bg-[#EDF4FF] hover:text-[#407AFF]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <label className="mb-1.5 block text-sm font-black text-[#52647b]">人员角色</label>
                <input
                  type="text"
                  value={customRoleName}
                  onChange={(e) => setCustomRoleName(e.target.value)}
                  className="input-field"
                  placeholder="例如：监理、保洁、财务..."
                />
                <p className="mt-2 text-xs font-semibold leading-5 text-[#7c8aa0]">
                  这里填写该人员在当前客户里的职责，不会修改员工账号岗位。
                </p>
              </div>
              <TeamMemberPickerPanel
                members={teamPickerMembers}
                loading={teamPickerLoading}
                error={teamPickerError}
                query={teamPickerQuery}
                onQueryChange={setTeamPickerQuery}
                roleFilter={teamPickerRoleFilter}
                onRoleFilterChange={setTeamPickerRoleFilter}
                roleOptions={teamPickerRoleOptions}
                selectedUserId={selectedUserId}
                onSelect={setSelectedUserId}
                total={teamPickerTotal}
                hasMore={teamPickerHasMore}
                emptyTitle="没有找到人员"
                emptyDescription="可以切换岗位范围，或输入姓名、工号、手机号继续查找"
              />
              </div>
            <div className="flex items-center justify-end gap-3 border-t border-[#e7eff9] bg-white px-5 py-4">
              <button className="btn-secondary" onClick={() => { setShowAddPersonnel(false); setCustomRoleName(""); setSelectedUserId(""); }}>取消</button>
              <button className="btn-primary" disabled={!selectedUserId || !customRoleName.trim()} onClick={handleAddPersonnel}>确认添加</button>
            </div>
          </div>
        </div>
      )}

      {teamRemovalTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f172a]/28 p-4 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={closeTeamRemovalConfirm} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-removal-confirm-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-[14px] border border-white/80 bg-white shadow-[0_18px_44px_rgba(21,35,62,0.16)]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#e7eff9] bg-[#fffafa] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-red-50 text-red-600 ring-1 ring-red-100">
                  <UserMinus className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 id="team-removal-confirm-title" className="text-base font-black text-[#162033]">移出服务团队</h3>
                  <p className="mt-0.5 text-xs font-semibold text-[#7c8aa0]">确认后，该人员将不再参与当前客户服务。</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeTeamRemovalConfirm}
                disabled={teamRemoving}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#dce8f8] bg-white text-[#52647b] transition hover:bg-[#EDF4FF] hover:text-[#407AFF] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm leading-6 text-[#52647b]">
                确认将 <span className="font-black text-[#162033]">{teamRemovalTarget.memberName}</span> 移出服务团队吗？
              </p>
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e7eff9] bg-[#f8fbff] px-3 py-2.5">
                <span className="text-xs font-semibold text-[#7c8aa0]">当前角色</span>
                <span className="text-sm font-black text-[#162033]">{teamRemovalTarget.roleLabel}</span>
              </div>
              {teamRemovalError && (
                <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{teamRemovalError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e7eff9] bg-white px-5 py-4">
              <button type="button" className="btn-secondary" disabled={teamRemoving} onClick={closeTeamRemovalConfirm}>取消</button>
              <button
                type="button"
                disabled={teamRemoving}
                onClick={confirmTeamRemoval}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-red-600 bg-red-600 px-4 text-sm font-black text-white transition hover:border-red-700 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {teamRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                {teamRemoving ? "移出中..." : "确认移出"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#F5F7FB] text-sm font-semibold text-[#52647b]">正在加载项目详情...</div>}>
      <CustomerDetailPageContent />
    </Suspense>
  );
}

// ========== Helper Component ==========
