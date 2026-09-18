"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, Check, ChevronDown, Edit3, Loader2, Minus, Phone, Plus, Search, Trash2, Users, X } from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";

type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  data_scope: string | null;
  is_system: number;
  is_active: number;
  user_count: number;
};

type RoleEmployee = {
  id: string;
  name: string;
  phone: string;
  avatar?: string | null;
  employee_no: string | null;
  org_unit_name: string | null;
  is_active: number;
};

type RoleMemberLookup = {
  id: string;
  name: string;
  phone: string;
  employee_no: string | null;
  role: string;
};

type BatchPermissionResult = {
  updated_role_count: number;
  added_permission_count: number;
  skipped_permission_count: number;
};

type RoleOrgOverrideItem = {
  org_unit_id: string;
  name: string;
  path: string;
  is_active: number;
  has_override: boolean;
  add_permissions: string[];
  remove_permissions: string[];
  data_scope: string | null;
  updated_at: string | null;
};

type MenuPermissionItem = {
  key: string;
  label: string;
  permissions: string[];
};

type MenuPermissionGroup = {
  key: string;
  title: string;
  permissions?: string[];
  children?: MenuPermissionItem[];
};

const menuPermissionGroups: MenuPermissionGroup[] = [
  { key: "group_dashboard", title: "集团总览", permissions: ["dashboard.view"] },
  { key: "dashboard", title: "经营总览", permissions: ["dashboard.view"] },
  { key: "todos", title: "待办中心", permissions: ["dashboard.view", "customers.view", "quotations.manage"] },
  { key: "customers", title: "客户管理", permissions: ["customers.view", "customers.create", "customers.edit", "customers.import_export", "customers.assign"] },
  { key: "quotations", title: "报价合同", permissions: ["quotations.manage"] },
  { key: "site", title: "工地管理", permissions: ["customers.view", "quotations.manage", "materials.manage", "finance.view"] },
  {
    key: "finance",
    title: "财务中心",
    children: [
      { key: "finance_owner_receipts", label: "业主收款", permissions: ["finance.view"] },
      { key: "finance_labor_settlement", label: "人工结算", permissions: ["finance.view"] },
    ],
  },
  {
    key: "quota",
    title: "定额管理",
    children: [
      { key: "quota_library", label: "基装定额", permissions: ["quotations.manage", "settings.manage"] },
      { key: "quota_templates", label: "预算模版", permissions: ["quotations.manage", "settings.manage"] },
      { key: "quota_personalized_templates", label: "个性化模板", permissions: ["quotations.manage", "settings.manage"] },
    ],
  },
  {
    key: "orders",
    title: "订单管理",
    children: [
      { key: "orders_auxiliary", label: "辅材订单", permissions: ["materials.manage"] },
    ],
  },
  {
    key: "materials",
    title: "材料管理",
    children: [
      { key: "materials_library", label: "辅材管理", permissions: ["materials.manage"] },
      { key: "materials_products", label: "主材产品", permissions: ["materials.manage"] },
      { key: "materials_inbound", label: "采购入库", permissions: ["materials.manage"] },
      { key: "materials_inventory", label: "库存管理", permissions: ["materials.manage"] },
    ],
  },
  {
    key: "suppliers",
    title: "供应商管理",
    children: [
      { key: "suppliers_info", label: "供应商信息", permissions: ["materials.manage"] },
    ],
  },
  {
    key: "organization",
    title: "组织权限",
    children: [
      { key: "organization_manage", label: "组织管理", permissions: ["organization.manage"] },
      { key: "team_manage", label: "团队管理", permissions: ["team.view", "team.manage"] },
      { key: "role_manage", label: "角色管理", permissions: ["roles.manage"] },
    ],
  },
  { key: "branch_settings", title: "分公司设置", permissions: ["organization.manage", "settings.manage"] },
  {
    key: "settings",
    title: "系统设置",
    children: [
      { key: "material_categories", label: "材料分类", permissions: ["settings.manage", "materials.manage"] },
      { key: "work_types", label: "工种设置", permissions: ["settings.manage", "quotations.manage"] },
      { key: "logs", label: "操作日志", permissions: ["logs.view"] },
    ],
  },
];

const menuPermissionItems = menuPermissionGroups.flatMap((group) => (
  group.children?.length ? group.children : [{ key: group.key, label: group.title, permissions: group.permissions || [] }]
));
const menuPermissionKeys = new Set(menuPermissionItems.map((item) => item.key));

const allMenuPermissions = Array.from(new Set(menuPermissionItems.flatMap((item) => item.permissions)));
const menuPermissionMarkerPrefix = "menu.";

function getMenuPermissionMarker(menuKey: string) {
  return `${menuPermissionMarkerPrefix}${menuKey}`;
}

function expandMenuPermissions(menuKeys: string[]) {
  const selectedKeys = new Set(menuKeys);
  const permissions = menuPermissionItems
    .filter((item) => selectedKeys.has(item.key))
    .flatMap((item) => item.permissions);
  const markers = menuKeys.map(getMenuPermissionMarker);
  return Array.from(new Set([...permissions, ...markers]));
}

function getMenuPermissionGroupItems(group: MenuPermissionGroup): MenuPermissionItem[] {
  return group.children?.length
    ? group.children
    : [{ key: group.key, label: group.title, permissions: group.permissions || [] }];
}

function getMenuKeysFromPermissions(permissions: string[]) {
  const markerKeys = permissions
    .filter((permission) => permission.startsWith(menuPermissionMarkerPrefix))
    .map((permission) => permission.slice(menuPermissionMarkerPrefix.length))
    .filter((key) => menuPermissionKeys.has(key));
  if (markerKeys.length > 0) return Array.from(new Set(markerKeys));

  const selectedPermissions = new Set(permissions);
  const legacyMenuKeys: string[] = [];
  if (selectedPermissions.has("dashboard.view")) legacyMenuKeys.push("dashboard");
  if (["customers.view", "customers.create", "customers.edit", "customers.import_export", "customers.assign"].some((permission) => selectedPermissions.has(permission))) {
    legacyMenuKeys.push("customers");
  }
  if (selectedPermissions.has("quotations.manage")) legacyMenuKeys.push("quotations");
  if (selectedPermissions.has("materials.manage")) legacyMenuKeys.push("materials_library");
  if (selectedPermissions.has("finance.view")) legacyMenuKeys.push("finance_owner_receipts");
  if (selectedPermissions.has("organization.manage")) legacyMenuKeys.push("organization_manage");
  if (selectedPermissions.has("team.view") || selectedPermissions.has("team.manage")) legacyMenuKeys.push("team_manage");
  if (selectedPermissions.has("roles.manage")) legacyMenuKeys.push("role_manage");
  if (selectedPermissions.has("settings.manage")) legacyMenuKeys.push("material_categories");
  if (selectedPermissions.has("logs.view")) legacyMenuKeys.push("logs");
  return Array.from(new Set(legacyMenuKeys));
}

const dataScopeOptions = [
  { value: "self", label: "仅自己" },
  { value: "team", label: "本小组" },
  { value: "dept", label: "本部门" },
  { value: "store", label: "本门店" },
  { value: "company", label: "本分公司" },
  { value: "region", label: "本大区" },
  { value: "group", label: "全集团" },
];

const dataScopeLabels = dataScopeOptions.reduce<Record<string, string>>((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

const emptyForm = {
  id: "",
  name: "",
  description: "",
  permissions: [] as string[],
  data_scope: "self",
  is_active: "1",
};

type RoleIconKind = "owner" | "admin" | "pm" | "designer" | "finance" | "sales" | "advisor" | "custom";

function getRoleIconKind(role: Role): RoleIconKind {
  const text = `${role.code || ""} ${role.name || ""}`.toUpperCase();
  if (text.includes("OWNER") || text.includes("老板")) return "owner";
  if (text.includes("ADMIN") || text.includes("管理员")) return "admin";
  if (text.includes("PM") || text.includes("项目经理")) return "pm";
  if (text.includes("DESIGNER") || text.includes("设计师")) return "designer";
  if (text.includes("FINANCE") || text.includes("财务")) return "finance";
  if (text.includes("SALES") || text.includes("销售") || text.includes("跟单")) return "sales";
  if (text.includes("顾问")) return "advisor";
  return "custom";
}

function RoleIcon({ role }: { role: Role }) {
  const kind = getRoleIconKind(role);
  return (
    <span className={`role-icon-badge role-icon-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        {kind === "owner" && (
          <>
            <path d="M4.5 9.2 7.4 12l4.5-6 4.7 6 2.9-2.8v8.1a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7V9.2Z" />
            <path d="M7.2 15.2h9.6" />
          </>
        )}
        {kind === "admin" && (
          <>
            <path d="M12 3.8 18 6v5.1c0 3.8-2.4 7.2-6 8.4-3.6-1.2-6-4.6-6-8.4V6l6-2.2Z" />
            <path d="M9.8 12.2h4.4" />
            <path d="M12 10v4.4" />
          </>
        )}
        {kind === "pm" && (
          <>
            <path d="M6.8 10.6v-1A5.2 5.2 0 0 1 12 4.4a5.2 5.2 0 0 1 5.2 5.2v1" />
            <path d="M4.8 10.6h14.4" />
            <path d="M7 10.6l.9 7.1a1.8 1.8 0 0 0 1.8 1.5h4.6a1.8 1.8 0 0 0 1.8-1.5l.9-7.1" />
            <path d="M9.6 7.2v3.4M14.4 7.2v3.4" />
          </>
        )}
        {kind === "designer" && (
          <>
            <path d="M5.4 18.6 7 13.8l7.6-7.6a2 2 0 0 1 2.8 2.8L9.8 16.6l-4.4 2Z" />
            <path d="m13.3 7.5 3.2 3.2" />
            <path d="M13.8 18.4h4.8" />
          </>
        )}
        {kind === "finance" && (
          <>
            <path d="M6.4 4.8h11.2v14.4l-2-1.2-1.8 1.2-1.8-1.2-1.8 1.2-1.8-1.2-2 1.2V4.8Z" />
            <path d="M9.2 8.2h5.6M9.2 11.6h5.6" />
            <path d="M12 7v8" />
            <path d="M10.2 14.4h3.6" />
          </>
        )}
        {kind === "sales" && (
          <>
            <path d="M7.2 13.2H6a2 2 0 0 1-2-2v-.8a8 8 0 0 1 16 0v.8a2 2 0 0 1-2 2h-1.2" />
            <path d="M7.2 10.2v4.6a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 14.8v-4.6" />
            <path d="M16.8 10.2v4.6a1.4 1.4 0 0 0 1.4 1.4h.4a1.4 1.4 0 0 0 1.4-1.4v-4.6" />
            <path d="M14.8 17.8h-2.1a2.1 2.1 0 0 1-2.1-2.1" />
          </>
        )}
        {kind === "advisor" && (
          <>
            <path d="M4.8 11.2 12 5.1l7.2 6.1" />
            <path d="M6.7 10v8.2h10.6V10" />
            <path d="M9.3 14.4c.7-1.6 2.2-1.6 2.7-.4.5-1.2 2-1.2 2.7.4-.4 1.8-2.7 3-2.7 3s-2.3-1.2-2.7-3Z" />
          </>
        )}
        {kind === "custom" && (
          <>
            <path d="M7 5.6h10a1.4 1.4 0 0 1 1.4 1.4v10a1.4 1.4 0 0 1-1.4 1.4H7A1.4 1.4 0 0 1 5.6 17V7A1.4 1.4 0 0 1 7 5.6Z" />
            <path d="M9 9h6M9 12h6M9 15h3.5" />
          </>
        )}
      </svg>
    </span>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [employeeRole, setEmployeeRole] = useState<Role | null>(null);
  const [roleEmployees, setRoleEmployees] = useState<RoleEmployee[]>([]);
  const [roleEmployeesLoading, setRoleEmployeesLoading] = useState(false);
  const [roleEmployeesError, setRoleEmployeesError] = useState("");
  const [roleMembers, setRoleMembers] = useState<RoleMemberLookup[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [showBatchPermissionModal, setShowBatchPermissionModal] = useState(false);
  const [batchNotice, setBatchNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [message, setMessage] = useState("");

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const [rolesResponse, teamResponse] = await Promise.all([
        fetch("/api/roles"),
        fetch("/api/team").catch(() => null),
      ]);
      const rolesData = await rolesResponse.json().catch(() => []);
      if (!rolesResponse.ok) throw new Error(rolesData?.message || "加载角色失败");
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      if (teamResponse?.ok) {
        const teamData = await teamResponse.json().catch(() => []);
        setRoleMembers(
          (Array.isArray(teamData) ? teamData : []).map((user) => ({
            id: user.id,
            name: user.name || "",
            phone: user.phone || "",
            employee_no: user.employee_no || null,
            role: user.role || "",
          })),
        );
      } else {
        setRoleMembers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (!batchNotice) return;
    const timer = window.setTimeout(() => setBatchNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [batchNotice]);

  useEffect(() => {
    const validIds = new Set(roles.map((role) => role.id));
    setSelectedRoleIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [roles]);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) => (
      [role.name, role.description, role.code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
      || roleMembers.some((member) => (
        member.role === role.code
        && [member.name, member.phone, member.employee_no]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      ))
    ));
  }, [roleMembers, roles, search]);
  const rolePagination = useDataPagination(filteredRoles, search);
  const selectedRoles = useMemo(
    () => roles.filter((role) => selectedRoleIds.has(role.id)),
    [roles, selectedRoleIds],
  );
  const pageRoleIds = rolePagination.pageItems.map((role) => role.id);
  const allPageRolesSelected = pageRoleIds.length > 0 && pageRoleIds.every((id) => selectedRoleIds.has(id));
  const roleMemberMap = useMemo(() => {
    const map = new Map<string, RoleMemberLookup[]>();
    roleMembers.forEach((member) => {
      const members = map.get(member.role) || [];
      members.push(member);
      map.set(member.role, members);
    });
    return map;
  }, [roleMembers]);

  const openCreate = () => {
    setEditingRole(null);
    setShowModal(true);
    setMessage("");
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setShowModal(true);
    setMessage("");
  };

  const toggleRoleSelection = (roleId: string) => {
    setSelectedRoleIds((current) => {
      const next = new Set(current);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
    setBatchNotice(null);
  };

  const toggleAllPageRoles = () => {
    setSelectedRoleIds((current) => {
      const next = new Set(current);
      if (allPageRolesSelected) pageRoleIds.forEach((id) => next.delete(id));
      else pageRoleIds.forEach((id) => next.add(id));
      return next;
    });
    setBatchNotice(null);
  };

  const openRoleEmployees = async (role: Role) => {
    setEmployeeRole(role);
    setRoleEmployees([]);
    setRoleEmployeesError("");
    setRoleEmployeesLoading(true);
    try {
      const response = await fetch("/api/team");
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data?.message || "加载角色员工失败");
      setRoleEmployees(
        (Array.isArray(data) ? data : [])
          .filter((user) => user.role === role.code)
          .map((user) => ({
            id: user.id,
            name: user.name || "",
            phone: user.phone || "",
            avatar: user.avatar || null,
            employee_no: user.employee_no || null,
            org_unit_name: user.org_unit_name || null,
            is_active: Number(user.is_active ?? 1),
          })),
      );
    } catch (error: any) {
      setRoleEmployeesError(error?.message || "加载角色员工失败");
    } finally {
      setRoleEmployeesLoading(false);
    }
  };

  const handleDelete = async (role: Role) => {
    setMessage("");
    if (!window.confirm(`确定删除「${role.name}」吗？`)) return;
    const res = await fetch(`/api/roles?id=${encodeURIComponent(role.id)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || "删除失败");
      return;
    }
    fetchRoles();
  };

  return (
    <div className="app-page-surface admin-config-ui org-permissions-ui roles-console-ui -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className="org-access-panel org-access-toolbar shrink-0 border border-surface-200/90 bg-white/95 px-3 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input-field w-full pl-9"
                placeholder="搜索角色名称、说明或员工姓名"
              />
            </div>
          </div>
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增角色
          </button>
        </div>
        {selectedRoleIds.size > 0 && (
          <div className="role-batch-action-bar">
            <span>已选择 {selectedRoleIds.size} 个角色</span>
            <div>
              <button type="button" className="btn-secondary h-9 min-h-9 px-3 text-xs" onClick={() => setSelectedRoleIds(new Set())}>
                取消选择
              </button>
              <button type="button" className="btn-primary h-9 min-h-9 px-3 text-xs" onClick={() => setShowBatchPermissionModal(true)}>
                批量增加权限
              </button>
            </div>
          </div>
        )}
      </section>

      {message && <div className="org-access-notice shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
      {batchNotice && (
        <div className={`org-access-notice shrink-0 rounded-lg border px-4 py-3 text-sm ${
          batchNotice.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {batchNotice.text}
        </div>
      )}

      <section className="org-access-panel org-access-list-panel flex min-h-0 flex-1 flex-col overflow-hidden border border-surface-200/90 bg-white/95">
        <ThinScrollArea className="min-h-0 flex-1" scrollClassName="h-full overflow-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-surface-50/85">
              <tr className="border-b border-surface-200 text-xs font-semibold text-surface-500">
                <th className="w-12 py-3 pl-5 pr-2">
                  <input
                    type="checkbox"
                    checked={allPageRolesSelected}
                    onChange={toggleAllPageRoles}
                    aria-label="选择当前页全部角色"
                  />
                </th>
                <th className="py-3 pl-5 pr-5">角色</th>
                <th className="py-3 pr-5">类型</th>
                <th className="py-3 pr-5">菜单数量</th>
                <th className="py-3 pr-5">数据范围</th>
                <th className="py-3 pr-5">员工数量</th>
                <th className="py-3 pr-5">状态</th>
                <th className="py-3 pr-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-surface-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    <p className="mt-2 text-sm">加载角色中...</p>
                  </td>
                </tr>
              ) : filteredRoles.length > 0 ? rolePagination.pageItems.map((role) => {
                const keyword = search.trim().toLowerCase();
                const matchedMembers = keyword
                  ? (roleMemberMap.get(role.code) || []).filter((member) => (
                    [member.name, member.phone, member.employee_no]
                      .filter(Boolean)
                      .some((value) => String(value).toLowerCase().includes(keyword))
                  ))
                  : [];
                return (
                <tr key={role.id} className="transition-colors hover:bg-surface-50/80">
                  <td className="py-3.5 pl-5 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.has(role.id)}
                      onChange={() => toggleRoleSelection(role.id)}
                      aria-label={`选择角色${role.name}`}
                    />
                  </td>
                  <td className="py-3.5 pl-5 pr-5">
                    <div className="flex items-center gap-3">
                      <RoleIcon role={role} />
                      <div className="min-w-0">
                        <p className="font-semibold text-surface-900">{role.name}</p>
                        {role.description && <p className="mt-0.5 truncate text-xs text-surface-500">{role.description}</p>}
                        {matchedMembers.length > 0 && (
                          <p className="mt-1 truncate text-xs font-medium text-primary-600">
                            匹配员工：{matchedMembers.slice(0, 3).map((member) => member.name).join("、")}
                            {matchedMembers.length > 3 ? ` 等 ${matchedMembers.length} 人` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-3.5 pr-5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      role.is_system ? "bg-surface-100 text-surface-600 ring-surface-200" : "bg-primary-50 text-primary-700 ring-primary-100"
                    }`}>
                      {role.is_system ? "系统内置" : "自定义"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-3.5 pr-5 text-surface-600">{getMenuKeysFromPermissions(role.permissions).length}</td>
                  <td className="whitespace-nowrap py-3.5 pr-5 text-surface-600">{dataScopeLabels[role.data_scope || "self"] || "仅自己"}</td>
                  <td className="whitespace-nowrap py-3.5 pr-5">
                    <button
                      type="button"
                      onClick={() => openRoleEmployees(role)}
                      className="role-employee-count inline-flex min-h-8 min-w-10 items-center justify-center rounded-md border border-primary-100 bg-primary-50 px-2.5 text-xs font-semibold text-primary-700 transition-colors hover:border-primary-200 hover:bg-primary-100"
                      title={`查看${role.name}下的员工`}
                    >
                      {role.user_count || 0}
                    </button>
                  </td>
                  <td className="whitespace-nowrap py-3.5 pr-5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      role.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-surface-100 text-surface-500 ring-surface-200"
                    }`}>
                      {role.is_active ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-3.5 pr-5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(role)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-surface-200 bg-white px-2.5 text-xs font-medium text-surface-600 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        编辑
                      </button>
                      {!role.is_system && (
                        <button
                          type="button"
                          onClick={() => handleDelete(role)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-surface-200 bg-white px-2.5 text-xs font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <span className="mx-auto flex w-max">
                        <span className="role-icon-badge role-icon-custom" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M7 5.6h10a1.4 1.4 0 0 1 1.4 1.4v10a1.4 1.4 0 0 1-1.4 1.4H7A1.4 1.4 0 0 1 5.6 17V7A1.4 1.4 0 0 1 7 5.6Z" />
                            <path d="M9 9h6M9 12h6M9 15h3.5" />
                          </svg>
                        </span>
                      </span>
                      <p className="mt-4 text-sm font-semibold text-surface-800">
                        {search.trim() ? "没有匹配的角色" : "暂无角色"}
                      </p>
                      <p className="mt-1 text-sm text-surface-500">
                        {search.trim() ? "请调整角色名称、说明或员工姓名后重试。" : "新增角色后，可分配给团队成员。"}
                      </p>
                      {search.trim() && (
                        <button
                          type="button"
                          className="mt-4 text-xs font-semibold text-primary-600 hover:text-primary-700"
                          onClick={() => setSearch("")}
                        >
                          清除搜索
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        {!loading && (
          <DataPagination
            total={filteredRoles.length}
            page={rolePagination.page}
            pageSize={rolePagination.pageSize}
            onPageChange={rolePagination.setPage}
            onPageSizeChange={rolePagination.setPageSize}
            itemName="个角色"
          />
        )}
      </section>

      <RoleModalSimple
        isOpen={showModal}
        role={editingRole}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          fetchRoles();
        }}
      />
      <RoleEmployeesModal
        role={employeeRole}
        employees={roleEmployees}
        loading={roleEmployeesLoading}
        error={roleEmployeesError}
        onClose={() => {
          setEmployeeRole(null);
          setRoleEmployees([]);
          setRoleEmployeesError("");
        }}
      />
      <BatchRolePermissionModal
        isOpen={showBatchPermissionModal}
        roles={selectedRoles}
        onClose={() => setShowBatchPermissionModal(false)}
        onSuccess={(result) => {
          setShowBatchPermissionModal(false);
          setSelectedRoleIds(new Set());
          setBatchNotice({
            type: "success",
            text: `已为 ${result.updated_role_count} 个角色新增 ${result.added_permission_count} 项权限${result.skipped_permission_count > 0 ? `，跳过 ${result.skipped_permission_count} 项重复权限` : ""}`,
          });
          fetchRoles();
        }}
      />
    </div>
  );
}

function BatchRolePermissionModal({
  isOpen,
  roles,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  roles: Role[];
  onClose: () => void;
  onSuccess: (result: BatchPermissionResult) => void;
}) {
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPendingKeys(new Set());
    setError("");
    setSubmitting(false);
  }, [isOpen, roles]);

  const rolePermissionSets = useMemo(
    () => roles.map((role) => new Set(getMenuKeysFromPermissions(role.permissions || []))),
    [roles],
  );
  const permissionCoverage = useMemo(() => {
    const coverage = new Map<string, number>();
    menuPermissionItems.forEach((item) => {
      const count = rolePermissionSets.filter((keys) => keys.has(item.key)).length;
      coverage.set(item.key, count);
    });
    return coverage;
  }, [rolePermissionSets]);
  const checkedKeys = useMemo(() => {
    const next = new Set(pendingKeys);
    menuPermissionItems.forEach((item) => {
      if (roles.length > 0 && (permissionCoverage.get(item.key) || 0) === roles.length) {
        next.add(item.key);
      }
    });
    return next;
  }, [pendingKeys, permissionCoverage, roles.length]);
  const partialKeys = useMemo(() => {
    const next = new Set<string>();
    menuPermissionItems.forEach((item) => {
      const count = permissionCoverage.get(item.key) || 0;
      if (count > 0 && count < roles.length && !pendingKeys.has(item.key)) next.add(item.key);
    });
    return next;
  }, [pendingKeys, permissionCoverage, roles.length]);
  const lockedKeys = useMemo(() => {
    const next = new Set<string>();
    menuPermissionItems.forEach((item) => {
      if (roles.length > 0 && (permissionCoverage.get(item.key) || 0) === roles.length) next.add(item.key);
    });
    return next;
  }, [permissionCoverage, roles.length]);

  const toggleItem = (key: string) => {
    if (lockedKeys.has(key)) return;
    setPendingKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setError("");
  };

  const toggleGroup = (group: MenuPermissionGroup) => {
    const itemKeys = getMenuPermissionGroupItems(group).map((item) => item.key);
    const allEffective = itemKeys.every((key) => lockedKeys.has(key) || pendingKeys.has(key));
    setPendingKeys((current) => {
      const next = new Set(current);
      if (allEffective) {
        itemKeys.forEach((key) => {
          if (!lockedKeys.has(key)) next.delete(key);
        });
      } else {
        itemKeys.forEach((key) => {
          if (!lockedKeys.has(key)) next.add(key);
        });
      }
      return next;
    });
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pendingKeys.size === 0) {
      setError("请至少选择一项需要增加的权限");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/roles/batch-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_ids: roles.map((role) => role.id),
          permissions: expandMenuPermissions([...pendingKeys]),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "批量增加权限失败");
      onSuccess({
        updated_role_count: Number(data.updated_role_count || 0),
        added_permission_count: Number(data.added_permission_count || 0),
        skipped_permission_count: Number(data.skipped_permission_count || 0),
      });
    } catch (err: any) {
      setError(err.message || "批量增加权限失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || roles.length === 0) return null;

  return (
    <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4 py-6">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div className="org-access-modal-shell role-batch-permission-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-3xl flex-col overflow-hidden border border-surface-200 bg-white">
        <div className="org-access-modal-header flex items-center justify-between border-b border-surface-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-surface-900">批量增加权限</h2>
            <p className="mt-0.5 truncate text-sm text-surface-500">
              已选择 {roles.length} 个角色：{roles.slice(0, 4).map((role) => role.name).join("、")}
              {roles.length > 4 ? ` 等 ${roles.length} 个角色` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="org-access-icon-button rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600"
            aria-label="关闭批量增加权限"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="org-access-modal-body min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="role-batch-permission-tip">
            <strong>只增加，不删除</strong>
            <span>角色已有权限会保留；已经拥有所选权限的角色会自动跳过。</span>
          </div>

          <RolePermissionTree
            checkedKeys={checkedKeys}
            partialKeys={partialKeys}
            lockedKeys={lockedKeys}
            onToggleItem={toggleItem}
            onToggleGroup={toggleGroup}
            selectedCountLabel={`将新增 ${pendingKeys.size} 项`}
            title="选择要增加的权限"
            description="半选表示仅部分角色已经拥有，勾选后会给缺少该权限的角色增加。"
          />

          {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>}

          <div className="org-access-form-actions flex items-center justify-end gap-3 border-t border-surface-100 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting || pendingKeys.size === 0}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "处理中..." : "确认增加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RolePermissionTree({
  checkedKeys,
  partialKeys = new Set<string>(),
  lockedKeys = new Set<string>(),
  deniedKeys = new Set<string>(),
  addedKeys = new Set<string>(),
  onToggleItem,
  onToggleGroup,
  selectedCountLabel,
  title = "权限范围",
  description = "按模块展开，勾选该角色可访问的菜单。",
}: {
  checkedKeys: Set<string>;
  partialKeys?: Set<string>;
  lockedKeys?: Set<string>;
  deniedKeys?: Set<string>;
  addedKeys?: Set<string>;
  onToggleItem: (key: string) => void;
  onToggleGroup: (group: MenuPermissionGroup) => void;
  selectedCountLabel: string;
  title?: string;
  description?: string;
}) {
  const [expandedMenuGroups, setExpandedMenuGroups] = useState<Set<string>>(() => new Set());
  const [permissionSearch, setPermissionSearch] = useState("");

  const visiblePermissionGroups = useMemo(() => {
    const keyword = permissionSearch.trim().toLowerCase();
    return menuPermissionGroups.flatMap((group) => {
      const items = getMenuPermissionGroupItems(group);
      if (!keyword) return [{ group, items }];
      const groupMatched = group.title.toLowerCase().includes(keyword);
      const matchedItems = groupMatched
        ? items
        : items.filter((item) => item.label.toLowerCase().includes(keyword));
      return matchedItems.length ? [{ group, items: matchedItems }] : [];
    });
  }, [permissionSearch]);

  const allPermissionGroupsExpanded = menuPermissionGroups.every((group) => expandedMenuGroups.has(group.key));

  const toggleExpanded = (groupKey: string) => {
    setExpandedMenuGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const toggleAllGroups = () => {
    setExpandedMenuGroups(
      allPermissionGroupsExpanded
        ? new Set()
        : new Set(menuPermissionGroups.map((group) => group.key)),
    );
  };

  return (
    <div className="role-permission-tree-shell">
      <div className="role-permission-heading">
        <div>
          <label className="text-sm font-semibold text-surface-800">{title}</label>
          <p className="mt-0.5 text-xs text-surface-500">{description}</p>
        </div>
        <span className="role-permission-selected-count">{selectedCountLabel}</span>
      </div>

      <div className="role-permission-tree-toolbar">
        <div className="role-permission-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
          <input
            value={permissionSearch}
            onChange={(event) => setPermissionSearch(event.target.value)}
            className="input-field h-9 min-h-9 w-full py-0 pl-9 text-xs"
            placeholder="搜索权限名称"
          />
        </div>
        <button
          type="button"
          className="role-permission-expand-toggle"
          onClick={toggleAllGroups}
        >
          {allPermissionGroupsExpanded ? "全部收起" : "全部展开"}
        </button>
      </div>

      <div className="role-permission-tree">
        {visiblePermissionGroups.length > 0 ? visiblePermissionGroups.map(({ group, items }) => {
          const checkedCount = items.filter((item) => checkedKeys.has(item.key)).length;
          const deniedCount = items.filter((item) => deniedKeys.has(item.key)).length;
          const hasPartial = items.some((item) => partialKeys.has(item.key));
          const groupChecked = checkedCount === items.length;
          const groupDenied = deniedCount === items.length;
          const groupPartial = !groupChecked && (checkedCount > 0 || hasPartial);
          const groupLocked = items.every((item) => lockedKeys.has(item.key));
          const searching = Boolean(permissionSearch.trim());
          const expanded = searching || expandedMenuGroups.has(group.key);
          return (
            <section key={group.key} className="role-permission-tree-group" data-expanded={expanded ? "true" : "false"}>
              <div className="role-permission-tree-group-row">
                <button
                  type="button"
                  className="role-permission-tree-toggle"
                  onClick={() => toggleExpanded(group.key)}
                  aria-label={expanded ? `收起${group.title}` : `展开${group.title}`}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
                </button>
                <button
                  type="button"
                  className="role-permission-tree-check"
                  data-selected={groupDenied ? "denied" : groupChecked ? "true" : groupPartial ? "mixed" : "false"}
                  onClick={() => onToggleGroup(group)}
                  disabled={groupLocked}
                  aria-label={groupChecked ? `取消全选${group.title}` : `全选${group.title}`}
                >
                  {groupDenied && <Minus className="h-3 w-3" />}
                  {groupChecked && <Check className="h-3 w-3" />}
                  {groupPartial && <span className="role-permission-tree-check-mixed" />}
                </button>
                <button
                  type="button"
                  className="role-permission-tree-group-label"
                  onClick={() => toggleExpanded(group.key)}
                >
                  <span className="truncate">{group.title}</span>
                  <span className="role-permission-tree-group-count">{checkedCount}/{items.length}</span>
                </button>
              </div>
              <div
                className={`role-permission-tree-branch ${expanded ? "is-expanded" : ""}`}
                aria-hidden={!expanded}
              >
                <div className="role-permission-tree-children">
                  {items.map((item) => {
                    const checked = checkedKeys.has(item.key);
                    const partial = partialKeys.has(item.key);
                    const denied = deniedKeys.has(item.key);
                    const added = addedKeys.has(item.key);
                    const locked = lockedKeys.has(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onToggleItem(item.key)}
                        className="role-permission-tree-item"
                        data-selected={denied ? "denied" : checked ? "true" : partial ? "mixed" : "false"}
                        disabled={locked}
                        tabIndex={expanded ? 0 : -1}
                      >
                        <span className="role-permission-tree-check" data-selected={denied ? "denied" : checked ? "true" : partial ? "mixed" : "false"}>
                          {denied && <Minus className="h-3 w-3" />}
                          {checked && <Check className="h-3 w-3" />}
                          {partial && <span className="role-permission-tree-check-mixed" />}
                        </span>
                        <span className="truncate">{item.label}</span>
                        {added && <span className="role-permission-tree-difference" data-kind="added">新增</span>}
                        {denied && !added && <span className="role-permission-tree-difference" data-kind="removed">移除</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        }) : (
          <div className="role-permission-tree-empty">没有匹配的权限</div>
        )}
      </div>
    </div>
  );
}

function RoleModalSimple({
  isOpen,
  role,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  role: Role | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
  const isEdit = Boolean(role);
  const selectedMenus = useMemo(() => new Set(selectedMenuKeys), [selectedMenuKeys]);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setSubmitting(false);
    if (role) {
      const menuKeys = getMenuKeysFromPermissions(role.permissions || []);
      setSelectedMenuKeys(menuKeys);
      setForm({
        id: role.id,
        name: role.name || "",
        description: role.description || "",
        permissions: expandMenuPermissions(menuKeys),
        data_scope: role.data_scope || "self",
        is_active: role.is_active ? "1" : "0",
      });
    } else {
      setSelectedMenuKeys([]);
      setForm(emptyForm);
    }
  }, [isOpen, role]);

  if (!isOpen) return null;

  const setMenus = (menuKeys: string[]) => {
    const normalizedMenuKeys = Array.from(new Set(menuKeys.filter((key) => menuPermissionItems.some((item) => item.key === key))));
    setSelectedMenuKeys(normalizedMenuKeys);
    setForm((prev) => ({ ...prev, permissions: expandMenuPermissions(normalizedMenuKeys) }));
    setError("");
  };

  const toggleMenu = (key: string) => {
    setMenus(selectedMenus.has(key) ? selectedMenuKeys.filter((item) => item !== key) : [...selectedMenuKeys, key]);
  };

  const toggleMenuGroup = (group: MenuPermissionGroup) => {
    const itemKeys = getMenuPermissionGroupItems(group).map((item) => item.key);
    const allSelected = itemKeys.every((key) => selectedMenus.has(key));
    setMenus(allSelected
      ? selectedMenuKeys.filter((key) => !itemKeys.includes(key))
      : Array.from(new Set([...selectedMenuKeys, ...itemKeys])));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/roles", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          permissions: expandMenuPermissions(selectedMenuKeys).filter((permission) => (
            allMenuPermissions.includes(permission) || permission.startsWith(menuPermissionMarkerPrefix)
          )),
          is_active: form.is_active === "1",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "保存失败");
      onSuccess();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4 py-6">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div className="org-access-modal-shell role-editor-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full flex-col overflow-hidden border border-surface-200 bg-white">
        <div className="org-access-modal-header flex items-center justify-between border-b border-surface-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">{isEdit ? "编辑角色" : "新增角色"}</h2>
            <p className="mt-0.5 text-sm text-surface-500">设置角色基础信息和默认权限</p>
          </div>
          <button type="button" onClick={onClose} className="org-access-icon-button rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600" aria-label="关闭角色编辑">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="org-access-modal-body min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="role-editor-form-grid">
            <div>
              <label className="mb-1 block text-sm font-medium text-surface-700">角色名称 <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className="input-field" placeholder="例如：店长" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-surface-700">状态</label>
              <SystemSelect value={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.value }))} className="input-field" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
                <option value="1">启用</option>
                <option value="0">停用</option>
              </SystemSelect>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-surface-700">数据范围</label>
              <SystemSelect value={form.data_scope} onChange={(event) => setForm((prev) => ({ ...prev, data_scope: event.target.value }))} className="input-field" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
                {dataScopeOptions.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
              </SystemSelect>
            </div>
            <div className="role-editor-description">
              <label className="mb-1 block text-sm font-medium text-surface-700">角色说明</label>
              <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} className="input-field min-h-20 resize-y" placeholder="简要说明这个角色负责什么" />
            </div>
          </div>

          <RolePermissionTree
            checkedKeys={selectedMenus}
            onToggleItem={toggleMenu}
            onToggleGroup={toggleMenuGroup}
            selectedCountLabel={`已选 ${selectedMenuKeys.length} 项`}
            title="角色权限"
            description="该角色的所有员工统一使用以下权限。"
          />

          {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>}

          <div className="org-access-form-actions flex items-center justify-end gap-3 border-t border-surface-100 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "保存中..." : "保存角色"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleModalLegacy({
  isOpen,
  role,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  role: Role | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
  const [activeEditorTab, setActiveEditorTab] = useState<"base" | "org" | "org_detail">("base");
  const [orgOverrides, setOrgOverrides] = useState<RoleOrgOverrideItem[]>([]);
  const [selectedOrgOverrideId, setSelectedOrgOverrideId] = useState("");
  const [overrideAddKeys, setOverrideAddKeys] = useState<Set<string>>(new Set());
  const [overrideRemoveKeys, setOverrideRemoveKeys] = useState<Set<string>>(new Set());
  const [overrideCustomEnabled, setOverrideCustomEnabled] = useState(false);
  const [overrideDataScope, setOverrideDataScope] = useState("");
  const [orgOverridesLoading, setOrgOverridesLoading] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const isEdit = Boolean(role);
  const selectedMenus = useMemo(() => new Set(selectedMenuKeys), [selectedMenuKeys]);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setSubmitting(false);
    setActiveEditorTab("base");
    if (role) {
      const menuKeys = getMenuKeysFromPermissions(role.permissions || []);
      setSelectedMenuKeys(menuKeys);
      setForm({
        id: role.id,
        name: role.name || "",
        description: role.description || "",
        permissions: expandMenuPermissions(menuKeys),
        data_scope: role.data_scope || "self",
        is_active: role.is_active ? "1" : "0",
      });
    } else {
      setSelectedMenuKeys([]);
      setForm(emptyForm);
    }
  }, [isOpen, role]);

  const loadOrgOverrides = useCallback(async () => {
    if (!role?.id) {
      setOrgOverrides([]);
      setSelectedOrgOverrideId("");
      return;
    }
    setOrgOverridesLoading(true);
    setOverrideMessage(null);
    try {
      const response = await fetch(`/api/roles/${encodeURIComponent(role.id)}/org-overrides`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "加载分公司权限失败");
      const items = Array.isArray(data.items) ? data.items : [];
      setOrgOverrides(items);
      setSelectedOrgOverrideId((current) => {
        if (items.some((item: RoleOrgOverrideItem) => item.org_unit_id === current)) return current;
        return items.find((item: RoleOrgOverrideItem) => item.has_override)?.org_unit_id || items[0]?.org_unit_id || "";
      });
    } catch (err: any) {
      setOverrideMessage({ type: "error", text: err.message || "加载分公司权限失败" });
    } finally {
      setOrgOverridesLoading(false);
    }
  }, [role?.id]);

  useEffect(() => {
    if (!isOpen || !role?.id) {
      setOrgOverrides([]);
      setSelectedOrgOverrideId("");
      setOverrideMessage(null);
      return;
    }
    void loadOrgOverrides();
  }, [isOpen, loadOrgOverrides, role?.id]);

  useEffect(() => {
    const item = orgOverrides.find((override) => override.org_unit_id === selectedOrgOverrideId);
    if (!item) {
      setOverrideAddKeys(new Set());
      setOverrideRemoveKeys(new Set());
      setOverrideCustomEnabled(false);
      setOverrideDataScope("");
      return;
    }
    setOverrideAddKeys(new Set(getMenuKeysFromPermissions(item.add_permissions || [])));
    setOverrideRemoveKeys(new Set(getMenuKeysFromPermissions(item.remove_permissions || [])));
    setOverrideCustomEnabled(Boolean(item.has_override || item.data_scope));
    setOverrideDataScope(item.data_scope || "");
  }, [orgOverrides, selectedOrgOverrideId]);

  if (!isOpen) return null;

  const setMenus = (menuKeys: string[]) => {
    const normalizedMenuKeys = Array.from(new Set(menuKeys.filter((key) => menuPermissionItems.some((item) => item.key === key))));
    setSelectedMenuKeys(normalizedMenuKeys);
    setForm((prev) => ({
      ...prev,
      permissions: expandMenuPermissions(normalizedMenuKeys),
    }));
    setError("");
  };

  const toggleMenu = (key: string) => {
    const next = selectedMenus.has(key)
      ? selectedMenuKeys.filter((item) => item !== key)
      : [...selectedMenuKeys, key];
    setMenus(next);
  };

  const toggleMenuGroup = (group: MenuPermissionGroup) => {
    const itemKeys = getMenuPermissionGroupItems(group).map((item) => item.key);
    const allSelected = itemKeys.every((key) => selectedMenus.has(key));
    const next = allSelected
      ? selectedMenuKeys.filter((key) => !itemKeys.includes(key))
      : Array.from(new Set([...selectedMenuKeys, ...itemKeys]));
    setMenus(next);
  };

  const selectedOrgOverride = orgOverrides.find((item) => item.org_unit_id === selectedOrgOverrideId) || null;
  const overrideEffectiveKeys = new Set(selectedMenuKeys);
  overrideRemoveKeys.forEach((key) => overrideEffectiveKeys.delete(key));
  overrideAddKeys.forEach((key) => overrideEffectiveKeys.add(key));
  const overrideAddedKeys = new Set(Array.from(overrideEffectiveKeys).filter((key) => !selectedMenus.has(key)));
  const overrideRemovedKeys = new Set(Array.from(selectedMenus).filter((key) => !overrideEffectiveKeys.has(key)));

  const toggleOverrideItem = (key: string) => {
    const enabled = overrideEffectiveKeys.has(key);
    setOverrideAddKeys((current) => {
      const next = new Set(current);
      if (enabled) {
        next.delete(key);
      } else if (!selectedMenus.has(key)) {
        next.add(key);
      }
      return next;
    });
    setOverrideRemoveKeys((current) => {
      const next = new Set(current);
      if (enabled) {
        if (selectedMenus.has(key)) next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    setOverrideMessage(null);
  };

  const setOverrideGroupEnabled = (group: MenuPermissionGroup, enabled: boolean) => {
    const itemKeys = getMenuPermissionGroupItems(group).map((item) => item.key);
    setOverrideAddKeys((current) => {
      const next = new Set(current);
      itemKeys.forEach((key) => {
        if (enabled && !selectedMenus.has(key)) next.add(key);
        if (!enabled) next.delete(key);
      });
      return next;
    });
    setOverrideRemoveKeys((current) => {
      const next = new Set(current);
      itemKeys.forEach((key) => {
        if (enabled) next.delete(key);
        if (!enabled && selectedMenus.has(key)) next.add(key);
      });
      return next;
    });
    setOverrideMessage(null);
  };

  const toggleOverrideGroup = (group: MenuPermissionGroup) => {
    const itemKeys = getMenuPermissionGroupItems(group).map((item) => item.key);
    const allEnabled = itemKeys.every((key) => overrideEffectiveKeys.has(key));
    setOverrideGroupEnabled(group, !allEnabled);
  };

  const handleOverrideSourceChange = (custom: boolean) => {
    setOverrideCustomEnabled(custom);
    if (!custom) {
      setOverrideAddKeys(new Set());
      setOverrideRemoveKeys(new Set());
      setOverrideDataScope("");
    }
    setOverrideMessage(null);
  };

  const handleSaveOrgOverride = async () => {
    if (!role || !selectedOrgOverrideId) return;
    setOverrideSaving(true);
    setOverrideMessage(null);
    try {
      const response = await fetch(`/api/roles/${encodeURIComponent(role.id)}/org-overrides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_unit_id: selectedOrgOverrideId,
          add_permissions: overrideCustomEnabled ? expandMenuPermissions([...overrideAddKeys]) : [],
          remove_permissions: overrideCustomEnabled ? expandMenuPermissions([...overrideRemoveKeys]) : [],
          data_scope: overrideCustomEnabled ? overrideDataScope || null : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "保存分公司权限失败");
      await loadOrgOverrides();
      setOverrideMessage({ type: "success", text: data.inherited ? "已恢复基础权限继承" : "该分公司权限已保存" });
    } catch (err: any) {
      setOverrideMessage({ type: "error", text: err.message || "保存分公司权限失败" });
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleResetOrgOverride = async () => {
    if (!role || !selectedOrgOverrideId) return;
    if (!window.confirm(`确定让「${selectedOrgOverride?.name || "该分公司"}」恢复继承基础权限吗？`)) return;
    setOverrideSaving(true);
    setOverrideMessage(null);
    try {
      const response = await fetch(
        `/api/roles/${encodeURIComponent(role.id)}/org-overrides?org_unit_id=${encodeURIComponent(selectedOrgOverrideId)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "恢复继承失败");
      await loadOrgOverrides();
      setOverrideMessage({ type: "success", text: "已恢复基础权限继承" });
    } catch (err: any) {
      setOverrideMessage({ type: "error", text: err.message || "恢复继承失败" });
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/roles", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          permissions: expandMenuPermissions(selectedMenuKeys).filter((permission) => (
            allMenuPermissions.includes(permission) || permission.startsWith(menuPermissionMarkerPrefix)
          )),
          is_active: form.is_active === "1",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "保存失败");
      onSuccess();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4 py-6">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div className="org-access-modal-shell role-editor-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-4xl flex-col overflow-hidden border border-surface-200 bg-white">
        <div className="org-access-modal-header flex items-center justify-between border-b border-surface-200 px-6 py-4">
          <div className="role-editor-modal-titlebar">
            {activeEditorTab === "org_detail" && (
              <button
                type="button"
                className="role-editor-back-button"
                onClick={() => {
                  setActiveEditorTab("org");
                  setOverrideMessage(null);
                }}
                aria-label="返回分公司列表"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-surface-900">
                {activeEditorTab === "org_detail" ? "设置分公司权限" : isEdit ? "编辑角色" : "新增角色"}
              </h2>
              <p className="mt-0.5 truncate text-sm text-surface-500">
                {activeEditorTab === "org_detail" && selectedOrgOverride
                  ? `${selectedOrgOverride.name} · ${selectedOrgOverride.path}`
                  : "设置角色基础信息和权限"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="org-access-icon-button rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600" aria-label="关闭角色编辑">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="org-access-modal-body min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {activeEditorTab !== "org_detail" && (
            <>
              <div className="role-editor-form-grid">
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-700">角色名称 <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className="input-field" placeholder="例如：店长" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-700">状态</label>
                  <SystemSelect value={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.value }))} className="input-field" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
                    <option value="1">启用</option>
                    <option value="0">停用</option>
                  </SystemSelect>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-700">数据范围</label>
                  <SystemSelect value={form.data_scope} onChange={(event) => setForm((prev) => ({ ...prev, data_scope: event.target.value }))} className="input-field" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
                    {dataScopeOptions.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
                  </SystemSelect>
                </div>
                <div className="role-editor-description">
                  <label className="mb-1 block text-sm font-medium text-surface-700">角色说明</label>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    className="input-field min-h-20 resize-y"
                    placeholder="简要说明这个角色负责什么"
                  />
                </div>
              </div>

              <div className="role-editor-tabs" role="tablist" aria-label="角色权限设置">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeEditorTab === "base"}
                  data-active={activeEditorTab === "base" ? "true" : "false"}
                  onClick={() => setActiveEditorTab("base")}
                >
                  <strong>角色默认权限</strong>
                  <span className="role-editor-tab-count">{selectedMenuKeys.length} 项</span>
                </button>
                {isEdit && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeEditorTab === "org"}
                    data-active={activeEditorTab === "org" ? "true" : "false"}
                    onClick={() => setActiveEditorTab("org")}
                  >
                    <strong>分公司权限</strong>
                    <span className="role-editor-tab-count">
                      {orgOverrides.filter((item) => item.has_override).length} 家
                    </span>
                  </button>
                )}
              </div>

              {activeEditorTab === "base" && (
                <RolePermissionTree
                  checkedKeys={selectedMenus}
                  onToggleItem={toggleMenu}
                  onToggleGroup={toggleMenuGroup}
                  selectedCountLabel={`已选 ${selectedMenuKeys.length} 项`}
                  title="角色基础权限"
                  description="分公司未单独设置时，默认使用以下基础权限。"
                />
              )}
            </>
          )}

          {isEdit && activeEditorTab === "org" && (
            <section className="role-org-overrides-panel">
              <div className="role-org-overrides-heading">
                <div>
                  <label>分公司权限</label>
                  <p>只给权限不同的分公司单独设置，其他分公司自动继承角色默认权限。</p>
                </div>
                <div className="role-org-overrides-summary">
                  <span>已单独设置 <strong>{orgOverrides.filter((item) => item.has_override).length}</strong> 家</span>
                </div>
              </div>

              {orgOverridesLoading ? (
                <div className="grid min-h-40 place-items-center text-surface-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : orgOverrides.length === 0 ? (
                <div className="grid min-h-32 place-items-center text-sm text-surface-400">
                  暂无分公司，请先在组织管理中创建公司节点。
                </div>
              ) : (
                <div className="role-org-overrides-stack">
                  <div className="role-org-overrides-list-heading">
                    <span>分公司列表</span>
                    <small>{orgOverrides.length} 家</small>
                  </div>
                  {orgOverrides.map((item) => {
                    return (
                      <section key={item.org_unit_id} className="role-org-overrides-item">
                        <button
                          type="button"
                          className="role-org-overrides-item-summary"
                          onClick={() => {
                            setSelectedOrgOverrideId(item.org_unit_id);
                            setActiveEditorTab("org_detail");
                            setOverrideMessage(null);
                          }}
                        >
                          <span className="role-org-overrides-option-main">
                            <span className="role-org-overrides-option-icon" aria-hidden="true">
                              <Building2 className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <strong>{item.name}</strong>
                              <small title={item.path}>{item.path}</small>
                            </span>
                          </span>
                          <span className="role-org-override-status" data-custom={item.has_override ? "true" : "false"}>
                            <span className="role-org-override-status-dot" aria-hidden="true" />
                            {item.has_override ? "单独设置" : "继承默认"}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-surface-400" />
                        </button>
                      </section>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {isEdit && activeEditorTab === "org_detail" && selectedOrgOverride && (
            <section className="role-org-detail-panel">
              <div className="role-org-detail-summary">
                <div className="role-org-overrides-option-main">
                  <span className="role-org-overrides-option-icon" aria-hidden="true">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <strong>{selectedOrgOverride.name}</strong>
                    <small title={selectedOrgOverride.path}>{selectedOrgOverride.path}</small>
                  </span>
                </div>
                <span className="role-org-override-status" data-custom={selectedOrgOverride.has_override ? "true" : "false"}>
                  <span className="role-org-override-status-dot" aria-hidden="true" />
                  {selectedOrgOverride.has_override ? "单独设置" : "继承默认"}
                </span>
              </div>

              <div className="role-org-overrides-source">
                <button
                  type="button"
                  data-active={!overrideCustomEnabled ? "true" : "false"}
                  onClick={() => handleOverrideSourceChange(false)}
                >
                  <span className="role-org-overrides-source-check" aria-hidden="true">
                    {!overrideCustomEnabled && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="role-org-overrides-source-copy">
                    <strong>继承基础权限</strong>
                    <small>跟随角色默认权限自动同步</small>
                  </span>
                </button>
                <button
                  type="button"
                  data-active={overrideCustomEnabled ? "true" : "false"}
                  onClick={() => handleOverrideSourceChange(true)}
                >
                  <span className="role-org-overrides-source-check" aria-hidden="true">
                    {overrideCustomEnabled && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="role-org-overrides-source-copy">
                    <strong>单独设置</strong>
                    <small>为该分公司设置不同的权限</small>
                  </span>
                </button>
              </div>

              {!overrideCustomEnabled ? (
                <div className="role-org-overrides-simple-note">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>该分公司将使用角色默认权限，无需单独维护。</span>
                </div>
              ) : (
                <>
                  <div className="role-org-overrides-config-row">
                    <div className="role-org-overrides-scope">
                      <label>数据范围</label>
                      <SystemSelect
                        value={overrideDataScope}
                        onChange={(event) => {
                          setOverrideDataScope(event.target.value);
                          setOverrideMessage(null);
                        }}
                        className="input-field h-9 min-h-9 py-0"
                        menuClassName="org-access-select-menu"
                        optionClassName="org-access-select-option"
                      >
                        <option value="">继承基础</option>
                        {dataScopeOptions.map((scope) => (
                          <option key={scope.value} value={scope.value}>{scope.label}</option>
                        ))}
                      </SystemSelect>
                    </div>
                    <div className="role-org-overrides-diff-summary">
                      <span>最终可用 <strong>{overrideEffectiveKeys.size}</strong> 项</span>
                      <span data-tone="added">新增 <strong>{overrideAddedKeys.size}</strong> 项</span>
                      <span data-tone="removed">移除 <strong>{overrideRemovedKeys.size}</strong> 项</span>
                    </div>
                  </div>

                  <RolePermissionTree
                    checkedKeys={overrideEffectiveKeys}
                    deniedKeys={overrideRemovedKeys}
                    addedKeys={overrideAddedKeys}
                    onToggleItem={toggleOverrideItem}
                    onToggleGroup={toggleOverrideGroup}
                    selectedCountLabel={`${overrideEffectiveKeys.size} 项可用`}
                    title="单独设置的权限"
                    description="勾选该分公司可以使用的权限。"
                  />
                </>
              )}

              {overrideMessage && (
                <div className={`rounded-lg px-3 py-2 text-xs ${
                  overrideMessage.type === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600"
                }`}>
                  {overrideMessage.text}
                </div>
              )}
            </section>
          )}

          {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>}

          <div className="org-access-form-actions flex items-center justify-between gap-3 border-t border-surface-100 pt-4">
            {activeEditorTab === "org_detail" ? (
              <>
                <button type="button" className="btn-secondary" onClick={() => setActiveEditorTab("org")}>
                  返回分公司列表
                </button>
                <div className="flex items-center gap-3">
                  {overrideCustomEnabled && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={overrideSaving}
                      onClick={handleResetOrgOverride}
                    >
                      恢复基础权限
                    </button>
                  )}
                  <button type="button" className="btn-primary" disabled={overrideSaving} onClick={handleSaveOrgOverride}>
                    {overrideSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {overrideSaving ? "保存中..." : "保存设置"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span />
                <div className="flex items-center gap-3">
                  <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? "保存中..." : "保存角色"}
                  </button>
                </div>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleEmployeesModal({
  role,
  employees,
  loading,
  error,
  onClose,
}: {
  role: Role | null;
  employees: RoleEmployee[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [role?.id]);

  const filteredEmployees = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return employees;
    return employees.filter((employee) => (
      [employee.name, employee.phone, employee.employee_no, employee.org_unit_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    ));
  }, [employees, query]);

  if (!role) return null;

  return (
    <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div className="org-access-modal-shell role-employees-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-4xl flex-col overflow-hidden border border-surface-200 bg-white">
        <div className="org-access-modal-header flex shrink-0 items-center justify-between border-b border-surface-200 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <RoleIcon role={role} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-surface-900">{role.name}员工</h2>
              <p className="mt-0.5 text-sm text-surface-500">
                {loading ? "正在加载员工..." : `共 ${employees.length} 位员工`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="org-access-icon-button rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600"
            aria-label="关闭角色员工列表"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="org-access-modal-body flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
          {!loading && !error && (
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="input-field w-full pl-9"
                placeholder="搜索员工姓名、手机号、工号或所属组织"
              />
            </div>
          )}

          {loading ? (
            <div className="flex min-h-72 flex-1 items-center justify-center text-surface-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              加载员工中...
            </div>
          ) : error ? (
            <div className="flex min-h-72 flex-1 items-center justify-center rounded-lg border border-red-100 bg-red-50 px-5 text-sm text-red-600">
              {error}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="flex min-h-72 flex-1 flex-col items-center justify-center text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-200 bg-surface-50 text-surface-400">
                <Users className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-semibold text-surface-800">
                {employees.length === 0 ? "该角色暂无员工" : "没有匹配的员工"}
              </p>
              <p className="mt-1 text-sm text-surface-500">
                {employees.length === 0 ? "员工分配该角色后会显示在这里。" : "请调整搜索条件后重试。"}
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-surface-200">
              <table className="min-w-[720px] w-full table-fixed text-left text-sm">
                <thead className="sticky top-0 z-10 bg-surface-50/95">
                  <tr className="border-b border-surface-200 text-xs font-semibold text-surface-500">
                    <th className="w-[180px] py-3 pl-4 pr-4">员工</th>
                    <th className="py-3 pr-4">所属组织</th>
                    <th className="w-[150px] py-3 pr-4">手机号</th>
                    <th className="w-[130px] py-3 pr-4">工号</th>
                    <th className="w-[100px] py-3 pr-4">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-surface-50/70">
                      <td className="py-3 pl-4 pr-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
                            {employee.avatar ? (
                              <NativeImage src={employee.avatar} alt={`${employee.name || "员工"}头像`} className="h-full w-full object-cover" />
                            ) : (
                              employee.name?.[0] || "员"
                            )}
                          </span>
                          <span className="truncate font-semibold text-surface-900">{employee.name || "-"}</span>
                        </div>
                      </td>
                      <td className="truncate pr-4 text-surface-600">
                        {employee.org_unit_name ? (
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-surface-400" />
                            <span className="truncate">{employee.org_unit_name}</span>
                          </span>
                        ) : "未分配"}
                      </td>
                      <td className="whitespace-nowrap pr-4 text-surface-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-surface-400" />
                          {employee.phone || "-"}
                        </span>
                      </td>
                      <td className="truncate pr-4 text-surface-600">{employee.employee_no || "-"}</td>
                      <td className="whitespace-nowrap pr-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          employee.is_active
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                            : "bg-surface-100 text-surface-500 ring-surface-200"
                        }`}>
                          {employee.is_active ? "在职" : "停用"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
