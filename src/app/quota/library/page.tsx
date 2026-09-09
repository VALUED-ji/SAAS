"use client";

import {
  downloadQuotaImportErrors,
  downloadQuotaImportTemplate,
  readExcelFileAsImportText,
  DEFAULT_QUOTA_SCOPE,
  DEFAULT_PRICE_SCENE,
  FALLBACK_STORE_SCOPES,
  COMMON_QUOTA_UNITS,
  quotaImportHeaders,
  requiredQuotaImportHeaders,
  QUOTA_LIBRARY_STORAGE_KEY,
  initialQuotaItems,
  loadQuotaItemsFromStorage,
  normalizeQuotaItem,
  recoverQuotaItemsFromTemplates,
  findNearestStore,
  isOrgActive,
  isDisallowedQuotaScope,
  makeScopePrefix,
  makeNextQuotaCode,
  makeEmptyQuotaItem,
  isQuotaCodeLike,
  parseQuotaImport,
  buildQuotaImportPreviewData,
} from "./quota-library-shared";
import type {
  QuotaItem,
  DictionaryOption,
  QuotaImportError,
  OrgUnit,
} from "./quota-library-shared";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Coins, Copy, Download, HelpCircle, History, Pencil, Percent, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import { useAuth } from "@/lib/auth";
import SystemSelect from "@/components/ui/SystemSelect";

import {
  CustomQuotaItem,
  PromoteConfirmState,
  formatAmount,
  parsePriceInput,
  requestCustomQuotaLibrary,
} from "./custom-quota-shared";
import {
  CustomQuotaLibraryPanel,
  CustomQuotaPromoteDialog,
} from "./custom-quota-panel";

type QuotaChangeLog = {
  id: string;
  quotaItemId: string;
  userName: string;
  action: "created" | "updated" | "deleted" | string;
  summary: string;
  changes: Array<{
    field: string;
    label: string;
    before: string | number;
    after: string | number;
  }>;
  createdAt: string;
};

const ADD_PRICE_SCENE_OPTION = "__add_price_scene__";

export default function QuotaLibraryPage() {
  const { user } = useAuth();
  const [libraryMode, setLibraryMode] = useState<"standard" | "custom">("standard");
  const [quotaItems, setQuotaItems] = useState<QuotaItem[]>(initialQuotaItems);
  const [quotaItemsLoaded, setQuotaItemsLoaded] = useState(false);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [orgUnitsLoaded, setOrgUnitsLoaded] = useState(false);
  const [workTypeOptions, setWorkTypeOptions] = useState<DictionaryOption[]>([]);
  const [materialCategoryOptions, setMaterialCategoryOptions] = useState<DictionaryOption[]>([]);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priceSceneFilter, setPriceSceneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | QuotaItem["status"]>("enabled");
  const [selectedQuotaIds, setSelectedQuotaIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<QuotaItem | null>(null);
  const [editMode, setEditMode] = useState<"create" | "edit">("edit");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importIsExample, setImportIsExample] = useState(false);
  const [hasRealImportFile, setHasRealImportFile] = useState(false);
  const [importErrors, setImportErrors] = useState<QuotaImportError[]>([]);
  const [importScope, setImportScope] = useState("");
  const [unitOptionsOpen, setUnitOptionsOpen] = useState(false);
  const [priceSceneHelpOpen, setPriceSceneHelpOpen] = useState(false);
  const [focusedPriceField, setFocusedPriceField] = useState<"laborPrice" | "materialPrice" | "internalLaborCost" | "internalMaterialCost" | "costLossRate" | null>(null);
  const [notice, setNotice] = useState("");
  const [promoteConfirm, setPromoteConfirm] = useState<PromoteConfirmState | null>(null);
  const [historyItem, setHistoryItem] = useState<QuotaItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<QuotaChangeLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const priceSceneFieldRef = useRef<HTMLDivElement | null>(null);

  const saveQuotaItemsToServer = useCallback((nextItems: QuotaItem[]) => {
    fetch("/api/quota/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: nextItems }),
    }).catch(() => {
      // 保留本地缓存兜底，网络异常时不打断用户编辑。
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!editingItem) {
      setUnitOptionsOpen(false);
      setPriceSceneHelpOpen(false);
      setFocusedPriceField(null);
    }
  }, [editingItem]);

  useEffect(() => {
    if (!priceSceneHelpOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && priceSceneFieldRef.current?.contains(target)) return;
      setPriceSceneHelpOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [priceSceneHelpOpen]);

  useEffect(() => {
    fetch("/api/org")
      .then((res) => res.json())
      .then((data) => setOrgUnits(Array.isArray(data) ? data : []))
      .catch(() => setOrgUnits([]))
      .finally(() => setOrgUnitsLoaded(true));
  }, []);

  useEffect(() => {
    fetch("/api/settings/work-types?status=active")
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data?.workTypes) ? data.workTypes : [];
        setWorkTypeOptions(rows.map((item: any) => ({ id: String(item.id || ""), name: String(item.name || "") })).filter((item: DictionaryOption) => item.id && item.name));
      })
      .catch(() => setWorkTypeOptions([]));
    fetch("/api/materials?view=categories")
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data?.categories) ? data.categories : [];
        setMaterialCategoryOptions(rows
          .filter((item: any) => Number(item.is_active ?? 1) === 1)
          .map((item: any) => ({
            id: String(item.id || ""),
            name: item.parent_name ? `${item.parent_name} / ${item.name}` : String(item.name || ""),
            parentName: String(item.parent_name || ""),
          }))
          .filter((item: DictionaryOption) => item.id && item.name));
      })
      .catch(() => setMaterialCategoryOptions([]));
  }, []);

  useEffect(() => {
    setSelectedQuotaIds([]);
  }, [search, storeFilter, categoryFilter, statusFilter]);

  useEffect(() => {
    setStoreFilter("");
  }, [user?.id]);

  useEffect(() => {
    const validIds = new Set(quotaItems.map((item) => item.id));
    setSelectedQuotaIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [quotaItems]);

  const currentUserStore = useMemo(() => {
    const store = findNearestStore(orgUnits, user?.org_unit_id);
    return store && isOrgActive(store) ? store : null;
  }, [orgUnits, user?.org_unit_id]);
  const activeStoreScopeOptions = useMemo(() => {
    const activeUnits = orgUnits.filter(isOrgActive);
    const unitMap = new Map(activeUnits.map((unit) => [unit.id, unit]));
    const getAncestorIds = (unit: OrgUnit) => {
      const ids: string[] = [];
      let current = unit.parent_id ? unitMap.get(unit.parent_id) : undefined;
      let guard = 0;
      while (current && guard < 30) {
        ids.push(current.id);
        current = current.parent_id ? unitMap.get(current.parent_id) : undefined;
        guard += 1;
      }
      return ids;
    };
    const currentOrgUnitId = String(user?.org_unit_id || "").trim();
    const currentOrg = currentOrgUnitId ? unitMap.get(currentOrgUnitId) : null;
    const stores = activeUnits.filter((unit) => unit.type === "store");
    const scopedStores = !currentOrg
      ? stores
      : currentOrg.type === "store"
        ? stores.filter((unit) => unit.id === currentOrg.id)
        : currentOrg.type === "company" || currentOrg.type === "region" || currentOrg.type === "group"
          ? stores.filter((unit) => getAncestorIds(unit).includes(currentOrg.id))
          : stores.filter((unit) => getAncestorIds(currentOrg).includes(unit.id));
    const scopes = new Set<string>();
    scopedStores.forEach((unit) => {
      if (unit.name?.trim()) scopes.add(unit.name.trim());
    });
    if (orgUnitsLoaded && orgUnits.length === 0 && scopes.size === 0) FALLBACK_STORE_SCOPES.forEach((scope) => scopes.add(scope));
    return Array.from(scopes).filter((scope) => !isDisallowedQuotaScope(scope));
  }, [orgUnits, orgUnitsLoaded, user?.org_unit_id]);
  const storeScopeOptions = useMemo(() => {
    const scopes = new Set<string>(activeStoreScopeOptions);
    return Array.from(scopes).filter((scope) => !isDisallowedQuotaScope(scope));
  }, [activeStoreScopeOptions]);

  useEffect(() => {
    if (!orgUnitsLoaded) return;
    let cancelled = false;
    const activeScopes = new Set(activeStoreScopeOptions);
    const filterActiveLocalItems = (items: QuotaItem[]) => (
      activeScopes.size === 0 ? items : items.filter((item) => activeScopes.has(item.scope?.trim()))
    );
    const loadQuotaItems = async () => {
      const storedItems = loadQuotaItemsFromStorage();
      const recoveredItems = storedItems.length > 0 ? [] : recoverQuotaItemsFromTemplates();
      const localItems = filterActiveLocalItems(storedItems.length > 0 ? storedItems : recoveredItems);
      try {
        const response = await fetch("/api/quota/library", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || "读取基装定额失败");
        const serverItems = Array.isArray(data?.items)
          ? data.items.map(normalizeQuotaItem).filter((item: QuotaItem | null): item is QuotaItem => Boolean(item))
          : [];
        const loadedItems = serverItems;
        if (cancelled) return;
        if (recoveredItems.length > 0) {
          window.localStorage.setItem(QUOTA_LIBRARY_STORAGE_KEY, JSON.stringify(localItems));
        }
        setQuotaItems(loadedItems);
        setQuotaItemsLoaded(true);
      } catch {
        if (cancelled) return;
        if (recoveredItems.length > 0) {
          window.localStorage.setItem(QUOTA_LIBRARY_STORAGE_KEY, JSON.stringify(localItems));
        }
        setQuotaItems(localItems);
        setQuotaItemsLoaded(true);
      }
    };
    loadQuotaItems();
    return () => {
      cancelled = true;
    };
  }, [activeStoreScopeOptions, orgUnitsLoaded, saveQuotaItemsToServer]);

  useEffect(() => {
    if (!quotaItemsLoaded) return;
    window.localStorage.setItem(QUOTA_LIBRARY_STORAGE_KEY, JSON.stringify(quotaItems));
    saveQuotaItemsToServer(quotaItems);
  }, [quotaItems, quotaItemsLoaded, saveQuotaItemsToServer]);
  const storeFilterOptions = storeScopeOptions;
  const importTargetScope = currentUserStore?.name?.trim() || importScope.trim();
  const storeScopedQuotaItems = useMemo(() => {
    if (!storeFilter) return quotaItems;
    return quotaItems.filter((item) => (item.scope?.trim() || DEFAULT_QUOTA_SCOPE) === storeFilter);
  }, [quotaItems, storeFilter]);
  const categories = useMemo(() => (
    Array.from(new Set(storeScopedQuotaItems.map((item) => item.category).filter(Boolean)))
  ), [storeScopedQuotaItems]);
  const priceSceneOptions = useMemo(() => (
    Array.from(new Set(storeScopedQuotaItems.map((item) => item.priceScene || DEFAULT_PRICE_SCENE).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
  ), [storeScopedQuotaItems]);
  useEffect(() => {
    if (categoryFilter && !categories.includes(categoryFilter)) {
      setCategoryFilter("");
    }
  }, [categories, categoryFilter]);
  useEffect(() => {
    if (priceSceneFilter && !priceSceneOptions.includes(priceSceneFilter)) {
      setPriceSceneFilter("");
    }
  }, [priceSceneFilter, priceSceneOptions]);
  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return quotaItems.filter((item) => {
      const itemScope = item.scope?.trim() || DEFAULT_QUOTA_SCOPE;
      const itemPriceScene = item.priceScene || DEFAULT_PRICE_SCENE;
      const specialPriceText = item.isSpecialPrice ? "特价" : "常规";
      const matchesKeyword = !keyword || [item.code, itemScope, itemPriceScene, item.category, item.workTypeName || "", item.materialCategoryName || "", item.name, item.constructionDescription, item.unit, specialPriceText].some((value) => value.toLowerCase().includes(keyword));
      const matchesStore = !storeFilter || itemScope === storeFilter;
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      const matchesPriceScene = !priceSceneFilter || itemPriceScene === priceSceneFilter;
      const matchesStatus = !statusFilter || item.status === statusFilter;
      return matchesKeyword && matchesStore && matchesCategory && matchesPriceScene && matchesStatus;
    });
  }, [categoryFilter, priceSceneFilter, quotaItems, search, statusFilter, storeFilter]);
  const importPreviewData = useMemo(() => buildQuotaImportPreviewData(importText), [importText]);
  const importPreviewHeaders = importPreviewData.headers;
  const importPreviewRows = importPreviewData.rows;
  const pagination = useDataPagination(filteredItems, [search, storeFilter, categoryFilter, priceSceneFilter, statusFilter].join("|"));
  const selectedQuotaIdSet = useMemo(() => new Set(selectedQuotaIds), [selectedQuotaIds]);
  const selectedQuotaItems = useMemo(() => quotaItems.filter((item) => selectedQuotaIdSet.has(item.id)), [quotaItems, selectedQuotaIdSet]);
  const currentPageIds = useMemo(() => pagination.pageItems.map((item) => item.id), [pagination.pageItems]);
  const currentPageSelectedCount = currentPageIds.filter((id) => selectedQuotaIdSet.has(id)).length;
  const isCurrentPageAllSelected = currentPageIds.length > 0 && currentPageSelectedCount === currentPageIds.length;
  const todayText = () => new Date().toISOString().slice(0, 10);
  const getPriceInputValue = (field: "laborPrice" | "materialPrice" | "internalLaborCost" | "internalMaterialCost" | "costLossRate", value: number) => {
    if (focusedPriceField === field && Number(value || 0) === 0) return "";
    return String(value ?? 0);
  };
  const makeCodeForScope = useCallback((scope: string, excludeItemId?: string) => makeNextQuotaCode(
    new Set(quotaItems.filter((item) => item.id !== excludeItemId).map((item) => item.code)),
    scope,
    storeScopeOptions,
  ), [quotaItems, storeScopeOptions]);
  const editingPriceSceneOptions = useMemo(() => {
    const editingScope = editingItem?.scope?.trim() || "";
    const scenes = quotaItems
      .filter((item) => !editingScope || (item.scope?.trim() || DEFAULT_QUOTA_SCOPE) === editingScope)
      .map((item) => item.priceScene || DEFAULT_PRICE_SCENE);
    if (editingItem?.priceScene) scenes.push(editingItem.priceScene);
    scenes.push(DEFAULT_PRICE_SCENE);
    return Array.from(new Set(scenes.map((scene) => scene.trim()).filter(Boolean))).sort((a, b) => {
      if (a === DEFAULT_PRICE_SCENE) return -1;
      if (b === DEFAULT_PRICE_SCENE) return 1;
      return a.localeCompare(b, "zh-CN");
    });
  }, [editingItem?.priceScene, editingItem?.scope, quotaItems]);
  const addPriceSceneForEditingItem = (sourceItem: QuotaItem) => {
    const raw = window.prompt("请输入新的价格类型名称，例如：别墅、土建、局改");
    if (raw == null) return;
    const scene = raw.replace(/\s+/g, "").trim();
    if (!scene) {
      window.alert("价格类型不能为空");
      return;
    }
    if (!/^[\u4e00-\u9fa5A-Za-z0-9]{2,8}$/.test(scene)) {
      window.alert("价格类型建议填写 2-8 个字，只支持中文、英文或数字");
      return;
    }
    const matchedScene = editingPriceSceneOptions.find((option) => option === scene);
    setEditingItem({ ...sourceItem, priceScene: matchedScene || scene });
    setNotice(matchedScene ? `已选择已有价格类型：${matchedScene}` : `已新增价格类型：${scene}`);
  };
  const getDefaultCreateScope = () => currentUserStore?.name || storeFilterOptions[0] || "";
  const validateCustomQuotaForPromote = (item: CustomQuotaItem, targetScope: string) => {
    if (isDisallowedQuotaScope(targetScope)) {
      window.alert("该自定义项目缺少所属门店，无法转正为标准定额");
      return false;
    }
    if (!activeStoreScopeOptions.includes(targetScope)) {
      window.alert("该门店已停用或不在当前账号可管理范围内，不能转正为标准定额");
      return false;
    }
    if (!item.name.trim()) {
      window.alert("请填写项目名称后再转正");
      return false;
    }
    if (!item.unit.trim()) {
      window.alert("请填写单位后再转正");
      return false;
    }
    const laborPrice = Number(item.laborPrice || 0);
    const materialPrice = Number(item.materialPrice || 0);
    if (!Number.isFinite(laborPrice) || laborPrice < 0) {
      window.alert("人工单价不能为负数");
      return false;
    }
    if (!Number.isFinite(materialPrice) || materialPrice < 0) {
      window.alert("材料单价不能为负数");
      return false;
    }
    return true;
  };
  const executePromoteCustomQuotaItem = async (item: CustomQuotaItem, targetScope: string) => {
    const code = makeCodeForScope(targetScope);
    const laborPrice = Number(item.laborPrice || 0);
    const materialPrice = Number(item.materialPrice || 0);
    await requestCustomQuotaLibrary("", {
      method: "POST",
      body: JSON.stringify({ action: "promote", id: item.id, promotedQuotaCode: code }),
    });
    const nextItem: QuotaItem = {
      id: `quota-promoted-${item.id}-${Date.now()}`,
      code,
      scope: targetScope,
      priceScene: DEFAULT_PRICE_SCENE,
      category: item.category.trim() || "未分类",
      workTypeId: item.workTypeId || "",
      workTypeName: item.workTypeName || "",
      materialCategoryId: item.materialCategoryId || "",
      materialCategoryName: item.materialCategoryName || "",
      name: item.name.trim(),
      constructionDescription: item.constructionDescription.trim(),
      unit: item.unit.trim(),
      laborPrice,
      materialPrice,
      internalLaborCost: 0,
      internalMaterialCost: 0,
      costLossRate: 0,
      totalPrice: laborPrice + materialPrice,
      isSpecialPrice: Boolean(item.isSpecialPrice),
      status: "enabled",
      updatedAt: todayText(),
    };
    setQuotaItems((current) => [nextItem, ...current]);
    setNotice(`已转正到标准定额库：${item.name}，编码 ${code}`);
  };

  const promoteCustomQuotaItem = async (item: CustomQuotaItem) => {
    const targetScope = item.storeName?.trim() || item.scope?.trim() || currentUserStore?.name || storeFilterOptions[0] || "";
    if (!validateCustomQuotaForPromote(item, targetScope)) {
      return;
    }
    const nextCategory = item.category.trim() || "未分类";
    const nextName = item.name.trim();
    const nextUnit = item.unit.trim();
    const duplicate = quotaItems.find((quota) =>
      quota.scope === targetScope &&
      (quota.priceScene || DEFAULT_PRICE_SCENE) === DEFAULT_PRICE_SCENE &&
      quota.category === nextCategory &&
      quota.name === nextName &&
      quota.unit === nextUnit
    );
    return new Promise<void>((resolve, reject) => {
      setPromoteConfirm({
        item,
        targetScope,
        duplicateName: duplicate?.name,
        resolve,
        reject,
      });
    });
  };

  const closePromoteConfirm = () => {
    promoteConfirm?.resolve();
    setPromoteConfirm(null);
  };

  const confirmPromoteCustomQuotaItem = async () => {
    if (!promoteConfirm) return;
    const current = promoteConfirm;
    setPromoteConfirm(null);
    try {
      await executePromoteCustomQuotaItem(current.item, current.targetScope);
      current.resolve();
    } catch (error: any) {
      current.reject(error instanceof Error ? error : new Error(error?.message || "转正失败"));
    }
  };
  useEffect(() => {
    if (!hasRealImportFile || !importText.trim() || importIsExample) return;
    if (!importTargetScope) {
      setImportErrors([]);
      setImportMessage("请选择导入门店后再确认导入。");
      return;
    }
    const preview = parseQuotaImport(importText, quotaItems, storeScopeOptions, importTargetScope);
    setImportErrors(preview.errors);
    setImportMessage(preview.errors.length > 0
      ? `导入到${importTargetScope}时发现 ${preview.errors.length} 行错误，请导出错误明细并修正 Excel 后重新上传。`
      : `识别到 ${preview.items.length} 条定额，将导入到${importTargetScope}，定额编码自动生成`
    );
  }, [hasRealImportFile, importIsExample, importTargetScope, importText, quotaItems, storeScopeOptions]);
  useEffect(() => {
    if (editMode !== "create" || !currentUserStore?.name) return;
    setEditingItem((current) => {
      if (!current || current.scope === currentUserStore.name) return current;
      return {
        ...current,
        scope: currentUserStore.name,
        code: makeCodeForScope(currentUserStore.name, current.id),
      };
    });
  }, [currentUserStore?.name, editMode, makeCodeForScope]);
  const openCreateDialog = () => {
    setEditMode("create");
    setEditingItem(makeEmptyQuotaItem(quotaItems, storeScopeOptions, getDefaultCreateScope()));
  };
  const handleCopy = (item: QuotaItem) => {
    const copyItem = {
      ...item,
      id: `${item.id}-copy-${Date.now()}`,
      code: makeCodeForScope(item.scope),
      name: item.name,
      priceScene: item.priceScene || DEFAULT_PRICE_SCENE,
      status: "enabled" as const,
      updatedAt: todayText(),
    };
    setEditMode("create");
    setEditingItem(copyItem);
    setNotice("已带入原定额信息，请选择价格类型并调整价格后保存");
  };
  const handleDelete = (item: QuotaItem) => {
    if (!window.confirm(`确认删除定额“${item.name}”吗？`)) return;
    setQuotaItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    setSelectedQuotaIds((current) => current.filter((id) => id !== item.id));
    setNotice(`已删除定额：${item.name}`);
    if (editingItem?.id === item.id) setEditingItem(null);
  };
  const openHistoryDialog = async (item: QuotaItem) => {
    setHistoryItem(item);
    setHistoryLogs([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/quota/library?historyItemId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "读取修改记录失败");
      setHistoryLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (error: any) {
      setHistoryError(error?.message || "读取修改记录失败");
    } finally {
      setHistoryLoading(false);
    }
  };
  const formatHistoryTime = (value: string) => {
    if (!value) return "-";
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const parsed = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };
  const getHistoryActionLabel = (action: string) => {
    if (action === "created") return "新增";
    if (action === "updated") return "修改";
    if (action === "deleted") return "删除";
    return "记录";
  };
  const toggleQuotaSelection = (id: string) => {
    setSelectedQuotaIds((current) => current.includes(id) ? current.filter((currentId) => currentId !== id) : [...current, id]);
  };
  const toggleCurrentPageSelection = () => {
    setSelectedQuotaIds((current) => {
      const currentSet = new Set(current);
      if (isCurrentPageAllSelected) {
        currentPageIds.forEach((id) => currentSet.delete(id));
      } else {
        currentPageIds.forEach((id) => currentSet.add(id));
      }
      return Array.from(currentSet);
    });
  };
  const handleBatchStatusChange = (status: QuotaItem["status"]) => {
    if (selectedQuotaItems.length === 0) return;
    const selectedSet = new Set(selectedQuotaItems.map((item) => item.id));
    setQuotaItems((current) => current.map((item) => selectedSet.has(item.id) ? { ...item, status, updatedAt: todayText() } : item));
    setSelectedQuotaIds([]);
    setNotice(`已批量${status === "enabled" ? "启用" : "停用"} ${selectedSet.size} 条定额`);
  };
  const saveEditingItem = () => {
    if (!editingItem) return;
    const nextScope = editingItem.scope.trim() || DEFAULT_QUOTA_SCOPE;
    if (isDisallowedQuotaScope(nextScope)) {
      window.alert("请选择适用门店，定额不允许设置为全部门店通用");
      return;
    }
    const originalScope = quotaItems.find((item) => item.id === editingItem.id)?.scope?.trim();
    if (!activeStoreScopeOptions.includes(nextScope) && !(editMode === "edit" && originalScope === nextScope)) {
      window.alert("该门店已停用，不能新增或转入定额");
      return;
    }
    const expectedPrefix = makeScopePrefix(nextScope, storeScopeOptions);
    const trimmedCode = editingItem.code.trim();
    const nextCode = !trimmedCode || (isQuotaCodeLike(trimmedCode) && !trimmedCode.toUpperCase().startsWith(expectedPrefix))
      ? makeCodeForScope(nextScope, editingItem.id)
      : trimmedCode;
    if (!editingItem.name.trim()) {
      window.alert("请填写项目名称");
      return;
    }
    if (!editingItem.unit.trim()) {
      window.alert("请填写单位");
      return;
    }
    if (Number(editingItem.laborPrice || 0) < 0) {
      window.alert("人工单价不能为负数");
      return;
    }
    if (Number(editingItem.materialPrice || 0) < 0) {
      window.alert("材料单价不能为负数");
      return;
    }
    const internalLaborCost = Number(editingItem.internalLaborCost || 0);
    const internalMaterialCost = Number(editingItem.internalMaterialCost || 0);
    if (internalLaborCost > 0 && !editingItem.workTypeId) {
      window.alert("请先选择工种，有内部人工成本时工种必选");
      return;
    }
    if (internalMaterialCost > 0 && !editingItem.materialCategoryId) {
      window.alert("请先选择材料分类，有内部材料成本时材料分类必选");
      return;
    }
    const duplicate = quotaItems.some((item) => item.code === nextCode && item.id !== editingItem.id);
    if (duplicate) {
      window.alert("定额编码已存在，请更换编码");
      return;
    }
    const nextItem = {
      ...editingItem,
      code: nextCode,
      category: editingItem.category.trim() || "未分类",
      scope: nextScope,
      priceScene: editingItem.priceScene.trim() || DEFAULT_PRICE_SCENE,
      name: editingItem.name.trim(),
      constructionDescription: editingItem.constructionDescription.trim(),
      unit: editingItem.unit.trim(),
      laborPrice: Number(editingItem.laborPrice || 0),
      materialPrice: Number(editingItem.materialPrice || 0),
      internalLaborCost,
      internalMaterialCost,
      costLossRate: Number(editingItem.costLossRate || 0),
      totalPrice: Number(editingItem.laborPrice || 0) + Number(editingItem.materialPrice || 0),
      isSpecialPrice: Boolean(editingItem.isSpecialPrice),
      updatedAt: todayText(),
    };
    const sameSceneDuplicate = quotaItems.find((item) => (
      item.id !== nextItem.id &&
      (item.scope?.trim() || DEFAULT_QUOTA_SCOPE) === nextItem.scope &&
      (item.priceScene || DEFAULT_PRICE_SCENE) === nextItem.priceScene &&
      (item.category || "未分类") === nextItem.category &&
      item.name.trim() === nextItem.name &&
      item.unit.trim() === nextItem.unit
    ));
    if (sameSceneDuplicate && !window.confirm(
      `当前门店的“${nextItem.priceScene}”价格类型下，已经存在同名同单位定额“${sameSceneDuplicate.name}”。\n\n继续保存会形成两条相同类型的定额，后续添加项目时用户需要自行区分。是否仍然保存？`,
    )) {
      return;
    }
    setQuotaItems((current) => editMode === "create" ? [nextItem, ...current] : current.map((item) => item.id === nextItem.id ? nextItem : item));
    setNotice(editMode === "create" ? `已新增定额：${nextItem.name}` : `已保存定额：${nextItem.name}`);
    setEditingItem(null);
  };
  const handleImportQuota = () => {
    if (importIsExample) {
      setImportMessage("当前内容只是示例，用于查看格式，不能直接导入。请上传真实 Excel 文件后再确认导入。");
      return;
    }
    if (!importTargetScope) {
      setImportErrors([]);
      setImportMessage("请选择导入门店后再确认导入。");
      return;
    }
    if (!activeStoreScopeOptions.includes(importTargetScope)) {
      setImportErrors([]);
      setImportMessage("该门店已停用，不能导入定额。请改选启用门店。");
      return;
    }
    const result = parseQuotaImport(importText, quotaItems, storeScopeOptions, importTargetScope);
    if (result.errors.length > 0) {
      setImportErrors(result.errors);
      setImportMessage(`发现 ${result.errors.length} 行错误，请导出错误明细并修正 Excel 后重新上传。`);
      return;
    }
    if (result.items.length === 0) {
      setImportMessage("没有识别到可导入的定额，请检查表格内容");
      return;
    }
    const importedCodes = new Set(result.items.map((item) => item.code));
    setQuotaItems((current) => [
      ...result.items,
      ...current.filter((item) => !importedCodes.has(item.code)),
    ]);
    setImportMessage("");
    setImportText("");
    setImportIsExample(false);
    setHasRealImportFile(false);
    setImportErrors([]);
    setImportOpen(false);
    setNotice(`已导入 ${result.items.length} 条定额到${importTargetScope}，定额编码已按门店自动生成`);
  };
  const handleImportScopeChange = (nextScope: string) => {
    setImportScope(nextScope);
    if (!importText.trim() || importIsExample) return;
    const targetScope = currentUserStore?.name?.trim() || nextScope.trim();
    if (!targetScope) {
      setImportErrors([]);
      setImportMessage("请选择导入门店后再确认导入。");
      return;
    }
    const preview = parseQuotaImport(importText, quotaItems, storeScopeOptions, targetScope);
    setImportErrors(preview.errors);
    setImportMessage(preview.errors.length > 0
      ? `导入到${targetScope}时发现 ${preview.errors.length} 行错误，请导出错误明细并修正 Excel 后重新上传。`
      : `识别到 ${preview.items.length} 条定额，将导入到${targetScope}，定额编码自动生成`
    );
  };
  const handleImportFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await readExcelFileAsImportText(file);
      if (!text.trim()) {
        setImportMessage("Excel 中没有识别到可导入的表格内容");
        return;
      }
      const targetScope = importTargetScope;
      const preview = targetScope ? parseQuotaImport(text, quotaItems, storeScopeOptions, targetScope) : null;
      setImportText(text);
      setImportIsExample(false);
      setHasRealImportFile(true);
      setImportErrors(preview?.errors || []);
      setImportMessage(!targetScope
        ? `已读取 Excel：${file.name}，请选择导入门店后再确认导入。`
        : preview && preview.errors.length > 0
          ? `已读取 Excel：${file.name}，导入到${targetScope}时发现 ${preview.errors.length} 行错误，请导出错误明细并修正后重新上传。`
          : `已读取 Excel：${file.name}，识别到 ${preview?.items.length || 0} 条定额，将导入到${targetScope}，定额编码自动生成`
      );
    } catch (error: any) {
      setImportErrors([]);
      setHasRealImportFile(false);
      setImportMessage(error?.message || "Excel 读取失败，请检查文件格式");
    }
  };
  const fillImportExample = () => {
    setImportText([
      quotaImportHeaders.join("\t"),
      ["标准", "泥瓦工程", "墙砖铺贴 300x600", "基层清理后水泥砂浆铺贴并控制空鼓率", "㎡", "52", "10", "38", "7", "3", "否"].join("\t"),
      ["别墅", "安装工程", "开关插座安装", "按图纸定位安装并通电测试", "个", "12", "0", "8", "0", "0", "是"].join("\t"),
    ].join("\n"));
    setImportIsExample(true);
    setHasRealImportFile(false);
    setImportErrors([]);
    setImportMessage("当前为示例内容，仅用于查看导入格式，不会被导入。");
  };
  const editingInternalLaborCost = Number(editingItem?.internalLaborCost || 0);
  const editingInternalMaterialCost = Number(editingItem?.internalMaterialCost || 0);
  const isWorkTypeRequired = editingInternalLaborCost > 0;
  const isMaterialCategoryRequired = editingInternalMaterialCost > 0;

  return (
    <div className="app-page-surface enterprise-list-ui quota-management-ui quota-list-page quota-library-page flex h-full min-h-0 flex-col">
      <div className="quota-library-modebar shrink-0">
        <div className="quota-library-modebar-inner">
          <div className="quota-library-mode-switch inline-flex" role="tablist" aria-label="定额库类型">
          <button
            type="button"
            onClick={() => {
              setLibraryMode("standard");
            }}
            className={libraryMode === "standard" ? "quota-library-mode-tab quota-library-mode-tab-active" : "quota-library-mode-tab"}
            role="tab"
            aria-selected={libraryMode === "standard"}
          >
            标准定额库
          </button>
          <button
            type="button"
            onClick={() => {
              setLibraryMode("custom");
              setEditingItem(null);
              setImportOpen(false);
              setSelectedQuotaIds([]);
            }}
            className={libraryMode === "custom" ? "quota-library-mode-tab quota-library-mode-tab-active" : "quota-library-mode-tab"}
            role="tab"
            aria-selected={libraryMode === "custom"}
          >
            自定义库
          </button>
          </div>
          <p className="quota-library-mode-help">
            {libraryMode === "standard" ? "报价规范复用，按门店、分类、状态维护。" : "沉淀报价员手动项目，可按门店管理并转正。"}
          </p>
        </div>
      </div>
      {notice && (
        <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}
      {promoteConfirm && (
        <CustomQuotaPromoteDialog
          state={promoteConfirm}
          onCancel={closePromoteConfirm}
          onConfirm={confirmPromoteCustomQuotaItem}
        />
      )}
      {libraryMode === "standard" ? (
      <section className="table-shell quota-list-shell flex min-h-0 flex-1 flex-col">
        <div className="quota-list-toolbar quota-library-toolbar flex flex-col gap-3 border-b border-surface-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="quota-search-control flex min-h-10 flex-1 items-center gap-2 border border-surface-200 bg-white px-3 text-sm text-surface-500 lg:max-w-md">
            <Search className="h-4 w-4" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-surface-400" placeholder="搜索定额编码、门店、项目名称、施工说明" />
          </div>
          <div className="quota-toolbar-compact flex flex-wrap items-center gap-2">
            <span className="quota-filter-label inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500"><SlidersHorizontal className="h-3.5 w-3.5" />筛选</span>
            <SystemSelect aria-label="按门店筛选" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="input-field h-10 w-36 py-0">
              <option value="">全部门店</option>
              {storeFilterOptions.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
            </SystemSelect>
            <SystemSelect aria-label="按分类筛选" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="input-field h-10 w-36 py-0">
              <option value="">全部分类</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </SystemSelect>
            <SystemSelect aria-label="按价格类型筛选" value={priceSceneFilter} onChange={(event) => setPriceSceneFilter(event.target.value)} className="input-field h-10 w-36 py-0">
              <option value="">全部类型</option>
              {priceSceneOptions.map((scene) => <option key={scene} value={scene}>{scene}</option>)}
            </SystemSelect>
            <SystemSelect aria-label="按状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | QuotaItem["status"])} className="input-field h-10 w-32 py-0">
              <option value="">全部状态</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </SystemSelect>
            <button type="button" onClick={() => { setImportOpen(true); setImportMessage(""); }} className="btn-secondary quota-toolbar-action min-h-10 px-3"><Upload className="h-4 w-4" />导入定额</button>
            <button type="button" onClick={openCreateDialog} className="btn-primary quota-toolbar-action min-h-10 px-3"><Plus className="h-4 w-4" />新增定额</button>
          </div>
        </div>
        {selectedQuotaItems.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-100 bg-primary-50/70 px-4 py-2 text-sm">
            <span className="font-medium text-primary-800">已选择 {selectedQuotaItems.length} 条定额</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => handleBatchStatusChange("enabled")} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50">
                批量启用
              </button>
              <button type="button" onClick={() => handleBatchStatusChange("disabled")} className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-700 transition hover:bg-surface-50">
                批量停用
              </button>
              <button type="button" onClick={() => setSelectedQuotaIds([])} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-surface-500 transition hover:bg-white hover:text-surface-800">
                清空选择
              </button>
            </div>
          </div>
        )}

        <ThinScrollArea className="quota-list-scroll min-h-0 flex-1" scrollClassName="quota-list-scroll-region h-full overflow-auto">
          <table className="quota-list-table min-w-full border-separate border-spacing-0 text-sm [&_td]:border-b [&_td]:border-surface-100 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-surface-100 [&_th]:border-b [&_th]:border-surface-300 [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-surface-200">
            <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
              <tr className="border-b border-surface-300">
                <th className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isCurrentPageAllSelected}
                    disabled={currentPageIds.length === 0}
                    onChange={toggleCurrentPageSelection}
                    className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                    aria-label="选择当前页定额"
                  />
                </th>
                <th className="px-3 py-3 text-center">定额编码</th>
                <th className="px-3 py-3 text-center">分类</th>
                <th className="px-3 py-3 text-center">价格类型</th>
                <th className="px-3 py-3 text-left">项目名称</th>
                <th className="px-3 py-3 text-center">单位</th>
                <th className="px-3 py-3 text-center">人工单价</th>
                <th className="px-3 py-3 text-center">材料单价</th>
                <th className="px-3 py-3 text-center">客户单价</th>
                <th className="px-3 py-3 text-left">施工说明</th>
                <th className="px-3 py-3 text-center">适用门店</th>
                <th className="px-3 py-3 text-center">状态</th>
                <th className="px-3 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.length === 0 ? (
                <tr className="quota-empty-row">
                  <td colSpan={13} className="px-4 py-12 text-center">
                    <div className="quota-empty-icon mx-auto flex h-10 w-10 items-center justify-center rounded-[10px]">
                      <Search className="h-4 w-4" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-surface-800">暂无符合条件的定额</p>
                    <p className="mt-1 text-xs text-surface-500">请调整搜索词或筛选条件</p>
                  </td>
                </tr>
              ) : pagination.pageItems.map((item) => (
                <tr key={item.id} className={selectedQuotaIdSet.has(item.id) ? "bg-primary-50/50 hover:bg-primary-50" : "bg-white hover:bg-surface-50"}>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedQuotaIdSet.has(item.id)}
                      onChange={() => toggleQuotaSelection(item.id)}
                      className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      aria-label={`选择定额${item.name}`}
                    />
                  </td>
	                  <td className="quota-code-cell px-3 py-3 text-center">{item.code}</td>
	                  <td className="quota-category-cell px-3 py-3 text-center">{item.category}</td>
                  <td className="quota-category-cell px-3 py-3 text-center">{item.priceScene || DEFAULT_PRICE_SCENE}</td>
                  <td className="quota-primary-cell px-3 py-3">
                    <p className="quota-item-name">{item.name}</p>
                  </td>
                  <td className="quota-unit-cell px-3 py-3 text-center text-surface-700">{item.unit}</td>
                  <td className="quota-money-cell px-3 py-3 text-center tabular-nums text-surface-700">{formatAmount(item.laborPrice)}</td>
                  <td className="quota-money-cell px-3 py-3 text-center tabular-nums text-surface-700">{formatAmount(item.materialPrice)}</td>
                  <td className="quota-money-cell quota-total-price px-3 py-3 text-center font-semibold tabular-nums text-red-600">
                    <span className="quota-total-price-inner">
                      <span>{formatAmount(item.totalPrice)}</span>
                      {item.isSpecialPrice && (
                        <span className="quota-special-price-badge" title="特价项目">
                          特
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="quota-description-cell px-3 py-3 text-left text-surface-700">
                    <p className="line-clamp-2 leading-5" title={item.constructionDescription || undefined}>{item.constructionDescription || "-"}</p>
                  </td>
                  <td className="quota-scope-cell px-3 py-3 text-center text-surface-700">{item.scope || DEFAULT_QUOTA_SCOPE}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={item.status === "enabled" ? "quota-status-tag quota-status-tag-enabled bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700" : "quota-status-tag quota-status-tag-disabled bg-surface-100 px-2 py-1 text-xs font-semibold text-surface-500"}>
                      {item.status === "enabled" ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="quota-row-actions inline-flex items-center justify-center gap-1">
                      <button type="button" onClick={() => openHistoryDialog(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title="查看修改记录">
                        <History className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => { setEditMode("edit"); setEditingItem(item); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title="编辑定额">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => handleCopy(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title="复制定额">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDelete(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="删除定额">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination className="quota-list-pagination shrink-0" total={filteredItems.length} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemName="条定额" />
      </section>
      ) : (
        <CustomQuotaLibraryPanel
          storeOptions={storeFilterOptions}
          defaultStoreName={currentUserStore?.name || storeFilterOptions[0] || ""}
          onPromote={promoteCustomQuotaItem}
          onNotice={setNotice}
          workTypeOptions={workTypeOptions}
          materialCategoryOptions={materialCategoryOptions}
        />
      )}
      {historyItem && (
        <div className="qm-modal-overlay fixed inset-y-0 left-[var(--active-sidebar-width,260px)] right-0 z-50 flex items-center justify-center px-6 py-7 max-md:inset-0 max-md:px-4">
          <div role="dialog" aria-modal="true" className="qm-modal-shell quota-history-modal flex w-full max-w-4xl flex-col overflow-hidden border border-surface-200 bg-white">
            <div className="qm-modal-header flex items-center justify-between border-b border-surface-200 px-5 py-4">
              <div className="min-w-0">
                <p className="qm-modal-title text-base font-semibold text-surface-900">修改记录</p>
                <p className="qm-modal-subtitle mt-0.5 truncate text-xs text-surface-500">{historyItem.code || "未编号"} · {historyItem.name}</p>
              </div>
              <button type="button" onClick={() => setHistoryItem(null)} className="qm-icon-button inline-flex h-9 w-9 items-center justify-center text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="qm-modal-body quota-history-body overflow-y-auto bg-white px-5 py-4 text-xs">
              {historyLoading ? (
                <div className="flex h-40 items-center justify-center text-surface-500">正在读取修改记录...</div>
              ) : historyError ? (
                <div className="flex h-40 items-center justify-center text-red-500">{historyError}</div>
              ) : historyLogs.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-surface-100 text-surface-500">
                    <History className="h-4 w-4" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-surface-800">暂无修改记录</p>
                  <p className="mt-1 text-xs text-surface-500">后续新增、编辑或删除该定额都会记录在这里</p>
                </div>
              ) : (
                <div className="quota-history-table-wrap overflow-hidden border border-surface-200">
                  <table className="quota-history-table min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="bg-surface-100 text-surface-700">
                      <tr>
                        <th className="w-40 border-b border-r border-surface-200 px-3 py-3 text-center font-semibold">时间</th>
                        <th className="w-28 border-b border-r border-surface-200 px-3 py-3 text-center font-semibold">操作人</th>
                        <th className="w-20 border-b border-r border-surface-200 px-3 py-3 text-center font-semibold">操作</th>
                        <th className="border-b border-surface-200 px-3 py-3 text-left font-semibold">变更内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLogs.map((log) => (
                        <tr key={log.id} className="bg-white align-middle">
                          <td className="border-b border-r border-surface-100 px-3 py-3 text-center align-middle tabular-nums text-surface-600">{formatHistoryTime(log.createdAt)}</td>
                          <td className="border-b border-r border-surface-100 px-3 py-3 text-center align-middle text-surface-700">{log.userName || "-"}</td>
                          <td className="border-b border-r border-surface-100 px-3 py-3 text-center align-middle">
                            <span className={log.action === "deleted" ? "font-semibold text-red-600" : log.action === "created" ? "font-semibold text-emerald-700" : "font-semibold text-primary-700"}>
                              {getHistoryActionLabel(log.action)}
                            </span>
                          </td>
                          <td className="border-b border-surface-100 px-3 py-3 text-surface-700">
                            <p className="font-semibold text-surface-800">{log.summary || getHistoryActionLabel(log.action)}</p>
                            {log.changes.length > 0 && (
                              <div className="mt-2">
                                {log.changes.map((change) => (
                                  <div key={`${log.id}-${change.field}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-t border-surface-100 px-0 py-2 first:border-t-0 first:pt-0 last:pb-0">
                                    <span className="font-semibold text-surface-600">{change.label}</span>
                                    <span className="min-w-0 text-surface-700">
                                      <span className="break-words text-surface-700">{String(change.before ?? "-")}</span>
                                      <span className="px-2 text-surface-700">改为</span>
                                      <span className="break-words text-surface-700">{String(change.after ?? "-")}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="qm-modal-footer flex justify-end gap-2 border-t border-surface-200 px-5 py-4">
              <button type="button" onClick={() => setHistoryItem(null)} className="btn-secondary">关闭</button>
            </div>
          </div>
        </div>
      )}
      {editingItem && (
        <div className="qm-modal-overlay quota-custom-editor-overlay fixed inset-y-0 left-[var(--active-sidebar-width,260px)] right-0 z-50 flex items-center justify-center px-6 py-7 max-md:inset-0 max-md:px-4">
          <div role="dialog" aria-modal="true" className="qm-modal-shell qm-editor-modal quota-editor-redesign quota-library-editor-modal flex w-full max-w-5xl flex-col overflow-hidden border border-surface-200 bg-white">
            <div className="qm-modal-header quota-editor-header flex items-center justify-between border-b border-surface-200 px-6 py-4">
              <div>
                <p className="qm-modal-title text-base font-semibold text-surface-900">{editMode === "create" ? "新增定额" : "编辑定额"}</p>
                <p className="qm-modal-subtitle mt-0.5 text-xs text-surface-500">{editMode === "create" ? "维护标准定额、客户单价与内部成本" : editingItem.code}</p>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="qm-icon-button inline-flex h-9 w-9 items-center justify-center text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="qm-modal-body qm-editor-form quota-editor-body overflow-y-auto px-6 py-5">
              <div className="quota-editor-context-row">
                <label className="qm-field quota-editor-identity-field">
                  <span>定额编码</span>
                  <input value={editingItem.code} onChange={(event) => setEditingItem({ ...editingItem, code: event.target.value })} className="input-field" />
                </label>
                <label className="qm-field quota-editor-identity-field">
                  <span>适用门店</span>
                  {editMode === "create" && currentUserStore?.name ? (
                    <input value={currentUserStore.name} readOnly className="input-field bg-surface-50 text-surface-600" />
                  ) : (
                    <SystemSelect
                      value={editingItem.scope || ""}
                      onChange={(event) => {
                        const nextScope = event.target.value;
                        const shouldRefreshCode = editMode === "create" || isQuotaCodeLike(editingItem.code);
                        setEditingItem({
                          ...editingItem,
                          scope: nextScope,
                          code: shouldRefreshCode ? makeCodeForScope(nextScope, editingItem.id) : editingItem.code,
                        });
                      }}
                      className="input-field"
                    >
                      <option value="" disabled>请选择适用门店</option>
                      {(editMode === "edit" && editingItem.scope && !activeStoreScopeOptions.includes(editingItem.scope)
                        ? [editingItem.scope, ...activeStoreScopeOptions]
                        : activeStoreScopeOptions
                      ).map((scope) => <option key={scope} value={scope}>{scope}{!activeStoreScopeOptions.includes(scope) ? "（已停用）" : ""}</option>)}
                    </SystemSelect>
                  )}
                </label>
                <div ref={priceSceneFieldRef} className="qm-field quota-editor-identity-field quota-price-scene-field">
                  <span className="flex items-center gap-1.5">
                    价格类型
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPriceSceneHelpOpen((open) => !open);
                      }}
                      className="quota-price-scene-help-trigger"
                      aria-label="价格类型说明"
                      aria-expanded={priceSceneHelpOpen}
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-surface-400" />
                    </button>
                  </span>
                  {priceSceneHelpOpen && (
                    <div className="quota-price-scene-help" role="tooltip">
                      <p>用于区分同一门店下不同业务的定额价格。</p>
                      <p>例如同一个拆除项目，标准类型为 100，别墅类型为 120。</p>
                      <p>模板和报价添加基装定额时，可按价格类型筛选。</p>
                    </div>
                  )}
                  <SystemSelect
                    value={editingItem.priceScene || DEFAULT_PRICE_SCENE}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === ADD_PRICE_SCENE_OPTION) {
                        addPriceSceneForEditingItem(editingItem);
                        return;
                      }
                      setEditingItem({ ...editingItem, priceScene: nextValue });
                    }}
                    className="input-field"
                  >
                    {editingPriceSceneOptions.map((scene) => (
                      <option key={scene} value={scene}>{scene}</option>
                    ))}
                    <option value={ADD_PRICE_SCENE_OPTION}>+ 新增价格类型</option>
                  </SystemSelect>
                </div>
              </div>

              <div className="quota-editor-flow">
                <section className="quota-editor-section quota-editor-main-section">
                  <div className="quota-editor-section-head">
                    <b className="quota-editor-step-index">1</b>
                    <span>基础信息</span>
                    <small>定义报价中展示和计算的定额项目</small>
                  </div>
                  <div className="quota-editor-field-grid">
                    <label className="qm-field quota-editor-field quota-editor-field-wide">
                      <span>项目名称 <em>*</em></span>
                      <input value={editingItem.name} onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })} className="input-field" />
                    </label>
                    <label className="qm-field quota-editor-field">
                      <span>分类</span>
                      <input
                        value={editingItem.category}
                        onChange={(event) => setEditingItem({ ...editingItem, category: event.target.value })}
                        className="input-field"
                        placeholder="如：拆除工程 / 水电工程 / 泥瓦工程"
                      />
                    </label>
                    <div
                      className="qm-field quota-editor-field"
                      onBlur={(event) => {
                        const nextTarget = event.relatedTarget as Node | null;
                        if (!nextTarget || !event.currentTarget.contains(nextTarget)) setUnitOptionsOpen(false);
                      }}
                    >
                      <span>单位 <em>*</em></span>
                      <div className="relative">
                        <input
                          value={editingItem.unit}
                          onChange={(event) => setEditingItem({ ...editingItem, unit: event.target.value })}
                          onFocus={() => setUnitOptionsOpen(true)}
                          className="input-field pr-10"
                          placeholder="请选择或输入单位"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setUnitOptionsOpen((open) => !open)}
                          className="qm-unit-trigger absolute inset-y-0 right-0 flex w-10 items-center justify-center text-surface-500 hover:text-surface-800"
                          aria-label="选择单位"
                        >
                          <ChevronDown className={unitOptionsOpen ? "h-4 w-4 rotate-180 transition" : "h-4 w-4 transition"} />
                        </button>
                        {unitOptionsOpen && (
                          <div className="qm-unit-menu absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-surface-200 bg-white py-1 shadow-lg">
                            {COMMON_QUOTA_UNITS.map((unit) => (
                              <button
                                key={unit}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setEditingItem({ ...editingItem, unit });
                                  setUnitOptionsOpen(false);
                                }}
                                className={editingItem.unit === unit ? "flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-primary-700" : "flex w-full items-center justify-between px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50"}
                              >
                                {unit}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="quota-editor-quote-inline quota-editor-field-wide">
                      <label className="qm-field quota-editor-field">
                        <span>人工单价 <em>*</em></span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getPriceInputValue("laborPrice", editingItem.laborPrice)}
                          onFocus={() => setFocusedPriceField("laborPrice")}
                          onBlur={() => setFocusedPriceField(null)}
                          onChange={(event) => setEditingItem({ ...editingItem, laborPrice: parsePriceInput(event.target.value) })}
                          className="input-field text-center tabular-nums"
                        />
                      </label>
                      <label className="qm-field quota-editor-field">
                        <span>材料单价 <em>*</em></span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getPriceInputValue("materialPrice", editingItem.materialPrice)}
                          onFocus={() => setFocusedPriceField("materialPrice")}
                          onBlur={() => setFocusedPriceField(null)}
                          onChange={(event) => setEditingItem({ ...editingItem, materialPrice: parsePriceInput(event.target.value) })}
                          className="input-field text-center tabular-nums"
                        />
                      </label>
                      <div className="quota-editor-price-total-field">
                        <span>客户单价</span>
                        <div className="quota-editor-price-tile">
                          <strong>{formatAmount(Number(editingItem.laborPrice || 0) + Number(editingItem.materialPrice || 0))}</strong>
                        </div>
                      </div>
                      <div className="quota-editor-toggle-field quota-editor-special-field">
                        <span>是否特价项目</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={editingItem.isSpecialPrice}
                          onClick={() => setEditingItem({ ...editingItem, isSpecialPrice: !editingItem.isSpecialPrice })}
                          className="qm-switch-row flex h-10 w-full items-center justify-between border border-surface-200 bg-white px-3 text-sm text-surface-700 transition hover:border-primary-200 hover:bg-primary-50/40"
                        >
                          <span className="font-medium">{editingItem.isSpecialPrice ? "是" : "否"}</span>
                          <span className={editingItem.isSpecialPrice ? "qm-switch flex h-5 w-9 items-center bg-primary-600 p-0.5 transition" : "qm-switch flex h-5 w-9 items-center bg-surface-300 p-0.5 transition"}>
                            <span className={editingItem.isSpecialPrice ? "qm-switch-thumb h-4 w-4 translate-x-4 bg-white transition" : "qm-switch-thumb h-4 w-4 bg-white transition"} />
                          </span>
                        </button>
                      </div>
                    </div>
                    <label className="qm-field quota-editor-field quota-editor-field-wide">
                      <span>施工说明</span>
                      <textarea
                        value={editingItem.constructionDescription}
                        onChange={(event) => setEditingItem({ ...editingItem, constructionDescription: event.target.value })}
                        className="input-field min-h-32 resize-none leading-6"
                        placeholder="填写该定额的施工范围、工艺要求、验收口径等"
                      />
                    </label>
                  </div>
                </section>

                <section className="quota-editor-section quota-editor-cost-section">
                  <div className="quota-editor-section-head">
                    <b className="quota-editor-step-index">2</b>
                    <span>成本预算</span>
                    <small>内部使用，用于成本管控和毛利测算</small>
                  </div>
                  <div className="qm-cost-parameter-panel quota-editor-cost-panel">
                    <div className="qm-cost-calculator">
                      <div className="qm-cost-input-stack">
                        <label className="qm-cost-line-field">
                          <span><Coins className="h-3.5 w-3.5" />内部人工成本</span>
                          <div>
                            <small>¥</small>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getPriceInputValue("internalLaborCost", editingItem.internalLaborCost)}
                              onFocus={() => setFocusedPriceField("internalLaborCost")}
                              onBlur={() => setFocusedPriceField(null)}
                              onChange={(event) => setEditingItem({ ...editingItem, internalLaborCost: parsePriceInput(event.target.value) })}
                            />
                          </div>
                        </label>
                        <label className="qm-cost-line-field">
                          <span><Coins className="h-3.5 w-3.5" />内部材料成本</span>
                          <div>
                            <small>¥</small>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getPriceInputValue("internalMaterialCost", editingItem.internalMaterialCost)}
                              onFocus={() => setFocusedPriceField("internalMaterialCost")}
                              onBlur={() => setFocusedPriceField(null)}
                              onChange={(event) => setEditingItem({ ...editingItem, internalMaterialCost: parsePriceInput(event.target.value) })}
                            />
                          </div>
                        </label>
                        <label className="qm-cost-line-field">
                          <span><Percent className="h-3.5 w-3.5" />材料损耗率</span>
                          <div>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getPriceInputValue("costLossRate", editingItem.costLossRate)}
                              onFocus={() => setFocusedPriceField("costLossRate")}
                              onBlur={() => setFocusedPriceField(null)}
                              onChange={(event) => setEditingItem({ ...editingItem, costLossRate: parsePriceInput(event.target.value) })}
                            />
                            <small>%</small>
                          </div>
                        </label>
                      </div>
                      <div className="qm-cost-result-panel">
                        <span>预算成本单价</span>
                        <strong>{formatAmount(Number(editingItem.internalLaborCost || 0) + Number(editingItem.internalMaterialCost || 0) * (1 + Number(editingItem.costLossRate || 0) / 100))}</strong>
                        <small>人工成本 + 材料成本 × (1 + 损耗率)</small>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="quota-editor-section quota-editor-meta-section">
                <div className="quota-editor-section-head">
                  <b className="quota-editor-step-index">3</b>
                  <span>归属与状态</span>
                  <small>用于模板筛选、成本归集和报价优惠识别</small>
                </div>
                <div className={editMode === "edit" ? "quota-editor-meta-grid quota-editor-meta-grid-edit" : "quota-editor-meta-grid"}>
                  <label className="qm-field quota-editor-field">
                    <span>工种 {isWorkTypeRequired && <em>*</em>}</span>
                    <SystemSelect
                      value={editingItem.workTypeId || ""}
                      onChange={(event) => {
                        const option = workTypeOptions.find((item) => item.id === event.target.value);
                        setEditingItem({ ...editingItem, workTypeId: option?.id || "", workTypeName: option?.name || "" });
                      }}
                      className="input-field"
                    >
                      <option value="">未指定</option>
                      {workTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </SystemSelect>
                  </label>
                  <label className="qm-field quota-editor-field">
                    <span>材料分类 {isMaterialCategoryRequired && <em>*</em>}</span>
                    <SystemSelect
                      value={editingItem.materialCategoryId || ""}
                      onChange={(event) => {
                        const option = materialCategoryOptions.find((item) => item.id === event.target.value);
                        setEditingItem({ ...editingItem, materialCategoryId: option?.id || "", materialCategoryName: option?.name || "" });
                      }}
                      className="input-field"
                    >
                      <option value="">未分类</option>
                      {materialCategoryOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </SystemSelect>
                  </label>
                  {editMode === "edit" && (
                    <label className="qm-field quota-editor-field">
                      <span>状态</span>
                      <SystemSelect value={editingItem.status} onChange={(event) => setEditingItem({ ...editingItem, status: event.target.value as QuotaItem["status"] })} className="input-field">
                        <option value="enabled">启用</option>
                        <option value="disabled">停用</option>
                      </SystemSelect>
                    </label>
                  )}
                </div>
              </section>
            </div>
            <div className="qm-modal-footer quota-editor-footer flex justify-end gap-2 border-t border-surface-200 px-6 py-4">
              <button type="button" onClick={() => setEditingItem(null)} className="btn-secondary">取消</button>
              <button type="button" onClick={saveEditingItem} className="btn-primary">{editMode === "create" ? "新增定额" : "保存"}</button>
            </div>
          </div>
        </div>
      )}
      {importOpen && (
        <div className="qm-modal-overlay fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-950/25 px-6 py-7 max-md:inset-0 max-md:w-full max-md:px-4">
          <div role="dialog" aria-modal="true" className="qm-modal-shell qm-import-modal flex w-full max-w-4xl flex-col overflow-hidden border border-surface-200 bg-white">
            <div className="qm-modal-header flex items-center justify-between border-b border-surface-200 px-5 py-4">
              <div>
                <p className="qm-modal-title text-base font-semibold text-surface-900">导入定额</p>
                <p className="qm-modal-subtitle mt-0.5 text-xs text-surface-500">请下载模板填写后上传 Excel 文件，系统会预览导入内容。</p>
              </div>
              <button type="button" onClick={() => setImportOpen(false)} className="qm-icon-button inline-flex h-9 w-9 items-center justify-center text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="qm-import-actions border-b border-surface-200 bg-surface-50 px-5 py-4">
              <div className="grid gap-3 md:grid-cols-2">
                <button type="button" onClick={downloadQuotaImportTemplate} className="group flex min-h-[72px] items-center gap-3 rounded-xl border border-surface-200 bg-white px-4 text-left transition hover:border-primary-200 hover:bg-primary-50">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-700 group-hover:bg-white group-hover:text-primary-700">
                    <Download className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-surface-900">下载 Excel 模板</span>
                    <span className="mt-0.5 block text-xs text-surface-500">按模板字段填写更稳妥</span>
                  </span>
                </button>
                <label className="group flex min-h-[72px] cursor-pointer items-center gap-3 rounded-xl border border-primary-200 bg-white px-4 text-left transition hover:bg-primary-50">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 group-hover:bg-white">
                    <Upload className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-primary-700">选择 Excel 文件</span>
                    <span className="mt-0.5 block text-xs text-surface-500">支持 .xlsx / .xls</span>
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    onChange={(event) => {
                      handleImportFile(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="qm-modal-body space-y-4 overflow-y-auto px-5 py-5">
              <div className="qm-import-store border border-surface-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">导入门店</p>
                    <p className="mt-0.5 text-xs text-surface-500">Excel 模板不需要填写门店，系统按这里的门店导入并自动生成定额编码。</p>
                  </div>
                  {currentUserStore?.name ? (
                    <div className="flex h-10 min-w-40 items-center justify-center rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm font-semibold text-surface-800">
                      {currentUserStore.name}
                    </div>
                  ) : (
                    <SystemSelect value={importScope} onChange={(event) => handleImportScopeChange(event.target.value)} className="input-field h-10 w-full py-0 lg:w-48">
                      <option value="">请选择导入门店</option>
                      {activeStoreScopeOptions.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
                    </SystemSelect>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-surface-900">文件预览</span>
                  <span className="flex items-center gap-3 text-xs text-surface-500">
                    {importIsExample && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">当前为示例，不会导入</span>}
                    {!hasRealImportFile && (
                      <button type="button" onClick={fillImportExample} className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:text-primary-800">
                        <Pencil className="h-3.5 w-3.5" />
                        查看示例
                      </button>
                    )}
                    {hasRealImportFile && (
                      <label className="cursor-pointer font-semibold text-primary-700 hover:text-primary-800">
                        重新选择文件
                        <input
                          type="file"
                          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          className="hidden"
                          onChange={(event) => {
                            handleImportFile(event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    )}
                  </span>
                </span>
                {importText ? (
                  <div className="qm-import-preview overflow-hidden border border-surface-200 bg-white">
                    <ThinScrollArea className="max-h-[230px]" scrollClassName="max-h-[230px] overflow-auto">
                      <table className={importPreviewHeaders.length <= 4 ? "w-full min-w-[640px] table-fixed text-xs" : "w-full min-w-[1100px] table-fixed text-xs"}>
                        <colgroup>
                          {importPreviewHeaders.map((header) => (
                            <col
                              key={header}
                              className={
                                header === "施工说明" ? "w-[42%]"
                                  : header === "项目名称" ? "w-[24%]"
                                    : header === "分类" ? "w-[18%]"
                                      : header === "价格类型" ? "w-[12%]"
                                      : header === "单位" ? "w-[8%]"
                                        : header.includes("成本") ? "w-[12%]"
                                          : header.includes("单价") ? "w-[10%]"
                                            : "w-[8%]"
                              }
                            />
                          ))}
                        </colgroup>
                        <thead className="sticky top-0 bg-surface-100 text-surface-700">
                          <tr className="border-b border-surface-200">
                            {importPreviewHeaders.map((header) => (
                              <th key={header} className="px-3 py-2 text-center font-semibold">
                                {header}{requiredQuotaImportHeaders.has(header) && <span className="ml-0.5 text-red-500">*</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100">
                          {importPreviewRows.map((row, rowIndex) => (
                            <tr key={`${rowIndex}-${row.join("-")}`} className="bg-white">
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={`${cellIndex}-${cell}`}
                                  className={["人工单价", "材料单价", "内部人工成本", "内部材料成本", "损耗率"].includes(importPreviewHeaders[cellIndex]) ? "px-3 py-2 text-center tabular-nums text-surface-800" : "px-3 py-2 text-center text-surface-800"}
                                  title={cell || undefined}
                                >
                                  <span className={importPreviewHeaders[cellIndex] === "施工说明" ? "line-clamp-2 text-left leading-5" : "block truncate"}>{cell || "-"}</span>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
	                    </ThinScrollArea>
	                  </div>
	                ) : (
		                  <div className="qm-import-empty flex min-h-[230px] flex-col items-center justify-center border border-dashed border-surface-300 bg-surface-50 px-4 text-center">
	                    <Upload className="h-8 w-8 text-surface-400" />
	                    <p className="mt-3 text-sm font-semibold text-surface-800">请选择 Excel 文件</p>
	                    <p className="mt-1 text-xs text-surface-500">上传后会在这里预览定额内容，确认无误后再导入。</p>
	                  </div>
	                )}
              </div>
              {importMessage && (
                <div className={importErrors.length > 0 ? "flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700" : "rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"}>
                  <span>{importMessage}</span>
                  {importErrors.length > 0 && (
                    <button type="button" onClick={() => downloadQuotaImportErrors(importErrors)} className="shrink-0 rounded-lg border border-red-200 bg-white px-2.5 py-1 font-semibold text-red-700 hover:bg-red-50">
                      导出错误明细
                    </button>
                  )}
                </div>
              )}
              <div className="qm-import-fields border border-surface-200 bg-surface-50 px-4 py-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <p className="shrink-0 text-sm font-semibold text-surface-900">导入字段</p>
                  <div className="flex flex-wrap gap-2">
                    {quotaImportHeaders.map((header, index) => (
                      <span key={header} className="inline-flex h-7 items-center rounded-full border border-surface-200 bg-white px-2.5 text-xs font-medium text-surface-700">
                        {index + 1}. {header}{requiredQuotaImportHeaders.has(header) && <span className="ml-0.5 text-red-500">*</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="qm-modal-footer flex justify-end gap-2 border-t border-surface-200 px-5 py-4">
              <button type="button" onClick={() => setImportOpen(false)} className="btn-secondary">取消</button>
              <button type="button" onClick={handleImportQuota} className="btn-primary">确认导入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
