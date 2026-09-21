"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent as ReactChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Check, ChevronDown, ClipboardList, Copy, GripVertical, HardHat, Layers3, LayoutGrid, LayoutTemplate, Loader2, Package, Pencil, Plus, Power, Search, SlidersHorizontal, Sofa, Star, Tags, Trash2, X } from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import BudgetCompilationEditor from "@/components/BudgetCompilationEditor";
import { useAuth } from "@/lib/auth";
import {
  bindStableFeeFormula,
  feeCalcMethodLabels,
  formatStableFeeFormula,
  getFeeCalcBaseError,
  getStableFeeReferenceIds,
  normalizeFeeCalcBase,
  normalizeFeeCalcMethod,
  remapStableFeeFormulaIds,
  updateStableScopeReferenceLabel,
  type FeeCalcMethod,
  type FeeScopeMode,
} from "@/lib/quotationFeeFormulas";
import { formatAlphaSequence } from "@/lib/quotationSequence";
import {
  calculateQuotationQuantityFormula,
  formatQuotationQuantityFormulaRows,
  parseQuotationQuantityFormula,
  parseQuotationQuantityFormulaRows,
  remapQuotationQuantityFormulaIds,
  serializeQuotationQuantityFormula,
  type QuotationQuantityFormula,
  type QuotationQuantityLinkItem,
} from "@/lib/quotationQuantityLinks";
import SystemSelect, { EXCLUSIVE_DROPDOWN_OPEN_EVENT, notifyExclusiveDropdownOpen } from "@/components/ui/SystemSelect";
import {
  getQuotaTemplateApplicabilityTags,
  getQuotaTemplateScopeLabel,
  getQuotaTemplateScopePath,
  type QuotaTemplateAutoScope,
} from "@/lib/quotaTemplateScope";


import {
  CUSTOM_QUOTA_NUMBER_INPUT_KEYS,
  DEFAULT_PRICING_MODE,
  DEFAULT_TEMPLATE_CREATOR,
  QUOTA_TEMPLATE_DRAFT_STORAGE_KEY,
  applyTemplateSpaceQuantityLinks,
  buildTemplateFeeFormulaContext,
  buildTemplateFeeScopeReferences,
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
  getTemplateProjectGroups,
  getTemplateStatusBadgeClass,
  getTemplateStatusLabel,
  hasTemplateDraftContent,
  initialTemplates,
  isBuiltinProjectGroup,
  excludeOverriddenQuotaFields,
  loadQuotaLibraryItems as loadCachedQuotaLibraryItems,
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
  repairTemplateSpaceQuantityLinksAfterDeletion,
  sanitizeTemplateNumberInputText,
  toAmount,
  toTemplateNumberInputAmount,
  todayText,
  uniqueProjectGroupIds,
  withSpaceProjectGroup,
} from "./quota-templates-shared";

const TEMPLATE_FEE_SUGGESTION_DROPDOWN_ID = "quota-template-fee-suggestion";

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
import {
  TemplateQuantityFormulaEditor,
  TemplateQuantityInput,
  type TemplateQuantityEditorState,
} from "./quota-template-quantity";

function hasBranchTemplateScope(template: QuotaTemplate) {
  return template.autoScope?.scopeType === "branch" && Boolean(template.autoScope.orgUnitId || template.autoScope.branchOrgUnitId);
}

function normalizeTemplateScopeName(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function getTemplateScopeNameConflicts(template: Pick<QuotaTemplate, "spaces" | "projectGroups">) {
  const entries = [
    ...template.spaces.map((space) => ({ type: "space" as const, id: space.id, name: space.name })),
    ...getTemplateProjectGroups(template).map((group) => ({ type: "category" as const, id: group.id, name: group.name })),
  ].filter((entry) => String(entry.name || "").trim());
  const groups = new Map<string, typeof entries>();
  entries.forEach((entry) => {
    const key = normalizeTemplateScopeName(entry.name);
    groups.set(key, [...(groups.get(key) || []), entry]);
  });
  return Array.from(groups.values())
    .filter((items) => items.length > 1)
    .flatMap((items) => items.map((item, index) => ({
      ...item,
      conflictIndex: index,
      conflictNames: items.map((entry) => String(entry.name || "").trim()),
    })));
}

function getTemplateDirtyPayload(template: QuotaTemplate | null) {
  if (!template) return "";
  return JSON.stringify({
    name: template.name,
    type: template.type,
    remark: template.remark,
    autoScope: template.autoScope,
    constructionTemplateConfig: template.constructionTemplateConfig,
    quoteConfig: template.quoteConfig,
    projectGroups: template.projectGroups,
    comprehensiveFeeMode: template.comprehensiveFeeMode,
    comprehensiveFees: template.comprehensiveFees,
    appendixNote: template.appendixNote,
    budgetCompilationHtml: template.budgetCompilationHtml,
    spaces: template.spaces,
  });
}

const templateFeeScopeModeOptions: Array<{ value: FeeScopeMode; label: string }> = [
  { value: "all", label: "全部空间和类别都统计" },
  { value: "exclude", label: "排除选中的空间和类别" },
  { value: "include", label: "仅统计选中的空间和类别" },
];

const templateFeeValueSourceOptions: Array<{ value: NonNullable<TemplateComprehensiveFee["valueSource"]>; label: string }> = [
  { value: "formula", label: "公式" },
  { value: "direct", label: "工程直接费" },
  { value: "fixed", label: "固定金额" },
  { value: "manual", label: "报价时填写" },
  { value: "discount", label: "报价优惠" },
];

const quotaSourceComparableFields = [
  ["code", "定额编码"],
  ["category", "分类"],
  ["priceScene", "价格类型"],
  ["name", "项目名称"],
  ["constructionDescription", "施工说明"],
  ["unit", "单位"],
  ["laborPrice", "人工单价"],
  ["materialPrice", "材料单价"],
  ["totalPrice", "客户单价"],
  ["isSpecialPrice", "特价标记"],
] as const;
type QuotaSourceField = typeof quotaSourceComparableFields[number][0];

function comparableQuotaSourceValue(field: string, value: any) {
  if (["laborPrice", "materialPrice", "totalPrice"].includes(field)) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Number(amount.toFixed(4)) : 0;
  }
  if (field === "isSpecialPrice") return Boolean(value);
  return String(value ?? "").trim();
}

function formatQuotaSourceValue(field: string, value: any) {
  if (["laborPrice", "materialPrice", "totalPrice"].includes(field)) return formatAmount(value);
  if (field === "isSpecialPrice") return Boolean(value) ? "是" : "否";
  return String(value ?? "").trim() || "-";
}

function TemplateProjectGroupIcon({
  scope,
  className = "",
}: {
  scope: string;
  className?: string;
}) {
  if (scope === "foundation") return <HardHat className={className} />;
  if (scope === "main_material") return <Package className={className} />;
  if (scope === "custom_cabinet") return <Sofa className={className} />;
  return <Tags className={className} />;
}

function TemplateFeeScopeSelector({
  mode,
  selectedNames,
  options,
  onModeChange,
  onToggleName,
}: {
  mode: FeeScopeMode;
  selectedNames: string[];
  options: string[];
  onModeChange: (mode: FeeScopeMode) => void;
  onToggleName: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectorId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ left: 0, top: 0 });
  const selectedSet = new Set(selectedNames);
  const selectedText = selectedNames.length > 0 ? selectedNames.join("、") : "请选择范围";
  const modeLabel = mode === "exclude" ? "排除" : mode === "include" ? "仅统计" : "";
  const summary = mode === "all" ? "全部统计" : `${modeLabel}：${selectedText}`;

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 286;
    const viewportPadding = 12;
    const currentHeight = popoverRef.current?.offsetHeight;
    const estimatedHeight = currentHeight || (mode === "all" ? 188 : Math.min(342, 170 + Math.min(Math.max(options.length, 1), 5) * 32));
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, viewportPadding), window.innerWidth - width - viewportPadding);
    const hasRoomAbove = rect.top >= estimatedHeight + viewportPadding;
    const top = hasRoomAbove ? rect.top - estimatedHeight - 6 : Math.min(rect.bottom + 6, window.innerHeight - estimatedHeight - viewportPadding);
    setPopoverPosition({ left, top: Math.max(viewportPadding, top) });
  }, [mode, options.length]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (open) updatePopoverPosition();
  }, [open, mode, selectedNames.length, options.length, updatePopoverPosition]);

  useEffect(() => {
    const handleOtherDropdownOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id && detail.id !== selectorId) setOpen(false);
    };
    window.addEventListener(EXCLUSIVE_DROPDOWN_OPEN_EVENT, handleOtherDropdownOpen);
    return () => window.removeEventListener(EXCLUSIVE_DROPDOWN_OPEN_EVENT, handleOtherDropdownOpen);
  }, [selectorId]);

  useEffect(() => {
    if (open) notifyExclusiveDropdownOpen(selectorId);
  }, [open, selectorId]);

  const popover = open && typeof document !== "undefined" ? createPortal(
    <div className="quota-template-scope-popover-layer">
      <div
        ref={popoverRef}
        className="quota-template-fee-scope-popover"
        style={{ left: popoverPosition.left, top: popoverPosition.top }}
      >
        <div className="quota-template-fee-scope-popover-copy">
          <strong>公式里没有指定空间或类别的费用，按这里统计</strong>
          <span>例如“直接费”会按这里统计；“拆除项目”等已指定范围的费用不受影响。</span>
        </div>
        <div className="quota-template-fee-scope-popover-segment" role="group" aria-label="默认统计范围">
          {templateFeeScopeModeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              data-active={mode === option.value || undefined}
              onClick={() => {
                onModeChange(option.value);
                if (option.value === "all") setOpen(false);
              }}
            >
              <span>{option.label}</span>
              <span className="quota-template-fee-scope-mode-dot" />
            </button>
          ))}
        </div>
        {mode !== "all" && (
          <div className="quota-template-fee-scope-popover-list">
            {options.length === 0 ? (
              <span className="quota-template-fee-scope-empty">暂无空间/类别</span>
            ) : options.map((name) => {
              const checked = selectedSet.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  data-active={checked || undefined}
                  onClick={() => onToggleName(name)}
                  title={name}
                >
                  <span className="quota-template-fee-scope-check">{checked && <Check className="h-2.5 w-2.5" />}</span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div className="quota-template-fee-scope-compact" ref={wrapperRef}>
        <button
          ref={triggerRef}
          type="button"
          className="quota-template-fee-scope-trigger"
          onClick={() => {
            updatePopoverPosition();
            setOpen((current) => !current);
          }}
          title={summary}
        >
          {mode === "all" ? (
            <span className="quota-template-fee-scope-trigger-text">{summary}</span>
          ) : (
            <>
              <span className="quota-template-fee-scope-kind">{modeLabel}</span>
              <span className="quota-template-fee-scope-trigger-text">{selectedText}</span>
            </>
          )}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {popover}
    </>
  );
}

export default function QuotaTemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const currentCreatorName = user?.name?.trim() || DEFAULT_TEMPLATE_CREATOR;
  const [templates, setTemplates] = useState<QuotaTemplate[]>(initialTemplates);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pricingModeFilter, setPricingModeFilter] = useState<PricingMode | "">("");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "">("");
  const [branchScopeFilter, setBranchScopeFilter] = useState("");
  const [selectedId, setSelectedId] = useState(templates[0]?.id || "");
  const [editingTemplate, setEditingTemplate] = useState<QuotaTemplate | null>(null);
  const [editingMode, setEditingMode] = useState<TemplateEditMode>("edit");
  const [activeSpaceId, setActiveSpaceId] = useState("");
  const [activeQuotaScope, setActiveQuotaScope] = useState<TemplateSpaceQuotaScope>("foundation");
  const [quotaLibraryItems, setQuotaLibraryItems] = useState<QuotaLibraryItem[]>([]);
  const [quotaLibraryStoreOptions, setQuotaLibraryStoreOptions] = useState<Array<{ id: string; name: string; itemCount: number }>>([]);
  const [quotaLibraryLoading, setQuotaLibraryLoading] = useState(false);
  const [quotaLibraryError, setQuotaLibraryError] = useState("");
  const [quotaDiffOpen, setQuotaDiffOpen] = useState(false);
  const [quotaDiffExpandedFields, setQuotaDiffExpandedFields] = useState<string[]>([]);
  const [constructionTemplateOptions, setConstructionTemplateOptions] = useState<ConstructionTemplateOption[]>([]);
  const [templateScopeOptions, setTemplateScopeOptions] = useState<Array<{ id: string; name: string; path: string; type: string }>>([]);
  const [constructionTemplateLoading, setConstructionTemplateLoading] = useState(false);
  const [constructionTemplateError, setConstructionTemplateError] = useState("");
  const [constructionTemplatePickerOpen, setConstructionTemplatePickerOpen] = useState(false);
  const [constructionTemplateSearch, setConstructionTemplateSearch] = useState("");
  const [quotaPickerTarget, setQuotaPickerTarget] = useState<QuotaPickerTarget>(null);
  const [quotaPickerSearch, setQuotaPickerSearch] = useState("");
  const [quotaPickerCategory, setQuotaPickerCategory] = useState("");
  const [quotaPickerPriceScene, setQuotaPickerPriceScene] = useState("");
  const [quotaPickerStore, setQuotaPickerStore] = useState("");
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
  const [templateSaveStatus, setTemplateSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [unsavedClosePromptOpen, setUnsavedClosePromptOpen] = useState(false);
  const [pendingTemplateNavigationHref, setPendingTemplateNavigationHref] = useState("");
  const [numberInputDrafts, setNumberInputDrafts] = useState<Record<string, string>>({});
  const [feeFormulaDrafts, setFeeFormulaDrafts] = useState<Record<string, string>>({});
  const [templateQuantityEditor, setTemplateQuantityEditor] = useState<TemplateQuantityEditorState | null>(null);
  const templatesRef = useRef<QuotaTemplate[]>(initialTemplates);
  const fullTemplateCacheRef = useRef(new Map<string, QuotaTemplate>());
  const openedTemplateRef = useRef<QuotaTemplate | null>(null);
  const openedTemplatePayloadRef = useRef("");
  const pendingTemplateNavigationHrefRef = useRef("");
  const pointerSpaceDragRef = useRef<{ sourceId: string; startX: number; startY: number; moved: boolean; targetId: string | null; position: ItemDropPosition } | null>(null);
  const pointerProjectGroupDragRef = useRef<PointerProjectGroupDragState>(null);
  const pointerQuotaDragRef = useRef<PointerQuotaDragState>(null);
  const pointerFeeDragRef = useRef<PointerFeeDragState>(null);
  const quotaDragAutoScrollFrameRef = useRef<number | null>(null);
  const quotaDragPointerRef = useRef({ x: 0, y: 0 });
  const projectScrollRef = useRef<HTMLDivElement | null>(null);
  const movedSpaceTimerRef = useRef<number | null>(null);
  const movedProjectGroupTimerRef = useRef<number | null>(null);
  const movedQuotaTimerRef = useRef<number | null>(null);
  const movedFeeTimerRef = useRef<number | null>(null);
  const spaceAutoSaveTimerRef = useRef<number | null>(null);
  const templateSaveTimerRef = useRef<number | null>(null);
  const templateSaveStatusTimerRef = useRef<number | null>(null);
  const spaceAutoSaveRunRef = useRef(0);
  const lastSpaceAutoSavePayloadRef = useRef("");
  const constructionTemplateLoadForRef = useRef("");
  const templateSpaceConfigRef = useRef<HTMLElement | null>(null);
  const templateScopeErrorTimerRef = useRef<number | null>(null);
  const comprehensiveFeesSectionRef = useRef<HTMLElement | null>(null);
  const comprehensiveFeeErrorTimerRef = useRef<number | null>(null);
  const templateQuantityPanelRef = useRef<HTMLDivElement>(null);
  const templateQuantityInputRef = useRef<HTMLInputElement>(null);
  const templateFeeSuggestionInputRef = useRef<HTMLInputElement | null>(null);
  const templateFeeSuggestionMenuRef = useRef<HTMLDivElement | null>(null);
  const [hasMoreProjectItemsBelow, setHasMoreProjectItemsBelow] = useState(false);
  const [spaceNameDrafts, setSpaceNameDrafts] = useState<Record<string, string>>({});
  const [highlightedTemplateSpaceId, setHighlightedTemplateSpaceId] = useState("");
  const [highlightedTemplateProjectGroupId, setHighlightedTemplateProjectGroupId] = useState("");
  const [highlightedComprehensiveFeeId, setHighlightedComprehensiveFeeId] = useState("");
  const [templateFeeSuggestion, setTemplateFeeSuggestion] = useState<{
    feeId: string;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [templateFeeSuggestionActiveIndex, setTemplateFeeSuggestionActiveIndex] = useState(0);
  const [templateFeeErrorTooltip, setTemplateFeeErrorTooltip] = useState<{ left: number; top: number; message: string } | null>(null);

  const saveTemplateToServer = useCallback(async (template: QuotaTemplate) => {
    const response = await fetch("/api/quota/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", templates: [template] }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "保存预算模板失败");
  }, []);

  const deleteTemplateOnServer = useCallback(async (templateId: string) => {
    const response = await fetch("/api/quota/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", templateId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "删除预算模板失败");
  }, []);

  const replaceLocalTemplate = useCallback((template: QuotaTemplate) => {
    fullTemplateCacheRef.current.set(template.id, template);
    setTemplates((current) => {
      const next = current.some((item) => item.id === template.id)
        ? current.map((item) => item.id === template.id ? template : item)
        : [template, ...current];
      templatesRef.current = next;
      return next;
    });
  }, []);

  const removeLocalTemplate = useCallback((templateId: string) => {
    fullTemplateCacheRef.current.delete(templateId);
    setTemplates((current) => {
      const next = current.filter((item) => item.id !== templateId);
      templatesRef.current = next;
      return next;
    });
  }, []);

  const loadFullTemplate = useCallback(async (templateId: string) => {
    const cached = fullTemplateCacheRef.current.get(templateId);
    if (cached) return cached;
    const response = await fetch(`/api/quota/templates?templateId=${encodeURIComponent(templateId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "读取预算模板失败");
    const template = normalizeTemplate(data?.template, 0);
    if (!template) throw new Error("预算模板数据不完整");
    replaceLocalTemplate(template);
    return template;
  }, [replaceLocalTemplate]);

  const makeBranchTemplateScope = useCallback((branchId: string, source?: QuotaTemplateAutoScope | null): QuotaTemplateAutoScope | null => {
    const branch = templateScopeOptions.find((option) => option.id === branchId);
    if (!branch) return null;
    return {
      scopeType: "branch",
      branchOrgUnitId: branch.id,
      branchOrgUnitName: branch.name,
      branchOrgUnitPath: branch.path,
      orgUnitId: branch.id,
      orgUnitName: branch.name,
      orgUnitPath: branch.path,
      orgUnitType: branch.type || "company",
      companyName: source?.companyName || "",
      createdByUserId: source?.createdByUserId || user?.id || "",
      createdByName: source?.createdByName || currentCreatorName,
    };
  }, [currentCreatorName, templateScopeOptions, user?.id]);

  const makeDefaultTemplateScope = useCallback((source?: QuotaTemplateAutoScope | null): QuotaTemplateAutoScope | null => {
    const branchId = source?.orgUnitId || source?.branchOrgUnitId || templateScopeOptions[0]?.id || "";
    return makeBranchTemplateScope(branchId, source);
  }, [makeBranchTemplateScope, templateScopeOptions]);

  const makeNewTemplateScope = useCallback((): QuotaTemplateAutoScope | null => {
    if (templateScopeOptions.length !== 1) return null;
    return makeBranchTemplateScope(templateScopeOptions[0].id);
  }, [makeBranchTemplateScope, templateScopeOptions]);

  const normalizeEditableTemplateScope = useCallback((template: QuotaTemplate): QuotaTemplateAutoScope | null => {
    if (template.autoScope?.scopeType === "branch" && template.autoScope.orgUnitId) {
      return makeBranchTemplateScope(template.autoScope.orgUnitId, template.autoScope) || template.autoScope;
    }
    return makeDefaultTemplateScope(template.autoScope);
  }, [makeBranchTemplateScope, makeDefaultTemplateScope]);

  const loadTemplateScopeOptionsFallback = useCallback(async () => {
    try {
      const response = await fetch("/api/org", { cache: "no-store" });
      const data = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(data)) return;
      const unitMap = new Map<string, any>();
      data.forEach((unit: any) => {
        const id = String(unit?.id || "").trim();
        if (id) unitMap.set(id, unit);
      });
      const getPath = (unit: any) => {
        const names: string[] = [];
        let current = unit;
        let guard = 0;
        while (current && guard < 20) {
          const name = String(current?.name || "").trim();
          if (name) names.unshift(name);
          current = current?.parent_id ? unitMap.get(String(current.parent_id)) : null;
          guard += 1;
        }
        return names.join(" / ");
      };
      const currentOrgUnitId = String((user as any)?.org_unit_id || (user as any)?.orgUnitId || "").trim();
      const currentOrg = currentOrgUnitId ? unitMap.get(currentOrgUnitId) : null;
      const getAncestorIds = (unit: any) => {
        const ids: string[] = [];
        let current = unit?.parent_id ? unitMap.get(String(unit.parent_id)) : null;
        let guard = 0;
        while (current && guard < 20) {
          const id = String(current?.id || "").trim();
          if (id) ids.push(id);
          current = current?.parent_id ? unitMap.get(String(current.parent_id)) : null;
          guard += 1;
        }
        return ids;
      };
      const isBranchInUserScope = (branch: any) => {
        if (!currentOrgUnitId || !currentOrg) return true;
        const currentType = String(currentOrg?.type || "").trim();
        if (currentType === "company") return String(branch?.id || "").trim() === currentOrgUnitId;
        const branchAncestorIds = getAncestorIds(branch);
        if (currentType === "group" || currentType === "region") {
          return String(branch?.id || "").trim() === currentOrgUnitId || branchAncestorIds.includes(currentOrgUnitId);
        }
        return getAncestorIds(currentOrg).includes(String(branch?.id || "").trim());
      };
      const options = data
        .filter((unit: any) => String(unit?.type || "").trim() === "company" && Number(unit?.is_active ?? 1) !== 0 && isBranchInUserScope(unit))
        .map((unit: any) => ({
          id: String(unit.id || "").trim(),
          name: String(unit.name || "").trim(),
          path: getPath(unit) || String(unit.name || "").trim(),
          type: "company",
        }))
        .filter((option: { id: string; name: string; path: string; type: string }) => option.id && option.name);
      if (options.length > 0) setTemplateScopeOptions(options);
    } catch {
      // 分公司范围由主接口提供；这里仅作为旧数据或热更新异常时的兜底。
    }
  }, [user]);

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

  const loadQuotaLibraryOptions = useCallback(async (branchOrgUnitId = "") => {
    setQuotaLibraryLoading(true);
    setQuotaLibraryError("");
    try {
      const params = new URLSearchParams();
      if (branchOrgUnitId) params.set("branchOrgUnitId", branchOrgUnitId);
      const response = await fetch(`/api/quota/library${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "读取基装定额失败");
      const items = Array.isArray(data?.items)
        ? data.items
          .map((item: any): QuotaLibraryItem | null => {
            if (!item || typeof item !== "object") return null;
            const laborPrice = Number(item.laborPrice || 0);
            const materialPrice = Number(item.materialPrice || 0);
            return {
              id: String(item.id || ""),
              code: String(item.code || ""),
              scope: String(item.scope || ""),
              category: String(item.category || ""),
              priceScene: String(item.priceScene || item.price_scene || "标准"),
              name: String(item.name || ""),
              constructionDescription: String(item.constructionDescription || ""),
              unit: String(item.unit || ""),
              laborPrice: Number.isFinite(laborPrice) ? Math.max(0, laborPrice) : 0,
              materialPrice: Number.isFinite(materialPrice) ? Math.max(0, materialPrice) : 0,
              totalPrice: Number.isFinite(Number(item.totalPrice)) ? Math.max(0, Number(item.totalPrice)) : Math.max(0, laborPrice + materialPrice),
              isSpecialPrice: Boolean(item.isSpecialPrice),
              status: String(item.status || ""),
              updatedAt: String(item.updatedAt || item.updated_at || ""),
            };
          })
          .filter((item: QuotaLibraryItem | null): item is QuotaLibraryItem => Boolean(item?.id && item.name && item.status !== "disabled"))
        : [];
      setQuotaLibraryItems(items);
      setQuotaLibraryStoreOptions(Array.isArray(data?.storeOptions)
        ? data.storeOptions
          .map((store: any) => ({
            id: String(store?.id || ""),
            name: String(store?.name || "").trim(),
            itemCount: Math.max(0, Number(store?.itemCount || 0)),
          }))
          .filter((store: { id: string; name: string; itemCount: number }) => store.id && store.name)
        : []);
    } catch (error: any) {
      setQuotaLibraryItems(branchOrgUnitId ? [] : loadCachedQuotaLibraryItems());
      setQuotaLibraryStoreOptions([]);
      setQuotaLibraryError(error?.message || "读取基装定额失败");
    } finally {
      setQuotaLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      try {
        const response = await fetch("/api/quota/templates?summary=1", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || "读取预算模板失败");
	        const serverTemplates = Array.isArray(data?.templates)
	          ? data.templates.map(normalizeTemplate).filter(Boolean) as QuotaTemplate[]
	          : [];
        const nextScopeOptions = Array.isArray(data?.scopeOptions)
          ? data.scopeOptions
            .map((option: any) => ({
              id: String(option?.id || "").trim(),
              name: String(option?.name || "").trim(),
              path: String(option?.path || option?.name || "").trim(),
              type: String(option?.type || "company").trim() || "company",
            }))
            .filter((option: { id: string; name: string; path: string; type: string }) => option.id && option.name)
          : [];
	        const loadedTemplates = serverTemplates.filter(hasBranchTemplateScope);
	        if (cancelled) return;
        setTemplateScopeOptions(nextScopeOptions);
        if (nextScopeOptions.length === 0) void loadTemplateScopeOptionsFallback();
        setTemplates(loadedTemplates);
        setSelectedId(loadedTemplates[0]?.id || "");
        setTemplatesLoaded(true);
      } catch {
        if (cancelled) return;
        const localTemplates = loadTemplatesFromStorage();
	        const fallbackTemplates = localTemplates.filter(hasBranchTemplateScope);
        fullTemplateCacheRef.current = new Map(fallbackTemplates.map((template) => [template.id, template]));
	        setTemplates(fallbackTemplates);
	        setSelectedId(fallbackTemplates[0]?.id || "");
        void loadTemplateScopeOptionsFallback();
        setTemplatesLoaded(true);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    };
    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [loadQuotaLibraryOptions, loadTemplateScopeOptionsFallback]);

  useEffect(() => {
    const templateId = editingTemplate?.id || "";
    if (!templateId || constructionTemplateOptions.length > 0 || constructionTemplateLoading || constructionTemplateLoadForRef.current === templateId) return;
    constructionTemplateLoadForRef.current = templateId;
    void loadConstructionTemplateOptions();
  }, [constructionTemplateLoading, constructionTemplateOptions.length, editingTemplate?.id, loadConstructionTemplateOptions]);

  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

  useEffect(() => {
    if (branchScopeFilter === "__global__") setBranchScopeFilter("");
  }, [branchScopeFilter]);

  useEffect(() => {
    setNumberInputDrafts({});
    setFeeFormulaDrafts({});
    setSpaceNameDrafts({});
  }, [editingTemplate?.id]);

  useEffect(() => {
    setTemplateQuantityEditor(null);
  }, [activeSpaceId, activeQuotaScope, editingTemplate?.id]);

  useEffect(() => {
    if (!templateQuantityEditor) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (templateQuantityPanelRef.current?.contains(target)) return;
      if (target.closest("[data-template-quantity-formula-button]")) return;
      if (target.closest("[data-template-quota-row]")) return;
      setTemplateQuantityEditor(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [templateQuantityEditor]);

  useLayoutEffect(() => {
    const editorItemId = templateQuantityEditor?.itemId;
    if (!editorItemId) return;
    let frameId = 0;
    const updateAnchorPosition = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const panel = templateQuantityPanelRef.current;
        if (!panel) return;
        const row = Array.from(document.querySelectorAll<HTMLElement>("[data-template-quota-row]"))
          .find((element) => element.dataset.quotaId === editorItemId);
        const anchor = row?.querySelector<HTMLElement>("[data-template-quantity-formula-button]");
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const headerRect = row?.closest("table")?.querySelector("thead")?.getBoundingClientRect();
        const width = 430;
        const headerBottom = headerRect && headerRect.bottom > 0 ? headerRect.bottom : 0;
        const minTop = Math.max(12, headerBottom + 8);
        const availableHeight = Math.max(180, window.innerHeight - minTop - 12);
        panel.style.maxHeight = `${availableHeight}px`;
        const estimatedHeight = Math.min(panel.scrollHeight || panel.offsetHeight || 300, availableHeight);
        const left = Math.max(12, Math.min(rect.right + 8, window.innerWidth - width - 12));
        const top = Math.max(minTop, Math.min(rect.bottom + 8, window.innerHeight - estimatedHeight - 12));
        const nextLeft = `${left}px`;
        const nextTop = `${top}px`;
        if (panel.style.left !== nextLeft) panel.style.left = nextLeft;
        if (panel.style.top !== nextTop) panel.style.top = nextTop;
      });
    };
    updateAnchorPosition();
    document.addEventListener("scroll", updateAnchorPosition, { capture: true, passive: true });
    window.addEventListener("resize", updateAnchorPosition);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      document.removeEventListener("scroll", updateAnchorPosition, true);
      window.removeEventListener("resize", updateAnchorPosition);
    };
  }, [templateQuantityEditor?.itemId]);

  useEffect(() => {
    if (editingMode === "create" || !editingTemplate || hasBranchTemplateScope(editingTemplate) || templateScopeOptions.length === 0) return;
    const nextScope = makeDefaultTemplateScope(editingTemplate.autoScope);
    if (!nextScope) return;
    setEditingTemplate({ ...editingTemplate, autoScope: nextScope });
  }, [editingMode, editingTemplate, makeDefaultTemplateScope, templateScopeOptions.length]);

  const visibleTemplates = templates.filter(hasBranchTemplateScope);
  const filteredTemplates = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return visibleTemplates.filter((template) => {
      const applicabilityTags = getQuotaTemplateApplicabilityTags(template);
      const matchesKeyword = !keyword || [
        template.name,
        template.remark,
        template.createdByName,
        template.createdAt,
        template.updatedAt,
        getTemplateStatusLabel(template.status),
        getPricingModeLabel(template.quoteConfig.mode),
        getQuotaTemplateScopeLabel(template, templateScopeOptions as any),
        getQuotaTemplateScopePath(template, templateScopeOptions as any),
        ...applicabilityTags,
      ].some((value) => value.toLowerCase().includes(keyword));
      const matchesPricingMode = !pricingModeFilter || template.quoteConfig.mode === pricingModeFilter;
      const matchesStatus = !statusFilter || template.status === statusFilter;
      const templateScopeId = String(template.autoScope?.orgUnitId || template.autoScope?.branchOrgUnitId || "").trim();
      const matchesBranchScope = !branchScopeFilter || templateScopeId === branchScopeFilter;
      return matchesKeyword && matchesPricingMode && matchesStatus && matchesBranchScope;
    });
  }, [branchScopeFilter, pricingModeFilter, search, statusFilter, templateScopeOptions, visibleTemplates]);

  const pagination = useDataPagination(filteredTemplates, [search, pricingModeFilter, statusFilter, branchScopeFilter].join("|"));
  const activeSpace = editingTemplate?.spaces.find((space) => space.id === activeSpaceId) || editingTemplate?.spaces[0] || null;

  const quotaSourceUpdates = useMemo(() => {
    if (!editingTemplate || quotaLibraryItems.length === 0) return [] as Array<{
      spaceId: string;
      itemId: string;
      changedFields: QuotaSourceField[];
      preservedFields: QuotaSourceField[];
      latest: QuotaLibraryItem;
    }>;
    const quotaById = new Map(quotaLibraryItems.map((quota) => [String(quota.id || ""), quota]));
    const updates: Array<{
      spaceId: string;
      itemId: string;
      changedFields: QuotaSourceField[];
      preservedFields: QuotaSourceField[];
      latest: QuotaLibraryItem;
    }> = [];
    editingTemplate.spaces.forEach((space) => {
      space.quotaItems.forEach((item) => {
        const quotaId = String(item.quotaId || "").trim();
        if (!quotaId) return;
        const latest = quotaById.get(quotaId);
        if (!latest) return;
        const base = item.sourceSnapshot || item;
        const rawChangedFields = quotaSourceComparableFields
          .map(([field]) => field)
          .filter((field) => comparableQuotaSourceValue(field, (base as any)[field]) !== comparableQuotaSourceValue(field, (latest as any)[field]));
        const overrideSet = new Set(item.overriddenFields || []);
        const changedFields = excludeOverriddenQuotaFields(rawChangedFields, Array.from(overrideSet));
        if (changedFields.length === 0) return;
        updates.push({
          spaceId: space.id,
          itemId: item.id,
          changedFields,
          preservedFields: rawChangedFields.filter((field) => overrideSet.has(field)),
          latest,
        });
      });
    });
    return updates;
  }, [editingTemplate, quotaLibraryItems]);

  const quotaDiffRows = useMemo(() => {
    if (!editingTemplate || quotaSourceUpdates.length === 0) return [];
    const labelByField = new Map(quotaSourceComparableFields.map(([field, label]) => [field, label]));
    return quotaSourceUpdates
      .map((update) => {
        const space = editingTemplate.spaces.find((item) => item.id === update.spaceId);
        const item = space?.quotaItems.find((quotaItem) => quotaItem.id === update.itemId);
        if (!space || !item) return null;
        const source = item.sourceSnapshot || item;
        const overrideSet = new Set(item.overriddenFields || []);
        const hasPriceInputChange = update.changedFields.includes("laborPrice") || update.changedFields.includes("materialPrice");
        const visibleChangedFields = update.changedFields.filter((field) => field !== "totalPrice" || !hasPriceInputChange);
        if (visibleChangedFields.length === 0) return null;
        return {
          id: `${update.spaceId}:${update.itemId}`,
          spaceName: space.name,
          itemName: item.name || update.latest.name || "未命名项目",
          fields: visibleChangedFields.map((field) => ({
            field,
            label: labelByField.get(field) || field,
            before: formatQuotaSourceValue(field, (source as any)[field]),
            after: formatQuotaSourceValue(field, (update.latest as any)[field]),
            preserved: overrideSet.has(field),
          })),
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        spaceName: string;
        itemName: string;
        fields: Array<{ field: QuotaSourceField; label: string; before: string; after: string; preserved: boolean }>;
      }>;
  }, [editingTemplate, quotaSourceUpdates]);
  const editingTemplateBranchId = String(editingTemplate?.autoScope?.orgUnitId || editingTemplate?.autoScope?.branchOrgUnitId || "").trim();
  const editingTemplateBranchName = String(editingTemplate?.autoScope?.orgUnitName || editingTemplate?.autoScope?.branchOrgUnitName || "").trim();
  const storeFilteredQuotaLibraryItems = useMemo(() => (
    quotaPickerStore
      ? quotaLibraryItems.filter((item) => item.scope === quotaPickerStore)
      : quotaLibraryItems
  ), [quotaLibraryItems, quotaPickerStore]);
  const quotaCategoryOptions = useMemo(() => {
    return Array.from(new Set(storeFilteredQuotaLibraryItems.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [storeFilteredQuotaLibraryItems]);
  const quotaPriceSceneOptions = useMemo(() => {
    return Array.from(new Set(storeFilteredQuotaLibraryItems.map((item) => item.priceScene || "标准").filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [storeFilteredQuotaLibraryItems]);
  useEffect(() => {
    if (quotaPickerCategory && !quotaCategoryOptions.includes(quotaPickerCategory)) {
      setQuotaPickerCategory("");
    }
  }, [quotaCategoryOptions, quotaPickerCategory]);
  useEffect(() => {
    if (quotaPickerPriceScene && !quotaPriceSceneOptions.includes(quotaPickerPriceScene)) {
      setQuotaPickerPriceScene("");
    }
  }, [quotaPickerPriceScene, quotaPriceSceneOptions]);
  const filteredQuotaLibraryItems = useMemo(() => {
    const keyword = quotaPickerSearch.trim().toLowerCase();
    return storeFilteredQuotaLibraryItems.filter((item) => {
      const matchesCategory = !quotaPickerCategory || item.category === quotaPickerCategory;
      const matchesPriceScene = !quotaPickerPriceScene || (item.priceScene || "标准") === quotaPickerPriceScene;
      const matchesKeyword = !keyword || [item.code, item.category, item.priceScene || "标准", item.name, item.constructionDescription, item.unit, formatAmount(item.laborPrice), formatAmount(item.materialPrice), formatAmount(item.totalPrice)].some((value) => value.toLowerCase().includes(keyword));
      return matchesCategory && matchesPriceScene && matchesKeyword;
    });
  }, [quotaPickerCategory, quotaPickerPriceScene, quotaPickerSearch, storeFilteredQuotaLibraryItems]);
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
  const pickedQuotaTotal = useMemo(() => (
    quotaLibraryItems
      .filter((item) => pickedQuotaIdSet.has(item.id))
      .reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
  ), [pickedQuotaIdSet, quotaLibraryItems]);
  const hasUnsavedTemplateChanges = useMemo(() => {
    if (!editingTemplate) return false;
    return getTemplateDirtyPayload(editingTemplate) !== openedTemplatePayloadRef.current;
  }, [editingTemplate]);
  const spaceAutoSaveText = getSpaceAutoSaveText(spaceAutoSaveStatus, editingMode);
  const quoteRemarkShouldFill = editingTemplate?.quoteConfig.mode === "list"
    || editingTemplate?.quoteConfig.mode === "package"
    || editingTemplate?.quoteConfig.mode === "area"
    || editingTemplate?.quoteConfig.mode === "foundation_material_area";
  const spaceConfigCopy = getSpaceConfigModeCopy(editingTemplate?.quoteConfig.mode || DEFAULT_PRICING_MODE);
  const templateProjectGroups = getTemplateProjectGroups(editingTemplate);
  const activeSpaceProjectGroups = getSpaceProjectGroups(activeSpace, templateProjectGroups);
  const templateQuantityEditorSpace = templateQuantityEditor
    ? editingTemplate?.spaces.find((space) => space.id === templateQuantityEditor.spaceId) || null
    : null;
  const templateQuantityEditorTarget = templateQuantityEditor && templateQuantityEditorSpace
    ? templateQuantityEditorSpace.quotaItems.find((item) => item.id === templateQuantityEditor.itemId) || null
    : null;
  const templateQuantityLinkItems = useMemo<Array<TemplateSpaceQuota & QuotationQuantityLinkItem>>(() => {
    if (!templateQuantityEditorSpace || !templateQuantityEditor) return [];
    return templateQuantityEditorSpace.quotaItems
      .filter((item) => normalizeQuotaScope(item.quoteScope) === normalizeQuotaScope(templateQuantityEditor.scope))
      .map((item) => ({
        ...item,
        category: normalizeQuotaScope(item.quoteScope),
        space: templateQuantityEditorSpace.name,
        quantity_formula: item.quantityFormula,
      }));
  }, [templateQuantityEditor, templateQuantityEditorSpace]);
  const templateQuantityEditorTargetIndex = templateQuantityEditorTarget
    ? templateQuantityLinkItems.findIndex((item) => item.id === templateQuantityEditorTarget.id)
    : -1;
  const templateQuantityEditorParsed = useMemo(() => {
    if (!templateQuantityEditor) return { formula: null as QuotationQuantityFormula | null, error: "" };
    if (templateQuantityEditorTargetIndex < 0) return { formula: null as QuotationQuantityFormula | null, error: "结果项目不在当前类别中" };
    return parseQuotationQuantityFormulaRows(
      templateQuantityLinkItems,
      templateQuantityEditorTargetIndex,
      templateQuantityEditor.text,
    );
  }, [templateQuantityEditor, templateQuantityEditorTargetIndex, templateQuantityLinkItems]);
  const templateQuantityEditorPreview = templateQuantityEditorParsed.formula && !templateQuantityEditorParsed.error
    ? calculateQuotationQuantityFormula(templateQuantityLinkItems, templateQuantityEditorParsed.formula)
    : null;
  const templateFeeScopeOptions = useMemo(() => {
    const names = new Set<string>();
    (editingTemplate?.spaces || []).forEach((space) => {
      const name = space.name.trim();
      if (name) names.add(name);
    });
    templateProjectGroups.forEach((group) => {
      const name = group.name.trim();
      if (name) names.add(name);
    });
    return Array.from(names);
  }, [editingTemplate?.spaces, templateProjectGroups]);
  const templateFeeFormulaExamples = getTemplateFeeFormulaExamples(templateProjectGroups, editingTemplate?.spaces || []);
  const templateFeeFormulaExampleText = `${templateFeeFormulaExamples.join("、")}、A+B、(直接费+A)`;
  const templateFeeFormulaPlaceholder = getTemplateFeeFormulaPlaceholder(templateProjectGroups, editingTemplate?.spaces || []);
  const templateFeeFormulaContext = buildTemplateFeeFormulaContext(templateProjectGroups, editingTemplate?.spaces || []);
  const templateFeeScopeReferences = buildTemplateFeeScopeReferences(templateProjectGroups, editingTemplate?.spaces || []);
  const comprehensiveFeeMode = "formula" as const;
  const templateFeeSuggestionOptions = useMemo(() => [
    { key: "builtin:direct", label: "直接费" },
    { key: "builtin:labor", label: "人工费" },
    { key: "builtin:material", label: "材料费" },
    ...templateFeeScopeReferences.map((reference) => ({ key: `scope:${reference.key}`, label: reference.label })),
    ...(editingTemplate?.comprehensiveFees || []).map((fee, index) => ({
      key: `fee:${fee.id}`,
      label: formatAlphaSequence(index),
    })),
  ].filter((option) => option.label), [editingTemplate?.comprehensiveFees, templateFeeScopeReferences]);
  const visibleTemplateFeeSuggestionOptions = useMemo(() => (
    templateFeeSuggestion
      ? templateFeeSuggestionOptions.filter((option) => option.key !== `fee:${templateFeeSuggestion.feeId}`)
      : templateFeeSuggestionOptions
  ), [templateFeeSuggestion, templateFeeSuggestionOptions]);
  const templateFormulaFeeItems = buildTemplateFormulaFeeItems(editingTemplate?.comprehensiveFees || []);
  const templateFeeBaseErrors = (editingTemplate?.comprehensiveFees || []).map((fee, feeIndex) => {
    const draftFormula = feeFormulaDrafts[fee.id] ?? fee.fee_calc_base;
    if ((fee.valueSource || "formula") === "fixed" && !/^-?\d+(?:\.\d+)?$/.test(String(draftFormula || "").trim())) {
      return "固定金额请填写数字";
    }
    return normalizeFeeCalcMethod(fee.fee_calc_method) === "fixed" || normalizeFeeCalcMethod(fee.fee_calc_method) === "area_unit"
      ? ""
      : getFeeCalcBaseError(
        draftFormula,
        0,
        0,
        {},
        templateFeeFormulaContext,
        templateFormulaFeeItems.map((item, index) => index === feeIndex ? { ...item, fee_calc_base: draftFormula } : item),
        feeIndex,
      );
  });
  const templateFeeNameErrors = (editingTemplate?.comprehensiveFees || []).map((fee) => (
    String(fee.name || "").trim() ? "" : "请填写费用名称"
  ));
  const getTemplateNumberInputProps = (
    fieldKey: string,
    value: number,
    onValueChange: (value: number) => void,
    options?: { emptyWhenZero?: boolean },
  ) => {
    const currentValue = numberInputDrafts[fieldKey]
      ?? (options?.emptyWhenZero && toAmount(value) === 0 ? "" : formatTemplateNumberInputValue(value));
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
      const nextTemplate = { ...template, updatedAt: nextUpdatedAt };
      const nextTemplates = templatesRef.current.map((item) => item.id === template.id ? {
        ...nextTemplate,
      } : item);
      fullTemplateCacheRef.current.set(nextTemplate.id, nextTemplate);
      templatesRef.current = nextTemplates;
      if (updateState) {
        setTemplates(nextTemplates);
      }
      void saveTemplateToServer(nextTemplate).catch(() => {
        // 页面内已保留当前编辑内容，后续自动保存会继续重试。
      });
      return;
    }

    if (typeof window === "undefined") return;
    if (hasTemplateDraftContent(template)) {
      window.localStorage.setItem(QUOTA_TEMPLATE_DRAFT_STORAGE_KEY, JSON.stringify({ ...template, updatedAt: nextUpdatedAt }));
    } else {
      clearTemplateDraftFromStorage();
    }
  }, [saveTemplateToServer]);

  const openCreateTemplate = () => {
    clearTemplateDraftFromStorage();
    const template = {
      ...makeEmptyTemplate(),
      createdByName: currentCreatorName,
      autoScope: makeNewTemplateScope(),
    };
    openedTemplateRef.current = template;
    openedTemplatePayloadRef.current = getTemplateDirtyPayload(template);
    setEditingMode("create");
    setEditingTemplate(template);
    setActiveSpaceId(template.spaces[0]?.id || "");
    setActiveQuotaScope("foundation");
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
    setQuotaDiffOpen(false);
    setSelectedId(template.id);
    lastSpaceAutoSavePayloadRef.current = getTemplateAutoSavePayload(template, "create");
    setSpaceAutoSaveStatus("idle");
  };

  const openLoadedTemplateEditor = (template: QuotaTemplate) => {
    openedTemplateRef.current = template;
    openedTemplatePayloadRef.current = getTemplateDirtyPayload(template);
    setEditingMode("edit");
    setEditingTemplate(template);
    setActiveSpaceId(template.spaces[0]?.id || "");
    setActiveQuotaScope("foundation");
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
    setQuotaDiffOpen(false);
    setSelectedId(template.id);
    lastSpaceAutoSavePayloadRef.current = getTemplateAutoSavePayload(template, "edit");
    setSpaceAutoSaveStatus("idle");
    void loadQuotaLibraryOptions(template.autoScope?.branchOrgUnitId || template.autoScope?.orgUnitId || "");
  };

  const openEditTemplate = (template: QuotaTemplate) => {
    void (async () => {
      try {
        const fullTemplate = await loadFullTemplate(template.id);
        openLoadedTemplateEditor(fullTemplate);
      } catch (error: any) {
        window.alert(error?.message || "读取预算模板失败，请稍后重试");
      }
    })();
  };

  const buildCopiedTemplate = (template: QuotaTemplate, name: string): QuotaTemplate => {
    const copySeed = Date.now();
    const copiedFeeIdBySourceId = new Map(template.comprehensiveFees.map((fee, feeIndex) => (
      [fee.id, `fee-copy-${copySeed}-${feeIndex}`]
    )));
    return {
      ...template,
      id: `${template.id}-copy-${copySeed}`,
      name,
      status: "enabled",
      createdByName: currentCreatorName,
      autoScope: normalizeEditableTemplateScope(template),
      comprehensiveFees: template.comprehensiveFees.map((fee) => ({
        ...fee,
        id: copiedFeeIdBySourceId.get(fee.id) || fee.id,
        fee_calc_base: remapStableFeeFormulaIds(fee.fee_calc_base, copiedFeeIdBySourceId),
      })),
      spaces: template.spaces.map((space, spaceIndex) => {
        const itemIdMap = new Map(space.quotaItems.map((item, itemIndex) => [
          item.id,
          `space-quota-copy-${copySeed}-${spaceIndex}-${itemIndex}`,
        ]));
        return {
          ...space,
          id: `space-copy-${copySeed}-${spaceIndex}`,
          quotaItems: space.quotaItems.map((item) => ({
            ...item,
            id: itemIdMap.get(item.id) || item.id,
            quantityFormula: item.quantityFormula
              ? remapQuotationQuantityFormulaIds(item.quantityFormula, itemIdMap)
              : null,
          })),
        };
      }),
      createdAt: todayText(),
      updatedAt: todayText(),
    };
  };

  const handleCopyTemplate = (template: QuotaTemplate) => {
    if (!window.confirm(`确认复制模板“${template.name}”吗？\n复制后会生成一份新的模板副本。`)) return;
    void (async () => {
      try {
        const fullTemplate = await loadFullTemplate(template.id);
        const copyTemplate = buildCopiedTemplate(fullTemplate, `${template.name} 副本`);
        await saveTemplateToServer(copyTemplate);
        replaceLocalTemplate(copyTemplate);
        setSelectedId(copyTemplate.id);
      } catch (error: any) {
        window.alert(error?.message || "复制预算模板失败，请稍后重试");
      }
    })();
  };

  const handleTemplateBranchChange = (branchId: string) => {
    if (!editingTemplate) return;
    const currentBranchId = String(editingTemplate.autoScope?.orgUnitId || editingTemplate.autoScope?.branchOrgUnitId || "").trim();
    if (branchId === currentBranchId) return;
    const nextScope = makeBranchTemplateScope(branchId, editingTemplate.autoScope);
    if (!nextScope) return;
    const detailCount = editingTemplate.spaces.reduce((sum, space) => sum + space.quotaItems.length, 0);
    if (detailCount > 0) {
      const confirmed = window.confirm(
        `确认将适用分公司改为“${nextScope.orgUnitName || nextScope.branchOrgUnitName}”吗？\n\n`
        + "不同分公司使用的基装定额、产品、定制柜不是同一套库。为了避免把原分公司的项目带到新分公司，继续后会清空所有空间/类别下的基装、产品、定制柜明细。\n\n"
        + "空间和类别本身会保留，切换后可重新添加新分公司适用的项目。",
      );
      if (!confirmed) return;
    }
    setEditingTemplate({
      ...editingTemplate,
      autoScope: nextScope,
      spaces: editingTemplate.spaces.map((space) => ({
        ...space,
        quotaItems: branchId === currentBranchId ? space.quotaItems : [],
      })),
    });
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
  };

  const toggleTemplateStatus = (template: QuotaTemplate) => {
    const nextStatus: TemplateStatus = template.status === "disabled" ? "enabled" : "disabled";
    const actionText = nextStatus === "disabled" ? "停用" : "启用";
    if (!window.confirm(`确认${actionText}模板“${template.name}”吗？`)) return;
    void (async () => {
      try {
        const fullTemplate = await loadFullTemplate(template.id);
        const nextUpdatedAt = todayText();
        const nextTemplate = { ...fullTemplate, status: nextStatus, updatedAt: nextUpdatedAt };
        await saveTemplateToServer(nextTemplate);
        replaceLocalTemplate(nextTemplate);
        if (editingTemplate?.id === template.id) {
          setEditingTemplate((current) => current ? { ...current, status: nextStatus, updatedAt: nextUpdatedAt } : current);
        }
      } catch (error: any) {
        window.alert(error?.message || `${actionText}预算模板失败，请稍后重试`);
      }
    })();
  };

  const handleDeleteTemplate = (template: QuotaTemplate) => {
    if (!window.confirm(`确认删除模板“${template.name}”吗？`)) return;
    void (async () => {
      try {
        await deleteTemplateOnServer(template.id);
        removeLocalTemplate(template.id);
        if (selectedId === template.id) setSelectedId("");
        if (editingTemplate?.id === template.id) {
          setEditingTemplate(null);
          setActiveSpaceId("");
          setQuotaPickerTarget(null);
          setPickedQuotaIds([]);
          setConstructionTemplatePickerOpen(false);
          setConstructionTemplateSearch("");
        }
      } catch (error: any) {
        window.alert(error?.message || "删除预算模板失败，请稍后重试");
      }
    })();
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

  const setComprehensiveFeeFinalTotal = (feeId: string) => {
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: current.comprehensiveFees.map((fee) => ({
        ...fee,
        isFinalTotal: fee.id === feeId,
      })),
    } : current);
  };

  const addComprehensiveFee = () => {
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: [
        ...current.comprehensiveFees,
        comprehensiveFeeMode === "formula"
          ? makeComprehensiveFeeItem({
            name: "",
            fee_calc_method: "formula",
            fee_calc_base: "",
          })
          : makeComprehensiveFeeItem({
            name: "",
            fee_calc_method: "percent",
            fee_calc_base: "直接费",
            fee_rate: 0,
          }),
      ],
    } : current);
  };

  const updateComprehensiveFee = (feeId: string, patch: Partial<TemplateComprehensiveFee>) => {
    if (patch.valueSource && patch.valueSource !== "formula") {
      setFeeFormulaDrafts((current) => {
        const next = { ...current };
        delete next[feeId];
        return next;
      });
    } else if (normalizeFeeCalcMethod(patch.fee_calc_method) === "formula") {
      setFeeFormulaDrafts((current) => {
        const next = { ...current };
        delete next[feeId];
        return next;
      });
    }
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: current.comprehensiveFees.map((fee) => {
        if (fee.id !== feeId) return fee;
        const nextFee = { ...fee, ...patch };
        const valueSource = comprehensiveFeeMode === "formula"
          ? nextFee.valueSource || "formula"
          : "formula";
        if (comprehensiveFeeMode === "formula" && valueSource !== "formula") {
          const isFixedAmount = valueSource === "fixed";
          return {
            ...nextFee,
            valueSource,
            fee_calc_method: valueSource === "manual" ? "fixed" : isFixedAmount ? "formula" : "reference",
            fee_calc_base: valueSource === "direct"
              ? "直接费"
              : isFixedAmount
                ? normalizeFeeCalcBase(nextFee.fee_calc_base) || "0"
                : "",
            fee_rate: 0,
            unit_price: 0,
            isFinalTotal: nextFee.isFinalTotal === true,
          };
        }
        if (comprehensiveFeeMode === "formula") {
          return {
            ...nextFee,
            valueSource: "formula",
            fee_calc_method: "formula",
            fee_calc_base: normalizeFeeCalcBase(nextFee.fee_calc_base),
            fee_rate: 0,
            unit_price: 0,
            isFinalTotal: nextFee.isFinalTotal === true,
          };
        }
        const method = normalizeFeeCalcMethod(nextFee.fee_calc_method);
        return {
          ...nextFee,
          valueSource: "formula",
          fee_calc_method: method,
          fee_calc_base: method === "fixed" ? "" : method === "area_unit" ? "房屋面积" : normalizeFeeCalcBase(nextFee.fee_calc_base),
          fee_rate: method === "percent" ? toAmount(nextFee.fee_rate) : 0,
          unit_price: method === "fixed" || method === "area_unit" ? toAmount(nextFee.unit_price) : 0,
        };
      }),
    } : current);
  };

  const updateComprehensiveFeeFormula = (feeId: string, displayFormula: string) => {
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: current.comprehensiveFees.map((fee) => fee.id === feeId ? {
        ...fee,
        fee_calc_base: bindStableFeeFormula(displayFormula, current.comprehensiveFees, 0, templateFeeScopeReferences),
      } : fee),
    } : current);
  };

  const startEditingComprehensiveFeeFormula = (feeId: string, displayFormula: string) => {
    setFeeFormulaDrafts((current) => ({ ...current, [feeId]: displayFormula }));
  };

  const changeComprehensiveFeeFormulaDraft = (feeId: string, value: string) => {
    setFeeFormulaDrafts((current) => ({ ...current, [feeId]: value }));
  };

  const commitComprehensiveFeeFormulaDraft = (feeId: string) => {
    setFeeFormulaDrafts((current) => {
      if (!(feeId in current)) return current;
      updateComprehensiveFeeFormula(feeId, current[feeId]);
      const next = { ...current };
      delete next[feeId];
      return next;
    });
  };

  const openTemplateFeeSuggestion = (feeId: string, input: HTMLInputElement) => {
    const rect = input.getBoundingClientRect();
    templateFeeSuggestionInputRef.current = input;
    setTemplateFeeSuggestion({
      feeId,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 260)),
      top: Math.min(rect.bottom + 6, window.innerHeight - 280),
      width: Math.max(220, rect.width),
    });
    setTemplateFeeSuggestionActiveIndex(0);
  };

  const showTemplateFeeErrorTooltip = (target: HTMLElement, message: string) => {
    if (!message) return;
    const rect = target.getBoundingClientRect();
    const width = 260;
    const estimatedHeight = 36;
    const preferredLeft = rect.left - width - 8;
    const left = preferredLeft >= 8 ? preferredLeft : Math.min(rect.right + 8, window.innerWidth - width - 8);
    const top = Math.max(8, Math.min(rect.top + rect.height / 2 - estimatedHeight / 2, window.innerHeight - estimatedHeight - 8));
    setTemplateFeeErrorTooltip({ left, top, message });
  };

  const hideTemplateFeeErrorTooltip = () => setTemplateFeeErrorTooltip(null);

  useEffect(() => {
    if (!templateFeeErrorTooltip) return;
    const closeTooltip = () => setTemplateFeeErrorTooltip(null);
    window.addEventListener("resize", closeTooltip);
    window.addEventListener("scroll", closeTooltip, true);
    return () => {
      window.removeEventListener("resize", closeTooltip);
      window.removeEventListener("scroll", closeTooltip, true);
    };
  }, [templateFeeErrorTooltip]);

  const insertTemplateFeeSuggestion = (value: string) => {
    const input = templateFeeSuggestionInputRef.current;
    const feeId = templateFeeSuggestion?.feeId || "";
    if (!input || !feeId) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const nextValue = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
    changeComprehensiveFeeFormulaDraft(feeId, nextValue);
    setTemplateFeeSuggestion(null);
    window.requestAnimationFrame(() => {
      input.focus();
      const nextCursor = start + value.length;
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  useEffect(() => {
    if (!templateFeeSuggestion) return;
    const closeSuggestion = () => setTemplateFeeSuggestion(null);
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && templateFeeSuggestionMenuRef.current?.contains(target)) return;
      closeSuggestion();
    };
    document.addEventListener("pointerdown", closeSuggestion);
    window.addEventListener("resize", closeSuggestion);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeSuggestion);
      window.removeEventListener("resize", closeSuggestion);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [templateFeeSuggestion]);

  useEffect(() => {
    const handleOtherDropdownOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id && detail.id !== TEMPLATE_FEE_SUGGESTION_DROPDOWN_ID) setTemplateFeeSuggestion(null);
    };
    window.addEventListener(EXCLUSIVE_DROPDOWN_OPEN_EVENT, handleOtherDropdownOpen);
    return () => window.removeEventListener(EXCLUSIVE_DROPDOWN_OPEN_EVENT, handleOtherDropdownOpen);
  }, []);

  useEffect(() => {
    if (templateFeeSuggestion) notifyExclusiveDropdownOpen(TEMPLATE_FEE_SUGGESTION_DROPDOWN_ID);
  }, [templateFeeSuggestion]);

  const toggleComprehensiveFeeScopeName = (feeId: string, name: string) => {
    const scopeName = name.trim();
    if (!scopeName) return;
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: current.comprehensiveFees.map((fee) => {
        if (fee.id !== feeId) return fee;
        const names = new Set(fee.fee_scope_space_names || []);
        if (names.has(scopeName)) names.delete(scopeName);
        else names.add(scopeName);
        return { ...fee, fee_scope_space_names: Array.from(names) };
      }),
    } : current);
  };

  const removeComprehensiveFee = (feeId: string) => {
    const feeToRemove = editingTemplate?.comprehensiveFees.find((fee) => fee.id === feeId);
    if (comprehensiveFeeMode === "formula" && feeToRemove?.isFinalTotal) {
      window.alert("当前行是报价总额行，请先将其它行设为报价总额后再删除。");
      return;
    }
    const referencedBy = (editingTemplate?.comprehensiveFees || [])
      .filter((fee) => fee.id !== feeId && getStableFeeReferenceIds(fee.fee_calc_base).includes(feeId))
      .map((fee) => fee.name || "未命名费用");
    if (referencedBy.length > 0) {
      window.alert(`该费用正在被“${referencedBy.join("、")}”的公式引用，请先修改引用公式。`);
      return;
    }
    setEditingTemplate((current) => current ? {
      ...current,
      comprehensiveFees: current.comprehensiveFees.filter((fee) => fee.id !== feeId),
    } : current);
  };

  const addSpace = () => {
    const existingNames = new Set([
      ...(editingTemplate?.spaces || []).map((space) => normalizeTemplateScopeName(space.name)),
      ...getTemplateProjectGroups(editingTemplate).map((group) => normalizeTemplateScopeName(group.name)),
    ].filter(Boolean));
    let index = (editingTemplate?.spaces.length || 0) + 1;
    let nextName = `空间${index}`;
    while (existingNames.has(normalizeTemplateScopeName(nextName))) {
      index += 1;
      nextName = `空间${index}`;
    }
    const nextSpace = makeSpace(nextName);
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
    const groupAlreadyExists = currentGroups.some((group) => group.id === fixedGroup.id);
    const normalizedGroupName = normalizeTemplateScopeName(fixedGroup.name);
    const duplicateScopeName = !groupAlreadyExists && [
      ...(editingTemplate?.spaces || []).map((space) => normalizeTemplateScopeName(space.name)),
      ...currentGroups.filter((group) => group.id !== fixedGroup.id).map((group) => normalizeTemplateScopeName(group.name)),
    ].includes(normalizedGroupName);
    if (duplicateScopeName) {
      window.alert(`空间/类别名称不能重复：「${fixedGroup.name}」已存在。`);
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
        const deletedItemIds = new Set(
          space.quotaItems
            .filter((item) => normalizeQuotaScope(item.quoteScope) === groupId)
            .map((item) => item.id),
        );
        const nextSpace = {
          ...space,
          projectGroupIds: uniqueProjectGroupIds((space.projectGroupIds || []).filter((id) => id !== groupId)),
          quotaItems: space.quotaItems.filter((item) => normalizeQuotaScope(item.quoteScope) !== groupId),
        };
        return repairTemplateSpaceQuantityLinksAfterDeletion(nextSpace, deletedItemIds);
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

  const getSpaceNameConflictMessage = (spaceId: string, value: string) => {
    const nextName = normalizeTemplateScopeName(value);
    if (!nextName) return "空间名称不能为空";
    const duplicate = (
      (editingTemplate?.spaces || []).some((space) => (
        space.id !== spaceId && normalizeTemplateScopeName(space.name) === nextName
      ))
      || getTemplateProjectGroups(editingTemplate).some((group) => normalizeTemplateScopeName(group.name) === nextName)
    );
    return duplicate ? `空间/类别名称不能重复：「${String(value || "").trim()}」已存在。` : "";
  };

  const updateSpace = (spaceId: string, patch: Partial<TemplateSpace>) => {
    if (patch.name !== undefined) {
      const error = getSpaceNameConflictMessage(spaceId, String(patch.name || ""));
      if (error) {
        window.alert(error);
        return false;
      }
    }
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => space.id === spaceId ? { ...space, ...patch } : space),
      comprehensiveFees: patch.name
        ? current.comprehensiveFees.map((fee) => ({
          ...fee,
          fee_calc_base: updateStableScopeReferenceLabel(fee.fee_calc_base, `space:${spaceId}`, patch.name || ""),
        }))
        : current.comprehensiveFees,
    } : current);
    return true;
  };

  const commitSpaceNameDraft = (spaceId: string) => {
    const draft = spaceNameDrafts[spaceId];
    if (draft === undefined) return true;
    const nextName = String(draft || "").trim();
    const currentSpace = editingTemplate?.spaces.find((space) => space.id === spaceId);
    if (!currentSpace) {
      setSpaceNameDrafts((current) => {
        const next = { ...current };
        delete next[spaceId];
        return next;
      });
      return true;
    }
    if (nextName === String(currentSpace.name || "").trim()) {
      setSpaceNameDrafts((current) => {
        const next = { ...current };
        delete next[spaceId];
        return next;
      });
      return true;
    }
    if (!updateSpace(spaceId, { name: nextName })) return false;
    setSpaceNameDrafts((current) => {
      const next = { ...current };
      delete next[spaceId];
      return next;
    });
    return true;
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
    if (quoteScope !== "foundation") {
      const groupName = getProjectGroupName(templateProjectGroups, quoteScope);
      const nextItem = makeSpaceQuotaItem({
        category: groupName,
        quoteScope,
      });
      setEditingTemplate((current) => current ? {
        ...current,
        spaces: current.spaces.map((space) => space.id === spaceId ? {
          ...withSpaceProjectGroup(space, quoteScope),
          quotaItems: [...space.quotaItems, nextItem],
        } : space),
      } : current);
      setPickedQuotaIds([]);
      setQuotaPickerTarget(null);
      resetCustomQuotaDraft();
      return;
    }
    if (!editingTemplateBranchId) {
      window.alert("请先选择模板适用的分公司");
      return;
    }
    setQuotaLibraryItems([]);
    setQuotaLibraryStoreOptions([]);
    setQuotaLibraryError("");
    setQuotaPickerTarget({ spaceId, quoteScope });
    setQuotaPickerSearch("");
    setQuotaPickerCategory("");
    setQuotaPickerPriceScene("");
    setQuotaPickerStore("");
    setPickedQuotaIds([]);
    resetCustomQuotaDraft();
    void loadQuotaLibraryOptions(editingTemplateBranchId);
  };

  const updateSpaceQuota = (
    spaceId: string,
    quotaItemId: string,
    patch: Partial<TemplateSpaceQuota>,
    options?: { markOverride?: boolean },
  ) => {
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => {
        if (space.id !== spaceId) return space;
        const nextSpace = {
          ...("quoteScope" in patch && patch.quoteScope ? withSpaceProjectGroup(space, normalizeQuotaScope(patch.quoteScope)) : space),
          quotaItems: space.quotaItems.map((item) => {
            if (item.id !== quotaItemId) return item;
            const overriddenFields = new Set(item.overriddenFields || []);
            if (item.quotaId && options?.markOverride !== false) {
              Object.keys(patch).forEach((field) => {
                if (quotaSourceComparableFields.some(([sourceField]) => sourceField === field)) overriddenFields.add(field);
              });
            }
            return { ...item, ...patch, overriddenFields: Array.from(overriddenFields) };
          }),
        };
        return applyTemplateSpaceQuantityLinks(nextSpace);
      }),
    } : current);
  };

  const applyQuotaSourceUpdates = () => {
    if (quotaSourceUpdates.length === 0) return;
    const updateMap = new Map(quotaSourceUpdates.map((update) => [`${update.spaceId}:${update.itemId}`, update]));
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => ({
        ...space,
        quotaItems: space.quotaItems.map((item) => {
          const update = updateMap.get(`${space.id}:${item.id}`);
          if (!update) return item;
          const overrideSet = new Set(item.overriddenFields || []);
          const patch: Partial<TemplateSpaceQuota> = {};
          const hasPriceOverride = overrideSet.has("laborPrice") || overrideSet.has("materialPrice");
          update.changedFields.forEach((field) => {
            if (field === "totalPrice" && hasPriceOverride) return;
            if (!overrideSet.has(field)) (patch as any)[field] = (update.latest as any)[field];
          });
          const latestSnapshot = {
            code: update.latest.code,
            category: update.latest.category,
            priceScene: update.latest.priceScene,
            name: update.latest.name,
            constructionDescription: update.latest.constructionDescription,
            unit: update.latest.unit,
            laborPrice: update.latest.laborPrice,
            materialPrice: update.latest.materialPrice,
            totalPrice: update.latest.totalPrice,
            isSpecialPrice: update.latest.isSpecialPrice,
          };
          return {
            ...item,
            ...patch,
            sourceVersion: update.latest.updatedAt || item.sourceVersion,
            sourceSnapshot: latestSnapshot,
          };
        }),
      })),
    } : current);
  };

  const removeSpaceQuota = (spaceId: string, quotaItemId: string) => {
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => {
        if (space.id !== spaceId) return space;
        const nextSpace = {
          ...space,
          quotaItems: space.quotaItems.filter((item) => item.id !== quotaItemId),
        };
        return repairTemplateSpaceQuantityLinksAfterDeletion(nextSpace, new Set([quotaItemId]));
      }),
    } : current);
    setTemplateQuantityEditor((current) => current?.itemId === quotaItemId ? null : current);
  };

  const openTemplateQuantityEditor = (
    spaceId: string,
    quotaItemId: string,
  ) => {
    const space = editingTemplate?.spaces.find((item) => item.id === spaceId);
    const item = space?.quotaItems.find((quotaItem) => quotaItem.id === quotaItemId);
    if (!space || !item) return;
    const scope = normalizeQuotaScope(item.quoteScope);
    const scopedItems = space.quotaItems
      .filter((quotaItem) => normalizeQuotaScope(quotaItem.quoteScope) === scope)
      .map((quotaItem) => ({
        ...quotaItem,
        category: scope,
        space: space.name,
        quantity_formula: quotaItem.quantityFormula,
      }));
    const targetIndex = scopedItems.findIndex((quotaItem) => quotaItem.id === item.id);
    const formula = parseQuotationQuantityFormula(item.quantityFormula);
    setTemplateQuantityEditor({
      spaceId,
      itemId: quotaItemId,
      scope,
      text: formula ? formatQuotationQuantityFormulaRows(scopedItems, formula).replace(/^=/, "") : "",
      lastInsertedRange: null,
    });
    if (targetIndex < 0) setTemplateQuantityEditor(null);
  };

  const insertTemplateQuantityRowNumber = (rowNumber: number) => {
    if (!Number.isInteger(rowNumber) || rowNumber <= 0 || !templateQuantityEditor) return;
    const input = templateQuantityInputRef.current;
    const start = input?.selectionStart ?? templateQuantityEditor.text.length;
    const end = input?.selectionEnd ?? start;
    const insertedText = `[${rowNumber}]`;
    const previousRange = templateQuantityEditor.lastInsertedRange;
    const replaceStart = previousRange ? previousRange.start : start;
    const replaceEnd = previousRange ? previousRange.end : end;
    const nextText = `${templateQuantityEditor.text.slice(0, replaceStart)}${insertedText}${templateQuantityEditor.text.slice(replaceEnd)}`;
    const nextRange = { start: replaceStart, end: replaceStart + insertedText.length };
    setTemplateQuantityEditor({
      ...templateQuantityEditor,
      text: nextText,
      lastInsertedRange: nextRange,
    });
    window.requestAnimationFrame(() => {
      const nextInput = templateQuantityInputRef.current;
      nextInput?.focus();
      nextInput?.setSelectionRange(nextRange.end, nextRange.end);
    });
  };

  const confirmTemplateQuantityEditor = () => {
    if (
      !templateQuantityEditor
      || !templateQuantityEditorParsed.formula
      || templateQuantityEditorParsed.error
      || templateQuantityEditorPreview === null
    ) {
      return;
    }
    updateSpaceQuota(templateQuantityEditor.spaceId, templateQuantityEditor.itemId, {
      quantity: Number(Math.max(0, templateQuantityEditorPreview).toFixed(2)),
      quantityFormula: serializeQuotationQuantityFormula(templateQuantityEditorParsed.formula),
    }, { markOverride: false });
    setTemplateQuantityEditor(null);
  };

  const removeTemplateQuantityEditorFormula = () => {
    if (!templateQuantityEditor) return;
    updateSpaceQuota(templateQuantityEditor.spaceId, templateQuantityEditor.itemId, {
      quantityFormula: null,
    }, { markOverride: false });
    setTemplateQuantityEditor(null);
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
    const scrollElement = event.currentTarget.closest(".quota-template-project-board")?.querySelector<HTMLElement>(".quota-template-project-scroll") || null;
    pointerQuotaDragRef.current = { spaceId, quotaItemId, quoteScope, startX: event.clientX, startY: event.clientY, scrollElement, moved: false, targetQuotaId: quotaItemId, position: "after" };
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

  const updateProjectScrollHint = useCallback(() => {
    const element = projectScrollRef.current;
    if (!element) {
      setHasMoreProjectItemsBelow(false);
      return;
    }
    const hasMoreBelow = element.scrollHeight - element.scrollTop - element.clientHeight > 8;
    setHasMoreProjectItemsBelow(hasMoreBelow);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateProjectScrollHint);
    window.addEventListener("resize", updateProjectScrollHint);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateProjectScrollHint);
    };
  }, [activeSpaceId, activeQuotaScope, editingTemplate?.spaces, updateProjectScrollHint]);

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
    const stopQuotaDragAutoScroll = () => {
      if (quotaDragAutoScrollFrameRef.current) {
        window.cancelAnimationFrame(quotaDragAutoScrollFrameRef.current);
        quotaDragAutoScrollFrameRef.current = null;
      }
    };

    const getTargetQuota = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const row = element?.closest<HTMLElement>("[data-template-quota-row]");
      const quotaId = row?.dataset.quotaId;
      const quoteScope = normalizeQuotaScope(row?.dataset.quotaScope);
      if (!row || !quotaId) {
        const state = pointerQuotaDragRef.current;
        const scrollElement = state?.scrollElement;
        if (!state || !scrollElement) return null;
        const rect = scrollElement.getBoundingClientRect();
        const edgeSize = Math.min(92, Math.max(48, rect.height * 0.14));
        const rows = Array.from(scrollElement.querySelectorAll<HTMLElement>("[data-template-quota-row]"))
          .filter((item) => normalizeQuotaScope(item.dataset.quotaScope) === state.quoteScope && item.dataset.quotaId !== state.quotaItemId);
        if (!rows.length) return null;
        if (clientY <= rect.top + edgeSize) {
          const firstRow = rows[0];
          const firstId = firstRow.dataset.quotaId;
          return firstId ? { id: firstId, position: "before" as ItemDropPosition, quoteScope: state.quoteScope } : null;
        }
        if (clientY >= rect.bottom - edgeSize) {
          const lastRow = rows[rows.length - 1];
          const lastId = lastRow.dataset.quotaId;
          return lastId ? { id: lastId, position: "after" as ItemDropPosition, quoteScope: state.quoteScope } : null;
        }
        return null;
      }
      const rect = row.getBoundingClientRect();
      const position: ItemDropPosition = clientY < rect.top + rect.height / 2 ? "before" : "after";
      return { id: quotaId, position, quoteScope };
    };

    const syncQuotaDragTarget = () => {
      const state = pointerQuotaDragRef.current;
      if (!state?.moved) return;
      const target = getTargetQuota(quotaDragPointerRef.current.x, quotaDragPointerRef.current.y);
      if (!target || target.id === state.quotaItemId || target.quoteScope !== state.quoteScope) {
        state.targetQuotaId = null;
        setDragOverQuota(null);
        return;
      }
      state.targetQuotaId = target.id;
      state.position = target.position;
      setDragOverQuota(target);
    };

    const startQuotaDragAutoScroll = () => {
      if (quotaDragAutoScrollFrameRef.current) return;
      const tick = () => {
        quotaDragAutoScrollFrameRef.current = null;
        const state = pointerQuotaDragRef.current;
        if (!state?.moved) return;
        const scrollElement = state.scrollElement;
        if (!scrollElement) return;
        const rect = scrollElement.getBoundingClientRect();
        const threshold = Math.min(110, Math.max(72, rect.height * 0.16));
        const maxSpeed = 22;
        const pointerY = quotaDragPointerRef.current.y;
        let velocity = 0;
        if (pointerY < rect.top + threshold) {
          velocity = -Math.ceil(((rect.top + threshold - pointerY) / threshold) * maxSpeed);
        } else if (pointerY > rect.bottom - threshold) {
          velocity = Math.ceil(((pointerY - (rect.bottom - threshold)) / threshold) * maxSpeed);
        }
        if (velocity !== 0) {
          scrollElement.scrollTop += velocity;
          syncQuotaDragTarget();
          quotaDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
        }
      };
      quotaDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerQuotaDragRef.current;
      if (!state) return;
      quotaDragPointerRef.current = { x: event.clientX, y: event.clientY };
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
        startQuotaDragAutoScroll();
        return;
      }
      state.targetQuotaId = target.id;
      state.position = target.position;
      setDragOverQuota(target);
      startQuotaDragAutoScroll();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerQuotaDragRef.current;
      if (!state) return;
      stopQuotaDragAutoScroll();
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
      stopQuotaDragAutoScroll();
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
      source: quota.source === "custom" ? "custom" : "standard",
      category: quota.category,
      priceScene: quota.priceScene,
      name: quota.name,
      constructionDescription: quota.constructionDescription,
      unit: quota.unit,
      quoteScope: quoteScope || normalizeQuotaScope("", `${quota.category}${quota.name}${quota.constructionDescription}`),
      laborPrice: quota.laborPrice,
      materialPrice: quota.materialPrice,
      totalPrice: quota.totalPrice,
      isSpecialPrice: quota.isSpecialPrice,
      sourceVersion: quota.updatedAt || "",
      sourceSnapshot: {
        code: quota.code,
        category: quota.category,
        priceScene: quota.priceScene,
        name: quota.name,
        constructionDescription: quota.constructionDescription,
        unit: quota.unit,
        laborPrice: quota.laborPrice,
        materialPrice: quota.materialPrice,
        totalPrice: quota.totalPrice,
        isSpecialPrice: quota.isSpecialPrice,
      },
      overriddenFields: [],
    } : { quotaId, code: "", category: "", name: "", constructionDescription: "", unit: "", quoteScope: quoteScope || "foundation", laborPrice: 0, materialPrice: 0, totalPrice: 0, isSpecialPrice: false, sourceVersion: "", sourceSnapshot: undefined, overriddenFields: [] }, { markOverride: false });
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
    const quotaById = new Map(quotaLibraryItems.map((quota) => [quota.id, quota]));
    const pickedQuotas = pickedQuotaIds
      .map((quotaId) => quotaById.get(quotaId))
      .filter((quota): quota is QuotaLibraryItem => Boolean(quota));
    setEditingTemplate((current) => current ? {
      ...current,
      spaces: current.spaces.map((space) => {
        if (space.id !== quotaPickerTarget.spaceId) return space;
        const nextItems = pickedQuotas
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
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedTemplateChanges) return;
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedTemplateChanges]);

  useEffect(() => {
    const handleBeforeAppNavigation = (event: Event) => {
      if (!hasUnsavedTemplateChanges || !editingTemplate) return;
      const navigationEvent = event as CustomEvent<{ href?: string }>;
      const href = String(navigationEvent.detail?.href || "").trim();
      if (!href) return;
      event.preventDefault();
      pendingTemplateNavigationHrefRef.current = href;
      setPendingTemplateNavigationHref(href);
      setUnsavedClosePromptOpen(true);
    };
    window.addEventListener("app:before-navigation", handleBeforeAppNavigation);
    return () => window.removeEventListener("app:before-navigation", handleBeforeAppNavigation);
  }, [editingTemplate, hasUnsavedTemplateChanges]);

  useEffect(() => {
    return () => {
      if (templateSaveTimerRef.current) window.clearTimeout(templateSaveTimerRef.current);
      if (templateSaveStatusTimerRef.current) window.clearTimeout(templateSaveStatusTimerRef.current);
      if (templateScopeErrorTimerRef.current) window.clearTimeout(templateScopeErrorTimerRef.current);
      if (comprehensiveFeeErrorTimerRef.current) window.clearTimeout(comprehensiveFeeErrorTimerRef.current);
    };
  }, []);

  const forceCloseEditingTemplate = () => {
    const pendingNavigationHref = pendingTemplateNavigationHrefRef.current;
    pendingTemplateNavigationHrefRef.current = "";
    if (spaceAutoSaveTimerRef.current) window.clearTimeout(spaceAutoSaveTimerRef.current);
    if (templateSaveTimerRef.current) window.clearTimeout(templateSaveTimerRef.current);
    if (templateSaveStatusTimerRef.current) window.clearTimeout(templateSaveStatusTimerRef.current);
    templateSaveTimerRef.current = null;
    templateSaveStatusTimerRef.current = null;
    setUnsavedClosePromptOpen(false);
    setPendingTemplateNavigationHref("");
    setEditingTemplate(null);
    setActiveSpaceId("");
    setQuotaPickerTarget(null);
    setPickedQuotaIds([]);
    setConstructionTemplatePickerOpen(false);
    setConstructionTemplateSearch("");
    setQuotaDiffOpen(false);
    setSpaceAutoSaveStatus("idle");
    setTemplateSaveStatus("idle");
    if (pendingNavigationHref) {
      router.push(pendingNavigationHref);
    }
  };

  const closeEditingTemplate = () => {
    if (hasUnsavedTemplateChanges) {
      pendingTemplateNavigationHrefRef.current = "";
      setPendingTemplateNavigationHref("");
      setUnsavedClosePromptOpen(true);
      return;
    }
    forceCloseEditingTemplate();
  };

  const continueEditingTemplate = () => {
    pendingTemplateNavigationHrefRef.current = "";
    setPendingTemplateNavigationHref("");
    setUnsavedClosePromptOpen(false);
  };

  const revealComprehensiveFeeError = (feeId: string) => {
    setHighlightedComprehensiveFeeId(feeId);
    if (comprehensiveFeeErrorTimerRef.current) {
      window.clearTimeout(comprehensiveFeeErrorTimerRef.current);
    }
    comprehensiveFeeErrorTimerRef.current = window.setTimeout(() => {
      setHighlightedComprehensiveFeeId("");
      comprehensiveFeeErrorTimerRef.current = null;
    }, 3600);
    window.requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>("[data-template-fee-row]"))
        .find((item) => item.dataset.feeId === feeId);
      comprehensiveFeesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!row) return;
      window.requestAnimationFrame(() => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = row.querySelector<HTMLInputElement>("[data-template-fee-validation-target]");
        input?.focus();
        input?.select();
      });
    });
  };

  const revealTemplateScopeError = (conflict: { type: "space" | "category"; id: string }) => {
    setHighlightedTemplateSpaceId(conflict.type === "space" ? conflict.id : "");
    setHighlightedTemplateProjectGroupId(conflict.type === "category" ? conflict.id : "");
    if (templateScopeErrorTimerRef.current) {
      window.clearTimeout(templateScopeErrorTimerRef.current);
    }
    templateScopeErrorTimerRef.current = window.setTimeout(() => {
      setHighlightedTemplateSpaceId("");
      setHighlightedTemplateProjectGroupId("");
      templateScopeErrorTimerRef.current = null;
    }, 3600);
    templateSpaceConfigRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      if (conflict.type === "space") {
        const tab = Array.from(document.querySelectorAll<HTMLElement>("[data-template-space-tab]"))
          .find((item) => item.dataset.spaceId === conflict.id);
        tab?.scrollIntoView({ behavior: "smooth", block: "center" });
        tab?.querySelector<HTMLInputElement>("[data-template-scope-name-input]")?.focus();
        return;
      }
      const targetSpace = editingTemplate?.spaces.find((space) => (
        getSpaceProjectGroups(space, templateProjectGroups).some((group) => group.id === conflict.id)
      )) || editingTemplate?.spaces[0];
      if (!targetSpace) return;
      setActiveSpaceId(targetSpace.id);
      setActiveQuotaScope(conflict.id);
      window.setTimeout(() => {
        const tab = Array.from(document.querySelectorAll<HTMLElement>("[data-template-project-group-tab]"))
          .find((item) => item.dataset.projectGroupId === conflict.id);
        tab?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    });
  };

  const discardTemplateChangesAndClose = () => {
    if (spaceAutoSaveTimerRef.current) window.clearTimeout(spaceAutoSaveTimerRef.current);
    if (editingMode === "create") {
      clearTemplateDraftFromStorage();
    } else if (openedTemplateRef.current) {
      const originalTemplate = openedTemplateRef.current;
      replaceLocalTemplate(originalTemplate);
      void saveTemplateToServer(originalTemplate).catch((error: any) => {
        window.alert(error?.message || "恢复预算模板失败，请稍后重试");
      });
      setSelectedId(originalTemplate.id);
    }
    openedTemplateRef.current = null;
    openedTemplatePayloadRef.current = "";
    forceCloseEditingTemplate();
  };

  const saveEditingTemplate = () => {
	    if (!editingTemplate) return;
	    if (templateSaveStatus !== "idle") return;
	    if (!editingTemplate.name.trim()) {
	      window.alert("请填写模板名称");
	      return;
	    }
    const nextTemplateScope = normalizeEditableTemplateScope(editingTemplate);
    if (!nextTemplateScope?.orgUnitId) {
      window.alert("请选择模板适用的分公司");
      return;
    }
    const scopeNameConflicts = getTemplateScopeNameConflicts(editingTemplate);
    const firstScopeNameConflict = scopeNameConflicts[0];
    if (firstScopeNameConflict) {
      window.alert(
        `空间/类别名称不能重复：「${firstScopeNameConflict.conflictNames.join("、")}」。\n\n请修改为不同名称后再保存。`,
      );
      revealTemplateScopeError(firstScopeNameConflict);
      return;
    }
    const comprehensiveFeesWithDrafts = editingTemplate.comprehensiveFees.map((fee) => (
      comprehensiveFeeMode === "formula" && (fee.valueSource || "formula") !== "formula"
        ? fee
        : feeFormulaDrafts[fee.id] !== undefined
        ? {
          ...fee,
          fee_calc_base: bindStableFeeFormula(
            feeFormulaDrafts[fee.id],
            editingTemplate.comprehensiveFees,
            0,
            templateFeeScopeReferences,
          ),
        }
        : fee
    ));
    const comprehensiveFeeValidationItems = buildTemplateFormulaFeeItems(comprehensiveFeesWithDrafts);
    const formulaFinalFeeCount = comprehensiveFeesWithDrafts.filter((fee) => fee.isFinalTotal).length;
    if (comprehensiveFeeMode === "formula" && formulaFinalFeeCount !== 1) {
      window.alert("自由公式表必须且只能设置一行“报价总额”。");
      const targetFee = comprehensiveFeesWithDrafts.find((fee) => fee.isFinalTotal) || comprehensiveFeesWithDrafts[0];
      if (targetFee) revealComprehensiveFeeError(targetFee.id);
      return;
    }
    const comprehensiveFeeErrors = comprehensiveFeesWithDrafts.map((fee, feeIndex) => {
      const valueSource = comprehensiveFeeMode === "formula" ? fee.valueSource || "formula" : "formula";
      const method = normalizeFeeCalcMethod(fee.fee_calc_method);
      const errors = [
        String(fee.name || "").trim() ? "" : "请填写费用名称",
        valueSource === "fixed"
          ? /^-?\d+(?:\.\d+)?$/.test(String(fee.fee_calc_base || "").trim())
            ? ""
            : "固定金额请填写数字"
          : valueSource !== "formula" || method === "fixed" || method === "area_unit"
            ? ""
            : getFeeCalcBaseError(
              fee.fee_calc_base,
              0,
              0,
              {},
              templateFeeFormulaContext,
              comprehensiveFeeValidationItems,
              feeIndex,
            ),
      ].filter(Boolean);
      return errors.length > 0 ? { feeId: fee.id, feeIndex, message: Array.from(new Set(errors)).join("；") } : null;
    }).filter((error): error is { feeId: string; feeIndex: number; message: string } => Boolean(error));
    const firstComprehensiveFeeError = comprehensiveFeeErrors[0];
    if (firstComprehensiveFeeError) {
      const fee = comprehensiveFeesWithDrafts[firstComprehensiveFeeError.feeIndex];
      window.alert(
        `综合费用配置有误，无法保存。\n\n第 ${formatAlphaSequence(firstComprehensiveFeeError.feeIndex)} 行「${String(fee?.name || "").trim() || "未命名费用"}」：${firstComprehensiveFeeError.message}\n\n已定位到该费用项目，请修改后重试。`,
      );
      revealComprehensiveFeeError(firstComprehensiveFeeError.feeId);
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
      autoScope: nextTemplateScope,
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
      comprehensiveFees: normalizeComprehensiveFees(comprehensiveFeesWithDrafts)
        .map((fee) => {
          const valueSource = comprehensiveFeeMode === "formula" ? fee.valueSource || "formula" : "formula";
          const method = comprehensiveFeeMode === "formula"
            ? valueSource === "manual"
              ? "fixed"
              : valueSource === "formula" || valueSource === "fixed"
                ? "formula"
                : "reference"
            : normalizeFeeCalcMethod(fee.fee_calc_method);
          return {
            ...fee,
            name: fee.name.trim(),
            valueSource,
            isFinalTotal: comprehensiveFeeMode === "formula" && fee.isFinalTotal === true,
            fee_calc_method: method,
            fee_calc_base: valueSource === "fixed"
              ? normalizeFeeCalcBase(fee.fee_calc_base) || "0"
              : method === "fixed" || valueSource === "discount"
                ? ""
                : method === "area_unit"
                  ? "房屋面积"
                  : normalizeFeeCalcBase(fee.fee_calc_base),
            fee_rate: method === "percent" ? toAmount(fee.fee_rate) : 0,
            unit_price: method === "fixed" || method === "area_unit" ? toAmount(fee.unit_price) : 0,
            remark: fee.remark.trim(),
            fee_scope_mode: (fee.fee_scope_mode === "include" || fee.fee_scope_mode === "exclude" ? fee.fee_scope_mode : "all") as FeeScopeMode,
            fee_scope_space_names: Array.from(new Set((fee.fee_scope_space_names || []).map((name) => name.trim()).filter(Boolean))),
          };
        })
        .filter((fee) => fee.name),
      appendixNote: editingTemplate.appendixNote.trim(),
      budgetCompilationHtml: editingTemplate.budgetCompilationHtml.trim(),
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
      createdAt: editingTemplate.createdAt || todayText(),
      updatedAt: todayText(),
    };
    setTemplateSaveStatus("saving");
    replaceLocalTemplate(nextTemplate);
    void saveTemplateToServer(nextTemplate).catch((error: any) => {
      window.alert(error?.message || "保存预算模板失败，请稍后重试");
    });
    setSelectedId(nextTemplate.id);
    openedTemplateRef.current = nextTemplate;
    openedTemplatePayloadRef.current = getTemplateDirtyPayload(nextTemplate);
    setUnsavedClosePromptOpen(false);
    if (editingMode === "create") clearTemplateDraftFromStorage();
    if (spaceAutoSaveTimerRef.current) window.clearTimeout(spaceAutoSaveTimerRef.current);
    lastSpaceAutoSavePayloadRef.current = "";
    setSpaceAutoSaveStatus("saved");
    templateSaveStatusTimerRef.current = window.setTimeout(() => {
      setTemplateSaveStatus("saved");
      templateSaveStatusTimerRef.current = null;
    }, 180);
    templateSaveTimerRef.current = window.setTimeout(() => {
      openedTemplateRef.current = null;
      openedTemplatePayloadRef.current = "";
      forceCloseEditingTemplate();
    }, 680);
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
            {templatesLoading && (
              <span className="inline-flex h-8 items-center gap-1.5 px-1 text-xs font-medium text-surface-500" role="status" aria-live="polite">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                正在加载
              </span>
            )}
            <div className="quota-template-filter-group flex items-center gap-2">
              <span className="quota-template-filter-label inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500"><SlidersHorizontal className="h-3.5 w-3.5" />筛选</span>
              <SystemSelect value={pricingModeFilter} onChange={(event) => setPricingModeFilter(event.target.value as PricingMode | "")} className="input-field h-10 w-44 py-0">
                <option value="">全部报价模式</option>
                {pricingModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SystemSelect>
              <SystemSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TemplateStatus | "")} className="input-field h-10 w-32 py-0">
                <option value="">全部状态</option>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </SystemSelect>
              <SystemSelect
                value={branchScopeFilter}
                onChange={(event) => setBranchScopeFilter(event.target.value)}
                className="input-field h-10 w-48 py-0"
                menuMinWidth={340}
                menuMaxHeight={260}
                searchable
                searchPlaceholder="搜索分公司"
              >
                <option value="">全部分公司</option>
                {templateScopeOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.path || option.name}</option>
                ))}
              </SystemSelect>
            </div>
            <span className="quota-template-toolbar-divider mx-1 h-5 w-px bg-surface-200" />
            <button type="button" onClick={openCreateTemplate} className="quota-template-primary-action btn-primary min-h-10 px-3"><Plus className="h-4 w-4" />新增模板</button>
          </div>
        </div>
      </section>

      <section className="table-shell quota-list-shell flex min-h-0 flex-1 flex-col">
        <ThinScrollArea className="quota-list-scroll min-h-0 flex-1" scrollClassName="h-full overflow-y-auto">
	          <table className="quota-list-table w-full min-w-[1680px] table-fixed text-sm">
	            <colgroup>
	              <col className="w-[4%]" />
	              <col className="w-[18%]" />
	              <col className="w-[10%]" />
	              <col className="w-[12%]" />
	              <col className="w-[8%]" />
	              <col className="w-[15%]" />
	              <col className="w-[9%]" />
	              <col className="w-[9%]" />
	              <col className="w-[6%]" />
	              <col className="w-[9%]" />
            </colgroup>
            <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
              <tr className="border-b border-surface-300">
                <th className="px-3 py-3 text-center">序号</th>
	                <th className="px-3 py-3 text-left">模板名称</th>
	                <th className="px-3 py-3 text-center">报价模式</th>
	                <th className="px-3 py-3 text-center">适用范围</th>
                <th className="px-3 py-3 text-center">创建人</th>
                <th className="px-3 py-3 text-left">备注说明</th>
                <th className="px-3 py-3 text-center">更新时间</th>
                <th className="px-3 py-3 text-center">创建时间</th>
                <th className="px-3 py-3 text-center">状态</th>
                <th className="px-3 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {templatesLoading && pagination.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center">
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-surface-500" role="status" aria-live="polite">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-600" aria-hidden="true" />
                      正在读取预算模板
                    </div>
                  </td>
                </tr>
              ) : pagination.pageItems.length === 0 ? (
                <tr>
	                  <td colSpan={10} className="quota-template-empty-cell px-3 py-10 text-center">
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
                    className="cursor-pointer bg-white outline-none ring-inset hover:bg-surface-50 focus-visible:ring-2 focus-visible:ring-primary-200"
                    title="点击编辑模板"
                  >
                    <td className="px-3 py-3 text-center font-semibold tabular-nums text-surface-500">{rowNumber}</td>
                    <td className="quota-template-name-cell px-3 py-3">
                      <p className="truncate font-semibold text-surface-900" title={template.name}>{template.name}</p>
                    </td>
	                    <td className="px-3 py-3 text-center text-surface-700">
	                      <span className="inline-flex min-h-6 items-center rounded-md bg-transparent px-2 text-xs font-semibold text-surface-700">
	                        {getPricingModeLabel(template.quoteConfig.mode) || "-"}
	                      </span>
	                    </td>
	                    <td className="px-3 py-3 text-center text-surface-700">
	                      <span className="inline-flex max-w-full items-center rounded-md bg-transparent px-2 py-1 text-xs font-medium text-surface-700" title={getQuotaTemplateScopePath(template, templateScopeOptions as any)}>
	                        <span className="truncate">{getQuotaTemplateScopeLabel(template, templateScopeOptions as any)}</span>
	                      </span>
	                    </td>
                    <td className="px-3 py-3 text-center text-surface-700">
                      <span className="block truncate" title={template.createdByName || DEFAULT_TEMPLATE_CREATOR}>{template.createdByName || DEFAULT_TEMPLATE_CREATOR}</span>
                    </td>
                    <td className="px-3 py-3 text-surface-700">
                      <p className="line-clamp-2 leading-5" title={template.remark || undefined}>{template.remark || "-"}</p>
                    </td>
                    <td className="px-3 py-3 text-center text-surface-500">{template.updatedAt}</td>
                    <td className="px-3 py-3 text-center text-surface-500">{template.createdAt || template.updatedAt}</td>
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
        <div className="quota-template-editor fixed bottom-0 right-0 top-0 z-[70] bg-surface-50 max-md:left-0 md:left-[var(--active-sidebar-width)]">
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
              {quotaSourceUpdates.length > 0 ? (
                <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#f7b955] bg-[#fff7e6] px-4 py-3.5 ring-1 ring-[#ffd88a]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#f79009] text-white">
                      <AlertTriangle className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#92400e]">检测到 {quotaSourceUpdates.length} 个模板项目对应的基装定额已更新</p>
                      <p className="mt-1 text-[11px] text-[#8a5a16]">更新时只同步未手动修改的字段，已手动修改的内容会保留。已有报价不会发生变化。</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQuotaDiffExpandedFields([]);
                        setQuotaDiffOpen(true);
                      }}
                      className="inline-flex h-9 items-center rounded-[8px] border border-[#f0a23a] bg-white px-4 text-[12px] font-semibold text-[#a85a00] transition hover:bg-[#fff3d8]"
                    >
                      查看差异
                    </button>
                    <button
                      type="button"
                      onClick={applyQuotaSourceUpdates}
                      className="inline-flex h-9 items-center rounded-[8px] border border-[#e27b00] bg-[#f79009] px-4 text-[12px] font-semibold text-white transition hover:border-[#c96b00] hover:bg-[#dc7a00]"
                    >
                      更新到最新
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="quota-template-top-config-grid grid items-stretch gap-4 lg:grid-cols-2">
                <section className="quota-template-editor-section flex h-full flex-col rounded-lg border border-surface-200 bg-white">
                  <div className="border-b border-surface-200 bg-surface-100 px-4 py-2.5 text-sm font-semibold text-surface-900">基础配置</div>
                  <div className="grid gap-3 p-3">
	                    <label className="space-y-1.5">
	                      <span className="text-xs font-semibold text-surface-600">模板名称 <span className="text-red-500">*</span></span>
	                      <input value={editingTemplate.name} onChange={(event) => setEditingTemplate({ ...editingTemplate, name: event.target.value })} className="input-field" placeholder="如：番禺店标准半包模板" />
	                    </label>
		                    <div className="grid gap-3">
		                      <label className="space-y-1.5">
		                        <span className="text-xs font-semibold text-surface-600">适用分公司 <span className="text-red-500">*</span></span>
		                        <SystemSelect
		                          value={editingTemplate.autoScope?.orgUnitId || editingTemplate.autoScope?.branchOrgUnitId || ""}
		                          onChange={(event) => handleTemplateBranchChange(event.target.value)}
		                          disabled={templateScopeOptions.length === 0}
		                          className="input-field h-10 py-0 disabled:cursor-not-allowed disabled:bg-surface-100 disabled:text-surface-400"
		                          menuMinWidth={360}
		                          menuMaxHeight={260}
		                          searchable
		                          searchPlaceholder="搜索分公司"
		                        >
		                          <option value="">{templateScopeOptions.length > 0 ? "选择分公司" : "暂无可选分公司"}</option>
		                          {templateScopeOptions.map((option) => (
	                            <option key={option.id} value={option.id}>{option.path || option.name}</option>
	                          ))}
	                        </SystemSelect>
	                      </label>
	                    </div>
	                    <label className="space-y-1.5">
	                      <span className="text-xs font-semibold text-surface-600">备注说明</span>
	                      <textarea value={editingTemplate.remark} onChange={(event) => setEditingTemplate({ ...editingTemplate, remark: event.target.value })} className="input-field min-h-16 resize-none leading-5" placeholder="填写模板适用场景、使用说明或注意事项" />
                    </label>
                  </div>
                </section>
                <section className="quota-template-editor-section quota-template-construction-section flex h-full flex-col rounded-lg border border-surface-200 bg-white">
                  <div className="border-b border-surface-200 bg-surface-100 px-4 py-2.5 text-sm font-semibold text-surface-900">施工模板配置</div>
                  <div className={selectedConstructionTemplateConfig.name ? "quota-template-construction-body flex min-h-0 flex-1 items-stretch p-4" : "quota-template-construction-body flex min-h-0 flex-1 items-stretch p-3"}>
                    {selectedConstructionTemplateConfig.name ? (
                      <div className="quota-template-construction-card relative flex min-h-28 w-full flex-1 rounded-lg border border-primary-100 bg-primary-50/40 px-3 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setConstructionTemplatePickerOpen(true);
                            if (!constructionTemplateLoading && (constructionTemplateOptions.length === 0 || constructionTemplateError)) {
                              void loadConstructionTemplateOptions();
                            }
                          }}
                          className="flex min-h-full w-full flex-col items-center justify-center rounded-md px-10 py-2 transition hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200"
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
                        className="quota-template-construction-card flex min-h-28 w-full flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-white px-3 py-4 text-center transition hover:border-primary-200 hover:bg-primary-50/40"
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
              <section ref={templateSpaceConfigRef} className="quota-template-editor-section quota-template-space-config rounded-lg border border-surface-200 bg-white">
                <div className="quota-template-space-config-head flex items-center justify-between border-b border-surface-200 bg-surface-100 px-4 py-3">
                  <div className="quota-template-space-config-title">
                    <span className="quota-template-space-config-icon"><LayoutGrid /></span>
                    <div>
                      <p className="text-sm font-semibold text-surface-900">{spaceConfigCopy.title}</p>
                      <p className="mt-0.5 text-xs text-surface-500">{spaceConfigCopy.description}</p>
                    </div>
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
                    <span className="quota-template-mode-pill font-semibold">
                      <ClipboardList />
                      {spaceConfigCopy.modeName}
                    </span>
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
                          <span className="quota-template-space-sidebar-icon"><Layers3 /></span>
                          <span>空间/类别</span>
                        </div>
                      <div className="quota-template-space-toolbar pb-1">
                        <div className="quota-template-space-toolbar-inner flex flex-wrap items-center gap-2 border-b border-surface-200 pb-3">
                          {editingTemplate.spaces.map((space, spaceIndex) => {
                            const isActive = activeSpace?.id === space.id;
                            const spaceNameDraft = spaceNameDrafts[space.id];
                            const displayedSpaceName = spaceNameDraft ?? space.name;
                            const spaceNameError = spaceNameDraft !== undefined
                              ? getSpaceNameConflictMessage(space.id, spaceNameDraft)
                              : "";
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
                                } ${highlightedTemplateSpaceId === space.id ? "ring-2 ring-red-400 ring-offset-1" : ""} ${draggingSpaceId === space.id ? "scale-[0.98] opacity-55" : ""} ${recentlyMovedSpaceId === space.id ? "template-space-tab-moved" : ""} ${spaceDropBefore ? "template-space-drop-before" : ""} ${spaceDropAfter ? "template-space-drop-after" : ""}`}
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
                                  value={displayedSpaceName}
                                  onFocus={() => setActiveSpaceId(space.id)}
                                  onClick={() => setActiveSpaceId(space.id)}
                                  onChange={(event) => setSpaceNameDrafts((current) => ({ ...current, [space.id]: event.target.value }))}
                                  onBlur={() => commitSpaceNameDraft(space.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      if (commitSpaceNameDraft(space.id)) event.currentTarget.blur();
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      setSpaceNameDrafts((current) => {
                                        const next = { ...current };
                                        delete next[space.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  data-template-scope-name-input
                                  aria-invalid={!!spaceNameError}
                                  className={isActive
	                                    ? `h-full min-w-0 flex-1 rounded bg-transparent text-center text-xs font-medium text-white outline-none placeholder:text-primary-100 ${spaceNameError ? "ring-2 ring-inset ring-red-300" : ""}`
	                                    : `h-full min-w-0 flex-1 rounded bg-transparent text-center text-xs font-medium text-surface-500 outline-none placeholder:text-surface-400 ${spaceNameError ? "ring-2 ring-inset ring-red-300" : ""}`
                                  }
                                  placeholder={`空间${spaceIndex + 1}`}
                                  title={spaceNameError || undefined}
                                />
                                <span className="quota-template-space-item-count">{space.quotaItems.length}</span>
                              </div>
                            );
                          })}
                          <button type="button" onClick={addSpace} className="quota-template-add-space btn-secondary min-h-9 px-3 text-xs">
                            <Plus className="h-3.5 w-3.5" />
                            添加空间/类别
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
                                <div className="quota-template-space-main-head-top">
                                  <div className="quota-template-space-main-title">
                                    <strong>{activeSpace.name || "未命名空间"}</strong>
                                  </div>
                                </div>
                                <div className="quota-template-space-main-head-toolbar">
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
                                        <span className="quota-template-project-group-add-icon" data-scope={group.id}>
                                          <TemplateProjectGroupIcon scope={group.id} />
                                        </span>
                                        {group.name}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="quota-template-space-main-actions">
                                    <button type="button" onClick={() => copySpace(activeSpace.id)} title="复制空间">
                                      <Copy className="h-3.5 w-3.5" />
                                      复制空间
                                    </button>
                                    <button type="button" onClick={() => removeSpace(activeSpace.id)} data-danger title="删除空间">
                                      <Trash2 className="h-3.5 w-3.5" />
                                      删除空间
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
                        const isMainMaterialSection = activeSection.scope === "main_material";
                        const isEmptyMainMaterialItem = (item: TemplateSpaceQuota) => !item.code.trim() && !item.name.trim() && !item.unit.trim() && !item.constructionDescription.trim() && Number(item.totalPrice || 0) === 0;

                        return (
                          <div className="quota-template-space-main">
                            <div className="quota-template-space-main-head">
                              <div className="quota-template-space-main-head-top">
                                <div className="quota-template-space-main-title">
                                  <strong>{activeSpace.name || "未命名空间"}</strong>
                                </div>
                              </div>
                              <div className="quota-template-space-main-head-toolbar">
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
	                                            ? `inline-flex h-8 min-w-28 items-center rounded px-1.5 text-xs font-medium text-white shadow-sm transition bg-primary-600 ${highlightedTemplateProjectGroupId === section.scope ? "ring-2 ring-red-400 ring-offset-1" : ""} ${isDragging ? "scale-[0.98] opacity-55" : ""} ${recentlyMoved ? "template-project-group-tab-moved" : ""} ${dropBefore ? "template-project-group-drop-before" : ""} ${dropAfter ? "template-project-group-drop-after" : ""}`
	                                            : `inline-flex h-8 min-w-28 items-center rounded px-1.5 text-xs font-medium text-surface-600 transition hover:bg-surface-50 hover:text-surface-900 ${highlightedTemplateProjectGroupId === section.scope ? "ring-2 ring-red-400 ring-offset-1" : ""} ${isDragging ? "scale-[0.98] opacity-55" : ""} ${recentlyMoved ? "template-project-group-tab-moved" : ""} ${dropBefore ? "template-project-group-drop-before" : ""} ${dropAfter ? "template-project-group-drop-after" : ""}`
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
                                          <span className="quota-template-project-group-icon" data-scope={section.scope}>
                                            <TemplateProjectGroupIcon scope={section.scope} />
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setActiveQuotaScope(section.scope)}
                                            className={isActive
	                                              ? "h-full min-w-0 flex-1 truncate bg-transparent px-1 text-left text-xs font-medium text-white outline-none"
	                                              : "h-full min-w-0 flex-1 truncate bg-transparent px-1 text-left text-xs font-medium text-surface-600 outline-none"
                                            }
                                          >
                                            {section.title}
                                          </button>
                                          <span className={isActive
	                                            ? "ml-1 shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-medium text-white"
	                                            : "ml-1 shrink-0 rounded-full bg-surface-100 px-1.5 py-0.5 text-[11px] font-medium text-surface-500"
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
                                      <span className="quota-template-project-group-add-icon" data-scope={group.id}>
                                        <TemplateProjectGroupIcon scope={group.id} />
                                      </span>
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
                                <div className="quota-template-space-main-actions">
                                  <button type="button" onClick={() => copySpace(activeSpace.id)} title="复制空间">
                                    <Copy className="h-3.5 w-3.5" />
                                    复制空间
                                  </button>
                                  <button type="button" onClick={() => removeSpace(activeSpace.id)} data-danger title="删除空间">
                                    <Trash2 className="h-3.5 w-3.5" />
                                    删除空间
                                  </button>
                                </div>
                              </div>
                            </div>
                          <div className="quota-template-project-board overflow-hidden rounded-lg border border-surface-200 bg-white">
                            <div
                              ref={projectScrollRef}
                              onScroll={updateProjectScrollHint}
                              className="quota-template-project-scroll overflow-y-auto overflow-x-auto"
                            >
                              <table className="quota-template-project-table w-full min-w-[1320px] table-fixed text-sm">
                                {isMainMaterialSection ? (
                                  <colgroup>
                                    <col className="w-[5%]" />
                                    <col className="w-[8%]" />
                                    <col className="w-[16%]" />
                                    <col className="w-[5%]" />
                                    <col className="w-[12%]" />
                                    <col className="w-[10%]" />
                                    <col className="w-[36%]" />
                                    <col className="w-[8%]" />
                                  </colgroup>
                                ) : (
                                  <colgroup>
                                    <col className="w-[5%]" />
                                    <col className="w-[9%]" />
                                    <col className="w-[28%]" />
                                    <col className="w-[5%]" />
                                    <col className="w-[12%]" />
                                    <col className="w-[8%]" />
                                    <col className="w-[27%]" />
                                    <col className="w-[6%]" />
                                  </colgroup>
                                )}
                                <thead className="bg-white text-xs font-semibold text-surface-600">
                                  {isMainMaterialSection ? (
                                    <tr className="border-b border-surface-200">
                                      <th className="px-2 py-2 text-center">序号</th>
                                      <th className="px-3 py-2 text-left">产品编码</th>
                                      <th className="px-3 py-2 text-left">材料名称</th>
                                      <th className="px-2 py-2 text-center">单位</th>
                                      <th className="px-2 py-2 text-center">预设数量</th>
                                      <th className="px-2 py-2 text-right">单价</th>
                                      <th className="px-3 py-2 text-left">备注</th>
                                      <th className="px-3 py-2 text-center">操作</th>
                                    </tr>
                                  ) : (
                                    <tr className="border-b border-surface-200">
                                      <th className="px-2 py-2 text-center">序号</th>
                                      <th className="px-3 py-2 text-left">定额编码</th>
                                      <th className="px-3 py-2 text-left">项目名称</th>
                                      <th className="px-2 py-2 text-center">单位</th>
                                      <th className="px-2 py-2 text-center">预设数量</th>
                                      <th className="px-2 py-2 text-right">{spaceConfigCopy.priceHeader}</th>
                                      <th className="px-3 py-2 text-left">施工说明</th>
                                      <th className="px-3 py-2 text-center">操作</th>
                                    </tr>
                                  )}
                                </thead>
                                <tbody className="divide-y divide-surface-100">
                                  {sectionItems.length === 0 ? (
                                    <tr>
                                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-surface-400">
                                        <div className="quota-template-table-empty">
                                          <p>{activeSection.emptyText}</p>
                                          <span>下方按钮可继续添加当前分组的报价项目。</span>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : sectionItems.map((item, itemIndex) => {
                                    const isDragging = draggingQuotaId === item.id;
                                    const dropBefore = dragOverQuota?.id === item.id && dragOverQuota.position === "before";
                                    const dropAfter = dragOverQuota?.id === item.id && dragOverQuota.position === "after";
                                    const recentlyMoved = recentlyMovedQuotaId === item.id;
                                    const isQuantityPicking = Boolean(
                                      templateQuantityEditor
                                      && templateQuantityEditor.spaceId === activeSpace.id
                                      && normalizeQuotaScope(templateQuantityEditor.scope) === normalizeQuotaScope(activeSection.scope),
                                    );
                                    const isQuantityTarget = isQuantityPicking && templateQuantityEditor?.itemId === item.id;
                                    const canPickQuantityReference = isQuantityPicking
                                      && !isQuantityTarget
                                      && String(item.unit || "").trim() === String(templateQuantityEditorTarget?.unit || "").trim();
                                    const quantityPickState = isQuantityPicking
                                      ? isQuantityTarget
                                        ? "target"
                                        : canPickQuantityReference
                                          ? "available"
                                          : "mismatch"
                                      : undefined;
                                    return (
                                    <tr
                                      key={item.id}
                                      data-template-quota-row
                                      data-quota-id={item.id}
                                      data-quota-scope={activeSection.scope}
                                      data-quantity-pick-state={quantityPickState}
                                      className={`template-quota-row align-middle transition ${isDragging ? "opacity-45" : ""} ${recentlyMoved ? "quote-item-row-moved" : ""} ${dropBefore ? "quote-item-row-drop-before border-t-2 border-t-teal-500" : ""} ${dropAfter ? "quote-item-row-drop-after border-b-2 border-b-teal-500" : ""}`}
                                      onClick={(event) => {
                                        if (!canPickQuantityReference) return;
                                        const target = event.target instanceof HTMLElement ? event.target : null;
                                        if (target?.closest("button,input,textarea,select")) return;
                                        insertTemplateQuantityRowNumber(itemIndex + 1);
                                      }}
                                    >
                                      <td className="px-2 py-2 text-center">
                                        <div className="quota-template-quota-sequence-cell">
                                          <span>{itemIndex + 1}</span>
                                          <button
                                            type="button"
                                            onPointerDown={(event) => startPointerQuotaDrag(event, activeSpace.id, item.id, activeSection.scope)}
                                            className="cursor-grab touch-none"
                                            title="拖动调整定额顺序"
                                            aria-label={`拖动${item.name || item.code || "定额"}调整顺序`}
                                          >
                                            <GripVertical className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 font-mono text-xs font-medium text-surface-700">
                                        {isMainMaterialSection ? (
                                          <input
                                            value={item.code}
                                            onChange={(event) => updateSpaceQuota(activeSpace.id, item.id, { code: event.target.value })}
                                            className="quota-template-project-plain-input h-8 w-full bg-transparent font-mono text-xs font-medium text-surface-700 outline-none"
                                          />
                                        ) : item.code ? (
                                          <span className="block truncate" title={item.code}>{item.code}</span>
                                        ) : (
                                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-sans text-[11px] font-semibold text-amber-700">自定义</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-2">
                                        <span
                                          contentEditable
                                          suppressContentEditableWarning
	                                          className="quota-template-project-alias block truncate text-xs font-medium text-surface-500"
                                          title="点击修改当前模板中的项目别名，不影响基装定额库"
                                          role="textbox"
                                          aria-label={isMainMaterialSection ? "材料名称" : "项目别名"}
                                          onBlur={(event) => {
                                            const nextName = (event.currentTarget.textContent || "").trim();
                                            if (!nextName) {
                                              if (isMainMaterialSection) {
                                                updateSpaceQuota(activeSpace.id, item.id, { name: "" });
                                                return;
                                              }
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
                                          {item.name || ""}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-center text-surface-700">
                                        {isMainMaterialSection ? (
                                          <input
                                            value={item.unit}
                                            onChange={(event) => updateSpaceQuota(activeSpace.id, item.id, { unit: event.target.value })}
                                            className="quota-template-project-plain-input h-8 w-full bg-transparent text-center text-xs font-medium text-surface-700 outline-none"
                                          />
                                        ) : item.unit || ""}
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        <TemplateQuantityInput
                                          item={item}
                                          onChange={(quantity) => updateSpaceQuota(activeSpace.id, item.id, {
                                            quantity,
                                            quantityFormula: null,
                                          }, { markOverride: false })}
                                          onOpenFormula={() => openTemplateQuantityEditor(activeSpace.id, item.id)}
                                        />
                                      </td>
                                      {isMainMaterialSection ? (
                                        <>
                                          <td className="px-2 py-2 text-right tabular-nums text-surface-700">
                                            <input
                                              type="text"
                                              {...getTemplateNumberInputProps(`spaceQuota.${activeSpace.id}.${item.id}.totalPrice`, item.totalPrice, (value) => updateSpaceQuota(activeSpace.id, item.id, { totalPrice: value }))}
                                              className="quota-template-project-plain-input h-8 w-full bg-transparent text-right text-xs font-medium tabular-nums text-surface-700 outline-none"
                                            />
                                            {!isEmptyMainMaterialItem(item) && item.isSpecialPrice && (
                                              <span className="quota-template-project-special-mark" title="特价项目">特</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-surface-700">
                                            <input
                                              value={item.constructionDescription}
                                              onChange={(event) => updateSpaceQuota(activeSpace.id, item.id, { constructionDescription: event.target.value })}
                                              className="quota-template-project-plain-input h-8 w-full bg-transparent text-xs font-medium text-surface-700 outline-none"
                                            />
                                          </td>
                                        </>
                                      ) : (
                                        <>
                                          <td className={`${spaceConfigCopy.priceClassName} quota-template-project-price-cell`} title={spaceConfigCopy.priceTitle}>
                                            <span className="quota-template-project-price-value">{formatAmount(item.totalPrice)}</span>
                                            {item.isSpecialPrice && (
                                              <span className="quota-template-project-special-mark" title="特价项目">特</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-surface-700">
                                            <p className="line-clamp-3 leading-5" title={item.constructionDescription || undefined}>{item.constructionDescription || "-"}</p>
                                          </td>
                                        </>
                                      )}
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
                              {sectionItems.length > 0 && hasMoreProjectItemsBelow && (
                                <div className="quota-template-project-more-hint" aria-hidden="true">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                  下方还有项目，继续向下滚动
                                </div>
                              )}
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
              <section ref={comprehensiveFeesSectionRef} data-comprehensive-fee-section className="quota-template-editor-section rounded-lg border border-surface-200 bg-white">
                <div className="flex items-center justify-between border-b border-surface-200 bg-surface-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">综合费用配置</p>
                    <p className="mt-0.5 text-xs text-surface-500">按行配置公式，金额完全由公式决定；报价总额取已标记的汇总行。</p>
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
                    <div className="quota-template-fee-table-shell overflow-hidden rounded-lg border border-surface-200">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1260px] table-fixed text-sm">
                          <colgroup>
                            <col className="w-[5%]" />
                            <col className="w-[6%]" />
                            <col className="w-[13%]" />
                            <col className="w-[10%]" />
                            <col className="w-[24%]" />
                            <col className="w-[9%]" />
                            <col className="w-[24%]" />
                            <col className="w-[9%]" />
                          </colgroup>
                          <thead className="bg-surface-50 text-xs font-semibold text-surface-600">
                            <tr className="border-b border-surface-200">
                              <th className="px-2 py-2 text-center"></th>
                              <th className="px-3 py-2 text-center">编号</th>
                              <th className="px-3 py-2 text-left">费用名称</th>
                              <th className="px-3 py-2 text-center">{comprehensiveFeeMode === "formula" ? "取值方式" : "计算方式"}</th>
                              <th className="px-3 py-2 text-left">基础公式</th>
                              <th className="px-3 py-2 text-center">默认统计范围</th>
                              <th className="px-3 py-2 text-left">备注</th>
                              <th className="px-3 py-2 text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-100">
                            {editingTemplate.comprehensiveFees.map((fee, feeIndex) => {
                              const feeMethod = normalizeFeeCalcMethod(fee.fee_calc_method);
                              const feeBaseError = templateFeeBaseErrors[feeIndex] || "";
                              const feeNameError = templateFeeNameErrors[feeIndex] || "";
                              const highlighted = highlightedComprehensiveFeeId === fee.id;
                              const isDragging = draggingFeeId === fee.id;
                              const dropBefore = dragOverFee?.id === fee.id && dragOverFee.position === "before";
                              const dropAfter = dragOverFee?.id === fee.id && dragOverFee.position === "after";
                              const recentlyMoved = recentlyMovedFeeId === fee.id;
                              const feeValueSource = fee.valueSource || "formula";
                              const formulaInputValue = feeValueSource === "direct"
                                ? "直接费"
                                : feeValueSource === "discount"
                                  ? "报价优惠"
                                  : feeValueSource === "manual"
                                    ? ""
                                    : feeFormulaDrafts[fee.id] ?? formatStableFeeFormula(fee.fee_calc_base, editingTemplate.comprehensiveFees);
                              return (
                                <tr
                                  key={fee.id}
                                  data-template-fee-row
                                  data-fee-id={fee.id}
                                  data-value-source={feeValueSource}
                                  data-final-total={fee.isFinalTotal ? "true" : undefined}
                                  className={`template-fee-row align-middle transition ${isDragging ? "opacity-45" : ""} ${recentlyMoved ? "quote-item-row-moved" : ""} ${highlighted ? "bg-red-50 ring-2 ring-inset ring-red-400" : ""} ${dropBefore ? "quote-item-row-drop-before border-t-2 border-t-teal-500" : ""} ${dropAfter ? "quote-item-row-drop-after border-b-2 border-b-teal-500" : ""}`}
                                >
                                  <td className="px-2 py-2 text-center">
                                    {fee.isFinalTotal ? (
                                      <button
                                        type="button"
                                        onPointerDown={(event) => startPointerFeeDrag(event, fee.id)}
                                        className="inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md bg-surface-100 text-surface-300 transition hover:bg-surface-200 active:cursor-grabbing"
                                        title="报价总额，拖动调整顺序"
                                        aria-label={`报价总额，拖动${fee.name || formatAlphaSequence(feeIndex)}调整顺序`}
                                      >
                                        <Star className="h-4 w-4 fill-red-500 text-red-500" />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onPointerDown={(event) => startPointerFeeDrag(event, fee.id)}
                                        className="inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md text-surface-300 transition hover:bg-surface-100 hover:text-primary-600 active:cursor-grabbing"
                                        title="拖动调整综合费用顺序"
                                        aria-label={`拖动${fee.name || formatAlphaSequence(feeIndex)}调整顺序`}
                                      >
                                        <GripVertical className="h-4 w-4" />
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className="template-fee-index">{formatAlphaSequence(feeIndex)}</span>
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="relative">
                                      <input
                                        value={fee.name}
                                        onChange={(event) => updateComprehensiveFee(fee.id, { name: event.target.value })}
                                        data-template-fee-validation-target={feeNameError ? "true" : undefined}
                                        aria-invalid={!!feeNameError}
                                        className={`quota-template-fee-plain-field h-8 w-full text-xs font-medium leading-5 outline-none ${feeNameError ? "rounded border border-red-300 bg-red-50 pl-2 pr-7 text-red-700 ring-1 ring-inset ring-red-300" : "bg-transparent text-surface-500"}`}
                                        placeholder="如：管理费"
                                      />
                                      {feeNameError && (
                                        <span
                                          className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-help text-red-600"
                                          tabIndex={0}
                                          role="button"
                                          aria-label={feeNameError}
                                          onMouseEnter={(event) => showTemplateFeeErrorTooltip(event.currentTarget, feeNameError)}
                                          onMouseLeave={hideTemplateFeeErrorTooltip}
                                          onFocus={(event) => showTemplateFeeErrorTooltip(event.currentTarget, feeNameError)}
                                          onBlur={hideTemplateFeeErrorTooltip}
                                        >
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-2">
                                    {comprehensiveFeeMode === "formula" ? (
                                      <SystemSelect
                                        value={fee.valueSource || "formula"}
                                        onChange={(event) => updateComprehensiveFee(fee.id, {
                                          valueSource: event.target.value as TemplateComprehensiveFee["valueSource"],
                                        })}
                                        className="quota-template-fee-plain-field input-field h-8 w-full py-0 text-xs font-medium leading-5 text-surface-500"
                                      >
                                        {templateFeeValueSourceOptions.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </SystemSelect>
                                    ) : (
                                      <SystemSelect
                                        value={feeMethod}
                                        onChange={(event) => updateComprehensiveFee(fee.id, getComprehensiveFeeMethodPatch(event.target.value as FeeCalcMethod, fee))}
                                        className="quota-template-fee-plain-field input-field h-8 w-full py-0 text-xs font-medium leading-5 text-surface-500"
                                      >
                                        {Object.entries(feeCalcMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                      </SystemSelect>
                                    )}
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="relative">
                                      <input
                                        id={`template-fee-formula-${fee.id}`}
                                        value={formulaInputValue}
                                        onFocus={() => {
                                          if (feeFormulaDrafts[fee.id] === undefined) {
                                            startEditingComprehensiveFeeFormula(fee.id, formatStableFeeFormula(fee.fee_calc_base, editingTemplate.comprehensiveFees));
                                          }
                                        }}
                                        onChange={(event) => changeComprehensiveFeeFormulaDraft(fee.id, event.target.value)}
                                        onBlur={() => commitComprehensiveFeeFormulaDraft(fee.id)}
                                        disabled={
                                          feeValueSource === "manual"
                                          || feeValueSource === "direct"
                                          || feeValueSource === "discount"
                                          || feeMethod === "area_unit"
                                        }
                                        data-template-fee-validation-target={feeBaseError ? "true" : undefined}
                                        aria-invalid={!!feeBaseError}
                                        className={`quota-template-fee-plain-field input-field h-8 w-full py-1 text-xs font-medium leading-5 text-surface-500 disabled:text-surface-300 ${feeBaseError && feeValueSource === "formula" ? "pr-14" : "pr-8"} ${feeBaseError ? "border-red-300 bg-red-50 text-red-700 ring-1 ring-inset ring-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
                                        placeholder={
                                          comprehensiveFeeMode === "formula"
                                            ? (fee.valueSource || "formula") === "manual"
                                              ? "报价时填写金额"
                                              : fee.valueSource === "fixed"
                                                ? "填写固定金额，如 500"
                                              : fee.valueSource === "direct"
                                                ? "自动读取工程直接费"
                                                : fee.valueSource === "discount"
                                                  ? "自动读取报价优惠"
                                                  : "如 A+B+优惠"
                                            : feeMethod === "fixed"
                                              ? ""
                                              : feeMethod === "area_unit"
                                                ? "房屋面积"
                                                : feeMethod === "formula"
                                                  ? "如 (直接费+G)*3%+A"
                                                  : templateFeeFormulaPlaceholder
                                        }
                                        title={feeBaseError || (feeValueSource === "fixed" ? "填写固定金额" : feeMethod === "area_unit" ? "按当前报价房屋面积计算" : `可输入 ${templateFeeFormulaExampleText} 等`)}
                                      />
                                      {feeBaseError && (
                                        <span
                                          className={`absolute top-1/2 -translate-y-1/2 cursor-help text-red-600 ${feeValueSource === "formula" ? "right-8" : "right-1"}`}
                                          tabIndex={0}
                                          role="button"
                                          aria-label={feeBaseError}
                                          onMouseEnter={(event) => showTemplateFeeErrorTooltip(event.currentTarget, feeBaseError)}
                                          onMouseLeave={hideTemplateFeeErrorTooltip}
                                          onFocus={(event) => showTemplateFeeErrorTooltip(event.currentTarget, feeBaseError)}
                                          onBlur={hideTemplateFeeErrorTooltip}
                                        >
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                        </span>
                                      )}
                                      {feeValueSource === "formula" && feeMethod !== "fixed" && feeMethod !== "area_unit" && (
                                        <button
                                          type="button"
                                          tabIndex={-1}
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            const input = document.getElementById(`template-fee-formula-${fee.id}`) as HTMLInputElement | null;
                                            if (input) openTemplateFeeSuggestion(fee.id, input);
                                          }}
                                          className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-surface-400 transition hover:bg-primary-50 hover:text-primary-600"
                                          aria-label={`选择${fee.name || "费用"}公式名称`}
                                          title="插入空间、类别或内置公式名称"
                                        >
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {feeValueSource === "fixed" && (
                                        <span className="pointer-events-none absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center whitespace-nowrap text-xs font-semibold text-[#475467]">
                                          元
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-2">
                                    <TemplateFeeScopeSelector
                                      mode={fee.fee_scope_mode}
                                      selectedNames={fee.fee_scope_space_names}
                                      options={templateFeeScopeOptions}
                                      onModeChange={(mode) => updateComprehensiveFee(fee.id, {
                                        fee_scope_mode: mode,
                                        fee_scope_space_names: fee.fee_scope_space_names,
                                      })}
                                      onToggleName={(name) => toggleComprehensiveFeeScopeName(fee.id, name)}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      value={fee.remark}
                                      onChange={(event) => updateComprehensiveFee(fee.id, { remark: event.target.value })}
                                      className="quota-template-fee-plain-field h-8 w-full bg-transparent text-xs font-medium leading-5 text-surface-500 outline-none"
                                      placeholder="费用说明"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <div className="flex flex-nowrap items-center justify-center gap-1">
                                      {comprehensiveFeeMode === "formula" && (
                                        <button
                                          type="button"
                                          onClick={() => setComprehensiveFeeFinalTotal(fee.id)}
                                          className={`inline-flex h-8 min-w-[62px] shrink-0 items-center justify-center whitespace-nowrap rounded px-2 text-[11px] font-semibold transition ${
                                            fee.isFinalTotal
                                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                              : "bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700"
                                          }`}
                                          title="将本行结果作为报价总额"
                                        >
                                          {fee.isFinalTotal ? "报价总额" : "设为总额"}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => removeComprehensiveFee(fee.id)}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                        title="删除费用项目"
                                      >
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
                    </div>
                  )}
                  <div className="mt-3 rounded-md border border-primary-100 bg-primary-50/60 px-3 py-2 text-xs leading-5 text-primary-800">
                    {comprehensiveFeeMode === "formula"
                      ? "自由公式表按行计算，A/B/C 对应上方行编号；可根据取值方式使用公式、报价时填写、工程直接费或报价优惠；固定金额直接填写数值即可。必须指定一行“报价总额”，系统不再额外应用优惠和税率。"
                      : `基础公式支持：${templateFeeFormulaExampleText} 等；可直接输入空间或类别名称，例如“打拆”，表示该范围下全部直接项目合计。A/B/C 对应上方综合费用编号，复杂运算请选择“自定义公式”。`}
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
              <section className="quota-template-editor-section rounded-lg border border-surface-200 bg-white">
                <div className="flex items-center justify-between border-b border-surface-200 bg-surface-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">预算编制</p>
                    <span className="mt-0.5 block text-xs text-surface-500">保存后会跟随报价书输出，打印时默认从新页面开始。</span>
                  </div>
                  <span className="text-xs text-surface-400">富文本</span>
                </div>
                <div className="p-4">
                  <BudgetCompilationEditor
                    value={editingTemplate.budgetCompilationHtml}
                    onChange={(html) => setEditingTemplate((current) => current ? { ...current, budgetCompilationHtml: html } : current)}
                  />
                </div>
              </section>
            </div>
            <div className="quota-template-editor-footer flex items-center justify-between gap-3 px-6 py-4">
              <div className="quota-template-save-status" data-state={templateSaveStatus} aria-live="polite">
                {templateSaveStatus !== "idle" && (
                  <>
                    <span className="quota-template-save-status-icon">
                      {templateSaveStatus === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span>{templateSaveStatus === "saving" ? "正在保存模板" : "已保存，正在返回列表"}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeEditingTemplate} className="btn-secondary" disabled={templateSaveStatus !== "idle"}>关闭</button>
                <button type="button" onClick={saveEditingTemplate} className="btn-primary quota-template-save-button" data-save-status={templateSaveStatus} disabled={templateSaveStatus !== "idle"}>
                  {templateSaveStatus === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {templateSaveStatus === "saved" && <Check className="h-4 w-4" />}
                  <span>{templateSaveStatus === "idle" ? "保存" : templateSaveStatus === "saving" ? "保存中" : "已保存"}</span>
                </button>
              </div>
            </div>
          </div>
          {unsavedClosePromptOpen && (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#111827]/30 px-4 py-6">
              <div role="dialog" aria-modal="true" aria-labelledby="quota-template-unsaved-title" className="w-full max-w-[420px] overflow-hidden rounded-xl border border-surface-200 bg-white text-surface-900 shadow-[0_24px_70px_rgba(15,35,70,0.18)]">
                <div className="px-5 pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p id="quota-template-unsaved-title" className="text-base font-semibold leading-6 text-surface-900">模板内容尚未保存</p>
                      <p className="mt-2 text-sm leading-6 text-surface-600">
                        {pendingTemplateNavigationHref
                          ? "当前定额模板有未保存的修改。离开当前页面前，请选择保存或放弃本次进入编辑器后的修改。"
                          : "当前定额模板有未保存的修改。保存后会写入模板；不保存会放弃本次进入编辑器后的修改。"}
                      </p>
                    </div>
                    <button type="button" onClick={continueEditingTemplate} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="取消关闭">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-5">
                  <button type="button" onClick={discardTemplateChangesAndClose} className="btn-secondary min-h-9 px-3 text-xs">不保存并关闭</button>
                  <button type="button" onClick={continueEditingTemplate} className="btn-secondary min-h-9 px-3 text-xs">继续编辑</button>
                  <button type="button" onClick={saveEditingTemplate} className="btn-primary min-h-9 px-3 text-xs" disabled={templateSaveStatus !== "idle"}>
                    {templateSaveStatus === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>保存并关闭</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {quotaDiffOpen && (
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#111827]/36 px-4 py-6">
              <div role="dialog" aria-modal="true" aria-labelledby="quota-source-diff-title" className="flex max-h-[min(720px,calc(100dvh-48px))] w-full max-w-[760px] flex-col overflow-hidden rounded-[14px] border border-[#f0c36d] bg-white">
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#f1e2c2] bg-[#fff8e8] px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#f79009] text-white">
                      <AlertTriangle className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p id="quota-source-diff-title" className="text-[15px] font-semibold text-[#92400e]">基装定额更新差异</p>
                      <p className="mt-1 text-[11px] text-[#8a5a16]">共 {quotaDiffRows.length} 个模板项目发生变化，手动修改过的字段会保留。</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setQuotaDiffOpen(false)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9a6a1f] hover:bg-[#ffedc7]" aria-label="关闭差异弹窗">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fbfcfe] px-5 py-4">
                  {quotaDiffRows.map((row) => (
                    <section key={row.id} className="overflow-hidden rounded-[10px] border border-surface-200 bg-white">
                      <div className="flex items-center justify-between gap-3 border-b border-surface-100 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-surface-900">{row.itemName}</p>
                          <p className="mt-0.5 truncate text-[11px] text-surface-500">{row.spaceName}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#fff1d6] px-2.5 py-1 text-[10px] font-semibold text-[#a85a00]">{row.fields.length} 项变化</span>
                      </div>
                      <div className="divide-y divide-surface-100">
                        {row.fields.map((field) => {
                          const fieldKey = `${row.id}:${field.field}`;
                          const expanded = quotaDiffExpandedFields.includes(fieldKey);
                          const canExpand = field.before.length > 32 || field.after.length > 32;
                          return (
                            <div key={field.field} className="grid grid-cols-[96px_minmax(0,1fr)_20px_minmax(0,1fr)] items-start gap-2.5 px-4 py-3 text-[11px]">
                              <span className="font-medium text-surface-500">{field.label}</span>
                              <span className={`min-w-0 break-words leading-5 text-surface-700 ${expanded ? "whitespace-normal" : "line-clamp-2"}`} title={field.before}>{field.before}</span>
                              <span className="pt-0.5 text-center text-surface-300">→</span>
                              <span className="flex min-w-0 flex-col items-start">
                                <span className={`w-full break-words font-semibold leading-5 text-surface-900 ${expanded ? "whitespace-normal" : "line-clamp-2"}`} title={field.after}>{field.after}</span>
                                {canExpand ? (
                                  <button
                                    type="button"
                                    onClick={() => setQuotaDiffExpandedFields((current) => (
                                      current.includes(fieldKey)
                                        ? current.filter((key) => key !== fieldKey)
                                        : [...current, fieldKey]
                                    ))}
                                    className="mt-1 self-end text-[10px] font-semibold text-[#356df3] hover:text-[#245ee8]"
                                  >
                                    {expanded ? "收起" : "展开"}
                                  </button>
                                ) : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-surface-200 px-5 py-4">
                  <button type="button" onClick={() => setQuotaDiffOpen(false)} className="btn-secondary min-h-9 px-4 text-xs">关闭</button>
                  <button
                    type="button"
                    onClick={() => {
                      applyQuotaSourceUpdates();
                      setQuotaDiffOpen(false);
                    }}
                    className="min-h-9 rounded-[8px] border border-[#e27b00] bg-[#f79009] px-4 text-xs font-semibold text-white transition hover:border-[#c96b00] hover:bg-[#dc7a00]"
                  >
                    更新未修改字段
                  </button>
                </div>
              </div>
            </div>
          )}
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
                <div className="construction-template-picker-header flex items-center justify-between gap-4 bg-white px-5 py-4">
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

                <div className="construction-template-picker-search bg-white px-5 py-3">
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

                <div className="construction-template-picker-footer flex items-center justify-between gap-3 bg-white px-5 py-3">
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
            <div
              className="quota-template-picker fixed inset-0 z-[120] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-[2px]"
              onClick={(event) => {
                event.stopPropagation();
                setQuotaPickerTarget(null);
                setPickedQuotaIds([]);
                resetCustomQuotaDraft();
              }}
            >
              <div
                className="quota-template-picker-shell quote-library-picker-modal quote-base-library-picker-modal flex w-full max-w-[1680px] flex-col overflow-hidden rounded-[16px] border border-[#d9e2ef] bg-white shadow-[0_24px_70px_rgba(15,35,70,0.20)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="quota-template-picker-header quote-library-header flex items-center justify-between gap-4 border-b border-[#e8eef6] bg-[#fbfcff] px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="quota-template-picker-title quote-library-title text-base font-semibold leading-6 text-[#182230]">
                        {quotaPickerTarget.quotaItemId
                          ? "替换定额"
                          : getProjectGroupAddText(templateProjectGroups, quotaPickerTarget.quoteScope)}
                      </div>
                      <span className="quote-library-target-pill max-w-full truncate">
                        {editingTemplateBranchName || "适用分公司"} · {activeSpace?.name || "当前空间"} · {getProjectGroupName(templateProjectGroups, quotaPickerTarget.quoteScope)}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setQuotaPickerTarget(null); setPickedQuotaIds([]); resetCustomQuotaDraft(); }} className="quota-template-picker-close quote-library-close inline-flex h-9 w-9 items-center justify-center text-[#667085] transition hover:bg-[#edf4ff] hover:text-[#407AFF]" aria-label="关闭定额选择">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div
                  className="quota-template-picker-toolbar quote-library-filter-row grid gap-3 border-b border-[#e8eef6] bg-[#f7f9fc] px-5 py-3 md:items-end"
                  data-has-store-filter={quotaLibraryStoreOptions.length > 1 || undefined}
                >
                  <label className="quota-template-picker-search quote-library-filter-field relative block">
                    <span>搜索项目</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa8bb]" />
                    <input
                      value={quotaPickerSearch}
                      onChange={(event) => setQuotaPickerSearch(event.target.value)}
                      className="quote-library-search-input h-10 w-full rounded-[10px] border border-[#d9e2ef] bg-white pl-9 pr-3 text-sm text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
                      placeholder="搜索编号、名称、施工说明"
                      autoFocus
                    />
                  </label>
                  {quotaLibraryStoreOptions.length > 1 && (
                    <label className="quote-library-filter-field block">
                      <span>所属门店</span>
                      <SystemSelect
                        value={quotaPickerStore}
                        onChange={(event) => setQuotaPickerStore(event.target.value)}
                        className="quota-template-picker-select quote-library-store-select h-10 rounded-[10px] border border-[#d9e2ef] bg-white px-3 text-sm font-medium text-[#182230] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
                        menuClassName="quote-system-select-menu"
                        optionClassName="quote-system-select-option"
                      >
                        <option value="">全部门店</option>
                        {quotaLibraryStoreOptions.map((store) => (
                          <option key={store.id} value={store.name}>{store.name}（{store.itemCount}项）</option>
                        ))}
                      </SystemSelect>
                    </label>
                  )}
                  <label className="quote-library-filter-field block">
                    <span>项目分类</span>
                    <SystemSelect
                      value={quotaPickerCategory}
                      onChange={(event) => setQuotaPickerCategory(event.target.value)}
                      className="quota-template-picker-select quote-library-category-select h-10 rounded-[10px] border border-[#d9e2ef] bg-white px-3 text-sm font-medium text-[#182230] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
                      menuClassName="quote-system-select-menu"
                      optionClassName="quote-system-select-option"
                    >
                      <option value="">全部分类</option>
                      {quotaCategoryOptions.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </SystemSelect>
                  </label>
                  <label className="quote-library-filter-field block">
                    <span>价格类型</span>
                    <SystemSelect
                      value={quotaPickerPriceScene}
                      onChange={(event) => setQuotaPickerPriceScene(event.target.value)}
                      className="quota-template-picker-select quote-library-price-scene-select h-10 rounded-[10px] border border-[#d9e2ef] bg-white px-3 text-sm font-medium text-[#182230] outline-none transition focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10"
                      menuClassName="quote-system-select-menu"
                      optionClassName="quote-system-select-option"
                    >
                      <option value="">全部类型</option>
                      {quotaPriceSceneOptions.map((scene) => (
                        <option key={scene} value={scene}>{scene}</option>
                      ))}
                    </SystemSelect>
                  </label>
                  {pickerIsMultiSelect ? (
                    <button
                      type="button"
                      onClick={toggleVisiblePickedQuotas}
                      disabled={visibleQuotaLibraryItems.length === 0}
                      className="quota-template-picker-select-all quote-library-select-all quote-library-primary-text inline-flex h-10 items-center justify-center rounded-[10px] border border-[#cfe0ff] bg-white px-4 text-sm font-semibold text-[#407AFF] transition hover:bg-[#edf4ff] disabled:cursor-not-allowed disabled:border-[#e9eff7] disabled:text-[#9aa8bb]"
                    >
                      {isVisiblePickerAllSelected ? "取消全选" : "全选当前"}
                    </button>
                  ) : (
                    <div className="quote-library-select-all inline-flex h-10 items-center justify-center rounded-[10px] border border-[#e8eef6] bg-white px-4 text-sm font-semibold text-[#6f7f96]">
                      单选替换
                    </div>
                  )}
                  <div className="quote-library-filter-note">
                    <b>{quotaPickerStore || quotaPickerCategory || quotaPickerPriceScene || "全部项目"}</b><span>{filteredQuotaLibraryItems.length} 项</span><span>已选 {pickedQuotaIds.length}</span>
                  </div>
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

                <div className="quota-template-picker-body quote-library-body min-h-0 flex-1 bg-white">
                  {quotaLibraryLoading ? (
                    <div className="quote-library-empty-state flex h-full flex-col items-center justify-center px-6 text-center">
                      <Loader2 className="mb-3 h-5 w-5 animate-spin text-[#407aff]" />
                      <div className="text-sm font-semibold text-[#34445a]">正在读取{editingTemplateBranchName || "当前分公司"}的基装定额</div>
                    </div>
                  ) : quotaLibraryError ? (
                    <div className="quote-library-empty-state flex h-full flex-col items-center justify-center px-6 text-center">
                      <div className="text-sm font-semibold text-[#34445a]">基装定额读取失败</div>
                      <div className="mt-1 text-xs text-[#9aa8bb]">{quotaLibraryError}</div>
                      <button type="button" onClick={() => void loadQuotaLibraryOptions(editingTemplateBranchId)} className="mt-4 inline-flex h-9 items-center justify-center rounded-[8px] border border-[#cfe0ff] bg-white px-4 text-xs font-semibold text-[#407aff] transition hover:bg-[#edf4ff]">
                        重新加载
                      </button>
                    </div>
                  ) : quotaLibraryItems.length === 0 ? (
                    <div className="quote-library-empty-state flex h-full flex-col items-center justify-center px-6 text-center">
                      <div className="text-sm font-semibold text-[#34445a]">当前分公司暂无可添加的基装定额</div>
                      <div className="mt-1 text-xs text-[#9aa8bb]">请先为{editingTemplateBranchName || "该分公司"}下的门店维护启用状态的基装定额。</div>
                    </div>
                  ) : visibleQuotaLibraryItems.length === 0 ? (
                    <div className="quote-library-empty-state flex h-full flex-col items-center justify-center px-6 text-center">
                      <div className="text-sm font-semibold text-[#34445a]">没有符合条件的定额</div>
                      <div className="mt-1 text-xs text-[#9aa8bb]">可以换一个关键词或分类继续查找。</div>
                    </div>
                  ) : (
                    <div className="quota-template-picker-table-wrap quote-library-table-wrap h-full overflow-auto bg-white">
                      <table className="quota-template-picker-table quote-library-table quote-base-library-table w-full min-w-[1580px] border-separate border-spacing-0 text-sm">
                        <colgroup>
                          <col style={{ width: 56 }} />
                          <col style={{ width: 112 }} />
                          <col style={{ width: 300 }} />
                          <col style={{ width: 112 }} />
                          <col style={{ width: 72 }} />
                          <col style={{ width: 112 }} />
                          <col style={{ width: 112 }} />
                          <col style={{ width: 112 }} />
                          <col style={{ width: 520 }} />
                          <col style={{ width: 172 }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-[#f4f7fb] text-left text-xs font-semibold text-[#34445a]">
                          <tr>
                            <th className="quote-library-sticky-select px-3 py-0 text-center whitespace-nowrap">{pickerIsMultiSelect ? "选择" : "替换"}</th>
                            <th className="quote-library-sticky-category px-3 py-0 whitespace-nowrap">分类</th>
                            <th className="quote-library-sticky-name px-3 py-0 whitespace-nowrap">项目名称</th>
                            <th className="px-3 py-0 text-center whitespace-nowrap">价格类型</th>
                            <th className="px-3 py-0 text-center whitespace-nowrap">单位</th>
                            <th className="px-3 py-0 text-right whitespace-nowrap">材料单价</th>
                            <th className="px-3 py-0 text-right whitespace-nowrap">人工单价</th>
                            <th className="px-3 py-0 text-right whitespace-nowrap">总价</th>
                            <th className="px-3 py-0 whitespace-nowrap">施工说明</th>
                            <th className="quote-library-code-column px-3 py-0 whitespace-nowrap">编号</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleQuotaLibraryItems.map((quota) => {
                            const isPicked = pickedQuotaIdSet.has(quota.id);
                            const categoryName = quota.category || "未分类";
                            return (
                            <tr
                              key={quota.id}
                              onClick={() => pickerIsMultiSelect ? togglePickedQuota(quota.id) : chooseQuotaForTarget(quota)}
                              className={`quote-library-row cursor-pointer transition ${isPicked ? "quote-library-row-selected bg-[#edf4ff]" : "bg-white"}`}
                            >
                              <td className="quote-library-sticky-select px-3 py-0 text-center whitespace-nowrap">
                                {pickerIsMultiSelect ? (
                                  <input
                                    type="checkbox"
                                    checked={isPicked}
                                    onChange={() => togglePickedQuota(quota.id)}
                                    onClick={(event) => event.stopPropagation()}
                                    className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                                    aria-label={`选择${quota.name}`}
                                  />
                                ) : (
                                  <input
                                    type="radio"
                                    name="template-quota-replace-item"
                                    checked={isPicked}
                                    readOnly
                                    className="h-4 w-4 rounded border-[#cfe0ff] accent-[#407AFF]"
                                    aria-label={`替换为${quota.name}`}
                                  />
                                )}
                              </td>
                              <td className="quote-library-sticky-category px-3 py-0 text-[#52647b] whitespace-nowrap">
                                <span className="quote-library-category-badge">{categoryName}</span>
                              </td>
                              <td className="quote-library-sticky-name px-3 py-0">
                                <div className="quote-library-item-title min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="whitespace-nowrap" title={quota.name}>{quota.name}</span>
                                    {quota.isSpecialPrice && <span className="quote-library-special-tag shrink-0" title="特价项目">特</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-0 text-center text-[#52647b] whitespace-nowrap">{quota.priceScene || "标准"}</td>
                              <td className="px-3 py-0 text-center font-medium text-[#52647b] whitespace-nowrap">{quota.unit || "-"}</td>
                              <td className="px-3 py-0 text-right font-semibold tabular-nums text-[#162033] whitespace-nowrap">{formatAmount(quota.materialPrice)}</td>
                              <td className="px-3 py-0 text-right font-semibold tabular-nums text-[#162033] whitespace-nowrap">{formatAmount(quota.laborPrice)}</td>
                              <td className="quote-library-total-price px-3 py-0 text-right font-semibold tabular-nums whitespace-nowrap">{formatAmount(quota.totalPrice)}</td>
                              <td className="px-3 py-0">
                                <div className="quote-library-description-cell truncate" title={quota.constructionDescription || "暂无施工说明"}>{quota.constructionDescription || "暂无施工说明"}</div>
                              </td>
                              <td className="quote-library-code-column px-3 py-0 whitespace-nowrap" title={quota.code || "-"}>{quota.code || "-"}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="quota-template-picker-footer quote-library-footer flex min-h-[64px] flex-col gap-3 border-t border-[#e8eef6] bg-[#fbfcff] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="quote-library-footer-summary text-xs text-[#6f7f96]">
                    {pickerIsMultiSelect ? (
                      <>
                        <span>已选择 <b>{pickedQuotaIds.length}</b> 项</span>
                        <span>合计 {formatAmount(pickedQuotaTotal)}</span>
                        <span>添加后会进入当前空间的项目分组</span>
                      </>
                    ) : (
                      <>
                        <span>单选替换</span>
                        <span>仅替换当前模板项目的定额内容</span>
                      </>
                    )}
                  </div>
                  {pickerIsMultiSelect && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setQuotaPickerTarget(null); setPickedQuotaIds([]); resetCustomQuotaDraft(); }}
                        className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white px-4 text-sm font-semibold text-[#52647b] transition hover:bg-[#f7f9fd]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={addPickedQuotasForTarget}
                        disabled={pickedQuotaIds.length === 0}
                        className="quote-library-primary-action inline-flex h-10 items-center justify-center rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-4 text-sm font-semibold text-white transition hover:bg-[#2f66e8] disabled:cursor-not-allowed disabled:border-[#cfe0ff] disabled:bg-[#cfe0ff]"
                      >
                        添加到模板{pickedQuotaIds.length > 0 ? `（${pickedQuotaIds.length}）` : ""}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {templateQuantityEditor && templateQuantityEditorTarget && (
        <TemplateQuantityFormulaEditor
          targetName={templateQuantityEditorTarget.name}
          text={templateQuantityEditor.text}
          formula={templateQuantityEditorParsed.formula}
          preview={templateQuantityEditorPreview}
          error={templateQuantityEditorParsed.error}
          allItems={templateQuantityLinkItems}
          hasExistingFormula={Boolean(parseQuotationQuantityFormula(templateQuantityEditorTarget.quantityFormula))}
          panelRef={templateQuantityPanelRef}
          inputRef={templateQuantityInputRef}
          onTextChange={(text) => setTemplateQuantityEditor((current) => current ? {
            ...current,
            text,
            lastInsertedRange: null,
          } : current)}
          onCancel={() => setTemplateQuantityEditor(null)}
          onConfirm={confirmTemplateQuantityEditor}
          onRemove={removeTemplateQuantityEditorFormula}
        />
      )}
      {templateFeeSuggestion && typeof document !== "undefined" && createPortal(
        <div
          ref={templateFeeSuggestionMenuRef}
          className="system-select-menu fixed z-[10020] flex flex-col overflow-hidden rounded-[10px] border border-[#dce8f8] bg-white p-1.5 shadow-[0_18px_44px_rgba(27,51,88,0.14),0_4px_14px_rgba(27,51,88,0.06)]"
          style={{
            left: templateFeeSuggestion.left,
            top: templateFeeSuggestion.top,
            width: templateFeeSuggestion.width,
            maxHeight: 300,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          role="listbox"
          aria-label="公式名称建议"
        >
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {visibleTemplateFeeSuggestionOptions.map((option, index) => {
              const active = index === Math.min(templateFeeSuggestionActiveIndex, visibleTemplateFeeSuggestionOptions.length - 1);
              return (
              <button
                key={option.key}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setTemplateFeeSuggestionActiveIndex(index)}
                onClick={() => insertTemplateFeeSuggestion(option.label)}
                className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[#407AFF] text-white"
                    : "text-[#34445a] hover:bg-[#f4f8ff] hover:text-[#162033]"
                }`}
                role="option"
                aria-selected={active}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
      {templateFeeErrorTooltip && typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[10030] flex max-w-[260px] items-start gap-2 rounded-[8px] border border-red-100 bg-white px-3 py-2 text-xs font-medium leading-5 text-red-700 shadow-[0_12px_30px_rgba(127,29,29,0.14)]"
          style={{ left: templateFeeErrorTooltip.left, top: templateFeeErrorTooltip.top }}
          role="tooltip"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{templateFeeErrorTooltip.message}</span>
        </div>,
        document.body,
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
        .quota-template-fee-scope-compact {
          position: relative;
          width: 100%;
          min-width: 160px;
        }
        .quota-template-fee-scope-trigger {
          display: inline-flex;
          height: 32px;
          width: calc(100% - 8px);
          margin: 0 auto;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          padding: 0 6px;
          color: #475467;
          font-size: 12px;
          font-weight: 650;
          line-height: 1;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .quota-template-fee-scope-trigger:hover {
          background: #f6f8fb;
          color: #182230;
        }
        .quota-template-fee-scope-trigger-text {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quota-template-fee-scope-kind {
          flex: 0 0 auto;
          color: #182230;
          font-weight: 700;
        }
        .quota-template-fee-scope-popover {
          position: fixed;
          z-index: 10040;
          width: 286px;
          border: 1px solid #c8d4e4;
          border-radius: 10px;
          background: #fbfdff;
          padding: 6px;
          box-shadow: 0 10px 28px rgba(38, 56, 84, 0.08);
        }
        .quota-template-fee-scope-popover-copy {
          padding: 7px 8px 9px;
          color: #526275;
        }
        .quota-template-fee-scope-popover-copy strong {
          display: block;
          color: #34445a;
          font-size: 12px;
          font-weight: 700;
          line-height: 18px;
        }
        .quota-template-fee-scope-popover-copy span {
          display: block;
          margin-top: 3px;
          color: #7a8699;
          font-size: 11px;
          font-weight: 500;
          line-height: 16px;
        }
        .quota-template-fee-scope-popover-segment {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2px;
          margin-bottom: 6px;
          border-radius: 8px;
          background: #f4f7fb;
          padding: 3px;
        }
        .quota-template-fee-scope-popover-segment button {
          display: flex;
          height: 30px;
          align-items: center;
          justify-content: space-between;
          border-radius: 7px;
          padding: 0 8px;
          color: #526275;
          font-size: 12px;
          font-weight: 650;
        }
        .quota-template-fee-scope-popover-segment button:hover {
          background: rgba(255, 255, 255, 0.72);
          color: #24364b;
        }
        .quota-template-fee-scope-popover-segment button[data-active] {
          background: #ffffff;
          color: #2563eb;
          box-shadow: inset 0 0 0 1px #d8e5ff;
        }
        .quota-template-fee-scope-popover-list {
          display: grid;
          max-height: 176px;
          grid-template-columns: 1fr;
          gap: 2px;
          overflow-y: auto;
          border-top: 1px solid #e5edf7;
          padding-top: 6px;
        }
        .quota-template-fee-scope-popover-list button {
          display: inline-flex;
          height: 30px;
          min-width: 0;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          padding: 0 8px;
          color: #536579;
          font-size: 12px;
          font-weight: 600;
        }
        .quota-template-fee-scope-popover-list button:hover {
          background: #f5f8fc;
          color: #24364b;
        }
        .quota-template-fee-scope-popover-list button[data-active] {
          background: #eef5ff;
          color: #1d4ed8;
        }
        .quota-template-fee-scope-mode-dot {
          height: 7px;
          width: 7px;
          border: 1px solid #aeb9c8;
          border-radius: 999px;
        }
        .quota-template-fee-scope-popover-segment button[data-active] .quota-template-fee-scope-mode-dot {
          border-color: #407aff;
          background: #407aff;
        }
        .quota-template-fee-scope-check {
          display: inline-flex;
          height: 12px;
          width: 12px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border: 1px solid #b8c5d6;
          border-radius: 3px;
          color: #ffffff;
        }
        .quota-template-fee-scope-popover-list button[data-active] .quota-template-fee-scope-check {
          border-color: #407aff;
          background: #407aff;
        }
        .quota-template-fee-scope-empty {
          grid-column: 1 / -1;
          padding: 2px 4px;
          color: #98a2b3;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
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
        .quota-template-space-config-title {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
        }
        .quota-template-space-config-title > div {
          min-width: 0;
        }
        .quota-template-space-config-icon {
          display: inline-flex;
          height: 36px;
          width: 36px;
          flex: 0 0 36px;
          align-items: center;
          justify-content: center;
          border: 1px solid #cfe0ff;
          border-radius: 10px;
          background: #eef5ff;
          color: #2f6feb;
        }
        .quota-template-space-config-icon svg {
          height: 18px;
          width: 18px;
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
        .quota-template-mode-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .quota-template-mode-pill svg {
          height: 16px;
          width: 16px;
          color: #f59e0b;
          stroke-width: 2.2;
        }
        .quota-template-space-workbench {
          display: grid;
          min-height: 520px;
          grid-template-columns: 216px 1fr;
          gap: 14px;
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
        .quota-template-space-sidebar-icon {
          display: inline-flex !important;
          height: 28px;
          width: 28px;
          flex: 0 0 28px;
          align-items: center;
          justify-content: center;
          margin-right: 8px;
          border: 1px solid #ccebe7;
          border-radius: 8px;
          background: #effcf9;
          color: #0f9f8f;
        }
        .quota-template-space-sidebar-icon svg {
          height: 15px;
          width: 15px;
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
          display: grid;
          min-height: 104px;
          align-content: start;
          gap: 12px;
          border-bottom: 1px solid #e5ebf3;
          background: #fbfcfe;
          padding: 14px 16px;
        }
        .quota-template-space-main-head-top,
        .quota-template-space-main-head-toolbar {
          display: flex;
          min-width: 0;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .quota-template-space-main-head-toolbar {
          flex-wrap: wrap;
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
          display: flex;
          min-width: 150px;
          max-width: 320px;
          flex-direction: column;
          justify-content: center;
          gap: 3px;
          flex: 0 0 auto;
        }
        .quota-template-space-main-title > span {
          color: #7c8798;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
        }
        .quota-template-space-main-title strong {
          display: block;
          overflow: hidden;
          color: #182230;
          font-size: 15px;
          font-weight: 800;
          line-height: 20px;
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
          height: 36px !important;
          min-width: 118px !important;
          max-width: 176px;
          flex: 0 0 auto;
          border: 1px solid #dfe7f2;
          border-radius: 10px !important;
          background: #ffffff;
          padding: 0 7px !important;
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
        .quota-template-project-group-icon,
        .quota-template-project-group-add-icon {
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
        }
        .quota-template-project-group-icon {
          height: 24px;
          width: 24px;
          margin-right: 5px;
          border-radius: 7px;
        }
        .quota-template-project-group-icon svg {
          height: 14px;
          width: 14px;
        }
        .quota-template-project-group-add-icon {
          height: 22px;
          width: 22px;
          border-radius: 6px;
        }
        .quota-template-project-group-add-icon svg {
          height: 13px;
          width: 13px;
        }
        .quota-template-project-group-icon[data-scope="foundation"],
        .quota-template-project-group-add-icon[data-scope="foundation"] {
          border-color: #fed7aa;
          background: #fff7ed;
          color: #ea580c;
        }
        .quota-template-project-group-icon[data-scope="main_material"],
        .quota-template-project-group-add-icon[data-scope="main_material"] {
          border-color: #bfdbfe;
          background: #eff6ff;
          color: #2563eb;
        }
        .quota-template-project-group-icon[data-scope="custom_cabinet"],
        .quota-template-project-group-add-icon[data-scope="custom_cabinet"] {
          border-color: #ddd6fe;
          background: #f5f3ff;
          color: #7c3aed;
        }
        .quota-template-project-group-icon:not([data-scope="foundation"]):not([data-scope="main_material"]):not([data-scope="custom_cabinet"]),
        .quota-template-project-group-add-icon:not([data-scope="foundation"]):not([data-scope="main_material"]):not([data-scope="custom_cabinet"]) {
          border-color: #a7f3d0;
          background: #ecfdf5;
          color: #059669;
        }
        .quota-template-project-group-create {
          display: inline-flex;
          height: 36px;
          min-width: 146px;
          flex: 0 0 auto;
          align-items: center;
          gap: 6px;
          border: 1px solid #d9e5f2;
          border-radius: 10px;
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
          height: 30px;
          width: 30px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
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
          height: 36px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 1px solid #d9e5f2;
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          padding: 0 12px;
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
          gap: 12px;
          color: #667085;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }
        .quota-template-space-main-meta span {
          display: inline-flex;
          height: 24px;
          align-items: center;
          gap: 5px;
          border: 0;
          background: transparent;
          padding: 0;
          color: #40566f;
        }
        .quota-template-space-main-meta span + span::before {
          content: "";
          width: 3px;
          height: 3px;
          margin-right: 7px;
          border-radius: 999px;
          background: #c4cedb;
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
          height: 34px;
          align-items: center;
          gap: 6px;
          border: 1px solid #dfe7f2;
          border-radius: 9px;
          background: #ffffff;
          padding: 0 11px;
          color: #52647b;
          font-size: 12px;
          font-weight: 700;
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
        .quota-template-project-scroll {
          position: relative;
          flex: 1;
          min-height: 0;
          scrollbar-gutter: stable;
        }
        .quota-template-project-more-hint {
          position: sticky;
          bottom: 0;
          z-index: 6;
          display: flex;
          height: 34px;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-top: 1px solid #dbe7ff;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(238, 245, 255, 0.96) 42%, #eef5ff);
          color: #315cba;
          font-size: 12px;
          font-weight: 750;
          pointer-events: none;
        }
        .quota-template-project-more-hint svg {
          color: #407aff;
          animation: quotaTemplateMoreHintPulse 1.25s ease-in-out infinite;
        }
        @keyframes quotaTemplateMoreHintPulse {
          0%,
          100% {
            transform: translateY(-1px);
            opacity: 0.72;
          }
          50% {
            transform: translateY(2px);
            opacity: 1;
          }
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
          position: sticky;
          top: 0;
          z-index: 5;
          background: #f7f9fc !important;
          box-shadow: 0 1px 0 #dfe7f2;
        }
        .quota-template-project-board table th {
          height: 40px;
          border-bottom: 1px solid #dfe7f2;
          color: #5d6b7d !important;
          font-size: 11.5px;
          font-weight: 800;
          white-space: nowrap;
        }
        .quota-template-project-board table th + th,
        .quota-template-project-board table td + td {
          border-left: 1px solid #edf1f6;
        }
        .quota-template-project-board table th:first-child,
        .quota-template-project-board table td:first-child {
          position: sticky;
          left: 0;
          z-index: 4;
          background: #ffffff;
          box-shadow: 8px 0 12px -14px rgba(15, 35, 70, 0.45);
        }
        .quota-template-project-board table thead th:first-child {
          z-index: 7;
          background: #f7f9fc;
        }
        .quota-template-project-board table tbody tr:nth-child(even) td:first-child {
          background: #fbfcfe;
        }
        .quota-template-project-board table tbody tr:hover td:first-child {
          background: #f4f8ff;
        }
        .quota-template-project-board table td {
          height: 48px;
          border-bottom-color: #e9eef5;
          vertical-align: middle;
          font-size: 12.5px;
        }
        .quota-template-project-board [data-template-quota-row] {
          height: 48px !important;
        }
        .quota-template-project-board [data-template-quota-row] td {
          height: 48px !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
          line-height: 18px !important;
        }
        .quota-template-project-board [data-template-quota-row] p.line-clamp-3 {
          display: -webkit-box !important;
          overflow: hidden !important;
          color: #111827 !important;
          line-height: 17px !important;
          text-overflow: ellipsis !important;
          white-space: normal !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
        }
        .quota-template-project-board [data-template-quota-row] .quota-template-project-alias {
          display: -webkit-box !important;
          overflow: hidden !important;
          line-height: 18px !important;
          text-overflow: ellipsis !important;
          white-space: normal !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
        }
        .quota-template-project-board [data-template-quota-row] button {
          height: 28px !important;
          width: 28px !important;
          border-radius: 7px !important;
        }
        .quota-template-project-board [data-template-quota-row] svg {
          height: 14px !important;
          width: 14px !important;
        }
        .quota-template-project-board table tbody tr:hover {
          background: #f5f8fd;
        }
        .quota-template-project-board table tbody tr:nth-child(even) {
          background: #fcfdff;
        }
        .quota-template-project-board table tbody tr:nth-child(even):hover {
          background: #f5f8fd;
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
        .quota-template-quota-sequence-cell {
          display: flex;
          min-width: 0;
          align-items: center;
          justify-content: center;
          gap: 2px;
        }
        .quota-template-quota-sequence-cell > span {
          display: inline-flex;
          height: 18px;
          min-width: 18px;
          align-items: center;
          justify-content: center;
          border-radius: 5px;
          background: #eef3fa;
          color: #52647b;
          font-size: 10px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .quota-template-project-board [data-template-quota-row] .quota-template-quota-sequence-cell button {
          height: 18px !important;
          width: 18px !important;
          flex: 0 0 18px;
          background: transparent;
          color: #b3bdca;
          padding: 0;
        }
        .quota-template-project-board [data-template-quota-row] .quota-template-quota-sequence-cell button:hover {
          background: #eef5ff;
          color: #407aff;
        }
        .quota-template-quantity-cell {
          display: flex;
          min-width: 0;
          align-items: center;
          justify-content: center;
          gap: 3px;
        }
        .quota-template-quantity-input {
          min-width: 0;
          width: 100%;
          height: 26px;
          border: 0;
          background: transparent;
          padding: 0 2px;
          color: #182230;
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          text-align: center;
          outline: none;
        }
        .quota-template-quantity-input:focus {
          border-radius: 6px;
          background: #f4f7ff;
          box-shadow: inset 0 0 0 1px #bdd3ff;
        }
        .quota-template-project-board [data-template-quota-row] .quota-template-quantity-formula-button {
          display: inline-flex;
          height: 22px !important;
          width: 22px !important;
          flex: 0 0 22px;
          align-items: center;
          justify-content: center;
          border: 1px solid #dce5f0;
          border-radius: 6px;
          background: #ffffff;
          color: #8a98aa;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
          transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
        }
        .quota-template-project-board [data-template-quota-row] .quota-template-quantity-formula-button:hover {
          border-color: #b8d0ff;
          background: #f4f7ff;
          color: #407aff;
        }
        .quota-template-project-board [data-template-quota-row] .quota-template-quantity-formula-button[data-linked] {
          border-color: #b7e4d2;
          background: #ecfdf5;
          color: #059669;
        }
        .quota-template-quantity-overlay {
          position: fixed;
          inset: 0;
          z-index: 10020;
          pointer-events: none;
        }
        .quota-template-quantity-popover {
          position: fixed;
          display: flex;
          max-height: min(526px, calc(100dvh - 24px));
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #dbe4f0;
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 22px 60px rgba(15, 35, 70, 0.2);
          color: #182230;
          pointer-events: auto;
        }
        .quota-template-quantity-popover-head {
          display: flex;
          flex: 0 0 auto;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #edf1f7;
          padding: 14px 16px 12px;
        }
        .quota-template-quantity-popover-title {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 10px;
        }
        .quota-template-quantity-popover-title > span {
          display: inline-flex;
          height: 30px;
          width: 30px;
          flex: 0 0 30px;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: #ecfdf5;
          color: #059669;
        }
        .quota-template-quantity-popover-title > span svg {
          height: 15px;
          width: 15px;
        }
        .quota-template-quantity-popover-title div {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 2px;
        }
        .quota-template-quantity-popover-title small {
          color: #667085;
          font-size: 11px;
          font-weight: 700;
          line-height: 15px;
        }
        .quota-template-quantity-popover-title strong {
          overflow: hidden;
          color: #182230;
          font-size: 13px;
          font-weight: 800;
          line-height: 18px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quota-template-quantity-popover-head > button {
          display: inline-flex;
          height: 28px;
          width: 28px;
          flex: 0 0 28px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #8a98aa;
        }
        .quota-template-quantity-popover-head > button:hover {
          background: #f3f6fb;
          color: #344054;
        }
        .quota-template-quantity-popover-head > button svg {
          height: 15px;
          width: 15px;
        }
        .quota-template-quantity-popover-body {
          min-height: 0;
          flex: 1 1 auto;
          overflow-y: auto;
          padding: 14px 16px;
        }
        .quota-template-quantity-formula-field {
          display: block;
        }
        .quota-template-quantity-formula-field > span {
          display: block;
          margin-bottom: 6px;
          color: #52647b;
          font-size: 11px;
          font-weight: 750;
        }
        .quota-template-quantity-formula-shell {
          display: grid;
          height: 40px;
          grid-template-columns: 34px 18px minmax(0, 1fr);
          align-items: center;
          overflow: hidden;
          border: 1px solid #dbe4f0;
          border-radius: 10px;
          background: #ffffff;
          transition: border-color 0.16s ease, box-shadow 0.16s ease;
        }
        .quota-template-quantity-formula-shell:focus-within {
          border-color: #7aa2ff;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.1);
        }
        .quota-template-quantity-formula-shell.is-error {
          border-color: #f97066;
          box-shadow: 0 0 0 3px rgba(240, 68, 56, 0.08);
        }
        .quota-template-quantity-formula-shell b {
          display: inline-flex;
          height: 100%;
          align-items: center;
          justify-content: center;
          border-right: 1px solid #e3eaf4;
          background: #f8fafc;
          color: #475467;
          font-size: 12px;
          font-weight: 850;
        }
        .quota-template-quantity-formula-shell em {
          color: #98a2b3;
          font-size: 13px;
          font-style: normal;
          font-weight: 700;
          text-align: center;
        }
        .quota-template-quantity-formula-shell input {
          min-width: 0;
          height: 100%;
          border: 0;
          background: transparent;
          padding: 0 10px 0 0;
          color: #182230;
          font-size: 12px;
          font-weight: 700;
          outline: none;
        }
        .quota-template-quantity-formula-field > small {
          display: block;
          margin-top: 6px;
          color: #7c8798;
          font-size: 10px;
          line-height: 1.5;
        }
        .quota-template-quantity-rules {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 12px;
        }
        .quota-template-quantity-rules span {
          display: inline-flex;
          height: 22px;
          align-items: center;
          border-radius: 999px;
          background: #f3f6fb;
          padding: 0 8px;
          color: #667085;
          font-size: 10px;
          font-weight: 700;
        }
        .quota-template-quantity-reference-list {
          display: flex;
          max-height: 160px;
          flex-direction: column;
          gap: 5px;
          margin-top: 10px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .quota-template-quantity-reference-list button {
          display: grid;
          min-height: 34px;
          grid-template-columns: 28px minmax(0, 1fr) auto 58px;
          align-items: center;
          gap: 8px;
          border: 1px solid #e4ebf4;
          border-radius: 9px;
          background: #ffffff;
          padding: 5px 8px;
          color: #344054;
          text-align: left;
          transition: border-color 0.16s ease, background-color 0.16s ease;
        }
        .quota-template-quantity-reference-list button:not(:disabled):hover {
          border-color: #b8d0ff;
          background: #f7faff;
        }
        .quota-template-quantity-reference-list button:disabled {
          cursor: not-allowed;
          opacity: 0.62;
        }
        .quota-template-quantity-reference-list button b {
          display: inline-flex;
          height: 22px;
          min-width: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          color: #315cba;
          background: #eef5ff;
          font-size: 11px;
        }
        .quota-template-quantity-reference-list button > span {
          overflow: hidden;
          font-size: 11px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quota-template-quantity-reference-list button > em {
          color: #667085;
          font-size: 10px;
          font-style: normal;
        }
        .quota-template-quantity-reference-list button > small {
          color: #98a2b3;
          font-size: 10px;
          font-weight: 700;
          text-align: right;
        }
        .quota-template-quantity-reference-list button > small[data-available] {
          color: #047857;
        }
        .quota-template-quantity-reference-list > p {
          margin: 0;
          border: 1px dashed #dbe4f0;
          border-radius: 9px;
          padding: 18px 10px;
          color: #8a98aa;
          font-size: 11px;
          text-align: center;
        }
        .quota-template-quantity-pick-hint {
          display: flex;
          min-height: 38px;
          align-items: center;
          justify-content: center;
          gap: 7px;
          margin-top: 12px;
          border: 1px dashed #b9d1ff;
          border-radius: 9px;
          background: #f7faff;
          color: #315cba;
          font-size: 11px;
          font-weight: 750;
        }
        .quota-template-quantity-pick-hint svg {
          height: 15px;
          width: 15px;
        }
        .quota-template-quantity-preview {
          display: flex;
          min-height: 36px;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 8px;
          margin-top: 12px;
          border-radius: 9px;
          background: #f7faff;
          padding: 8px 10px;
          color: #344054;
          font-size: 11px;
        }
        .quota-template-quantity-preview > span {
          flex: 1 1 auto;
          min-width: 0;
          overflow-wrap: anywhere;
          line-height: 18px;
          white-space: normal;
        }
        .quota-template-quantity-preview > em {
          color: #98a2b3;
          font-style: normal;
          font-weight: 800;
        }
        .quota-template-quantity-preview > strong {
          flex: 0 0 auto;
          margin-left: auto;
          color: #dc2626;
          font-size: 13px;
          font-weight: 850;
          font-variant-numeric: tabular-nums;
        }
        .quota-template-quantity-preview > .is-empty {
          display: inline-flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: #8a98aa;
        }
        .quota-template-quantity-preview > .is-empty svg {
          height: 14px;
          width: 14px;
        }
        .quota-template-quantity-preview.is-error {
          background: #fff6f5;
        }
        .quota-template-quantity-error {
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 8px 0 0;
          color: #d92d20;
          font-size: 11px;
          font-weight: 700;
        }
        .quota-template-quantity-error svg {
          height: 13px;
          width: 13px;
        }
        .quota-template-quantity-popover-footer {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-top: 1px solid #edf1f7;
          padding: 12px 16px;
        }
        .quota-template-quantity-popover-footer > div {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .quota-template-quantity-popover-footer button {
          display: inline-flex;
          height: 34px;
          align-items: center;
          justify-content: center;
          border: 1px solid #dbe4f0;
          border-radius: 9px;
          background: #ffffff;
          padding: 0 13px;
          color: #52647b;
          font-size: 11px;
          font-weight: 750;
        }
        .quota-template-quantity-popover-footer button:hover {
          border-color: #c2d5f3;
          background: #f8fafc;
        }
        .quota-template-quantity-popover-footer button.is-remove {
          border-color: #fee4e2;
          color: #d92d20;
        }
        .quota-template-quantity-popover-footer button.is-primary {
          border-color: #407aff;
          background: #407aff;
          color: #ffffff;
        }
        .quota-template-quantity-popover-footer button.is-primary:hover {
          border-color: #2f66e8;
          background: #2f66e8;
        }
        .quota-template-quantity-popover-footer button:disabled {
          cursor: not-allowed;
          border-color: #dce5f0;
          background: #eef2f7;
          color: #98a2b3;
        }
        .quota-template-picker {
          display: flex;
          align-items: center;
          justify-content: center;
          left: 0 !important;
          padding: 24px 16px !important;
          background: rgba(11, 18, 32, 0.35) !important;
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
        }
        .quota-template-picker-shell {
          --quote-library-primary: #407AFF;
          --quote-library-primary-hover: #2f66e8;
          --quote-library-border: #d9e2ef;
          --quote-library-divider: #e8eef6;
          --quote-library-text: #182230;
          --quote-library-muted: #667085;
          --quote-library-sticky-bg: #ffffff;
          height: min(78vh, calc(100vh - 48px)) !important;
          min-height: 560px;
          overflow: hidden;
          border-color: #d9e2ef !important;
          border-radius: 16px !important;
          background: #ffffff !important;
          box-shadow: 0 24px 70px rgba(15, 35, 70, 0.20) !important;
          color: #182230;
        }
        .quota-template-picker-header {
          flex: 0 0 auto;
          min-height: 64px;
          padding: 14px 20px !important;
          border-color: #e8eef6 !important;
          background: #fbfcff !important;
        }
        .quota-template-picker-title {
          color: #182230 !important;
          font-size: 16px !important;
          font-weight: 650 !important;
          letter-spacing: 0 !important;
          line-height: 24px !important;
        }
        .quota-template-picker .quote-library-target-pill {
          display: inline-flex;
          max-width: min(520px, 100%);
          height: 24px;
          align-items: center;
          border-left: 1px solid #d8e1ee;
          padding: 0 0 0 12px;
          color: #61728a;
          font-size: 12px !important;
          font-weight: 600;
          line-height: 1;
        }
        .quota-template-picker-close {
          border-radius: 10px !important;
        }
        .quota-template-picker-close:hover {
          background: #edf4ff !important;
          color: #407aff !important;
        }
        .quota-template-picker-toolbar {
          flex: 0 0 auto;
          grid-template-columns: minmax(280px, 1fr) 190px 190px auto auto !important;
          align-items: end;
          gap: 12px !important;
          padding: 12px 20px !important;
          border-color: #e8eef6 !important;
          background: #f7f9fc !important;
        }
        .quota-template-picker-toolbar[data-has-store-filter="true"] {
          grid-template-columns: minmax(260px, 1fr) 170px 170px 170px auto auto !important;
        }
        .quota-template-picker .quote-library-filter-field > span {
          display: block;
          margin-bottom: 6px;
          color: #52647b;
          font-size: 12px !important;
          font-weight: 700;
          line-height: 1;
        }
        .quota-template-picker .quote-library-filter-field svg {
          top: auto !important;
          bottom: 12px !important;
          transform: none !important;
        }
        .quota-template-picker .quote-library-search-input,
        .quota-template-picker .quote-library-store-select,
        .quota-template-picker .quote-library-category-select,
        .quota-template-picker .quote-library-price-scene-select,
        .quota-template-picker .quote-library-select-all,
        .quota-template-picker .quote-library-footer button,
        .quota-template-picker .quote-library-close {
          border-radius: 10px !important;
        }
        .quota-template-picker .quote-library-search-input,
        .quota-template-picker .quote-library-store-select,
        .quota-template-picker .quote-library-category-select,
        .quota-template-picker .quote-library-price-scene-select,
        .quota-template-picker .quote-library-select-all {
          height: 40px !important;
          min-height: 40px !important;
          font-size: 14px !important;
        }
        .quota-template-picker-search {
          border: 0 !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }
        .quota-template-picker-search:focus-within {
          box-shadow: none !important;
        }
        .quota-template-picker-select {
          color: #182230 !important;
          font-weight: 500 !important;
        }
        .quota-template-picker-select-all {
          color: #407aff !important;
        }
        .quota-template-picker .quote-library-filter-note {
          display: inline-flex;
          min-height: 40px;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          color: #7b8aa0;
          font-size: 12px !important;
          line-height: 1.4;
          white-space: nowrap;
        }
        .quota-template-picker .quote-library-filter-note b {
          color: #182230;
          font-weight: 700;
        }
        .quota-template-picker .quote-library-filter-note span {
          color: #667085;
          font-weight: 600;
        }
        .quota-template-picker-custom {
          padding: 12px 20px !important;
          border-color: #e8eef6 !important;
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
          min-height: 0;
          background: #ffffff;
        }
        .quota-template-picker .quote-library-empty-state {
          min-height: 220px;
          background: linear-gradient(180deg, rgba(248, 251, 255, 0.92) 0%, rgba(255, 255, 255, 1) 100%);
        }
        .quota-template-picker-table-wrap {
          height: 100%;
          overflow: auto !important;
          border-top: 1px solid #e8eef6;
          border-right: 0 !important;
          border-bottom: 0 !important;
          border-left: 0 !important;
          border-radius: 0 !important;
          background: #ffffff;
          box-shadow: none !important;
          scrollbar-gutter: stable;
        }
        .quota-template-picker-table {
          min-width: 1580px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12px !important;
        }
        .quota-template-picker-table thead {
          position: sticky;
          top: 0;
          z-index: 10;
          background: #f4f7fb !important;
          color: #34445a !important;
          font-size: 12px !important;
        }
        .quota-template-picker-table th {
          height: 42px !important;
          border-bottom: 1px solid #e8eef6 !important;
          background: #f3f6fb !important;
          padding: 0 12px !important;
          color: #34445a !important;
          font-size: 12px !important;
          font-weight: 650 !important;
          line-height: 1.25 !important;
          vertical-align: middle;
          white-space: nowrap !important;
        }
        .quota-template-picker-table th:first-child {
          border-top-left-radius: 10px !important;
        }
        .quota-template-picker-table th:last-child {
          border-top-right-radius: 10px !important;
        }
        .quota-template-picker-table thead th:not(:last-child),
        .quota-template-picker-table tbody td:not(:last-child) {
          border-right: 1px solid #edf2f7 !important;
        }
        .quota-template-picker-table thead th {
          border-right-color: #e2eaf4 !important;
        }
        .quota-template-picker-table thead th:last-child,
        .quota-template-picker-table tbody td:last-child {
          border-right: 0 !important;
        }
        .quota-template-picker-table td {
          height: 52px !important;
          border-bottom: 1px solid #edf2f7 !important;
          padding: 0 12px !important;
          color: #111827 !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          line-height: 18px;
          vertical-align: middle !important;
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
        .quota-template-picker-table .quote-library-row-selected td {
          background: #edf4ff !important;
        }
        .quota-template-picker-table .quote-library-row-selected td:first-child {
          box-shadow: inset 3px 0 0 #407aff;
        }
        .quota-template-picker-table .quote-library-sticky-select,
        .quota-template-picker-table .quote-library-sticky-category,
        .quota-template-picker-table .quote-library-sticky-name {
          position: sticky !important;
          z-index: 4;
          background: #ffffff !important;
        }
        .quota-template-picker-table .quote-library-sticky-select {
          left: 0 !important;
          width: 56px !important;
          min-width: 56px !important;
          max-width: 56px !important;
        }
        .quota-template-picker-table .quote-library-sticky-category {
          left: 56px !important;
          width: 112px !important;
          min-width: 112px !important;
          max-width: 112px !important;
        }
        .quota-template-picker-table .quote-library-sticky-name {
          left: 168px !important;
          width: 300px !important;
          min-width: 300px !important;
          max-width: 300px !important;
          box-shadow: 8px 0 12px -14px rgba(15, 35, 70, 0.42);
        }
        .quota-template-picker-table thead .quote-library-sticky-select,
        .quota-template-picker-table thead .quote-library-sticky-category,
        .quota-template-picker-table thead .quote-library-sticky-name {
          z-index: 20;
          background: #f3f6fb !important;
        }
        .quota-template-picker-table tbody tr:hover .quote-library-sticky-select,
        .quota-template-picker-table tbody tr:hover .quote-library-sticky-category,
        .quota-template-picker-table tbody tr:hover .quote-library-sticky-name {
          background: #f8fbff !important;
        }
        .quota-template-picker-table tbody .quote-library-row-selected .quote-library-sticky-select,
        .quota-template-picker-table tbody .quote-library-row-selected .quote-library-sticky-category,
        .quota-template-picker-table tbody .quote-library-row-selected .quote-library-sticky-name {
          background: #edf4ff !important;
        }
        .quota-template-picker-table input[type="checkbox"] {
          height: 16px !important;
          width: 16px !important;
          border-radius: 4px !important;
          accent-color: #407aff;
        }
        .quota-template-picker-table input[type="radio"] {
          height: 16px !important;
          width: 16px !important;
          accent-color: #407aff;
        }
        .quota-template-picker .quote-library-category-badge {
          display: inline-flex;
          max-width: 100%;
          height: 22px;
          align-items: center;
          border: 1px solid #e5ebf3 !important;
          border-radius: 7px;
          background: #f8fafc !important;
          padding: 0 7px;
          color: #52647b !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          line-height: 1;
        }
        .quota-template-picker .quote-library-special-tag {
          display: inline-flex !important;
          height: 17px !important;
          min-width: 17px !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid #fed7aa !important;
          border-radius: 5px !important;
          background: #fff7ed !important;
          padding: 0 !important;
          color: #c2410c !important;
          font-size: 11px !important;
          font-weight: 750 !important;
          line-height: 1 !important;
          box-shadow: none !important;
        }
        .quota-template-picker .quote-library-description-cell {
          display: block;
          width: 520px;
          max-width: 520px;
          overflow: hidden;
          color: #111827 !important;
          line-height: 18px !important;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quota-template-picker-table .quote-library-total-price {
          color: #dc2626 !important;
          font-weight: 600 !important;
        }
        .quota-template-picker-footer {
          flex: 0 0 auto;
          min-height: 64px;
          padding: 12px 20px !important;
          border-color: #e8eef6 !important;
          background: #fbfcff !important;
          box-shadow: none !important;
        }
        .quota-template-picker .quote-library-footer-summary {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }
        .quota-template-picker .quote-library-footer-summary span {
          display: inline-flex;
          min-height: 20px;
          align-items: center;
          color: #667085;
          font-weight: 600;
        }
        .quota-template-picker .quote-library-footer-summary span + span {
          position: relative;
          padding-left: 12px;
        }
        .quota-template-picker .quote-library-footer-summary span + span::before {
          content: "";
          position: absolute;
          left: 0;
          top: 50%;
          width: 1px;
          height: 12px;
          transform: translateY(-50%);
          background: #d8e1ee;
        }
        .quota-template-picker .quote-library-footer-summary b {
          color: #407aff;
          font-weight: 800;
        }
        .quota-template-picker-footer .btn-secondary,
        .quota-template-picker-footer .btn-primary {
          min-height: 40px !important;
          height: 40px !important;
          border-radius: 10px !important;
          padding: 0 16px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
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
