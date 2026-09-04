"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Edit3, Loader2, Plus, Search, Shield, Trash2, X } from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";

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

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [message, setMessage] = useState("");

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      setRoles(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) => [role.name, role.description, role.code]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q)));
  }, [roles, search]);
  const rolePagination = useDataPagination(filteredRoles, search);

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
                placeholder="搜索角色名称或说明"
              />
            </div>
          </div>
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增角色
          </button>
        </div>
      </section>

      {message && <div className="org-access-notice shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}

      <section className="org-access-panel org-access-list-panel flex min-h-0 flex-1 flex-col overflow-hidden border border-surface-200/90 bg-white/95">
        <ThinScrollArea className="min-h-0 flex-1" scrollClassName="h-full overflow-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-surface-50/85">
              <tr className="border-b border-surface-200 text-xs font-semibold text-surface-500">
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
                  <td colSpan={7} className="px-5 py-16 text-center text-surface-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    <p className="mt-2 text-sm">加载角色中...</p>
                  </td>
                </tr>
              ) : filteredRoles.length > 0 ? rolePagination.pageItems.map((role) => (
                <tr key={role.id} className="transition-colors hover:bg-surface-50/80">
                  <td className="py-3.5 pl-5 pr-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-surface-900">{role.name}</p>
                        {role.description && <p className="mt-0.5 truncate text-xs text-surface-500">{role.description}</p>}
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
                  <td className="whitespace-nowrap py-3.5 pr-5 text-surface-600">{role.user_count || 0}</td>
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
              )) : (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200 bg-surface-50 text-surface-400">
                        <Shield className="h-4 w-4" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-surface-800">暂无角色</p>
                      <p className="mt-1 text-sm text-surface-500">新增角色后，可分配给团队成员。</p>
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

      <RoleModal
        isOpen={showModal}
        role={editingRole}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          fetchRoles();
        }}
      />
    </div>
  );
}

function RoleModal({
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
    const itemKeys = group.children?.length ? group.children.map((item) => item.key) : [group.key];
    const allSelected = itemKeys.every((key) => selectedMenus.has(key));
    const next = allSelected
      ? selectedMenuKeys.filter((key) => !itemKeys.includes(key))
      : Array.from(new Set([...selectedMenuKeys, ...itemKeys]));
    setMenus(next);
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
          <div>
            <h2 className="text-lg font-semibold text-surface-900">{isEdit ? "编辑角色" : "新增角色"}</h2>
            <p className="mt-0.5 text-sm text-surface-500">配置角色名称、状态和可用权限范围。</p>
          </div>
          <button onClick={onClose} className="org-access-icon-button rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600" aria-label="关闭角色编辑">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="org-access-modal-body min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
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
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-surface-700">数据范围</label>
              <SystemSelect value={form.data_scope} onChange={(event) => setForm((prev) => ({ ...prev, data_scope: event.target.value }))} className="input-field" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
                {dataScopeOptions.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
              </SystemSelect>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-surface-700">角色说明</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="input-field min-h-20 resize-y"
              placeholder="简要说明这个角色负责什么"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-surface-700">权限范围</label>
              <span className="text-xs text-surface-400">已选 {selectedMenuKeys.length} 个菜单</span>
            </div>
            <div className="role-menu-permission-list">
              {menuPermissionGroups.map((group) => {
                const hasChildren = Boolean(group.children?.length);
                const childItems = hasChildren ? group.children! : [{ key: group.key, label: group.title, permissions: group.permissions || [] }];
                const checkedCount = childItems.filter((item) => selectedMenus.has(item.key)).length;
                const groupChecked = checkedCount === childItems.length;
                const groupPartial = checkedCount > 0 && !groupChecked;
                return (
                  <section key={group.key} className="role-menu-permission-group" data-has-children={hasChildren ? "true" : "false"}>
                    <button
                      type="button"
                      onClick={() => toggleMenuGroup(group)}
                      className="role-menu-permission-parent"
                      data-selected={groupChecked ? "true" : groupPartial ? "mixed" : "false"}
                    >
                      <span className="role-menu-permission-check">
                        {(groupChecked || groupPartial) && <Check className="h-3 w-3" />}
                      </span>
                      <span className="role-menu-permission-title">{group.title}</span>
                      {hasChildren ? <span className="role-menu-permission-count">{checkedCount}/{childItems.length}</span> : null}
                      {hasChildren ? <ChevronDown className="role-menu-permission-arrow h-3.5 w-3.5" /> : null}
                    </button>
                    {hasChildren ? (
                      <div className="role-menu-permission-children">
                        {group.children!.map((item) => {
                          const checked = selectedMenus.has(item.key);
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => toggleMenu(item.key)}
                              className="role-menu-permission-child"
                              data-selected={checked ? "true" : "false"}
                            >
                              <span className="role-menu-permission-check">
                                {checked && <Check className="h-3 w-3" />}
                              </span>
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>

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
