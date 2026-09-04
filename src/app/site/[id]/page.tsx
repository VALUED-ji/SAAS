"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  Activity, AlertTriangle, Archive, ArrowLeft, Calculator, CalendarDays, CheckCircle, ChevronRight, ClipboardCheck, ClipboardList,
  Building2, Camera, CircleCheck, CircleX, Clock, Copy, DollarSign, Download, Eye, FileText, FolderOpen, Home, ImageIcon,
  BrickWall, Hammer, HardHat, Layers, Link2, Loader2, MapPin, Maximize2, MessageCircle, Minimize2, Package, Paintbrush, Pencil, Phone, PlugZap, Plus, Printer, QrCode,
  Filter, Search, Share2, ShieldCheck, ShoppingCart, Store, Trash2, Upload, UserRound,
  UsersRound, Wrench, X, Zap, type LucideIcon,
} from "lucide-react";
import { formatDate, parseAppDate } from "@/lib/utils";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
const ContractSummaryModal = dynamic(() => import("@/components/ContractSummaryModal"), {
  ssr: false,
  loading: () => null,
});
import { useAuth } from "@/lib/auth";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import SystemDateInput from "@/components/ui/SystemDateInput";
import ApprovalSignatureModal from "@/components/approval/ApprovalSignatureModal";

import {
  ChangeOrderApprovalFlow,
  getChangeOrderAddAmount,
  getChangeOrderApprovalNodeStatus,
  getChangeOrderApprovalView,
  getChangeOrderDeductAmount,
  getChangeOrderDiscountAmount,
  getChangeOrderItemCount,
  getChangeOrderListTitle,
  getChangeOrderNetAddAmount,
  getChangeOrderTypeTitle,
  getChangeSignedAmount,
  getQuotationTargetCostBreakdown,
  getValidChangeOrderItems,
  groupChangeOrderApprovalSteps,
  parseChangeOrderItems,
} from "./site-change-orders";
import {
  ChangeOrderForm,
  ChangeOrderItemForm,
  changeOrderStatusLabels,
  contractStatusLabels,
  formatPlainAmount,
  getChangeOrderAddAmountFromItems,
  getChangeOrderFormDiscount,
  getChangeOrderLineAmount,
  materialOrderStatusLabels,
  materialOrderTypeLabels,
  normalizeChangeLineType,
  phaseLabels,
  phaseOptions,
  roundMoney,
} from "./site-detail-shared";
import {
  ChangeMetricCard,
  ChangeOrderItemsEditor,
  ChangeOrderSettlementEditor,
  ChangeOrderStatusBadge,
  CheckinMetric,
  ContractNumberInfoRow,
  ContractTitleInfoRow,
  CostMetricCard,
  EmptyText,
  InfoRow,
  MaterialOrderInfoLine,
  MaterialOrderStatusBadge,
  MaterialOrderTypeBadge,
  PaymentLine,
  PaymentStatusBadge,
  TimelineLogDetail,
} from "./site-detail-bits";
import recordStyles from "./site-records.module.css";
import overviewStyles from "./site-overview.module.css";
import paymentStyles from "./site-payments.module.css";
import scheduleStyles from "./site-schedule.module.css";
import phaseStyles from "./site-phase.module.css";
import handoverStyles from "./site-handover.module.css";
import materialOrderStyles from "./site-material-orders.module.css";
import changeOrderStyles from "./site-change-orders.module.css";
import costStyles from "./site-costs.module.css";
import settlementStyles from "./site-settlement.module.css";
import checkinStyles from "./site-checkin.module.css";
import archiveStyles from "./site-archive.module.css";


import {
  buildSiteCustomerRoomNumber,
  escapeHtml,
  formatDateTime,
  formatPlainQuantity,
  formatShareExpiresAt,
  formatSignedPlainAmount,
  getHandoverMessageClass,
  getMaterialGroup,
  getMaterialImageUrl,
  getMaterialOrderCategory,
  getMaterialOrderSupplierName,
  getMaterialSpecText,
  getPaymentRecordActualReceivedAmount,
  getPaymentRecordReceivableAmount,
  getSiteAddress,
  getSiteDisplayName,
  getSiteOrderReceiveAddress,
  getTeamDepartmentName,
  getTeamMemberInitial,
  makeQrCodeUrl,
  toSafeFileName,
} from "./site-format-utils";
import {
  AddressPinIcon,
  AreaMeasureIcon,
  BedroomIcon,
  BuildingNoIcon,
  CommunityIcon,
  CreateTimeIcon,
  CustomerProfileIcon,
  DecorationIcon,
  LayoutIcon,
  MobilePhoneIcon,
  RoomCardIcon,
  StoreFrontIcon,
  UnitDoorIcon,
  WechatBubbleIcon,
} from "../../projects/[id]/customer-info-icons";

const CostCategoryDonut = dynamic(() => import("./CostCategoryDonut"), {
  ssr: false,
  loading: () => <div className={`${costStyles.categoryDonutFigure} ${costStyles.categoryDonutSkeleton}`} aria-hidden="true" />,
});

const SiteCameraTab = dynamic(() => import("@/components/site/SiteCameraTab"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[320px] items-center justify-center text-sm text-surface-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      摄像头加载中...
    </div>
  ),
});

const SiteQuantityReviewTab = dynamic(() => import("./SiteQuantityReviewTab"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[320px] items-center justify-center text-sm text-surface-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      工程量复核加载中...
    </div>
  ),
});

const constructionStageDisplayLabels: Record<string, string> = {
  CONSTRUCTION_STAGE_HANDOVER: "开工交底",
  CONSTRUCTION_STAGE_DEMOLITION: "拆改",
  CONSTRUCTION_STAGE_HYDROPOWER: "水电",
  CONSTRUCTION_STAGE_MASONRY: "泥瓦",
  CONSTRUCTION_STAGE_CARPENTRY: "木作吊顶",
  CONSTRUCTION_STAGE_PAINT: "油漆",
  CONSTRUCTION_STAGE_INSTALLATION: "安装",
  CONSTRUCTION_STAGE_COMPLETION: "竣工验收",
};

function getConstructionStageDisplayLabel(value: unknown, fallback = "-") {
  const rawValue = String(value || "").trim();
  if (!rawValue) return fallback;
  const normalizedValue = rawValue.toUpperCase();
  if (constructionStageDisplayLabels[normalizedValue]) return constructionStageDisplayLabels[normalizedValue];
  if (phaseLabels[normalizedValue]) return phaseLabels[normalizedValue];
  if (/[\u4e00-\u9fa5]/.test(rawValue)) return rawValue;
  return fallback;
}

const statusLabels: Record<string, string> = {
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

const SITE_DETAIL_CONTENT_HEIGHT_CLASS = "min-h-[480px]";

const costCategoryLabels: Record<string, string> = {
  AUXILIARY: "辅材",
  LABOR: "人工",
  MAIN_MATERIAL: "主材",
  EQUIPMENT: "设备",
  SUBCONTRACT: "外包",
  MANAGEMENT: "管理",
  OTHER: "其他",
};

const costCategoryOptions = Object.entries(costCategoryLabels);

const materialOrderStatusOptions = Object.entries(materialOrderStatusLabels);

const materialOrderTypeHelpers: Record<string, string> = {
  AUXILIARY_WAREHOUSE: "项目经理下单，直营仓接单拣货配送",
  AUXILIARY_MONTHLY: "仓库没有的辅材，项目经理线下拿货，月底对账",
  MAIN_SUPPLIER: "主材专员向外部主材供应商下单",
};

const materialOrderTypeOptions = Object.entries(materialOrderTypeLabels);

const materialOrderCategoryLabels: Record<string, string> = {
  AUXILIARY: "辅材订单",
  MAIN: "主材订单",
  OTHER: "其他订单",
};

const materialOrderCategoryHelpers: Record<string, string> = {
  AUXILIARY: "公司仓配、月结辅材统一查看",
  MAIN: "主材专员或外部供应商订单",
  OTHER: "暂未归类的材料订单",
};

const materialOrderCategoryColors: Record<string, string> = {
  ALL: "#2563eb",
  AUXILIARY: "#16a34a",
  MAIN: "#dc2626",
  OTHER: "#64748b",
};

const materialSettlementStatusLabels: Record<string, string> = {
  UNSETTLED: "未结算",
  SETTLING: "结算中",
  SETTLED: "已结算",
};

const ownerSettlementBillStatusLabels: Record<string, string> = {
  DRAFT: "待确认",
  CONFIRMED: "已确认",
  CANCELLED: "已作废",
};

const phaseNodeTemplates: Record<string, { name: string; owner: string; acceptance: string }[]> = {
  DEMOLITION: [
    { name: "成品保护", owner: "项目经理", acceptance: "入户门、窗、电梯口和公共区域保护到位" },
    { name: "拆除施工", owner: "工长", acceptance: "拆除范围与图纸一致，承重结构无误拆" },
    { name: "新砌墙体", owner: "泥工", acceptance: "墙体垂直度、拉结筋和门洞尺寸复核" },
    { name: "垃圾清运", owner: "项目经理", acceptance: "垃圾袋装清运，现场通道保持整洁" },
  ],
  PLUMBING: [
    { name: "水电放线", owner: "设计师/项目经理", acceptance: "开关插座、灯位、给排水点位现场确认" },
    { name: "水路施工", owner: "水电工", acceptance: "冷热水走向清晰，打压测试记录完整" },
    { name: "电路施工", owner: "水电工", acceptance: "强弱电分管分色，线径和回路符合方案" },
    { name: "水电验收", owner: "监理/业主", acceptance: "影像留底、隐蔽工程验收后再封槽" },
  ],
  MASONRY: [
    { name: "防水施工", owner: "泥工", acceptance: "涂刷高度、阴阳角加强和闭水记录完整" },
    { name: "墙地砖铺贴", owner: "泥工", acceptance: "排版、空鼓、平整度和坡度符合标准" },
    { name: "地漏坡度", owner: "项目经理", acceptance: "排水顺畅，湿区无明显积水" },
    { name: "泥瓦验收", owner: "监理/业主", acceptance: "空鼓率、缝宽和收口处理验收通过" },
  ],
  CARPENTRY: [
    { name: "吊顶基层", owner: "木工", acceptance: "龙骨间距、吊筋固定和检修口预留合理" },
    { name: "背景基层", owner: "木工", acceptance: "基层尺寸、平整度和加固点位满足安装" },
    { name: "柜体配合", owner: "设计师/项目经理", acceptance: "定制柜复尺、收口和设备点位无冲突" },
    { name: "木作验收", owner: "监理/业主", acceptance: "结构牢固，水平垂直和尺寸误差可控" },
  ],
  PAINTING: [
    { name: "基层处理", owner: "油工", acceptance: "挂网、找平、阴阳角和防裂处理完成" },
    { name: "腻子打磨", owner: "油工", acceptance: "墙面平整，灯光检查无明显波浪" },
    { name: "底漆面漆", owner: "油工", acceptance: "色号一致，涂刷均匀，无透底流坠" },
    { name: "油漆验收", owner: "监理/业主", acceptance: "墙面观感、阴阳角和修补点验收通过" },
  ],
  INSTALLATION: [
    { name: "主材安装", owner: "项目经理", acceptance: "门、柜、洁具、灯具到场核对无误" },
    { name: "设备调试", owner: "安装师傅", acceptance: "开关、给排水、五金和电器使用正常" },
    { name: "收口修补", owner: "项目经理", acceptance: "门套、踢脚线、台面和墙地面收口完整" },
    { name: "安装验收", owner: "监理/业主", acceptance: "安装清单逐项确认，问题形成整改记录" },
  ],
  DECORATION: [
    { name: "软装进场", owner: "设计师", acceptance: "家具、灯饰、窗帘和配饰规格数量核对" },
    { name: "现场摆场", owner: "设计师/项目经理", acceptance: "位置、色彩和动线符合设计方案" },
    { name: "清洁保洁", owner: "项目经理", acceptance: "硬装、软装和设备表面清洁完成" },
    { name: "软装确认", owner: "设计师/业主", acceptance: "软装效果和缺补件确认记录完整" },
  ],
  INSPECTION: [
    { name: "内部预验收", owner: "项目经理/监理", acceptance: "自检问题已形成整改清单" },
    { name: "业主验收", owner: "业主/项目经理", acceptance: "按空间逐项验收，问题责任人明确" },
    { name: "整改复验", owner: "项目经理", acceptance: "整改项全部关闭并留存照片" },
    { name: "竣工交付", owner: "项目经理", acceptance: "钥匙、保修、资料和结算节点交接完成" },
  ],
};

const phaseStatusLabels: Record<string, string> = {
  PENDING: "待施工",
  IN_PROGRESS: "施工中",
  REVIEW: "待确认",
  COMPLETED: "已验收",
  SKIPPED: "不施工",
  CANCELLED: "已取消",
};

const phaseStageVisuals: Array<{ match: string[]; tone: string; Icon: LucideIcon }> = [
  { match: ["开工", "交底"], tone: "handover", Icon: HardHat },
  { match: ["拆", "砌", "改造"], tone: "demolition", Icon: Hammer },
  { match: ["水电", "电路", "给排水"], tone: "utility", Icon: PlugZap },
  { match: ["泥", "瓦", "贴砖", "瓷砖"], tone: "masonry", Icon: BrickWall },
  { match: ["木", "吊顶", "柜"], tone: "wood", Icon: Layers },
  { match: ["油漆", "乳胶漆", "涂料", "墙面"], tone: "paint", Icon: Paintbrush },
  { match: ["安装", "设备", "主材"], tone: "install", Icon: Wrench },
  { match: ["竣工", "验收", "交付"], tone: "finish", Icon: CircleCheck },
];

function getPhaseStageVisual(label: string): { tone: string; Icon: LucideIcon } {
  const normalized = String(label || "").trim();
  return phaseStageVisuals.find((item) => item.match.some((keyword) => normalized.includes(keyword)))
    || { tone: "default", Icon: ClipboardCheck };
}

const teamRoleLabels: Record<string, string> = {
  ADVISOR: "家装顾问",
  DESIGNER: "设计师",
  PM: "项目经理",
  FOREMAN: "工长",
  SUPERVISOR: "监理",
  WORKER: "施工人员",
  SALES: "销售",
  FINANCE: "财务",
};

const teamRoleOrder: Record<string, number> = {
  PM: 0,
  DESIGNER: 1,
  ADVISOR: 2,
  SUPERVISOR: 3,
  FOREMAN: 4,
  WORKER: 5,
  SALES: 6,
  FINANCE: 7,
};

const archiveShareOptions = [
  { value: "1d", label: "1天" },
  { value: "7d", label: "7天" },
  { value: "30d", label: "30天" },
  { value: "forever", label: "永久" },
];

type SiteTabKey = "overview" | "payments" | "schedule" | "archive" | "checkin" | "changes" | "quantity" | "phase" | "records" | "cameras" | "costs" | "settlement" | "logs" | "materials";
type HandoverCheck = { key: string; label: string; owner: string; required: boolean; checked: boolean; note?: string };
type ConstructionTemplateStandardImage = {
  id: string;
  url: string;
  caption: string;
};
type ConstructionTemplateStandardItem = {
  id: string;
  description: string;
  images: ConstructionTemplateStandardImage[];
  required: boolean;
  photoRequired: boolean;
};
type ConstructionTemplateNodeStandard = {
  description: string;
  descriptions: string[];
  images: ConstructionTemplateStandardImage[];
  standards: ConstructionTemplateStandardItem[];
};
type ConstructionTemplateNodeOption = {
  id: string;
  name: string;
  type: "construction" | "acceptance";
  sortOrder: number;
  durationRules: Array<{
    minArea: number;
    maxArea: number | null;
    plannedDays: number;
    floorHeatingDays: number;
  }>;
  constructionStandard: ConstructionTemplateNodeStandard;
  acceptanceStandard: ConstructionTemplateNodeStandard;
  logBroadcastScripts: string[];
  photoRequired: boolean;
  customerConfirmRequired: boolean;
  projectManagerConfirmRequired: boolean;
};
type ConstructionTemplateStageOption = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  nodes: ConstructionTemplateNodeOption[];
};
type ConstructionTemplateOption = {
  id: string;
  name: string;
  description: string;
  decorationType: string;
  stageCount: number;
  nodeCount: number;
  acceptanceCount: number;
  durationText: string;
  isDefault: boolean;
  durationRules: Array<{
    id: string;
    name: string;
    rules: Array<{
      minArea: number;
      maxArea: number | null;
      plannedDays: number;
      floorHeatingDays: number;
    }>;
  }>;
  stages: ConstructionTemplateStageOption[];
};
type ConstructionPlanRow = {
  id: string;
  stageId: string;
  stageName: string;
  stageRowSpan: number;
  nodeName: string;
  nodeType: "construction" | "acceptance";
  plannedStart: string;
  plannedEnd: string;
  plannedDays: number;
  actualStart: string;
  actualEnd: string;
};
type ConstructionPlanMonthGroup = { key: string; label: string; colSpan: number };
type PhaseNodeRow = {
  id: string;
  index: number;
  stage: ConstructionTemplateStageOption | null;
  templateNode: ConstructionTemplateNodeOption | null;
  nodeType: "construction" | "acceptance";
  name: string;
  owner: string;
  acceptance: string;
  standardItems: ConstructionTemplateStandardItem[];
  standardImages: ConstructionTemplateStandardImage[];
  logBroadcastScripts: string[];
  photoRequired: boolean;
  customerConfirmRequired: boolean;
  projectManagerConfirmRequired: boolean;
  status: string;
  plannedStart: string;
  plannedEnd: string;
  plannedDays: number;
  actualStart: string;
  actualEnd: string;
  priority: string;
  fromTask: boolean;
};
type PhaseNodeModalMode = "standard" | "photos" | "records" | "acceptance" | "log" | "issue";
type AcceptanceReviewChoice = "PASS" | "FAIL" | "SKIP";
type AcceptanceReviewValue = AcceptanceReviewChoice | "";
type CustomPhaseNodeForm = {
  nodeType: "construction" | "acceptance";
  name: string;
  description: string;
  plannedStart: string;
  plannedEnd: string;
};
type ConstructionRecordTimelineItem = {
  id: string;
  eventType: string;
  title: string;
  content: string;
  operatorName: string;
  createdAt: string;
  sourceType: string;
  sourceId: string;
  photos: any[];
  locationName: string;
  statusFrom: string;
  statusTo: string;
  completedWork: string;
  nextPlan: string;
};
type CostForm = {
  category: string;
  phase: string;
  name: string;
  amount: string;
  cost_date: string;
  supplier: string;
  payee: string;
  payment_method: string;
  status: string;
  invoice_no: string;
  work_type_name: string;
  material_category_name: string;
  remark: string;
};
type MaterialOrderLine = {
  material_id: string;
  quantity: string;
  unit_price: string;
  received_qty: string;
  remark: string;
};
type MaterialOrderForm = {
  order_type: string;
  supplier_id: string;
  status: string;
  settlement_status: string;
  settlement_month: string;
  handler_name: string;
  order_date: string;
  delivery_date: string;
  paid_amount: string;
  notes: string;
  items: MaterialOrderLine[];
};
type LogForm = {
  log_date: string;
  phase: string;
  content: string;
  completed_work: string;
  material_notes: string;
  quality_notes: string;
  safety_notes: string;
  issue_notes: string;
  next_plan: string;
  location_name: string;
  location_address: string;
  latitude: string;
  longitude: string;
};
type VrSceneDraft = {
  id: string;
  name: string;
  file: File | null;
  previewUrl: string;
  existingImageUrl?: string;
  existingFileName?: string;
};

function getBudgetWorkGroupMeta(name: string): { icon: LucideIcon; tone: string } {
  const text = String(name || "");
  if (/电|水电/.test(text)) return { icon: Zap, tone: "electric" };
  if (/水/.test(text)) return { icon: PlugZap, tone: "plumbing" };
  if (/木|柜|板/.test(text)) return { icon: Wrench, tone: "wood" };
  if (/泥|瓦|砖|贴/.test(text)) return { icon: BrickWall, tone: "masonry" };
  if (/油|漆|涂|乳胶/.test(text)) return { icon: Paintbrush, tone: "paint" };
  if (/安装|设备/.test(text)) return { icon: Wrench, tone: "install" };
  return { icon: Hammer, tone: "work" };
}

function getBudgetMaterialGroupMeta(name: string): { icon: LucideIcon; tone: string } {
  const text = String(name || "");
  if (/水电|电线|电缆|管/.test(text)) return { icon: PlugZap, tone: "electric" };
  if (/木|板|柜/.test(text)) return { icon: Wrench, tone: "wood" };
  if (/泥|瓦|砖|砂|水泥/.test(text)) return { icon: BrickWall, tone: "masonry" };
  if (/油|漆|涂|乳胶/.test(text)) return { icon: Paintbrush, tone: "paint" };
  if (/五金|配件|设备/.test(text)) return { icon: Package, tone: "install" };
  return { icon: Package, tone: "material" };
}

function getBudgetGroupChartColor(tone: string): string {
  const colorMap: Record<string, string> = {
    electric: "#f59e0b",
    plumbing: "#06b6d4",
    wood: "#f97316",
    masonry: "#ef4444",
    paint: "#ec4899",
    install: "#8b5cf6",
    work: "#22c55e",
    material: "#84cc16",
  };
  return colorMap[tone] || "#475467";
}

const siteTabs: { key: SiteTabKey; label: string; icon: any }[] = [
  { key: "overview", label: "工地信息", icon: Home },
  { key: "payments", label: "客户收款", icon: DollarSign },
  { key: "schedule", label: "施工计划", icon: CalendarDays },
  { key: "phase", label: "施工阶段", icon: ClipboardList },
  { key: "records", label: "施工记录", icon: Activity },
  { key: "quantity", label: "工程量复核", icon: Calculator },
  { key: "materials", label: "材料下单", icon: ShoppingCart },
  { key: "changes", label: "增减项单", icon: ShieldCheck },
  { key: "costs", label: "成本管控", icon: DollarSign },
  { key: "settlement", label: "结算利润", icon: Calculator },
  { key: "cameras", label: "工地摄像头", icon: Camera },
  { key: "checkin", label: "工地签到", icon: QrCode },
  { key: "archive", label: "资料归档", icon: Archive },
];

const defaultHandoverChecks: HandoverCheck[] = [
  { key: "design_plan", label: "设计方案交底：平面布局、立面关系、关键节点和效果图差异说明", owner: "设计师", required: true, checked: false },
  { key: "drawings", label: "施工图纸交底：拆改、水电、吊顶、铺贴、柜体及安装图纸版本确认", owner: "设计师", required: true, checked: false },
  { key: "site_measure", label: "现场尺寸复核：开间进深、梁柱、门窗洞口、地漏排水和强弱电箱位置", owner: "设计师/项目经理", required: true, checked: false },
  { key: "demolition", label: "拆改交底：拆除范围、新砌墙体、保护区域、承重结构和物业限制说明", owner: "项目经理", required: true, checked: false },
  { key: "water_electric", label: "水电点位交底：开关插座、灯位、给排水、燃气、空调和设备预留位置", owner: "设计师/项目经理", required: true, checked: false },
  { key: "materials", label: "主辅材交底：品牌型号、规格颜色、到货节点、需业主确认的材料样品", owner: "设计师", required: true, checked: false },
  { key: "schedule", label: "工期与施工组织交底：开工时间、关键节点、停工限制和现场沟通机制", owner: "项目经理", required: true, checked: false },
  { key: "risk", label: "风险与变更交底：现场隐患、可能增减项、未定事项和后续确认责任人", owner: "项目经理", required: true, checked: false },
  { key: "property", label: "物业手续交底：装修许可证、押金、施工证、垃圾清运和施工时间要求", owner: "项目经理", required: false, checked: false },
];

const archiveCategories = [
  {
    key: "施工图",
    title: "施工图",
    icon: FolderOpen,
    owner: "设计师",
    required: ["施工图"],
    helper: "施工图、平面布置图、立面图、节点图、深化图等施工依据。",
    match: (category: string) => /施工图|图纸|平面|立面|节点|深化|设计图纸|图纸方案|水电图|水电|电路|水路|给排水|强电|弱电|开关|插座/.test(category),
  },
  {
    key: "效果图",
    title: "效果图",
    icon: FolderOpen,
    owner: "设计师",
    required: ["效果图"],
    helper: "空间效果图、软装搭配图、效果图图片、效果图链接等客户确认资料。",
    match: (category: string) => /效果图|效果|渲染|设计方案|软装|家具|灯饰|窗帘|配饰|摆场/.test(category),
  },
  {
    key: "水电VR全景",
    title: "水电VR全景",
    icon: FolderOpen,
    owner: "设计师",
    required: ["水电VR全景"],
    helper: "水电相关 720 全景、VR 链接、云设计漫游等可在线查看的资料。",
    match: (category: string) => /水电VR全景|VR全景|VR|vr|全景|720|漫游|云设计/.test(category),
  },
  {
    key: "主材选材单",
    title: "主材选材单",
    icon: FolderOpen,
    owner: "材料/设计",
    required: ["主材选材单"],
    helper: "主材选材单、材料确认单、品牌型号、规格颜色等选材资料。",
    match: (category: string) => /主材选材单|主材清单|主材|材料确认|选材/.test(category),
  },
  {
    key: "结算单",
    title: "结算单",
    icon: FolderOpen,
    owner: "项目/财务",
    required: ["结算单"],
    helper: "业主结算单、竣工结算单、尾款结算、工地结算资料。",
    match: (category: string) => /结算|竣工|尾款|业主结算|工地结算|验收结算/.test(category),
  },
  {
    key: "报价单",
    title: "报价单",
    icon: FolderOpen,
    owner: "商务/设计",
    required: ["报价单"],
    helper: "正式报价单、整装预算、签约报价和报价依据。",
    match: (category: string) => /报价单|整装报价|报价|预算|合同报价|正式报价/.test(category),
  },
  {
    key: "合同资料",
    title: "合同资料",
    icon: FolderOpen,
    owner: "商务/财务",
    required: ["合同资料"],
    helper: "签约合同、合同附件、补充协议、收款比例和合同相关记录。",
    match: (category: string) => /合同资料|合同归档|签约合同|装修施工合同|施工合同|合同附件|合同文件|合同记录|补充协议|收款比例/.test(category),
  },
  {
    key: "优惠单",
    title: "优惠单",
    icon: FolderOpen,
    owner: "商务/财务",
    required: ["优惠单"],
    helper: "优惠方案、折扣审批、活动政策、赠送项目和补充优惠确认。",
    match: (category: string) => /优惠|折扣|活动|赠送|减免/.test(category),
  },
  {
    key: "其他资料",
    title: "其他资料",
    icon: FolderOpen,
    owner: "项目组",
    required: ["其他补充资料"],
    helper: "无法归入以上分类的补充文件或外部链接。",
    match: () => false,
  },
] as const;

const archiveNoExternalLinkCategoryKeys = new Set(["主材选材单", "结算单", "报价单", "合同资料", "优惠单"]);

function makeDefaultArchiveLinkForm() {
  return {
    name: "",
    url: "",
  };
}

function makeDefaultVrSceneDraft(index = 0): VrSceneDraft {
  const defaultNames = ["客厅", "餐厅", "主卧", "次卧", "厨房", "卫生间", "阳台"];
  return {
    id: `vr-scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: defaultNames[index] || "",
    file: null,
    previewUrl: "",
  };
}

const logQuickWorkItems: Record<string, string[]> = {
  DEMOLITION: ["拆除原有墙面材料", "拆除原有地面材料", "拆除吊顶及隔断", "拆除门窗及五金", "清运拆除垃圾至指定地点", "现场安全防护检查", "成品保护措施", "材料进场验收", "现场卫生清理"],
  PLUMBING: ["水电点位复核", "现场弹线定位", "墙地面开槽", "强弱电布管", "给排水管铺设", "水管打压测试", "电路绝缘检查", "隐蔽工程拍照留档", "水电验收准备"],
  MASONRY: ["墙体砌筑施工", "墙地面找平", "防水基层处理", "防水涂刷施工", "闭水试验", "墙砖铺贴", "地砖铺贴", "空鼓检查", "现场卫生清理"],
  CARPENTRY: ["吊顶龙骨施工", "吊顶封板施工", "背景墙基层制作", "门窗套基层处理", "柜体尺寸复核", "木作节点加固", "检修口预留", "木作基层验收"],
  PAINTING: ["墙面基层处理", "阴阳角找直", "防裂网格布处理", "腻子批刮", "墙面打磨", "底漆施工", "面漆施工", "墙面质量检查", "修补问题点"],
  INSTALLATION: ["主材到场核对", "门窗安装", "洁具安装", "灯具开关安装", "五金安装", "定制柜安装配合", "设备调试", "安装收口处理", "成品保护检查"],
  DECORATION: ["软装进场核对", "家具摆场", "窗帘安装", "灯饰调试", "装饰品摆放", "现场保洁", "软装效果复核", "缺补件登记"],
  INSPECTION: ["内部预验收", "业主现场验收", "问题整改登记", "整改复验", "竣工资料整理", "钥匙交接", "保修事项说明", "现场清洁交付"],
};

const defaultLogQuickItems = ["现场安全防护检查", "材料进场验收", "施工进度核对", "质量问题排查", "现场卫生清理", "业主确认事项沟通"];
const logContentQuickPhrases = [
  { label: "业主问候", text: "尊敬的业主，您好，今日工地施工情况如下：" },
  { label: "进度正常", text: "今日现场施工按计划推进，整体进度正常，请您放心。" },
  { label: "现场整洁", text: "今日施工结束后已完成现场整理和成品保护检查。" },
  { label: "待确认", text: "现场有部分事项需要您确认，我们会及时与您沟通。" },
  { label: "汇报收尾", text: "以上为今日工地施工情况，请您查阅。" },
];

function isOverdue(date?: string | null) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date).getTime() < today.getTime();
}

function makeDefaultHandoverForm() {
  return {
    handover_id: "",
    status: "draft",
    scheduled_at: "",
    construction_template_id: "",
    construction_template_name: "",
    construction_template_description: "",
    construction_template_decoration_type: "",
    construction_template_duration_text: "",
    construction_template_stage_count: 0,
    construction_template_node_count: 0,
    construction_template_acceptance_count: 0,
    planned_start: "",
    planned_end: "",
    duration_days: "",
    weekend_construction: false,
    holiday_construction: false,
    has_floor_heating: false,
    checks: defaultHandoverChecks,
    designer_confirmed: false,
    manager_confirmed: false,
    owner_confirmed: false,
    owner_present: true,
    key_notes: "",
    risk_notes: "",
    unresolved_items: "",
  };
}

type HandoverRequiredFieldKey = "construction_template_id" | "planned_start" | "duration_days";

function toSafeCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function normalizeConstructionStandardImages(value: unknown): ConstructionTemplateStandardImage[] {
  return (Array.isArray(value) ? value : []).map((item: any, index: number) => ({
    id: String(item?.id || `standard-image-${index}`),
    url: String(item?.url || item?.imageUrl || "").trim(),
    caption: String(item?.caption || "").trim(),
  })).filter((item) => item.url);
}

function normalizeConstructionStandard(value: any): ConstructionTemplateNodeStandard {
  const standards = (Array.isArray(value?.standards) ? value.standards : []).map((item: any, index: number) => ({
    id: String(item?.id || `standard-${index}`),
    description: String(item?.description || "").trim(),
    images: normalizeConstructionStandardImages(item?.images),
    required: item?.required !== false,
    photoRequired: item?.photoRequired !== false,
  })).filter((item: ConstructionTemplateStandardItem) => item.description || item.images.length > 0);
  const descriptions = Array.isArray(value?.descriptions)
    ? value.descriptions.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];
  const legacyImages = normalizeConstructionStandardImages(value?.images);
  const description = String(value?.description || "").trim();
  const normalizedStandards: ConstructionTemplateStandardItem[] = standards.length
    ? standards
    : descriptions.length
      ? descriptions.map((item: string, index: number) => ({
        id: `standard-description-${index}`,
        description: item,
        images: index === 0 ? legacyImages : [],
        required: true,
        photoRequired: true,
      }))
      : (description || legacyImages.length
        ? [{
          id: "standard-description-0",
          description,
          images: legacyImages,
          required: true,
          photoRequired: true,
        }]
        : []);

  return {
    description: normalizedStandards.map((item) => item.description).filter(Boolean).join("\n"),
    descriptions: normalizedStandards.map((item) => item.description).filter(Boolean),
    images: normalizedStandards.flatMap((item) => item.images),
    standards: normalizedStandards,
  };
}

function normalizeConstructionTemplateOption(value: any): ConstructionTemplateOption | null {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || value.templateId || "").trim();
  const name = String(value.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: String(value.description || "").trim(),
    decorationType: String(value.decorationType || value.decoration_type || "").trim(),
    stageCount: toSafeCount(value.stageCount ?? value.stage_count),
    nodeCount: toSafeCount(value.nodeCount ?? value.node_count),
    acceptanceCount: toSafeCount(value.acceptanceCount ?? value.acceptance_count),
    durationText: String(value.durationText || value.duration_text || "").trim(),
    isDefault: value.isDefault === true,
    durationRules: Array.isArray(value.durationRules) ? value.durationRules.map((stage: any, index: number) => ({
      id: String(stage?.id || `stage-${index}`),
      name: String(stage?.name || `施工阶段${index + 1}`),
      rules: (Array.isArray(stage?.rules) ? stage.rules : []).map((rule: any) => ({
        minArea: Math.max(0, Number(rule?.minArea || 0) || 0),
        maxArea: rule?.maxArea === null || rule?.maxArea === undefined || rule?.maxArea === ""
          ? null
          : Math.max(0, Number(rule.maxArea || 0) || 0),
        plannedDays: Math.max(0, Number(rule?.plannedDays || 0) || 0),
        floorHeatingDays: Math.max(0, Number(rule?.floorHeatingDays ?? rule?.plannedDays ?? 0) || 0),
      })).filter((rule: any) => rule.plannedDays > 0 || rule.floorHeatingDays > 0),
    })).filter((stage: any) => stage.rules.length > 0) : [],
    stages: Array.isArray(value.stages) ? value.stages.map((stage: any, index: number) => ({
      id: String(stage?.id || `stage-${index}`),
      name: String(stage?.name || `施工阶段${index + 1}`),
      code: String(stage?.code || ""),
      sortOrder: toSafeCount(stage?.sortOrder || index + 1),
      nodes: (Array.isArray(stage?.nodes) ? stage.nodes : []).map((node: any, nodeIndex: number) => ({
        id: String(node?.id || `node-${index}-${nodeIndex}`),
        name: String(node?.name || `工序节点${nodeIndex + 1}`),
        type: node?.type === "acceptance" ? "acceptance" : "construction",
        sortOrder: toSafeCount(node?.sortOrder || nodeIndex + 1),
        durationRules: (Array.isArray(node?.durationRules) ? node.durationRules : (Array.isArray(node?.areaDurationRules) ? node.areaDurationRules : [])).map((rule: any) => ({
          minArea: Math.max(0, Number(rule?.minArea || 0) || 0),
          maxArea: rule?.maxArea === null || rule?.maxArea === undefined || rule?.maxArea === ""
            ? null
            : Math.max(0, Number(rule.maxArea || 0) || 0),
          plannedDays: Math.max(0, Number(rule?.plannedDays || 0) || 0),
          floorHeatingDays: Math.max(0, Number(rule?.floorHeatingDays ?? rule?.plannedDays ?? 0) || 0),
        })).filter((rule: any) => rule.plannedDays > 0 || rule.floorHeatingDays > 0),
        constructionStandard: normalizeConstructionStandard(node?.constructionStandard),
        acceptanceStandard: normalizeConstructionStandard(node?.acceptanceStandard),
        logBroadcastScripts: (Array.isArray(node?.logBroadcastScripts) ? node.logBroadcastScripts : [])
          .map((item: unknown) => String(item || "").trim())
          .filter(Boolean),
        photoRequired: node?.photoRequired !== false,
        customerConfirmRequired: node?.customerConfirmRequired === true,
        projectManagerConfirmRequired: node?.projectManagerConfirmRequired === true || node?.type === "acceptance",
      })).filter((node: any) => node.name).sort((left: ConstructionTemplateNodeOption, right: ConstructionTemplateNodeOption) => left.sortOrder - right.sortOrder),
    })).filter((stage: any) => stage.name).sort((left: ConstructionTemplateStageOption, right: ConstructionTemplateStageOption) => left.sortOrder - right.sortOrder) : [],
  };
}

function makeHandoverConstructionTemplatePatch(template: ConstructionTemplateOption) {
  return {
    construction_template_id: template.id,
    construction_template_name: template.name,
    construction_template_description: template.description,
    construction_template_decoration_type: template.decorationType,
    construction_template_duration_text: template.durationText,
    construction_template_stage_count: template.stageCount,
    construction_template_node_count: template.nodeCount,
    construction_template_acceptance_count: template.acceptanceCount,
  };
}

function parseAreaNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function formatAreaDurationRange(minArea: number, maxArea: number | null) {
  if (maxArea === null) return `${minArea}㎡以上`;
  return `${minArea}-${maxArea}㎡`;
}

function getTemplateDurationRuleGroups(template: ConstructionTemplateOption | null) {
  if (!template) return [];
  const nodeRuleGroups = template.stages
    .flatMap((stage) => stage.nodes.map((node) => node.durationRules || []))
    .filter((rules) => rules.length > 0);
  if (nodeRuleGroups.length > 0) return nodeRuleGroups;
  return template.durationRules.map((stage) => stage.rules).filter((rules) => rules.length > 0);
}

function getInternalDurationSummary(template: ConstructionTemplateOption | null, area: unknown) {
  const areaValue = parseAreaNumber(area);
  const durationRuleGroups = getTemplateDurationRuleGroups(template);
  if (!template || !areaValue || !durationRuleGroups.length) {
    return {
      areaValue,
      regularDays: 0,
      floorHeatingDays: 0,
      areaRangeText: "",
    };
  }

  let regularDays = 0;
  let floorHeatingDays = 0;
  const areaRanges = new Set<string>();

  durationRuleGroups.forEach((ruleGroup) => {
    const rules = [...ruleGroup].sort((left, right) => left.minArea - right.minArea);
    const matchedRule = rules.find((rule) => (
      areaValue >= rule.minArea && (rule.maxArea === null || areaValue < rule.maxArea)
    )) || rules[rules.length - 1];
    if (!matchedRule) return;
    regularDays += Math.max(0, matchedRule.plannedDays);
    floorHeatingDays += Math.max(0, matchedRule.floorHeatingDays);
    areaRanges.add(formatAreaDurationRange(matchedRule.minArea, matchedRule.maxArea));
  });

  return {
    areaValue,
    regularDays,
    floorHeatingDays,
    areaRangeText: Array.from(areaRanges).join("、"),
  };
}

function makeDefaultCostForm(): CostForm {
  return {
    category: "AUXILIARY",
    phase: "",
    name: "",
    amount: "",
    cost_date: new Date().toISOString().slice(0, 10),
    supplier: "",
    payee: "",
    payment_method: "微信",
    status: "PAID",
    invoice_no: "",
    work_type_name: "",
    material_category_name: "",
    remark: "",
  };
}

function makeDefaultMaterialOrderForm(): MaterialOrderForm {
  return {
    order_type: "AUXILIARY_WAREHOUSE",
    supplier_id: "",
    status: "PENDING",
    settlement_status: "SETTLED",
    settlement_month: toDateInputValue().slice(0, 7),
    handler_name: "",
    order_date: toDateInputValue(),
    delivery_date: "",
    paid_amount: "",
    notes: "",
    items: [{ material_id: "", quantity: "", unit_price: "", received_qty: "", remark: "" }],
  };
}

function makeDefaultChangeOrderItem(phase = ""): ChangeOrderItemForm {
  return {
    change_type: "ADD",
    title: "",
    space: "",
    phase,
    description: "",
    unit_price: "",
    quantity: "1",
    unit: "项",
    amount: "",
    cost_estimate: "",
  };
}

function makeDefaultChangeOrderForm(phase = ""): ChangeOrderForm {
  return {
    discount_amount: "",
    discount_reason: "",
    owner_confirmed: true,
    items: [makeDefaultChangeOrderItem(phase)],
  };
}

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeDefaultLogForm(): LogForm {
  return {
    log_date: toDateInputValue(),
    phase: "",
    content: "",
    completed_work: "",
    material_notes: "",
    quality_notes: "",
    safety_notes: "",
    issue_notes: "",
    next_plan: "",
    location_name: "",
    location_address: "",
    latitude: "",
    longitude: "",
  };
}

function cleanGeocodeText(value: unknown) {
  return String(value || "")
    .replace(/[()（）]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function pickCommunityFromGeocode(result: any) {
  const address = result?.address || {};
  const namedetails = result?.namedetails || {};
  const extratags = result?.extratags || {};
  const communityPattern = /([\u4e00-\u9fa5A-Za-z0-9·\-]{2,28}(?:小区|花园|家园|公寓|公馆|华府|府|苑|园|城|湾|郡|庭|院|里|台|雅居|名邸|新村|社区|住宅区|别墅|山庄))/;
  const strongFields = [
    address.neighbourhood,
    address.residential,
    address.quarter,
    address.suburb,
    address.hamlet,
    namedetails["name:zh"],
    namedetails.name,
    extratags["name:zh"],
    result?.name,
  ].map(cleanGeocodeText).filter(Boolean);

  for (const field of strongFields) {
    const matched = field.match(communityPattern);
    if (matched?.[1]) return matched[1];
    if (/(小区|花园|家园|公寓|公馆|华府|府|苑|园|城|湾|郡|庭|院|里|台|雅居|名邸|新村|社区|住宅区|别墅|山庄)$/.test(field)) return field;
  }

  const displayParts = String(result?.display_name || "")
    .split(/[,，、]/)
    .map(cleanGeocodeText)
    .filter(Boolean);
  for (const part of displayParts) {
    const matched = part.match(communityPattern);
    if (matched?.[1]) return matched[1];
  }

  return "";
}

function hasLogRisk(log: any) {
  const text = [
    log.content,
    log.completed_work,
    log.material_notes,
    log.quality_notes,
    log.safety_notes,
    log.issue_notes,
    log.next_plan,
  ].filter(Boolean).join(" ");
  return Boolean(log.issue_notes) || /风险|问题|整改|延期|停工|返工|未完成|隐患|异常|缺料/.test(text);
}

function hasLogInlineDetails(log: any) {
  return [
    log.completed_work,
    log.next_plan,
    log.material_notes,
    log.quality_notes,
    log.safety_notes,
    log.issue_notes,
  ].some((value) => String(value || "").trim());
}

function getLogDisplayContent(log: any) {
  const content = String(log?.content || "").trim();
  const completedWork = String(log?.completed_work || "").trim();
  if (!content) return "";
  if (completedWork && content.replace(/\r\n/g, "\n") === completedWork.replace(/\r\n/g, "\n")) return "";
  return content;
}

function getVisibleLogWorkText(value: unknown) {
  return String(value || "").trim().replace(/^【[^】]+】\s*/, "");
}

function isImageLikeFile(file: any) {
  const mimeType = String(file?.mime_type || "");
  const url = String(file?.file_url || file?.url || file?.caption || file?.file_name || "");
  return mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)(\?.*)?$/i.test(url);
}

function isLinkAttachment(file: any) {
  return file?.mime_type === "text/uri-list" || /^https?:\/\//i.test(String(file?.file_url || ""));
}

function isVrTourAttachment(file: any) {
  return /^\/vr-tour\//.test(String(file?.file_url || "")) || /\/vr-tour\//.test(String(file?.file_url || ""));
}

function getVrTourIdFromAttachment(file: any) {
  const match = String(file?.file_url || "").match(/\/vr-tour\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isSyncedArchiveFile(file: any) {
  return Boolean(file?.is_synced || String(file?.id || "").startsWith("sync-"));
}

function getArchiveContractSummaryId(file: any) {
  const contractId = String(file?.source_contract_id || "").trim();
  if (!contractId) return "";
  const fileUrl = String(file?.file_url || "");
  if (!fileUrl.startsWith("#contract-summary-")) return "";
  return contractId;
}

function canDeleteArchiveFile(file: any) {
  return Boolean(file?.id) && !isSyncedArchiveFile(file);
}

function canDownloadArchiveFile(file: any) {
  if (getArchiveContractSummaryId(file)) return false;
  if (isLinkAttachment(file) || isVrTourAttachment(file)) return false;
  return Boolean(file?.download_url || file?.archive_type !== "记录");
}

function canRenameArchiveFile(file: any) {
  if (isLinkAttachment(file) || isVrTourAttachment(file)) return false;
  if (file?.source_attachment_id) return true;
  return Boolean(file?.id) && !isSyncedArchiveFile(file);
}

function getArchiveShareAttachmentId(file: any) {
  if (!file) return "";
  if (file.source_attachment_id) return String(file.source_attachment_id);
  if (isSyncedArchiveFile(file)) return "";
  return String(file.id || "");
}

function canShareArchiveLink(file: any) {
  return Boolean(getArchiveShareAttachmentId(file)) && (isLinkAttachment(file) || isVrTourAttachment(file));
}

function getArchiveTypeLabel(file: any) {
  if (file?.archive_type) return file.archive_type;
  if (isVrTourAttachment(file)) return "VR链接";
  if (isLinkAttachment(file)) return "链接";
  if (isImageLikeFile(file)) return "图片";
  return "文件";
}

function getArchiveSourceText(file: any) {
  const category = String(file?.category || "-").replace(/^工地归档-/, "");
  return file?.source_label ? `${category} · ${file.source_label}` : category;
}

function getArchiveUploaderText(file: any) {
  const uploaderName = String(file?.uploader_name || file?.uploaded_by_name || file?.created_by_name || "").trim();
  if (uploaderName) return uploaderName;
  if (isSyncedArchiveFile(file)) return "系统同步";
  return "未记录";
}

function getClientAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zxgj_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function makeSyncedArchiveFile(file: {
  id: string;
  file_name: string;
  file_url: string;
  category: string;
  source_label: string;
  created_at?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  archive_type?: string;
  download_url?: string;
  source_attachment_id?: string;
  source_contract_id?: string;
  uploader_name?: string | null;
  archive_keywords?: string[];
}) {
  return {
    ...file,
    file_size: file.file_size || 0,
    mime_type: file.mime_type || "text/uri-list",
    is_synced: true,
  };
}

function inferArchiveCategoryFromCustomerFile(file: any) {
  const text = `${file?.file_name || ""} ${file?.category || ""}`.trim();
  if (/VR|vr|全景|720|漫游|云设计/.test(text)) return { category: "水电VR全景", keywords: ["水电VR全景", "VR全景"] };
  if (/效果图|效果|渲染|软装|家具|灯饰|窗帘|配饰|摆场/.test(text)) return { category: "效果图", keywords: ["效果图"] };
  if (/水电图|水电|电路|水路|给排水|强电|弱电|开关|插座/.test(text)) return { category: "施工图", keywords: ["施工图", "水电图"] };
  if (/主材选材单|主材清单|主材|材料确认|选材/.test(text)) return { category: "主材选材单", keywords: ["主材选材单"] };
  if (/结算|竣工|尾款|业主结算|工地结算/.test(text)) return { category: "结算单", keywords: ["结算单"] };
  if (/优惠|折扣|活动|赠送|减免/.test(text)) return { category: "优惠单", keywords: ["优惠单"] };
  if (/合同资料|合同归档|签约合同|装修施工合同|施工合同|合同附件|合同文件|合同记录|补充协议|收款比例/.test(text)) return { category: "合同资料", keywords: ["合同资料"] };
  if (/报价|预算|合同报价|正式报价/.test(text)) return { category: "报价单", keywords: ["报价单"] };
  if (/施工图|图纸|平面|立面|节点|深化|设计图纸|设计方案|方案/.test(text)) return { category: "施工图", keywords: ["施工图"] };
  return { category: "其他资料", keywords: ["其他补充资料"] };
}

function formatFileSize(bytes?: number | null) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function parseHandoverChecks(value?: string | null) {
  let saved: Partial<HandoverCheck>[] = [];
  try {
    saved = value ? JSON.parse(value) : [];
  } catch {
    saved = [];
  }
  return defaultHandoverChecks.map((item) => {
    const matched = saved.find((savedItem) => savedItem.key === item.key);
    return { ...item, checked: Boolean(matched?.checked), note: matched?.note || "" };
  });
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return normalized.slice(0, 16);
}

const siteHolidayDates = new Set([
  "2026-01-01",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
]);

function toDateOnlyInputValue(value?: string | null) {
  if (!value) return "";
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return "";
  return text.slice(0, 10);
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
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

function calculateSitePlannedEnd(
  plannedStart: string,
  durationDays: string | number,
  options: { weekendConstruction: boolean; holidayConstruction: boolean },
) {
  const startDate = parseDateOnly(plannedStart);
  const days = Math.ceil(Number(durationDays || 0));
  if (!startDate || !Number.isFinite(days) || days <= 0) return "";
  const cursor = new Date(startDate);
  let remaining = days;
  let guard = 0;
  while (remaining > 0 && guard < 2000) {
    const dateKey = formatDateOnly(cursor);
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const isHoliday = siteHolidayDates.has(dateKey);
    if ((options.weekendConstruction || !isWeekend) && (options.holidayConstruction || !isHoliday)) {
      remaining -= 1;
    }
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return formatDateOnly(cursor);
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSiteWorkingDate(date: Date, options: { weekendConstruction: boolean; holidayConstruction: boolean }) {
  const dateKey = formatDateOnly(date);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const isHoliday = siteHolidayDates.has(dateKey);
  return (options.weekendConstruction || !isWeekend) && (options.holidayConstruction || !isHoliday);
}

function collectSiteWorkingDates(startDate: Date, durationDays: number, options: { weekendConstruction: boolean; holidayConstruction: boolean }) {
  const days = Math.max(0, Math.ceil(Number(durationDays || 0)));
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  let guard = 0;
  while (dates.length < days && guard < 2000) {
    if (isSiteWorkingDate(cursor, options)) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

function normalizePlanText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s·・\-_/（）()【】[\]：:，,。.;；]/g, "");
}

function getPlanStageKeys(stage: ConstructionTemplateStageOption) {
  const keys = new Set([normalizePlanText(stage.id), normalizePlanText(stage.name), normalizePlanText(stage.code)]);
  if (stage.code === "HYDROPOWER") {
    keys.add(normalizePlanText("PLUMBING"));
    keys.add(normalizePlanText("水电"));
  }
  if (stage.code === "PAINT") {
    keys.add(normalizePlanText("PAINTING"));
    keys.add(normalizePlanText("油漆"));
  }
  if (stage.code === "COMPLETION") {
    keys.add(normalizePlanText("INSPECTION"));
    keys.add(normalizePlanText("竣工验收"));
  }
  return keys;
}

function isMatchingPlanPhase(stage: ConstructionTemplateStageOption, phase: any) {
  const stageKeys = getPlanStageKeys(stage);
  const phaseKeys = [
    phase?.id,
    phase?.phase,
    phase?.name,
    phaseLabels[String(phase?.phase || "")],
  ].map(normalizePlanText).filter(Boolean);
  return phaseKeys.some((key) => stageKeys.has(key));
}

function getConstructionTaskTimeValue(task: any) {
  return parseAppDate(task?.updated_at || task?.actual_end || task?.actual_start || task?.created_at)?.getTime() || 0;
}

function getConstructionTaskNodeType(task: any): "construction" | "acceptance" {
  const text = `${task?.notes || ""} ${task?.description || ""} ${task?.name || ""}`;
  return text.includes("验收") ? "acceptance" : "construction";
}

function findConstructionPlanTask(stage: ConstructionTemplateStageOption, node: ConstructionTemplateNodeOption, phases: any[], tasks: any[]) {
  const matchedPhaseIds = new Set(phases.filter((phase) => isMatchingPlanPhase(stage, phase)).map((phase) => String(phase.id || "")));
  if (matchedPhaseIds.size === 0) return null;
  const scopedTasks = tasks.filter((task) => matchedPhaseIds.has(String(task.phase_id || "")));
  const nodeKey = normalizePlanText(node.name);
  return scopedTasks
    .filter((task) => normalizePlanText(task.name) === nodeKey)
    .sort((a, b) => getConstructionTaskTimeValue(b) - getConstructionTaskTimeValue(a))
    [0] || null;
}

function getConstructionPlanActualRange(stage: ConstructionTemplateStageOption, node: ConstructionTemplateNodeOption, phases: any[], tasks: any[]) {
  const task = findConstructionPlanTask(stage, node, phases, tasks);
  if (task) {
    const status = String(task.status || "").toUpperCase();
    if (status !== "COMPLETED") return { actualStart: "", actualEnd: "" };
    const actualEnd = toDateOnlyInputValue(task.actual_end || (status === "COMPLETED" ? task.updated_at || task.planned_end : ""));
    const actualStart = toDateOnlyInputValue(task.actual_start || (actualEnd ? task.planned_start || actualEnd : ""));
    if (actualStart && actualEnd) return { actualStart, actualEnd };
  }

  const phase = phases.find((item) => isMatchingPlanPhase(stage, item));
  const phaseCompleted = String(phase?.status || "").toUpperCase() === "COMPLETED";
  const phaseEnd = toDateOnlyInputValue(phase?.end_date || (phaseCompleted ? phase?.updated_at : ""));
  const phaseStart = toDateOnlyInputValue(phase?.start_date || phaseEnd);
  if (phaseCompleted && phaseStart && phaseEnd) return { actualStart: phaseStart, actualEnd: phaseEnd };

  return { actualStart: "", actualEnd: "" };
}

function getConstructionPlanStages(template: ConstructionTemplateOption | null) {
  if (!template) return [];
  if (template.stages.length > 0) return template.stages;
  return template.durationRules.map((stage, index) => ({
    id: stage.id,
    name: stage.name,
    code: "",
    sortOrder: index + 1,
    nodes: [{
      id: `${stage.id}-node`,
      name: stage.name,
      type: "construction" as const,
      sortOrder: 1,
      durationRules: stage.rules,
      constructionStandard: normalizeConstructionStandard(null),
      acceptanceStandard: normalizeConstructionStandard(null),
      logBroadcastScripts: [],
      photoRequired: true,
      customerConfirmRequired: false,
      projectManagerConfirmRequired: false,
    }],
  }));
}

function getConstructionNodeDurationDays(
  template: ConstructionTemplateOption | null,
  stage: ConstructionTemplateStageOption,
  node: ConstructionTemplateNodeOption,
  area: unknown,
  hasFloorHeating: boolean,
) {
  const durationStage = template?.durationRules.find((item) => item.id === stage.id || item.name === stage.name);
  const rules = [...(node.durationRules?.length ? node.durationRules : (durationStage?.rules || []))].sort((left, right) => left.minArea - right.minArea);
  if (!rules.length) return 1;
  const areaValue = parseAreaNumber(area);
  const matchedRule = areaValue > 0
    ? rules.find((rule) => areaValue >= rule.minArea && (rule.maxArea === null || areaValue < rule.maxArea)) || rules[rules.length - 1]
    : rules[0];
  return Math.max(1, Math.ceil(Number(hasFloorHeating ? matchedRule.floorHeatingDays : matchedRule.plannedDays) || 0));
}

function enumerateCalendarDates(start: Date, end: Date) {
  const dates: Date[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 500) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

function formatConstructionPlanDateRange(start: string, end: string) {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate) return "-";
  const startText = `${startDate.getMonth() + 1}月${startDate.getDate()}日`;
  const endText = `${endDate.getMonth() + 1}月${endDate.getDate()}日`;
  return start === end ? startText : `${startText}-${endText}`;
}

function buildConstructionPlan(input: {
  template: ConstructionTemplateOption | null;
  plannedStart: string;
  area: unknown;
  hasFloorHeating: boolean;
  weekendConstruction: boolean;
  holidayConstruction: boolean;
  phases: any[];
  tasks: any[];
}) {
  const startDate = parseDateOnly(input.plannedStart);
  const stages = getConstructionPlanStages(input.template);
  if (!input.template || !startDate || stages.length === 0) {
    return { rows: [] as ConstructionPlanRow[], dateColumns: [] as Date[], monthGroups: [] as ConstructionPlanMonthGroup[], planEnd: "", totalDays: 0 };
  }

  const rows: ConstructionPlanRow[] = [];
  const options = { weekendConstruction: input.weekendConstruction, holidayConstruction: input.holidayConstruction };
  let cursor = new Date(startDate);

  stages.forEach((stage) => {
    const matchedPhaseIds = new Set(input.phases.filter((phase) => isMatchingPlanPhase(stage, phase)).map((phase) => String(phase.id || "")));
    const scopedTasks = input.tasks.filter((task) => matchedPhaseIds.has(String(task.phase_id || "")));
    const durationStage = input.template?.durationRules.find((item) => item.id === stage.id || item.name === stage.name);
    const nodes = stage.nodes.length > 0 ? stage.nodes : [{
      id: `${stage.id}-node`,
      name: stage.name,
      type: "construction" as const,
      sortOrder: 1,
      durationRules: durationStage?.rules || [],
      constructionStandard: normalizeConstructionStandard(null),
      acceptanceStandard: normalizeConstructionStandard(null),
      logBroadcastScripts: [],
      photoRequired: true,
      customerConfirmRequired: false,
      projectManagerConfirmRequired: false,
    }];

    nodes.forEach((node, nodeIndex) => {
      const durationDays = getConstructionNodeDurationDays(input.template, stage, node, input.area, input.hasFloorHeating);
      const nodeDates = collectSiteWorkingDates(cursor, durationDays, options);
      if (!nodeDates.length) return;
      const actualRange = getConstructionPlanActualRange(stage, node, input.phases, input.tasks);
      const plannedStart = formatDateOnly(nodeDates[0]);
      const plannedEnd = formatDateOnly(nodeDates[nodeDates.length - 1]);
      rows.push({
        id: `${stage.id}-${node.id}-${nodeIndex}`,
        stageId: stage.id,
        stageName: stage.name,
        stageRowSpan: 0,
        nodeName: node.name,
        nodeType: node.type,
        plannedStart,
        plannedEnd,
        plannedDays: durationDays,
        actualStart: actualRange.actualStart,
        actualEnd: actualRange.actualEnd,
      });
      cursor = addCalendarDays(nodeDates[nodeDates.length - 1], 1);
    });

    const templateNodeNames = new Set(nodes.map((node) => normalizePlanText(node.name)));
    scopedTasks
      .filter((task) => !templateNodeNames.has(normalizePlanText(task.name)))
      .filter((task) => toDateOnlyInputValue(task.planned_start) && toDateOnlyInputValue(task.planned_end))
      .sort((left, right) => {
        const leftStart = toDateOnlyInputValue(left.planned_start);
        const rightStart = toDateOnlyInputValue(right.planned_start);
        if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
        return getConstructionTaskTimeValue(left) - getConstructionTaskTimeValue(right);
      })
      .forEach((task, taskIndex) => {
        const plannedStart = toDateOnlyInputValue(task.planned_start);
        const plannedEnd = toDateOnlyInputValue(task.planned_end);
        const taskStatus = String(task.status || "").toUpperCase();
        const actualStart = taskStatus === "COMPLETED" ? toDateOnlyInputValue(task.actual_start || "") : "";
        const actualEnd = taskStatus === "COMPLETED" ? toDateOnlyInputValue(task.actual_end || "") : "";
        const plannedStartDate = parseDateOnly(plannedStart);
        const plannedEndDate = parseDateOnly(plannedEnd);
        const plannedDays = plannedStartDate && plannedEndDate
          ? Math.max(1, Math.round((plannedEndDate.getTime() - plannedStartDate.getTime()) / 86400000) + 1)
          : 1;
        rows.push({
          id: `${stage.id}-${task.id || `custom-${taskIndex}`}`,
          stageId: stage.id,
          stageName: stage.name,
          stageRowSpan: 0,
          nodeName: task.name,
          nodeType: getConstructionTaskNodeType(task),
          plannedStart,
          plannedEnd,
          plannedDays,
          actualStart,
          actualEnd,
        });
      });
  });

  const stageCounts = rows.reduce((acc: Record<string, number>, row) => {
    acc[row.stageId] = (acc[row.stageId] || 0) + 1;
    return acc;
  }, {});
  const seenStageIds = new Set<string>();
  const rowsWithSpan = rows.map((row) => {
    if (seenStageIds.has(row.stageId)) return row;
    seenStageIds.add(row.stageId);
    return { ...row, stageRowSpan: stageCounts[row.stageId] || 1 };
  });
  const allDateValues = rowsWithSpan.flatMap((row) => [row.plannedStart, row.plannedEnd, row.actualStart, row.actualEnd].filter(Boolean));
  const planEndValues = rowsWithSpan.map((row) => row.plannedEnd).filter(Boolean);
  const parsedPlanEndDates = planEndValues.map(parseDateOnly).filter(Boolean) as Date[];
  const maxPlanEndDate = parsedPlanEndDates.reduce((max, date) => date.getTime() > max.getTime() ? date : max, parsedPlanEndDates[0]);
  const parsedDates = allDateValues.map(parseDateOnly).filter(Boolean) as Date[];
  const minDate = parsedDates.reduce((min, date) => date.getTime() < min.getTime() ? date : min, parsedDates[0]);
  const maxDate = parsedDates.reduce((max, date) => date.getTime() > max.getTime() ? date : max, parsedDates[0]);
  const dateColumns = minDate && maxDate ? enumerateCalendarDates(minDate, maxDate) : [];
  const hasCrossYear = dateColumns.some((date) => date.getFullYear() !== dateColumns[0]?.getFullYear());
  const monthGroups = dateColumns.reduce((groups: ConstructionPlanMonthGroup[], date) => {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const label = hasCrossYear ? `${date.getFullYear()}年${date.getMonth() + 1}月` : `${date.getMonth() + 1}月`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.colSpan += 1;
    } else {
      groups.push({ key, label, colSpan: 1 });
    }
    return groups;
  }, []);

  return {
    rows: rowsWithSpan,
    dateColumns,
    monthGroups,
    planEnd: maxPlanEndDate ? formatDateOnly(maxPlanEndDate) : rowsWithSpan[rowsWithSpan.length - 1]?.plannedEnd || "",
    totalDays: dateColumns.length,
  };
}

function getPhaseOptionKeys(stage: ConstructionTemplateStageOption | null, fallbackKey = "", fallbackLabel = "") {
  const keys = new Set<string>();
  if (stage) {
    getPlanStageKeys(stage).forEach((key) => {
      if (key) keys.add(key);
    });
  }
  [fallbackKey, fallbackLabel, phaseLabels[fallbackKey]].forEach((value) => {
    const key = normalizePlanText(value);
    if (key) keys.add(key);
  });
  return keys;
}

function phaseTextMatches(stage: ConstructionTemplateStageOption | null, value: unknown, fallbackKey = "", fallbackLabel = "") {
  const text = normalizePlanText(value);
  if (!text) return false;
  const keys = getPhaseOptionKeys(stage, fallbackKey, fallbackLabel);
  return Array.from(keys).some((key) => key && (text.includes(key) || key.includes(text)));
}

function findTemplateStageByValue(stages: ConstructionTemplateStageOption[], value: unknown) {
  const text = normalizePlanText(value);
  if (!text) return null;
  return stages.find((stage) => getPhaseOptionKeys(stage).has(text) || phaseTextMatches(stage, text)) || null;
}

function getNodeStandard(node: ConstructionTemplateNodeOption | null) {
  if (!node) return normalizeConstructionStandard(null);
  return node.type === "acceptance" ? node.acceptanceStandard : node.constructionStandard;
}

function getNodeStandardText(node: ConstructionTemplateNodeOption | null, fallback = "") {
  const standard = getNodeStandard(node);
  const descriptions = standard.standards.map((item) => item.description).filter(Boolean);
  if (descriptions.length > 0) return descriptions.slice(0, 2).join("；");
  return fallback || (node?.type === "acceptance" ? "按施工模板验收标准执行。" : "按施工模板工艺规范执行。");
}

function getPhaseNodeStatusMeta(status?: string | null, nodeType: "construction" | "acceptance" = "construction") {
  const key = String(status || "PENDING").toUpperCase();
  if (key === "SKIPPED") {
    return {
      label: "不施工",
      className: "bg-surface-100 text-surface-500",
      dotClassName: "bg-surface-400",
      rowClassName: "border-surface-200 bg-surface-50",
    };
  }
  if (key === "COMPLETED") {
    return {
      label: nodeType === "acceptance" ? "已验收" : "已完成",
      className: "bg-emerald-50 text-emerald-700",
      dotClassName: "bg-emerald-500",
      rowClassName: "border-emerald-100 bg-emerald-50/30",
    };
  }
  if (key === "REVIEW") {
    return {
      label: nodeType === "acceptance" ? "验收不通过" : "待确认",
      className: nodeType === "acceptance" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
      dotClassName: nodeType === "acceptance" ? "bg-red-500" : "bg-amber-500",
      rowClassName: nodeType === "acceptance" ? "border-red-100 bg-red-50/30" : "border-amber-100 bg-amber-50/30",
    };
  }
  if (key === "IN_PROGRESS") {
    return {
      label: "进行中",
      className: "bg-primary-50 text-primary-700",
      dotClassName: "bg-primary-600",
      rowClassName: "border-primary-100 bg-primary-50/30",
    };
  }
  if (key === "CANCELLED") {
    return {
      label: "已取消",
      className: "bg-surface-100 text-surface-500",
      dotClassName: "bg-surface-400",
      rowClassName: "border-surface-200 bg-surface-50",
    };
  }
  return {
    label: nodeType === "acceptance" ? "待验收" : "待完成",
    className: "bg-surface-100 text-surface-600",
    dotClassName: "bg-surface-300",
    rowClassName: "border-surface-200 bg-white",
  };
}

function parseConstructionRecordMetadata(value: unknown) {
  if (!value) return {} as Record<string, any>;
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
  } catch {
    return {} as Record<string, any>;
  }
}

function getConstructionRecordEventMeta(eventType: string) {
  const type = String(eventType || "").toUpperCase();
  if (type.startsWith("REPORT")) return { label: "施工汇报", className: "bg-primary-50 text-primary-700", dotClassName: "bg-primary-600" };
  if (type.startsWith("ISSUE")) return { label: "问题整改", className: "bg-red-50 text-red-700", dotClassName: "bg-red-500" };
  if (type.startsWith("ATTACHMENT")) return { label: "节点附件", className: "bg-cyan-50 text-cyan-700", dotClassName: "bg-cyan-500" };
  return { label: "状态变更", className: "bg-emerald-50 text-emerald-700", dotClassName: "bg-emerald-500" };
}

function constructionRecordEventMatchesFilter(eventType: string, filter: string) {
  const type = String(eventType || "").toUpperCase();
  if (filter === "ALL") return true;
  if (filter === "ATTACHMENT") return type.startsWith("ATTACHMENT");
  if (filter === "REPORT") return type.startsWith("REPORT");
  if (filter === "ISSUE") return type.startsWith("ISSUE");
  return type === filter;
}

function getConstructionRecordQualityMeta(node: PhaseNodeRow) {
  const status = String(node.status || "PENDING").toUpperCase();
  if (status === "SKIPPED") return { label: "不施工", className: "bg-surface-100 text-surface-500" };
  if (node.nodeType === "acceptance") {
    if (status === "COMPLETED") return { label: "已验收", className: "bg-emerald-50 text-emerald-700" };
    if (status === "REVIEW") return { label: "验收不通过", className: "bg-red-50 text-red-700" };
    return { label: "未验收", className: "bg-surface-100 text-surface-600" };
  }
  if (node.customerConfirmRequired || node.projectManagerConfirmRequired) {
    return status === "COMPLETED"
      ? { label: "已确认", className: "bg-emerald-50 text-emerald-700" }
      : { label: "待确认", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "免检", className: "bg-surface-100 text-surface-600" };
}

function getConstructionRecordStatusText(status: string) {
  const key = String(status || "").toUpperCase();
  if (key === "SKIPPED") return "不施工";
  if (key === "COMPLETED") return "已完成";
  if (key === "REVIEW") return "待确认";
  if (key === "IN_PROGRESS") return "进行中";
  if (key === "CANCELLED") return "已取消";
  return "待完成";
}

function shouldShowConstructionRecordNode(status?: string | null) {
  return ["IN_PROGRESS", "REVIEW", "COMPLETED"].includes(String(status || "PENDING").toUpperCase());
}

function getPhaseNodeAdvanceAction(node: PhaseNodeRow) {
  const status = String(node.status || "PENDING").toUpperCase();
  if (status === "SKIPPED") return { label: "重置", nextStatus: "PENDING" as const, needsConfirm: false };
  if (status === "PENDING") {
    return {
      label: node.nodeType === "acceptance" ? "完成验收" : "完成施工",
      nextStatus: "COMPLETED" as const,
      needsConfirm: node.nodeType === "acceptance",
    };
  }
  if (status === "IN_PROGRESS") {
    return {
      label: node.nodeType === "acceptance" ? "完成验收" : "完成施工",
      nextStatus: "COMPLETED" as const,
      needsConfirm: node.nodeType === "acceptance",
    };
  }
  if (status === "REVIEW") {
    return {
      label: node.nodeType === "acceptance" ? "完成验收" : "完成施工",
      nextStatus: "COMPLETED" as const,
      needsConfirm: node.nodeType === "acceptance",
    };
  }
  if (status === "COMPLETED") return { label: "重置", nextStatus: "PENDING" as const, needsConfirm: false };
  return null;
}

function getAcceptanceStandardKey(item: ConstructionTemplateStandardItem, index: number) {
  return item.id || `acceptance-standard-${index}`;
}

function buildEmptyAcceptanceReviewResults(node: PhaseNodeRow | null) {
  const result: Record<string, AcceptanceReviewValue> = {};
  (node?.standardItems || []).forEach((item, index) => {
    result[getAcceptanceStandardKey(item, index)] = "";
  });
  return result;
}




export default function SitePage() {
  const params = useParams<{ id: string }>();
  const siteId = decodeURIComponent(params.id);
  const { user } = useAuth();
  const [data, setData] = useState<any>({ projects: [], phases: [], tasks: [], logs: [], inspections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logForm, setLogForm] = useState<LogForm>(makeDefaultLogForm());
  const [logFilter, setLogFilter] = useState("all");
  const [logKeyword, setLogKeyword] = useState("");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [logMessage, setLogMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [selectedQuickItems, setSelectedQuickItems] = useState<string[]>([]);
  const [issueTitle, setIssueTitle] = useState("");
  const [costForm, setCostForm] = useState<CostForm>(makeDefaultCostForm());
  const [costMessage, setCostMessage] = useState("");
  const [actualCompareOpen, setActualCompareOpen] = useState(false);
  const [actualCostRecordKey, setActualCostRecordKey] = useState("");
  const [budgetDetailGroupKey, setBudgetDetailGroupKey] = useState("all");
  const [materialOrderForm, setMaterialOrderForm] = useState<MaterialOrderForm>(makeDefaultMaterialOrderForm());
  const [materialOrderMessage, setMaterialOrderMessage] = useState("");
  const [selectedMaterialOrderId, setSelectedMaterialOrderId] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("ALL");
  const [materialOrderMode, setMaterialOrderMode] = useState<"list" | "detail" | "new">("list");
  const [materialImagePreview, setMaterialImagePreview] = useState<{ src: string; name: string; spec: string; x: number; y: number } | null>(null);
  const [changeOrderForm, setChangeOrderForm] = useState<ChangeOrderForm>(makeDefaultChangeOrderForm());
  const [changeOrderMessage, setChangeOrderMessage] = useState("");
  const [changeOrderFilter, setChangeOrderFilter] = useState("all");
  const [selectedChangeOrderId, setSelectedChangeOrderId] = useState("");
  const [quantityReviewMessage, setQuantityReviewMessage] = useState("");
  const [settlementMessage, setSettlementMessage] = useState("");
  const [changeOrderSignatureApprovalOpen, setChangeOrderSignatureApprovalOpen] = useState(false);
  const [changeOrderSignatureApprovalAction, setChangeOrderSignatureApprovalAction] = useState<"approve" | "reject">("approve");
  const [changeOrderDetailOpen, setChangeOrderDetailOpen] = useState(false);
  const [changeOrderEditMode, setChangeOrderEditMode] = useState(false);
  const [changeOrderEditForm, setChangeOrderEditForm] = useState<ChangeOrderForm>(makeDefaultChangeOrderForm());
  const [archiveCategory, setArchiveCategory] = useState("施工图");
  const [archiveMessage, setArchiveMessage] = useState("");
  const [archiveLinkForm, setArchiveLinkForm] = useState(makeDefaultArchiveLinkForm());
  const [renamingArchiveFile, setRenamingArchiveFile] = useState<any | null>(null);
  const [archiveRenameName, setArchiveRenameName] = useState("");
  const [archiveRenameSaving, setArchiveRenameSaving] = useState(false);
  const [sharingArchiveFile, setSharingArchiveFile] = useState<any | null>(null);
  const [summaryContract, setSummaryContract] = useState<any | null>(null);
  const [archiveShareExpiresIn, setArchiveShareExpiresIn] = useState("7d");
  const [archiveShareLink, setArchiveShareLink] = useState("");
  const [archiveShareExpiresAt, setArchiveShareExpiresAt] = useState<string | null>(null);
  const [archiveShareLoading, setArchiveShareLoading] = useState(false);
  const [archiveShareLookupLoading, setArchiveShareLookupLoading] = useState(false);
  const [archiveShareMessage, setArchiveShareMessage] = useState("");
  const [vrBuilderOpen, setVrBuilderOpen] = useState(false);
  const [vrTitle, setVrTitle] = useState("");
  const [vrScenes, setVrScenes] = useState<VrSceneDraft[]>([makeDefaultVrSceneDraft()]);
  const [vrGenerating, setVrGenerating] = useState(false);
  const [editingVrTourId, setEditingVrTourId] = useState("");
  const [checkinMessage, setCheckinMessage] = useState("");
  const [checkinPersonFilter, setCheckinPersonFilter] = useState("");
  const [checkinDateFrom, setCheckinDateFrom] = useState("");
  const [checkinDateTo, setCheckinDateTo] = useState("");
  const [receiptRecordsOpen, setReceiptRecordsOpen] = useState(false);
  const [changeAmountDetailType, setChangeAmountDetailType] = useState<"ADD" | "DEDUCT" | null>(null);
  const [pageOrigin, setPageOrigin] = useState("");
  const [activeTab, setActiveTab] = useState<SiteTabKey>("overview");
  const [scheduleTabOpening, setScheduleTabOpening] = useState(false);
  const [constructionPlanFullscreen, setConstructionPlanFullscreen] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverStartConfirmMode, setHandoverStartConfirmMode] = useState(false);
  const [handoverStartConfirmDialogOpen, setHandoverStartConfirmDialogOpen] = useState(false);
  const [handoverForm, setHandoverForm] = useState(makeDefaultHandoverForm());
  const [handoverMessage, setHandoverMessage] = useState("");
  const [handoverMissingFields, setHandoverMissingFields] = useState<Partial<Record<HandoverRequiredFieldKey, number>>>({});
  const [constructionTemplateOptions, setConstructionTemplateOptions] = useState<ConstructionTemplateOption[]>([]);
  const [constructionTemplateLoading, setConstructionTemplateLoading] = useState(false);
  const [constructionTemplateError, setConstructionTemplateError] = useState("");
  const [constructionTemplatePickerOpen, setConstructionTemplatePickerOpen] = useState(false);
  const [constructionTemplateSearch, setConstructionTemplateSearch] = useState("");
  const [exportingConstructionPlan, setExportingConstructionPlan] = useState(false);
  const [constructionPlanExportMessage, setConstructionPlanExportMessage] = useState("");
  const [selectedPhaseNodeId, setSelectedPhaseNodeId] = useState("");
  const [phaseNodeModal, setPhaseNodeModal] = useState<{ mode: PhaseNodeModalMode; nodeId: string } | null>(null);
  const [customPhaseNodeDialogOpen, setCustomPhaseNodeDialogOpen] = useState(false);
  const [customPhaseNodeForm, setCustomPhaseNodeForm] = useState<CustomPhaseNodeForm>({
    nodeType: "construction",
    name: "",
    description: "",
    plannedStart: "",
    plannedEnd: "",
  });
  const [customPhaseNodeMessage, setCustomPhaseNodeMessage] = useState("");
  const [phaseNodeDeleteTarget, setPhaseNodeDeleteTarget] = useState<PhaseNodeRow | null>(null);
  const [phaseNodeDeleteMessage, setPhaseNodeDeleteMessage] = useState("");
  const [acceptanceReviewResults, setAcceptanceReviewResults] = useState<Record<string, AcceptanceReviewValue>>({});
  const [acceptanceReviewMessage, setAcceptanceReviewMessage] = useState("");
  const [constructionRecordEvents, setConstructionRecordEvents] = useState<any[]>([]);
  const [constructionRecordLoading, setConstructionRecordLoading] = useState(false);
  const [constructionRecordError, setConstructionRecordError] = useState("");
  const [constructionRecordSearch, setConstructionRecordSearch] = useState("");
  const [constructionRecordStageFilter, setConstructionRecordStageFilter] = useState("ALL");
  const [constructionRecordStatusFilter, setConstructionRecordStatusFilter] = useState("ALL");
  const [constructionRecordTypeFilter, setConstructionRecordTypeFilter] = useState("ALL");
  const [constructionRecordPersonFilter, setConstructionRecordPersonFilter] = useState("ALL");
  const [constructionRecordDateFrom, setConstructionRecordDateFrom] = useState("");
  const [constructionRecordDateTo, setConstructionRecordDateTo] = useState("");
  const [constructionRecordNodeId, setConstructionRecordNodeId] = useState("");
  const [constructionRecordTimelineFilter, setConstructionRecordTimelineFilter] = useState("ALL");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [pendingLogPhotos, setPendingLogPhotos] = useState<any[]>([]);
  const [uploadingCategory, setUploadingCategory] = useState("");
  const [deletingFileId, setDeletingFileId] = useState("");
  const handoverInputRef = useRef<HTMLInputElement | null>(null);
  const phasePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const logPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const autoLogLocationRef = useRef("");
  const customerFieldBackfillRef = useRef("");
  const siteDetailContentRef = useRef<HTMLElement | null>(null);
  const constructionTemplateLoadedRef = useRef(false);
  const constructionTemplateRequestRef = useRef(false);
  const scheduleTabFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [siteDetailContentHeight, setSiteDetailContentHeight] = useState(0);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const res = await fetch("/api/site");
      const next = await res.json();
      setData(next);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const loadConstructionRecordEvents = useCallback(async (projectId: string, options?: { silent?: boolean }) => {
    if (!projectId) return;
    if (!options?.silent) setConstructionRecordLoading(true);
    setConstructionRecordError("");
    try {
      const response = await fetch(`/api/site?mode=node-records&project_id=${encodeURIComponent(projectId)}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || "读取施工记录失败");
      setConstructionRecordEvents(Array.isArray(result?.items) ? result.items : []);
      setData((current: any) => ({
        ...current,
        logs: Array.isArray(result?.logs)
          ? [...(current.logs || []).filter((item: any) => item.project_id !== projectId), ...result.logs]
          : current.logs,
        inspections: Array.isArray(result?.inspections)
          ? [...(current.inspections || []).filter((item: any) => item.project_id !== projectId), ...result.inspections]
          : current.inspections,
      }));
    } catch (error: any) {
      setConstructionRecordError(error?.message || "读取施工记录失败");
    } finally {
      if (!options?.silent) setConstructionRecordLoading(false);
    }
  }, []);

  const loadConstructionTemplateOptions = useCallback(async (options?: { force?: boolean }) => {
    if (constructionTemplateRequestRef.current) return;
    if (!options?.force && constructionTemplateLoadedRef.current) return;
    constructionTemplateRequestRef.current = true;
    setConstructionTemplateLoading(true);
    setConstructionTemplateError("");
    try {
      const response = await fetch(`/api/quota/construction-templates?t=${Date.now()}`, {
        headers: getClientAuthHeaders(),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || "读取施工模板失败");
      const items = Array.isArray(result?.items)
        ? result.items.map(normalizeConstructionTemplateOption).filter(Boolean) as ConstructionTemplateOption[]
        : [];
      setConstructionTemplateOptions(items);
      constructionTemplateLoadedRef.current = true;
    } catch (error: any) {
      setConstructionTemplateOptions([]);
      setConstructionTemplateError(error?.message || "读取施工模板失败");
      constructionTemplateLoadedRef.current = false;
    } finally {
      constructionTemplateRequestRef.current = false;
      setConstructionTemplateLoading(false);
    }
  }, []);

  const handleSiteTabClick = (tabKey: SiteTabKey) => {
    if (tabKey === activeTab) return;
    if (scheduleTabFeedbackTimerRef.current) {
      clearTimeout(scheduleTabFeedbackTimerRef.current);
      scheduleTabFeedbackTimerRef.current = null;
    }
    if (tabKey === "schedule") {
      setScheduleTabOpening(true);
      scheduleTabFeedbackTimerRef.current = setTimeout(() => {
        setScheduleTabOpening(false);
        scheduleTabFeedbackTimerRef.current = null;
      }, 160);
      void loadConstructionTemplateOptions();
    } else {
      setScheduleTabOpening(false);
    }
    setActiveTab(tabKey);
  };

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!(handoverModalOpen || activeTab === "schedule" || activeTab === "phase" || activeTab === "records")) return;
    void loadConstructionTemplateOptions();
  }, [activeTab, handoverModalOpen, loadConstructionTemplateOptions, user?.id]);

  useEffect(() => {
    if (activeTab !== "records" || !siteId) return;
    void loadConstructionRecordEvents(siteId);
  }, [activeTab, loadConstructionRecordEvents, siteId]);

  useEffect(() => {
    setConstructionRecordEvents([]);
    setConstructionRecordError("");
    setConstructionRecordStageFilter("ALL");
    setConstructionRecordStatusFilter("ALL");
    setConstructionRecordTypeFilter("ALL");
    setConstructionRecordPersonFilter("ALL");
    setConstructionRecordDateFrom("");
    setConstructionRecordDateTo("");
    setConstructionRecordNodeId("");
    setConstructionRecordTimelineFilter("ALL");
  }, [siteId]);

  useEffect(() => {
    if (!constructionRecordNodeId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConstructionRecordNodeId("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [constructionRecordNodeId]);

  useEffect(() => {
    if (activeTab !== "schedule" && constructionPlanFullscreen) {
      setConstructionPlanFullscreen(false);
    }
  }, [activeTab, constructionPlanFullscreen]);

  useEffect(() => {
    if (!constructionPlanFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConstructionPlanFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [constructionPlanFullscreen]);

  useEffect(() => () => {
    if (scheduleTabFeedbackTimerRef.current) clearTimeout(scheduleTabFeedbackTimerRef.current);
  }, []);

  useEffect(() => {
    const updateContentHeight = () => {
      const element = siteDetailContentRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const computedHeight = Number.parseFloat(window.getComputedStyle(element).height);
      const visualScale = computedHeight > 0 && rect.height > 0 ? rect.height / computedHeight : 1;
      const availableHeight = window.innerHeight - rect.top - 16;
      const nextHeight = Math.max(480, Math.floor(availableHeight / Math.max(visualScale, 0.5)));

      setSiteDetailContentHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    };

    const frame = window.requestAnimationFrame(updateContentHeight);
    window.addEventListener("resize", updateContentHeight);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateContentHeight);
    };
  }, [activeTab, materialOrderMode]);
  useEffect(() => {
    if (typeof window !== "undefined") setPageOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (activeTab === "materials" && materialOrderMode === "new") {
      setMaterialOrderMode("list");
    }
  }, [activeTab, materialOrderMode]);

  const projects = data.projects || [];
  const selected = projects.find((project: any) => project.id === siteId) || null;
  const selectedHasCustomerFields = Boolean(selected && [
    "customer_source",
    "customer_budget",
    "customer_intention",
    "customer_created_at",
    "customer_created_by_name",
    "customer_inviter_name",
  ].some((key) => Object.prototype.hasOwnProperty.call(selected, key)));
  useEffect(() => {
    if (!selected?.id || selectedHasCustomerFields || customerFieldBackfillRef.current === selected.id) return;
    customerFieldBackfillRef.current = selected.id;
    void load({ silent: true });
  }, [load, selected?.id, selectedHasCustomerFields]);
  const siteDisplayName = getSiteDisplayName(selected);
  const siteAddress = getSiteAddress(selected);
  const isVirtualSite = Boolean(selected?.is_customer_site);
  const getTimeValue = (value: any) => parseAppDate(value)?.getTime() || 0;
  const phases = (data.phases || []).filter((item: any) => item.project_id === selected?.id);
  const tasks = (data.tasks || []).filter((item: any) => item.project_id === selected?.id);
  const logs = (data.logs || [])
    .filter((item: any) => item.project_id === selected?.id)
    .sort((a: any, b: any) => {
      const dateCompare = String(b.log_date || "").localeCompare(String(a.log_date || ""));
      if (dateCompare !== 0) return dateCompare;
      const createdCompare = getTimeValue(b.created_at) - getTimeValue(a.created_at);
      if (createdCompare !== 0) return createdCompare;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const inspections = (data.inspections || []).filter((item: any) => item.project_id === selected?.id);
  const handovers = (data.handovers || []).filter((item: any) => item.project_id === selected?.id);
  const contracts = (data.contracts || []).filter((item: any) => item.project_id === selected?.id);
  const signedContracts = contracts
    .filter((contract: any) => ["SIGNED", "RESIGNED"].includes(String(contract.status || "").toUpperCase()))
    .slice()
    .sort((a: any, b: any) => {
      const timeCompare = getTimeValue(b.signed_at || b.updated_at || b.created_at) - getTimeValue(a.signed_at || a.updated_at || a.created_at);
      if (timeCompare !== 0) return timeCompare;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const quotations = (data.quotations || []).filter((item: any) => item.project_id === selected?.id);
  const quotationItems = (data.quotationItems || []).filter((item: any) => item.project_id === selected?.id);
  const paymentPlans = (data.paymentPlans || []).filter((item: any) => item.project_id === selected?.id);
  const contractsWithPaymentPlans = contracts.map((contract: any) => ({
    ...contract,
    payment_plans: paymentPlans.filter((plan: any) => plan.contract_id === contract.id),
  }));
  const paymentPlanIds = new Set(paymentPlans.map((item: any) => item.id));
  const paymentRecords = (data.paymentRecords || []).filter((item: any) => paymentPlanIds.has(item.payment_plan_id));
  const depositRecords = (data.depositRecords || []).filter((item: any) => item.customer_id === selected?.customer_id);
  const activeDepositRecords = depositRecords.filter((record: any) => record.status !== "rejected");
  const designFeeRecords = (data.designFeeRecords || []).filter((item: any) => item.customer_id === selected?.customer_id);
  const activeDesignFeeRecords = designFeeRecords.filter((record: any) => record.status !== "rejected");
  const designFeeReceivableAmount = activeDesignFeeRecords.reduce((sum: number, record: any) => sum + getPaymentRecordReceivableAmount(record), 0);
  const designFeeReceivedAmount = activeDesignFeeRecords.reduce((sum: number, record: any) => sum + getPaymentRecordActualReceivedAmount(record), 0);
  const designFeeUnreceivedAmount = Math.max(0, Math.round((designFeeReceivableAmount - designFeeReceivedAmount) * 100) / 100);
  const designFeeNotFullyReceived = designFeeReceivableAmount > 0 && designFeeUnreceivedAmount > 0.005;
  const designFeeHandoverWarning = designFeeNotFullyReceived
    ? `开工交底已完成。提醒：设计费尚未收齐，应收 ${formatPlainAmount(designFeeReceivableAmount)}，已收 ${formatPlainAmount(designFeeReceivedAmount)}，未收 ${formatPlainAmount(designFeeUnreceivedAmount)}。`
    : "";
  const customerTeam = (data.customerTeam || []).filter((item: any) => item.customer_id === selected?.customer_id);
  const manualAdvisor = customerTeam.find((member: any) => String(member.role || "").toUpperCase() === "ADVISOR");
  const siteAdvisorName = manualAdvisor?.user_name || selected?.customer_advisor_name || selected?.customer_inviter_name || selected?.customer_created_by_name || "";
  const siteCustomerRoomNumber = buildSiteCustomerRoomNumber(selected);
  const siteCustomerCreatedAt = selected?.customer_created_at || selected?.created_at || "";
  const customerAttachments = (data.customerAttachments || []).filter((item: any) => item.customer_id === selected?.customer_id);
  const costRecords = (data.costRecords || []).filter((item: any) => item.project_id === selected?.id);
  const costSnapshots = (data.costSnapshots || [])
    .filter((item: any) => item.project_id === selected?.id)
    .slice()
    .sort((a: any, b: any) => {
      const timeCompare = getTimeValue(b.updated_at || b.created_at) - getTimeValue(a.updated_at || a.created_at);
      if (timeCompare !== 0) return timeCompare;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const activeCostSnapshot = costSnapshots[0] || null;
  const costSnapshotItems = (data.costSnapshotItems || []).filter((item: any) => item.snapshot_id === activeCostSnapshot?.id);
  useEffect(() => {
    setBudgetDetailGroupKey("all");
  }, [activeCostSnapshot?.id, selected?.id]);
  const changeOrders = (data.changeOrders || [])
    .filter((item: any) => item.project_id === selected?.id)
    .slice()
    .sort((a: any, b: any) => {
      const timeCompare = getTimeValue(b.created_at) - getTimeValue(a.created_at);
      if (timeCompare !== 0) return timeCompare;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const quantityReviews = (data.quantityReviews || [])
    .filter((item: any) => item.project_id === selected?.id)
    .slice()
    .sort((a: any, b: any) => {
      const timeCompare = getTimeValue(b.created_at) - getTimeValue(a.created_at);
      if (timeCompare !== 0) return timeCompare;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const ownerSettlementBills = (data.ownerSettlementBills || [])
    .filter((item: any) => item.project_id === selected?.id)
    .slice()
    .sort((a: any, b: any) => {
      const timeCompare = getTimeValue(b.created_at) - getTimeValue(a.created_at);
      if (timeCompare !== 0) return timeCompare;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const materialOrders = (data.materialOrders || []).filter((item: any) => item.project_id === selected?.id);
  const materialOrderIds = new Set(materialOrders.map((item: any) => item.id));
  const materialOrderItems = (data.materialOrderItems || []).filter((item: any) => materialOrderIds.has(item.order_id));
  const materialCatalog = (data.materials || []).filter((item: any) => !selected?.company_id || item.company_id === selected.company_id);
  const materialSuppliers = (data.suppliers || []).filter((item: any) => !selected?.company_id || item.company_id === selected.company_id);
  const siteCameras = (Array.isArray(data.siteCameras) ? data.siteCameras : []).filter((item: any) => item.project_id === selected?.id);
  const checkinCode = (data.checkinCodes || []).find((item: any) => item.project_id === selected?.id) || null;
  const customerSiteLatitude = Number(selected?.customer_address_latitude);
  const customerSiteLongitude = Number(selected?.customer_address_longitude);
  const siteLatitude = customerSiteLatitude;
  const siteLongitude = customerSiteLongitude;
  const hasSiteLocation = Number.isFinite(siteLatitude) && Number.isFinite(siteLongitude);
  const siteLocationName = String(selected?.customer_address_location_name || selected?.customer_address || "").trim();
  const checkinRecords = (data.checkinRecords || [])
    .filter((item: any) => item.project_id === selected?.id)
    .sort((a: any, b: any) => getTimeValue(b.signed_at || b.created_at) - getTimeValue(a.signed_at || a.created_at));
  const checkinPersonOptions = Array.from(new Set<string>(checkinRecords.map((record: any) => String(record.person_name || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const visibleCheckinRecords = checkinRecords.filter((record: any) => {
    const personName = String(record.person_name || "").trim();
    if (checkinPersonFilter && personName !== checkinPersonFilter) return false;
    const signedDate = String(record.signed_at || record.created_at || "").slice(0, 10);
    if (checkinDateFrom && (!signedDate || signedDate < checkinDateFrom)) return false;
    if (checkinDateTo && (!signedDate || signedDate > checkinDateTo)) return false;
    return true;
  });
  const checkinTotalCount = Number(selected?.checkin_count || checkinRecords.length || 0);
  const checkinUniquePersonCount = Number(selected?.checkin_person_count || new Set(checkinRecords.map((record: any) => String(record.user_id || record.phone || record.person_name || record.id))).size || 0);
  const latestCheckin = checkinRecords[0] || null;
  const checkinUrl = checkinCode?.code && pageOrigin
    ? `${pageOrigin}/site-checkin/${encodeURIComponent(checkinCode.code)}`
    : "";
  const checkinQrUrl = checkinUrl ? makeQrCodeUrl(checkinUrl, 360) : "";
  const selectedMaterialOrder = materialOrders.find((order: any) => order.id === selectedMaterialOrderId) || materialOrders[0] || null;
  const selectedMaterialOrderItems = selectedMaterialOrder
    ? materialOrderItems.filter((item: any) => item.order_id === selectedMaterialOrder.id)
    : [];
  const materialCategoryFilters = [
    {
      key: "ALL",
      label: "全部订单",
      amount: materialOrders.reduce((sum: number, order: any) => sum + Number(order.total_amount || 0), 0),
      itemCount: materialOrderItems.length,
      orderCount: materialOrders.length,
      color: materialOrderCategoryColors.ALL,
    },
    ...(["AUXILIARY", "MAIN", "OTHER"] as const).map((key) => {
      const orders = materialOrders.filter((order: any) => getMaterialOrderCategory(order) === key);
      const orderIds = new Set(orders.map((order: any) => order.id));
      const items = materialOrderItems.filter((item: any) => orderIds.has(item.order_id));
      return {
        key,
        label: materialOrderCategoryLabels[key],
        amount: orders.reduce((sum: number, order: any) => sum + Number(order.total_amount || 0), 0),
        itemCount: items.length,
        orderCount: orders.length,
        color: materialOrderCategoryColors[key],
      };
    }),
  ];
  const filteredMaterialOrderIds = materialCategoryFilter === "ALL"
    ? new Set(materialOrders.map((order: any) => order.id))
    : new Set(materialOrders
        .filter((order: any) => getMaterialOrderCategory(order) === materialCategoryFilter)
        .map((order: any) => order.id));
  const visibleMaterialOrders = materialOrders.filter((order: any) => filteredMaterialOrderIds.has(order.id));
  const selectableMaterialCatalog = materialCatalog.filter((item: any) => {
    const type = item.material_type || (getMaterialGroup(item.category_name, item.name) === "MAIN_MATERIAL" ? "MAIN" : "AUXILIARY");
    const mode = item.supply_mode || (type === "MAIN" ? "SUPPLIER_ORDER" : "WAREHOUSE");
    if (materialOrderForm.order_type === "AUXILIARY_WAREHOUSE") return type !== "MAIN" && mode === "WAREHOUSE";
    if (materialOrderForm.order_type === "AUXILIARY_MONTHLY") return type !== "MAIN" && mode === "MONTHLY_SETTLEMENT";
    if (materialOrderForm.order_type === "MAIN_SUPPLIER") return type === "MAIN" || mode === "SUPPLIER_ORDER";
    return true;
  });
  const selectableMaterialSuppliers = materialSuppliers.filter((supplier: any) => {
    const supplierType = supplier.supplier_type || "GENERAL";
    if (materialOrderForm.order_type === "AUXILIARY_MONTHLY") return supplierType === "AUXILIARY_SETTLEMENT" || supplierType === "GENERAL";
    if (materialOrderForm.order_type === "MAIN_SUPPLIER") return supplierType === "MAIN_MATERIAL" || supplierType === "GENERAL";
    return supplierType === "WAREHOUSE" || supplierType === "GENERAL";
  });
  const selectedMaterialOrderTotalQuantity = selectedMaterialOrderItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
  const selectedMaterialOrderHandledQuantity = selectedMaterialOrderItems.reduce((sum: number, item: any) => {
    const quantity = Number(item.quantity || 0);
    const handled = selectedMaterialOrder?.order_type === "AUXILIARY_WAREHOUSE"
      ? Number(item.stock_deducted_qty || 0)
      : Number(item.received_qty || 0);
    return sum + Math.min(quantity, Math.max(0, handled));
  }, 0);
  const selectedMaterialOrderPendingQuantity = selectedMaterialOrderItems.reduce((sum: number, item: any) => {
    const quantity = Number(item.quantity || 0);
    const receivedQty = Math.max(0, Number(item.received_qty || 0));
    if (selectedMaterialOrder?.order_type !== "AUXILIARY_WAREHOUSE") {
      return sum + Math.max(0, quantity - Math.min(quantity, receivedQty));
    }
    const deductedQty = Number(item.stock_deducted_qty || 0);
    const remainingQty = Math.max(0, quantity - deductedQty);
    const rawPendingInputQty = Math.max(0, Math.min(quantity, receivedQty || quantity) - deductedQty);
    const pendingInputQty = remainingQty > 0 && rawPendingInputQty <= 0 ? remainingQty : rawPendingInputQty;
    return sum + Math.max(0, pendingInputQty);
  }, 0);
  const selectedMaterialOrderProcessLabel = selectedMaterialOrder?.order_type === "AUXILIARY_WAREHOUSE" ? "出库" : "到货";
  const selectedMaterialOrderProgressRate = selectedMaterialOrderTotalQuantity > 0
    ? Math.round((selectedMaterialOrderHandledQuantity / selectedMaterialOrderTotalQuantity) * 100)
    : 0;
  const materialOrderFormAmount = materialOrderForm.items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0) || 0);
    const unitPrice = Math.max(0, Number(item.unit_price || 0) || 0);
    return sum + quantity * unitPrice;
  }, 0);
  const visibleChangeOrders = changeOrders.filter((order: any) => changeOrderFilter === "all" || order.status === changeOrderFilter);
  const selectedChangeOrder = changeOrders.find((order: any) => order.id === selectedChangeOrderId) || visibleChangeOrders[0] || null;
  const selectedChangeOrderItems = selectedChangeOrder ? parseChangeOrderItems(selectedChangeOrder) : [];
  const selectedChangeOrderAddAmount = selectedChangeOrder ? getChangeOrderAddAmount(selectedChangeOrder) : 0;
  const selectedChangeOrderDeductAmount = selectedChangeOrder ? getChangeOrderDeductAmount(selectedChangeOrder) : 0;
  const selectedChangeOrderDiscountAmount = selectedChangeOrder ? getChangeOrderDiscountAmount(selectedChangeOrder) : 0;
  const selectedChangeOrderPendingApprovalStep = selectedChangeOrder?.approval?.steps?.find((step: any) => step.status === "pending" && step.approver_id === user?.id) || null;
  const canHandleSelectedChangeApproval = Boolean(
    selectedChangeOrderPendingApprovalStep &&
    selectedChangeOrder?.approval?.status === "pending" &&
    selectedChangeOrder?.status === "PENDING_APPROVAL",
  );
  const ownerConfirmedChangeOrders = changeOrders
    .filter((order: any) => !["CANCELLED", "REJECTED"].includes(String(order.status || "")))
    .sort((a: any, b: any) => getTimeValue(b.approved_at || b.updated_at || b.created_at) - getTimeValue(a.approved_at || a.updated_at || a.created_at));
  const ownerConfirmedAddOrders = ownerConfirmedChangeOrders.filter((order: any) => getChangeOrderAddAmount(order) > 0);
  const ownerConfirmedDeductOrders = ownerConfirmedChangeOrders.filter((order: any) => getChangeOrderDeductAmount(order) > 0);
  const ownerConfirmedChangeAmount = ownerConfirmedChangeOrders.reduce((sum: number, order: any) => sum + getChangeSignedAmount(order), 0);
  const changeAmountDetailOrders = changeAmountDetailType === "ADD"
    ? ownerConfirmedAddOrders
    : changeAmountDetailType === "DEDUCT"
      ? ownerConfirmedDeductOrders
      : [];
  const changeAmountDetailTotal = changeAmountDetailOrders.reduce((sum: number, order: any) => sum + (changeAmountDetailType === "DEDUCT" ? getChangeOrderDeductAmount(order) : getChangeOrderNetAddAmount(order)), 0);
  const changeAmountDetailTitle = changeAmountDetailType === "DEDUCT" ? "减项金额明细" : "增项金额明细";
  const changeAmountDetailTone = changeAmountDetailType === "DEDUCT" ? "text-emerald-600" : "text-red-600";
  const addChangeAmount = changeOrders
    .filter((order: any) => order.status === "APPROVED")
    .reduce((sum: number, order: any) => sum + getChangeOrderNetAddAmount(order), 0);
  const deductChangeAmount = changeOrders
    .filter((order: any) => order.status === "APPROVED")
    .reduce((sum: number, order: any) => sum + getChangeOrderDeductAmount(order), 0);
  const netChangeAmount = addChangeAmount - deductChangeAmount;
  const pendingApprovalChangeCount = changeOrders.filter((order: any) => order.status === "PENDING_APPROVAL" || order.status === "PENDING_OWNER").length;
  const settlementChangeAmount = changeOrders
    .filter((order: any) => order.status === "APPROVED" && Number(order.included_in_settlement || 0) === 1)
    .reduce((sum: number, order: any) => sum + getChangeSignedAmount(order), 0);
  const changeGrossProfitImpact = changeOrders
    .filter((order: any) => order.status === "APPROVED")
    .reduce((sum: number, order: any) => sum + getChangeSignedAmount(order) - Math.max(0, Number(order.cost_estimate || 0) || 0), 0);
  const currentHandover = handovers[0] || null;
  const handoverCompleted = Boolean(
    String(currentHandover?.status || "").toLowerCase() === "completed"
    || currentHandover?.completed_at
    || selected?.handover_completed_at,
  );
  const handoverLocked = Boolean(
    isVirtualSite
    || ["CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"].includes(String(selected?.site_stage || "").trim().toUpperCase())
    || ["CONSTRUCTION", "COMPLETED", "CLOSED"].includes(String(selected?.status || "").trim().toUpperCase()),
  );
  const handoverReadOnly = handoverLocked;
  const handoverActionText = handoverReadOnly ? "查看开工交底" : handoverCompleted ? "复核开工交底" : "开工交底";
  const handoverFiles = attachments.filter((file) => file.category === "开工交底资料");
  const openIssues = inspections.filter((item: any) => item.status !== "closed");
  const logFiles = attachments.filter((file) => String(file.category || "").startsWith("施工日志"));
  const quickWorkItems = logQuickWorkItems[logForm.phase || selected?.current_phase || ""] || defaultLogQuickItems;
  const filteredLogs = logs.filter((log: any) => {
    const logDate = String(log.log_date || log.created_at || "").slice(0, 10);
    if (logDateFrom && (!logDate || logDate < logDateFrom)) return false;
    if (logDateTo && (!logDate || logDate > logDateTo)) return false;
    if (logFilter === "risk" && !hasLogRisk(log)) return false;
    if (logFilter !== "all" && logFilter !== "risk") {
      const phase = String(log.phase || "").trim();
      const text = `${log.content || ""} ${log.completed_work || ""} ${log.safety_notes || ""}`.toLowerCase();
      const label = phaseLabels[logFilter] || "";
      if (phase ? phase !== logFilter : (!text.includes(logFilter.toLowerCase()) && !text.includes(label.toLowerCase()))) return false;
    }
    const keyword = logKeyword.trim().toLowerCase();
    if (!keyword) return true;
    return [
      log.author_name,
      log.content,
      log.completed_work,
      log.material_notes,
      log.quality_notes,
      log.safety_notes,
      log.issue_notes,
      log.next_plan,
      log.location_name,
      log.location_address,
    ].filter(Boolean).join(" ").toLowerCase().includes(keyword);
  });
  const checkinPagination = useDataPagination(visibleCheckinRecords, [activeTab, checkinPersonFilter, checkinDateFrom, checkinDateTo, visibleCheckinRecords.length].join("|"));
  const changeOrderPagination = useDataPagination(visibleChangeOrders, [activeTab, changeOrderFilter, visibleChangeOrders.length].join("|"));
  const logPagination = useDataPagination(filteredLogs, [activeTab, logFilter, logKeyword, logDateFrom, logDateTo].join("|"));
  const materialOrderPagination = useDataPagination(visibleMaterialOrders, [activeTab, materialCategoryFilter, visibleMaterialOrders.length].join("|"));
  const activeContract = signedContracts[0] || contracts[0] || null;
  const activePaymentPlans = activeContract ? paymentPlans.filter((plan: any) => plan.contract_id === activeContract.id) : paymentPlans;
  const activePaymentPlanIds = new Set(activePaymentPlans.map((item: any) => item.id));
  const activePaymentRecords = paymentRecords.filter((record: any) => activePaymentPlanIds.has(record.payment_plan_id));
  const contractAmount = Number(activeContract?.total_amount ?? selected?.contract_amount ?? 0) || 0;
  const contractContent = useMemo(() => activeContract?.content || {}, [activeContract]);
  const amountInfo = useMemo(() => contractContent.amount_info || {}, [contractContent]);
  const projectInfo = useMemo(() => contractContent.project_info || {}, [contractContent]);
  const siteCustomerArea = selected?.customer_area_size || selected?.area || projectInfo.area;
  const signedDurationDays = Number(projectInfo.duration_days || 0)
    || (projectInfo.planned_start && projectInfo.planned_end
      ? Math.max(0, Math.round(((parseAppDate(projectInfo.planned_end)?.getTime() || 0) - (parseAppDate(projectInfo.planned_start)?.getTime() || 0)) / 86400000) + 1)
      : 0);
  const makeHandoverScheduleDefaults = useCallback((handover?: any) => {
    const durationDays = Number(handover?.duration_days || signedDurationDays || projectInfo.duration_days || 0);
    const handoverScheduleSaved = Boolean(handover?.planned_start || handover?.planned_end);
    const projectScheduleSaved = Boolean(selected?.start_date || selected?.planned_end_date);
    const getTemplateText = (...values: any[]) => values.map((value) => String(value || "").trim()).find(Boolean) || "";
    const getTemplateCount = (...values: any[]) => {
      const value = values.find((item) => Number(item || 0) > 0);
      return toSafeCount(value);
    };
    const weekendConstruction = handoverScheduleSaved && handover?.weekend_construction !== undefined && handover?.weekend_construction !== null
      ? Boolean(handover.weekend_construction)
      : projectScheduleSaved && selected?.weekend_construction !== undefined && selected?.weekend_construction !== null
        ? Boolean(selected.weekend_construction)
        : Boolean(projectInfo.weekend_construction);
    const holidayConstruction = handoverScheduleSaved && handover?.holiday_construction !== undefined && handover?.holiday_construction !== null
      ? Boolean(handover.holiday_construction)
      : projectScheduleSaved && selected?.holiday_construction !== undefined && selected?.holiday_construction !== null
        ? Boolean(selected.holiday_construction)
        : Boolean(projectInfo.holiday_construction);
    const plannedStart = toDateOnlyInputValue(
      handover?.planned_start
      || selected?.start_date
      || projectInfo.planned_start
      || activeContract?.signed_at
      || activeContract?.created_at
    );
    const calculatedPlannedEnd = calculateSitePlannedEnd(plannedStart, durationDays, {
      weekendConstruction,
      holidayConstruction,
    });
    return {
      planned_start: plannedStart,
      planned_end: calculatedPlannedEnd || toDateOnlyInputValue(handover?.planned_end || selected?.planned_end_date || projectInfo.planned_end),
      duration_days: durationDays > 0 ? String(durationDays) : "",
      construction_template_id: getTemplateText(handover?.construction_template_id, selected?.construction_template_id, projectInfo.construction_template_id, projectInfo.constructionTemplateId),
      construction_template_name: getTemplateText(handover?.construction_template_name, selected?.construction_template_name, projectInfo.construction_template_name, projectInfo.constructionTemplateName),
      construction_template_description: getTemplateText(handover?.construction_template_description, selected?.construction_template_description, projectInfo.construction_template_description),
      construction_template_decoration_type: getTemplateText(handover?.construction_template_decoration_type, selected?.construction_template_decoration_type, projectInfo.construction_template_decoration_type),
      construction_template_duration_text: getTemplateText(handover?.construction_template_duration_text, selected?.construction_template_duration_text, projectInfo.construction_template_duration_text),
      construction_template_stage_count: getTemplateCount(handover?.construction_template_stage_count, selected?.construction_template_stage_count, projectInfo.construction_template_stage_count),
      construction_template_node_count: getTemplateCount(handover?.construction_template_node_count, selected?.construction_template_node_count, projectInfo.construction_template_node_count),
      construction_template_acceptance_count: getTemplateCount(handover?.construction_template_acceptance_count, selected?.construction_template_acceptance_count, projectInfo.construction_template_acceptance_count),
      weekend_construction: weekendConstruction,
      holiday_construction: holidayConstruction,
      has_floor_heating: handoverScheduleSaved && handover?.has_floor_heating !== undefined && handover?.has_floor_heating !== null
        ? Boolean(handover.has_floor_heating)
        : projectScheduleSaved && selected?.has_floor_heating !== undefined && selected?.has_floor_heating !== null
          ? Boolean(selected.has_floor_heating)
          : Boolean(projectInfo.has_floor_heating),
    };
  }, [activeContract, projectInfo, selected, signedDurationDays]);
  const selectedSiteStage = String(selected?.site_stage || "").trim().toUpperCase();
  const selectedStatus = String(selected?.status || "").trim().toUpperCase();
  const siteStageDisplay = siteStageLabels[selectedSiteStage] || statusLabels[selectedStatus] || selected?.site_stage || selected?.status || "-";
  const siteStartConfirmed = Boolean(
    selected
    && ["CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"].includes(selectedSiteStage),
  );
  const canShowConstructionPhase = selectedSiteStage === "CONSTRUCTION";
  let siteConstructionStage = selectedSiteStage === "PENDING_START"
    ? "待开工"
    : selectedSiteStage === "START_CONFIRM"
      ? "开工确认"
      : selectedSiteStage === "OWNER_SETTLEMENT"
        ? "业主结算"
        : selectedSiteStage === "SITE_SETTLEMENT"
          ? "工地结算"
          : phaseLabels[selected?.current_phase] || siteStageDisplay;
  const receivedPlanAmount = activePaymentRecords.reduce((sum: number, record: any) => sum + Number(record.amount || 0), 0);
  const depositReceivableAmount = activeDepositRecords.reduce((sum: number, record: any) => sum + getPaymentRecordReceivableAmount(record), 0);
  const receivedDepositAmount = activeDepositRecords.reduce((sum: number, record: any) => sum + getPaymentRecordActualReceivedAmount(record), 0);
  const depositUnreceivedAmount = Math.max(0, Math.round((depositReceivableAmount - receivedDepositAmount) * 100) / 100);
  const depositDeductAmount = amountInfo.deposit_deducted === false
    ? 0
    : Math.min(receivedDepositAmount, Math.max(0, Number(amountInfo.deposit_deduct_amount || 0) || 0));
  const depositUndeductedAmount = Math.max(0, Math.round((receivedDepositAmount - depositDeductAmount) * 100) / 100);
  const contractReceivableAfterDeposit = Math.max(0, Math.round((contractAmount - depositDeductAmount) * 100) / 100);
  const contractUnreceivedAmount = Math.max(0, Math.round((contractReceivableAfterDeposit - receivedPlanAmount) * 100) / 100);
  const changeReceivedAmount = 0;
  const changePendingAmount = Math.round((ownerConfirmedChangeAmount - changeReceivedAmount) * 100) / 100;
  const changeUnreceivedAmount = Math.max(0, changePendingAmount);
  const changeOffsetAmount = Math.max(0, -changePendingAmount);
  const receivedAmount = receivedPlanAmount + receivedDepositAmount + designFeeReceivedAmount + changeReceivedAmount;
  const receivableAmount = Math.max(0, Math.round((contractUnreceivedAmount + depositUnreceivedAmount + designFeeUnreceivedAmount + changePendingAmount - depositUndeductedAmount) * 100) / 100);
  const receivedRateBaseAmount = Math.max(0, Math.round((contractAmount + ownerConfirmedChangeAmount) * 100) / 100);
  const receivedRate = receivedRateBaseAmount > 0 ? Math.min(100, Math.round((receivedAmount / receivedRateBaseAmount) * 100)) : 0;
  const receivedByPlan = activePaymentRecords.reduce((acc: Record<string, number>, record: any) => {
    acc[record.payment_plan_id] = (acc[record.payment_plan_id] || 0) + Number(record.amount || 0);
    return acc;
  }, {});
  const activeContractPaymentStages = Array.isArray(amountInfo.payment_stages) ? amountInfo.payment_stages : [];
  const paymentStageRows = (activePaymentPlans.length > 0
    ? activePaymentPlans.map((plan: any, index: number) => {
        const expected = Math.max(0, Number(plan.amount || 0) || 0);
        const received = Math.max(0, Number(receivedByPlan[plan.id] || 0) || 0);
        const unpaid = Math.max(0, expected - received);
        const isPaid = expected <= 0 || unpaid <= 0.005 || plan.status === "PAID";
        const status = isPaid ? "已收" : received > 0 ? "部分收款" : plan.due_date && isOverdue(plan.due_date) ? "逾期未收" : "待收";
        const tone = isPaid ? "green" : received > 0 ? "amber" : plan.due_date && isOverdue(plan.due_date) ? "red" : "gray";
        return {
          id: plan.id,
          index: index + 1,
          milestone: plan.milestone || `第${index + 1}期款`,
          dueDate: plan.due_date || "",
          expected,
          received: Math.min(expected, received),
          unpaid: isPaid ? 0 : unpaid,
          status,
          tone,
        };
      })
    : activeContractPaymentStages.map((stage: any, index: number) => {
        const expected = Math.max(0, Number(stage.amount || 0) || 0);
        return {
          id: `stage_${index}`,
          index: index + 1,
          milestone: stage.name || `第${index + 1}期款`,
          dueDate: stage.due_date || "",
          expected,
          received: 0,
          unpaid: expected,
          status: expected > 0 ? "待收" : "无需收款",
          tone: "gray",
        };
      }));
  const hasManualAdvisor = customerTeam.some((member: any) => String(member.role || "").toUpperCase() === "ADVISOR");
  const advisorSourceMember = siteAdvisorName
    ? customerTeam.find((member: any) => String(member.user_name || "").trim() === String(siteAdvisorName).trim())
    : null;
  const fallbackAdvisorMember = !hasManualAdvisor && siteAdvisorName ? {
    id: `ADVISOR_${selected?.customer_id || selected?.id}`,
    customer_id: selected?.customer_id,
    role: "ADVISOR",
    user_name: siteAdvisorName,
    user_avatar: advisorSourceMember?.user_avatar || selected?.customer_advisor_avatar || selected?.customer_inviter_avatar || selected?.customer_created_by_avatar || "",
    user_phone: advisorSourceMember?.user_phone || "",
    org_unit_name: advisorSourceMember?.org_unit_name || "",
    org_unit_type: advisorSourceMember?.org_unit_type || "",
    is_default_advisor: true,
  } : null;
  const serviceTeam = [
    ...(fallbackAdvisorMember ? [fallbackAdvisorMember] : []),
    ...customerTeam,
    ...(selected?.manager_name ? [{
      id: `PM_${selected.id}`,
      role: "PM",
      user_name: selected.manager_name,
      user_avatar: selected.manager_avatar,
      user_phone: selected.manager_phone,
      org_unit_name: selected.manager_org_unit_name,
      org_unit_type: selected.manager_org_unit_type,
      is_project_manager: true,
    }] : []),
  ]
    .filter((member, index, array) => array.findIndex((item) => `${item.role}_${item.user_name || item.user_id}` === `${member.role}_${member.user_name || member.user_id}`) === index)
    .sort((a, b) => (teamRoleOrder[a.role] ?? 99) - (teamRoleOrder[b.role] ?? 99));
  const allReceiptRecords = [
    ...activePaymentRecords.map((record: any) => ({
      id: record.id,
      category: "合同款",
      title: record.pay_method || "合同收款",
      amount: Number(record.amount || 0),
      date: record.pay_date || record.created_at,
      method: record.pay_method || "-",
      note: record.notes || record.receipt_no || "",
      operator: record.user_name || "-",
    })),
    ...depositRecords
      .filter((record: any) => record.status === "received")
      .map((record: any) => ({
        id: record.id,
        category: "定金",
        title: record.method === "qr" ? "扫码定金" : record.payment_channel || "定金收款",
        amount: getPaymentRecordActualReceivedAmount(record),
        date: record.received_at || record.created_at,
        method: record.method === "qr" ? "扫码支付" : record.payment_channel || "-",
        note: record.deposit_type || record.notes || "",
        operator: record.receiver_name || record.created_by_name || "-",
      })),
    ...activeDesignFeeRecords
      .filter((record: any) => record.status === "received")
      .map((record: any) => ({
        id: record.id,
        category: "设计费",
        title: record.method === "qr" ? "扫码设计费" : record.payment_channel || "设计费收款",
        amount: getPaymentRecordActualReceivedAmount(record),
        date: record.received_at || record.created_at,
        method: record.method === "qr" ? "扫码支付" : record.payment_channel || "-",
        note: record.deposit_type || record.notes || "",
        operator: record.receiver_name || record.created_by_name || "-",
      })),
  ]
    .filter((record) => Number(record.amount || 0) > 0)
    .sort((a, b) => getTimeValue(b.date) - getTimeValue(a.date));
  const receiptTimeline = allReceiptRecords
    .sort((a, b) => getTimeValue(b.date) - getTimeValue(a.date))
    .slice(0, 3);
  const allReceiptAmount = allReceiptRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const filteredConstructionTemplateOptions = useMemo(() => {
    const keyword = constructionTemplateSearch.trim().toLowerCase();
    if (!keyword) return constructionTemplateOptions;
    return constructionTemplateOptions.filter((template) => (
      [
        template.name,
        template.description,
        template.decorationType,
        template.durationText,
        `${template.stageCount}`,
        `${template.nodeCount}`,
      ].some((value) => String(value || "").toLowerCase().includes(keyword))
    ));
  }, [constructionTemplateOptions, constructionTemplateSearch]);
  const selectedHandoverConstructionTemplate = constructionTemplateOptions.find((template) => (
    (handoverForm.construction_template_id && template.id === handoverForm.construction_template_id)
    || (!handoverForm.construction_template_id && handoverForm.construction_template_name && template.name === handoverForm.construction_template_name)
  )) || (handoverForm.construction_template_name ? {
    id: handoverForm.construction_template_id,
    name: handoverForm.construction_template_name,
    description: handoverForm.construction_template_description,
    decorationType: handoverForm.construction_template_decoration_type,
    stageCount: toSafeCount(handoverForm.construction_template_stage_count),
    nodeCount: toSafeCount(handoverForm.construction_template_node_count),
    acceptanceCount: toSafeCount(handoverForm.construction_template_acceptance_count),
    durationText: handoverForm.construction_template_duration_text,
    isDefault: false,
    durationRules: [],
    stages: [],
  } : null);
  const internalDurationSummary = getInternalDurationSummary(selectedHandoverConstructionTemplate, siteCustomerArea);
  const internalRegularDurationDays = internalDurationSummary.regularDays;
  const internalFloorHeatingDurationDays = internalDurationSummary.floorHeatingDays;
  const internalDurationDays = handoverForm.has_floor_heating ? internalFloorHeatingDurationDays : internalRegularDurationDays;
  const internalDurationText = internalDurationDays > 0
    ? `${internalDurationDays}天${handoverForm.has_floor_heating ? "（有地暖）" : "（无地暖）"}`
    : selectedHandoverConstructionTemplate?.durationRules.length
      ? "待填写面积"
      : "待计算";
  const internalDurationTitle = internalDurationDays > 0
    ? `根据施工模板、当前面积${internalDurationSummary.areaValue || "-"}㎡${internalDurationSummary.areaRangeText ? `（匹配${internalDurationSummary.areaRangeText}）` : ""}、${handoverForm.has_floor_heating ? "有地暖" : "无地暖"}计算；无地暖${internalRegularDurationDays || "-"}天，有地暖${internalFloorHeatingDurationDays || "-"}天`
    : "选择施工模板并确认工地面积后自动计算";
  const constructionPlanStart = toDateOnlyInputValue(
    currentHandover?.planned_start
    || selected?.start_date
    || projectInfo.planned_start
    || handoverForm.planned_start,
  );
  const constructionPlanCompleted = Boolean(
    handoverCompleted
    || (selected?.start_date && selected?.construction_template_id && String(selected?.site_stage || "") !== "PENDING_START"),
  );
  const constructionPlanWeekendConstruction = currentHandover?.planned_start
    ? Boolean(currentHandover.weekend_construction)
    : selected?.start_date
      ? Boolean(selected.weekend_construction)
      : Boolean(projectInfo.weekend_construction || handoverForm.weekend_construction);
  const constructionPlanHolidayConstruction = currentHandover?.planned_start
    ? Boolean(currentHandover.holiday_construction)
    : selected?.start_date
      ? Boolean(selected.holiday_construction)
      : Boolean(projectInfo.holiday_construction || handoverForm.holiday_construction);
  const constructionPlanHasFloorHeating = currentHandover?.planned_start
    ? Boolean(currentHandover.has_floor_heating)
    : selected?.start_date
      ? Boolean(selected.has_floor_heating)
      : Boolean(projectInfo.has_floor_heating || handoverForm.has_floor_heating);
  const constructionPlan = buildConstructionPlan({
    template: selectedHandoverConstructionTemplate,
    plannedStart: constructionPlanStart,
    area: siteCustomerArea,
    hasFloorHeating: constructionPlanHasFloorHeating,
    weekendConstruction: constructionPlanWeekendConstruction,
    holidayConstruction: constructionPlanHolidayConstruction,
    phases,
    tasks,
  });
  const constructionPlanReady = constructionPlanCompleted && Boolean(selectedHandoverConstructionTemplate && constructionPlanStart);
  const scheduleContentLoading = activeTab === "schedule" && (scheduleTabOpening || constructionTemplateLoading);
  const constructionPlanTitle = `${siteDisplayName || "工地"}施工计划图`;
  const constructionPlanRangeText = constructionPlanStart && constructionPlan.planEnd
    ? `${formatDate(constructionPlanStart)} - ${formatDate(constructionPlan.planEnd)}`
    : "-";
  const exportConstructionPlanXlsx = async () => {
    if (exportingConstructionPlan) return;
    if (!constructionPlanReady || constructionPlan.rows.length === 0 || constructionPlan.dateColumns.length === 0) {
      setConstructionPlanExportMessage("施工计划生成后才能导出表格");
      return;
    }

    setExportingConstructionPlan(true);
    setConstructionPlanExportMessage("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "着急科技";
      workbook.created = new Date();

      const totalColumns = 4 + constructionPlan.dateColumns.length;
      const dateStartColumn = 5;
      const safeSheetName = toSafeFileName(constructionPlanTitle).replace(/[\[\]]/g, "_").slice(0, 31) || "施工计划";
      const worksheet = workbook.addWorksheet(safeSheetName, {
        views: [{ state: "frozen", xSplit: 4, ySplit: 5 }],
      });

      worksheet.pageSetup = {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
      };
      worksheet.properties.defaultRowHeight = 16;
      worksheet.columns = [
        { width: 14 },
        { width: 22 },
        { width: 18 },
        { width: 8 },
        ...constructionPlan.dateColumns.map(() => ({ width: 4.6 })),
      ];

      const borderColor = { argb: "FFDCE8F8" };
      const headerFontColor = { argb: "FF162033" };
      const mutedFontColor = { argb: "FF52647B" };
      const whiteFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } } as any;
      const softFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FBFF" } } as any;
      const plannedFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7B500" } } as any;
      const actualFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF55B947" } } as any;
      const nonWorkingFill = {
        type: "pattern",
        pattern: "darkDown",
        fgColor: { argb: "FF94A3B8" },
        bgColor: { argb: "FFF1F5F9" },
      } as any;
      const thinBorder = {
        top: { style: "thin", color: borderColor },
        left: { style: "thin", color: borderColor },
        bottom: { style: "thin", color: borderColor },
        right: { style: "thin", color: borderColor },
      } as any;
      const centerAlignment = { vertical: "middle", horizontal: "center", wrapText: true } as any;

      const styleCell = (cell: any, fill = whiteFill) => {
        cell.border = thinBorder;
        cell.fill = fill;
        cell.alignment = centerAlignment;
        cell.font = { name: "Microsoft YaHei", size: 10, color: headerFontColor };
      };

      worksheet.mergeCells(1, 1, 1, totalColumns);
      const titleCell = worksheet.getCell(1, 1);
      titleCell.value = constructionPlanTitle;
      titleCell.font = { name: "Microsoft YaHei", size: 16, bold: true, color: headerFontColor };
      titleCell.alignment = centerAlignment;
      titleCell.fill = whiteFill;

      worksheet.mergeCells(2, 1, 2, totalColumns);
      const metaCell = worksheet.getCell(2, 1);
      metaCell.value = `施工模板：${selectedHandoverConstructionTemplate?.name || "未选择"}    计划周期：${constructionPlanRangeText}    施工规则：${constructionPlanWeekendConstruction ? "周末施工" : "周末不施工"} / ${constructionPlanHolidayConstruction ? "节假日施工" : "节假日不施工"} / ${constructionPlanHasFloorHeating ? "有地暖" : "无地暖"}`;
      metaCell.font = { name: "Microsoft YaHei", size: 10, color: mutedFontColor };
      metaCell.alignment = centerAlignment;
      metaCell.fill = softFill;

      worksheet.mergeCells(3, 1, 3, totalColumns);
      const legendCell = worksheet.getCell(3, 1);
      legendCell.value = "图例：黄色为计划完成时间，绿色为实际完成时间；每个工序上半行是计划，下半行是实际；灰色斜线为非施工日期。";
      legendCell.font = { name: "Microsoft YaHei", size: 10, color: mutedFontColor };
      legendCell.alignment = centerAlignment;
      legendCell.fill = whiteFill;

      [1, 2, 3].forEach((rowNumber) => {
        worksheet.getRow(rowNumber).height = rowNumber === 1 ? 28 : 22;
        for (let columnNumber = 1; columnNumber <= totalColumns; columnNumber += 1) {
          const cell = worksheet.getCell(rowNumber, columnNumber);
          cell.border = thinBorder;
          if (!cell.fill) cell.fill = rowNumber === 2 ? softFill : whiteFill;
        }
      });

      ["施工阶段", "工序节点", "起/止时间", "工期"].forEach((label, index) => {
        const columnNumber = index + 1;
        worksheet.mergeCells(4, columnNumber, 5, columnNumber);
        const cell = worksheet.getCell(4, columnNumber);
        cell.value = label;
        styleCell(cell, whiteFill);
        cell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: headerFontColor };
      });

      let monthColumn = dateStartColumn;
      constructionPlan.monthGroups.forEach((group) => {
        const startColumn = monthColumn;
        const endColumn = monthColumn + group.colSpan - 1;
        worksheet.mergeCells(4, startColumn, 4, endColumn);
        const cell = worksheet.getCell(4, startColumn);
        cell.value = group.label;
        styleCell(cell, whiteFill);
        cell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: headerFontColor };
        monthColumn = endColumn + 1;
      });

      constructionPlan.dateColumns.forEach((date, index) => {
        const columnNumber = dateStartColumn + index;
        const nonWorkingDate = !isSiteWorkingDate(date, {
          weekendConstruction: constructionPlanWeekendConstruction,
          holidayConstruction: constructionPlanHolidayConstruction,
        });
        const cell = worksheet.getCell(5, columnNumber);
        cell.value = date.getDate();
        styleCell(cell, nonWorkingDate ? nonWorkingFill : whiteFill);
        cell.font = { name: "Microsoft YaHei", size: 9, color: { argb: nonWorkingDate ? "FF52647B" : "FF4B5F7A" } };
      });

      [4, 5].forEach((rowNumber) => {
        worksheet.getRow(rowNumber).height = rowNumber === 4 ? 20 : 22;
        for (let columnNumber = 1; columnNumber <= totalColumns; columnNumber += 1) {
          const cell = worksheet.getCell(rowNumber, columnNumber);
          cell.border = thinBorder;
          cell.alignment = centerAlignment;
          if (!cell.fill) cell.fill = whiteFill;
        }
      });

      let rowNumber = 6;
      constructionPlan.rows.forEach((row) => {
        const planRowNumber = rowNumber;
        const actualRowNumber = rowNumber + 1;
        if (row.stageRowSpan > 0) {
          const stageEndRow = planRowNumber + row.stageRowSpan * 2 - 1;
          worksheet.mergeCells(planRowNumber, 1, stageEndRow, 1);
          const stageCell = worksheet.getCell(planRowNumber, 1);
          stageCell.value = row.stageName;
          styleCell(stageCell, whiteFill);
          stageCell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: "FF374151" } };
        }

        worksheet.mergeCells(planRowNumber, 2, actualRowNumber, 2);
        worksheet.mergeCells(planRowNumber, 3, actualRowNumber, 3);
        worksheet.mergeCells(planRowNumber, 4, actualRowNumber, 4);
        const nodeCell = worksheet.getCell(planRowNumber, 2);
        const rangeCell = worksheet.getCell(planRowNumber, 3);
        const daysCell = worksheet.getCell(planRowNumber, 4);
        nodeCell.value = row.nodeName;
        rangeCell.value = formatConstructionPlanDateRange(row.plannedStart, row.plannedEnd);
        daysCell.value = row.plannedDays;
        [nodeCell, rangeCell, daysCell].forEach((cell) => {
          styleCell(cell, whiteFill);
          cell.font = { name: "Microsoft YaHei", size: 10, bold: cell === daysCell, color: { argb: "FF374151" } };
        });

        constructionPlan.dateColumns.forEach((date, index) => {
          const columnNumber = dateStartColumn + index;
          const dateKey = formatDateOnly(date);
          const nonWorkingDate = !isSiteWorkingDate(date, {
            weekendConstruction: constructionPlanWeekendConstruction,
            holidayConstruction: constructionPlanHolidayConstruction,
          });
          const plannedActive = dateKey >= row.plannedStart
            && dateKey <= row.plannedEnd
            && !nonWorkingDate;
          const actualActive = Boolean(row.actualStart && row.actualEnd && dateKey >= row.actualStart && dateKey <= row.actualEnd);
          const planCell = worksheet.getCell(planRowNumber, columnNumber);
          const actualCell = worksheet.getCell(actualRowNumber, columnNumber);
          styleCell(planCell, plannedActive ? plannedFill : whiteFill);
          styleCell(actualCell, actualActive ? actualFill : whiteFill);
        });

        worksheet.getRow(planRowNumber).height = 12;
        worksheet.getRow(actualRowNumber).height = 12;
        rowNumber += 2;
      });

      for (let styledRow = 6; styledRow < rowNumber; styledRow += 1) {
        for (let columnNumber = 1; columnNumber <= totalColumns; columnNumber += 1) {
          const cell = worksheet.getCell(styledRow, columnNumber);
          cell.border = thinBorder;
          cell.alignment = centerAlignment;
          if (!cell.fill) cell.fill = whiteFill;
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${toSafeFileName(constructionPlanTitle)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (selected?.id) {
        void fetch("/api/site", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
          body: JSON.stringify({
            action: "record_construction_plan_export",
            project_id: selected.id,
            file_name: `${toSafeFileName(constructionPlanTitle)}.xlsx`,
            template_name: selectedHandoverConstructionTemplate?.name || "",
            plan_range: constructionPlanRangeText,
          }),
        }).catch(() => undefined);
      }
      setConstructionPlanExportMessage("施工计划表格已生成");
    } catch (error) {
      console.error(error);
      setConstructionPlanExportMessage("导出失败，请稍后重试");
    } finally {
      setExportingConstructionPlan(false);
    }
  };
  const constructionTemplateStages = getConstructionPlanStages(selectedHandoverConstructionTemplate);
  const hasConstructionTemplateStages = Boolean(selectedHandoverConstructionTemplate && constructionTemplateStages.length > 0);
  const matchedCurrentTemplateStage = findTemplateStageByValue(constructionTemplateStages, selected?.current_phase) || constructionTemplateStages[0] || null;
  const legacyCurrentPhaseKey = selected?.current_phase || phaseOptions[0]?.[0] || "";
  const currentPhaseKey = matchedCurrentTemplateStage?.id || legacyCurrentPhaseKey;
  const currentPhaseLabel = matchedCurrentTemplateStage?.name || getConstructionStageDisplayLabel(currentPhaseKey, siteStageDisplay);
  if (canShowConstructionPhase) {
    siteConstructionStage = currentPhaseLabel !== "-" ? currentPhaseLabel : siteConstructionStage;
  }
  const currentPhaseRecord = matchedCurrentTemplateStage
    ? phases.find((item: any) => isMatchingPlanPhase(matchedCurrentTemplateStage, item)) || null
    : phases.find((item: any) => item.phase === currentPhaseKey) || null;
  const currentPhaseTasks = currentPhaseRecord
    ? tasks.filter((task: any) => task.phase_id === currentPhaseRecord.id)
    : [];
  const templatePhaseOptions = constructionTemplateStages.map((stage) => ({ value: stage.id, label: stage.name, stage }));
  const phaseSelectOptions = [
    ...templatePhaseOptions,
    ...phaseOptions
      .filter(([value, label]) => !templatePhaseOptions.some((item) => phaseTextMatches(item.stage, value, value, label) || phaseTextMatches(item.stage, label, value, label)))
      .map(([value, label]) => ({ value, label, stage: null as ConstructionTemplateStageOption | null })),
  ];
  const getDisplayPhaseLabel = (value: unknown) => {
    const matched = findTemplateStageByValue(constructionTemplateStages, value);
    if (matched) return matched.name;
    return getConstructionStageDisplayLabel(value);
  };
  const getPhaseFiles = (stage: ConstructionTemplateStageOption | null, key: string, label: string) => attachments.filter((file) => {
    const category = String(file.category || "");
    return category === `施工阶段-${key}`
      || category.startsWith(`施工节点-${key}-`)
      || (stage ? category.startsWith(`施工节点-${stage.id}-`) : false)
      || category === label
      || phaseTextMatches(stage, category, key, label);
  });
  const getPhaseIssues = (stage: ConstructionTemplateStageOption | null, key: string, label: string, source = inspections) => source.filter((issue: any) => {
    const text = `${issue.title || ""} ${issue.category || ""} ${issue.result || ""}`;
    return phaseTextMatches(stage, text, key, label);
  });
  const getPhaseLogs = (stage: ConstructionTemplateStageOption | null, key: string, label: string) => logs.filter((log: any) => {
    const text = `${log.phase || ""} ${log.content || ""} ${log.completed_work || ""} ${log.safety_notes || ""}`;
    return phaseTextMatches(stage, text, key, label);
  });
  const buildCustomTaskPhaseNodeRow = (
    task: any,
    index: number,
    stage: ConstructionTemplateStageOption | null,
  ): PhaseNodeRow => {
    const nodeType = getConstructionTaskNodeType(task);
    const status = String(task.status || "PENDING").toUpperCase();
    const description = task.description || task.notes || (nodeType === "acceptance" ? "按现场实际情况进行验收确认。" : "按现场实际情况进行施工。");
    return {
      id: String(task.id || `custom-node-${index}`),
      index,
      stage,
      templateNode: null,
      nodeType,
      name: task.name || (nodeType === "acceptance" ? `验收节点 ${index + 1}` : `施工节点 ${index + 1}`),
      owner: task.assignee_name || (nodeType === "acceptance" ? "项目经理/监理" : selected?.manager_name || "项目经理"),
      acceptance: description,
      standardItems: description
        ? [{
          id: `${task.id || index}_standard`,
          description,
          images: [],
          required: true,
          photoRequired: nodeType === "acceptance",
        }]
        : [],
      standardImages: [],
      logBroadcastScripts: description ? [description] : [],
      photoRequired: true,
      customerConfirmRequired: false,
      projectManagerConfirmRequired: nodeType === "acceptance",
      status,
      plannedStart: task.planned_start || "",
      plannedEnd: task.planned_end || "",
      plannedDays: 0,
      actualStart: status === "COMPLETED" ? task.actual_start || "" : "",
      actualEnd: status === "COMPLETED" ? task.actual_end || "" : "",
      priority: task.priority || "MEDIUM",
      fromTask: true,
    };
  };
  const buildTemplatePhaseNodeRows = (stage: ConstructionTemplateStageOption): PhaseNodeRow[] => {
    const phase = phases.find((item: any) => isMatchingPlanPhase(stage, item)) || null;
    const phaseTasks = phase ? tasks.filter((task: any) => task.phase_id === phase.id) : [];
    const templateRows = stage.nodes.map((node, index) => {
      const task = findConstructionPlanTask(stage, node, phases, tasks);
      const planRow = constructionPlan.rows.find((row) => row.stageId === stage.id && normalizePlanText(row.nodeName) === normalizePlanText(node.name));
      const standard = getNodeStandard(node);
      const status = String(task?.status || "").toUpperCase() || "PENDING";
      return {
        id: `${stage.id}-${node.id}`,
        index,
        stage,
        templateNode: node,
        nodeType: node.type,
        name: node.name,
        owner: task?.assignee_name || (node.type === "acceptance" ? "项目经理/监理" : selected?.manager_name || "项目经理"),
        acceptance: getNodeStandardText(node),
        standardItems: standard.standards,
        standardImages: standard.images,
        logBroadcastScripts: node.logBroadcastScripts || [],
        photoRequired: node.photoRequired,
        customerConfirmRequired: node.customerConfirmRequired,
        projectManagerConfirmRequired: node.projectManagerConfirmRequired,
        status,
        plannedStart: task?.planned_start || planRow?.plannedStart || "",
        plannedEnd: task?.planned_end || planRow?.plannedEnd || "",
        plannedDays: planRow?.plannedDays || getConstructionNodeDurationDays(selectedHandoverConstructionTemplate, stage, node, siteCustomerArea, constructionPlanHasFloorHeating),
        actualStart: status === "COMPLETED" ? task?.actual_start || planRow?.actualStart || "" : "",
        actualEnd: status === "COMPLETED" ? task?.actual_end || planRow?.actualEnd || "" : "",
        priority: task?.priority || "MEDIUM",
        fromTask: Boolean(task),
      };
    });
    const templateNodeNames = new Set(stage.nodes.map((node) => normalizePlanText(node.name)));
    const customRows = phaseTasks
      .filter((task: any) => !templateNodeNames.has(normalizePlanText(task.name)))
      .map((task: any, index: number) => buildCustomTaskPhaseNodeRow(task, templateRows.length + index, stage));
    return [...templateRows, ...customRows];
  };
  const currentPhaseFallbackNodes = phaseNodeTemplates[currentPhaseKey] || [];
  const currentPhaseFiles = getPhaseFiles(matchedCurrentTemplateStage, currentPhaseKey, currentPhaseLabel);
  const phaseOverviewRows = hasConstructionTemplateStages
    ? constructionTemplateStages.map((stage, index) => {
      const nodeRows = buildTemplatePhaseNodeRows(stage);
      const nodeCount = nodeRows.length;
      const doneCount = nodeRows.filter((node) => ["COMPLETED", "SKIPPED"].includes(String(node.status || "").toUpperCase())).length;
      const reviewCount = nodeRows.filter((node) => node.status === "REVIEW").length;
      const inProgressCount = nodeRows.filter((node) => node.status === "IN_PROGRESS").length;
      const phase = phases.find((item: any) => isMatchingPlanPhase(stage, item)) || null;
      const files = getPhaseFiles(stage, stage.id, stage.name);
      const issues = getPhaseIssues(stage, stage.id, stage.name, openIssues);
      const isCurrent = currentPhaseKey === stage.id;
      const status = doneCount >= nodeCount && nodeCount > 0
        ? "COMPLETED"
        : reviewCount > 0
          ? "REVIEW"
          : inProgressCount > 0 || isCurrent
            ? "IN_PROGRESS"
            : "PENDING";
      const progress = nodeCount > 0 ? Math.round((doneCount / nodeCount) * 100) : 0;
      return { key: stage.id, label: stage.name, index, phase, stage, status, isCurrent, nodeCount, doneCount, progress, files, issues };
    })
    : phaseOptions.map(([key, label], index) => {
      const phase = phases.find((item: any) => item.phase === key);
      const phaseTasks = tasks.filter((task: any) => task.phase_id === phase?.id);
      const templateNodes = phaseNodeTemplates[key] || [];
      const nodeCount = phaseTasks.length || templateNodes.length;
      const doneCount = phaseTasks.length
        ? phaseTasks.filter((task: any) => ["COMPLETED", "SKIPPED"].includes(String(task.status || "").toUpperCase())).length
        : phase?.status === "COMPLETED"
          ? templateNodes.length
          : 0;
      const files = getPhaseFiles(null, key, label);
      const issues = getPhaseIssues(null, key, label, openIssues);
      const isCurrent = currentPhaseKey === key;
      const status = phase?.status || (isCurrent ? "IN_PROGRESS" : doneCount >= nodeCount && nodeCount > 0 ? "COMPLETED" : "PENDING");
      const progress = nodeCount > 0 ? Math.round((doneCount / nodeCount) * 100) : 0;
      return { key, label, index, phase, stage: null as ConstructionTemplateStageOption | null, status, isCurrent, nodeCount, doneCount, progress, files, issues };
    });
  const currentPhaseOpenIssues = getPhaseIssues(matchedCurrentTemplateStage, currentPhaseKey, currentPhaseLabel, openIssues);
  const currentPhaseLogs = getPhaseLogs(matchedCurrentTemplateStage, currentPhaseKey, currentPhaseLabel).slice(0, 4);
  const phaseNodeRows: PhaseNodeRow[] = matchedCurrentTemplateStage
    ? buildTemplatePhaseNodeRows(matchedCurrentTemplateStage)
    : currentPhaseTasks.length > 0
      ? currentPhaseTasks.map((task: any, index: number) => buildCustomTaskPhaseNodeRow(task, index, null))
      : currentPhaseFallbackNodes.map((node, index) => ({
        id: `${currentPhaseKey}_${index}`,
        index,
        stage: null,
        templateNode: null,
        nodeType: "construction" as const,
        name: node.name,
        owner: node.owner,
        acceptance: node.acceptance,
        standardItems: [{
          id: `${currentPhaseKey}_${index}_standard`,
          description: node.acceptance,
          images: [],
          required: true,
          photoRequired: true,
        }],
        standardImages: [],
        logBroadcastScripts: [],
        photoRequired: true,
        customerConfirmRequired: false,
        projectManagerConfirmRequired: false,
        status: currentPhaseRecord?.status === "COMPLETED" ? "COMPLETED" : "PENDING",
        plannedStart: "",
        plannedEnd: "",
        plannedDays: 0,
        actualStart: "",
        actualEnd: "",
        priority: "MEDIUM",
        fromTask: false,
      }));
  const phaseDoneNodeCount = phaseNodeRows.filter((node) => ["COMPLETED", "SKIPPED"].includes(String(node.status || "").toUpperCase())).length;
  const phaseNodeProgress = phaseNodeRows.length > 0 ? Math.round((phaseDoneNodeCount / phaseNodeRows.length) * 100) : 0;
  const templateTotalNodeCount = phaseOverviewRows.reduce((sum, row) => sum + row.nodeCount, 0);
  const templateDoneNodeCount = phaseOverviewRows.reduce((sum, row) => sum + row.doneCount, 0);
  const templateOverallProgress = templateTotalNodeCount > 0 ? Math.round((templateDoneNodeCount / templateTotalNodeCount) * 100) : Number(selected?.progress || 0);
  const selectedPhaseNode = phaseNodeRows.find((node) => node.id === selectedPhaseNodeId) || phaseNodeRows[0] || null;
  const phaseNodeModalNode = phaseNodeModal ? phaseNodeRows.find((node) => node.id === phaseNodeModal.nodeId) || selectedPhaseNode : null;
  const phaseNodeModalStatusMeta = getPhaseNodeStatusMeta(phaseNodeModalNode?.status, phaseNodeModalNode?.nodeType || "construction");
  const phaseNodeModalAdvanceAction = phaseNodeModalNode ? getPhaseNodeAdvanceAction(phaseNodeModalNode) : null;
  const phaseReviewingNodeCount = phaseNodeRows.filter((node) => String(node.status || "").toUpperCase() === "REVIEW").length;
  const phaseInProgressNodeCount = phaseNodeRows.filter((node) => String(node.status || "").toUpperCase() === "IN_PROGRESS").length;
  const getPhaseNodeUploadCategory = (node?: PhaseNodeRow | null) => {
    if (!node) return `施工阶段-${currentPhaseKey}`;
    const stageKey = node.stage?.id || currentPhaseKey;
    const nodeKey = node.templateNode?.id || node.id;
    return `施工节点-${stageKey}-${nodeKey}`;
  };
  const getPhaseNodeFiles = (node?: PhaseNodeRow | null) => {
    if (!node) return [];
    const category = getPhaseNodeUploadCategory(node);
    return attachments.filter((file) => String(file.category || "") === category);
  };
  const getPhaseNodeStageLogs = (node?: PhaseNodeRow | null) => {
    if (!node) return [];
    const stageKey = node.stage?.id || currentPhaseKey;
    const stageLabel = node.stage?.name || currentPhaseLabel;
    return logs
      .filter((log: any) => {
        const phase = String(log.stage_id || log.phase || "").trim();
        const stageName = String(log.stage_name || "").trim();
        const text = `${log.stage_id || ""} ${log.stage_name || ""} ${log.phase || ""} ${log.content || ""} ${log.completed_work || ""} ${log.safety_notes || ""}`;
        return phase === stageKey
          || stageName === stageLabel
          || phaseTextMatches(node.stage, phase, stageKey, stageLabel)
          || phaseTextMatches(node.stage, text, stageKey, stageLabel);
      })
      .sort((a: any, b: any) => getTimeValue(b.log_date || b.created_at) - getTimeValue(a.log_date || a.created_at));
  };
  const getPhaseNodeExactLogs = (node?: PhaseNodeRow | null) => {
    if (!node) return [];
    const nodeId = String(node.templateNode?.id || "").trim();
    const nodeName = normalizePlanText(node.name);
    if (!nodeId && !nodeName) return [];
    return getPhaseNodeStageLogs(node).filter((log: any) => {
      const logNodeId = String(log.node_id || "").trim();
      const logNodeName = normalizePlanText(log.node_name);
      if (logNodeId || logNodeName) {
        return Boolean(
          (logNodeId && nodeId && logNodeId === nodeId)
          || (logNodeName && nodeName && logNodeName === nodeName),
        );
      }
      const text = normalizePlanText([
        log.content,
        log.completed_work,
        log.material_notes,
        log.quality_notes,
        log.safety_notes,
        log.issue_notes,
        log.next_plan,
      ].filter(Boolean).join(" "));
      return text.includes(nodeName);
    });
  };
  const getPhaseNodeEventLogs = (node?: PhaseNodeRow | null) => {
    if (!node) return [];
    const nodeId = String(node.templateNode?.id || "").trim();
    const nodeNameKey = normalizePlanText(node.name);
    const stageId = String(node.stage?.id || currentPhaseKey || "").trim();
    const stageNameKey = normalizePlanText(node.stage?.name || currentPhaseLabel);
    const matchedLogIds = new Set(
      constructionRecordEvents
        .filter((event: any) => String(event.source_type || "") === "daily_log" && String(event.source_id || "").trim())
        .filter((event: any) => {
          const eventStageId = String(event.stage_id || "").trim();
          const eventStageName = normalizePlanText(event.stage_name);
          const eventNodeId = String(event.node_id || "").trim();
          const eventNodeName = normalizePlanText(event.node_name);
          const stageMatches = (!eventStageId && !eventStageName)
            || eventStageId === stageId
            || (eventStageName && eventStageName === stageNameKey);
          const nodeMatches = (eventNodeId && nodeId && eventNodeId === nodeId)
            || (eventNodeName && nodeNameKey && eventNodeName === nodeNameKey);
          return stageMatches && nodeMatches;
        })
        .map((event: any) => String(event.source_id || "")),
    );
    if (matchedLogIds.size === 0) return [];
    return logs.filter((log: any) => matchedLogIds.has(String(log.id || "")));
  };
  const getPhaseNodeRecordLogs = (node?: PhaseNodeRow | null) => {
    const byId = new Map<string, any>();
    [...getPhaseNodeExactLogs(node), ...getPhaseNodeEventLogs(node)].forEach((log: any, index) => {
      byId.set(String(log.id || `${log.log_date || ""}-${log.created_at || ""}-${index}`), log);
    });
    return Array.from(byId.values())
      .sort((a: any, b: any) => getTimeValue(b.log_date || b.created_at) - getTimeValue(a.log_date || a.created_at));
  };
  const phaseNodeModalFiles = getPhaseNodeFiles(phaseNodeModalNode);
  const phaseNodeModalRecordLogs = getPhaseNodeRecordLogs(phaseNodeModalNode);
  const phaseNodeModalRecordPhotoCount = phaseNodeModalRecordLogs.reduce((sum: number, log: any) => sum + (Array.isArray(log.photos) ? log.photos.length : 0), 0);
  const allConstructionRecordNodes = (hasConstructionTemplateStages
    ? constructionTemplateStages.flatMap((stage, stageIndex) => (
      buildTemplatePhaseNodeRows(stage).map((node, nodeIndex) => ({
        key: `${stage.id}-${node.templateNode?.id || node.id}`,
        stageId: stage.id,
        stageName: stage.name,
        stageIndex,
        nodeIndex,
        node,
      }))
    ))
    : phaseNodeRows.map((node, nodeIndex) => ({
      key: node.id,
      stageId: node.stage?.id || currentPhaseKey,
      stageName: node.stage?.name || currentPhaseLabel,
      stageIndex: 0,
      nodeIndex,
      node,
    })))
    .map((row) => {
      const nodeNameKey = normalizePlanText(row.node.name);
      const stageNameKey = normalizePlanText(row.stageName);
      const nodeId = row.node.templateNode?.id || "";
      const persistedEvents = constructionRecordEvents.filter((event: any) => {
        const eventStageId = String(event.stage_id || "").trim();
        const eventStageName = normalizePlanText(event.stage_name);
        const eventNodeId = String(event.node_id || "").trim();
        const eventNodeName = normalizePlanText(event.node_name);
        const stageMatches = (!eventStageId && !eventStageName)
          || eventStageId === row.stageId
          || (eventStageName && eventStageName === stageNameKey);
        const nodeMatches = (eventNodeId && nodeId && eventNodeId === nodeId)
          || (eventNodeName && eventNodeName === nodeNameKey);
        return stageMatches && nodeMatches;
      });
      const persistedSourceKeys = new Set(persistedEvents.map((event: any) => `${event.source_type || ""}:${event.source_id || ""}`));
      const exactLogs = getPhaseNodeExactLogs(row.node);
      const nodeFiles = getPhaseNodeFiles(row.node);
      const exactIssues = inspections.filter((issue: any) => {
        const text = normalizePlanText(`${issue.title || ""} ${issue.category || ""} ${issue.result || ""}`);
        return Boolean(nodeNameKey && text.includes(nodeNameKey));
      });
      const persistedTimeline: ConstructionRecordTimelineItem[] = persistedEvents.map((event: any) => {
        const metadata = parseConstructionRecordMetadata(event.metadata);
        const linkedLog = event.source_type === "daily_log" ? logs.find((log: any) => log.id === event.source_id) : null;
        const linkedFile = event.source_type === "attachment" ? attachments.find((file: any) => file.id === event.source_id) : null;
        const photos = linkedLog?.photos || (linkedFile && isImageLikeFile(linkedFile) ? [linkedFile] : metadata.fileUrl ? [{ file_url: metadata.fileUrl, file_name: metadata.fileName || event.content }] : []);
        return {
          id: event.id,
          eventType: String(event.event_type || "NODE_STATUS"),
          title: String(event.title || "节点操作"),
          content: String(event.content || ""),
          operatorName: String(event.operator_name || "系统记录"),
          createdAt: String(event.created_at || ""),
          sourceType: String(event.source_type || ""),
          sourceId: String(event.source_id || ""),
          photos: Array.isArray(photos) ? photos : [],
          locationName: String(metadata.locationName || linkedLog?.location_name || ""),
          statusFrom: String(event.status_from || ""),
          statusTo: String(event.status_to || ""),
          completedWork: String(linkedLog?.completed_work || ""),
          nextPlan: String(linkedLog?.next_plan || ""),
        };
      });
      const historicalLogTimeline: ConstructionRecordTimelineItem[] = exactLogs
        .filter((log: any) => !persistedSourceKeys.has(`daily_log:${log.id}`))
        .map((log: any) => ({
          id: `history-log-${log.id}`,
          eventType: "REPORT",
          title: "施工汇报",
          content: getLogDisplayContent(log) || String(log.completed_work || "").trim() || "已上传现场记录",
          operatorName: String(log.author_name || "历史记录"),
          createdAt: String(log.created_at || log.log_date || ""),
          sourceType: "daily_log",
          sourceId: String(log.id || ""),
          photos: Array.isArray(log.photos) ? log.photos : [],
          locationName: String(log.location_name || ""),
          statusFrom: "",
          statusTo: "",
          completedWork: String(log.completed_work || ""),
          nextPlan: String(log.next_plan || ""),
        }));
      const historicalFileTimeline: ConstructionRecordTimelineItem[] = nodeFiles
        .filter((file: any) => !persistedSourceKeys.has(`attachment:${file.id}`))
        .map((file: any) => ({
          id: `history-file-${file.id}`,
          eventType: "ATTACHMENT_UPLOAD",
          title: "上传节点附件",
          content: String(file.file_name || "节点附件"),
          operatorName: String(file.uploader_name || "历史记录"),
          createdAt: String(file.created_at || ""),
          sourceType: "attachment",
          sourceId: String(file.id || ""),
          photos: isImageLikeFile(file) ? [file] : [],
          locationName: "",
          statusFrom: "",
          statusTo: "",
          completedWork: "",
          nextPlan: "",
        }));
      const historicalIssueTimeline: ConstructionRecordTimelineItem[] = exactIssues
        .filter((issue: any) => !persistedSourceKeys.has(`inspection:${issue.id}`))
        .map((issue: any) => ({
          id: `history-issue-${issue.id}`,
          eventType: "ISSUE",
          title: "整改问题",
          content: String(issue.title || "质量问题"),
          operatorName: String(issue.assignee_name || "历史记录"),
          createdAt: String(issue.created_at || ""),
          sourceType: "inspection",
          sourceId: String(issue.id || ""),
          photos: [],
          locationName: "",
          statusFrom: "",
          statusTo: String(issue.status || ""),
          completedWork: "",
          nextPlan: "",
        }));
      const timeline = [...persistedTimeline, ...historicalLogTimeline, ...historicalFileTimeline, ...historicalIssueTimeline]
        .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
      const reportCount = new Set(timeline.filter((item) => item.eventType === "REPORT").map((item) => item.sourceId || item.id)).size;
      const photoCount = exactLogs.reduce((sum: number, log: any) => sum + (Array.isArray(log.photos) ? log.photos.length : 0), 0) + nodeFiles.filter(isImageLikeFile).length;
      const issueCount = new Set(timeline.filter((item) => item.eventType === "ISSUE").map((item) => item.sourceId || item.id)).size;
      return {
        ...row,
        timeline,
        reportCount,
        photoCount,
        issueCount,
        lastEvent: timeline[0] || null,
        quality: getConstructionRecordQualityMeta(row.node),
      };
    });
  const constructionRecordPersonOptions = Array.from(new Set(
    allConstructionRecordNodes.flatMap((row) => row.timeline.map((event) => event.operatorName)).filter((name) => name && name !== "历史记录" && name !== "系统记录"),
  )).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const visibleConstructionRecordNodes = allConstructionRecordNodes.filter((row) => shouldShowConstructionRecordNode(row.node.status));
  const filteredConstructionRecordNodes = visibleConstructionRecordNodes.filter((row) => {
    if (constructionRecordStageFilter !== "ALL" && row.stageId !== constructionRecordStageFilter) return false;
    if (constructionRecordStatusFilter !== "ALL" && String(row.node.status || "PENDING").toUpperCase() !== constructionRecordStatusFilter) return false;
    if (constructionRecordTypeFilter !== "ALL" && !row.timeline.some((event) => constructionRecordEventMatchesFilter(event.eventType, constructionRecordTypeFilter))) return false;
    if (constructionRecordPersonFilter !== "ALL" && !row.timeline.some((event) => event.operatorName === constructionRecordPersonFilter)) return false;
    const matchesDate = row.timeline.some((event) => {
      const date = String(event.createdAt || "").slice(0, 10);
      return (!constructionRecordDateFrom || date >= constructionRecordDateFrom) && (!constructionRecordDateTo || date <= constructionRecordDateTo);
    });
    if ((constructionRecordDateFrom || constructionRecordDateTo) && !matchesDate) return false;
    const keyword = normalizePlanText(constructionRecordSearch);
    if (keyword) {
      const text = normalizePlanText([
        row.stageName,
        row.node.name,
        row.node.owner,
        ...row.timeline.flatMap((event) => [event.title, event.content, event.operatorName]),
      ].join(" "));
      if (!text.includes(keyword)) return false;
    }
    return true;
  });
  const selectedConstructionRecord = visibleConstructionRecordNodes.find((row) => row.key === constructionRecordNodeId) || null;
  const selectedConstructionRecordTimeline = selectedConstructionRecord
    ? selectedConstructionRecord.timeline.filter((event) => (
      constructionRecordEventMatchesFilter(event.eventType, constructionRecordTimelineFilter)
    ))
    : [];
  const phaseNodeRowIdentity = phaseNodeRows.map((node) => node.id).join("|");
  const firstPhaseNodeId = phaseNodeRows[0]?.id || "";
  const selectedPhaseNodeExists = phaseNodeRows.some((node) => node.id === selectedPhaseNodeId);
  const signedQuotationIds = new Set(
    signedContracts
      .map((contract: any) => String(contract?.content?.amount_info?.quotation_id || contract?.content?.quotation_id || "").trim())
      .filter(Boolean)
  );
  const formalQuotations = quotations.filter((quotation: any) => (
    String(quotation.status || "").toUpperCase() === "APPROVED" || signedQuotationIds.has(String(quotation.id || ""))
  ));
  const targetQuotation = formalQuotations[0] || null;
  const targetQuotationItems = targetQuotation
    ? quotationItems.filter((item: any) => item.quotation_id === targetQuotation.id)
    : [];
  const quantityReviewBudgetItems = targetQuotationItems.length > 0 ? targetQuotationItems : quotationItems;
  const quotationTargetCost = getQuotationTargetCostBreakdown(targetQuotationItems);
  const syncedContractFiles = contractsWithPaymentPlans.flatMap((contract: any) => {
    const content = contract.content || {};
    const contractAttachments = Array.isArray(content.attachments) ? content.attachments : [];
    const statusText = contractStatusLabels[String(contract.status || "").toUpperCase()] || "已签约";
    const files = [makeSyncedArchiveFile({
      id: `sync-contract-summary-${contract.id}`,
      file_name: `${contract.title || "签约合同"}纪要`,
      file_url: `#contract-summary-${contract.id}`,
      category: "合同资料",
      source_label: `${statusText}合同纪要`,
      created_at: contract.signed_at || contract.updated_at || contract.created_at,
      archive_type: "合同纪要",
      source_contract_id: contract.id,
      archive_keywords: ["合同资料", "合同纪要", "合同记录"],
    })];
    const attachmentFiles = contractAttachments.map((file: any, index: number) => makeSyncedArchiveFile({
      id: `sync-contract-attachment-${contract.id}-${file.id || index}`,
      file_name: file.file_name || `${contract.title || "签约合同"}附件`,
      file_url: file.file_url,
      file_size: file.file_size,
      mime_type: file.mime_type,
		      category: "合同资料",
		      source_label: `${statusText}合同附件`,
		      created_at: file.created_at || contract.signed_at || contract.updated_at || contract.created_at,
		      archive_keywords: ["合同资料", "合同附件"],
    })).filter((file: any) => file.file_url);
    files.push(...attachmentFiles);
    if (contract.file_url) {
      files.push(makeSyncedArchiveFile({
        id: `sync-contract-main-${contract.id}`,
        file_name: contract.title || "签约合同",
        file_url: contract.file_url,
		        category: "合同资料",
		        source_label: `${statusText}合同`,
		        created_at: contract.signed_at || contract.updated_at || contract.created_at,
		        archive_keywords: ["合同资料", "合同附件"],
      }));
    }
    return files;
  });
  const syncedQuotationFiles = formalQuotations.map((quotation: any) => makeSyncedArchiveFile({
    id: `sync-quotation-${quotation.id}`,
    file_name: quotation.title || "正式报价单",
    file_url: `/quotations/${encodeURIComponent(quotation.id)}`,
    download_url: `/api/quotations/${encodeURIComponent(quotation.id)}/export`,
		    category: "报价单",
		    source_label: "正式报价",
		    created_at: quotation.updated_at || quotation.created_at,
		    archive_type: "报价单",
		    archive_keywords: ["报价单", "整装报价单", "正式报价单"],
  }));
  const syncedPaymentSchemeFile = activeContract?.content?.amount_info?.payment_stages?.length
    ? [makeSyncedArchiveFile({
        id: `sync-payment-scheme-${activeContract.id}`,
        file_name: `${activeContract.content.amount_info.payment_scheme_name || "合同收款比例"}方案`,
        file_url: `#contract-summary-${activeContract.id}`,
		        category: "合同资料",
		        source_label: "合同收款方案",
		        created_at: activeContract.updated_at || activeContract.created_at,
		        archive_type: "收款方案",
		        source_contract_id: activeContract.id,
		        archive_keywords: ["合同资料", "收款比例", "补充协议", "收款比例/补充协议"],
      })]
    : [];
	  const syncedCustomerFiles = customerAttachments.map((file: any) => {
	    const originalCategory = String(file.category || "");
	    const inferred = inferArchiveCategoryFromCustomerFile(file);
	    return makeSyncedArchiveFile({
	      id: `sync-customer-file-${file.id}`,
	      file_name: file.file_name,
	      file_url: file.file_url,
	      file_size: file.file_size,
	      mime_type: file.mime_type,
	      category: inferred.category,
	      source_label: originalCategory ? `客户${originalCategory}` : "客户资料",
	      created_at: file.created_at,
	      source_attachment_id: file.id,
	      uploader_name: file.uploader_name,
	      archive_keywords: inferred.keywords,
	    });
	  });
  const syncedHandoverFiles = currentHandover?.status === "completed"
    ? [makeSyncedArchiveFile({
	        id: `sync-handover-${currentHandover.id}`,
	        file_name: "开工交底纪要",
	        file_url: `/site/${encodeURIComponent(siteId)}`,
		        category: "其他资料",
		        source_label: "系统交底记录",
		        created_at: currentHandover.completed_at || currentHandover.updated_at || currentHandover.created_at,
		        archive_type: "记录",
		        archive_keywords: ["开工交底"],
      })]
    : [];
  const syncedLogPhotoFiles = logs.flatMap((log: any) => (Array.isArray(log.photos) ? log.photos : []).map((photo: any, index: number) => makeSyncedArchiveFile({
    id: `sync-log-photo-${photo.id || log.id}-${index}`,
    file_name: photo.caption || `${formatDate(log.log_date || log.created_at)}施工日志照片`,
    file_url: photo.url,
    mime_type: "image/*",
		    category: "其他资料",
		    source_label: "施工日志照片",
		    created_at: photo.created_at || log.created_at || log.log_date,
		    archive_keywords: ["施工日志照片"],
  }))).filter((file: any) => file.file_url);
  const syncedChangeOrderFiles = changeOrders.map((order: any) => makeSyncedArchiveFile({
    id: `sync-change-order-${order.id}`,
    file_name: order.change_no ? `${order.change_no} ${order.title || "增减项确认单"}` : order.title || "增减项确认单",
    file_url: `/site/${encodeURIComponent(siteId)}`,
		    category: "其他资料",
		    source_label: changeOrderStatusLabels[order.status] || "增减项记录",
		    created_at: order.updated_at || order.created_at,
		    archive_type: "记录",
		    archive_keywords: ["增减项确认单", "内部审核记录"],
  }));
  const syncedFinanceFiles = [
    ...depositRecords
      .filter((record: any) => record.status === "received")
      .map((record: any) => makeSyncedArchiveFile({
        id: `sync-deposit-${record.id}`,
        file_name: record.voucher_url ? `${record.deposit_type || "定金"}收款凭证` : `${record.deposit_type || "定金"}收款记录`,
        file_url: record.voucher_url || (selected?.customer_id ? `/projects/${encodeURIComponent(selected.customer_id)}?tab=deposit` : `/site/${encodeURIComponent(siteId)}`),
        mime_type: record.voucher_url ? "image/*" : "text/uri-list",
	        category: "结算单",
	        source_label: "定金记录",
	        created_at: record.received_at || record.created_at,
	        archive_type: record.voucher_url ? undefined : "记录",
	        archive_keywords: ["结算单", "收款凭证", "定金"],
      })),
    ...paymentRecords.map((record: any) => makeSyncedArchiveFile({
      id: `sync-payment-record-${record.id}`,
      file_name: record.receipt_no ? `${record.receipt_no} 收款记录` : "合同款收款记录",
      file_url: `/site/${encodeURIComponent(siteId)}`,
	      category: "结算单",
	      source_label: "合同收款记录",
	      created_at: record.pay_date || record.created_at,
	      archive_type: "记录",
	      archive_keywords: ["结算单", "收款凭证", "发票/收据"],
    })),
  ];
  const syncedArchiveFiles = [
    ...syncedContractFiles,
    ...syncedQuotationFiles,
    ...syncedPaymentSchemeFile,
    ...syncedCustomerFiles,
    ...syncedHandoverFiles,
    ...syncedLogPhotoFiles,
    ...syncedChangeOrderFiles,
    ...syncedFinanceFiles,
  ];
  const vrSceneImageUrls = new Set(
    (data.vrTours || [])
      .filter((tour: any) => tour.project_id === selected?.id)
      .flatMap((tour: any) => {
        try {
          const scenes = JSON.parse(tour.scenes || "[]");
          return Array.isArray(scenes) ? scenes.map((scene: any) => String(scene?.image_url || "").trim()) : [];
        } catch {
          return [];
        }
      })
      .filter(Boolean)
  );
  const allArchiveFiles = [...attachments, ...syncedArchiveFiles].filter((file: any, index: number, files: any[]) => {
    if (vrSceneImageUrls.has(String(file.file_url || "").trim())) return false;
    const key = `${file.file_url || ""}|${file.file_name || ""}|${file.category || ""}`;
    return files.findIndex((item: any) => `${item.file_url || ""}|${item.file_name || ""}|${item.category || ""}` === key) === index;
  });
	  const archiveRows = archiveCategories.map((category) => {
	    const files = allArchiveFiles.filter((file) => {
	      const fileCategory = String(file.category || "");
      if (category.key === "其他资料") {
        return fileCategory === `工地归档-${category.key}`;
      }
	      if (fileCategory === `工地归档-${category.key}` || fileCategory === category.key) return true;
	      return category.match(fileCategory);
	    });
	    const missing = files.length > 0 ? [] : category.required;
	    return {
	      ...category,
	      files,
	      fileCount: files.length,
	      missing,
	      completeRate: files.length > 0 ? 100 : 0,
	    };
  });
  const selectedArchiveRow = archiveRows.find((item) => item.key === archiveCategory) || archiveRows[0];
  const isVrArchiveSelected = selectedArchiveRow.key === "水电VR全景";
  const canArchiveExternalLink = !archiveNoExternalLinkCategoryKeys.has(selectedArchiveRow.key);
  const materialOrderById = new Map(materialOrders.map((order: any) => [order.id, order]));
  const getMaterialOrderItemActualCost = (item: any) => {
    const order = materialOrderById.get(item.order_id) as any;
    if (!order || order.status === "CANCELLED") return null;
    const orderType = String(order.order_type || "");
    const quantity = Math.max(0, Number(item.quantity || 0) || 0);
    const receivedQty = Math.max(0, Number(item.received_qty || 0) || 0);
    const deductedQty = Math.max(0, Number(item.stock_deducted_qty || 0) || 0);
    const costQuantity = orderType === "AUXILIARY_WAREHOUSE"
      ? Math.min(quantity, deductedQty)
      : receivedQty > 0
        ? Math.min(quantity, receivedQty)
        : ["RECEIVED", "PARTIAL"].includes(String(order.status || "")) ? quantity : 0;
    if (costQuantity <= 0) return null;
    const unitCost = Math.max(0, Number(item.material_cost_price ?? item.unit_price ?? 0) || 0);
    const amount = roundMoney(costQuantity * unitCost);
    if (amount <= 0) return null;
    return { order, orderType, costQuantity, amount };
  };
  const manualCostRows = costRecords.map((record: any) => ({
    ...record,
    source_type: "MANUAL",
    source_label: "手工录入",
    source_no: record.invoice_no || "",
    can_delete: true,
  }));
  const materialCostMap = materialOrderItems.reduce((acc: Record<string, any>, item: any) => {
    const actualCost = getMaterialOrderItemActualCost(item);
    if (!actualCost) return acc;
    const { order, orderType, amount, costQuantity } = actualCost;
    const key = String(order.id);
    const category = orderType === "MAIN_SUPPLIER" ? "MAIN_MATERIAL" : "AUXILIARY";
    const paidEnough = Number(order.paid_amount || 0) >= Number(order.total_amount || 0) && Number(order.total_amount || 0) > 0;
    const status = order.settlement_status === "SETTLED" || paidEnough ? "PAID" : Number(order.paid_amount || 0) > 0 ? "PENDING" : "UNPAID";
    if (!acc[key]) {
      acc[key] = {
        id: `MATERIAL_COST_${order.id}`,
        project_id: order.project_id,
        category,
        phase: "",
        name: `${materialOrderTypeLabels[orderType] || "材料订单"} · ${order.order_no || "-"}`,
        amount: 0,
        cost_date: order.received_at || order.order_date || order.created_at,
        supplier: getMaterialOrderSupplierName(order),
        payee: getMaterialOrderSupplierName(order),
        payment_method: orderType === "AUXILIARY_WAREHOUSE" ? "库存出库" : "材料下单",
        status,
        invoice_no: order.order_no || "",
        remark: "系统根据材料订单明细和入库价自动计算",
        created_by_name: order.created_by_name || "",
        source_type: "MATERIAL_ORDER",
        source_label: "材料订单",
        source_no: order.order_no || "",
        can_delete: false,
        item_count: 0,
        quantity: 0,
      };
    }
    acc[key].amount += amount;
    acc[key].item_count += 1;
    acc[key].quantity += costQuantity;
    return acc;
  }, {});
  const materialCostRows = Object.values(materialCostMap);
  const costLedgerRows = [...manualCostRows, ...materialCostRows]
    .sort((a: any, b: any) => {
      const timeCompare = getTimeValue(b.cost_date || b.created_at) - getTimeValue(a.cost_date || a.created_at);
      if (timeCompare !== 0) return timeCompare;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const totalCostAmount = costLedgerRows.reduce((sum: number, record: any) => sum + Number(record.amount || 0), 0);
  const budgetRevenueAmount = roundMoney(Number(activeCostSnapshot?.revenue_amount || 0));
  const budgetMaterialCostAmount = roundMoney(Number(activeCostSnapshot?.budget_material_cost || 0));
  const budgetLaborCostAmount = roundMoney(Number(activeCostSnapshot?.budget_labor_cost || 0));
  const budgetTotalCostAmount = roundMoney(Number(activeCostSnapshot?.budget_total_cost || 0));
  const budgetGrossProfitAmount = roundMoney(Number(activeCostSnapshot?.budget_gross_profit || 0));
  const budgetGrossProfitRate = Number(activeCostSnapshot?.budget_gross_profit_rate || 0);
  const budgetMissingRuleCount = Number(activeCostSnapshot?.missing_rule_count || 0);
  const budgetActualCostGap = roundMoney(budgetTotalCostAmount - totalCostAmount);
  const budgetMissingRows = costSnapshotItems.filter((item: any) => Number(item.missing_cost_rule || 0) === 1);
  const makeBudgetGroupRows = (type: "work" | "material") => {
    const groups = new Map<string, any>();
    costSnapshotItems.forEach((item: any) => {
      const name = String((type === "work" ? item.work_type_name : item.material_category_name) || "").trim() || "未指定";
      const key = `${type}:${name}`;
      const current = groups.get(key) || {
        key,
        type,
        name,
        count: 0,
        amount: 0,
        materialAmount: 0,
        laborAmount: 0,
        missingCount: 0,
      };
      current.count += 1;
      current.amount = roundMoney(current.amount + Number(item.budget_total_cost || 0));
      current.materialAmount = roundMoney(current.materialAmount + Number(item.budget_material_cost || 0));
      current.laborAmount = roundMoney(current.laborAmount + Number(item.budget_labor_cost || 0));
      current.missingCount += Number(item.missing_cost_rule || 0) === 1 ? 1 : 0;
      groups.set(key, current);
    });
    return Array.from(groups.values()).sort((a, b) => {
      const amountCompare = Number(b.amount || 0) - Number(a.amount || 0);
      if (amountCompare !== 0) return amountCompare;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  };
  const budgetWorkGroups = makeBudgetGroupRows("work");
  const budgetMaterialGroups = makeBudgetGroupRows("material");
  const budgetWorkNameSet = new Set(budgetWorkGroups.map((group) => String(group.name || "").trim() || "未指定"));
  const budgetMaterialNameSet = new Set(budgetMaterialGroups.map((group) => String(group.name || "").trim() || "未指定"));
  const resolveActualMaterialGroupName = (categoryName: string) => {
    const normalizedName = String(categoryName || "").trim() || "未指定材料分类";
    if (budgetMaterialNameSet.has(normalizedName)) return normalizedName;
    const parts = normalizedName.split("/").map((part) => part.trim()).filter(Boolean);
    const parentName = parts[0] || "";
    if (parentName && budgetMaterialNameSet.has(parentName)) return parentName;
    const childName = parts[parts.length - 1] || "";
    if (childName && budgetMaterialNameSet.has(childName)) return childName;
    return normalizedName;
  };
  const actualWorkCostMap = new Map<string, number>();
  const actualMaterialCostMap = new Map<string, number>();
  let actualOtherCostAmount = 0;
  const addActualCostAmount = (map: Map<string, number>, name: string, amount: number) => {
    const key = String(name || "").trim() || "未指定";
    map.set(key, roundMoney((map.get(key) || 0) + Math.max(0, Number(amount || 0) || 0)));
  };
  manualCostRows.forEach((record: any) => {
    const amount = Math.max(0, Number(record.amount || 0) || 0);
    if (amount <= 0) return;
    const category = String(record.category || "").toUpperCase();
    if (category === "LABOR" || category === "SUBCONTRACT") {
      addActualCostAmount(
        actualWorkCostMap,
        String(record.work_type_name || "").trim() || phaseLabels[String(record.phase || "")] || "未指定工种",
        amount,
      );
      return;
    }
    if (["AUXILIARY", "MAIN_MATERIAL", "EQUIPMENT"].includes(category)) {
      addActualCostAmount(
        actualMaterialCostMap,
        resolveActualMaterialGroupName(String(record.material_category_name || "").trim() || costCategoryLabels[category] || "未指定材料分类"),
        amount,
      );
      return;
    }
    actualOtherCostAmount = roundMoney(actualOtherCostAmount + amount);
  });
  materialOrderItems.forEach((item: any) => {
    const actualCost = getMaterialOrderItemActualCost(item);
    if (!actualCost) return;
    addActualCostAmount(actualMaterialCostMap, resolveActualMaterialGroupName(String(item.category_name || "").trim() || "未指定材料分类"), actualCost.amount);
  });
  const budgetAllGroup = {
    key: "all",
    type: "all",
    name: "全部预算明细",
    count: costSnapshotItems.length,
    amount: budgetTotalCostAmount,
    materialAmount: budgetMaterialCostAmount,
    laborAmount: budgetLaborCostAmount,
    missingCount: budgetMissingRuleCount,
  };
  const budgetGroupRows = [budgetAllGroup, ...budgetWorkGroups, ...budgetMaterialGroups];
  const selectedBudgetGroup = budgetGroupRows.find((group) => group.key === budgetDetailGroupKey) || budgetAllGroup;
  const isAllBudgetGroup = selectedBudgetGroup.type === "all";
  const isWorkBudgetGroup = selectedBudgetGroup.type === "work";
  const isMaterialBudgetGroup = selectedBudgetGroup.type === "material";
  const selectedBudgetGroupAmount = isWorkBudgetGroup
    ? Number(selectedBudgetGroup.laborAmount || 0)
    : isMaterialBudgetGroup
      ? Number(selectedBudgetGroup.materialAmount || 0)
      : Number(selectedBudgetGroup.amount || 0);
  const selectedBudgetGroupSummary = isWorkBudgetGroup
    ? `${selectedBudgetGroup.count} 项 · 人工 ${formatPlainAmount(selectedBudgetGroup.laborAmount)}`
    : isMaterialBudgetGroup
      ? `${selectedBudgetGroup.count} 项 · 材料 ${formatPlainAmount(selectedBudgetGroup.materialAmount)}`
      : `${selectedBudgetGroup.count} 项 · 材料 ${formatPlainAmount(selectedBudgetGroup.materialAmount)} · 人工 ${formatPlainAmount(selectedBudgetGroup.laborAmount)}`;
  const visibleBudgetRows = selectedBudgetGroup.key === "all"
    ? costSnapshotItems
    : costSnapshotItems.filter((item: any) => {
      const name = selectedBudgetGroup.type === "work"
        ? String(item.work_type_name || "").trim() || "未指定"
        : String(item.material_category_name || "").trim() || "未指定";
      return `${selectedBudgetGroup.type}:${name}` === selectedBudgetGroup.key;
    });
  const approvedChangeOrders = changeOrders.filter((order: any) => String(order.status || "").toUpperCase() === "APPROVED");
  const approvedChangeRevenueAmount = approvedChangeOrders.reduce((sum: number, order: any) => (
    sum + getChangeOrderNetAddAmount(order) - getChangeOrderDeductAmount(order)
  ), 0);
  const contractRevenueAmount = Math.max(0, contractAmount + approvedChangeRevenueAmount);
  const quotedContractAmount = Math.max(0, Number(targetQuotation?.total_amount ?? targetQuotation?.final_amount ?? contractAmount) || 0);
  const contractDiscountAmount = Math.max(0, Number(targetQuotation?.discount ?? 0) || 0);
  const discountedContractAmount = Math.max(0, Number(activeContract?.total_amount ?? targetQuotation?.final_amount ?? selected?.contract_amount ?? 0) || 0);
  const targetMaterialCostAmount = roundMoney(quotationTargetCost.material);
  const hasTargetCost = Boolean(targetQuotation && targetQuotationItems.length > 0);
  const realtimeGrossProfitAmount = roundMoney(contractRevenueAmount - totalCostAmount);
  const realtimeGrossProfitRate = contractRevenueAmount > 0
    ? Math.round((realtimeGrossProfitAmount / contractRevenueAmount) * 1000) / 10
    : 0;
  const budgetCompositionRows = [
    ...budgetWorkGroups.map((group) => {
      const meta = getBudgetWorkGroupMeta(group.name);
      return {
        key: `labor:${group.key}`,
        name: group.name,
        value: Number(group.laborAmount || 0),
        color: getBudgetGroupChartColor(meta.tone),
      };
    }),
    ...budgetMaterialGroups.map((group) => {
      const meta = getBudgetMaterialGroupMeta(group.name);
      return {
        key: `material:${group.key}`,
        name: group.name,
        value: Number(group.materialAmount || 0),
        color: getBudgetGroupChartColor(meta.tone),
      };
    }),
  ].filter((row) => row.value > 0);
  const budgetCompositionTotal = budgetCompositionRows.reduce((sum, row) => sum + row.value, 0);
  const makeActualCompareRow = (input: { key: string; type: string; name: string; budgetAmount: number; actualAmount: number }) => {
    const budgetAmount = roundMoney(input.budgetAmount);
    const actualAmount = roundMoney(input.actualAmount);
    const diffAmount = roundMoney(budgetAmount - actualAmount);
    const rate = budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 1000) / 10 : actualAmount > 0 ? 100 : 0;
    const tone = diffAmount < -0.005 ? "danger" : actualAmount <= 0 ? "muted" : rate >= 90 ? "warning" : "success";
    const status = diffAmount < -0.005 ? "超预算" : actualAmount <= 0 ? "未发生" : rate >= 90 ? "接近预算" : "正常";
    return { ...input, budgetAmount, actualAmount, diffAmount, rate, tone, status };
  };
  const actualCostCompareRows = [
    ...budgetWorkGroups.map((group) => makeActualCompareRow({
      key: `work:${group.name}`,
      type: "工种",
      name: group.name,
      budgetAmount: Number(group.laborAmount || 0),
      actualAmount: actualWorkCostMap.get(String(group.name || "").trim() || "未指定") || 0,
    })),
    ...budgetMaterialGroups.map((group) => makeActualCompareRow({
      key: `material:${group.name}`,
      type: "材料",
      name: group.name,
      budgetAmount: Number(group.materialAmount || 0),
      actualAmount: actualMaterialCostMap.get(String(group.name || "").trim() || "未指定") || 0,
    })),
    ...Array.from(actualWorkCostMap.entries())
      .filter(([name]) => !budgetWorkNameSet.has(name))
      .map(([name, amount]) => makeActualCompareRow({
        key: `actual-work:${name}`,
        type: "工种",
        name,
        budgetAmount: 0,
        actualAmount: amount,
      })),
    ...Array.from(actualMaterialCostMap.entries())
      .filter(([name]) => !budgetMaterialNameSet.has(name))
      .map(([name, amount]) => makeActualCompareRow({
        key: `actual-material:${name}`,
        type: "材料",
        name,
        budgetAmount: 0,
        actualAmount: amount,
      })),
    ...(actualOtherCostAmount > 0 ? [makeActualCompareRow({
      key: "actual-other",
      type: "其他",
      name: "其他成本",
      budgetAmount: 0,
      actualAmount: actualOtherCostAmount,
    })] : []),
  ].filter((row) => row.budgetAmount > 0 || row.actualAmount > 0);
  const actualCostRecordRows = [
    ...manualCostRows.map((record: any) => {
      const amount = Math.max(0, Number(record.amount || 0) || 0);
      if (amount <= 0) return null;
      const category = String(record.category || "").toUpperCase();
      const isLaborRecord = category === "LABOR" || category === "SUBCONTRACT";
      const isMaterialRecord = ["AUXILIARY", "MAIN_MATERIAL", "EQUIPMENT"].includes(category);
      const dimensionType = isLaborRecord ? "工种" : isMaterialRecord ? "材料" : "其他";
      const dimensionName = isLaborRecord
        ? String(record.work_type_name || "").trim() || phaseLabels[String(record.phase || "")] || "未指定工种"
        : isMaterialRecord
          ? resolveActualMaterialGroupName(String(record.material_category_name || "").trim() || costCategoryLabels[category] || "未指定材料分类")
          : "其他成本";
      return {
        id: `manual:${record.id}`,
        dimensionType,
        dimensionName,
        source: "手工成本",
        title: record.name || costCategoryLabels[category] || "成本记录",
        category: isMaterialRecord ? String(record.material_category_name || "").trim() || dimensionName : dimensionName,
        amount,
        quantity: "",
        unit: "",
        unitCost: null,
        date: record.cost_date || record.created_at || "",
        orderNo: record.invoice_no || "",
        supplier: record.supplier || record.payee || "",
        operator: record.created_by_name || "",
        remark: record.remark || "",
      };
    }).filter(Boolean),
    ...materialOrderItems.map((item: any) => {
      const actualCost = getMaterialOrderItemActualCost(item);
      if (!actualCost) return null;
      const originalCategoryName = String(item.category_name || "").trim() || "未指定材料分类";
      const unitCost = Math.max(0, Number(item.material_cost_price ?? item.unit_price ?? 0) || 0);
      return {
        id: `material:${item.id}`,
        dimensionType: "材料",
        dimensionName: resolveActualMaterialGroupName(originalCategoryName),
        source: actualCost.orderType === "AUXILIARY_WAREHOUSE" ? "库存出库" : "材料订单",
        title: item.material_name || item.name || "材料明细",
        category: originalCategoryName,
        amount: actualCost.amount,
        quantity: actualCost.costQuantity,
        unit: item.material_unit || item.unit || "",
        unitCost,
        date: actualCost.order.received_at || actualCost.order.order_date || actualCost.order.created_at || "",
        orderNo: actualCost.order.order_no || "",
        supplier: getMaterialOrderSupplierName(actualCost.order),
        operator: actualCost.order.created_by_name || "",
        remark: item.remark || actualCost.order.remark || "",
      };
    }).filter(Boolean),
  ] as any[];
  const selectedActualCostRow = actualCostCompareRows.find((row) => row.key === actualCostRecordKey) || null;
  const selectedActualCostRecords = selectedActualCostRow
    ? actualCostRecordRows
        .filter((record: any) => record.dimensionType === selectedActualCostRow.type && record.dimensionName === selectedActualCostRow.name)
        .sort((a: any, b: any) => getTimeValue(b.date) - getTimeValue(a.date))
    : [];
  const selectedActualCostRecordTotal = roundMoney(selectedActualCostRecords.reduce((sum: number, record: any) => sum + Number(record.amount || 0), 0));
  const actualLaborCostAmount = roundMoney(Array.from(actualWorkCostMap.values()).reduce((sum, amount) => sum + amount, 0));
  const actualMaterialCostAmount = roundMoney(Array.from(actualMaterialCostMap.values()).reduce((sum, amount) => sum + amount, 0));
  const actualCollectionRate = budgetTotalCostAmount > 0 ? Math.round((totalCostAmount / budgetTotalCostAmount) * 1000) / 10 : 0;
  const actualCollectionProgress = Math.min(100, Math.max(0, actualCollectionRate));
  const actualCompareOverBudgetCount = actualCostCompareRows.filter((row) => row.diffAmount < -0.005).length;
  const actualCompareOccurredCount = actualCostCompareRows.filter((row) => row.actualAmount > 0).length;
  const actualCompareRemainingAmount = roundMoney(budgetTotalCostAmount - totalCostAmount);
  const confirmedQuantityReviews = quantityReviews.filter((review: any) => !["CANCELLED"].includes(String(review.status || "").toUpperCase()));
  const pendingQuantityReviewAmount = confirmedQuantityReviews
    .filter((review: any) => !review.generated_change_order_id && ["CONFIRMED", "FINANCE_CREATED"].includes(String(review.status || "").toUpperCase()))
    .reduce((sum: number, review: any) => sum + Number(review.net_amount || 0), 0);
  const pendingQuantityReviewCount = confirmedQuantityReviews.filter((review: any) => !review.generated_change_order_id && ["CONFIRMED", "FINANCE_CREATED"].includes(String(review.status || "").toUpperCase())).length;
  const ownerSettlementSignedAmount = roundMoney(contractAmount + netChangeAmount);
  const ownerSettlementReceivedAmount = roundMoney(receivedAmount);
  const ownerSettlementBalanceAmount = roundMoney(ownerSettlementSignedAmount - ownerSettlementReceivedAmount);
  const ownerSettlementReceivableAmount = Math.max(0, ownerSettlementBalanceAmount);
  const ownerSettlementRefundAmount = Math.max(0, -ownerSettlementBalanceAmount);
  const ownerSettlementProgress = ownerSettlementSignedAmount > 0
    ? Math.min(100, Math.round((ownerSettlementReceivedAmount / ownerSettlementSignedAmount) * 100))
    : 0;
  const unsettledMaterialCostAmount = materialCostRows
    .filter((record: any) => record.status !== "PAID")
    .reduce((sum: number, record: any) => sum + Number(record.amount || 0), 0);
  const unsettledManualCostAmount = manualCostRows
    .filter((record: any) => record.status !== "PAID")
    .reduce((sum: number, record: any) => sum + Number(record.amount || 0), 0);
  const unsettledCostAmount = roundMoney(unsettledMaterialCostAmount + unsettledManualCostAmount);
  const costSavingAmount = Math.max(0, roundMoney(budgetTotalCostAmount - totalCostAmount));
  const costOverrunAmount = Math.max(0, roundMoney(totalCostAmount - budgetTotalCostAmount));
  const settlementActualProfitAmount = roundMoney(ownerSettlementSignedAmount - totalCostAmount);
  const settlementActualProfitRate = ownerSettlementSignedAmount > 0
    ? Math.round((settlementActualProfitAmount / ownerSettlementSignedAmount) * 1000) / 10
    : 0;
  const settlementBudgetProfitGap = roundMoney(settlementActualProfitAmount - budgetGrossProfitAmount);
  const settlementRiskRows = [
    ownerSettlementReceivableAmount > 0 ? {
      key: "owner-receivable",
      tone: "danger",
      title: "业主尾款未结清",
      value: formatPlainAmount(ownerSettlementReceivableAmount),
      helper: "需要继续收款后才能完成业主结算",
    } : null,
    ownerSettlementRefundAmount > 0 ? {
      key: "owner-refund",
      tone: "warning",
      title: "存在应退金额",
      value: formatPlainAmount(ownerSettlementRefundAmount),
      helper: "已收金额超过当前结算应收，需要走退款确认",
    } : null,
    pendingApprovalChangeCount > 0 ? {
      key: "change-pending",
      tone: "warning",
      title: "增减项待审批",
      value: `${pendingApprovalChangeCount} 单`,
      helper: "待审批增减项暂不计入最终应收",
    } : null,
    pendingQuantityReviewCount > 0 ? {
      key: "quantity-pending",
      tone: "warning",
      title: "工程量复核待转结算",
      value: formatPlainAmount(pendingQuantityReviewAmount),
      helper: "已确认但未生成增减项的复核差额",
    } : null,
    costOverrunAmount > 0 ? {
      key: "cost-overrun",
      tone: "danger",
      title: "实际成本超预算",
      value: formatPlainAmount(costOverrunAmount),
      helper: "需要复核材料订单、人工和其他支出",
    } : null,
    unsettledCostAmount > 0 ? {
      key: "cost-unsettled",
      tone: "neutral",
      title: "成本未结算",
      value: formatPlainAmount(unsettledCostAmount),
      helper: "存在未支付或待结算成本流水",
    } : null,
  ].filter(Boolean) as { key: string; tone: string; title: string; value: string; helper: string }[];
  const settlementFlowRows = [
    { key: "contract", label: "合同签约", value: formatPlainAmount(contractAmount), state: activeContract ? "已完成" : "待确认", tone: activeContract ? "success" : "warning" },
    { key: "change", label: "增减项结算", value: formatSignedPlainAmount(netChangeAmount), state: pendingApprovalChangeCount > 0 ? "有待审批" : "已同步", tone: pendingApprovalChangeCount > 0 ? "warning" : "success" },
    { key: "receipt", label: "客户收款", value: `${ownerSettlementProgress}%`, state: ownerSettlementReceivableAmount > 0 ? "待收款" : ownerSettlementRefundAmount > 0 ? "待退款" : "已平账", tone: ownerSettlementReceivableAmount > 0 || ownerSettlementRefundAmount > 0 ? "warning" : "success" },
    { key: "cost", label: "成本归集", value: formatPlainAmount(totalCostAmount), state: unsettledCostAmount > 0 ? "待结算" : "已归集", tone: costOverrunAmount > 0 ? "danger" : unsettledCostAmount > 0 ? "warning" : "success" },
    { key: "profit", label: "利润核算", value: `${settlementActualProfitRate}%`, state: settlementRiskRows.length > 0 ? "待复核" : "可关账", tone: settlementRiskRows.length > 0 ? "warning" : "success" },
  ];
  const activeOwnerSettlementBill = ownerSettlementBills.find((bill: any) => bill.status === "CONFIRMED") || ownerSettlementBills.find((bill: any) => bill.status === "DRAFT") || ownerSettlementBills[0] || null;
  const generateOwnerSettlementBill = async () => {
    if (!selected) return;
    setSaving(true);
    setSettlementMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "generate_owner_settlement_bill",
          project_id: selected.id,
          contract_id: activeContract?.id || "",
          contract_amount: contractAmount,
          quotation_amount: quotedContractAmount,
          quotation_discount_amount: contractDiscountAmount,
          change_add_amount: addChangeAmount,
          change_deduct_amount: deductChangeAmount,
          change_net_amount: netChangeAmount,
          settlement_amount: ownerSettlementSignedAmount,
          received_amount: ownerSettlementReceivedAmount,
          receivable_amount: ownerSettlementReceivableAmount,
          refund_amount: ownerSettlementRefundAmount,
          budget_cost_amount: budgetTotalCostAmount,
          actual_cost_amount: totalCostAmount,
          actual_profit_amount: settlementActualProfitAmount,
          actual_profit_rate: settlementActualProfitRate,
          snapshot: {
            site_name: siteDisplayName,
            room_number: siteCustomerRoomNumber,
            address: siteAddress,
            contract_no: activeContract?.contract_no || activeContract?.title || "",
            quotation_id: targetQuotation?.id || "",
            cost_snapshot_id: activeCostSnapshot?.id || "",
            flow: settlementFlowRows,
            risks: settlementRiskRows,
            change_orders: approvedChangeOrders.map((order: any) => ({
              id: order.id,
              change_no: order.change_no,
              title: order.title,
              amount: getChangeSignedAmount(order),
              approved_at: order.approved_at,
            })),
            pending_quantity_reviews: confirmedQuantityReviews
              .filter((review: any) => !review.generated_change_order_id && ["CONFIRMED", "FINANCE_CREATED"].includes(String(review.status || "").toUpperCase()))
              .map((review: any) => ({
                id: review.id,
                review_no: review.review_no,
                title: review.title,
                net_amount: Number(review.net_amount || 0),
              })),
            cost_rows: costLedgerRows.map((row: any) => ({
              id: row.id,
              name: row.name,
              category: row.category,
              amount: Number(row.amount || 0),
              status: row.status,
              date: row.cost_date || row.order_date || row.created_at || "",
            })),
          },
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettlementMessage(result.message || "生成业主结算单失败");
        return;
      }
      setSettlementMessage(`业主结算单 ${result.bill_no || ""} 已生成`);
      await load();
    } finally {
      setSaving(false);
    }
  };
  const postOwnerSettlementBillAction = async (bill: any, action: string, successMessage: string) => {
    if (!selected || !bill?.id) return;
    setSaving(true);
    setSettlementMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({ action, project_id: selected.id, id: bill.id }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettlementMessage(result.message || "处理业主结算单失败");
        return;
      }
      setSettlementMessage(successMessage);
      await load();
    } finally {
      setSaving(false);
    }
  };
  const costFormIsLabor = ["LABOR", "SUBCONTRACT"].includes(String(costForm.category || "").toUpperCase());
  const costFormIsMaterial = ["AUXILIARY", "MAIN_MATERIAL", "EQUIPMENT"].includes(String(costForm.category || "").toUpperCase());
  const workTypeCostOptions = budgetWorkGroups.map((group) => group.name).filter(Boolean);
  const materialCategoryCostOptions = budgetMaterialGroups.map((group) => group.name).filter(Boolean);
  useEffect(() => {
    if (!selected?.id) return;
    setPendingLogPhotos([]);
    fetch(`/api/upload?project_id=${encodeURIComponent(selected.id)}`, { headers: getClientAuthHeaders() })
      .then((res) => res.json())
      .then((files) => setAttachments(Array.isArray(files) ? files : []))
      .catch(() => setAttachments([]));
  }, [selected?.id]);

  useEffect(() => {
    if (!currentPhaseKey) return;
    setLogForm((form) => form.phase ? form : { ...form, phase: currentPhaseKey });
  }, [currentPhaseKey]);

  useEffect(() => {
    if (!firstPhaseNodeId) {
      if (selectedPhaseNodeId) setSelectedPhaseNodeId("");
      return;
    }
    if (!selectedPhaseNodeExists) {
      setSelectedPhaseNodeId(firstPhaseNodeId);
    }
  }, [firstPhaseNodeId, phaseNodeRowIdentity, selectedPhaseNodeExists, selectedPhaseNodeId]);

	  useEffect(() => {
	    if (!currentHandover) {
	      setHandoverForm({
	        ...makeDefaultHandoverForm(),
	        ...makeHandoverScheduleDefaults(),
	      });
	      return;
	    }
	    setHandoverForm({
	      handover_id: currentHandover.id || "",
	      status: currentHandover.status || "draft",
	      scheduled_at: toDateTimeLocal(currentHandover.scheduled_at),
	      ...makeHandoverScheduleDefaults(currentHandover),
	      checks: parseHandoverChecks(currentHandover.checks),
	      designer_confirmed: Boolean(currentHandover.designer_confirmed),
	      manager_confirmed: Boolean(currentHandover.manager_confirmed),
      owner_confirmed: Boolean(currentHandover.owner_confirmed),
      owner_present: currentHandover.owner_present !== 0,
      key_notes: currentHandover.key_notes || "",
	      risk_notes: currentHandover.risk_notes || "",
	      unresolved_items: currentHandover.unresolved_items || "",
	    });
	  }, [currentHandover, makeHandoverScheduleDefaults]);

		  const updateHandoverSchedule = (
		    patch: Partial<Pick<ReturnType<typeof makeDefaultHandoverForm>, "planned_start" | "duration_days" | "weekend_construction" | "holiday_construction" | "has_floor_heating">>,
		  ) => {
    if (handoverReadOnly) return;
	    setHandoverForm((form) => {
	      const next = { ...form, ...patch };
	      const plannedEnd = calculateSitePlannedEnd(next.planned_start, next.duration_days, {
	        weekendConstruction: next.weekend_construction,
	        holidayConstruction: next.holiday_construction,
	      });
	      return {
	        ...next,
	        planned_end: plannedEnd || (next.planned_start && Number(next.duration_days || 0) > 0 ? next.planned_end : ""),
		      };
		    });
		  };

  const isHandoverRequiredFieldInvalid = (field: HandoverRequiredFieldKey) => {
    switch (field) {
      case "construction_template_id":
        return !handoverForm.construction_template_id;
      case "planned_start":
        return !handoverForm.planned_start;
      case "duration_days":
        return Number(handoverForm.duration_days || 0) <= 0;
      default:
        return false;
    }
  };

  const isHandoverMissingFieldActive = (field: HandoverRequiredFieldKey) => Boolean(handoverMissingFields[field]) && isHandoverRequiredFieldInvalid(field);
  const handoverRequiredFieldClassName = (field: HandoverRequiredFieldKey, baseClassName: string) => [
    baseClassName,
    isHandoverMissingFieldActive(field) ? handoverStyles.requiredFieldMissing : "",
  ].filter(Boolean).join(" ");
  const handoverRequiredFieldLabels: Record<HandoverRequiredFieldKey, string> = {
    construction_template_id: "施工模板",
    planned_start: "计划开工",
    duration_days: "签约工期",
  };
  const getHandoverMissingRequiredFields = () => ([
    "construction_template_id",
    "planned_start",
    "duration_days",
  ] as HandoverRequiredFieldKey[]).filter((field) => isHandoverRequiredFieldInvalid(field));

  const markHandoverMissingFields = (fields: HandoverRequiredFieldKey[]) => {
    if (fields.length === 0) return;
    const nextFields = fields.reduce<Partial<Record<HandoverRequiredFieldKey, number>>>((result, field) => {
      result[field] = Date.now();
      return result;
    }, {});
    setHandoverMissingFields({});
    window.requestAnimationFrame(() => setHandoverMissingFields(nextFields));
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-handover-required-field="${fields[0]}"]`);
      const focusTarget = target?.querySelector<HTMLElement>("button,input,textarea,[tabindex]");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      focusTarget?.focus?.({ preventScroll: true });
    }, 80);
  };

  const validateHandoverRequiredFields = () => {
    const missingFields = getHandoverMissingRequiredFields();
    if (missingFields.length === 0) return true;
    markHandoverMissingFields(missingFields);
    setHandoverMessage(`请先填写${missingFields.map((field) => handoverRequiredFieldLabels[field]).join("、")}后再完成交底。`);
    return false;
  };

  const closeHandoverModal = () => {
    setHandoverModalOpen(false);
    setHandoverStartConfirmMode(false);
    setHandoverStartConfirmDialogOpen(false);
  };

  const selectConstructionTemplate = (template: ConstructionTemplateOption) => {
    if (handoverReadOnly) {
      setConstructionTemplatePickerOpen(false);
      setConstructionTemplateSearch("");
      setHandoverMessage("开工交底已完成，只能查看内容。");
      return;
    }
    setHandoverForm((form) => ({
      ...form,
      ...makeHandoverConstructionTemplatePatch(template),
    }));
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
  };

  const saveHandover = async (status: "draft" | "completed", options?: { skipRequiredValidation?: boolean; silentCompletedMessage?: boolean }) => {
    if (!selected) return false;
    if (handoverReadOnly) {
      setHandoverMessage("开工交底已完成，只能查看内容。");
      return false;
    }
    if (status === "completed" && !options?.skipRequiredValidation) {
      if (!validateHandoverRequiredFields()) return false;
    }
    setHandoverMissingFields({});
    setSaving(true);
    setHandoverMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "save_handover",
          project_id: selected.id,
          ...handoverForm,
          status,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHandoverMessage(result.message || "保存开工交底失败");
        return false;
      }
      if (!options?.silentCompletedMessage) {
        setHandoverMessage(status === "completed" ? (designFeeHandoverWarning || "开工交底已完成，工地已进入开工确认") : "开工交底已暂存");
      }
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const confirmSiteStart = async (options?: { closeHandover?: boolean }) => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "confirm_site_start",
          project_id: selected.id,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(result.message || "开工确认失败");
        return;
      }
      await load();
      setActiveTab("phase");
      if (options?.closeHandover) closeHandoverModal();
      void loadConstructionTemplateOptions();
    } finally {
      setSaving(false);
    }
  };

  const confirmSiteStartFromHandover = async () => {
    if (!selected || saving) return;
    if (!validateHandoverRequiredFields()) return;
    setHandoverStartConfirmDialogOpen(true);
  };

  const submitSiteStartFromHandoverConfirm = async () => {
    if (!selected || saving) return;
    setHandoverStartConfirmDialogOpen(false);
    const saved = await saveHandover("completed", { skipRequiredValidation: true, silentCompletedMessage: true });
    if (!saved) return;
    await confirmSiteStart({ closeHandover: true });
  };

  const uploadHandoverFile = async (file?: File) => {
    if (!selected || !file) return;
    if (handoverReadOnly) {
      setHandoverMessage("开工交底已完成，只能查看内容。");
      return;
    }
    setUploadingCategory("开工交底资料");
    setHandoverMessage("");
    try {
      const formData = new FormData();
      formData.append("project_id", selected.id);
      formData.append("category", "开工交底资料");
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setHandoverMessage(result.message || "上传失败");
        return;
      }
      const files = await fetch(`/api/upload?project_id=${encodeURIComponent(selected.id)}`, { headers: getClientAuthHeaders() }).then((response) => response.json());
      setAttachments(Array.isArray(files) ? files : []);
      setHandoverMessage("交底资料已上传");
    } finally {
      setUploadingCategory("");
    }
  };

  const refreshProjectFiles = async () => {
    if (!selected) return;
    const files = await fetch(`/api/upload?project_id=${encodeURIComponent(selected.id)}`, { headers: getClientAuthHeaders() }).then((response) => response.json());
    setAttachments(Array.isArray(files) ? files : []);
  };

  const deleteHandoverFile = async (file: any) => {
    if (!file?.id) return;
    if (handoverReadOnly) {
      setHandoverMessage("开工交底已完成，只能查看内容。");
      return;
    }
    const confirmed = window.confirm(`确认删除“${file.file_name || "该附件"}”吗？`);
    if (!confirmed) return;
    setDeletingFileId(file.id);
    setHandoverMessage("");
    try {
      const res = await fetch(`/api/upload?id=${encodeURIComponent(file.id)}`, { method: "DELETE", headers: getClientAuthHeaders() });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHandoverMessage(result.message || "删除附件失败");
        return;
      }
      await refreshProjectFiles();
      setHandoverMessage("附件已删除");
    } finally {
      setDeletingFileId("");
    }
  };

  const uploadArchiveFile = async (file?: File) => {
    if (!selected || !file || !selectedArchiveRow) return;
    const category = `工地归档-${selectedArchiveRow.key}`;
    setUploadingCategory(category);
    setArchiveMessage("");
    try {
      const formData = new FormData();
      formData.append("project_id", selected.id);
      formData.append("category", category);
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMessage(result.message || "上传归档资料失败");
        return;
      }
      await refreshProjectFiles();
      setArchiveMessage("资料已归档");
    } finally {
      setUploadingCategory("");
    }
  };

  const addArchiveLink = async () => {
    if (!selected || !selectedArchiveRow) return;
    if (!canArchiveExternalLink) {
      setArchiveMessage(`${selectedArchiveRow.title}不支持外部链接归档，请上传资料文件。`);
      return;
    }
    if (!archiveLinkForm.url.trim()) {
      setArchiveMessage("请填写资料链接");
      return;
    }
    const category = `工地归档-${selectedArchiveRow.key}`;
    setSaving(true);
    setArchiveMessage("");
    try {
      const formData = new FormData();
      formData.append("project_id", selected.id);
      formData.append("category", category);
      formData.append("link_url", archiveLinkForm.url.trim());
      formData.append("link_name", archiveLinkForm.name.trim() || `${selectedArchiveRow.title}链接`);
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMessage(result.message || "归档链接失败");
        return;
      }
      setArchiveLinkForm(makeDefaultArchiveLinkForm());
      await refreshProjectFiles();
      setArchiveMessage("链接已归档");
    } finally {
      setSaving(false);
    }
  };

  const openArchiveContractSummary = (file: any) => {
    const contractId = getArchiveContractSummaryId(file);
    if (!contractId) return;
    const contract = contractsWithPaymentPlans.find((item: any) => item.id === contractId);
    if (!contract) {
      setArchiveMessage("未找到对应合同纪要");
      return;
    }
    setArchiveMessage("");
    setSummaryContract(contract);
  };

  const resetVrBuilder = () => {
    vrScenes.forEach((scene) => {
      if (scene.previewUrl && scene.previewUrl !== scene.existingImageUrl) URL.revokeObjectURL(scene.previewUrl);
    });
    setEditingVrTourId("");
    setVrTitle("");
    setVrScenes([makeDefaultVrSceneDraft()]);
  };

  const openVrBuilder = () => {
    resetVrBuilder();
    setArchiveCategory("水电VR全景");
    setArchiveMessage("");
    setVrTitle(`${siteDisplayName}水电VR全景`);
    setVrBuilderOpen(true);
  };

  const openVrTourEditor = async (file: any) => {
    const tourId = getVrTourIdFromAttachment(file);
    if (!tourId) {
      setArchiveMessage("未找到可编辑的水电VR全景链接");
      return;
    }
    setArchiveCategory("水电VR全景");
    setArchiveMessage("");
    setVrGenerating(true);
    setVrBuilderOpen(true);
    try {
      const response = await fetch(`/api/vr-tours/${encodeURIComponent(tourId)}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "读取水电VR全景失败");
      resetVrBuilder();
      setEditingVrTourId(tourId);
      setVrTitle(result.title || file.file_name?.replace(/链接$/, "") || `${siteDisplayName}水电VR全景`);
      const scenes = Array.isArray(result.scenes) && result.scenes.length > 0 ? result.scenes : [];
      setVrScenes((scenes.length > 0 ? scenes : [makeDefaultVrSceneDraft()]).map((scene: any, index: number) => ({
        id: String(scene.id || makeDefaultVrSceneDraft(index).id),
        name: String(scene.name || ""),
        file: null,
        previewUrl: String(scene.image_url || ""),
        existingImageUrl: String(scene.image_url || ""),
        existingFileName: String(scene.file_name || `${scene.name || `空间${index + 1}`}全景图`),
      })));
    } catch (err: any) {
      setArchiveMessage(err.message || "读取水电VR全景失败");
      setVrBuilderOpen(false);
    } finally {
      setVrGenerating(false);
    }
  };

  const updateVrScene = (id: string, patch: Partial<VrSceneDraft>) => {
    setVrScenes((scenes) => scenes.map((scene) => scene.id === id ? { ...scene, ...patch } : scene));
  };

  const chooseVrSceneFile = (id: string, file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setArchiveMessage("水电VR全景只能上传图片文件");
      return;
    }
    setVrScenes((scenes) => scenes.map((scene) => {
      if (scene.id !== id) return scene;
      if (scene.previewUrl && scene.previewUrl !== scene.existingImageUrl) URL.revokeObjectURL(scene.previewUrl);
      return { ...scene, file, previewUrl: URL.createObjectURL(file) };
    }));
  };

  const addVrScene = () => {
    setVrScenes((scenes) => [...scenes, makeDefaultVrSceneDraft(scenes.length)]);
  };

  const removeVrScene = (id: string) => {
    setVrScenes((scenes) => {
      const removed = scenes.find((scene) => scene.id === id);
      if (removed?.previewUrl && removed.previewUrl !== removed.existingImageUrl) URL.revokeObjectURL(removed.previewUrl);
      const next = scenes.filter((scene) => scene.id !== id);
      return next.length > 0 ? next : [makeDefaultVrSceneDraft()];
    });
  };

  const readImageRatio = (file: File) => new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const ratio = image.naturalWidth / Math.max(image.naturalHeight, 1);
      URL.revokeObjectURL(url);
      resolve(ratio);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });

  const generateVrTour = async () => {
    if (!selected) return;
    const filledScenes = vrScenes.filter((scene) => scene.file || scene.existingImageUrl);
    if (filledScenes.length === 0) {
      setArchiveMessage("请至少上传一个空间全景图");
      return;
    }
    const missingName = filledScenes.findIndex((scene) => !scene.name.trim());
    if (missingName >= 0) {
      setArchiveMessage(`请填写第 ${missingName + 1} 个空间名称`);
      return;
    }
    setVrGenerating(true);
    setArchiveMessage("");
    try {
      for (let index = 0; index < filledScenes.length; index += 1) {
        const file = filledScenes[index].file;
        if (!file) continue;
        const ratio = await readImageRatio(file);
        if (ratio < 1.85 || ratio > 2.15) {
          setArchiveMessage(`“${filledScenes[index].name || `空间${index + 1}`}”请上传2:1全景图片`);
          return;
        }
      }

      const uploadedScenes: any[] = [];
      for (const scene of filledScenes) {
        if (!scene.file && scene.existingImageUrl) {
          uploadedScenes.push({
            id: scene.id,
            name: scene.name.trim(),
            image_url: scene.existingImageUrl,
            file_name: scene.existingFileName || `${scene.name.trim()}全景图`,
          });
          continue;
        }
        const formData = new FormData();
        formData.append("project_id", selected.id);
        formData.append("category", "工地归档-水电VR全景");
        formData.append("skip_attachment", "1");
        formData.append("file", scene.file as File);
        const response = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "上传全景图片失败");
        uploadedScenes.push({
          id: scene.existingImageUrl ? scene.id : undefined,
          name: scene.name.trim(),
          image_url: result.file_url,
          file_name: result.file_name || scene.file?.name || `${scene.name.trim()}全景图`,
        });
      }

      const response = await fetch(editingVrTourId ? `/api/vr-tours/${encodeURIComponent(editingVrTourId)}` : "/api/vr-tours", {
        method: editingVrTourId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          project_id: selected.id,
          title: vrTitle.trim() || `${siteDisplayName}水电VR全景`,
          scenes: uploadedScenes,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "生成水电VR全景失败");

      setArchiveCategory("水电VR全景");
      setVrBuilderOpen(false);
      resetVrBuilder();
      await refreshProjectFiles();
      setArchiveMessage(editingVrTourId ? "水电VR全景链接已更新" : "水电VR全景链接已生成，可在列表中打开或复制");
    } catch (err: any) {
      setArchiveMessage(err.message || (editingVrTourId ? "保存水电VR全景失败" : "生成水电VR全景失败"));
    } finally {
      setVrGenerating(false);
    }
  };

  const openArchiveShare = async (file: any) => {
    const attachmentId = getArchiveShareAttachmentId(file);
    if (!attachmentId) {
      setArchiveMessage("该链接暂不支持分享");
      return;
    }
    setSharingArchiveFile(file);
    setArchiveShareMessage("");
    setArchiveShareLink("");
    setArchiveShareExpiresAt(null);
    setArchiveShareLookupLoading(true);
    try {
      const response = await fetch(`/api/archive-shares?attachment_id=${encodeURIComponent(attachmentId)}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "读取上一次分享失败");
      if (result.share?.share_url) {
        setArchiveShareLink(result.share.share_url);
        setArchiveShareExpiresAt(result.share.expires_at || null);
      } else {
        setArchiveShareLink("");
        setArchiveShareExpiresAt(null);
      }
    } catch (err: any) {
      setArchiveShareMessage(err.message || "读取上一次分享失败");
    } finally {
      setArchiveShareLookupLoading(false);
    }
  };

  const createArchiveShareLink = async () => {
    if (!sharingArchiveFile) return;
    const attachmentId = getArchiveShareAttachmentId(sharingArchiveFile);
    if (!attachmentId) return;
    setArchiveShareLoading(true);
    setArchiveShareMessage("");
    try {
      const response = await fetch("/api/archive-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachment_id: attachmentId, expiresIn: archiveShareExpiresIn }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "生成分享链接失败");
      setArchiveShareLink(result.share_url || "");
      setArchiveShareExpiresAt(result.expires_at || null);
      setArchiveShareMessage(archiveShareLink ? "新的分享链接已生成" : "分享链接已生成");
    } catch (err: any) {
      setArchiveShareMessage(err.message || "生成分享链接失败");
    } finally {
      setArchiveShareLoading(false);
    }
  };

  const copyArchiveShareLink = async () => {
    if (!archiveShareLink) return;
    try {
      await navigator.clipboard.writeText(archiveShareLink);
      setArchiveShareMessage("分享链接已复制");
    } catch {
      setArchiveShareMessage("当前浏览器不支持自动复制，请手动复制链接");
    }
  };

  const deleteArchiveFile = async (file: any) => {
    if (!file?.id) return;
    const confirmed = window.confirm(`确认删除“${file.file_name || "该资料"}”吗？`);
    if (!confirmed) return;
    setDeletingFileId(file.id);
    setArchiveMessage("");
    try {
      const res = await fetch(`/api/upload?id=${encodeURIComponent(file.id)}`, { method: "DELETE", headers: getClientAuthHeaders() });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMessage(result.message || "删除资料失败");
        return;
      }
      await refreshProjectFiles();
      setArchiveMessage("归档资料已删除");
    } finally {
      setDeletingFileId("");
    }
  };

  const openArchiveRename = (file: any) => {
    setRenamingArchiveFile(file);
    setArchiveRenameName(String(file?.file_name || ""));
    setArchiveMessage("");
  };

  const saveArchiveRename = async () => {
    if (!renamingArchiveFile) return;
    const nextName = archiveRenameName.trim();
    if (!nextName) {
      setArchiveMessage("请填写资料名称");
      return;
    }
    setArchiveRenameSaving(true);
    setArchiveMessage("");
    try {
      const response = await fetch("/api/upload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({ id: renamingArchiveFile.source_attachment_id || renamingArchiveFile.id, file_name: nextName }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setArchiveMessage(result.message || "重命名失败");
        return;
      }
      const renamedAttachmentId = String(renamingArchiveFile.source_attachment_id || renamingArchiveFile.id || "");
      const renamedFileName = String(result.file_name || nextName);
      setAttachments((files) => files.map((file) => (
        String(file.id || "") === renamedAttachmentId ? { ...file, file_name: renamedFileName } : file
      )));
      setData((current: any) => ({
        ...current,
        customerAttachments: Array.isArray(current.customerAttachments)
          ? current.customerAttachments.map((file: any) => (
              String(file.id || "") === renamedAttachmentId ? { ...file, file_name: renamedFileName } : file
            ))
          : current.customerAttachments,
      }));
      setRenamingArchiveFile(null);
      setArchiveRenameName("");
      await refreshProjectFiles();
      setArchiveMessage("资料名称已修改");
    } finally {
      setArchiveRenameSaving(false);
    }
  };

  const uploadPhasePhoto = async (file?: File, node?: PhaseNodeRow | null) => {
    if (!selected || !file || !currentPhaseKey) return;
    const targetNode = node || selectedPhaseNode;
    const category = getPhaseNodeUploadCategory(targetNode);
    setUploadingCategory(category);
    try {
      const formData = new FormData();
      formData.append("project_id", selected.id);
      formData.append("category", category);
      formData.append("stage_id", targetNode?.stage?.id || currentPhaseKey || "");
      formData.append("stage_name", targetNode?.stage?.name || currentPhaseLabel || "");
      formData.append("node_id", targetNode?.templateNode?.id || "");
      formData.append("node_name", targetNode?.name || "");
      formData.append("node_type", targetNode?.nodeType || "construction");
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      if (!res.ok) return;
      await refreshProjectFiles();
      await loadConstructionRecordEvents(selected.id, { silent: true });
    } finally {
      setUploadingCategory("");
    }
  };

  const updateProject = async (patch: any) => {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_project",
          project_id: selected.id,
          progress: selected.progress,
          current_phase: selected.current_phase,
          status: selected.status,
          site_stage: selected.site_stage,
          ...patch,
        }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const updatePhaseNodeStatus = async (node: PhaseNodeRow, status: "PENDING" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "SKIPPED") => {
    if (!selected) return;
    const stageId = node.stage?.id || currentPhaseKey;
    const stageName = node.stage?.name || currentPhaseLabel;
    if (!stageId || !stageName || !node.name) return;
    const fallbackStageIndex = phaseOverviewRows.find((row) => row.key === stageId)?.index;
    const stageSortOrder = node.stage?.sortOrder || (typeof fallbackStageIndex === "number" ? fallbackStageIndex + 1 : 1);
    setSaving(true);
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "update_construction_task_status",
          project_id: selected.id,
          stage_id: stageId,
          stage_name: stageName,
          stage_code: node.stage?.code || "",
          stage_sort_order: stageSortOrder,
          stage_node_count: phaseNodeRows.length || node.stage?.nodes.length || 0,
          node_id: node.templateNode?.id || node.id,
          node_name: node.templateNode?.name || node.name,
          node_type: node.templateNode?.type || node.nodeType,
          node_sort_order: node.templateNode?.sortOrder || node.index + 1,
          status,
          planned_start: node.plannedStart,
          planned_end: node.plannedEnd,
          planned_days: node.plannedDays,
          description: node.acceptance,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(result.message || "更新施工节点失败");
        return;
      }
      await load();
      await loadConstructionRecordEvents(selected.id, { silent: true });
    } finally {
      setSaving(false);
    }
  };

  const openCustomPhaseNodeDialog = () => {
    setCustomPhaseNodeMessage("");
    setCustomPhaseNodeForm({
      nodeType: "construction",
      name: "",
      description: "",
      plannedStart: "",
      plannedEnd: "",
    });
    setCustomPhaseNodeDialogOpen(true);
  };

  const addCustomPhaseNode = async () => {
    if (!selected || saving || isVirtualSite) return;
    const name = customPhaseNodeForm.name.trim();
    const description = customPhaseNodeForm.description.trim();
    if (!name) {
      setCustomPhaseNodeMessage("请填写节点名称");
      return;
    }
    if (phaseNodeRows.some((node) => normalizePlanText(node.name) === normalizePlanText(name))) {
      setCustomPhaseNodeMessage("当前阶段已存在同名节点");
      return;
    }
    if (customPhaseNodeForm.plannedStart && customPhaseNodeForm.plannedEnd && customPhaseNodeForm.plannedStart > customPhaseNodeForm.plannedEnd) {
      setCustomPhaseNodeMessage("计划结束时间不能早于开始时间");
      return;
    }
    const stageId = matchedCurrentTemplateStage?.id || currentPhaseKey;
    const stageName = matchedCurrentTemplateStage?.name || currentPhaseLabel;
    if (!stageId || !stageName || stageName === "-") {
      setCustomPhaseNodeMessage("请先选择施工阶段");
      return;
    }
    const fallbackStageIndex = phaseOverviewRows.find((row) => row.key === stageId)?.index;
    const stageSortOrder = matchedCurrentTemplateStage?.sortOrder || (typeof fallbackStageIndex === "number" ? fallbackStageIndex + 1 : 1);
    setSaving(true);
    setCustomPhaseNodeMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "add_construction_task_node",
          project_id: selected.id,
          stage_id: stageId,
          stage_name: stageName,
          stage_code: matchedCurrentTemplateStage?.code || "",
          stage_sort_order: stageSortOrder,
          node_name: name,
          node_type: customPhaseNodeForm.nodeType,
          description,
          planned_start: customPhaseNodeForm.plannedStart,
          planned_end: customPhaseNodeForm.plannedEnd,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCustomPhaseNodeMessage(result.message || "新增节点失败");
        return;
      }
      setCustomPhaseNodeDialogOpen(false);
      setCustomPhaseNodeForm({ nodeType: "construction", name: "", description: "", plannedStart: "", plannedEnd: "" });
      if (result.id) setSelectedPhaseNodeId(String(result.id));
      await load();
      await loadConstructionRecordEvents(selected.id, { silent: true });
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomPhaseNode = async () => {
    if (!selected || !phaseNodeDeleteTarget || saving || isVirtualSite) return;
    const node = phaseNodeDeleteTarget;
    if (node.templateNode || !node.fromTask) {
      setPhaseNodeDeleteMessage("模板节点不能删除，只能删除用户新增节点");
      return;
    }
    const stageId = node.stage?.id || currentPhaseKey;
    const stageName = node.stage?.name || currentPhaseLabel;
    setSaving(true);
    setPhaseNodeDeleteMessage("");
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "delete_construction_task_node",
          project_id: selected.id,
          task_id: node.id,
          stage_id: stageId,
          stage_name: stageName,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhaseNodeDeleteMessage(result.message || "删除节点失败");
        return;
      }
      setPhaseNodeDeleteTarget(null);
      setSelectedPhaseNodeId("");
      await load();
      await loadConstructionRecordEvents(selected.id, { silent: true });
    } finally {
      setSaving(false);
    }
  };

  const addLog = async (overrides: Partial<LogForm> = {}, nodeContext?: PhaseNodeRow | null) => {
    if (!selected) return false;
    const submitLogForm = { ...logForm, ...overrides };
    if (!submitLogForm.content.trim() && !submitLogForm.completed_work.trim()) {
      setLogMessage("请填写施工内容或今日完成事项");
      return false;
    }
    setSaving(true);
    setLogMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_log",
          project_id: selected.id,
          ...submitLogForm,
          stage_id: nodeContext?.stage?.id || submitLogForm.phase || "",
          stage_name: nodeContext?.stage?.name || "",
          node_id: nodeContext?.templateNode?.id || "",
          node_name: nodeContext?.name || "",
          node_type: nodeContext?.nodeType || "",
          photos: pendingLogPhotos.map((photo, index) => ({
            url: photo.file_url || photo.url,
            caption: photo.file_name || photo.caption || `施工照片${index + 1}`,
            sort_order: index,
          })),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLogMessage(result.message || "发布施工日志失败");
        return false;
      }
      setLogForm({ ...makeDefaultLogForm(), phase: submitLogForm.phase || currentPhaseKey || "" });
      setPendingLogPhotos([]);
      autoLogLocationRef.current = "";
      setSelectedQuickItems([]);
      setLogMessage("施工日志已发布");
      await load();
      if (activeTab === "records") await loadConstructionRecordEvents(selected.id, { silent: true });
      return true;
    } finally {
      setSaving(false);
    }
  };

  const deleteLog = async (log: any) => {
    if (!selected || !log?.id) return;
    const confirmed = window.confirm("确认删除这条施工日志吗？删除后列表中将不再显示。");
    if (!confirmed) return;
    setSaving(true);
    setLogMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_log", project_id: selected.id, id: log.id }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLogMessage(result.message || "删除施工日志失败");
        return;
      }
      setLogMessage("施工日志已删除");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const getCurrentLocation = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLogMessage("当前浏览器不支持定位");
      return;
    }
    setLocating(true);
    setLogMessage("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const fallbackName = `当前位置 ${latitude.toFixed(5)}, ${longitude.toFixed(5)} 附近`;
        let locationName = fallbackName;
        let locationAddress = "";
        try {
          const amapResponse = await fetch(`/api/location/reverse?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
          const amapResult = await amapResponse.json().catch(() => ({}));
          if (amapResponse.ok) {
            locationName = amapResult.location_name || fallbackName;
            locationAddress = amapResult.location_address || "";
          } else if (amapResponse.status === 503) {
            throw new Error("amap reverse geocode unavailable");
          } else {
            setLogForm((form) => ({
              ...form,
              location_name: fallbackName,
              location_address: "",
              latitude: String(latitude),
              longitude: String(longitude),
            }));
            setLocating(false);
            setLogMessage(amapResult.message || "高德定位失败，请检查 Key 配置");
            return;
          }
        } catch {
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&accept-language=zh-CN&namedetails=1&extratags=1`);
            const result = await response.json();
            const address = result?.address || {};
            const actualCommunity = pickCommunityFromGeocode(result);
            const road = address.road || address.pedestrian || address.footway || "";
            const district = address.city_district || address.suburb || address.village || address.town || address.county || "";
            locationName = actualCommunity
              ? [`${actualCommunity}附近`, road].filter(Boolean).slice(0, 2).join(" · ")
              : [road, district].filter(Boolean).slice(0, 2).join(" · ") || result?.display_name?.split(",")?.slice(0, 2).join(" · ") || fallbackName;
            locationAddress = result?.display_name || "";
          } catch {
            locationAddress = "";
          }
        }
        setLogForm((form) => ({
          ...form,
          location_name: locationName,
          location_address: locationAddress,
          latitude: String(latitude),
          longitude: String(longitude),
        }));
        setLocating(false);
        setLogMessage("已获取当前位置");
      },
      (error) => {
        setLocating(false);
        setLogMessage(error.code === error.PERMISSION_DENIED ? "定位权限被拒绝，请允许浏览器获取位置" : "获取定位失败，请稍后重试");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    if (activeTab !== "logs" || !selected?.id || isVirtualSite || locating || logForm.location_name) return;
    const autoKey = `${selected.id}:${logForm.log_date || toDateInputValue()}`;
    if (autoLogLocationRef.current === autoKey) return;
    autoLogLocationRef.current = autoKey;
    getCurrentLocation();
  }, [activeTab, selected?.id, isVirtualSite, locating, logForm.location_name, logForm.log_date]);

  const toggleQuickItem = (item: string) => {
    setSelectedQuickItems((items) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);
  };

  const appendQuickItems = (field: "completed_work" | "next_plan") => {
    if (selectedQuickItems.length === 0) {
      setLogMessage("请先选择施工事项");
      return;
    }
    const text = selectedQuickItems.map((item) => `- ${item}`).join("\n");
    setLogForm((form) => ({
      ...form,
      [field]: form[field].trim() ? `${form[field].trim()}\n${text}` : text,
    }));
    setSelectedQuickItems([]);
    setLogMessage(field === "completed_work" ? "已追加到今日完成" : "已追加到明日计划");
  };

  const appendLogContentPhrase = (text: string) => {
    setLogForm((form) => ({
      ...form,
      content: form.content.trim() ? `${form.content.trim()}\n${text}` : text,
    }));
    setLogMessage("已追加到施工内容");
  };

  const appendPhaseNodeCompletedPhrase = (text: string) => {
    setLogForm((form) => ({
      ...form,
      completed_work: form.completed_work.trim() ? `${form.completed_work.trim()}\n${text}` : text,
    }));
    setLogMessage("已追加到今日完成");
  };

  const uploadLogPhoto = async (file?: File) => {
    if (!selected || !file) return;
    setUploadingCategory("施工日志");
    setLogMessage("");
    try {
      const formData = new FormData();
      formData.append("project_id", selected.id);
      formData.append("category", `施工日志-${logForm.log_date || toDateInputValue()}`);
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: formData });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLogMessage(result.message || "上传施工照片失败");
        return;
      }
      setPendingLogPhotos((photos) => [...photos, result]);
      try {
        await refreshProjectFiles();
        setLogMessage("施工照片已上传，发布日志后会归档到本条记录");
      } catch {
        setLogMessage("施工照片已上传，发布日志后会归档到本条记录");
      }
    } finally {
      setUploadingCategory("");
    }
  };

  const addIssue = async () => {
    if (!selected || !issueTitle.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_issue",
          project_id: selected.id,
          title: issueTitle,
          category: currentPhaseLabel !== "-" ? currentPhaseLabel : "质量",
          stage_id: phaseNodeModalNode?.stage?.id || currentPhaseKey || "",
          stage_name: phaseNodeModalNode?.stage?.name || currentPhaseLabel || "",
          node_id: phaseNodeModalNode?.templateNode?.id || "",
          node_name: phaseNodeModalNode?.name || "",
          node_type: phaseNodeModalNode?.nodeType || "",
        }),
      });
      setIssueTitle("");
      await load();
      if (activeTab === "records") await loadConstructionRecordEvents(selected.id, { silent: true });
    } finally {
      setSaving(false);
    }
  };

  const openPhaseNodeModal = (node: PhaseNodeRow, mode: PhaseNodeModalMode) => {
    setSelectedPhaseNodeId(node.id);
    setPhaseNodeModal({ mode, nodeId: node.id });
    if (mode === "acceptance") {
      setAcceptanceReviewResults(buildEmptyAcceptanceReviewResults(node));
      setAcceptanceReviewMessage("");
    }
    if (mode === "log") {
      setLogMessage("");
      setLogForm((form) => ({
        ...form,
        phase: node.stage?.id || currentPhaseKey || form.phase,
        log_date: form.log_date || toDateInputValue(),
      }));
    }
    if (mode === "issue") {
      setIssueTitle("");
    }
  };

  const closePhaseNodeModal = () => {
    setPhaseNodeModal(null);
    setAcceptanceReviewMessage("");
  };

  const submitAcceptanceReview = async () => {
    if (!phaseNodeModalNode) return;
    const standards = phaseNodeModalNode.standardItems;
    if (standards.length > 0) {
      const missingItem = standards.find((item, index) => !acceptanceReviewResults[getAcceptanceStandardKey(item, index)]);
      if (missingItem) {
        setAcceptanceReviewMessage("请先为每条验收标准选择验收结果");
        return;
      }
    }
    const choices = standards.map((item, index) => acceptanceReviewResults[getAcceptanceStandardKey(item, index)]).filter(Boolean);
    const hasFailed = choices.includes("FAIL");
    const nextStatus = hasFailed ? "REVIEW" : "COMPLETED";
    await updatePhaseNodeStatus(phaseNodeModalNode, nextStatus);
    closePhaseNodeModal();
  };

  const submitPhaseNodeLog = async () => {
    const nodeName = phaseNodeModalNode?.name?.trim() || "";
    const rawCompletedWork = logForm.completed_work.trim();
    const taggedCompletedWork = nodeName && rawCompletedWork && !rawCompletedWork.includes(`【${nodeName}】`)
      ? `【${nodeName}】${rawCompletedWork}`
      : rawCompletedWork;
    const submitted = await addLog({
      phase: phaseNodeModalNode?.stage?.id || currentPhaseKey || logForm.phase,
      content: "",
      completed_work: taggedCompletedWork,
      next_plan: logForm.next_plan.trim(),
    }, phaseNodeModalNode);
    if (submitted) closePhaseNodeModal();
  };

  const addCostRecord = async () => {
    if (!selected) return;
    const amount = Number(costForm.amount);
    if (!costForm.name.trim()) {
      setCostMessage("请填写费用名称");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setCostMessage("支出金额必须大于 0");
      return;
    }
    setSaving(true);
    setCostMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_cost_record", project_id: selected.id, ...costForm, amount }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCostMessage(result.message || "保存成本支出失败");
        return;
      }
      setCostForm({ ...makeDefaultCostForm(), phase: currentPhaseKey || "" });
      setCostMessage("成本支出已记录");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addChangeOrder = async () => {
    if (!selected) return;
    const items = getValidChangeOrderItems(changeOrderForm);
    if (items.length === 0) {
      setChangeOrderMessage("请至少填写一条变更项目");
      return;
    }
    const itemsTotal = getChangeOrderAddAmountFromItems(items);
    const discountAmount = getChangeOrderFormDiscount(changeOrderForm);
    if (discountAmount > itemsTotal) {
      setChangeOrderMessage("优惠金额不能大于增项合计");
      return;
    }
    if (discountAmount > 0 && !changeOrderForm.discount_reason.trim()) {
      setChangeOrderMessage("请填写优惠说明");
      return;
    }
    setSaving(true);
    setChangeOrderMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "add_change_order",
          project_id: selected.id,
          ...changeOrderForm,
          items,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeOrderMessage(result.message || "新增变更单失败");
        return;
      }
      setChangeOrderForm(makeDefaultChangeOrderForm(currentPhaseKey || ""));
      setSelectedChangeOrderId(result.id || "");
      setChangeOrderFilter("all");
      setChangeOrderMessage("变更单已新增");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const createQuantityReview = async (payload: { title: string; phase: string; evidence_note: string; items: any[] }) => {
    if (!selected) throw new Error("missing-project");
    if (!payload.items.length) {
      setQuantityReviewMessage("请至少填写一条复核明细");
      throw new Error("empty-items");
    }
    setSaving(true);
    setQuantityReviewMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: "add_quantity_review",
          project_id: selected.id,
          ...payload,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuantityReviewMessage(result.message || "提交工程量复核失败");
        throw new Error(result.message || "submit-failed");
      }
      setQuantityReviewMessage("工程量复核单已提交");
      await load();
      return result;
    } finally {
      setSaving(false);
    }
  };

  const postQuantityReviewAction = async (review: any, action: string, successMessage: string) => {
    if (!selected || !review?.id) return;
    setSaving(true);
    setQuantityReviewMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({ action, project_id: selected.id, id: review.id }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuantityReviewMessage(result.message || "处理工程量复核失败");
        return;
      }
      setQuantityReviewMessage(successMessage);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const confirmQuantityReview = (review: any) => postQuantityReviewAction(review, "confirm_quantity_review", "复核单已确认");
  const generateQuantityReviewChangeOrder = (review: any) => postQuantityReviewAction(review, "generate_quantity_review_change_order", "已生成增减项单");
  const cancelQuantityReview = (review: any) => postQuantityReviewAction(review, "cancel_quantity_review", "复核单已作废");

  const makeChangeOrderEditForm = (order: any): ChangeOrderForm => ({
    discount_amount: formatPlainAmount(getChangeOrderDiscountAmount(order)),
    discount_reason: String(order?.discount_reason || ""),
    owner_confirmed: true,
    items: parseChangeOrderItems(order),
  });

  const openChangeOrderDetail = (order: any) => {
    setSelectedChangeOrderId(order.id);
    setChangeOrderEditMode(false);
    setChangeOrderEditForm(makeChangeOrderEditForm(order));
    setChangeOrderMessage("");
    setChangeOrderDetailOpen(true);
  };

  const startEditChangeOrder = (order: any) => {
    if (order?.status === "PENDING_APPROVAL" || order?.status === "PENDING_OWNER") {
      setChangeOrderMessage("审批中的变更单不能编辑，请等待审批完成或驳回后再编辑");
      return;
    }
    setChangeOrderEditForm(makeChangeOrderEditForm(order));
    setChangeOrderEditMode(true);
    setChangeOrderMessage("");
  };

  const cancelEditChangeOrder = () => {
    if (selectedChangeOrder) setChangeOrderEditForm(makeChangeOrderEditForm(selectedChangeOrder));
    setChangeOrderEditMode(false);
    setChangeOrderMessage("");
  };

  const saveChangeOrderEdit = async () => {
    if (!selected || !selectedChangeOrder) return;
    if (selectedChangeOrder.status === "PENDING_APPROVAL" || selectedChangeOrder.status === "PENDING_OWNER") {
      setChangeOrderMessage("审批中的变更单不能编辑，请等待审批完成或驳回后再编辑");
      return;
    }
    const items = getValidChangeOrderItems(changeOrderEditForm);
    if (items.length === 0) {
      setChangeOrderMessage("请至少填写一条变更项目");
      return;
    }
    const itemsTotal = getChangeOrderAddAmountFromItems(items);
    const discountAmount = getChangeOrderFormDiscount(changeOrderEditForm);
    if (discountAmount > itemsTotal) {
      setChangeOrderMessage("优惠金额不能大于增项合计");
      return;
    }
    if (discountAmount > 0 && !changeOrderEditForm.discount_reason.trim()) {
      setChangeOrderMessage("请填写优惠说明");
      return;
    }
    const ok = await postChangeOrderAction(
      selectedChangeOrder,
      "update_change_order",
      { ...changeOrderEditForm, items },
      "变更单已更新",
    );
    if (ok) setChangeOrderEditMode(false);
  };

  const updateChangeOrderItem = (index: number, patch: Partial<ChangeOrderItemForm>) => {
    setChangeOrderForm((form) => ({
      ...form,
      items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const addChangeOrderItem = () => {
    setChangeOrderForm((form) => ({
      ...form,
      items: [...form.items, makeDefaultChangeOrderItem(currentPhaseKey || "")],
    }));
  };

  const removeChangeOrderItem = (index: number) => {
    setChangeOrderForm((form) => ({
      ...form,
      items: form.items.length > 1 ? form.items.filter((_, itemIndex) => itemIndex !== index) : form.items,
    }));
  };

  const updateChangeOrderEditItem = (index: number, patch: Partial<ChangeOrderItemForm>) => {
    setChangeOrderEditForm((form) => ({
      ...form,
      items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const addChangeOrderEditItem = () => {
    setChangeOrderEditForm((form) => ({
      ...form,
      items: [...form.items, makeDefaultChangeOrderItem(currentPhaseKey || "")],
    }));
  };

  const removeChangeOrderEditItem = (index: number) => {
    setChangeOrderEditForm((form) => ({
      ...form,
      items: form.items.length > 1 ? form.items.filter((_, itemIndex) => itemIndex !== index) : form.items,
    }));
  };

  const postChangeOrderAction = async (order: any, action: string, payload: any = {}, successMessage = "操作成功") => {
    if (!selected || !order?.id) return false;
    setSaving(true);
    setChangeOrderMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({ action, project_id: selected.id, id: order.id, ...payload }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeOrderMessage(result.message || "操作失败");
        return false;
      }
      setChangeOrderMessage(successMessage);
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const handleSelectedChangeOrderApprovalAction = async (action: "approve" | "reject", signatureId = "", approvalComment = "") => {
    if (!selectedChangeOrderPendingApprovalStep) {
      setChangeOrderMessage("当前账号不是该节点审批人，不能处理审批");
      return;
    }
    if (!signatureId) {
      setChangeOrderSignatureApprovalAction(action);
      setChangeOrderSignatureApprovalOpen(true);
      return;
    }
    setSaving(true);
    setChangeOrderMessage("");
    try {
      const res = await fetch("/api/todos/change-order-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          id: selectedChangeOrderPendingApprovalStep.id,
          action,
          comment: action === "reject" ? approvalComment.trim() : (approvalComment.trim() || "同意"),
          signature_id: signatureId,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeOrderMessage(result.message || "审批处理失败");
        return;
      }
      setChangeOrderMessage(action === "approve" ? "审批已通过" : "审批已驳回");
      setChangeOrderSignatureApprovalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const printChangeOrder = (order: any) => {
    if (!selected || !order?.id) return;
    if (order.status === "CANCELLED") {
      setChangeOrderMessage("已作废的变更单无需打印");
      return;
    }
    const printWindow = window.open("", "_blank", "width=1040,height=820");
    if (!printWindow) {
      setChangeOrderMessage("浏览器拦截了打印窗口，请允许弹窗后重试");
      return;
    }
    const items = parseChangeOrderItems(order);
    const addAmount = getChangeOrderAddAmount(order);
    const deductAmount = getChangeOrderDeductAmount(order);
    const discountAmount = getChangeOrderDiscountAmount(order);
    const signedAmount = getChangeSignedAmount(order);
    const changeDate = order.created_at ? formatDate(order.created_at) : "-";
    const summaryDeductText = deductAmount > 0 ? `-${formatPlainAmount(deductAmount)}` : formatPlainAmount(0);
    const summaryDiscountText = discountAmount > 0 ? `-${formatPlainAmount(discountAmount)}` : formatPlainAmount(0);
    const companyName = user?.companyName || "装修工程管理系统";
    const statusText = changeOrderStatusLabels[order.status] || order.status || "-";
    const statusTone = order.status === "APPROVED" ? "approved" : order.status === "REJECTED" ? "rejected" : "pending";
    const approvalInstance = order?.approval || null;
    const rawApprovalSteps = (Array.isArray(approvalInstance?.steps) ? approvalInstance.steps : [])
      .slice()
      .sort((a: any, b: any) => {
        const sortCompare = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (sortCompare !== 0) return sortCompare;
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
    const manualApprovalSteps = rawApprovalSteps.length === 0 && (order.approved_by_name || order.status === "APPROVED" || order.status === "REJECTED")
      ? [{
        node_name: "内部审核",
        approver_name: order.approved_by_name || "内部审核",
        status: order.status === "APPROVED" ? "approved" : "rejected",
        comment: order.status === "REJECTED" ? order.rejected_reason : "同意",
        action_at: order.approved_at || order.updated_at,
        signature_url: "",
      }]
      : [];
    const printableApprovalSteps = rawApprovalSteps.length > 0 ? rawApprovalSteps : manualApprovalSteps;
    const printableApprovalGroups = rawApprovalSteps.length > 0
      ? groupChangeOrderApprovalSteps(rawApprovalSteps)
      : printableApprovalSteps.map((step: any, index: number) => ({
        key: `manual-${index}`,
        nodeName: step.node_name || "内部审核",
        approveMode: "any",
        steps: [step],
      }));
    const itemRows = items.length
      ? items.map((item, index) => {
        const isDeductItem = normalizeChangeLineType(item.change_type) === "DEDUCT";
        const lineAmount = getChangeOrderLineAmount(item);
        const lineAmountText = `${isDeductItem && lineAmount > 0 ? "-" : ""}${formatPlainAmount(lineAmount)}`;
        return `
          <tr>
            <td class="center muted">${index + 1}</td>
            <td class="center"><span class="type-tag ${isDeductItem ? "deduct" : "add"}">${isDeductItem ? "减项" : "增项"}</span></td>
            <td class="item-title">${escapeHtml(item.title || "-")}</td>
            <td>${escapeHtml(item.space || "-")}</td>
            <td class="item-note">${escapeHtml(item.description || "-")}</td>
            <td class="right number">${formatPlainAmount(Number(item.unit_price || 0) || 0)}</td>
            <td class="right number">${formatPlainQuantity(Number(item.quantity || 0) || 0)}</td>
            <td class="center">${escapeHtml(item.unit || "项")}</td>
            <td class="right number amount ${isDeductItem ? "negative" : "positive"}">${lineAmountText}</td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="9" class="empty">暂无变更明细</td></tr>`;
    const approvalRows = printableApprovalGroups.length
      ? printableApprovalGroups.map((group: any, index: number) => {
        const approvalStatus = getChangeOrderApprovalNodeStatus(group.steps, group.approveMode);
        const approvalStatusMeta = {
          approved: { label: "已通过", className: "approved" },
          rejected: { label: "已驳回", className: "rejected" },
          pending: { label: "待审批", className: "pending" },
          skipped: { label: "无需审批", className: "skipped" },
          waiting: { label: "未开始", className: "waiting" },
        }[approvalStatus] || { label: "未开始", className: "waiting" };
        const actionSteps = group.steps.filter((step: any) => step.comment || step.action_at || step.signature_signed_at || step.signature_url);
        const comments = actionSteps.filter((step: any) => {
          const comment = String(step.comment || "").trim();
          return comment && !["同意", "通过", "审批通过"].includes(comment);
        }).map((step: any) => {
          const name = step.signature_signer_name || step.approver_name || "审批人";
          return `<div class="approval-entry"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(step.comment)}</span></div>`;
        }).join("") || `<span class="signature-empty">-</span>`;
        const actionTimes = actionSteps.filter((step: any) => step.signature_signed_at || step.action_at).map((step: any) => {
          const name = step.signature_signer_name || step.approver_name || "审批人";
          const actionTime = step.signature_signed_at || step.action_at;
          return `<div class="approval-entry"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(formatDateTime(actionTime))}</span></div>`;
        }).join("") || `<span class="signature-empty">-</span>`;
        const signedSteps = group.steps.filter((step: any) => step.signature_url);
        const signatures = signedSteps.length
          ? `<div class="signature-list">${signedSteps.map((step: any) => {
            const signerName = step.signature_signer_name || step.approver_name || "审批人";
            return `<div class="signature-item"><img class="signature-image" src="${escapeHtml(step.signature_url)}" alt="${escapeHtml(signerName)}签名" /></div>`;
          }).join("")}</div>`
          : `<span class="signature-empty">-</span>`;
        return `
          <tr>
            <td class="center muted">${index + 1}</td>
            <td class="approval-node">${escapeHtml(group.nodeName || "内部审核")}</td>
            <td class="center"><span class="approval-status ${approvalStatusMeta.className}">${approvalStatusMeta.label}</span></td>
            <td class="approval-comment">${comments}</td>
            <td class="approval-time">${actionTimes}</td>
            <td class="signature-cell">${signatures}</td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="6" class="empty">暂无审批记录</td></tr>`;
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(order.change_no || "变更单")}</title>
          <style>
            * { box-sizing: border-box; }
            :root {
              --ink: #1f2937;
              --muted: #667085;
              --paper: #ffffff;
              --canvas: #eef2f6;
              --soft: #f5f7fa;
              --line: #cfd7e3;
              --line-strong: #98a2b3;
              --primary: #2f6feb;
              --danger: #dc2626;
              --success: #15803d;
            }
            body {
              margin: 0;
              background: var(--canvas);
              color: var(--ink);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
              font-size: 11px;
            }
            .sheet {
              width: 190mm;
              min-height: 270mm;
              margin: 16px auto;
              background: var(--paper);
              padding: 12mm 11mm 10mm;
              box-shadow: 0 14px 38px rgba(31, 41, 55, .12);
            }
            .header {
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              gap: 16px;
              border-bottom: 2px solid var(--ink);
              padding-bottom: 10px;
            }
            h1 {
              margin: 0;
              font-size: 22px;
              line-height: 1.2;
              letter-spacing: 4px;
              font-weight: 750;
            }
            .company-name {
              margin: 0 0 3px;
              color: var(--muted);
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0;
            }
            .document-meta {
              display: grid;
              gap: 3px;
              text-align: right;
            }
            .document-meta p { margin: 0; }
            .document-no {
              color: var(--ink);
              font-weight: 700;
            }
            .document-date { color: var(--muted); }
            .status-badge,
            .type-tag,
            .approval-status {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border: 1px solid transparent;
              border-radius: 3px;
              white-space: nowrap;
            }
            .status-badge {
              min-height: 20px;
              padding: 0 7px;
              font-size: 9px;
              font-weight: 700;
            }
            .status-badge.pending { border-color: #cddcff; background: #edf4ff; color: var(--primary); }
            .status-badge.approved { border-color: #abefc6; background: #ecfdf3; color: var(--success); }
            .status-badge.rejected { border-color: #fecdca; background: #fff1f2; color: var(--danger); }
            .info-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              margin-top: 12px;
              border: 1px solid var(--line);
              border-radius: 4px;
              overflow: hidden;
            }
            .info-item {
              min-height: 48px;
              border-right: 1px solid var(--line);
              border-bottom: 1px solid var(--line);
              padding: 7px 9px;
            }
            .info-item:nth-child(3n) { border-right: 0; }
            .info-item:nth-child(n + 4) { border-bottom: 0; }
            .info-item.wide { grid-column: span 2; }
            .info-item.wide + .info-item { border-right: 0; }
            .label {
              display: block;
              color: var(--muted);
              font-size: 9px;
              font-weight: 600;
              line-height: 14px;
            }
            .value {
              display: block;
              margin-top: 3px;
              color: var(--ink);
              font-size: 11px;
              font-weight: 650;
              line-height: 17px;
              word-break: break-word;
            }
            .summary {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              margin-top: 10px;
              overflow: hidden;
              border: 1px solid var(--line);
              border-radius: 4px;
            }
            .summary-item {
              min-height: 50px;
              border-right: 1px solid var(--line);
              padding: 7px 9px;
            }
            .summary-item:last-child { border-right: 0; }
            .summary-item.total { background: #fff7f7; }
            .summary-value {
              display: block;
              margin-top: 3px;
              color: var(--ink);
              font-size: 14px;
              font-weight: 750;
              line-height: 20px;
              font-variant-numeric: tabular-nums;
            }
            .summary-item.deduct .summary-value { color: var(--success); }
            .summary-item.discount .summary-value,
            .summary-item.total .summary-value { color: var(--danger); }
            .section {
              margin-top: 12px;
            }
            .section-title {
              display: flex;
              min-height: 28px;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              border-bottom: 1px solid var(--line-strong);
              margin-bottom: 0;
              color: var(--ink);
              font-size: 11px;
              font-weight: 750;
              break-after: avoid;
            }
            .section-title span:last-child {
              color: var(--muted);
              font-size: 9px;
              font-weight: 500;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              table-layout: fixed;
              font-size: 9px;
            }
            th, td {
              border-bottom: .6pt solid var(--line);
              padding: 6px 5px;
              vertical-align: middle;
              line-height: 1.4;
            }
            th {
              background: var(--soft);
              color: var(--muted);
              font-weight: 650;
              text-align: left;
            }
            thead { display: table-header-group; }
            tr { break-inside: avoid; }
            .center { text-align: center; }
            .right { text-align: right; }
            .muted { color: var(--muted); }
            .number { font-variant-numeric: tabular-nums; white-space: nowrap; }
            .item-title { font-weight: 700; }
            .item-note { color: var(--muted); word-break: break-word; }
            .amount { font-weight: 750; }
            .amount.positive { color: var(--danger); }
            .amount.negative { color: var(--success); }
            .type-tag {
              min-width: 34px;
              height: 18px;
              padding: 0 5px;
              font-size: 8px;
              font-weight: 700;
            }
            .type-tag.add { border-color: #fecdca; background: #fff1f2; color: var(--danger); }
            .type-tag.deduct { border-color: #abefc6; background: #ecfdf3; color: var(--success); }
            .empty {
              text-align: center;
              color: var(--muted);
              padding: 14px;
            }
            .notes {
              display: grid;
              grid-template-columns: 74px minmax(0, 1fr);
              border: 1px solid var(--line);
              border-radius: 4px;
              margin-top: 10px;
              overflow: hidden;
            }
            .notes-label {
              background: var(--soft);
              padding: 8px 9px;
              color: var(--muted);
              font-size: 9px;
              font-weight: 650;
            }
            .notes-content {
              border-left: 1px solid var(--line);
              padding: 8px 9px;
              color: var(--ink);
              font-size: 10px;
              line-height: 16px;
              white-space: pre-wrap;
            }
            .approval-node { font-weight: 650; }
            .approval-comment { color: var(--muted); word-break: break-word; }
            .approval-time { color: var(--muted); font-variant-numeric: tabular-nums; }
            .approval-entry {
              display: grid;
              gap: 1px;
              margin-bottom: 4px;
            }
            .approval-entry:last-child { margin-bottom: 0; }
            .approval-entry strong {
              color: var(--ink);
              font-size: 8px;
              font-weight: 650;
            }
            .approval-entry span {
              color: var(--muted);
              line-height: 1.35;
            }
            .approval-status {
              min-width: 40px;
              height: 18px;
              padding: 0 5px;
              font-size: 8px;
              font-weight: 700;
            }
            .approval-status.approved { border-color: #abefc6; background: #ecfdf3; color: var(--success); }
            .approval-status.rejected { border-color: #fecdca; background: #fff1f2; color: var(--danger); }
            .approval-status.pending { border-color: #cddcff; background: #edf4ff; color: var(--primary); }
            .approval-status.skipped,
            .approval-status.waiting { border-color: #d0d5dd; background: #f2f4f7; color: var(--muted); }
            .signature-cell { padding-top: 4px; padding-bottom: 4px; text-align: center; }
            .signature-list {
              display: flex;
              flex-wrap: wrap;
              align-items: flex-start;
              justify-content: center;
              gap: 4px 6px;
            }
            .signature-item {
              display: block;
              width: 74px;
            }
            .signature-image {
              display: block;
              width: 74px;
              height: 30px;
              max-width: 100%;
              margin: 0 auto;
              object-fit: contain;
              object-position: center;
              background: transparent;
            }
            .signature-empty { color: #98a2b3; }
            .confirmation {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-top: 14px;
              break-inside: avoid;
            }
            .confirmation-box {
              min-height: 58px;
              border-top: 1px solid var(--line-strong);
              padding-top: 6px;
            }
            .confirmation-label { color: var(--muted); font-size: 9px; font-weight: 600; }
            .confirmation-line { margin-top: 25px; color: var(--ink); font-size: 10px; }
            .document-footer {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              border-top: 1px solid var(--line);
              margin-top: 14px;
              padding-top: 6px;
              color: #98a2b3;
              font-size: 8px;
            }
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .sheet {
                width: auto;
                min-height: auto;
                margin: 0;
                padding: 0;
                box-shadow: none;
              }
            }
          </style>
        </head>
        <body>
          <article class="sheet">
            <header class="header">
              <div>
                <p class="company-name">${escapeHtml(companyName)}</p>
                <h1>工程变更单</h1>
              </div>
              <div class="document-meta">
                <p><span class="status-badge ${statusTone}">${escapeHtml(statusText)}</span></p>
                <p class="document-no">单号 ${escapeHtml(order.change_no || "-")}</p>
                <p class="document-date">创建日期 ${escapeHtml(changeDate)}</p>
              </div>
            </header>

            <section class="info-grid">
              <div class="info-item"><span class="label">客户姓名</span><span class="value">${escapeHtml(selected.customer_name || "-")}</span></div>
              <div class="info-item"><span class="label">房号</span><span class="value">${escapeHtml(siteCustomerRoomNumber || "-")}</span></div>
              <div class="info-item"><span class="label">变更类型</span><span class="value">${escapeHtml(getChangeOrderTypeTitle(order))}</span></div>
              <div class="info-item wide"><span class="label">工地地址</span><span class="value">${escapeHtml(siteAddress || "-")}</span></div>
              <div class="info-item"><span class="label">创建人</span><span class="value">${escapeHtml(order.created_by_name || "系统创建")}</span></div>
            </section>

            <section class="summary">
              <div class="summary-item"><span class="label">增项合计</span><span class="summary-value">${formatPlainAmount(addAmount)}</span></div>
              <div class="summary-item deduct"><span class="label">减项合计</span><span class="summary-value">${summaryDeductText}</span></div>
              <div class="summary-item discount"><span class="label">优惠金额</span><span class="summary-value">${summaryDiscountText}</span></div>
              <div class="summary-item ${signedAmount < 0 ? "deduct" : "total"}"><span class="label">最终应收</span><span class="summary-value">${formatSignedPlainAmount(signedAmount)}</span></div>
            </section>

            <section class="section">
              <div class="section-title"><span>变更项目明细</span><span>共 ${items.length} 项</span></div>
              <table>
                <colgroup>
                  <col style="width: 4%" />
                  <col style="width: 7%" />
                  <col style="width: 22%" />
                  <col style="width: 10%" />
                  <col style="width: 22%" />
                  <col style="width: 10%" />
                  <col style="width: 7%" />
                  <col style="width: 6%" />
                  <col style="width: 12%" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="center">序号</th>
                    <th class="center">类型</th>
                    <th>变更项目</th>
                    <th>空间</th>
                    <th>施工说明</th>
                    <th class="right">单价</th>
                    <th class="right">数量</th>
                    <th class="center">单位</th>
                    <th class="right">金额</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>
            </section>

            ${(discountAmount > 0 && order.discount_reason) || order.description ? `
              <section class="notes">
                <div class="notes-label">说明</div>
                <div class="notes-content">${escapeHtml([
                  discountAmount > 0 && order.discount_reason ? `优惠说明：${order.discount_reason}` : "",
                  order.description ? `备注：${order.description}` : "",
                ].filter(Boolean).join("\n"))}</div>
              </section>
            ` : ""}

            <section class="section approval-section">
              <div class="section-title"><span>审批记录与签字</span><span>${escapeHtml(approvalInstance?.flow_name || "内部审核")}</span></div>
              <table>
                <colgroup>
                  <col style="width: 4%" />
                  <col style="width: 18%" />
                  <col style="width: 12%" />
                  <col style="width: 20%" />
                  <col style="width: 20%" />
                  <col style="width: 26%" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="center">序号</th>
                    <th>审批节点</th>
                    <th class="center">状态</th>
                    <th>审批意见</th>
                    <th>审批时间</th>
                    <th class="center">签字</th>
                  </tr>
                </thead>
                <tbody>${approvalRows}</tbody>
              </table>
            </section>

            <section class="confirmation">
              <div class="confirmation-box">
                <span class="confirmation-label">客户确认</span>
                <p class="confirmation-line">签字：________________</p>
              </div>
              <div class="confirmation-box">
                <span class="confirmation-label">项目负责人确认</span>
                <p class="confirmation-line">签字：________________　日期：____________</p>
              </div>
            </section>

            <footer class="document-footer">
              <span>${escapeHtml(companyName)}</span>
              <span>本单据由系统生成，审批记录以系统留痕为准</span>
            </footer>
          </article>
          <script>
            window.onload = function() {
              var images = Array.prototype.slice.call(document.images || []);
              Promise.all(images.map(function(image) {
                if (image.complete) return Promise.resolve();
                return new Promise(function(resolve) {
                  image.onload = resolve;
                  image.onerror = resolve;
                });
              })).then(function() {
                window.focus();
                window.print();
              });
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setChangeOrderMessage("已打开变更单打印页");
  };

  const cancelChangeOrder = async (order: any) => {
    const confirmed = window.confirm(`确认作废“${order?.title || "该变更单"}”吗？作废后不会计入结算。`);
    if (!confirmed) return;
    postChangeOrderAction(order, "cancel_change_order", { reason: "手动作废" }, "变更单已作废");
  };

  const updateMaterialOrderLine = (index: number, patch: Partial<MaterialOrderLine>) => {
    setMaterialOrderForm((form) => ({
      ...form,
      items: form.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const updateMaterialOrderType = (orderType: string) => {
    setMaterialOrderForm((form) => {
      const nextStatus = orderType === "AUXILIARY_WAREHOUSE" ? "PENDING" : orderType === "AUXILIARY_MONTHLY" ? "RECEIVED" : "ORDERED";
      const nextSettlementStatus = orderType === "AUXILIARY_WAREHOUSE" ? "SETTLED" : "UNSETTLED";
      return {
        ...form,
        order_type: orderType,
        status: nextStatus,
        settlement_status: nextSettlementStatus,
        supplier_id: "",
        paid_amount: orderType === "AUXILIARY_WAREHOUSE" ? "" : form.paid_amount,
        items: [{ material_id: "", quantity: "", unit_price: "", received_qty: "", remark: "" }],
      };
    });
  };

  const selectMaterialForLine = (index: number, materialId: string) => {
    const material = materialCatalog.find((item: any) => item.id === materialId);
    updateMaterialOrderLine(index, {
      material_id: materialId,
      unit_price: material ? String(Number(material.unit_price || 0)) : "",
      received_qty: materialOrderForm.items[index]?.quantity || "",
    });
    if (!materialOrderForm.supplier_id && material?.supplier_id) {
      setMaterialOrderForm((form) => ({ ...form, supplier_id: material.supplier_id }));
    }
  };

  const addMaterialOrderLine = () => {
    setMaterialOrderForm((form) => ({
      ...form,
      items: [...form.items, { material_id: "", quantity: "", unit_price: "", received_qty: "", remark: "" }],
    }));
  };

  const removeMaterialOrderLine = (index: number) => {
    setMaterialOrderForm((form) => ({
      ...form,
      items: form.items.length <= 1 ? form.items : form.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addMaterialOrder = async () => {
    if (!selected) return;
    const validItems = materialOrderForm.items.filter((item) => item.material_id && Number(item.quantity || 0) > 0);
    if (validItems.length === 0) {
      setMaterialOrderMessage("请至少选择一个材料并填写下单数量");
      return;
    }
    if (materialOrderForm.order_type === "AUXILIARY_WAREHOUSE") {
      const quantityByMaterial = validItems.reduce<Record<string, number>>((result, item) => {
        result[item.material_id] = (result[item.material_id] || 0) + Math.max(0, Number(item.quantity || 0) || 0);
        return result;
      }, {});
      const insufficientEntry = Object.entries(quantityByMaterial).find(([materialId, quantity]) => {
        const material = materialCatalog.find((row: any) => row.id === materialId);
        return material && quantity > Number(material.stock || 0);
      });
      if (insufficientEntry) {
        const material = materialCatalog.find((row: any) => row.id === insufficientEntry[0]);
        setMaterialOrderMessage(`「${material?.name || "材料"}」库存不足，当前库存 ${formatPlainQuantity(Number(material?.stock || 0))}，下单数量 ${formatPlainQuantity(insufficientEntry[1])}`);
        return;
      }
    }
    setSaving(true);
    setMaterialOrderMessage("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_material_order",
          project_id: selected.id,
          ...materialOrderForm,
          settlement_month: materialOrderForm.settlement_month || materialOrderForm.order_date.slice(0, 7),
          items: validItems.map((item) => ({
            material_id: item.material_id,
            quantity: Math.max(0, Number(item.quantity || 0) || 0),
            unit_price: Math.max(0, Number(item.unit_price || 0) || 0),
            received_qty: materialOrderForm.order_type === "AUXILIARY_MONTHLY"
              ? Math.max(0, Number(item.quantity || 0) || 0)
              : Math.max(0, Number(item.quantity || 0) || 0),
            remark: item.remark,
          })),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMaterialOrderMessage(result.message || "新增材料下单失败");
        return;
      }
      setMaterialOrderForm(makeDefaultMaterialOrderForm());
      setMaterialOrderMessage("材料下单记录已新增");
      setSelectedMaterialOrderId(result.id || "");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const showMaterialImagePreview = (event: any, image: string, item: any) => {
    if (!image) return;
    setMaterialImagePreview({
      src: image,
      name: item?.material_name || item?.name || "材料图片",
      spec: getMaterialSpecText(item),
      x: event.clientX,
      y: event.clientY,
    });
  };

  const copyCheckinLink = async () => {
    if (!checkinUrl) return;
    setCheckinMessage("");
    try {
      await navigator.clipboard.writeText(checkinUrl);
      setCheckinMessage("签到链接已复制");
    } catch {
      setCheckinMessage("复制失败，请手动复制链接");
    }
  };

  const downloadCheckinQr = () => {
    if (!checkinQrUrl || !selected) return;
    const link = document.createElement("a");
    link.href = makeQrCodeUrl(checkinUrl, 720);
    link.download = `${toSafeFileName(siteDisplayName)}_签到码.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setCheckinMessage("已开始下载签到码");
  };

  const printCheckinCard = () => {
    if (!checkinQrUrl || !selected) return;
    const printWindow = window.open("", "_blank", "width=760,height=920");
    if (!printWindow) {
      setCheckinMessage("浏览器拦截了打印窗口，请允许弹窗后重试");
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(siteDisplayName)}工地签到码</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #eef2f6;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
              color: #111827;
            }
            .card {
              width: 430px;
              border: 1px solid #111827;
              border-radius: 22px;
              overflow: hidden;
              background: #fff;
              box-shadow: 0 24px 70px rgba(17,24,39,.18);
            }
            .top {
              padding: 22px 24px 18px;
              background: linear-gradient(135deg, #0f766e, #0f172a);
              color: #fff;
            }
            .brand { font-size: 13px; letter-spacing: .08em; opacity: .72; text-transform: uppercase; }
            h1 { margin: 10px 0 0; font-size: 25px; line-height: 1.25; }
            .addr { margin-top: 8px; font-size: 13px; line-height: 1.6; opacity: .82; }
            .qr-wrap { padding: 26px 24px 18px; text-align: center; }
            .qr {
              display: inline-flex;
              padding: 14px;
              border: 1px solid #d1d5db;
              border-radius: 20px;
              background: #fff;
            }
            .qr img { width: 250px; height: 250px; display: block; }
            .tip { margin: 14px 0 0; font-size: 18px; font-weight: 800; }
            .sub { margin-top: 6px; font-size: 13px; color: #4b5563; }
            .meta {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 0;
              border-top: 1px solid #d1d5db;
              background: #f8fafc;
            }
            .meta div { padding: 12px 16px; border-right: 1px solid #d1d5db; }
            .meta div:nth-child(2n) { border-right: 0; }
            .label { font-size: 11px; color: #6b7280; }
            .value { margin-top: 4px; font-size: 13px; font-weight: 700; color: #111827; }
            .foot { padding: 14px 18px; border-top: 1px solid #d1d5db; font-size: 12px; color: #4b5563; text-align: center; }
            @media print {
              body { background: #fff; }
              .card { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <article class="card">
            <section class="top">
              <div class="brand">${escapeHtml(selected.company_name || "装修管家")}</div>
              <h1>${escapeHtml(siteDisplayName || "工地签到")}</h1>
              <div class="addr">${escapeHtml(siteAddress || "扫码完成工地现场签到")}</div>
            </section>
            <section class="qr-wrap">
              <div class="qr"><img src="${escapeHtml(makeQrCodeUrl(checkinUrl, 520))}" alt="工地签到二维码" /></div>
              <p class="tip">微信扫码 · 现场签到</p>
              <p class="sub">一工地一码，固定使用，请张贴在工地入口或材料堆放区附近。</p>
            </section>
            <section class="meta">
              <div><p class="label">签到码</p><p class="value">${escapeHtml(checkinCode?.code || "-")}</p></div>
              <div><p class="label">状态</p><p class="value">${checkinCode?.status === "active" ? "有效" : "已停用"}</p></div>
              <div><p class="label">创建时间</p><p class="value">${escapeHtml(formatDateTime(checkinCode?.created_at))}</p></div>
              <div><p class="label">项目经理</p><p class="value">${escapeHtml(selected.manager_name || "-")}</p></div>
            </section>
            <section class="foot">扫码后请填写姓名、手机号和身份，便于后台核对现场人员。</section>
          </article>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setCheckinMessage("已打开签到码打印页");
  };

  if (loading) {
    return <div className="enterprise-detail-ui site-management-ui flex min-h-96 items-center justify-center text-[#6B7280]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载工地...</div>;
  }

  const siteDetailContentStyle = siteDetailContentHeight > 0 ? { height: `${siteDetailContentHeight}px` } : undefined;

  return (
    <div className="enterprise-detail-ui site-management-ui -m-5 min-h-[calc(100vh-72px)] w-auto min-w-0 space-y-4 bg-[#F5F7FB] p-4 text-[#1F2937] sm:p-5 lg:-m-7 lg:p-6">
      <Link href="/site" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7280] transition hover:text-[#407AFF]">
          <ArrowLeft className="h-4 w-4" />
          返回工地列表
      </Link>

      {selected ? (
        <main className="min-w-0 space-y-4">
          <div className="site-detail-top-shell">
            <section className="site-detail-hero px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="truncate text-xl font-black text-surface-950">{siteDisplayName}</h1>
                      <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">{siteStageDisplay}</span>
                      {openIssues.length > 0 && <span className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">{openIssues.length} 个待整改</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-surface-500">
                      <span className="flex items-center gap-1"><Home className="h-3.5 w-3.5" />{selected.customer_name || "-"}</span>
                      <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{selected.manager_name || "未设项目经理"}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{siteAddress || "未填地址"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHandoverStartConfirmMode(false);
                      setHandoverModalOpen(true);
                      if (!handoverReadOnly && !constructionTemplateLoading) {
                        void loadConstructionTemplateOptions();
                      }
                    }}
                    className={`${handoverCompleted || selected.site_stage === "START_CONFIRM" ? "btn-secondary" : "btn-primary"} site-detail-header-button inline-flex items-center gap-2 px-4 text-sm`}
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    {handoverActionText}
                  </button>
                  {selected.site_stage === "START_CONFIRM" && (
                    <button
                      type="button"
                      onClick={() => {
                        setHandoverStartConfirmMode(true);
                        setHandoverModalOpen(true);
                        if (!constructionTemplateLoading) {
                          void loadConstructionTemplateOptions();
                        }
                      }}
                      disabled={saving || isVirtualSite}
                      className="btn-primary site-detail-header-button inline-flex items-center gap-2 px-4 text-sm disabled:opacity-50"
                    >
                      <CircleCheck className="h-4 w-4" />
                      开工确认
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="site-tab-shell system-page-tabs-shell overflow-hidden">
              <div className="system-page-tabs" data-site-tabs aria-label="工地详情导航">
                {siteTabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleSiteTabClick(tab.key)}
                      data-active={isActive ? "true" : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className="system-page-tab"
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {(activeTab === "overview" || activeTab === "payments") && (
            <section
              ref={siteDetailContentRef}
              className={`${activeTab === "overview" ? `customer-detail-soft-ui ${overviewStyles.workspace}` : `customer-detail-soft-ui ${paymentStyles.page}`} max-lg:!h-auto ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`}
              style={siteDetailContentStyle}
            >
              <div className={activeTab === "overview" ? overviewStyles.topGrid : undefined}>
                  {activeTab === "overview" && (
                  <section className={overviewStyles.panel}>
                    <header className={overviewStyles.panelHeader}>
                      <h3 className={overviewStyles.panelTitle}>
                        <span className={overviewStyles.panelTitleIcon}><Home className="h-4 w-4" /></span>
                        工地与客户信息
                      </h3>
                    </header>
                    <div className={overviewStyles.infoBody}>
                      <div className={overviewStyles.infoGrid}>
                      <InfoRow icon={CustomerProfileIcon} iconBadgeClassName="material-category-icon-general" label="客户姓名" value={selected.customer_name || "-"} />
                      <InfoRow icon={MobilePhoneIcon} iconBadgeClassName="material-category-icon-strong-cable" label="手机号" value={selected.customer_phone || "-"} />
                      <InfoRow icon={WechatBubbleIcon} iconBadgeClassName="material-category-icon-sanitary" label="微信号" value={selected.customer_weixin || "-"} />
                      <InfoRow icon={CommunityIcon} iconBadgeClassName="material-category-icon-cement" label="小区/楼盘" value={selected.customer_address || "-"} />
                      <InfoRow icon={RoomCardIcon} iconBadgeClassName="material-category-icon-tile" label="房号" value={siteCustomerRoomNumber || "-"} />
                      <InfoRow icon={BuildingNoIcon} iconBadgeClassName="material-category-icon-board" label="楼栋" value={selected.customer_no_room_number ? "暂无房号" : selected.customer_building_no || "-"} />
                      <InfoRow icon={UnitDoorIcon} iconBadgeClassName="material-category-icon-door" label="单元" value={selected.customer_no_room_number ? "暂无房号" : selected.customer_unit_no || "-"} />
                      <InfoRow icon={BedroomIcon} iconBadgeClassName="material-category-icon-floor-door" label="房室" value={selected.customer_no_room_number ? "暂无房号" : selected.customer_room_no || "-"} />
                      <InfoRow icon={AreaMeasureIcon} iconBadgeClassName="material-category-icon-tile-stone" label="装修面积" value={siteCustomerArea ? `${siteCustomerArea}㎡` : "-"} />
                      <InfoRow icon={LayoutIcon} iconBadgeClassName="material-category-icon-floor" label="户型" value={selected.house_type || "-"} />
                      <InfoRow icon={DecorationIcon} iconBadgeClassName="material-category-icon-carpentry" label="装修类型" value={selected.decoration_type || selected.style || "-"} />
                      <InfoRow icon={CreateTimeIcon} iconBadgeClassName="material-category-icon-general" label="签约工期" value={signedDurationDays > 0 ? `${signedDurationDays}天` : "-"} />
                      <InfoRow icon={CreateTimeIcon} iconBadgeClassName="material-category-icon-general" label="创建时间" value={siteCustomerCreatedAt ? formatDate(siteCustomerCreatedAt) : "-"} />
                      <InfoRow icon={CreateTimeIcon} iconBadgeClassName="material-category-icon-general" label="计划开工" value={selected.start_date ? formatDate(selected.start_date) : projectInfo.planned_start ? formatDate(projectInfo.planned_start) : "-"} />
                      <InfoRow icon={CreateTimeIcon} iconBadgeClassName="material-category-icon-general" label="计划完工" value={selected.planned_end_date ? formatDate(selected.planned_end_date) : projectInfo.planned_end ? formatDate(projectInfo.planned_end) : "-"} />
                      <InfoRow icon={DecorationIcon} iconBadgeClassName="material-category-icon-carpentry" label="施工阶段" value={siteConstructionStage} />
                      <InfoRow icon={StoreFrontIcon} iconBadgeClassName="material-category-icon-cabinet" label="服务门店" value={selected.service_store || "-"} />
                      <InfoRow icon={AddressPinIcon} iconBadgeClassName="material-category-icon-drain-pipe" label="房屋地址" value={selected.customer_house_address || "-"} wide />
                      <div className={overviewStyles.contractArea}>
                        <ContractNumberInfoRow contracts={signedContracts} />
                        <ContractTitleInfoRow contracts={signedContracts.length > 0 ? signedContracts : contracts} />
                      </div>
                      </div>
                      {(selected.description || selected.customer_requirements || projectInfo.construction_scope) && (
                        <div className={overviewStyles.noteBand}>
                          <p className={overviewStyles.noteLabel}>施工范围 / 客户要求</p>
                          <p className={overviewStyles.noteValue}>{selected.description || projectInfo.construction_scope || selected.customer_requirements}</p>
                        </div>
                      )}
                    </div>
                  </section>
                  )}

                  {activeTab === "payments" && (
                  <div className={paymentStyles.workspace}>
                    <section className={paymentStyles.summaryPanel}>
                      <div className={paymentStyles.metricGrid}>
                        <div className={paymentStyles.metric}>
                          <p className={paymentStyles.metricLabel}>合同金额</p>
                          <p className={paymentStyles.metricValue}>{formatPlainAmount(contractAmount)}</p>
                          <p className={paymentStyles.metricHint}>不含增减项</p>
                        </div>
                        <div className={paymentStyles.metric}>
                          <p className={paymentStyles.metricLabel}>已收合计</p>
                          <p className={paymentStyles.metricValue} data-tone="success">{formatPlainAmount(receivedAmount)}</p>
                          <p className={paymentStyles.metricHint}>合同款、定金、设计费及增减项</p>
                        </div>
                        <div className={paymentStyles.metric}>
                          <p className={paymentStyles.metricLabel}>待收金额</p>
                          <p className={paymentStyles.metricValue} data-tone="danger">{formatPlainAmount(receivableAmount)}</p>
                          <p className={paymentStyles.metricHint}>扣除可抵扣定金后</p>
                        </div>
                        <div className={paymentStyles.metric}>
                          <p className={paymentStyles.metricLabel}>收款进度</p>
                          <p className={paymentStyles.metricValue} data-tone="primary">{receivedRate}%</p>
                          <p className={paymentStyles.metricHint}>按当前应收总额计算</p>
                        </div>
                      </div>
                    </section>

                    <div className={paymentStyles.contentGrid}>
                      <section className={`${paymentStyles.sectionPanel} ${paymentStyles.breakdownPanel}`}>
                        <div className={paymentStyles.sectionHeader}>
                          <h4 className={paymentStyles.sectionTitle}>款项构成</h4>
                          <span className={paymentStyles.sectionMeta}>5 项</span>
                        </div>
                        <div className={paymentStyles.breakdownList}>
                          <PaymentLine
                            label="定金金额"
                            value={depositReceivableAmount}
                            details={[
                              { label: "应收定金", value: depositReceivableAmount },
                              { label: "已收定金", value: receivedDepositAmount, tone: "green" },
                              ...(depositUnreceivedAmount > 0 ? [{ label: "定金未收", value: depositUnreceivedAmount, tone: "red" as const }] : []),
                              { label: "已抵扣", value: depositDeductAmount, tone: "brand" },
                              ...(depositUndeductedAmount > 0 ? [{ label: "可抵扣", value: depositUndeductedAmount, tone: "amber" as const }] : []),
                            ]}
                          />
                          <PaymentLine
                            label="设计金额"
                            value={designFeeReceivableAmount}
                            details={[
                              { label: "应收设计费", value: designFeeReceivableAmount },
                              { label: "已收", value: designFeeReceivedAmount, tone: "green" },
                              { label: "未收", value: designFeeUnreceivedAmount, tone: "red" },
                            ]}
                          />
                          <PaymentLine
                            label="增减项金额"
                            value={ownerConfirmedChangeAmount}
                            tone={ownerConfirmedChangeAmount > 0 ? "red" : ownerConfirmedChangeAmount < 0 ? "green" : undefined}
                            details={ownerConfirmedChangeAmount < 0 ? [
                              { label: "应收增减项金额", value: ownerConfirmedChangeAmount, tone: "green" },
                              { label: "已收", value: changeReceivedAmount, tone: "green" },
                              { label: "抵减", value: changeOffsetAmount, tone: "green" },
                            ] : [
                              { label: "应收增减项金额", value: ownerConfirmedChangeAmount },
                              { label: "已收", value: changeReceivedAmount, tone: "green" },
                              { label: "未收", value: changeUnreceivedAmount, tone: "red" },
                            ]}
                          />
                          <PaymentLine
                            label="待收金额"
                            value={receivableAmount}
                            tone="red"
                            emphasis="outstanding"
                            details={[
                              { label: "合同未收", value: contractUnreceivedAmount, tone: "red" },
                              ...(depositUnreceivedAmount > 0 ? [{
                                label: "定金未收",
                                value: depositUnreceivedAmount,
                                tone: "red" as const,
                              }] : []),
                              { label: "设计费未收", value: designFeeUnreceivedAmount, tone: designFeeUnreceivedAmount > 0 ? "red" : "gray" },
                              ownerConfirmedChangeAmount < 0
                                ? { label: "增减项抵减", value: changeOffsetAmount, tone: "green" }
                                : { label: "增减项未收", value: changeUnreceivedAmount, tone: changeUnreceivedAmount > 0 ? "red" : "gray" },
                              ...(depositUndeductedAmount > 0 ? [{ label: "可抵扣定金", value: depositUndeductedAmount, tone: "green" as const }] : []),
                            ]}
                          />
                          <PaymentLine
                            label="已收合计"
                            value={receivedAmount}
                            tone="green"
                            emphasis="received"
                            details={[
                              { label: "合同款", value: receivedPlanAmount, tone: "green" },
                              { label: "定金", value: receivedDepositAmount, tone: "green" },
                              { label: "设计费", value: designFeeReceivedAmount, tone: "green" },
                              { label: "增减项", value: changeReceivedAmount, tone: "green" },
                            ]}
                          />
                        </div>
                      </section>
                      <section className={`${paymentStyles.sectionPanel} ${paymentStyles.recentPanel}`}>
                          <div className={paymentStyles.sectionHeader}>
                            <h4 className={paymentStyles.sectionTitle}>最近收款记录</h4>
                            <button
                              type="button"
                              onClick={() => setReceiptRecordsOpen(true)}
                              disabled={allReceiptRecords.length === 0}
                              className={paymentStyles.recordsHeaderButton}
                            >
                              更多
                            </button>
                          </div>
                          <div className={paymentStyles.recentList}>
                            {receiptTimeline.map((record) => (
                              <div key={record.id} className="flex min-w-0 items-center justify-between gap-3 border-b border-surface-100 px-4 py-3 text-sm last:border-b-0">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-surface-800">{record.title}</p>
                                  <p className="mt-0.5 truncate text-xs text-surface-400">{record.date ? formatDate(record.date) : "-"}{record.note ? ` · ${record.note}` : ""}</p>
                                </div>
                                <span className="shrink-0 font-semibold tabular-nums text-red-600">{formatPlainAmount(record.amount)}</span>
                              </div>
                            ))}
                            {receiptTimeline.length === 0 && <div className="flex min-h-24 items-center justify-center text-sm text-surface-400">暂无收款记录</div>}
                          </div>
                      </section>

                      <div className={paymentStyles.stageColumn}>
                        <section className={paymentStyles.sectionPanel}>
                          <div className={paymentStyles.sectionHeader}>
                            <h4 className={paymentStyles.sectionTitle}>每期收款情况</h4>
                            <span className={paymentStyles.sectionMeta}>{paymentStageRows.length} 期</span>
                          </div>
                          {paymentStageRows.length > 0 ? (
                            <ThinScrollArea className={paymentStyles.tableViewport}>
                              <table className="w-full min-w-[560px] text-sm">
                                <thead className="bg-white text-xs font-medium text-surface-500">
                                  <tr className="border-b border-surface-200">
                                    <th className="px-3 py-2 text-left">期次</th>
                                    <th className="px-3 py-2 text-right">应收</th>
                                    <th className="px-3 py-2 text-right">已收</th>
                                    <th className="px-3 py-2 text-right">未收</th>
                                    <th className="px-3 py-2 text-center">状态</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-200">
                                  {paymentStageRows.map((stage: any) => (
                                    <tr key={stage.id}>
                                      <td className="px-3 py-2">
                                        <p className="font-medium text-surface-800">{stage.index}. {stage.milestone}</p>
                                        <p className="mt-0.5 text-xs text-surface-400">{stage.dueDate ? formatDate(stage.dueDate) : "未设置到期"}</p>
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-600">{formatPlainAmount(stage.expected)}</td>
                                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">{formatPlainAmount(stage.received)}</td>
                                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-surface-900">{formatPlainAmount(stage.unpaid)}</td>
                                      <td className="px-3 py-2 text-center">
                                        <PaymentStatusBadge tone={stage.tone} text={stage.status} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </ThinScrollArea>
                          ) : (
                            <EmptyText text="暂无收款计划" />
                          )}
                        </section>

                      </div>

                      <section className={`${paymentStyles.sectionPanel} ${paymentStyles.changePanel}`}>
                          <div className={paymentStyles.sectionHeader}>
                            <h4 className={paymentStyles.sectionTitle}>变更单流水</h4>
                            <span className={paymentStyles.sectionMeta}>{ownerConfirmedChangeOrders.length} 项</span>
                          </div>
                          <ThinScrollArea className={paymentStyles.tableViewport} scrollClassName="h-full w-full">
                            <table className="w-full min-w-[820px] text-sm">
                              <thead className="bg-white text-xs font-medium text-surface-500">
                                <tr className="border-b border-surface-200">
                                  <th className="w-[34%] px-3 py-2 text-left">变更单</th>
                                  <th className="w-[10%] px-3 py-2 text-center">类型</th>
                                  <th className="px-3 py-2 text-right">应收 / 抵减</th>
                                  <th className="px-3 py-2 text-right">已收</th>
                                  <th className="px-3 py-2 text-right">未收</th>
                                  <th className="px-3 py-2 text-center">状态</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-200">
                                {ownerConfirmedChangeOrders.map((order: any, index: number) => {
                                  const signedAmount = getChangeSignedAmount(order);
                                  const isDeduct = signedAmount < 0;
                                  const receivable = Math.max(0, signedAmount);
                                  const received = Math.min(receivable, Math.max(0, Number(order.received_amount || 0) || 0));
                                  const unpaid = Math.max(0, Math.round((receivable - received) * 100) / 100);
                                  const typeTitle = getChangeOrderTypeTitle(order);
                                  const statusText = isDeduct
                                    ? "已抵减"
                                    : receivable <= 0
                                      ? "无需收款"
                                      : unpaid <= 0.005
                                        ? "已收"
                                        : received > 0
                                          ? "部分收款"
                                          : "待收";
                                  const statusTone = isDeduct || (receivable > 0 && unpaid <= 0.005)
                                    ? "green"
                                    : received > 0 || receivable > 0
                                      ? "amber"
                                      : "gray";
                                  const typeTone = typeTitle === "减项" ? "deduct" : typeTitle === "增减项" ? "mixed" : "add";
                                  const orderTitle = String(order.title || getChangeOrderListTitle(order) || `变更单 ${index + 1}`).trim();
                                  const orderDate = order.approved_at || order.updated_at || order.created_at;
                                  return (
                                    <tr
                                      key={order.id || `${order.change_no}-${index}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        setSelectedChangeOrderId(order.id);
                                        setChangeOrderDetailOpen(true);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          setSelectedChangeOrderId(order.id);
                                          setChangeOrderDetailOpen(true);
                                        }
                                      }}
                                      className={paymentStyles.changeOrderRow}
                                    >
                                      <td className="px-3 py-2.5">
                                        <p className={paymentStyles.changeOrderTitle} title={orderTitle}>{orderTitle}</p>
                                        <p className={paymentStyles.changeOrderMeta}>
                                          <span>{order.change_no || "未编号"}</span>
                                          {orderDate && <span>{formatDate(orderDate)}</span>}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <span className={paymentStyles.changeTypeTag} data-tone={typeTone}>{typeTitle}</span>
                                      </td>
                                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${isDeduct ? "text-emerald-600" : "text-red-600"}`}>
                                        {isDeduct ? "-" : ""}{formatPlainAmount(Math.abs(signedAmount))}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-600">
                                        {isDeduct ? "--" : formatPlainAmount(received)}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-surface-900">
                                        {isDeduct ? "--" : formatPlainAmount(unpaid)}
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <PaymentStatusBadge tone={statusTone} text={statusText} />
                                      </td>
                                    </tr>
                                  );
                                })}
                                {ownerConfirmedChangeOrders.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-10 text-center text-surface-400">暂无变更单流水</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </ThinScrollArea>
                      </section>
                    </div>
                  </div>
                  )}
                  {activeTab === "overview" && (
                  <section className={`${overviewStyles.panel} ${overviewStyles.teamPanel}`}>
                    <header className={overviewStyles.panelHeader}>
                      <h3 className={overviewStyles.panelTitle}>
                        <span className={overviewStyles.panelTitleIcon}><UsersRound className="h-4 w-4" /></span>
                        服务团队
                      </h3>
                      <span className={overviewStyles.panelCount}>{serviceTeam.length} 人</span>
                    </header>
                    <div className={overviewStyles.teamList}>
                      {serviceTeam.length > 0 ? (
                        <div>
                          {serviceTeam.map((member: any) => {
                            const roleLabel = teamRoleLabels[member.role] || member.role || "团队成员";
                            const statusText = member.is_project_manager || member.role === "PM"
                              ? "工地负责人"
                              : member.is_default_advisor
                                ? "默认顾问"
                                : "已加入团队";
                            return (
                              <div key={`${member.role}_${member.user_id || member.user_name}`} className={overviewStyles.teamRow}>
                                <div className={overviewStyles.teamAvatar}>
                                  {member.user_avatar ? (
                                    <NativeImage src={member.user_avatar} alt={`${member.user_name || "团队成员"}头像`} className="h-full w-full object-cover" />
                                  ) : (
                                    getTeamMemberInitial(member.user_name)
                                  )}
                                </div>
                                <div className={overviewStyles.teamContent}>
                                  <div className={overviewStyles.teamIdentity}>
                                    <p className={overviewStyles.teamName}>{member.user_name || "未设置"}</p>
                                    <span className={overviewStyles.teamRole}>{roleLabel}</span>
                                    <span className={overviewStyles.teamStatus}>{statusText}</span>
                                  </div>
                                  <div className={overviewStyles.teamMeta}>
                                    <span className={overviewStyles.teamMetaItem}>
                                      <Building2 className="h-3.5 w-3.5" /> {getTeamDepartmentName(member)}
                                    </span>
                                    <span className={overviewStyles.teamMetaItem}>
                                      <Phone className="h-3.5 w-3.5" /> {member.user_phone || "未留电话"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={overviewStyles.emptyTeam}>暂无服务团队</div>
                      )}
                    </div>
                  </section>
                  )}
              </div>
            </section>
          )}

	          {handoverModalOpen && typeof document !== "undefined" && createPortal(
              <div className={handoverStyles.backdrop}>
                <div className={handoverStyles.dismissLayer} onClick={closeHandoverModal} />
	            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="handover-modal-title"
	              className={handoverStyles.shell}
	            >
	              <div className={handoverStyles.topPanel}>
                <div className={handoverStyles.header}>
                  <div className={handoverStyles.headerMain}>
                    <div className={handoverStyles.titleRow}>
                      <span className={handoverStyles.titleIcon}><ClipboardCheck className="h-4 w-4" /></span>
                      <h3 id="handover-modal-title" className={handoverStyles.title}>
                        {handoverReadOnly ? "查看开工交底" : handoverStartConfirmMode ? "开工确认复核" : "开工交底工作台"}
                      </h3>
                      <span className={`${handoverStyles.statusTag} ${handoverCompleted ? handoverStyles.statusCompleted : handoverStyles.statusPending}`}>
                        {handoverStartConfirmMode ? "确认后不可修改" : handoverCompleted ? "已完成交底" : "待完成交底"}
                      </span>
	                    </div>
	                    <div className={handoverStyles.metaRow}>
	                      <span className={handoverStyles.metaItem}><FileText className="h-3.5 w-3.5" />附件 {handoverFiles.length} 份</span>
	                      {currentHandover?.updated_at && <span className={handoverStyles.metaItem}><Clock className="h-3.5 w-3.5" />最近更新 {formatDate(currentHandover.updated_at)}</span>}
	                    </div>
                  </div>
                  <div className={handoverStyles.headerActions}>
                    {handoverMessage && (
                      <span className={`${handoverStyles.message} ${getHandoverMessageClass(handoverMessage)}`}>
                        {handoverMessage}
                      </span>
                    )}
                    {!handoverReadOnly && (
                      <>
                        <button type="button" onClick={() => saveHandover("draft")} disabled={saving} className={handoverStyles.secondaryButton}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          暂存
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (handoverStartConfirmMode) {
                              void confirmSiteStartFromHandover();
                            } else {
                              void saveHandover("completed");
                            }
                          }}
                          disabled={saving}
                          className={handoverStyles.primaryButton}
                          title={handoverStartConfirmMode ? "确认开工" : "完成交底"}
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          {handoverStartConfirmMode ? "确认开工" : "完成交底"}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={closeHandoverModal}
                      className={handoverStyles.closeButton}
                      title="关闭"
                      aria-label="关闭开工交底"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

	                <div className={handoverStyles.scheduleSection}>
	                  <div className={handoverStyles.sectionHeader}>
	                    <div className={handoverStyles.sectionHeading}>
	                      <span className={handoverStyles.sectionIcon}><CalendarDays className="h-4 w-4" /></span>
	                      <div className={handoverStyles.sectionCopy}>
	                        <h3 className={handoverStyles.sectionTitle}>开工排期确认</h3>
	                        <p className={handoverStyles.sectionSubtitle}>{handoverReadOnly ? "交底已锁定，排期和施工模板仅供查看。" : handoverStartConfirmMode ? "请再次核对施工模板、计划时间和交底内容，确认开工后将无法再次修改。" : "默认读取已提交合同的开工计划和施工日规则，完成交底后同步到工地。"}</p>
	                      </div>
	                    </div>
		                    {handoverForm.planned_end && (
		                      <span className={handoverStyles.endDate}>
		                        <CalendarDays className="h-3.5 w-3.5" />
		                        计划竣工 {handoverForm.planned_end}
		                      </span>
		                    )}
		                  </div>
				                  <div className={handoverStyles.scheduleGrid}>
			                    <label className={handoverStyles.field} data-handover-required-field="construction_template_id">
			                      <span className={handoverStyles.fieldLabel}>施工模板 <span className={handoverStyles.required}>*</span></span>
			                      <button
			                        type="button"
			                        onClick={() => {
                                  if (handoverReadOnly) return;
			                          setConstructionTemplatePickerOpen(true);
			                          if (!constructionTemplateLoading) {
			                            void loadConstructionTemplateOptions();
			                          }
			                        }}
			                        className={`${handoverRequiredFieldClassName("construction_template_id", handoverStyles.templateButton)} ${handoverReadOnly ? handoverStyles.controlReadOnly : ""}`}
			                        disabled={handoverReadOnly}
			                        title={selectedHandoverConstructionTemplate?.name || "选择施工模板"}
			                      >
			                        <span className={`${handoverStyles.controlText} ${selectedHandoverConstructionTemplate?.name ? "" : handoverStyles.controlMuted}`}>
			                          {selectedHandoverConstructionTemplate?.name || "选择施工模板"}
			                        </span>
				                        <ClipboardList className="h-4 w-4 shrink-0 text-primary-600" />
				                      </button>
				                    </label>
				                    <label className={handoverStyles.field}>
				                      <span className={handoverStyles.fieldLabel}>内部工期</span>
					                      <span
					                        className={`${handoverStyles.readonlyValue} ${handoverStyles.controlReadOnly}`}
					                        title={internalDurationTitle}
					                      >
				                        <span className={`${handoverStyles.controlText} ${internalDurationDays > 0 ? "" : handoverStyles.controlMuted}`}>
				                          {internalDurationText}
				                        </span>
				                      </span>
				                    </label>
				                    <label className={handoverStyles.field} data-handover-required-field="planned_start">
				                      <span className={handoverStyles.fieldLabel}>计划开工 <span className={handoverStyles.required}>*</span></span>
		                      <SystemDateInput
		                        value={handoverForm.planned_start}
	                        onChange={(nextValue) => updateHandoverSchedule({ planned_start: nextValue })}
	                        className={handoverRequiredFieldClassName("planned_start", handoverStyles.input)}
	                        disabled={handoverReadOnly}
		                      />
		                    </label>
		                    <label className={handoverStyles.field} data-handover-required-field="duration_days">
		                      <span className={handoverStyles.fieldLabel}>签约工期（天） <span className={handoverStyles.required}>*</span></span>
		                      <input
		                        type="number"
		                        min="1"
		                        step="1"
		                        value={handoverForm.duration_days}
		                        onChange={(event) => updateHandoverSchedule({ duration_days: event.target.value })}
		                        className={handoverRequiredFieldClassName("duration_days", handoverStyles.input)}
		                        placeholder="请输入签约工期"
		                        disabled={handoverReadOnly}
		                      />
		                    </label>
		                    <label className={handoverStyles.field}>
		                      <span className={handoverStyles.fieldLabel}>计划竣工</span>
		                      <SystemDateInput
		                        value={handoverForm.planned_end}
	                        readOnly
	                        className={`${handoverStyles.input} ${handoverStyles.controlReadOnly}`}
	                      />
		                    </label>
		                    <label className={handoverStyles.field}>
			                      <span className={handoverStyles.fieldLabel}>周末是否施工</span>
		                      <span className={`${handoverStyles.toggleControl} ${handoverReadOnly ? handoverStyles.controlReadOnly : ""}`}>
	                        <span className={handoverStyles.controlText}>
	                          {handoverForm.weekend_construction ? "周末施工" : "周末不施工"}
	                        </span>
		                        <input
		                          type="checkbox"
		                          checked={handoverForm.weekend_construction}
		                          onChange={(event) => updateHandoverSchedule({ weekend_construction: event.target.checked })}
		                          disabled={handoverReadOnly}
		                        />
		                      </span>
		                    </label>
		                    <label className={handoverStyles.field}>
			                      <span className={handoverStyles.fieldLabel}>节假日是否施工</span>
		                      <span className={`${handoverStyles.toggleControl} ${handoverReadOnly ? handoverStyles.controlReadOnly : ""}`}>
	                        <span className={handoverStyles.controlText}>
	                          {handoverForm.holiday_construction ? "节假日施工" : "节假日不施工"}
	                        </span>
		                        <input
		                          type="checkbox"
		                          checked={handoverForm.holiday_construction}
		                          onChange={(event) => updateHandoverSchedule({ holiday_construction: event.target.checked })}
		                          disabled={handoverReadOnly}
		                        />
		                      </span>
		                    </label>
			                    <label className={handoverStyles.field}>
			                      <span className={handoverStyles.fieldLabel}>地暖</span>
			                      <span className={`${handoverStyles.toggleControl} ${handoverReadOnly ? handoverStyles.controlReadOnly : ""}`}>
			                        <span className={handoverStyles.controlText}>
			                          {handoverForm.has_floor_heating ? "有地暖" : "无地暖"}
			                        </span>
		                        <input
		                          type="checkbox"
		                          checked={handoverForm.has_floor_heating}
		                          onChange={(event) => updateHandoverSchedule({ has_floor_heating: event.target.checked })}
		                          disabled={handoverReadOnly}
		                        />
		                      </span>
		                    </label>
	                  </div>
	                </div>
	              </div>

	              <div className={handoverStyles.contentGrid}>
	                <div className={handoverStyles.notesPanel}>
                    <div className={handoverStyles.panelHeader}>
                      <h3 className={handoverStyles.panelTitle}>
                        <FileText className="h-4 w-4 text-primary-600" /> 交底纪要
                      </h3>
                    </div>
                    <div className={handoverStyles.notesGrid}>
                      <label className={handoverStyles.notesField}>
                        <span className={handoverStyles.fieldLabel}>重点交底内容</span>
                        <textarea
                          value={handoverForm.key_notes}
                          onChange={(event) => setHandoverForm((form) => ({ ...form, key_notes: event.target.value }))}
                          className={handoverStyles.textarea}
                          placeholder="设计重点、图纸版本、现场确认结论"
                          disabled={handoverReadOnly}
                        />
                      </label>
                      <label className={handoverStyles.notesField}>
                        <span className={handoverStyles.fieldLabel}>风险与变更提醒</span>
                        <textarea
                          value={handoverForm.risk_notes}
                          onChange={(event) => setHandoverForm((form) => ({ ...form, risk_notes: event.target.value }))}
                          className={handoverStyles.textarea}
                          placeholder="增减项、结构限制、物业限制、材料未定"
                          disabled={handoverReadOnly}
                        />
                      </label>
                      <label className={handoverStyles.notesField}>
                        <span className={handoverStyles.fieldLabel}>未解决事项</span>
                        <textarea
                          value={handoverForm.unresolved_items}
                          onChange={(event) => setHandoverForm((form) => ({ ...form, unresolved_items: event.target.value }))}
                          className={handoverStyles.textarea}
                          placeholder="问题、责任人、确认时间"
                          disabled={handoverReadOnly}
                        />
                      </label>
                    </div>
	                </div>

	                <div className={handoverStyles.archivePanel}>
                    <input
                      ref={handoverInputRef}
                      type="file"
                      className="hidden"
                      onChange={async (event) => {
                        const input = event.currentTarget;
                        await uploadHandoverFile(input.files?.[0]);
                        input.value = "";
                      }}
                    />
                    <div className={handoverStyles.panelHeader}>
                      <h3 className={handoverStyles.panelTitle}>
                        <Upload className="h-4 w-4 text-primary-600" /> 资料归档
                      </h3>
                      <span className={handoverStyles.archiveCount}>{handoverFiles.length} 份</span>
                    </div>
                    <div className={`${handoverStyles.archiveBody} ${handoverReadOnly ? handoverStyles.archiveBodyReadOnly : ""}`}>
                      {!handoverReadOnly && (
                      <button
                        type="button"
                        onClick={() => handoverInputRef.current?.click()}
                        disabled={Boolean(uploadingCategory)}
                        className={handoverStyles.uploadZone}
                      >
                        <span className={handoverStyles.uploadZoneIcon}>
                          {uploadingCategory ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                        </span>
                        <span>
                          <span className={handoverStyles.uploadZoneTitle}>{uploadingCategory ? "正在上传资料" : "上传交底资料"}</span>
                          <span className={handoverStyles.uploadZoneMeta}>现场照片、确认单、图纸版本或物业手续</span>
                        </span>
                      </button>
                    )}
                    <div className={handoverStyles.fileList}>
                      {handoverFiles.map((file) => (
                        <div
                          key={file.id}
                          className={handoverStyles.fileRow}
                        >
                          <span className={handoverStyles.fileIcon}><FileText className="h-3.5 w-3.5" /></span>
                          <a href={file.file_url} target="_blank" rel="noreferrer" className={handoverStyles.fileLink}>
                            {file.file_name}
                          </a>
                          <span className={handoverStyles.fileSize}>{file.file_size ? `${Math.ceil(Number(file.file_size) / 1024)}KB` : "链接"}</span>
                          {!handoverReadOnly && (
                            <button
                              type="button"
                              onClick={() => deleteHandoverFile(file)}
                              disabled={deletingFileId === file.id}
                              className={handoverStyles.deleteButton}
                              title="删除附件"
                              aria-label={`删除${file.file_name || "附件"}`}
                            >
                              {deletingFileId === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      ))}
                      {handoverFiles.length === 0 && <div className={handoverStyles.emptyArchive}>{handoverReadOnly ? "暂无交底资料" : "上传后的资料会显示在这里"}</div>}
                    </div>
                  </div>
                </div>
              </div>
		            </section>
                {handoverStartConfirmDialogOpen && (
                  <div className={handoverStyles.confirmOverlay} role="dialog" aria-modal="true" aria-labelledby="handover-start-confirm-title">
                    <div className={handoverStyles.confirmBackdrop} onClick={() => !saving && setHandoverStartConfirmDialogOpen(false)} />
                    <section className={handoverStyles.confirmDialog}>
                      <div className={handoverStyles.confirmIcon}>
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className={handoverStyles.confirmContent}>
                        <h3 id="handover-start-confirm-title" className={handoverStyles.confirmTitle}>确认开工并锁定交底信息</h3>
                        <p className={handoverStyles.confirmDescription}>
                          确认开工后，开工交底中的施工模板、计划时间和交底内容会锁定，无法再次修改。请确认当前信息无误后继续。
                        </p>
                      </div>
                      <div className={handoverStyles.confirmActions}>
                        <button
                          type="button"
                          className={handoverStyles.confirmCancelButton}
                          onClick={() => setHandoverStartConfirmDialogOpen(false)}
                          disabled={saving}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className={handoverStyles.confirmPrimaryButton}
                          onClick={() => void submitSiteStartFromHandoverConfirm()}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
                          确认开工
                        </button>
                      </div>
                    </section>
                  </div>
                )}
              </div>,
		        document.body,
		          )}

          {activeTab === "schedule" && (
            <section
              ref={siteDetailContentRef}
              className={`${scheduleStyles.workspace} max-lg:!h-auto ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`}
              style={siteDetailContentStyle}
            >
              <div className={scheduleStyles.overviewPanel}>
                <div className={scheduleStyles.toolbar}>
                  <div className={scheduleStyles.titleArea}>
                    <span className={scheduleStyles.titleIcon}>
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div className={scheduleStyles.titleCopy}>
                      <h3 className={scheduleStyles.title}>施工计划</h3>
                      <div className={scheduleStyles.metaRow}>
                        <span className={scheduleStyles.metaItem}>
                          <span className={scheduleStyles.metaLabel}>施工模板</span>
                          <span className={scheduleStyles.metaValue}>{scheduleContentLoading ? "读取中" : selectedHandoverConstructionTemplate?.name || "未选择"}</span>
                        </span>
                        <span className={scheduleStyles.metaItem}>
                          <span className={scheduleStyles.metaLabel}>计划周期</span>
                          <span className={scheduleStyles.metaValue}>{scheduleContentLoading ? "生成中" : constructionPlanRangeText}</span>
                        </span>
                        <span className={scheduleStyles.metaItem}>
                          <span className={scheduleStyles.metaLabel}>施工规则</span>
                          <span className={scheduleStyles.metaValue}>{constructionPlanWeekendConstruction ? "周末施工" : "周末不施工"} / {constructionPlanHolidayConstruction ? "节假日施工" : "节假日不施工"} / {constructionPlanHasFloorHeating ? "有地暖" : "无地暖"}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={scheduleStyles.actionArea}>
                    <button
                      type="button"
                      onClick={exportConstructionPlanXlsx}
                      disabled={!constructionPlanReady || scheduleContentLoading || constructionPlan.rows.length === 0 || exportingConstructionPlan}
                      className={`btn-primary inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${scheduleStyles.exportButton}`}
                      title="导出施工计划表格"
                    >
                      {exportingConstructionPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      导出表格
                    </button>
                    {constructionPlanExportMessage && (
                      <p className={`${scheduleStyles.actionMessage} ${constructionPlanExportMessage.includes("失败") ? "text-red-600" : "text-surface-500"}`}>
                        {constructionPlanExportMessage}
                      </p>
                    )}
                  </div>
                </div>
                <div className={scheduleStyles.summaryStrip}>
                  <div className={scheduleStyles.summaryItem}>
                    <p className={scheduleStyles.summaryLabel}>计划开工</p>
                    <p className={scheduleStyles.summaryValue}>{scheduleContentLoading ? "生成中" : constructionPlanStart ? formatDate(constructionPlanStart) : "-"}</p>
                  </div>
                  <div className={scheduleStyles.summaryItem}>
                    <p className={scheduleStyles.summaryLabel}>计划竣工</p>
                    <p className={scheduleStyles.summaryValue}>{scheduleContentLoading ? "生成中" : constructionPlan.planEnd ? formatDate(constructionPlan.planEnd) : "-"}</p>
                  </div>
                  <div className={scheduleStyles.summaryItem}>
                    <p className={scheduleStyles.summaryLabel}>工序节点</p>
                    <p className={`${scheduleStyles.summaryValue} tabular-nums`}>{scheduleContentLoading ? "-" : constructionPlan.rows.length}</p>
                  </div>
                  <div className={scheduleStyles.summaryItem}>
                    <p className={scheduleStyles.summaryLabel}>日历跨度</p>
                    <p className={`${scheduleStyles.summaryValue} tabular-nums`}>{scheduleContentLoading ? "-" : constructionPlan.totalDays ? `${constructionPlan.totalDays}天` : "-"}</p>
                  </div>
                </div>
              </div>

              <div className={`${scheduleStyles.ganttPanel} ${constructionPlanFullscreen ? scheduleStyles.ganttPanelFullscreen : ""}`}>
                {scheduleContentLoading ? (
                  <div className={`${scheduleStyles.state} text-sm font-semibold text-surface-600`}>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary-600" />
                    正在生成施工计划
                  </div>
                ) : constructionTemplateError ? (
                  <div className={scheduleStyles.state}>
                    <div>
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-surface-800">施工模板读取失败</p>
                      <p className="mt-2 text-xs leading-6 text-surface-500">{constructionTemplateError}</p>
                      <button
                        type="button"
                        onClick={() => loadConstructionTemplateOptions({ force: true })}
                        className="btn-secondary mt-4 min-h-8 px-3 py-1.5 text-xs"
                      >
                        重新读取
                      </button>
                    </div>
                  </div>
                ) : !constructionPlanReady ? (
                  <div className={scheduleStyles.state}>
                    <div>
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                        <CalendarDays className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-surface-800">完成开工交底后自动生成施工计划</p>
                      <p className="mt-2 text-xs leading-6 text-surface-500">需要先在开工交底中选择施工模板、确认计划开工，并点击完成交底。</p>
                    </div>
                  </div>
                ) : constructionPlan.rows.length === 0 ? (
                  <div className={scheduleStyles.state}>
                    <div>
                      <p className="text-sm font-semibold text-surface-800">当前施工模板暂无可生成的工序节点</p>
                      <p className="mt-2 text-xs leading-6 text-surface-500">请到分公司设置维护施工模板的阶段和工序节点。</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={scheduleStyles.ganttToolbar}>
                      <p className={scheduleStyles.ganttTitle} title={constructionPlanTitle}>{constructionPlanTitle}</p>
                      <div className={scheduleStyles.ganttToolbarActions}>
                        <div className={scheduleStyles.legend} aria-label="施工计划图例">
                          <span className={scheduleStyles.legendItem}>
                            <span className={`${scheduleStyles.legendSwatch} ${scheduleStyles.legendPlanned}`} />
                            计划时间
                          </span>
                          <span className={scheduleStyles.legendItem}>
                            <span className={`${scheduleStyles.legendSwatch} ${scheduleStyles.legendActual}`} />
                            实际完成时间
                          </span>
                          <span className={scheduleStyles.legendItem}>
                            <span className={`${scheduleStyles.legendSwatch} ${scheduleStyles.legendNonWorking}`} />
                            周末/节假日不施工
                          </span>
                        </div>
                        <button
                          type="button"
                          className={scheduleStyles.fullscreenButton}
                          onClick={() => setConstructionPlanFullscreen((current) => !current)}
                          title={constructionPlanFullscreen ? "退出全屏" : "全屏查看"}
                          aria-label={constructionPlanFullscreen ? "退出全屏查看施工计划图" : "全屏查看施工计划图"}
                        >
                          {constructionPlanFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                          {constructionPlanFullscreen ? "退出全屏" : "全屏查看"}
                        </button>
                      </div>
                    </div>
                    <ThinScrollArea className={scheduleStyles.scrollArea} scrollClassName={scheduleStyles.scrollViewport}>
                      <table
                        className={scheduleStyles.table}
                        style={{ minWidth: `${496 + constructionPlan.dateColumns.length * 36}px` }}
                      >
                        <thead>
                          <tr>
                            <th rowSpan={2} className={`${scheduleStyles.fixedHeader} ${scheduleStyles.stageColumn}`}>施工阶段</th>
                            <th rowSpan={2} className={`${scheduleStyles.fixedHeader} ${scheduleStyles.nodeColumn}`}>工序节点</th>
                            <th rowSpan={2} className={`${scheduleStyles.fixedHeader} ${scheduleStyles.rangeColumn}`}>起/止时间</th>
                            <th rowSpan={2} className={`${scheduleStyles.fixedHeader} ${scheduleStyles.durationColumn}`}>工期</th>
                            {constructionPlan.monthGroups.map((group) => (
                              <th key={group.key} colSpan={group.colSpan} className={scheduleStyles.monthHeader}>
                                {group.label}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {constructionPlan.dateColumns.map((date) => {
                              const nonWorkingDate = !isSiteWorkingDate(date, {
                                weekendConstruction: constructionPlanWeekendConstruction,
                                holidayConstruction: constructionPlanHolidayConstruction,
                              });
                              return (
                                <th
                                  key={formatDateOnly(date)}
                                  className={`${scheduleStyles.dateHeader} ${nonWorkingDate ? scheduleStyles.nonWorkingHeader : ""}`}
                                >
                                  {date.getDate()}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {constructionPlan.rows.map((row) => (
                            <tr key={row.id} className={scheduleStyles.row}>
                              {row.stageRowSpan > 0 && (
                                <td rowSpan={row.stageRowSpan} className={`${scheduleStyles.stageCell} ${scheduleStyles.stageColumn}`}>
                                  <span className={scheduleStyles.cellText} title={row.stageName}>{row.stageName}</span>
                                </td>
                              )}
                              <td className={`${scheduleStyles.infoCell} ${scheduleStyles.nodeCell} ${scheduleStyles.nodeColumn}`}>
                                <span className={scheduleStyles.cellText} title={row.nodeName}>{row.nodeName}</span>
                              </td>
                              <td className={`${scheduleStyles.infoCell} ${scheduleStyles.rangeCell} ${scheduleStyles.rangeColumn}`}>
                                {formatConstructionPlanDateRange(row.plannedStart, row.plannedEnd)}
                              </td>
                              <td className={`${scheduleStyles.infoCell} ${scheduleStyles.durationCell} ${scheduleStyles.durationColumn}`}>
                                {row.plannedDays}
                              </td>
                              {constructionPlan.dateColumns.map((date) => {
                                const dateKey = formatDateOnly(date);
                                const nonWorkingDate = !isSiteWorkingDate(date, {
                                  weekendConstruction: constructionPlanWeekendConstruction,
                                  holidayConstruction: constructionPlanHolidayConstruction,
                                });
                                const inPlannedRange = dateKey >= row.plannedStart && dateKey <= row.plannedEnd;
                                const plannedActive = inPlannedRange && !nonWorkingDate;
                                const nonWorkingInterrupt = inPlannedRange && nonWorkingDate;
                                const actualActive = Boolean(row.actualStart && row.actualEnd && dateKey >= row.actualStart && dateKey <= row.actualEnd);
                                return (
                                  <td key={`${row.id}-${dateKey}`} className={scheduleStyles.timelineCell}>
                                    <div className={scheduleStyles.timelineSplit}>
                                      <div className={`${scheduleStyles.timelineHalf} ${plannedActive ? scheduleStyles.plannedActive : nonWorkingInterrupt ? scheduleStyles.nonWorkingHalf : ""}`} />
                                      <div className={`${scheduleStyles.timelineHalf} ${actualActive ? scheduleStyles.actualActive : nonWorkingInterrupt ? scheduleStyles.nonWorkingHalf : ""}`} />
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ThinScrollArea>
                  </>
                )}
              </div>
            </section>
          )}

          {activeTab === "archive" && (
            <section ref={siteDetailContentRef} className={`${archiveStyles.workspace} ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`} style={siteDetailContentStyle}>
              <aside className={archiveStyles.categoryPanel}>
                <header className={archiveStyles.categoryHeader}>
                  <div className={archiveStyles.sectionHeading}>
                    <span className={archiveStyles.sectionIcon}><FolderOpen className="h-4 w-4" /></span>
                    <div className={archiveStyles.sectionCopy}>
                      <h3 className={archiveStyles.panelTitle}>资料分类</h3>
                      <p className={archiveStyles.panelSubtitle}>按类型集中归档并同步已有资料</p>
                    </div>
                  </div>
                </header>
                <nav className={archiveStyles.categoryList} aria-label="资料分类">
                  {archiveRows.map((category) => {
                    const Icon = category.icon;
                    const active = selectedArchiveRow.key === category.key;
                    return (
                      <button
                        key={category.key}
                        type="button"
                        onClick={() => {
                          setArchiveCategory(category.key);
                          setArchiveMessage("");
                        }}
                        className={`${archiveStyles.categoryItem} ${active ? archiveStyles.categoryItemActive : ""}`}
                      >
                        <span className={archiveStyles.categoryIcon}><Icon className="h-4 w-4" /></span>
                        <span className={archiveStyles.categoryName}>{category.title}</span>
                        <span className={archiveStyles.categoryCount}>{category.fileCount}</span>
                      </button>
                    );
                  })}
                </nav>
              </aside>

              <section className={archiveStyles.contentPanel}>
                <input
                  ref={archiveInputRef}
                  type="file"
                  className="hidden"
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    await uploadArchiveFile(input.files?.[0]);
                    input.value = "";
                  }}
                />
                <header className={archiveStyles.contentHeader}>
                  <div className={archiveStyles.contentHeading}>
                    <span className={archiveStyles.contentIcon}><Archive className="h-4 w-4" /></span>
                    <div className={archiveStyles.contentCopy}>
                      <h3 className={archiveStyles.contentTitle}>{selectedArchiveRow.title}</h3>
                      <p className={archiveStyles.contentSubtitle}>责任部门：{selectedArchiveRow.owner} · {selectedArchiveRow.helper}</p>
                    </div>
                  </div>
                  <div className={archiveStyles.countSummary} aria-label="当前分类资料数量">
                    <span className={archiveStyles.countLabel}>资料数量</span>
                    <strong className={archiveStyles.countValue}>{selectedArchiveRow.fileCount}</strong>
                  </div>
                </header>

                <div className={archiveStyles.contentBody}>
                  {isVrArchiveSelected ? (
                    <div className={archiveStyles.vrToolBand}>
                      <div className={archiveStyles.vrPanel}>
                        <div className={archiveStyles.vrHeader}>
                          <span className={archiveStyles.toolIcon}><Upload className="h-4 w-4" /></span>
                          <div className={archiveStyles.toolCopy}>
                            <p className={archiveStyles.toolTitle}>本地全景图生成</p>
                            <p className={archiveStyles.toolHelper}>按空间上传 2:1 全景照片，生成可打开的 VR 链接。</p>
                          </div>
                        </div>
                        <button type="button" onClick={openVrBuilder} disabled={isVirtualSite} className={archiveStyles.vrActionButton}>
                          <Plus className="h-4 w-4" /> 上传全景图生成VR链接
                        </button>
                      </div>
                      <div className={archiveStyles.vrPanel}>
                        <div className={archiveStyles.vrHeader}>
                          <span className={archiveStyles.toolIcon}><Link2 className="h-4 w-4" /></span>
                          <div className={archiveStyles.toolCopy}>
                            <p className={archiveStyles.toolTitle}>已有VR链接</p>
                            <p className={archiveStyles.toolHelper}>保存外部平台已经生成的 VR 链接。</p>
                          </div>
                        </div>
                        <div className={archiveStyles.linkFields}>
                          <input
                            value={archiveLinkForm.name}
                            onChange={(event) => setArchiveLinkForm((form) => ({ ...form, name: event.target.value }))}
                            className={archiveStyles.field}
                            placeholder="链接名称，如：客厅水电VR全景"
                            disabled={saving || isVirtualSite}
                          />
                          <input
                            value={archiveLinkForm.url}
                            onChange={(event) => setArchiveLinkForm((form) => ({ ...form, url: event.target.value }))}
                            className={archiveStyles.field}
                            placeholder="粘贴720云/酷家乐链接"
                            disabled={saving || isVirtualSite}
                          />
                          <button type="button" onClick={addArchiveLink} disabled={saving || isVirtualSite} className={archiveStyles.saveButton}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} 保存VR链接
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`${archiveStyles.toolBand} ${canArchiveExternalLink ? "" : archiveStyles.toolBandSingle}`}>
                      <button
                        type="button"
                        onClick={() => archiveInputRef.current?.click()}
                        disabled={Boolean(uploadingCategory) || isVirtualSite}
                        className={archiveStyles.uploadAction}
                      >
                        <span className={archiveStyles.uploadIcon}>
                          {uploadingCategory === `工地归档-${selectedArchiveRow.key}` ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                        </span>
                        <span className={archiveStyles.toolCopy}>
                          <span className={archiveStyles.toolTitle}>上传{selectedArchiveRow.title}</span>
                          <span className={archiveStyles.toolHelper}>支持照片、PDF、Word、Excel、压缩包等资料。</span>
                        </span>
                      </button>

                      {canArchiveExternalLink && (
                        <div className={archiveStyles.linkPanel}>
                          <div className={archiveStyles.linkHeader}>
                            <span className={archiveStyles.toolIcon}><Link2 className="h-4 w-4" /></span>
                            <p className={archiveStyles.toolTitle}>外部链接归档</p>
                          </div>
                          <div className={archiveStyles.linkFields}>
                            <input
                              value={archiveLinkForm.name}
                              onChange={(event) => setArchiveLinkForm((form) => ({ ...form, name: event.target.value }))}
                              className={archiveStyles.field}
                              placeholder="链接名称，如：720云效果图"
                              disabled={saving || isVirtualSite}
                            />
                            <input
                              value={archiveLinkForm.url}
                              onChange={(event) => setArchiveLinkForm((form) => ({ ...form, url: event.target.value }))}
                              className={archiveStyles.field}
                              placeholder="https://..."
                              disabled={saving || isVirtualSite}
                            />
                            <button type="button" onClick={addArchiveLink} disabled={saving || isVirtualSite} className={archiveStyles.saveButton}>
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} 保存链接
                            </button>
                          </div>
                          <p className={archiveStyles.toolHelper}>{selectedArchiveRow.helper}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {archiveMessage && (
                    <p className={`${archiveStyles.message} ${archiveMessage.includes("失败") || archiveMessage.includes("请") ? archiveStyles.messageError : archiveStyles.messageSuccess}`}>
                      {archiveMessage}
                    </p>
                  )}

                  <div className={archiveStyles.listRegion}>
                    <header className={archiveStyles.listHeader}>
                      <div className={archiveStyles.listHeading}>
                        <span className={archiveStyles.listMarker} />
                        <h4 className={archiveStyles.listTitle}>资料列表</h4>
                      </div>
                      <span className={archiveStyles.listCount}>共 {selectedArchiveRow.fileCount} 份</span>
                    </header>
                    <ThinScrollArea className={archiveStyles.tableScroller} scrollClassName={archiveStyles.tableViewport}>
                      <table className={archiveStyles.table}>
                        <thead>
                          <tr>
                            <th>资料名称</th>
                            <th>来源分类</th>
                            <th>上传人</th>
                            <th>类型</th>
                            <th>归档时间</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedArchiveRow.files.map((file: any) => {
                            const archiveImageUrl = isImageLikeFile(file) ? String(file.file_url || file.url || "") : "";
                            const archiveContractSummaryId = getArchiveContractSummaryId(file);
                            const documentTileIsPrimary = Boolean(archiveContractSummaryId || isVrTourAttachment(file) || isLinkAttachment(file));
                            return (
                              <tr key={file.id}>
                                <td>
                                  <div className={archiveStyles.fileCell}>
                                    {archiveImageUrl ? (
                                      <a href={file.file_url} target="_blank" rel="noreferrer" className={archiveStyles.thumbnail} title="查看图片">
                                        <NativeImage
                                          src={archiveImageUrl}
                                          alt={file.file_name || "归档图片"}
                                          loading="lazy"
                                          onMouseEnter={(event) => setMaterialImagePreview({
                                            src: archiveImageUrl,
                                            name: file.file_name || "归档图片",
                                            spec: getArchiveSourceText(file),
                                            x: event.clientX,
                                            y: event.clientY,
                                          })}
                                          onMouseMove={(event) => setMaterialImagePreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                                          onMouseLeave={() => setMaterialImagePreview(null)}
                                        />
                                      </a>
                                    ) : archiveContractSummaryId ? (
                                      <button type="button" onClick={() => openArchiveContractSummary(file)} className={`${archiveStyles.documentTile} ${archiveStyles.documentTilePrimary}`} title="查看合同纪要">
                                        <ClipboardList className="h-5 w-5" />
                                      </button>
                                    ) : (
                                      <a
                                        href={file.file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`${archiveStyles.documentTile} ${documentTileIsPrimary ? archiveStyles.documentTilePrimary : ""}`}
                                        title="查看资料"
                                      >
                                        {isVrTourAttachment(file) ? <Eye className="h-5 w-5" /> : isLinkAttachment(file) ? <Link2 className="h-5 w-5" /> : <FolderOpen className="h-5 w-5" />}
                                      </a>
                                    )}
                                    <div className={archiveStyles.fileCopy}>
                                      {archiveContractSummaryId ? (
                                        <button type="button" onClick={() => openArchiveContractSummary(file)} className={archiveStyles.fileName} title="查看合同纪要">{file.file_name}</button>
                                      ) : (
                                        <a href={file.file_url} target="_blank" rel="noreferrer" className={archiveStyles.fileName} title={file.file_name}>{file.file_name}</a>
                                      )}
                                      <p className={archiveStyles.fileMeta}>
                                        {isSyncedArchiveFile(file) && <span className={archiveStyles.syncTag}>系统同步</span>}
                                        <span className={archiveStyles.truncate}>{formatFileSize(file.file_size) || (isLinkAttachment(file) ? "在线链接" : getArchiveTypeLabel(file))}</span>
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className={archiveStyles.sourceCell} title={getArchiveSourceText(file)}><span className={archiveStyles.truncate}>{getArchiveSourceText(file)}</span></td>
                                <td className={archiveStyles.centerCell} title={getArchiveUploaderText(file)}><span className={archiveStyles.truncate}>{getArchiveUploaderText(file)}</span></td>
                                <td className={archiveStyles.centerCell}><span className={archiveStyles.typeTag}>{getArchiveTypeLabel(file)}</span></td>
                                <td className={archiveStyles.dateCell}>{file.created_at ? formatDate(file.created_at) : "-"}</td>
                                <td className={archiveStyles.actionCell}>
                                  <div className={archiveStyles.actions}>
                                    {archiveContractSummaryId ? (
                                      <button type="button" onClick={() => openArchiveContractSummary(file)} className={archiveStyles.iconAction} title="查看合同纪要"><Eye className="h-3.5 w-3.5" /></button>
                                    ) : (
                                      <a href={file.file_url} target="_blank" rel="noreferrer" className={archiveStyles.iconAction} title="查看"><Eye className="h-3.5 w-3.5" /></a>
                                    )}
                                    {canShareArchiveLink(file) && (
                                      <button type="button" onClick={() => openArchiveShare(file)} className={archiveStyles.iconAction} title="分享链接"><Share2 className="h-3.5 w-3.5" /></button>
                                    )}
                                    {isVrTourAttachment(file) && !isVirtualSite && (
                                      <button type="button" onClick={() => openVrTourEditor(file)} className={archiveStyles.iconAction} title="编辑水电VR全景"><Pencil className="h-3.5 w-3.5" /></button>
                                    )}
                                    {canRenameArchiveFile(file) && !isVirtualSite && (
                                      <button type="button" onClick={() => openArchiveRename(file)} className={archiveStyles.iconAction} title="重命名"><Pencil className="h-3.5 w-3.5" /></button>
                                    )}
                                    {canDownloadArchiveFile(file) && (
                                      <a href={file.download_url || file.file_url} download className={archiveStyles.iconAction} title="下载"><Download className="h-3.5 w-3.5" /></a>
                                    )}
                                    {canDeleteArchiveFile(file) && (
                                      <button type="button" onClick={() => deleteArchiveFile(file)} disabled={deletingFileId === file.id || isVirtualSite} className={`${archiveStyles.iconAction} ${archiveStyles.iconActionDanger}`} title="删除">
                                        {deletingFileId === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {selectedArchiveRow.files.length === 0 && (
                            <tr>
                              <td colSpan={6} className={archiveStyles.emptyCell}>
                                <div className={archiveStyles.emptyState}>
                                  <span className={archiveStyles.emptyIcon}><FolderOpen className="h-5 w-5" /></span>
                                  <h4>当前分类暂无归档资料</h4>
                                  <p>上传文件或保存外部链接后会显示在这里</p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </ThinScrollArea>
                  </div>
                </div>
              </section>
            </section>
          )}

	          {activeTab === "checkin" && (
            <section ref={siteDetailContentRef} className={`${checkinStyles.workspace} ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`} style={siteDetailContentStyle}>
              <aside className={checkinStyles.credentialPanel}>
                <header className={checkinStyles.credentialHeader}>
                  <div className={checkinStyles.credentialIdentity}>
                    <span className={checkinStyles.credentialIcon}><QrCode className="h-4 w-4" /></span>
                    <div className={checkinStyles.credentialTitle}>
                      <h3>{siteDisplayName || "工地签到码"}</h3>
                      <p title={siteAddress || "扫码完成现场签到"}>{siteAddress || "扫码完成现场签到"}</p>
                    </div>
                  </div>
                  <span className={checkinStyles.statusTag} data-state={checkinCode?.status === "active" ? "active" : "inactive"}>
                    <span className={checkinStyles.statusDot} />
                    {checkinCode?.status === "active" ? "有效" : "已停用"}
                  </span>
                </header>

                <div className={checkinStyles.credentialScroll}>
                  <div className={checkinStyles.qrArea}>
                    <div className={checkinStyles.qrFrame}>
                      {checkinQrUrl ? (
                        <NativeImage src={checkinQrUrl} alt="工地签到二维码" className={checkinStyles.qrImage} />
                      ) : (
                        <div className={checkinStyles.qrLoading}>正在生成签到码...</div>
                      )}
                    </div>
                    <p className={checkinStyles.qrTitle}>微信扫码 · 工地签到</p>
                    <p className={checkinStyles.qrHelp}>一工地一码，固定使用，请张贴在工地入口或现场公告处。</p>
                    <div className={checkinStyles.actionRow}>
                      <button type="button" onClick={downloadCheckinQr} disabled={!checkinQrUrl} className={checkinStyles.secondaryButton}>
                        <Download className="h-3.5 w-3.5" /> 下载
                      </button>
                      <button type="button" onClick={printCheckinCard} disabled={!checkinQrUrl} className={checkinStyles.secondaryButton}>
                        <Printer className="h-3.5 w-3.5" /> 打印
                      </button>
                      <button type="button" onClick={copyCheckinLink} disabled={!checkinUrl} className={checkinStyles.primaryButton}>
                        <Copy className="h-3.5 w-3.5" /> 复制链接
                      </button>
                    </div>
                  </div>

                  <div className={checkinStyles.metricGrid}>
                    <CheckinMetric label="签到人数" value={checkinUniquePersonCount} />
                    <CheckinMetric label="签到次数" value={checkinTotalCount} />
                    <CheckinMetric label="创建时间" value={formatDateTime(checkinCode?.created_at)} />
                    <CheckinMetric label="最近签到" value={latestCheckin ? formatDateTime(latestCheckin.signed_at) : "-"} />
                  </div>

                  <div className={checkinStyles.detailStack}>
                    <div className={checkinStyles.codeBlock}>
                      <p className={checkinStyles.detailLabel}>签到码编号</p>
                      <p className={checkinStyles.codeValue} title={checkinCode?.code || "-"}>{checkinCode?.code || "-"}</p>
                    </div>

                    <div className={checkinStyles.locationBox} data-state={hasSiteLocation ? "success" : "warning"}>
                      <MapPin className="h-4 w-4" />
                      <div className={checkinStyles.locationContent}>
                        <p className={checkinStyles.locationTitle}>工地签到定位</p>
                        <p className={checkinStyles.locationText}>
                          {hasSiteLocation
                            ? `${siteLocationName || "已保存实际地址定位"} · 来自客户实际地址 · 允许500米内签到`
                            : "客户资料未保存实际地址定位，请在客户资料中通过地图选点保存后再扫码签到"}
                        </p>
                        {hasSiteLocation && <p className={checkinStyles.coordinates}>{siteLatitude.toFixed(6)}, {siteLongitude.toFixed(6)}</p>}
                      </div>
                    </div>

                    {checkinMessage && (
                      <div className={checkinStyles.message} data-tone={/失败|拦截|拒绝|无法|未设置/.test(checkinMessage) ? "danger" : "success"}>
                        {checkinMessage}
                      </div>
                    )}
                  </div>

                  <div className={checkinStyles.reminderBlock}>
                    <div className={checkinStyles.reminderTitle}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <h4>使用提醒</h4>
                    </div>
                    <div className={checkinStyles.reminderList}>
                      <p>1. 签到码固定不变，建议打印后塑封并张贴在工地入口。</p>
                      <p>2. 现场人员每次进场扫码签到，后台按手机号或姓名统计。</p>
                      <p>3. 工地暂停或完工后，可停用签到码避免继续签到。</p>
                    </div>
                  </div>
                </div>
              </aside>

              <section className={checkinStyles.recordsPanel}>
                <header className={checkinStyles.recordsHeader}>
                  <div className={checkinStyles.recordsIdentity}>
                    <span className={checkinStyles.recordsIcon}><ClipboardList className="h-4 w-4" /></span>
                    <div className={checkinStyles.recordsTitle}>
                      <h3>签到记录</h3>
                      <p>按最新签到时间排序，记录人员身份、联系方式、位置与现场照片。</p>
                    </div>
                  </div>
                  <div className={checkinStyles.summaryStrip} aria-label="签到记录概况">
                    <div className={checkinStyles.summaryItem}><span>当前结果</span><strong>{visibleCheckinRecords.length}</strong></div>
                    <div className={checkinStyles.summaryItem}><span>签到人数</span><strong>{checkinUniquePersonCount}</strong></div>
                    <div className={checkinStyles.summaryItem}><span>签到次数</span><strong>{checkinTotalCount}</strong></div>
                  </div>
                </header>

                <div className={checkinStyles.filterBar}>
                  <span className={checkinStyles.filterLabel}><Filter className="h-3.5 w-3.5" /> 筛选记录</span>
                  <div className={checkinStyles.filterControls}>
                    <SystemSelect
                      value={checkinPersonFilter}
                      onChange={(event) => setCheckinPersonFilter(event.target.value)}
                      className={checkinStyles.filterSelect}
                      aria-label="筛选签到人员"
                    >
                      <option value="">全部人员</option>
                      {checkinPersonOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                    </SystemSelect>
                    <SystemDateInput
                      value={checkinDateFrom}
                      onChange={setCheckinDateFrom}
                      className={checkinStyles.dateInput}
                      aria-label="签到开始日期"
                    />
                    <span className={checkinStyles.dateDivider}>至</span>
                    <SystemDateInput
                      value={checkinDateTo}
                      onChange={setCheckinDateTo}
                      className={checkinStyles.dateInput}
                      aria-label="签到结束日期"
                    />
                    {(checkinPersonFilter || checkinDateFrom || checkinDateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCheckinPersonFilter("");
                          setCheckinDateFrom("");
                          setCheckinDateTo("");
                        }}
                        className={checkinStyles.clearButton}
                      >
                        清空筛选
                      </button>
                    )}
                  </div>
                </div>

                {visibleCheckinRecords.length > 0 ? (
                  <div className={checkinStyles.tableRegion}>
                    <ThinScrollArea className={checkinStyles.tableScroller} scrollClassName={checkinStyles.tableViewport}>
                      <table className={checkinStyles.table}>
                        <thead>
                          <tr>
                            <th>序号</th>
                            <th>签到人员</th>
                            <th>身份</th>
                            <th>手机号</th>
                            <th>签到时间</th>
                            <th>距离</th>
                            <th>签到位置</th>
                            <th>照片</th>
                            <th>备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {checkinPagination.pageItems.map((record: any, index: number) => (
                            <tr key={record.id}>
                              <td className={checkinStyles.sequence}>{(checkinPagination.page - 1) * checkinPagination.pageSize + index + 1}</td>
                              <td>
                                <div className={checkinStyles.personCell}>
                                  <span className={checkinStyles.avatar}>{(record.person_name || "签")[0]}</span>
                                  <div className={checkinStyles.personCopy}>
                                    <div className={checkinStyles.personLine}>
                                      <p className={checkinStyles.personName}>{record.person_name || "-"}</p>
                                      {(record.checkin_source === "employee" || record.user_id) && <span className={checkinStyles.employeeTag}>员工</span>}
                                    </div>
                                    {record.company_name && record.checkin_source !== "employee" && !record.user_id && <p className={checkinStyles.personCompany}>{record.company_name}</p>}
                                  </div>
                                </div>
                              </td>
                              <td>{record.role || "-"}</td>
                              <td className={checkinStyles.phone}>{record.phone || "-"}</td>
                              <td className={checkinStyles.dateCell}>{formatDateTime(record.signed_at)}</td>
                              <td className={checkinStyles.distance}>{Number.isFinite(Number(record.distance_meters)) ? `${Math.round(Number(record.distance_meters))}米` : "-"}</td>
                              <td className={checkinStyles.locationCell}>
                                <p className={checkinStyles.truncateCell} title={record.location_name || ""}>{record.location_name || "-"}</p>
                              </td>
                              <td>
                                {Array.isArray(record.photos) && record.photos.length > 0 ? (
                                  <div className={checkinStyles.photos}>
                                    {record.photos.slice(0, 3).map((photo: any) => (
                                      <a key={photo.id || photo.file_url} href={photo.file_url} target="_blank" rel="noreferrer" className={checkinStyles.photoLink} title={photo.file_name || "签到照片"}>
                                        <NativeImage src={photo.file_url} alt={photo.file_name || "签到照片"} />
                                      </a>
                                    ))}
                                    {record.photos.length > 3 && <span className={checkinStyles.photoCount}>+{record.photos.length - 3}</span>}
                                  </div>
                                ) : "-"}
                              </td>
                              <td className={checkinStyles.remarkCell}>
                                <p className={checkinStyles.truncateCell} title={record.remark || ""}>{record.remark || "-"}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ThinScrollArea>
                    <DataPagination
                      total={visibleCheckinRecords.length}
                      page={checkinPagination.page}
                      pageSize={checkinPagination.pageSize}
                      onPageChange={checkinPagination.setPage}
                      onPageSizeChange={checkinPagination.setPageSize}
                      itemName="条签到"
                      className={checkinStyles.pagination}
                    />
                  </div>
                ) : (
                  <div className={checkinStyles.emptyState}>
                    <span className={checkinStyles.emptyIcon}><ClipboardList className="h-5 w-5" /></span>
                    <h4>{checkinRecords.length > 0 ? "没有符合条件的签到记录" : "暂无签到记录"}</h4>
                    <p>{checkinRecords.length > 0 ? "调整人员或日期筛选条件后再查看。" : "打印二维码并张贴到工地后，现场人员扫码签到会显示在这里。"}</p>
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "changes" && (
            <section ref={siteDetailContentRef} className={`${changeOrderStyles.workspace} ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`} style={siteDetailContentStyle}>
              <div className={changeOrderStyles.metricGrid}>
                <ChangeMetricCard label="已通过变更收款" value={netChangeAmount} helper={`增项 ${formatPlainAmount(addChangeAmount)} / 减项 ${formatPlainAmount(deductChangeAmount)}`} tone={netChangeAmount >= 0 ? "red" : "green"} />
                <ChangeMetricCard label="待内部审核" value={pendingApprovalChangeCount} helper="提交后进入内部审核" tone="primary" plain />
                <ChangeMetricCard label="已进结算" value={settlementChangeAmount} helper={`毛利影响 ${formatPlainAmount(changeGrossProfitImpact)}`} tone={settlementChangeAmount >= 0 ? "red" : "green"} />
              </div>

              <div className={changeOrderStyles.mainGrid}>
                <aside className={changeOrderStyles.formPanel}>
                    <div className={changeOrderStyles.panelHeader}>
                      <div className={changeOrderStyles.titleArea}>
                        <span className={changeOrderStyles.titleIcon}><Plus className="h-4 w-4" /></span>
                        <div>
                          <h3 className={changeOrderStyles.panelTitle}>新增变更单</h3>
                          <p className={changeOrderStyles.panelSubtitle}>每条项目选择增项或减项，金额填写正数。</p>
                        </div>
                      </div>
                    </div>
                    <ThinScrollArea className={changeOrderStyles.formScroller} scrollClassName={changeOrderStyles.formViewport}>
                      <div className={changeOrderStyles.formBody}>
                        <div className={changeOrderStyles.editorSurface}>
                          <ChangeOrderItemsEditor
                            items={changeOrderForm.items}
                            disabled={saving || isVirtualSite}
                            showPhase={false}
                            showCostEstimate={false}
                            onUpdate={updateChangeOrderItem}
                            onAdd={addChangeOrderItem}
                            onRemove={removeChangeOrderItem}
                          />
                          <ChangeOrderSettlementEditor
                            form={changeOrderForm}
                            disabled={saving || isVirtualSite}
                            onChange={(patch) => setChangeOrderForm((form) => ({ ...form, ...patch }))}
                          />
                        </div>
                        {changeOrderMessage && (
                          <div className={`${changeOrderStyles.message} ${changeOrderMessage.includes("失败") || changeOrderMessage.includes("请") || changeOrderMessage.includes("不能") ? changeOrderStyles.messageError : changeOrderStyles.messageSuccess}`}>
                            {changeOrderMessage}
                          </div>
                        )}
                      </div>
                    </ThinScrollArea>
                    <div className={changeOrderStyles.formFooter}>
                      <button type="button" onClick={addChangeOrder} disabled={saving || isVirtualSite} className={changeOrderStyles.saveButton}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        保存变更单
                      </button>
                    </div>
                </aside>

                <div className={changeOrderStyles.listPanel}>
                    <div className={changeOrderStyles.listHeader}>
                      <div className={changeOrderStyles.titleArea}>
                        <span className={changeOrderStyles.titleIcon}><ShieldCheck className="h-4 w-4" /></span>
                        <div>
                          <h3 className={changeOrderStyles.panelTitle}>增减项变更单</h3>
                          <p className={changeOrderStyles.panelSubtitle}>记录施工中的增项、减项、方案调整和材料替换。</p>
                        </div>
                      </div>
                      <div className={changeOrderStyles.headerActions}>
                        {changeOrderMessage && (
                          <span className={`${changeOrderStyles.message} ${changeOrderMessage.includes("失败") || changeOrderMessage.includes("请") ? changeOrderStyles.messageError : changeOrderStyles.messageSuccess}`}>
                            {changeOrderMessage}
                          </span>
                        )}
                        <SystemSelect
                          value={changeOrderFilter}
                          onChange={(event) => setChangeOrderFilter(event.target.value)}
                          className={changeOrderStyles.filterSelect}
                          menuClassName={changeOrderStyles.selectMenu}
                          optionClassName={changeOrderStyles.selectOption}
                        >
                          <option value="all">全部状态</option>
                          {Object.entries(changeOrderStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </SystemSelect>
                      </div>
                    </div>

                    <div className={changeOrderStyles.listBody}>
                    <ThinScrollArea className={changeOrderStyles.tableScroller} scrollClassName={changeOrderStyles.tableViewport}>
                      <table className={`${changeOrderStyles.table} ${visibleChangeOrders.length === 0 ? changeOrderStyles.tableEmpty : ""}`}>
                        <colgroup>
                          <col className="w-[11%]" />
                          <col className="w-[37%]" />
                          <col className="w-[8%]" />
                          <col className="w-[10%]" />
                          <col className="w-[17%]" />
                          <col className="w-[8%]" />
                          <col className="w-[9%]" />
                        </colgroup>
                        <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
                          <tr className="border-b border-surface-300">
                            <th className="px-3 py-2.5 text-left">变更单号</th>
                            <th className="px-3 py-2.5 text-left">变更项目</th>
                            <th className="px-3 py-2.5 text-center">类型</th>
                            <th className="px-3 py-2.5 text-right">变更收款</th>
                            <th className="px-3 py-2.5 text-center">审批流程</th>
                            <th className="px-3 py-2.5 text-center">创建人</th>
                            <th className="px-3 py-2.5 text-center">创建时间</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-200">
                          {changeOrderPagination.pageItems.map((order: any) => {
                            const isSelected = selectedChangeOrder?.id === order.id;
                            const signedAmount = getChangeSignedAmount(order);
                            const discountAmount = getChangeOrderDiscountAmount(order);
                            const itemCount = getChangeOrderItemCount(order);
                            const approvalView = getChangeOrderApprovalView(order);
                            const typeTitle = getChangeOrderTypeTitle(order);
                            const listTitle = getChangeOrderListTitle(order);
                            return (
	                              <tr
	                                key={order.id}
	                                onClick={() => openChangeOrderDetail(order)}
	                                className={changeOrderStyles.tableRow}
	                                data-selected={isSelected ? "true" : undefined}
	                              >
                                <td className="px-3 py-2.5 align-middle">
                                  <p className="font-mono text-xs font-semibold text-surface-800">{order.change_no || "-"}</p>
                                </td>
                                <td className="px-3 py-2.5 align-middle">
                                  <p className="line-clamp-2 break-words font-semibold leading-5 text-surface-900" title={listTitle}>{listTitle}</p>
                                  <p className="mt-0.5 truncate text-xs text-surface-500" title={order.description || ""}>
                                    共 {itemCount} 项 · {order.description || "未填写备注"}
                                  </p>
                                </td>
                                <td className="px-3 py-2.5 text-center align-middle">
                                  <span className={changeOrderStyles.changeTypeTag} data-tone={typeTitle === "增减项" ? "mixed" : typeTitle === "减项" ? "deduct" : "add"}>
                                    {typeTitle}
                                  </span>
                                </td>
                                <td className={`px-3 py-2.5 text-right align-middle font-semibold tabular-nums ${signedAmount < 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  <p>{signedAmount < 0 ? "-" : ""}{formatPlainAmount(Math.abs(signedAmount))}</p>
                                  {discountAmount > 0 && (
                                    <p className="mt-0.5 text-xs font-medium text-surface-400">已优惠 {formatPlainAmount(discountAmount)}</p>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-center align-middle">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openChangeOrderDetail(order);
                                    }}
                                    className={`${changeOrderStyles.approvalButton} group`}
                                  >
                                    <span className="flex min-w-0 items-center justify-center gap-2">
                                      <span className={`truncate text-sm font-semibold ${approvalView.className}`}>{approvalView.title}</span>
                                      <span className="shrink-0 text-[11px] font-semibold text-primary-600 opacity-0 transition-opacity group-hover:opacity-100">查看</span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-surface-400" title={approvalView.caption}>{approvalView.caption}</span>
                                  </button>
                                </td>
                                <td className="px-3 py-2.5 text-center align-middle text-sm text-surface-700">
                                  <p className="truncate" title={order.created_by_name || "系统创建"}>{order.created_by_name || "系统创建"}</p>
                                </td>
                                <td className="px-3 py-2.5 text-center align-middle text-xs text-surface-500">{order.created_at ? formatDate(order.created_at) : "-"}</td>
                              </tr>
                            );
                          })}
                          {visibleChangeOrders.length === 0 && (
                            <tr className={changeOrderStyles.emptyRow}>
                              <td colSpan={7} className={changeOrderStyles.emptyCell}>
                                <span className="sr-only">暂无增减项变更单</span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </ThinScrollArea>
                      {visibleChangeOrders.length === 0 && (
                        <div className={changeOrderStyles.emptyOverlay} aria-hidden="true">
                          <span className={changeOrderStyles.emptyIcon}><ClipboardList className="h-5 w-5" /></span>
                          <span>暂无增减项变更单</span>
                        </div>
                      )}
                    </div>
                      <DataPagination
                        total={visibleChangeOrders.length}
                        page={changeOrderPagination.page}
                        pageSize={changeOrderPagination.pageSize}
                        onPageChange={changeOrderPagination.setPage}
                        onPageSizeChange={changeOrderPagination.setPageSize}
                        itemName="张变更单"
                        className={changeOrderStyles.pagination}
                      />
	              </div>
	              </div>
	            </section>
	          )}

          {activeTab === "phase" && (
            <section
              ref={siteDetailContentRef}
              className={`${phaseStyles.workspace} max-lg:!h-auto xl:overflow-hidden ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`}
              style={siteDetailContentStyle}
            >
              {!siteStartConfirmed ? (
                <div className={phaseStyles.emptyState}>
                  <div>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-surface-800">完成开工确认后显示施工阶段</p>
                    <p className="mt-2 text-xs leading-6 text-surface-500">需要先完成开工交底，并在工地详情右上角点击“开工确认”。确认后这里会按施工模板显示施工阶段、工序节点、验收标准和节点工期。</p>
                  </div>
                </div>
              ) : (
                <>
              <div className={`${phaseStyles.panel} ${phaseStyles.overviewPanel}`}>
                <div className={phaseStyles.overviewHeader}>
                  <div className={phaseStyles.titleArea}>
                    <span className={phaseStyles.titleIcon}>
                      <ClipboardList className="h-4 w-4" />
                    </span>
                    <div className={phaseStyles.titleCopy}>
                      <h3 className={phaseStyles.title}>施工阶段</h3>
                      <p className={phaseStyles.subtitle}>
                        {hasConstructionTemplateStages
                          ? `按施工模板「${selectedHandoverConstructionTemplate?.name || "未命名模板"}」推进阶段、工序节点和验收节点。`
                          : "请先完成开工交底并选择施工模板；未选择模板时仅显示旧阶段兜底。"}
                      </p>
                    </div>
                  </div>
                  <div className={phaseStyles.overallMetrics}>
                    <div className={`${phaseStyles.overallMetric} ${phaseStyles.metricPrimary}`}>
                      <p className={phaseStyles.metricLabel}>总进度</p>
                      <p className={phaseStyles.metricValue}>{templateOverallProgress}%</p>
                    </div>
                    <div className={phaseStyles.overallMetric}>
                      <p className={phaseStyles.metricLabel}>小节点</p>
                      <p className={phaseStyles.metricValue}>{templateDoneNodeCount}/{templateTotalNodeCount || phaseNodeRows.length}</p>
                    </div>
                    <div className={phaseStyles.overallMetric}>
                      <p className={phaseStyles.metricLabel}>照片</p>
                      <p className={phaseStyles.metricValue}>{currentPhaseFiles.length}</p>
                    </div>
                    <div className={`${phaseStyles.overallMetric} ${phaseStyles.metricDanger}`}>
                      <p className={phaseStyles.metricLabel}>待整改</p>
                      <p className={phaseStyles.metricValue}>{currentPhaseOpenIssues.length}</p>
                    </div>
                  </div>
                </div>

                {!hasConstructionTemplateStages && (
                  <div className={phaseStyles.templateWarning}>
                    当前工地还没有可用的施工模板明细。完成开工交底并选择施工模板后，这里会按模板显示施工阶段、工序节点、验收标准和节点工期。
                  </div>
                )}

                <ThinScrollArea className={phaseStyles.stageScroll} scrollClassName={phaseStyles.stageViewport}>
                  <div className={phaseStyles.stageTrack}>
                    {phaseOverviewRows.map((item) => {
                      const stageVisual = getPhaseStageVisual(item.label);
                      const StageVisualIcon = stageVisual.Icon;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setSelectedPhaseNodeId("");
                            updateProject({ current_phase: item.key, site_stage: "CONSTRUCTION" });
                          }}
                          disabled={saving || isVirtualSite}
                          className={phaseStyles.stageButton}
                          data-current={item.isCurrent ? "true" : "false"}
                          data-status={item.status}
                          data-visual={stageVisual.tone}
                          aria-pressed={item.isCurrent}
                        >
                          <span className={phaseStyles.stageIconMark} aria-hidden="true">
                            <StageVisualIcon className="h-10 w-10" strokeWidth={1.7} />
                          </span>
                          <span className={phaseStyles.stageTop}>
                            <span className={phaseStyles.stageNumber}>{item.index + 1}</span>
                            <span className={phaseStyles.stageStatus}>{phaseStatusLabels[item.status] || item.status}</span>
                          </span>
                          <span className={phaseStyles.stageName} title={item.label}>{item.label}</span>
                          <span className={phaseStyles.stageProgress}>
                            <span className={phaseStyles.stageProgressFill} style={{ width: `${item.progress}%` }} />
                          </span>
                          <span className={phaseStyles.stageMeta}>
                            <span className={phaseStyles.stageMetaItem}>{item.doneCount}/{item.nodeCount} 节点</span>
                            <span className={phaseStyles.stageMetaItem}><Camera className="h-3 w-3" />{item.files.length}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </ThinScrollArea>
              </div>

              <div className={`${phaseStyles.panel} ${phaseStyles.nodePanel} max-lg:overflow-visible`}>
                <div className={phaseStyles.nodeHeader}>
                  <div className={phaseStyles.titleArea}>
                    <span className={phaseStyles.titleIcon}>
                      <ClipboardCheck className="h-4 w-4" />
                    </span>
                    <div className={phaseStyles.titleCopy}>
                      <h3 className={phaseStyles.title}>当前阶段：{currentPhaseLabel}</h3>
                      <p className={phaseStyles.subtitle}>按施工模板推进工序节点、验收节点和现场记录，也可按当前工地补充节点。</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openCustomPhaseNodeDialog}
                    disabled={saving || isVirtualSite || !canShowConstructionPhase}
                    className={phaseStyles.addNodeButton}
                  >
                    <Plus className="h-4 w-4" />
                    新增节点
                  </button>
	                </div>

                <div className={phaseStyles.phaseStats}>
                  <div className={phaseStyles.phaseStat}>
                    <p className={phaseStyles.phaseStatLabel}>节点完成度</p>
                    <div className={`${phaseStyles.phaseStatValue} ${phaseStyles.progressValue}`}>
                      <div className={phaseStyles.progressTrack}>
                        <div className={phaseStyles.progressFill} style={{ width: `${phaseNodeProgress}%` }} />
                      </div>
                      <span className={phaseStyles.progressText}>{phaseNodeProgress}%</span>
                    </div>
                  </div>
                  <div className={phaseStyles.phaseStat}>
                    <p className={phaseStyles.phaseStatLabel}>当前阶段节点</p>
                    <p className={phaseStyles.phaseStatValue}>{phaseDoneNodeCount}/{phaseNodeRows.length}</p>
                  </div>
                  <div className={phaseStyles.phaseStat}>
                    <p className={phaseStyles.phaseStatLabel}>进行中 / 待确认</p>
                    <p className={phaseStyles.phaseStatValue}>{phaseInProgressNodeCount}/{phaseReviewingNodeCount}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedPhaseNode && openPhaseNodeModal(selectedPhaseNode, "photos")}
                    disabled={!selectedPhaseNode}
                    className={phaseStyles.phaseStat}
                  >
                    <p className={phaseStyles.phaseStatLabel}>阶段照片</p>
                    <p className={phaseStyles.phaseStatValue}>{currentPhaseFiles.length}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedPhaseNode && openPhaseNodeModal(selectedPhaseNode, "issue")}
                    disabled={!selectedPhaseNode}
                    className={`${phaseStyles.phaseStat} ${phaseStyles.phaseStatDanger}`}
                  >
                    <p className={phaseStyles.phaseStatLabel}>待整改</p>
                    <p className={phaseStyles.phaseStatValue}>{currentPhaseOpenIssues.length}</p>
                  </button>
                </div>

                <ThinScrollArea className={`${phaseStyles.nodeScroll} max-lg:flex-none`} scrollClassName={`${phaseStyles.nodeViewport} max-lg:h-auto`}>
                  <table className={phaseStyles.table}>
                    <colgroup>
                      <col className="w-[56px]" />
                      <col className="w-[22%]" />
                      <col className="w-[72px]" />
                      <col className="w-[136px]" />
                      <col className="w-[136px]" />
                      <col className="w-[90px]" />
                      <col className="w-[104px]" />
                      <col className="w-[88px]" />
                      <col className="w-[344px]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={phaseStyles.cellCenter}>序号</th>
                        <th className="text-left">工序节点</th>
                        <th className={phaseStyles.cellCenter}>类型</th>
                        <th className={phaseStyles.cellCenter}>计划时间</th>
                        <th className={phaseStyles.cellCenter}>实际完成时间</th>
                        <th className={phaseStyles.cellCenter}>状态</th>
                        <th className={phaseStyles.cellCenter}>标准</th>
                        <th className={phaseStyles.cellCenter}>记录</th>
                        <th className={phaseStyles.actionHeader}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phaseNodeRows.map((node) => {
                        const meta = getPhaseNodeStatusMeta(node.status, node.nodeType);
                        const nodeRecordLogs = getPhaseNodeRecordLogs(node);
                        const nodeRecordPhotoCount = nodeRecordLogs.reduce((sum: number, log: any) => sum + (Array.isArray(log.photos) ? log.photos.length : 0), 0);
                        const advanceAction = getPhaseNodeAdvanceAction(node);
                        const nodeStatusKey = String(node.status || "PENDING").toUpperCase();
                        const canStartNode = nodeStatusKey === "PENDING";
                        const canCancelNode = nodeStatusKey === "IN_PROGRESS";
                        const canSkipNode = !["COMPLETED", "SKIPPED"].includes(nodeStatusKey);
                        const canDeleteNode = node.fromTask && !node.templateNode;
                        return (
                          <tr
                            key={node.id}
                            onClick={() => setSelectedPhaseNodeId(node.id)}
                            className={phaseStyles.tableRow}
                            data-selected={selectedPhaseNode?.id === node.id ? "true" : "false"}
                          >
                            <td className={phaseStyles.cellCenter}>
                              <span className={phaseStyles.nodeIndex}>
                                {String(node.index + 1).padStart(2, "0")}
                              </span>
                            </td>
                            <td>
                              <span className={phaseStyles.nodeName} title={node.name}>{node.name}</span>
                            </td>
                            <td className={phaseStyles.cellCenter}>
                              <span className={`${phaseStyles.typeTag} ${node.nodeType === "acceptance" ? phaseStyles.typeAcceptance : phaseStyles.typeConstruction}`}>
                                {node.nodeType === "acceptance" ? "验收" : "施工"}
                              </span>
                            </td>
                            <td className={phaseStyles.cellCenter}>
                              <p className={phaseStyles.datePrimary}>{node.plannedStart && node.plannedEnd ? formatConstructionPlanDateRange(node.plannedStart, node.plannedEnd) : "-"}</p>
                              <p className={phaseStyles.dateSecondary}>{node.plannedDays ? `${node.plannedDays}天` : "未设置工期"}</p>
                            </td>
                            <td className={phaseStyles.cellCenter}>
                              <span className={phaseStyles.datePrimary}>{node.actualEnd ? formatConstructionPlanDateRange(node.actualEnd, node.actualEnd) : "-"}</span>
                            </td>
                            <td className={phaseStyles.cellCenter}>
                              <span className={`${phaseStyles.statusTag} ${meta.className}`}>
                                {meta.label}
                              </span>
                            </td>
                            <td className={phaseStyles.cellCenter}>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openPhaseNodeModal(node, "standard"); }}
                                className={phaseStyles.utilityButton}
                              >
                                <ClipboardCheck className="h-3.5 w-3.5" />
                                {node.standardItems.length || 0} 条
                              </button>
                            </td>
                            <td className={phaseStyles.cellCenter}>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openPhaseNodeModal(node, "records"); }}
                                className={phaseStyles.utilityButton}
                                title={`日志 ${nodeRecordLogs.length} 条，图片 ${nodeRecordPhotoCount} 张`}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {nodeRecordLogs.length}
                                <Camera className="ml-1 h-3.5 w-3.5" />
                                {nodeRecordPhotoCount}
                              </button>
                            </td>
                            <td className={phaseStyles.actionCell}>
                              <div className={phaseStyles.actionGroup}>
                                {canStartNode && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updatePhaseNodeStatus(node, "IN_PROGRESS");
                                    }}
                                    disabled={saving || isVirtualSite}
                                    className={phaseStyles.startButton}
                                  >
                                    开始施工
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); openPhaseNodeModal(node, "log"); }}
                                  className={phaseStyles.logButton}
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  写日志
                                </button>
                                {advanceAction && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (advanceAction.needsConfirm) {
                                        openPhaseNodeModal(node, "acceptance");
                                        return;
                                      }
                                      updatePhaseNodeStatus(node, advanceAction.nextStatus);
                                    }}
                                    disabled={saving || isVirtualSite}
                                    className={phaseStyles.advanceButton}
                                    data-reset={advanceAction.nextStatus === "PENDING" ? "true" : "false"}
                                  >
                                    {advanceAction.label}
                                  </button>
                                )}
                                {canCancelNode && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updatePhaseNodeStatus(node, "PENDING");
                                    }}
                                    disabled={saving || isVirtualSite}
                                    className={phaseStyles.cancelButton}
                                  >
                                    取消施工
                                  </button>
                                )}
                                {canSkipNode && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updatePhaseNodeStatus(node, "SKIPPED");
                                    }}
                                    disabled={saving || isVirtualSite}
                                    className={phaseStyles.skipButton}
                                  >
                                    此项不施工
                                  </button>
                                )}
                                {canDeleteNode && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setPhaseNodeDeleteMessage("");
                                      setPhaseNodeDeleteTarget(node);
                                    }}
                                    disabled={saving || isVirtualSite}
                                    className={phaseStyles.deleteNodeButton}
                                    title="删除新增节点"
                                    aria-label={`删除新增节点 ${node.name}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {phaseNodeRows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-10">
                            <EmptyText text="当前阶段暂无工序节点" />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </ThinScrollArea>

                <div className={phaseStyles.footer}>
                  <Activity className="h-3.5 w-3.5 shrink-0" />
                  <span className={phaseStyles.footerText}>
                    最近施工记录：
                    {currentPhaseLogs[0]?.content ? currentPhaseLogs[0].content : "暂无施工日志"}
                  </span>
                </div>
              </div>
                </>
              )}
            </section>
          )}

          {activeTab === "records" && (
            <section
              ref={siteDetailContentRef}
              className={`${recordStyles.workbench} ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`}
              style={siteDetailContentStyle}
            >
              <div className={recordStyles.filterBar}>
                <div className={recordStyles.filterGrid}>
                  <label className={recordStyles.searchField}>
                    <Search className={recordStyles.searchIcon} />
                    <input
                      value={constructionRecordSearch}
                      onChange={(event) => setConstructionRecordSearch(event.target.value)}
                      className={recordStyles.control}
                      placeholder="搜索节点、人员或记录"
                    />
                  </label>
                  <SystemSelect value={constructionRecordStageFilter} onChange={(event) => setConstructionRecordStageFilter(event.target.value)} className={recordStyles.control} menuClassName={recordStyles.selectMenu} optionClassName={recordStyles.selectOption}>
                    <option value="ALL">全部阶段</option>
                    {constructionTemplateStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                  </SystemSelect>
                  <SystemSelect value={constructionRecordStatusFilter} onChange={(event) => setConstructionRecordStatusFilter(event.target.value)} className={recordStyles.control} menuClassName={recordStyles.selectMenu} optionClassName={recordStyles.selectOption}>
                    <option value="ALL">全部状态</option>
                    <option value="IN_PROGRESS">进行中</option>
                    <option value="REVIEW">待确认</option>
                    <option value="COMPLETED">已完成</option>
                  </SystemSelect>
                  <SystemSelect value={constructionRecordTypeFilter} onChange={(event) => setConstructionRecordTypeFilter(event.target.value)} className={recordStyles.control} menuClassName={recordStyles.selectMenu} optionClassName={recordStyles.selectOption}>
                    <option value="ALL">全部操作</option>
                    <option value="NODE_STATUS">状态变更</option>
                    <option value="REPORT">施工汇报</option>
                    <option value="ISSUE">问题整改</option>
                    <option value="ATTACHMENT">节点附件</option>
                  </SystemSelect>
                  <SystemSelect value={constructionRecordPersonFilter} onChange={(event) => setConstructionRecordPersonFilter(event.target.value)} className={recordStyles.control} menuClassName={recordStyles.selectMenu} optionClassName={recordStyles.selectOption}>
                    <option value="ALL">全部人员</option>
                    {constructionRecordPersonOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </SystemSelect>
                  <SystemDateInput
                    value={constructionRecordDateFrom}
                    onChange={setConstructionRecordDateFrom}
                    className={recordStyles.control}
                    title="开始日期"
                  />
                  <SystemDateInput
                    value={constructionRecordDateTo}
                    onChange={setConstructionRecordDateTo}
                    className={recordStyles.control}
                    title="结束日期"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setConstructionRecordSearch("");
                      setConstructionRecordStageFilter("ALL");
                      setConstructionRecordStatusFilter("ALL");
                      setConstructionRecordTypeFilter("ALL");
                      setConstructionRecordPersonFilter("ALL");
                      setConstructionRecordDateFrom("");
                      setConstructionRecordDateTo("");
                    }}
                    className={recordStyles.clearButton}
                    title="清除筛选"
                  >
                    <Filter className="h-4 w-4" />
                    清除
                  </button>
                </div>
              </div>

              {constructionRecordError && (
                <div className={recordStyles.errorBanner}>
                  <span>{constructionRecordError}</span>
                  <button type="button" onClick={() => selected?.id && loadConstructionRecordEvents(selected.id)} className="font-semibold text-red-700">重试</button>
                </div>
              )}

              <div className={recordStyles.tableViewport}>
                <ThinScrollArea className={recordStyles.tableScroll}>
                  <table className={recordStyles.table}>
                    <colgroup>
                      <col className={recordStyles.colIndex} />
                      <col className={recordStyles.colNode} />
                      <col className={recordStyles.colReport} />
                      <col className={recordStyles.colWorkers} />
                      <col className={recordStyles.colReport} />
                      <col className={recordStyles.colStatus} />
                      <col className={recordStyles.colRecord} />
                      <col className={recordStyles.colRequired} />
                      <col className={recordStyles.colStatus} />
                      <col className={recordStyles.colRecord} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={recordStyles.headerCell}>序号</th>
                        <th className={recordStyles.headerCell}>施工节点</th>
                        <th className={recordStyles.headerCell}>项目经理汇报</th>
                        <th className={recordStyles.headerCell}>施工工人</th>
                        <th className={recordStyles.headerCell}>工人汇报</th>
                        <th className={recordStyles.headerCell}>施工状态</th>
                        <th className={recordStyles.headerCell}>自检记录</th>
                        <th className={recordStyles.headerCell}>是否必检</th>
                        <th className={recordStyles.headerCell}>验收状态</th>
                        <th className={recordStyles.headerCell}>验收记录</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConstructionRecordNodes.map((row, index) => {
                        const statusMeta = getPhaseNodeStatusMeta(row.node.status, row.node.nodeType);
                        const managerKey = normalizePlanText(selected?.manager_name);
                        const reportEvents = row.timeline.filter((event) => String(event.eventType || "").toUpperCase().startsWith("REPORT"));
                        const managerReportEvents = managerKey
                          ? reportEvents.filter((event) => normalizePlanText(event.operatorName) === managerKey)
                          : reportEvents;
                        const workerReportEvents = managerKey
                          ? reportEvents.filter((event) => normalizePlanText(event.operatorName) !== managerKey)
                          : [];
                        const countUniqueReports = (events: ConstructionRecordTimelineItem[]) => new Set(events.map((event) => event.sourceId || event.id)).size;
                        const workerNames = Array.from(new Set(workerReportEvents
                          .map((event) => event.operatorName)
                          .filter((name) => name && name !== "历史记录" && name !== "系统记录")));
                        const fallbackOwner = normalizePlanText(row.node.owner) !== managerKey ? row.node.owner : "";
                        const workerLabel = workerNames.join("/") || fallbackOwner || "--";
                        const isRequiredInspection = row.node.nodeType === "acceptance" || row.node.customerConfirmRequired || row.node.projectManagerConfirmRequired;
                        const nodeStatus = String(row.node.status || "PENDING").toUpperCase();
                        const acceptanceStatusMeta = nodeStatus === "SKIPPED"
                          ? { label: "不施工", className: recordStyles.acceptanceExempt }
                          : !isRequiredInspection
                          ? { label: "免检", className: recordStyles.acceptanceExempt }
                          : nodeStatus === "COMPLETED"
                            ? { label: "已验收", className: recordStyles.acceptancePassed }
                            : nodeStatus === "REVIEW" && row.node.nodeType === "acceptance"
                              ? { label: "验收不通过", className: recordStyles.acceptanceFailed }
                            : { label: "待验收", className: recordStyles.acceptancePending };
                        const constructionStatusClass = nodeStatus === "COMPLETED"
                          ? recordStyles.constructionStatusComplete
                          : nodeStatus === "IN_PROGRESS"
                            ? recordStyles.constructionStatusActive
                            : nodeStatus === "REVIEW"
                              ? recordStyles.constructionStatusReview
                              : recordStyles.constructionStatusPending;
                        const constructionStatusLabel = nodeStatus === "SKIPPED"
                          ? "不施工"
                          : nodeStatus === "COMPLETED" && row.node.nodeType === "construction"
                          ? "已完工"
                          : statusMeta.label;
                        return (
                          <tr
                            key={row.key}
                            role="button"
                            tabIndex={0}
                            onClick={() => { setConstructionRecordNodeId(row.key); setConstructionRecordTimelineFilter("ALL"); }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setConstructionRecordNodeId(row.key);
                                setConstructionRecordTimelineFilter("ALL");
                              }
                            }}
                            className={recordStyles.tableRow}
                          >
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell} ${recordStyles.indexCell}`}>{index + 1}</td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <p className={recordStyles.nodeName} title={row.node.name}>{row.node.name}</p>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <button type="button" className={recordStyles.countLink} onClick={(event) => { event.stopPropagation(); setConstructionRecordNodeId(row.key); setConstructionRecordTimelineFilter("REPORT"); }}>
                                {countUniqueReports(managerReportEvents)}次
                              </button>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <span className={recordStyles.workerNames} title={workerLabel}>{workerLabel}</span>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <button type="button" className={recordStyles.countLink} onClick={(event) => { event.stopPropagation(); setConstructionRecordNodeId(row.key); setConstructionRecordTimelineFilter("REPORT"); }}>
                                {countUniqueReports(workerReportEvents)}次
                              </button>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <span className={`${recordStyles.constructionStatus} ${constructionStatusClass}`}>{constructionStatusLabel}</span>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <button type="button" className={recordStyles.recordLink} onClick={(event) => { event.stopPropagation(); setConstructionRecordNodeId(row.key); setConstructionRecordTimelineFilter("REPORT"); }}>查看自检</button>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <span className={recordStyles.requiredText}>{isRequiredInspection ? "是" : "否"}</span>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              <span className={`${recordStyles.acceptanceTag} ${acceptanceStatusMeta.className}`}>{acceptanceStatusMeta.label}</span>
                            </td>
                            <td className={`${recordStyles.cell} ${recordStyles.centerCell}`}>
                              {isRequiredInspection ? (
                                <button type="button" className={recordStyles.recordLink} onClick={(event) => { event.stopPropagation(); setConstructionRecordNodeId(row.key); setConstructionRecordTimelineFilter("NODE_STATUS"); }}>查看验收</button>
                              ) : <span className={recordStyles.emptyValue}>--</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ThinScrollArea>

                {constructionRecordLoading && allConstructionRecordNodes.length === 0 && (
                  <div className={recordStyles.stateView}>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary-600" /> 正在读取施工记录
                  </div>
                )}
                {!constructionRecordLoading && filteredConstructionRecordNodes.length === 0 && (
                  <div className={recordStyles.stateView}>
                    <div>
                      <Activity className="mx-auto h-8 w-8 text-surface-300" />
                      <p className="mt-3 text-sm font-semibold text-surface-700">暂无匹配的施工节点</p>
                      <p className="mt-1 text-xs text-surface-400">调整筛选条件后重新查看。</p>
                    </div>
                  </div>
                )}
              </div>

              <footer className={recordStyles.footer}>
                当前显示 {filteredConstructionRecordNodes.length} / {visibleConstructionRecordNodes.length} 个节点
              </footer>
            </section>
          )}

          {activeTab === "quantity" && (
            <section ref={siteDetailContentRef} className={SITE_DETAIL_CONTENT_HEIGHT_CLASS} style={siteDetailContentStyle}>
              <SiteQuantityReviewTab
                project={selected}
                quotationItems={quantityReviewBudgetItems}
                reviews={quantityReviews}
                currentPhaseKey={currentPhaseKey || ""}
                saving={saving}
                disabled={isVirtualSite}
                onCreate={createQuantityReview}
              />
            </section>
          )}

          {activeTab === "cameras" && (
            <SiteCameraTab
              contentRef={siteDetailContentRef}
              contentStyle={siteDetailContentStyle}
              contentHeightClass={SITE_DETAIL_CONTENT_HEIGHT_CLASS}
              project={selected}
              siteDisplayName={siteDisplayName}
              siteAddress={siteAddress}
              cameras={siteCameras}
              isVirtualSite={isVirtualSite}
              onRefresh={() => load({ silent: true })}
            />
          )}

          {activeTab === "costs" && (
            <section ref={siteDetailContentRef} className={`${costStyles.workspace} ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`} style={siteDetailContentStyle}>
              <div className={costStyles.metricStrip}>
                <CostMetricCard label="预算收入" value={budgetRevenueAmount} displayValue={activeCostSnapshot ? undefined : "--"} helper={activeCostSnapshot ? "正式报价自动生成" : "暂无正式报价成本快照"} tone="blue" featured />
                <CostMetricCard label="预算总成本" value={budgetTotalCostAmount} displayValue={activeCostSnapshot ? undefined : "--"} helper="内部人工 + 内部材料" tone="neutral" />
                <CostMetricCard label="预算材料成本" value={budgetMaterialCostAmount} displayValue={activeCostSnapshot ? undefined : "--"} helper="含材料损耗率" tone="amber" />
                <CostMetricCard label="预算人工成本" value={budgetLaborCostAmount} displayValue={activeCostSnapshot ? undefined : "--"} helper="按内部人工成本" tone="green" />
                <CostMetricCard label="预算毛利" value={budgetGrossProfitAmount} displayValue={activeCostSnapshot ? undefined : "--"} helper="预算收入 - 预算成本" tone={budgetGrossProfitAmount < 0 ? "red" : "green"} />
                <CostMetricCard label="预算毛利率" value={budgetGrossProfitRate} displayValue={activeCostSnapshot ? `${budgetGrossProfitRate}%` : "--"} helper="按预算收入计算" tone={budgetGrossProfitAmount < 0 ? "red" : "green"} />
                <CostMetricCard label="项目经理提成" value={0} displayValue={activeCostSnapshot ? "待计算" : "--"} helper="计算规则待配置" tone="neutral" />
                <CostMetricCard label="已发生成本" value={totalCostAmount} helper="手工支出 + 材料订单" tone={realtimeGrossProfitAmount < 0 ? "red" : "neutral"} />
                <CostMetricCard label="预算剩余额度" value={budgetActualCostGap} displayValue={activeCostSnapshot ? formatPlainAmount(budgetActualCostGap) : "--"} helper="预算总成本 - 已发生" tone={budgetActualCostGap < 0 ? "red" : "neutral"} />
                <CostMetricCard label="实时毛利" value={realtimeGrossProfitAmount} helper="合同收入 + 变更 - 已发生" tone={realtimeGrossProfitAmount < 0 ? "red" : "green"} />
              </div>

              <section className={costStyles.budgetPanel}>
                <header className={costStyles.budgetHeader}>
                  <div>
                    <span className={costStyles.sectionIcon} data-tone={budgetMissingRuleCount > 0 ? "warning" : "success"}>
                      <Calculator className="h-4 w-4" />
                    </span>
                    <div>
                      <h3>预算成本明细</h3>
                      <p>{activeCostSnapshot ? `${activeCostSnapshot.source_title || "正式报价"} · ${costSnapshotItems.length} 项` : "报价设为正式后，系统会自动生成成本快照"}</p>
                    </div>
                  </div>
                  <div className={costStyles.budgetHeaderActions}>
                    <button type="button" className={costStyles.detailButton} onClick={() => setActualCompareOpen(true)}>
                      <Eye className="h-3.5 w-3.5" />
                      实际对比明细
                    </button>
                    <span className={costStyles.sectionMeta}>{activeCostSnapshot ? `更新于 ${formatDate(activeCostSnapshot.updated_at || activeCostSnapshot.created_at)}` : "等待正式报价"}</span>
                  </div>
                </header>
                {activeCostSnapshot && budgetMissingRuleCount > 0 && (
                  <div className={costStyles.budgetWarning}>
                    <AlertTriangle className="h-4 w-4" />
                    <span>有 {budgetMissingRuleCount} 个报价项目缺少内部成本规则，请到标准定额库补充内部人工成本、内部材料成本或损耗率。</span>
                  </div>
                )}
                {costSnapshotItems.length > 0 ? (
                  <div className={costStyles.budgetExplorer}>
                    <aside className={costStyles.budgetGroupRail} aria-label="预算成本分组">
                      <button
                        type="button"
                        className={costStyles.budgetGroupItem}
                        data-active={selectedBudgetGroup.key === "all"}
                        onClick={() => setBudgetDetailGroupKey("all")}
                      >
                        <span className={costStyles.budgetGroupIcon}><Layers className="h-3.5 w-3.5" /></span>
                        <span className={costStyles.budgetGroupMain}>
                          <strong>{budgetAllGroup.name}</strong>
                          <small>{budgetAllGroup.count} 项</small>
                        </span>
                        <b>{formatPlainAmount(budgetAllGroup.amount)}</b>
                      </button>

                      <div className={costStyles.budgetGroupSection}>
                        <p>工种</p>
                        {budgetWorkGroups.map((group) => {
                          const meta = getBudgetWorkGroupMeta(group.name);
                          const Icon = meta.icon;
                          return (
                            <button
                              key={group.key}
                              type="button"
                              className={costStyles.budgetGroupItem}
                              data-active={selectedBudgetGroup.key === group.key}
                              onClick={() => setBudgetDetailGroupKey(group.key)}
                            >
                              <span className={costStyles.budgetGroupIcon} data-tone={meta.tone}><Icon className="h-3.5 w-3.5" /></span>
                              <span className={costStyles.budgetGroupMain}>
                                <strong>{group.name}</strong>
                                <small>{group.count} 项</small>
                              </span>
                              <b>{formatPlainAmount(group.laborAmount)}</b>
                            </button>
                          );
                        })}
                      </div>

                      <div className={costStyles.budgetGroupSection}>
                        <p>材料分类</p>
                        {budgetMaterialGroups.map((group) => {
                          const meta = getBudgetMaterialGroupMeta(group.name);
                          const Icon = meta.icon;
                          return (
                            <button
                              key={group.key}
                              type="button"
                              className={costStyles.budgetGroupItem}
                              data-active={selectedBudgetGroup.key === group.key}
                              onClick={() => setBudgetDetailGroupKey(group.key)}
                            >
                              <span className={costStyles.budgetGroupIcon} data-tone={meta.tone}><Icon className="h-3.5 w-3.5" /></span>
                              <span className={costStyles.budgetGroupMain}>
                                <strong>{group.name}</strong>
                                <small>{group.count} 项</small>
                              </span>
                              <b>{formatPlainAmount(group.materialAmount)}</b>
                            </button>
                          );
                        })}
                      </div>
                    </aside>

                    <div className={costStyles.budgetDetailPane}>
                      <header className={costStyles.budgetDetailHeader}>
                        <div>
                          <p>{selectedBudgetGroup.name}</p>
                          <span>{selectedBudgetGroupSummary}</span>
                        </div>
                        <strong>{formatPlainAmount(selectedBudgetGroupAmount)}</strong>
                      </header>
                      <div className={costStyles.budgetTableViewport}>
                        <table className={costStyles.budgetTable}>
                          <thead>
                            <tr>
                              <th>空间</th>
                              <th>项目名称</th>
                              {!isMaterialBudgetGroup ? <th>工种</th> : null}
                              {!isWorkBudgetGroup ? <th>材料分类</th> : null}
                              <th className={costStyles.alignRight}>数量</th>
                              {!isWorkBudgetGroup ? <th className={costStyles.alignRight}>内部材料</th> : null}
                              {!isMaterialBudgetGroup ? <th className={costStyles.alignRight}>内部人工</th> : null}
                              {!isWorkBudgetGroup ? <th className={costStyles.alignRight}>材料成本</th> : null}
                              {!isMaterialBudgetGroup ? <th className={costStyles.alignRight}>人工成本</th> : null}
                              {isAllBudgetGroup ? <th className={costStyles.alignRight}>预算成本</th> : null}
                              <th>状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleBudgetRows.map((item: any) => {
                              const missingRule = Number(item.missing_cost_rule || 0) === 1;
                              return (
                                <tr key={item.id}>
                                  <td>{item.space || "-"}</td>
                                  <td className={costStyles.budgetNameCell}>{item.name || "-"}</td>
                                  {!isMaterialBudgetGroup ? <td>{item.work_type_name || "-"}</td> : null}
                                  {!isWorkBudgetGroup ? <td>{item.material_category_name || "-"}</td> : null}
                                  <td className={costStyles.amountCell}>{formatPlainQuantity(Number(item.quantity || 0))}{item.unit ? ` ${item.unit}` : ""}</td>
                                  {!isWorkBudgetGroup ? <td className={costStyles.amountCell}>{formatPlainAmount(Number(item.cost_material_unit || 0))}</td> : null}
                                  {!isMaterialBudgetGroup ? <td className={costStyles.amountCell}>{formatPlainAmount(Number(item.cost_labor_unit || 0))}</td> : null}
                                  {!isWorkBudgetGroup ? <td className={costStyles.amountCell}>{formatPlainAmount(Number(item.budget_material_cost || 0))}</td> : null}
                                  {!isMaterialBudgetGroup ? <td className={costStyles.amountCell}>{formatPlainAmount(Number(item.budget_labor_cost || 0))}</td> : null}
                                  {isAllBudgetGroup ? <td className={costStyles.amountCell}>{formatPlainAmount(Number(item.budget_total_cost || 0))}</td> : null}
                                  <td>
                                    <span className={costStyles.statusTag} data-tone={missingRule ? "danger" : "success"}>
                                      {missingRule ? "缺成本规则" : "已核算"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={costStyles.ledgerEmpty}>
                    <span><Calculator className="h-5 w-5" /></span>
                    <strong>暂无预算成本快照</strong>
                    <p>将报价设为正式后，系统会根据定额内部成本自动生成预算成本。</p>
                  </div>
                )}
              </section>

              <aside className={costStyles.formPanel}>
                  <header className={costStyles.formHeader}>
                    <span className={costStyles.headerIcon}><Plus className="h-4 w-4" /></span>
                    <div>
                      <h3>新增支出</h3>
                      <p>填写常用信息即可记录</p>
                    </div>
                  </header>
                  <div className={costStyles.formBody}>
                    <label className={costStyles.field}>
                      <span className={costStyles.fieldLabel}>支出分类</span>
                      <SystemSelect
                        value={costForm.category}
                        onChange={(event) => setCostForm((form) => ({
                          ...form,
                          category: event.target.value,
                          work_type_name: ["LABOR", "SUBCONTRACT"].includes(String(event.target.value || "").toUpperCase()) ? form.work_type_name : "",
                          material_category_name: ["AUXILIARY", "MAIN_MATERIAL", "EQUIPMENT"].includes(String(event.target.value || "").toUpperCase()) ? form.material_category_name : "",
                        }))}
                        className={costStyles.formControl}
                        menuClassName={costStyles.selectMenu}
                        optionClassName={costStyles.selectOption}
                        disabled={saving || isVirtualSite}
                      >
                        {costCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </SystemSelect>
                    </label>
                    {costFormIsLabor && (
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>归集工种</span>
                        <SystemSelect value={costForm.work_type_name} onChange={(event) => setCostForm((form) => ({ ...form, work_type_name: event.target.value }))} className={costStyles.formControl} menuClassName={costStyles.selectMenu} optionClassName={costStyles.selectOption} disabled={saving || isVirtualSite}>
                          <option value="">未指定工种</option>
                          {workTypeCostOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                        </SystemSelect>
                      </label>
                    )}
                    {costFormIsMaterial && (
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>材料分类</span>
                        <SystemSelect value={costForm.material_category_name} onChange={(event) => setCostForm((form) => ({ ...form, material_category_name: event.target.value }))} className={costStyles.formControl} menuClassName={costStyles.selectMenu} optionClassName={costStyles.selectOption} disabled={saving || isVirtualSite}>
                          <option value="">未指定材料分类</option>
                          {materialCategoryCostOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                        </SystemSelect>
                      </label>
                    )}
                    <label className={`${costStyles.field} ${costStyles.fieldWide}`}>
                      <span className={costStyles.fieldLabel}>费用名称</span>
                      <input value={costForm.name} onChange={(event) => setCostForm((form) => ({ ...form, name: event.target.value }))} className={costStyles.formControl} placeholder="如：泥工工资、水泥沙、临时搬运" disabled={saving || isVirtualSite} />
                    </label>
                    <label className={costStyles.field}>
                      <span className={costStyles.fieldLabel}>金额</span>
                      <input value={costForm.amount} onChange={(event) => setCostForm((form) => ({ ...form, amount: event.target.value }))} className={`${costStyles.formControl} ${costStyles.numberControl}`} inputMode="decimal" placeholder="0.00" disabled={saving || isVirtualSite} />
                    </label>
                    <label className={costStyles.field}>
                      <span className={costStyles.fieldLabel}>支出日期</span>
                      <SystemDateInput value={costForm.cost_date} onChange={(nextValue) => setCostForm((form) => ({ ...form, cost_date: nextValue }))} className={costStyles.formControl} disabled={saving || isVirtualSite} />
                    </label>
                    <button type="button" onClick={addCostRecord} disabled={saving || isVirtualSite} className={costStyles.submitButton}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      记录成本支出
                    </button>
                  </div>
                  {costMessage && (
                    <div className={costStyles.message} data-tone={costMessage.includes("失败") || costMessage.includes("必须") || costMessage.includes("请") ? "error" : "success"}>
                      {costMessage}
                    </div>
                  )}
                  <details className={costStyles.advancedPanel}>
                    <summary className={costStyles.advancedSummary}>
                      <span><ChevronRight className={costStyles.disclosureIcon} />更多信息</span>
                      <small>施工阶段、付款与单据</small>
                    </summary>
                    <div className={costStyles.advancedGrid}>
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>施工阶段</span>
                        <SystemSelect value={costForm.phase} onChange={(event) => setCostForm((form) => ({ ...form, phase: event.target.value }))} className={costStyles.formControl} menuClassName={costStyles.selectMenu} optionClassName={costStyles.selectOption} disabled={saving || isVirtualSite}>
                          <option value="">不关联阶段</option>
                          {phaseSelectOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                        </SystemSelect>
                      </label>
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>供应商/班组</span>
                        <input value={costForm.supplier} onChange={(event) => setCostForm((form) => ({ ...form, supplier: event.target.value }))} className={costStyles.formControl} placeholder="供应商或班组" disabled={saving || isVirtualSite} />
                      </label>
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>收款方</span>
                        <input value={costForm.payee} onChange={(event) => setCostForm((form) => ({ ...form, payee: event.target.value }))} className={costStyles.formControl} placeholder="收款人" disabled={saving || isVirtualSite} />
                      </label>
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>支付方式</span>
                        <input value={costForm.payment_method} onChange={(event) => setCostForm((form) => ({ ...form, payment_method: event.target.value }))} className={costStyles.formControl} placeholder="微信/转账/现金" disabled={saving || isVirtualSite} />
                      </label>
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>支付状态</span>
                        <SystemSelect value={costForm.status} onChange={(event) => setCostForm((form) => ({ ...form, status: event.target.value }))} className={costStyles.formControl} menuClassName={costStyles.selectMenu} optionClassName={costStyles.selectOption} disabled={saving || isVirtualSite}>
                          <option value="PAID">已支付</option>
                          <option value="PENDING">待支付</option>
                          <option value="UNPAID">未支付</option>
                        </SystemSelect>
                      </label>
                      <label className={costStyles.field}>
                        <span className={costStyles.fieldLabel}>发票/单据号</span>
                        <input value={costForm.invoice_no} onChange={(event) => setCostForm((form) => ({ ...form, invoice_no: event.target.value }))} className={costStyles.formControl} placeholder="发票号或付款单号" disabled={saving || isVirtualSite} />
                      </label>
                      <label className={`${costStyles.field} ${costStyles.fieldWide}`}>
                        <span className={costStyles.fieldLabel}>备注</span>
                        <textarea value={costForm.remark} onChange={(event) => setCostForm((form) => ({ ...form, remark: event.target.value }))} className={`${costStyles.formControl} ${costStyles.textarea}`} placeholder="数量、规格或付款说明" disabled={saving || isVirtualSite} />
                      </label>
                    </div>
                  </details>
              </aside>

              <div className={costStyles.contentGrid}>
                  <section className={costStyles.ledgerPanel}>
                    <header className={costStyles.ledgerHeader}>
                      <div className={costStyles.ledgerTitle}>
                        <span className={costStyles.chartIcon}><ClipboardList className="h-4 w-4" /></span>
                        <div>
                          <h3>成本流水</h3>
                          <p>手工支出与材料订单成本统一归集</p>
                        </div>
                      </div>
                      <span className={costStyles.countBadge}>共 {costLedgerRows.length} 笔</span>
                    </header>

                    <div className={costStyles.tableViewport}>
                      {costLedgerRows.length > 0 ? (
                        <table className={costStyles.ledgerTable}>
                          <thead>
                            <tr>
                              <th>支出日期</th>
                              <th>费用名称</th>
                              <th>分类</th>
                              <th>归集维度</th>
                              <th>供应商 / 收款方</th>
                              <th>支付方式</th>
                              <th>支付状态</th>
                              <th className={costStyles.alignRight}>金额</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costLedgerRows.map((record: any) => {
                              const paymentTone = record.status === "PAID" ? "success" : record.status === "PENDING" ? "warning" : "danger";
                              const paymentLabel = record.status === "PAID" ? "已支付" : record.status === "PENDING" ? "待支付" : "未支付";
                              return (
                                <tr key={record.id}>
                                  <td className={costStyles.dateCell}>{record.cost_date ? formatDate(record.cost_date) : "-"}</td>
                                  <td>
                                    <div className={costStyles.nameCell} title={record.name || "-"}>
                                      <span className={costStyles.sourceMark} data-source={record.source_type === "MATERIAL_ORDER" ? "system" : "manual"} />
                                      <strong>{record.name || "-"}</strong>
                                    </div>
                                  </td>
                                  <td><span className={costStyles.categoryTag}>{costCategoryLabels[record.category] || "其他"}</span></td>
                                  <td>
                                    <span className={costStyles.textCell}>
                                      {record.source_type === "MATERIAL_ORDER"
                                        ? "材料订单自动"
                                        : record.work_type_name || record.material_category_name || "-"}
                                    </span>
                                  </td>
                                  <td><span className={costStyles.textCell} title={record.supplier || record.payee || "-"}>{record.supplier || record.payee || "-"}</span></td>
                                  <td><span className={costStyles.textCell}>{record.payment_method || "-"}</span></td>
                                  <td><span className={costStyles.statusTag} data-tone={paymentTone}>{paymentLabel}</span></td>
                                  <td className={costStyles.amountCell}>{formatPlainAmount(Number(record.amount || 0))}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className={costStyles.ledgerEmpty}>
                          <span><ClipboardList className="h-5 w-5" /></span>
                          <strong>暂无成本流水</strong>
                          <p>记录支出或完成材料入库后，成本会汇总到这里。</p>
                        </div>
                      )}
                    </div>

                    <footer className={costStyles.ledgerFooter}>
                      <span>手工 {manualCostRows.length} 笔 · 材料订单 {materialCostRows.length} 笔</span>
                      <strong>合计 {formatPlainAmount(totalCostAmount)}</strong>
                    </footer>
                  </section>
              </div>

              <div className={costStyles.analysisPanel}>
                <div className={costStyles.analysisDashboard}>
                  <section className={costStyles.analysisSection}>
                    <header className={costStyles.analysisSectionHeader}>
                      <div>
                        <span className={costStyles.sectionIcon}><DollarSign className="h-4 w-4" /></span>
                        <div>
                          <h3>预算成本构成</h3>
                          <p>按工种人工与材料分类统计预算成本占比</p>
                        </div>
                      </div>
                      <span className={costStyles.sectionMeta}>预算合计 {formatPlainAmount(budgetCompositionTotal)}</span>
                    </header>
                    <div className={costStyles.categoryChart}>
                      <CostCategoryDonut rows={budgetCompositionRows} total={budgetCompositionTotal} />

                      <div className={costStyles.categoryLegendList}>
                        {budgetCompositionRows.map((row) => {
                          const share = budgetCompositionTotal > 0 ? Math.round((row.value / budgetCompositionTotal) * 1000) / 10 : 0;
                          return (
                            <div key={row.key} className={costStyles.categoryLegendItem}>
                              <span className={costStyles.categoryLegendName}><i style={{ backgroundColor: row.color }} />{row.name}</span>
                              <span className={costStyles.categoryLegendShare}>{share}%</span>
                              <strong>{formatPlainAmount(row.value)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </section>
          )}

          {activeTab === "settlement" && (
            <section ref={siteDetailContentRef} className={`${settlementStyles.workspace} ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`} style={siteDetailContentStyle}>
              <div className={settlementStyles.toolbar}>
                <div>
                  <h2>结算利润</h2>
                  <p>
                    {activeOwnerSettlementBill
                      ? `当前结算单 ${activeOwnerSettlementBill.bill_no} · ${ownerSettlementBillStatusLabels[activeOwnerSettlementBill.status] || activeOwnerSettlementBill.status || "-"}`
                      : "根据合同、增减项、收款与成本自动生成业主结算单"}
                  </p>
                </div>
                <div className={settlementStyles.toolbarActions}>
                  {settlementMessage && <span className={settlementStyles.actionMessage}>{settlementMessage}</span>}
                  <button
                    type="button"
                    className={settlementStyles.primaryButton}
                    onClick={generateOwnerSettlementBill}
                    disabled={saving || !selected}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    生成业主结算单
                  </button>
                </div>
              </div>

              <div className={settlementStyles.metricStrip}>
                <div className={settlementStyles.metric} data-tone={settlementActualProfitAmount >= 0 ? "profit" : "danger"}>
                  <span>项目毛利</span>
                  <strong>{formatPlainAmount(settlementActualProfitAmount)}</strong>
                  <p>毛利率 {settlementActualProfitRate}%</p>
                </div>
                <div className={settlementStyles.metric}>
                  <span>最终应收</span>
                  <strong>{formatPlainAmount(ownerSettlementSignedAmount)}</strong>
                  <p>合同 + 已审批增减项</p>
                </div>
                <div className={settlementStyles.metric} data-tone={ownerSettlementReceivableAmount > 0 ? "danger" : "success"}>
                  <span>{ownerSettlementRefundAmount > 0 ? "应退金额" : "待收金额"}</span>
                  <strong>{formatPlainAmount(ownerSettlementRefundAmount > 0 ? ownerSettlementRefundAmount : ownerSettlementReceivableAmount)}</strong>
                  <p>已收 {formatPlainAmount(ownerSettlementReceivedAmount)}</p>
                </div>
                <div className={settlementStyles.metric} data-tone={costOverrunAmount > 0 ? "danger" : "success"}>
                  <span>{costOverrunAmount > 0 ? "成本超支" : "成本节约"}</span>
                  <strong>{formatPlainAmount(costOverrunAmount > 0 ? costOverrunAmount : costSavingAmount)}</strong>
                  <p>预算成本 {formatPlainAmount(budgetTotalCostAmount)}</p>
                </div>
              </div>

              <section className={settlementStyles.flowPanel}>
                {settlementFlowRows.map((step, index) => (
                  <div key={step.key} className={settlementStyles.flowStep} data-tone={step.tone}>
                    <span className={settlementStyles.flowIndex}>{index + 1}</span>
                    <div>
                      <p>{step.label}</p>
                      <strong>{step.value}</strong>
                    </div>
                    <em>{step.state}</em>
                  </div>
                ))}
              </section>

              <section className={settlementStyles.panel}>
                <header className={settlementStyles.panelHeader}>
                  <div>
                    <h3>结算单记录</h3>
                    <p>每次生成都会固化当时口径，确认后作为业主结算依据</p>
                  </div>
                  <span data-tone={ownerSettlementBills.some((bill: any) => bill.status === "CONFIRMED") ? "success" : ownerSettlementBills.some((bill: any) => bill.status === "DRAFT") ? "warning" : undefined}>
                    {ownerSettlementBills.some((bill: any) => bill.status === "CONFIRMED") ? "已有确认单" : ownerSettlementBills.some((bill: any) => bill.status === "DRAFT") ? "待确认" : "暂无记录"}
                  </span>
                </header>
                {ownerSettlementBills.length > 0 ? (
                  <div className={settlementStyles.billTableWrap}>
                    <table className={settlementStyles.billTable}>
                      <thead>
                        <tr>
                          <th>结算单号</th>
                          <th>状态</th>
                          <th>最终应收</th>
                          <th>已收</th>
                          <th>待收/应退</th>
                          <th>实际成本</th>
                          <th>项目毛利</th>
                          <th>生成时间</th>
                          <th>确认信息</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ownerSettlementBills.map((bill: any) => {
                          const status = String(bill.status || "DRAFT").toUpperCase();
                          const balanceLabel = Number(bill.refund_amount || 0) > 0 ? "应退" : "待收";
                          const balanceAmount = Number(bill.refund_amount || 0) > 0 ? Number(bill.refund_amount || 0) : Number(bill.receivable_amount || 0);
                          return (
                            <tr key={bill.id}>
                              <td>
                                <strong>{bill.bill_no || "-"}</strong>
                                <p>{bill.created_by_name ? `由 ${bill.created_by_name} 生成` : "系统生成"}</p>
                              </td>
                              <td>
                                <span className={settlementStyles.statusBadge} data-status={status}>
                                  {ownerSettlementBillStatusLabels[status] || status}
                                </span>
                              </td>
                              <td className={settlementStyles.amountCell}>{formatPlainAmount(Number(bill.settlement_amount || 0))}</td>
                              <td className={settlementStyles.amountCell}>{formatPlainAmount(Number(bill.received_amount || 0))}</td>
                              <td className={settlementStyles.amountCell} data-tone={Number(bill.refund_amount || 0) > 0 ? "warning" : Number(bill.receivable_amount || 0) > 0 ? "danger" : "success"}>
                                {balanceLabel} {formatPlainAmount(balanceAmount)}
                              </td>
                              <td className={settlementStyles.amountCell}>{formatPlainAmount(Number(bill.actual_cost_amount || 0))}</td>
                              <td className={settlementStyles.amountCell} data-tone={Number(bill.actual_profit_amount || 0) >= 0 ? "success" : "danger"}>
                                {formatPlainAmount(Number(bill.actual_profit_amount || 0))}
                                <p>{Number(bill.actual_profit_rate || 0)}%</p>
                              </td>
                              <td>{formatDateTime(bill.created_at)}</td>
                              <td>{status === "CONFIRMED" ? `${bill.confirmed_by_name || "已确认"} · ${formatDateTime(bill.confirmed_at)}` : "-"}</td>
                              <td>
                                <div className={settlementStyles.rowActions}>
                                  {status === "DRAFT" && (
                                    <>
                                      <button
                                        type="button"
                                        className={settlementStyles.textButton}
                                        onClick={() => postOwnerSettlementBillAction(bill, "confirm_owner_settlement_bill", "业主结算单已确认")}
                                        disabled={saving}
                                      >
                                        确认结算
                                      </button>
                                      <button
                                        type="button"
                                        className={settlementStyles.ghostButton}
                                        onClick={() => postOwnerSettlementBillAction(bill, "cancel_owner_settlement_bill", "业主结算单已作废")}
                                        disabled={saving}
                                      >
                                        作废
                                      </button>
                                    </>
                                  )}
                                  {status !== "DRAFT" && <span className={settlementStyles.mutedText}>已锁定</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={settlementStyles.emptyState}>
                    <FileText className="h-5 w-5" />
                    <strong>还没有生成业主结算单</strong>
                    <p>确认合同、增减项和收款后，可在上方生成结算单。</p>
                  </div>
                )}
              </section>

              <div className={settlementStyles.mainGrid}>
                <section className={settlementStyles.panel}>
                  <header className={settlementStyles.panelHeader}>
                    <div>
                      <h3>业主结算</h3>
                      <p>自动汇总合同、增减项、收款和应退应收</p>
                    </div>
                    <span data-tone={ownerSettlementReceivableAmount > 0 ? "danger" : ownerSettlementRefundAmount > 0 ? "warning" : "success"}>
                      {ownerSettlementReceivableAmount > 0 ? "待收款" : ownerSettlementRefundAmount > 0 ? "待退款" : "已平账"}
                    </span>
                  </header>
                  <div className={settlementStyles.breakdownList}>
                    {[
                      { label: "报价原金额", value: quotedContractAmount, helper: contractDiscountAmount > 0 ? `报价优惠 ${formatPlainAmount(contractDiscountAmount)}` : "来自正式报价/合同" },
                      { label: "合同签约金额", value: contractAmount, helper: activeContract?.contract_no || activeContract?.title || "当前签约合同" },
                      { label: "增项金额", value: addChangeAmount, helper: "已审批增项合计", tone: "danger" },
                      { label: "减项金额", value: deductChangeAmount, helper: "已审批减项合计", tone: "success", prefix: "-" },
                      { label: "工程量待转结算", value: pendingQuantityReviewAmount, helper: `${pendingQuantityReviewCount} 张已确认复核单未生成增减项`, tone: pendingQuantityReviewAmount >= 0 ? "danger" : "success" },
                      { label: "最终应收合计", value: ownerSettlementSignedAmount, helper: "合同签约金额 + 已审批增减项", summary: true },
                      { label: "已收合计", value: ownerSettlementReceivedAmount, helper: "合同款、定金、设计费及增减项收款", tone: "success" },
                      { label: ownerSettlementRefundAmount > 0 ? "应退客户" : "客户待收", value: ownerSettlementRefundAmount > 0 ? ownerSettlementRefundAmount : ownerSettlementReceivableAmount, helper: "用于业主结算确认", tone: ownerSettlementRefundAmount > 0 ? "warning" : ownerSettlementReceivableAmount > 0 ? "danger" : "success", summary: true },
                    ].map((row) => (
                      <div key={row.label} className={settlementStyles.breakdownRow} data-summary={row.summary ? "true" : undefined}>
                        <div>
                          <span>{row.label}</span>
                          <p>{row.helper}</p>
                        </div>
                        <strong data-tone={row.tone}>{row.prefix || ""}{formatPlainAmount(row.value)}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={settlementStyles.panel}>
                  <header className={settlementStyles.panelHeader}>
                    <div>
                      <h3>成本结算</h3>
                      <p>预算成本与实际归集成本自动对账</p>
                    </div>
                    <span data-tone={costOverrunAmount > 0 ? "danger" : unsettledCostAmount > 0 ? "warning" : "success"}>
                      {costOverrunAmount > 0 ? "成本超支" : unsettledCostAmount > 0 ? "待结算" : "成本正常"}
                    </span>
                  </header>
                  <div className={settlementStyles.costGrid}>
                    <div>
                      <span>预算人工</span>
                      <strong>{formatPlainAmount(budgetLaborCostAmount)}</strong>
                      <p>实际 {formatPlainAmount(actualLaborCostAmount)}</p>
                    </div>
                    <div>
                      <span>预算材料</span>
                      <strong>{formatPlainAmount(budgetMaterialCostAmount)}</strong>
                      <p>实际 {formatPlainAmount(actualMaterialCostAmount)}</p>
                    </div>
                    <div>
                      <span>其他成本</span>
                      <strong>{formatPlainAmount(actualOtherCostAmount)}</strong>
                      <p>手工归集</p>
                    </div>
                    <div>
                      <span>未结算成本</span>
                      <strong>{formatPlainAmount(unsettledCostAmount)}</strong>
                      <p>材料 {formatPlainAmount(unsettledMaterialCostAmount)} · 手工 {formatPlainAmount(unsettledManualCostAmount)}</p>
                    </div>
                  </div>
                  <div className={settlementStyles.profitPanel}>
                    <div>
                      <span>预算毛利</span>
                      <strong>{formatPlainAmount(budgetGrossProfitAmount)}</strong>
                      <p>预算毛利率 {budgetGrossProfitRate}%</p>
                    </div>
                    <div>
                      <span>实际毛利</span>
                      <strong data-tone={settlementActualProfitAmount >= 0 ? "success" : "danger"}>{formatPlainAmount(settlementActualProfitAmount)}</strong>
                      <p>较预算 {formatSignedPlainAmount(settlementBudgetProfitGap)}</p>
                    </div>
                  </div>
                </section>
              </div>

              <section className={settlementStyles.panel}>
                <header className={settlementStyles.panelHeader}>
                  <div>
                    <h3>闭环待处理</h3>
                    <p>完成这些事项后，项目利润才适合关账归档</p>
                  </div>
                  <span data-tone={settlementRiskRows.length > 0 ? "warning" : "success"}>{settlementRiskRows.length > 0 ? `${settlementRiskRows.length} 项待处理` : "可进入关账"}</span>
                </header>
                {settlementRiskRows.length > 0 ? (
                  <div className={settlementStyles.riskList}>
                    {settlementRiskRows.map((risk) => (
                      <div key={risk.key} className={settlementStyles.riskItem} data-tone={risk.tone}>
                        <span />
                        <div>
                          <strong>{risk.title}</strong>
                          <p>{risk.helper}</p>
                        </div>
                        <em>{risk.value}</em>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={settlementStyles.emptyState}>
                    <CheckCircle className="h-5 w-5" />
                    <strong>当前工地结算与利润数据已闭环</strong>
                    <p>后续可以接入结算审批和项目关账锁定。</p>
                  </div>
                )}
              </section>
            </section>
          )}

          {actualCompareOpen && typeof document !== "undefined" && createPortal(
            <div className={costStyles.actualCompareModalOverlay} onClick={() => {
              setActualCostRecordKey("");
              setActualCompareOpen(false);
            }}>
              <section
                className={costStyles.actualCompareModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="actual-compare-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className={costStyles.actualCompareModalHeader}>
                  <div>
                    <span className={costStyles.sectionIcon}><Calculator className="h-4 w-4" /></span>
                    <div>
                      <h3 id="actual-compare-modal-title">预算实际对比明细</h3>
                      <p>材料订单自动归集，人工和其他支出按手工成本归集</p>
                    </div>
                  </div>
                  <button type="button" className={costStyles.modalCloseButton} onClick={() => {
                    setActualCostRecordKey("");
                    setActualCompareOpen(false);
                  }} aria-label="关闭预算实际对比明细">
                    <X className="h-4 w-4" />
                  </button>
                </header>
                <div className={costStyles.actualCompareModalBody}>
                  <section className={costStyles.actualCompareInsight}>
                    <div className={costStyles.actualCompareGauge}>
                      <div className={costStyles.actualCompareGaugeHead}>
                        <span>预算消耗率</span>
                        <strong>{actualCollectionRate}%</strong>
                      </div>
                      <div className={costStyles.actualCompareProgress} aria-hidden="true">
                        <i style={{ width: `${actualCollectionProgress}%` }} />
                      </div>
                      <p>已发生 / 预算总成本</p>
                    </div>
                    <div className={costStyles.actualCompareInsightText}>
                      <h4>{actualCompareOverBudgetCount > 0 ? `${actualCompareOverBudgetCount} 个维度已超预算` : "当前未发现超预算维度"}</h4>
                      <p>预算总成本 {formatPlainAmount(budgetTotalCostAmount)}，已发生成本 {formatPlainAmount(totalCostAmount)}，剩余额度 {formatPlainAmount(actualCompareRemainingAmount)}。</p>
                    </div>
                  </section>
                  <div className={costStyles.actualCompareModalSummary}>
                    <div data-tone="material">
                      <span>实际材料</span>
                      <strong>{formatPlainAmount(actualMaterialCostAmount)}</strong>
                    </div>
                    <div data-tone="labor">
                      <span>实际人工</span>
                      <strong>{formatPlainAmount(actualLaborCostAmount)}</strong>
                    </div>
                    <div data-tone="other">
                      <span>其他成本</span>
                      <strong>{formatPlainAmount(actualOtherCostAmount)}</strong>
                    </div>
                    <div data-tone={actualCompareRemainingAmount < 0 ? "danger" : "balance"}>
                      <span>剩余额度</span>
                      <strong>{formatPlainAmount(actualCompareRemainingAmount)}</strong>
                    </div>
                  </div>
                  <section className={costStyles.actualCompareDetailPanel}>
                    <header className={costStyles.actualCompareDetailHeader}>
                      <div>
                        <h4>成本维度明细</h4>
                        <p>已发生 {actualCompareOccurredCount} 项 · 超预算 {actualCompareOverBudgetCount} 项</p>
                      </div>
                    </header>
                    <div className={costStyles.actualCompareModalTableWrap}>
                      {actualCostCompareRows.length > 0 ? (
                        <table className={costStyles.actualCompareTable}>
                          <thead>
                            <tr>
                              <th>维度</th>
                              <th className={costStyles.alignRight}>预算</th>
                              <th className={costStyles.alignRight}>实际</th>
                              <th className={costStyles.alignRight}>差额</th>
                              <th>状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {actualCostCompareRows.map((row) => {
                              const recordCount = actualCostRecordRows.filter((record: any) => record.dimensionType === row.type && record.dimensionName === row.name).length;
                              return (
                                <tr key={row.key}>
                                  <td>
                                    <div className={costStyles.actualCompareName}>
                                      <span>{row.type}</span>
                                      <strong>{row.name}</strong>
                                    </div>
                                  </td>
                                  <td className={costStyles.alignRight}>{formatPlainAmount(row.budgetAmount)}</td>
                                  <td className={costStyles.alignRight}>
                                    {recordCount > 0 ? (
                                      <button
                                        type="button"
                                        className={costStyles.actualAmountButton}
                                        onClick={() => setActualCostRecordKey(row.key)}
                                        title={`查看${row.name}消费记录`}
                                      >
                                        {formatPlainAmount(row.actualAmount)}
                                      </button>
                                    ) : (
                                      <span className={costStyles.actualAmountEmpty}>{formatPlainAmount(row.actualAmount)}</span>
                                    )}
                                  </td>
                                  <td className={costStyles.alignRight} data-tone={row.diffAmount < 0 ? "danger" : "normal"}>{formatPlainAmount(row.diffAmount)}</td>
                                  <td><span className={costStyles.actualCompareStatus} data-tone={row.tone}>{row.status}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className={costStyles.actualCompareEmpty}>暂无可对比的成本数据</div>
                      )}
                    </div>
                  </section>
                </div>
              </section>
              {selectedActualCostRow && (
                <div className={costStyles.actualCostRecordOverlay} onClick={(event) => {
                  event.stopPropagation();
                  setActualCostRecordKey("");
                }}>
                  <section className={costStyles.actualCostRecordModal} role="dialog" aria-modal="true" aria-labelledby="actual-cost-record-title" onClick={(event) => event.stopPropagation()}>
                    <header className={costStyles.actualCostRecordHeader}>
                      <div>
                        <span>{selectedActualCostRow.type}</span>
                        <h4 id="actual-cost-record-title">{selectedActualCostRow.name}消费记录</h4>
                        <p>共 {selectedActualCostRecords.length} 笔 · 合计 {formatPlainAmount(selectedActualCostRecordTotal)}</p>
                      </div>
                      <button type="button" className={costStyles.modalCloseButton} onClick={() => setActualCostRecordKey("")} aria-label="关闭消费记录">
                        <X className="h-4 w-4" />
                      </button>
                    </header>
                    <div className={costStyles.actualCostRecordTableWrap}>
                      {selectedActualCostRecords.length > 0 ? (
                        <table className={costStyles.actualCostRecordTable}>
                          <thead>
                            <tr>
                              <th>消费内容</th>
                              <th>来源</th>
                              <th>分类</th>
                              <th>日期</th>
                              <th>单据</th>
                              <th className={costStyles.alignRight}>数量</th>
                              <th className={costStyles.alignRight}>金额</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedActualCostRecords.map((record: any) => (
                              <tr key={record.id}>
                                <td>
                                  <div className={costStyles.actualCostRecordName}>
                                    <strong>{record.title}</strong>
                                    <span>{record.supplier || record.operator || record.remark || "-"}</span>
                                  </div>
                                </td>
                                <td><span className={costStyles.actualCostRecordSource}>{record.source}</span></td>
                                <td>{record.category || "-"}</td>
                                <td>{formatDate(record.date) || "-"}</td>
                                <td>{record.orderNo || "-"}</td>
                                <td className={costStyles.alignRight}>
                                  {record.quantity ? `${record.quantity}${record.unit || ""}` : "-"}
                                </td>
                                <td className={costStyles.alignRight}><strong>{formatPlainAmount(record.amount)}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className={costStyles.actualCompareEmpty}>暂无消费记录</div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>,
            document.body,
          )}

          {activeTab === "logs" && (
            <section ref={siteDetailContentRef} className={`grid min-w-0 gap-4 rounded-xl border border-surface-300 bg-surface-100/80 p-3 ${SITE_DETAIL_CONTENT_HEIGHT_CLASS} xl:grid-cols-[430px_minmax(0,1fr)] xl:overflow-hidden`} style={siteDetailContentStyle}>
              <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-surface-300 bg-white shadow-[0_14px_30px_rgba(31,41,53,0.08)] xl:h-full">
                <div className="border-b border-surface-300 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-surface-900">新增施工日志</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-surface-500">
                          <span>{logForm.log_date || "-"}</span>
                          <span className="h-1 w-1 rounded-full bg-surface-300" />
                          <span>{logForm.phase ? getDisplayPhaseLabel(logForm.phase) : "未选阶段"}</span>
                          {pendingLogPhotos.length > 0 && (
                            <>
                              <span className="h-1 w-1 rounded-full bg-surface-300" />
                              <span>{pendingLogPhotos.length} 张照片</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${logForm.location_name ? "bg-emerald-50 text-emerald-700" : "bg-surface-100 text-surface-600"}`}>
                      {logForm.location_name ? "已定位" : "待定位"}
                    </span>
                  </div>
                </div>

                <ThinScrollArea orientation="vertical" className="min-h-0 flex-1" scrollClassName="h-full space-y-3 bg-surface-50/70 p-3">
                  <div className="rounded-lg border border-surface-300 bg-white">
                    <div className="flex items-center justify-between border-b border-surface-200 px-3 py-2">
                      <p className="text-sm font-semibold text-surface-900">基础信息</p>
                      <span className="text-xs text-surface-400">01</span>
                    </div>
                    <div className="space-y-3 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-surface-500">日志日期</span>
                          <SystemDateInput
                            value={logForm.log_date}
                            onChange={(nextValue) => setLogForm((form) => ({ ...form, log_date: nextValue }))}
                            className="input-field min-h-10 border-surface-300 bg-white py-2"
                            disabled={isVirtualSite}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-surface-500">施工阶段</span>
                          <SystemSelect
                            value={logForm.phase}
                            onChange={(event) => setLogForm((form) => ({ ...form, phase: event.target.value }))}
                            className="input-field min-h-10 border-surface-300 bg-white py-2"
                            disabled={isVirtualSite}
                          >
                            <option value="">选择阶段</option>
                            {phaseSelectOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                          </SystemSelect>
                        </label>
                      </div>

                      <div className={`rounded-lg border px-3 py-2 ${logForm.location_name ? "border-emerald-300 bg-emerald-50/80" : "border-surface-300 bg-surface-50"}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`flex items-center gap-1.5 text-sm font-semibold ${logForm.location_name ? "text-emerald-800" : "text-surface-800"}`}>
                              <MapPin className={`h-4 w-4 ${logForm.location_name ? "text-emerald-600" : "text-primary-600"}`} /> 当前定位
                            </p>
                            <p className={`mt-1 truncate text-xs ${logForm.location_name ? "font-medium text-emerald-700" : "text-surface-500"}`} title={logForm.location_address || logForm.location_name}>
                              {logForm.location_name || "未获取定位"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={getCurrentLocation}
                            disabled={locating || isVirtualSite}
                            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 text-xs font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700 disabled:opacity-50"
                          >
                            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                            {locating ? "定位中" : logForm.location_name ? "重定位" : "定位"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-primary-200 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-primary-200 bg-primary-50 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-surface-900">施工事项</p>
                        <p className="mt-0.5 text-xs text-surface-500">{logForm.phase ? getDisplayPhaseLabel(logForm.phase) : currentPhaseLabel || "当前阶段"} · 已选 {selectedQuickItems.length} 项</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button type="button" onClick={() => setSelectedQuickItems(quickWorkItems)} className="font-medium text-primary-700 transition hover:text-primary-800">全选</button>
                        <span className="text-primary-200">|</span>
                        <button type="button" onClick={() => setSelectedQuickItems([])} className="font-medium text-surface-500 transition hover:text-surface-700">清空</button>
                      </div>
                    </div>
                    <div className="space-y-3 p-3">
                      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                        {quickWorkItems.map((item) => {
                          const checked = selectedQuickItems.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleQuickItem(item)}
                              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                                checked
                                  ? "border-primary-500 bg-primary-600 text-white shadow-sm"
                                  : "border-surface-300 bg-white text-surface-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                              }`}
                            >
                              {checked && <CheckCircle className="h-3.5 w-3.5" />}
                              {item}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => appendQuickItems("completed_work")} className="inline-flex min-h-9 items-center justify-center rounded-lg bg-primary-600 px-3 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50" disabled={selectedQuickItems.length === 0}>
                          加到今日完成
                        </button>
                        <button type="button" onClick={() => appendQuickItems("next_plan")} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-surface-300 bg-white px-3 text-xs font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700 disabled:opacity-50" disabled={selectedQuickItems.length === 0}>
                          加到明日计划
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-surface-300 bg-white">
                    <div className="flex items-center justify-between border-b border-surface-200 px-3 py-2">
                      <p className="text-sm font-semibold text-surface-900">日志内容</p>
                      <span className="text-xs text-surface-400">02</span>
                    </div>
                    <div className="space-y-3 p-3">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-surface-500">施工内容</span>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {logContentQuickPhrases.map((phrase) => (
                            <button
                              key={phrase.label}
                              type="button"
                              onClick={() => appendLogContentPhrase(phrase.text)}
                              disabled={isVirtualSite}
                              className="inline-flex min-h-7 items-center rounded-full border border-surface-300 bg-surface-50 px-2.5 text-xs font-medium text-surface-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                              title={phrase.text}
                            >
                              {phrase.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={logForm.content}
                          onChange={(event) => setLogForm((form) => ({ ...form, content: event.target.value }))}
                          className="input-field min-h-24 border-surface-300 bg-white"
                          placeholder="记录今日施工范围、施工班组、关键进度..."
                          disabled={isVirtualSite}
                        />
                      </label>

                      <div className="grid gap-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-surface-500">今日完成</span>
                          <textarea
                            value={logForm.completed_work}
                            onChange={(event) => setLogForm((form) => ({ ...form, completed_work: event.target.value }))}
                            className="input-field min-h-16 border-surface-300 bg-white"
                            placeholder="完成事项"
                            disabled={isVirtualSite}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-surface-500">明日计划</span>
                          <textarea
                            value={logForm.next_plan}
                            onChange={(event) => setLogForm((form) => ({ ...form, next_plan: event.target.value }))}
                            className="input-field min-h-16 border-surface-300 bg-white"
                            placeholder="下一步安排"
                            disabled={isVirtualSite}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-surface-300 bg-white">
                    <div className="flex items-center justify-between border-b border-surface-200 px-3 py-2">
                      <p className="text-sm font-semibold text-surface-900">现场照片</p>
                      <span className="text-xs text-surface-400">待发布 {pendingLogPhotos.length} 张</span>
                    </div>
                    <div className="space-y-3 p-3">
                      <button
                        type="button"
                        onClick={() => logPhotoInputRef.current?.click()}
                        disabled={isVirtualSite || uploadingCategory === "施工日志"}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary-300 bg-primary-50/60 text-sm font-semibold text-primary-700 transition hover:border-primary-400 hover:bg-primary-50 disabled:opacity-50"
                      >
                        {uploadingCategory === "施工日志" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        {uploadingCategory === "施工日志" ? "照片上传中" : "上传现场照片"}
                      </button>
                      <input
                        ref={logPhotoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (event) => {
                          const input = event.currentTarget;
                          const files = Array.from(input.files || []);
                          for (const file of files) {
                            await uploadLogPhoto(file);
                          }
                          input.value = "";
                        }}
                      />
                      <div className="flex items-center justify-between gap-2 text-xs text-surface-500">
                        <span>已归档 {logFiles.length} 份</span>
                        {pendingLogPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPendingLogPhotos([])}
                            className="font-medium text-surface-500 transition hover:text-red-600"
                          >
                            清空照片
                          </button>
                        )}
                      </div>
                      {pendingLogPhotos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {pendingLogPhotos.map((photo, index) => {
                            const url = photo.file_url || photo.url || "";
                            const name = photo.file_name || photo.caption || `施工照片${index + 1}`;
                            return (
                              <div
                                key={photo.id || `${url}_${index}`}
                                className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-white p-1 shadow-sm"
                                title={name}
                              >
                                {isImageLikeFile(photo) ? (
                                  <NativeImage src={url} alt={name} className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-surface-400">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setPendingLogPhotos((photos) => photos.filter((_, photoIndex) => photoIndex !== index))}
                                  className="absolute right-1 top-1 rounded bg-white/90 p-1 text-surface-400 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                                  title="移除照片"
                                  aria-label={`移除${name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {isVirtualSite && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">该记录来自客户线索，请先生成项目后维护施工日志、巡检和进度。</p>}
                </ThinScrollArea>

                <div className="sticky bottom-0 border-t border-surface-300 bg-white/95 px-4 py-3 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => { void addLog(); }}
                    disabled={(!logForm.content.trim() && !logForm.completed_work.trim()) || saving || isVirtualSite}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    发布施工日志
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-surface-300 bg-white shadow-[0_10px_24px_rgba(31,41,53,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-300 bg-surface-50 px-4 py-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-surface-900">
                      <ClipboardList className="h-4 w-4 text-primary-600" /> 施工日志
                    </h3>
                    <p className="mt-1 text-xs text-surface-500">共 {logs.length} 条记录，按时间倒序展示。</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-300" />
                      <input
                        value={logKeyword}
                        onChange={(event) => setLogKeyword(event.target.value)}
                        className="h-9 w-52 rounded-lg border border-surface-300 bg-white pl-8 pr-3 text-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                        placeholder="搜索日志"
                      />
                    </label>
	                    <SystemSelect value={logFilter} onChange={(event) => setLogFilter(event.target.value)} className="h-9 rounded-lg border border-surface-300 bg-white px-3 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100">
	                      <option value="all">全部</option>
	                      <option value="risk">有风险</option>
	                      {phaseSelectOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
	                    </SystemSelect>
	                    <SystemDateInput
	                      value={logDateFrom}
	                      onChange={setLogDateFrom}
	                      className="h-9 rounded-lg border border-surface-300 bg-white px-3 text-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
	                      aria-label="开始日期"
	                    />
	                    <span className="text-xs text-surface-400">至</span>
	                    <SystemDateInput
	                      value={logDateTo}
	                      onChange={setLogDateTo}
	                      className="h-9 rounded-lg border border-surface-300 bg-white px-3 text-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
	                      aria-label="结束日期"
	                    />
	                    {(logDateFrom || logDateTo) && (
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setLogDateFrom("");
	                          setLogDateTo("");
	                        }}
	                        className="h-9 rounded-lg border border-surface-300 bg-white px-3 text-xs font-medium text-surface-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
	                      >
	                        清空时间
	                      </button>
	                    )}
	                  </div>
                </div>

                <ThinScrollArea orientation="vertical" className="min-h-0 flex-1" scrollClassName="h-full bg-surface-100/70 p-4">
                  <div className="relative pl-9">
                    {logPagination.pageItems.length > 0 && <div className="absolute bottom-8 left-[13px] top-2 w-px bg-surface-300" />}
                    {logPagination.pageItems.map((log: any) => {
                      const risk = hasLogRisk(log);
                      const hasInlineDetails = hasLogInlineDetails(log);
                      const displayContent = getLogDisplayContent(log);
                      const shouldShowLogSummary = Boolean(displayContent) && !hasInlineDetails;
                      return (
                        <article key={log.id} className="relative pb-4 last:pb-0">
                          <div className={`absolute left-[-36px] top-4 flex h-7 w-7 items-center justify-center rounded-lg border bg-white ${
                            risk ? "border-amber-200 text-amber-700" : "border-primary-200 text-primary-700"
                          }`}>
                            {risk ? <AlertTriangle className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                          </div>
                          <div className="overflow-hidden rounded-lg border border-surface-300 bg-white transition hover:border-primary-300">
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-200 bg-surface-50 px-4 py-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-lg border border-surface-200 bg-white px-2.5 py-1 text-xs font-bold text-surface-900">{formatDate(log.log_date)}</span>
                                  <span className="text-xs font-medium text-surface-500">{log.author_name || "未知"}</span>
                                  {log.phase && <span className="rounded-md border border-primary-200 bg-white px-2 py-0.5 text-xs font-bold text-primary-700">{getDisplayPhaseLabel(log.phase)}</span>}
                                  {log.location_name && <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{log.location_name}</span></span>}
                                  {risk && <span className="rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">有风险</span>}
                                </div>
                                {shouldShowLogSummary && <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-surface-900">{displayContent}</p>}
                              </div>
                              <button
                                type="button"
                                onClick={() => deleteLog(log)}
                                disabled={saving || isVirtualSite}
                                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-red-100 bg-white px-2.5 text-xs font-medium text-red-600 transition hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> 删除
                              </button>
                            </div>

                          {hasInlineDetails && (
                            <div className="grid gap-2 p-4 md:grid-cols-2">
                              <TimelineLogDetail label="完成" value={getVisibleLogWorkText(log.completed_work)} />
                              <TimelineLogDetail label="明日" value={getVisibleLogWorkText(log.next_plan)} />
                              <TimelineLogDetail label="材料" value={log.material_notes} />
                              <TimelineLogDetail label="质量" value={log.quality_notes} />
                              <TimelineLogDetail label="安全" value={log.safety_notes} />
                              <TimelineLogDetail label="风险" value={log.issue_notes} danger wide />
                            </div>
                          )}
                          {Array.isArray(log.photos) && log.photos.length > 0 && (
                            <div className={`${hasInlineDetails ? "border-t" : ""} border-surface-200 px-4 pb-4 pt-3`}>
                              <p className="mb-2 text-xs font-semibold text-surface-500">现场照片</p>
                              <div className="flex flex-wrap gap-2">
                                {log.photos.map((photo: any, index: number) => {
                                  const url = photo.url || photo.file_url || "";
                                  const name = photo.caption || photo.file_name || `现场照片${index + 1}`;
                                  return (
                                    <a
                                      key={photo.id || `${url}_${index}`}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-white p-1 shadow-sm transition-colors hover:border-primary-300 focus:outline-none focus:ring-4 focus:ring-primary-100/70"
                                      title={`点击预览：${name}`}
                                    >
                                      {isImageLikeFile(photo) ? (
                                        <NativeImage src={url} alt={name} className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]" />
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-surface-400">
                                          <FileText className="h-5 w-5" />
                                        </div>
                                      )}
                                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/45 px-1.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                                        <Eye className="h-3 w-3" />
                                        预览
                                      </span>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          </div>
                        </article>
                      );
                    })}
                    {filteredLogs.length === 0 && <EmptyText text={logs.length === 0 ? "暂无施工日志" : "没有符合条件的日志"} />}
                  </div>
                  {filteredLogs.length > 0 && (
                    <DataPagination
                      total={filteredLogs.length}
                      page={logPagination.page}
                      pageSize={logPagination.pageSize}
                      onPageChange={logPagination.setPage}
                      onPageSizeChange={logPagination.setPageSize}
                      itemName="条日志"
                      className="mt-4 rounded-lg border border-surface-300"
                    />
                  )}
                </ThinScrollArea>
              </div>
            </section>
          )}

	          {activeTab === "materials" && (
	            <section ref={siteDetailContentRef} className={`${materialOrderStyles.workspace} ${SITE_DETAIL_CONTENT_HEIGHT_CLASS}`} style={siteDetailContentStyle}>
              <aside className={materialOrderStyles.categoryPanel}>
                <div className={materialOrderStyles.categoryHeader}>
                  <span className={materialOrderStyles.headerIcon}><Package className="h-4 w-4" /></span>
                  <div>
                    <h3 className={materialOrderStyles.panelTitle}>订单分类</h3>
                    <p className={materialOrderStyles.panelSubtitle}>按辅材、主材归类查看</p>
                  </div>
                </div>
                <div className={materialOrderStyles.categoryList}>
                  {materialCategoryFilters.map((category) => {
                    const isActiveCategory = materialCategoryFilter === category.key;
                    return (
                    <button
                      key={category.key}
                      type="button"
                      aria-pressed={isActiveCategory}
                      onClick={() => {
                        setMaterialCategoryFilter(category.key);
                        setMaterialOrderMode("list");
                      }}
                      className={`${materialOrderStyles.categoryItem} ${isActiveCategory ? materialOrderStyles.categoryItemActive : ""}`}
                    >
                      <span className={materialOrderStyles.categoryIdentity}>
                        <span className={materialOrderStyles.categoryDot} style={{ backgroundColor: category.color }} />
                        <span className={materialOrderStyles.categoryCopy}>
                          <span className={materialOrderStyles.categoryName}>{category.label}</span>
                          {category.key !== "ALL" && <span className={materialOrderStyles.categoryHelper}>{materialOrderCategoryHelpers[category.key] || "材料订单"}</span>}
                        </span>
                      </span>
                      <span className={materialOrderStyles.categoryCount}>{category.orderCount || 0}</span>
                    </button>
                    );
                  })}
                </div>
              </aside>

              <div className={materialOrderStyles.contentPanel}>
                <div className={materialOrderStyles.contentHeader}>
                  <div className={materialOrderStyles.contentHeading}>
                    <span className={materialOrderStyles.headerIcon}><ShoppingCart className="h-4 w-4" /></span>
                    <div>
                      <h3 className={materialOrderStyles.panelTitle}>
                        {materialOrderMode === "detail" ? "订单详情" : "材料订单"}
                      </h3>
                      <p className={materialOrderStyles.panelSubtitle}>
                        {materialOrderMode === "detail"
                          ? "仅查看订单材料、出库到货和付款情况"
                          : `共 ${visibleMaterialOrders.length} 张订单，仅作查询查看`}
                      </p>
                    </div>
                  </div>
                  <div className={materialOrderStyles.headerActions}>
                    {materialOrderMessage && (
                      <span className={`${materialOrderStyles.message} ${materialOrderMessage.includes("失败") || materialOrderMessage.includes("请") ? materialOrderStyles.messageError : materialOrderStyles.messageSuccess}`}>
                        {materialOrderMessage}
                      </span>
                    )}
                    {materialOrderMode !== "list" && (
                      <button type="button" onClick={() => setMaterialOrderMode("list")} className="btn-secondary site-detail-header-button">
                        返回订单
                      </button>
                    )}
                  </div>
                </div>

                {false && materialOrderMode === "new" && (
                  <div className="grid gap-3 border-b border-surface-300 bg-white p-4 md:grid-cols-3">
                    {materialOrderTypeOptions.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateMaterialOrderType(value)}
                        className={`rounded-lg border px-3 py-3 text-left transition ${
                          materialOrderForm.order_type === value ? "border-primary-300 bg-primary-50 text-primary-700" : "border-surface-300 bg-white text-surface-700 hover:bg-surface-50"
                        }`}
                        disabled={saving || isVirtualSite}
                      >
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="mt-1 block text-xs leading-5 text-surface-500">{materialOrderTypeHelpers[value]}</span>
                      </button>
                    ))}
                  </div>
                )}

                {materialOrderMode === "list" && (
                  <div className={materialOrderStyles.listLayout}>
                  <ThinScrollArea className={materialOrderStyles.tableScroller} scrollClassName={materialOrderStyles.tableViewport}>
                    <table className={`${materialOrderStyles.table} ${visibleMaterialOrders.length === 0 ? materialOrderStyles.tableEmpty : ""}`}>
                      <colgroup>
                        <col className="w-[56px]" />
                        <col className="w-[92px]" />
                        <col className="w-[138px]" />
                        <col className="w-[170px]" />
                        <col className="w-[100px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                        <col className="w-[138px]" />
                        <col className="w-[190px]" />
                        <col className="w-[112px]" />
                        <col className="w-[84px]" />
                        <col className="w-[170px]" />
                        <col className="w-[84px]" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-center">序号</th>
                          <th className="px-3 py-3 text-center">状态</th>
                          <th className="px-3 py-3 text-center">订单编号</th>
                          <th className="px-3 py-3 text-center">房号</th>
                          <th className="px-3 py-3 text-center">客户姓名</th>
                          <th className="px-3 py-3 text-center">下单人</th>
                          <th className="px-3 py-3 text-center">下单人电话</th>
                          <th className="px-3 py-3 text-center">下单时间</th>
                          <th className="px-3 py-3 text-center">下单仓库</th>
                          <th className="px-3 py-3 text-center">材料项</th>
                          <th className="px-3 py-3 text-center">订单金额</th>
                          <th className="px-3 py-3 text-center">备注</th>
                          <th className="px-3 py-3 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materialOrderPagination.pageItems.map((order: any, index: number) => {
                          const supplierName = getMaterialOrderSupplierName(order);
                          return (
                            <tr
                              key={order.id}
                              onClick={() => {
                                setSelectedMaterialOrderId(order.id);
                                setMaterialOrderMode("detail");
                              }}
                              className={materialOrderStyles.tableRow}
                            >
                              <td className="px-4 py-3 text-center text-surface-500">{(materialOrderPagination.page - 1) * materialOrderPagination.pageSize + index + 1}</td>
                              <td className="px-3 py-3 text-center"><MaterialOrderStatusBadge status={order.status} /></td>
                              <td className={`${materialOrderStyles.primaryCell} px-3 py-3 text-center font-semibold tabular-nums`}>{order.order_no || "-"}</td>
                              <td className="px-3 py-3 text-center">
                                <span className="block truncate font-semibold text-surface-900" title={siteDisplayName}>{siteDisplayName}</span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className="block truncate text-surface-800" title={selected?.customer_name || ""}>{selected?.customer_name || "-"}</span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className="block truncate text-surface-800" title={order.created_by_name || ""}>{order.created_by_name || "-"}</span>
                              </td>
                              <td className="px-3 py-3 text-center tabular-nums text-surface-700">{order.created_by_phone || "-"}</td>
                              <td className="px-3 py-3 text-center tabular-nums text-surface-700">{formatDateTime(order.created_at || order.order_date)}</td>
                              <td className="px-3 py-3 text-center">
                                <span className="block truncate text-surface-800" title={supplierName}>{supplierName}</span>
                              </td>
                              <td className="px-3 py-3 text-center tabular-nums text-surface-700">{Number(order.item_count || 0)}</td>
                              <td className="px-3 py-3 text-center font-semibold tabular-nums text-red-600">{formatPlainAmount(Number(order.total_amount || 0))}</td>
                              <td className="px-3 py-3 text-center">
                                <span className="block truncate text-surface-600" title={order.notes || ""}>{order.notes || "-"}</span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedMaterialOrderId(order.id);
                                    setMaterialOrderMode("detail");
                                  }}
                                  className={materialOrderStyles.viewButton}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  查看
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {visibleMaterialOrders.length === 0 && (
                          <tr className={materialOrderStyles.emptyRow}>
                            <td colSpan={13} className={materialOrderStyles.emptyCell}>
                              <span className="sr-only">当前类型暂无材料订单</span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ThinScrollArea>
                    {visibleMaterialOrders.length === 0 && (
                      <div className={materialOrderStyles.emptyOverlay} aria-hidden="true">
                        <span className={materialOrderStyles.emptyIcon}><Package className="h-5 w-5" /></span>
                        <span>当前类型暂无材料订单</span>
                      </div>
                    )}
                    <DataPagination
                      total={visibleMaterialOrders.length}
                      page={materialOrderPagination.page}
                      pageSize={materialOrderPagination.pageSize}
                      onPageChange={materialOrderPagination.setPage}
                      onPageSizeChange={materialOrderPagination.setPageSize}
                      itemName="张订单"
                      className={materialOrderStyles.pagination}
                    />
                  </div>
                )}

                {materialOrderMode === "detail" && selectedMaterialOrder && (
                  <div className={materialOrderStyles.detailContent}>
                    <div className={materialOrderStyles.orderSummary}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold text-surface-900">{selectedMaterialOrder.order_no || "-"}</p>
                          <MaterialOrderStatusBadge status={selectedMaterialOrder.status} />
                          <MaterialOrderTypeBadge type={selectedMaterialOrder.order_type} />
                        </div>
                        <p className="mt-1 truncate text-xs text-surface-500">
                          {siteDisplayName}{selected?.customer_name ? ` / ${selected.customer_name}` : ""} · {formatDateTime(selectedMaterialOrder.created_at || selectedMaterialOrder.order_date)}
                        </p>
                      </div>
                      <span className={materialOrderStyles.orderAmount}>{formatPlainAmount(Number(selectedMaterialOrder.total_amount || 0))}</span>
                    </div>

                    <div className={materialOrderStyles.detailGrid}>
                      <section className={materialOrderStyles.detailSection}>
                        <div className={materialOrderStyles.detailSectionHeader}>
                          <div>
                            <p className="text-sm font-semibold text-surface-900">订单概况</p>
                            <p className="mt-0.5 text-xs text-surface-500">房号、仓库和收货信息</p>
                          </div>
                          <span className={materialOrderStyles.sectionAmount}>{formatPlainAmount(Number(selectedMaterialOrder.total_amount || 0))}</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <MaterialOrderInfoLine label="房号" value={siteDisplayName} />
                          <MaterialOrderInfoLine label="服务门店" value={selected?.service_store || "-"} />
                          <MaterialOrderInfoLine label="客户姓名" value={selected?.customer_name || "-"} />
                          <MaterialOrderInfoLine label="手机号" value={selected?.customer_phone || "-"} />
                          <MaterialOrderInfoLine label="下单人" value={selectedMaterialOrder.created_by_name || "-"} />
                          <MaterialOrderInfoLine label="下单人电话" value={selectedMaterialOrder.created_by_phone || "-"} />
                          <MaterialOrderInfoLine label="下单仓库" value={getMaterialOrderSupplierName(selectedMaterialOrder)} />
                          <MaterialOrderInfoLine label="下单时间" value={formatDateTime(selectedMaterialOrder.created_at || selectedMaterialOrder.order_date)} />
                          <MaterialOrderInfoLine label={`${selectedMaterialOrderProcessLabel}时间`} value={formatDateTime(selectedMaterialOrder.received_at)} />
                          <MaterialOrderInfoLine label="收货地址" value={getSiteOrderReceiveAddress(selected)} span={3} />
                        </div>
                      </section>

                      <aside className={materialOrderStyles.progressPanel}>
                        <p className="text-sm font-semibold text-surface-900">{selectedMaterialOrderProcessLabel}进度</p>
                        <div className="mt-4">
                          <div className="flex items-end justify-between">
                            <div>
                              <p className="text-xs text-surface-500">{selectedMaterialOrderProcessLabel}进度</p>
                              <p className="mt-1 text-xl font-semibold text-surface-900">{selectedMaterialOrderProgressRate}%</p>
                            </div>
                            <p className="text-sm tabular-nums text-surface-600">
                              {formatPlainQuantity(selectedMaterialOrderHandledQuantity)} / {formatPlainQuantity(selectedMaterialOrderTotalQuantity)}
                            </p>
                          </div>
                          <div className={materialOrderStyles.progressTrack}>
                            <div className={materialOrderStyles.progressValue} style={{ width: `${Math.min(100, selectedMaterialOrderProgressRate)}%` }} />
                          </div>
                        </div>
                        <div className={materialOrderStyles.progressMetrics}>
                          <div className={materialOrderStyles.progressMetric}>
                            <p className="text-xs text-surface-500">剩余未{selectedMaterialOrderProcessLabel}</p>
                            <p className="mt-1 text-base font-semibold tabular-nums text-primary-700">{formatPlainQuantity(selectedMaterialOrderPendingQuantity)}</p>
                          </div>
                          <div className={materialOrderStyles.progressMetric}>
                            <p className="text-xs text-surface-500">已{selectedMaterialOrderProcessLabel}</p>
                            <p className="mt-1 text-base font-semibold tabular-nums text-emerald-700">{formatPlainQuantity(selectedMaterialOrderHandledQuantity)}</p>
                          </div>
                        </div>
                        <div className={materialOrderStyles.progressMeta}>
                          <p className="text-xs font-medium text-surface-500">订单状态</p>
                          <div className="mt-2"><MaterialOrderStatusBadge status={selectedMaterialOrder.status} /></div>
                        </div>
                        <div className={materialOrderStyles.progressMeta}>
                          结算状态：<span className="font-semibold text-surface-900">{materialSettlementStatusLabels[selectedMaterialOrder.settlement_status || "UNSETTLED"] || "-"}</span>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-surface-400">工地详情仅用于查询订单，新增、出库和状态变更请在订单管理中处理。</p>
                      </aside>
                    </div>

                    <section className={materialOrderStyles.itemsSection}>
                      <div className={materialOrderStyles.itemsHeader}>
                        <div>
                          <p className="text-sm font-semibold text-surface-900">材料明细</p>
                          <p className="mt-0.5 text-xs text-surface-500">查看下单数量、已{selectedMaterialOrderProcessLabel}数量和剩余数量</p>
                        </div>
                        <span className="text-xs font-semibold text-surface-500">共 {selectedMaterialOrderItems.length} 项</span>
                      </div>
                      <ThinScrollArea>
                        <table className={materialOrderStyles.itemsTable}>
                          <colgroup>
                            <col className="w-[84px]" />
                            <col />
                            <col className="w-[170px]" />
                            <col className="w-[76px]" />
                            <col className="w-[110px]" />
                            <col className="w-[120px]" />
                            <col className="w-[110px]" />
                            <col className="w-[120px]" />
                          </colgroup>
                          <thead className="bg-surface-50 text-xs font-semibold text-surface-700">
                            <tr className="border-b border-surface-300">
                              <th className="px-3 py-2.5 text-center">图片</th>
                              <th className="px-3 py-2.5 text-left">材料名称</th>
                              <th className="px-3 py-2.5 text-left">规格</th>
                              <th className="px-3 py-2.5 text-center">单位</th>
                              <th className="px-3 py-2.5 text-right">下单数量</th>
                              <th className="px-3 py-2.5 text-right">已{selectedMaterialOrderProcessLabel}/剩余</th>
                              <th className="px-3 py-2.5 text-right">单价</th>
                              <th className="px-3 py-2.5 text-right">小计</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-200 bg-white">
                            {selectedMaterialOrderItems.map((item: any) => {
                              const quantity = Number(item.quantity || 0);
                              const deductedQty = Number(item.stock_deducted_qty || 0);
                              const receivedQty = Math.max(0, Number(item.received_qty || 0));
                              const handledQty = selectedMaterialOrder.order_type === "AUXILIARY_WAREHOUSE"
                                ? deductedQty
                                : Math.min(quantity, receivedQty);
                              const remainingQty = Math.max(0, quantity - handledQty);
                              const image = getMaterialImageUrl(item);
                              const specText = getMaterialSpecText(item);
                              return (
                                <tr key={item.id} className={materialOrderStyles.itemRow}>
                                  <td className="px-3 py-2.5 text-center align-middle">
                                    <div className={materialOrderStyles.materialImage}>
                                      {image ? (
                                        <NativeImage
                                          src={image}
                                          alt={item.material_name || "材料图片"}
                                          className="h-full w-full cursor-zoom-in object-cover"
                                          onMouseEnter={(event) => showMaterialImagePreview(event, image, item)}
                                          onMouseMove={(event) => showMaterialImagePreview(event, image, item)}
                                          onMouseLeave={() => setMaterialImagePreview(null)}
                                        />
                                      ) : (
                                        <Package className="h-5 w-5 text-surface-300" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 align-middle">
                                    <span className="block truncate font-semibold text-surface-900" title={item.material_name || ""}>{item.material_name || "未知材料"}</span>
                                    {item.material_code && <span className="mt-0.5 block truncate text-xs text-surface-400">{item.material_code}</span>}
                                  </td>
                                  <td className="px-3 py-2.5 align-middle text-surface-600">
                                    <span className="block truncate" title={specText}>{specText || "-"}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-center align-middle text-surface-600">{item.material_unit || "-"}</td>
                                  <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-surface-900">{formatPlainQuantity(quantity)}</td>
                                  <td className="px-3 py-2.5 text-right align-middle">
                                    <p className="font-semibold tabular-nums text-emerald-700">{formatPlainQuantity(handledQty)}</p>
                                    <p className="mt-0.5 text-[11px] font-medium tabular-nums text-surface-400">余 {formatPlainQuantity(remainingQty)}</p>
                                  </td>
                                  <td className="px-3 py-2.5 text-right align-middle tabular-nums text-surface-700">{formatPlainAmount(Number(item.unit_price || 0))}</td>
                                  <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-red-600">{formatPlainAmount(Number(item.total_price || 0))}</td>
                                </tr>
                              );
                            })}
                            {selectedMaterialOrderItems.length === 0 && (
                              <tr>
                                <td colSpan={8} className="px-3 py-10 text-center text-sm text-surface-400">当前订单暂无材料明细</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </ThinScrollArea>
                    </section>
                    {selectedMaterialOrder.notes && (
                      <section className={materialOrderStyles.notesSection}>
                        <p className="text-xs font-semibold text-surface-500">订单备注</p>
                        <p className="mt-1">{selectedMaterialOrder.notes}</p>
                      </section>
                    )}
                  </div>
                )}

	                {false && materialOrderMode === "new" && (
	                  <div className="space-y-4 p-4">
	                    <div className="grid gap-3 md:grid-cols-5">
	                      <label className="block md:col-span-2">
	                        <span className="mb-1.5 block text-xs font-medium text-surface-500">供应方</span>
	                        <SystemSelect value={materialOrderForm.supplier_id} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, supplier_id: event.target.value }))} className="input-field min-h-9 py-1.5" disabled={saving || isVirtualSite || materialOrderForm.order_type === "AUXILIARY_WAREHOUSE"}>
	                          <option value="">{materialOrderForm.order_type === "AUXILIARY_WAREHOUSE" ? "直营辅材仓" : "未设置"}</option>
	                          {selectableMaterialSuppliers.map((supplier: any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                        </SystemSelect>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-surface-500">订单状态</span>
                        <SystemSelect value={materialOrderForm.status} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, status: event.target.value }))} className="input-field min-h-9 py-1.5" disabled={saving || isVirtualSite}>
                          {materialOrderStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </SystemSelect>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-surface-500">下单日期</span>
                        <SystemDateInput value={materialOrderForm.order_date} onChange={(nextValue) => setMaterialOrderForm((form) => ({ ...form, order_date: nextValue }))} className="input-field min-h-9 py-1.5" disabled={saving || isVirtualSite} />
                      </label>
	                      <label className="block">
	                        <span className="mb-1.5 block text-xs font-medium text-surface-500">预计到货</span>
	                        <SystemDateInput value={materialOrderForm.delivery_date} onChange={(nextValue) => setMaterialOrderForm((form) => ({ ...form, delivery_date: nextValue }))} className="input-field min-h-9 py-1.5" disabled={saving || isVirtualSite} />
	                      </label>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-surface-300">
	                      <div className="flex items-center justify-between gap-3 border-b border-surface-300 bg-surface-100 px-3 py-2">
	                        <div>
	                          <p className="text-sm font-semibold text-surface-900">材料明细</p>
	                          <p className="mt-0.5 text-xs text-surface-500">当前可选：{materialOrderTypeLabels[materialOrderForm.order_type]}</p>
	                        </div>
                        <button type="button" onClick={addMaterialOrderLine} className="btn-secondary" disabled={saving || isVirtualSite}>
                          <Plus className="h-4 w-4" /> 加一行
                        </button>
                      </div>
                      <ThinScrollArea>
                        <table className="w-full min-w-[860px] table-fixed text-sm">
                          <colgroup>
                            <col />
                            <col className="w-[110px]" />
                            <col className="w-[110px]" />
                            <col className="w-[110px]" />
                            <col className="w-[120px]" />
                            <col className="w-[190px]" />
                            <col className="w-[64px]" />
                          </colgroup>
                          <thead className="bg-surface-100 text-xs font-semibold text-surface-600">
                            <tr className="border-b border-surface-300">
                              <th className="px-3 py-2.5 text-left">材料</th>
                              <th className="px-3 py-2.5 text-right">数量</th>
                              <th className="px-3 py-2.5 text-right">单价</th>
                              <th className="px-3 py-2.5 text-right">已到货</th>
                              <th className="px-3 py-2.5 text-right">小计</th>
                              <th className="px-3 py-2.5 text-left">备注</th>
                              <th className="px-3 py-2.5 text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-200 bg-white">
                            {materialOrderForm.items.map((line, index) => {
                              const material = materialCatalog.find((item: any) => item.id === line.material_id);
                              const lineAmount = Math.max(0, Number(line.quantity || 0) || 0) * Math.max(0, Number(line.unit_price || 0) || 0);
                              const stock = Number(material?.stock || 0);
                              const quantity = Math.max(0, Number(line.quantity || 0) || 0);
                              const showStock = materialOrderForm.order_type === "AUXILIARY_WAREHOUSE" && material;
                              const stockInsufficient = showStock && quantity > stock;
                              return (
                                <tr key={index}>
                                  <td className="px-3 py-2.5">
                                    <SystemSelect value={line.material_id} onChange={(event) => selectMaterialForLine(index, event.target.value)} className="input-field min-h-9 py-1.5" disabled={saving || isVirtualSite}>
                                      <option value="">选择材料</option>
	                                      {selectableMaterialCatalog.map((item: any) => (
                                        <option key={item.id} value={item.id}>{item.name}{item.brand ? ` · ${item.brand}` : ""}{item.spec ? ` · ${item.spec}` : ""}</option>
                                      ))}
                                    </SystemSelect>
                                    <p className={`mt-1 truncate text-xs ${stockInsufficient ? "text-red-600" : "text-surface-400"}`}>
                                      {material
                                        ? `${material.category_name || "未分类"} · ${material.unit || "无单位"}${showStock ? ` · 库存 ${formatPlainQuantity(stock)}` : ""}`
                                        : "选择材料后自动带出单价"}
                                    </p>
                                  </td>
	                                  <td className="px-3 py-2.5"><input value={line.quantity} onChange={(event) => updateMaterialOrderLine(index, { quantity: event.target.value, received_qty: materialOrderForm.order_type === "AUXILIARY_MONTHLY" ? event.target.value : line.received_qty })} className="input-field min-h-9 py-1.5 text-right" inputMode="decimal" placeholder="0" disabled={saving || isVirtualSite} /></td>
                                  <td className="px-3 py-2.5"><input value={line.unit_price} onChange={(event) => updateMaterialOrderLine(index, { unit_price: event.target.value })} className="input-field min-h-9 py-1.5 text-right" inputMode="decimal" placeholder="0.00" disabled={saving || isVirtualSite} /></td>
	                                  <td className="px-3 py-2.5"><input value={line.received_qty} onChange={(event) => updateMaterialOrderLine(index, { received_qty: event.target.value })} className="input-field min-h-9 py-1.5 text-right" inputMode="decimal" placeholder="0" disabled={saving || isVirtualSite || materialOrderForm.order_type === "AUXILIARY_MONTHLY"} /></td>
                                  <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-red-600">{formatPlainAmount(lineAmount)}</td>
	                                  <td className="px-3 py-2.5"><input value={line.remark} onChange={(event) => updateMaterialOrderLine(index, { remark: event.target.value })} className="input-field min-h-9 py-1.5" placeholder={materialOrderForm.order_type === "AUXILIARY_MONTHLY" ? "拿货门店、结算说明" : "备注"} disabled={saving || isVirtualSite} /></td>
                                  <td className="px-3 py-2.5 text-center">
                                    <button type="button" onClick={() => removeMaterialOrderLine(index)} className="rounded p-1.5 text-surface-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={saving || isVirtualSite || materialOrderForm.items.length <= 1} title="删除本行">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </ThinScrollArea>
                    </div>

	                    <div className="grid gap-3 md:grid-cols-[160px_160px_minmax(0,1fr)_180px]">
	                      <label className="block">
	                        <span className="mb-1.5 block text-xs font-medium text-surface-500">已付款</span>
	                        <input value={materialOrderForm.paid_amount} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, paid_amount: event.target.value }))} className="input-field min-h-9 py-1.5 text-right" inputMode="decimal" placeholder="0.00" disabled={saving || isVirtualSite || materialOrderForm.order_type === "AUXILIARY_WAREHOUSE"} />
	                      </label>
	                      <label className="block">
	                        <span className="mb-1.5 block text-xs font-medium text-surface-500">结算月份</span>
	                        <input type="month" value={materialOrderForm.settlement_month} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, settlement_month: event.target.value }))} className="input-field min-h-9 py-1.5" disabled={saving || isVirtualSite || materialOrderForm.order_type === "AUXILIARY_WAREHOUSE"} />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-surface-500">下单备注</span>
                        <input value={materialOrderForm.notes} onChange={(event) => setMaterialOrderForm((form) => ({ ...form, notes: event.target.value }))} className="input-field min-h-9 py-1.5" placeholder="送货地址、联系人、付款约定" disabled={saving || isVirtualSite} />
                      </label>
                      <div className="rounded-lg bg-surface-50 px-3 py-2">
                        <p className="text-xs text-surface-400">订单小计</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-red-600">{formatPlainAmount(materialOrderFormAmount)}</p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setMaterialOrderMode("list")} className="btn-secondary">取消</button>
	                      <button type="button" onClick={addMaterialOrder} disabled={saving || isVirtualSite || selectableMaterialCatalog.length === 0} className="btn-primary disabled:opacity-50">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                        保存下单
                      </button>
                    </div>
	                    {selectableMaterialCatalog.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">当前下单类型暂无可选材料，请先在材料管理维护对应材料。</p>}
                  </div>
                )}
	              </div>
		            </section>
		          )}

		          {changeAmountDetailType && (
		            <div className="fixed bottom-0 right-0 top-0 z-50 bg-surface-950/25 md:left-[var(--active-sidebar-width)] max-md:left-0">
		              <div className="absolute inset-0" onClick={() => setChangeAmountDetailType(null)} />
		              <div
		                role="dialog"
		                aria-modal="true"
		                aria-label={changeAmountDetailTitle}
		                className="absolute left-1/2 top-1/2 z-10 flex max-h-[78vh] w-[calc(100%-32px)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-surface-200 bg-white shadow-[0_24px_60px_rgba(31,41,53,0.22)]"
		              >
		                <div className="flex items-start justify-between gap-4 border-b border-surface-300 bg-surface-50 px-5 py-4">
		                  <div className="min-w-0">
		                    <h3 className="text-lg font-semibold text-surface-900">{changeAmountDetailTitle}</h3>
		                    <p className="mt-1 text-sm text-surface-500">
		                      共 {changeAmountDetailOrders.length} 单，合计 <span className={`font-semibold tabular-nums ${changeAmountDetailTone}`}>{formatPlainAmount(changeAmountDetailTotal)}</span>
		                    </p>
		                  </div>
		                  <button
		                    type="button"
		                    onClick={() => setChangeAmountDetailType(null)}
		                    className="rounded-lg p-2 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
		                    aria-label={`关闭${changeAmountDetailTitle}`}
		                  >
		                    <X className="h-5 w-5" />
		                  </button>
		                </div>
		                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
		                  {changeAmountDetailOrders.length > 0 ? (
		                    <table className="w-full table-fixed text-sm">
		                      <colgroup>
		                        <col className="w-[16%]" />
		                        <col className="w-[25%]" />
		                        <col className="w-[16%]" />
		                        <col className="w-[17%]" />
		                        <col className="w-[13%]" />
		                        <col className="w-[13%]" />
		                      </colgroup>
		                      <thead className="sticky top-0 z-10 bg-surface-50 text-xs font-medium text-surface-500">
		                        <tr className="border-b border-surface-200">
		                          <th className="px-2.5 py-2 text-left">变更单</th>
		                          <th className="px-2.5 py-2 text-left">项目内容</th>
		                          <th className="whitespace-nowrap px-2.5 py-2 text-left">空间</th>
		                          <th className="px-2.5 py-2 text-left">确认时间</th>
		                          <th className="px-2.5 py-2 text-right">金额</th>
		                          <th className="px-2.5 py-2 text-center">状态</th>
		                        </tr>
		                      </thead>
		                      <tbody className="divide-y divide-surface-200">
		                        {changeAmountDetailOrders.map((order: any) => (
		                          <tr
		                            key={order.id}
		                            role="button"
		                            tabIndex={0}
		                            onClick={() => {
		                              setChangeAmountDetailType(null);
		                              openChangeOrderDetail(order);
		                            }}
		                            onKeyDown={(event) => {
		                              if (event.key === "Enter" || event.key === " ") {
		                                event.preventDefault();
		                                setChangeAmountDetailType(null);
		                                openChangeOrderDetail(order);
		                              }
		                            }}
		                            className="cursor-pointer transition hover:bg-primary-50/50 focus:outline-none focus-visible:bg-primary-50"
		                          >
		                            <td className="px-2.5 py-2 align-middle">
		                              <p className="truncate font-mono text-xs font-semibold text-surface-800" title={order.change_no || ""}>{order.change_no || "-"}</p>
		                              <p className="mt-0.5 truncate text-xs text-surface-400" title={order.created_by_name || ""}>{order.created_by_name || "系统创建"}</p>
		                            </td>
		                            <td className="px-2.5 py-2 align-middle">
		                              <p className="line-clamp-2 break-words font-semibold text-surface-900" title={order.title || ""}>{order.title || "-"}</p>
		                              <p className="mt-0.5 line-clamp-1 break-words text-xs text-surface-500" title={order.description || ""}>{order.description || "未填写备注"}</p>
		                            </td>
		                            <td className="px-2.5 py-2 align-middle text-surface-600">
		                              <p className="line-clamp-1 break-words" title={order.space || ""}>{order.space || "-"}</p>
		                            </td>
		                            <td className="whitespace-nowrap px-2.5 py-2 align-middle text-xs tabular-nums text-surface-600">
		                              {formatDateTime(order.approved_at || order.updated_at || order.created_at)}
		                            </td>
		                            <td className={`whitespace-nowrap px-2.5 py-2 text-right align-middle font-semibold tabular-nums ${changeAmountDetailTone}`}>
		                              {formatPlainAmount(changeAmountDetailType === "DEDUCT" ? getChangeOrderDeductAmount(order) : getChangeOrderNetAddAmount(order))}
		                            </td>
		                            <td className="px-2.5 py-2 text-center align-middle">
		                              <ChangeOrderStatusBadge status={order.status} />
		                            </td>
		                          </tr>
		                        ))}
		                      </tbody>
		                    </table>
		                  ) : (
		                    <EmptyText text={`暂无${changeAmountDetailType === "DEDUCT" ? "减项" : "增项"}明细`} />
		                  )}
		                </div>
		                {changeAmountDetailOrders.length > 0 && (
		                  <div className="border-t border-surface-200 bg-surface-50 px-5 py-3 text-xs text-surface-500">
		                    点击任意明细可查看对应变更单详情。
		                  </div>
		                )}
		              </div>
		            </div>
		          )}

		          {receiptRecordsOpen && (
		            <div className="fixed bottom-0 right-0 top-0 z-50 bg-surface-950/25 md:left-[var(--active-sidebar-width)] max-md:left-0">
		              <div className="absolute inset-0" onClick={() => setReceiptRecordsOpen(false)} />
		              <div
		                role="dialog"
		                aria-modal="true"
		                aria-label="全部收款记录"
		                className="absolute left-1/2 top-1/2 z-10 flex max-h-[82vh] w-[calc(100%-32px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-surface-200 bg-white shadow-[0_24px_60px_rgba(31,41,53,0.22)]"
		              >
		                <div className="flex items-start justify-between gap-4 border-b border-surface-300 bg-surface-50 px-5 py-4">
		                  <div className="min-w-0">
		                    <h3 className="text-lg font-semibold text-surface-900">全部收款记录</h3>
		                    <p className="mt-1 text-sm text-surface-500">
		                      共 {allReceiptRecords.length} 笔，合计 <span className="font-semibold tabular-nums text-red-600">{formatPlainAmount(allReceiptAmount)}</span>
		                    </p>
		                  </div>
		                  <button
		                    type="button"
		                    onClick={() => setReceiptRecordsOpen(false)}
		                    className="rounded-lg p-2 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
		                    aria-label="关闭全部收款记录"
		                  >
		                    <X className="h-5 w-5" />
		                  </button>
		                </div>
		                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
		                  {allReceiptRecords.length > 0 ? (
		                    <table className="w-full table-fixed text-sm">
		                      <colgroup>
		                        <col className="w-[16%]" />
		                        <col className="w-[9%]" />
		                        <col className="w-[17%]" />
		                        <col className="w-[12%]" />
		                        <col className="w-[13%]" />
		                        <col className="w-[14%]" />
		                        <col className="w-[19%]" />
		                      </colgroup>
		                      <thead className="sticky top-0 z-10 bg-surface-50 text-xs font-medium text-surface-500">
		                        <tr className="border-b border-surface-200">
		                          <th className="px-2.5 py-2 text-left">收款时间</th>
		                          <th className="px-2.5 py-2 text-left">类型</th>
		                          <th className="px-2.5 py-2 text-left">收款名称</th>
		                          <th className="px-2.5 py-2 text-left">方式</th>
		                          <th className="px-2.5 py-2 text-left">收款人</th>
		                          <th className="px-2.5 py-2 text-right">金额</th>
		                          <th className="px-2.5 py-2 text-left">备注</th>
		                        </tr>
		                      </thead>
		                      <tbody className="divide-y divide-surface-200">
		                        {allReceiptRecords.map((record) => (
		                          <tr key={`${record.category}-${record.id}`} className="hover:bg-surface-50">
		                            <td className="whitespace-nowrap px-2.5 py-2 text-xs tabular-nums text-surface-700">{record.date ? formatDateTime(record.date) : "-"}</td>
		                            <td className="px-2.5 py-2">
		                              <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-700">{record.category}</span>
		                            </td>
		                            <td className="px-2.5 py-2 font-medium text-surface-900" title={record.title || undefined}>
		                              <span className="line-clamp-2 break-words">{record.title || "-"}</span>
		                            </td>
		                            <td className="px-2.5 py-2 text-surface-600" title={record.method || undefined}>
		                              <span className="line-clamp-2 break-words">{record.method || "-"}</span>
		                            </td>
		                            <td className="px-2.5 py-2 text-surface-600" title={record.operator || undefined}>
		                              <span className="line-clamp-2 break-words">{record.operator || "-"}</span>
		                            </td>
		                            <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold tabular-nums text-red-600">{formatPlainAmount(record.amount)}</td>
		                            <td className="px-2.5 py-2 text-surface-500" title={record.note || undefined}>
		                              <span className="line-clamp-2 break-words">{record.note || "-"}</span>
		                            </td>
		                          </tr>
		                        ))}
		                      </tbody>
		                    </table>
		                  ) : (
		                    <EmptyText text="暂无收款记录" />
		                  )}
		                </div>
		              </div>
		            </div>
		          )}

		          {changeOrderDetailOpen && selectedChangeOrder && (
		            <div className={changeOrderStyles.detailOverlay}>
		              <div
		                className={changeOrderStyles.detailBackdrop}
		                onClick={() => {
		                  setChangeOrderDetailOpen(false);
		                  setChangeOrderEditMode(false);
		                }}
		              />
	              <div
	                role="dialog"
	                aria-modal="true"
	                className={changeOrderStyles.detailDialog}
	              >
	                <header className={changeOrderStyles.detailHeader}>
	                  <div className="min-w-0">
		                    <div className={changeOrderStyles.detailTitleRow}>
		                      <h3 className={changeOrderStyles.detailTitle}>{changeOrderEditMode ? "编辑变更单" : "变更单详情"}</h3>
	                      <ChangeOrderStatusBadge status={selectedChangeOrder.status} />
	                      <span className={`${changeOrderStyles.detailTypeTag} ${getChangeOrderTypeTitle(selectedChangeOrder) === "增减项" ? changeOrderStyles.detailTypeMixed : getChangeOrderTypeTitle(selectedChangeOrder) === "减项" ? changeOrderStyles.detailTypeDeduct : changeOrderStyles.detailTypeAdd}`}>
	                        {getChangeOrderTypeTitle(selectedChangeOrder)}
	                      </span>
	                    </div>
	                    <p className={changeOrderStyles.detailMeta}>
	                      {selectedChangeOrder.change_no || "-"} · {selectedChangeOrder.title || "-"} · {selectedChangeOrder.created_by_name || "系统创建"}
	                    </p>
		                  </div>
		                  <div className={changeOrderStyles.detailActions}>
		                    {!changeOrderEditMode && selectedChangeOrder.status !== "CANCELLED" && (
		                      <button
		                        type="button"
		                        onClick={() => printChangeOrder(selectedChangeOrder)}
		                        disabled={saving || isVirtualSite}
		                        className={changeOrderStyles.detailToolButton}
		                      >
		                        <Printer className="h-4 w-4" />
		                        打印
		                      </button>
		                    )}
		                    {!changeOrderEditMode && selectedChangeOrder.status !== "CANCELLED" && (
		                      <button
		                        type="button"
		                        onClick={() => startEditChangeOrder(selectedChangeOrder)}
		                        disabled={saving || isVirtualSite}
		                        className={changeOrderStyles.detailToolButton}
		                      >
		                        <Pencil className="h-4 w-4" />
		                        编辑
		                      </button>
		                    )}
		                    {!changeOrderEditMode && selectedChangeOrder.status !== "CANCELLED" && (
		                      <button
		                        type="button"
		                        onClick={() => cancelChangeOrder(selectedChangeOrder)}
		                        disabled={saving || isVirtualSite}
		                        className={`${changeOrderStyles.detailToolButton} ${changeOrderStyles.detailDangerButton}`}
		                      >
		                        <Archive className="h-4 w-4" />
		                        作废
		                      </button>
		                    )}
		                    <button
		                      type="button"
		                      onClick={() => {
		                        setChangeOrderDetailOpen(false);
		                        setChangeOrderEditMode(false);
		                      }}
		                      className={changeOrderStyles.detailCloseButton}
		                      aria-label="关闭"
		                    >
		                      <X className="h-4 w-4" />
		                    </button>
		                  </div>
		                </header>

	                <div className={changeOrderStyles.detailScroll}>
	                  <div className={changeOrderStyles.detailContent}>
		                    {changeOrderMessage && (
		                      <div className={`rounded-lg px-3 py-2 text-sm ${changeOrderMessage.includes("失败") || changeOrderMessage.includes("请") || changeOrderMessage.includes("不能") ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
		                        {changeOrderMessage}
		                      </div>
		                    )}
		                      {changeOrderEditMode ? (
		                          <div className="rounded-lg border border-surface-300 bg-white">
		                            <div className="border-b border-surface-300 bg-surface-50 px-4 py-2.5 text-sm font-semibold text-surface-900">二次编辑</div>
		                            <div className="space-y-3 p-4">
		                            <div className={changeOrderStyles.editorSurface}>
		                              <ChangeOrderItemsEditor
		                                items={changeOrderEditForm.items}
		                                disabled={saving || isVirtualSite}
		                                onUpdate={updateChangeOrderEditItem}
		                                onAdd={addChangeOrderEditItem}
		                                onRemove={removeChangeOrderEditItem}
		                              />
		                              <ChangeOrderSettlementEditor
		                                form={changeOrderEditForm}
		                                disabled={saving || isVirtualSite}
		                                onChange={(patch) => setChangeOrderEditForm((form) => ({ ...form, ...patch }))}
		                              />
		                            </div>
		                            {selectedChangeOrder.status === "APPROVED" && (
		                              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">当前变更单已审批通过，二次编辑会保留审批通过状态和结算状态。</p>
		                            )}
		                            <div className="flex justify-end gap-2 border-t border-surface-200 pt-3">
		                              <button type="button" onClick={cancelEditChangeOrder} className="btn-secondary" disabled={saving}>取消</button>
		                              <button type="button" onClick={saveChangeOrderEdit} className="btn-primary" disabled={saving || isVirtualSite}>
		                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
		                                保存修改
		                              </button>
		                            </div>
		                          </div>
		                        </div>
		                      ) : (
		                        <>
		                          <section className={changeOrderStyles.detailSummary}>
		                            <div className={changeOrderStyles.detailMetric} data-tone="add">
		                              <span>增项合计</span>
		                              <strong>{formatPlainAmount(selectedChangeOrderAddAmount)}</strong>
		                            </div>
		                            <div className={changeOrderStyles.detailMetric} data-tone="deduct">
		                              <span>减项合计</span>
		                              <strong>{selectedChangeOrderDeductAmount > 0 ? `-${formatPlainAmount(selectedChangeOrderDeductAmount)}` : formatPlainAmount(0)}</strong>
		                            </div>
		                            <div className={changeOrderStyles.detailMetric} data-tone="discount">
		                              <span>优惠金额</span>
		                              <strong>{selectedChangeOrderDiscountAmount > 0 ? `-${formatPlainAmount(selectedChangeOrderDiscountAmount)}` : formatPlainAmount(0)}</strong>
		                            </div>
		                            <div className={changeOrderStyles.detailMetric} data-tone={getChangeSignedAmount(selectedChangeOrder) < 0 ? "deduct" : "receivable"}>
		                              <span>最终应收</span>
		                              <strong>{getChangeSignedAmount(selectedChangeOrder) < 0 ? "-" : ""}{formatPlainAmount(Math.abs(getChangeSignedAmount(selectedChangeOrder)))}</strong>
		                            </div>
		                          </section>

		                          <section className={changeOrderStyles.detailSection}>
		                            <header className={changeOrderStyles.detailSectionHeader}>
		                              <p>变更项目明细</p>
		                              <span>共 {selectedChangeOrderItems.length} 项</span>
		                            </header>
		                            <div className={changeOrderStyles.detailTableViewport}>
		                            <table className={changeOrderStyles.detailTable}>
		                              <colgroup>
		                                <col className="w-[72px]" />
		                                <col />
		                                <col className="w-[88px]" />
		                                <col className="w-[86px]" />
		                                <col className="w-[68px]" />
		                                <col className="w-[58px]" />
		                                <col className="w-[96px]" />
		                              </colgroup>
		                              <thead>
		                                <tr>
		                                  <th className="whitespace-nowrap px-3 py-2 text-left">类型</th>
		                                  <th className="whitespace-nowrap px-3 py-2 text-left">变更明细</th>
		                                  <th className="whitespace-nowrap px-3 py-2 text-left">空间</th>
		                                  <th className="whitespace-nowrap px-3 py-2 text-right">单价</th>
		                                  <th className="whitespace-nowrap px-3 py-2 text-right">数量</th>
		                                  <th className="whitespace-nowrap px-3 py-2 text-center">单位</th>
		                                  <th className="whitespace-nowrap px-3 py-2 text-right">金额</th>
		                                </tr>
		                              </thead>
		                              <tbody>
		                                {selectedChangeOrderItems.map((item, index) => {
		                                  const itemAmount = getChangeOrderLineAmount(item);
		                                  const isDeductItem = normalizeChangeLineType(item.change_type) === "DEDUCT";
		                                  return (
		                                    <tr key={`${item.title}-${index}`}>
		                                      <td className="px-3 py-2.5">
		                                        <span className={changeOrderStyles.changeTypeTag} data-tone={isDeductItem ? "deduct" : "add"}>{isDeductItem ? "减项" : "增项"}</span>
		                                      </td>
		                                      <td className="px-3 py-2.5">
		                                        <p className="min-w-0 whitespace-normal break-words font-semibold leading-5 text-surface-900">{item.title || "-"}</p>
		                                        {item.description && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-surface-500">{item.description}</p>}
		                                      </td>
		                                      <td className="px-3 py-2.5 text-surface-700">
		                                        <p className="truncate" title={item.space || undefined}>{item.space || "-"}</p>
		                                      </td>
		                                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-surface-700">{formatPlainAmount(Number(item.unit_price || 0) || 0)}</td>
		                                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-surface-700">{formatPlainAmount(Number(item.quantity || 0) || 0)}</td>
		                                      <td className="px-3 py-2.5 text-center text-surface-700">{item.unit || "项"}</td>
		                                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${isDeductItem ? "text-emerald-600" : "text-red-600"}`}>
		                                        {isDeductItem ? "-" : ""}{formatPlainAmount(itemAmount)}
		                                      </td>
		                                    </tr>
		                                  );
		                                })}
		                              </tbody>
		                            </table>
		                            </div>
		                            {selectedChangeOrderDiscountAmount > 0 && (
		                              <div className={changeOrderStyles.discountNote}>
		                                <span>优惠说明</span>
		                                <p>{selectedChangeOrder.discount_reason || "-"}</p>
		                              </div>
		                            )}
		                          </section>

		                          {selectedChangeOrder.rejected_reason && (
		                            <div className={changeOrderStyles.rejectedNote}>
		                              <span className="font-medium">处理说明：</span>{selectedChangeOrder.rejected_reason}
		                            </div>
		                          )}

		                          <ChangeOrderApprovalFlow order={selectedChangeOrder} currentUserName={user?.name || ""} />

		                        </>
		                      )}
	                  </div>
	                </div>
	                {!changeOrderEditMode && canHandleSelectedChangeApproval && (
	                  <footer className={changeOrderStyles.approvalActionBar}>
	                    <span className={changeOrderStyles.approvalActionLabel}>处理操作</span>
	                    <div className={changeOrderStyles.approvalActionButtons}>
	                      <button type="button" onClick={() => handleSelectedChangeOrderApprovalAction("reject")} disabled={saving || isVirtualSite} className={changeOrderStyles.rejectButton}>
	                        <CircleX className="h-4 w-4" />
	                        驳回
	                      </button>
	                      <button type="button" onClick={() => handleSelectedChangeOrderApprovalAction("approve")} disabled={saving || isVirtualSite} className={changeOrderStyles.approveButton}>
	                        <CircleCheck className="h-4 w-4" />
	                        审批通过
	                      </button>
	                    </div>
	                  </footer>
	                )}
	              </div>
	            </div>
	              )}
	        </main>
      ) : (
        <div className="rounded-lg border border-surface-300 bg-white p-16 text-center text-sm text-surface-400">未找到该工地</div>
      )}
      <ApprovalSignatureModal
        open={changeOrderSignatureApprovalOpen}
        action={changeOrderSignatureApprovalAction}
        title={changeOrderSignatureApprovalAction === "reject" ? "确认审批驳回" : "确认审批通过"}
        processing={saving}
        onClose={() => setChangeOrderSignatureApprovalOpen(false)}
        onConfirm={async (signatureId, comment) => {
          await handleSelectedChangeOrderApprovalAction(changeOrderSignatureApprovalAction, signatureId, comment);
        }}
      />
      {selectedConstructionRecord && (
        <div className={recordStyles.drawerOverlay} onClick={() => setConstructionRecordNodeId("")}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedConstructionRecord.node.name}施工记录`}
            onClick={(event) => event.stopPropagation()}
            className={recordStyles.drawer}
          >
            <header className={recordStyles.drawerHeader}>
                <div className="min-w-0">
                  <div className={recordStyles.drawerTitleRow}>
                    <h3 className={recordStyles.drawerTitle}>{selectedConstructionRecord.node.name}</h3>
                    <span className={`${recordStyles.drawerTag} ${getPhaseNodeStatusMeta(selectedConstructionRecord.node.status, selectedConstructionRecord.node.nodeType).className}`}>
                      {getPhaseNodeStatusMeta(selectedConstructionRecord.node.status, selectedConstructionRecord.node.nodeType).label}
                    </span>
                    <span className={`${recordStyles.drawerTag} ${selectedConstructionRecord.quality.className}`}>{selectedConstructionRecord.quality.label}</span>
                  </div>
                  <p className={recordStyles.drawerMeta}>{selectedConstructionRecord.stageName} · {selectedConstructionRecord.node.owner || "未分配"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConstructionRecordNodeId("")}
                  className={recordStyles.closeButton}
                  title="关闭"
                  aria-label="关闭施工记录"
                >
                  <X className="h-4 w-4" />
                </button>
            </header>

            <div className={recordStyles.drawerStats}>
              <div className={recordStyles.drawerStat}>
                <p className={recordStyles.drawerStatLabel}>计划时间</p>
                <p className={recordStyles.drawerStatValue}>{selectedConstructionRecord.node.plannedStart && selectedConstructionRecord.node.plannedEnd ? formatConstructionPlanDateRange(selectedConstructionRecord.node.plannedStart, selectedConstructionRecord.node.plannedEnd) : "未设置"}</p>
              </div>
              <div className={recordStyles.drawerStat}>
                <p className={recordStyles.drawerStatLabel}>施工汇报</p>
                <p className={recordStyles.drawerStatValue}>{selectedConstructionRecord.reportCount} 条</p>
              </div>
              <div className={recordStyles.drawerStat}>
                <p className={recordStyles.drawerStatLabel}>现场照片</p>
                <p className={recordStyles.drawerStatValue}>{selectedConstructionRecord.photoCount} 张</p>
              </div>
              <div className={recordStyles.drawerStat}>
                <p className={recordStyles.drawerStatLabel}>整改问题</p>
                <p className={`${recordStyles.drawerStatValue} ${selectedConstructionRecord.issueCount > 0 ? "text-red-600" : ""}`}>{selectedConstructionRecord.issueCount} 条</p>
              </div>
            </div>

            <div className={recordStyles.drawerTabs}>
              {[
                ["ALL", "全部动态"],
                ["NODE_STATUS", "状态变更"],
                ["REPORT", "施工汇报"],
                ["ISSUE", "问题整改"],
                ["ATTACHMENT", "节点附件"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setConstructionRecordTimelineFilter(value)}
                  className={`${recordStyles.drawerTab} ${constructionRecordTimelineFilter === value ? recordStyles.drawerTabActive : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={recordStyles.drawerBody}>
              {selectedConstructionRecordTimeline.length > 0 ? (
                <div className={recordStyles.timeline}>
                  {selectedConstructionRecordTimeline.map((event) => {
                    const eventMeta = getConstructionRecordEventMeta(event.eventType);
                    const completedWork = getVisibleLogWorkText(event.completedWork);
                    const nextPlan = getVisibleLogWorkText(event.nextPlan);
                    const hasReportPlan = String(event.eventType || "").toUpperCase().startsWith("REPORT") && Boolean(completedWork || nextPlan);
                    const normalizedContent = String(event.content || "").trim().replace(/\r\n/g, "\n");
                    const shouldShowContent = Boolean(normalizedContent) && !hasReportPlan;
                    return (
                      <article key={event.id} className={recordStyles.timelineItem}>
                        <span className={`${recordStyles.timelineDot} ${eventMeta.dotClassName}`} />
                        <div className={recordStyles.timelineContent}>
                          <div className={recordStyles.timelineTop}>
                            <div className={recordStyles.timelineHeading}>
                              <span className={`${recordStyles.timelineTag} ${eventMeta.className}`}>{eventMeta.label}</span>
                              <p className={recordStyles.timelineTitle}>{event.title}</p>
                            </div>
                            <time className={recordStyles.timelineTime}>{formatDateTime(event.createdAt)}</time>
                          </div>
                          <div className={recordStyles.timelineMeta}>
                            <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{event.operatorName}</span>
                            {event.locationName && (
                              <span className={recordStyles.timelineLocation} title={event.locationName}>
                                <MapPin className="h-3.5 w-3.5" />
                                <span>{event.locationName}</span>
                              </span>
                            )}
                            {event.statusTo && (
                              <span>{event.statusFrom ? `${getConstructionRecordStatusText(event.statusFrom)} → ` : ""}{getConstructionRecordStatusText(event.statusTo)}</span>
                            )}
                          </div>
                          {shouldShowContent && <p className={recordStyles.timelineText}>{event.content}</p>}
                          {hasReportPlan && (
                            <div className={recordStyles.reportPlanTable}>
                              <div className={recordStyles.reportPlanCell}>
                                <span className={recordStyles.reportPlanLabel}>今日完成</span>
                                <p className={recordStyles.reportPlanText}>{completedWork || "未填写"}</p>
                              </div>
                              <div className={recordStyles.reportPlanCell}>
                                <span className={recordStyles.reportPlanLabel}>明日计划</span>
                                <p className={recordStyles.reportPlanText}>{nextPlan || "未填写"}</p>
                              </div>
                            </div>
                          )}
                          {event.photos.length > 0 && (
                            <div className={recordStyles.photoGrid}>
                              {event.photos.map((photo: any, index: number) => {
                                const url = photo.file_url || photo.url || "";
                                return (
                                  <a key={photo.id || `${event.id}-${index}`} href={url} target="_blank" rel="noreferrer" className={recordStyles.photoLink}>
                                    <NativeImage src={url} alt={photo.file_name || photo.caption || "施工照片"} className="max-h-full max-w-full object-contain transition group-hover:scale-[1.03]" />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={recordStyles.drawerEmpty}>
                  <div>
                    <Activity className="mx-auto h-8 w-8 text-surface-300" />
                    <p className="mt-3 text-sm font-semibold text-surface-700">当前分类暂无记录</p>
                    <p className="mt-1 text-xs text-surface-400">后续节点操作会自动出现在这里。</p>
                  </div>
                </div>
              )}
            </div>

            <footer className={recordStyles.drawerFooter}>
              <p className={recordStyles.drawerFooterCount}>共 {selectedConstructionRecordTimeline.length} 条记录</p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("phase");
                  setConstructionRecordNodeId("");
                }}
                className={recordStyles.drawerPrimaryButton}
              >
                返回施工阶段
                <ChevronRight className="h-4 w-4" />
              </button>
            </footer>
          </aside>
        </div>
      )}
      {customPhaseNodeDialogOpen && typeof document !== "undefined" && createPortal(
        <div
          className={phaseStyles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-phase-node-title"
        >
          <div className={phaseStyles.customNodeModalShell}>
            <div className={phaseStyles.nodeModalHeader}>
              <div className="min-w-0">
                <div className={phaseStyles.nodeModalTitleRow}>
                  <h3 id="custom-phase-node-title" className={phaseStyles.nodeModalTitle}>新增施工节点</h3>
                  <span className={phaseStyles.nodeModalTag}>
                    {currentPhaseLabel}
                  </span>
                </div>
                <p className={phaseStyles.nodeModalMeta}>为当前工地补充模板外的施工或验收节点</p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setCustomPhaseNodeDialogOpen(false)}
                className={phaseStyles.nodeModalClose}
                aria-label="关闭新增节点弹窗"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={phaseStyles.customNodeForm}>
              <label className={phaseStyles.customNodeField}>
                <span>节点类型</span>
                <SystemSelect
                  value={customPhaseNodeForm.nodeType}
                  onChange={(event) => setCustomPhaseNodeForm((form) => ({ ...form, nodeType: event.target.value === "acceptance" ? "acceptance" : "construction" }))}
                  className={phaseStyles.customNodeControl}
                  menuClassName={phaseStyles.selectMenu}
                  optionClassName={phaseStyles.selectOption}
                  disabled={saving || isVirtualSite}
                >
                  <option value="construction">施工节点</option>
                  <option value="acceptance">验收节点</option>
                </SystemSelect>
              </label>
              <label className={phaseStyles.customNodeField}>
                <span>节点名称</span>
                <input
                  value={customPhaseNodeForm.name}
                  onChange={(event) => setCustomPhaseNodeForm((form) => ({ ...form, name: event.target.value }))}
                  className={phaseStyles.customNodeControl}
                  placeholder={customPhaseNodeForm.nodeType === "acceptance" ? "如：地暖回填验收" : "如：地暖回填施工"}
                  disabled={saving || isVirtualSite}
                />
              </label>
              <div className={phaseStyles.customNodeDateGrid}>
                <label className={phaseStyles.customNodeField}>
                  <span>计划开始</span>
                  <SystemDateInput
                    value={customPhaseNodeForm.plannedStart}
                    onChange={(nextValue) => setCustomPhaseNodeForm((form) => ({ ...form, plannedStart: nextValue }))}
                    className={phaseStyles.customNodeControl}
                    disabled={saving || isVirtualSite}
                  />
                </label>
                <label className={phaseStyles.customNodeField}>
                  <span>计划结束</span>
                  <SystemDateInput
                    value={customPhaseNodeForm.plannedEnd}
                    onChange={(nextValue) => setCustomPhaseNodeForm((form) => ({ ...form, plannedEnd: nextValue }))}
                    className={phaseStyles.customNodeControl}
                    disabled={saving || isVirtualSite}
                  />
                </label>
              </div>
              <label className={phaseStyles.customNodeField}>
                <span>{customPhaseNodeForm.nodeType === "acceptance" ? "验收标准" : "施工说明"}</span>
                <textarea
                  value={customPhaseNodeForm.description}
                  onChange={(event) => setCustomPhaseNodeForm((form) => ({ ...form, description: event.target.value }))}
                  className={`${phaseStyles.customNodeControl} ${phaseStyles.customNodeTextarea}`}
                  placeholder={customPhaseNodeForm.nodeType === "acceptance" ? "填写验收时需要核对的标准" : "填写该节点的施工范围或注意事项"}
                  disabled={saving || isVirtualSite}
                />
              </label>
              {customPhaseNodeMessage && <p className={phaseStyles.customNodeFeedback}>{customPhaseNodeMessage}</p>}
            </div>
            <div className={phaseStyles.nodeModalFooter}>
              <button
                type="button"
                onClick={() => setCustomPhaseNodeDialogOpen(false)}
                disabled={saving}
                className={phaseStyles.logCancelButton}
              >
                取消
              </button>
              <button
                type="button"
                onClick={addCustomPhaseNode}
                disabled={saving || isVirtualSite}
                className={phaseStyles.logPublishButton}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                保存节点
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {phaseNodeDeleteTarget && typeof document !== "undefined" && createPortal(
        <div
          className={phaseStyles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-phase-node-title"
        >
          <div className={phaseStyles.deleteNodeModalShell}>
            <div className={phaseStyles.nodeModalHeader}>
              <div className="min-w-0">
                <div className={phaseStyles.nodeModalTitleRow}>
                  <h3 id="delete-phase-node-title" className={phaseStyles.nodeModalTitle}>删除新增节点</h3>
                  <span className={phaseStyles.nodeModalTag}>
                    {phaseNodeDeleteTarget.nodeType === "acceptance" ? "验收节点" : "施工节点"}
                  </span>
                </div>
                <p className={phaseStyles.nodeModalMeta}>删除后该节点会从施工阶段和施工计划中移除，历史操作会保留在施工记录中。</p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setPhaseNodeDeleteTarget(null)}
                className={phaseStyles.nodeModalClose}
                aria-label="关闭删除节点弹窗"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={phaseStyles.deleteNodeBody}>
              <p className={phaseStyles.deleteNodeName}>{phaseNodeDeleteTarget.name}</p>
              <p className={phaseStyles.deleteNodeHint}>仅支持删除用户新增的节点，模板节点不会被删除。</p>
              {phaseNodeDeleteMessage && <p className={phaseStyles.customNodeFeedback}>{phaseNodeDeleteMessage}</p>}
            </div>
            <div className={phaseStyles.nodeModalFooter}>
              <button
                type="button"
                onClick={() => setPhaseNodeDeleteTarget(null)}
                disabled={saving}
                className={phaseStyles.logCancelButton}
              >
                取消
              </button>
              <button
                type="button"
                onClick={deleteCustomPhaseNode}
                disabled={saving || isVirtualSite}
                className={phaseStyles.deleteConfirmButton}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                确认删除
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {phaseNodeModal && phaseNodeModalNode && typeof document !== "undefined" && createPortal(
        <div
          className={phaseStyles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="phase-node-modal-title"
        >
          <div className={phaseNodeModal.mode === "log" ? phaseStyles.logModalShell : phaseStyles.nodeModalShell}>
            <div className={phaseNodeModal.mode === "log" ? phaseStyles.logModalHeader : phaseStyles.nodeModalHeader}>
              <div className="min-w-0">
                <div className={phaseNodeModal.mode === "log" ? phaseStyles.logModalTitleRow : phaseStyles.nodeModalTitleRow}>
                  <h3 id="phase-node-modal-title" className={phaseNodeModal.mode === "log" ? phaseStyles.logModalTitle : phaseStyles.nodeModalTitle}>{phaseNodeModalNode.name}</h3>
                  <span className={`${phaseNodeModal.mode === "log" ? phaseStyles.logModalTag : phaseStyles.nodeModalTag} ${phaseNodeModalStatusMeta.className}`}>
                    {phaseNodeModalStatusMeta.label}
                  </span>
                  <span className={`${phaseNodeModal.mode === "log" ? phaseStyles.logModalTag : phaseStyles.nodeModalTag} ${phaseNodeModalNode.nodeType === "acceptance" ? "bg-emerald-50 text-emerald-700" : "bg-primary-50 text-primary-700"}`}>
                    {phaseNodeModalNode.nodeType === "acceptance" ? "验收节点" : "施工节点"}
                  </span>
                </div>
                <p className={phaseNodeModal.mode === "log" ? phaseStyles.logModalMeta : phaseStyles.nodeModalMeta}>
                  {currentPhaseLabel} · {phaseNodeModalNode.plannedDays ? `${phaseNodeModalNode.plannedDays}天` : "未设置工期"} · {phaseNodeModalNode.owner || "未分配"}
                </p>
              </div>
              <button
                type="button"
                onClick={closePhaseNodeModal}
                className={phaseNodeModal.mode === "log" ? phaseStyles.logModalClose : phaseStyles.nodeModalClose}
                aria-label="关闭弹窗"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={phaseNodeModal.mode === "log" ? phaseStyles.logModalBody : phaseStyles.nodeModalBody}>
              {phaseNodeModal.mode === "standard" && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                      <p className="text-xs text-surface-500">节点类型</p>
                      <p className="mt-1 font-semibold text-surface-900">{phaseNodeModalNode.nodeType === "acceptance" ? "验收节点" : "施工节点"}</p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                      <p className="text-xs text-surface-500">图片要求</p>
                      <p className="mt-1 font-semibold text-surface-900">{phaseNodeModalNode.photoRequired ? "要求上传图片" : "图片非必传"}</p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                      <p className="text-xs text-surface-500">确认要求</p>
                      <p className="mt-1 truncate font-semibold text-surface-900">
                        {[
                          phaseNodeModalNode.customerConfirmRequired ? "客户确认" : "",
                          phaseNodeModalNode.projectManagerConfirmRequired ? "项目经理确认" : "",
                        ].filter(Boolean).join("、") || "无额外确认"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-surface-300 bg-white">
                    <div className="flex items-center justify-between border-b border-surface-200 bg-[#f3f7ff] px-4 py-2.5">
                      <p className="text-sm font-semibold text-[#24426f]">{phaseNodeModalNode.nodeType === "acceptance" ? "验收标准" : "标准施工工艺规范"}</p>
                      <span className="text-xs font-medium text-surface-500">{phaseNodeModalNode.standardItems.length || 0} 条</span>
                    </div>
                    <div className="divide-y divide-surface-100">
                      {phaseNodeModalNode.standardItems.length > 0 ? phaseNodeModalNode.standardItems.map((item, index) => (
                        <div key={item.id || index} className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-xs font-semibold text-surface-600">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-6 text-surface-800">{item.description || "未填写标准内容"}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {phaseNodeModalNode.nodeType === "acceptance" && (
                                  <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.required ? "bg-emerald-50 text-emerald-700" : "bg-surface-100 text-surface-500"}`}>
                                    {item.required ? "必验" : "选验"}
                                  </span>
                                )}
                                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.photoRequired ? "bg-primary-50 text-primary-700" : "bg-surface-100 text-surface-500"}`}>
                                  {item.photoRequired ? "必须上传图片" : "图片非必传"}
                                </span>
                              </div>
                              {item.images.length > 0 && (
	                                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
	                                  {item.images.map((image) => (
	                                    <a key={image.id || image.url} href={image.url} target="_blank" rel="noreferrer" className="group flex h-24 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-white p-1 transition hover:border-primary-300">
	                                      <NativeImage src={image.url} alt={image.caption || "标准图片"} className="max-h-full max-w-full object-contain transition group-hover:scale-[1.03]" />
	                                    </a>
	                                  ))}
	                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="p-4">
                          <EmptyText text={phaseNodeModalNode.nodeType === "acceptance" ? "该验收节点暂未配置验收标准" : "该施工节点暂未配置工艺标准"} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {phaseNodeModal.mode === "photos" && (
                <div className="space-y-4">
                  <input
                    ref={phasePhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      await uploadPhasePhoto(input.files?.[0], phaseNodeModalNode);
                      input.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => phasePhotoInputRef.current?.click()}
                    disabled={Boolean(uploadingCategory) || isVirtualSite}
                    className="flex min-h-28 w-full flex-col items-center justify-center rounded-lg border border-dashed border-primary-200 bg-primary-50/30 px-4 text-center transition hover:border-primary-300 hover:bg-primary-50 disabled:opacity-60"
                  >
                    {uploadingCategory === getPhaseNodeUploadCategory(phaseNodeModalNode) ? <Loader2 className="h-6 w-6 animate-spin text-primary-600" /> : <Upload className="h-6 w-6 text-primary-600" />}
                    <span className="mt-2 text-sm font-semibold text-surface-900">上传当前节点图片</span>
                    <span className="mt-1 text-xs text-surface-500">{phaseNodeModalNode.photoRequired ? "该节点要求保留现场图片" : "可按实际情况上传"}</span>
                  </button>
                  {phaseNodeModalFiles.length > 0 ? (
                    <div className={phaseStyles.nodePhotoGrid}>
                      {phaseNodeModalFiles.map((file) => {
                        const isImage = String(file.mime_type || "").startsWith("image/");
                        return (
	                          <a key={file.id} href={file.file_url} target="_blank" rel="noreferrer" className={`${phaseStyles.nodePhotoLink} group`}>
	                            {isImage ? (
	                              <NativeImage src={file.file_url} alt={file.file_name || "节点图片"} />
	                            ) : (
                              <FileText className="h-7 w-7 text-surface-400" />
                            )}
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyText text="当前节点暂无图片" />
                  )}
                </div>
              )}

              {phaseNodeModal.mode === "records" && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                      <p className="text-xs text-surface-500">施工日志</p>
                      <p className="mt-1 text-base font-semibold tabular-nums text-surface-900">{phaseNodeModalRecordLogs.length} 条</p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                      <p className="text-xs text-surface-500">现场图片</p>
                      <p className="mt-1 text-base font-semibold tabular-nums text-surface-900">{phaseNodeModalRecordPhotoCount} 张</p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                      <p className="text-xs text-surface-500">最近记录</p>
                      <p className="mt-1 truncate text-sm font-semibold text-surface-900">
                        {phaseNodeModalRecordLogs[0]?.log_date ? formatDate(phaseNodeModalRecordLogs[0].log_date) : "-"}
                      </p>
                    </div>
                  </div>

	                  <section className="overflow-hidden rounded-lg border border-surface-300 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-surface-200 bg-[#f3f7ff] px-4 py-2.5">
                      <p className="flex items-center gap-2 text-sm font-semibold text-[#24426f]">
                        <FileText className="h-4 w-4 text-primary-600" /> 施工日志记录
                      </p>
                      <span className="text-xs font-medium text-surface-500">{phaseNodeModalRecordLogs.length} 条</span>
                    </div>
                    <div className="divide-y divide-surface-100">
                      {phaseNodeModalRecordLogs.length > 0 ? phaseNodeModalRecordLogs.map((log: any) => {
                        const displayContent = getLogDisplayContent(log) || getVisibleLogWorkText(log.completed_work) || "已上传现场照片";
                        const hasDetails = hasLogInlineDetails(log);
                        const shouldShowLogSummary = Boolean(displayContent) && !hasDetails;
                        return (
                          <article key={log.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md border border-surface-200 bg-white px-2 py-0.5 text-xs font-semibold text-surface-900">{formatDate(log.log_date)}</span>
                              <span className="text-xs font-medium text-surface-500">{log.author_name || "未知"}</span>
                              {log.location_name && (
                                <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{log.location_name}</span>
                                </span>
                              )}
                            </div>
                            {shouldShowLogSummary && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-surface-900">{displayContent}</p>}
                            {hasDetails && (
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                <TimelineLogDetail label="完成" value={getVisibleLogWorkText(log.completed_work)} />
                                <TimelineLogDetail label="明日" value={getVisibleLogWorkText(log.next_plan)} />
                                <TimelineLogDetail label="质量" value={log.quality_notes} />
                                <TimelineLogDetail label="安全" value={log.safety_notes} />
                                <TimelineLogDetail label="风险" value={log.issue_notes} danger wide />
                              </div>
                            )}
                            {Array.isArray(log.photos) && log.photos.length > 0 && (
                              <div className="mt-3">
                                <p className="mb-2 text-xs font-semibold text-surface-500">日志现场图片</p>
                                <div className={phaseStyles.nodePhotoGrid}>
                                  {log.photos.map((photo: any, index: number) => {
                                    const url = photo.url || photo.file_url || "";
                                    const name = photo.caption || photo.file_name || `现场照片${index + 1}`;
                                    return (
                                      <a key={photo.id || `${url}_${index}`} href={url} target="_blank" rel="noreferrer" className={`${phaseStyles.nodePhotoLink} group`}>
                                        {isImageLikeFile(photo) ? (
                                          <NativeImage src={url} alt={name} />
                                        ) : (
                                          <FileText className="h-5 w-5 text-surface-400" />
                                        )}
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      }) : (
                        <div className="p-4">
                          <EmptyText text="当前节点暂无上传记录" />
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {phaseNodeModal.mode === "acceptance" && (
                <div className={phaseStyles.acceptanceReview}>
                  <div className={phaseStyles.acceptanceNotice}>
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>请逐项核对验收标准；全部通过或无需验收会标记为已验收，存在不通过时显示验收不通过。</span>
                  </div>

                  <section className={phaseStyles.acceptanceChecklist}>
                    <div className={phaseStyles.acceptanceChecklistHead}>
                      <p className={phaseStyles.acceptanceChecklistTitle}>本次需核对的验收项目</p>
                      <span className={phaseStyles.acceptanceChecklistMeta}>{phaseNodeModalNode.standardItems.length || 0} 项</span>
                    </div>
                    <div className={phaseStyles.acceptanceItemList}>
                      {phaseNodeModalNode.standardItems.length > 0 ? phaseNodeModalNode.standardItems.map((item, index) => {
                        const standardKey = getAcceptanceStandardKey(item, index);
                        const selectedResult = acceptanceReviewResults[standardKey] || "";
                        const options: Array<{ value: AcceptanceReviewChoice; label: string; icon: LucideIcon; className: string }> = [
                          { value: "PASS", label: "验收通过", icon: CheckCircle, className: phaseStyles.acceptanceChoicePass },
                          { value: "FAIL", label: "验收不通过", icon: CircleX, className: phaseStyles.acceptanceChoiceFail },
                          { value: "SKIP", label: "无需验收", icon: ShieldCheck, className: phaseStyles.acceptanceChoiceSkip },
                        ];
                        return (
                          <article key={standardKey} className={phaseStyles.acceptanceItem}>
                            <div className={phaseStyles.acceptanceItemMain}>
                              <span className={phaseStyles.acceptanceItemIndex}>{String(index + 1).padStart(2, "0")}</span>
                              <div className={phaseStyles.acceptanceItemContent}>
                                <p className={phaseStyles.acceptanceItemText}>{item.description || "未填写标准内容"}</p>
                                <div className={phaseStyles.acceptanceItemTags}>
                                  <span className={item.required ? phaseStyles.acceptanceTagRequired : phaseStyles.acceptanceTagOptional}>{item.required ? "必验" : "选验"}</span>
                                  <span className={item.photoRequired ? phaseStyles.acceptanceTagPhotoRequired : phaseStyles.acceptanceTagNeutral}>{item.photoRequired ? "需拍照" : "图片非必传"}</span>
                                </div>
                              </div>
                            </div>

                            <div className={phaseStyles.acceptanceChoiceGroup} role="radiogroup" aria-label={`第 ${index + 1} 项验收结果`}>
                              {options.map((option) => {
                                const OptionIcon = option.icon;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setAcceptanceReviewResults((results) => ({ ...results, [standardKey]: option.value }));
                                      setAcceptanceReviewMessage("");
                                    }}
                                    disabled={saving || isVirtualSite}
                                    className={`${phaseStyles.acceptanceChoiceButton} ${option.className}`}
                                    data-selected={selectedResult === option.value ? "true" : "false"}
                                    role="radio"
                                    aria-checked={selectedResult === option.value}
                                  >
                                    <OptionIcon className="h-3.5 w-3.5" />
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>

                            {item.images.length > 0 && (
                              <div className={phaseStyles.acceptanceItemImages}>
                                {item.images.map((image) => (
                                  <a key={image.id || image.url} href={image.url} target="_blank" rel="noreferrer" className={phaseStyles.acceptanceImageLink}>
                                    <NativeImage src={image.url} alt={image.caption || "验收标准图片"} className={phaseStyles.acceptanceImage} />
                                    {image.caption && <span className={phaseStyles.acceptanceImageCaption}>{image.caption}</span>}
                                  </a>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      }) : (
                        <div className="p-4">
                          <EmptyText text="该节点暂未配置标准" />
                        </div>
                      )}
                    </div>
                  </section>

                  {acceptanceReviewMessage && (
                    <p className={phaseStyles.acceptanceFeedback}>{acceptanceReviewMessage}</p>
                  )}
                </div>
              )}

	              {phaseNodeModal.mode === "log" && (
	                <div className={phaseStyles.logWorkspace}>
	                  <aside className={phaseStyles.logReferencePane}>
	                    <div className={phaseStyles.logSectionHeading}>
	                      <span className={phaseStyles.logSectionIcon}><ClipboardCheck className="h-4 w-4" /></span>
	                      <div className="min-w-0 flex-1">
	                        <p className={phaseStyles.logSectionTitle}>
	                          {phaseNodeModalNode.nodeType === "acceptance" ? "验收标准" : "工艺标准"}
	                        </p>
	                        <p className={phaseStyles.logSectionMeta}>{phaseNodeModalNode.standardItems.length || 0} 条 · 只读参考</p>
	                      </div>
	                    </div>

	                    <div className={phaseStyles.logStandardList}>
	                      {phaseNodeModalNode.standardItems.length > 0 ? phaseNodeModalNode.standardItems.map((item, index) => (
	                        <article key={item.id || index} className={phaseStyles.logStandardItem}>
	                          <div className={phaseStyles.logStandardTop}>
	                            <span className={phaseStyles.logStandardIndex}>{String(index + 1).padStart(2, "0")}</span>
	                            <div className={phaseStyles.logStandardTags}>
	                              {phaseNodeModalNode.nodeType === "acceptance" && (
	                                <span className={item.required ? phaseStyles.logTagSuccess : phaseStyles.logTagNeutral}>{item.required ? "必验" : "选验"}</span>
	                              )}
	                              <span className={item.photoRequired ? phaseStyles.logTagPrimary : phaseStyles.logTagNeutral}>
	                                {item.photoRequired ? "需拍照" : "非必传"}
	                              </span>
	                            </div>
	                          </div>
	                          <p className={phaseStyles.logStandardText}>{item.description || "未填写标准内容"}</p>
	                          {item.images.length > 0 && (
	                            <div className={phaseStyles.logStandardImages}>
	                              {item.images.map((image) => (
	                                <a key={image.id || image.url} href={image.url} target="_blank" rel="noreferrer" className={phaseStyles.logStandardImage}>
	                                  <NativeImage src={image.url} alt={image.caption || "标准图片"} className="max-h-full max-w-full object-contain" />
	                                </a>
	                              ))}
	                            </div>
	                          )}
	                        </article>
	                      )) : (
	                        <div className={phaseStyles.logEmptyStandard}>
	                          <EmptyText text={phaseNodeModalNode.nodeType === "acceptance" ? "该验收节点暂未配置验收标准" : "该施工节点暂未配置工艺标准"} />
	                        </div>
	                      )}
	                    </div>
	                  </aside>

	                  <section className={phaseStyles.logFormPane}>
	                    <div className={phaseStyles.logSectionHeading}>
	                      <span className={phaseStyles.logSectionIcon}><MessageCircle className="h-4 w-4" /></span>
	                      <div className="min-w-0 flex-1">
	                        <p className={phaseStyles.logSectionTitle}>填写施工日志</p>
	                        <p className={phaseStyles.logSectionMeta}>记录当前节点的现场进展</p>
	                      </div>
	                      <span className={phaseStyles.logRequiredTag}>必填</span>
	                    </div>

	                    {phaseNodeModalNode.logBroadcastScripts.length > 0 && (
	                      <div className={phaseStyles.logFieldGroup}>
	                        <p className={phaseStyles.logFieldLabel}>快捷话术</p>
	                        <div className={phaseStyles.logScriptList}>
	                          {phaseNodeModalNode.logBroadcastScripts.map((script) => (
	                            <button
	                              key={script}
	                              type="button"
	                              onClick={() => appendPhaseNodeCompletedPhrase(script)}
	                              className={phaseStyles.logScriptButton}
	                              title={script}
	                            >
	                              {script}
	                            </button>
	                          ))}
	                        </div>
	                      </div>
	                    )}

	                    <div className={phaseStyles.logWorkGrid}>
	                      <label className={phaseStyles.logWorkField}>
	                        <span className={phaseStyles.logFieldHeader}>
	                          <span className={phaseStyles.logFieldLabel}>今日完成</span>
	                          <span className={phaseStyles.logFieldRequired}>必填</span>
	                        </span>
	                        <textarea
	                          value={logForm.completed_work}
	                          onChange={(event) => setLogForm((form) => ({ ...form, completed_work: event.target.value }))}
	                          className={phaseStyles.logTextarea}
	                          placeholder={`填写${phaseNodeModalNode.name}今日完成事项`}
	                          disabled={saving || isVirtualSite}
	                        />
	                      </label>

	                      <label className={phaseStyles.logWorkField}>
	                        <span className={phaseStyles.logFieldHeader}>
	                          <span className={phaseStyles.logFieldLabel}>明日计划</span>
	                          <span className={phaseStyles.logFieldOptional}>选填</span>
	                        </span>
	                        <textarea
	                          value={logForm.next_plan}
	                          onChange={(event) => setLogForm((form) => ({ ...form, next_plan: event.target.value }))}
	                          className={phaseStyles.logTextarea}
	                          placeholder="填写下一步施工安排"
	                          disabled={saving || isVirtualSite}
	                        />
	                      </label>
	                    </div>

	                    <section className={phaseStyles.logPhotoSection}>
	                      <input
	                        ref={logPhotoInputRef}
	                        type="file"
	                        accept="image/*"
	                        multiple
	                        className="hidden"
	                        onChange={async (event) => {
	                          const input = event.currentTarget;
	                          const files = Array.from(input.files || []);
	                          for (const file of files) {
	                            await uploadLogPhoto(file);
	                          }
	                          input.value = "";
	                        }}
	                      />
	                      <div className={phaseStyles.logPhotoHeader}>
	                        <span className={phaseStyles.logPhotoIcon}><Camera className="h-4 w-4" /></span>
	                        <div className="min-w-0 flex-1">
	                          <p className={phaseStyles.logPhotoTitle}>现场图片</p>
	                          <p className={phaseStyles.logPhotoMeta}>{pendingLogPhotos.length > 0 ? `待发布 ${pendingLogPhotos.length} 张` : "暂未上传"}</p>
	                        </div>
	                        {pendingLogPhotos.length > 0 && (
	                          <button
	                            type="button"
	                            onClick={() => setPendingLogPhotos([])}
	                            disabled={saving || isVirtualSite}
	                            className={phaseStyles.logPhotoClearButton}
	                          >
	                            清空
	                          </button>
	                        )}
	                        <button
	                          type="button"
	                          onClick={() => logPhotoInputRef.current?.click()}
	                          disabled={Boolean(uploadingCategory) || saving || isVirtualSite}
	                          className={phaseStyles.logPhotoUploadButton}
	                        >
	                          {uploadingCategory === "施工日志" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
	                          上传图片
	                        </button>
	                      </div>
	                      {pendingLogPhotos.length > 0 && (
	                        <div className={phaseStyles.logPhotoGrid}>
	                          {pendingLogPhotos.map((photo, index) => (
	                            <div key={photo.id || photo.file_url || photo.url || index} className={phaseStyles.logPhotoItem}>
	                              <NativeImage src={photo.file_url || photo.url} alt={photo.file_name || "日志图片"} className={phaseStyles.logPhoto} />
	                              <button
	                                type="button"
	                                onClick={() => setPendingLogPhotos((photos) => photos.filter((_, photoIndex) => photoIndex !== index))}
	                                disabled={saving || isVirtualSite}
	                                className={phaseStyles.logPhotoDeleteButton}
	                                title="移除图片"
	                                aria-label={`移除第 ${index + 1} 张待发布图片`}
	                              >
	                                <X className="h-3 w-3" />
	                              </button>
	                            </div>
	                          ))}
	                        </div>
	                      )}
	                    </section>

	                    <div className={`${phaseStyles.logLocationRow} ${logForm.location_name ? phaseStyles.logLocationLocated : ""}`}>
	                      <span className={phaseStyles.logLocationIcon}><MapPin className="h-4 w-4" /></span>
	                      <div className={phaseStyles.logLocationCopy}>
	                        <p className={phaseStyles.logLocationTitle}>定位信息</p>
	                        <p className={phaseStyles.logLocationValue} title={logForm.location_address || logForm.location_name}>
	                          {logForm.location_name || "未获取定位"}
	                        </p>
	                      </div>
	                      <button
	                        type="button"
	                        onClick={getCurrentLocation}
	                        disabled={locating || saving || isVirtualSite}
	                        className={phaseStyles.logLocationButton}
	                      >
	                        {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
	                        {locating ? "定位中" : logForm.location_name ? "重定位" : "定位"}
	                      </button>
	                    </div>

	                    {logMessage && (
	                      <p className={`${phaseStyles.logFeedback} ${logMessage.includes("失败") || logMessage.includes("请") ? phaseStyles.logFeedbackError : phaseStyles.logFeedbackSuccess}`}>
	                        {logMessage}
	                      </p>
	                    )}
	                  </section>
	                </div>
	              )}

              {phaseNodeModal.mode === "issue" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      value={issueTitle}
                      onChange={(event) => setIssueTitle(event.target.value)}
                      className="input-field min-h-10"
                      placeholder={`记录${currentPhaseLabel}整改问题`}
                      disabled={saving || isVirtualSite}
                    />
                    <button
                      type="button"
                      onClick={addIssue}
                      disabled={!issueTitle.trim() || saving || isVirtualSite}
                      className="btn-primary shrink-0 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      记录
                    </button>
                  </div>
                  <div className="rounded-lg border border-surface-300 bg-white">
                    <div className="border-b border-surface-200 bg-[#f3f7ff] px-4 py-2.5 text-sm font-semibold text-[#24426f]">当前阶段整改记录</div>
                    <div className="divide-y divide-surface-100">
                      {currentPhaseOpenIssues.length > 0 ? currentPhaseOpenIssues.map((issue: any) => (
                        <div key={issue.id} className="px-4 py-3">
                          <p className="text-sm font-semibold text-surface-900">{issue.title}</p>
                          <p className="mt-1 text-xs text-surface-500">{issue.assignee_name || "未分配"}{issue.due_date ? ` · 截止 ${formatDate(issue.due_date)}` : ""}</p>
                        </div>
                      )) : (
                        <div className="p-4">
                          <EmptyText text="当前阶段暂无整改问题" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!["standard", "records"].includes(phaseNodeModal.mode) && (
            <div className={phaseNodeModal.mode === "log" ? phaseStyles.logModalFooter : phaseStyles.nodeModalFooter}>
              <button type="button" onClick={closePhaseNodeModal} className={phaseNodeModal.mode === "log" ? phaseStyles.logCancelButton : "btn-secondary min-w-[88px] justify-center"}>关闭</button>
              {phaseNodeModal.mode === "acceptance" && phaseNodeModalAdvanceAction && (
                <button
                  type="button"
                  onClick={async () => {
                    await submitAcceptanceReview();
                  }}
                  disabled={saving || isVirtualSite}
                  className="btn-primary min-w-[112px] justify-center disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  提交验收结果
                </button>
              )}
              {phaseNodeModal.mode === "log" && (
                <button
                  type="button"
                  onClick={submitPhaseNodeLog}
                  disabled={saving || isVirtualSite}
                  className={phaseStyles.logPublishButton}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                  发布日志
                </button>
              )}
            </div>
            )}
          </div>
        </div>,
        document.body,
      )}
      {renamingArchiveFile && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-surface-900/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.25)]">
            <div className="flex items-center justify-between border-b border-surface-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-surface-900">修改资料名称</h3>
                <p className="mt-1 text-xs text-surface-500">仅修改列表展示名称，不改变原文件内容。</p>
              </div>
              <button
                type="button"
                onClick={() => setRenamingArchiveFile(null)}
                className="rounded p-1.5 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
                disabled={archiveRenameSaving}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-surface-700">资料名称</span>
                <input
                  value={archiveRenameName}
                  onChange={(event) => setArchiveRenameName(event.target.value)}
                  className="input-field"
                  placeholder="请输入资料名称"
                  maxLength={100}
                  autoFocus
                  disabled={archiveRenameSaving}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveArchiveRename();
                  }}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-surface-200 bg-surface-50 px-5 py-3">
              <button type="button" onClick={() => setRenamingArchiveFile(null)} disabled={archiveRenameSaving} className="btn-secondary">
                取消
              </button>
              <button type="button" onClick={saveArchiveRename} disabled={archiveRenameSaving} className="btn-primary min-w-[96px] justify-center">
                {archiveRenameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      {sharingArchiveFile && (
        <div className="fixed inset-0 z-[86] flex items-center justify-center bg-surface-900/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4 border-b border-surface-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-surface-900">分享在线链接</h3>
                <p className="mt-1 truncate text-xs text-surface-500" title={sharingArchiveFile.file_name}>
                  {sharingArchiveFile.file_name || "在线链接"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSharingArchiveFile(null)}
                className="rounded p-1.5 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
                disabled={archiveShareLoading || archiveShareLookupLoading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 bg-surface-50/60 px-5 py-4">
              <div className="rounded-lg border border-surface-200 bg-white p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">设置有效期</p>
                    <p className="mt-0.5 text-xs text-surface-500">到期后，分享出去的链接将无法继续打开。</p>
                  </div>
                  <button
                    type="button"
                    onClick={createArchiveShareLink}
                    disabled={archiveShareLoading || archiveShareLookupLoading}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary-700 px-3 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
                  >
                    {archiveShareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    {archiveShareLink ? "重新生成" : "生成分享"}
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {archiveShareOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setArchiveShareExpiresIn(option.value);
                        setArchiveShareMessage("");
                      }}
                      className={`h-9 rounded-lg border text-sm font-semibold transition ${
                        archiveShareExpiresIn === option.value
                          ? "border-primary-300 bg-primary-50 text-primary-700"
                          : "border-surface-200 bg-white text-surface-600 hover:border-primary-200 hover:text-primary-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {archiveShareLookupLoading ? (
                <div className="rounded-lg border border-dashed border-surface-300 bg-white px-4 py-8 text-center">
                  <Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin text-primary-600" />
                  <p className="text-sm font-semibold text-surface-700">正在读取上一次分享...</p>
                </div>
              ) : archiveShareLink ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_172px]">
                  <div className="min-w-0 space-y-3 rounded-lg border border-surface-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-surface-900">
                        <Link2 className="h-4 w-4 text-primary-600" />
                        分享链接
                      </p>
                      <span className="text-xs text-surface-500">有效期：{formatShareExpiresAt(archiveShareExpiresAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-surface-700" title={archiveShareLink}>
                        {archiveShareLink}
                      </span>
                      <button
                        type="button"
                        onClick={copyArchiveShareLink}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary-700 px-2.5 text-xs font-semibold text-white hover:bg-primary-800"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        复制
                      </button>
                    </div>
                    {archiveShareMessage && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-primary-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {archiveShareMessage}
                      </p>
                    )}
                  </div>
                  <div className="min-w-[172px] rounded-lg border border-surface-200 bg-white p-3 text-center">
                    <p className="mb-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-surface-900">
                      <QrCode className="h-4 w-4 text-primary-600" />
                      二维码
                    </p>
                    <NativeImage src={makeQrCodeUrl(archiveShareLink, 180)} alt="在线链接分享二维码" className="mx-auto h-[132px] w-[132px] rounded-md border border-surface-100 bg-white p-1" />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-surface-300 bg-white px-4 py-5 text-center">
                  <QrCode className="mx-auto mb-2 h-7 w-7 text-surface-300" />
                  <p className="text-sm font-semibold text-surface-700">选择有效期后生成分享链接</p>
                  <p className="mt-1 text-xs text-surface-500">生成后可复制链接，也可以让客户直接扫码打开。</p>
                  {archiveShareMessage && <p className="mt-2 text-xs font-medium text-red-600">{archiveShareMessage}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {vrBuilderOpen && (
        <div className="vr-builder-overlay fixed inset-0 z-[80] flex items-center justify-center bg-[#172033]/35 px-4 py-6">
          <div className="vr-builder-modal-v2 flex max-h-[calc(100dvh-48px)] w-full max-w-[800px] flex-col overflow-hidden border border-[#E2E8F0] bg-white" role="dialog" aria-modal="true" aria-labelledby="vr-builder-dialog-title">
            <header className="vr-builder-modal-header flex min-h-[72px] items-center justify-between gap-4 border-b border-[#E8EDF5] px-6 py-3.5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="vr-builder-title-icon flex h-10 w-10 shrink-0 items-center justify-center">
                  <Link2 className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <h3 id="vr-builder-dialog-title" className="text-base font-semibold leading-6 text-[#162033]">{editingVrTourId ? "编辑水电VR全景链接" : "生成水电VR全景链接"}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#6F7F96]">{editingVrTourId ? "修改 VR 名称、空间名称和空间图片，保存后原链接继续可用。" : "按空间上传 2:1 全景图片，生成后可直接打开链接切换空间查看。"}</p>
                </div>
              </div>
              <button type="button" onClick={() => setVrBuilderOpen(false)} className="vr-builder-close-button flex h-9 w-9 shrink-0 items-center justify-center text-[#8A98AC] transition hover:bg-[#F3F6FA] hover:text-[#34445A]" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </header>

            <main className="vr-builder-modal-body min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <label className="vr-builder-name-field block">
                <span className="mb-2 block text-[13px] font-semibold text-[#34445A]">VR名称</span>
                <input
                  value={vrTitle}
                  onChange={(event) => setVrTitle(event.target.value)}
                  className="vr-builder-input input-field"
                  placeholder={`${siteDisplayName}水电VR全景`}
                  disabled={vrGenerating}
                />
              </label>

              <section className="vr-builder-scene-panel mt-5">
                <header className="vr-builder-scene-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-[#E8EDF5] pb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#162033]">空间列表</p>
                    <p className="mt-0.5 text-xs text-[#6F7F96]">每个空间填写名称并上传一张 2:1 全景图。</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="vr-builder-scene-count text-xs font-medium text-[#6F7F96]">已添加 {vrScenes.length} 个空间</span>
                    <button type="button" onClick={addVrScene} disabled={vrGenerating} className="vr-builder-add-button inline-flex h-9 items-center gap-1.5 border border-[#DCE6F2] bg-white px-3 text-[13px] font-semibold text-[#34445A] transition hover:border-[#CFE0FF] hover:bg-[#F4F8FF] hover:text-[#407AFF] disabled:opacity-50">
                      <Plus className="h-4 w-4" />
                      添加空间
                    </button>
                  </div>
                </header>
                <div className="vr-builder-scene-list mt-3 space-y-2.5">
                  {vrScenes.map((scene, index) => (
                    <article key={scene.id} className="vr-builder-scene-row grid items-end gap-3 border border-[#E8EDF5] bg-[#F8FAFC] px-3.5 py-3 md:grid-cols-[156px_minmax(0,1fr)_40px]">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#6F7F96]">空间名称</span>
                        <input
                          value={scene.name}
                          onChange={(event) => updateVrScene(scene.id, { name: event.target.value })}
                          className="vr-builder-input input-field min-h-10 py-2"
                          placeholder={`空间${index + 1}`}
                          disabled={vrGenerating}
                        />
                      </label>
                      <div className="vr-builder-upload-field min-w-0">
                        <span className="mb-1.5 block text-xs font-semibold text-[#6F7F96]">全景图片</span>
                        <label className="vr-builder-upload-card flex h-10 cursor-pointer items-center gap-2.5 border border-dashed border-[#CBD7EA] bg-white px-2.5 transition hover:border-[#407AFF] hover:bg-[#F2F6FF]">
                          {scene.previewUrl ? (
                            <NativeImage src={scene.previewUrl} alt={scene.name || "全景图"} className="h-8 w-16 shrink-0 border border-[#E2E8F0] object-cover" loading="eager" />
                          ) : (
                            <span className="flex h-8 w-10 shrink-0 items-center justify-center border border-[#E2E8F0] bg-[#F8FAFC] text-[#AAB6C7]">
                              <ImageIcon className="h-4 w-4" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#34445A]">{scene.file?.name || scene.existingFileName || "选择全景图片"}</span>
                          <span className="hidden shrink-0 text-xs text-[#7C8AA0] sm:block">JPG / PNG / WebP · 2:1</span>
                          <Upload className="h-4 w-4 shrink-0 text-[#407AFF]" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={vrGenerating}
                            onChange={(event) => chooseVrSceneFile(scene.id, event.target.files?.[0])}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVrScene(scene.id)}
                        disabled={vrGenerating || vrScenes.length <= 1}
                        className="vr-builder-delete-button inline-flex h-10 w-10 items-center justify-center border border-transparent text-[#8A98AC] transition hover:border-red-100 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        title="删除空间"
                        aria-label={`删除${scene.name || `空间${index + 1}`}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              {archiveMessage && (
                <p className={`mt-3 border px-3 py-2 text-xs font-semibold ${archiveMessage.includes("失败") || archiveMessage.includes("请") ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
                  {archiveMessage}
                </p>
              )}
            </main>

            <footer className="vr-builder-modal-footer flex min-h-[64px] items-center justify-end gap-2 border-t border-[#E8EDF5] bg-[#F8FAFC] px-6 py-3">
              <button type="button" onClick={() => setVrBuilderOpen(false)} disabled={vrGenerating} className="vr-builder-secondary-button btn-secondary">
                取消
              </button>
              <button type="button" onClick={generateVrTour} disabled={vrGenerating} className="vr-builder-primary-button btn-primary min-w-[132px] justify-center">
                {vrGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {editingVrTourId ? "保存修改" : "生成链接"}
              </button>
            </footer>
          </div>
        </div>
      )}
      {constructionTemplatePickerOpen && (
        <div
          className="fixed inset-0 z-[88] flex items-center justify-center bg-surface-900/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => {
            setConstructionTemplatePickerOpen(false);
            setConstructionTemplateSearch("");
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-construction-template-picker-title"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <h3 id="site-construction-template-picker-title" className="flex items-center gap-2 text-base font-semibold text-surface-900">
                  <ClipboardList className="h-4 w-4 text-primary-600" />
                  选择施工模板
                </h3>
                <p className="mt-1 text-xs text-surface-500">
                  {constructionTemplateOptions.length > 0 ? `共 ${filteredConstructionTemplateOptions.length} 个可选模板` : "从分公司设置中读取已启用的施工模板"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConstructionTemplatePickerOpen(false);
                  setConstructionTemplateSearch("");
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 transition hover:border-surface-300 hover:bg-surface-50 hover:text-surface-900"
                aria-label="关闭施工模板选择"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-surface-200 bg-surface-50 px-5 py-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input
                  value={constructionTemplateSearch}
                  onChange={(event) => setConstructionTemplateSearch(event.target.value)}
                  className="input-field h-10 min-h-10 py-0 pl-9 pr-3"
                  placeholder="搜索模板名称、类型、阶段或工期"
                  autoFocus
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface-50/70 px-4 py-4">
              {constructionTemplateLoading ? (
                <div className="flex min-h-[160px] items-center justify-center">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-surface-500">
                    <Loader2 className="h-4 w-4 animate-spin text-primary-700" />
                    正在读取施工模板
                  </span>
                </div>
              ) : constructionTemplateError ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold text-red-600">{constructionTemplateError}</p>
                  <button
                    type="button"
                    onClick={() => loadConstructionTemplateOptions({ force: true })}
                    className="mt-3 inline-flex h-8 items-center justify-center rounded-md border border-red-100 bg-red-50 px-3 text-xs font-semibold text-red-600 transition hover:border-red-200 hover:bg-red-100"
                  >
                    重新加载
                  </button>
                </div>
              ) : constructionTemplateOptions.length === 0 ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold text-surface-700">暂无可用施工模板</p>
                  <p className="mt-1 text-xs text-surface-500">请先到分公司设置维护并启用施工模板。</p>
                </div>
              ) : filteredConstructionTemplateOptions.length === 0 ? (
                <div className="flex min-h-[160px] items-center justify-center text-sm font-semibold text-surface-500">
                  没有匹配的施工模板
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredConstructionTemplateOptions.map((template) => {
                    const isSelected = selectedHandoverConstructionTemplate?.id
                      ? selectedHandoverConstructionTemplate.id === template.id
                      : selectedHandoverConstructionTemplate?.name === template.name;
                    const templateMeta = [
                      template.decorationType || "未设置装修类型",
                      template.durationText || "未设置工期",
                    ].filter(Boolean).join(" · ");
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => selectConstructionTemplate(template)}
                        className={`group w-full overflow-hidden rounded-lg border text-left transition ${
                          isSelected
                            ? "border-primary-200 bg-white"
                            : "border-surface-200 bg-white hover:border-primary-100 hover:bg-white"
                        }`}
                      >
                        <div className="flex min-w-0">
                          <span className={`w-1 shrink-0 transition ${isSelected ? "bg-primary-600" : "bg-transparent group-hover:bg-primary-200"}`} />
                          <div className="min-w-0 flex-1 px-4 py-3">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <p className="max-w-full truncate text-sm font-semibold text-surface-900" title={template.name}>{template.name}</p>
                                  {template.isDefault ? (
                                    <span className="shrink-0 rounded-md border border-primary-100 bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">默认</span>
                                  ) : null}
                                </div>
                                <p className="mt-1 truncate text-xs font-medium text-surface-500" title={templateMeta}>{templateMeta}</p>
                              </div>
                              <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold ${
                                isSelected
                                  ? "bg-primary-50 text-primary-700"
                                  : "border border-surface-200 bg-white text-surface-500 group-hover:border-primary-200 group-hover:text-primary-700"
                              }`}>
                                {isSelected ? <CheckCircle className="h-3.5 w-3.5" /> : null}
                                {isSelected ? "已选" : "选择"}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-1 text-xs text-surface-400" title={template.description || undefined}>{template.description || "无模板说明"}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              {[
                                ["阶段", template.stageCount],
                                ["节点", template.nodeCount],
                                ["验收", template.acceptanceCount],
                              ].map(([label, value]) => (
                                <span key={label} className="inline-flex items-center gap-1 text-surface-500">
                                  <span>{label}</span>
                                  <span className="font-semibold tabular-nums text-surface-900">{value}</span>
                                </span>
                              ))}
                              <span className="inline-flex min-w-0 items-center gap-1 text-surface-500">
                                <span>工期</span>
                                <span className="max-w-[160px] truncate font-semibold text-surface-900" title={template.durationText || "未设置"}>{template.durationText || "未设置"}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-surface-200 bg-white px-5 py-3">
              <p className="min-w-0 truncate text-xs font-semibold text-surface-500">
                当前选择：{selectedHandoverConstructionTemplate?.name || "未选择施工模板"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setConstructionTemplatePickerOpen(false);
                  setConstructionTemplateSearch("");
                }}
                className="btn-secondary h-9 min-h-9 px-3 py-0 text-xs"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      <ContractSummaryModal
        contract={summaryContract}
        currentUserId={user?.id}
        onClose={() => setSummaryContract(null)}
      />
      {materialImagePreview && (
        <div
          className="pointer-events-none fixed z-[90] w-[240px] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.22)]"
          style={{
            left: Math.min(materialImagePreview.x + 18, (typeof window === "undefined" ? 1200 : window.innerWidth) - 260),
            top: Math.min(materialImagePreview.y + 18, (typeof window === "undefined" ? 900 : window.innerHeight) - 300),
          }}
        >
          <div className="aspect-square bg-surface-50">
            <NativeImage src={materialImagePreview.src} alt={materialImagePreview.name} className="h-full w-full object-contain" loading="eager" />
          </div>
          <div className="border-t border-surface-200 px-3 py-2">
            <p className="truncate text-xs font-semibold text-surface-900">{materialImagePreview.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs font-medium text-surface-500">{materialImagePreview.spec || "未填写规格"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
