"use client";

import { useRouter } from "next/navigation";
import { Fragment, type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, GripVertical,
  Activity, ClipboardList, Hammer, Loader2, MapPin, RotateCcw, Search, SlidersHorizontal, UserRound, X,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import { SystemResourceTable } from "@/components/ui/SystemResourceTable";
import SystemStatusFilter from "@/components/ui/SystemStatusFilter";
import SystemSelect from "@/components/ui/SystemSelect";
import SystemDateInput from "@/components/ui/SystemDateInput";
import NativeImage from "@/components/ui/NativeImage";
import styles from "./site.module.css";

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

type SiteStatusFilterItem = {
  value: string;
  label: string;
  filterStage: string | null;
  group: "project" | "construction";
  count?: number;
};

type ConstructionStageFilterOption = {
  value: string;
  label: string;
  count: number;
};

type ConstructionRecordReport = {
  id: string;
  title: string;
  content: string | null;
  completed_work: string | null;
  next_plan: string | null;
  operator_name: string | null;
  location_name: string | null;
  created_at: string | null;
  photos?: {
    id?: string | null;
    url?: string | null;
    file_url?: string | null;
    file_name?: string | null;
    caption?: string | null;
  }[];
};

const statusFilter: SiteStatusFilterItem[] = [
  { value: "all", label: "全部", filterStage: null, group: "project" },
  { value: "PENDING_START", label: "待开工", filterStage: "PENDING_START", group: "project" },
  { value: "START_CONFIRM", label: "开工确认", filterStage: "START_CONFIRM", group: "project" },
  { value: "CONSTRUCTION", label: "施工中", filterStage: "CONSTRUCTION", group: "project" },
  { value: "OWNER_SETTLEMENT", label: "业主结算", filterStage: "OWNER_SETTLEMENT", group: "project" },
  { value: "SITE_SETTLEMENT", label: "工地结算", filterStage: "SITE_SETTLEMENT", group: "project" },
];

type SiteListResponse = {
  projects: any[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts?: Record<string, number>;
  constructionStageOptions?: ConstructionStageFilterOption[];
  storeOptions?: string[];
  managerOptions?: string[];
};

type SiteListMeta = Required<Pick<SiteListResponse, "statusCounts" | "constructionStageOptions" | "storeOptions" | "managerOptions">>;

type ConstructionRecordListRow = {
  id: string;
  node_name: string;
  node_type_label: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  stage_name: string | null;
  manager_report_count: number;
  worker_report_count: number;
  worker_names: string | null;
  issue_count: number;
  latest_record_at: string | null;
  manager_reports?: ConstructionRecordReport[];
  worker_reports?: ConstructionRecordReport[];
};

type ConstructionRecordListResponse = {
  project: any;
  rows: ConstructionRecordListRow[];
};

const siteColumnKeys = [
  "index",
  "room",
  "customer",
  "financeNo",
  "contract",
  "designer",
  "store",
  "manager",
  "projectStage",
  "constructionStage",
  "recordCount",
  "latestNode",
  "latestReportAt",
  "startDate",
  "contractDuration",
  "usedDuration",
  "siteType",
  "monitor",
  "amount",
  "area",
  "risk",
] as const;

type SiteColumnKey = typeof siteColumnKeys[number];
type SiteColumnAlignment = "left" | "center" | "right";
type SiteColumnDropSide = "before" | "after";
type SiteColumnDefinition = {
  label: string;
  className: string;
  align?: SiteColumnAlignment;
};

const SITE_COLUMN_ORDER_STORAGE_KEY = "zxgj_site_list_column_order";

const siteColumnDefinitions: Record<SiteColumnKey, SiteColumnDefinition> = {
  index: { label: "序号", className: styles.colIndex, align: "center" },
  room: { label: "房号", className: styles.colRoom },
  customer: { label: "客户姓名", className: styles.colCustomer },
  financeNo: { label: "财务编号", className: styles.colFinanceNo },
  contract: { label: "合同编号", className: styles.colContract },
  designer: { label: "设计师", className: styles.colDesigner },
  store: { label: "所属分店", className: styles.colStore },
  manager: { label: "项目经理", className: styles.colManager },
  projectStage: { label: "工程阶段", className: styles.colProjectStage, align: "center" },
  constructionStage: { label: "施工阶段", className: styles.colConstructionStage, align: "center" },
  recordCount: { label: "施工记录", className: styles.colRecordCount, align: "center" },
  latestNode: { label: "最新施工节点", className: styles.colLatestNode },
  latestReportAt: { label: "最新汇报时间", className: styles.colDateTime, align: "center" },
  startDate: { label: "开工时间", className: styles.colDate, align: "center" },
  contractDuration: { label: "合同工期", className: styles.colDuration, align: "center" },
  usedDuration: { label: "已用工期", className: styles.colDuration, align: "center" },
  siteType: { label: "工地类型", className: styles.colSiteType, align: "center" },
  monitor: { label: "是否有监控", className: styles.colMonitor, align: "center" },
  amount: { label: "合同额", className: styles.colAmount, align: "right" },
  area: { label: "面积", className: styles.colArea, align: "right" },
  risk: { label: "风险", className: styles.colRisk, align: "center" },
};

function isSiteColumnKey(value: string): value is SiteColumnKey {
  return siteColumnKeys.includes(value as SiteColumnKey);
}

function normalizeSiteColumnOrder(value: unknown): SiteColumnKey[] {
  const raw = Array.isArray(value) ? value : [];
  const selected = raw.filter((item): item is SiteColumnKey => typeof item === "string" && isSiteColumnKey(item));
  const uniqueSelected = Array.from(new Set(selected));
  const missing = siteColumnKeys.filter((key) => !uniqueSelected.includes(key));
  return [...uniqueSelected, ...missing];
}

function getInitialSiteColumnOrder() {
  if (typeof window === "undefined") return [...siteColumnKeys];
  try {
    return normalizeSiteColumnOrder(JSON.parse(window.localStorage.getItem(SITE_COLUMN_ORDER_STORAGE_KEY) || "[]"));
  } catch {
    return [...siteColumnKeys];
  }
}

function isOverdue(date?: string | null) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date).getTime() < today.getTime();
}

function formatPlainAmount(value: number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatSiteDate(value?: string | null) {
  return formatDate(value);
}

function formatSiteDateTime(value?: string | null) {
  return value ? formatDateTime(value) : "-";
}

function getSiteDurationDays(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

function getContractDurationDays(project: any) {
  return Math.ceil(Number(project?.contract_duration_days || project?.handover_duration_days || 0) || 0)
    || getSiteDurationDays(project?.start_date, project?.planned_end_date);
}

function getUsedDurationDays(project: any) {
  if (!project?.start_date) return 0;
  const startDate = new Date(project.start_date);
  if (Number.isNaN(startDate.getTime())) return 0;
  const rawEnd = project.actual_end_date || (["COMPLETED", "CLOSED"].includes(String(project.status || "").toUpperCase()) ? project.planned_end_date : null);
  const endDate = rawEnd ? new Date(rawEnd) : new Date();
  if (Number.isNaN(endDate.getTime())) return 0;
  return Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

function formatDurationText(days: number) {
  return days > 0 ? `${days}天` : "-";
}

function normalizeRoomPart(value: string | null | undefined, suffixes: string[]) {
  const cleaned = value?.trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

function buildSiteRoomNumber(project: any) {
  if (project?.customer_no_room_number === true || project?.customer_no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(project?.customer_building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(project?.customer_unit_no, ["单元"]);
  const room = normalizeRoomPart(project?.customer_room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

function getSiteRoomDisplay(project: any) {
  const community = String(project?.customer_address || project?.address || "").trim();
  const roomNumber = buildSiteRoomNumber(project);
  if (community && roomNumber && roomNumber !== "暂无房号") return `${community}${roomNumber}`;
  return community || String(project?.customer_house_address || project?.site_name || project?.display_name || project?.name || "").trim() || "-";
}

function getStaffInitial(name?: string | null) {
  return String(name || "人").trim().slice(0, 1) || "人";
}

function SiteStaffCell({ name, avatar }: { name?: string | null; avatar?: string | null }) {
  const displayName = String(name || "").trim();
  if (!displayName) return <span className={styles.valueCell}>-</span>;
  return (
    <span className={styles.staffCell} title={displayName}>
      <span className={styles.staffAvatar} aria-hidden="true">
        {avatar ? (
          <NativeImage src={avatar} alt={`${displayName}头像`} className="h-full w-full object-cover" />
        ) : (
          getStaffInitial(displayName)
        )}
      </span>
      <span className={styles.staffName}>{displayName}</span>
    </span>
  );
}

function getConstructionStageDisplay(project: any) {
  const siteStage = String(project?.site_stage || "").trim();
  if (siteStage === "PENDING_START") return "待开工";
  if (siteStage === "START_CONFIRM") return "开工确认";
  if (siteStage === "OWNER_SETTLEMENT") return "业主结算";
  if (siteStage === "SITE_SETTLEMENT") return "工地结算";

  const stageName = String(project?.construction_stage_name || project?.current_phase_name || project?.active_phase_name || "").trim();
  if (stageName) return stageName;
  const phaseKey = String(project?.current_phase || "").trim();
  if (constructionPhaseLabels[phaseKey]) return constructionPhaseLabels[phaseKey];
  if (/[\u4e00-\u9fa5]/.test(phaseKey)) return phaseKey;
  return siteStageLabels[project?.site_stage] || statusLabels[project?.status] || "-";
}

const siteTagTones = {
  neutral: "border-[#D9E0EA] bg-[#F8FAFC] text-[#475467]",
  blue: "border-[#C9DAF8] bg-[#F5F8FF] text-[#315A9A]",
  indigo: "border-[#D8DDF4] bg-[#F7F8FE] text-[#49558F]",
  cyan: "border-[#B9E2E8] bg-[#F4FBFC] text-[#286E78]",
  teal: "border-[#B9DFD8] bg-[#F5FAF8] text-[#2F6F65]",
  green: "border-[#C8E6D4] bg-[#F5FBF7] text-[#16684B]",
  amber: "border-[#EAD8A1] bg-[#FFFAF0] text-[#8A5B12]",
  orange: "border-[#EBC7AB] bg-[#FFF8F3] text-[#9A4B1F]",
  rose: "border-[#EFC4CF] bg-[#FFF7F9] text-[#9B344F]",
  violet: "border-[#DED3EF] bg-[#FAF8FE] text-[#65518C]",
  red: "border-[#F1C7C0] bg-[#FFF7F5] text-[#A64235]",
};

const constructionStageBadgePalette = [
  { className: siteTagTones.teal },
  { className: siteTagTones.cyan },
  { className: siteTagTones.cyan },
  { className: siteTagTones.teal },
  { className: siteTagTones.green },
  { className: siteTagTones.amber },
  { className: siteTagTones.orange },
  { className: siteTagTones.rose },
  { className: siteTagTones.violet },
  { className: siteTagTones.indigo },
];

const pendingStartConstructionStageTone = { className: siteTagTones.neutral };
const startConfirmConstructionStageTone = { className: siteTagTones.indigo };

function getSiteStageBadgeTone(project: any) {
  const stage = String(project?.site_stage || "").trim();
  if (stage === "PENDING_START") return siteTagTones.neutral;
  if (stage === "START_CONFIRM") return siteTagTones.indigo;
  if (stage === "CONSTRUCTION") return siteTagTones.teal;
  if (stage === "OWNER_SETTLEMENT") return siteTagTones.amber;
  if (stage === "SITE_SETTLEMENT") return siteTagTones.green;
  return project?.status === "COMPLETED" || project?.status === "CLOSED" ? siteTagTones.green : siteTagTones.neutral;
}

function normalizeConstructionStageName(value: string) {
  return value.trim().replace(/[\s·・\-_/（）()【】[\]：:，,。.;；]/g, "");
}

function getConstructionStageBadgeTone(project: any, displayName = "") {
  const stageName = normalizeConstructionStageName(displayName || getConstructionStageDisplay(project));
  if (stageName.includes("待开工")) return pendingStartConstructionStageTone;
  if (stageName.includes("开工交底")) return constructionStageBadgePalette[5];
  if (stageName.includes("开工确认")) return startConfirmConstructionStageTone;
  if (stageName.includes("拆改") || stageName.includes("拆除")) return constructionStageBadgePalette[7];
  if (stageName.includes("水电")) return constructionStageBadgePalette[1];
  if (stageName.includes("泥瓦") || stageName.includes("瓦工") || stageName.includes("防水") || stageName.includes("贴砖")) return constructionStageBadgePalette[6];
  if (stageName.includes("木工") || stageName.includes("木作")) return constructionStageBadgePalette[9];
  if (stageName.includes("油漆") || stageName.includes("涂装") || stageName.includes("乳胶漆")) return constructionStageBadgePalette[8];
  if (stageName.includes("安装")) return constructionStageBadgePalette[2];
  if (stageName.includes("软装")) return constructionStageBadgePalette[3];
  if (stageName.includes("验收") || stageName.includes("竣工")) return constructionStageBadgePalette[4];
  if (stageName.includes("结算")) return constructionStageBadgePalette[4];

  const stage = String(project?.site_stage || "").trim();
  if (stage === "PENDING_START") {
    return pendingStartConstructionStageTone;
  }
  if (stage === "START_CONFIRM") {
    return startConfirmConstructionStageTone;
  }
  if (stage === "OWNER_SETTLEMENT" || stage === "SITE_SETTLEMENT") {
    return constructionStageBadgePalette[4];
  }

  const hashKey = stageName || stage || "default";
  const hash = Array.from(hashKey).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return constructionStageBadgePalette[hash % constructionStageBadgePalette.length];
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

function buildSiteListUrl({
  page,
  pageSize,
  search,
  status,
  storeFilter,
  constructionStageFilter,
  managerFilter,
  riskFilter,
  plannedEndFrom,
  plannedEndTo,
  includeMeta = true,
}: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  storeFilter: string;
  constructionStageFilter: string;
  managerFilter: string;
  riskFilter: string;
  plannedEndFrom: string;
  plannedEndTo: string;
  includeMeta?: boolean;
}) {
  const params = new URLSearchParams({
    mode: "list",
    page: String(page),
    pageSize: String(pageSize),
    status,
  });
  const append = (key: string, value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) params.set(key, trimmed);
  };
  append("search", search);
  append("store", storeFilter);
  append("constructionStage", constructionStageFilter);
  append("manager", managerFilter);
  append("risk", riskFilter);
  append("plannedEndFrom", plannedEndFrom);
  append("plannedEndTo", plannedEndTo);
  if (!includeMeta) params.set("includeMeta", "0");
  return `/api/site?${params.toString()}`;
}

function buildSiteListMetaUrl(options: Parameters<typeof buildSiteListUrl>[0]) {
  const listUrl = buildSiteListUrl({ ...options, page: 1, pageSize: 1, includeMeta: true });
  const [path, query = ""] = listUrl.split("?");
  const params = new URLSearchParams(query);
  params.set("mode", "list-meta");
  params.delete("page");
  params.delete("pageSize");
  params.delete("includeMeta");
  return `${path}?${params.toString()}`;
}

async function fetchSiteList(url: string, signal?: AbortSignal): Promise<SiteListResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : null;
  const res = await fetch(url, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "工地列表加载失败");
  }
  return res.json();
}

async function fetchSiteListMeta(url: string, signal?: AbortSignal): Promise<SiteListMeta> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : null;
  const res = await fetch(url, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("工地筛选数据加载失败");
  return res.json();
}

async function fetchConstructionRecordList(projectId: string, signal?: AbortSignal): Promise<ConstructionRecordListResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : null;
  const params = new URLSearchParams({ mode: "construction-record-list", project_id: projectId });
  const res = await fetch(`/api/site?${params.toString()}`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "施工记录加载失败");
  return data;
}

function moveColumnWithPlacement(
  columns: SiteColumnKey[],
  sourceColumn: SiteColumnKey,
  targetColumn: SiteColumnKey,
  side: SiteColumnDropSide,
) {
  const withoutSource = columns.filter((column) => column !== sourceColumn);
  const targetIndex = withoutSource.indexOf(targetColumn);
  if (targetIndex < 0) return columns;
  const insertIndex = side === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...withoutSource.slice(0, insertIndex),
    sourceColumn,
    ...withoutSource.slice(insertIndex),
  ];
}

function getConstructionRecordStatusMeta(status: string, nodeTypeLabel = "") {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "COMPLETED") {
    return {
      label: String(nodeTypeLabel || "").includes("验收") ? "已验收" : "已完工",
      className: siteTagTones.green,
    };
  }
  if (normalized === "REVIEW") return { label: "待确认", className: siteTagTones.amber };
  if (normalized === "IN_PROGRESS") return { label: "进行中", className: siteTagTones.blue };
  return { label: "待开始", className: siteTagTones.neutral };
}

function getVisibleRecordReportText(value: unknown) {
  return String(value || "").trim().replace(/^【[^】]+】\s*/, "");
}

function formatRecordDateRange(start?: string | null, end?: string | null, fallback = "-") {
  const startText = start ? formatSiteDate(start) : "";
  const endText = end ? formatSiteDate(end) : "";
  if (startText && endText) return startText === endText ? startText : `${startText}-${endText}`;
  if (startText) return `${startText}-进行中`;
  if (endText) return endText;
  return fallback;
}

function getRecordDelayMeta(row: ConstructionRecordListRow) {
  if (!row.planned_end) return { label: "未设置", className: siteTagTones.neutral };
  const plannedEnd = new Date(row.planned_end);
  if (Number.isNaN(plannedEnd.getTime())) return { label: "未设置", className: siteTagTones.neutral };
  plannedEnd.setHours(23, 59, 59, 999);

  const actualEnd = row.actual_end ? new Date(row.actual_end) : null;
  const compareDate = actualEnd && !Number.isNaN(actualEnd.getTime()) ? actualEnd : new Date();
  const isFinished = String(row.status || "").toUpperCase() === "COMPLETED";
  const delayed = compareDate.getTime() > plannedEnd.getTime();
  if (delayed) return { label: isFinished ? "已延期" : "延期中", className: siteTagTones.red };
  return { label: "未延期", className: siteTagTones.green };
}

export default function SiteListPage() {
  const router = useRouter();
  const [data, setData] = useState<SiteListResponse | null>(null);
  const [siteMeta, setSiteMeta] = useState<{ key: string; data: SiteListMeta } | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [storeFilter, setStoreFilter] = useState("");
  const [constructionStageFilter, setConstructionStageFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [plannedEndFrom, setPlannedEndFrom] = useState("");
  const [plannedEndTo, setPlannedEndTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [openingSiteId, setOpeningSiteId] = useState<string | null>(null);
  const [recordModalProject, setRecordModalProject] = useState<any | null>(null);
  const [recordModalRows, setRecordModalRows] = useState<ConstructionRecordListRow[]>([]);
  const [recordModalLoading, setRecordModalLoading] = useState(false);
  const [recordModalError, setRecordModalError] = useState("");
  const [recordReportDetailRow, setRecordReportDetailRow] = useState<ConstructionRecordListRow | null>(null);
  const [columnOrder, setColumnOrder] = useState<SiteColumnKey[]>(getInitialSiteColumnOrder);
  const [draggingColumn, setDraggingColumn] = useState<SiteColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<SiteColumnKey | null>(null);
  const [dragOverSide, setDragOverSide] = useState<SiteColumnDropSide>("before");
  const loadedSiteMetaUrl = useRef<string | null>(null);
  const recordModalAbortRef = useRef<AbortController | null>(null);
  const columnAutoScrollRef = useRef<{ frame: number | null; element: HTMLElement | null; speed: number }>({
    frame: null,
    element: null,
    speed: 0,
  });
  const debouncedSearch = useDebouncedValue(search, 300);
  const siteFilterKey = useMemo(() => [
    status,
    debouncedSearch,
    storeFilter,
    constructionStageFilter,
    managerFilter,
    riskFilter,
    plannedEndFrom,
    plannedEndTo,
  ].join("|"), [constructionStageFilter, debouncedSearch, managerFilter, plannedEndFrom, plannedEndTo, riskFilter, status, storeFilter]);
  const lastSiteFilterKey = useRef(siteFilterKey);
  const effectivePage = lastSiteFilterKey.current === siteFilterKey ? page : 1;

  const currentListUrl = useMemo(() => buildSiteListUrl({
    page: effectivePage,
    pageSize,
    search: debouncedSearch,
    status,
    storeFilter,
    constructionStageFilter,
    managerFilter,
    riskFilter,
    plannedEndFrom,
    plannedEndTo,
    includeMeta: false,
  }), [constructionStageFilter, debouncedSearch, effectivePage, managerFilter, pageSize, plannedEndFrom, plannedEndTo, riskFilter, status, storeFilter]);

  const currentMetaUrl = useMemo(() => buildSiteListMetaUrl({
    page: 1,
    pageSize: 1,
    search: debouncedSearch,
    status: "all",
    storeFilter,
    constructionStageFilter: "",
    managerFilter,
    riskFilter,
    plannedEndFrom,
    plannedEndTo,
  }), [debouncedSearch, managerFilter, plannedEndFrom, plannedEndTo, riskFilter, storeFilter]);

  const reloadSiteMeta = useCallback(async () => {
    if (loadedSiteMetaUrl.current === currentMetaUrl) return;
    loadedSiteMetaUrl.current = currentMetaUrl;
    try {
      const meta = await fetchSiteListMeta(currentMetaUrl);
      setSiteMeta({ key: currentMetaUrl, data: meta });
    } catch {
      if (loadedSiteMetaUrl.current === currentMetaUrl) {
        loadedSiteMetaUrl.current = null;
      }
    }
  }, [currentMetaUrl]);

  const reloadSiteList = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const nextData = await fetchSiteList(currentListUrl);
      setData(nextData);
      void reloadSiteMeta();
    } catch (err: any) {
      setLoadError(err?.message || "工地列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [currentListUrl, reloadSiteMeta]);

  useEffect(() => {
    if (lastSiteFilterKey.current === siteFilterKey) return;
    lastSiteFilterKey.current = siteFilterKey;
    setPage(1);
  }, [siteFilterKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    fetchSiteList(currentListUrl, controller.signal)
      .then((nextData) => {
        setData(nextData);
        void reloadSiteMeta();
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setLoadError(err?.message || "工地列表加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [currentListUrl, reloadSiteMeta]);

  useEffect(() => () => {
    recordModalAbortRef.current?.abort();
  }, []);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  const projects = data?.projects || [];
  const currentMeta = siteMeta?.key === currentMetaUrl ? siteMeta.data : null;
  const storeOptions = currentMeta?.storeOptions || data?.storeOptions || [];
  const managerOptions = currentMeta?.managerOptions || data?.managerOptions || [];
  const totalProjects = data?.total || 0;
  const statusCountsReady = Boolean(currentMeta || (data?.statusCounts && Object.keys(data.statusCounts).length > 0));
  const statusCounts = currentMeta?.statusCounts || data?.statusCounts || {};
  const constructionStageOptions = currentMeta?.constructionStageOptions || data?.constructionStageOptions || [];
  const statusFilterItems = statusFilter;

  useEffect(() => {
    window.localStorage.setItem(SITE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
  }, [columnOrder]);

  const stopColumnAutoScroll = useCallback(() => {
    const state = columnAutoScrollRef.current;
    if (state.frame !== null) {
      window.cancelAnimationFrame(state.frame);
    }
    columnAutoScrollRef.current = { frame: null, element: null, speed: 0 };
  }, []);

  useEffect(() => () => {
    stopColumnAutoScroll();
  }, [stopColumnAutoScroll]);

  const updateColumnAutoScroll = useCallback((event: DragEvent<HTMLTableCellElement>) => {
    const scrollElement = event.currentTarget.closest(".thin-scroll-area") as HTMLElement | null;
    if (!scrollElement) return;
    const rect = scrollElement.getBoundingClientRect();
    const edgeSize = 72;
    const maxSpeed = 18;
    const leftDistance = event.clientX - rect.left;
    const rightDistance = rect.right - event.clientX;
    let speed = 0;
    if (leftDistance < edgeSize) {
      speed = -Math.ceil(((edgeSize - leftDistance) / edgeSize) * maxSpeed);
    } else if (rightDistance < edgeSize) {
      speed = Math.ceil(((edgeSize - rightDistance) / edgeSize) * maxSpeed);
    }

    const state = columnAutoScrollRef.current;
    state.element = scrollElement;
    state.speed = speed;
    if (speed === 0) {
      if (state.frame !== null) {
        window.cancelAnimationFrame(state.frame);
      }
      state.frame = null;
      return;
    }
    if (state.frame !== null) return;

    const tick = () => {
      const current = columnAutoScrollRef.current;
      if (!current.element || current.speed === 0) {
        current.frame = null;
        return;
      }
      current.element.scrollLeft += current.speed;
      current.frame = window.requestAnimationFrame(tick);
    };
    state.frame = window.requestAnimationFrame(tick);
  }, []);

  const clearColumnDragState = useCallback(() => {
    stopColumnAutoScroll();
    setDraggingColumn(null);
    setDragOverColumn(null);
    setDragOverSide("before");
  }, [stopColumnAutoScroll]);

  const handleColumnDragStart = useCallback((event: DragEvent<HTMLTableCellElement>, columnKey: SiteColumnKey) => {
    setDraggingColumn(columnKey);
    setDragOverColumn(columnKey);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnKey);
    const preview = document.createElement("div");
    preview.className = styles.columnDragGhost;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 0, 0);
    window.setTimeout(() => preview.remove(), 0);
  }, []);

  const handleColumnDragOver = useCallback((event: DragEvent<HTMLTableCellElement>, columnKey: SiteColumnKey) => {
    if (!draggingColumn) return;
    event.preventDefault();
    updateColumnAutoScroll(event);
    if (draggingColumn === columnKey) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextSide = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    event.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnKey);
    setDragOverSide(nextSide);
  }, [draggingColumn, updateColumnAutoScroll]);

  const handleColumnDrop = useCallback((event: DragEvent<HTMLTableCellElement>, targetColumn: SiteColumnKey) => {
    event.preventDefault();
    const sourceColumn = draggingColumn || event.dataTransfer.getData("text/plain");
    clearColumnDragState();
    if (!sourceColumn || !isSiteColumnKey(sourceColumn) || sourceColumn === targetColumn) return;
    setColumnOrder((currentOrder) => {
      if (!currentOrder.includes(sourceColumn) || !currentOrder.includes(targetColumn)) return currentOrder;
      return moveColumnWithPlacement(currentOrder, sourceColumn, targetColumn, dragOverSide);
    });
  }, [clearColumnDragState, dragOverSide, draggingColumn]);

  const resetMoreFilters = () => {
    setStoreFilter("");
    setConstructionStageFilter("");
    setManagerFilter("");
    setRiskFilter("");
    setPlannedEndFrom("");
    setPlannedEndTo("");
  };

  const getSiteDetailHref = useCallback((projectId: string) => `/site/${encodeURIComponent(projectId)}`, []);

  const prefetchSiteDetail = useCallback((projectId: string) => {
    router.prefetch(getSiteDetailHref(projectId));
  }, [getSiteDetailHref, router]);

  const openSiteDetail = useCallback((projectId: string) => {
    setOpeningSiteId(projectId);
    const href = getSiteDetailHref(projectId);
    router.prefetch(href);
    router.push(href);
  }, [getSiteDetailHref, router]);

  const closeRecordModal = useCallback(() => {
    recordModalAbortRef.current?.abort();
    recordModalAbortRef.current = null;
    setRecordModalProject(null);
    setRecordModalRows([]);
    setRecordModalError("");
    setRecordModalLoading(false);
    setRecordReportDetailRow(null);
  }, []);

  const openRecordModal = useCallback(async (project: any) => {
    recordModalAbortRef.current?.abort();
    const controller = new AbortController();
    recordModalAbortRef.current = controller;
    setRecordModalProject(project);
    setRecordModalRows([]);
    setRecordModalError("");
    setRecordReportDetailRow(null);
    setRecordModalLoading(true);
    try {
      const result = await fetchConstructionRecordList(String(project.id || ""), controller.signal);
      if (controller.signal.aborted) return;
      setRecordModalProject(result.project || project);
      setRecordModalRows(Array.isArray(result.rows) ? result.rows : []);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setRecordModalError(err?.message || "施工记录加载失败");
    } finally {
      if (!controller.signal.aborted) {
        setRecordModalLoading(false);
        recordModalAbortRef.current = null;
      }
    }
  }, []);

  const activeMoreFilterCount = [
    storeFilter,
    constructionStageFilter,
    managerFilter,
    riskFilter,
    plannedEndFrom,
    plannedEndTo,
  ].filter(Boolean).length;

  const getStatusCount = (item: SiteStatusFilterItem) => {
    if (!statusCountsReady) return "…";
    if (item.group === "construction") return Number(item.count || 0);
    if (item.filterStage === null) return Number(statusCounts.all || 0);
    return Number(statusCounts[item.filterStage] || 0);
  };

  return (
    <div className={`${styles.page} enterprise-list-ui site-management-ui`}>
      <div className={styles.container}>
      <section className={`${styles.panel} ${styles.toolbarPanel} system-status-toolbar-panel`}>
        <SystemStatusFilter
          items={statusFilterItems.map((item) => ({
            value: item.value,
            label: item.label,
            count: getStatusCount(item),
          }))}
          value={status}
          onChange={setStatus}
          ariaLabel="工地状态筛选"
        />

        <div className={`${styles.actionsRow} system-status-toolbar-actions`}>
            <div className={styles.searchBox}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                placeholder="搜索房号 / 客户姓名 / 财务编号 / 合同编号 / 服务门店 / 项目经理"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={styles.searchInput}
              />
            </div>
            <button
              className={`${styles.filterButton} ${showMoreFilters || activeMoreFilterCount > 0 ? styles.filterButtonActive : ""}`}
              onClick={() => setShowMoreFilters((value) => !value)}
              aria-expanded={showMoreFilters}
              aria-controls="site-more-filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              更多筛选
              {activeMoreFilterCount > 0 && (
                <span className={styles.filterBadge}>{activeMoreFilterCount}</span>
              )}
              <ChevronDown className={`h-4 w-4 transition-transform ${showMoreFilters ? "rotate-180" : ""}`} />
            </button>
        </div>

        <div
          id="site-more-filters"
          className={`${styles.advancedPanel} ${showMoreFilters ? styles.advancedPanelOpen : ""}`}
          aria-hidden={!showMoreFilters}
        >
          <div className={styles.advancedOverflow}>
          <div className={styles.advancedInner}>
            <div className={styles.advancedGrid}>
              <FilterField label="服务门店">
                <SystemSelect value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className={styles.control} menuClassName={styles.selectMenu} optionClassName={styles.selectOption}>
                  <option value="">全部门店</option>
                  {storeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </SystemSelect>
              </FilterField>
              <FilterField label="施工阶段">
                <SystemSelect value={constructionStageFilter} onChange={(event) => setConstructionStageFilter(event.target.value)} className={styles.control} menuClassName={styles.selectMenu} optionClassName={styles.selectOption}>
                  <option value="">全部施工阶段</option>
                  {constructionStageOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}{item.count ? `（${item.count}）` : ""}
                    </option>
                  ))}
                </SystemSelect>
              </FilterField>
              <FilterField label="项目经理">
                <SystemSelect value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} className={styles.control} menuClassName={styles.selectMenu} optionClassName={styles.selectOption}>
                  <option value="">全部项目经理</option>
                  {managerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </SystemSelect>
              </FilterField>
              <FilterField label="风险状态">
                <SystemSelect value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={styles.control} menuClassName={styles.selectMenu} optionClassName={styles.selectOption}>
                  <option value="">全部风险</option>
                  <option value="issue">有整改问题</option>
                  <option value="overdue">已延期</option>
                  <option value="normal">正常</option>
                </SystemSelect>
              </FilterField>
              <FilterField label="计划完工开始">
                <SystemDateInput value={plannedEndFrom} onChange={setPlannedEndFrom} className={styles.control} />
              </FilterField>
              <FilterField label="计划完工结束">
                <SystemDateInput value={plannedEndTo} onChange={setPlannedEndTo} className={styles.control} />
              </FilterField>
              <div className={styles.resetCell}>
                <button
                  type="button"
                  onClick={resetMoreFilters}
                  className={styles.resetButton}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  清空筛选
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      <SystemResourceTable.Panel>
        {openingSiteId && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingPill}>
              <Loader2 className="h-4 w-4 animate-spin" />
              正在打开工地详情...
            </div>
          </div>
        )}
        {loading && projects.length > 0 && (
          <div className={styles.updatingPill}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在更新
          </div>
        )}
        {loadError ? (
          <div className={styles.stateView}>
            <AlertTriangle className="mb-3 h-10 w-10 text-red-400" />
            <p className={styles.stateTitle}>工地列表加载失败</p>
            <p className={styles.stateDescription}>{loadError}</p>
            <button type="button" onClick={reloadSiteList} className={styles.stateButton}>
              重新加载
            </button>
          </div>
        ) : loading && projects.length === 0 ? (
          <div className={styles.stateView}>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载工地...
          </div>
        ) : projects.length > 0 ? (
          <>
          <SystemResourceTable.Scroll>
            <SystemResourceTable.Table className={styles.siteListTable} minWidth={2820} fixed>
              <colgroup>
                {columnOrder.map((columnKey) => (
                  <col key={columnKey} className={siteColumnDefinitions[columnKey].className} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columnOrder.map((columnKey) => {
                    const column = siteColumnDefinitions[columnKey];
                    const isDropTarget = dragOverColumn === columnKey && draggingColumn !== columnKey;
                    return (
                      <SystemResourceTable.HeaderCell
                        key={columnKey}
                        align={column.align}
                        className={`${styles.columnHeader} ${draggingColumn === columnKey ? styles.columnHeaderDragging : ""} ${isDropTarget ? styles.columnHeaderDropTarget : ""} ${isDropTarget && dragOverSide === "after" ? styles.columnHeaderDropAfter : ""} ${isDropTarget && dragOverSide === "before" ? styles.columnHeaderDropBefore : ""}`}
                        draggable
                        onDragStart={(event) => handleColumnDragStart(event, columnKey)}
                        onDragOver={(event) => handleColumnDragOver(event, columnKey)}
                        onDrop={(event) => handleColumnDrop(event, columnKey)}
                        onDragEnd={clearColumnDragState}
                        title="拖动调整列顺序"
                      >
                        <span className={styles.columnHeaderInner}>
                          <span>{column.label}</span>
                          <GripVertical className={styles.columnDragIcon} aria-hidden="true" />
                        </span>
                      </SystemResourceTable.HeaderCell>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {projects.map((project: any, index: number) => {
                  const hasIssue = Number(project.open_issue_count || 0) > 0;
                  const overdue = isOverdue(project.planned_end_date);
                  const roomDisplay = getSiteRoomDisplay(project);
                  const contractCount = Number(project.contract_count || 0);
                  const contractTitle = project.contract_no
                    ? `${project.contract_no}${contractCount > 1 ? `，共${contractCount}份有效合同` : ""}`
                    : "";
                  const constructionStageDisplay = getConstructionStageDisplay(project);
                  const constructionStageTone = getConstructionStageBadgeTone(project, constructionStageDisplay);
                  const isOpening = openingSiteId === project.id;
                  const constructionRecordCount = Number(project.construction_record_count || 0);
                  const contractDurationDays = getContractDurationDays(project);
                  const usedDurationDays = getUsedDurationDays(project);
                  const cameraCount = Number(project.active_camera_count || 0);
                  const cellByColumn: Record<SiteColumnKey, JSX.Element> = {
                    index: (
                      <SystemResourceTable.Cell align="center" index>{(effectivePage - 1) * pageSize + index + 1}</SystemResourceTable.Cell>
                    ),
                    room: (
                      <SystemResourceTable.Cell>
                        <span className={styles.roomCell} title={roomDisplay}>{roomDisplay}</span>
                      </SystemResourceTable.Cell>
                    ),
                    customer: (
                      <SystemResourceTable.Cell>
                        <span className={styles.valueCell} title={project.customer_name || ""}>{project.customer_name || "-"}</span>
                      </SystemResourceTable.Cell>
                    ),
                    financeNo: (
                      <SystemResourceTable.Cell>
                        <span className={styles.valueCell} title={project.finance_no || ""}>{project.finance_no || "-"}</span>
                      </SystemResourceTable.Cell>
                    ),
                    contract: (
                      <SystemResourceTable.Cell>
                        {project.contract_no ? (
                          <span className={styles.contractCell} title={contractTitle}>
                            <span className={styles.contractNumber}>{project.contract_no}</span>
                            {contractCount > 1 && (
                              <span className={styles.contractCountTag}>
                                {contractCount}份合同
                              </span>
                            )}
                          </span>
                        ) : "-"}
                      </SystemResourceTable.Cell>
                    ),
                    designer: (
                      <SystemResourceTable.Cell>
                        <SiteStaffCell name={project.designer_name} avatar={project.designer_avatar} />
                      </SystemResourceTable.Cell>
                    ),
                    store: (
                      <SystemResourceTable.Cell>
                        {project.service_store ? (
                          <span className={styles.storeCell}>
                            <span className={styles.valueCell} title={project.service_store || ""}>{project.service_store}</span>
                            {Number(project.service_store_is_active ?? 1) !== 1 && (
                              <span className={styles.disabledTag}>已停用</span>
                            )}
                          </span>
                        ) : "-"}
                      </SystemResourceTable.Cell>
                    ),
                    manager: (
                      <SystemResourceTable.Cell>
                        <SiteStaffCell name={project.manager_name} avatar={project.manager_avatar} />
                      </SystemResourceTable.Cell>
                    ),
                    projectStage: (
                      <SystemResourceTable.Cell align="center">
                        <span className={`${styles.statusTag} ${getSiteStageBadgeTone(project)}`}>
                          {siteStageLabels[project.site_stage] || statusLabels[project.status] || project.status}
                        </span>
                      </SystemResourceTable.Cell>
                    ),
                    constructionStage: (
                      <SystemResourceTable.Cell align="center">
                        <span
                          className={`${styles.statusTag} ${constructionStageTone.className}`}
                          title={constructionStageDisplay}
                        >
                          <span>{constructionStageDisplay}</span>
                        </span>
                      </SystemResourceTable.Cell>
                    ),
                    recordCount: (
                      <SystemResourceTable.Cell align="center">
                        <button
                          type="button"
                          className={styles.recordCountButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openRecordModal(project);
                          }}
                          title="查看施工记录"
                        >
                          {constructionRecordCount}
                        </button>
                      </SystemResourceTable.Cell>
                    ),
                    latestNode: (
                      <SystemResourceTable.Cell>
                        <span className={styles.valueCell} title={project.latest_construction_node || constructionStageDisplay || ""}>
                          {project.latest_construction_node || constructionStageDisplay || "-"}
                        </span>
                      </SystemResourceTable.Cell>
                    ),
                    latestReportAt: (
                      <SystemResourceTable.Cell align="center" className={styles.numericCell}>
                        {formatSiteDateTime(project.latest_report_at)}
                      </SystemResourceTable.Cell>
                    ),
                    startDate: (
                      <SystemResourceTable.Cell align="center" className={styles.numericCell}>
                        {formatSiteDate(project.start_date)}
                      </SystemResourceTable.Cell>
                    ),
                    contractDuration: (
                      <SystemResourceTable.Cell align="center" className={styles.numericCell}>
                        {formatDurationText(contractDurationDays)}
                      </SystemResourceTable.Cell>
                    ),
                    usedDuration: (
                      <SystemResourceTable.Cell align="center" className={styles.numericCell}>
                        {formatDurationText(usedDurationDays)}
                      </SystemResourceTable.Cell>
                    ),
                    siteType: (
                      <SystemResourceTable.Cell align="center">
                        <span className={styles.valueCell} title={project.site_type || ""}>{project.site_type || "-"}</span>
                      </SystemResourceTable.Cell>
                    ),
                    monitor: (
                      <SystemResourceTable.Cell align="center">
                        <span className={`${styles.statusTag} ${cameraCount > 0 ? siteTagTones.green : siteTagTones.neutral}`}>
                          {cameraCount > 0 ? `有${cameraCount}台` : "无"}
                        </span>
                      </SystemResourceTable.Cell>
                    ),
                    amount: (
                      <SystemResourceTable.Cell align="right" className={styles.amountCell}>
                        {formatPlainAmount(project.contract_amount || 0)}
                      </SystemResourceTable.Cell>
                    ),
                    area: (
                      <SystemResourceTable.Cell align="right" className={styles.numericCell}>
                        {Number(project.area || 0) ? `${project.area}㎡` : "-"}
                      </SystemResourceTable.Cell>
                    ),
                    risk: (
                      <SystemResourceTable.Cell align="center">
                        {hasIssue ? (
                          <span className={`${styles.statusTag} ${siteTagTones.red}`}>
                            {project.open_issue_count}个问题
                          </span>
                        ) : overdue ? (
                          <span className={`${styles.statusTag} ${siteTagTones.amber}`}>
                            已延期
                          </span>
                        ) : (
                          <span className={`${styles.statusTag} ${siteTagTones.green}`}>
                            正常
                          </span>
                        )}
                      </SystemResourceTable.Cell>
                    ),
                  };
                  return (
                    <SystemResourceTable.Row
                      key={project.id}
                      aria-busy={isOpening}
                      onMouseEnter={() => prefetchSiteDetail(project.id)}
                      onClick={() => openSiteDetail(project.id)}
                      opening={isOpening}
                    >
                      {columnOrder.map((columnKey) => (
                        <Fragment key={columnKey}>{cellByColumn[columnKey]}</Fragment>
                      ))}
                    </SystemResourceTable.Row>
                  );
                })}
              </tbody>
            </SystemResourceTable.Table>
          </SystemResourceTable.Scroll>
            <SystemResourceTable.Pagination
              total={totalProjects}
              page={effectivePage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemName="个工地"
            />
          </>
        ) : (
          <SystemResourceTable.EmptyState icon={<Hammer />}>
            暂无匹配工地
          </SystemResourceTable.EmptyState>
        )}
      </SystemResourceTable.Panel>
      </div>
      {recordModalProject && (
        <div className={styles.recordModalOverlay} onClick={closeRecordModal}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${getSiteRoomDisplay(recordModalProject)}施工记录`}
            className={styles.recordModal}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.recordModalHeader}>
              <div className="min-w-0">
                <div className={styles.recordModalTitleRow}>
                  <span className={styles.recordModalIcon}><ClipboardList className="h-4 w-4" /></span>
                  <h3 className={styles.recordModalTitle}>{getSiteRoomDisplay(recordModalProject)}</h3>
                  <span className={`${styles.statusTag} ${getSiteStageBadgeTone(recordModalProject)}`}>
                    {siteStageLabels[recordModalProject.site_stage] || statusLabels[recordModalProject.status] || recordModalProject.site_stage || "-"}
                  </span>
                </div>
                <p className={styles.recordModalMeta}>
                  {recordModalProject.customer_name || "未知客户"} · {recordModalRows.length} 条施工记录
                </p>
              </div>
              <button type="button" onClick={closeRecordModal} className={styles.recordModalClose} aria-label="关闭施工记录">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className={styles.recordModalBody}>
              {recordModalLoading ? (
                <div className={styles.recordModalState}>
                  <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary-600" />
                  正在读取施工记录
                </div>
              ) : recordModalError ? (
                <div className={styles.recordModalState}>
                  <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
                  <p className={styles.stateTitle}>施工记录加载失败</p>
                  <p className={styles.stateDescription}>{recordModalError}</p>
                  <button type="button" onClick={() => void openRecordModal(recordModalProject)} className={styles.stateButton}>重新加载</button>
                </div>
              ) : recordModalRows.length === 0 ? (
                <div className={styles.recordModalState}>
                  <Activity className="mb-3 h-8 w-8 text-surface-300" />
                  <p className={styles.stateTitle}>暂无施工记录</p>
                  <p className={styles.stateDescription}>已开始、进行中、待确认或已完成的节点会显示在这里。</p>
                </div>
              ) : (
                <div className={styles.recordModalTableWrap}>
                  <table className={styles.recordModalTable}>
                    <colgroup>
                      <col className={styles.recordColIndex} />
                      <col className={styles.recordColNode} />
                      <col className={styles.recordColCount} />
                      <col className={styles.recordColWorkers} />
                      <col className={styles.recordColCount} />
                      <col className={styles.recordColStatus} />
                      <col className={styles.recordColStatus} />
                      <col className={styles.recordColPeriod} />
                      <col className={styles.recordColPeriod} />
                      <col className={styles.recordColDelay} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>序号</th>
                        <th>施工节点</th>
                        <th>项目经理汇报</th>
                        <th>施工工人</th>
                        <th>工人汇报</th>
                        <th>施工状态</th>
                        <th>验收状态</th>
                        <th>施工计划时间段</th>
                        <th>实际施工时间段</th>
                        <th>是否延期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordModalRows.map((row, index) => {
                        const statusMeta = getConstructionRecordStatusMeta(row.status, row.node_type_label);
                        const delayMeta = getRecordDelayMeta(row);
                        const isRequiredInspection = String(row.node_type_label || "").includes("验收");
                        const normalizedStatus = String(row.status || "").toUpperCase();
                        const acceptanceMeta = !isRequiredInspection
                          ? { label: "免检", className: siteTagTones.neutral }
                          : normalizedStatus === "COMPLETED"
                            ? { label: "已验收", className: siteTagTones.green }
                            : { label: "待验收", className: siteTagTones.amber };
                        return (
                          <tr key={row.id}>
                            <td className={styles.recordCenterCell}>{index + 1}</td>
                            <td><span className={styles.recordNodeName} title={row.node_name}>{row.node_name || "-"}</span></td>
                            <td className={styles.recordCenterCell}>
                              <button
                                type="button"
                                className={styles.recordCountPill}
                                onClick={() => setRecordReportDetailRow(row)}
                                disabled={Number(row.manager_report_count || 0) <= 0}
                                title={Number(row.manager_report_count || 0) > 0 ? "查看项目经理汇报" : "暂无项目经理汇报"}
                              >
                                {Number(row.manager_report_count || 0)}次
                              </button>
                            </td>
                            <td><span className={styles.recordWorkerNames} title={row.worker_names || ""}>{row.worker_names || "--"}</span></td>
                            <td className={styles.recordCenterCell}><span className={styles.recordCountPill}>{Number(row.worker_report_count || 0)}次</span></td>
                            <td className={styles.recordCenterCell}><span className={`${styles.statusTag} ${statusMeta.className}`}>{statusMeta.label}</span></td>
                            <td className={styles.recordCenterCell}><span className={`${styles.statusTag} ${acceptanceMeta.className}`}>{acceptanceMeta.label}</span></td>
                            <td className={styles.recordCenterCell}>
                              <span className={styles.recordDateRange} title={formatRecordDateRange(row.planned_start, row.planned_end)}>
                                {formatRecordDateRange(row.planned_start, row.planned_end)}
                              </span>
                            </td>
                            <td className={styles.recordCenterCell}>
                              <span className={styles.recordDateRange} title={formatRecordDateRange(row.actual_start, row.actual_end)}>
                                {formatRecordDateRange(row.actual_start, row.actual_end)}
                              </span>
                            </td>
                            <td className={styles.recordCenterCell}>
                              <span className={`${styles.statusTag} ${delayMeta.className}`}>{delayMeta.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <footer className={styles.recordModalFooter}>
              <span>共 {recordModalRows.length} 条施工记录</span>
              <button type="button" onClick={closeRecordModal} className={styles.recordModalButton}>关闭</button>
            </footer>

            {recordReportDetailRow && (
              <div className={styles.recordReportOverlay} onClick={() => setRecordReportDetailRow(null)}>
                <section
                  role="dialog"
                  aria-modal="true"
                  className={styles.recordReportPanel}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${recordReportDetailRow.node_name}项目经理汇报`}
                >
                  <header className={styles.recordReportHeader}>
                    <div className="min-w-0">
                      <div className={styles.recordReportTitleRow}>
                        <span className={`${styles.recordReportTag} ${siteTagTones.blue}`}>项目经理汇报</span>
                        <h4 className={styles.recordReportTitle}>{recordReportDetailRow.node_name}</h4>
                      </div>
                      <p className={styles.recordReportMetaLine}>
                        {recordReportDetailRow.stage_name || "施工阶段"} · {(recordReportDetailRow.manager_reports || []).length} 条汇报 · {(recordReportDetailRow.manager_reports || []).reduce((sum, report) => sum + (report.photos || []).length, 0)} 张图片
                      </p>
                    </div>
                    <button type="button" onClick={() => setRecordReportDetailRow(null)} className={styles.recordModalClose} aria-label="关闭汇报明细">
                      <X className="h-4 w-4" />
                    </button>
                  </header>
                  <div className={styles.recordReportBody}>
                    {(recordReportDetailRow.manager_reports || []).length > 0 ? (
                      (recordReportDetailRow.manager_reports || []).map((report) => {
                        const completedWork = getVisibleRecordReportText(report.completed_work);
                        const nextPlan = getVisibleRecordReportText(report.next_plan);
                        const content = getVisibleRecordReportText(report.content);
                        const photos = (report.photos || []).filter((photo) => String(photo.file_url || photo.url || "").trim());
                        const hasReportPlan = Boolean(completedWork || nextPlan);
                        const shouldShowContent = Boolean(content) && !hasReportPlan;
                        return (
                          <article key={report.id} className={styles.recordReportItem}>
                            <span className={styles.recordReportDot} />
                            <div className={styles.recordReportContent}>
                              <div className={styles.recordReportTop}>
                                <div className={styles.recordReportHeading}>
                                  <span className={`${styles.recordReportTag} ${siteTagTones.blue}`}>施工汇报</span>
                                  <p className={styles.recordReportItemTitle}>{report.title || "提交项目经理汇报"}</p>
                                </div>
                                <time className={styles.recordReportTime}>{report.created_at ? formatDateTime(report.created_at) : "-"}</time>
                              </div>
                              <div className={styles.recordReportMeta}>
                                <span className={styles.recordReportOperator}>
                                  <UserRound className="h-3.5 w-3.5" />
                                  {report.operator_name || "项目经理"}
                                </span>
                                {report.location_name && (
                                  <span className={styles.recordReportLocation} title={report.location_name}>
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span>{report.location_name}</span>
                                  </span>
                                )}
                              </div>
                              {shouldShowContent && <p className={styles.recordReportText}>{content}</p>}
                              {hasReportPlan && (
                                <div className={styles.recordReportPlanTable}>
                                  <div className={styles.recordReportPlanCell}>
                                    <span className={styles.recordReportPlanLabel}>今日完成</span>
                                    <p className={styles.recordReportPlanText}>{completedWork || "未填写"}</p>
                                  </div>
                                  <div className={styles.recordReportPlanCell}>
                                    <span className={styles.recordReportPlanLabel}>明日计划</span>
                                    <p className={styles.recordReportPlanText}>{nextPlan || "未填写"}</p>
                                  </div>
                                </div>
                              )}
                              {photos.length > 0 && (
                                <div className={styles.recordReportPhotoGrid}>
                                  {photos.map((photo, index) => {
                                    const url = String(photo.file_url || photo.url || "").trim();
                                    return (
                                      <a
                                        key={photo.id || `${report.id}-${index}`}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={styles.recordReportPhotoLink}
                                      >
                                        <NativeImage
                                          src={url}
                                          alt={photo.file_name || photo.caption || "施工照片"}
                                          className={styles.recordReportPhoto}
                                        />
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className={styles.recordModalState}>
                        <Activity className="mb-3 h-8 w-8 text-surface-300" />
                        暂无项目经理汇报
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      {children}
    </label>
  );
}
