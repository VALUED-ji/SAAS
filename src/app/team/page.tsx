"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Calendar, Download, Edit3, Loader2, Lock, Phone, Plus, RotateCcw, Search, ShieldCheck, Upload, User, Users, X } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { TeamData, useTeam } from "@/lib/queries";
import { formatDate, formatDateTime } from "@/lib/utils";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import SystemDateInput from "@/components/ui/SystemDateInput";

const defaultRoleLabels: Record<string, string> = {
  OWNER: "老板",
  ADMIN: "管理员",
  PM: "项目经理",
  DESIGNER: "设计师",
  FINANCE: "财务",
  SALES: "销售/跟单",
};


import {
  OrgOption,
  OrgUnit,
  RoleOption,
  buildOrgOptions,
  defaultRoleOptions,
  employeeImportHeaders,
  isOrgActive,
} from "./team-shared";
import {
  Field,
  OrgUnitPicker,
  downloadCsv,
  downloadEmployeeXlsxTemplate,
  mapEmployeeImportRowToPayload,
  parseCsv,
  parseExcelTable,
  parseXlsx,
  validateEmployeeImportRows,
} from "./team-import-tools";

function isUserOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const seenTime = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenTime)) return false;
  return Date.now() - seenTime <= 15 * 60 * 1000;
}

function formatLoginTime(value: string | null): string {
  return value ? formatDateTime(value) : "从未登录";
}

function parseQuotationAccessOrgUnitIds(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export default function TeamPage() {
  const { data: team, isLoading, refetch } = useTeam();
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>(defaultRoleOptions);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamData | null>(null);

  useEffect(() => {
    fetch("/api/org").then((res) => res.json()).then((data) => setOrgUnits(data || [])).catch(() => setOrgUnits([]));
    fetch("/api/roles")
      .then((res) => res.json())
      .then((data) => {
        const activeRoles = (Array.isArray(data) ? data : [])
          .filter((role) => role.is_active)
          .map((role) => ({ value: role.code, label: role.name, description: role.description }));
        setRoleOptions(activeRoles.length ? activeRoles : defaultRoleOptions);
      })
      .catch(() => setRoleOptions(defaultRoleOptions));
  }, []);

  const members = useMemo(() => team ?? [], [team]);
  const orgOptions = useMemo(() => buildOrgOptions(orgUnits), [orgUnits]);
  const activeOrgOptions = useMemo(() => orgOptions.filter((option) => isOrgActive(option)), [orgOptions]);
  const orgOptionById = useMemo(() => new Map(orgOptions.map((option) => [option.id, option])), [orgOptions]);
  const roleLabelMap = useMemo(() => {
    const map: Record<string, string> = { ...defaultRoleLabels };
    roleOptions.forEach((role) => {
      map[role.value] = role.label;
    });
    return map;
  }, [roleOptions]);
  const filteredMembers = members.filter((member) => {
    if (roleFilter && member.role !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const orgPath = member.org_unit_id ? orgOptionById.get(member.org_unit_id)?.path : "";
    return [member.name, member.phone, member.employee_no, member.org_unit_name, orgPath, roleLabelMap[member.role]]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
  const memberPagination = useDataPagination(filteredMembers, [search, roleFilter].join("|"));

  const handleExportEmployees = () => {
    const headers = ["员工姓名", "手机号", "角色", "所属组织", "在线状态", "最近登录", "工号", "入职日期", "在职状态", "在施项目", "备注"];
    const rows = filteredMembers.map((member) => {
      const memberOrg = member.org_unit_id ? orgOptionById.get(member.org_unit_id) : null;
      return [
        member.name || "",
        member.phone || "",
        roleLabelMap[member.role] || member.role || "",
        memberOrg?.path || member.org_unit_name || "未分配",
        isUserOnline(member.last_seen_at) ? "在线" : "离线",
        formatLoginTime(member.last_login_at),
        member.employee_no || "",
        member.hire_date ? formatDate(member.hire_date) : "",
        member.is_active ? "在职" : "停用",
        member.project_count || 0,
        member.notes || "",
      ];
    });
    downloadCsv(`员工导出_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  if (isLoading) {
    return (
      <div className="admin-config-ui -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] items-center justify-center bg-[#F5F7FB] text-[#6B7280] lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载中...
      </div>
    );
  }

  return (
    <div className="app-page-surface admin-config-ui org-permissions-ui team-console-ui -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className="org-access-panel org-access-toolbar team-list-toolbar shrink-0 border border-surface-200/90 bg-white/95 px-3 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <div className="team-search-control relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input-field w-full pl-9"
                placeholder="搜索姓名、手机号、工号或组织"
              />
            </div>
          </div>
          <div className="org-access-toolbar-actions flex flex-wrap items-center gap-2.5">
            <SystemSelect value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="input-field team-role-filter min-h-10 w-36 py-2" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
              <option value="">全部角色</option>
              {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </SystemSelect>
            <button className="btn-secondary" onClick={() => setShowImportModal(true)}>
              <Upload className="h-4 w-4" />
              导入员工
            </button>
            <button className="btn-secondary" onClick={handleExportEmployees}>
              <Download className="h-4 w-4" />
              导出员工
            </button>
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4" />
              新增员工
            </button>
          </div>
        </div>
      </section>

      <section className="org-access-panel org-access-list-panel team-list-panel flex min-h-0 flex-1 flex-col overflow-hidden border border-surface-200/90 bg-white/95">
        <ThinScrollArea className="min-h-0 flex-1" scrollClassName="h-full overflow-auto">
          <table className="team-list-table w-full min-w-[1500px] table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[210px]" />
              <col className="w-[120px]" />
              <col className="w-[390px]" />
              <col className="w-[100px]" />
              <col className="w-[150px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[140px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-50/85">
              <tr className="border-b border-surface-200 text-xs font-semibold text-surface-500">
                <th className="pl-5 pr-4">员工</th>
                <th className="pr-4">角色</th>
                <th className="pr-4">所属组织</th>
                <th className="pr-4">在线状态</th>
                <th className="pr-4">最近登录</th>
                <th className="pr-4">工号</th>
                <th className="pr-4">入职日期</th>
                <th className="pr-4">状态</th>
                <th className="pr-4">在施项目</th>
                <th className="pr-4">备注</th>
                <th className="px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {memberPagination.pageItems.map((member) => {
                const memberOrg = member.org_unit_id ? orgOptionById.get(member.org_unit_id) : null;
                const orgPath = memberOrg?.path || member.org_unit_name || "";
                const online = isUserOnline(member.last_seen_at);
                return (
                  <tr key={member.id} className="transition-colors hover:bg-surface-50/80">
                    <td className="pl-5 pr-4">
                      <div className="team-employee-cell flex min-w-0 items-center gap-3">
                        <div className="team-employee-avatar flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EDF4FF] text-sm font-bold text-[#407AFF] ring-1 ring-[#cfe0ff]">
                          {member.avatar ? (
                            <NativeImage src={member.avatar} alt={`${member.name || "员工"}头像`} className="h-full w-full object-cover" />
                          ) : (
                            member.name?.[0] || "员"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-surface-900">{member.name}</p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-surface-500">
                            <Phone className="h-3 w-3" />
                            {member.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap pr-4 text-surface-700">{roleLabelMap[member.role] || member.role}</td>
                    <td className="pr-4 text-surface-600">
                      {member.org_unit_name ? (
                        <div>
                          <p className="flex min-w-0 items-center gap-2 font-semibold text-surface-900">
                            <span className="truncate">{member.org_unit_name}</span>
                            {memberOrg && !isOrgActive(memberOrg) && (
                              <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">已停用</span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-surface-500" title={orgPath}>{orgPath}</p>
                        </div>
                      ) : (
                        <span className="text-surface-400">未分配</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap pr-4">
                      <span className={`team-presence-tag inline-flex items-center gap-1.5 rounded-[8px] px-2 text-xs font-medium ${
                        online ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-surface-100 text-surface-500 ring-1 ring-surface-200"
                      }`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        {online ? "在线" : "离线"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap pr-4 text-surface-700">{formatLoginTime(member.last_login_at)}</td>
                    <td className="whitespace-nowrap pr-4 text-surface-700">{member.employee_no || <span className="text-surface-400">-</span>}</td>
                    <td className="whitespace-nowrap pr-4 text-surface-700">{member.hire_date ? formatDate(member.hire_date) : <span className="text-surface-400">-</span>}</td>
                    <td className="whitespace-nowrap pr-4">
                      <StatusBadge status={member.is_active ? "active" : "vacation"} label={member.is_active ? "在职" : "停用"} />
                    </td>
                    <td className="whitespace-nowrap pr-4 text-surface-700">{member.project_count || 0}</td>
                    <td className="truncate pr-4 text-surface-700" title={member.notes || ""}>{member.notes || <span className="text-surface-400">-</span>}</td>
                    <td className="whitespace-nowrap px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setEditingMember(member)}
                        className="team-row-action inline-flex h-8 items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50 px-2.5 text-xs font-semibold text-primary-700 transition-colors hover:border-primary-200 hover:bg-primary-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        编辑
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200 bg-surface-50 text-surface-400">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-surface-800">暂无员工</p>
                      <p className="mt-1 text-sm text-surface-500">新增员工后，这里会显示真实团队档案。</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination
          total={filteredMembers.length}
          page={memberPagination.page}
          pageSize={memberPagination.pageSize}
          onPageChange={memberPagination.setPage}
          onPageSizeChange={memberPagination.setPageSize}
          itemName="位员工"
        />
      </section>

      <AddEmployeeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => refetch()}
        orgUnits={orgUnits}
        roleOptions={roleOptions}
      />
      <AddEmployeeModal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        onSuccess={() => refetch()}
        orgUnits={orgUnits}
        roleOptions={roleOptions}
        member={editingMember}
      />
      <ImportEmployeesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => refetch()}
        orgOptions={activeOrgOptions}
        roleOptions={roleOptions}
        existingPhones={members.map((member) => member.phone)}
      />
    </div>
  );
}

function AddEmployeeModal({
  isOpen,
  onClose,
  onSuccess,
  orgUnits,
  roleOptions,
  member,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orgUnits: OrgUnit[];
  roleOptions: RoleOption[];
  member?: TeamData | null;
}) {
  const isEdit = Boolean(member);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    role: "SALES",
    org_unit_id: "",
    employee_no: "",
    hire_date: "",
    is_active: "1",
    notes: "",
    avatar: "",
    quotation_access_org_unit_ids: [] as string[],
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [quotationAccessPickerValue, setQuotationAccessPickerValue] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const orgOptions = useMemo(() => buildOrgOptions(orgUnits), [orgUnits]);
  const activeOrgOptions = useMemo(() => orgOptions.filter((option) => isOrgActive(option)), [orgOptions]);
  const orgOptionById = useMemo(() => new Map(orgOptions.map((option) => [option.id, option])), [orgOptions]);
  const selectedQuotationAccessOptions = form.quotation_access_org_unit_ids
    .map((id) => orgOptionById.get(id))
    .filter((option): option is OrgOption => Boolean(option));

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setSubmitting(false);
    setAvatarUploading(false);
    if (member) {
      setForm({
        name: member.name || "",
        phone: member.phone || "",
        password: "",
        role: member.role || roleOptions[0]?.value || "SALES",
        org_unit_id: member.org_unit_id || "",
        employee_no: member.employee_no || "",
        hire_date: member.hire_date ? String(member.hire_date).slice(0, 10) : "",
        is_active: member.is_active ? "1" : "0",
        notes: member.notes || "",
        avatar: member.avatar || "",
        quotation_access_org_unit_ids: parseQuotationAccessOrgUnitIds(member.quotation_access_org_unit_ids),
      });
      setQuotationAccessPickerValue("");
      return;
    }
    setForm({ name: "", phone: "", password: "", role: roleOptions.find((role) => role.value === "SALES")?.value || roleOptions[0]?.value || "SALES", org_unit_id: "", employee_no: "", hire_date: "", is_active: "1", notes: "", avatar: "", quotation_access_org_unit_ids: [] });
    setQuotationAccessPickerValue("");
  }, [isOpen, member, roleOptions]);

  if (!isOpen) return null;

  const set = (key: keyof typeof form, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const addQuotationAccessOrgUnit = () => {
    if (!quotationAccessPickerValue) return;
    setForm((prev) => ({
      ...prev,
      quotation_access_org_unit_ids: Array.from(new Set([...prev.quotation_access_org_unit_ids, quotationAccessPickerValue])),
    }));
    setQuotationAccessPickerValue("");
    setError("");
  };

  const removeQuotationAccessOrgUnit = (id: string) => {
    setForm((prev) => ({
      ...prev,
      quotation_access_org_unit_ids: prev.quotation_access_org_unit_ids.filter((item) => item !== id),
    }));
    setError("");
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!member?.id) {
      setError("请先保存员工后再上传头像");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("头像只能上传图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("头像图片不能超过 2MB");
      return;
    }

    setAvatarUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("avatar_user_id", member.id);
      formData.append("category", "员工头像");
      const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "头像上传失败");
      set("avatar", data.file_url || "");
    } catch (err: any) {
      setError(err.message || "头像上传失败");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/team", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: member?.id, is_active: form.is_active === "1" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "保存失败");
      onSuccess();
      window.dispatchEvent(new Event("auth:user-updated"));
      onClose();
      setForm({ name: "", phone: "", password: "", role: roleOptions.find((item) => item.value === "SALES")?.value || roleOptions[0]?.value || "SALES", org_unit_id: "", employee_no: "", hire_date: "", is_active: "1", notes: "", avatar: "", quotation_access_org_unit_ids: [] });
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4 py-2.5">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div className="org-access-modal-shell team-editor-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-4xl flex-col overflow-hidden border border-surface-200 bg-white">
        <div className="org-access-modal-header flex items-center justify-between border-b border-surface-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">{isEdit ? "编辑员工" : "新增员工"}</h2>
            <p className="mt-0.5 text-sm text-surface-500">{isEdit ? "维护员工账号、角色和组织归属。" : "创建员工账号并归属到组织架构。"}</p>
          </div>
          <button onClick={onClose} className="org-access-icon-button rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600" aria-label="关闭员工编辑">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="team-editor-form flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="org-access-modal-body team-editor-body team-editor-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-6 py-5">
            {isEdit && (
              <div className="employee-avatar-panel rounded-[16px] border border-[#e7eff9] bg-[#f8fbff] px-4 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EDF4FF] text-xl font-black text-[#407AFF] ring-1 ring-[#cfe0ff]">
                    {form.avatar ? (
                      <NativeImage src={form.avatar} alt={`${form.name || "员工"}头像`} className="h-full w-full object-cover" loading="eager" />
                    ) : (
                      form.name?.[0] || "员"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-[#162033]">员工头像</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#7c8aa0]">
                      建议上传正方形图片，大小不超过 2MB；上传或恢复默认头像后点击保存修改生效。
                    </p>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      className="btn-secondary h-9 text-sm"
                      disabled={avatarUploading || submitting}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {avatarUploading ? "上传中..." : form.avatar ? "更换头像" : "上传头像"}
                    </button>
                    {form.avatar && (
                      <button
                        type="button"
                        className="btn-secondary h-9 text-sm"
                        disabled={avatarUploading || submitting}
                        onClick={() => set("avatar", "")}
                      >
                        <RotateCcw className="h-4 w-4" />
                        恢复默认头像
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="team-form-grid grid gap-4 md:grid-cols-2">
              <Field label="员工姓名" icon={User} required>
                <input value={form.name} onChange={(event) => set("name", event.target.value)} className="input-field" placeholder="请输入员工姓名" />
              </Field>
              <Field label="手机号" icon={Phone} required>
                <input value={form.phone} onChange={(event) => set("phone", event.target.value)} className="input-field" placeholder="用于登录" />
              </Field>
              <Field label={isEdit ? "重置密码" : "初始密码"} icon={Lock} required={!isEdit}>
                <input value={form.password} onChange={(event) => set("password", event.target.value.replace(/\s/g, ""))} className="input-field" placeholder={isEdit ? "留空则不修改密码" : "8-32 位，包含字母和数字"} />
              </Field>
              <Field label="角色" icon={Briefcase} required>
                <SystemSelect value={form.role} onChange={(event) => set("role", event.target.value)} className="input-field" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
                  {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </SystemSelect>
              </Field>
              <Field label="所属组织" icon={Users} required>
                <OrgUnitPicker
                  units={orgUnits}
                  value={form.org_unit_id}
                  onChange={(value) => set("org_unit_id", value)}
                />
              </Field>
              <Field label="在职状态" icon={User}>
                <SystemSelect value={form.is_active} onChange={(event) => set("is_active", event.target.value)} className="input-field" menuClassName="org-access-select-menu" optionClassName="org-access-select-option">
                  <option value="1">在职</option>
                  <option value="0">停用</option>
                </SystemSelect>
              </Field>
              <div className="team-quote-scope-panel team-quote-scope-panel-compact md:col-span-2">
                <div className="team-quote-scope-head">
                  <div className="team-quote-scope-icon">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="team-quote-scope-title">额外报价范围</p>
                  </div>
                  <span className="team-quote-scope-count">{selectedQuotationAccessOptions.length} 项</span>
                </div>
                <div className="team-quote-scope-control">
                  <SystemSelect
                    value={quotationAccessPickerValue}
                    onChange={(event) => setQuotationAccessPickerValue(event.target.value)}
                    className="team-quote-scope-select input-field min-h-10 flex-1 py-2"
                    menuClassName="org-access-select-menu"
                    optionClassName="org-access-select-option"
                    searchable
                    searchPlaceholder="搜索组织"
                    menuMinWidth={360}
                  >
                    <option value="">选择额外负责组织</option>
                    {activeOrgOptions
                      .filter((option) => !form.quotation_access_org_unit_ids.includes(option.id) && option.id !== form.org_unit_id)
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.path}
                        </option>
                      ))}
                  </SystemSelect>
                  <button
                    type="button"
                    className="team-quote-scope-add"
                    disabled={!quotationAccessPickerValue}
                    onClick={addQuotationAccessOrgUnit}
                  >
                    <Plus className="h-4 w-4" />
                    添加范围
                  </button>
                </div>
                <div className="team-quote-scope-list">
                  {selectedQuotationAccessOptions.length > 0 ? selectedQuotationAccessOptions.map((option) => (
                    <div key={option.id} className="team-quote-scope-item">
                      <span className="team-quote-scope-path" title={option.path}>{option.path}</span>
                      <button type="button" className="team-quote-scope-remove" onClick={() => removeQuotationAccessOrgUnit(option.id)} aria-label={`移除${option.name}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )) : (
                    <div className="team-quote-scope-empty">当前没有额外范围，仅按所属组织控制报价权限。</div>
                  )}
                </div>
              </div>
              <Field label="工号" icon={Briefcase}>
                <input value={form.employee_no} onChange={(event) => set("employee_no", event.target.value)} className="input-field" placeholder="可选" />
              </Field>
              <Field label="入职日期" icon={Calendar}>
                <SystemDateInput value={form.hire_date} onChange={(nextValue) => set("hire_date", nextValue)} className="team-editor-date-input input-field" />
              </Field>
              <div className="team-editor-notes-field md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-surface-700">备注</label>
                <textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} className="team-editor-notes input-field resize-none" placeholder="可记录岗位说明、负责范围或入职备注" />
              </div>
            </div>

            {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>}
          </div>

          <div className="org-access-form-actions flex shrink-0 items-center justify-end gap-3 border-t border-surface-100 px-6 py-4">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting || avatarUploading}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "保存中..." : isEdit ? "保存修改" : "保存员工"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type EmployeeImportResult = {
  created?: number;
  errors?: { row: number; message: string }[];
};

function ImportEmployeesModal({
  isOpen,
  onClose,
  onSuccess,
  orgOptions,
  roleOptions,
  existingPhones,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orgOptions: OrgOption[];
  roleOptions: RoleOption[];
  existingPhones: string[];
}) {
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setFileName("");
    setPreviewRows([]);
    setErrors([]);
    setResult(null);
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setResult(null);
    setErrors([]);
    setPreviewRows([]);
    if (!file) return;
    setFileName(file.name);
    const lowerName = file.name.toLowerCase();
    const parsed = lowerName.endsWith(".xlsx")
      ? await parseXlsx(file)
      : lowerName.endsWith(".xls")
        ? parseExcelTable(await file.text())
        : parseCsv(await file.text());
    setPreviewRows(parsed);
    setErrors(validateEmployeeImportRows(parsed, orgOptions, roleOptions, existingPhones));
  };

  const handleDownloadTemplate = async () => {
    await downloadEmployeeXlsxTemplate("员工导入模板.xlsx", [
      employeeImportHeaders,
      ["王设计", "13800000002", "Zxgj2026", roleOptions.find((role) => role.value === "DESIGNER")?.label || roleOptions[0]?.label || "设计师", orgOptions[0]?.path || "星艺装饰集团", "EMP001", "2026-06-15", "在职", "样例行，请导入前删除或修改"],
    ], orgOptions, roleOptions);
  };

  const handleSubmit = async () => {
    const validationErrors = validateEmployeeImportRows(previewRows, orgOptions, roleOptions, existingPhones);
    setErrors(validationErrors);
    setResult(null);
    if (validationErrors.length > 0 || previewRows.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employees: previewRows.map((row) => mapEmployeeImportRowToPayload(row, orgOptions, roleOptions)) }),
      });
      const data = await res.json();
      setResult(data);
      if (data.created > 0) onSuccess();
    } catch (err: any) {
      setErrors([err.message || "导入失败"]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="org-access-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4 py-6">
      <div className="fixed inset-0 bg-black/45" onClick={close} />
      <div className="org-access-modal-shell team-import-modal relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-6xl flex-col overflow-hidden border border-surface-200 bg-white">
        <div className="org-access-modal-header flex shrink-0 items-center justify-between border-b border-surface-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">导入员工</h2>
            <p className="mt-0.5 text-sm text-surface-500">支持 CSV / XLSX 模板文件，建议先下载模板再填写。</p>
          </div>
          <button onClick={close} className="org-access-icon-button rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600" aria-label="关闭导入员工">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="org-access-modal-body min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="employee-import-requirements rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-600">
            <p className="font-medium text-surface-800">导入要求</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <p>文件格式：CSV 或下载的 XLSX 模板，第一行必须是表头。</p>
              <p>必填字段：员工姓名、手机号、初始密码、角色、所属组织。</p>
              <p>手机号必须为 11 位大陆手机号，且不能和已有员工重复。</p>
              <p>初始密码为 8-32 位，必须同时包含字母和数字，且不能包含空格。</p>
              <p>角色请填写或下拉选择：{roleOptions.map((role) => role.label).join("、")}。</p>
              <p>所属组织请使用模板下拉选择完整路径，不要只填最后一级。</p>
              <p>入职日期格式建议为 YYYY-MM-DD；在职状态可填：在职、停用。</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="org-access-file-button inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-primary-700 bg-primary-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-800">
              <Upload className="h-4 w-4" />
              选择文件
              <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={handleFileChange} />
            </label>
            <button type="button" onClick={handleDownloadTemplate} className="btn-secondary">
              <Download className="h-4 w-4" />
              下载模板
            </button>
            {fileName && <span className="text-sm text-surface-500">{fileName}</span>}
          </div>

          {previewRows.length > 0 && (
            <div className="team-import-preview overflow-hidden rounded-lg border border-surface-200">
              <div className="team-import-preview-header flex items-center justify-between border-b border-surface-100 px-4 py-2.5">
                <p className="text-sm font-medium text-surface-800">完整预览</p>
                <p className="text-xs text-surface-400">共 {previewRows.length} 行</p>
              </div>
              <div className="max-h-[34vh] overflow-auto">
                <table className="team-import-table w-full min-w-[1200px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-surface-50 text-surface-500 shadow-[0_1px_0_#e6ebf1]">
                    <tr>
                      <th className="px-3 py-2 font-medium">行号</th>
                      {employeeImportHeaders.map((header) => (
                        <th key={header} className="px-3 py-2 font-medium">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {previewRows.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-surface-400 tabular-nums">{index + 2}</td>
                        {employeeImportHeaders.map((header) => (
                          <td key={header} className="max-w-72 truncate px-3 py-2 text-surface-600" title={row[header] || ""}>{row[header] || "-"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">请先修正以下问题</p>
                <p className="text-xs text-red-500">共 {errors.length} 条</p>
              </div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-2">
                {errors.map((error, index) => <p key={index}>{error}</p>)}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-accent-100 bg-accent-50 px-4 py-3 text-sm text-accent-700">
              已导入 {result.created || 0} 位员工
              {result.errors?.length ? `，${result.errors.length} 行未导入。` : "。"}
            </div>
          )}
        </div>

        <div className="org-access-modal-footer flex shrink-0 items-center justify-end gap-3 border-t border-surface-100 px-6 py-4">
          <button type="button" onClick={close} className="btn-secondary">取消</button>
          <button type="button" disabled={submitting || previewRows.length === 0 || errors.length > 0} onClick={handleSubmit} className="btn-primary disabled:opacity-60">
            {submitting ? "导入中..." : "确认导入"}
          </button>
        </div>
      </div>
    </div>
  );
}
