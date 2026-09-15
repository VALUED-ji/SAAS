"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, Hammer, LayoutGrid, LayoutTemplate, Loader2, Package, PackageOpen, Pencil, Plus, Power, Save, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import {
  getPersonalizedTemplateCategoryLabel,
  normalizePersonalizedTemplate,
  type PersonalizedQuotationTemplate,
  type PersonalizedTemplateCategory,
  type PersonalizedTemplateItem,
} from "@/lib/personalizedQuotationTemplate";

type StoreOption = { id: string; name: string };
type Notice = { tone: "info" | "danger"; text: string } | null;
type LibraryKind = "base" | "product";
type ItemDropPosition = "before" | "after";
type PointerItemDragState = {
  sourceId: string;
  startX: number;
  startY: number;
  moved: boolean;
  targetId: string | null;
  position: ItemDropPosition;
  scrollElement: HTMLElement | null;
};
type BaseLibraryItem = {
  id: string;
  code: string;
  scope: string;
  category: string;
  priceScene: string;
  name: string;
  constructionDescription: string;
  unit: string;
  laborPrice: number;
  materialPrice: number;
  totalPrice: number;
};
type ProductLibraryItem = {
  id: string;
  code: string;
  name: string;
  brand: string;
  product_name: string;
  material_model: string;
  color: string;
  spec: string;
  unit: string;
  unit_price: number;
  cost_price: number | null;
  internal_control_price: number | null;
  category_name: string;
  material_type: string;
  is_active: number;
  skus?: Array<{ id?: string; sku_name?: string; spec?: string; color?: string; unit?: string; unit_price?: number; cost_price?: number | null; is_active?: number }>;
};

const categories: PersonalizedTemplateCategory[] = ["base", "main_material", "custom_cabinet"];

function authHeaders(extra?: Record<string, string>) {
  return { ...extra };
}

function makeItem(category: PersonalizedTemplateCategory): PersonalizedTemplateItem {
  return {
    id: `template-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    source: "manual",
    quota_source_id: null,
    quota_source_type: null,
    work_type_id: null,
    work_type_name: null,
    material_category_id: null,
    material_category_name: null,
    name: "",
    spec: "",
    material_model: "",
    remark: "",
    unit: "",
    quantity: 0,
    unit_price: 0,
    material_cost: 0,
    labor_cost: 0,
    total_price: 0,
  };
}

function emptyTemplate(storeId = ""): PersonalizedQuotationTemplate {
  return {
    id: "",
    name: "",
    remark: "",
    status: "enabled",
    storeId,
    storeName: "",
    createdByName: "",
    items: [makeItem("base")],
    createdAt: "",
    updatedAt: "",
  };
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getPersonalizedTemplateDirtyPayload(template: PersonalizedQuotationTemplate | null) {
  if (!template) return "";
  return JSON.stringify({
    name: template.name,
    remark: template.remark,
    storeId: template.storeId,
    items: template.items,
  });
}

export default function PersonalizedTemplatesPage() {
  const [templates, setTemplates] = useState<PersonalizedQuotationTemplate[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [editing, setEditing] = useState<PersonalizedQuotationTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState<PersonalizedTemplateCategory>("base");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "enabled" | "disabled">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [libraryKind, setLibraryKind] = useState<LibraryKind | null>(null);
  const [baseLibraryItems, setBaseLibraryItems] = useState<BaseLibraryItem[]>([]);
  const [productLibraryItems, setProductLibraryItems] = useState<ProductLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [quantityEditingIds, setQuantityEditingIds] = useState<Set<string>>(new Set());
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [recentlyMovedItemId, setRecentlyMovedItemId] = useState<string | null>(null);
  const [unsavedClosePromptOpen, setUnsavedClosePromptOpen] = useState(false);
  const [libraryFeedbackText, setLibraryFeedbackText] = useState("");
  const libraryFeedbackTimerRef = useRef<number | null>(null);
  const libraryFeedbackCountRef = useRef({ key: "", count: 0 });
  const openedEditingPayloadRef = useRef("");
  const pointerItemDragRef = useRef<PointerItemDragState | null>(null);
  const itemDragPointerRef = useRef({ x: 0, y: 0 });
  const itemDragAutoScrollFrameRef = useRef<number | null>(null);
  const movedItemTimerRef = useRef<number | null>(null);

  const beginQuantityEdit = (id: string) => {
    setQuantityEditingIds((current) => new Set(current).add(id));
  };

  const endQuantityEdit = (id: string) => {
    setQuantityEditingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const moveQuantityCursorToEnd = (event: React.FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    window.requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch {
        // Number inputs may not expose selection APIs in every browser.
      }
    });
  };

  const keepQuantityCursorAtEnd = (event: React.MouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    window.requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch {
        // Number inputs may not expose selection APIs in every browser.
      }
    });
  };

  const focusQuantityCellAtEnd = (event: MouseEvent<HTMLTableCellElement>) => {
    const input = event.currentTarget.querySelector<HTMLInputElement>('input[type="number"]');
    if (!input) return;
    event.preventDefault();
    input.focus();
    window.requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch {
        // Number inputs may not expose selection APIs in every browser.
      }
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/quota/personalized-templates", { headers: authHeaders(), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "个性化模板加载失败");
      const nextTemplates = Array.isArray(data?.templates)
        ? data.templates.map(normalizePersonalizedTemplate).filter(Boolean) as PersonalizedQuotationTemplate[]
        : [];
      setTemplates(nextTemplates);
      setStores(Array.isArray(data?.stores) ? data.stores : []);
    } catch (error: any) {
      setNotice({ tone: "danger", text: error?.message || "个性化模板加载失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredTemplates = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (statusFilter && template.status !== statusFilter) return false;
      return !keyword || `${template.name} ${template.remark} ${template.storeName}`.toLowerCase().includes(keyword);
    });
  }, [search, statusFilter, templates]);
  const pagination = useDataPagination(filteredTemplates, [search, statusFilter].join("|"));

  const startCreate = () => {
    const template = emptyTemplate(stores.length === 1 ? stores[0].id : "");
    openedEditingPayloadRef.current = getPersonalizedTemplateDirtyPayload(template);
    setUnsavedClosePromptOpen(false);
    setEditing(template);
    setActiveCategory("base");
    setNotice(null);
    setLibraryKind(null);
  };

  const startEdit = (template: PersonalizedQuotationTemplate) => {
    const nextTemplate = JSON.parse(JSON.stringify(template)) as PersonalizedQuotationTemplate;
    openedEditingPayloadRef.current = getPersonalizedTemplateDirtyPayload(nextTemplate);
    setUnsavedClosePromptOpen(false);
    setEditing(nextTemplate);
    setActiveCategory(template.items.find((item) => item.category === "base") ? "base" : template.items[0]?.category || "base");
    setNotice(null);
    setLibraryKind(null);
  };

  const openLibrary = async (kind: LibraryKind) => {
    setLibraryKind(kind);
    setLibrarySearch("");
    setLibraryCategory("");
    setLibraryError("");
    libraryFeedbackCountRef.current = { key: "", count: 0 };
    setLibraryFeedbackText("");
    if ((kind === "base" && baseLibraryItems.length > 0) || (kind === "product" && productLibraryItems.length > 0)) return;
    setLibraryLoading(true);
    try {
      const endpoint = kind === "base" ? "/api/quota/library" : "/api/materials?view=library";
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "项目库加载失败");
      if (kind === "base") {
        const items = Array.isArray(data?.items) ? data.items.map((item: any): BaseLibraryItem | null => {
          if (!item?.id || !item?.name) return null;
          return {
            id: String(item.id),
            code: String(item.code || ""),
            scope: String(item.scope || ""),
            category: String(item.category || "未分类"),
            priceScene: String(item.priceScene || item.price_scene || "标准"),
            name: String(item.name),
            constructionDescription: String(item.constructionDescription || ""),
            unit: String(item.unit || ""),
            laborPrice: money(item.laborPrice),
            materialPrice: money(item.materialPrice),
            totalPrice: money(item.totalPrice || money(item.laborPrice) + money(item.materialPrice)),
          };
        }).filter(Boolean) as BaseLibraryItem[] : [];
        setBaseLibraryItems(items);
      } else {
        const items = Array.isArray(data?.materials) ? data.materials
          .filter((item: any) => String(item?.material_type || "").toUpperCase() === "MAIN" && Number(item?.is_active ?? 1) === 1)
          .map((item: any): ProductLibraryItem => ({
            id: String(item.id || ""),
            code: String(item.code || ""),
            name: String(item.name || item.product_name || ""),
            brand: String(item.brand || ""),
            product_name: String(item.product_name || ""),
            material_model: String(item.material_model || ""),
            color: String(item.color || ""),
            spec: String(item.spec || ""),
            unit: String(item.unit || ""),
            unit_price: money(item.unit_price),
            cost_price: item.cost_price == null ? null : money(item.cost_price),
            internal_control_price: item.internal_control_price == null ? null : money(item.internal_control_price),
            category_name: String(item.category_name || "未分类"),
            material_type: String(item.material_type || ""),
            is_active: Number(item.is_active ?? 1),
            skus: Array.isArray(item.skus) ? item.skus : [],
          }))
          .filter((item: ProductLibraryItem) => item.id && item.name) : [];
        setProductLibraryItems(items);
      }
    } catch (error: any) {
      setLibraryError(error?.message || "项目库加载失败");
    } finally {
      setLibraryLoading(false);
    }
  };

  const showLibraryAddFeedback = (kind: LibraryKind, item: { id: string; name: string }) => {
    const key = `${kind}:${item.id}`;
    const current = libraryFeedbackCountRef.current;
    const count = current.key === key ? current.count + 1 : 1;
    libraryFeedbackCountRef.current = { key, count };
    setLibraryFeedbackText(`已添加“${item.name}” ${count} 次，可继续添加相同项目`);
    if (libraryFeedbackTimerRef.current) window.clearTimeout(libraryFeedbackTimerRef.current);
    libraryFeedbackTimerRef.current = window.setTimeout(() => {
      setLibraryFeedbackText("");
      libraryFeedbackTimerRef.current = null;
    }, 1600);
  };

  const addBaseLibraryItem = (item: BaseLibraryItem) => {
    showLibraryAddFeedback("base", item);
    setEditing((current) => current ? {
      ...current,
      items: [...current.items, {
        ...makeItem("base"),
        source: "standard",
        quota_source_id: item.id,
        quota_source_type: "standard_quota",
        name: item.name,
        spec: item.constructionDescription,
        unit: item.unit,
        quantity: 0,
        unit_price: item.totalPrice,
        material_cost: item.materialPrice,
        labor_cost: item.laborPrice,
        total_price: 0,
      }],
    } : current);
    setActiveCategory("base");
  };

  const addProductLibraryItem = (item: ProductLibraryItem) => {
    showLibraryAddFeedback("product", item);
    const sku = item.skus?.find((candidate) => Number(candidate?.is_active ?? 1) === 1) || item.skus?.[0];
    const spec = [sku?.spec || item.spec, sku?.color || item.color].filter(Boolean).join(" / ");
    setEditing((current) => current ? {
      ...current,
      items: [...current.items, {
        ...makeItem("main_material"),
        source: "standard",
        quota_source_id: item.id,
        quota_source_type: "material",
        material_category_id: "",
        material_category_name: item.category_name,
        name: item.name,
        spec,
        material_model: item.material_model,
        unit: sku?.unit || item.unit,
        quantity: 0,
        unit_price: money(sku?.unit_price ?? item.unit_price),
        material_cost: money(sku?.cost_price ?? item.cost_price),
        labor_cost: 0,
        total_price: 0,
      }],
    } : current);
    setActiveCategory("main_material");
  };

  const updateEditing = (patch: Partial<PersonalizedQuotationTemplate>) => {
    setEditing((current) => current ? { ...current, ...patch } : current);
  };

  const categoryItems = editing?.items.filter((item) => item.category === activeCategory) || [];

  const updateItem = (id: string, patch: Partial<PersonalizedTemplateItem>) => {
    setEditing((current) => current ? {
      ...current,
      items: current.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (next.category === "base" && ("labor_cost" in patch || "material_cost" in patch)) {
          next.unit_price = money(next.labor_cost) + money(next.material_cost);
        }
        if ("quantity" in patch || "unit_price" in patch || "labor_cost" in patch || "material_cost" in patch) {
          next.total_price = money(next.quantity) * money(next.unit_price);
        }
        return next;
      }),
    } : current);
  };

  const addItem = () => {
    setEditing((current) => current ? { ...current, items: [...current.items, makeItem(activeCategory)] } : current);
  };

  const removeItem = (id: string) => {
    setEditing((current) => current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current);
  };

  const reorderItems = useCallback((sourceId: string, targetId: string, position: ItemDropPosition) => {
    if (sourceId === targetId) return;
    setEditing((current) => {
      if (!current) return current;
      const source = current.items.find((item) => item.id === sourceId);
      const target = current.items.find((item) => item.id === targetId);
      if (!source || !target || source.category !== target.category) return current;

      const categoryItems = current.items.filter((item) => item.category === source.category);
      const sourceIndex = categoryItems.findIndex((item) => item.id === sourceId);
      const remaining = categoryItems.filter((item) => item.id !== sourceId);
      const targetIndex = remaining.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      remaining.splice(targetIndex + (position === "after" ? 1 : 0), 0, source);
      let categoryIndex = 0;
      return {
        ...current,
        items: current.items.map((item) => item.category === source.category ? remaining[categoryIndex++] : item),
      };
    });
    setRecentlyMovedItemId(sourceId);
    if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
    movedItemTimerRef.current = window.setTimeout(() => setRecentlyMovedItemId(null), 650);
  }, []);

  const startPointerItemDrag = (event: ReactPointerEvent<HTMLButtonElement>, itemId: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    const scrollElement = event.currentTarget.closest(".personalized-template-v2-scroll")?.querySelector<HTMLElement>(".thin-scroll-area") || null;
    pointerItemDragRef.current = {
      sourceId: itemId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      targetId: itemId,
      position: "after",
      scrollElement,
    };
    itemDragPointerRef.current = { x: event.clientX, y: event.clientY };
    setDraggingItemId(null);
    setDragOverItem(null);
  };

  useEffect(() => {
    const stopAutoScroll = () => {
      if (itemDragAutoScrollFrameRef.current) {
        window.cancelAnimationFrame(itemDragAutoScrollFrameRef.current);
        itemDragAutoScrollFrameRef.current = null;
      }
    };

    const getTargetItem = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const row = element?.closest<HTMLElement>("[data-personalized-template-item-row]");
      const itemId = row?.dataset.itemId;
      if (row && itemId) {
        const rect = row.getBoundingClientRect();
        return { id: itemId, position: clientY < rect.top + rect.height / 2 ? "before" as ItemDropPosition : "after" as ItemDropPosition };
      }

      const state = pointerItemDragRef.current;
      const scrollElement = state?.scrollElement;
      if (!state || !scrollElement) return null;
      const rect = scrollElement.getBoundingClientRect();
      const rows = Array.from(scrollElement.querySelectorAll<HTMLElement>("[data-personalized-template-item-row]"))
        .filter((item) => item.dataset.itemId !== state.sourceId);
      if (!rows.length) return null;
      const edgeSize = Math.min(92, Math.max(48, rect.height * 0.14));
      if (clientY <= rect.top + edgeSize) {
        const firstId = rows[0].dataset.itemId;
        return firstId ? { id: firstId, position: "before" as ItemDropPosition } : null;
      }
      if (clientY >= rect.bottom - edgeSize) {
        const lastId = rows[rows.length - 1].dataset.itemId;
        return lastId ? { id: lastId, position: "after" as ItemDropPosition } : null;
      }
      return null;
    };

    const syncDragTarget = () => {
      const state = pointerItemDragRef.current;
      if (!state?.moved) return;
      const target = getTargetItem(itemDragPointerRef.current.x, itemDragPointerRef.current.y);
      if (!target || target.id === state.sourceId) {
        state.targetId = null;
        setDragOverItem(null);
        return;
      }
      state.targetId = target.id;
      state.position = target.position;
      setDragOverItem(target);
    };

    const startAutoScroll = () => {
      if (itemDragAutoScrollFrameRef.current) return;
      const tick = () => {
        itemDragAutoScrollFrameRef.current = null;
        const state = pointerItemDragRef.current;
        if (!state?.moved || !state.scrollElement) return;
        const rect = state.scrollElement.getBoundingClientRect();
        const threshold = Math.min(110, Math.max(72, rect.height * 0.16));
        const pointerY = itemDragPointerRef.current.y;
        let velocity = 0;
        if (pointerY < rect.top + threshold) {
          velocity = -Math.ceil(((rect.top + threshold - pointerY) / threshold) * 22);
        } else if (pointerY > rect.bottom - threshold) {
          velocity = Math.ceil(((pointerY - (rect.bottom - threshold)) / threshold) * 22);
        }
        if (velocity !== 0) {
          state.scrollElement.scrollTop = Math.max(
            0,
            Math.min(state.scrollElement.scrollHeight - state.scrollElement.clientHeight, state.scrollElement.scrollTop + velocity),
          );
          syncDragTarget();
          itemDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
        }
      };
      itemDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerItemDragRef.current;
      if (!state) return;
      itemDragPointerRef.current = { x: event.clientX, y: event.clientY };
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 4) {
        state.moved = true;
        setDraggingItemId(state.sourceId);
      }
      if (!state.moved) return;
      event.preventDefault();
      const target = getTargetItem(event.clientX, event.clientY);
      if (!target || target.id === state.sourceId) {
        state.targetId = null;
        setDragOverItem(null);
      } else {
        state.targetId = target.id;
        state.position = target.position;
        setDragOverItem(target);
      }
      startAutoScroll();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerItemDragRef.current;
      if (!state) return;
      stopAutoScroll();
      pointerItemDragRef.current = null;
      if (state.moved) {
        const target = getTargetItem(event.clientX, event.clientY);
        const targetId = target?.id ?? state.targetId;
        const position = target?.position ?? state.position;
        if (targetId && targetId !== state.sourceId) reorderItems(state.sourceId, targetId, position);
      }
      setDraggingItemId(null);
      setDragOverItem(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      stopAutoScroll();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeCategory, reorderItems]);

  useEffect(() => () => {
    if (movedItemTimerRef.current) window.clearTimeout(movedItemTimerRef.current);
    if (libraryFeedbackTimerRef.current) window.clearTimeout(libraryFeedbackTimerRef.current);
  }, []);

  const hasUnsavedEditingChanges = useMemo(() => (
    Boolean(editing && getPersonalizedTemplateDirtyPayload(editing) !== openedEditingPayloadRef.current)
  ), [editing]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedEditingChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedEditingChanges]);

  const forceCloseEditing = () => {
    setUnsavedClosePromptOpen(false);
    setEditing(null);
    setLibraryKind(null);
    openedEditingPayloadRef.current = "";
  };

  const closeEditing = () => {
    if (hasUnsavedEditingChanges) {
      setUnsavedClosePromptOpen(true);
      return;
    }
    forceCloseEditing();
  };

  const save = async () => {
    if (!editing || saving) return;
    const name = editing.name.trim();
    if (!name) {
      setNotice({ tone: "danger", text: "请填写模板名称。模板名称会作为导入后的空间/类别名称。" });
      return;
    }
    if (!editing.storeId) {
      setNotice({ tone: "danger", text: "请选择模板所属门店。" });
      return;
    }
    const validItems = editing.items.filter((item) => item.name.trim());
    if (!validItems.length) {
      setNotice({ tone: "danger", text: "请至少填写一个个性化项目。" });
      return;
    }
    setSaving(true);
    try {
      const savedTemplate = { ...editing, name, items: validItems };
      const response = await fetch("/api/quota/personalized-templates", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ template: savedTemplate }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "保存失败");
      setNotice({ tone: "info", text: "个性化模板已保存。" });
      openedEditingPayloadRef.current = getPersonalizedTemplateDirtyPayload(savedTemplate);
      forceCloseEditing();
      await load();
    } catch (error: any) {
      setNotice({ tone: "danger", text: error?.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const mutateTemplate = async (action: "delete" | "toggle", template: PersonalizedQuotationTemplate) => {
    const message = action === "delete" ? `确定删除「${template.name}」吗？已导入报价中的内容不会受到影响。` : "";
    if (message && !window.confirm(message)) return;
    const response = await fetch("/api/quota/personalized-templates", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action, id: template.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice({ tone: "danger", text: data?.message || "操作失败" });
      return;
    }
    await load();
  };

  const libraryCategories = useMemo(() => {
    const items = libraryKind === "base"
      ? baseLibraryItems.map((item) => item.category)
      : productLibraryItems.map((item) => item.category_name);
    return Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [baseLibraryItems, libraryKind, productLibraryItems]);

  const visibleLibraryItems = useMemo(() => {
    const keyword = librarySearch.trim().toLowerCase();
    if (libraryKind === "base") {
      return baseLibraryItems.filter((item) => {
        if (libraryCategory && item.category !== libraryCategory) return false;
        return !keyword || `${item.code} ${item.name} ${item.scope} ${item.constructionDescription}`.toLowerCase().includes(keyword);
      });
    }
    return productLibraryItems.filter((item) => {
      if (libraryCategory && item.category_name !== libraryCategory) return false;
      return !keyword || `${item.code} ${item.name} ${item.brand} ${item.product_name} ${item.material_model} ${item.spec}`.toLowerCase().includes(keyword);
    });
  }, [baseLibraryItems, libraryCategory, libraryKind, librarySearch, productLibraryItems]);

  if (editing) {
    const addCustomCabinetItem = () => {
      setEditing((current) => current ? { ...current, items: [...current.items, makeItem("custom_cabinet")] } : current);
      setActiveCategory("custom_cabinet");
    };
    const activeLabel = getPersonalizedTemplateCategoryLabel(activeCategory);
    return (
      <main className="app-page-surface enterprise-list-ui quota-management-ui quota-list-page quota-template-page quota-template-editor personalized-template-editor-v2 fixed bottom-0 right-0 top-0 z-50 flex min-w-0 flex-col bg-[#F5F7FB] text-surface-900 max-md:left-0 md:left-[var(--active-sidebar-width)]">
        <header className="personalized-template-v2-topbar">
          <div className="personalized-template-v2-heading">
            <div className="personalized-template-v2-heading-mark" aria-hidden="true"><LayoutTemplate className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="personalized-template-v2-title">{editing.id ? "编辑个性化模板" : "新建个性化模板"}</p>
              <div className="personalized-template-v2-breadcrumb"><span>定额管理</span><span>/</span><span>个性化模板</span><span>/</span><strong>{editing.id ? "编辑" : "新建"}</strong></div>
            </div>
          </div>
          <div className="personalized-template-v2-topbar-actions">
            <span className="personalized-template-v2-item-summary"><i aria-hidden="true" />{editing.items.length} 个项目</span>
            <span className="personalized-template-v2-mode">{editing.id ? "编辑模式" : "新建模式"}</span>
            <button type="button" onClick={closeEditing} disabled={saving} className="personalized-template-v2-close disabled:cursor-not-allowed disabled:opacity-50" aria-label="关闭编辑页"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="personalized-template-v2-body">
          {notice && (
            <div className={`personalized-template-v2-notice ${notice.tone === "danger" ? "is-danger" : "is-success"}`}>
              <span className="personalized-template-v2-notice-dot" aria-hidden="true" />
              <span className="min-w-0 flex-1">{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <section className="personalized-template-v2-meta">
            <div className="personalized-template-v2-section-head">
              <span className="personalized-template-v2-section-icon" aria-hidden="true"><LayoutTemplate className="h-3.5 w-3.5" /></span>
              <div className="min-w-0">
                <p>模板信息</p>
                <span>模板导入报价后，会作为新的空间 / 类别显示。</span>
              </div>
              <span className="personalized-template-v2-required-note"><em>*</em> 为必填项</span>
            </div>
            <div className="personalized-template-v2-meta-fields">
              <label>
                <span>模板名称 <em>*</em></span>
                <input value={editing.name} onChange={(event) => updateEditing({ name: event.target.value })} className="personalized-template-v2-input" placeholder="例如：别墅客厅背景墙" aria-label="模板名称" />
              </label>
              <label>
                <span>备注</span>
                <input value={editing.remark} onChange={(event) => updateEditing({ remark: event.target.value.slice(0, 200) })} className="personalized-template-v2-input" placeholder="补充模板用途或说明" aria-label="模板备注" />
              </label>
              <label>
                <span>所属门店 <em>*</em></span>
                <SystemSelect value={editing.storeId} onChange={(event) => updateEditing({ storeId: event.target.value })} className="personalized-template-v2-input" aria-label="所属门店">
                  <option value="">请选择门店</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </SystemSelect>
              </label>
            </div>
          </section>

          <section className="personalized-template-v2-workbench">
            <div className="personalized-template-v2-workbench-head">
              <div className="personalized-template-v2-workbench-icon" aria-hidden="true"><LayoutGrid className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p>{editing.name || "未命名模板"}</p>
                <span>项目配置 · 导入报价后会作为新的空间 / 类别显示。</span>
              </div>
              <span className="personalized-template-v2-workbench-total">共 {editing.items.length} 个项目</span>
            </div>
            <div className="personalized-template-v2-layout">
              <div className="personalized-template-v2-main">
                <div className="personalized-template-v2-space-main-head">
                  <div className="personalized-template-v2-space-main-left">
                    <div className="personalized-template-v2-category-tabs" role="tablist" aria-label="项目分类">
                      {categories.map((category) => {
                        const count = editing.items.filter((item) => item.category === category).length;
                        const CategoryIcon = category === "base" ? Hammer : category === "main_material" ? Package : LayoutGrid;
                        const isActive = activeCategory === category;
                        return (
                          <button
                            type="button"
                            key={category}
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveCategory(category)}
                            className={`personalized-template-v2-category-tab ${isActive ? "is-active" : ""}`}
                          >
                            <CategoryIcon className="h-3 w-3" />
                            <span>{getPersonalizedTemplateCategoryLabel(category)}</span>
                            <em>{count}</em>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="personalized-template-v2-space-main-right">
                    <span className="personalized-template-v2-space-main-meta"><LayoutGrid className="h-3.5 w-3.5" />{categories.length} 个分类</span>
                    <span className="personalized-template-v2-space-main-meta"><Pencil className="h-3.5 w-3.5" />{editing.items.length} 个项目</span>
                  </div>
                </div>
                <ThinScrollArea className="personalized-template-v2-scroll" scrollClassName="h-full overflow-auto">
                <table className={`personalized-template-v2-table ${activeCategory === "base" ? "is-base" : "is-other"} min-w-[1060px] w-full table-fixed`}>
                  <colgroup>
                    {activeCategory === "base" ? <>
                      <col className="w-[4%]" />
                      <col className="w-[18%]" />
                      <col className="w-[7%]" />
                      <col className="w-[8%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[9%]" />
                      <col className="w-[28%]" />
                      <col className="w-[6%]" />
                    </> : <>
                      <col className="w-[4%]" />
                      <col className="w-[23%]" />
                      <col className="w-[27%]" />
                      <col className="w-[8%]" />
                      <col className="w-[9%]" />
                      <col className="w-[10%]" />
                      <col className="w-[13%]" />
                      <col className="w-[6%]" />
                    </>}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-surface-200">
                      {activeCategory === "base" ? <>
                        <th aria-label="排序"></th><th>项目名称</th><th>单位</th><th>预设数量</th><th>人工单价</th><th>材料单价</th><th>单价</th><th>施工说明</th><th>操作</th>
                      </> : <>
                        <th aria-label="排序"></th><th>{activeCategory === "main_material" ? "材料名称" : "项目名称"}</th><th>规格 / 型号</th><th>单位</th><th>预设数量</th><th>单价</th><th>备注</th><th>操作</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {categoryItems.length === 0 ? (
                      <tr className="personalized-template-empty-row">
                        <td colSpan={activeCategory === "base" ? 9 : 8} className="personalized-template-v2-table-empty">
                          <div className="personalized-template-v2-empty-state">
                            <span className="personalized-template-v2-empty-icon" aria-hidden="true"><PackageOpen className="h-6 w-6" /></span>
                            <p>暂无{activeLabel}项目</p>
                            <span>{activeCategory === "base" ? "从基装库选择项目后，会显示在这里" : activeCategory === "main_material" ? "从产品库选择项目后，会显示在这里" : "添加定制柜项目后，会显示在这里"}</span>
                            {activeCategory === "base" && <button type="button" onClick={() => void openLibrary("base")} className="personalized-template-v2-empty-action"><Plus className="h-3.5 w-3.5" />从基装库添加</button>}
                            {activeCategory === "main_material" && <button type="button" onClick={() => void openLibrary("product")} className="personalized-template-v2-empty-action"><Plus className="h-3.5 w-3.5" />从产品库添加</button>}
                            {activeCategory === "custom_cabinet" && <button type="button" onClick={addCustomCabinetItem} className="personalized-template-v2-empty-action"><Plus className="h-3.5 w-3.5" />添加定制柜项目</button>}
                          </div>
                        </td>
                      </tr>
                    ) : categoryItems.map((item) => activeCategory === "base" ? (
                      <tr
                        key={item.id}
                        data-personalized-template-item-row
                        data-item-id={item.id}
                        className={`template-quota-row ${draggingItemId === item.id ? "opacity-45" : ""} ${recentlyMovedItemId === item.id ? "quote-item-row-moved" : ""} ${dragOverItem?.id === item.id && dragOverItem.position === "before" ? "quote-item-row-drop-before" : ""} ${dragOverItem?.id === item.id && dragOverItem.position === "after" ? "quote-item-row-drop-after" : ""}`}
                      >
                        <td className="personalized-template-v2-drag-cell">
                          <button type="button" onPointerDown={(event) => startPointerItemDrag(event, item.id)} className="personalized-template-v2-drag-handle" title="拖动调整项目顺序" aria-label={`拖动${item.name || "项目"}调整顺序`}>
                            <GripVertical className="h-4 w-4" />
                          </button>
                        </td>
                        <td><input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="personalized-template-v2-field" placeholder="项目名称" /></td>
                        <td className="is-readonly"><span>{item.unit || "-"}</span></td>
                        <td onMouseDown={focusQuantityCellAtEnd}><input type="number" min="0" step="0.01" value={quantityEditingIds.has(item.id) && item.quantity === 0 ? "" : item.quantity} onFocus={(event) => { beginQuantityEdit(item.id); moveQuantityCursorToEnd(event); }} onMouseUp={keepQuantityCursorAtEnd} onBlur={() => endQuantityEdit(item.id)} onChange={(event) => updateItem(item.id, { quantity: money(event.target.value) })} className="personalized-template-v2-field is-number" aria-label={`${item.name || "项目"}数量`} /></td>
                        <td className="is-readonly is-number"><span>{money(item.labor_cost).toFixed(2)}</span></td>
                        <td className="is-readonly is-number"><span>{money(item.material_cost).toFixed(2)}</span></td>
                        <td className="is-readonly is-number is-emphasis"><span>{money(item.unit_price).toFixed(2)}</span></td>
                        <td className="is-readonly"><div className="personalized-template-v2-description">{item.spec || "-"}</div></td>
                        <td className="is-action"><button type="button" onClick={() => removeItem(item.id)} className="personalized-template-v2-remove" title="移除项目"><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    ) : (
                      <tr
                        key={item.id}
                        data-personalized-template-item-row
                        data-item-id={item.id}
                        className={`template-quota-row ${draggingItemId === item.id ? "opacity-45" : ""} ${recentlyMovedItemId === item.id ? "quote-item-row-moved" : ""} ${dragOverItem?.id === item.id && dragOverItem.position === "before" ? "quote-item-row-drop-before" : ""} ${dragOverItem?.id === item.id && dragOverItem.position === "after" ? "quote-item-row-drop-after" : ""}`}
                      >
                        <td className="personalized-template-v2-drag-cell">
                          <button type="button" onPointerDown={(event) => startPointerItemDrag(event, item.id)} className="personalized-template-v2-drag-handle" title="拖动调整项目顺序" aria-label={`拖动${item.name || "项目"}调整顺序`}>
                            <GripVertical className="h-4 w-4" />
                          </button>
                        </td>
                        <td><input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="personalized-template-v2-field" placeholder="项目名称" /></td>
                        <td><input value={item.spec} onChange={(event) => updateItem(item.id, { spec: event.target.value })} disabled={activeCategory !== "custom_cabinet"} className="personalized-template-v2-field" placeholder="规格或说明" /></td>
                        <td><input value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="personalized-template-v2-field is-center" placeholder="项" /></td>
                        <td onMouseDown={focusQuantityCellAtEnd}><input type="number" min="0" step="0.01" value={quantityEditingIds.has(item.id) && item.quantity === 0 ? "" : item.quantity} onFocus={(event) => { beginQuantityEdit(item.id); moveQuantityCursorToEnd(event); }} onMouseUp={keepQuantityCursorAtEnd} onBlur={() => endQuantityEdit(item.id)} onChange={(event) => updateItem(item.id, { quantity: money(event.target.value) })} className="personalized-template-v2-field is-number" aria-label={`${item.name || "项目"}数量`} /></td>
                        <td><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(item.id, { unit_price: money(event.target.value) })} className="personalized-template-v2-field is-number" aria-label={`${item.name || "项目"}单价`} /></td>
                        <td><input value={item.remark} onChange={(event) => updateItem(item.id, { remark: event.target.value })} className="personalized-template-v2-field" placeholder="可选" /></td>
                        <td className="is-action"><button type="button" onClick={() => removeItem(item.id)} className="personalized-template-v2-remove" title="移除项目"><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </ThinScrollArea>
                <div className="personalized-template-v2-add-bar">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCategory === "base") void openLibrary("base");
                      else if (activeCategory === "main_material") void openLibrary("product");
                      else addCustomCabinetItem();
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {activeCategory === "base" ? "添加基装项目" : activeCategory === "main_material" ? "添加产品项目" : "添加定制柜项目"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="personalized-template-v2-footer">
          <span className="personalized-template-v2-footer-hint"><i aria-hidden="true" />保存后可在报价详情中导入此模板</span>
          <div className="personalized-template-v2-footer-actions">
            <button type="button" onClick={closeEditing} disabled={saving} className="personalized-template-v2-cancel disabled:cursor-not-allowed disabled:opacity-50">取消</button>
            <button type="button" onClick={save} disabled={saving} className="personalized-template-v2-save">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}保存模板</button>
          </div>
        </footer>

        {libraryKind && (
          <div className="personalized-template-v2-library-overlay">
            <aside className="personalized-template-v2-library-modal" role="dialog" aria-modal="true" aria-labelledby="personalized-template-library-title">
              <div className="personalized-template-v2-library-head">
                <div className="personalized-template-v2-library-heading">
                  <span className="personalized-template-v2-library-heading-icon" aria-hidden="true"><PackageOpen className="h-4 w-4" /></span>
                  <div>
                    <p id="personalized-template-library-title">{libraryKind === "base" ? "从基装库添加" : "从产品库添加"}</p>
                    <span>选择项目后加入当前模板的{getPersonalizedTemplateCategoryLabel(libraryKind === "base" ? "base" : "main_material")}分类。</span>
                  </div>
                </div>
                <span className="personalized-template-v2-library-added">当前已配置 {editing.items.filter((item) => item.category === (libraryKind === "base" ? "base" : "main_material")).length} 项</span>
                <button type="button" onClick={() => setLibraryKind(null)} className="personalized-template-v2-library-close" aria-label="关闭项目库"><X className="h-4 w-4" /></button>
              </div>
              {libraryFeedbackText && <div className="personalized-template-v2-library-feedback" role="status" aria-live="polite">{libraryFeedbackText}</div>}
              <div className="personalized-template-v2-library-filters">
                <label><Search className="pointer-events-none" /><input autoFocus value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder={libraryKind === "base" ? "搜索编号、项目名称、施工说明" : "搜索编码、产品名称、品牌、型号"} /></label>
                <SystemSelect value={libraryCategory} onChange={(event) => setLibraryCategory(event.target.value)} aria-label="项目分类"><option value="">全部分类</option>{libraryCategories.map((category) => <option key={category} value={category}>{category}</option>)}</SystemSelect>
              </div>
              <div className="personalized-template-v2-library-scroll">
                {libraryLoading ? <div className="personalized-template-v2-library-state"><Loader2 className="h-4 w-4 animate-spin" />正在加载项目库</div> : libraryError ? <div className="personalized-template-v2-library-state is-error">{libraryError}</div> : visibleLibraryItems.length === 0 ? <div className="personalized-template-v2-library-state">没有符合条件的项目</div> : (
                  <table className="personalized-template-v2-library-table">
                    <colgroup><col className="library-col-name" /><col className="library-col-category" /><col className="library-col-detail" /><col className="library-col-unit" /><col className="library-col-price" /><col className="library-col-action" /></colgroup>
                    <thead><tr><th>项目名称</th><th>分类</th><th>规格 / 施工说明</th><th>单位</th><th>单价</th><th>操作</th></tr></thead>
                    <tbody>{visibleLibraryItems.map((item: any) => {
                      const isBase = libraryKind === "base";
                      const title = isBase ? item.name : item.name;
                      const detail = isBase ? item.constructionDescription : [item.brand, item.material_model, item.spec].filter(Boolean).join(" / ");
                      return <tr key={item.id}>
                        <td><p title={title}>{title}</p><span>{item.code || "无编码"}</span></td>
                        <td>{isBase ? item.category : item.category_name}</td>
                        <td title={detail}>{detail || "-"}</td>
                        <td className="is-center">{item.unit || "-"}</td>
                        <td className="is-number">{isBase ? money(item.totalPrice).toFixed(2) : money(item.unit_price).toFixed(2)}</td>
                        <td className="is-action">
                          <button type="button" onClick={() => isBase ? addBaseLibraryItem(item) : addProductLibraryItem(item)} className="personalized-template-v2-library-add">添加</button>
                        </td>
                      </tr>;
                    })}</tbody>
                  </table>
                )}
              </div>
              <div className="personalized-template-v2-library-foot"><span>共 {visibleLibraryItems.length} 项</span><button type="button" onClick={() => setLibraryKind(null)} className="personalized-template-v2-cancel">完成选择</button></div>
            </aside>
          </div>
        )}
        {unsavedClosePromptOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#172033]/30 p-5 backdrop-blur-[1px]">
            <div role="dialog" aria-modal="true" aria-labelledby="personalized-template-unsaved-title" className="w-full max-w-[420px] overflow-hidden rounded-xl border border-[#d9e2ef] bg-white text-[#1f2937] shadow-[0_24px_70px_rgba(31,41,53,0.2)]">
              <div className="px-5 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 id="personalized-template-unsaved-title" className="text-[15px] font-semibold leading-6 text-[#1f2937]">模板内容尚未保存</h2>
                    <p className="mt-2 text-[13px] leading-6 text-[#667085]">当前个性化模板有未保存的修改。保存后会写入模板；不保存会放弃本次进入编辑器后的修改。</p>
                  </div>
                  <button type="button" onClick={() => setUnsavedClosePromptOpen(false)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8a98aa] hover:bg-[#f1f4f8] hover:text-[#344054]" aria-label="取消关闭">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-5">
                <button type="button" onClick={forceCloseEditing} className="h-8 rounded-md border border-[#d9e2ef] px-3 text-[12px] font-semibold text-[#52647b] hover:bg-[#f8fafc]">不保存并关闭</button>
                <button type="button" onClick={() => setUnsavedClosePromptOpen(false)} className="h-8 rounded-md border border-[#d9e2ef] px-3 text-[12px] font-semibold text-[#52647b] hover:bg-[#f8fafc]">继续编辑</button>
                <button type="button" onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#407aff] px-3 text-[12px] font-semibold text-white hover:bg-[#326ae6] disabled:cursor-not-allowed disabled:opacity-60">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  保存并关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="app-page-surface enterprise-list-ui quota-management-ui quota-list-page quota-template-page -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 text-surface-900 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className="quota-template-toolbar-shell shrink-0 border border-surface-200/90 bg-white/95 px-4 py-3">
        <div className="quota-list-toolbar quota-template-toolbar flex flex-col gap-3 p-0 lg:flex-row lg:items-center lg:justify-between">
          <div className="quota-search-control flex min-h-10 flex-1 items-center gap-2 border border-surface-200 bg-white px-3 text-sm text-surface-500 lg:max-w-md">
            <Search className="h-4 w-4" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-surface-400" placeholder="搜索模板名称、备注、所属门店" />
          </div>
          <div className="quota-toolbar-compact flex flex-wrap items-center gap-2">
            <div className="quota-template-filter-group flex items-center gap-2">
              <span className="quota-template-filter-label inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500"><SlidersHorizontal className="h-3.5 w-3.5" />筛选</span>
              <SystemSelect className="input-field h-10 w-32 py-0" aria-label="按状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | "enabled" | "disabled")}>
                <option value="">全部状态</option>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </SystemSelect>
            </div>
            <span className="quota-template-toolbar-divider mx-1 h-5 w-px bg-surface-200" />
            <button type="button" onClick={startCreate} className="quota-template-primary-action btn-primary min-h-10 px-3"><Plus className="h-4 w-4" />新建模板</button>
          </div>
        </div>
      </section>

      {notice && (
        <div className={`border-x border-b px-4 py-2 text-sm font-medium ${notice.tone === "danger" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <section className="table-shell quota-list-shell flex min-h-0 flex-1 flex-col">
        <ThinScrollArea className="quota-list-scroll min-h-0 flex-1" scrollClassName="h-full overflow-y-auto">
          <table className="quota-list-table w-full min-w-[1360px] table-fixed text-sm">
            <colgroup>
              <col className="w-[5%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
              <tr className="border-b border-surface-300">
                <th className="px-3 py-3 text-center">序号</th>
                <th className="px-3 py-3 text-left">模板名称</th>
                <th className="px-3 py-3 text-left">备注</th>
                <th className="px-3 py-3 text-left">所属门店</th>
                <th className="px-3 py-3 text-center">项目数量</th>
                <th className="px-3 py-3 text-center">状态</th>
                <th className="px-3 py-3 text-center">创建人</th>
                <th className="px-3 py-3 text-center">创建时间</th>
                <th className="whitespace-nowrap px-3 py-3 text-center">更新时间</th>
                <th className="px-3 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-10 text-center"><div className="flex min-h-[240px] items-center justify-center text-sm text-surface-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载</div></td></tr>
              ) : pagination.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="quota-template-empty-cell px-3 py-10 text-center">
                    <div className="quota-template-empty-state mx-auto flex max-w-[560px] flex-col items-center text-center">
                      <span className="quota-template-empty-icon inline-flex items-center justify-center" aria-hidden="true"><LayoutTemplate className="h-6 w-6" /></span>
                      <p className="mt-4 text-sm font-semibold text-surface-900">还没有个性化模板</p>
                      <p className="mt-2 max-w-[520px] text-xs leading-6 text-surface-600">
                        个性化模板就是把一组经常一起使用的报价项目提前整理保存。制作报价时可以一次导入，自动作为一个新的空间/类别显示，省去逐项添加。
                      </p>
                      <p className="mt-1 max-w-[520px] text-xs leading-6 text-surface-500">
                        <span className="font-semibold text-surface-700">例如：</span>
                        把“常用打拆项目、常用木制作项目、常用吊顶项目”等常用项目整理成一个个“个性化模板”，下次报价时直接导入即可。
                      </p>
                      <button type="button" onClick={startCreate} className="btn-secondary mt-4 min-h-9 px-3 text-xs"><Plus className="h-3.5 w-3.5" />新建模板</button>
                    </div>
                  </td>
                </tr>
              ) : (
                pagination.pageItems.map((template, index) => (
                  <tr key={template.id} tabIndex={0} className="cursor-pointer bg-white outline-none ring-inset hover:bg-surface-50 focus-visible:ring-2 focus-visible:ring-primary-200" onClick={() => startEdit(template)} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); startEdit(template); }} title="点击编辑模板">
                    <td className="px-3 py-3 text-center font-semibold tabular-nums text-surface-500">{(pagination.page - 1) * pagination.pageSize + index + 1}</td>
                    <td className="quota-template-name-cell px-3 py-3"><p className="truncate font-semibold text-surface-900" title={template.name}>{template.name}</p></td>
                    <td className="px-3 py-3 text-surface-600"><p className="truncate" title={template.remark || undefined}>{template.remark || "-"}</p></td>
                    <td className="quota-template-scope-cell px-3 py-3 text-surface-700"><p className="truncate" title={template.storeName || undefined}>{template.storeName || "-"}</p></td>
                    <td className="px-3 py-3 text-center tabular-nums text-surface-700">{template.items.length}</td>
                    <td className="px-3 py-3 text-center"><span className={`quota-status-tag ${template.status === "enabled" ? "quota-status-tag-enabled" : "quota-status-tag-disabled"} inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold`}>{template.status === "enabled" ? "启用" : "停用"}</span></td>
                    <td className="px-3 py-3 text-center text-surface-700"><p className="truncate" title={template.createdByName || undefined}>{template.createdByName || "-"}</p></td>
                    <td className="px-3 py-3 text-center tabular-nums text-surface-500">{template.createdAt ? template.createdAt.slice(0, 16).replace("T", " ") : "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums text-surface-500">{template.updatedAt ? template.updatedAt.slice(0, 16).replace("T", " ") : "-"}</td>
                    <td className="px-3 py-3 text-center"><div className="quota-template-row-actions inline-flex items-center justify-center gap-1">
                      <button type="button" onClick={(event) => { event.stopPropagation(); startEdit(template); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title="编辑模板"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void mutateTemplate("toggle", template); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title={template.status === "enabled" ? "停用模板" : "启用模板"}><Power className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void mutateTemplate("delete", template); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="删除模板"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination total={filteredTemplates.length} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemName="个模板" />
      </section>

      {Boolean(editing) && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#172033]/30 p-5 backdrop-blur-[1px]">
          <div className="flex max-h-[min(860px,calc(100vh-40px))] w-full max-w-[1160px] flex-col overflow-hidden rounded-xl border border-[#d9e2ef] bg-white shadow-[0_26px_70px_rgba(31,41,53,0.2)]">
            <div className="flex items-start justify-between border-b border-[#e8edf4] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-semibold">{editing!.id ? "编辑个性化模板" : "新建个性化模板"}</h2>
                <p className="mt-1 text-[12px] text-[#8a98aa]">模板名称会作为报价中新增的空间/类别名称。</p>
              </div>
              <button type="button" onClick={closeEditing} disabled={saving} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#8a98aa] hover:bg-[#f1f4f8] hover:text-[#344054] disabled:cursor-not-allowed disabled:opacity-50" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#52647b]">模板名称 <em className="text-red-500">*</em></span>
                  <input value={editing!.name} onChange={(event) => updateEditing({ name: event.target.value })} className="h-9 w-full rounded-md border border-[#d9e2ef] px-3 text-[13px] outline-none focus:border-[#8bb0ff]" placeholder="例如：别墅客厅背景墙" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#52647b]">所属门店 <em className="text-red-500">*</em></span>
                  <select value={editing!.storeId} onChange={(event) => updateEditing({ storeId: event.target.value })} className="h-9 w-full rounded-md border border-[#d9e2ef] bg-white px-3 text-[13px] outline-none focus:border-[#8bb0ff]">
                    <option value="">请选择门店</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-5 flex items-center gap-1 border-b border-[#e8edf4]">
                {categories.map((category) => {
                  const count = editing!.items.filter((item: PersonalizedTemplateItem) => item.category === category).length;
                  return <button type="button" key={category} onClick={() => setActiveCategory(category)} className={`relative px-3 py-2 text-[13px] font-semibold ${activeCategory === category ? "text-[#326ae6]" : "text-[#667085]"}`}>{getPersonalizedTemplateCategoryLabel(category)}<span className="ml-1 text-[11px] text-[#9aa6b5]">{count}</span>{activeCategory === category && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#407aff]" />}</button>;
                })}
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-[#dfe6ef]">
                <div className="grid grid-cols-[minmax(200px,1.8fr)_minmax(130px,1fr)_70px_72px_110px_minmax(150px,1.2fr)_42px] gap-2 bg-[#f8fafc] px-3 py-2 text-[11px] font-semibold text-[#667085]">
                  <span>项目名称</span><span>规格/型号</span><span>单位</span><span>数量</span><span>单价</span><span>备注</span><span />
                </div>
                {categoryItems.length === 0 ? (
                  <div className="px-4 py-12 text-center text-[12px] text-[#8a98aa]">该分类还没有项目，点击下方添加。</div>
                ) : categoryItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[minmax(200px,1.8fr)_minmax(130px,1fr)_70px_72px_110px_minmax(150px,1.2fr)_42px] gap-2 border-t border-[#edf1f6] px-3 py-2">
                    <input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="h-8 min-w-0 rounded-md border border-[#dfe6ef] px-2 text-[12px] outline-none focus:border-[#8bb0ff]" placeholder="填写项目名称" />
                    <input value={`${item.spec || ""}${item.material_model ? ` / ${item.material_model}` : ""}`} onChange={(event) => updateItem(item.id, { spec: event.target.value, material_model: "" })} className="h-8 min-w-0 rounded-md border border-[#dfe6ef] px-2 text-[12px] outline-none focus:border-[#8bb0ff]" placeholder="规格或型号" />
                    <input value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="h-8 min-w-0 rounded-md border border-[#dfe6ef] px-2 text-center text-[12px] outline-none focus:border-[#8bb0ff]" placeholder="项" />
                    <input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: money(event.target.value) })} className="h-8 min-w-0 rounded-md border border-[#dfe6ef] px-2 text-right text-[12px] outline-none focus:border-[#8bb0ff]" />
                    <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(item.id, { unit_price: money(event.target.value) })} className="h-8 min-w-0 rounded-md border border-[#dfe6ef] px-2 text-right text-[12px] outline-none focus:border-[#8bb0ff]" />
                    <input value={item.remark} onChange={(event) => updateItem(item.id, { remark: event.target.value })} className="h-8 min-w-0 rounded-md border border-[#dfe6ef] px-2 text-[12px] outline-none focus:border-[#8bb0ff]" placeholder="可选" />
                    <button type="button" onClick={() => removeItem(item.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#a8b4c4] hover:bg-red-50 hover:text-[#c24141]" title="删除项目"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={addItem} className="flex h-9 w-full items-center justify-center gap-1 border-t border-[#edf1f6] text-[12px] font-semibold text-[#407aff] hover:bg-[#f7faff]"><Plus className="h-3.5 w-3.5" />添加{getPersonalizedTemplateCategoryLabel(activeCategory)}项目</button>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-[#8a98aa]">数量在导入报价后继续填写或调整；本模板只保存项目内容，不会保存报价模式、综合费用和其他报价全局配置。</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#e8edf4] px-5 py-3">
              <button type="button" onClick={closeEditing} disabled={saving} className="h-8 rounded-md border border-[#d9e2ef] px-3.5 text-[12px] font-semibold text-[#52647b] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50">取消</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#407aff] px-3.5 text-[12px] font-semibold text-white hover:bg-[#326ae6] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}保存模板</button>
            </div>
          </div>
        </div>
      )}
      {unsavedClosePromptOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#172033]/30 p-5 backdrop-blur-[1px]">
          <div role="dialog" aria-modal="true" aria-labelledby="personalized-template-unsaved-title" className="w-full max-w-[420px] overflow-hidden rounded-xl border border-[#d9e2ef] bg-white text-[#1f2937] shadow-[0_24px_70px_rgba(31,41,53,0.2)]">
            <div className="px-5 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 id="personalized-template-unsaved-title" className="text-[15px] font-semibold leading-6 text-[#1f2937]">模板内容尚未保存</h2>
                  <p className="mt-2 text-[13px] leading-6 text-[#667085]">当前个性化模板有未保存的修改。保存后会写入模板；不保存会放弃本次进入编辑器后的修改。</p>
                </div>
                <button type="button" onClick={() => setUnsavedClosePromptOpen(false)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8a98aa] hover:bg-[#f1f4f8] hover:text-[#344054]" aria-label="取消关闭">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-5">
              <button type="button" onClick={forceCloseEditing} className="h-8 rounded-md border border-[#d9e2ef] px-3 text-[12px] font-semibold text-[#52647b] hover:bg-[#f8fafc]">不保存并关闭</button>
              <button type="button" onClick={() => setUnsavedClosePromptOpen(false)} className="h-8 rounded-md border border-[#d9e2ef] px-3 text-[12px] font-semibold text-[#52647b] hover:bg-[#f8fafc]">继续编辑</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#407aff] px-3 text-[12px] font-semibold text-white hover:bg-[#326ae6] disabled:cursor-not-allowed disabled:opacity-60">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
