// 组织管理页展示组件模块
// 从 page.tsx 渐进拆出的组织树、详情面板与工具函数。

"use client";

import { useMemo, useState } from "react";
import { Building2, Building, ChevronRight, Edit3, Globe, Layers, Plus, Power, Search, Store, Trash2, Users, X } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";
export interface OrgUnit {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  children?: OrgUnit[];
  manager_id?: string | null;
  manager_name?: string;
  manager_user_name?: string;
  manager_ids?: string[];
  manager_names?: string;
  managers?: UserOption[];
  is_active?: number;
  customer_count?: number;
}
export interface UserOption { id: string; name: string; avatar?: string | null; role: string; org_unit_id?: string | null; org_unit_name?: string; phone?: string | null; is_active?: number; }

export const metricTileClass = "org-access-metric rounded-md border border-surface-200 bg-white px-3 py-2";

export function StatusPill({ active, compact = false }: { active: boolean; compact?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full border font-semibold ${
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-surface-300 bg-surface-100 text-surface-600"
      }`}
    >
      {active ? "启用" : "停用"}
    </span>
  );
}

export function MetricTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={metricTileClass}>
      <p className="text-xs font-medium text-surface-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-surface-900">{value}</p>
    </div>
  );
}

export function buildTree(units: OrgUnit[]): OrgUnit[] {
  const map = new Map<string, OrgUnit>();
  units.forEach(u => map.set(u.id, { ...u, children: [] }));
  const roots: OrgUnit[] = [];
  units.forEach(u => {
    const node = map.get(u.id)!;
    if (u.parent_id && map.has(u.parent_id)) map.get(u.parent_id)!.children!.push(node);
    else roots.push(node);
  });
  return roots;
}

export function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return <>{text.slice(0, idx)}<span className="rounded bg-primary-50 px-0.5 text-primary-700">{text.slice(idx, idx + query.length)}</span>{highlightText(text.slice(idx + query.length), query)}</>;
}

export function getManagerName(node: OrgUnit) {
  return node.manager_names || node.manager_user_name || node.manager_name || "";
}

export function getManagerIds(node?: OrgUnit | null) {
  if (!node) return [];
  if (Array.isArray(node.manager_ids) && node.manager_ids.length) return node.manager_ids.filter(Boolean);
  if (Array.isArray(node.managers) && node.managers.length) return node.managers.map((manager) => manager.id).filter(Boolean);
  return node.manager_id ? [node.manager_id] : [];
}

export function getNextOrgType(type: string) {
  const index = orgTypeOrder.indexOf(type);
  if (index < 0 || index >= orgTypeOrder.length - 1) return "";
  return orgTypeOrder[index + 1];
}

export function getOrgPath(units: OrgUnit[], id?: string | null) {
  if (!id) return "";
  const map = new Map(units.map((unit) => [unit.id, unit]));
  const path: string[] = [];
  let cursor = map.get(id);
  while (cursor) {
    path.unshift(cursor.name);
    cursor = cursor.parent_id ? map.get(cursor.parent_id) : undefined;
  }
  return path.join(" / ");
}

export function getDescendantCount(units: OrgUnit[], id: string): number {
  const children = units.filter((unit) => unit.parent_id === id);
  return children.length + children.reduce((sum, child) => sum + getDescendantCount(units, child.id), 0);
}

export function getDescendantIds(units: OrgUnit[], id: string): string[] {
  const children = units.filter((unit) => unit.parent_id === id);
  return children.flatMap((child) => [child.id, ...getDescendantIds(units, child.id)]);
}

export function isOrgActive(node?: OrgUnit | null) {
  return Number(node?.is_active ?? 1) === 1;
}

export function getDeleteImpact(units: OrgUnit[], users: UserOption[], id: string) {
  const descendantIds = getDescendantIds(units, id);
  const descendantIdSet = new Set(descendantIds);
  const target = units.find((unit) => unit.id === id);
  const directChildren = units.filter((unit) => unit.parent_id === id).length;
  const directMembers = users.filter((user) => user.org_unit_id === id).length;
  const descendantMembers = users.filter((user) => user.org_unit_id ? descendantIdSet.has(user.org_unit_id) : false).length;
  const directCustomers = Number(target?.customer_count || 0);
  const descendantCustomers = units
    .filter((unit) => descendantIdSet.has(unit.id))
    .reduce((sum, unit) => sum + Number(unit.customer_count || 0), 0);

  return {
    directChildren,
    descendantOrgs: descendantIds.length,
    directMembers,
    descendantMembers,
    totalMembers: directMembers + descendantMembers,
    directCustomers,
    descendantCustomers,
    totalCustomers: directCustomers + descendantCustomers,
    blocked: descendantIds.length > 0 || directMembers + descendantMembers > 0 || directCustomers + descendantCustomers > 0,
  };
}

export function getRoleLabel(role: string) {
  return roleLabels[role] || role || "未设置角色";
}

export function getAvatarText(name: string) {
  return (name || "?").trim().slice(0, 1) || "?";
}

export function EmployeeAvatar({ user, className }: { user: UserOption; className: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
      {user.avatar ? <NativeImage src={user.avatar} alt={`${user.name || "员工"}头像`} className="h-full w-full object-cover" /> : getAvatarText(user.name)}
    </span>
  );
}

export function EnhancedOrgNode({ node, depth, expanded, selectedId, onSelect, onToggle, searchQuery, onAdd, onEdit, onDelete }: {
  node: OrgUnit;
  depth: number;
  expanded: Set<string>;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  searchQuery: string;
  onAdd: (p: string, t: string) => void;
  onEdit: (n: OrgUnit) => void;
  onDelete: (node: OrgUnit) => void;
}) {
  const meta = typeMeta[node.type] || typeMeta.team;
  const Icon = meta.icon;
  const hasChildren = (node.children?.length || 0) > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const nextType = getNextOrgType(node.type);
  const managerName = getManagerName(node);
  const active = isOrgActive(node);

  return (
    <div className="org-tree-node">
      <div
        onClick={() => onSelect(node.id)}
        className={`group relative grid min-h-[56px] cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-surface-200/70 px-3 py-2.5 transition-colors ${
          isSelected ? "bg-primary-50/80" : active ? "bg-white hover:bg-surface-50" : "bg-surface-50/80 hover:bg-surface-100/70"
        }`}
        style={{ paddingLeft: `${14 + depth * 26}px` }}
      >
        {isSelected && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-primary-600" />}
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggle(node.id); }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-surface-400 transition hover:bg-white hover:text-surface-700"
          aria-label={hasChildren ? (isOpen ? "收起组织" : "展开组织") : "无下级组织"}
        >
          {hasChildren ? (
            <ChevronRight className={`h-4 w-4 transition-transform duration-300 ease-out ${isOpen ? "rotate-90" : "rotate-0"}`} />
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${meta.color}`}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-surface-900">
              {searchQuery ? highlightText(node.name, searchQuery) : node.name}
            </span>
            <span className="shrink-0 rounded border border-surface-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-surface-600">{meta.label}</span>
            {!active && <StatusPill active={false} compact />}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-surface-500">
            <span className="truncate">管理人员：{managerName || "未设置"}</span>
            <span className="shrink-0">下级：{node.children?.length || 0}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {nextType && active && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onAdd(node.id, nextType); }}
              className="rounded-md border border-transparent px-2 py-1.5 text-xs font-semibold text-primary-700 transition hover:border-primary-100 hover:bg-white"
            >
              + {typeMeta[nextType]?.label}
            </button>
          )}
          {nextType && !active && (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-md px-2 py-1.5 text-xs font-semibold text-surface-400"
              title="组织已停用，不能新增下级"
            >
              + {typeMeta[nextType]?.label}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onEdit(node); }}
            className={`${iconButtonClass} hover:text-primary-700`}
            aria-label="编辑组织"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onDelete(node); }}
            className={`${iconButtonClass} hover:bg-red-50 hover:text-red-600`}
            aria-label="删除组织"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {hasChildren && (
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity] ease-out ${
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
          } ${isOpen ? "duration-300" : "duration-500"}`}
          aria-hidden={!isOpen}
        >
          <div className="min-h-0">
            {node.children!.map((child) => (
              <EnhancedOrgNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggle={onToggle}
                searchQuery={searchQuery}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ManagerPicker({ users, value, onChange }: {
  users: UserOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const availableUsers = useMemo(() => users.filter((user) => Number(user.is_active ?? 1) === 1), [users]);
  const selectedUsers = value
    .map((id) => availableUsers.find((user) => user.id === id))
    .filter(Boolean) as UserOption[];
  const selectedIdSet = new Set(value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    const matched = normalizedQuery
      ? availableUsers.filter((user) => {
          const searchText = `${user.name} ${user.phone || ""} ${user.org_unit_name || ""} ${getRoleLabel(user.role)}`.toLowerCase();
          return searchText.includes(normalizedQuery);
        })
      : availableUsers;
    return matched.slice(0, 30);
  }, [availableUsers, normalizedQuery]);

  const toggleUser = (userId: string) => {
    if (selectedIdSet.has(userId)) {
      onChange(value.filter((id) => id !== userId));
      return;
    }
    onChange([...value, userId]);
  };

  const promoteUser = (userId: string) => {
    onChange([userId, ...value.filter((id) => id !== userId)]);
  };

  return (
    <div className="org-manager-picker mt-1 overflow-hidden rounded-md border border-surface-200 bg-white">
      <div className={`border-b border-surface-100 px-3 py-2.5 ${selectedUsers.length ? "bg-primary-50/60" : "bg-surface-50"}`}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-surface-600">已选管理人员</p>
          {selectedUsers.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-semibold text-primary-700 hover:text-primary-800"
            >
              清空
            </button>
          )}
        </div>
        {selectedUsers.length === 0 ? (
          <p className="rounded-md border border-dashed border-surface-300 bg-white px-3 py-2 text-xs leading-5 text-surface-500">
            可添加多名管理人员，第一位将作为主负责人，用于兼容旧报表和默认显示。
          </p>
        ) : (
          <div className="space-y-2">
            {selectedUsers.map((user, index) => (
              <div key={user.id} className="flex items-center gap-3 rounded-md border border-primary-100 bg-white px-3 py-2">
                <EmployeeAvatar user={user} className="h-8 w-8 rounded-[11px] bg-primary-100 text-sm font-semibold text-primary-700 ring-1 ring-primary-100" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-surface-900">{user.name}</span>
                    {index === 0 && <span className="shrink-0 rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">主负责人</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-surface-500">
                    {getRoleLabel(user.role)}{user.org_unit_name ? ` · ${user.org_unit_name}` : ""}{user.phone ? ` · ${user.phone}` : ""}
                  </span>
                </span>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => promoteUser(user.id)}
                    className="shrink-0 rounded-md border border-surface-200 bg-white px-2 py-1 text-xs font-semibold text-surface-600 hover:border-primary-200 hover:text-primary-700"
                  >
                    设为主负责人
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleUser(user.id)}
                  className="shrink-0 rounded-md border border-surface-200 bg-white px-2 py-1 text-xs font-semibold text-surface-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="relative px-3 py-2.5">
        <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="input-field h-10 w-full pl-9 pr-9"
          placeholder="搜索姓名、手机号、角色或所属组织后添加"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
            aria-label="清除管理人员搜索"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="max-h-60 overflow-y-auto border-t border-surface-100">
        {filteredUsers.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-surface-400">没有找到匹配员工</div>
        ) : (
          filteredUsers.map((user) => {
            const selected = selectedIdSet.has(user.id);
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => toggleUser(user.id)}
                className={`flex w-full items-center gap-3 border-t border-surface-100 px-3 py-2.5 text-left transition hover:bg-surface-50 ${selected ? "bg-primary-50/70" : "bg-white"}`}
              >
                <EmployeeAvatar
                  user={user}
                  className={`h-8 w-8 rounded-[11px] text-sm font-semibold ${selected ? "bg-primary-100 text-primary-700 ring-1 ring-primary-100" : "bg-surface-100 text-surface-600 ring-1 ring-surface-200"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-surface-900">{user.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-surface-500">
                    {getRoleLabel(user.role)}{user.org_unit_name ? ` · ${user.org_unit_name}` : ""}{user.phone ? ` · ${user.phone}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${
                  selected
                    ? "border-primary-100 bg-white text-primary-700"
                    : "border-surface-200 bg-white text-surface-600"
                }`}>
                  {selected ? "已添加" : "添加"}
                </span>
              </button>
            );
          })
        )}
      </div>
      {availableUsers.length > filteredUsers.length && (
        <div className="border-t border-surface-100 bg-surface-50 px-3 py-2 text-xs text-surface-500">
          当前显示 {filteredUsers.length} 位，可继续输入关键词缩小范围
        </div>
      )}
    </div>
  );
}

export function OrgDetailPanel({ node, units, users, showMembers, onToggleMembers, onSelect, onAdd, onEdit, onDelete, onToggleActive }: {
  node?: OrgUnit;
  units: OrgUnit[];
  users: UserOption[];
  showMembers: boolean;
  onToggleMembers: () => void;
  onSelect: (id: string) => void;
  onAdd: (parentId: string, childType: string) => void;
  onEdit: (node: OrgUnit) => void;
  onDelete: (node: OrgUnit) => void;
  onToggleActive: (node: OrgUnit) => void;
}) {
  if (!node) {
    return (
      <aside className={`${panelClass} organization-detail-panel min-h-0 overflow-y-auto p-6`}>
        <div className="flex min-h-[280px] flex-col items-center justify-center text-center text-surface-400">
          <Building2 className="mb-3 h-10 w-10 text-surface-300" />
          <p className="text-sm font-medium text-surface-600">请选择一个组织</p>
          <p className="mt-1 text-xs">选择左侧组织后，这里会显示完整信息。</p>
        </div>
      </aside>
    );
  }

  const meta = typeMeta[node.type] || typeMeta.team;
  const Icon = meta.icon;
  const managerName = getManagerName(node);
  const parent = node.parent_id ? units.find((unit) => unit.id === node.parent_id) : null;
  const children = units.filter((unit) => unit.parent_id === node.id);
  const descendantCount = getDescendantCount(units, node.id);
  const descendantIds = new Set(getDescendantIds(units, node.id));
  const directMembers = users.filter((user) => user.org_unit_id === node.id);
  const descendantMembers = users.filter((user) => user.org_unit_id ? descendantIds.has(user.org_unit_id) : false);
  const nextType = getNextOrgType(node.type);
  const active = isOrgActive(node);
  const directCustomers = Number(node.customer_count || 0);
  const descendantCustomers = units
    .filter((unit) => descendantIds.has(unit.id))
    .reduce((sum, unit) => sum + Number(unit.customer_count || 0), 0);

  return (
    <aside className={`${panelClass} organization-detail-panel min-h-0 overflow-y-auto`}>
      <div className={panelHeaderClass}>
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${meta.color}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-semibold text-surface-900">{node.name}</h3>
              <span className="shrink-0 rounded border border-surface-200 bg-white px-2 py-0.5 text-xs font-medium text-surface-600">{meta.label}</span>
              <StatusPill active={active} compact />
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-surface-500">{getOrgPath(units, node.id)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MetricTile label="直属下级" value={children.length} />
          <MetricTile label="全部下级" value={descendantCount} />
          <MetricTile label="直属客户" value={directCustomers} />
          <MetricTile label="下级客户" value={descendantCustomers} />
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-surface-500">管理人员</p>
            <p className="mt-1 truncate font-medium text-surface-900">{managerName || "未设置"}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-surface-500">上级组织</p>
            <p className="mt-1 truncate font-medium text-surface-900">{parent?.name || "顶级组织"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-surface-500">组织类型</p>
            <p className="mt-1 font-medium text-surface-900">{meta.label}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-surface-500">可新增下级</p>
            <p className="mt-1 font-medium text-surface-900">{active ? (nextType ? typeMeta[nextType]?.label : "无") : "组织已停用"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-surface-500">组织状态</p>
            <p className={`mt-1 font-medium ${active ? "text-emerald-700" : "text-amber-700"}`}>{active ? "启用中" : "已停用，仅保留历史数据"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-y border-surface-200 py-3">
          {nextType && active && (
            <button type="button" onClick={() => onAdd(node.id, nextType)} className="btn-primary min-h-9 px-3 py-1.5 text-xs">
              <Plus className="h-4 w-4" />新增下级
            </button>
          )}
          {nextType && !active && (
            <button type="button" disabled className="inline-flex min-h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-surface-200 bg-surface-100 px-3 py-1.5 text-xs font-semibold text-surface-400">
              <Plus className="h-4 w-4" />新增下级
            </button>
          )}
          <button type="button" onClick={() => onEdit(node)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <Edit3 className="h-4 w-4" />编辑组织
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(node)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "border border-amber-100 bg-amber-50 text-amber-700 hover:border-amber-200 hover:bg-amber-100"
                : "border border-primary-100 bg-primary-50 text-primary-700 hover:border-primary-200 hover:bg-primary-100"
            }`}
          >
            <Power className="h-4 w-4" />{active ? "停用组织" : "启用组织"}
          </button>
          <button type="button" onClick={() => onDelete(node)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-200 hover:bg-red-100">
            <Trash2 className="h-4 w-4" />删除组织
          </button>
          <button type="button" onClick={onToggleMembers} className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-600 transition hover:border-surface-300 hover:text-surface-900">
            {showMembers ? "隐藏成员概览" : "显示成员概览"}
          </button>
        </div>

        {showMembers && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-surface-900">成员概览</p>
              <span className="text-xs text-surface-500">直属 {directMembers.length} 人</span>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <MetricTile label="直属成员" value={directMembers.length} />
              <MetricTile label="下级组织成员" value={descendantMembers.length} />
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-surface-900">下级组织</p>
            <span className="text-xs text-surface-500">{children.length} 个</span>
          </div>
          {children.length === 0 ? (
            <div className="rounded-lg border border-dashed border-surface-300 bg-surface-50 px-4 py-8 text-center text-sm text-surface-400">
              暂无下级组织
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-surface-200">
              {children.map((child) => {
                const childMeta = typeMeta[child.type] || typeMeta.team;
                const ChildIcon = childMeta.icon;
                const childActive = isOrgActive(child);
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => onSelect(child.id)}
                    className="flex w-full items-center gap-3 border-b border-surface-200/70 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-surface-50"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${childMeta.color}`}>
                      <ChildIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-surface-900">{child.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-surface-500">
                        {childMeta.label} · 管理人员：{getManagerName(child) || "未设置"} · 下级：{units.filter((unit) => unit.parent_id === child.id).length}
                      </span>
                    </span>
                    {!childActive && <StatusPill active={false} compact />}
                    <ChevronRight className="h-4 w-4 shrink-0 text-surface-300" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}


export const typeMeta: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  group: { label: "集团", icon: Building2, color: "text-surface-800 bg-surface-100 ring-1 ring-surface-200" },
  region: { label: "大区", icon: Globe, color: "text-primary-700 bg-primary-50 ring-1 ring-primary-100" },
  company: { label: "公司", icon: Building, color: "text-accent-700 bg-accent-50 ring-1 ring-accent-100" },
  store: { label: "门店", icon: Store, color: "text-amber-700 bg-amber-50 ring-1 ring-amber-100" },
  dept: { label: "部门", icon: Layers, color: "text-primary-700 bg-primary-50 ring-1 ring-primary-100" },
  team: { label: "小组", icon: Users, color: "text-surface-700 bg-surface-100 ring-1 ring-surface-200" },
};

export const orgTypeOrder = ["group", "region", "company", "store", "dept", "team"];
export const orgTypeFilters = ["all", ...orgTypeOrder] as const;

export const roleLabels: Record<string, string> = {
  OWNER: "老板",
  ADMIN: "管理员",
  PM: "项目经理",
  DESIGNER: "设计师",
  FINANCE: "财务",
  SALES: "销售/跟单",
};

export const panelClass = "org-access-panel border border-surface-200 bg-white shadow-none";
export const panelHeaderClass = "org-access-panel-header border-b border-surface-200 bg-white px-4 py-3";
export const iconButtonClass = "org-access-icon-button flex h-8 w-8 items-center justify-center rounded-md text-surface-500 transition hover:bg-surface-100 hover:text-surface-900";
