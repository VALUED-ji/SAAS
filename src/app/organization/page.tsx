"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Building2, Globe, Building, Store, Layers, Users,
  ChevronRight, ChevronDown, Plus, Search, X, Trash2, Loader2, AlertTriangle, Power,
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

import {
  EnhancedOrgNode,
  ManagerPicker,
  MetricTile,
  OrgDetailPanel,
  OrgUnit,
  UserOption,
  buildTree,
  getDeleteImpact,
  getDescendantCount,
  getManagerIds,
  getManagerName,
  getOrgPath,
  isOrgActive,
} from "./organization-components";

function EnhancedOrgPage() {
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof orgTypeFilters)[number]>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState<{ open: boolean; parentId?: string; childType?: string; edit?: OrgUnit }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<OrgUnit | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [formName, setFormName] = useState("");
  const [formManagerIds, setFormManagerIds] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

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
        org_unit_id: user.org_unit_id,
        org_unit_name: user.org_unit_name,
        phone: user.phone,
        is_active: user.is_active,
      }))))
      .catch(() => setUsers([]));
  }, [fetchUnits]);

  useEffect(() => {
    const saved = window.localStorage.getItem("organization-members-visible");
    if (saved === "0") setShowMembers(false);
  }, []);

  const toggleMembers = useCallback(() => {
    setShowMembers((current) => {
      const next = !current;
      window.localStorage.setItem("organization-members-visible", next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    if (!loading && units.length > 0 && (!selectedId || !units.some((unit) => unit.id === selectedId))) {
      setSelectedId(units[0].id);
    }
  }, [loading, selectedId, units]);

  const directMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return units.filter((unit) => {
      const matchesType = typeFilter === "all" || unit.type === typeFilter;
      const searchText = `${unit.name} ${getManagerName(unit)} ${typeMeta[unit.type]?.label || ""} ${getOrgPath(units, unit.id)}`.toLowerCase();
      const matchesQuery = !q || searchText.includes(q);
      return matchesType && matchesQuery;
    });
  }, [searchQuery, typeFilter, units]);

  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim() && typeFilter === "all") return units;
    const ids = new Set<string>();
    const addAncestors = (id: string) => {
      ids.add(id);
      const unit = units.find((item) => item.id === id);
      if (unit?.parent_id) addAncestors(unit.parent_id);
    };
    directMatches.forEach((unit) => addAncestors(unit.id));
    return units.filter((unit) => ids.has(unit.id));
  }, [directMatches, searchQuery, typeFilter, units]);

  useEffect(() => {
    if (searchQuery.trim() || typeFilter !== "all") setExpanded(new Set(filteredUnits.map((unit) => unit.id)));
  }, [filteredUnits, searchQuery, typeFilter]);

  const tree = buildTree(filteredUnits);
  const selectedNode = units.find((unit) => unit.id === selectedId);
  const selectedPath = selectedNode ? getOrgPath(units, selectedNode.id) : "";
  const selectedDescendantCount = selectedNode ? getDescendantCount(units, selectedNode.id) : 0;
  const selectedDirectChildren = selectedNode ? units.filter((unit) => unit.parent_id === selectedNode.id).length : 0;

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

  const handleAdd = async () => {
    if (!formName.trim()) {
      setFormError("请填写组织名称");
      return;
    }
    if (!modal.childType) return;
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), type: modal.childType, parent_id: modal.parentId, manager_ids: formManagerIds }),
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
    if (!formName.trim()) {
      setFormError("请填写组织名称");
      return;
    }
    if (!modal.edit) return;
    try {
      const res = await fetch(`/api/org?id=${modal.edit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), manager_ids: formManagerIds }),
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
            {units.length > 0 && (
              <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => {
                if (expanded.size >= units.length) setExpanded(new Set());
                else setExpanded(new Set(units.map((unit) => unit.id)));
              }}>
                {expanded.size >= units.length ? <><ChevronRight className="h-4 w-4" />全部收起</> : <><ChevronDown className="h-4 w-4" />全部展开</>}
              </button>
            )}
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

      <div className="organization-workspace grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className={`${panelClass} organization-tree-panel flex min-h-0 flex-col overflow-hidden`}>
          <div className={`${panelHeaderClass} flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-surface-900">组织架构</p>
              <p className="mt-0.5 truncate text-xs text-surface-500">
                {selectedNode ? `当前选中：${selectedPath}` : "请选择一个组织"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-surface-500">
              <span className="rounded border border-surface-200 bg-white px-2 py-1">组织数量：{units.length}</span>
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
                />
              ))}
            </div>
          )}
        </section>
        <OrgDetailPanel
          node={selectedNode}
          units={units}
          users={users}
          showMembers={showMembers}
          onToggleMembers={toggleMembers}
          onSelect={setSelectedId}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={openDeleteConfirm}
          onToggleActive={handleToggleActive}
        />
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
              <label className="mt-3 block text-xs font-semibold text-surface-600">管理人员</label>
              <ManagerPicker users={users} value={formManagerIds} onChange={setFormManagerIds} />
              {formError && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{formError}</p>}
            </div>
            <div className="org-access-modal-footer flex items-center justify-end gap-3 border-t border-surface-200 bg-white px-5 py-4">
              <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={closeModal}>取消</button>
              <button className="btn-primary min-h-9 px-3 py-1.5 text-xs" disabled={!formName.trim()} onClick={modal.edit ? handleEdit : handleAdd}>确认保存</button>
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
