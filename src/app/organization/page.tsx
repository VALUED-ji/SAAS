"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, type DragEvent } from "react";
import {
  Building2, Globe, Building, Store, Layers, Users,
  ChevronRight, ChevronDown, Plus, Search, X, Trash2, Loader2, AlertTriangle, Power, GitMerge, ArrowRightLeft,
} from "lucide-react";

const typeMeta: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  group: { label: "集团", icon: Building2, color: "text-surface-800 bg-surface-100 ring-1 ring-surface-200" },
  region: { label: "大区", icon: Globe, color: "text-primary-700 bg-primary-50 ring-1 ring-primary-100" },
  company: { label: "公司", icon: Building, color: "text-accent-700 bg-accent-50 ring-1 ring-accent-100" },
  store: { label: "门店", icon: Store, color: "text-amber-700 bg-amber-50 ring-1 ring-amber-100" },
  dept: { label: "部门", icon: Layers, color: "text-primary-700 bg-primary-50 ring-1 ring-primary-100" },
  team: { label: "小组", icon: Users, color: "text-surface-700 bg-surface-100 ring-1 ring-surface-200" },
};

const orgTypeOrder = ["group", "region", "company", "store", "dept", "team"];
const orgTypeFilters = ["all", ...orgTypeOrder] as const;

const panelClass = "org-access-panel border border-surface-200 bg-white shadow-none";
const panelHeaderClass = "org-access-panel-header border-b border-surface-200 bg-white px-4 py-3";

function formatOrgCreatedAt(value?: string) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getDirectChildPreview(units: OrgUnit[], id: string) {
  const names = units
    .filter((unit) => unit.parent_id === id)
    .slice(0, 3)
    .map((unit) => unit.name)
    .filter(Boolean);
  return names.length > 0 ? names.join("、") : "暂无直属下级";
}

import {
  EnhancedOrgNode,
  ManagerPicker,
  MetricTile,
  OrgUnit,
  UserOption,
  buildTree,
  getDeleteImpact,
  getDescendantCount,
  getDescendantIds,
  getManagerIds,
  getManagerName,
  getOrgPath,
  isOrgActive,
} from "./organization-components";
import { canReorderOrgUnits, getOrgReorderableIds, getOrgSiblingKey, reorderOrgUnits } from "./organization-order";
import { findSameScopeOrgUnits, normalizeOrgUnitDisplayName } from "@/lib/orgUnitDuplicates";

function EnhancedOrgPage() {
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof orgTypeFilters)[number]>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState<{ open: boolean; parentId?: string; childType?: string; edit?: OrgUnit }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<OrgUnit | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [mergeSource, setMergeSource] = useState<OrgUnit | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeMode, setMergeMode] = useState<"duplicate" | "general">("duplicate");
  const [mergeTargetQuery, setMergeTargetQuery] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formManagerIds, setFormManagerIds] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [draggedId, setDraggedId] = useState("");
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<{ id: string; token: number } | null>(null);
  const previousRowPositionsRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    if (!moveFeedback) return;
    const timer = window.setTimeout(() => {
      setMoveFeedback((current) => (current?.token === moveFeedback.token ? null : current));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [moveFeedback]);

  const captureRowPositions = () => {
    const positions = new Map<string, number>();
    document.querySelectorAll<HTMLElement>("[data-org-row-id]").forEach((row) => {
      const id = row.dataset.orgRowId;
      if (id) positions.set(id, row.getBoundingClientRect().top);
    });
    previousRowPositionsRef.current = positions;
  };

  useLayoutEffect(() => {
    const previousPositions = previousRowPositionsRef.current;
    if (previousPositions.size === 0) return;
    previousRowPositionsRef.current = new Map();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>("[data-org-row-id]").forEach((row) => {
        const id = row.dataset.orgRowId;
        const previousTop = id ? previousPositions.get(id) : undefined;
        if (previousTop === undefined) return;
        const deltaY = previousTop - row.getBoundingClientRect().top;
        if (Math.abs(deltaY) < 0.5) return;
        row.animate(
          [
            { transform: `translateY(${deltaY}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [units]);

  const fetchUnits = useCallback(async () => {
    try {
      setUnits(await (await fetch("/api/org")).json());
    } catch {
      console.error("Failed to fetch org units");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUnits();
    fetch("/api/team")
      .then((res) => res.json())
      .then((data) => setUsers((Array.isArray(data) ? data : []).map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar || null,
        role: user.role,
        role_name: user.role_name || null,
        org_unit_id: user.org_unit_id,
        org_unit_name: user.org_unit_name,
        phone: user.phone,
        is_active: user.is_active,
      }))))
      .catch(() => setUsers([]));
  }, [fetchUnits]);

  const visibleUnits = useMemo(() => {
    if (showInactive) return units;
    const hiddenIds = new Set(units.filter((unit) => !isOrgActive(unit)).map((unit) => unit.id));
    let changed = true;
    while (changed) {
      changed = false;
      units.forEach((unit) => {
        if (!unit.parent_id || hiddenIds.has(unit.id)) return;
        if (hiddenIds.has(unit.parent_id)) {
          hiddenIds.add(unit.id);
          changed = true;
        }
      });
    }
    return units.filter((unit) => !hiddenIds.has(unit.id));
  }, [showInactive, units]);

  useEffect(() => {
    if (!loading && visibleUnits.length > 0 && (!selectedId || !visibleUnits.some((unit) => unit.id === selectedId))) {
      setSelectedId(visibleUnits[0].id);
    }
  }, [loading, selectedId, visibleUnits]);

  const directMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleUnits.filter((unit) => {
      const matchesType = typeFilter === "all" || unit.type === typeFilter;
      const searchText = `${unit.name} ${getManagerName(unit)} ${typeMeta[unit.type]?.label || ""} ${getOrgPath(visibleUnits, unit.id)}`.toLowerCase();
      const matchesQuery = !q || searchText.includes(q);
      return matchesType && matchesQuery;
    });
  }, [searchQuery, typeFilter, visibleUnits]);

  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim() && typeFilter === "all") return visibleUnits;
    const ids = new Set<string>();
    const addAncestors = (id: string) => {
      ids.add(id);
      const unit = visibleUnits.find((item) => item.id === id);
      if (unit?.parent_id) addAncestors(unit.parent_id);
    };
    directMatches.forEach((unit) => addAncestors(unit.id));
    return visibleUnits.filter((unit) => ids.has(unit.id));
  }, [directMatches, searchQuery, typeFilter, visibleUnits]);

  useEffect(() => {
    if (searchQuery.trim() || typeFilter !== "all") setExpanded(new Set(filteredUnits.map((unit) => unit.id)));
  }, [filteredUnits, searchQuery, typeFilter]);

  const tree = buildTree(filteredUnits);
  const selectedNode = visibleUnits.find((unit) => unit.id === selectedId);
  const selectedPath = selectedNode ? getOrgPath(visibleUnits, selectedNode.id) : "";
  const selectedDescendantCount = selectedNode ? getDescendantCount(visibleUnits, selectedNode.id) : 0;
  const selectedDirectChildren = selectedNode ? visibleUnits.filter((unit) => unit.parent_id === selectedNode.id).length : 0;
  const memberStats = useMemo(() => {
    const direct = new Map<string, number>();
    const total = new Map<string, number>();
    const descendants = new Map<string, number>();
    const totalCustomers = new Map<string, number>();

    users.forEach((user) => {
      if (!user.org_unit_id) return;
      direct.set(user.org_unit_id, (direct.get(user.org_unit_id) || 0) + 1);
    });

    visibleUnits.forEach((unit) => {
      const descendantIds = getDescendantIds(visibleUnits, unit.id);
      descendants.set(unit.id, descendantIds.length);
      total.set(unit.id, (direct.get(unit.id) || 0) + descendantIds.reduce((sum, id) => sum + (direct.get(id) || 0), 0));
      totalCustomers.set(
        unit.id,
        Number(unit.customer_count || 0) + descendantIds.reduce((sum, id) => {
          const descendant = visibleUnits.find((item) => item.id === id);
          return sum + Number(descendant?.customer_count || 0);
        }, 0),
      );
    });

    return { direct, total, descendants, totalCustomers };
  }, [users, visibleUnits]);
  const duplicateFormUnit = useMemo(() => {
    if (!modal.open || !formName.trim()) return null;
    const type = modal.edit?.type || modal.childType || "";
    const parentId = modal.edit ? modal.edit.parent_id : modal.parentId || null;
    if (!type) return null;
    return findSameScopeOrgUnits(units, {
      id: modal.edit?.id,
      name: formName,
      type,
      parent_id: parentId,
    })[0] || null;
  }, [formName, modal, units]);
  const mergeCandidates = useMemo(() => {
    if (!mergeSource) return [];
    if (mergeMode === "duplicate") return findSameScopeOrgUnits(units, mergeSource);
    const blockedIds = new Set([mergeSource.id, ...getDescendantIds(units, mergeSource.id)]);
    return units.filter((unit) => !blockedIds.has(unit.id) && isOrgActive(unit));
  }, [mergeMode, mergeSource, units]);
  const visibleMergeCandidates = useMemo(() => {
    const query = mergeTargetQuery.trim().toLowerCase();
    if (!query) return mergeCandidates;
    return mergeCandidates.filter((unit) => (
      `${unit.name} ${getOrgPath(units, unit.id)} ${getManagerName(unit)} ${typeMeta[unit.type]?.label || ""}`
        .toLowerCase()
        .includes(query)
    ));
  }, [mergeCandidates, mergeTargetQuery, units]);
  const mergeSourceImpact = useMemo(() => (
    mergeSource ? getDeleteImpact(units, users, mergeSource.id) : null
  ), [mergeSource, units, users]);
  const mergeTarget = mergeCandidates.find((unit) => unit.id === mergeTargetId);
  const mergeTargetImpact = useMemo(() => (
    mergeTarget ? getDeleteImpact(units, users, mergeTarget.id) : null
  ), [mergeTarget, units, users]);
  const recommendedMergeTargetId = useMemo(() => {
    if (mergeMode !== "duplicate" || mergeCandidates.length === 0) return "";
    return [...mergeCandidates]
      .sort((left, right) => {
        const leftImpact = getDeleteImpact(units, users, left.id);
        const rightImpact = getDeleteImpact(units, users, right.id);
        const leftScore = (
          leftImpact.directChildren * 10
          + leftImpact.descendantOrgs * 6
          + leftImpact.totalMembers * 3
          + leftImpact.totalCustomers
          + (isOrgActive(left) ? 1000 : 0)
        );
        const rightScore = (
          rightImpact.directChildren * 10
          + rightImpact.descendantOrgs * 6
          + rightImpact.totalMembers * 3
          + rightImpact.totalCustomers
          + (isOrgActive(right) ? 1000 : 0)
        );
        return rightScore - leftScore;
      })[0]?.id || "";
  }, [mergeCandidates, mergeMode, units, users]);
  const mergeSourceLooksMoreComplete = useMemo(() => {
    if (mergeMode !== "duplicate" || !mergeSource || !mergeSourceImpact || !recommendedMergeTargetId) return false;
    const recommendedImpact = getDeleteImpact(units, users, recommendedMergeTargetId);
    const sourceScore = mergeSourceImpact.directChildren + mergeSourceImpact.descendantOrgs + mergeSourceImpact.totalMembers + mergeSourceImpact.totalCustomers;
    const recommendedScore = recommendedImpact.directChildren + recommendedImpact.descendantOrgs + recommendedImpact.totalMembers + recommendedImpact.totalCustomers;
    return sourceScore > recommendedScore;
  }, [mergeMode, mergeSource, mergeSourceImpact, recommendedMergeTargetId, units, users]);
  const reorderEnabled = !searchQuery.trim() && typeFilter === "all";
  const reorderableIds = useMemo(() => getOrgReorderableIds(units), [units]);

  const canReorderNode = useCallback((sourceId: string, targetId: string) => (
    reorderEnabled && canReorderOrgUnits(units, sourceId, targetId)
  ), [reorderEnabled, units]);

  const handleDragStartNode = (event: DragEvent<HTMLSpanElement>, id: string) => {
    event.stopPropagation();
    if (!reorderEnabled || !reorderableIds.has(id)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    const row = event.currentTarget.closest(".org-tree-node")?.querySelector(".org-tree-row");
    if (row) event.dataTransfer.setDragImage(row, 28, 28);
    setDraggedId(id);
    setDropTarget(null);
  };

  const handleDragOverNode = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorderNode(draggedId, targetId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget((current) => (
      current?.id === targetId && current.position === position ? current : { id: targetId, position }
    ));
  };

  const handleDragLeaveNode = (id: string) => {
    setDropTarget((current) => (current?.id === id ? null : current));
  };

  const handleReorderOrganizations = async (
    sourceId: string,
    targetId: string,
    position: "before" | "after",
  ) => {
    const nextUnits = reorderOrgUnits(units, sourceId, targetId, position);
    if (nextUnits === units) return;
    const source = units.find((unit) => unit.id === sourceId);
    if (!source) return;
    const siblingKey = getOrgSiblingKey(source);
    const orderedIds = nextUnits
      .filter((unit) => getOrgSiblingKey(unit) === siblingKey)
      .map((unit) => unit.id);
    const previousUnits = units;
    captureRowPositions();
    setUnits(nextUnits);
    try {
      const response = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: orderedIds }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "排序保存失败");
      }
      setMoveFeedback({ id: sourceId, token: Date.now() });
    } catch (error: any) {
      captureRowPositions();
      setUnits(previousUnits);
      setActionNotice({ type: "error", text: error?.message || "排序保存失败，请稍后重试" });
    }
  };

  const handleDropNode = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorderNode(draggedId, targetId)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const sourceId = draggedId;
    setDraggedId("");
    setDropTarget(null);
    void handleReorderOrganizations(sourceId, targetId, position);
  };

  const handleDragEnd = () => {
    setDraggedId("");
    setDropTarget(null);
  };

  const closeModal = () => {
    setModal({ open: false });
    setFormName("");
    setFormManagerIds([]);
    setFormError("");
  };

  const handleAddRoot = () => {
    setModal({ open: true, childType: "group" });
    setFormName("");
    setFormManagerIds([]);
    setFormError("");
  };

  const onAdd = (parentId: string, childType: string) => {
    setModal({ open: true, parentId, childType });
    setFormName("");
    setFormManagerIds([]);
    setFormError("");
  };

  const onEdit = (node: OrgUnit) => {
    setModal({ open: true, edit: node });
    setFormName(node.name);
    setFormManagerIds(getManagerIds(node));
    setFormError("");
  };

  const openDeleteConfirm = (node: OrgUnit) => {
    setDeleteTarget(node);
    setDeleteError("");
  };

  const openMergeDialog = (node: OrgUnit, mode: "duplicate" | "general" = "duplicate") => {
    setMergeSource(node);
    setMergeMode(mode);
    setMergeTargetId("");
    setMergeTargetQuery("");
    setMergeError("");
  };

  const closeMergeDialog = () => {
    if (mergeSubmitting) return;
    setMergeSource(null);
    setMergeTargetId("");
    setMergeMode("duplicate");
    setMergeTargetQuery("");
    setMergeError("");
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTargetId) {
      setMergeError("请选择要保留的组织");
      return;
    }
    setMergeSubmitting(true);
    setMergeError("");
    try {
      const response = await fetch("/api/org/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: mergeSource.id, target_id: mergeTargetId, mode: mergeMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMergeError(data.message || "合并组织失败");
        return;
      }
      const targetName = mergeCandidates.find((unit) => unit.id === mergeTargetId)?.name || mergeSource.name;
      setMergeSource(null);
      setMergeTargetId("");
      setMergeMode("duplicate");
      setMergeTargetQuery("");
      setSelectedId(mergeTargetId);
      setActionNotice({
        type: "success",
        text: `${mergeMode === "duplicate" ? "重复组织" : "组织"}已合并到「${targetName}」，下级、成员和关联数据已迁移`,
      });
      await fetchUnits();
    } catch {
      setMergeError("网络错误，请稍后重试");
    } finally {
      setMergeSubmitting(false);
    }
  };

  const handleAdd = async () => {
    const normalizedName = normalizeOrgUnitDisplayName(formName);
    if (!normalizedName) {
      setFormError("请填写组织名称");
      return;
    }
    if (!modal.childType) return;
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName, type: modal.childType, parent_id: modal.parentId, manager_ids: formManagerIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.message || "创建失败，请稍后重试");
        return;
      }
      const created = await res.json().catch(() => null);
      closeModal();
      await fetchUnits();
      if (created?.id) setSelectedId(created.id);
      if (modal.parentId) {
        setExpanded((current) => {
          const next = new Set(current);
          next.add(modal.parentId!);
          return next;
        });
      }
    } catch {
      setFormError("网络错误，请稍后重试");
    }
  };

  const handleEdit = async () => {
    const normalizedName = normalizeOrgUnitDisplayName(formName);
    if (!normalizedName) {
      setFormError("请填写组织名称");
      return;
    }
    if (!modal.edit) return;
    try {
      const res = await fetch(`/api/org?id=${modal.edit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName, manager_ids: formManagerIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.message || "保存失败，请稍后重试");
        return;
      }
      closeModal();
      await fetchUnits();
    } catch {
      setFormError("网络错误，请稍后重试");
    }
  };

  const handleToggleActive = async (node: OrgUnit) => {
    const nextActive = isOrgActive(node) ? 0 : 1;
    try {
      const res = await fetch(`/api/org?id=${node.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionNotice({ type: "error", text: data.message || "操作失败，请稍后重试" });
        return false;
      }
      setActionNotice({
        type: "success",
        text: nextActive === 1
          ? `「${node.name}」已启用`
          : `「${node.name}」已停用，历史数据会保留，但不能继续新增下级、员工或客户`,
      });
      await fetchUnits();
      return true;
    } catch {
      setActionNotice({ type: "error", text: "网络错误，请稍后重试" });
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const impact = getDeleteImpact(units, users, deleteTarget.id);
    if (impact.blocked) return;
    const res = await fetch(`/api/org?id=${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.message || "删除失败，请稍后重试");
      return;
    }
    setDeleteTarget(null);
    setDeleteError("");
    await fetchUnits();
    if (selectedId === deleteTarget.id) setSelectedId("");
  };

  const deleteImpact = deleteTarget ? getDeleteImpact(units, users, deleteTarget.id) : null;

  return (
    <div className="app-page-surface admin-config-ui org-permissions-ui organization-console-ui -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 text-surface-900 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className={`${panelClass} org-access-toolbar shrink-0 px-3 py-3`}>
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="搜索组织名称、管理人员、类型"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="input-field w-full pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                  aria-label="清除搜索"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="org-type-filter flex flex-wrap items-center gap-1">
              {orgTypeFilters.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  data-active={typeFilter === type ? "true" : "false"}
                  className={`org-type-filter-button rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                    typeFilter === type
                      ? "border-primary-200 bg-primary-50 text-primary-700"
                      : "border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:text-surface-900"
                  }`}
                >
                  {type === "all" ? "全部" : typeMeta[type]?.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 2xl:justify-end">
            {visibleUnits.length > 0 && (
              <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => {
                if (expanded.size >= visibleUnits.length) setExpanded(new Set());
                else setExpanded(new Set(visibleUnits.map((unit) => unit.id)));
              }}>
                {expanded.size >= visibleUnits.length ? <><ChevronRight className="h-4 w-4" />全部收起</> : <><ChevronDown className="h-4 w-4" />全部展开</>}
              </button>
            )}
            <button
              type="button"
              className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${showInactive ? "border-primary-200 bg-primary-50 text-primary-700" : ""}`}
              aria-pressed={showInactive}
              onClick={() => setShowInactive((current) => !current)}
            >
              <Power className="h-3.5 w-3.5" />
              {showInactive ? "隐藏停用组织" : "显示停用组织"}
            </button>
            <button className="btn-primary min-h-9 px-3 py-1.5 text-xs" onClick={handleAddRoot}><Plus className="h-4 w-4" />新增顶级组织</button>
          </div>
        </div>
        {actionNotice && (
          <div className={`mt-3 rounded-md border px-3 py-2 text-xs leading-5 ${
            actionNotice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {actionNotice.text}
          </div>
        )}
      </section>

      <div className="organization-workspace grid min-h-0 flex-1">
        <section className={`${panelClass} organization-tree-panel flex min-h-0 flex-col overflow-hidden`}>
          <div className={`${panelHeaderClass} flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-surface-900">组织架构</p>
              <p className="mt-0.5 truncate text-xs text-surface-500">
                {selectedNode ? `当前选中：${selectedPath}` : "请选择一个组织"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-surface-500">
              <span className="rounded border border-surface-200 bg-white px-2 py-1">组织数量：{visibleUnits.length}</span>
              <span className="rounded border border-surface-200 bg-white px-2 py-1">匹配结果：{directMatches.length}</span>
              {selectedNode && <span className="rounded border border-surface-200 bg-white px-2 py-1">下级组织：{selectedDirectChildren} / {selectedDescendantCount}</span>}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-surface-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载中...</div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-surface-400">
              {searchQuery || typeFilter !== "all" ? <Search className="mb-3 h-12 w-12 text-surface-300" /> : <Building2 className="mb-3 h-12 w-12 text-surface-300" />}
              <p className="mb-4 text-sm">{searchQuery || typeFilter !== "all" ? "未找到匹配的组织" : "暂无组织架构"}</p>
              {searchQuery || typeFilter !== "all" ? (
                <button className="text-xs text-primary-600 hover:text-primary-700" onClick={() => { setSearchQuery(""); setTypeFilter("all"); }}>清除筛选</button>
              ) : (
                <button className="btn-primary" onClick={handleAddRoot}><Plus className="h-4 w-4" />新增顶级组织</button>
              )}
            </div>
          ) : (
            <div className="organization-tree-scroll min-h-0 flex-1 overflow-y-auto">
              {tree.map((root) => (
                <EnhancedOrgNode
                  key={root.id}
                  node={root}
                  depth={0}
                  expanded={expanded}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onToggle={(id) => {
                    const next = new Set(expanded);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    setExpanded(next);
                  }}
                  searchQuery={searchQuery}
                  onAdd={onAdd}
                  onEdit={onEdit}
                  onDelete={openDeleteConfirm}
                  onToggleActive={handleToggleActive}
                  onMerge={(node) => openMergeDialog(node, "duplicate")}
                  onGeneralMerge={(node) => openMergeDialog(node, "general")}
                  canReorder={reorderEnabled}
                  reorderableIds={reorderableIds}
                  draggedId={draggedId}
                  dropTarget={dropTarget}
                  moveFeedbackId={moveFeedback?.id || ""}
                  moveFeedbackToken={moveFeedback?.token || 0}
                  memberStats={memberStats}
                  onDragStartNode={handleDragStartNode}
                  onDragOverNode={handleDragOverNode}
                  onDragLeaveNode={handleDragLeaveNode}
                  onDropNode={handleDropNode}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {modal.open && (
        <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="fixed inset-0 bg-black/45" onClick={closeModal} />
          <div className="org-access-modal-shell organization-editor-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white">
            <div className="org-access-modal-header border-b border-surface-200 bg-white px-5 py-4">
              <h3 className="text-base font-semibold text-surface-900">
                {modal.edit ? "编辑组织" : modal.parentId ? "新增下级组织" : "新增顶级组织"}
              </h3>
              <p className="mt-1 text-xs text-surface-500">
                {modal.edit ? "调整组织名称和管理人员，不影响已有业务数据。" : "新增组织后可继续维护下级和管理人员。"}
              </p>
            </div>
            <div className="org-access-modal-body min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="org-context-strip rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs leading-5 text-surface-600">
                <div>组织类型：{typeMeta[modal.edit?.type || modal.childType || "group"]?.label}</div>
                <div className="truncate">所属位置：{modal.edit ? getOrgPath(units, modal.edit.parent_id) || "顶级组织" : getOrgPath(units, modal.parentId) || "顶级组织"}</div>
              </div>
              <label className="mt-4 block text-xs font-semibold text-surface-600">组织名称</label>
              <input
                type="text"
                value={formName}
                onChange={(event) => { setFormName(event.target.value); setFormError(""); }}
                className="input-field mt-1"
                placeholder="请输入组织名称"
                autoFocus
                onKeyDown={(event) => event.key === "Enter" && (modal.edit ? handleEdit() : handleAdd())}
              />
              {duplicateFormUnit && (
                <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  同一上级下已存在{typeMeta[modal.edit?.type || modal.childType || ""]?.label || "同名组织"}「{duplicateFormUnit.name}」，请修改名称。
                </p>
              )}
              <label className="mt-3 block text-xs font-semibold text-surface-600">管理人员</label>
              <ManagerPicker users={users} value={formManagerIds} onChange={setFormManagerIds} />
              {formError && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{formError}</p>}
            </div>
            <div className="org-access-modal-footer flex items-center justify-end gap-3 border-t border-surface-200 bg-white px-5 py-4">
              <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={closeModal}>取消</button>
              <button className="btn-primary min-h-9 px-3 py-1.5 text-xs" disabled={!formName.trim() || Boolean(duplicateFormUnit)} onClick={modal.edit ? handleEdit : handleAdd}>确认保存</button>
            </div>
          </div>
        </div>
      )}

      {mergeSource && (
        <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="fixed inset-0 bg-black/45" onClick={closeMergeDialog} />
          <div className="org-access-modal-shell organization-merge-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white">
            <div className="org-access-modal-header flex items-start gap-3 border-b border-surface-200 bg-white px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
                {mergeMode === "duplicate" ? <GitMerge className="h-5 w-5" /> : <ArrowRightLeft className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-surface-900">
                  {mergeMode === "duplicate" ? "合并重复组织" : "合并到其他组织"}
                </h3>
                <p className="mt-1 text-xs leading-5 text-surface-500">
                  合并后，被合并组织的下级组织、管理人员、成员和业务关联会迁移到保留组织，历史数据不会丢失。
                </p>
              </div>
            </div>
            <div className="org-access-modal-body min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                {mergeMode === "duplicate"
                  ? `当前检测到 ${mergeCandidates.length + 1} 个同名组织。系统不会默认替用户选择，请根据下级组织、创建时间和数据量确认要保留的组织。`
                  : "请搜索并选择实际要保留的组织。不同名称、不同类型的组织也可以合并，但不能合并到当前组织的下级组织中。"}
              </div>
              {mergeSourceLooksMoreComplete && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                  注意：当前点击的组织数据反而更完整。如果你不是要合并它，请先取消，再从需要合并的那条组织记录点击合并。
                </div>
              )}

              <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">将被合并</span>
                  <p className="text-sm font-semibold text-surface-900">{mergeSource.name}</p>
                  <span className="text-xs text-surface-500">此组织合并后会停用</span>
                </div>
                <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-surface-600 sm:grid-cols-2">
                  <p className="truncate">组织路径：{getOrgPath(units, mergeSource.id)}</p>
                  <p>创建时间：{formatOrgCreatedAt(mergeSource.created_at)}</p>
                  <p className="truncate">直属下级：{getDirectChildPreview(units, mergeSource.id)}</p>
                  <p>数据量：{mergeSourceImpact?.directChildren || 0} 个直属下级 · {mergeSourceImpact?.totalMembers || 0} 名成员 · {mergeSourceImpact?.totalCustomers || 0} 个客户</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-3 text-xs font-semibold text-surface-500">
                <span>合并方向</span>
                <ChevronRight className="h-4 w-4" />
                <span className={mergeTarget ? "text-emerald-700" : "text-amber-700"}>
                  {mergeTarget ? `保留「${mergeTarget.name}」` : "请在下方选择要保留的组织"}
                </span>
              </div>

              {mergeTarget && mergeTargetImpact && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">确认保留</span>
                    <p className="text-sm font-semibold text-surface-900">{mergeTarget.name}</p>
                  </div>
                  <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-surface-600 sm:grid-cols-2">
                    <p className="truncate">组织路径：{getOrgPath(units, mergeTarget.id)}</p>
                    <p>创建时间：{formatOrgCreatedAt(mergeTarget.created_at)}</p>
                    <p className="truncate">直属下级：{getDirectChildPreview(units, mergeTarget.id)}</p>
                    <p>数据量：{mergeTargetImpact.directChildren} 个直属下级 · {mergeTargetImpact.totalMembers} 名成员 · {mergeTargetImpact.totalCustomers} 个客户</p>
                  </div>
                </div>
              )}

              <p className="mt-4 text-xs font-semibold text-surface-600">
                {mergeMode === "duplicate" ? "选择要保留的组织" : "选择要保留的目标组织"}
              </p>
              {mergeMode === "general" && (
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                  <input
                    type="text"
                    value={mergeTargetQuery}
                    onChange={(event) => setMergeTargetQuery(event.target.value)}
                    className="input-field w-full pl-9 pr-9"
                    placeholder="搜索组织名称、路径、管理人员或类型"
                  />
                  {mergeTargetQuery && (
                    <button
                      type="button"
                      onClick={() => setMergeTargetQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                      aria-label="清除目标组织搜索"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              <div className="mt-2 space-y-2">
                {visibleMergeCandidates.map((candidate) => {
                  const candidateImpact = getDeleteImpact(units, users, candidate.id);
                  const recommended = mergeMode === "duplicate" && recommendedMergeTargetId === candidate.id;
                  return (
                    <label
                      key={candidate.id}
                      className={`block cursor-pointer rounded-lg border p-3 transition ${
                        mergeTargetId === candidate.id
                          ? "border-emerald-400 bg-emerald-50 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]"
                          : recommended
                            ? "border-emerald-200 bg-white hover:border-emerald-300"
                            : "border-surface-200 bg-white hover:border-primary-200 hover:bg-primary-50/40"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="merge-target"
                          value={candidate.id}
                          checked={mergeTargetId === candidate.id}
                          onChange={(event) => {
                            setMergeTargetId(event.target.value);
                            setMergeError("");
                          }}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-surface-900">{candidate.name}</span>
                            {recommended && (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                建议保留，数据更完整
                              </span>
                            )}
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isOrgActive(candidate)
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-surface-100 text-surface-500"
                            }`}>
                              {isOrgActive(candidate) ? "启用中" : "已停用"}
                            </span>
                          </span>
                          <span className="mt-2 grid gap-x-6 gap-y-1 text-xs text-surface-600 sm:grid-cols-2">
                            <span className="truncate">组织路径：{getOrgPath(units, candidate.id)}</span>
                            <span>创建时间：{formatOrgCreatedAt(candidate.created_at)}</span>
                            <span className="truncate">直属下级：{getDirectChildPreview(units, candidate.id)}</span>
                            <span>数据量：{candidateImpact.directChildren} 个直属下级 · {candidateImpact.totalMembers} 名成员 · {candidateImpact.totalCustomers} 个客户</span>
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
                {visibleMergeCandidates.length === 0 && (
                  <div className="rounded-lg border border-dashed border-surface-300 bg-surface-50 px-4 py-8 text-center text-sm text-surface-400">
                    {mergeTargetQuery ? "没有找到匹配的组织" : "没有可选择的保留组织"}
                  </div>
                )}
              </div>

              {mergeError && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{mergeError}</p>
              )}
            </div>
            <div className="org-access-modal-footer flex items-center justify-end gap-3 border-t border-surface-200 bg-white px-5 py-4">
              <button type="button" className="btn-secondary min-h-9 px-3 py-1.5 text-xs" disabled={mergeSubmitting} onClick={closeMergeDialog}>
                取消
              </button>
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-surface-300"
                disabled={!mergeTargetId || mergeSubmitting}
                onClick={handleMerge}
              >
                {mergeSubmitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : mergeMode === "duplicate"
                    ? <GitMerge className="h-4 w-4" />
                    : <ArrowRightLeft className="h-4 w-4" />}
                {mergeSubmitting
                  ? "正在合并..."
                  : mergeTarget
                    ? `确认合并到「${mergeTarget.name}」`
                    : "请先选择保留组织"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="fixed inset-0 bg-black/45" onClick={() => { setDeleteTarget(null); setDeleteError(""); }} />
          <div className="org-access-modal-shell organization-delete-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white">
            <div className="org-access-modal-header flex items-start gap-3 border-b border-surface-200 bg-white px-5 py-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${deleteImpact?.blocked ? "border-amber-200 bg-amber-50 text-amber-600" : "border-red-200 bg-red-50 text-red-600"}`}>
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-surface-900">{deleteImpact?.blocked ? "暂不能删除组织" : "确认删除组织"}</h3>
                <p className="mt-1 text-sm leading-6 text-surface-600">
                  {deleteImpact?.blocked
                    ? `「${deleteTarget.name}」下仍有下级组织、关联成员或客户数据，不能直接删除。业务调整建议改为停用组织。`
                    : `「${deleteTarget.name}」没有下级组织、关联成员和客户数据，删除后会从组织架构中移除。`}
                </p>
              </div>
            </div>
            <div className="org-access-modal-body min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="min-w-0">
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <MetricTile label="直属下级" value={deleteImpact?.directChildren || 0} />
                  <MetricTile label="全部下级" value={deleteImpact?.descendantOrgs || 0} />
                  <MetricTile label="直属成员" value={deleteImpact?.directMembers || 0} />
                  <MetricTile label="下级成员" value={deleteImpact?.descendantMembers || 0} />
                  <MetricTile label="直属客户" value={deleteImpact?.directCustomers || 0} />
                  <MetricTile label="下级客户" value={deleteImpact?.descendantCustomers || 0} />
                </div>
                {deleteImpact?.blocked && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                    删除只适合录错且没有任何关联数据的组织；已有业务数据时请停用组织，历史客户、成员和统计记录会继续保留。
                  </p>
                )}
                {deleteError && (
                  <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{deleteError}</p>
                )}
                <p className="mt-2 truncate rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
                  组织路径：{getOrgPath(units, deleteTarget.id)}
                </p>
              </div>
            </div>
            <div className="org-access-modal-footer flex items-center justify-end gap-3 border-t border-surface-200 bg-white px-5 py-4">
              <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>取消</button>
              {deleteImpact?.blocked && isOrgActive(deleteTarget) && (
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                  onClick={async () => {
                    const ok = await handleToggleActive(deleteTarget);
                    if (ok) {
                      setDeleteTarget(null);
                      setDeleteError("");
                    }
                  }}
                >
                  <Power className="h-4 w-4" />改为停用
                </button>
              )}
              <button
                className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  deleteImpact?.blocked
                    ? "cursor-not-allowed bg-surface-200 text-surface-500"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
                disabled={deleteImpact?.blocked}
                onClick={confirmDelete}
              >
                <Trash2 className="h-4 w-4" />确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgPage() {
  return <EnhancedOrgPage />;
}
