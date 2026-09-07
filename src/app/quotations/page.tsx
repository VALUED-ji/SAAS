"use client";

import {
  QuotaTemplateOption,
  buildDefaultQuotationTitle,
  buildQuotationRoomNumber,
  buildTemporaryQuotationTitle,
  formatContractStatus,
  formatCreateAreaInput,
  formatRecordAmount,
  formatRecordStatus,
  getContractStatusClass,
  getCustomerAreaValue,
  getCustomerContactText,
  getCustomerHouseText,
  getRecordAmount,
  getRecordCostSummary,
  getRecordStatusClass,
  getSignedContractAmount,
  getTemplateModeLabel,
  isUsedBySignedContract,
  isSentToDesigner,
  loadQuotaTemplatesFromStorage,
  normalizeQuotaTemplate,
  sanitizeCreateAreaInput,
} from "./quotation-list-shared";



import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Eye, Loader2, X, History, Copy, Send, Trash2, CheckCircle2, Link as LinkIcon, Pencil, RotateCcw, Printer, ReceiptText, Users, Phone, Home, Ruler, FileText, MapPin, UserPlus, Check, GitCompareArrows, ArrowUpRight, Minus, ListFilter } from "lucide-react";
import { useDeletedQuotations, useQuotations } from "@/lib/queries";
import { api } from "@/lib/api";
import { customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import { formatDateTime, parseAppDate } from "@/lib/utils";
import { calculatePackageQuotePrice, formatPricingAmount, toPricingAmount } from "@/lib/quotaTemplatePricing";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import AddCustomerModal, { AmapLocationPicker, type LocationPick } from "@/components/ui/AddCustomerModal";
import { createQuotationPrintPreviewUrl, createQuotationShareUrl } from "@/lib/quotationShareClient";
import {
  QuotationDialogState,
  QuotationSystemDialogModal,
  QuotationTextDialogModal,
  QuotationTextDialogState,
} from "./quotation-list-dialogs";

type CreateCustomerSnapshot = {
  phone: string;
  address: string;
  address_location_name: string;
  address_location_address: string;
  address_latitude: string;
  address_longitude: string;
  building_no: string;
  unit_no: string;
  room_no: string;
  no_room_number: boolean;
  area_size: string;
  decoration_type: string;
};

type CreateQuotationMode = "customer" | "new_customer" | "temporary";
type CopyQuotationTargetMode = "current" | "other";
type CopyQuotationContentMode = "full" | "items_only";

type QuotationChangeItem = {
  id: string;
  quotation_item_id?: string | null;
  item_name?: string | null;
  space?: string | null;
  category?: string | null;
  change_type: "created" | "updated" | "deleted";
  field_key?: string | null;
  field_label?: string | null;
  old_value?: string | null;
  new_value?: string | null;
};

type QuotationChangeDisplayItem =
  | { kind: "replacement"; id: string; oldName: string; newName: string; space?: string | null; category?: string | null }
  | { kind: "change"; id: string; change: QuotationChangeItem };

type QuotationChangeLog = {
  id: string;
  user_name?: string | null;
  user_avatar?: string | null;
  summary?: string | null;
  change_count?: number;
  created_at: string;
  changes: QuotationChangeItem[];
};

type QuickCustomerDraft = {
  name: string;
  designer_name: string;
  phone: string;
  weixin: string;
  address: string;
  address_location_name: string;
  address_location_address: string;
  address_latitude: string;
  address_longitude: string;
  building_no: string;
  unit_no: string;
  room_no: string;
  no_room_number: boolean;
  area_size: string;
  decoration_type: string;
};

type RecordProjectInfoForm = {
  customerName: string;
  designerName: string;
  customerPhone: string;
  customerWeixin: string;
  customerAddress: string;
  houseAddress: string;
  addressLocationName: string;
  addressLocationAddress: string;
  addressLatitude: string;
  addressLongitude: string;
  buildingNo: string;
  unitNo: string;
  roomNo: string;
  noRoomNumber: boolean;
  areaSize: string;
  decorationType: string;
  notes: string;
  customerVisibleNote: string;
};

const emptyCreateCustomerSnapshot: CreateCustomerSnapshot = {
  phone: "",
  address: "",
  address_location_name: "",
  address_location_address: "",
  address_latitude: "",
  address_longitude: "",
  building_no: "",
  unit_no: "",
  room_no: "",
  no_room_number: false,
  area_size: "",
  decoration_type: "",
};

const emptyQuickCustomerDraft: QuickCustomerDraft = {
  name: "",
  designer_name: "",
  phone: "",
  weixin: "",
  address: "",
  address_location_name: "",
  address_location_address: "",
  address_latitude: "",
  address_longitude: "",
  building_no: "",
  unit_no: "",
  room_no: "",
  no_room_number: false,
  area_size: "",
  decoration_type: "",
};

const emptyRecordProjectInfoForm: RecordProjectInfoForm = {
  customerName: "",
  designerName: "",
  customerPhone: "",
  customerWeixin: "",
  customerAddress: "",
  houseAddress: "",
  addressLocationName: "",
  addressLocationAddress: "",
  addressLatitude: "",
  addressLongitude: "",
  buildingNo: "",
  unitNo: "",
  roomNo: "",
  noRoomNumber: false,
  areaSize: "",
  decorationType: "",
  notes: "",
  customerVisibleNote: "",
};

function buildEditableCustomerFromQuotationRecord(record: any) {
  if (!record?.customer_id) return null;
  return {
    id: String(record.customer_id),
    name: String(record.customer_name || "").trim(),
    phone: String(record.customer_phone || "").trim(),
    weixin: String(record.customer_weixin || "").trim(),
    address: String(record.customer_address || record.project_address || "").trim(),
    house_address: String(record.customer_house_address || "").trim(),
    building_no: String(record.customer_building_no || "").trim(),
    unit_no: String(record.customer_unit_no || "").trim(),
    room_no: String(record.customer_room_no || "").trim(),
    no_room_number: record.customer_no_room_number === true || record.customer_no_room_number === 1,
    area_size: record.customer_area_size ?? record.project_area ?? "",
    decoration_type: String(record.customer_decoration_type || "").trim(),
  };
}

function buildRecordProjectInfoForm(record: any): RecordProjectInfoForm {
  return {
    customerName: String(record?.customer_name || "").trim(),
    designerName: String(record?.designer_name || "").trim(),
    customerPhone: sanitizeCreatePhoneInput(record?.customer_phone || ""),
    customerWeixin: String(record?.customer_weixin || "").trim(),
    customerAddress: String(record?.customer_address || "").trim(),
    houseAddress: String(record?.customer_house_address || record?.project_address || "").trim(),
    addressLocationName: String(record?.customer_address_location_name || "").trim(),
    addressLocationAddress: String(record?.customer_address_location_address || "").trim(),
    addressLatitude: record?.customer_address_latitude === undefined || record?.customer_address_latitude === null ? "" : String(record.customer_address_latitude),
    addressLongitude: record?.customer_address_longitude === undefined || record?.customer_address_longitude === null ? "" : String(record.customer_address_longitude),
    buildingNo: String(record?.customer_building_no || "").trim(),
    unitNo: String(record?.customer_unit_no || "").trim(),
    roomNo: String(record?.customer_room_no || "").trim(),
    noRoomNumber: record?.customer_no_room_number === true || record?.customer_no_room_number === 1,
    areaSize: formatCreateAreaInput(record?.customer_area_size ?? record?.project_area),
    decorationType: String(record?.customer_decoration_type || "").trim(),
    notes: String(record?.notes || "").trim(),
    customerVisibleNote: String(record?.customer_visible_note || "").trim(),
  };
}

function formatCompareDiff(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) < 0.005) return "持平";
  return `${amount > 0 ? "+" : "-"}¥ ${formatRecordAmount(Math.abs(amount))}`;
}

type QuotationCompareKind = "base" | "main_material" | "custom_cabinet" | "other";

function normalizeCompareCategory(category: unknown): QuotationCompareKind {
  const value = String(category || "").trim();
  if (value === "base" || value === "基装" || value === "基装项目") return "base";
  if (value === "main_material" || value === "主材" || value === "产品" || value === "主材项目") return "main_material";
  if (value === "custom_cabinet" || value === "定制柜" || value === "定制柜项目") return "custom_cabinet";
  return "other";
}

function getCompareCategoryLabel(kind: QuotationCompareKind) {
  if (kind === "base") return "基装";
  if (kind === "main_material") return "产品";
  if (kind === "custom_cabinet") return "定制柜";
  return "综合费用";
}

function getCompareItemAmount(item: any) {
  const category = normalizeCompareCategory(item?.category);
  if (category === "custom_cabinet") {
    const quantity = Number(item?.quantity || 0);
    const unitPrice = Number(item?.unit_price || 0);
    const width = Number(item?.material_cost || 0);
    const height = Number(item?.labor_cost || 0);
    const area = width > 0 && height > 0 ? width * height / 1000000 : 1;
    return Math.round(quantity * area * unitPrice * 100) / 100;
  }
  const fallback = Number(item?.quantity || 0) * Number(item?.unit_price || 0);
  const amount = Number(item?.total_price ?? fallback);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function addCompareAmount(map: Map<string, any>, key: string, patch: any) {
  const current = map.get(key) || {
    key,
    label: patch.label || key,
    space: patch.space || "",
    kind: patch.kind || "",
    base: 0,
    mainMaterial: 0,
    customCabinet: 0,
    other: 0,
    total: 0,
    count: 0,
  };
  current.base += Number(patch.base || 0);
  current.mainMaterial += Number(patch.mainMaterial || 0);
  current.customCabinet += Number(patch.customCabinet || 0);
  current.other += Number(patch.other || 0);
  current.total += Number(patch.total || 0);
  current.count += Number(patch.count || 0);
  if (patch.space && !current.space) current.space = patch.space;
  map.set(key, current);
}

function getCompareDiscountAmount(record: any, totals: any) {
  const fromTotals = Number(totals?.discount);
  if (Number.isFinite(fromTotals) && Math.abs(fromTotals) >= 0.005) return fromTotals;
  const fromRecord = Number(record?.discount);
  if (Number.isFinite(fromRecord) && Math.abs(fromRecord) >= 0.005) return fromRecord;
  const settings = getRecordSettings(record);
  const fromSettings = Number(settings?.discount);
  return Number.isFinite(fromSettings) ? fromSettings : 0;
}

function getRecordSettings(record: any) {
  const rawSettings = record?.settings;
  if (typeof rawSettings === "string") {
    try {
      const parsed = JSON.parse(rawSettings);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return rawSettings && typeof rawSettings === "object" ? rawSettings : {};
}

function getRecordQuotaTemplateName(record: any) {
  const settings = getRecordSettings(record);
  return String(settings?.quotaTemplateName || record?.quota_template_name || "").trim();
}

function buildQuotationCompareSummary(record: any) {
  const detailItems = Array.isArray(record?.items) ? record.items : [];
  const totals = record?.totals || {};
  const discount = getCompareDiscountAmount(record, totals);
  const finalAmount = Number(totals.finalAmount ?? getRecordAmount(record));
  const categoryRows = [
    { key: "base", label: "基装", amount: Number(totals.baseAmount ?? record?.base_amount ?? 0), count: 0 },
    { key: "main_material", label: "产品", amount: Number(totals.mainMaterialAmount ?? record?.main_material_amount ?? 0), count: 0 },
    { key: "custom_cabinet", label: "定制柜", amount: Number(totals.customCategoryAmount ?? record?.custom_direct_amount ?? 0), count: 0 },
    { key: "other", label: "综合费用", amount: Number(totals.otherAmount ?? record?.other_amount ?? 0), count: 0 },
    { key: "discount", label: "报价优惠", amount: -Math.abs(discount), count: 0 },
    { key: "final", label: "报价总费用", amount: finalAmount, count: 0 },
  ];
  const categoryCountMap = new Map<string, number>();
  const spaceMap = new Map<string, any>();
  const projectMap = new Map<string, any>();

  detailItems.forEach((item: any) => {
    const kind = normalizeCompareCategory(item?.category);
    const amount = getCompareItemAmount(item);
    categoryCountMap.set(kind, (categoryCountMap.get(kind) || 0) + 1);
    if (kind === "other") return;
    const space = String(item?.space || "").trim() || "未分空间";
    const projectName = String(item?.name || "").trim();
    addCompareAmount(spaceMap, `${space}:${kind}`, {
      label: space,
      kind,
      base: kind === "base" ? amount : 0,
      mainMaterial: kind === "main_material" ? amount : 0,
      customCabinet: kind === "custom_cabinet" ? amount : 0,
      total: amount,
      count: 1,
    });
    if (projectName) {
      addCompareAmount(projectMap, `${kind}:${projectName}`, {
        label: projectName,
        space,
        kind,
        base: kind === "base" ? amount : 0,
        mainMaterial: kind === "main_material" ? amount : 0,
        customCabinet: kind === "custom_cabinet" ? amount : 0,
        total: amount,
        count: 1,
      });
    }
  });

  return {
    total: finalAmount,
    discount,
    directAmount: Number(totals.directAmount ?? 0),
    categoryRows: categoryRows.map((row) => ({ ...row, count: categoryCountMap.get(row.key) || 0 })),
    spaceRows: Array.from(spaceMap.values()).sort((a, b) => {
      const labelOrder = String(a.label).localeCompare(String(b.label), "zh-CN");
      if (labelOrder !== 0) return labelOrder;
      return String(a.kind).localeCompare(String(b.kind), "zh-CN");
    }),
    projectRows: Array.from(projectMap.values()).sort((a, b) => {
      const kindOrder = String(a.kind || "").localeCompare(String(b.kind || ""), "zh-CN");
      if (kindOrder !== 0) return kindOrder;
      return String(a.label || "").localeCompare(String(b.label || ""), "zh-CN");
    }),
  };
}

function sanitizeCreatePhoneInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function makeCreateCustomerSnapshot(customer: any): CreateCustomerSnapshot {
  return {
    phone: String(customer?.phone || "").trim(),
    address: String(customer?.address || customer?.area || "").trim(),
    address_location_name: String(customer?.address_location_name || "").trim(),
    address_location_address: String(customer?.address_location_address || "").trim(),
    address_latitude: customer?.address_latitude === undefined || customer?.address_latitude === null ? "" : String(customer.address_latitude),
    address_longitude: customer?.address_longitude === undefined || customer?.address_longitude === null ? "" : String(customer.address_longitude),
    building_no: String(customer?.building_no || "").trim(),
    unit_no: String(customer?.unit_no || "").trim(),
    room_no: String(customer?.room_no || "").trim(),
    no_room_number: customer?.no_room_number === true || customer?.no_room_number === 1,
    area_size: formatCreateAreaInput(customer?.area_size ?? customer?.areaSize ?? customer?.area ?? 0),
    decoration_type: String(customer?.decoration_type || "").trim(),
  };
}

function mergeCustomerSnapshot(customer: any, snapshot: CreateCustomerSnapshot) {
  if (!customer) return customer;
  return {
    ...customer,
    phone: snapshot.phone,
    address: snapshot.address,
    address_location_name: snapshot.address_location_name,
    address_location_address: snapshot.address_location_address,
    address_latitude: snapshot.address_latitude,
    address_longitude: snapshot.address_longitude,
    building_no: snapshot.no_room_number ? "" : snapshot.building_no,
    unit_no: snapshot.no_room_number ? "" : snapshot.unit_no,
    room_no: snapshot.no_room_number ? "" : snapshot.room_no,
    no_room_number: snapshot.no_room_number ? 1 : 0,
    area_size: toPricingAmount(snapshot.area_size),
    decoration_type: snapshot.decoration_type,
  };
}

const ENABLE_TEMPORARY_QUOTATION = false;
const MAX_COMPARE_RECORDS = 4;
const recordDecorationTypeOptions = ["全包", "半包", "清包", "局改", "整装"];
const quotationShareExpireOptions = [
  { label: "24小时", value: "24h", desc: "临时查看" },
  { label: "3天", value: 3, desc: "短期确认" },
  { label: "7天", value: 7, desc: "常用分享" },
  { label: "15天", value: 15, desc: "预留跟进" },
  { label: "30天", value: 30, desc: "长期沟通" },
  { label: "永久", value: null, desc: "一直有效" },
] as const;

function waitForQuotationSaveCheck(delay = 300) {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function clearQuotationReturnParams(params: URLSearchParams) {
  params.delete("openRecords");
  params.delete("refreshRecords");
  params.delete("customerId");
  params.delete("fromQuotationId");
  params.delete("t");
  const nextQuery = params.toString();
  window.history.replaceState(null, "", nextQuery ? `/quotations?${nextQuery}` : "/quotations");
}

export default function QuotationsPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [recordCustomerKey, setRecordCustomerKey] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [createMode, setCreateMode] = useState<CreateQuotationMode>("new_customer");
  const [createCustomerSearch, setCreateCustomerSearch] = useState("");
  const [createCustomerOptions, setCreateCustomerOptions] = useState<any[]>([]);
  const [createCustomerTotal, setCreateCustomerTotal] = useState(0);
  const [createCustomerMore, setCreateCustomerMore] = useState(false);
  const [createCustomerLoading, setCreateCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [createCustomerSnapshot, setCreateCustomerSnapshot] = useState<CreateCustomerSnapshot>(emptyCreateCustomerSnapshot);
  const [quickCustomer, setQuickCustomer] = useState<QuickCustomerDraft>(emptyQuickCustomerDraft);
  const [temporaryCustomer, setTemporaryCustomer] = useState({ name: "", phone: "", weixin: "", address: "", area: "", decoration_type: "" });
  const [createMapPickerOpen, setCreateMapPickerOpen] = useState(false);
  const [title, setTitle] = useState("装修报价单");
  const [createNotes, setCreateNotes] = useState("");
  const [createCustomerVisibleNote, setCreateCustomerVisibleNote] = useState("");
  const [quotaTemplates, setQuotaTemplates] = useState<QuotaTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [packageQuoteAreaText, setPackageQuoteAreaText] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [recordActionId, setRecordActionId] = useState("");
  const [copiedLinkId, setCopiedLinkId] = useState("");
  const [shareLinkDialog, setShareLinkDialog] = useState<any | null>(null);
  const [shareExpireDays, setShareExpireDays] = useState<number | "24h" | null>(7);
  const [sharingLink, setSharingLink] = useState(false);
  const [promotedFormalRecord, setPromotedFormalRecord] = useState<{ id: string; title: string; reason: "set-formal" | "next-formal" } | null>(null);
  const [compareRecords, setCompareRecords] = useState<any[]>([]);
  const [comparePickerOpen, setComparePickerOpen] = useState(false);
  const [comparePickerBaseRecord, setComparePickerBaseRecord] = useState<any | null>(null);
  const [compareDraftIds, setCompareDraftIds] = useState<string[]>([]);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareDetailMap, setCompareDetailMap] = useState<Record<string, any>>({});
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [compareViewMode, setCompareViewMode] = useState<"all" | "changed">("all");
  const [compareProjectSearch, setCompareProjectSearch] = useState("");
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [lockTooltip, setLockTooltip] = useState<{ top: number; left: number; text: string } | null>(null);
  const [systemDialog, setSystemDialog] = useState<QuotationDialogState | null>(null);
  const [textDialog, setTextDialog] = useState<QuotationTextDialogState | null>(null);
  const [editingRecordCustomer, setEditingRecordCustomer] = useState<any | null>(null);
  const [editingRecordProjectInfo, setEditingRecordProjectInfo] = useState<any | null>(null);
  const [recordProjectInfoForm, setRecordProjectInfoForm] = useState<RecordProjectInfoForm>(emptyRecordProjectInfoForm);
  const [recordProjectInfoSaving, setRecordProjectInfoSaving] = useState(false);
  const [recordProjectInfoMapPickerOpen, setRecordProjectInfoMapPickerOpen] = useState(false);
  const [bindQuotation, setBindQuotation] = useState<any | null>(null);
  const [bindCustomerSearch, setBindCustomerSearch] = useState("");
  const [bindCustomerOptions, setBindCustomerOptions] = useState<any[]>([]);
  const [bindCustomerLoading, setBindCustomerLoading] = useState(false);
  const [bindCustomerMore, setBindCustomerMore] = useState(false);
  const [selectedBindCustomer, setSelectedBindCustomer] = useState<any | null>(null);
  const [bindingCustomer, setBindingCustomer] = useState(false);
  const [copyQuotationDialog, setCopyQuotationDialog] = useState<any | null>(null);
  const [copyTargetMode, setCopyTargetMode] = useState<CopyQuotationTargetMode>("current");
  const [copyContentMode, setCopyContentMode] = useState<CopyQuotationContentMode>("full");
  const [copyCustomerSearch, setCopyCustomerSearch] = useState("");
  const [copyCustomerOptions, setCopyCustomerOptions] = useState<any[]>([]);
  const [copyCustomerLoading, setCopyCustomerLoading] = useState(false);
  const [copyCustomerMore, setCopyCustomerMore] = useState(false);
  const [selectedCopyCustomer, setSelectedCopyCustomer] = useState<any | null>(null);
  const [copyingQuotation, setCopyingQuotation] = useState(false);
  const [changeLogRecord, setChangeLogRecord] = useState<any | null>(null);
  const [changeLogs, setChangeLogs] = useState<QuotationChangeLog[]>([]);
  const [changeLogsLoading, setChangeLogsLoading] = useState(false);
  const [changeLogsError, setChangeLogsError] = useState("");
  const openRecordsRequestRef = useRef("");
  const router = useRouter();
  const { data: quotations, isLoading, refetch } = useQuotations();
  const { data: deletedQuotations, refetch: refetchDeletedQuotations } = useDeletedQuotations();
  const isTemporaryQuotationMode = ENABLE_TEMPORARY_QUOTATION && createMode === "temporary";
  const isNewCustomerMode = createMode === "new_customer";

  const confirmCreatedQuotationPersisted = async (quotationId: string) => {
    const id = String(quotationId || "").trim();
    if (!id) throw new Error("报价创建成功但未返回报价ID，请刷新预算记录后核对");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await api.get<any>(`/api/quotations/${id}`);
        const listResult = await refetch();
        const nextRecords = Array.isArray(listResult.data)
          ? listResult.data
          : await api.get<any[]>("/api/quotations");
        if (Array.isArray(nextRecords) && nextRecords.some((record: any) => String(record?.id || "") === id)) return;
      } catch (error) {
        if (attempt === 4) {
          const message = error instanceof Error ? error.message : "";
          throw new Error(message || "报价保存状态未确认，请刷新预算记录后核对");
        }
      }
      await waitForQuotationSaveCheck();
    }

    throw new Error("报价保存状态未确认，请勿重复创建，请刷新预算记录后核对");
  };

  useEffect(() => {
    setQuotaTemplates(loadQuotaTemplatesFromStorage());
  }, []);

  useEffect(() => {
    if (!ENABLE_TEMPORARY_QUOTATION && createMode === "temporary") setCreateMode("customer");
  }, [createMode]);

  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    const localTemplates = loadQuotaTemplatesFromStorage();
    setQuotaTemplates([]);
    const loadTemplates = async () => {
      try {
        const response = await fetch("/api/quota/templates", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || "读取预算模板失败");
        const serverTemplates = Array.isArray(data?.templates)
          ? data.templates.map(normalizeQuotaTemplate).filter((template: QuotaTemplateOption | null): template is QuotaTemplateOption => Boolean(template && template.status !== "disabled"))
          : [];
	        if (!cancelled) setQuotaTemplates(serverTemplates);
      } catch {
        if (!cancelled) setQuotaTemplates(localTemplates);
      }
    };
    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [showCreate]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    if (!quotaTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId("");
    }
  }, [quotaTemplates, selectedTemplateId]);

  useEffect(() => {
    const selectedTemplate = quotaTemplates.find((template) => template.id === selectedTemplateId) || null;
    if (selectedTemplate?.quoteConfig?.mode !== "package" || packageQuoteAreaText) return;
    setPackageQuoteAreaText(formatCreateAreaInput(isTemporaryQuotationMode ? temporaryCustomer.area : isNewCustomerMode ? quickCustomer.area_size : createCustomerSnapshot.area_size));
  }, [createCustomerSnapshot.area_size, isNewCustomerMode, isTemporaryQuotationMode, packageQuoteAreaText, quickCustomer.area_size, quotaTemplates, selectedTemplateId, temporaryCustomer.area]);

  useEffect(() => {
    if (!showCreate) return;
    const controller = new AbortController();
    setCreateCustomerLoading(true);
    const timer = window.setTimeout(() => {
      const keyword = createCustomerSearch.trim();
      const params = new URLSearchParams({ mode: "picker", limit: keyword ? "30" : "12" });
      if (keyword) params.set("search", keyword);
      const token = localStorage.getItem("zxgj_token");
      fetch(`/api/customers?${params.toString()}`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
        .then((response) => {
          if (!response.ok) throw new Error("客户搜索失败");
          return response.json();
        })
        .then((payload) => {
          setCreateCustomerOptions(Array.isArray(payload?.customers) ? payload.customers : []);
          setCreateCustomerTotal(Number(payload?.total || 0));
          setCreateCustomerMore(Boolean(payload?.hasMore));
        })
        .catch((error) => {
          if (error?.name !== "AbortError") {
            setCreateCustomerOptions([]);
            setCreateCustomerTotal(0);
            setCreateCustomerMore(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCreateCustomerLoading(false);
        });
    }, createCustomerSearch.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [createCustomerSearch, showCreate]);

  useEffect(() => {
    if (!showCreate || !isTemporaryQuotationMode) return;
    const nextTitle = buildTemporaryQuotationTitle(temporaryCustomer);
    if (title === "装修报价单" || title === "临时报价单" || !title.trim()) setTitle(nextTitle);
  }, [isTemporaryQuotationMode, showCreate, temporaryCustomer, title]);

  useEffect(() => {
    if (!bindQuotation) return;
    const controller = new AbortController();
    setBindCustomerLoading(true);
    const timer = window.setTimeout(() => {
      const keyword = bindCustomerSearch.trim();
      const params = new URLSearchParams({ mode: "picker", limit: keyword ? "30" : "12" });
      if (keyword) params.set("search", keyword);
      const token = localStorage.getItem("zxgj_token");
      fetch(`/api/customers?${params.toString()}`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
        .then((response) => {
          if (!response.ok) throw new Error("客户搜索失败");
          return response.json();
        })
        .then((payload) => {
          setBindCustomerOptions(Array.isArray(payload?.customers) ? payload.customers : []);
          setBindCustomerMore(Boolean(payload?.hasMore));
        })
        .catch((error) => {
          if (error?.name !== "AbortError") {
            setBindCustomerOptions([]);
            setBindCustomerMore(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setBindCustomerLoading(false);
        });
    }, bindCustomerSearch.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bindCustomerSearch, bindQuotation]);

  useEffect(() => {
    if (!copyQuotationDialog || copyTargetMode !== "other") return;
    const controller = new AbortController();
    setCopyCustomerLoading(true);
    const timer = window.setTimeout(() => {
      const keyword = copyCustomerSearch.trim();
      const params = new URLSearchParams({ mode: "picker", usage: "quotation-copy-target", limit: "1000" });
      if (keyword) params.set("search", keyword);
      const token = localStorage.getItem("zxgj_token");
      fetch(`/api/customers?${params.toString()}`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
        .then((response) => {
          if (!response.ok) throw new Error("客户搜索失败");
          return response.json();
        })
        .then((payload) => {
          const sourceCustomerId = String(copyQuotationDialog?.customer_id || "");
          setCopyCustomerOptions(
            (Array.isArray(payload?.customers) ? payload.customers : []).filter((customer: any) => {
              if (String(customer.id) === sourceCustomerId) return false;
              return normalizeCustomerStatus(customer?.status) !== "LOST";
            })
          );
          setCopyCustomerMore(Boolean(payload?.hasMore));
        })
        .catch((error) => {
          if (error?.name !== "AbortError") {
            setCopyCustomerOptions([]);
            setCopyCustomerMore(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCopyCustomerLoading(false);
        });
    }, copyCustomerSearch.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [copyCustomerSearch, copyQuotationDialog, copyTargetMode]);

  useEffect(() => {
    const refreshQuotations = () => {
      refetch();
      refetchDeletedQuotations();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshQuotations();
    };

    window.addEventListener("focus", refreshQuotations);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshQuotations);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refetch, refetchDeletedQuotations]);

  useEffect(() => {
    if (!lockTooltip) return;
    const hideTooltip = () => setLockTooltip(null);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    return () => {
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [lockTooltip]);

  useEffect(() => {
    if (!promotedFormalRecord) return;
    const timer = window.setTimeout(() => setPromotedFormalRecord(null), 3600);
    return () => window.clearTimeout(timer);
  }, [promotedFormalRecord]);

  useEffect(() => {
    setCompareRecords([]);
    setComparePickerOpen(false);
    setComparePickerBaseRecord(null);
    setCompareDraftIds([]);
    setCompareDialogOpen(false);
    setCompareDetailMap({});
    setCompareError("");
    setCompareViewMode("all");
    setCompareProjectSearch("");
  }, [recordCustomerKey, showRecycleBin]);

  useEffect(() => {
    if (!compareDialogOpen || compareRecords.length < 2) return;
    let cancelled = false;
    const loadCompareDetails = async () => {
      setCompareLoading(true);
      setCompareError("");
      try {
        const details = await Promise.all(compareRecords.map((record: any) => api.get<any>(`/api/quotations/${record.id}`)));
        if (cancelled) return;
        setCompareDetailMap(details.reduce((map: Record<string, any>, detail: any) => {
          map[String(detail.id)] = detail;
          return map;
        }, {}));
      } catch (err: any) {
        if (!cancelled) setCompareError(err.message || "读取报价明细失败");
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    };
    loadCompareDetails();
    return () => {
      cancelled = true;
    };
  }, [compareDialogOpen, compareRecords]);

  const getHouseText = (q: any) => {
    const community = String(q.customer_address || "").trim();
    const projectName = String(q.project_name || "").trim();
    const projectAddress = String(q.project_address || "").trim();
    const houseAddress = String(q.customer_house_address || "").trim();
    const roomNumber = buildQuotationRoomNumber(q);
    const baseAddress = community || projectName || projectAddress;
    if (roomNumber === "暂无房号") return baseAddress || "暂无房号";
    if (baseAddress && roomNumber) return `${baseAddress}${roomNumber}`;
    return baseAddress || houseAddress || "-";
  };
  const getCopyCustomerStatusView = (customer: any) => {
    const status = normalizeCustomerStatus(customer?.status);
    const toneMap: Record<string, string> = {
      NEW: "border-[#d0d7e2] bg-[#f2f4f7] text-[#475467]",
      CONTACTED: "border-[#cfe0ff] bg-[#edf4ff] text-[#245ee8]",
      INVITED: "border-[#d6bbfb] bg-[#f4f3ff] text-[#6941c6]",
      MEASURED: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
      DEPOSITED: "border-[#a6f4c5] bg-[#ecfdf3] text-[#027a48]",
      PROPOSAL: "border-[#bae6fd] bg-[#f0f9ff] text-[#026aa2]",
      SIGNED: "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]",
      LOST: "border-[#fecdca] bg-[#fef3f2] text-[#d92d20]",
    };
    return {
      label: customerStatusLabels[status] || status,
      className: toneMap[status] || toneMap.NEW,
    };
  };
  const getBudgetRecordTitle = (record: any) => {
    const houseText = getHouseText(record);
    return houseText && houseText !== "-" && houseText !== "暂无房号" ? `${houseText}装修报价单` : "装修报价单";
  };
  const getContactText = (q: any) => {
    const phone = String(q.customer_phone || "").trim();
    if (phone && phone !== "仅微信联系") return phone;
    return "-";
  };
  const getAreaText = (q: any) => {
    const area = q.project_area ?? q.customer_area_size;
    return area || area === 0 ? `${area} 平方` : "-";
  };
  const getLatestQuoteDate = (q: any) => q.updated_at || q.created_at;
  const getTimeValue = (value: any) => parseAppDate(value)?.getTime() || 0;
  const isApprovedRecord = (record: any) => String(record?.status || "").toUpperCase() === "APPROVED";
  const sortActiveRecordRows = (a: any, b: any) => {
    const approvedOrder = Number(isApprovedRecord(b)) - Number(isApprovedRecord(a));
    if (approvedOrder !== 0) return approvedOrder;
    return getTimeValue(getLatestQuoteDate(b)) - getTimeValue(getLatestQuoteDate(a));
  };
  const formatQuoteDateTime = (value: any) => formatDateTime(value);
  const formatChangeLogDateTime = (value: any) => {
    const date = parseAppDate(value);
    if (!date) return "-";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  };
  const formatChangeValue = (value: unknown) => {
    const text = String(value ?? "").trim();
    return text || "空";
  };
  const getChangeGroupKey = (change: QuotationChangeItem) => {
    return String(change.quotation_item_id || change.item_name || change.id || "").trim();
  };
  const isQuotaReplacementGroup = (group: QuotationChangeItem[]) => {
    if (group.length < 2 || group.some((change) => change.change_type !== "updated")) return false;
    const fields = new Set(group.map((change) => String(change.field_key || "").trim()).filter(Boolean));
    if (!fields.has("name")) return false;
    return ["spec", "remark", "material_cost", "labor_cost", "unit_price", "unit"].some((field) => fields.has(field));
  };
  const getQuotationChangeDisplayItems = (changes: QuotationChangeItem[]): QuotationChangeDisplayItem[] => {
    const grouped = new Map<string, QuotationChangeItem[]>();
    changes.forEach((change) => {
      const key = getChangeGroupKey(change);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(change);
    });

    const displayItems: QuotationChangeDisplayItem[] = [];
    const handledIds = new Set<string>();
    grouped.forEach((group, key) => {
      if (!isQuotaReplacementGroup(group)) return;
      group.forEach((change) => handledIds.add(change.id));
      const nameChange = group.find((change) => change.field_key === "name");
      const sample = nameChange || group[0];
      displayItems.push({
        kind: "replacement",
        id: `replacement-${key || sample.id}`,
        oldName: formatChangeValue(nameChange?.old_value || ""),
        newName: formatChangeValue(nameChange?.new_value || sample.item_name),
        space: sample.space,
        category: sample.category,
      });
    });

    changes.forEach((change) => {
      if (handledIds.has(change.id)) return;
      displayItems.push({ kind: "change", id: change.id, change });
    });
    return displayItems;
  };
  const getChangeLogDisplaySummary = (log: QuotationChangeLog, displayItems: QuotationChangeDisplayItem[]) => {
    const replacementCount = displayItems.filter((item) => item.kind === "replacement").length;
    if (replacementCount > 0 && displayItems.length === replacementCount) {
      return replacementCount === 1 ? "替换定额" : `替换 ${replacementCount} 项定额`;
    }
    return log.summary || `修改 ${log.change_count || log.changes.length} 项内容`;
  };
  const getChangeActionText = (change: QuotationChangeItem) => {
    const itemName = change.item_name || "未命名项目";
    if (change.change_type === "created") return `新增了「${itemName}」`;
    if (change.change_type === "deleted") return `删除了「${itemName}」`;
    return `修改了「${itemName}」的${change.field_label || "内容"}`;
  };
  const getChangeCategoryLabel = (value: unknown) => {
    const category = String(value || "").trim();
    if (!category) return "";
    if (category === "base" || category === "基装" || category === "基装项目") return "基装";
    if (category === "main_material" || category === "产品" || category === "产品项目") return "产品";
    if (category === "custom_cabinet" || category === "定制柜" || category === "定制柜项目") return "定制柜";
    if (category === "other" || category === "综合费用") return "综合费用";
    return category;
  };
  const openQuotationChangeLogs = async (record: any) => {
    setChangeLogRecord(record);
    setChangeLogs([]);
    setChangeLogsError("");
    setChangeLogsLoading(true);
    try {
      const result = await api.get<{ logs: QuotationChangeLog[] }>(`/api/quotations/${record.id}/change-logs`);
      setChangeLogs(Array.isArray(result.logs) ? result.logs : []);
    } catch (err: any) {
      setChangeLogsError(err.message || "读取报价变更记录失败");
    } finally {
      setChangeLogsLoading(false);
    }
  };
  const closeQuotationChangeLogs = () => {
    setChangeLogRecord(null);
    setChangeLogs([]);
    setChangeLogsError("");
    setChangeLogsLoading(false);
  };
  const filtered = (quotations ?? []).filter(
    (q: any) => [q.project_name, getHouseText(q), q.customer_name, q.customer_phone, q.customer_weixin, q.designer_name, q.customer_decoration_type].some((value) => String(value || "").includes(search))
  );
  const deletedFiltered = (deletedQuotations ?? []).filter(
    (q: any) => [q.project_name, getHouseText(q), q.customer_name, q.customer_phone, q.customer_weixin, q.designer_name, q.customer_decoration_type].some((value) => String(value || "").includes(search))
  );
  const getCustomerKey = (q: any) => q.is_unbound ? `unbound:${q.id}` : q.customer_id || q.customer_name || q.customer_phone || q.project_id || "";
  const quotationRecordsByCustomer = (quotations ?? []).reduce((groups: Record<string, any[]>, q: any) => {
    const key = getCustomerKey(q);
    if (!key) return groups;
    groups[key] = [...(groups[key] || []), q];
    return groups;
  }, {});
  const deletedQuotationRecordsByCustomer = (deletedQuotations ?? []).reduce((groups: Record<string, any[]>, q: any) => {
    const key = getCustomerKey(q);
    if (!key) return groups;
    groups[key] = [...(groups[key] || []), q];
    return groups;
  }, {});
  const activeCustomerGroups = filtered.reduce((groups: Record<string, any[]>, q: any) => {
    const key = getCustomerKey(q);
    if (!key) return groups;
    groups[key] = [...(groups[key] || []), q];
    return groups;
  }, {});
  const deletedOnlyCustomerGroups = deletedFiltered.reduce((groups: Record<string, any[]>, q: any) => {
    const key = getCustomerKey(q);
    if (!key || activeCustomerGroups[key]) return groups;
    groups[key] = [...(groups[key] || []), q];
    return groups;
  }, {});
  const customerRows = [
    ...Object.values(activeCustomerGroups),
    ...Object.values(deletedOnlyCustomerGroups),
  ].map((records) => [...records].sort(sortActiveRecordRows)[0]);
  const quotationPagination = useDataPagination(customerRows, search);
  const activeRecordRows = recordCustomerKey
    ? [...(quotationRecordsByCustomer[recordCustomerKey] || [])].sort(sortActiveRecordRows)
    : [];
  const activeDeletedRecordRows = recordCustomerKey
    ? [...(deletedQuotationRecordsByCustomer[recordCustomerKey] || [])].sort((a, b) => getTimeValue(b.deleted_at || getLatestQuoteDate(b)) - getTimeValue(a.deleted_at || getLatestQuoteDate(a)))
    : [];
  const visibleRecordRows = showRecycleBin ? activeDeletedRecordRows : activeRecordRows;
  const activeRecordCustomer = activeRecordRows[0] || activeDeletedRecordRows[0];
  const visibleFormalRecordCount = visibleRecordRows.filter((record: any) => isApprovedRecord(record)).length;
  const visibleSentRecordCount = visibleRecordRows.filter((record: any) => isSentToDesigner(record)).length;
  const visibleDraftRecordCount = visibleRecordRows.filter((record: any) => {
    return !isApprovedRecord(record) && !isSentToDesigner(record);
  }).length;
  const visibleRecordTotalAmount = visibleRecordRows.reduce((sum: number, record: any) => sum + getRecordAmount(record), 0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const shouldOpenRecords = params.get("openRecords") === "1";
    const shouldRefreshRecords = params.get("refreshRecords") === "1";
    if (!shouldOpenRecords && !shouldRefreshRecords) return;
    const fromQuotationId = String(params.get("fromQuotationId") || "").trim();
    const targetCustomerId = String(params.get("customerId") || "").trim();
    const requestKey = [
      shouldOpenRecords ? "open" : "refresh",
      targetCustomerId,
      fromQuotationId,
      params.get("t") || "",
    ].join(":");
    clearQuotationReturnParams(params);
    if (!fromQuotationId) {
      return;
    }
    if (shouldOpenRecords && !targetCustomerId) return;
    if (openRecordsRequestRef.current === requestKey) return;
    openRecordsRequestRef.current = requestKey;

    let cancelled = false;
    const handleReturnRefresh = async () => {
      let activeRows = quotations || [];
      let deletedRows = deletedQuotations || [];
      if (shouldRefreshRecords) {
        try {
          const [activeResult, deletedResult] = await Promise.all([refetch(), refetchDeletedQuotations()]);
          if (Array.isArray(activeResult.data)) activeRows = activeResult.data;
          if (Array.isArray(deletedResult.data)) deletedRows = deletedResult.data;
        } catch {
          // Existing query state is still usable if a background refresh fails.
        }
      } else if (!quotations && !deletedQuotations) {
        openRecordsRequestRef.current = "";
        return;
      }
      if (cancelled) return;

      if (shouldOpenRecords) {
        const rows = [...activeRows, ...deletedRows];
        const returnedRecord = rows.find((record: any) => String(record?.id || "").trim() === fromQuotationId);
        const matchedCustomerId = String(returnedRecord?.customer_id || "").trim();
        if (!returnedRecord || matchedCustomerId !== targetCustomerId) return;
        const targetRecord = rows.find((record: any) => String(record?.customer_id || "").trim() === targetCustomerId);
        const targetKey = targetRecord ? getCustomerKey(targetRecord) : "";
        if (targetKey) {
          setRecordCustomerKey(targetKey);
          setShowRecycleBin(false);
        }
      }
    };

    void handleReturnRefresh();
    return () => {
      cancelled = true;
    };
  }, [deletedQuotations, quotations, refetch, refetchDeletedQuotations]);
  const quickCustomerSnapshot = useMemo<CreateCustomerSnapshot>(() => ({
    phone: quickCustomer.phone,
    address: quickCustomer.address,
    address_location_name: quickCustomer.address_location_name,
    address_location_address: quickCustomer.address_location_address,
    address_latitude: quickCustomer.address_latitude,
    address_longitude: quickCustomer.address_longitude,
    building_no: quickCustomer.building_no,
    unit_no: quickCustomer.unit_no,
    room_no: quickCustomer.room_no,
    no_room_number: quickCustomer.no_room_number,
    area_size: quickCustomer.area_size,
    decoration_type: quickCustomer.decoration_type,
  }), [quickCustomer]);
  const quickCustomerPreview = useMemo(() => ({
    id: "",
    name: quickCustomer.name || "未命名客户",
    designer_name: quickCustomer.designer_name,
    phone: quickCustomer.phone,
    weixin: quickCustomer.weixin,
    address: quickCustomer.address,
    address_location_name: quickCustomer.address_location_name,
    address_location_address: quickCustomer.address_location_address,
    address_latitude: quickCustomer.address_latitude,
    address_longitude: quickCustomer.address_longitude,
    building_no: quickCustomer.no_room_number ? "" : quickCustomer.building_no,
    unit_no: quickCustomer.no_room_number ? "" : quickCustomer.unit_no,
    room_no: quickCustomer.no_room_number ? "" : quickCustomer.room_no,
    no_room_number: quickCustomer.no_room_number ? 1 : 0,
    area_size: toPricingAmount(quickCustomer.area_size),
    decoration_type: quickCustomer.decoration_type,
  }), [quickCustomer]);
  const selectedCustomerPreview = useMemo(
    () => mergeCustomerSnapshot(selectedCustomer, createCustomerSnapshot),
    [createCustomerSnapshot, selectedCustomer],
  );
  const quotaTemplateMatches = useMemo(() => {
    return quotaTemplates.map((template) => ({
      template,
    })).filter((item) => item.template.status !== "disabled");
  }, [quotaTemplates]);
  const templateSelectMatches = quotaTemplateMatches;
  const selectedTemplate = quotaTemplates.find((template) => template.id === selectedTemplateId) || null;
  const createCustomerResults = createCustomerOptions;
  const createCustomerKeyword = createCustomerSearch.trim();
  const createCustomerHasMore = createCustomerMore || createCustomerTotal > createCustomerResults.length;
  const createCustomerCountLabel = createCustomerKeyword
    ? `${createCustomerResults.length}${createCustomerHasMore ? "+" : ""}`
    : `最近 ${createCustomerResults.length}`;
  const buildLegacyNameQuotationTitle = (customer?: any) => {
    const ownerName = String(customer?.name || "").trim();
    const houseText = String(customer?.address || customer?.area || "").trim();
    const prefix = [ownerName, houseText].filter(Boolean).join("");
    return prefix ? `${prefix}装修报价单` : "装修报价单";
  };
  const shouldReplaceAutoQuotationTitle = (currentTitle: string, previousCustomer?: any) => {
    const trimmedTitle = currentTitle.trim();
    if (!trimmedTitle || trimmedTitle === "装修报价单" || trimmedTitle === "临时报价单") return true;
    return trimmedTitle === buildDefaultQuotationTitle(previousCustomer)
      || trimmedTitle === buildLegacyNameQuotationTitle(previousCustomer);
  };
  const selectCreateCustomer = (customer: any) => {
    const snapshot = makeCreateCustomerSnapshot(customer);
    setCustomerId(customer.id);
    setSelectedCustomer(customer);
    setCreateCustomerSnapshot(snapshot);
    setCreateMode("customer");
    setTitle(buildDefaultQuotationTitle(customer));
    setPackageQuoteAreaText(formatCreateAreaInput(snapshot.area_size));
  };
  const updateQuickCustomer = (patch: Partial<QuickCustomerDraft>) => {
    setQuickCustomer((prev) => {
      const next = { ...prev, ...patch };
      if (shouldReplaceAutoQuotationTitle(title, prev)) setTitle(buildDefaultQuotationTitle(next));
      return next;
    });
  };
  const setCreateCustomerAddressText = (value: string) => {
    setCreateCustomerSnapshot((prev) => ({
      ...prev,
      address: value,
      address_location_name: "",
      address_location_address: "",
      address_latitude: "",
      address_longitude: "",
    }));
  };
  const applyCreatePickedLocation = (location: LocationPick) => {
    const address = location.name || location.address;
    if (isTemporaryQuotationMode) {
      const nextTemporaryCustomer = { ...temporaryCustomer, address };
      setTemporaryCustomer(nextTemporaryCustomer);
      if (!title.trim() || title === "临时报价单") setTitle(buildTemporaryQuotationTitle(nextTemporaryCustomer));
    } else if (isNewCustomerMode) {
      updateQuickCustomer({
        address,
        address_location_name: location.name || location.address,
        address_location_address: location.address || location.name,
        address_latitude: location.latitude === null ? "" : String(location.latitude),
        address_longitude: location.longitude === null ? "" : String(location.longitude),
      });
    } else {
      setCreateCustomerSnapshot((prev) => ({
        ...prev,
        address,
        address_location_name: location.name || location.address,
        address_location_address: location.address || location.name,
        address_latitude: location.latitude === null ? "" : String(location.latitude),
        address_longitude: location.longitude === null ? "" : String(location.longitude),
      }));
    }
    setCreateMapPickerOpen(false);
  };
  const isPackageTemplate = selectedTemplate?.quoteConfig?.mode === "package";
  const packageQuoteArea = toPricingAmount(packageQuoteAreaText);
  const hasPackageQuoteArea = packageQuoteArea > 0;
  const packagePricePreview = isPackageTemplate ? calculatePackageQuotePrice(selectedTemplate?.quoteConfig, packageQuoteArea) : null;

  const showLockedQuotationTooltip = (event: ReactMouseEvent<HTMLElement>, text = "该报价已签合同，不能再撤销状态") => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 320;
    const height = 44;
    const gap = 8;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - width / 2),
      Math.max(12, window.innerWidth - width - 12),
    );
    const bottomTop = rect.bottom + gap;
    const top = bottomTop + height <= window.innerHeight - 12
      ? bottomTop
      : Math.max(12, rect.top - height - gap);

    setLockTooltip({
      top,
      left,
      text,
    });
  };

  const openQuotationRecords = (customerKey: string) => {
    setRecordCustomerKey(customerKey);
    setShowRecycleBin(false);
  };

  const openRecordCustomerEditor = (record: any) => {
    if (!record?.customer_id) return;
    if (record.customer_created_from_quotation === true || record.customer_created_from_quotation === 1) {
      setEditingRecordProjectInfo(record);
      setRecordProjectInfoForm(buildRecordProjectInfoForm(record));
      setMessage("");
      return;
    }
    setEditingRecordCustomer(buildEditableCustomerFromQuotationRecord(record));
  };

  const updateRecordProjectInfoAddressText = (value: string) => {
    setRecordProjectInfoForm((current) => ({
      ...current,
      customerAddress: value,
      houseAddress: value,
      addressLocationName: "",
      addressLocationAddress: "",
      addressLatitude: "",
      addressLongitude: "",
    }));
  };

  const applyRecordProjectInfoPickedLocation = (location: LocationPick) => {
    const address = location.name || location.address || "";
    const fullAddress = location.address || location.name || address;
    setRecordProjectInfoForm((current) => ({
      ...current,
      customerAddress: address,
      houseAddress: fullAddress,
      addressLocationName: address,
      addressLocationAddress: fullAddress,
      addressLatitude: location.latitude === null ? "" : String(location.latitude),
      addressLongitude: location.longitude === null ? "" : String(location.longitude),
    }));
    setRecordProjectInfoMapPickerOpen(false);
  };

  const closeRecordProjectInfoEditor = () => {
    if (recordProjectInfoSaving) return;
    setRecordProjectInfoMapPickerOpen(false);
    setEditingRecordProjectInfo(null);
    setRecordProjectInfoForm(emptyRecordProjectInfoForm);
  };

  const submitRecordProjectInfo = async () => {
    if (!editingRecordProjectInfo || recordProjectInfoSaving) return;
    const customerAddress = recordProjectInfoForm.customerAddress.trim();
    if (!customerAddress) {
      setMessage("请填写小区/地址");
      return;
    }
    setRecordProjectInfoSaving(true);
    setMessage("");
    try {
      await api.post(`/api/quotations/${editingRecordProjectInfo.id}`, {
        action: "updateProjectInfo",
        customer_name: recordProjectInfoForm.customerName.trim(),
        designer_name: recordProjectInfoForm.designerName.trim(),
        customer_phone: recordProjectInfoForm.customerPhone.trim(),
        customer_weixin: recordProjectInfoForm.customerWeixin.trim(),
        customer_address: customerAddress,
        house_address: recordProjectInfoForm.houseAddress.trim(),
        address_location_name: recordProjectInfoForm.addressLocationName.trim(),
        address_location_address: recordProjectInfoForm.addressLocationAddress.trim(),
        address_latitude: recordProjectInfoForm.addressLatitude,
        address_longitude: recordProjectInfoForm.addressLongitude,
        building_no: recordProjectInfoForm.noRoomNumber ? "" : recordProjectInfoForm.buildingNo.trim(),
        unit_no: recordProjectInfoForm.noRoomNumber ? "" : recordProjectInfoForm.unitNo.trim(),
        room_no: recordProjectInfoForm.noRoomNumber ? "" : recordProjectInfoForm.roomNo.trim(),
        no_room_number: recordProjectInfoForm.noRoomNumber,
        area_size: toPricingAmount(recordProjectInfoForm.areaSize),
        decoration_type: recordProjectInfoForm.decorationType.trim(),
        quote_notes: recordProjectInfoForm.notes.trim(),
        customer_visible_note: recordProjectInfoForm.customerVisibleNote.trim(),
      });
      setEditingRecordProjectInfo(null);
      setRecordProjectInfoForm(emptyRecordProjectInfoForm);
      await refetch();
      await refetchDeletedQuotations();
      setMessage("已保存客户资料");
    } catch (err: any) {
      setMessage(err.message || "保存客户资料失败");
    } finally {
      setRecordProjectInfoSaving(false);
    }
  };

  const openBindQuotationDialog = (record: any) => {
    setBindQuotation(record);
    setBindCustomerSearch(record.customer_phone || record.customer_name || "");
    setBindCustomerOptions([]);
    setSelectedBindCustomer(null);
    setMessage("");
  };

  const bindQuotationToCustomer = async () => {
    if (!bindQuotation || !selectedBindCustomer) return;
    setBindingCustomer(true);
    setMessage("");
    try {
      await api.post(`/api/quotations/${bindQuotation.id}`, { action: "bindCustomer", customer_id: selectedBindCustomer.id });
      await refetch();
      await refetchDeletedQuotations();
      setBindQuotation(null);
      setSelectedBindCustomer(null);
      setBindCustomerSearch("");
      setRecordCustomerKey("");
    } catch (err: any) {
      setMessage(err.message || "绑定客户失败");
    } finally {
      setBindingCustomer(false);
    }
  };

  const runRecordAction = async (recordId: string, action: () => Promise<void>) => {
    setRecordActionId(recordId);
    setMessage("");
    try {
      await action();
      await refetch();
      await refetchDeletedQuotations();
    } catch (err: any) {
      setMessage(err.message || "操作失败");
    } finally {
      setRecordActionId("");
    }
  };

  const showConfirm = ({
    title,
    message,
    tone = "danger",
    confirmText = "确定",
    cancelText = "取消",
    onConfirm,
  }: QuotationDialogState) => {
    setSystemDialog({ title, message, tone, confirmText, cancelText, onConfirm });
  };

  const copyQuotation = (record: any) => {
    setCopyQuotationDialog(record);
    setCopyTargetMode("current");
    setCopyContentMode("full");
    setCopyCustomerSearch("");
    setCopyCustomerOptions([]);
    setSelectedCopyCustomer(null);
    setCopyCustomerMore(false);
    setMessage("");
  };

  const closeCopyQuotationDialog = () => {
    if (copyingQuotation) return;
    setCopyQuotationDialog(null);
    setCopyTargetMode("current");
    setCopyContentMode("full");
    setCopyCustomerSearch("");
    setCopyCustomerOptions([]);
    setSelectedCopyCustomer(null);
    setCopyCustomerMore(false);
  };

  const confirmCopyQuotation = async () => {
    if (!copyQuotationDialog) return;
    if (copyTargetMode === "other" && !selectedCopyCustomer) {
      setMessage("请选择要复制到的客户");
      return;
    }
    setCopyingQuotation(true);
    setRecordActionId(copyQuotationDialog.id);
    setMessage("");
    try {
      const result = await api.post<{ id: string; customerId?: string | null; projectId?: string | null }>(`/api/quotations/${copyQuotationDialog.id}`, {
        action: "copy",
        target_customer_id: copyTargetMode === "other" ? selectedCopyCustomer?.id : undefined,
        copy_content_mode: copyContentMode,
      });
      const activeResult = await refetch();
      await refetchDeletedQuotations();
      const copiedCustomerId = String(result.customerId || "").trim();
      if (typeof window !== "undefined") {
        clearQuotationReturnParams(new URLSearchParams(window.location.search));
      }
      if (copiedCustomerId) {
        const nextRows = Array.isArray(activeResult.data) ? activeResult.data : quotations || [];
        const copiedRecord = nextRows.find((record: any) => String(record?.id || "") === String(result.id || ""))
          || nextRows.find((record: any) => String(record?.customer_id || "").trim() === copiedCustomerId);
        setRecordCustomerKey(copiedRecord ? getCustomerKey(copiedRecord) : copiedCustomerId);
        setShowRecycleBin(false);
      }
      setMessage(copyTargetMode === "other" ? "已复制到其他客户" : "已复制报价副本");
      setCopyQuotationDialog(null);
      setCopyTargetMode("current");
      setCopyContentMode("full");
      setCopyCustomerSearch("");
      setCopyCustomerOptions([]);
      setSelectedCopyCustomer(null);
      setCopyCustomerMore(false);
    } catch (err: any) {
      setMessage(err.message || "复制报价失败");
    } finally {
      setCopyingQuotation(false);
      setRecordActionId("");
    }
  };

  const setQuotationStatus = (record: any, status: string) => runRecordAction(record.id, async () => {
    const nextFormalRecord = status === "DRAFT"
      ? activeRecordRows.find((item: any) => String(item.id) !== String(record.id) && isApprovedRecord(item))
      : null;
    await api.post(`/api/quotations/${record.id}`, { action: "setStatus", status });
    setPromotedFormalRecord(
      status === "APPROVED"
        ? { id: String(record.id), title: getBudgetRecordTitle(record), reason: "set-formal" }
        : nextFormalRecord
          ? { id: String(nextFormalRecord.id), title: getBudgetRecordTitle(nextFormalRecord), reason: "next-formal" }
          : null
    );
  });

  const openComparePicker = (record: any) => {
    const recordId = String(record.id);
    const seedIds = compareRecords.some((item: any) => String(item.id) === recordId)
      ? compareRecords.map((item: any) => String(item.id))
      : [recordId, ...compareRecords.map((item: any) => String(item.id)).filter((id) => id !== recordId)].slice(0, MAX_COMPARE_RECORDS);
    setComparePickerBaseRecord(record);
    setCompareDraftIds(seedIds);
    setComparePickerOpen(true);
    setCompareError("");
  };

  const toggleCompareDraftId = (recordId: string) => {
    setCompareDraftIds((current) => {
      if (current.includes(recordId)) return current.filter((id) => id !== recordId);
      if (current.length >= MAX_COMPARE_RECORDS) return current;
      return [...current, recordId];
    });
  };

  const confirmCompareSelection = () => {
    if (compareDraftIds.length < 2) {
      setCompareError("请至少选择 2 份报价进行对比");
      return;
    }
    const selectedRecords = compareDraftIds
      .map((id) => activeRecordRows.find((record: any) => String(record.id) === id))
      .filter(Boolean);
    if (selectedRecords.length < 2) {
      setCompareError("选择的报价不存在，请重新选择");
      return;
    }
    setCompareRecords(selectedRecords.slice(0, MAX_COMPARE_RECORDS));
    setComparePickerOpen(false);
    setComparePickerBaseRecord(null);
    setCompareDetailMap({});
    setCompareError("");
    setCompareViewMode("all");
    setCompareProjectSearch("");
    setCompareDialogOpen(true);
  };

  const resetCompareRecords = () => {
    setCompareRecords([]);
    setComparePickerOpen(false);
    setComparePickerBaseRecord(null);
    setCompareDraftIds([]);
    setCompareDialogOpen(false);
    setCompareDetailMap({});
    setCompareError("");
    setCompareViewMode("all");
    setCompareProjectSearch("");
  };

  const sendQuotationToDesigner = (record: any) => runRecordAction(record.id, async () => {
    await api.post(`/api/quotations/${record.id}`, { action: "sendToDesigner" });
    window.dispatchEvent(new Event("todos:changed"));
  });

  const cancelSendQuotationToDesigner = (record: any) => runRecordAction(record.id, async () => {
    await api.post(`/api/quotations/${record.id}`, { action: "cancelSendToDesigner" });
    window.dispatchEvent(new Event("todos:changed"));
  });

  const updateQuotationNotes = (record: any) => {
    setTextDialog({
      title: "编辑报价备注",
      description: "备注会保存到当前报价记录，便于后续查找和交接。",
      label: "报价备注",
      defaultValue: record.notes || "",
      placeholder: "请输入报价备注",
      confirmText: "保存",
      onConfirm: (notes) => {
        runRecordAction(record.id, async () => {
          await api.post(`/api/quotations/${record.id}`, { action: "updateNotes", notes });
        });
      },
    });
  };

  const deleteQuotation = (record: any) => {
    showConfirm({
      title: "删除报价",
      message: `确定删除「${record.title || "装修报价单"}」吗？删除后会进入回收站。`,
      confirmText: "删除",
      onConfirm: () => {
        runRecordAction(record.id, async () => {
          await api.del(`/api/quotations/${record.id}`);
        });
      },
    });
  };

  const restoreQuotation = (record: any) => {
    runRecordAction(record.id, async () => {
      await api.post(`/api/quotations/${record.id}`, { action: "restore" });
      setShowRecycleBin(false);
    });
  };

  const hardDeleteQuotation = (record: any) => {
    showConfirm({
      title: "彻底删除报价",
      message: `确定彻底删除「${record.title || "装修报价单"}」吗？彻底删除后将无法恢复。`,
      confirmText: "彻底删除",
      onConfirm: () => {
        runRecordAction(record.id, async () => {
          await api.post(`/api/quotations/${record.id}`, { action: "hardDelete" });
        });
      },
    });
  };

  const openShareLinkDialog = (record: any) => {
    setShareLinkDialog(record);
    setShareExpireDays(7);
    setMessage("");
  };

  const copyShareLink = async () => {
    if (!shareLinkDialog) return;
    const record = shareLinkDialog;
    try {
      setSharingLink(true);
      const url = await createQuotationShareUrl(record.id, shareExpireDays);
      if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持自动复制，请手动复制链接");
      await navigator.clipboard.writeText(url);
      setMessage("");
      setShareLinkDialog(null);
      setCopiedLinkId(record.id);
      window.setTimeout(() => {
        setCopiedLinkId((current) => current === record.id ? "" : current);
      }, 2000);
    } catch (err: any) {
      setMessage(err.message || "复制链接失败");
    } finally {
      setSharingLink(false);
    }
  };

  const printQuotation = async (record: any) => {
    const previewUrl = await createQuotationPrintPreviewUrl(record.id).catch((err) => {
      setMessage(err.message || "生成打印链接失败");
      return "";
    });
    if (!previewUrl) return;
    const previewWindow = window.open(previewUrl, "_blank");
    if (!previewWindow) window.location.href = previewUrl;
  };

  const compareDisplayRecords = compareRecords.map((record: any) => compareDetailMap[String(record.id)] || record);
  const compareSummaries = compareDisplayRecords.map((record: any) => buildQuotationCompareSummary(record));
  const compareReady = compareDisplayRecords.length >= 2 && compareSummaries.length === compareDisplayRecords.length;
  const compareCandidateRows = activeRecordRows.filter((record: any) => !record.is_unbound);
  const compareTotalAmounts = compareReady ? compareSummaries.map((summary) => Number(summary.total || 0)) : [];
  const compareMaxTotal = compareTotalAmounts.length ? Math.max(...compareTotalAmounts) : 0;
  const compareMinTotal = compareTotalAmounts.length ? Math.min(...compareTotalAmounts) : 0;
  const compareTotalDiff = compareMaxTotal - compareMinTotal;
  const compareDiscountAmounts = compareReady ? compareSummaries.map((summary) => Number(summary.discount || 0)) : [];
  const compareDiscountDiff = compareDiscountAmounts.length ? Math.max(...compareDiscountAmounts) - Math.min(...compareDiscountAmounts) : 0;
  const compareGridTemplateColumns = `minmax(220px, 320px) repeat(${compareDisplayRecords.length}, minmax(160px, 1fr)) 130px`;
  const compareTableMinWidth = 350 + compareDisplayRecords.length * 160;
  const compareCategoryRows = compareReady
    ? [
      { key: "base", label: "基装" },
      { key: "main_material", label: "产品" },
      { key: "custom_cabinet", label: "定制柜" },
      { key: "other", label: "综合费用" },
      { key: "discount", label: "报价优惠" },
      { key: "final", label: "报价总费用" },
    ].map((category) => {
      const rows = compareSummaries.map((summary) => summary.categoryRows.find((row: any) => row.key === category.key) || null);
      const amounts = rows.map((row) => Number(row?.amount || 0));
      const counts = rows.map((row) => Number(row?.count || 0));
      const maxAmount = Math.max(...amounts);
      const minAmount = Math.min(...amounts);
      return {
        ...category,
        rows,
        amounts,
        counts,
        diff: maxAmount - minAmount,
        maxAmount,
        minAmount,
        changed: maxAmount > minAmount + 0.005 || new Set(counts).size > 1,
      };
    })
    : [];
  const compareSpaceKeys = compareReady
    ? Array.from(new Set(compareSummaries.flatMap((summary) => summary.spaceRows.map((row: any) => row.key))))
    : [];
  const compareDetailRows = compareSpaceKeys.map((key) => {
    const rows = compareSummaries.map((summary) => summary.spaceRows.find((row: any) => row.key === key) || null);
    const baseRow = rows.find(Boolean);
    const amounts = rows.map((row) => Number(row?.total || 0));
    const counts = rows.map((row) => Number(row?.count || 0));
    const maxAmount = Math.max(...amounts);
    const minAmount = Math.min(...amounts);
    return {
      key,
      label: baseRow?.label || "-",
      kind: baseRow?.kind || "base",
      rows,
      amounts,
      counts,
      diff: maxAmount - minAmount,
      maxAmount,
      minAmount,
      changed: maxAmount > minAmount + 0.005 || new Set(counts).size > 1,
    };
  });
  const compareProjectKeys = compareReady
    ? Array.from(new Set(compareSummaries.flatMap((summary) => summary.projectRows.map((row: any) => row.key))))
    : [];
  const compareProjectRows = compareProjectKeys.map((key) => {
    const rows = compareSummaries.map((summary) => summary.projectRows.find((row: any) => row.key === key) || null);
    const baseRow = rows.find(Boolean);
    const amounts = rows.map((row) => Number(row?.total || 0));
    const counts = rows.map((row) => Number(row?.count || 0));
    const maxAmount = Math.max(...amounts);
    const minAmount = Math.min(...amounts);
    return {
      key,
      label: baseRow?.label || "-",
      space: baseRow?.space || "-",
      kind: baseRow?.kind || "base",
      amounts,
      counts,
      diff: maxAmount - minAmount,
      maxAmount,
      minAmount,
      changed: maxAmount > minAmount + 0.005 || new Set(counts).size > 1,
    };
  });
  const compareProjectSearchText = compareProjectSearch.trim().toLowerCase();
  const visibleCompareProjectRows = compareProjectRows.filter((row) => {
    if (compareViewMode === "changed" && !row.changed) return false;
    if (!compareProjectSearchText) return true;
    return `${row.label} ${row.key}`.toLowerCase().includes(compareProjectSearchText);
  });
  const compareSearchMatchedCount = visibleCompareProjectRows.length;
  const visibleCompareProjectGroups = [
    { kind: "base" as QuotationCompareKind, label: "基装" },
    { kind: "main_material" as QuotationCompareKind, label: "产品" },
    { kind: "custom_cabinet" as QuotationCompareKind, label: "定制柜" },
  ].map((group) => ({
    ...group,
    rows: visibleCompareProjectRows.filter((row) => row.kind === group.kind),
  })).filter((group) => group.rows.length > 0);
  const compareChangedCount = compareCategoryRows.filter((row) => row.changed).length + compareProjectRows.filter((row) => row.changed).length;
  const renderCompareDiffCell = (diff: number, label = "高出") => {
    const hasDiff = Number(diff || 0) >= 0.005;
    return (
      <div className={`quotation-compare-diff-cell h-full px-4 py-2.5 text-right ${hasDiff ? "quotation-compare-diff-cell-hot" : "quotation-compare-diff-cell-flat"}`}>
        <div className="flex h-full flex-col items-end justify-center">
          <span className={`text-[11px] font-semibold ${hasDiff ? "text-red-500" : "text-[#8a97aa]"}`}>{hasDiff ? label : "持平"}</span>
          <span className={`mt-0.5 text-xs font-bold tabular-nums ${hasDiff ? "text-red-600" : "text-[#475467]"}`}>
            {hasDiff ? formatRecordAmount(diff) : "-"}
          </span>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="quotation-contract-ui quotation-index-workbench customer-list-ui enterprise-list-ui">
        <section className="quotation-index-table-panel flex min-h-0 flex-1 items-center justify-center overflow-hidden text-[#4B5563]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary-600" />
          正在加载报价合同...
        </section>
      </div>
    );
  }

  return (
    <div className="quotation-contract-ui quotation-index-workbench customer-list-ui enterprise-list-ui">
      <section className="quotation-index-toolbar shrink-0">
        <div className="quotation-index-toolbar-inner">
          <div className="quotation-index-heading">
            <span className="quotation-index-heading-icon">
              <ReceiptText className="h-[18px] w-[18px]" />
            </span>
            <h1 className="quotation-index-title">报价合同列表</h1>
          </div>
          <div className="quotation-index-toolbar-actions">
            <div className="quotation-index-search-wrap">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="搜索房号 / 客户姓名 / 手机号 / 设计师"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="quotation-index-input w-full border bg-white pl-9 pr-3 outline-none transition placeholder:text-[#9CA3AF] focus:border-[#407AFF] focus:ring-[3px] focus:ring-[#407AFF]/20"
              />
            </div>
            <button
              onClick={() => {
                setCustomerId("");
                setCreateMode("new_customer");
                setSelectedCustomer(null);
                setCreateCustomerSnapshot(emptyCreateCustomerSnapshot);
                setQuickCustomer(emptyQuickCustomerDraft);
                setTemporaryCustomer({ name: "", phone: "", weixin: "", address: "", area: "", decoration_type: "" });
                setCreateCustomerSearch("");
                setCreateCustomerOptions([]);
                setCreateCustomerTotal(0);
                setCreateCustomerMore(false);
                setTitle("装修报价单");
                setCreateNotes("");
                setCreateCustomerVisibleNote("");
                setSelectedTemplateId("");
                setPackageQuoteAreaText("");
                setShowCreate(true);
              }}
              className="quotation-index-primary-button inline-flex min-w-[112px] shrink-0 items-center justify-center gap-2 whitespace-nowrap border px-4 text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              新建报价
            </button>
          </div>
        </div>
      </section>

      <section className="quotation-index-table-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <ThinScrollArea className="min-h-0 flex-1" scrollClassName="h-full">
          <table className="quotation-list-table w-full min-w-[1420px] table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col className="w-[68px]" />
              <col className="w-[260px]" />
              <col className="w-[116px]" />
              <col className="w-[116px]" />
              <col className="w-[146px]" />
              <col className="w-[96px]" />
              <col className="w-[130px]" />
              <col className="w-[116px]" />
              <col className="w-[124px]" />
              <col className="w-[104px]" />
              <col className="w-[150px]" />
              <col className="w-[134px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[#EEF3F8]">
              <tr>
                <th className="quotation-index-th quotation-index-center">序号</th>
                <th className="quotation-index-th">房号</th>
                <th className="quotation-index-th quotation-index-center">客户姓名</th>
                <th className="quotation-index-th quotation-index-center">设计师</th>
                <th className="quotation-index-th quotation-index-center">手机号</th>
                <th className="quotation-index-th quotation-index-center">面积</th>
                <th className="quotation-index-th quotation-index-number">合同金额</th>
                <th className="quotation-index-th quotation-index-center">报价类型</th>
                <th className="quotation-index-th quotation-index-center">合同状态</th>
                <th className="quotation-index-th quotation-index-center">报价份数</th>
                <th className="quotation-index-th quotation-index-center">最新报价日期</th>
                <th className="quotation-index-th quotation-sticky-action sticky right-0 z-20 whitespace-nowrap">报价记录</th>
              </tr>
            </thead>
            <tbody>
              {customerRows.length > 0 ? quotationPagination.pageItems.map((q: any, index: number) => {
                const customerKey = getCustomerKey(q);
                const recordCount = quotationRecordsByCustomer[customerKey]?.length || 0;
                return (
	                  <tr
	                    key={q.id}
	                    onClick={() => openQuotationRecords(customerKey)}
		                    className="quotation-index-row group h-[56px] cursor-pointer align-middle"
	                  >
	                    <td className="quotation-index-td quotation-index-center tabular-nums">{(quotationPagination.page - 1) * quotationPagination.pageSize + index + 1}</td>
	                    <td className="quotation-index-td">
	                      <span className="quotation-index-primary quotation-index-house block truncate text-left" title={getHouseText(q)}>{getHouseText(q)}</span>
	                    </td>
	                    <td className="quotation-index-td quotation-index-center">
	                      <span className="inline-flex max-w-full items-center justify-center gap-1.5">
	                        <span className="truncate">{q.customer_name || "-"}</span>
	                        {q.is_unbound ? <span className="quotation-index-tag border-amber-200 bg-amber-50 text-amber-700">未绑定</span> : null}
	                      </span>
	                    </td>
	                    <td className="quotation-index-td quotation-index-center">{q.designer_name || "-"}</td>
	                    <td className="quotation-index-td quotation-index-center tabular-nums">{getContactText(q)}</td>
	                    <td className="quotation-index-td quotation-index-center">{getAreaText(q)}</td>
	                    <td className="quotation-index-td quotation-index-amount quotation-index-number tabular-nums">{formatRecordAmount(getSignedContractAmount(q))}</td>
	                    <td className="quotation-index-td quotation-index-center">
	                      {q.customer_decoration_type ? (
	                        <span className="quotation-index-tag quotation-index-tag-neutral">
	                          {q.customer_decoration_type}
	                        </span>
	                      ) : "-"}
	                    </td>
	                    <td className="quotation-index-td quotation-index-center">
	                      <span className={`quotation-index-tag ${getContractStatusClass(q)}`}>
	                        {formatContractStatus(q)}
	                      </span>
	                    </td>
	                    <td className="quotation-index-td quotation-index-center">
	                      <span className="quotation-index-tag quotation-index-tag-neutral">{recordCount} 份</span>
	                    </td>
	                    <td className="quotation-index-td quotation-index-center tabular-nums">
	                      {formatQuoteDateTime(getLatestQuoteDate(q))}
	                    </td>
	                    <td className="quotation-index-td quotation-sticky-action sticky right-0 bg-white text-center">
	                      <button
	                        type="button"
	                        onClick={(event) => {
                          event.stopPropagation();
                          openQuotationRecords(customerKey);
                        }}
	                        className="quotation-index-row-action"
	                      >
	                        <History className="h-3.5 w-3.5" />
	                        查看记录
                      </button>
                    </td>
                  </tr>
                );
              }) : (
	                <tr className="quotation-index-empty-row">
	                  <td colSpan={12} className="quotation-index-empty-cell h-[360px] py-14 text-center">
	                    <div className="mx-auto max-w-sm px-6 py-8">
	                      <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#D6E2F1] bg-[#F8FBFF] text-[#407AFF]">
	                        <ReceiptText className="h-7 w-7" />
	                      </span>
	                      <p className="text-sm font-semibold text-[#182230]">暂无报价数据</p>
	                      <p className="mt-1 text-xs font-normal text-[#667085]">可以点击右上角新建报价，为客户创建第一份报价记录。</p>
	                    </div>
	                  </td>
	                </tr>
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        <div className="quotation-index-pagination shrink-0">
          <DataPagination
            total={customerRows.length}
            page={quotationPagination.page}
            pageSize={quotationPagination.pageSize}
            onPageChange={quotationPagination.setPage}
            onPageSizeChange={quotationPagination.setPageSize}
            itemName="位客户"
          />
        </div>
      </section>

      {recordCustomerKey && (
        <div className="fixed bottom-0 right-0 top-0 z-50 flex items-center justify-center bg-[#111827]/28 p-4 md:left-[var(--active-sidebar-width)] md:p-6 max-md:left-0">
          <div className="quotation-record-modal-v2 flex min-h-[520px] max-h-[min(760px,calc(100dvh-72px))] w-full max-w-[1440px] flex-col overflow-hidden border border-[#d9e2ef] bg-white shadow-none">
            <div className="quotation-record-unified-header shrink-0 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#407aff]">
                  <ReceiptText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold text-[#182230]">
                    {activeRecordCustomer?.is_unbound ? `${activeRecordCustomer?.customer_name || "临时客户"}的临时报价` : `${activeRecordCustomer?.customer_name || "客户"}的${showRecycleBin ? "回收站" : "预算记录"}`}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-[#667085]">
                    {showRecycleBin ? "管理已删除报价，可恢复或彻底删除" : "管理报价版本、正式状态与设计协作"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!showRecycleBin && activeRecordCustomer?.id ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openRecordCustomerEditor(activeRecordCustomer);
                    }}
                    disabled={!activeRecordCustomer?.customer_id}
                    className="group inline-flex min-h-9 items-center gap-2 rounded-[9px] border border-[#bfe8d3] bg-[#f1fbf6] px-3 text-xs font-semibold text-[#167457] shadow-none transition hover:border-[#8fd8b0] hover:bg-white hover:text-[#0f5f47]"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-[6px] border border-[#bfe8d3] bg-white text-[#159863] shadow-none transition group-hover:bg-[#e8f8ef]">
                      <Pencil className="h-3.5 w-3.5" />
                    </span>
                    编辑资料
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowRecycleBin((value) => !value)}
                  className={`group inline-flex min-h-9 items-center gap-2 rounded-[9px] border px-3 text-xs font-semibold shadow-none transition ${
                    showRecycleBin
                      ? "border-[#cfe0ff] bg-[#edf4ff] text-[#407aff] hover:bg-white"
                      : "border-[#d9e2ef] bg-white text-[#52647b] hover:border-[#b8c2d0] hover:bg-[#fbfcfe] hover:text-[#182230]"
                  }`}
                >
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-[6px] border shadow-none transition ${
                    showRecycleBin ? "border-[#cfe0ff] bg-white text-[#407aff]" : "border-[#d9e2ef] bg-[#f2f5f9] text-[#667085] group-hover:bg-white"
                  }`}>
                    {showRecycleBin ? <History className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </span>
                  {showRecycleBin ? "返回记录" : `回收站 ${activeDeletedRecordRows.length}`}
                </button>
                <button type="button" onClick={() => setRecordCustomerKey("")} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]" aria-label="关闭报价记录">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="quotation-record-summary-row mt-3 flex flex-wrap items-center gap-2">
              <div className="quotation-record-summary-pill"><span>{showRecycleBin ? "已删除" : "共"}</span><strong>{visibleRecordRows.length}</strong><span>份报价</span></div>
              <div className="quotation-record-summary-pill"><span>正式</span><strong className="text-emerald-700">{visibleFormalRecordCount}</strong></div>
              <div className="quotation-record-summary-pill"><span>已发送</span><strong className="text-[#407aff]">{visibleSentRecordCount}</strong></div>
              <div className="quotation-record-summary-pill"><span>草稿</span><strong className="text-[#667085]">{visibleDraftRecordCount}</strong></div>
              <div className="quotation-record-summary-pill quotation-record-summary-total"><span>报价合计</span><strong>¥ {formatRecordAmount(visibleRecordTotalAmount)}</strong></div>
            </div>
            </div>

            {message && <p className="mx-4 mt-4 rounded-[8px] border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
            {!showRecycleBin && promotedFormalRecord ? (
              <div className="mx-4 mt-4 flex items-center gap-2 rounded-[8px] border border-[#b7e9ca] bg-[#f0fdf4] px-3 py-2 text-xs font-medium text-[#027a48]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {promotedFormalRecord.reason === "next-formal"
                    ? `原正式报价已撤销，「${promotedFormalRecord.title || "装修报价单"}」已自动置顶到第一行`
                    : `已将「${promotedFormalRecord.title || "装修报价单"}」设为正式报价，并置顶到第一行`}
                </span>
              </div>
            ) : null}
            <div className="quotation-record-list-body min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] p-3 md:p-4">
              {visibleRecordRows.length > 0 ? (
                <div className="space-y-3">
                  {visibleRecordRows.map((record: any) => {
                    const busy = recordActionId === record.id;
                    const isFormalQuotation = isApprovedRecord(record);
                    const isJustPromotedFormal = promotedFormalRecord?.id === String(record.id) && isFormalQuotation;
                    const isSentQuotation = isSentToDesigner(record);
                    const lockedBySignedContract = isFormalQuotation && isUsedBySignedContract(record);
                    const recordStatusLabel = formatRecordStatus(record);
                    const recordStatusTone = lockedBySignedContract
                      ? "signed"
                      : isFormalQuotation
                        ? "formal"
                        : isSentQuotation
                          ? "sent"
                          : "draft";
                    const deleteDisabledReason = lockedBySignedContract
                      ? "已签合同的报价不能删除"
                      : isFormalQuotation
                        ? "正式报价不能删除"
                        : "";
                    const compareDisabledReason = compareCandidateRows.length < 2
                      ? "当前预算记录只有 1 份报价，至少需要 2 份报价才能进行对比"
                      : "";
                    const costSummary = getRecordCostSummary(record);
	                    const costBreakdown = [
	                      { label: "基装", amount: Number(record?.base_amount || 0) },
	                      { label: "产品", amount: Number(record?.main_material_amount || 0) + Number(record?.custom_direct_amount || 0) },
	                      { label: "综合费用", amount: Number(record?.other_amount || 0), alwaysShow: true },
	                    ].filter((item) => Number.isFinite(item.amount) && (item.alwaysShow || Math.abs(item.amount) >= 0.01));
	                    const quotaTemplateName = getRecordQuotaTemplateName(record);
	                    const actionBaseClass = "inline-flex h-8 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";
                    const secondaryActionClass = `${actionBaseClass} border-[#d7dfeb] bg-white text-[#475467] hover:border-[#b8c2d0] hover:bg-[#f8fafc] hover:text-[#182230] focus-visible:ring-[#407aff]/15`;
                    const softActionClass = `${actionBaseClass} border-[#dce4ef] bg-white text-[#52647b] hover:border-[#cfe0ff] hover:bg-[#f3f7ff] hover:text-[#245ee8] focus-visible:ring-[#407aff]/15`;
                    const dangerActionClass = `${actionBaseClass} border-[#f3c5c0] bg-white text-[#d92d20] hover:border-[#fda29b] hover:bg-[#fff6f5] focus-visible:ring-[#d92d20]/15`;
                    return (
                      <article key={record.id} className={`quotation-record-card grid gap-4 border bg-white p-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,42%)] xl:items-center ${isJustPromotedFormal ? "quotation-record-card-promoted border-[#75d99a]" : "border-[#e2e7ee]"}`}>
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3 xl:block">
	                            <div className="min-w-0">
	                              {showRecycleBin ? (
	                                <span className="block truncate text-sm font-semibold text-[#182230]" title={getBudgetRecordTitle(record)}>{getBudgetRecordTitle(record)}</span>
	                              ) : (
	                                <Link href={`/quotations/${record.id}`} className="block truncate text-sm font-semibold text-[#182230] transition hover:text-[#407aff]" title={getBudgetRecordTitle(record)}>{getBudgetRecordTitle(record)}</Link>
	                              )}
	                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#667085]">
	                                <span className="tabular-nums">{formatQuoteDateTime(getLatestQuoteDate(record))}</span>
	                                <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 ${
	                                  quotaTemplateName
	                                    ? "border-[#cfe0ff] bg-[#f3f7ff] text-[#2f66e8]"
	                                    : "border-[#e3e9f2] bg-[#f8fafc] text-[#98a2b3]"
	                                }`} title={quotaTemplateName ? `定额模板：${quotaTemplateName}` : "未记录定额模板"}>
	                                  <FileText className="h-3 w-3 shrink-0" />
	                                  <span className="max-w-[220px] truncate">{quotaTemplateName || "未记录定额模板"}</span>
	                                </span>
	                              </div>
	                            </div>
	                          </div>
                          {isJustPromotedFormal ? (
                            <span className="quotation-record-promoted-badge mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#a6e7c0] bg-[#ecfdf3] px-2.5 py-1 text-xs font-semibold text-[#027a48]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {promotedFormalRecord?.reason === "next-formal" ? "下一份正式报价已置顶" : "刚刚设为正式，已置顶显示"}
                            </span>
                          ) : null}
                          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                            <p className="text-[22px] font-semibold leading-7 text-red-600">
                              <span className="tabular-nums">¥ {formatRecordAmount(getRecordAmount(record))}</span>
                            </p>
                            {costBreakdown.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {costBreakdown.map((item) => (
                                  <span key={item.label} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#e3e9f2] bg-[#f8fafc] px-2.5 text-xs font-medium text-[#667085]">
                                    <span>{item.label}</span>
                                    <span className="font-semibold tabular-nums text-[#344054]">{formatRecordAmount(item.amount)}</span>
                                  </span>
                                ))}
                              </div>
                            ) : costSummary ? <span className="text-xs font-medium tabular-nums text-[#667085]">{costSummary}</span> : null}
                          </div>
                          <button type="button" onClick={() => updateQuotationNotes(record)} className={`quotation-record-note mt-2 inline-flex max-w-full items-start gap-1.5 rounded-[7px] px-1.5 py-1 text-left text-xs leading-5 transition hover:bg-[#edf4ff] hover:text-[#407aff] ${record.notes ? "text-[#667085]" : "text-[#98a2b3]"}`} title={record.notes || "添加备注"}>
                            <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{record.notes || "添加备注"}</span>
                          </button>
                          {record.latest_change_at ? (
                            <div className="mt-2 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-[#667085]">
                              <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-[#f4f7fb] px-2 py-1 text-[#52647b]">
                                <History className="h-3.5 w-3.5 text-[#407aff]" />
                                <span className="truncate">
                                  最近修改：{record.latest_change_user_name || "未知用户"} · {formatChangeLogDateTime(record.latest_change_at)} · {record.latest_change_summary || `修改 ${record.latest_change_count || 0} 项内容`}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => openQuotationChangeLogs(record)}
                                className="inline-flex items-center gap-1 rounded-[7px] px-1.5 py-1 font-medium text-[#407aff] transition hover:bg-[#edf4ff]"
                              >
                                查看变更
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div className="quotation-record-action-panel xl:justify-self-end xl:w-full">
                          <div className="quotation-record-action-head mb-2.5 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-[#98a2b3]">{showRecycleBin ? "回收站操作" : "操作"}</span>
                            <span className="quotation-status-stamp" data-tone={recordStatusTone}>{recordStatusLabel}</span>
                          </div>

                          {showRecycleBin ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button type="button" disabled={busy} onClick={() => restoreQuotation(record)} className={`${actionBaseClass} border-[#407aff] bg-[#407aff] text-white hover:border-[#2f66e8] hover:bg-[#2f66e8] focus-visible:ring-[#407aff]/20`}>
                                <RotateCcw className="h-3.5 w-3.5" />恢复报价
                              </button>
                              <span className="inline-flex w-full" onMouseEnter={deleteDisabledReason ? (event) => showLockedQuotationTooltip(event, deleteDisabledReason) : undefined} onMouseLeave={() => setLockTooltip(null)}>
                                <button type="button" disabled={busy || Boolean(deleteDisabledReason)} onClick={() => hardDeleteQuotation(record)} className={dangerActionClass}>
                                  <Trash2 className="h-3.5 w-3.5" />彻底删除
                                </button>
                              </span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <Link href={`/quotations/${record.id}`} className={`${actionBaseClass} border-[#407aff] bg-[#407aff] text-white hover:border-[#2f66e8] hover:bg-[#2f66e8] focus-visible:ring-[#407aff]/20`}><Eye className="h-3.5 w-3.5" />打开报价</Link>
                              {record.is_unbound ? (
                                <button type="button" disabled={busy} onClick={() => openBindQuotationDialog(record)} className={`${actionBaseClass} border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 focus-visible:ring-amber-500/15`}><Users className="h-3.5 w-3.5" />绑定客户</button>
                              ) : null}
                              <span className="inline-flex w-full" onMouseEnter={lockedBySignedContract ? (event) => showLockedQuotationTooltip(event) : undefined} onMouseLeave={() => setLockTooltip(null)}>
                                <button type="button" disabled={busy || lockedBySignedContract || record.is_unbound} onClick={() => setQuotationStatus(record, isFormalQuotation ? "DRAFT" : "APPROVED")} className={isFormalQuotation ? `${actionBaseClass} border-[#a6e7c0] bg-[#ecfdf3] text-[#027a48] hover:border-[#75d99a] hover:bg-[#dcfae6] focus-visible:ring-[#12b76a]/20` : secondaryActionClass} title={record.is_unbound ? "请先绑定客户后再设为正式报价" : undefined}>
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{record.is_unbound ? "待绑定" : lockedBySignedContract ? "已签合同" : isFormalQuotation ? "撤销正式" : "设为正式"}
                                </button>
                              </span>
                              <button type="button" disabled={busy || record.is_unbound} onClick={() => isSentQuotation ? cancelSendQuotationToDesigner(record) : sendQuotationToDesigner(record)} className={isSentQuotation ? `${actionBaseClass} border-[#cfe0ff] bg-[#edf4ff] text-[#407aff] hover:border-[#afc6ff] hover:bg-[#dce8ff] focus-visible:ring-[#407aff]/20` : secondaryActionClass} title={record.is_unbound ? "请先绑定客户后再发送设计师" : undefined}>
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{record.is_unbound ? "待绑定" : isSentQuotation ? "撤销发送" : "发送设计师"}
                              </button>
                              <button type="button" onClick={() => printQuotation(record)} className={softActionClass}><Printer className="h-3.5 w-3.5" />打印/导出</button>
                              <button type="button" disabled={busy} onClick={() => copyQuotation(record)} className={softActionClass}><Copy className="h-3.5 w-3.5" />复制报价</button>
                              <button type="button" onClick={() => openShareLinkDialog(record)} className={copiedLinkId === record.id ? `${actionBaseClass} border-[#a6e7c0] bg-[#ecfdf3] text-[#027a48] hover:border-[#75d99a] hover:bg-[#dcfae6] focus-visible:ring-[#12b76a]/20` : softActionClass}>
                                {copiedLinkId === record.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}{copiedLinkId === record.id ? "链接已复制" : "分享链接"}
                              </button>
                              <span className="inline-flex w-full" onMouseEnter={compareDisabledReason ? (event) => showLockedQuotationTooltip(event, compareDisabledReason) : undefined} onMouseLeave={() => setLockTooltip(null)} title={compareDisabledReason || undefined}>
                                <button type="button" disabled={busy || Boolean(compareDisabledReason)} onClick={() => openComparePicker(record)} className={softActionClass}>
                                  <GitCompareArrows className="h-3.5 w-3.5" />
                                  报价对比
                                </button>
                              </span>
                              <span className="inline-flex w-full" onMouseEnter={deleteDisabledReason ? (event) => showLockedQuotationTooltip(event, deleteDisabledReason) : undefined} onMouseLeave={() => setLockTooltip(null)}>
                                <button type="button" disabled={busy || Boolean(deleteDisabledReason)} onClick={() => deleteQuotation(record)} className={dangerActionClass}><Trash2 className="h-3.5 w-3.5" />删除报价</button>
                              </span>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#cfd7e3] bg-white px-6 py-12 text-center">
                  <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#407aff]">
                    <ReceiptText className="h-6 w-6" />
                  </span>
                  <h3 className="text-base font-semibold text-[#182230]">{showRecycleBin ? "回收站暂无已删除预算" : "暂无预算记录"}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#667085]">{showRecycleBin ? "删除后的报价会显示在这里。" : "该客户还没有可查看的报价记录。"}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {shareLinkDialog && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-[#0f172a]/32 p-4">
          <div className="w-full max-w-[560px] overflow-hidden rounded-[18px] border border-[#d8e0eb] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 px-6 py-5">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[#bfe8d2] bg-[#f0fbf6] text-[#159a68]">
                  <LinkIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[18px] font-semibold text-[#172033]">分享报价链接</h3>
                  <p className="mt-2 text-sm font-semibold text-[#667085]">选择链接有效期，确认后生成并复制。</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareLinkDialog(null)}
                disabled={sharingLink}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[#7a8699] transition hover:bg-[#f2f4f7] hover:text-[#182230] disabled:opacity-50"
                aria-label="关闭分享链接"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-y border-[#e6ebf2] bg-[#f8fafc] px-6 py-5">
              <p className="mb-3 truncate rounded-[10px] border border-[#e0e7ef] bg-white px-3 py-2 text-xs font-semibold text-[#667085]" title={getBudgetRecordTitle(shareLinkDialog)}>
                {getBudgetRecordTitle(shareLinkDialog)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {quotationShareExpireOptions.map((option) => {
                  const active = shareExpireDays === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setShareExpireDays(option.value)}
                      disabled={sharingLink}
                      className={`flex min-h-[64px] items-center gap-3 rounded-[12px] border px-4 text-left transition disabled:opacity-60 ${
                        active
                          ? "border-[#64d795] bg-[#f4fdf8] text-[#143b2b] shadow-[0_10px_24px_rgba(21,154,104,0.08)]"
                          : "border-[#dbe3ee] bg-white text-[#475467] hover:border-[#a9e7c4] hover:bg-[#fbfffd]"
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${active ? "bg-[#1dbf73] text-white" : "border border-[#d1dbe8] bg-[#f8fafc] text-transparent"}`}>
                        <Check className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className={`mt-0.5 block text-xs ${active ? "text-[#159a68]" : "text-[#98a2b3]"}`}>{option.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-[12px] border border-[#cdeedc] bg-[#f4fdf8] px-3.5 py-2.5 text-xs leading-5 text-[#47715d]">
                生成后会自动复制到剪贴板；过期后客户再次打开会提示链接已失效。
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button
                type="button"
                onClick={() => setShareLinkDialog(null)}
                disabled={sharingLink}
                className="inline-flex h-11 items-center justify-center rounded-[10px] border border-[#cfd8e5] bg-white px-5 text-sm font-semibold text-[#475467] transition hover:border-[#b9c5d4] hover:bg-[#f8fafc] hover:text-[#182230] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={copyShareLink}
                disabled={sharingLink}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#169b68] px-6 text-sm font-semibold text-white transition hover:bg-[#10865a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sharingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                生成并复制
              </button>
            </div>
          </div>
        </div>
      )}

      {comparePickerOpen && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-[#0f172a]/28 p-4">
          <div className="flex max-h-[min(760px,calc(100dvh-48px))] w-full max-w-[780px] flex-col overflow-hidden rounded-[16px] border border-[#d8e0eb] bg-white">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e5eaf2] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#d6e4ff] bg-[#f6f9ff] text-[#407aff]">
                  <GitCompareArrows className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-[16px] font-semibold text-[#172033]">选择要对比的报价</h3>
                  <p className="mt-0.5 truncate text-xs font-medium text-[#667085]">
                    同一工地内选择 2-{MAX_COMPARE_RECORDS} 份报价，确认后查看详细差异
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setComparePickerOpen(false);
                  setComparePickerBaseRecord(null);
                  setCompareError("");
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]"
                aria-label="关闭报价选择"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4">
              <div className="mb-3 grid gap-3 rounded-[10px] border border-[#e2e8f0] bg-[#fbfcfe] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#98a2b3]">当前报价</p>
                  <p className="mt-1 truncate text-xs font-semibold text-[#182230]" title={comparePickerBaseRecord ? getBudgetRecordTitle(comparePickerBaseRecord) : "未选择"}>
                    {comparePickerBaseRecord ? getBudgetRecordTitle(comparePickerBaseRecord) : "未选择"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold tabular-nums ${compareDraftIds.length >= 2 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    已选 {compareDraftIds.length}/{MAX_COMPARE_RECORDS}
                  </span>
                </div>
              </div>

              {compareError ? (
                <div className="mb-3 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {compareError}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-[12px] border border-[#e2e8f0]">
                {compareCandidateRows.map((record: any, index: number) => {
                  const recordId = String(record.id);
                  const selected = compareDraftIds.includes(recordId);
                  const disabled = !selected && compareDraftIds.length >= MAX_COMPARE_RECORDS;
                  const isBase = comparePickerBaseRecord && String(comparePickerBaseRecord.id) === recordId;
                  return (
                    <button
                      key={record.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleCompareDraftId(recordId)}
                      className={`group relative grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#edf1f6] px-3.5 py-3 text-left transition last:border-b-0 disabled:cursor-not-allowed disabled:opacity-45 ${
                        selected
                          ? "bg-[#f6f9ff]"
                          : "bg-white hover:bg-[#fbfcfe]"
                      }`}
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                        selected ? "border-[#407aff] bg-[#407aff] text-white" : "border-[#cbd5e1] bg-[#f8fafc] text-transparent group-hover:border-[#9fb2cc] group-hover:bg-white"
                      }`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[#182230]" title={getBudgetRecordTitle(record)}>{getBudgetRecordTitle(record)}</span>
                          {isBase ? <span className="shrink-0 rounded-full bg-[#edf4ff] px-2 py-0.5 text-[11px] font-semibold text-[#407aff]">当前</span> : null}
                          {isApprovedRecord(record) ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">正式</span> : null}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#667085]">
                          <span className="tabular-nums">{formatQuoteDateTime(getLatestQuoteDate(record))}</span>
                          <span>{record.notes ? `备注：${record.notes}` : "暂无备注"}</span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[11px] font-semibold text-[#98a2b3]">报价 {index + 1}</span>
                        <span className="mt-1 block text-sm font-semibold tabular-nums text-red-600">{formatRecordAmount(getRecordAmount(record))}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#e5eaf2] bg-white px-5 py-3">
              <p className="text-xs font-medium text-[#667085]">最多同时对比 {MAX_COMPARE_RECORDS} 份，至少选择 2 份。</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComparePickerOpen(false);
                    setComparePickerBaseRecord(null);
                    setCompareError("");
                  }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[#cfd8e5] bg-[#f8fafc] px-3.5 text-xs font-semibold text-[#475467] transition hover:border-[#b9c5d4] hover:bg-white hover:text-[#182230]"
                >
                  <X className="h-3.5 w-3.5" />
                  取消
                </button>
                <button
                  type="button"
                  disabled={compareDraftIds.length < 2}
                  onClick={confirmCompareSelection}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[#245ee8] px-4 text-xs font-semibold text-white transition hover:bg-[#1d4fd0] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GitCompareArrows className="h-3.5 w-3.5" />
                  开始对比
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {compareDialogOpen && compareReady && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[#0f172a]/35 p-4">
          <div className="flex h-[calc(100dvh-40px)] max-h-[920px] w-full max-w-[1360px] flex-col overflow-hidden rounded-[16px] border border-[#d6deea] bg-[#eef2f6] shadow-[0_26px_80px_rgba(15,23,42,0.26)]">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#dce3ee] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#172033] text-white shadow-[0_8px_18px_rgba(23,32,51,0.18)]">
                  <GitCompareArrows className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-[16px] font-semibold text-[#172033]">报价对比</h3>
                  <p className="mt-0.5 truncate text-xs font-medium text-[#667085]">对比 {compareDisplayRecords.length} 份报价，红色标记同项最高金额</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
	                <span className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums ${compareTotalDiff < 0.005 ? "bg-[#f2f4f7] text-[#667085]" : "bg-red-50 text-red-600 ring-1 ring-red-100"}`}>
	                  {compareTotalDiff < 0.005 ? <Minus className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
	                  最高差 {compareTotalDiff < 0.005 ? "持平" : formatRecordAmount(compareTotalDiff)}
	                </span>
	                {compareDiscountDiff >= 0.005 ? (
	                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-xs font-semibold tabular-nums text-amber-700 ring-1 ring-amber-100">
	                    <Minus className="h-3.5 w-3.5" />
	                    优惠差 {formatRecordAmount(compareDiscountDiff)}
	                  </span>
	                ) : null}
	                <button
                  type="button"
                  onClick={() => setCompareDialogOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]"
                  aria-label="关闭报价对比"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-[#eef2f6] p-4">
              {compareLoading ? (
                <div className="flex min-h-[420px] items-center justify-center rounded-[14px] border border-dashed border-[#cfd7e3] bg-white text-sm font-semibold text-[#667085]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#407aff]" />
                  正在读取所选报价明细...
                </div>
              ) : compareError ? (
                <div className="rounded-[12px] border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {compareError}
                </div>
              ) : compareReady ? (
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-[#d7e0eb] bg-white">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e1e7f0] bg-white px-4 py-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-[#182230]">明细对比</h4>
                      <p className="mt-0.5 text-xs font-medium text-[#98a2b3]">
                        按基装、产品、定制柜展示项目，右侧横向查看各报价差异
                        {compareProjectSearchText ? `，已找到 ${compareSearchMatchedCount} 项` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <div className="relative h-8 w-[252px] max-w-full">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a8798]" />
                        <input
                          value={compareProjectSearch}
                          onChange={(event) => setCompareProjectSearch(event.target.value)}
                          placeholder="搜索工程项目"
                          className="h-full w-full rounded-[9px] border border-[#cfd8e5] bg-[#f8fafc] pl-8 pr-8 text-xs font-medium text-[#182230] outline-none transition placeholder:text-[#98a2b3] hover:border-[#b9c5d4] focus:border-[#407aff] focus:bg-white focus:ring-2 focus:ring-[#407aff]/10"
                        />
                        {compareProjectSearch ? (
                          <button
                            type="button"
                            onClick={() => setCompareProjectSearch("")}
                            className="absolute right-2 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-[#98a2b3] transition hover:bg-[#e5ebf3] hover:text-[#475467]"
                            aria-label="清空对比搜索"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                      <div className="inline-flex h-8 items-center gap-1 rounded-[10px] bg-[#f6f8fb] p-1 ring-1 ring-inset ring-[#e1e7f0]">
                        <button type="button" onClick={() => setCompareViewMode("all")} className={`relative inline-flex h-6 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition ${compareViewMode === "all" ? "bg-white text-[#172033] ring-1 ring-inset ring-[#d8e1ed]" : "text-[#7a8798] hover:bg-white/70 hover:text-[#344054]"}`}>
                          <CheckCircle2 className={`h-3.5 w-3.5 ${compareViewMode === "all" ? "text-[#245ee8]" : "text-[#98a2b3]"}`} />
                          全部
                        </button>
                        <button type="button" onClick={() => setCompareViewMode("changed")} className={`relative inline-flex h-6 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition ${compareViewMode === "changed" ? "bg-white text-[#172033] ring-1 ring-inset ring-[#d8e1ed]" : "text-[#7a8798] hover:bg-white/70 hover:text-[#344054]"}`}>
                          <ListFilter className={`h-3.5 w-3.5 ${compareViewMode === "changed" ? "text-[#245ee8]" : "text-[#98a2b3]"}`} />
                          只看差异
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto bg-[#f8fafc]">
                    <div className="quotation-compare-table" style={{ width: "100%", minWidth: `${compareTableMinWidth}px` }}>
                      <div className="sticky top-0 z-20 grid border-b border-[#d9e2ef] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)]" style={{ gridTemplateColumns: compareGridTemplateColumns }}>
                        <div className="quotation-compare-left-cell quotation-compare-left-head sticky left-0 z-30 flex min-h-[132px] flex-col justify-between border-r border-[#d9e2ef] p-4">
                          <div>
                            <p className="text-sm font-semibold text-[#182230]">对比项</p>
                            <p className="mt-1 text-xs text-[#98a2b3]">{compareChangedCount} 项变化</p>
                          </div>
                          <p className="text-xs font-medium text-[#667085]">红色为最高金额</p>
                        </div>
                        {compareDisplayRecords.map((record: any, index) => {
                          const summary = compareSummaries[index];
                          const totalHigher = compareMaxTotal > compareMinTotal + 0.005 && Number(summary.total || 0) >= compareMaxTotal - 0.005;
                          return (
                            <div key={record.id} className={`min-h-[132px] border-r border-[#e5ebf3] bg-white p-4 ${totalHigher ? "bg-red-50/50" : ""}`}>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold ${totalHigher ? "bg-red-600 text-white" : "bg-[#172033] text-white"}`}>{index + 1}</span>
                                <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getRecordStatusClass(record)}`}>{formatRecordStatus(record)}</span>
                              </div>
                              <p className="line-clamp-2 min-h-[32px] text-xs font-semibold leading-4 text-[#182230]" title={getBudgetRecordTitle(record)}>{getBudgetRecordTitle(record)}</p>
	                              <p className={`mt-2 text-[20px] font-semibold tabular-nums ${totalHigher ? "text-red-600" : "text-[#182230]"}`}>{formatRecordAmount(summary.total)}</p>
	                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium tabular-nums text-[#8a97aa]">
	                                <span>{formatQuoteDateTime(getLatestQuoteDate(record))}</span>
	                                <span className={`${Number(summary.discount || 0) > 0 ? "text-amber-700" : "text-[#98a2b3]"}`}>
	                                  优惠 {Number(summary.discount || 0) > 0 ? `-${formatRecordAmount(summary.discount)}` : "0.00"}
	                                </span>
	                              </div>
	                            </div>
                          );
                        })}
                        <div className={`quotation-compare-diff-head min-h-[132px] border-l border-[#d9e2ef] p-4 text-right ${compareTotalDiff < 0.005 ? "bg-[#fbfcfe]" : "bg-[#fff7f7]"}`}>
                          <p className="text-xs font-semibold text-[#667085]">最高差额</p>
                          <p className={`mt-2 text-lg font-bold tabular-nums ${compareTotalDiff < 0.005 ? "text-[#475467]" : "text-red-600"}`}>{compareTotalDiff < 0.005 ? "持平" : formatRecordAmount(compareTotalDiff)}</p>
                          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#98a2b3]">
                            {compareTotalDiff < 0.005 ? <Minus className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3 text-red-500" />}
                            最高 - 最低
                          </div>
                        </div>
                      </div>

                      <div className="grid border-b border-[#d9e2ef] bg-[#eef2f6]" style={{ gridTemplateColumns: compareGridTemplateColumns }}>
                        <div className="quotation-compare-left-cell quotation-compare-left-section sticky left-0 z-10 border-r border-[#d9e2ef] px-4 py-3 text-sm font-semibold text-[#182230]">价格总览</div>
                        <div className="col-span-full hidden" />
                      </div>

                      {compareCategoryRows.map((row) => (
                        <div key={row.key} className="grid min-h-[48px] items-center border-b border-[#e5ebf3] bg-white text-xs" style={{ gridTemplateColumns: compareGridTemplateColumns }}>
                          <div className="quotation-compare-left-cell quotation-compare-left-body sticky left-0 z-10 h-full border-r border-[#e5ebf3] px-4 py-3 font-semibold text-[#182230]">{row.label}</div>
                          {row.amounts.map((amount: number, index: number) => {
                            const higher = row.maxAmount > row.minAmount + 0.005 && amount >= row.maxAmount - 0.005;
                            return (
                              <div key={`${row.key}-${index}`} className={`flex h-full items-center justify-end border-r border-[#edf1f5] px-4 py-3 text-right font-semibold tabular-nums ${higher ? "bg-red-50 text-red-600" : "text-[#182230]"}`}>
                                {formatRecordAmount(amount)}
                              </div>
                            );
                          })}
                          {renderCompareDiffCell(row.diff, row.key === "discount" ? "优惠差" : "高出")}
                        </div>
                      ))}

                      {visibleCompareProjectGroups.length > 0 ? visibleCompareProjectGroups.map((group) => (
                        <div key={group.kind}>
                          <div className="grid min-h-[42px] items-center border-b border-[#d9e2ef] bg-[#eef2f6] text-xs" style={{ gridTemplateColumns: compareGridTemplateColumns }}>
                            <div className="quotation-compare-left-cell quotation-compare-left-section sticky left-0 z-10 border-r border-[#d9e2ef] px-4 py-2.5">
                              <p className="truncate text-sm font-semibold text-[#182230]" title={group.label}>{group.label}</p>
                              <p className="mt-0.5 text-[11px] font-medium text-[#667085]">{group.rows.length} 项</p>
                            </div>
                            {compareDisplayRecords.map((record: any) => (
                              <div key={`${group.kind}-${record.id}`} className="h-full border-r border-[#d9e2ef] bg-[#eef2f6]" />
                            ))}
                            <div className="h-full border-l border-[#d9e2ef] bg-[#eef2f6]" />
                          </div>
                          {group.rows.map((row) => (
                            <div key={row.key} className="grid min-h-[50px] items-center border-b border-[#e5ebf3] bg-white text-xs" style={{ gridTemplateColumns: compareGridTemplateColumns }}>
                              <div className={`quotation-compare-left-cell quotation-compare-left-body sticky left-0 z-10 h-full border-r border-[#e5ebf3] px-4 py-3 ${row.changed ? "quotation-compare-left-body-white" : "quotation-compare-left-body-muted"}`}>
                                <p className="font-semibold leading-[18px] text-[#182230]" title={row.label}>{row.label}</p>
                              </div>
                              {row.amounts.map((amount: number, index: number) => {
                                const higher = row.maxAmount > row.minAmount + 0.005 && amount >= row.maxAmount - 0.005;
                                const missing = amount < 0.005 && row.maxAmount > 0.005;
                                return (
                                  <div key={`${row.key}-${index}`} className={`flex h-full items-center justify-end border-r border-[#edf1f5] px-4 py-3 text-right font-semibold tabular-nums ${higher ? "bg-red-50 text-red-600" : missing ? "text-[#a0a8b5]" : "text-[#182230]"}`}>
                                    {missing ? "-" : formatRecordAmount(amount)}
                                  </div>
                                );
                              })}
                              {renderCompareDiffCell(row.diff)}
                            </div>
                          ))}
                        </div>
                      )) : (
                        <div className="flex min-h-[180px] items-center justify-center bg-white text-sm font-semibold text-[#667085]">
                          {compareProjectSearchText ? "没有找到匹配项目" : compareViewMode === "changed" ? "没有工程项目差异" : "暂无工程项目明细"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#dfe6f0] bg-white px-5 py-3">
              <p className="text-xs font-medium text-[#667085]">差额按同项最高价减最低价计算，红色表示该项金额最高。</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setCompareDialogOpen(false); setComparePickerOpen(true); setCompareDraftIds(compareRecords.map((record: any) => String(record.id))); }} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[#cfd8e5] bg-[#f8fafc] px-3.5 text-xs font-semibold text-[#475467] transition hover:border-[#b9c5d4] hover:bg-white hover:text-[#182230]">
                  <RotateCcw className="h-3.5 w-3.5" />
                  重新选择
                </button>
                <button type="button" onClick={() => setCompareDialogOpen(false)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[#245ee8] px-4 text-xs font-semibold text-white transition hover:bg-[#1d4fd0] focus:outline-none focus:ring-2 focus:ring-[#245ee8]/20">
                  <Check className="h-3.5 w-3.5" />
                  完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/24 p-3 sm:p-5">
          <div className="flex h-[min(860px,92vh)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[16px] border border-[#d9e1ec] bg-[#f6f8fb] text-[12px] shadow-[0_24px_72px_rgba(15,23,42,0.22)] [&_button]:!text-[12px] [&_input]:!text-[12px] [&_label]:!text-[12px] [&_p]:!text-[12px] [&_select]:!text-[12px] [&_span]:!text-[12px] [&_strong]:!text-[12px] [&_textarea]:!text-[12px]">
            <div className="flex shrink-0 items-center justify-between border-b border-[#d9e1ec] bg-white px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#407aff]">
                    <ReceiptText className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-extrabold text-[#162033]">新建报价</h2>
                </div>
                <p className="mt-1 text-xs font-semibold text-[#667085]">先精准定位客户，再配置标题、模板和备注。</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="rounded-[10px] p-2 text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]" aria-label="关闭新建报价弹窗"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[460px_minmax(0,1fr)]">
              <section className="flex min-h-0 flex-col border-b border-[#d9e1ec] bg-white lg:border-b-0 lg:border-r">
                <div className="shrink-0 border-b border-[#e4e9f0] bg-white px-4 py-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {isNewCustomerMode ? <UserPlus className="h-4 w-4 shrink-0 text-[#407aff]" /> : <Users className="h-4 w-4 shrink-0 text-[#407aff]" />}
                      <p className="text-sm font-extrabold text-[#162033]">{isTemporaryQuotationMode ? "临时客户" : isNewCustomerMode ? "新建客户" : "选择客户"}</p>
                    </div>
                    {!isTemporaryQuotationMode && !isNewCustomerMode ? <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-xs font-bold tabular-nums text-[#475467]">
                      {createCustomerCountLabel}
                    </span> : isNewCustomerMode ? <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-bold text-[#407aff]">同步建档</span> : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">未绑定</span>}
                  </div>
                  <div className="mb-3 grid grid-cols-2 rounded-[10px] bg-[#f2f4f7] p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode("customer");
                        setTitle(selectedCustomer ? buildDefaultQuotationTitle(selectedCustomer) : "装修报价单");
                        if (selectedCustomer) {
                          const snapshot = makeCreateCustomerSnapshot(selectedCustomer);
                          setCreateCustomerSnapshot(snapshot);
                          setPackageQuoteAreaText(formatCreateAreaInput(snapshot.area_size));
                        }
                      }}
                      className={`rounded-[8px] px-3 py-2 transition ${createMode === "customer" ? "bg-white text-[#182230] shadow-sm" : "text-[#667085] hover:text-[#182230]"}`}
                    >
                      选择客户
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode("new_customer");
                        setCustomerId("");
                        setSelectedCustomer(null);
                        setCreateCustomerSnapshot(emptyCreateCustomerSnapshot);
                        setTitle(buildDefaultQuotationTitle(quickCustomer));
                        setPackageQuoteAreaText(formatCreateAreaInput(quickCustomer.area_size));
                      }}
                      className={`rounded-[8px] px-3 py-2 transition ${isNewCustomerMode ? "bg-white text-[#182230] shadow-sm" : "text-[#667085] hover:text-[#182230]"}`}
                    >
                      新建客户
                    </button>
                  </div>
                  {ENABLE_TEMPORARY_QUOTATION && (
                    <div className="mb-3 grid grid-cols-2 rounded-[10px] bg-[#f2f4f7] p-1 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setCreateMode("customer");
                          setTitle(selectedCustomer ? buildDefaultQuotationTitle(selectedCustomer) : "装修报价单");
                          if (selectedCustomer) setCreateCustomerSnapshot(makeCreateCustomerSnapshot(selectedCustomer));
                        }}
                        className={`rounded-[8px] px-3 py-2 transition ${createMode === "customer" ? "bg-white text-[#182230] shadow-sm" : "text-[#667085] hover:text-[#182230]"}`}
                      >
                        已有客户
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateMode("temporary");
                          setCustomerId("");
                          setSelectedCustomer(null);
                          setCreateCustomerSnapshot(emptyCreateCustomerSnapshot);
                          setTitle(buildTemporaryQuotationTitle(temporaryCustomer));
                          setPackageQuoteAreaText(formatCreateAreaInput(temporaryCustomer.area));
                        }}
                        className={`rounded-[8px] px-3 py-2 transition ${createMode === "temporary" ? "bg-white text-[#182230] shadow-sm" : "text-[#667085] hover:text-[#182230]"}`}
                      >
                        临时报价
                      </button>
                    </div>
                  )}
                  {!isTemporaryQuotationMode && !isNewCustomerMode ? (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                        <input
                          value={createCustomerSearch}
                          onChange={(event) => setCreateCustomerSearch(event.target.value)}
                          className="h-11 w-full rounded-[12px] border border-[#cfd7e3] bg-[#f8fafc] pl-10 pr-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:bg-white focus:ring-[3px] focus:ring-[#407aff]/12"
                          placeholder="姓名 / 手机号 / 小区 / 房号"
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-[#667085]">
                        <span>{createCustomerKeyword ? "搜索结果" : "最近客户"}</span>
                        {createCustomerHasMore ? <span>{createCustomerKeyword ? "结果较多，建议补充手机号/房号" : "客户很多，请直接搜索定位"}</span> : null}
                      </div>
                    </>
                  ) : isNewCustomerMode ? (
                    <p className="rounded-[10px] border border-[#d9e1ec] bg-[#fbfcfe] px-3 py-2 text-xs font-semibold leading-5 text-[#667085]">
                      只需填写小区/地址即可创建客户，其它信息可先留空，后续会同步到客户管理。
                    </p>
                  ) : (
                    <p className="rounded-[10px] border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-700">
                      适合客户还未建档但需要先报价的场景。后续可在报价记录中绑定正式客户。
                    </p>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbfcfe]">
                  {isTemporaryQuotationMode ? (
                    <div className="space-y-3 p-4">
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-xs font-bold text-[#475467]">临时客户名称</span>
                        <input
                          value={temporaryCustomer.name}
                          onChange={(event) => {
                            const next = { ...temporaryCustomer, name: event.target.value };
                            setTemporaryCustomer(next);
                            if (!title.trim() || title === "临时报价单") setTitle(buildTemporaryQuotationTitle(next));
                          }}
                          className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                          placeholder="如：张先生、李女士"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">手机号</span>
                          <input value={temporaryCustomer.phone} inputMode="numeric" maxLength={11} onChange={(event) => setTemporaryCustomer((prev) => ({ ...prev, phone: sanitizeCreatePhoneInput(event.target.value) }))} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12" placeholder="手机号" />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">微信</span>
                          <input value={temporaryCustomer.weixin} onChange={(event) => setTemporaryCustomer((prev) => ({ ...prev, weixin: event.target.value }))} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12" placeholder="微信号" />
                        </label>
                      </div>
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-xs font-bold text-[#475467]">小区/地址 <span className="text-red-500">*</span></span>
                        <div className="flex overflow-hidden rounded-[10px] border border-[#cfd7e3] bg-white transition focus-within:border-[#407aff] focus-within:ring-[3px] focus-within:ring-[#407aff]/12">
                          <input
                            value={temporaryCustomer.address}
                            onChange={(event) => {
                              const next = { ...temporaryCustomer, address: event.target.value };
                              setTemporaryCustomer(next);
                              if (!title.trim() || title === "临时报价单") setTitle(buildTemporaryQuotationTitle(next));
                            }}
                            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-[#182230] outline-none placeholder:text-[#98a2b3]"
                            placeholder="如：工业大道南地铁站H7-4-1023"
                          />
                          <button
                            type="button"
                            onClick={() => setCreateMapPickerOpen(true)}
                            className="inline-flex shrink-0 items-center gap-1.5 border-l border-[#e5eaf2] px-3 text-xs font-semibold text-[#166534] transition hover:bg-[#f0fdf4]"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            地图选点
                          </button>
                        </div>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">面积(㎡)</span>
                          <input
                            value={temporaryCustomer.area}
                            onChange={(event) => {
                              const area = sanitizeCreateAreaInput(event.target.value);
                              setTemporaryCustomer((prev) => ({ ...prev, area }));
                              if (selectedTemplate?.quoteConfig?.mode === "package") setPackageQuoteAreaText(area);
                            }}
                            className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                            placeholder="面积"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">装修类型</span>
                          <input value={temporaryCustomer.decoration_type} onChange={(event) => setTemporaryCustomer((prev) => ({ ...prev, decoration_type: event.target.value }))} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12" placeholder="如：全包/半包" />
                        </label>
                      </div>
                    </div>
                  ) : isNewCustomerMode ? (
                    <div className="space-y-3 p-4">
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-xs font-bold text-[#475467]">客户名称</span>
                        <input
                          value={quickCustomer.name}
                          onChange={(event) => updateQuickCustomer({ name: event.target.value })}
                          className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                          placeholder="如：张先生、李女士"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-xs font-bold text-[#475467]">设计师</span>
                        <input
                          value={quickCustomer.designer_name}
                          onChange={(event) => updateQuickCustomer({ designer_name: event.target.value })}
                          className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                          placeholder="手动填写设计师姓名"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">手机号</span>
                          <input value={quickCustomer.phone} inputMode="numeric" maxLength={11} onChange={(event) => updateQuickCustomer({ phone: sanitizeCreatePhoneInput(event.target.value) })} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12" placeholder="手机号" />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">微信</span>
                          <input value={quickCustomer.weixin} onChange={(event) => updateQuickCustomer({ weixin: event.target.value })} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12" placeholder="微信号" />
                        </label>
                      </div>
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-xs font-bold text-[#475467]">小区/地址 <span className="text-red-500">*</span></span>
                        <div className="flex overflow-hidden rounded-[10px] border border-[#cfd7e3] bg-white transition focus-within:border-[#407aff] focus-within:ring-[3px] focus-within:ring-[#407aff]/12">
                          <input
                            value={quickCustomer.address}
                            onChange={(event) => updateQuickCustomer({
                              address: event.target.value,
                              address_location_name: "",
                              address_location_address: "",
                              address_latitude: "",
                              address_longitude: "",
                            })}
                            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-[#182230] outline-none placeholder:text-[#98a2b3]"
                            placeholder="如：工业大道南地铁站H7-4-1023"
                          />
                          <button
                            type="button"
                            onClick={() => setCreateMapPickerOpen(true)}
                            className="inline-flex shrink-0 items-center gap-1.5 border-l border-[#e5eaf2] px-3 text-xs font-semibold text-[#166534] transition hover:bg-[#f0fdf4]"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            地图选点
                          </button>
                        </div>
                        {quickCustomer.address_latitude && quickCustomer.address_longitude ? (
                          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-xs font-semibold text-[#166534]">
                            <MapPin className="h-3 w-3" />
                            已保存实际地址定位
                          </p>
                        ) : null}
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">楼栋</span>
                          <input value={quickCustomer.building_no} disabled={quickCustomer.no_room_number} onChange={(event) => updateQuickCustomer({ building_no: event.target.value })} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12 disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]" placeholder="H7" />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">单元</span>
                          <input value={quickCustomer.unit_no} disabled={quickCustomer.no_room_number} onChange={(event) => updateQuickCustomer({ unit_no: event.target.value })} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12 disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]" placeholder="4" />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">房室</span>
                          <input value={quickCustomer.room_no} disabled={quickCustomer.no_room_number} onChange={(event) => updateQuickCustomer({ room_no: event.target.value })} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12 disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]" placeholder="1023" />
                        </label>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-[#667085]">
                        <input
                          type="checkbox"
                          checked={quickCustomer.no_room_number}
                          onChange={(event) => updateQuickCustomer({ no_room_number: event.target.checked })}
                          className="material-checkbox"
                        />
                        暂无房号
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">面积(㎡)</span>
                          <input
                            value={quickCustomer.area_size}
                            onChange={(event) => {
                              const area = sanitizeCreateAreaInput(event.target.value);
                              updateQuickCustomer({ area_size: area });
                              if (selectedTemplate?.quoteConfig?.mode === "package") setPackageQuoteAreaText(area);
                            }}
                            className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                            placeholder="面积"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">装修类型</span>
                          <input value={quickCustomer.decoration_type} onChange={(event) => updateQuickCustomer({ decoration_type: event.target.value })} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12" placeholder="如：全包/半包" />
                        </label>
                      </div>
                    </div>
                  ) : createCustomerLoading ? (
                    <div className="flex h-full min-h-40 items-center justify-center text-sm font-semibold text-[#52647b]">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#407aff]" />
                      正在搜索客户...
                    </div>
                  ) : createCustomerResults.length > 0 ? (
                    <div className="divide-y divide-[#eef2f6]">
                      {createCustomerResults.map((customer: any) => {
                        const active = customer.id === customerId;
                        const areaValue = getCustomerAreaValue(customer);
                        return (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => selectCreateCustomer(customer)}
                            className={`grid w-full grid-cols-[minmax(0,1fr)_132px] items-center gap-3 px-4 py-3 text-left transition ${
                              active
                                ? "bg-[#edf4ff] shadow-[inset_3px_0_0_#407aff]"
                                : "bg-white hover:bg-[#f8fafc]"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-extrabold text-[#162033]">{customer.name || "未命名客户"}</span>
                                {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#407aff]" />}
                              </div>
                              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#667085]">
                                <Home className="h-3.5 w-3.5 shrink-0 text-[#98a2b3]" />
                                <span className="truncate">{getCustomerHouseText(customer)}</span>
                              </div>
                            </div>
                            <div className="min-w-0 text-right">
                              <div className="flex items-center justify-end gap-1.5 text-xs font-bold tabular-nums text-[#475467]">
                                <Phone className="h-3.5 w-3.5 text-[#98a2b3]" />
                                <span className="truncate">{getCustomerContactText(customer)}</span>
                              </div>
                              <div className="mt-1 flex justify-end gap-1.5 text-[11px] font-semibold text-[#667085]">
                                <span className="rounded-[7px] bg-[#f2f4f7] px-1.5 py-0.5">{areaValue ? `${formatPricingAmount(areaValue, 0)}㎡` : "无面积"}</span>
                                <span className="max-w-[78px] truncate rounded-[7px] bg-[#f2f4f7] px-1.5 py-0.5">{customer.decoration_type || "未填类型"}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {createCustomerHasMore ? (
                        <div className="bg-[#fbfcfe] px-4 py-3 text-center text-xs font-semibold text-[#667085]">
                          {createCustomerKeyword
                            ? "结果仍然较多，请继续输入手机号后四位、完整小区或房号。"
                            : "这里只展示最近客户；客户很多时，请用姓名、手机号、小区或房号搜索。"}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="m-4 flex h-full min-h-40 flex-col items-center justify-center rounded-[14px] border border-dashed border-[#cfd7e3] bg-white px-4 text-center">
                      <p className="text-sm font-extrabold text-[#162033]">没有找到客户</p>
                      <p className="mt-1 text-xs font-semibold text-[#8b9aaf]">换个姓名、手机号、小区或房号试试。</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="flex min-h-0 flex-col bg-[#f6f8fb]">
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
                  <div className="flex min-h-full w-full flex-1 flex-col gap-4">
                    {isTemporaryQuotationMode ? (
                      <div className="rounded-[16px] border border-amber-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-amber-700">临时报价</p>
                            <p className="mt-1 text-base font-extrabold text-[#162033]">{temporaryCustomer.name || "待填写临时客户"}</p>
                          </div>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">后续绑定客户</span>
                        </div>
                        <div className="grid gap-2 text-xs font-semibold text-[#475467] sm:grid-cols-3">
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><Phone className="h-3.5 w-3.5" />联系方式</span>
                            <strong className="block truncate text-[#182230]">{temporaryCustomer.phone || temporaryCustomer.weixin || "-"}</strong>
                          </div>
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><Ruler className="h-3.5 w-3.5" />面积</span>
                            <strong className="block text-[#182230]">{temporaryCustomer.area ? `${temporaryCustomer.area}㎡` : "-"}</strong>
                          </div>
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><FileText className="h-3.5 w-3.5" />装修类型</span>
                            <strong className="block truncate text-[#182230]">{temporaryCustomer.decoration_type || "未填"}</strong>
                          </div>
                        </div>
                        <p className="mt-3 truncate rounded-[10px] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#667085]" title={temporaryCustomer.address}>{temporaryCustomer.address || "未填写小区/地址"}</p>
                      </div>
                    ) : isNewCustomerMode ? (
                      <div className="rounded-[16px] border border-[#d9e1ec] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-[#667085]">待建档客户</p>
                            <p className="mt-1 text-base font-extrabold text-[#162033]">{quickCustomer.name || "未命名客户"}</p>
                          </div>
                          <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-bold text-[#407aff]">创建后同步客户管理</span>
                        </div>
                        <div className="grid gap-2 text-xs font-semibold text-[#475467] sm:grid-cols-3">
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><Phone className="h-3.5 w-3.5" />联系方式</span>
                            <strong className="block truncate text-[#182230]">{quickCustomer.phone || quickCustomer.weixin || "-"}</strong>
                          </div>
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><Ruler className="h-3.5 w-3.5" />面积</span>
                            <strong className="block text-[#182230]">{quickCustomer.area_size ? `${quickCustomer.area_size}㎡` : "-"}</strong>
                          </div>
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><FileText className="h-3.5 w-3.5" />装修类型</span>
                            <strong className="block truncate text-[#182230]">{quickCustomer.decoration_type || "未填"}</strong>
                          </div>
                        </div>
                        <p className="mt-3 truncate rounded-[10px] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#475467]">
                          设计师：<span className="text-[#182230]">{quickCustomer.designer_name || "-"}</span>
                        </p>
                        <p className="mt-3 truncate rounded-[10px] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#166534]" title={getCustomerHouseText(quickCustomerPreview)}>{getCustomerHouseText(quickCustomerPreview) || "未填写小区/地址"}</p>
                      </div>
                    ) : selectedCustomer && selectedCustomerPreview ? (
                      <div className="rounded-[16px] border border-[#d9e1ec] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-[#667085]">已选客户</p>
                            <p className="mt-1 text-base font-extrabold text-[#162033]">{selectedCustomer.name || "未命名客户"}</p>
                          </div>
                          <button type="button" onClick={() => { setCustomerId(""); setSelectedCustomer(null); setCreateCustomerSnapshot(emptyCreateCustomerSnapshot); }} className="rounded-[8px] border border-[#d5dae1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475467] transition hover:bg-[#f8fafc]">
                            重新选择
                          </button>
                        </div>
                        <div className="grid gap-2 text-xs font-semibold text-[#475467] sm:grid-cols-3">
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><Phone className="h-3.5 w-3.5" />联系方式</span>
                            <strong className="block truncate text-[#182230]">{createCustomerSnapshot.phone || selectedCustomer.weixin || "-"}</strong>
                          </div>
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><Ruler className="h-3.5 w-3.5" />面积</span>
                            <strong className="block text-[#182230]">{getCustomerAreaValue(selectedCustomerPreview) ? `${formatPricingAmount(getCustomerAreaValue(selectedCustomerPreview), 0)}㎡` : "-"}</strong>
                          </div>
                          <div className="rounded-[10px] bg-[#f8fafc] px-3 py-2">
                            <span className="mb-1 flex items-center gap-1.5 text-[#667085]"><FileText className="h-3.5 w-3.5" />装修类型</span>
                            <strong className="block truncate text-[#182230]">{createCustomerSnapshot.decoration_type || "未填"}</strong>
                          </div>
                        </div>
                        <p className="mt-3 truncate rounded-[10px] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#166534]" title={getCustomerHouseText(selectedCustomerPreview)}>{getCustomerHouseText(selectedCustomerPreview)}</p>
                        <div className="mt-4 rounded-[14px] border border-[#e4e9f0] bg-[#fbfcfe] p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-extrabold text-[#475467]">本次报价客户信息</p>
                            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#667085]">
                              <input
                                type="checkbox"
                                checked={createCustomerSnapshot.no_room_number}
                                onChange={(event) => setCreateCustomerSnapshot((prev) => ({ ...prev, no_room_number: event.target.checked }))}
                                className="material-checkbox"
                              />
                              暂无房号
                            </label>
                          </div>
                          <label className="mb-3 block text-sm">
                            <span className="mb-1.5 block text-xs font-bold text-[#667085]">小区/地址</span>
                            <div className="flex overflow-hidden rounded-[10px] border border-[#cfd7e3] bg-white transition focus-within:border-[#407aff] focus-within:ring-[3px] focus-within:ring-[#407aff]/12">
                              <input
                                value={createCustomerSnapshot.address}
                                onChange={(event) => setCreateCustomerAddressText(event.target.value)}
                                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-[#182230] outline-none placeholder:text-[#98a2b3]"
                                placeholder="如：工业大道南地铁站"
                              />
                              <button
                                type="button"
                                onClick={() => setCreateMapPickerOpen(true)}
                                className="inline-flex shrink-0 items-center gap-1.5 border-l border-[#e5eaf2] px-3 text-xs font-semibold text-[#166534] transition hover:bg-[#f0fdf4]"
                              >
                                <MapPin className="h-3.5 w-3.5" />
                                地图选点
                              </button>
                            </div>
                            {createCustomerSnapshot.address_latitude && createCustomerSnapshot.address_longitude ? (
                              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-xs font-semibold text-[#166534]">
                                <MapPin className="h-3 w-3" />
                                已保存实际地址定位
                              </p>
                            ) : null}
                          </label>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="block text-sm">
                              <span className="mb-1.5 block text-xs font-bold text-[#667085]">楼栋</span>
                              <input
                                value={createCustomerSnapshot.building_no}
                                disabled={createCustomerSnapshot.no_room_number}
                                onChange={(event) => setCreateCustomerSnapshot((prev) => ({ ...prev, building_no: event.target.value }))}
                                className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12 disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]"
                                placeholder="如：H7"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="mb-1.5 block text-xs font-bold text-[#667085]">单元</span>
                              <input
                                value={createCustomerSnapshot.unit_no}
                                disabled={createCustomerSnapshot.no_room_number}
                                onChange={(event) => setCreateCustomerSnapshot((prev) => ({ ...prev, unit_no: event.target.value }))}
                                className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12 disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]"
                                placeholder="如：4"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="mb-1.5 block text-xs font-bold text-[#667085]">房室</span>
                              <input
                                value={createCustomerSnapshot.room_no}
                                disabled={createCustomerSnapshot.no_room_number}
                                onChange={(event) => setCreateCustomerSnapshot((prev) => ({ ...prev, room_no: event.target.value }))}
                                className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12 disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]"
                                placeholder="如：1023"
                              />
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <label className="block text-sm">
                              <span className="mb-1.5 block text-xs font-bold text-[#667085]">电话</span>
                              <input
                                value={createCustomerSnapshot.phone}
                                inputMode="numeric"
                                maxLength={11}
                                onChange={(event) => setCreateCustomerSnapshot((prev) => ({ ...prev, phone: sanitizeCreatePhoneInput(event.target.value) }))}
                                className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                                placeholder="手机号"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="mb-1.5 block text-xs font-bold text-[#667085]">面积(㎡)</span>
                              <input
                                value={createCustomerSnapshot.area_size}
                                onChange={(event) => {
                                  const area = sanitizeCreateAreaInput(event.target.value);
                                  setCreateCustomerSnapshot((prev) => ({ ...prev, area_size: area }));
                                  if (selectedTemplate?.quoteConfig?.mode === "package") setPackageQuoteAreaText(area);
                                }}
                                className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                                placeholder="面积"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="mb-1.5 block text-xs font-bold text-[#667085]">装修类型</span>
                              <input
                                value={createCustomerSnapshot.decoration_type}
                                onChange={(event) => setCreateCustomerSnapshot((prev) => ({ ...prev, decoration_type: event.target.value }))}
                                className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                                placeholder="如：全包/半包"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[16px] border border-[#d9e1ec] bg-white p-5">
                        <p className="text-sm font-extrabold text-[#162033]">请先选择客户</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-[#667085]">左侧支持姓名、手机号、小区和房号搜索。客户较多时，输入更完整的关键词可以快速定位。</p>
                      </div>
                    )}

                    <div className="rounded-[16px] border border-[#d9e1ec] bg-white p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-extrabold text-[#162033]">报价设置</p>
                          <p className="mt-1 text-xs font-semibold text-[#667085]">设置标题、定额模板、内部备注和客户附注。</p>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm md:col-span-2">
                          <span className="mb-1.5 block text-xs font-bold text-[#475467]">报价标题</span>
                          <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12" placeholder="例如：全案装修报价单" />
                        </label>
                        <label className="block text-sm md:col-span-2">
                          <span className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-[#475467]">
                            <span>定额模板</span>
                          </span>
                          <SystemSelect
                            value={selectedTemplateId}
                            onChange={(event) => {
                              const nextTemplateId = event.target.value;
                            setSelectedTemplateId(nextTemplateId);
                            const nextTemplate = quotaTemplates.find((template) => template.id === nextTemplateId);
                            if (nextTemplate?.quoteConfig?.mode === "package" && !packageQuoteAreaText) {
                              setPackageQuoteAreaText(formatCreateAreaInput(isTemporaryQuotationMode ? temporaryCustomer.area : isNewCustomerMode ? quickCustomer.area_size : getCustomerAreaValue(selectedCustomer)));
                            }
                          }}
                            className="h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white px-3 text-sm font-semibold text-[#182230] outline-none transition focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                          >
                            <option value="">不使用模板</option>
                            {templateSelectMatches.map(({ template }) => (
                              <option key={template.id} value={template.id}>
                                {template.name} · {getTemplateModeLabel(template.quoteConfig?.mode)}
                              </option>
                            ))}
                          </SystemSelect>
                        </label>
                      </div>
                    </div>

                    {quotaTemplates.length === 0 ? (
                      <p className="rounded-[14px] border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-700">
                        暂无已启用的定额模板，可先到定额模板中维护后再选择。
                      </p>
                    ) : quotaTemplateMatches.length === 0 ? (
                      <p className="rounded-[14px] border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-700">
                        暂无已启用的定额模板，可先到预算模板中启用后再选择。
                      </p>
                    ) : null}

                    {isPackageTemplate && packagePricePreview && (
                      <div className="rounded-[16px] border border-[#d9e1ec] bg-white p-4">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <label className="flex min-h-[76px] flex-col justify-between rounded-[12px] border border-[#dce8f8] bg-[#f8fbff] px-3 py-2.5 text-sm">
                            <span className="text-xs font-bold text-[#6f7f96]">确认计价面积(㎡)</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={packageQuoteAreaText}
                              onChange={(event) => setPackageQuoteAreaText(sanitizeCreateAreaInput(event.target.value))}
                              onFocus={(event) => {
                                if (Number(event.currentTarget.value) === 0) event.currentTarget.select();
                              }}
                              className="h-8 w-full bg-transparent text-right text-base font-semibold tabular-nums text-black outline-none placeholder:text-surface-400"
                              placeholder="请输入面积"
                            />
                          </label>
                          <div className="flex min-h-[76px] flex-col justify-between rounded-[12px] border border-[#CFE0FF] bg-[#EDF4FF] px-3 py-2.5 text-right">
                            <p className="text-xs font-bold text-[#407AFF]">计算后销售价</p>
                            <p className="text-2xl font-extrabold tabular-nums text-[#407AFF]">
                              {hasPackageQuoteArea ? `¥${formatPricingAmount(packagePricePreview.totalAmount)}` : "待确认"}
                            </p>
                          </div>
                        </div>
                        {!hasPackageQuoteArea && (
                          <p className="mt-3 rounded-[12px] border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                            请输入实际计价面积后，系统会按一口价规则自动计算销售价。
                          </p>
                        )}
                        <div className="mt-2.5 grid gap-2.5 text-xs sm:grid-cols-4">
                          <div className="flex min-h-[62px] flex-col justify-center rounded-[12px] border border-[#dce8f8] bg-[#f8fbff] px-3">
                            <span className="block text-surface-500">套餐面积</span>
                            <strong className="mt-0.5 block tabular-nums text-surface-900">{formatPricingAmount(packagePricePreview.includedArea, 0)}㎡以内</strong>
                          </div>
                          <div className="flex min-h-[62px] flex-col justify-center rounded-[12px] border border-[#dce8f8] bg-[#f8fbff] px-3">
                            <span className="block text-surface-500">套餐价</span>
                            <strong className="mt-0.5 block tabular-nums text-surface-900">¥{formatPricingAmount(packagePricePreview.packageAmount)}</strong>
                          </div>
                          <div className="flex min-h-[62px] flex-col justify-center rounded-[12px] border border-[#dce8f8] bg-[#f8fbff] px-3">
                            <span className="block text-surface-500">超出面积</span>
                            <strong className="mt-0.5 block tabular-nums text-surface-900">{formatPricingAmount(packagePricePreview.extraArea)}㎡</strong>
                          </div>
                          <div className="flex min-h-[62px] flex-col justify-center rounded-[12px] border border-[#dce8f8] bg-[#f8fbff] px-3">
                            <span className="block text-surface-500">超出加价</span>
                            <strong className="mt-0.5 block tabular-nums text-surface-900">¥{formatPricingAmount(packagePricePreview.extraAmount)}</strong>
                          </div>
                        </div>
                        {packagePricePreview.segments.length > 0 && (
                          <p className="mt-3 rounded-[12px] border border-[#CFE0FF] bg-[#EDF4FF] px-3 py-2 text-xs font-semibold leading-5 text-[#407AFF]">
                            阶梯计算：
                            {packagePricePreview.segments.map((segment) => `${formatPricingAmount(segment.startArea, 0)}-${formatPricingAmount(segment.endArea, 0)}㎡ × ${formatPricingAmount(segment.unitPrice)}元/㎡`).join("，")}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid min-h-[220px] flex-1 gap-4 md:grid-cols-2">
                      <label className="flex min-h-0 flex-col rounded-[16px] border border-[#d9e1ec] bg-white p-4 text-sm">
                        <span className="mb-1 block text-xs font-bold text-[#52647b]">内部备注</span>
                        <span className="mb-2 block text-xs font-semibold leading-5 text-[#98a2b3]">仅系统内部查看，不会显示在客户报价单。</span>
                        <textarea
                          value={createNotes}
                          onChange={(event) => setCreateNotes(event.target.value)}
                          className="min-h-0 flex-1 resize-none rounded-[10px] border border-[#cfd7e3] bg-[#f8fafc] px-3 py-2.5 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:bg-white focus:ring-[3px] focus:ring-[#407aff]/12"
                          placeholder="如：客户关注点、沟通记录、报价口径等"
                        />
                      </label>
                      <label className="flex min-h-0 flex-col rounded-[16px] border border-[#d9e1ec] bg-white p-4 text-sm">
                        <span className="mb-1 block text-xs font-bold text-[#52647b]">客户附注</span>
                        <span className="mb-2 block text-xs font-semibold leading-5 text-[#98a2b3]">会显示在报价单底部，综合费用下方、签字栏上方。</span>
                        <textarea
                          value={createCustomerVisibleNote}
                          onChange={(event) => setCreateCustomerVisibleNote(event.target.value)}
                          className="min-h-0 flex-1 resize-none rounded-[10px] border border-[#cfd7e3] bg-[#f8fafc] px-3 py-2.5 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:bg-white focus:ring-[3px] focus:ring-[#407aff]/12"
                          placeholder="如：优惠说明、施工范围补充、特殊约定等"
                        />
                      </label>
                    </div>

                    {message && <p className="rounded-[14px] border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{message}</p>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#d9e1ec] bg-white px-5 py-4">
                  <p className="hidden text-xs font-semibold text-[#667085] sm:block">
                    {isTemporaryQuotationMode
                      ? temporaryCustomer.address ? `将创建「${temporaryCustomer.address}」的临时报价` : "请填写小区/地址"
                      : isNewCustomerMode
                        ? quickCustomer.address ? `将新建客户并创建「${quickCustomer.address}」的报价` : "请填写小区/地址"
                      : selectedCustomer ? `将为 ${selectedCustomer.name || "该客户"} 创建报价` : "请选择客户后再创建报价"}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowCreate(false)} className="btn-secondary">取消</button>
                    <button
                      disabled={(isTemporaryQuotationMode ? !temporaryCustomer.address.trim() : isNewCustomerMode ? !quickCustomer.address.trim() : !customerId) || creating || (isPackageTemplate && packageQuoteArea <= 0)}
                      onClick={async () => {
                        setCreating(true);
                        setMessage("");
                        try {
                          if (isPackageTemplate && packageQuoteArea <= 0) {
                            setMessage("请先确认一口价计价面积");
                            return;
                          }
                          let quotationCustomerId = customerId;
                          let quotationCustomerSnapshot = createCustomerSnapshot;
                          if (isNewCustomerMode) {
                            if (!quickCustomer.address.trim()) {
                              setMessage("请填写小区/地址");
                              return;
                            }
                            const createdCustomer = await api.post<any>("/api/customers", {
                              create_from_quotation: true,
                              name: quickCustomer.name,
                              designer_name: quickCustomer.designer_name,
                              phone: quickCustomer.phone,
                              weixin: quickCustomer.weixin,
                              address: quickCustomer.address,
                              house_address: quickCustomer.address,
                              address_location_name: quickCustomer.address_location_name,
                              address_location_address: quickCustomer.address_location_address,
                              address_latitude: quickCustomer.address_latitude,
                              address_longitude: quickCustomer.address_longitude,
                              building_no: quickCustomer.no_room_number ? "" : quickCustomer.building_no,
                              unit_no: quickCustomer.no_room_number ? "" : quickCustomer.unit_no,
                              room_no: quickCustomer.no_room_number ? "" : quickCustomer.room_no,
                              no_room_number: quickCustomer.no_room_number,
                              area_size: quickCustomer.area_size,
                              decoration_type: quickCustomer.decoration_type,
                              requirements: createNotes,
                            });
                            quotationCustomerId = String(createdCustomer?.id || "").trim();
                            if (!quotationCustomerId) {
                              setMessage("客户创建成功但未返回客户ID，请刷新后重试");
                              return;
                            }
                            quotationCustomerSnapshot = quickCustomerSnapshot;
                          }
                          const res = await api.post<{ id: string; persisted?: boolean }>("/api/quotations", {
                            create_mode: isTemporaryQuotationMode ? "temporary" : "customer",
                            customer_id: isTemporaryQuotationMode ? undefined : quotationCustomerId,
                            customer_snapshot: isTemporaryQuotationMode ? undefined : quotationCustomerSnapshot,
                            temp_customer: isTemporaryQuotationMode ? {
                              name: temporaryCustomer.name,
                              phone: temporaryCustomer.phone,
                              weixin: temporaryCustomer.weixin,
                              address: temporaryCustomer.address,
                              area: temporaryCustomer.area,
                              decoration_type: temporaryCustomer.decoration_type,
                            } : undefined,
                            title,
                            notes: createNotes,
                            customer_visible_note: createCustomerVisibleNote,
                            template: selectedTemplate || undefined,
                            templatePricing: isPackageTemplate ? { area: packageQuoteArea } : undefined,
                          });
                          if (!res?.persisted) {
                            throw new Error("报价保存状态未确认，请刷新预算记录后核对");
                          }
                          setMessage("报价已写入数据库，正在确认列表同步...");
                          await confirmCreatedQuotationPersisted(res.id);
                          await refetchDeletedQuotations();
                          setShowCreate(false);
                          setMessage("报价已保存");
                          if (isNewCustomerMode) {
                            setQuickCustomer(emptyQuickCustomerDraft);
                            setCreateMode("customer");
                          }
                          router.push(`/quotations/${res.id}`);
                        } catch (err: any) {
                          setMessage(err.message || "创建失败");
                        } finally {
                          setCreating(false);
                        }
                      }}
                      className="btn-primary disabled:opacity-50"
                    >
                      {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                      创建并编辑
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {bindQuotation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a]/28 p-4">
          <div className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-[#d9e1ec] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.22)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e4e9f0] px-5 py-4">
              <div>
                <h2 className="text-base font-extrabold text-[#162033]">绑定客户</h2>
                <p className="mt-1 text-xs font-semibold text-[#667085]">将「{bindQuotation.title || "临时报价单"}」归档到正式客户名下。</p>
              </div>
              <button type="button" onClick={() => setBindQuotation(null)} className="rounded-[8px] p-2 text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]" aria-label="关闭绑定客户弹窗"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_260px]">
              <section className="flex min-h-0 flex-col border-b border-[#e4e9f0] md:border-b-0 md:border-r">
                <div className="shrink-0 border-b border-[#e4e9f0] p-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                    <input
                      value={bindCustomerSearch}
                      onChange={(event) => {
                        setBindCustomerSearch(event.target.value);
                        setSelectedBindCustomer(null);
                      }}
                      className="h-11 w-full rounded-[12px] border border-[#cfd7e3] bg-[#f8fafc] pl-10 pr-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:bg-white focus:ring-[3px] focus:ring-[#407aff]/12"
                      placeholder="搜索客户姓名、手机号、小区、房号"
                    />
                  </div>
                  {bindCustomerMore ? <p className="mt-2 text-xs font-semibold text-[#667085]">结果较多，请补充手机号、房号或小区继续定位。</p> : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbfcfe]">
                  {bindCustomerLoading ? (
                    <div className="flex h-40 items-center justify-center text-sm font-semibold text-[#52647b]">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#407aff]" />
                      正在搜索客户...
                    </div>
                  ) : bindCustomerOptions.length > 0 ? (
                    <div className="divide-y divide-[#eef2f6]">
                      {bindCustomerOptions.map((customer: any) => {
                        const active = selectedBindCustomer?.id === customer.id;
                        return (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => setSelectedBindCustomer(customer)}
                            className={`grid w-full grid-cols-[minmax(0,1fr)_124px] items-center gap-3 px-4 py-3 text-left transition ${active ? "bg-[#edf4ff] shadow-[inset_3px_0_0_#407aff]" : "bg-white hover:bg-[#f8fafc]"}`}
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-extrabold text-[#162033]">{customer.name || "未命名客户"}</span>
                                {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#407aff]" /> : null}
                              </div>
                              <p className="mt-1 truncate text-xs font-semibold text-[#667085]">{getCustomerHouseText(customer)}</p>
                            </div>
                            <span className="truncate text-right text-xs font-bold tabular-nums text-[#475467]">{getCustomerContactText(customer)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="m-4 rounded-[12px] border border-dashed border-[#cfd7e3] bg-white px-4 py-10 text-center">
                      <p className="text-sm font-extrabold text-[#162033]">没有找到客户</p>
                      <p className="mt-1 text-xs font-semibold text-[#667085]">请先在客户管理中创建客户，再回来绑定报价。</p>
                    </div>
                  )}
                </div>
              </section>
              <aside className="flex flex-col bg-[#f8fafc] p-4">
                <p className="text-xs font-bold text-[#667085]">待绑定报价</p>
                <p className="mt-1 text-sm font-extrabold text-[#162033]">{bindQuotation.customer_name || "临时客户"}</p>
                <p className="mt-1 text-xs font-semibold text-[#667085]">{bindQuotation.customer_phone || bindQuotation.customer_address || "暂无联系方式/地址"}</p>
                <div className="mt-4 rounded-[12px] border border-[#d9e1ec] bg-white p-3">
                  <p className="text-xs font-bold text-[#667085]">绑定到</p>
                  {selectedBindCustomer ? (
                    <div className="mt-2">
                      <p className="truncate text-sm font-extrabold text-[#162033]">{selectedBindCustomer.name}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-[#667085]">{getCustomerHouseText(selectedBindCustomer)}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-semibold leading-5 text-[#98a2b3]">请在左侧选择一个正式客户。</p>
                  )}
                </div>
                {message ? <p className="mt-3 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{message}</p> : null}
                <div className="mt-auto flex justify-end gap-2 pt-4">
                  <button type="button" onClick={() => setBindQuotation(null)} className="btn-secondary">取消</button>
                  <button type="button" disabled={!selectedBindCustomer || bindingCustomer} onClick={bindQuotationToCustomer} className="btn-primary disabled:opacity-50">
                    {bindingCustomer ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    确认绑定
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {copyQuotationDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a]/28 p-4">
          <div className={`quotation-copy-modal quotation-copy-modal-fixed flex h-[min(720px,calc(100dvh-48px))] w-full max-w-[680px] flex-col overflow-hidden rounded-[14px] border border-[#d9e1ec] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.22)] ${copyTargetMode === "other" ? "quotation-copy-modal-other" : ""}`}>
            <div className="quotation-copy-header flex shrink-0 items-start justify-between gap-4 border-b border-[#e4e9f0] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d6e4ff] bg-[#f5f8ff] text-[#407aff]">
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#12b76a]" />
                  <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-white ring-1 ring-[#dbe7ff]">
                    <Copy className="h-4 w-4 stroke-[2.2]" />
                  </span>
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold text-[#162033]">复制报价</h2>
                  <p className="mt-1 truncate text-xs font-medium text-[#667085]">{copyQuotationDialog.title || "装修报价单"}</p>
                </div>
              </div>
              <button type="button" onClick={closeCopyQuotationDialog} disabled={copyingQuotation} className="rounded-[8px] p-2 text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230] disabled:opacity-50" aria-label="关闭复制报价弹窗"><X className="h-4 w-4" /></button>
            </div>

            <div className="quotation-copy-body flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-5 py-4">
              <div className="quotation-copy-static-area shrink-0">
                <div className="quotation-copy-section-label">
                  <span>复制位置</span>
                </div>
                <div className="quotation-copy-target-tabs grid grid-cols-2 rounded-[10px] bg-[#f2f5f9] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCopyTargetMode("current");
                      setSelectedCopyCustomer(null);
                    }}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-[8px] text-xs transition ${copyTargetMode === "current" ? "bg-white font-semibold text-[#182230] ring-1 ring-[#d9e2ef]" : "font-medium text-[#667085] hover:text-[#344054]"}`}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-[6px] ${copyTargetMode === "current" ? "bg-[#edf4ff] text-[#407aff]" : "bg-white/70 text-[#98a2b3]"}`}>
                      <ReceiptText className="h-3.5 w-3.5 stroke-[2.2]" />
                    </span>
                    复制到当前客户
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopyTargetMode("other")}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-[8px] text-xs transition ${copyTargetMode === "other" ? "bg-white font-semibold text-[#182230] ring-1 ring-[#d9e2ef]" : "font-medium text-[#667085] hover:text-[#344054]"}`}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-[6px] ${copyTargetMode === "other" ? "bg-[#edf4ff] text-[#407aff]" : "bg-white/70 text-[#98a2b3]"}`}>
                      <Users className="h-3.5 w-3.5 stroke-[2.2]" />
                    </span>
                    复制到其他客户
                  </button>
                </div>

                <div className="quotation-copy-section-label mt-4">
                  <span>复制内容</span>
                </div>
                <div className="quotation-copy-choice-panel mt-2 rounded-[12px] border border-[#e1e7f0] bg-white">
                  <button
                    type="button"
                    onClick={() => setCopyContentMode("full")}
                    className={`flex w-full items-center justify-between gap-3 rounded-t-[12px] px-3.5 py-3 text-left transition ${copyContentMode === "full" ? "bg-[#f6f9ff]" : "hover:bg-[#fbfcfe]"}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${copyContentMode === "full" ? "border-[#cfe0ff] bg-white text-[#407aff]" : "border-[#e3e9f2] bg-[#f8fafc] text-[#8a96a8]"}`}>
                        <ReceiptText className="h-4 w-4 stroke-[2.2]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#182230]">复制完整报价</span>
                        <span className="mt-0.5 block text-xs leading-4 text-[#667085]">项目、数量、单价、金额和优惠都复制过去</span>
                      </span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${copyContentMode === "full" ? "border-[#407aff] bg-[#407aff] text-white ring-4 ring-[#407aff]/10" : "border-[#cfd7e3] bg-white text-transparent"}`}>
                      <Check className="h-3.5 w-3.5 stroke-[2.4]" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopyContentMode("items_only")}
                    className={`flex w-full items-center justify-between gap-3 rounded-b-[12px] border-t border-[#edf1f6] px-3.5 py-3 text-left transition ${copyContentMode === "items_only" ? "bg-[#f6f9ff]" : "hover:bg-[#fbfcfe]"}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${copyContentMode === "items_only" ? "border-[#cfe0ff] bg-white text-[#407aff]" : "border-[#e3e9f2] bg-[#f8fafc] text-[#8a96a8]"}`}>
                        <FileText className="h-4 w-4 stroke-[2.2]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#182230]">只复制项目</span>
                        <span className="mt-0.5 block text-xs leading-4 text-[#667085]">保留项目、单位、说明和单价，数量和优惠清空</span>
                      </span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${copyContentMode === "items_only" ? "border-[#407aff] bg-[#407aff] text-white ring-4 ring-[#407aff]/10" : "border-[#cfd7e3] bg-white text-transparent"}`}>
                      <Check className="h-3.5 w-3.5 stroke-[2.4]" />
                    </span>
                  </button>
                </div>
              </div>

              {copyTargetMode === "current" ? (
                <div className="quotation-copy-target-card mt-4 shrink-0 rounded-[10px] border border-[#e6ebf2] bg-[#fbfcfe] px-3.5 py-3">
                  <div className="quotation-copy-current-summary flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="quotation-copy-customer-avatar">
                        {(copyQuotationDialog.customer_name || activeRecordCustomer?.customer_name || "客").slice(0, 1)}
                      </span>
                      <div className="min-w-0">
                        <p className="quotation-copy-target-caption">复制去向</p>
                        <p className="truncate text-[15px] font-semibold text-[#182230]">{copyQuotationDialog.customer_name || activeRecordCustomer?.customer_name || "当前客户"}</p>
                        <p className="mt-0.5 truncate text-xs text-[#667085]">{copyQuotationDialog.title || "装修报价单"}</p>
                      </div>
                    </div>
                    <div className="quotation-copy-result-meta shrink-0 text-right">
                      <span>生成草稿</span>
                      <p>{copyContentMode === "items_only" ? "只复制项目" : "完整报价"}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="quotation-copy-other-target mt-4 flex min-h-0 flex-1 flex-col">
                  <div className="relative shrink-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                    <input
                      value={copyCustomerSearch}
                      onChange={(event) => {
                        setCopyCustomerSearch(event.target.value);
                        setSelectedCopyCustomer(null);
                      }}
                      className="quotation-copy-search h-10 w-full rounded-[10px] border border-[#cfd7e3] bg-white pl-9 pr-3 text-sm font-semibold text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407aff] focus:ring-[3px] focus:ring-[#407aff]/12"
                      placeholder="搜索客户姓名、手机号、小区、房号"
                    />
                  </div>
                  {copyCustomerMore ? <p className="mt-2 shrink-0 text-xs font-medium text-[#667085]">客户数量较多，已显示前 1000 条，可输入关键词继续定位。</p> : null}
                  <div className="quotation-copy-customer-list mt-3 min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-[#e1e7f0] bg-white">
                    {copyCustomerLoading ? (
                      <div className="flex h-28 items-center justify-center text-sm font-semibold text-[#52647b]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#407aff]" />
                        正在搜索客户...
                      </div>
                    ) : copyCustomerOptions.length > 0 ? (
                      <div className="divide-y divide-[#eef2f6]">
                        {copyCustomerOptions.map((customer: any) => {
                          const active = selectedCopyCustomer?.id === customer.id;
                          const statusView = getCopyCustomerStatusView(customer);
                          const houseText = getCustomerHouseText(customer) || "-";
                          const contactText = getCustomerContactText(customer) || "-";
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => setSelectedCopyCustomer(customer)}
                              className={`quotation-copy-customer-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left transition ${active ? "bg-[#f3f7ff]" : "bg-white hover:bg-[#f8fafc]"}`}
                            >
                              <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2">
                                <span className={`quotation-copy-customer-status inline-flex h-[18px] w-[64px] items-center justify-center rounded-[6px] border text-[11px] font-semibold ${statusView.className}`}>
                                  <span className="truncate px-1">
                                    {statusView.label}
                                  </span>
                                </span>
                                <div className="min-w-0">
                                  <p className="min-w-0 truncate text-[12px] font-semibold leading-4 text-[#182230]" title={houseText}>
                                    {houseText}
                                  </p>
                                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-[#667085]">
                                    <span className="truncate font-medium">{customer.name || "未命名客户"}</span>
                                    <span className="shrink-0 text-[#c7cfda]">·</span>
                                    <span className="truncate tabular-nums">{contactText}</span>
                                  </div>
                                </div>
                              </div>
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-[#407aff] bg-[#407aff] text-white" : "border-[#d0d7e2] bg-white text-transparent"}`}>
                                <Check className="h-3 w-3" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <p className="text-sm font-semibold text-[#182230]">没有找到客户</p>
                        <p className="mt-1 text-xs text-[#667085]">请换个关键词搜索，或先到客户管理创建客户。</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="quotation-copy-hint mt-2 shrink-0 px-1 text-xs leading-5 text-[#667085]">
                {copyContentMode === "items_only"
                  ? `最终会${copyTargetMode === "other" ? "复制到所选客户" : "复制到当前客户"}，保留项目、单位、说明和单价，数量、金额和优惠会清空。`
                  : `最终会${copyTargetMode === "other" ? "复制到所选客户" : "复制到当前客户"}，项目、数量、单价和金额都会一起复制为草稿。`}
              </p>
              {message ? <p className="mt-3 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{message}</p> : null}

              <div className="quotation-copy-footer">
                <button type="button" onClick={closeCopyQuotationDialog} disabled={copyingQuotation} className="quotation-copy-cancel-button disabled:opacity-50">取消</button>
                <button type="button" disabled={copyingQuotation || (copyTargetMode === "other" && !selectedCopyCustomer)} onClick={confirmCopyQuotation} className="quotation-copy-confirm-button disabled:opacity-50">
                  {copyingQuotation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  确认复制
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {systemDialog && (
        <QuotationSystemDialogModal
          dialog={systemDialog}
          onClose={() => setSystemDialog(null)}
        />
      )}

      {textDialog && (
        <QuotationTextDialogModal
          dialog={textDialog}
          onClose={() => setTextDialog(null)}
        />
      )}

      {editingRecordProjectInfo && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRecordProjectInfoEditor();
          }}
        >
          <div className="quote-project-info-modal w-full max-w-[820px] overflow-hidden rounded-xl border border-surface-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-surface-100 px-5 py-3.5">
              <div>
                <div className="text-sm font-semibold text-[#182230]">编辑报价资料</div>
                <p className="mt-1 text-xs text-surface-500">该客户来源于新建报价，修改字段会同步本次报价与客户档案。</p>
              </div>
              <button
                type="button"
                onClick={closeRecordProjectInfoEditor}
                disabled={recordProjectInfoSaving}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition hover:bg-surface-100 hover:text-surface-700 disabled:opacity-50"
                aria-label="关闭编辑资料"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="quote-project-info-body">
              <div className="quote-project-info-form-grid">
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>客户名称</span>
                  <input value={recordProjectInfoForm.customerName} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, customerName: event.target.value }))} placeholder="如：张先生、李女士" />
                </label>
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>设计师</span>
                  <input value={recordProjectInfoForm.designerName} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, designerName: event.target.value }))} placeholder="手动填写设计师姓名" />
                </label>
                <label className="quote-project-info-field">
                  <span>手机号</span>
                  <input value={recordProjectInfoForm.customerPhone} inputMode="numeric" maxLength={11} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, customerPhone: sanitizeCreatePhoneInput(event.target.value) }))} placeholder="手机号" />
                </label>
                <label className="quote-project-info-field">
                  <span>微信</span>
                  <input value={recordProjectInfoForm.customerWeixin} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, customerWeixin: event.target.value }))} placeholder="微信号" />
                </label>
                <label className="quote-project-info-address quote-project-info-span-2">
                  <span>小区/地址 <em>*</em></span>
                  <div>
                    <input value={recordProjectInfoForm.customerAddress} onChange={(event) => updateRecordProjectInfoAddressText(event.target.value)} placeholder="例如：广州圣心大教堂" />
                    <button type="button" onClick={() => setRecordProjectInfoMapPickerOpen(true)}>
                      <MapPin className="h-3.5 w-3.5" />
                      地图选点
                    </button>
                  </div>
                </label>
                {recordProjectInfoForm.addressLatitude && recordProjectInfoForm.addressLongitude ? (
                  <p className="quote-project-info-location-status quote-project-info-span-2">
                    <MapPin className="h-3 w-3" />
                    已保存实际地址定位
                  </p>
                ) : null}
                <div className="quote-project-info-room-row quote-project-info-span-2">
                  <label className="quote-project-info-field">
                    <span>楼栋</span>
                    <input disabled={recordProjectInfoForm.noRoomNumber} value={recordProjectInfoForm.buildingNo} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, buildingNo: event.target.value }))} placeholder="H7" />
                  </label>
                  <label className="quote-project-info-field">
                    <span>单元</span>
                    <input disabled={recordProjectInfoForm.noRoomNumber} value={recordProjectInfoForm.unitNo} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, unitNo: event.target.value }))} placeholder="4" />
                  </label>
                  <label className="quote-project-info-field">
                    <span>房室</span>
                    <input disabled={recordProjectInfoForm.noRoomNumber} value={recordProjectInfoForm.roomNo} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, roomNo: event.target.value }))} placeholder="1023" />
                  </label>
                </div>
                <label className="quote-project-info-check quote-project-info-span-2">
                  <input
                    type="checkbox"
                    checked={recordProjectInfoForm.noRoomNumber}
                    onChange={(event) => setRecordProjectInfoForm((current) => ({
                      ...current,
                      noRoomNumber: event.target.checked,
                      ...(event.target.checked ? { buildingNo: "", unitNo: "", roomNo: "" } : {}),
                    }))}
                  />
                  <i>{recordProjectInfoForm.noRoomNumber && <Check className="h-3.5 w-3.5" />}</i>
                  暂无房号
                </label>
                <label className="quote-project-info-field">
                  <span>面积(m²)</span>
                  <div className="quote-project-info-area">
                    <input inputMode="decimal" value={recordProjectInfoForm.areaSize} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, areaSize: sanitizeCreateAreaInput(event.target.value) }))} placeholder="面积" />
                    <em>㎡</em>
                  </div>
                </label>
                <label className="quote-project-info-field">
                  <span>装修类型</span>
                  <input list="record-project-decoration-types" value={recordProjectInfoForm.decorationType} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, decorationType: event.target.value }))} placeholder="如：全包/半包" />
                </label>
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>内部备注</span>
                  <textarea value={recordProjectInfoForm.notes} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, notes: event.target.value }))} placeholder="仅内部查看，如客户关注点、沟通记录、报价口径等" rows={3} />
                </label>
                <label className="quote-project-info-field quote-project-info-span-2">
                  <span>客户附注</span>
                  <textarea value={recordProjectInfoForm.customerVisibleNote} onChange={(event) => setRecordProjectInfoForm((current) => ({ ...current, customerVisibleNote: event.target.value }))} placeholder="会显示在报价单底部，如优惠说明、施工范围补充、特殊约定等" rows={3} />
                </label>
                <datalist id="record-project-decoration-types">
                  {recordDecorationTypeOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-surface-100 bg-surface-50 px-5 py-4">
              <button type="button" onClick={closeRecordProjectInfoEditor} disabled={recordProjectInfoSaving} className="inline-flex h-9 items-center justify-center rounded-lg border border-surface-200 bg-white px-4 text-xs font-semibold text-surface-600 transition hover:bg-surface-100 disabled:opacity-50">
                取消
              </button>
              <button type="button" onClick={submitRecordProjectInfo} disabled={recordProjectInfoSaving} className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-lg bg-primary-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">
                {recordProjectInfoSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                保存资料
              </button>
            </div>
          </div>
        </div>
      )}

      {changeLogRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f172a]/10 p-4 md:p-6">
          <div className="quotation-change-log-modal flex h-[min(820px,calc(100dvh-56px))] w-full max-w-[980px] flex-col overflow-hidden rounded-[16px] border border-[#d7e0eb] bg-white shadow-none [&_*]:!shadow-none" style={{ boxShadow: "none", backgroundImage: "none" }}>
            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 pb-4 pt-4">
              <div className="mb-3 flex items-start justify-between gap-4 bg-white shadow-none" style={{ boxShadow: "none", backgroundImage: "none" }}>
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#d8e6ff] bg-[#f3f7ff] text-[#407aff] shadow-none" style={{ boxShadow: "none", backgroundImage: "none" }}>
                      <History className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-[16px] font-semibold text-[#182230]">报价变更记录</h2>
                    <p className="mt-0.5 truncate text-[11px] text-[#667085]">{changeLogRecord.title || getBudgetRecordTitle(changeLogRecord)}</p>
                  </div>
                </div>
                <button type="button" onClick={closeQuotationChangeLogs} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]" aria-label="关闭报价变更记录">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {changeLogsLoading ? (
                <div className="flex min-h-[280px] items-center justify-center rounded-[12px] border border-[#e2e8f0] bg-white text-sm font-medium text-[#52647b] shadow-none">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#407aff]" />
                  正在读取变更记录...
                </div>
              ) : changeLogsError ? (
                <div className="rounded-[12px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{changeLogsError}</div>
              ) : changeLogs.length > 0 ? (
                <div className="space-y-2.5 pt-0">
                  {changeLogs.map((log) => {
                    const displayChanges = getQuotationChangeDisplayItems(log.changes);
                    const displaySummary = getChangeLogDisplaySummary(log, displayChanges);
                    return (
                    <section key={log.id} className="overflow-hidden rounded-[12px] border border-[#dfe6ef] bg-white shadow-none">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 pb-1.5 pt-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#182230] text-[11px] font-semibold text-white ring-1 ring-[#e3eaf3]">
                            {log.user_avatar ? (
                              <NativeImage src={log.user_avatar} alt={`${log.user_name || "操作人"}头像`} className="h-full w-full object-cover" loading="eager" />
                            ) : (
                              (log.user_name || "用").slice(0, 1)
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[#182230]">{log.user_name || "未知用户"} 在 {formatChangeLogDateTime(log.created_at)} 操作</p>
                            <p className="mt-0.5 text-[10px] leading-3 text-[#8a96a8]">{displaySummary}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-[#f1f4f8] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[#52647b]">
                          {displayChanges.length} 条
                        </span>
                      </div>
                      <div className="bg-white px-2.5 py-1.5">
                        <div className="divide-y divide-[#eef2f6]">
                          {displayChanges.map((displayChange) => {
                            if (displayChange.kind === "replacement") {
                              return (
                                <article key={displayChange.id} className="rounded-[10px] px-2.5 py-2 transition hover:bg-[#f8fafc]">
                                  <p className="break-words text-xs font-medium leading-4 text-[#182230]">
                                    由「{displayChange.oldName}」替换为「{displayChange.newName}」
                                  </p>
                                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] leading-3 text-[#8a96a8]">
                                    {displayChange.space ? <span>{displayChange.space}</span> : null}
                                    {displayChange.space && displayChange.category ? <span className="text-[#c1c9d6]">/</span> : null}
                                    {getChangeCategoryLabel(displayChange.category) ? <span>{getChangeCategoryLabel(displayChange.category)}</span> : null}
                                  </div>
                                </article>
                              );
                            }
                            const change = displayChange.change;
                            return (
                            <article key={displayChange.id} className="grid gap-2 rounded-[10px] px-2.5 py-1.5 transition hover:bg-[#f8fafc] md:grid-cols-[minmax(0,0.76fr)_minmax(340px,0.74fr)] md:items-center">
                              <div className="min-w-0">
                                <p className="break-words text-xs font-medium leading-4 text-[#182230]">
                                  {getChangeActionText(displayChange.change)}
                                </p>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] leading-3 text-[#8a96a8]">
                                  {change?.space ? <span>{change.space}</span> : null}
                                  {change?.space && change.category ? <span className="text-[#c1c9d6]">/</span> : null}
                                  {getChangeCategoryLabel(change?.category) ? <span>{getChangeCategoryLabel(change?.category)}</span> : null}
                                </div>
                              </div>
                              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] gap-1.5">
                                <div className="min-w-0 rounded-[7px] border border-[#edf1f6] bg-white px-2.5 py-1.5">
                                  <p className="text-[10px] leading-3 text-[#98a2b3]">原值</p>
                                  <p className="whitespace-pre-wrap break-words text-xs leading-4 text-[#667085]">
                                    {change?.change_type === "created" ? "-" : formatChangeValue(change?.old_value)}
                                  </p>
                                </div>
                                <span className="flex items-center justify-center text-xs text-[#b8c2d0]">→</span>
                                <div className="min-w-0 rounded-[7px] border border-[#dbe8ff] bg-[#f8fbff] px-2.5 py-1.5">
                                  <p className="text-[10px] leading-3 text-[#407aff]">新值</p>
                                  <p className={`whitespace-pre-wrap break-words text-xs leading-4 ${change?.change_type === "deleted" ? "text-[#98a2b3]" : "text-[#182230]"}`}>
                                    {change?.change_type === "deleted" ? "-" : formatChangeValue(change?.new_value)}
                                  </p>
                                </div>
                              </div>
                            </article>
                          )})}
                        </div>
                      </div>
                    </section>
                  )})}
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#cfd7e3] bg-white px-6 text-center shadow-none">
                  <History className="mb-3 h-8 w-8 text-[#98a2b3]" />
                  <h3 className="text-sm font-semibold text-[#182230]">暂无变更记录</h3>
                  <p className="mt-2 max-w-sm text-xs leading-5 text-[#667085]">从现在开始，报价明细里的数量、单价、名称、工艺说明等内容变化会记录在这里。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AddCustomerModal
        isOpen={Boolean(editingRecordCustomer)}
        onClose={() => setEditingRecordCustomer(null)}
        onSuccess={() => {
          setEditingRecordCustomer(null);
          void refetch();
          void refetchDeletedQuotations();
        }}
        customer={editingRecordCustomer}
      />

      {recordProjectInfoMapPickerOpen && (
        <AmapLocationPicker
          initialKeyword={recordProjectInfoForm.customerAddress}
          onClose={() => setRecordProjectInfoMapPickerOpen(false)}
          onConfirm={applyRecordProjectInfoPickedLocation}
        />
      )}

      {createMapPickerOpen && (
        <AmapLocationPicker
          initialKeyword={isTemporaryQuotationMode ? temporaryCustomer.address : isNewCustomerMode ? quickCustomer.address : createCustomerSnapshot.address}
          onClose={() => setCreateMapPickerOpen(false)}
          onConfirm={applyCreatePickedLocation}
        />
      )}

      {lockTooltip && typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-80 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold leading-5 text-amber-800 shadow-[0_16px_36px_rgba(146,64,14,0.18)]"
          style={{ top: lockTooltip.top, left: lockTooltip.left }}
        >
          {lockTooltip.text}
        </div>,
        document.body,
      )}
    </div>
  );
}
