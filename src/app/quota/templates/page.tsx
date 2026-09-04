"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent as ReactChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Building2, ChevronDown, Copy, GripVertical, LayoutTemplate, Loader2, Pencil, Plus, Power, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import { useAuth } from "@/lib/auth";
import {
  feeCalcMethodLabels,
  getFeeCalcBaseError,
  normalizeFeeCalcBase,
  normalizeFeeCalcMethod,
  type FeeCalcMethod,
} from "@/lib/quotationFeeFormulas";
import { formatAlphaSequence } from "@/lib/quotationSequence";
import SystemSelect from "@/components/ui/SystemSelect";
import {
  getQuotaTemplateApplicabilityTags,
} from "@/lib/quotaTemplateScope";


import {
  CUSTOM_QUOTA_NUMBER_INPUT_KEYS,
  DEFAULT_TEMPLATE_CREATOR,
  QUOTA_TEMPLATE_DRAFT_STORAGE_KEY,
  QUOTA_TEMPLATE_STORAGE_KEY,
  buildTemplateFeeFormulaContext,
  buildTemplateFormulaFeeItems,
  BUILTIN_PROJECT_GROUPS,
  clearTemplateDraftFromStorage,
  formatAmount,
  formatTemplateNumberInputValue,
  getAreaTierStartArea,
  getCombinedAreaTierStartArea,
  getCombinedAreaTierTotalPrice,
  getComprehensiveFeeMethodPatch,
  getPackageTierLabel,
  getPackageTierStartArea,
  getPricingModeLabel,
  getProjectGroupAddText,
  getProjectGroupEmptyText,
  getProjectGroupName,
  getSpaceAutoSaveText,
  getSpaceConfigModeCopy,
  getSpaceProjectGroups,
  getTemplateAutoSavePayload,
  getTemplateFeeFormulaExamples,
  getTemplateFeeFormulaPlaceholder,
  getTemplateFeeRulePreview,
  getTemplateProjectGroups,
  getTemplateStatusBadgeClass,
  getTemplateStatusLabel,
  hasTemplateDraftContent,
  initialTemplates,
  isBuiltinProjectGroup,
  loadQuotaLibraryItems,
  loadTemplateDraftFromStorage,
  loadTemplatesFromStorage,
  makeCombinedAreaPricingTier,
  makeComprehensiveFeeItem,
  makeCustomQuotaDraft,
  makeDefaultConstructionTemplateConfig,
  makeDefaultQuoteConfig,
  makeEmptyTemplate,
  makePackagePricingTier,
  makeQuotaItemFromLibrary,
  makeSpace,
  makeSpaceCopy,
  makeSpaceQuotaItem,
  normalizeAreaPricingTiers,
  normalizeCombinedAreaPricingTiers,
  normalizeComprehensiveFees,
  normalizeConstructionTemplateOption,
  normalizePackagePricingTiers,
  normalizeQuotaScope,
  normalizeTemplate,
  normalizeTemplateProjectGroups,
  pricingModeOptions,
  remapTemplateFeeReferences,
  sanitizeTemplateNumberInputText,
  toAmount,
  toTemplateNumberInputAmount,
  todayText,
  uniqueProjectGroupIds,
  withSpaceProjectGroup,
} from "./quota-templates-shared";

import type {
  CombinedAreaPricingTier,
  ConstructionTemplateOption,
  CustomQuotaDraft,
  DragOverFeeState,
  DragOverProjectGroupState,
  DragOverQuotaState,
  DragOverSpaceState,
  ItemDropPosition,
  PackagePricingTier,
  PointerFeeDragState,
  PointerProjectGroupDragState,
  PointerQuotaDragState,
  PricingMode,
  QuotaLibraryItem,
  QuotaPickerTarget,
  QuotaTemplate,
  QuoteConfig,
  SpaceAutoSaveStatus,
  TemplateComprehensiveFee,
  TemplateEditMode,
  TemplateSpace,
  TemplateSpaceQuota,
  TemplateSpaceQuotaScope,
  TemplateStatus,
} from "./quota-templates-shared";
export default function QuotaTemplatesPage() {
  const { user } = useAuth();
  const currentCreatorName = user?.name?.trim() || DEFAULT_TEMPLATE_CREATOR;
  const [templates, setTemplates] = useState<QuotaTemplate[]>(initialTemplates);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [pricingModeFilter, setPricingModeFilter] = useState<PricingMode | "">("");
  const [selectedId, setSelectedId] = useState(templates[0]?.id || "");
  const [editingTemplate, setEditingTemplate] = useState<QuotaTemplate | null>(null);
  const [editingMode, setEditingMode] = useState<TemplateEditMode>("edit");
  const [activeSpaceId, setActiveSpaceId] = useState("");
  const [activeQuotaScope, setActiveQuotaScope] = useState<TemplateSpaceQuotaScope>("foundation");
  const [quotaLibraryItems, setQuotaLibraryItems] = useState<QuotaLibraryItem[]>([]);
  const [constructionTemplateOptions, setConstructionTemplateOptions] = useState<ConstructionTemplateOption[]>([]);
  const [constructionTemplateLoading, setConstructionTemplateLoading] = useState(false);
  const [constructionTemplateError, setConstructionTemplateError] = useState("");
  const [constructionTemplatePickerOpen, setConstructionTemplatePickerOpen] = useState(false);
  const [constructionTemplateSearch, setConstructionTemplateSearch] = useState("");
  const [quotaPickerTarget, setQuotaPickerTarget] = useState<QuotaPickerTarget>(null);
  const [quotaPickerSearch, setQuotaPickerSearch] = useState("");
  const [quotaPickerCategory, setQuotaPickerCategory] = useState("");
  const [pickedQuotaIds, setPickedQuotaIds] = useState<string[]>([]);
  const [showCustomQuotaForm, setShowCustomQuotaForm] = useState(false);
  const [customQuotaDraft, setCustomQuotaDraft] = useState<CustomQuotaDraft>(() => makeCustomQuotaDraft());
  const [draggingSpaceId, setDraggingSpaceId] = useState<string | null>(null);
  const [dragOverSpace, setDragOverSpace] = useState<DragOverSpaceState>(null);
  const [recentlyMovedSpaceId, setRecentlyMovedSpaceId] = useState<string | null>(null);
  const [draggingProjectGroupId, setDraggingProjectGroupId] = useState<string | null>(null);
  const [dragOverProjectGroup, setDragOverProjectGroup] = useState<DragOverProjectGroupState>(null);
  const [recentlyMovedProjectGroupId, setRecentlyMovedProjectGroupId] = useState<string | null>(null);
  const [draggingQuotaId, setDraggingQuotaId] = useState<string | null>(null);
  const [dragOverQuota, setDragOverQuota] = useState<DragOverQuotaState>(null);
  const [recentlyMovedQuotaId, setRecentlyMovedQuotaId] = useState<string | null>(null);
  const [draggingFeeId, setDraggingFeeId] = useState<string | null>(null);
  const [dragOverFee, setDragOverFee] = useState<DragOverFeeState>(null);
  const [recentlyMovedFeeId, setRecentlyMovedFeeId] = useState<string | null>(null);
  const [spaceAutoSaveStatus, setSpaceAutoSaveStatus] = useState<SpaceAutoSaveStatus>("idle");
  const [numberInputDrafts, setNumberInputDrafts] = useState<Record<string, string>>({});
  const templatesRef = useRef<QuotaTemplate[]>(initialTemplates);
  const pointerSpaceDragRef = useRef<{ sourceId: string; startX: number; startY: number; moved: boolean; targetId: string | null; position: ItemDropPosition } | null>(null);
  const pointerProjectGroupDragRef = useRef<PointerProjectGroupDragState>(null);
  const pointerQuotaDragRef = useRef<PointerQuotaDragState>(null);
  const pointerFeeDragRef = useRef<PointerFeeDragState>(null);
  const movedSpaceTimerRef = useRef<number | null>(null);
  const movedProjectGroupTimerRef = useRef<number | null>(null);
  const movedQuotaTimerRef = useRef<number | null>(null);
  const movedFeeTimerRef = useRef<number | null>(null);
  const spaceAutoSaveTimerRef = useRef<number | null>(null);
  const spaceAutoSaveRunRef = useRef(0);
  const lastSpaceAutoSavePayloadRef = useRef("");

  const saveTemplatesToServer = useCallback((nextTemplates: QuotaTemplate[]) => {
    fetch("/api/quota/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templates: nextTemplates }),
    }).catch(() => {
      // 本地缓存保底，避免网络瞬断时编辑内容丢失。
    });
  }, []);

  const loadConstructionTemplateOptions = useCallback(async () => {
    setConstructionTemplateLoading(true);
    setConstructionTemplateError("");
    try {
      const response = await fetch("/api/quota/construction-templates");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "读取施工模板失败");
      const items = Array.isArray(data?.items)
        ? data.items.map(normalizeConstructionTemplateOption).filter(Boolean) as ConstructionTemplateOption[]
        : [];
      setConstructionTemplateOptions(items);
    } catch (error: any) {
      setConstructionTemplateOptions([]);
      setConstructionTemplateError(error?.message || "读取施工模板失败");
    } finally {
      setConstructionTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      const localTemplates = loadTemplatesFromStorage();
      try {
        const response = await fetch("/api/quota/templates", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || "读取预算模板失败");
        const serverTemplates = Array.isArray(data?.templates)
          ? data.templates.map(normalizeTemplate).filter(Boolean) as QuotaTemplate[]
          : [];
        const loadedTemplates = serverTemplates.length > 0 ? serverTemplates : localTemplates;
        if (cancelled) return;
        setTemplates(loadedTemplates);
        setSelectedId(loadedTemplates[0]?.id || "");
        setQuotaLibraryItems(loadQuotaLibraryItems());
        setTemplatesLoaded(true);
        if (serverTemplates.length === 0 && localTemplates.length > 0) {
          saveTemplatesToServer(localTemplates);
        }
      } catch {
        if (cancelled) return;
        setTemplates(localTemplates);
        setSelectedId(localTemplates[0]?.id || "");
        setQuotaLibraryItems(loadQuotaLibraryItems());
        setTemplatesLoaded(true);
      }
    };
    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [saveTemplatesToServer]);

  useEffect(() => {
    loadConstructionTemplateOptions();
  }, [loadConstructionTemplateOptions, user?.id]);

  useEffect(() => {
    if (!templatesLoaded) return;
    window.localStorage.setItem(QUOTA_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    saveTemplatesToServer(templates);
  }, [saveTemplatesToServer, templates, templatesLoaded]);

  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

  useEffect(() => {
    setNumberInputDrafts({});
  }, [editingTemplate?.id]);

  const visibleTemplates = templates;
  const filteredTemplates = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return visibleTemplates.filter((template) => {
      const applicabilityTags = getQuotaTemplateApplicabilityTags(template);
      const matchesKeyword = !keyword || [
        template.name,
        template.remark,
        template.createdByName,
        getTemplateStatusLabel(template.status),
        getPricingModeLabel(template.quoteConfig.mode),
        ...applicabilityTags,
      ].some((value) => value.toLowerCase().includes(keyword));
      const matchesPricingMode = !pricingModeFilter || template.quoteConfig.mode === pricingModeFilter;
      return matchesKeyword && matchesPricingMode;
    });
  }, [pricingModeFilter, search, visibleTemplates]);

  const pagination = useDataPagination(filteredTemplates, [search, pricingModeFilter].join("|"));
  const selectedTemplate = visibleTemplates.find((template) => template.id === selectedId) || filteredTemplates[0] || visibleTemplates[0];
  const activeSpace = editingTemplate?.spaces.find((space) => space.id === activeSpaceId) || editingTemplate?.spaces[0] || null;
  const quotaCategoryOptions = useMemo(() => {
    return Array.from(new Set(quotaLibraryItems.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [quotaLibraryItems]);
  const filteredQuotaLibraryItems = useMemo(() => {
    const keyword = quotaPickerSearch.trim().toLowerCase();
    return quotaLibraryItems.filter((item) => {
      const matchesCategory = !quotaPickerCategory || item.category === quotaPickerCategory;
      const matchesKeyword = !keyword || [item.code, item.category, item.name, item.constructionDescription, item.unit, formatAmount(item.laborPrice), formatAmount(item.materialPrice), formatAmount(item.totalPrice)].some((value) => value.toLowerCase().includes(keyword));
      return matchesCategory && matchesKeyword;
    });
  }, [quotaLibraryItems, quotaPickerCategory, quotaPickerSearch]);
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
  const currentConstructionTemplateConfig = editingTemplate
    ? makeDefaultConstructionTemplateConfig(editingTemplate.constructionTemplateConfig)
    : makeDefaultConstructionTemplateConfig();
  const matchedConstructionTemplateOption = constructionTemplateOptions.find((template) => (
    (currentConstructionTemplateConfig.id && template.id === currentConstructionTemplateConfig.id)
    || (!currentConstructionTemplateConfig.id && currentConstructionTemplateConfig.name && template.name === currentConstructionTemplateConfig.name)
  ));
  const selectedConstructionTemplateConfig = matchedConstructionTemplateOption || currentConstructionTemplateConfig;
  const visibleQuotaLibraryItems = filteredQuotaLibraryItems.slice(0, 200);
  const pickedQuotaIdSet = useMemo(() => new Set(pickedQuotaIds), [pickedQuotaIds]);
  const pickerIsMultiSelect = Boolean(quotaPickerTarget && !quotaPickerTarget.quotaItemId);
  const visiblePickerIds = visibleQuotaLibraryItems.map((item) => item.id);
  const isVisiblePickerAllSelected = pickerIsMultiSelect && visiblePickerIds.length > 0 && visiblePickerIds.every((id) => pickedQuotaIdSet.has(id));
  const spaceAutoSaveText = getSpaceAutoSaveText(spaceAutoSaveStatus, editingMode);
  const quoteRemarkShouldFill = editingTemplate?.quoteConfig.mode === "list"
    || editingTemplate?.quoteConfig.mode === "package"
    || editingTemplate?.quoteConfig.mode === "area"
    || editingTemplate?.quoteConfig.mode === "foundation_material_area";
  const spaceConfigCopy = getSpaceConfigModeCopy(editingTemplate?.quoteConfig.mode || "package");
  const templateProjectGroups = getTemplateProjectGroups(editingTemplate);
  const activeSpaceProjectGroups = getSpaceProjectGroups(activeSpace, templateProjectGroups);
  const templateFeeFormulaExamples = getTemplateFeeFormulaExamples(templateProjectGroups);
  const templateFeeFormulaExampleText = `${templateFeeFormulaExamples.join("、")}、A+B、(直接费+A)`;
  const templateFeeFormulaPlaceholder = getTemplateFeeFormulaPlaceholder(templateProjectGroups);
  const templateFeeFormulaContext = buildTemplateFeeFormulaContext(templateProjectGroups);
  const templateFormulaFeeItems = buildTemplateFormulaFeeItems(editingTemplate?.comprehensiveFees || []);
  const templateFeeBaseErrors = (editingTemplate?.comprehensiveFees || []).map((fee, feeIndex) => (
    normalizeFeeCalcMethod(fee.fee_calc_method) === "fixed"
      ? ""
      : getFeeCalcBaseError(fee.fee_calc_base, 0, 0, {}, templateFeeFormulaContext, templateFormulaFeeItems, feeIndex)
  ));
  const getTemplateNumberInputProps = (fieldKey: string, value: number, onValueChange: (value: number) => void) => {
    const currentValue = numberInputDrafts[fieldKey] ?? formatTemplateNumberInputValue(value);
    return {
      inputMode: "decimal" as const,
      value: currentValue,
      onFocus: () => {
        if (toTemplateNumberInputAmount(currentValue) !== 0) return;
        setNumberInputDrafts((current) => ({ ...current, [fieldKey]: "" }));
      },
      onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
        const nextValue = sanitizeTemplateNumberInputText(event.target.value);
        setNumberInputDrafts((current) => ({ ...current, [fieldKey]: nextValue }));
        onValueChange(toTemplateNumberInputAmount(nextValue));
      },
      onBlur: () => {
        setNumberInputDrafts((current) => {
          if (!(fieldKey in current)) return current;
          const next = { ...current };
          delete next[fieldKey];
          return next;
        });
      },
    };
  };

  const resetCustomQuotaDraft = (hideForm = true) => {
    setCustomQuotaDraft(makeCustomQuotaDraft());
    if (hideForm) setShowCustomQuotaForm(false);
    setNumberInputDrafts((current) => {
      const next = { ...current };
      CUSTOM_QUOTA_NUMBER_INPUT_KEYS.forEach((key) => delete next[key]);
      return next;
    });
  };

  const persistTemplateAutoSave = useCallback((template: QuotaTemplate, mode: TemplateEditMode, updateState = true) => {
    const nextUpdatedAt = todayText();
    if (mode === "edit") {
      const nextTemplates = templatesRef.current.map((item) => item.id === template.id ? {
        ...item,
        projectGroups: template.projectGroups,
        comprehensiveFees: template.comprehensiveFees,
        appendixNote: template.appendixNote,
        spaces: template.spaces,
        updatedAt: nextUpdatedAt,
      } : item);
      templatesRef.current = nextTemplates;
      if (updateState) {
        setTemplates(nextTemplates);
      } else if (typeof window !== "undefined") {
        window.localStorage.setItem(QUOTA_TEMPLATE_STORAGE_KEY, JSON.stringify(nextTemplates));
      }
      return;
    }

    if (typeof window === "undefined") return;
    if (hasTemplateDraftContent(template)) {
      window.localStorage.setItem(QUOTA_TEMPLATE_DRAFT_STORAGE_KEY, JSON.stringify({ ...template, updatedAt: nextUpdatedAt }));
    } else {
      clearTemplateDraftFromStorage();
    }
  }, []);

  const openCreateTemplate = () => {
    const draftTemplate = loadTemplateDraftFromStorage();
    const template = draftTemplate
      ? { ...draftTemplate, createdByName: draftTemplate.createdByName || currentCreatorName, autoScope: null }
      : { ...makeEmptyTemplate(), createdByName: currentCreatorName, autoScope: null };
    setEditingMode("create");
    setEditingTemplate(template);
    setActiveSpaceId(template.spaces[0]?.id || "");
    setActiveQuotaScope("foundation");
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
    setSelectedId(template.id);
    lastSpaceAutoSavePayloadRef.current = getTemplateAutoSavePayload(template, "create");
    setSpaceAutoSaveStatus(template.spaces.length > 0 || hasTemplateDraftContent(template) ? "draft" : "idle");
  };

  const openEditTemplate = (template: QuotaTemplate) => {
    setEditingMode("edit");
    setEditingTemplate(template);
    setActiveSpaceId(template.spaces[0]?.id || "");
    setActiveQuotaScope("foundation");
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
    setSelectedId(template.id);
    lastSpaceAutoSavePayloadRef.current = getTemplateAutoSavePayload(template, "edit");
    setSpaceAutoSaveStatus("idle");
  };

  const buildCopiedTemplate = (template: QuotaTemplate, name: string): QuotaTemplate => {
    const copySeed = Date.now();
    return {
      ...template,
      id: `${template.id}-copy-${copySeed}`,
      name,
      status: "enabled",
      createdByName: currentCreatorName,
      autoScope: null,
      comprehensiveFees: template.comprehensiveFees.map((fee, feeIndex) => ({ ...fee, id: `fee-copy-${copySeed}-${feeIndex}` })),
      spaces: template.spaces.map((space, spaceIndex) => ({
        ...space,
        id: `space-copy-${copySeed}-${spaceIndex}`,
        quotaItems: space.quotaItems.map((item, itemIndex) => ({ ...item, id: `space-quota-copy-${copySeed}-${spaceIndex}-${itemIndex}` })),
      })),
      updatedAt: todayText(),
    };
  };

  const handleCopyTemplate = (template: QuotaTemplate) => {
    const copyTemplate = buildCopiedTemplate(template, `${template.name} 副本`);
    setTemplates((current) => [copyTemplate, ...current]);
    setSelectedId(copyTemplate.id);
  };

  const toggleTemplateStatus = (template: QuotaTemplate) => {
    const nextStatus: TemplateStatus = template.status === "disabled" ? "enabled" : "disabled";
    const nextUpdatedAt = todayText();
    setTemplates((current) => current.map((currentTemplate) => currentTemplate.id === template.id
      ? { ...currentTemplate, status: nextStatus, updatedAt: nextUpdatedAt }
      : currentTemplate
    ));
    if (editingTemplate?.id === template.id) {
      setEditingTemplate({ ...editingTemplate, status: nextStatus, updatedAt: nextUpdatedAt });
    }
  };

  const handleDeleteTemplate = (template: QuotaTemplate) => {
    if (!window.confirm(`确认删除模板“${template.name}”吗？`)) return;
    setTemplates((current) => current.filter((currentTemplate) => currentTemplate.id !== template.id));
    if (selectedId === template.id) setSelectedId("");
    if (editingTemplate?.id === template.id) {
      setEditingTemplate(null);
      setActiveSpaceId("");
      setQuotaPickerTarget(null);
      setPickedQuotaIds([]);
      setConstructionTemplatePickerOpen(false);
      setConstructionTemplateSearch("");
    }
  };

  const selectConstructionTemplate = (template: ConstructionTemplateOption) => {
    setEditingTemplate((current) => current ? {
      ...current,
      constructionTemplateConfig: makeDefaultConstructionTemplateConfig(template),
    } : current);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
  };

  const clearConstructionTemplate = () => {
    setEditingTemplate((current) => current ? {
      ...current,
      constructionTemplateConfig: makeDefaultConstructionTemplateConfig(),
    } : current);
    setConstructionTemplateSearch("");
  };

  const updateQuoteConfig = (patch: Partial<QuoteConfig>) => {
    setEditingTemplate((current) => current ? {
      ...current,
      quoteConfig: makeDefaultQuoteConfig({ ...current.quoteConfig, ...patch }),
    } : current);
  };

  const updatePackageTier = (tierId: string, patch: Partial<PackagePricingTier>) => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const packageTiers = current.quoteConfig.packageTiers.map((tier, tierIndex) => {
        if (tier.id !== tierId) return tier;
        const nextTier = {
          ...tier,
          ...patch,
          minArea: patch.minArea !== undefined ? toAmount(patch.minArea) : tier.minArea,
          maxArea: patch.maxArea !== undefined ? toAmount(patch.maxArea) : tier.maxArea,
          unitPrice: patch.unitPrice !== undefined ? toAmount(patch.unitPrice) : tier.unitPrice,
        };
        if (tierIndex === 0) {
          return { ...nextTier, minArea: toAmount(current.quoteConfig.includedArea) };
        }
        return nextTier;
      });
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          packageTiers,
          extraAreaPrice: packageTiers[0]?.unitPrice ?? current.quoteConfig.extraAreaPrice,
        }),
      };
    });
  };

  const addPackageTier = () => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const tiers = current.quoteConfig.packageTiers;
      const previousTier = tiers[tiers.length - 1];
      const startArea = previousTier ? toAmount(previousTier.maxArea) : toAmount(current.quoteConfig.includedArea);
      const nextTier = makePackagePricingTier({
        minArea: startArea,
        maxArea: startArea,
        unitPrice: previousTier ? previousTier.unitPrice : toAmount(current.quoteConfig.extraAreaPrice),
      });
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          packageTiers: [...tiers, nextTier],
        }),
      };
    });
  };

  const removePackageTier = (tierId: string) => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const nextTiers = current.quoteConfig.packageTiers.filter((tier) => tier.id !== tierId);
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          packageTiers: nextTiers.length > 0 ? nextTiers : normalizePackagePricingTiers([], current.quoteConfig),
          extraAreaPrice: nextTiers[0]?.unitPrice ?? current.quoteConfig.extraAreaPrice,
        }),
      };
    });
  };

  const updateAreaTier = (tierId: string, patch: Partial<PackagePricingTier>) => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const areaTiers = current.quoteConfig.areaTiers.map((tier, tierIndex) => {
        if (tier.id !== tierId) return tier;
        const nextTier = {
          ...tier,
          ...patch,
          minArea: patch.minArea !== undefined ? toAmount(patch.minArea) : tier.minArea,
          maxArea: patch.maxArea !== undefined ? toAmount(patch.maxArea) : tier.maxArea,
          unitPrice: patch.unitPrice !== undefined ? toAmount(patch.unitPrice) : tier.unitPrice,
        };
        if (tierIndex === 0) {
          return { ...nextTier, minArea: 0 };
        }
        return nextTier;
      });
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          areaTiers,
          areaUnitPrice: areaTiers[0]?.unitPrice ?? current.quoteConfig.areaUnitPrice,
        }),
      };
    });
  };

  const addAreaTier = () => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const tiers = current.quoteConfig.areaTiers;
      const previousTier = tiers[tiers.length - 1];
      const startArea = previousTier ? toAmount(previousTier.maxArea) : 0;
      const nextTier = makePackagePricingTier({
        minArea: startArea,
        maxArea: startArea,
        unitPrice: previousTier ? previousTier.unitPrice : toAmount(current.quoteConfig.areaUnitPrice),
      });
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          areaTiers: [...tiers, nextTier],
        }),
      };
    });
  };

  const removeAreaTier = (tierId: string) => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const nextTiers = current.quoteConfig.areaTiers.filter((tier) => tier.id !== tierId);
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          areaTiers: nextTiers.length > 0 ? nextTiers : normalizeAreaPricingTiers([], current.quoteConfig),
          areaUnitPrice: nextTiers[0]?.unitPrice ?? current.quoteConfig.areaUnitPrice,
        }),
      };
    });
  };

  const updateCombinedAreaTier = (tierId: string, patch: Partial<CombinedAreaPricingTier>) => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const combinedAreaTiers = current.quoteConfig.combinedAreaTiers.map((tier, tierIndex) => {
        if (tier.id !== tierId) return tier;
        const nextTier = {
          ...tier,
          ...patch,
          minArea: patch.minArea !== undefined ? toAmount(patch.minArea) : tier.minArea,
          maxArea: patch.maxArea !== undefined ? toAmount(patch.maxArea) : tier.maxArea,
          foundationUnitPrice: patch.foundationUnitPrice !== undefined ? toAmount(patch.foundationUnitPrice) : tier.foundationUnitPrice,
          materialUnitPrice: patch.materialUnitPrice !== undefined ? toAmount(patch.materialUnitPrice) : tier.materialUnitPrice,
        };
        if (tierIndex === 0) {
          return { ...nextTier, minArea: 0 };
        }
        return nextTier;
      });
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          combinedAreaTiers,
          foundationUnitPrice: combinedAreaTiers[0]?.foundationUnitPrice ?? current.quoteConfig.foundationUnitPrice,
          materialUnitPrice: combinedAreaTiers[0]?.materialUnitPrice ?? current.quoteConfig.materialUnitPrice,
        }),
      };
    });
  };

  const addCombinedAreaTier = () => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const tiers = current.quoteConfig.combinedAreaTiers;
      const previousTier = tiers[tiers.length - 1];
      const startArea = previousTier ? toAmount(previousTier.maxArea) : 0;
      const nextTier = makeCombinedAreaPricingTier({
        minArea: startArea,
        maxArea: startArea,
        foundationUnitPrice: previousTier ? previousTier.foundationUnitPrice : toAmount(current.quoteConfig.foundationUnitPrice),
        materialUnitPrice: previousTier ? previousTier.materialUnitPrice : toAmount(current.quoteConfig.materialUnitPrice),
      });
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          combinedAreaTiers: [...tiers, nextTier],
        }),
      };
    });
  };

  const removeCombinedAreaTier = (tierId: string) => {
    setEditingTemplate((current) => {
      if (!current) return current;
      const nextTiers = current.quoteConfig.combinedAreaTiers.filter((tier) => tier.id !== tierId);
      return {
        ...current,
        quoteConfig: makeDefaultQuoteConfig({
          ...current.quoteConfig,
          combinedAreaTiers: nextTiers.length > 0 ? nextTiers : normalizeCombinedAreaPricingTiers([], current.quoteConfig),
          foundationUnitPrice: nextTiers[0]?.foundationUnitPrice ?? current.quoteConfig.foundationUnitPrice,
          materialUnitPrice: nextTiers[0]?.materialUnitPrice ?? current.quoteConfig.materialUnitPrice,
        }),
      };
    });
  };

  const addComprehensiveFee = () => {
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: [
        ...current.comprehensiveFees,
        makeComprehensiveFeeItem({
          name: "",
          fee_calc_method: "percent",
          fee_calc_base: "直接费",
          fee_rate: 0,
        }),
      ],
    } : current);
  };

  const updateComprehensiveFee = (feeId: string, patch: Partial<TemplateComprehensiveFee>) => {
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: current.comprehensiveFees.map((fee) => {
        if (fee.id !== feeId) return fee;
        const nextFee = { ...fee, ...patch };
        const method = normalizeFeeCalcMethod(nextFee.fee_calc_method);
        return {
          ...nextFee,
          fee_calc_method: method,
          fee_calc_base: method === "fixed" ? "" : normalizeFeeCalcBase(nextFee.fee_calc_base),
          fee_rate: method === "percent" ? toAmount(nextFee.fee_rate) : 0,
          unit_price: method === "fixed" ? toAmount(nextFee.unit_price) : 0,
        };
      }),
    } : current);
  };

  const removeComprehensiveFee = (feeId: string) => {
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: current.comprehensiveFees.filter((fee) => fee.id !== feeId),
    } : current);
  };

  const addSpace = () => {
    const nextSpace = makeSpace(`空间${(editingTemplate?.spaces.length || 0) + 1}`);
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: [...current.spaces, nextSpace],
    } : current);
    setActiveSpaceId(nextSpace.id);
  };

  const copySpace = (spaceId: string) => {
    const source = editingTemplate?.spaces.find((space) => space.id === spaceId);
    if (!source || !editingTemplate) return;
    const nextSpace = makeSpaceCopy(source, editingTemplate.spaces);
    setEditingTemplate((current) => {
      if (!current) return current;
      const sourceIndex = current.spaces.findIndex((space) => space.id === spaceId);
      const nextSpaces = [...current.spaces];
      const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : nextSpaces.length;
      nextSpaces.splice(insertIndex, 0, nextSpace);
      return { ...current, spaces: nextSpaces };
    });
    setActiveSpaceId(nextSpace.id);
  };

  const addProjectGroup = (groupId: TemplateSpaceQuotaScope) => {
    if (!activeSpace) {
      window.alert("请先选择空间");
      return;
    }
    const currentGroups = getTemplateProjectGroups(editingTemplate);
    const fixedGroup = BUILTIN_PROJECT_GROUPS.find((group) => group.id === groupId);
    if (!fixedGroup) {
      window.alert("项目分组只能选择基装、产品、定制柜");
      return;
    }
    const currentSpaceGroups = getSpaceProjectGroups(activeSpace, currentGroups);
    if (currentSpaceGroups.some((group) => group.id === fixedGroup.id)) {
      window.alert("当前空间已存在该项目分组");
      return;
    }
    setEditingTemplate((current) => current ? {
      ...current,
      projectGroups: getTemplateProjectGroups(current).some((group) => group.id === fixedGroup.id)
        ? getTemplateProjectGroups(current)
        : [...getTemplateProjectGroups(current), fixedGroup],
      spaces: current.spaces.map((space) => space.id === activeSpace.id ? withSpaceProjectGroup(space, fixedGroup.id) : space),
    } : current);
    setActiveQuotaScope(fixedGroup.id);
  };

  const removeProjectGroup = (groupId: TemplateSpaceQuotaScope) => {
    if (!activeSpace) return;
    const groupName = getProjectGroupName(templateProjectGroups, groupId);
    const hasItems = activeSpace.quotaItems.some((item) => normalizeQuotaScope(item.quoteScope) === groupId);
    if (hasItems && !window.confirm(`删除当前空间的“${groupName}”会同时移除该分组下的项目，确认删除吗？`)) return;
    setEditingTemplate((current) => {
      if (!current) return current;
      const nextSpaces = current.spaces.map((space) => {
        if (space.id !== activeSpace.id) return space;
        return {
          ...space,
          projectGroupIds: uniqueProjectGroupIds((space.projectGroupIds || []).filter((id) => id !== groupId)),
          quotaItems: space.quotaItems.filter((item) => normalizeQuotaScope(item.quoteScope) !== groupId),
        };
      });
      const groupStillUsed = nextSpaces.some((space) => {
        const groupIds = uniqueProjectGroupIds([...(space.projectGroupIds || []), ...space.quotaItems.map((item) => normalizeQuotaScope(item.quoteScope))]);
        return groupIds.includes(groupId);
      });
      return {
        ...current,
        projectGroups: isBuiltinProjectGroup(groupId) || groupStillUsed
          ? getTemplateProjectGroups(current)
          : getTemplateProjectGroups(current).filter((group) => group.id !== groupId),
        spaces: nextSpaces,
      };
    });
    setActiveQuotaScope("");
  };

  const updateSpace = (spaceId: string, patch: Partial<TemplateSpace>) => {
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => space.id === spaceId ? { ...space, ...patch } : space),
    } : current);
  };

  const removeSpace = (spaceId: string) => {
    const remainingSpaces = editingTemplate?.spaces.filter((space) => space.id !== spaceId) || [];
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.filter((space) => space.id !== spaceId),
    } : current);
    setActiveSpaceId((current) => current === spaceId ? remainingSpaces[0]?.id || "" : current);
    if (quotaPickerTarget?.spaceId === spaceId) setQuotaPickerTarget(null);
  };

  const addQuotaToSpace = (spaceId: string, quoteScope: TemplateSpaceQuotaScope) => {
    setActiveSpaceId(spaceId);
    setActiveQuotaScope(quoteScope);
    setQuotaPickerTarget({ spaceId, quoteScope });
    setQuotaPickerSearch("");
    setQuotaPickerCategory("");
    setPickedQuotaIds([]);
    resetCustomQuotaDraft();
  };

  const updateSpaceQuota = (spaceId: string, quotaItemId: string, patch: Partial<TemplateSpaceQuota>) => {
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => space.id === spaceId ? {
        ...("quoteScope" in patch && patch.quoteScope ? withSpaceProjectGroup(space, normalizeQuotaScope(patch.quoteScope)) : space),
        quotaItems: space.quotaItems.map((item) => item.id === quotaItemId ? { ...item, ...patch } : item),
      } : space),
    } : current);
  };

  const removeSpaceQuota = (spaceId: string, quotaItemId: string) => {
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => space.id === spaceId ? {
        ...space,
        quotaItems: space.quotaItems.filter((item) => item.id !== quotaItemId),
      } : space),
    } : current);
  };

  const reorderSpace = useCallback((sourceId: string, targetId: string, position: ItemDropPosition) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setEditingTemplate((current) => {
      if (!current) return current;
      const sourceIndex = current.spaces.findIndex((space) => space.id === sourceId);
      const targetIndex = current.spaces.findIndex((space) => space.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const nextSpaces = [...current.spaces];
      const [movedSpace] = nextSpaces.splice(sourceIndex, 1);
      let insertIndex = targetIndex;
      if (sourceIndex < targetIndex) insertIndex -= 1;
      if (position === "after") insertIndex += 1;
      insertIndex = Math.max(0, Math.min(insertIndex, nextSpaces.length));
      nextSpaces.splice(insertIndex, 0, movedSpace);
      return { ...current, spaces: nextSpaces };
    });
    setActiveSpaceId(sourceId);
    setRecentlyMovedSpaceId(sourceId);
    if (movedSpaceTimerRef.current) window.clearTimeout(movedSpaceTimerRef.current);
    movedSpaceTimerRef.current = window.setTimeout(() => setRecentlyMovedSpaceId(null), 650);
  }, []);

  const reorderProjectGroup = useCallback((sourceId: string, targetId: string, position: ItemDropPosition) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setEditingTemplate((current) => {
      if (!current) return current;
      const space = current.spaces.find((item) => item.id === activeSpaceId) || current.spaces[0];
      if (!space) return current;
      const groups = getSpaceProjectGroups(space, getTemplateProjectGroups(current));
      const sourceIndex = groups.findIndex((group) => group.id === sourceId);
      const targetIndex = groups.findIndex((group) => group.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const nextGroups = [...groups];
      const [movedGroup] = nextGroups.splice(sourceIndex, 1);
      let insertIndex = targetIndex;
      if (sourceIndex < targetIndex) insertIndex -= 1;
      if (position === "after") insertIndex += 1;
      insertIndex = Math.max(0, Math.min(insertIndex, nextGroups.length));
      nextGroups.splice(insertIndex, 0, movedGroup);
      return {
        ...current,
        spaces: current.spaces.map((item) => item.id === space.id ? { ...item, projectGroupIds: nextGroups.map((group) => group.id) } : item),
      };
    });
    setActiveQuotaScope(sourceId);
    setRecentlyMovedProjectGroupId(sourceId);
    if (movedProjectGroupTimerRef.current) window.clearTimeout(movedProjectGroupTimerRef.current);
    movedProjectGroupTimerRef.current = window.setTimeout(() => setRecentlyMovedProjectGroupId(null), 650);
  }, [activeSpaceId]);

  const reorderSpaceQuota = useCallback((spaceId: string, sourceQuotaId: string, targetQuotaId: string, position: ItemDropPosition) => {
    if (!spaceId || !sourceQuotaId || !targetQuotaId || sourceQuotaId === targetQuotaId) return;
    setEditingTemplate((current) => {
      if (!current) return current;
      return {
        ...current,
        spaces: current.spaces.map((space) => {
          if (space.id !== spaceId) return space;
          const sourceIndex = space.quotaItems.findIndex((item) => item.id === sourceQuotaId);
          const targetIndex = space.quotaItems.findIndex((item) => item.id === targetQuotaId);
          if (sourceIndex < 0 || targetIndex < 0) return space;
          const nextItems = [...space.quotaItems];
          const [movedItem] = nextItems.splice(sourceIndex, 1);
          let insertIndex = targetIndex;
          if (sourceIndex < targetIndex) insertIndex -= 1;
          if (position === "after") insertIndex += 1;
          insertIndex = Math.max(0, Math.min(insertIndex, nextItems.length));
          nextItems.splice(insertIndex, 0, movedItem);
          return { ...space, quotaItems: nextItems };
        }),
      };
    });
    setActiveSpaceId(spaceId);
    setRecentlyMovedQuotaId(sourceQuotaId);
    if (movedQuotaTimerRef.current) window.clearTimeout(movedQuotaTimerRef.current);
    movedQuotaTimerRef.current = window.setTimeout(() => setRecentlyMovedQuotaId(null), 650);
  }, []);

  const reorderComprehensiveFee = useCallback((sourceFeeId: string, targetFeeId: string, position: ItemDropPosition) => {
    if (!sourceFeeId || !targetFeeId || sourceFeeId === targetFeeId) return;
    setEditingTemplate((current) => {
      if (!current) return current;
      const sourceIndex = current.comprehensiveFees.findIndex((fee) => fee.id === sourceFeeId);
      const targetIndex = current.comprehensiveFees.findIndex((fee) => fee.id === targetFeeId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const nextFees = [...current.comprehensiveFees];
      const [movedFee] = nextFees.splice(sourceIndex, 1);
      let insertIndex = targetIndex;
      if (sourceIndex < targetIndex) insertIndex -= 1;
      if (position === "after") insertIndex += 1;
      insertIndex = Math.max(0, Math.min(insertIndex, nextFees.length));
      nextFees.splice(insertIndex, 0, movedFee);
      return { ...current, comprehensiveFees: remapTemplateFeeReferences(current.comprehensiveFees, nextFees) };
    });
    setRecentlyMovedFeeId(sourceFeeId);
    if (movedFeeTimerRef.current) window.clearTimeout(movedFeeTimerRef.current);
    movedFeeTimerRef.current = window.setTimeout(() => setRecentlyMovedFeeId(null), 650);
  }, []);

  const startPointerSpaceDrag = (event: ReactPointerEvent<HTMLButtonElement>, spaceId: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    pointerSpaceDragRef.current = { sourceId: spaceId, startX: event.clientX, startY: event.clientY, moved: false, targetId: spaceId, position: "after" };
    setActiveSpaceId(spaceId);
    setDraggingSpaceId(null);
    setDragOverSpace(null);
  };

  const startPointerProjectGroupDrag = (event: ReactPointerEvent<HTMLButtonElement>, groupId: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    pointerProjectGroupDragRef.current = { sourceId: groupId, startX: event.clientX, startY: event.clientY, moved: false, targetId: groupId, position: "after" };
    setActiveQuotaScope(groupId);
    setDraggingProjectGroupId(null);
    setDragOverProjectGroup(null);
  };

  const startPointerQuotaDrag = (event: ReactPointerEvent<HTMLButtonElement>, spaceId: string, quotaItemId: string, quoteScope: TemplateSpaceQuotaScope) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    pointerQuotaDragRef.current = { spaceId, quotaItemId, quoteScope, startX: event.clientX, startY: event.clientY, moved: false, targetQuotaId: quotaItemId, position: "after" };
    setActiveSpaceId(spaceId);
    setDraggingQuotaId(null);
    setDragOverQuota(null);
  };

  const startPointerFeeDrag = (event: ReactPointerEvent<HTMLButtonElement>, feeId: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    pointerFeeDragRef.current = { feeId, startX: event.clientX, startY: event.clientY, moved: false, targetFeeId: feeId, position: "after" };
    setDraggingFeeId(null);
    setDragOverFee(null);
  };

  useEffect(() => () => {
    if (movedSpaceTimerRef.current) window.clearTimeout(movedSpaceTimerRef.current);
    if (movedProjectGroupTimerRef.current) window.clearTimeout(movedProjectGroupTimerRef.current);
    if (movedQuotaTimerRef.current) window.clearTimeout(movedQuotaTimerRef.current);
    if (movedFeeTimerRef.current) window.clearTimeout(movedFeeTimerRef.current);
  }, []);

  useEffect(() => {
    const getTargetSpace = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const tab = element?.closest<HTMLElement>("[data-template-space-tab]");
      const spaceId = tab?.dataset.spaceId;
      if (!tab || !spaceId) return null;
      const rect = tab.getBoundingClientRect();
      const position: ItemDropPosition = clientX < rect.left + rect.width / 2 ? "before" : "after";
      return { id: spaceId, position };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerSpaceDragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 6) {
        state.moved = true;
        setDraggingSpaceId(state.sourceId);
      }
      if (!state.moved) return;
      event.preventDefault();
      const target = getTargetSpace(event.clientX, event.clientY);
      if (!target || target.id === state.sourceId) {
        state.targetId = null;
        setDragOverSpace(null);
        return;
      }
      state.targetId = target.id;
      state.position = target.position;
      setDragOverSpace(target);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerSpaceDragRef.current;
      if (!state) return;
      pointerSpaceDragRef.current = null;
      if (state.moved) {
        const target = getTargetSpace(event.clientX, event.clientY);
        const targetId = target?.id ?? state.targetId;
        const position = target?.position ?? state.position;
        if (targetId) reorderSpace(state.sourceId, targetId, position);
      }
      setDraggingSpaceId(null);
      setDragOverSpace(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderSpace]);

  useEffect(() => {
    const getTargetProjectGroup = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const tab = element?.closest<HTMLElement>("[data-template-project-group-tab]");
      const groupId = tab?.dataset.projectGroupId;
      if (!tab || !groupId) return null;
      const rect = tab.getBoundingClientRect();
      const position: ItemDropPosition = clientX < rect.left + rect.width / 2 ? "before" : "after";
      return { id: groupId, position };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerProjectGroupDragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 6) {
        state.moved = true;
        setDraggingProjectGroupId(state.sourceId);
      }
      if (!state.moved) return;
      event.preventDefault();
      const target = getTargetProjectGroup(event.clientX, event.clientY);
      if (!target || target.id === state.sourceId) {
        state.targetId = null;
        setDragOverProjectGroup(null);
        return;
      }
      state.targetId = target.id;
      state.position = target.position;
      setDragOverProjectGroup(target);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerProjectGroupDragRef.current;
      if (!state) return;
      pointerProjectGroupDragRef.current = null;
      if (state.moved) {
        const target = getTargetProjectGroup(event.clientX, event.clientY);
        const targetId = target?.id ?? state.targetId;
        const position = target?.position ?? state.position;
        if (targetId) reorderProjectGroup(state.sourceId, targetId, position);
      }
      setDraggingProjectGroupId(null);
      setDragOverProjectGroup(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderProjectGroup]);

  useEffect(() => {
    const getTargetQuota = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const row = element?.closest<HTMLElement>("[data-template-quota-row]");
      const quotaId = row?.dataset.quotaId;
      const quoteScope = normalizeQuotaScope(row?.dataset.quotaScope);
      if (!row || !quotaId) return null;
      const rect = row.getBoundingClientRect();
      const position: ItemDropPosition = clientY < rect.top + rect.height / 2 ? "before" : "after";
      return { id: quotaId, position, quoteScope };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerQuotaDragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 4) {
        state.moved = true;
        setDraggingQuotaId(state.quotaItemId);
      }
      if (!state.moved) return;
      event.preventDefault();
      const target = getTargetQuota(event.clientX, event.clientY);
      if (!target || target.id === state.quotaItemId || target.quoteScope !== state.quoteScope) {
        state.targetQuotaId = null;
        setDragOverQuota(null);
        return;
      }
      state.targetQuotaId = target.id;
      state.position = target.position;
      setDragOverQuota(target);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerQuotaDragRef.current;
      if (!state) return;
      pointerQuotaDragRef.current = null;
      if (state.moved) {
        const target = getTargetQuota(event.clientX, event.clientY);
        const targetQuotaId = target?.id ?? state.targetQuotaId;
        const position = target?.position ?? state.position;
        if (targetQuotaId && targetQuotaId !== state.quotaItemId && (target?.quoteScope ?? state.quoteScope) === state.quoteScope) {
          reorderSpaceQuota(state.spaceId, state.quotaItemId, targetQuotaId, position);
        }
      }
      setDraggingQuotaId(null);
      setDragOverQuota(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderSpaceQuota]);

  useEffect(() => {
    const getTargetFee = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const row = element?.closest<HTMLElement>("[data-template-fee-row]");
      const feeId = row?.dataset.feeId;
      if (!row || !feeId) return null;
      const rect = row.getBoundingClientRect();
      const position: ItemDropPosition = clientY < rect.top + rect.height / 2 ? "before" : "after";
      return { id: feeId, position };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerFeeDragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 4) {
        state.moved = true;
        setDraggingFeeId(state.feeId);
      }
      if (!state.moved) return;
      event.preventDefault();
      const target = getTargetFee(event.clientX, event.clientY);
      if (!target || target.id === state.feeId) {
        state.targetFeeId = null;
        setDragOverFee(null);
        return;
      }
      state.targetFeeId = target.id;
      state.position = target.position;
      setDragOverFee(target);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerFeeDragRef.current;
      if (!state) return;
      pointerFeeDragRef.current = null;
      if (state.moved) {
        const target = getTargetFee(event.clientX, event.clientY);
        const targetFeeId = target?.id ?? state.targetFeeId;
        const position = target?.position ?? state.position;
        if (targetFeeId && targetFeeId !== state.feeId) {
          reorderComprehensiveFee(state.feeId, targetFeeId, position);
        }
      }
      setDraggingFeeId(null);
      setDragOverFee(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderComprehensiveFee]);

  const selectQuotaForSpace = (spaceId: string, quotaItemId: string, quotaId: string, quoteScope?: TemplateSpaceQuotaScope) => {
    const quota = quotaLibraryItems.find((item) => item.id === quotaId);
    updateSpaceQuota(spaceId, quotaItemId, quota ? {
      quotaId: quota.id,
      code: quota.code,
      category: quota.category,
      name: quota.name,
      constructionDescription: quota.constructionDescription,
      unit: quota.unit,
      quoteScope: quoteScope || normalizeQuotaScope("", `${quota.category}${quota.name}${quota.constructionDescription}`),
      laborPrice: quota.laborPrice,
      materialPrice: quota.materialPrice,
      totalPrice: quota.totalPrice,
      isSpecialPrice: quota.isSpecialPrice,
    } : { quotaId, code: "", category: "", name: "", constructionDescription: "", unit: "", quoteScope: quoteScope || "foundation", laborPrice: 0, materialPrice: 0, totalPrice: 0, isSpecialPrice: false });
  };

  const togglePickedQuota = (quotaId: string) => {
    setPickedQuotaIds((current) => current.includes(quotaId) ? current.filter((id) => id !== quotaId) : [...current, quotaId]);
  };

  const toggleVisiblePickedQuotas = () => {
    if (!pickerIsMultiSelect) return;
    setPickedQuotaIds((current) => {
      const currentSet = new Set(current);
      if (visiblePickerIds.length > 0 && visiblePickerIds.every((id) => currentSet.has(id))) {
        return current.filter((id) => !visiblePickerIds.includes(id));
      }
      visiblePickerIds.forEach((id) => currentSet.add(id));
      return Array.from(currentSet);
    });
  };

  const addPickedQuotasForTarget = () => {
    if (!quotaPickerTarget || !pickerIsMultiSelect || pickedQuotaIds.length === 0) return;
    const pickedSet = new Set(pickedQuotaIds);
    const pickedQuotas = quotaLibraryItems.filter((quota) => pickedSet.has(quota.id));
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => {
        if (space.id !== quotaPickerTarget.spaceId) return space;
        const existingQuotaIds = new Set(
          space.quotaItems
            .filter((item) => normalizeQuotaScope(item.quoteScope) === quotaPickerTarget.quoteScope)
            .map((item) => item.quotaId)
            .filter(Boolean),
        );
        const nextItems = pickedQuotas
          .filter((quota) => !existingQuotaIds.has(quota.id))
          .map((quota) => makeQuotaItemFromLibrary(quota, quotaPickerTarget.quoteScope));
        return { ...withSpaceProjectGroup(space, quotaPickerTarget.quoteScope), quotaItems: [...space.quotaItems, ...nextItems] };
      }),
    } : current);
    setActiveSpaceId(quotaPickerTarget.spaceId);
    setPickedQuotaIds([]);
    setQuotaPickerTarget(null);
  };

  const addCustomQuotaForTarget = () => {
    if (!quotaPickerTarget) return;
    const name = customQuotaDraft.name.trim();
    if (!name) {
      window.alert("请填写项目名称");
      return;
    }
    const laborPrice = toAmount(customQuotaDraft.laborPrice);
    const materialPrice = toAmount(customQuotaDraft.materialPrice);
    const typedTotalPrice = toAmount(customQuotaDraft.totalPrice);
    const customItem = makeSpaceQuotaItem({
      quotaId: "",
      code: "",
      category: getProjectGroupName(templateProjectGroups, quotaPickerTarget.quoteScope),
      name,
      constructionDescription: customQuotaDraft.constructionDescription.trim(),
      unit: customQuotaDraft.unit.trim(),
      quoteScope: quotaPickerTarget.quoteScope,
      laborPrice,
      materialPrice,
      totalPrice: typedTotalPrice > 0 ? typedTotalPrice : laborPrice + materialPrice,
      isSpecialPrice: customQuotaDraft.isSpecialPrice,
    });

    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => {
        if (space.id !== quotaPickerTarget.spaceId) return space;
        if (quotaPickerTarget.quotaItemId) {
          return {
            ...withSpaceProjectGroup(space, quotaPickerTarget.quoteScope),
            quotaItems: space.quotaItems.map((item) => item.id === quotaPickerTarget.quotaItemId ? { ...customItem, id: item.id } : item),
          };
        }
        return { ...withSpaceProjectGroup(space, quotaPickerTarget.quoteScope), quotaItems: [...space.quotaItems, customItem] };
      }),
    } : current);

    setActiveSpaceId(quotaPickerTarget.spaceId);
    setActiveQuotaScope(quotaPickerTarget.quoteScope);
    setPickedQuotaIds([]);
    setQuotaPickerTarget(null);
    resetCustomQuotaDraft();
  };

  const chooseQuotaForTarget = (quota: QuotaLibraryItem) => {
    if (!quotaPickerTarget) return;
    if (quotaPickerTarget.quotaItemId) {
      selectQuotaForSpace(quotaPickerTarget.spaceId, quotaPickerTarget.quotaItemId, quota.id, quotaPickerTarget.quoteScope);
    } else {
      togglePickedQuota(quota.id);
      return;
    }
    setQuotaPickerTarget(null);
  };

  const flushTemplateAutoSave = useCallback((updateState = true) => {
    if (!templatesLoaded || !editingTemplate) return;
    const payload = getTemplateAutoSavePayload(editingTemplate, editingMode);
    if (!payload || payload === lastSpaceAutoSavePayloadRef.current) return;
    try {
      persistTemplateAutoSave(editingTemplate, editingMode, updateState);
      lastSpaceAutoSavePayloadRef.current = payload;
      if (updateState) setSpaceAutoSaveStatus(editingMode === "edit" ? "saved" : "draft");
    } catch {
      if (updateState) setSpaceAutoSaveStatus("error");
    }
  }, [editingMode, editingTemplate, persistTemplateAutoSave, templatesLoaded]);

  useEffect(() => {
    if (!templatesLoaded || !editingTemplate) return;
    const payload = getTemplateAutoSavePayload(editingTemplate, editingMode);
    if (!payload || payload === lastSpaceAutoSavePayloadRef.current) return;

    setSpaceAutoSaveStatus("pending");
    if (spaceAutoSaveTimerRef.current) window.clearTimeout(spaceAutoSaveTimerRef.current);

    spaceAutoSaveTimerRef.current = window.setTimeout(() => {
      const runId = spaceAutoSaveRunRef.current + 1;
      spaceAutoSaveRunRef.current = runId;
      setSpaceAutoSaveStatus("saving");
      try {
        persistTemplateAutoSave(editingTemplate, editingMode);
        if (spaceAutoSaveRunRef.current !== runId) return;
        lastSpaceAutoSavePayloadRef.current = payload;
        setSpaceAutoSaveStatus(editingMode === "edit" ? "saved" : "draft");
      } catch {
        if (spaceAutoSaveRunRef.current !== runId) return;
        setSpaceAutoSaveStatus("error");
      }
    }, 700);

    return () => {
      if (spaceAutoSaveTimerRef.current) window.clearTimeout(spaceAutoSaveTimerRef.current);
    };
  }, [editingMode, editingTemplate, persistTemplateAutoSave, templatesLoaded]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushTemplateAutoSave(false);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushTemplateAutoSave]);

  const closeEditingTemplate = () => {
    if (spaceAutoSaveTimerRef.current) window.clearTimeout(spaceAutoSaveTimerRef.current);
    flushTemplateAutoSave();
    setEditingTemplate(null);
    setActiveSpaceId("");
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
    setSpaceAutoSaveStatus("idle");
  };

  const saveEditingTemplate = () => {
    if (!editingTemplate) return;
    if (!editingTemplate.name.trim()) {
      window.alert("请填写模板名称");
      return;
    }
    const nextConstructionTemplateConfig = makeDefaultConstructionTemplateConfig({
      ...editingTemplate.constructionTemplateConfig,
      name: editingTemplate.constructionTemplateConfig.name.trim(),
      description: editingTemplate.constructionTemplateConfig.description.trim(),
      decorationType: editingTemplate.constructionTemplateConfig.decorationType.trim(),
      durationText: editingTemplate.constructionTemplateConfig.durationText.trim(),
      remark: "",
    });
    const nextTemplate: QuotaTemplate = {
      ...editingTemplate,
      name: editingTemplate.name.trim(),
      remark: editingTemplate.remark.trim(),
      autoScope: null,
      constructionTemplateConfig: nextConstructionTemplateConfig.name ? nextConstructionTemplateConfig : makeDefaultConstructionTemplateConfig(),
      quoteConfig: {
        ...editingTemplate.quoteConfig,
        packageAmount: toAmount(editingTemplate.quoteConfig.packageAmount),
        includedArea: toAmount(editingTemplate.quoteConfig.includedArea),
        extraAreaPrice: toAmount(editingTemplate.quoteConfig.extraAreaPrice),
        packageTiers: normalizePackagePricingTiers(editingTemplate.quoteConfig.packageTiers, editingTemplate.quoteConfig)
          .map((tier, index) => ({
            ...tier,
            minArea: getPackageTierStartArea(editingTemplate.quoteConfig, index),
            maxArea: toAmount(tier.maxArea),
            unitPrice: toAmount(tier.unitPrice),
          })),
        areaTiers: normalizeAreaPricingTiers(editingTemplate.quoteConfig.areaTiers, editingTemplate.quoteConfig)
          .map((tier, index) => ({
            ...tier,
            minArea: getAreaTierStartArea(editingTemplate.quoteConfig, index),
            maxArea: toAmount(tier.maxArea),
            unitPrice: toAmount(tier.unitPrice),
          })),
        areaUnitPrice: toAmount(editingTemplate.quoteConfig.areaUnitPrice),
        foundationUnitPrice: toAmount(editingTemplate.quoteConfig.foundationUnitPrice),
        materialUnitPrice: toAmount(editingTemplate.quoteConfig.materialUnitPrice),
        combinedAreaTiers: normalizeCombinedAreaPricingTiers(editingTemplate.quoteConfig.combinedAreaTiers, editingTemplate.quoteConfig)
          .map((tier, index) => ({
            ...tier,
            minArea: getCombinedAreaTierStartArea(editingTemplate.quoteConfig, index),
            maxArea: toAmount(tier.maxArea),
            foundationUnitPrice: toAmount(tier.foundationUnitPrice),
            materialUnitPrice: toAmount(tier.materialUnitPrice),
          })),
        minChargeAmount: toAmount(editingTemplate.quoteConfig.minChargeAmount),
        calculationNote: editingTemplate.quoteConfig.calculationNote.trim(),
      },
      projectGroups: normalizeTemplateProjectGroups(editingTemplate.projectGroups, editingTemplate.spaces),
      comprehensiveFees: normalizeComprehensiveFees(editingTemplate.comprehensiveFees)
        .map((fee) => ({
          ...fee,
          name: fee.name.trim(),
          fee_calc_method: normalizeFeeCalcMethod(fee.fee_calc_method),
          fee_calc_base: normalizeFeeCalcMethod(fee.fee_calc_method) === "fixed" ? "" : normalizeFeeCalcBase(fee.fee_calc_base),
          fee_rate: normalizeFeeCalcMethod(fee.fee_calc_method) === "percent" ? toAmount(fee.fee_rate) : 0,
          unit_price: normalizeFeeCalcMethod(fee.fee_calc_method) === "fixed" ? toAmount(fee.unit_price) : 0,
          remark: fee.remark.trim(),
        }))
        .filter((fee) => fee.name),
      appendixNote: editingTemplate.appendixNote.trim(),
      spaces: editingTemplate.spaces
        .map((space) => ({
          ...space,
          name: space.name.trim(),
          projectGroupIds: uniqueProjectGroupIds(space.projectGroupIds || []),
          quotaItems: space.quotaItems
            .map((item) => ({
              ...item,
              code: item.code.trim(),
              category: item.category.trim(),
              name: item.name.trim(),
              constructionDescription: item.constructionDescription.trim(),
              unit: item.unit.trim(),
              quoteScope: normalizeQuotaScope(item.quoteScope, `${item.category}${item.name}${item.constructionDescription}`),
              laborPrice: Math.max(0, Number(item.laborPrice || 0)),
              materialPrice: Math.max(0, Number(item.materialPrice || 0)),
              totalPrice: Math.max(0, Number(item.totalPrice || 0)),
              isSpecialPrice: Boolean(item.isSpecialPrice),
            }))
            .filter((item) => item.name),
        }))
        .filter((space) => space.name),
      updatedAt: todayText(),
    };
    setTemplates((current) => current.some((template) => template.id === nextTemplate.id)
      ? current.map((template) => template.id === nextTemplate.id ? nextTemplate : template)
      : [nextTemplate, ...current]
    );
    setSelectedId(nextTemplate.id);
    if (editingMode === "create") clearTemplateDraftFromStorage();
    if (spaceAutoSaveTimerRef.current) window.clearTimeout(spaceAutoSaveTimerRef.current);
    lastSpaceAutoSavePayloadRef.current = "";
    setEditingTemplate(null);
    setActiveSpaceId("");
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
    setSpaceAutoSaveStatus("idle");
  };

  return (
    <div className="app-page-surface enterprise-list-ui quota-management-ui quota-list-page quota-template-page -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className="quota-template-toolbar-shell shrink-0 border border-surface-200/90 bg-white/95 px-3 py-3">
        <div className="quota-list-toolbar quota-template-toolbar flex flex-col gap-3 p-0 lg:flex-row lg:items-center lg:justify-between">
          <div className="quota-search-control flex min-h-10 flex-1 items-center gap-2 border border-surface-200 bg-white px-3 text-sm text-surface-500 lg:max-w-md">
            <Search className="h-4 w-4" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-surface-400" placeholder="搜索模板名称、报价模式、备注说明" />
          </div>
          <div className="quota-toolbar-compact flex flex-wrap items-center gap-2">
            <div className="quota-template-filter-group flex items-center gap-2">
              <span className="quota-template-filter-label inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500"><SlidersHorizontal className="h-3.5 w-3.5" />筛选</span>
              <SystemSelect value={pricingModeFilter} onChange={(event) => setPricingModeFilter(event.target.value as PricingMode | "")} className="input-field h-10 w-44 py-0">
                <option value="">全部报价模式</option>
                {pricingModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SystemSelect>
            </div>
            <span className="quota-template-toolbar-divider mx-1 h-5 w-px bg-surface-200" />
            <button type="button" onClick={openCreateTemplate} className="quota-template-primary-action btn-primary min-h-10 px-3"><Plus className="h-4 w-4" />新增模板</button>
          </div>
        </div>
      </section>

      <section className="table-shell quota-list-shell flex min-h-0 flex-1 flex-col">
        <ThinScrollArea className="quota-list-scroll min-h-0 flex-1" scrollClassName="h-full overflow-y-auto">
          <table className="quota-list-table w-full min-w-[1380px] table-fixed text-sm">
            <colgroup>
              <col className="w-[5%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[23%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
              <tr className="border-b border-surface-300">
                <th className="px-3 py-3 text-center">序号</th>
                <th className="px-3 py-3 text-left">模板名称</th>
                <th className="px-3 py-3 text-center">报价模式</th>
                <th className="px-3 py-3 text-center">创建人</th>
                <th className="px-3 py-3 text-left">备注说明</th>
                <th className="px-3 py-3 text-center">更新时间</th>
                <th className="px-3 py-3 text-center">状态</th>
                <th className="px-3 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {pagination.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="quota-template-empty-cell px-3 py-10 text-center">
                    <div className="quota-template-empty-state mx-auto flex max-w-sm flex-col items-center text-center">
                      <span className="quota-template-empty-icon inline-flex items-center justify-center" aria-hidden="true">
                        <LayoutTemplate className="h-6 w-6" />
                      </span>
                      <p className="mt-4 text-sm font-semibold text-surface-900">暂无定额模板</p>
                      <p className="mt-1.5 text-xs leading-5 text-surface-500">创建模板后，可统一维护报价模式、综合费用与空间定额配置。</p>
                      <button type="button" onClick={openCreateTemplate} className="btn-secondary mt-4 min-h-9 px-3 text-xs">
                        <Plus className="h-3.5 w-3.5" />
                        新增模板
                      </button>
                    </div>
                  </td>
                </tr>
              ) : pagination.pageItems.map((template, templateIndex) => {
                const isDisabled = template.status === "disabled";
                const rowNumber = (pagination.page - 1) * pagination.pageSize + templateIndex + 1;
                return (
                  <tr
                    key={template.id}
                    tabIndex={0}
                    onClick={() => openEditTemplate(template)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      openEditTemplate(template);
                    }}
                    className={selectedTemplate?.id === template.id ? "cursor-pointer bg-primary-50/70 outline-none ring-inset focus-visible:ring-2 focus-visible:ring-primary-200" : "cursor-pointer bg-white outline-none ring-inset hover:bg-surface-50 focus-visible:ring-2 focus-visible:ring-primary-200"}
                    title="点击编辑模板"
                  >
                    <td className="px-3 py-3 text-center font-semibold tabular-nums text-surface-500">{rowNumber}</td>
                    <td className="quota-template-name-cell px-3 py-3">
                      <p className="truncate font-semibold text-surface-900" title={template.name}>{template.name}</p>
                    </td>
                    <td className="px-3 py-3 text-center text-surface-700">
                      <span className="inline-flex min-h-6 items-center rounded-md border border-surface-200 bg-white px-2 text-xs font-semibold text-surface-700">
                        {getPricingModeLabel(template.quoteConfig.mode) || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-surface-700">
                      <span className="block truncate" title={template.createdByName || DEFAULT_TEMPLATE_CREATOR}>{template.createdByName || DEFAULT_TEMPLATE_CREATOR}</span>
                    </td>
                    <td className="px-3 py-3 text-surface-700">
                      <p className="line-clamp-2 leading-5" title={template.remark || undefined}>{template.remark || "-"}</p>
                    </td>
                    <td className="px-3 py-3 text-center text-surface-500">{template.updatedAt}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`quota-status-tag ${isDisabled ? "quota-status-tag-disabled" : "quota-status-tag-enabled"} inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${getTemplateStatusBadgeClass(template.status)}`}>
                        {getTemplateStatusLabel(template.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="quota-template-row-actions inline-flex items-center justify-center gap-1">
                        <button type="button" onClick={(event) => { event.stopPropagation(); openEditTemplate(template); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title="编辑模板">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleCopyTemplate(template); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title="复制模板">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); toggleTemplateStatus(template); }}
                          className={isDisabled
                            ? "inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-100 bg-white text-emerald-600 transition hover:border-emerald-200 hover:bg-emerald-50"
                            : "inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-100 bg-white text-amber-600 transition hover:border-amber-200 hover:bg-amber-50"
                          }
                          title={isDisabled ? "启用模板" : "停用模板"}
                          aria-label={isDisabled ? "启用模板" : "停用模板"}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleDeleteTemplate(template); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="删除模板">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination total={filteredTemplates.length} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemName="个模板" />
      </section>

      {editingTemplate && (
        <div className="quota-template-editor fixed bottom-0 right-0 top-0 z-50 bg-surface-50 max-md:left-0 md:left-[var(--active-sidebar-width)]">
          <div className="flex h-full w-full flex-col overflow-hidden bg-surface-50">
            <div className="quota-template-editor-header flex items-center justify-between gap-4 border-b border-surface-200 bg-white px-6 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-surface-900">{templates.some((template) => template.id === editingTemplate.id) ? "编辑定额模板" : "新增定额模板"}</p>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs">
                  <span className="text-surface-500">基础配置 / 施工模板配置 / 报价配置 / 空间配置</span>
                </div>
              </div>
              <button type="button" onClick={closeEditingTemplate} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="quota-template-editor-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="quota-template-editor-section flex h-full flex-col rounded-lg border border-surface-200 bg-white">
                  <div className="border-b border-surface-200 bg-surface-100 px-4 py-2.5 text-sm font-semibold text-surface-900">基础配置</div>
                  <div className="grid gap-3 p-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-surface-600">模板名称 <span className="text-red-500">*</span></span>
                      <input value={editingTemplate.name} onChange={(event) => setEditingTemplate({ ...editingTemplate, name: event.target.value })} className="input-field" placeholder="如：番禺店标准半包模板" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-surface-600">备注说明</span>
                      <textarea value={editingTemplate.remark} onChange={(event) => setEditingTemplate({ ...editingTemplate, remark: event.target.value })} className="input-field min-h-16 resize-none leading-5" placeholder="填写模板适用场景、使用说明或注意事项" />
                    </label>
                  </div>
                </section>
                <section className="quota-template-editor-section flex h-full flex-col rounded-lg border border-surface-200 bg-white">
                  <div className="border-b border-surface-200 bg-surface-100 px-4 py-2.5 text-sm font-semibold text-surface-900">施工模板配置</div>
                  <div className={selectedConstructionTemplateConfig.name ? "flex flex-1 items-center p-4" : "flex flex-1 items-center p-3"}>
                    {selectedConstructionTemplateConfig.name ? (
                      <div className="relative min-h-28 w-full rounded-lg border border-primary-100 bg-primary-50/40 px-3 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setConstructionTemplatePickerOpen(true);
                            if (!constructionTemplateLoading && (constructionTemplateOptions.length === 0 || constructionTemplateError)) {
                              void loadConstructionTemplateOptions();
                            }
                          }}
                          className="flex w-full flex-col items-center justify-center rounded-md px-10 py-2 transition hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200"
                          aria-label="更换施工模板"
                        >
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-100 bg-primary-50 text-primary-600">
                            <Building2 className="h-4 w-4" />
                          </span>
                          <span className="mt-2 block max-w-full text-sm font-semibold leading-5 text-surface-900" title={selectedConstructionTemplateConfig.name}>
                            {selectedConstructionTemplateConfig.name}
                          </span>
                          <span className="mt-1 block max-w-3xl text-xs font-semibold leading-5 text-surface-500" title={selectedConstructionTemplateConfig.description || "已关联施工阶段、工序节点和验收节点"}>
                            {selectedConstructionTemplateConfig.description || "已关联施工阶段、工序节点和验收节点"}
                          </span>
                          <span className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-semibold text-surface-600">
                            <span>{selectedConstructionTemplateConfig.decorationType || "未设置类型"}</span>
                            <span>{selectedConstructionTemplateConfig.stageCount || 0} 阶段</span>
                            <span>{selectedConstructionTemplateConfig.nodeCount || 0} 节点</span>
                            <span>{selectedConstructionTemplateConfig.durationText || "未设置工期"}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={clearConstructionTemplate}
                          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-surface-300 transition hover:bg-white/70 hover:text-surface-600"
                          title="清除施工模板"
                          aria-label="清除施工模板"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConstructionTemplatePickerOpen(true);
                          if (!constructionTemplateLoading && (constructionTemplateOptions.length === 0 || constructionTemplateError)) {
                            void loadConstructionTemplateOptions();
                          }
                        }}
                        className="flex min-h-28 w-full flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-white px-3 py-4 text-center transition hover:border-primary-200 hover:bg-primary-50/40"
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-surface-200 bg-surface-50 text-surface-500">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <span className="mt-2 block text-sm font-semibold text-surface-900">选择施工模板</span>
                        <span className="mt-1 block text-xs font-semibold text-surface-500">
                          从分公司设置中选择已启用的施工模板
                        </span>
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600">
                          选择模板
                          <ChevronDown className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    )}
                  </div>
                </section>
              </div>
              <section className="quota-template-editor-section rounded-lg border border-surface-200 bg-white">
                <div className="border-b border-surface-200 bg-surface-100 px-4 py-3 text-sm font-semibold text-surface-900">报价配置</div>
                <div className="grid gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-surface-500">报价模式</p>
                    <div className="space-y-2">
                    {pricingModeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateQuoteConfig({ mode: option.value })}
                        className={editingTemplate.quoteConfig.mode === option.value
                          ? "w-full rounded-lg border border-primary-300 bg-primary-50 px-4 py-3 text-left text-primary-800 ring-1 ring-primary-200"
                          : "w-full rounded-lg border border-surface-200 bg-white px-4 py-3 text-left text-surface-700 transition hover:border-primary-200 hover:bg-primary-50/40"
                        }
                      >
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-surface-500">{option.description}</span>
                      </button>
                    ))}
                    </div>
                  </div>

                  <div className={quoteRemarkShouldFill ? "flex min-w-0 flex-col gap-4" : "min-w-0 space-y-4"}>
                  {editingTemplate.quoteConfig.mode === "package" && (
                    <div className="overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                      <div className="flex items-center gap-3 border-b border-surface-200 bg-white px-4 py-3">
                        <p className="text-sm font-semibold text-surface-900">销售价配置</p>
                        <button
                          type="button"
                          onClick={addPackageTier}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          新增
                        </button>
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="grid gap-3 border-b border-surface-200 pb-4 md:grid-cols-[96px_130px_96px_130px_minmax(180px,1fr)_40px] md:items-center">
                        <span className="text-sm font-medium text-surface-600 md:col-start-1 md:col-end-4"><span className="mr-1 text-red-500">*</span>套餐面积(㎡) ≤</span>
                          <input
                            type="text"
                            placeholder="0"
                            {...getTemplateNumberInputProps("quote.includedArea", editingTemplate.quoteConfig.includedArea, (value) => updateQuoteConfig({ includedArea: value }))}
                            className="input-field h-9 py-1.5 text-right tabular-nums md:col-start-4"
                          />
                        <label className="grid gap-2 md:col-start-5 md:col-end-6 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
                          <span className="text-sm font-medium text-surface-600"><span className="mr-1 text-red-500">*</span>套餐价(元) =</span>
                          <input
                            type="text"
                            placeholder="0"
                            {...getTemplateNumberInputProps("quote.packageAmount", editingTemplate.quoteConfig.packageAmount, (value) => updateQuoteConfig({ packageAmount: value }))}
                            className="input-field h-9 py-1.5 text-right tabular-nums"
                          />
                        </label>
                        </div>

                        <div className="space-y-3">
                          {editingTemplate.quoteConfig.packageTiers.map((tier, tierIndex) => {
                            const tierStartArea = getPackageTierStartArea(editingTemplate.quoteConfig, tierIndex);
                            return (
                              <div key={tier.id} className="grid gap-3 rounded-md bg-surface-50 md:grid-cols-[96px_130px_96px_130px_minmax(180px,1fr)_40px] md:items-center">
                                <span className="text-sm font-medium text-surface-600">{getPackageTierLabel(tierIndex)}</span>
                                <input
                                  type="text"
                                  value={formatTemplateNumberInputValue(tierStartArea)}
                                  readOnly
                                  className="input-field h-9 bg-surface-100 py-1.5 text-right tabular-nums text-surface-500"
                                  title="起始面积自动取套餐面积或上一阶梯面积"
                                />
                                <span className="text-center text-sm font-medium text-surface-600">&lt; 面积(㎡) ≤</span>
                                <input
                                  type="text"
                                  placeholder="0"
                                  {...getTemplateNumberInputProps(`quote.packageTiers.${tier.id}.maxArea`, tier.maxArea, (value) => updatePackageTier(tier.id, { maxArea: value }))}
                                  className="input-field h-9 py-1.5 text-right tabular-nums"
                                />
                                <label className="grid gap-2 md:grid-cols-[auto_160px] md:items-center">
                                  <span className="text-sm font-medium text-surface-600">销售单价(元/㎡) =</span>
                                  <input
                                    type="text"
                                    placeholder="0"
                                    {...getTemplateNumberInputProps(`quote.packageTiers.${tier.id}.unitPrice`, tier.unitPrice, (value) => updatePackageTier(tier.id, { unitPrice: value }))}
                                    className="input-field h-9 py-1.5 text-right tabular-nums"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removePackageTier(tier.id)}
                                  disabled={editingTemplate.quoteConfig.packageTiers.length <= 1}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                  title="删除阶梯"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {editingTemplate.quoteConfig.mode === "area" && (
                    <div className="overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                      <div className="flex items-center gap-3 border-b border-surface-200 bg-white px-4 py-3">
                        <p className="text-sm font-semibold text-surface-900">销售价配置</p>
                        <button
                          type="button"
                          onClick={addAreaTier}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          新增
                        </button>
                      </div>

                      <div className="space-y-3 p-4">
                        {editingTemplate.quoteConfig.areaTiers.map((tier, tierIndex) => {
                          const tierStartArea = getAreaTierStartArea(editingTemplate.quoteConfig, tierIndex);
                          return (
                            <div key={tier.id} className="grid gap-3 rounded-md bg-surface-50 md:grid-cols-[96px_130px_auto_130px_300px_minmax(0,1fr)_40px] md:items-center">
                              <span className="text-sm font-medium text-surface-600"><span className="mr-1 text-red-500">*</span>{getPackageTierLabel(tierIndex)}</span>
                              <input
                                type="text"
                                value={formatTemplateNumberInputValue(tierStartArea)}
                                readOnly
                                className="input-field h-9 bg-surface-100 py-1.5 text-right tabular-nums text-surface-500"
                                title="起始面积自动取 0 或上一阶梯面积"
                              />
                              <span className="text-center text-sm font-medium text-surface-600">&lt; 面积(㎡) ≤</span>
                              <input
                                type="text"
                                placeholder="0"
                                {...getTemplateNumberInputProps(`quote.areaTiers.${tier.id}.maxArea`, tier.maxArea, (value) => updateAreaTier(tier.id, { maxArea: value }))}
                                className="input-field h-9 py-1.5 text-right tabular-nums"
                              />
                              <label className="grid gap-2 md:grid-cols-[auto_130px] md:items-center">
                                <span className="whitespace-nowrap text-sm font-medium text-surface-600"><span className="mr-1 text-red-500">*</span>销售单价(元/㎡) =</span>
                                <input
                                  type="text"
                                  placeholder="0"
                                  {...getTemplateNumberInputProps(`quote.areaTiers.${tier.id}.unitPrice`, tier.unitPrice, (value) => updateAreaTier(tier.id, { unitPrice: value }))}
                                  className="input-field h-9 py-1.5 text-right tabular-nums"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => removeAreaTier(tier.id)}
                                disabled={editingTemplate.quoteConfig.areaTiers.length <= 1}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 md:col-start-7"
                                title="删除阶梯"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {editingTemplate.quoteConfig.mode === "foundation_material_area" && (
                    <div className="overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                      <div className="flex items-center gap-3 border-b border-surface-200 bg-white px-4 py-3">
                        <p className="text-sm font-semibold text-surface-900">销售价配置</p>
                        <button
                          type="button"
                          onClick={addCombinedAreaTier}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          新增
                        </button>
                      </div>

                      <div className="space-y-3 p-4">
                        {editingTemplate.quoteConfig.combinedAreaTiers.map((tier, tierIndex) => {
                          const tierStartArea = getCombinedAreaTierStartArea(editingTemplate.quoteConfig, tierIndex);
                          const totalUnitPrice = getCombinedAreaTierTotalPrice(tier);
                          return (
                            <div key={tier.id} className="grid gap-x-3 gap-y-3 rounded-md bg-surface-50 md:grid-cols-[96px_130px_104px_130px_126px_130px_minmax(0,1fr)_40px] md:items-center md:justify-start">
                                <span className="text-sm font-medium text-surface-600"><span className="mr-1 text-red-500">*</span>{getPackageTierLabel(tierIndex)}</span>
                                <input
                                  type="text"
                                  value={formatTemplateNumberInputValue(tierStartArea)}
                                  readOnly
                                  className="input-field h-9 bg-surface-100 py-1.5 text-right tabular-nums text-surface-500"
                                  title="起始面积自动取 0 或上一阶梯面积"
                                />
                                <span className="text-center text-sm font-medium text-surface-600">&lt; 面积(㎡) ≤</span>
                                <input
                                  type="text"
                                  placeholder="0"
                                  {...getTemplateNumberInputProps(`quote.combinedAreaTiers.${tier.id}.maxArea`, tier.maxArea, (value) => updateCombinedAreaTier(tier.id, { maxArea: value }))}
                                  className="input-field h-9 py-1.5 text-right tabular-nums"
                                />
                                <span className="hidden md:block" />
                                <span className="hidden md:block" />
                                <span className="hidden md:block" />
                                <span className="hidden md:block" />
                                <span className="whitespace-nowrap text-sm font-medium text-surface-600"><span className="mr-1 text-red-500">*</span>基装单价(元/㎡) =</span>
                                <input
                                  type="text"
                                  placeholder="0"
                                  {...getTemplateNumberInputProps(`quote.combinedAreaTiers.${tier.id}.foundationUnitPrice`, tier.foundationUnitPrice, (value) => updateCombinedAreaTier(tier.id, { foundationUnitPrice: value }))}
                                  className="input-field h-9 py-1.5 text-right tabular-nums"
                                />
                                <span className="whitespace-nowrap text-sm font-medium text-surface-600"><span className="mr-1 text-red-500">*</span>主材单价(元/㎡) =</span>
                                <input
                                  type="text"
                                  placeholder="0"
                                  {...getTemplateNumberInputProps(`quote.combinedAreaTiers.${tier.id}.materialUnitPrice`, tier.materialUnitPrice, (value) => updateCombinedAreaTier(tier.id, { materialUnitPrice: value }))}
                                  className="input-field h-9 py-1.5 text-right tabular-nums"
                                />
                                <span className="whitespace-nowrap text-sm font-medium text-surface-600">合计单价(元/㎡) =</span>
                                <div className="input-field flex h-9 items-center justify-end bg-surface-100 py-1.5 text-right font-semibold tabular-nums text-surface-900">
                                  {formatAmount(totalUnitPrice)}
                                </div>
                                <span className="hidden md:block" />
                                <button
                                  type="button"
                                  onClick={() => removeCombinedAreaTier(tier.id)}
                                  disabled={editingTemplate.quoteConfig.combinedAreaTiers.length <= 1}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                  title="删除阶梯"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {editingTemplate.quoteConfig.mode === "list" && (
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-600">
                      清单模式按空间配置中的定额客户单价汇总，不需要额外填写套餐或平方价格。
                    </div>
                  )}

                  <label className={quoteRemarkShouldFill ? "flex flex-1 flex-col gap-1.5" : "space-y-1.5 block"}>
                    <span className="text-xs font-semibold text-surface-600">计算备注</span>
                    <textarea
                      value={editingTemplate.quoteConfig.calculationNote}
                      onChange={(event) => updateQuoteConfig({ calculationNote: event.target.value })}
                      className={quoteRemarkShouldFill ? "input-field min-h-20 flex-1 resize-none leading-6" : "input-field min-h-20 resize-none leading-6"}
                      placeholder="如：阳台不计入套餐面积、阁楼按一半面积计算"
                    />
                  </label>
                  </div>
                </div>
              </section>
              <section className="quota-template-editor-section quota-template-space-config rounded-lg border border-surface-200 bg-white">
                <div className="quota-template-space-config-head flex items-center justify-between border-b border-surface-200 bg-surface-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{spaceConfigCopy.title}</p>
                    <p className="mt-0.5 text-xs text-surface-500">{spaceConfigCopy.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-semibold ${
                      spaceAutoSaveStatus === "error"
                        ? "bg-red-50 text-red-600 ring-1 ring-red-100"
                        : spaceAutoSaveStatus === "pending" || spaceAutoSaveStatus === "saving"
                          ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                          : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                    }`}>
                      {spaceAutoSaveText}
                    </span>
                  </div>
                </div>
                <div className="quota-template-space-config-body space-y-3 p-4">
                  <div className="quota-template-mode-strip flex items-center justify-between gap-3 rounded-md border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs text-primary-800">
                    <span className="quota-template-mode-pill font-semibold">{spaceConfigCopy.modeName}</span>
                    <span className="quota-template-mode-copy min-w-0 flex-1 text-primary-700">{spaceConfigCopy.notice}</span>
                  </div>
                  {editingTemplate.spaces.length === 0 ? (
                    <div className="quota-template-space-empty flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-surface-50 px-4 text-center">
                      <p className="text-sm font-semibold text-surface-700">暂无空间</p>
                      <p className="mt-1 text-xs text-surface-500">添加空间后，再维护基装、主材或自定义项目分组。</p>
                      <button type="button" onClick={addSpace} className="btn-secondary mt-3 min-h-8 px-2.5 text-xs">
                        <Plus className="h-3.5 w-3.5" />
                        添加空间
                      </button>
                    </div>
                  ) : (
                    <div className="quota-template-space-workbench">
                      <aside className="quota-template-space-sidebar">
                        <div className="quota-template-space-sidebar-head">
                          <span>空间/类别</span>
                        </div>
                      <div className="quota-template-space-toolbar pb-1">
                        <div className="quota-template-space-toolbar-inner flex flex-wrap items-center gap-2 border-b border-surface-200 pb-3">
                          {editingTemplate.spaces.map((space, spaceIndex) => {
                            const isActive = activeSpace?.id === space.id;
                            const spaceDropBefore = dragOverSpace?.id === space.id && dragOverSpace.position === "before";
                            const spaceDropAfter = dragOverSpace?.id === space.id && dragOverSpace.position === "after";
                            return (
                              <div
                                key={space.id}
                                data-template-space-tab
                                data-space-id={space.id}
                                className={`${isActive
                                  ? "inline-flex h-9 w-32 items-center rounded-md border border-primary-600 bg-primary-600 px-1.5 shadow-sm"
                                  : "inline-flex h-9 w-32 items-center rounded-md border border-surface-200 bg-white px-1.5 transition hover:border-primary-200 hover:bg-primary-50"
                                } ${draggingSpaceId === space.id ? "scale-[0.98] opacity-55" : ""} ${recentlyMovedSpaceId === space.id ? "template-space-tab-moved" : ""} ${spaceDropBefore ? "template-space-drop-before" : ""} ${spaceDropAfter ? "template-space-drop-after" : ""}`}
                                title={space.name || `空间${spaceIndex + 1}`}
                              >
                                <button
                                  type="button"
                                  onPointerDown={(event) => startPointerSpaceDrag(event, space.id)}
                                  className={isActive
                                    ? "inline-flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white active:cursor-grabbing"
                                    : "inline-flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-surface-300 hover:bg-surface-100 hover:text-primary-600 active:cursor-grabbing"
                                  }
                                  title="拖动调整空间顺序"
                                  aria-label={`拖动${space.name || `空间${spaceIndex + 1}`}调整顺序`}
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </button>
                                <input
                                  value={space.name}
                                  onFocus={() => setActiveSpaceId(space.id)}
                                  onClick={() => setActiveSpaceId(space.id)}
                                  onChange={(event) => updateSpace(space.id, { name: event.target.value })}
                                  className={isActive
                                    ? "h-full min-w-0 flex-1 bg-transparent text-center text-xs font-semibold text-white outline-none placeholder:text-primary-100"
                                    : "h-full min-w-0 flex-1 bg-transparent text-center text-xs font-semibold text-surface-500 outline-none placeholder:text-surface-400"
                                  }
                                  placeholder={`空间${spaceIndex + 1}`}
                                />
                                <span className="quota-template-space-item-count">{space.quotaItems.length}</span>
                              </div>
                            );
                          })}
                          <button type="button" onClick={addSpace} className="quota-template-add-space btn-secondary min-h-9 px-3 text-xs">
                            <Plus className="h-3.5 w-3.5" />
                            添加空间
                          </button>
                        </div>
                      </div>
                      </aside>

                      <div className="quota-template-space-content">
                      {activeSpace && (() => {
                        const quotaScopeSections = activeSpaceProjectGroups.map((group) => ({
                          scope: group.id,
                          title: group.name,
                          description: group.id === "foundation"
                            ? "该区块项目会带入报价单的基装部分。"
                            : group.id === "main_material"
                              ? "该区块项目会带入报价单的产品部分。"
                              : group.id === "custom_cabinet"
                                ? "该区块项目会带入报价单的定制柜部分。"
                              : `该区块项目会作为报价单的“${group.name}”分类带入。`,
                          addText: getProjectGroupAddText(activeSpaceProjectGroups, group.id),
                          emptyText: getProjectGroupEmptyText(activeSpaceProjectGroups, group.id),
                        }));
                        const availableProjectGroups = BUILTIN_PROJECT_GROUPS.filter((group) => !activeSpaceProjectGroups.some((item) => item.id === group.id));
                        const activeSection = quotaScopeSections.find((section) => section.scope === activeQuotaScope) || quotaScopeSections[0];
                        if (!activeSection) {
                          return (
                            <div className="quota-template-space-main">
                              <div className="quota-template-space-main-head">
                                <div className="quota-template-space-main-left">
                                  <div className="quota-template-space-main-title">
                                    <strong>{activeSpace.name || "未命名空间"}</strong>
                                  </div>
                                  <div className="quota-template-space-main-groups quota-template-space-main-groups-empty">
                                    {availableProjectGroups.map((group) => (
                                      <button
                                        key={group.id}
                                        type="button"
                                        onClick={() => addProjectGroup(group.id)}
                                        className="quota-template-project-group-option"
                                        title={`添加${group.name}`}
                                        aria-label={`添加${group.name}`}
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        {group.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="quota-template-space-main-right">
                                  <div className="quota-template-space-main-meta">
                                    <span><LayoutTemplate className="quota-template-space-main-meta-icon h-3.5 w-3.5" />{quotaScopeSections.length} 个分组</span>
                                    <span><Pencil className="quota-template-space-main-meta-icon h-3.5 w-3.5" />{activeSpace.quotaItems.length} 个项目</span>
                                  </div>
                                  <div className="quota-template-space-main-actions">
                                    <button type="button" onClick={() => copySpace(activeSpace.id)} title="复制空间">
                                      <Copy className="h-3.5 w-3.5" />
                                      复制
                                    </button>
                                    <button type="button" onClick={() => removeSpace(activeSpace.id)} data-danger title="删除空间">
                                      <Trash2 className="h-3.5 w-3.5" />
                                      删除
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <div className="quota-template-project-board overflow-hidden rounded-lg border border-surface-200 bg-white">
                              <div className="quota-template-project-empty flex min-h-36 flex-col items-center justify-center px-4 text-center">
                                <div className="quota-template-empty-panel">
                                  <p className="quota-template-empty-title">当前空间还没有报价分组</p>
                                  <p className="quota-template-empty-copy">请选择基装、产品或定制柜分类。</p>
                                </div>
                              </div>
                            </div>
                            </div>
                          );
                        }
                        const sectionItems = activeSpace.quotaItems.filter((item) => normalizeQuotaScope(item.quoteScope) === activeSection.scope);

                        return (
                          <div className="quota-template-space-main">
                            <div className="quota-template-space-main-head">
                              <div className="quota-template-space-main-left">
                                <div className="quota-template-space-main-title">
                                  <strong>{activeSpace.name || "未命名空间"}</strong>
                                </div>
                                <div className="quota-template-space-main-groups">
                                  <div className="quota-template-project-group-tabs">
                                    {quotaScopeSections.map((section) => {
                                      const isActive = activeSection.scope === section.scope;
                                      const sectionCount = activeSpace.quotaItems.filter((item) => normalizeQuotaScope(item.quoteScope) === section.scope).length;
                                      const dropBefore = dragOverProjectGroup?.id === section.scope && dragOverProjectGroup.position === "before";
                                      const dropAfter = dragOverProjectGroup?.id === section.scope && dragOverProjectGroup.position === "after";
                                      const isDragging = draggingProjectGroupId === section.scope;
                                      const recentlyMoved = recentlyMovedProjectGroupId === section.scope;
                                      return (
                                        <div
                                          key={section.scope}
                                          data-template-project-group-tab
                                          data-project-group-id={section.scope}
                                          className={isActive
                                            ? `inline-flex h-8 min-w-28 items-center rounded px-1.5 text-xs font-semibold text-white shadow-sm transition bg-primary-600 ${isDragging ? "scale-[0.98] opacity-55" : ""} ${recentlyMoved ? "template-project-group-tab-moved" : ""} ${dropBefore ? "template-project-group-drop-before" : ""} ${dropAfter ? "template-project-group-drop-after" : ""}`
                                            : `inline-flex h-8 min-w-28 items-center rounded px-1.5 text-xs font-semibold text-surface-600 transition hover:bg-surface-50 hover:text-surface-900 ${isDragging ? "scale-[0.98] opacity-55" : ""} ${recentlyMoved ? "template-project-group-tab-moved" : ""} ${dropBefore ? "template-project-group-drop-before" : ""} ${dropAfter ? "template-project-group-drop-after" : ""}`
                                          }
                                          title={section.title}
                                        >
                                          <button
                                            type="button"
                                            onPointerDown={(event) => startPointerProjectGroupDrag(event, section.scope)}
                                            className={isActive
                                              ? "inline-flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-white/65 hover:bg-white/10 hover:text-white active:cursor-grabbing"
                                              : "inline-flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-surface-300 hover:bg-surface-100 hover:text-primary-600 active:cursor-grabbing"
                                            }
                                            title="拖动调整项目顺序"
                                            aria-label={`拖动${section.title || "项目分组"}调整顺序`}
                                          >
                                            <GripVertical className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setActiveQuotaScope(section.scope)}
                                            className={isActive
                                              ? "h-full min-w-0 flex-1 truncate bg-transparent px-1 text-left text-xs font-semibold text-white outline-none"
                                              : "h-full min-w-0 flex-1 truncate bg-transparent px-1 text-left text-xs font-semibold text-surface-600 outline-none"
                                            }
                                          >
                                            {section.title}
                                          </button>
                                          <span className={isActive
                                            ? "ml-1 shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                                            : "ml-1 shrink-0 rounded-full bg-surface-100 px-1.5 py-0.5 text-[11px] font-semibold text-surface-500"
                                          }>
                                            {sectionCount}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {availableProjectGroups.map((group) => (
                                    <button
                                      key={group.id}
                                      type="button"
                                      onClick={() => addProjectGroup(group.id)}
                                      className="quota-template-project-group-option"
                                      title={`添加${group.name}`}
                                      aria-label={`添加${group.name}`}
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      {group.name}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => removeProjectGroup(activeSection.scope)}
                                    className="quota-template-project-group-delete"
                                    title={`删除当前空间的${activeSection.title}`}
                                    aria-label={`删除当前空间的${activeSection.title}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="quota-template-space-main-right">
                                <div className="quota-template-space-main-meta">
                                  <span><LayoutTemplate className="quota-template-space-main-meta-icon h-3.5 w-3.5" />{quotaScopeSections.length} 个分组</span>
                                  <span><Pencil className="quota-template-space-main-meta-icon h-3.5 w-3.5" />{activeSpace.quotaItems.length} 个项目</span>
                                </div>
                                <div className="quota-template-space-main-actions">
                                  <button type="button" onClick={() => copySpace(activeSpace.id)} title="复制空间">
                                    <Copy className="h-3.5 w-3.5" />
                                    复制
                                  </button>
                                  <button type="button" onClick={() => removeSpace(activeSpace.id)} data-danger title="删除空间">
                                    <Trash2 className="h-3.5 w-3.5" />
                                    删除
                                  </button>
                                </div>
                              </div>
                            </div>
                          <div className="quota-template-project-board overflow-hidden rounded-lg border border-surface-200 bg-white">
                            <div className="overflow-hidden">
                              <table className="quota-template-project-table w-full table-fixed text-sm">
                                <colgroup>
                                  <col className="w-[4%]" />
                                  <col className="w-[11%]" />
                                  <col className="w-[22%]" />
                                  <col className="w-[5%]" />
                                  <col className="w-[7%]" />
                                  <col className="w-[7%]" />
                                  <col className="w-[7%]" />
                                  <col className="w-[27%]" />
                                  <col className="w-[10%]" />
                                </colgroup>
                                <thead className="bg-white text-xs font-semibold text-surface-600">
                                  <tr className="border-b border-surface-200">
                                    <th className="px-2 py-2 text-center"></th>
                                    <th className="px-3 py-2 text-left">定额编码</th>
                                    <th className="px-3 py-2 text-left">项目名称</th>
                                    <th className="px-2 py-2 text-center">单位</th>
                                    <th className="px-2 py-2 text-right">人工单价</th>
                                    <th className="px-2 py-2 text-right">材料单价</th>
                                    <th className="px-2 py-2 text-right">{spaceConfigCopy.priceHeader}</th>
                                    <th className="px-3 py-2 text-left">施工说明</th>
                                    <th className="px-3 py-2 text-center">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-100">
                                  {sectionItems.length === 0 ? (
                                    <tr>
                                      <td colSpan={9} className="px-3 py-6 text-center text-sm text-surface-400">
                                        <div className="quota-template-table-empty">
                                          <p>{activeSection.emptyText}</p>
                                          <span>下方按钮可继续添加当前分组的报价项目。</span>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : sectionItems.map((item) => {
                                    const isDragging = draggingQuotaId === item.id;
                                    const dropBefore = dragOverQuota?.id === item.id && dragOverQuota.position === "before";
                                    const dropAfter = dragOverQuota?.id === item.id && dragOverQuota.position === "after";
                                    const recentlyMoved = recentlyMovedQuotaId === item.id;
                                    return (
                                    <tr
                                      key={item.id}
                                      data-template-quota-row
                                      data-quota-id={item.id}
                                      data-quota-scope={activeSection.scope}
                                      className={`template-quota-row align-middle transition ${isDragging ? "opacity-45" : ""} ${recentlyMoved ? "quote-item-row-moved" : ""} ${dropBefore ? "quote-item-row-drop-before border-t-2 border-t-teal-500" : ""} ${dropAfter ? "quote-item-row-drop-after border-b-2 border-b-teal-500" : ""}`}
                                    >
                                      <td className="px-2 py-2 text-center">
                                        <button
                                          type="button"
                                          onPointerDown={(event) => startPointerQuotaDrag(event, activeSpace.id, item.id, activeSection.scope)}
                                          className="inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md text-surface-300 transition hover:bg-surface-100 hover:text-primary-600 active:cursor-grabbing"
                                          title="拖动调整定额顺序"
                                          aria-label={`拖动${item.name || item.code || "定额"}调整顺序`}
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </button>
                                      </td>
                                      <td className="px-3 py-2 font-mono text-xs font-semibold text-surface-700">
                                        {item.code ? (
                                          <span className="block truncate" title={item.code}>{item.code}</span>
                                        ) : (
                                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-sans text-[11px] font-semibold text-amber-700">自定义</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-2">
                                        <span
                                          contentEditable
                                          suppressContentEditableWarning
                                          className="quota-template-project-alias block truncate text-xs font-semibold text-[#111827]"
                                          title="点击修改当前模板中的项目别名，不影响基装定额库"
                                          role="textbox"
                                          aria-label="项目别名"
                                          onBlur={(event) => {
                                            const nextName = (event.currentTarget.textContent || "").trim();
                                            if (!nextName) {
                                              event.currentTarget.textContent = item.name || "";
                                              return;
                                            }
                                            if (nextName !== item.name) {
                                              updateSpaceQuota(activeSpace.id, item.id, { name: nextName });
                                            }
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              event.currentTarget.blur();
                                            }
                                          }}
                                        >
                                          {item.name || "-"}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-center text-surface-700">{item.unit || "-"}</td>
                                      <td className="px-2 py-2 text-right tabular-nums text-surface-700">{formatAmount(item.laborPrice)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums text-surface-700">{formatAmount(item.materialPrice)}</td>
                                      <td className={`${spaceConfigCopy.priceClassName} quota-template-project-price-cell`} title={spaceConfigCopy.priceTitle}>
                                        <span className="quota-template-project-price-value">{formatAmount(item.totalPrice)}</span>
                                        {item.isSpecialPrice && (
                                          <span className="quota-template-project-special-mark" title="特价项目">特</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-surface-700">
                                        <p className="line-clamp-3 leading-5" title={item.constructionDescription || undefined}>{item.constructionDescription || "-"}</p>
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        <div className="inline-flex items-center justify-center gap-1">
                                          <button type="button" onClick={() => removeSpaceQuota(activeSpace.id, item.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="删除定额">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <div className="border-t border-surface-200 bg-surface-50 px-3 py-3">
                              <button
                                type="button"
                                onClick={() => addQuotaToSpace(activeSpace.id, activeSection.scope)}
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-teal-300 bg-teal-50/30 text-sm font-semibold text-teal-600 transition hover:border-teal-500 hover:bg-teal-50"
                              >
                                <Plus className="h-4 w-4" />
                                {activeSection.addText}
                              </button>
                            </div>
                          </div>
                          </div>
                        );
                      })()}
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <section className="quota-template-editor-section rounded-lg border border-surface-200 bg-white">
                <div className="flex items-center justify-between border-b border-surface-200 bg-surface-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">综合费用配置</p>
                    <p className="mt-0.5 text-xs text-surface-500">和报价单综合费用逻辑一致，可预设管理费、税费、远程费等费用规则。</p>
                  </div>
                  <button
                    type="button"
                    onClick={addComprehensiveFee}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加费用项目
                  </button>
                </div>
                <div className="p-4">
                  {editingTemplate.comprehensiveFees.length === 0 ? (
                    <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-surface-50 px-4 text-center">
                      <p className="text-sm font-semibold text-surface-700">暂无综合费用</p>
                      <p className="mt-1 text-xs text-surface-500">可添加管理费、税费、远程费等费用规则，生成报价时带入综合费用。</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-surface-200">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1120px] table-fixed text-sm">
                          <colgroup>
                            <col className="w-[5%]" />
                            <col className="w-[6%]" />
                            <col className="w-[15%]" />
                            <col className="w-[12%]" />
                            <col className="w-[15%]" />
                            <col className="w-[12%]" />
                            <col className="w-[17%]" />
                            <col className="w-[12%]" />
                            <col className="w-[6%]" />
                          </colgroup>
                          <thead className="bg-surface-50 text-xs font-semibold text-surface-600">
                            <tr className="border-b border-surface-200">
                              <th className="px-2 py-2 text-center"></th>
                              <th className="px-3 py-2 text-center">编号</th>
                              <th className="px-3 py-2 text-left">费用名称</th>
                              <th className="px-3 py-2 text-center">计算方式</th>
                              <th className="px-3 py-2 text-left">基础公式</th>
                              <th className="px-3 py-2 text-right">金额/比例</th>
                              <th className="px-3 py-2 text-left">规则预览</th>
                              <th className="px-3 py-2 text-left">备注</th>
                              <th className="px-3 py-2 text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-100">
                            {editingTemplate.comprehensiveFees.map((fee, feeIndex) => {
                              const feeMethod = normalizeFeeCalcMethod(fee.fee_calc_method);
                              const feeBaseError = templateFeeBaseErrors[feeIndex] || "";
                              const isDragging = draggingFeeId === fee.id;
                              const dropBefore = dragOverFee?.id === fee.id && dragOverFee.position === "before";
                              const dropAfter = dragOverFee?.id === fee.id && dragOverFee.position === "after";
                              const recentlyMoved = recentlyMovedFeeId === fee.id;
                              return (
                                <tr
                                  key={fee.id}
                                  data-template-fee-row
                                  data-fee-id={fee.id}
                                  className={`template-fee-row align-middle transition ${isDragging ? "opacity-45" : ""} ${recentlyMoved ? "quote-item-row-moved" : ""} ${dropBefore ? "quote-item-row-drop-before border-t-2 border-t-teal-500" : ""} ${dropAfter ? "quote-item-row-drop-after border-b-2 border-b-teal-500" : ""}`}
                                >
                                  <td className="px-2 py-2 text-center">
                                    <button
                                      type="button"
                                      onPointerDown={(event) => startPointerFeeDrag(event, fee.id)}
                                      className="inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md text-surface-300 transition hover:bg-surface-100 hover:text-primary-600 active:cursor-grabbing"
                                      title="拖动调整综合费用顺序"
                                      aria-label={`拖动${fee.name || formatAlphaSequence(feeIndex)}调整顺序`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-center font-semibold text-surface-500">{formatAlphaSequence(feeIndex)}</td>
                                  <td className="px-2 py-2">
                                    <input
                                      value={fee.name}
                                      onChange={(event) => updateComprehensiveFee(fee.id, { name: event.target.value })}
                                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-surface-900 outline-none transition hover:border-surface-200 hover:bg-white focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                                      placeholder="如：管理费"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <SystemSelect
                                      value={feeMethod}
                                      onChange={(event) => updateComprehensiveFee(fee.id, getComprehensiveFeeMethodPatch(event.target.value as FeeCalcMethod, fee))}
                                      className="input-field h-8 w-full py-0 text-xs"
                                    >
                                      {Object.entries(feeCalcMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </SystemSelect>
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      value={feeMethod === "fixed" ? "" : String(fee.fee_calc_base ?? "")}
                                      onChange={(event) => updateComprehensiveFee(fee.id, { fee_calc_base: event.target.value })}
                                      disabled={feeMethod === "fixed"}
                                      aria-invalid={!!feeBaseError}
                                      className={`input-field h-8 w-full py-1 text-sm disabled:bg-surface-50 disabled:text-surface-300 ${feeBaseError ? "border-red-300 bg-red-50 text-red-700 ring-1 ring-inset ring-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
                                      placeholder={feeMethod === "fixed" ? "" : templateFeeFormulaPlaceholder}
                                      title={feeBaseError || (feeMethod === "fixed" ? "" : `可输入 ${templateFeeFormulaExampleText} 等`)}
                                    />
                                    {feeBaseError && <div className="mt-1 text-xs font-medium text-red-600">{feeBaseError}</div>}
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <input
                                        type="text"
                                        disabled={feeMethod === "reference"}
                                        placeholder={feeMethod === "reference" ? "" : "0"}
                                        {...getTemplateNumberInputProps(
                                          `comprehensiveFees.${fee.id}.${feeMethod === "percent" ? "fee_rate" : "unit_price"}`,
                                          feeMethod === "percent" ? fee.fee_rate : fee.unit_price,
                                          (value) => updateComprehensiveFee(fee.id, feeMethod === "percent" ? { fee_rate: value } : { unit_price: value }),
                                        )}
                                        className="input-field h-8 w-24 py-1 text-right font-semibold tabular-nums text-red-600 disabled:bg-surface-50 disabled:text-surface-300"
                                      />
                                      <span className="w-4 text-xs font-semibold text-surface-500">{feeMethod === "percent" ? "%" : feeMethod === "fixed" ? "元" : ""}</span>
                                    </div>
                                  </td>
                                  <td className={`px-3 py-2 text-xs font-medium leading-5 ${feeBaseError ? "text-red-600" : "text-surface-500"}`}>{feeBaseError ? "无法计算" : getTemplateFeeRulePreview(fee)}</td>
                                  <td className="px-2 py-2">
                                    <input
                                      value={fee.remark}
                                      onChange={(event) => updateComprehensiveFee(fee.id, { remark: event.target.value })}
                                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-surface-700 outline-none transition hover:border-surface-200 hover:bg-white focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                                      placeholder="费用说明"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeComprehensiveFee(fee.id)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                      title="删除费用项目"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 rounded-md border border-primary-100 bg-primary-50/60 px-3 py-2 text-xs leading-5 text-primary-800">
                    基础公式支持：{templateFeeFormulaExampleText} 等；也可直接引用上方项目名称，A/B/C 对应上方综合费用编号。
                  </div>
                </div>
              </section>
              <section className="quota-template-editor-section rounded-lg border border-surface-200 bg-white">
                <div className="flex items-center justify-between border-b border-surface-200 bg-surface-100 px-4 py-3">
                  <p className="text-sm font-semibold text-surface-900">附注</p>
                  <span className="text-xs text-surface-400">{editingTemplate.appendixNote.length}/500</span>
                </div>
                <div className="p-4">
                  <textarea
                    value={editingTemplate.appendixNote}
                    onChange={(event) => setEditingTemplate({
                      ...editingTemplate,
                      appendixNote: event.target.value.slice(0, 500),
                    })}
                    className="min-h-[108px] w-full resize-y rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-sm leading-6 text-surface-900 outline-none transition placeholder:text-surface-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                    placeholder="填写报价清单底部附注内容"
                  />
                </div>
              </section>
            </div>
            <div className="quota-template-editor-footer flex justify-end gap-2 px-6 py-4">
              <button type="button" onClick={closeEditingTemplate} className="btn-secondary">关闭</button>
              <button type="button" onClick={saveEditingTemplate} className="btn-primary">保存</button>
            </div>
          </div>
          {constructionTemplatePickerOpen && (
            <div
              className="qm-modal-overlay construction-template-picker-overlay fixed inset-0 z-[80] flex items-center justify-center bg-[#111827]/32 px-4 py-6"
              onClick={() => {
                setConstructionTemplatePickerOpen(false);
                setConstructionTemplateSearch("");
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="construction-template-picker-title"
                className="construction-template-picker qm-modal-shell flex max-h-[82vh] w-full max-w-[880px] flex-col overflow-hidden border border-[#DCE4F0] bg-white"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="construction-template-picker-header flex items-center justify-between gap-4 border-b border-[#E7E9EE] bg-white px-5 py-4">
                  <div className="min-w-0">
                    <p id="construction-template-picker-title" className="text-[15px] font-semibold leading-5 text-[#111827]">选择施工模板</p>
                    <p className="mt-1 text-xs leading-5 text-[#7C8798]">
                      {constructionTemplateOptions.length > 0 ? `共 ${filteredConstructionTemplateOptions.length} 个可选模板` : "从分公司设置中读取已启用的施工模板"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConstructionTemplatePickerOpen(false);
                      setConstructionTemplateSearch("");
                    }}
                    className="qm-icon-button inline-flex h-9 w-9 shrink-0 items-center justify-center border border-transparent bg-transparent text-[#667085] transition hover:bg-[#F2F4F7] hover:text-[#111827]"
                    aria-label="关闭施工模板选择"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="construction-template-picker-search border-b border-[#E7E9EE] bg-[#FAFBFC] px-5 py-3">
                  <label className="relative block max-w-[520px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A97AA]" />
                    <input
                      value={constructionTemplateSearch}
                      onChange={(event) => setConstructionTemplateSearch(event.target.value)}
                      className="h-10 min-h-10 w-full rounded-lg border border-[#DCE4F0] bg-white py-0 pl-9 pr-3 text-sm font-medium text-[#243247] outline-none transition placeholder:text-[#98A4B5] focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
                      placeholder="搜索模板名称、类型、阶段或工期"
                      autoFocus
                    />
                  </label>
                </div>

                <div className="construction-template-picker-table mx-5 my-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-[#DCE4F0] bg-white">
                  <div className="min-h-0 max-h-[340px] overflow-auto">
                    <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-0 text-sm">
                      <colgroup>
                        <col className="w-[32%]" />
                        <col className="w-[13%]" />
                        <col className="w-[9%]" />
                        <col className="w-[9%]" />
                        <col className="w-[11%]" />
                        <col className="w-[15%]" />
                        <col className="w-[11%]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-[#F7F9FC] text-[12px] font-semibold text-[#64748B]">
                        <tr>
                          <th className="border-b border-[#E5EAF2] px-3 py-2.5 text-left">模板名称</th>
                          <th className="border-b border-[#E5EAF2] px-3 py-2.5 text-center">装修类型</th>
                          <th className="border-b border-[#E5EAF2] px-3 py-2.5 text-center">阶段</th>
                          <th className="border-b border-[#E5EAF2] px-3 py-2.5 text-center">节点</th>
                          <th className="border-b border-[#E5EAF2] px-3 py-2.5 text-center">验收节点</th>
                          <th className="border-b border-[#E5EAF2] px-3 py-2.5 text-center">工期</th>
                          <th className="border-b border-[#E5EAF2] px-3 py-2.5 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {constructionTemplateLoading ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-14 text-center">
                              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#64748B]">
                                <Loader2 className="h-4 w-4 animate-spin text-[#407AFF]" />
                                正在读取施工模板
                              </span>
                            </td>
                          </tr>
                        ) : constructionTemplateError ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-10 text-center">
                              <p className="text-sm font-semibold text-red-600">{constructionTemplateError}</p>
                              <button type="button" onClick={loadConstructionTemplateOptions} className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-semibold text-red-600 transition hover:border-red-200 hover:bg-red-100">
                                重新加载
                              </button>
                            </td>
                          </tr>
                        ) : constructionTemplateOptions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-12 text-center">
                              <p className="text-sm font-semibold text-[#34445A]">暂无可用施工模板</p>
                              <p className="mt-1 text-xs text-[#7C8798]">请先到分公司设置维护并启用施工模板。</p>
                            </td>
                          </tr>
                        ) : filteredConstructionTemplateOptions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-12 text-center text-sm font-semibold text-[#7C8798]">
                              没有匹配的施工模板
                            </td>
                          </tr>
                        ) : (
                          filteredConstructionTemplateOptions.map((template) => {
                            const isSelected = selectedConstructionTemplateConfig.id === template.id
                              || (!selectedConstructionTemplateConfig.id && selectedConstructionTemplateConfig.name === template.name);
                            return (
                              <tr
                                key={template.id}
                                onClick={() => selectConstructionTemplate(template)}
                                className={isSelected ? "cursor-pointer bg-[#F4F7FF]" : "cursor-pointer bg-white hover:bg-[#F7F9FC]"}
                              >
                                <td className={isSelected ? "border-b border-[#E5EAF2] border-l-2 border-l-[#407AFF] px-3 py-3" : "border-b border-[#E5EAF2] border-l-2 border-l-transparent px-3 py-3"}>
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <p className="truncate font-semibold text-[#111827]" title={template.name}>{template.name}</p>
                                      {template.isDefault ? <span className="shrink-0 rounded-full border border-[#CFE0FF] bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#407AFF]">默认</span> : null}
                                    </div>
                                    <p className="mt-1 truncate text-xs text-[#7C8798]" title={template.description || undefined}>{template.description || "无模板说明"}</p>
                                  </div>
                                </td>
                                <td className="border-b border-[#E5EAF2] px-3 py-3 text-center text-[#34445A]">
                                  <span className="block truncate" title={template.decorationType || "未设置"}>{template.decorationType || "未设置"}</span>
                                </td>
                                <td className="border-b border-[#E5EAF2] px-3 py-3 text-center font-semibold tabular-nums text-[#34445A]">{template.stageCount}</td>
                                <td className="border-b border-[#E5EAF2] px-3 py-3 text-center font-semibold tabular-nums text-[#34445A]">{template.nodeCount}</td>
                                <td className="border-b border-[#E5EAF2] px-3 py-3 text-center font-semibold tabular-nums text-[#34445A]">{template.acceptanceCount}</td>
                                <td className="border-b border-[#E5EAF2] px-3 py-3 text-center text-[#34445A]">
                                  <span className="block truncate" title={template.durationText || "未设置"}>{template.durationText || "未设置"}</span>
                                </td>
                                <td className="border-b border-[#E5EAF2] px-3 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      selectConstructionTemplate(template);
                                    }}
                                    className={isSelected
                                      ? "inline-flex h-8 min-w-[62px] items-center justify-center rounded-lg border border-[#DCE4F0] bg-white px-3 text-xs font-semibold text-[#64748B]"
                                      : "inline-flex h-8 min-w-[62px] items-center justify-center rounded-lg border border-[#407AFF] bg-[#407AFF] px-3 text-xs font-semibold text-white transition hover:border-[#2F66E8] hover:bg-[#2F66E8]"
                                    }
                                  >
                                    {isSelected ? "已选" : "选择"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="construction-template-picker-footer flex items-center justify-between gap-3 border-t border-[#E7E9EE] bg-white px-5 py-3">
                  <p className="min-w-0 truncate text-xs font-semibold text-[#7C8798]">
                    当前选择：{selectedConstructionTemplateConfig.name || "未选择施工模板"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setConstructionTemplatePickerOpen(false);
                      setConstructionTemplateSearch("");
                    }}
                    className="inline-flex h-9 min-h-9 items-center justify-center rounded-lg border border-[#DCE4F0] bg-white px-3 py-0 text-xs font-semibold text-[#34445A] transition hover:border-[#C7D2E2] hover:bg-[#F7F9FC]"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
          {quotaPickerTarget && (
            <div className="quota-template-picker absolute inset-0 z-[70]">
              <div className="quota-template-picker-shell flex h-full w-full flex-col overflow-hidden bg-surface-50">
                <div className="quota-template-picker-header flex items-center justify-between border-b border-surface-200 bg-white px-6 py-4">
                  <div className="min-w-0">
                    <p className="quota-template-picker-title truncate text-base font-semibold text-surface-900">
                      {quotaPickerTarget.quotaItemId
                        ? "更换定额"
                        : getProjectGroupAddText(templateProjectGroups, quotaPickerTarget.quoteScope)}
                    </p>
                    <p className="quota-template-picker-summary mt-0.5 text-xs text-surface-500">
                      共 {filteredQuotaLibraryItems.length} 条结果{filteredQuotaLibraryItems.length > visibleQuotaLibraryItems.length ? "，已显示前 200 条" : ""}{pickerIsMultiSelect ? `，已选 ${pickedQuotaIds.length} 条` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => { setQuotaPickerTarget(null); setPickedQuotaIds([]); resetCustomQuotaDraft(); }} className="quota-template-picker-close inline-flex h-9 w-9 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="关闭定额选择">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="quota-template-picker-toolbar grid gap-3 border-b border-surface-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <label className="quota-template-picker-search flex min-h-10 items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 text-sm text-surface-500">
                    <Search className="h-4 w-4 shrink-0" />
                    <input
                      value={quotaPickerSearch}
                      onChange={(event) => setQuotaPickerSearch(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-surface-400"
                      placeholder="搜索定额编码、项目名称、分类、单位"
                      autoFocus
                    />
                  </label>
                  <SystemSelect value={quotaPickerCategory} onChange={(event) => setQuotaPickerCategory(event.target.value)} className="quota-template-picker-select input-field h-10 py-0">
                    <option value="">全部分类</option>
                    {quotaCategoryOptions.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </SystemSelect>
                  <button
                    type="button"
                    onClick={() => setShowCustomQuotaForm((current) => !current)}
                    className="quota-template-picker-custom-toggle inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm font-semibold text-primary-700 transition hover:bg-primary-100"
                  >
                    <Plus className="h-4 w-4" />
                    新增自定义项目
                  </button>
                </div>

                {showCustomQuotaForm && (
                  <div className="quota-template-picker-custom border-b border-surface-200 bg-white px-4 pb-4">
                    <div className="quota-template-picker-custom-panel rounded-lg border border-primary-100 bg-primary-50/50 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-surface-900">新增自定义项目</p>
                        </div>
                        <button type="button" onClick={() => resetCustomQuotaDraft()} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-surface-400 hover:bg-white hover:text-surface-700" aria-label="收起自定义项目">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_90px_110px_110px_110px_96px]">
                        <label className="space-y-1">
                          <span className="text-xs font-semibold text-surface-600">项目名称</span>
                          <input
                            value={customQuotaDraft.name}
                            onChange={(event) => setCustomQuotaDraft((current) => ({ ...current, name: event.target.value }))}
                            className="input-field h-9 py-0"
                            placeholder="如：定制柜"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold text-surface-600">单位</span>
                          <input
                            value={customQuotaDraft.unit}
                            onChange={(event) => setCustomQuotaDraft((current) => ({ ...current, unit: event.target.value }))}
                            className="input-field h-9 py-0"
                            placeholder="㎡/项"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold text-surface-600">人工单价</span>
                          <input
                            {...getTemplateNumberInputProps("customQuota.laborPrice", customQuotaDraft.laborPrice, (value) => setCustomQuotaDraft((current) => ({ ...current, laborPrice: value })))}
                            className="input-field h-9 py-0 text-right tabular-nums"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold text-surface-600">材料单价</span>
                          <input
                            {...getTemplateNumberInputProps("customQuota.materialPrice", customQuotaDraft.materialPrice, (value) => setCustomQuotaDraft((current) => ({ ...current, materialPrice: value })))}
                            className="input-field h-9 py-0 text-right tabular-nums"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold text-surface-600">客户单价</span>
                          <input
                            {...getTemplateNumberInputProps("customQuota.totalPrice", customQuotaDraft.totalPrice, (value) => setCustomQuotaDraft((current) => ({ ...current, totalPrice: value })))}
                            className="input-field h-9 py-0 text-right font-semibold tabular-nums text-red-600"
                          />
                        </label>
                        <label className="flex items-end">
                          <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 text-xs font-semibold text-surface-600">
                            <input
                              type="checkbox"
                              checked={customQuotaDraft.isSpecialPrice}
                              onChange={(event) => setCustomQuotaDraft((current) => ({ ...current, isSpecialPrice: event.target.checked }))}
                              className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                            />
                            特价
                          </span>
                        </label>
                        <label className="space-y-1 lg:col-span-5">
                          <span className="text-xs font-semibold text-surface-600">施工说明</span>
                          <textarea
                            value={customQuotaDraft.constructionDescription}
                            onChange={(event) => setCustomQuotaDraft((current) => ({ ...current, constructionDescription: event.target.value }))}
                            className="input-field min-h-16 resize-none leading-5"
                            placeholder="填写施工做法、材料说明或计价说明"
                          />
                        </label>
                        <div className="flex items-end">
                          <button type="button" onClick={addCustomQuotaForTarget} className="btn-primary h-10 w-full">
                            添加到当前空间
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="quota-template-picker-body min-h-0 flex-1 overflow-y-auto p-5">
                  {quotaLibraryItems.length === 0 ? (
                    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-surface-50 px-4 text-center">
                      <p className="text-sm font-semibold text-surface-700">定额库暂无启用定额</p>
                      <p className="mt-1 text-xs text-surface-500">可先在定额库维护定额，也可以点击上方“新增自定义项目”直接加入当前模板。</p>
                    </div>
                  ) : visibleQuotaLibraryItems.length === 0 ? (
                    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-surface-50 px-4 text-center">
                      <p className="text-sm font-semibold text-surface-700">没有匹配的定额</p>
                      <p className="mt-1 text-xs text-surface-500">换个关键词或分类再试，也可以点击上方“新增自定义项目”。</p>
                    </div>
                  ) : (
                    <div className="quota-template-picker-table-wrap overflow-hidden rounded-lg border border-surface-200">
                      <table className="quota-template-picker-table w-full table-fixed text-sm">
                        <colgroup>
                          <col style={{ width: 40 }} />
                          <col style={{ width: 112 }} />
                          <col style={{ width: 78 }} />
                          <col style={{ width: 230 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 76 }} />
                          <col style={{ width: 76 }} />
                          <col style={{ width: 78 }} />
                          <col />
                          <col style={{ width: 58 }} />
                        </colgroup>
                        <thead className="bg-surface-50 text-xs font-semibold text-surface-600">
                          <tr className="border-b border-surface-200">
                            <th className="px-3 py-2 text-center">
                              {pickerIsMultiSelect ? (
                                <input
                                  type="checkbox"
                                  checked={isVisiblePickerAllSelected}
                                  disabled={visiblePickerIds.length === 0}
                                  onChange={toggleVisiblePickedQuotas}
                                  className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                                  aria-label="选择当前显示的定额"
                                />
                              ) : "选择"}
                            </th>
                            <th className="px-3 py-2 text-left">定额编码</th>
                            <th className="px-3 py-2 text-left">分类</th>
                            <th className="px-3 py-2 text-left">项目名称</th>
                            <th className="px-3 py-2 text-center">单位</th>
                            <th className="px-3 py-2 text-right">人工单价</th>
                            <th className="px-3 py-2 text-right">材料单价</th>
                            <th className="px-3 py-2 text-right">客户单价</th>
                            <th className="px-3 py-2 text-left">施工说明</th>
                            <th className="px-3 py-2 text-center">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100 bg-white">
                          {visibleQuotaLibraryItems.map((quota) => {
                            const isPicked = pickedQuotaIdSet.has(quota.id);
                            return (
                            <tr key={quota.id} className={isPicked ? "bg-primary-50/70 hover:bg-primary-50" : "bg-white hover:bg-surface-50"}>
                              <td className="px-3 py-2 text-center">
                                {pickerIsMultiSelect ? (
                                  <input
                                    type="checkbox"
                                    checked={isPicked}
                                    onChange={() => togglePickedQuota(quota.id)}
                                    className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                                    aria-label={`选择${quota.name}`}
                                  />
                                ) : (
                                  <span className="text-xs text-surface-400">单选</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-surface-600">{quota.code || "-"}</td>
                              <td className="px-3 py-2 text-surface-600">
                                <span className="block truncate" title={quota.category || undefined}>{quota.category || "-"}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="block truncate font-semibold text-surface-900" title={quota.name}>{quota.name}</span>
                              </td>
                              <td className="px-3 py-2 text-center text-surface-600">{quota.unit || "-"}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-surface-700">{formatAmount(quota.laborPrice)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-surface-700">{formatAmount(quota.materialPrice)}</td>
                              <td className="relative px-3 py-2 pr-7 text-right font-semibold tabular-nums text-red-600">
                                {quota.isSpecialPrice && (
                                  <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-red-200 bg-red-50 text-[10px] font-bold leading-none text-red-600" title="特价项目">
                                    特
                                  </span>
                                )}
                                {formatAmount(quota.totalPrice)}
                              </td>
                              <td className="px-3 py-2 text-surface-700">
                                <p className="line-clamp-3 leading-5" title={quota.constructionDescription || undefined}>{quota.constructionDescription || "-"}</p>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => chooseQuotaForTarget(quota)}
                                  className={isPicked
                                    ? "inline-flex h-8 w-[52px] items-center justify-center rounded-[8px] border border-primary-200 bg-primary-50 px-3 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                                    : "inline-flex h-8 w-[52px] items-center justify-center rounded-[8px] border border-primary-600 bg-primary-600 px-3 text-xs font-semibold text-white transition hover:bg-primary-700"
                                  }
                                >
                                  {pickerIsMultiSelect ? (isPicked ? "取消" : "选择") : "选择"}
                                </button>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {pickerIsMultiSelect && (
                  <div className="quota-template-picker-footer flex items-center justify-between border-t border-surface-200 bg-white px-6 py-4">
                    <button type="button" onClick={() => setPickedQuotaIds([])} className="btn-secondary" disabled={pickedQuotaIds.length === 0}>清空选择</button>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { setQuotaPickerTarget(null); setPickedQuotaIds([]); resetCustomQuotaDraft(); }} className="btn-secondary">取消</button>
                      <button type="button" onClick={addPickedQuotasForTarget} disabled={pickedQuotaIds.length === 0} className="btn-primary">
                        添加所选{pickedQuotaIds.length > 0 ? `（${pickedQuotaIds.length}）` : ""}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <style jsx global>{`
        .quota-template-space-config {
          overflow: hidden;
          border-color: #dbe4f0 !important;
          border-radius: 14px !important;
          background: #f6f8fb !important;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
          font-size: 12px !important;
        }
        .quota-template-space-config input,
        .quota-template-space-config button,
        .quota-template-space-config table,
        .quota-template-space-config textarea,
        .quota-template-space-config select {
          font-size: 12px !important;
        }
        .quota-template-space-config-head {
          min-height: 56px;
          border-color: #e4ebf4 !important;
          background: #ffffff !important;
        }
        .quota-template-space-config-head p:first-child {
          color: #182230 !important;
          font-size: 14px !important;
          letter-spacing: 0 !important;
        }
        .quota-template-space-config-head p:last-child {
          color: #667085 !important;
        }
        .quota-template-space-config-body {
          padding: 10px !important;
          background: #f6f8fb;
        }
        .quota-template-mode-strip {
          min-height: 34px;
          margin-bottom: 8px;
          border-color: #dbe7ff !important;
          border-radius: 10px !important;
          background: #eef5ff !important;
          color: #315cba !important;
        }
        .quota-template-space-workbench {
          display: grid;
          min-height: 520px;
          grid-template-columns: 236px 1fr;
          gap: 10px;
        }
        .quota-template-space-sidebar,
        .quota-template-space-content,
        .quota-template-space-main,
        .quota-template-project-board {
          min-height: 0;
        }
        .quota-template-space-sidebar {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #dfe7f2;
          border-radius: 14px;
          background: #f8fafc;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
        }
        .quota-template-space-sidebar-head {
          display: flex;
          min-height: 48px;
          align-items: center;
          justify-content: flex-start;
          border-bottom: 1px solid #e7edf5;
          background: transparent;
          padding: 10px 12px;
          color: #182230;
          font-size: 12px;
          font-weight: 750;
        }
        .quota-template-space-sidebar-head::after,
        .quota-template-space-sidebar-head em {
          display: none !important;
          content: none !important;
        }
        .quota-template-space-sidebar-head span {
          display: inline-flex;
          min-width: 0;
          align-items: center;
          letter-spacing: 0;
        }
        .quota-template-space-toolbar {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
          padding: 10px !important;
        }
        .quota-template-space-toolbar-inner {
          display: grid !important;
          min-height: 100%;
          align-content: start;
          gap: 7px !important;
          border-bottom: 0 !important;
          padding-bottom: 0 !important;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab] {
          position: relative;
          width: 100% !important;
          height: 42px !important;
          justify-content: flex-start;
          border-color: #e1e8f2 !important;
          border-radius: 11px !important;
          background: #ffffff !important;
          padding: 0 8px 0 9px !important;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.025);
          transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab]::before {
          content: "";
          position: absolute;
          left: 0;
          top: 10px;
          bottom: 10px;
          width: 3px;
          border-radius: 0 999px 999px 0;
          background: transparent;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab]:hover {
          border-color: #c9d8ea !important;
          background: #ffffff !important;
          box-shadow: 0 8px 18px rgba(15, 35, 70, 0.06);
          transform: translateY(-1px);
        }
        .quota-template-space-toolbar-inner [data-template-space-tab][class*="bg-primary-600"] {
          border-color: #9bbcff !important;
          background: linear-gradient(180deg, #f7faff 0%, #edf4ff 100%) !important;
          box-shadow: inset 0 0 0 1px rgba(47, 111, 235, 0.08), 0 6px 14px rgba(47, 111, 235, 0.08);
        }
        .quota-template-space-toolbar-inner [data-template-space-tab][class*="bg-primary-600"]::before {
          background: #2f6feb;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab] input {
          text-align: left !important;
          font-size: 12px !important;
          font-weight: 700 !important;
          letter-spacing: 0 !important;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab][class*="bg-primary-600"] input {
          color: #1d4ed8 !important;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab] button {
          color: #a5b1c2 !important;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab]:hover button,
        .quota-template-space-toolbar-inner [data-template-space-tab][class*="bg-primary-600"] button {
          color: #407aff !important;
        }
        .quota-template-space-item-count {
          display: inline-flex;
          height: 22px;
          min-width: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #eef3f8;
          color: #64748b;
          font-size: 12px;
          font-weight: 750;
        }
        .quota-template-space-toolbar-inner [data-template-space-tab][class*="bg-primary-600"] .quota-template-space-item-count {
          background: #2f6feb;
          color: #ffffff;
        }
        .quota-template-add-space {
          width: 100%;
          min-height: 40px !important;
          margin-top: 3px;
          justify-content: center;
          border-color: #dbe7ff !important;
          border-style: solid !important;
          border-radius: 11px !important;
          background: #f5f8ff !important;
          color: #315cba !important;
          font-size: 12px !important;
          font-weight: 800 !important;
        }
        .quota-template-add-space:hover {
          border-color: #adc7ff !important;
          background: #edf4ff !important;
          color: #245ecf !important;
        }
        .quota-template-space-content {
          overflow: hidden;
          border: 1px solid #dfe7f2;
          border-radius: 12px;
          background: #ffffff;
        }
        .quota-template-space-main {
          display: flex;
          height: 100%;
          min-height: 520px;
          flex-direction: column;
        }
        .quota-template-space-main-head {
          display: flex;
          min-height: 52px;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
          border-bottom: 1px solid #e7edf5;
          background: #ffffff;
          padding: 8px 12px;
        }
        .quota-template-space-main-left,
        .quota-template-space-main-right {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
        }
        .quota-template-space-main-left {
          flex: 1 1 auto;
        }
        .quota-template-space-main-right {
          flex: 0 0 auto;
          justify-content: flex-end;
        }
        .quota-template-space-main-title {
          display: inline-flex;
          height: 32px;
          min-width: 132px;
          max-width: 180px;
          align-items: center;
          flex: 0 0 auto;
        }
        .quota-template-space-main-title strong {
          display: inline-flex;
          height: 32px;
          align-items: center;
          overflow: hidden;
          color: #182230;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quota-template-space-main-groups {
          display: flex;
          min-width: 0;
          flex: 1 1 auto;
          align-items: center;
          gap: 6px;
        }
        .quota-template-space-main-groups-empty {
          flex: 0 0 auto;
          max-width: 240px;
        }
        .quota-template-project-group-tabs {
          display: flex;
          min-width: 0;
          max-width: min(620px, 100%);
          flex: 0 1 auto;
          align-items: center;
          gap: 4px;
          overflow-x: auto;
          padding: 1px;
        }
        .quota-template-project-group-tabs::-webkit-scrollbar {
          height: 0;
        }
        .quota-template-space-main-groups [data-template-project-group-tab] {
          height: 32px !important;
          min-width: 108px !important;
          max-width: 156px;
          flex: 0 0 auto;
          border: 1px solid #dfe7f2;
          border-radius: 8px !important;
          background: #ffffff;
          padding: 0 5px !important;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.025);
        }
        .quota-template-space-main-groups [data-template-project-group-tab]:hover {
          border-color: #cfe0ff;
          background: #f8fbff;
        }
        .quota-template-space-main-groups [data-template-project-group-tab][class*="bg-primary-600"] {
          border-color: #2f6feb;
          background: #2f6feb;
          box-shadow: 0 8px 18px rgba(47, 111, 235, 0.18);
        }
        .quota-template-space-main-groups [data-template-project-group-tab] input {
          text-align: left !important;
          font-size: 12px !important;
          font-weight: 650 !important;
          letter-spacing: 0 !important;
        }
        .quota-template-project-group-create {
          display: inline-flex;
          height: 32px;
          min-width: 146px;
          flex: 0 0 auto;
          align-items: center;
          gap: 6px;
          border: 1px solid #d9e5f2;
          border-radius: 8px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          padding: 0 4px 0 9px;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);
          transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
        }
        .quota-template-project-group-create:focus-within {
          border-color: #9cc2ff;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.1), 0 1px 2px rgba(16, 24, 40, 0.04);
        }
        .quota-template-project-group-create-icon {
          flex: 0 0 auto;
          color: #6f8aad;
        }
        .quota-template-project-group-create input {
          min-width: 0;
          flex: 1;
          color: #182230 !important;
          font-size: 12px !important;
          font-weight: 650 !important;
        }
        .quota-template-project-group-create button,
        .quota-template-project-group-delete {
          display: inline-flex;
          height: 26px;
          width: 26px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }
        .quota-template-project-group-create button {
          border: 1px solid #cfe0ff;
          background: #eef5ff;
          color: #2f6feb;
        }
        .quota-template-project-group-create button:hover {
          border-color: #a9c8ff;
          background: #2f6feb;
          color: #ffffff;
          transform: translateY(-1px);
        }
        .quota-template-project-group-option {
          display: inline-flex;
          height: 32px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 1px solid #d9e5f2;
          border-radius: 8px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          padding: 0 10px;
          color: #40566f;
          font-size: 12px;
          font-weight: 650;
          line-height: 1;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.025);
          transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
          white-space: nowrap;
        }
        .quota-template-project-group-option svg {
          display: block;
          flex: 0 0 auto;
        }
        .quota-template-project-group-option:hover {
          border-color: #a9c8ff;
          background: #eef5ff;
          color: #2f6feb;
          transform: translateY(-1px);
        }
        .quota-template-project-group-delete {
          border: 1px solid #fee2e2;
          background: #ffffff;
          color: #ef4444;
        }
        .quota-template-project-group-delete:hover {
          border-color: #fecaca;
          background: #fff5f5;
          color: #dc2626;
          transform: translateY(-1px);
        }
        .quota-template-space-main-meta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #52647b;
          font-size: 12px;
          font-weight: 650;
          white-space: nowrap;
        }
        .quota-template-space-main-meta span {
          display: inline-flex;
          height: 32px;
          align-items: center;
          gap: 5px;
          border: 1px solid #dfe7f2;
          border-radius: 8px;
          background: #ffffff;
          padding: 0 10px;
          color: #40566f;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.025);
        }
        .quota-template-space-main-meta-icon {
          color: #6f8aad;
        }
        .quota-template-space-main-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .quota-template-space-main-actions button {
          display: inline-flex;
          height: 32px;
          align-items: center;
          gap: 6px;
          border: 1px solid #dfe7f2;
          border-radius: 8px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          padding: 0 9px;
          color: #52647b;
          font-size: 12px;
          font-weight: 650;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.025);
          transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }
        .quota-template-space-main-actions button:hover {
          border-color: #cfe0ff;
          background: #f6f9ff;
          color: #315cba;
          transform: translateY(-1px);
        }
        .quota-template-space-main-actions button[data-danger] {
          border-color: #fee2e2;
          color: #ef4444;
        }
        .quota-template-space-main-actions button[data-danger]:hover {
          border-color: #fecaca;
          background: #fff5f5;
          color: #dc2626;
        }
        .quota-template-project-board {
          display: flex;
          flex: 1;
          flex-direction: column;
          border: 0 !important;
          border-radius: 0 !important;
        }
        .quota-template-project-board-head {
          display: none !important;
          width: 100% !important;
          flex: 0 0 auto !important;
          align-items: center !important;
          justify-content: space-between !important;
          border-color: #e7edf5 !important;
          background: #f8fafc !important;
          padding: 10px 12px !important;
        }
        .quota-template-project-board-head > div:first-child {
          display: flex !important;
          min-width: 0 !important;
          flex: 1 1 auto !important;
          flex-wrap: wrap !important;
          align-items: center !important;
          gap: 8px !important;
        }
        .quota-template-project-board-head .inline-flex.w-fit {
          min-height: 36px;
          border-color: #dfe7f2 !important;
          border-radius: 10px !important;
          background: #ffffff !important;
        }
        .quota-template-project-board-head [data-template-project-group-tab] {
          min-width: 108px !important;
          height: 30px !important;
          border-radius: 8px !important;
        }
        .quota-template-project-board-head [data-template-project-group-tab] input {
          text-align: left !important;
          letter-spacing: 0 !important;
        }
        .quota-template-project-board-head .border-dashed {
          height: 36px !important;
          border-color: #d7e0ec !important;
          border-radius: 10px !important;
          background: #ffffff !important;
        }
        .quota-template-project-board-head .min-w-\\[180px\\] {
          color: #667085 !important;
          font-size: 12px !important;
          line-height: 1.4 !important;
        }
        .quota-template-project-empty {
          flex: 1;
          width: 100% !important;
          min-height: 320px !important;
          background: #ffffff;
        }
        .quota-template-empty-panel {
          display: flex;
          width: min(360px, 100%);
          flex-direction: column;
          align-items: center;
          border: 1px solid #dfe7f2;
          border-radius: 12px;
          background: #fbfcff;
          padding: 22px 24px;
          box-shadow: none;
        }
        .quota-template-empty-kicker {
          display: inline-flex;
          min-height: 26px;
          align-items: center;
          border-radius: 999px;
          background: #eef5ff;
          padding: 0 10px;
          color: #407aff;
          font-size: 12px;
          font-weight: 800;
        }
        .quota-template-empty-title {
          margin: 0;
          color: #182230;
          font-size: 12px;
          font-weight: 750;
          line-height: 1.4;
        }
        .quota-template-empty-copy {
          margin: 6px 0 0;
          color: #667085;
          font-size: 12px;
          line-height: 1.6;
        }
        .quota-template-empty-action {
          display: inline-flex;
          min-height: 40px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 18px;
          border-radius: 10px;
          background: #2f6feb;
          padding: 0 16px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 800;
          transition: background-color 0.16s ease, transform 0.16s ease;
        }
        .quota-template-empty-action:hover {
          background: #245ecf;
          transform: translateY(-1px);
        }
        .quota-template-table-empty {
          display: flex;
          min-height: 180px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #667085;
        }
        .quota-template-table-empty p {
          margin: 0;
          color: #344054;
          font-size: 14px;
          font-weight: 750;
        }
        .quota-template-table-empty span {
          margin-top: 6px;
          color: #8a98aa;
          font-size: 12px;
        }
        .quota-template-project-board table thead {
          background: #f3f6fb !important;
        }
        .quota-template-project-board table th {
          height: 32px;
          border-bottom: 1px solid #e4ebf4;
          color: #52647b !important;
          font-size: 11px;
          font-weight: 750;
          white-space: nowrap;
        }
        .quota-template-project-board table td {
          height: 32px;
          border-bottom-color: #edf2f7;
          vertical-align: middle;
          font-size: 12px;
        }
        .quota-template-project-board [data-template-quota-row] {
          height: 32px !important;
        }
        .quota-template-project-board [data-template-quota-row] td {
          height: 32px !important;
          padding-top: 2px !important;
          padding-bottom: 2px !important;
          line-height: 16px !important;
        }
        .quota-template-project-board [data-template-quota-row] p.line-clamp-3 {
          display: block !important;
          overflow: hidden !important;
          color: #111827 !important;
          line-height: 18px !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          -webkit-line-clamp: initial !important;
          -webkit-box-orient: initial !important;
        }
        .quota-template-project-board [data-template-quota-row] button {
          height: 24px !important;
          width: 24px !important;
          border-radius: 6px !important;
        }
        .quota-template-project-board [data-template-quota-row] svg {
          height: 14px !important;
          width: 14px !important;
        }
        .quota-template-project-board table tbody tr:hover {
          background: #f8fbff;
        }
        .quota-template-project-board > div:last-child {
          background: #fbfcff !important;
          padding: 10px 12px !important;
        }
        .quota-template-project-board > div:last-child button {
          min-height: 40px !important;
          border-color: #b7e4d2 !important;
          border-radius: 10px !important;
          background: #f0fdf7 !important;
          color: #047857 !important;
        }
        .quota-template-project-board > div:last-child button:hover {
          border-color: #6ee7b7 !important;
          background: #dcfce7 !important;
          color: #047857 !important;
        }
        .quota-template-picker {
          display: flex;
          align-items: center;
          justify-content: center;
          left: 0 !important;
          padding: 54px 72px;
          background: rgba(15, 23, 42, 0.06) !important;
          backdrop-filter: blur(6px) saturate(1.04);
          -webkit-backdrop-filter: blur(6px) saturate(1.04);
        }
        .quota-template-picker-shell {
          width: min(1260px, 100%);
          height: min(680px, calc(100vh - 108px)) !important;
          min-height: 500px;
          overflow: hidden;
          border: 1px solid rgba(214, 224, 238, 0.95);
          border-radius: 14px;
          background: #f6f8fb !important;
          box-shadow: 0 20px 54px rgba(15, 23, 42, 0.16);
          color: #182230;
          font-size: 12px;
        }
        .quota-template-picker-header {
          min-height: 48px;
          padding: 8px 14px !important;
          border-color: #e3eaf3 !important;
          background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%) !important;
        }
        .quota-template-picker-title {
          font-size: 14px !important;
          font-weight: 750 !important;
          letter-spacing: 0 !important;
          line-height: 20px;
        }
        .quota-template-picker-summary {
          color: #667085 !important;
          font-size: 12px !important;
          line-height: 18px;
        }
        .quota-template-picker-close {
          height: 30px !important;
          width: 30px !important;
          border: 1px solid transparent;
          border-radius: 9px !important;
        }
        .quota-template-picker-close:hover {
          border-color: #dce5f0;
          background: #f6f8fb !important;
          color: #182230 !important;
        }
        .quota-template-picker-toolbar {
          grid-template-columns: minmax(280px, 1fr) 210px auto !important;
          align-items: center;
          gap: 8px !important;
          padding: 8px 14px !important;
          border-color: #e3eaf3 !important;
          background: #f8fafc !important;
        }
        .quota-template-picker-search,
        .quota-template-picker-select,
        .quota-template-picker-custom-toggle {
          height: 32px !important;
          min-height: 32px !important;
          border-radius: 8px !important;
          font-size: 12px !important;
        }
        .quota-template-picker-search {
          border-color: #dce5f0 !important;
          background: #ffffff !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 1px rgba(16, 24, 40, 0.025);
        }
        .quota-template-picker-search:focus-within {
          border-color: #9fc0ff !important;
          box-shadow: 0 0 0 3px rgba(47, 111, 235, 0.1);
        }
        .quota-template-picker-search input {
          height: 30px;
          color: #182230;
          font-size: 12px !important;
        }
        .quota-template-picker-select {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          color: #34445a !important;
          font-weight: 650 !important;
        }
        .quota-template-picker-custom-toggle {
          border-color: #b7e4d2 !important;
          background: #f0fdf7 !important;
          padding: 0 10px !important;
          color: #047857 !important;
          font-size: 12px !important;
          font-weight: 750 !important;
          box-shadow: none !important;
        }
        .quota-template-picker-custom-toggle:hover {
          border-color: #86d9b9 !important;
          background: #dcfce7 !important;
        }
        .quota-template-picker-custom {
          padding: 8px 14px !important;
          border-color: #e3eaf3 !important;
          background: #ffffff !important;
        }
        .quota-template-picker-custom-panel {
          border-color: #dce8d9 !important;
          border-radius: 12px !important;
          background: #f8fbf7 !important;
          padding: 10px !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88);
        }
        .quota-template-picker-custom-panel label span {
          color: #52647b !important;
          font-size: 12px !important;
          font-weight: 700 !important;
        }
        .quota-template-picker-custom-panel .input-field {
          min-height: 32px !important;
          height: 32px;
          border-radius: 8px !important;
          font-size: 12px !important;
        }
        .quota-template-picker-custom-panel textarea.input-field {
          height: auto;
          min-height: 48px !important;
          line-height: 18px !important;
        }
        .quota-template-picker-custom-panel .btn-primary {
          min-height: 32px !important;
          height: 32px !important;
          border-radius: 8px !important;
          padding: 0 12px !important;
          font-size: 12px !important;
          font-weight: 750 !important;
        }
        .quota-template-picker-body {
          padding: 10px 14px !important;
          background: #f6f8fb;
        }
        .quota-template-picker-table-wrap {
          height: 100%;
          overflow: auto !important;
          border-color: #dce5f0 !important;
          border-radius: 12px !important;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035);
        }
        .quota-template-picker-table {
          min-width: 980px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12px !important;
        }
        .quota-template-picker-table thead {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #f8fafc !important;
          color: #52647b !important;
          font-size: 12px !important;
        }
        .quota-template-picker-table th {
          height: 30px;
          border-bottom: 1px solid #dce5f0;
          padding: 0 8px !important;
          font-size: 12px !important;
          font-weight: 750 !important;
          vertical-align: middle;
          white-space: nowrap;
        }
        .quota-template-picker-table td {
          height: 36px;
          padding: 0 8px !important;
          color: #111827 !important;
          font-size: 12px !important;
          line-height: 18px;
          vertical-align: middle;
        }
        .quota-template-picker-table td span,
        .quota-template-picker-table td p,
        .quota-template-picker-table td [class*="text-surface-"] {
          color: #111827 !important;
        }
        .quota-template-picker-table td .text-red-600,
        .quota-template-picker-table td[class*="text-red-600"] {
          color: #dc2626 !important;
        }
        .quota-template-picker-table tbody {
          background: #ffffff !important;
        }
        .quota-template-picker-table tbody tr {
          transition: background-color 0.14s ease;
        }
        .quota-template-picker-table tbody tr:hover {
          background: #f8fbff !important;
        }
        .quota-template-picker-table tbody tr[class*="bg-primary-50"] {
          background: #eef6ff !important;
        }
        .quota-template-picker-table input[type="checkbox"] {
          height: 14px !important;
          width: 14px !important;
        }
        .quota-template-picker-table p.line-clamp-3 {
          display: block;
          overflow: hidden;
          color: #111827 !important;
          line-height: 18px !important;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quota-template-picker-table button {
          height: 26px !important;
          min-height: 26px !important;
          width: 46px !important;
          border-radius: 7px !important;
          padding: 0 !important;
          font-size: 12px !important;
          font-weight: 750 !important;
          box-shadow: none !important;
        }
        .quota-template-picker-footer {
          min-height: 48px;
          padding: 8px 14px !important;
          border-color: #e3eaf3 !important;
          background: rgba(255, 255, 255, 0.96) !important;
          box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.06);
        }
        .quota-template-picker-footer .btn-secondary,
        .quota-template-picker-footer .btn-primary {
          min-height: 32px !important;
          height: 32px !important;
          border-radius: 8px !important;
          padding: 0 11px !important;
          font-size: 12px !important;
          font-weight: 750 !important;
        }
        @media (max-width: 900px) {
          .quota-template-picker {
            padding: 12px;
          }
          .quota-template-picker-shell {
            border-radius: 0;
          }
          .quota-template-picker-toolbar {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 1180px) {
          .quota-template-space-workbench {
            grid-template-columns: 1fr;
          }
          .quota-template-space-sidebar {
            min-height: 0;
          }
          .quota-template-space-toolbar-inner {
            display: flex !important;
            overflow-x: auto;
          }
          .quota-template-space-toolbar-inner [data-template-space-tab],
          .quota-template-add-space {
            width: 132px !important;
            flex: 0 0 auto;
          }
          .quota-template-space-main-head {
            grid-template-columns: 1fr;
            align-items: start;
          }
          .quota-template-space-main-meta,
          .quota-template-space-main-actions {
            justify-content: flex-start;
          }
        }
        .template-space-drop-before,
        .template-space-drop-after,
        .template-project-group-drop-before,
        .template-project-group-drop-after {
          position: relative;
          z-index: 1;
        }
        .template-space-drop-before::before,
        .template-space-drop-after::after,
        .template-project-group-drop-before::before,
        .template-project-group-drop-after::after {
          content: "";
          position: absolute;
          top: -5px;
          bottom: -5px;
          width: 3px;
          border-radius: 999px;
          background: rgb(64, 122, 255);
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.14), 0 6px 14px rgba(64, 122, 255, 0.2);
          pointer-events: none;
        }
        .template-space-drop-before::before {
          left: -7px;
        }
        .template-space-drop-after::after {
          right: -7px;
        }
        .template-project-group-drop-before::before {
          left: -7px;
        }
        .template-project-group-drop-after::after {
          right: -7px;
        }
        .template-space-tab-moved,
        .template-project-group-tab-moved {
          animation: quote-item-settle 560ms ease-out;
          box-shadow: 0 0 0 2px rgba(64, 122, 255, 0.2), 0 8px 18px rgba(64, 122, 255, 0.12);
        }
        .quote-item-row-moved {
          animation: quote-item-settle 560ms ease-out;
        }
        .quote-item-row-moved > td {
          animation: quote-item-cell-settle 560ms ease-out;
        }
        .quote-item-row-drop-before > td {
          box-shadow: inset 0 2px 0 rgba(64, 122, 255, 0.95) !important;
        }
        .quote-item-row-drop-after > td {
          box-shadow: inset 0 -2px 0 rgba(64, 122, 255, 0.95) !important;
        }
        @keyframes quote-item-settle {
          0% { transform: translateY(-8px); }
          55% { transform: translateY(2px); }
          100% { transform: translateY(0); }
        }
        @keyframes quote-item-cell-settle {
          0% {
            background-color: rgba(64, 122, 255, 0.14);
            box-shadow: inset 3px 0 0 rgba(64, 122, 255, 0.72);
          }
          100% {
            background-color: transparent;
            box-shadow: inset 0 0 0 rgba(64, 122, 255, 0);
          }
        }
      `}</style>
    </div>
  );
}
