"use client";

import {
  CustomerListMeta,
  CustomerListMode,
  CustomerListResponse,
} from "./customer-list-shared";
import {
  buildCustomerListMetaUrl,
  buildCustomerListUrl,
  columnDefs,
  defaultColumns,
  departmentFilterTypeTips,
  departmentFilterTypes,
  fetchCustomerList,
  fetchCustomerMeta,
  customerOwnerScopeTips,
  customerOwnerScopes,
  getCustomerPhoneKey,
  getFollowupStatus,
  isStarIntention,
  lifecycleStatusClassNames,
  mergeCustomerColumnOrder,
  useDebouncedValue,
} from "./customer-list-utils";



import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleHelp, Download, GripVertical, Loader2, Pencil, Phone, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
const AddCustomerModal = dynamic(() => import("@/components/ui/AddCustomerModal"), {
  ssr: false,
  loading: () => null,
});
import DataPagination from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import { customerStatusFlow, customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import SystemSelect from "@/components/ui/SystemSelect";
import SystemDateInput from "@/components/ui/SystemDateInput";
import styles from "./projects.module.css";


import {
  Customer,
  CustomerOwnerScope,
  DepartmentFilterType,
  OrgUnit,
  StaffInlineAvatar,
  buildOrgOptions,
  getCustomerRoomDisplay,
  primaryButtonClass,
  secondaryButtonClass,
} from "./customer-list-shared";
import {
  DuplicateCustomersModal,
  FilterField,
  ImportCustomersModal,
  OrgUnitFilterPicker,
  downloadXlsx,
} from "./customer-list-modals";

const pageClass = styles.page;
const tableCellBase = `${styles.tableCell} whitespace-nowrap align-middle`;
const panelClass = styles.panel;
const inputControlClass = `${styles.inputControl} h-9 px-3 text-sm outline-none transition`;
const filterButtonClass = `${styles.filterButton} inline-flex min-h-9 items-center justify-center gap-2 border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60`;
const filterGhostButtonClass = styles.filterGhostButton;
const filterActiveButtonClass = styles.segmentActive;
const customerColumnWidths: Record<string, number> = {
  name: 150,
  address: 210,
  contact: 150,
  area_size: 82,
  duplicate: 88,
  budget: 116,
  status: 126,
  business_department: 112,
  advisor: 118,
  designer: 108,
  design_department: 112,
  created_at: 120,
  last_followup: 132,
  next_followup: 132,
  service_store: 112,
  followup_status: 126,
  intention: 96,
};

type CustomerColumnDropSide = "before" | "after";
type CustomerExportScope = "selected" | "page" | "filtered" | "all";

const statusFilter: { value: string; label: string; filterStatus: string | null }[] = [
  { value: "all", label: "全部", filterStatus: null },
  ...customerStatusFlow.map((status) => ({
    value: status.value,
    label: status.label,
    filterStatus: status.value,
  })),
];

function isCustomerColumnKey(value: string): value is string {
  return defaultColumns.includes(value);
}

function moveCustomerColumnWithPlacement(
  columns: string[],
  sourceColumn: string,
  targetColumn: string,
  side: CustomerColumnDropSide,
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

export default function CustomerManagementPage() {
  const router = useRouter();
  const [listMode, setListMode] = useState<CustomerListMode>("active");
  const [filter, setFilter] = useState("all");
  const [ownerScope, setOwnerScope] = useState<Exclude<CustomerOwnerScope, "all">>("service");
  const [search, setSearch] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const moreFiltersButtonRef = useRef<HTMLButtonElement>(null);
  const moreFiltersPanelRef = useRef<HTMLDivElement>(null);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [advisorFilter, setAdvisorFilter] = useState("");
  const [designerFilter, setDesignerFilter] = useState("");
  const [intentionFilter, setIntentionFilter] = useState("");
  const [followupFilter, setFollowupFilter] = useState("");
  const [departmentType, setDepartmentType] = useState<DepartmentFilterType>("business");
  const [departmentOrgId, setDepartmentOrgId] = useState("");
  const [departmentIncludeChildren, setDepartmentIncludeChildren] = useState(true);
  const [duplicateFilter, setDuplicateFilter] = useState("");
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProfileCustomer, setEditingProfileCustomer] = useState<Customer | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);
  const [duplicateCustomers, setDuplicateCustomers] = useState<Customer[]>([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerListResponse | null>(null);
  const [customerMeta, setCustomerMeta] = useState<{ key: string; data: CustomerListMeta } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [openingCustomerId, setOpeningCustomerId] = useState<string | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const [restoringCustomerId, setRestoringCustomerId] = useState<string | null>(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    if (!showMoreFilters) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (moreFiltersButtonRef.current?.contains(target) || moreFiltersPanelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".system-select-menu, [data-customer-filter-overlay], [data-system-date-picker]")) return;
      setShowMoreFilters(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowMoreFilters(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMoreFilters]);

  const customerList = useMemo(() => customerData?.customers ?? [], [customerData]);
  const totalCustomers = customerData?.total ?? 0;
  const selectedCustomerIdSet = useMemo(() => new Set(selectedCustomerIds), [selectedCustomerIds]);
  const currentPageCustomerIds = useMemo(() => customerList.map((customer) => customer.id).filter(Boolean), [customerList]);
  const selectedCurrentPageCount = currentPageCustomerIds.filter((id) => selectedCustomerIdSet.has(id)).length;
  const isCurrentPageAllSelected = currentPageCustomerIds.length > 0 && selectedCurrentPageCount === currentPageCustomerIds.length;
  const isCurrentPagePartiallySelected = selectedCurrentPageCount > 0 && !isCurrentPageAllSelected;
  const sourceOptions = customerMeta?.data.sourceOptions ?? customerData?.sourceOptions ?? [];
  const storeOptions = customerMeta?.data.storeOptions ?? customerData?.storeOptions ?? [];
  const advisorOptions = customerMeta?.data.advisorOptions ?? customerData?.advisorOptions ?? [];
  const designerOptions = customerMeta?.data.designerOptions ?? customerData?.designerOptions ?? [];
  const intentionOptions = useMemo(
    () => customerMeta?.data.intentionOptions ?? customerData?.intentionOptions ?? [],
    [customerData?.intentionOptions, customerMeta?.data.intentionOptions],
  );
  const intentionFilterOptions = useMemo(() => {
    const starOptions = Array.from({ length: 5 }, (_, index) => "★".repeat(index + 1));
    return Array.from(new Set([...starOptions, ...intentionOptions])).filter(Boolean);
  }, [intentionOptions]);
  const orgOptions = useMemo(() => buildOrgOptions(orgUnits), [orgUnits]);
  const activeStoreOptions = useMemo(
    () => orgUnits
      .filter((unit) => unit.type === "store" && Number(unit.is_active ?? 1) === 1)
      .map((unit) => unit.name)
      .filter(Boolean),
    [orgUnits],
  );
  const selectedDepartmentOrg = useMemo(() => orgOptions.find((option) => option.id === departmentOrgId) || null, [departmentOrgId, orgOptions]);
  const selectedDepartmentTypeLabel = departmentFilterTypes.find((item) => item.value === departmentType)?.label || "部门";
  const customerFilterKey = useMemo(() => [
    filter,
    debouncedSearch,
    createdFrom,
    createdTo,
    sourceFilter,
    storeFilter,
    advisorFilter,
    designerFilter,
    intentionFilter,
    followupFilter,
    departmentType,
    departmentOrgId,
    departmentIncludeChildren ? "1" : "0",
    duplicateFilter,
    ownerScope,
    listMode,
  ].join("|"), [advisorFilter, createdFrom, createdTo, debouncedSearch, departmentIncludeChildren, departmentOrgId, departmentType, designerFilter, duplicateFilter, filter, followupFilter, intentionFilter, listMode, ownerScope, sourceFilter, storeFilter]);
  const lastCustomerFilterKey = useRef(customerFilterKey);
  const effectivePage = lastCustomerFilterKey.current === customerFilterKey ? page : 1;

  const phoneCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    customerList.forEach((customer) => {
      const phone = getCustomerPhoneKey(customer);
      const duplicateCount = Number(customer.phone_duplicate_count || 0);
      if (phone) map[phone] = duplicateCount > 0 ? duplicateCount : (map[phone] || 0) + 1;
    });
    return map;
  }, [customerList]);

 const currentListUrl = useMemo(() => buildCustomerListUrl({
    page: effectivePage,
    pageSize,
    filter,
    search: debouncedSearch,
    createdFrom,
    createdTo,
    sourceFilter,
    storeFilter,
    advisorFilter,
    designerFilter,
    intentionFilter,
    followupFilter,
    departmentType,
    departmentOrgId,
    departmentIncludeChildren,
    duplicateFilter,
    includeMeta: false,
    ownerScope,
    listMode,
  }), [advisorFilter, createdFrom, createdTo, debouncedSearch, departmentIncludeChildren, departmentOrgId, departmentType, designerFilter, duplicateFilter, effectivePage, filter, followupFilter, intentionFilter, listMode, ownerScope, pageSize, sourceFilter, storeFilter]);

  const currentMetaUrl = useMemo(() => buildCustomerListMetaUrl({
    page: 1,
    pageSize,
    filter: "all",
    search: debouncedSearch,
    createdFrom,
    createdTo,
    sourceFilter,
    storeFilter,
    advisorFilter,
    designerFilter,
    intentionFilter,
    followupFilter,
    departmentType,
    departmentOrgId,
    departmentIncludeChildren,
    duplicateFilter,
    ownerScope,
    listMode,
  }), [advisorFilter, createdFrom, createdTo, debouncedSearch, departmentIncludeChildren, departmentOrgId, departmentType, designerFilter, duplicateFilter, followupFilter, intentionFilter, listMode, ownerScope, pageSize, sourceFilter, storeFilter]);

  const statusCountsReady = customerMeta?.key === currentMetaUrl || Boolean(customerData?.statusCounts && Object.keys(customerData.statusCounts).length > 0);
  const statusCounts = statusCountsReady
    ? (customerMeta?.key === currentMetaUrl ? customerMeta.data.statusCounts : customerData?.statusCounts ?? {})
    : {};

  const reloadCustomerMeta = useCallback(async () => {
    try {
      const data = await fetchCustomerMeta(currentMetaUrl);
      setCustomerMeta({ key: currentMetaUrl, data });
    } catch {
      // 筛选辅助数据加载失败不影响客户列表首屏展示。
    }
  }, [currentMetaUrl]);

  const reloadCustomers = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const data = await fetchCustomerList(currentListUrl);
      setCustomerData(data);
      void reloadCustomerMeta();
    } catch (err: any) {
      setLoadError(err?.message || "客户列表加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [currentListUrl, reloadCustomerMeta]);

  useEffect(() => {
    if (lastCustomerFilterKey.current === customerFilterKey) return;
    lastCustomerFilterKey.current = customerFilterKey;
    setPage(1);
    setSelectedCustomerIds([]);
  }, [customerFilterKey]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError("");
    fetchCustomerList(currentListUrl, controller.signal)
      .then((data) => setCustomerData(data))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setLoadError(err?.message || "客户列表加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [currentListUrl]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomerMeta(currentMetaUrl, controller.signal)
      .then((data) => setCustomerMeta({ key: currentMetaUrl, data }))
      .catch(() => {});
    return () => controller.abort();
  }, [currentMetaUrl]);

  useEffect(() => {
    fetch("/api/org")
      .then((res) => res.json())
      .then((data) => setOrgUnits(Array.isArray(data) ? data : []))
      .catch(() => setOrgUnits([]));
  }, []);

  useEffect(() => {
    if (!duplicatePhone) {
      setDuplicateCustomers([]);
      setDuplicateLoading(false);
      return;
    }
    const controller = new AbortController();
    setDuplicateLoading(true);
    fetchCustomerList(buildCustomerListUrl({
      page: 1,
      pageSize: 300,
      filter: "all",
      search: "",
      createdFrom: "",
      createdTo: "",
      sourceFilter: "",
      storeFilter: "",
      advisorFilter: "",
      designerFilter: "",
      intentionFilter: "",
      followupFilter: "",
      departmentType: "business",
      departmentOrgId: "",
      departmentIncludeChildren: true,
      duplicateFilter: "",
      includeMeta: false,
      duplicatePhone,
      listMode: "active",
    }), controller.signal)
      .then((data) => setDuplicateCustomers(data.customers || []))
      .catch(() => setDuplicateCustomers([]))
      .finally(() => {
        if (!controller.signal.aborted) setDuplicateLoading(false);
      });
    return () => controller.abort();
  }, [duplicatePhone]);

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("customer_columns_order") : null;
      const parsed = saved ? JSON.parse(saved) : null;
      return mergeCustomerColumnOrder(parsed);
    } catch {
      return defaultColumns;
    }
  });
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<CustomerColumnDropSide>("before");
  const columnAutoScrollRef = useRef<{ frame: number | null; element: HTMLElement | null; speed: number }>({
    frame: null,
    element: null,
    speed: 0,
  });
  const visibleColumnOrder = columnOrder;

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

  const handleColDragStart = useCallback((event: DragEvent<HTMLTableCellElement>, key: string) => {
    setDraggingColumn(key);
    setDragOverColumn(key);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    const preview = document.createElement("div");
    preview.className = styles.columnDragGhost;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 0, 0);
    window.setTimeout(() => preview.remove(), 0);
  }, []);

  const handleColDragOver = useCallback((event: DragEvent<HTMLTableCellElement>, key: string) => {
    if (!draggingColumn) return;
    event.preventDefault();
    updateColumnAutoScroll(event);
    if (draggingColumn === key) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextSide = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    event.dataTransfer.dropEffect = "move";
    setDragOverColumn(key);
    setDragOverSide(nextSide);
  }, [draggingColumn, updateColumnAutoScroll]);

  const handleColDrop = useCallback((event: DragEvent<HTMLTableCellElement>, targetColumn: string) => {
    event.preventDefault();
    const sourceColumn = draggingColumn || event.dataTransfer.getData("text/plain");
    clearColumnDragState();
    if (!sourceColumn || !isCustomerColumnKey(sourceColumn) || sourceColumn === targetColumn) return;
    setColumnOrder((currentOrder) => {
      if (!currentOrder.includes(sourceColumn) || !currentOrder.includes(targetColumn)) return currentOrder;
      const newOrder = moveCustomerColumnWithPlacement(currentOrder, sourceColumn, targetColumn, dragOverSide);
      try {
        localStorage.setItem("customer_columns_order", JSON.stringify(newOrder));
      } catch {}
      return newOrder;
    });
  }, [clearColumnDragState, dragOverSide, draggingColumn]);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  const buildCustomerExportRows = (customers: Customer[]) => {
    const headers = ["客户姓名", "手机号", "微信号", "客户来源", "房号", "装修面积", "装修预算", "客户状态", "客户意向", "服务门店", "户型", "装修类型", "创建时间"];
    const rows = customers.map((customer) => [
      customer.name || "",
      customer.phone || "",
      customer.weixin || "",
      customer.source || "",
      getCustomerRoomDisplay(customer),
      customer.area_size || "",
      customer.budget || "",
      customerStatusLabels[normalizeCustomerStatus(customer.status)] || "",
      customer.intention || "",
      customer.service_store || "",
      customer.house_type || "",
      customer.decoration_type || "",
      customer.created_at ? formatDate(customer.created_at) : "",
    ]);
    return [headers, ...rows];
  };

  const getCustomerExportFileName = (scope: CustomerExportScope) => {
    const scopeLabel: Record<CustomerExportScope, string> = {
      selected: "勾选客户",
      page: "当页客户",
      filtered: "搜索结果",
      all: listMode === "deleted" ? "全部已删除客户" : "全部客户",
    };
    return `客户导出_${scopeLabel[scope]}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  };

  const buildExportListUrl = (scope: CustomerExportScope) => {
    const commonOptions = {
      page: 1,
      pageSize: 100000,
      filter,
      search: debouncedSearch,
      createdFrom,
      createdTo,
      sourceFilter,
      storeFilter,
      advisorFilter,
      designerFilter,
      intentionFilter,
      followupFilter,
      departmentType,
      departmentOrgId,
      departmentIncludeChildren,
      duplicateFilter,
      exportAll: true,
      includeMeta: false,
      ownerScope,
      listMode,
    };
    if (scope !== "all") return buildCustomerListUrl(commonOptions);
    return buildCustomerListUrl({
      ...commonOptions,
      filter: "all",
      search: "",
      createdFrom: "",
      createdTo: "",
      sourceFilter: "",
      storeFilter: "",
      advisorFilter: "",
      designerFilter: "",
      intentionFilter: "",
      followupFilter: "",
      departmentOrgId: "",
      departmentIncludeChildren: true,
      duplicateFilter: "",
    });
  };

  const handleExportCustomers = async (scope: CustomerExportScope) => {
    setExporting(true);
    try {
      let targetCustomers = customerList;
      if (scope === "page") {
        targetCustomers = customerList;
      } else {
        const data = await fetchCustomerList(buildExportListUrl(scope));
        targetCustomers = data.customers || [];
      }
      if (scope === "selected") {
        targetCustomers = targetCustomers.filter((customer) => selectedCustomerIdSet.has(customer.id));
      }
      if (targetCustomers.length === 0) {
        setLoadError(scope === "selected" ? "请先勾选需要导出的客户" : "当前范围没有可导出的客户");
        return;
      }
      await downloadXlsx(getCustomerExportFileName(scope), buildCustomerExportRows(targetCustomers), "客户资料");
      setShowExportModal(false);
    } catch (err: any) {
      setLoadError(err?.message || "客户导出失败");
    } finally {
      setExporting(false);
    }
  };

  const toggleSelectCustomer = (customerId: string, checked: boolean) => {
    setSelectedCustomerIds((current) => {
      const next = new Set(current);
      if (checked) next.add(customerId);
      else next.delete(customerId);
      return Array.from(next);
    });
  };

  const toggleSelectCurrentPage = (checked: boolean) => {
    setSelectedCustomerIds((current) => {
      const next = new Set(current);
      currentPageCustomerIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return Array.from(next);
    });
  };

  const resetMoreFilters = () => {
    setListMode("active");
    setCreatedFrom("");
    setCreatedTo("");
    setSourceFilter("");
    setStoreFilter("");
    setAdvisorFilter("");
    setDesignerFilter("");
    setIntentionFilter("");
    setFollowupFilter("");
    setDepartmentType("business");
    setDepartmentOrgId("");
    setDepartmentIncludeChildren(true);
    setDuplicateFilter("");
  };

  const toggleOwnerScope = (nextScope: Exclude<CustomerOwnerScope, "all">) => {
    setOwnerScope(nextScope);
  };

  const switchListMode = (nextMode: CustomerListMode) => {
    setListMode(nextMode);
    if (nextMode === "deleted") setFilter("all");
    setPage(1);
    setLoadError("");
    setOpeningCustomerId(null);
  };

  const getCustomerDetailHref = useCallback((customerId: string) => `/projects/${customerId}`, []);

  const prefetchCustomerDetail = useCallback((customerId: string) => {
    router.prefetch(getCustomerDetailHref(customerId));
  }, [getCustomerDetailHref, router]);

  const openCustomerDetail = useCallback((customerId: string) => {
    if (listMode === "deleted") return;
    setOpeningCustomerId(customerId);
    const href = getCustomerDetailHref(customerId);
    router.prefetch(href);
    router.push(href);
  }, [getCustomerDetailHref, listMode, router]);

  const activeMoreFilterCount = [
    listMode === "deleted" ? "deleted" : "",
    createdFrom,
    createdTo,
    sourceFilter,
    storeFilter,
    advisorFilter,
    designerFilter,
    intentionFilter,
    followupFilter,
    departmentOrgId,
    duplicateFilter,
  ].filter(Boolean).length;

  const appliedFilterChips = [
    createdFrom ? { key: "createdFrom", label: `创建日期 ≥ ${createdFrom}`, clear: () => setCreatedFrom("") } : null,
    createdTo ? { key: "createdTo", label: `创建日期 ≤ ${createdTo}`, clear: () => setCreatedTo("") } : null,
    sourceFilter ? { key: "source", label: `来源：${sourceFilter}`, clear: () => setSourceFilter("") } : null,
    storeFilter ? { key: "store", label: `门店：${storeFilter}`, clear: () => setStoreFilter("") } : null,
    advisorFilter ? { key: "advisor", label: `顾问：${advisorOptions.find((item) => item.value === advisorFilter)?.label || advisorFilter}`, clear: () => setAdvisorFilter("") } : null,
    designerFilter ? { key: "designer", label: `设计师：${designerOptions.find((item) => item.value === designerFilter)?.label || designerFilter}`, clear: () => setDesignerFilter("") } : null,
    intentionFilter ? { key: "intention", label: `意向：${intentionFilter === "__empty" ? "未设置" : intentionFilter}`, clear: () => setIntentionFilter("") } : null,
    followupFilter ? { key: "followup", label: `跟进：${({ overdue: "已逾期", today: "今日", upcoming: "已安排", none: "未安排" } as Record<string, string>)[followupFilter] || followupFilter}`, clear: () => setFollowupFilter("") } : null,
    duplicateFilter ? { key: "duplicate", label: `重复：${duplicateFilter === "duplicate" ? "重复客户" : "非重复客户"}`, clear: () => setDuplicateFilter("") } : null,
    departmentOrgId ? { key: "department", label: `${selectedDepartmentTypeLabel}：${selectedDepartmentOrg?.name || "已选择组织"}${departmentIncludeChildren ? "（含下级）" : ""}`, clear: () => setDepartmentOrgId("") } : null,
  ].filter((item): item is { key: string; label: string; clear: () => void } => Boolean(item));

  const getStatusCount = (filterItem: (typeof statusFilter)[0]) => {
    if (!statusCountsReady) return null;
    if (filterItem.filterStatus === null) return Number(statusCounts.all || 0);
    return Number(statusCounts[filterItem.filterStatus] || 0);
  };

  const emptyText = <span className={styles.emptyValue}>-</span>;

  const renderCell = (customer: Customer, colKey: string) => {
    const tdCls = tableCellBase;
    const phone = getCustomerPhoneKey(customer);
    const budget = Number(customer.budget);
    const status = normalizeCustomerStatus(customer.status);

    switch (colKey) {
      case "name": {
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            <div className={styles.customerIdentity} title={customer.name || "未命名客户"}>
              <span className={styles.customerAvatar}>{(customer.name || "客").trim().slice(0, 1)}</span>
              <span className={styles.customerName}>{customer.name || "未命名客户"}</span>
            </div>
          </td>
        );
      }
      case "intention":
        return (
          <td key={colKey} className={`${tdCls} ${styles.centerCell}`} data-column={colKey}>
            {customer.intention ? (
              <span className={isStarIntention(customer.intention) ? "font-black text-[#FBCD08]" : undefined}>
                {customer.intention}
              </span>
            ) : emptyText}
          </td>
        );
      case "duplicate":
        const duplicateCount = phone ? phoneCountMap[phone] || 0 : 0;
        return (
          <td key={colKey} className={`${tdCls} ${styles.centerCell}`} data-column={colKey}>
            {phone && duplicateCount > 1 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setDuplicatePhone(phone);
                }}
                className={styles.duplicateBadge}
                title="查看重复客户"
              >
                {duplicateCount - 1}
              </button>
            ) : (
              emptyText
            )}
          </td>
        );
      case "contact":
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            {phone ? (
              <div className={styles.phoneCell}>
                <Phone className="h-3.5 w-3.5" />
                <span className="tabular-nums">{phone}</span>
              </div>
            ) : emptyText}
          </td>
        );
      case "address":
        return (
          <td key={colKey} className={`${tdCls} max-w-[220px]`} data-column={colKey}>
            <span className="block truncate">{getCustomerRoomDisplay(customer) || "-"}</span>
          </td>
        );
      case "area_size":
        return (
          <td key={colKey} className={`${tdCls} ${styles.numberCell}`} data-column={colKey}>
            {customer.area_size ? `${customer.area_size}㎡` : emptyText}
          </td>
        );
      case "budget":
        return (
          <td key={colKey} className={`${tdCls} ${styles.numberCell} ${styles.strongValue}`} data-column={colKey}>
            {Number.isFinite(budget) && budget > 0 ? formatCurrency(budget) : emptyText}
          </td>
        );
      case "status":
        return (
          <td key={colKey} className={`${tdCls} ${styles.centerCell}`} data-column={colKey} title="客户进度由系统根据跟进、量房、定金、报价和合同自动判断">
            <span className={`${styles.statusTag} ${styles.lifecycleStatusTag} ${lifecycleStatusClassNames[status] || styles.lifecycleStatusDefault}`}>
              {customerStatusLabels[status] || status}
            </span>
          </td>
        );
      case "advisor": {
        const advisorName = customer.advisor_name || customer.inviter_name || customer.created_by_name;
        const advisorAvatar = customer.advisor_avatar || customer.inviter_avatar || customer.created_by_avatar;
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            <StaffInlineAvatar name={advisorName} avatar={advisorAvatar} emptyText={emptyText} />
          </td>
        );
      }
      case "business_department":
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            {customer.business_department_name || emptyText}
          </td>
        );
      case "designer":
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            <StaffInlineAvatar name={customer.designer_name} avatar={customer.designer_avatar} emptyText={emptyText} />
          </td>
        );
      case "design_department":
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            {customer.design_department_name || emptyText}
          </td>
        );
      case "created_at":
        return (
          <td key={colKey} className={`${tdCls} ${styles.monoCell}`} data-column={colKey}>
            {customer.created_at ? formatDate(customer.created_at) : emptyText}
          </td>
        );
      case "last_followup":
        return (
          <td key={colKey} className={`${tdCls} ${styles.monoCell}`} data-column={colKey}>
            {customer.last_followup_at ? formatDateTime(customer.last_followup_at) : emptyText}
          </td>
        );
      case "next_followup":
        return (
          <td key={colKey} className={`${tdCls} ${styles.monoCell}`} data-column={colKey}>
            {customer.next_followup_at ? formatDate(customer.next_followup_at) : emptyText}
          </td>
        );
      case "service_store":
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            {customer.service_store ? (
              <span className="inline-flex max-w-full items-center gap-1.5">
                <span className="truncate">{customer.service_store}</span>
                {Number(customer.service_store_is_active ?? 1) !== 1 && (
                  <span className="shrink-0 rounded-[8px] bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-100">已停用</span>
                )}
              </span>
            ) : emptyText}
          </td>
        );
      case "followup_status":
        const followupStatus = getFollowupStatus(customer.next_followup_at, customer.has_overdue_followup, customer.overdue_followup_days);
        return (
          <td key={colKey} className={`${tdCls} ${styles.centerCell}`} data-column={colKey}>
            <span className={`${styles.statusTag} ${followupStatus.className}`}>
              {followupStatus.label}
            </span>
          </td>
        );
      default:
        return (
          <td key={colKey} className={tdCls} data-column={colKey}>
            {emptyText}
          </td>
        );
    }
  };

  const openProfileEditor = (customer: Customer, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (normalizeCustomerStatus(customer.status) === "SIGNED") return;
    setEditingProfileCustomer(customer);
  };

  const deleteLostCustomer = async (customer: Customer, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (deletingCustomerId) return;
    if (normalizeCustomerStatus(customer.status) !== "LOST") {
      setLoadError("只有失败/流失客户支持删除");
      return;
    }

    const customerName = customer.name || "未命名客户";
    if (!window.confirm(`确定删除失败/流失客户「${customerName}」吗？删除后将从客户列表隐藏，历史业务资料不会被硬删除。`)) return;

    setDeletingCustomerId(customer.id);
    setLoadError("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : null;
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "删除失败");
      }
      await reloadCustomers();
    } catch (err: any) {
      setLoadError(err?.message || "删除失败，请稍后重试");
    } finally {
      setDeletingCustomerId(null);
    }
  };

  const restoreDeletedCustomer = async (customer: Customer, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (restoringCustomerId) return;

    const customerName = customer.name || "未命名客户";
    if (!window.confirm(`确定恢复客户「${customerName}」吗？恢复后会重新出现在客户列表中。`)) return;

    setRestoringCustomerId(customer.id);
    setLoadError("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : null;
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ restore_deleted: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "恢复失败");
      }
      setListMode("active");
      setFilter("LOST");
      setPage(1);
    } catch (err: any) {
      setLoadError(err?.message || "恢复失败，请稍后重试");
    } finally {
      setRestoringCustomerId(null);
    }
  };

  return (
    <div className={`${pageClass} customer-list-ui`}>
      <div className={styles.container}>
        <div className={styles.topArea}>
            <div className={styles.unifiedToolbar}>
              {listMode === "active" && (
                <nav className={styles.statusBar} aria-label="客户状态筛选">
                  <div className={`${styles.statusBarInner} system-status-segmented`}>
                    {statusFilter.map((item) => {
                      const isActive = filter === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setFilter(item.value)}
                          className={`${styles.statusBarButton} system-status-option ${isActive ? `${styles.statusBarButtonActive} system-status-option-active` : ""}`}
                          aria-pressed={isActive}
                        >
                          <span>{item.label}</span>
                          <span className={`${styles.statusBarCount} system-status-count`}>{getStatusCount(item) ?? "…"}</span>
                        </button>
                      );
                    })}
                  </div>
                </nav>
              )}

              <div className={styles.filterToolbar}>
                <div className={styles.searchTools}>
                  <div className={styles.searchWrap}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      type="text"
                      placeholder={listMode === "deleted" ? "搜索已删除客户姓名、手机号、微信或房号" : "搜索姓名、手机号、微信或房号"}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className={`${inputControlClass} w-full pl-9`}
                    />
                  </div>
                  <div className={styles.scopeWrap}>
                    <div className={styles.scopeTabs}>
                      {customerOwnerScopes.map((item) => {
                        const Icon = item.icon;
                        const isActive = ownerScope === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            className={`${styles.scopeButton} ${isActive ? styles.activeTab : ""}`}
                            onClick={() => toggleOwnerScope(item.value)}
                            aria-pressed={isActive}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                            <span
                              className={`group/help relative -mr-1 ${styles.helpButton}`}
                              aria-label={`${item.label}说明`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <CircleHelp className="h-3.5 w-3.5" />
                              <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-[80] hidden w-max max-w-[260px] -translate-x-1/2 rounded-md border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs font-medium leading-5 text-[#525252] group-hover/help:block">
                                {customerOwnerScopeTips[item.value]}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    ref={moreFiltersButtonRef}
                    className={`${filterButtonClass} shrink-0 ${
                      showMoreFilters || activeMoreFilterCount > 0
                        ? styles.filterButtonActive
                        : ""
                    }`}
                    onClick={() => {
                      setShowMoreFilters((value) => !value);
                    }}
                    aria-expanded={showMoreFilters}
                    aria-controls="customer-more-filters"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    更多筛选
                    {activeMoreFilterCount > 0 && (
                      <span className={styles.filterBadge}>{activeMoreFilterCount}</span>
                    )}
                    <ChevronDown className={`h-4 w-4 transition-transform ${showMoreFilters ? "rotate-180" : ""}`} />
                  </button>
                  <div className={styles.toolbarActions}>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => setShowImportModal(true)}
                      disabled={listMode === "deleted"}
                    >
                      <Upload className="h-4 w-4" />
                      导入客户
                    </button>
                    <button
                      className={secondaryButtonClass}
                      disabled={exporting}
                      onClick={() => setShowExportModal(true)}
                    >
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {exporting ? "导出中" : listMode === "deleted" ? "导出已删除" : "导出客户"}
                      {selectedCustomerIds.length > 0 && (
                        <span className={styles.exportSelectedCount}>{selectedCustomerIds.length}</span>
                      )}
                    </button>
                    <button
                      className={primaryButtonClass}
                      onClick={() => setShowAddModal(true)}
                      disabled={listMode === "deleted"}
                    >
                      <Plus className="h-4 w-4" />
                      新增客户
                    </button>
                  </div>
                </div>
              </div>

              {listMode === "deleted" && (
                <div className={styles.deletedNotice}>
                  <Trash2 className="h-4 w-4" />
                  当前查看的是已删除客户，客户状态列显示删除前的业务进度，恢复后会回到正常客户列表。
                </div>
              )}
            </div>

            {appliedFilterChips.length > 0 && (
              <div className={styles.appliedFilters} aria-label="已应用筛选">
                <span className={styles.appliedFiltersLabel}>已筛选</span>
                {appliedFilterChips.map((item) => (
                  <button key={item.key} type="button" onClick={item.clear} className={styles.filterChip}>
                    {item.label}
                    <X aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={resetMoreFilters} className={styles.clearFiltersButton}>清除全部</button>
              </div>
            )}

            <div
              id="customer-more-filters"
              ref={moreFiltersPanelRef}
              className={`${styles.advancedPanel} grid overflow-hidden transition-[grid-template-rows,opacity,border-color] duration-300 ease-out ${
                showMoreFilters
                  ? "grid-rows-[1fr] opacity-100"
                  : "pointer-events-none grid-rows-[0fr] border-t border-transparent opacity-0"
              }`}
              aria-hidden={!showMoreFilters}
            >
              <div className="min-h-0 overflow-hidden">
                <div className={styles.advancedInner}>
                <div className={styles.advancedGrid}>
                  <FilterField label="创建开始">
                    <SystemDateInput value={createdFrom} onChange={setCreatedFrom} className={`${inputControlClass} ${styles.advancedControl} w-full`} />
                  </FilterField>
                  <FilterField label="创建结束">
                    <SystemDateInput value={createdTo} onChange={setCreatedTo} className={`${inputControlClass} ${styles.advancedControl} w-full`} />
                  </FilterField>
                  <FilterField label="客户来源">
                    <SystemSelect value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className={`${inputControlClass} ${styles.advancedControl} w-full`} menuClassName={styles.filterSelectMenu} optionClassName={styles.filterSelectOption}>
                      <option value="">全部来源</option>
                      {sourceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </SystemSelect>
                  </FilterField>
                  <FilterField label="服务门店">
                    <SystemSelect value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className={`${inputControlClass} ${styles.advancedControl} w-full`} menuClassName={styles.filterSelectMenu} optionClassName={styles.filterSelectOption}>
                      <option value="">全部门店</option>
                      {storeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </SystemSelect>
                  </FilterField>
                  <FilterField label="家装顾问">
                    <SystemSelect value={advisorFilter} onChange={(event) => setAdvisorFilter(event.target.value)} className={`${inputControlClass} ${styles.advancedControl} w-full`} menuClassName={styles.filterSelectMenu} optionClassName={styles.filterSelectOption}>
                      <option value="">全部顾问</option>
                      {advisorOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </SystemSelect>
                  </FilterField>
                  <FilterField label="设计师">
                    <SystemSelect value={designerFilter} onChange={(event) => setDesignerFilter(event.target.value)} className={`${inputControlClass} ${styles.advancedControl} w-full`} menuClassName={styles.filterSelectMenu} optionClassName={styles.filterSelectOption}>
                      <option value="">全部设计师</option>
                      {designerOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </SystemSelect>
                  </FilterField>
                  <FilterField label="意向度">
                    <SystemSelect value={intentionFilter} onChange={(event) => setIntentionFilter(event.target.value)} className={`${inputControlClass} ${styles.advancedControl} w-full`} menuClassName={styles.filterSelectMenu} optionClassName={styles.filterSelectOption}>
                      <option value="">全部意向度</option>
                      {intentionFilterOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                      <option value="__empty">未设置意向度</option>
                    </SystemSelect>
                  </FilterField>
                  <FilterField label="跟进状态">
                    <SystemSelect value={followupFilter} onChange={(event) => setFollowupFilter(event.target.value)} className={`${inputControlClass} ${styles.advancedControl} w-full`} menuClassName={styles.filterSelectMenu} optionClassName={styles.filterSelectOption}>
                      <option value="">全部跟进</option>
                      <option value="overdue">跟进逾期</option>
                      <option value="today">今日跟进</option>
                      <option value="upcoming">后续已安排</option>
                      <option value="none">未安排跟进</option>
                    </SystemSelect>
                  </FilterField>
                  <FilterField label="重复情况">
                    <SystemSelect value={duplicateFilter} onChange={(event) => setDuplicateFilter(event.target.value)} className={`${inputControlClass} ${styles.advancedControl} w-full`} menuClassName={styles.filterSelectMenu} optionClassName={styles.filterSelectOption}>
                      <option value="">全部重复情况</option>
                      <option value="duplicate">重复客户</option>
                      <option value="unique">非重复客户</option>
                    </SystemSelect>
                  </FilterField>
                  <div className="flex items-end">
                    <label className={`${styles.toggleField} ${styles.advancedControl} flex w-full cursor-pointer items-center justify-between gap-3 border px-3 transition`}>
                      <span>已删除客户</span>
                      <input
                        type="checkbox"
                        checked={listMode === "deleted"}
                        onChange={(event) => switchListMode(event.target.checked ? "deleted" : "active")}
                        className={styles.nativeCheckbox}
                      />
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={resetMoreFilters}
                      className={`${filterButtonClass} ${filterGhostButtonClass} ${styles.advancedButton} w-full`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      清空筛选
                    </button>
                  </div>
                  <div className={styles.advancedFullWidth}>
                    <div className={styles.orgPanel}>
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={styles.orgHeaderTitle}>部门归属筛选</span>
                            <span className={styles.infoTag}>
                              {departmentOrgId ? "已生效" : "选择组织后生效"}
                            </span>
                          </div>
                          <p className={styles.orgHelp}>{departmentFilterTypeTips[departmentType]}</p>
                        </div>
                        <div className={styles.orgCurrent}>
                          当前：{selectedDepartmentTypeLabel}
                          {selectedDepartmentOrg ? ` · ${selectedDepartmentOrg.name}${departmentIncludeChildren ? "（含下级）" : ""}` : " · 未选择组织"}
                        </div>
                      </div>
                      <div className={styles.orgControls}>
                        <div className={styles.departmentTypeGrid}>
                          {departmentFilterTypes.map((item) => {
                            const active = departmentType === item.value;
                            return (
                              <button
                                key={item.value}
                                type="button"
                                onClick={() => setDepartmentType(item.value)}
                                className={`${filterButtonClass} ${styles.advancedButton} w-full ${active ? filterActiveButtonClass : filterGhostButtonClass}`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className={styles.orgSelectionRow}>
                          <OrgUnitFilterPicker options={orgOptions} value={departmentOrgId} onChange={setDepartmentOrgId} />
                          <button
                            type="button"
                            onClick={() => setDepartmentIncludeChildren((value) => !value)}
                            className={`${styles.includeChildrenButton} ${styles.advancedButton} inline-flex min-h-10 w-full items-center justify-between gap-2 border px-3 py-1.5 transition ${departmentIncludeChildren ? styles.includeChildrenActive : filterGhostButtonClass}`}
                          >
                            <span>包含下级</span>
                            <span className={`${styles.checkboxMark} flex h-4 w-4 items-center justify-center border ${departmentIncludeChildren ? styles.checkboxMarkActive : ""}`}>
                              <Check className="h-3 w-3" />
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>

        </div>

      <section className={`${panelClass} ${styles.tablePanel}`}>
        {openingCustomerId && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70">
            <div className={`${styles.loadingPill} inline-flex items-center gap-2 border border-[#B9CDF8] bg-white px-4 py-2 text-sm font-semibold text-[#2F6FEB]`}>
              <Loader2 className="h-4 w-4 animate-spin" />
              正在打开客户详情...
            </div>
          </div>
        )}
        <ThinScrollArea className={styles.tableScroll}>
          <table className={`${styles.table} ${visibleColumnOrder.length <= 10 ? styles.tableFewColumns : ""}`}>
            <colgroup>
              <col className={styles.selectColumnCol} />
              {visibleColumnOrder.map((colKey) => (
                <col key={colKey} style={{ width: `${customerColumnWidths[colKey] || 112}px` }} />
              ))}
              <col className={styles.actionColumnCol} />
            </colgroup>
            <thead>
              <tr>
                <th className={`${styles.tableHeaderCell} ${styles.selectColumn}`}>
                  <label className={styles.selectCheckbox} title="选择当页客户" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isCurrentPageAllSelected}
                      ref={(node) => {
                        if (node) node.indeterminate = isCurrentPagePartiallySelected;
                      }}
                      onChange={(event) => toggleSelectCurrentPage(event.target.checked)}
                      aria-label="选择当页客户"
                    />
                    <span className={styles.selectCheckboxBox} aria-hidden="true">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </label>
                </th>
                {visibleColumnOrder.map((colKey) => {
                  const col = columnDefs.find((definition) => definition.key === colKey);
                  const numericHeader = colKey === "area_size" || colKey === "budget";
                  const centeredHeader = colKey === "intention" || colKey === "duplicate" || colKey === "status" || colKey === "followup_status";
                  const isDropTarget = dragOverColumn === colKey && draggingColumn !== colKey;
                  return (
                    <th
                      key={colKey}
                      draggable
                      onDragStart={(event) => handleColDragStart(event, colKey)}
                      onDragOver={(event) => handleColDragOver(event, colKey)}
                      onDrop={(event) => handleColDrop(event, colKey)}
                      onDragEnd={clearColumnDragState}
                      data-column={colKey}
                      className={`${styles.tableHeaderCell} ${styles.columnHeader} ${numericHeader ? styles.numberCell : centeredHeader ? styles.centerCell : ""} ${draggingColumn === colKey ? styles.columnHeaderDragging : ""} ${isDropTarget ? styles.columnHeaderDropTarget : ""} ${isDropTarget && dragOverSide === "after" ? styles.columnHeaderDropAfter : ""} ${isDropTarget && dragOverSide === "before" ? styles.columnHeaderDropBefore : ""}`}
                      title="拖动调整列顺序"
                    >
                      <span className={styles.columnHeaderInner}>
                        <span>{col?.label}</span>
                        <GripVertical className={styles.columnDragIcon} aria-hidden="true" />
                      </span>
                    </th>
                  );
                })}
                <th className={`${styles.tableHeaderCell} ${styles.stickyAction} whitespace-nowrap`}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {customerList.map((customer) => {
                const isOpening = openingCustomerId === customer.id;
                const customerStatus = normalizeCustomerStatus(customer.status);
                const isDeleting = deletingCustomerId === customer.id;
                const isRestoring = restoringCustomerId === customer.id;
                return (
                  <tr
                    key={customer.id}
                    data-status={customerStatus.toLowerCase()}
                    aria-busy={isOpening}
                    onMouseEnter={() => listMode === "active" && prefetchCustomerDetail(customer.id)}
                    onClick={() => listMode === "active" && openCustomerDetail(customer.id)}
                    className={`${styles.tableRow} group ${listMode === "active" ? "cursor-pointer" : "cursor-default"} ${
                      isOpening ? "bg-[#edf4ff] ring-1 ring-inset ring-[#cfe1ff]" : "hover:bg-[#f4f8ff]"
                    }`}
                  >
                    <td className={`${styles.tableCell} ${styles.selectColumn}`} onClick={(event) => event.stopPropagation()}>
                      <label className={styles.selectCheckbox} title="选择客户">
                        <input
                          type="checkbox"
                          checked={selectedCustomerIdSet.has(customer.id)}
                          onChange={(event) => toggleSelectCustomer(customer.id, event.target.checked)}
                          aria-label={`选择客户 ${customer.name || ""}`}
                        />
                        <span className={styles.selectCheckboxBox} aria-hidden="true">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </label>
                    </td>
                    {visibleColumnOrder.map((colKey) => renderCell(customer, colKey))}
                    <td
                      className={`${styles.tableCell} ${styles.stickyAction} ${
                        isOpening ? "bg-[#edf4ff]" : "bg-white group-hover:bg-[#f4f8ff]"
                      }`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {listMode === "deleted" ? (
                        <button
                          type="button"
                          onClick={(event) => restoreDeletedCustomer(customer, event)}
                          disabled={isRestoring}
                          className={`${styles.rowAction} disabled:cursor-not-allowed disabled:opacity-60`}
                          title="恢复客户"
                        >
                          {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          {isRestoring ? "恢复中" : "恢复"}
                        </button>
                      ) : isOpening ? (
                        <span className={styles.rowActionQuiet}>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          打开中
                        </span>
                      ) : customerStatus === "SIGNED" ? (
                        <span className={styles.rowActionQuiet} title="签约客户资料不允许编辑">
                          已签约
                        </span>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={(event) => openProfileEditor(customer, event)}
                            disabled={isDeleting}
                            className={`${styles.rowAction} disabled:cursor-not-allowed disabled:opacity-60`}
                            title="编辑客户资料"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            编辑
                          </button>
                          {customerStatus === "LOST" && (
                            <button
                              type="button"
                              onClick={(event) => deleteLostCustomer(customer, event)}
                              disabled={isDeleting}
                              className={`${styles.rowActionDanger} disabled:cursor-not-allowed disabled:opacity-60`}
                              title="删除失败/流失客户"
                            >
                              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              {isDeleting ? "删除中" : "删除"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {loadError && (
                <tr>
                  <td colSpan={visibleColumnOrder.length + 2} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className={`${styles.stateIcon} ${styles.stateIconError}`}>
                        <X className="h-4 w-4" />
                      </div>
                      <p className={styles.stateTitle}>客户列表加载失败</p>
                      <p className={styles.stateText}>{loadError}</p>
                      <button type="button" onClick={reloadCustomers} className={styles.stateButton}>
                        重新加载
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!loadError && isLoading && customerList.length === 0 && (
                <tr>
                  <td colSpan={visibleColumnOrder.length + 2} className={styles.emptyTableCell}>
                    <div className={styles.emptyStateCard}>
                      <div className={styles.stateIcon}>
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                      <p className={styles.stateTitle}>正在加载客户列表</p>
                      <p className={styles.stateText}>请稍等，系统正在读取最新客户数据。</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loadError && !isLoading && customerList.length === 0 && (
                <tr>
                  <td colSpan={visibleColumnOrder.length + 2} className={styles.emptyTableCell}>
                    <div className={styles.emptyStateCard}>
                      <div className={styles.stateIcon}>
                        <Search className="h-4 w-4" />
                      </div>
                      <p className={styles.stateTitle}>{listMode === "deleted" ? "暂无已删除客户" : "暂无匹配客户"}</p>
                      <p className={styles.stateText}>
                        {listMode === "deleted" ? "删除失败/流失客户后，会在这里显示并支持恢复。" : "调整筛选条件或新增客户后，这里会显示客户资料。"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination
          total={totalCustomers}
          page={effectivePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemName="位客户"
          className={styles.pagination}
        />
      </section>

      {showExportModal && (
        <div className={styles.exportModalOverlay} role="dialog" aria-modal="true" aria-label="导出客户">
          <div className={styles.exportModalBackdrop} onClick={() => !exporting && setShowExportModal(false)} />
          <section className={styles.exportModal}>
            <header className={styles.exportModalHeader}>
              <div>
                <h3>导出客户</h3>
                <p>请选择导出范围，文件将以 Excel .xlsx 格式下载。</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                disabled={exporting}
                className={styles.exportModalClose}
                aria-label="关闭导出"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className={styles.exportScopeList}>
              <button
                type="button"
                onClick={() => handleExportCustomers("selected")}
                disabled={exporting || selectedCustomerIds.length === 0}
                className={styles.exportScopeButton}
              >
                <span className={styles.exportScopeTitle}>勾选导出</span>
                <span className={styles.exportScopeDesc}>导出已勾选的 {selectedCustomerIds.length} 位客户</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportCustomers("page")}
                disabled={exporting || customerList.length === 0}
                className={styles.exportScopeButton}
              >
                <span className={styles.exportScopeTitle}>当页导出</span>
                <span className={styles.exportScopeDesc}>只导出当前第 {effectivePage} 页的 {customerList.length} 位客户</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportCustomers("filtered")}
                disabled={exporting || totalCustomers === 0}
                className={styles.exportScopeButton}
              >
                <span className={styles.exportScopeTitle}>当前搜索结果导出</span>
                <span className={styles.exportScopeDesc}>按当前搜索、状态和筛选条件导出 {totalCustomers} 位客户</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportCustomers("all")}
                disabled={exporting}
                className={styles.exportScopeButton}
              >
                <span className={styles.exportScopeTitle}>所有内容导出</span>
                <span className={styles.exportScopeDesc}>{listMode === "deleted" ? "导出全部已删除客户" : "导出全部正常客户"}，不受当前搜索筛选影响</span>
              </button>
            </div>
            <footer className={styles.exportModalFooter}>
              {exporting ? (
                <span className={styles.exportingText}><Loader2 className="h-4 w-4 animate-spin" /> 正在生成 Excel</span>
              ) : (
                <span>导出格式：.xlsx</span>
              )}
              <button type="button" onClick={() => setShowExportModal(false)} disabled={exporting} className={secondaryButtonClass}>取消</button>
            </footer>
          </section>
        </div>
      )}

      <AddCustomerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => reloadCustomers()}
      />
      <AddCustomerModal
        isOpen={Boolean(editingProfileCustomer)}
        onClose={() => setEditingProfileCustomer(null)}
        onSuccess={() => {
          setEditingProfileCustomer(null);
          reloadCustomers();
        }}
        customer={editingProfileCustomer}
      />
      <ImportCustomersModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => reloadCustomers()}
        storeOptions={activeStoreOptions}
      />
      <DuplicateCustomersModal
        phone={duplicatePhone}
        customers={duplicateCustomers}
        loading={duplicateLoading}
        onClose={() => setDuplicatePhone(null)}
        onOpenCustomer={(customerId) => {
          setDuplicatePhone(null);
          openCustomerDetail(customerId);
        }}
      />
      </div>
    </div>
  );
}
