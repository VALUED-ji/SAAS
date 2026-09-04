// 团队管理页员工导入工具组件模块
// 从 page.tsx 渐进拆出，共享工具来自 ./team-shared。

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronRight, Search, X } from "lucide-react";
import {
  OrgOption,
  OrgUnit,
  RoleOption,
  buildOrgOptions,
  employeeImportHeaders,
  isOrgActive,
  orgTypeLabels,
} from "./team-shared";
export function OrgUnitPicker({ units, value, onChange }: { units: OrgUnit[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidateId, setCandidateId] = useState(value);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const options = useMemo(() => buildOrgOptions(units), [units]);
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selected = optionById.get(value);
  const visibleOptions = useMemo(() => {
    const visibleIds = new Set<string>();
    options.forEach((option) => {
      if (!isOrgActive(option) && option.id !== value) return;
      let current: OrgOption | undefined = option;
      while (current) {
        visibleIds.add(current.id);
        current = current.parent_id ? optionById.get(current.parent_id) : undefined;
      }
    });
    return options.filter((option) => visibleIds.has(option.id));
  }, [optionById, options, value]);
  const visibleOptionIds = useMemo(() => new Set(visibleOptions.map((option) => option.id)), [visibleOptions]);
  const childrenByParent = useMemo(() => {
    const children = new Map<string | null, OrgOption[]>();
    visibleOptions.forEach((option) => {
      const parentId = option.parent_id && visibleOptionIds.has(option.parent_id) ? option.parent_id : null;
      const siblings = children.get(parentId) || [];
      siblings.push(option);
      children.set(parentId, siblings);
    });
    return children;
  }, [visibleOptionIds, visibleOptions]);
  const filteredOptions = useMemo(() => visibleOptions.filter((option) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [option.name, option.path, orgTypeLabels[option.type]]
      .filter(Boolean)
      .some((item) => String(item).toLowerCase().includes(q));
  }), [query, visibleOptions]);
  const currentOptions = childrenByParent.get(currentParentId) || [];
  const searching = query.trim().length > 0;
  const candidate = optionById.get(candidateId);
  const breadcrumbOptions = useMemo(() => {
    const path: OrgOption[] = [];
    let current = currentParentId ? optionById.get(currentParentId) : undefined;
    while (current) {
      path.unshift(current);
      current = current.parent_id ? optionById.get(current.parent_id) : undefined;
    }
    return path;
  }, [currentParentId, optionById]);

  const closePicker = () => {
    setOpen(false);
    setQuery("");
  };

  const confirmSelection = () => {
    if (!candidateId) return;
    onChange(candidateId);
    closePicker();
  };

  useEffect(() => {
    if (!open) return;
    setCandidateId(value);
    setCurrentParentId(selected?.parent_id && visibleOptionIds.has(selected.parent_id) ? selected.parent_id : null);
  }, [open, selected, value, visibleOptionIds]);

  return (
    <div className="org-unit-picker relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`org-unit-picker-trigger flex h-10 min-h-10 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-0 text-left transition-colors ${
          open ? "border-primary-400 ring-4 ring-primary-100/80" : "border-surface-200 hover:border-surface-300"
        }`}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-surface-900" title={selected.path}>{selected.path}</span>
              {!isOrgActive(selected) && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">已停用</span>}
            </span>
          ) : (
            <span className="block truncate text-sm font-medium text-surface-400">请选择所属组织</span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-surface-400" />
      </button>

      {typeof document !== "undefined" && open && createPortal(
        <div
          className="team-org-picker-dialog-overlay fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
          onKeyDown={(event) => {
            if (event.key === "Escape") closePicker();
          }}
        >
          <button type="button" className="absolute inset-0 cursor-default bg-[#111827]/35" onClick={closePicker} aria-label="关闭组织选择" />
          <div className="team-org-picker-dialog relative z-10 flex w-full max-w-[680px] flex-col overflow-hidden bg-white" role="dialog" aria-modal="true" aria-labelledby="org-picker-dialog-title">
            <div className="team-org-picker-dialog-header flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
              <div>
                <h3 id="org-picker-dialog-title" className="text-base font-semibold text-[#111827]">选择所属组织</h3>
                <p className="mt-1 text-sm text-[#667085]">逐级进入组织，或直接搜索名称和路径</p>
              </div>
              <button type="button" onClick={closePicker} className="team-org-picker-close grid h-9 w-9 shrink-0 place-items-center text-[#667085]" aria-label="关闭组织选择">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="team-org-picker-dialog-body min-h-0 flex-1 px-5 py-4 sm:px-6">
              <div className="team-org-picker-search relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 w-full rounded-[10px] border border-[#D9DEE7] bg-white pl-9 pr-10 text-sm font-medium text-[#111827] outline-none"
                  placeholder="搜索组织名称或完整路径"
                  autoFocus
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#98A2B3]" aria-label="清除搜索">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {!searching && (
                <div className="team-org-picker-breadcrumb mt-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-sm">
                  <button type="button" onClick={() => setCurrentParentId(null)} data-active={currentParentId === null ? "true" : undefined}>全部组织</button>
                  {breadcrumbOptions.map((option) => (
                    <span key={option.id} className="inline-flex items-center gap-1">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#B0B8C5]" />
                      <button type="button" onClick={() => setCurrentParentId(option.id)} data-active={currentParentId === option.id ? "true" : undefined}>{option.name}</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="team-org-picker-level-header mt-3 flex items-center justify-between border-b pb-2 text-xs font-medium text-[#667085]">
                <span>{searching ? "搜索结果" : currentParentId ? optionById.get(currentParentId)?.name || "下级组织" : "一级组织"}</span>
                <span>{searching ? filteredOptions.length : currentOptions.length} 个组织</span>
              </div>

              <div className="team-org-picker-list mt-1 overflow-y-auto" role="listbox">
                {(searching ? filteredOptions : currentOptions).length > 0 ? (searching ? filteredOptions : currentOptions).map((option) => {
                  const active = option.id === candidateId;
                  const childCount = (childrenByParent.get(option.id) || []).length;
                  const selectable = isOrgActive(option) || option.id === value;
                  return (
                    <div key={option.id} className="team-org-picker-row flex items-center gap-2 border-b" data-selected={active ? "true" : undefined} data-disabled={!selectable ? "true" : undefined}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={!selectable}
                        onClick={() => setCandidateId(option.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                      >
                        <span className="team-org-picker-icon grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-[#667085]">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-[#344054]">{option.name}</span>
                            <span className="team-org-picker-type shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#667085]">{orgTypeLabels[option.type] || "组织"}</span>
                            {!isOrgActive(option) && <span className="team-org-picker-inactive shrink-0 px-1.5 py-0.5 text-[11px] font-medium">已停用</span>}
                          </span>
                          {searching && <span className="mt-0.5 block truncate text-xs text-[#98A2B3]" title={option.path}>{option.path}</span>}
                        </span>
                        {active && <Check className="h-4 w-4 shrink-0 text-[#407AFF]" />}
                      </button>
                      {!searching && childCount > 0 && (
                        <button type="button" className="team-org-picker-enter mr-2 inline-flex h-9 shrink-0 items-center gap-1 px-2.5 text-xs font-semibold text-[#407AFF]" onClick={() => setCurrentParentId(option.id)}>
                          下级 {childCount}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                }) : (
                  <div className="grid min-h-48 place-items-center text-sm text-[#98A2B3]">{searching ? "没有找到匹配的组织" : "当前层级暂无下级组织"}</div>
                )}
              </div>
            </div>

            <div className="team-org-picker-dialog-footer flex shrink-0 flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#667085]">当前选择</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-[#344054]" title={candidate?.path || ""}>{candidate?.path || "请选择组织"}</p>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <button type="button" className="team-org-picker-secondary h-10 px-4 text-sm font-semibold" onClick={closePicker}>取消</button>
                <button type="button" className="team-org-picker-primary h-10 px-4 text-sm font-semibold" disabled={!candidateId} onClick={confirmSelection}>确认选择</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function buildEmployeeRoleImportMap(roleOptions: RoleOption[]) {
  return roleOptions.reduce<Record<string, string>>((map, role) => {
    map[role.label] = role.value;
    map[role.value] = role.value;
    return map;
  }, {});
}

export function mapEmployeeImportRowToPayload(row: Record<string, string>, orgOptions: OrgOption[], roleOptions: RoleOption[]) {
  const orgInput = row["所属组织"]?.trim() || "";
  const org = findOrgOptionByInput(orgOptions, orgInput);
  const roleMap = buildEmployeeRoleImportMap(roleOptions);
  return {
    name: row["员工姓名"]?.trim(),
    phone: row["手机号"]?.trim(),
    password: row["初始密码"]?.trim(),
    role: roleMap[row["角色"]?.trim()] || row["角色"]?.trim(),
    org_unit_id: org?.id || "",
    employee_no: row["工号"]?.trim(),
    hire_date: row["入职日期"]?.trim(),
    is_active: row["在职状态"]?.trim() === "停用" ? "0" : "1",
    notes: row["备注"]?.trim(),
  };
}

export function validateEmployeeImportRows(rows: Record<string, string>[], orgOptions: OrgOption[], roleOptions: RoleOption[], existingPhones: string[]) {
  const errors: string[] = [];
  const seenPhones = new Set<string>();
  const existingPhoneSet = new Set(existingPhones.filter(Boolean));
  const roleMap = buildEmployeeRoleImportMap(roleOptions);
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = row["员工姓名"]?.trim();
    const phone = row["手机号"]?.trim();
    const password = row["初始密码"]?.trim();
    const role = row["角色"]?.trim();
    const orgInput = row["所属组织"]?.trim();
    const active = row["在职状态"]?.trim();
    if (!name) errors.push(`第 ${rowNumber} 行：员工姓名为必填项`);
    if (!phone) errors.push(`第 ${rowNumber} 行：手机号为必填项`);
    else if (!/^1[3-9]\d{9}$/.test(phone)) errors.push(`第 ${rowNumber} 行：手机号格式不正确`);
    else if (existingPhoneSet.has(phone)) errors.push(`第 ${rowNumber} 行：手机号已存在员工账号`);
    else if (seenPhones.has(phone)) errors.push(`第 ${rowNumber} 行：导入文件内手机号重复`);
    if (phone) seenPhones.add(phone);
    if (!password || password.length < 8 || password.length > 32 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || /\s/.test(password)) {
      errors.push(`第 ${rowNumber} 行：初始密码需为 8-32 位且同时包含字母和数字，不能包含空格`);
    }
    if (!role || !roleMap[role]) errors.push(`第 ${rowNumber} 行：角色无效`);
    if (!orgInput) errors.push(`第 ${rowNumber} 行：所属组织为必填项`);
    else if (!findOrgOptionByInput(orgOptions, orgInput)) errors.push(`第 ${rowNumber} 行：所属组织不存在，请使用模板下拉中的完整路径`);
    if (active && !["在职", "停用", "1", "0"].includes(active)) errors.push(`第 ${rowNumber} 行：在职状态只能填写在职或停用`);
  });
  return errors;
}

export function findOrgOptionByInput(orgOptions: OrgOption[], value: string) {
  const input = value.trim();
  if (!input) return null;
  return orgOptions.find((option) => option.id === input)
    || orgOptions.find((option) => option.path === input)
    || orgOptions.find((option) => option.name === input && orgOptions.filter((item) => item.name === input).length === 1)
    || null;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  const normalized = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      i += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows[0] || [];
  return rows.slice(1).map((values) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || "";
    });
    return item;
  });
}

export function parseExcelTable(text: string) {
  const parser = new DOMParser();
  const isXmlWorkbook = text.includes("urn:schemas-microsoft-com:office:spreadsheet");
  const doc = parser.parseFromString(text, isXmlWorkbook ? "text/xml" : "text/html");
  const tableRows = Array.from(doc.getElementsByTagName("Row"));
  const htmlRows = Array.from(doc.querySelectorAll("tr"));
  const matrix = (tableRows.length > 0 ? tableRows : htmlRows).map((tr) => {
    const cells = tableRows.length > 0 ? Array.from(tr.getElementsByTagName("Cell")) : Array.from(tr.querySelectorAll("th,td"));
    return cells.map((cell) => cell.textContent?.trim() || "");
  }).filter((row) => row.some(Boolean));
  const headers = matrix[0] || [];
  return matrix.slice(1).map((values) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || "";
    });
    return item;
  });
}

export async function parseXlsx(file: File) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? "").trim());
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (!values.some((value) => String(value ?? "").trim())) return;
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = String(values[index] ?? "").trim();
    });
    rows.push(item);
  });
  return rows;
}

export function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadEmployeeXlsxTemplate(filename: string, rows: unknown[][], orgOptions: OrgOption[], roleOptions: RoleOption[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("员工导入模板", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRows(rows as any[][]);
  sheet.columns.forEach((column, index) => {
    const maxLength = Math.max(
      ...rows.map((row) => String(row[index] ?? "").replace(/[^\x00-\xff]/g, "aa").length),
      employeeImportHeaders[index]?.replace(/[^\x00-\xff]/g, "aa").length || 12
    );
    column.width = Math.min(Math.max(maxLength + 4, index === 4 ? 42 : 12), index === 4 ? 80 : 32);
    column.numFmt = "@";
  });
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FF1F2935" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 22;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  });

  const roleLabelsText = roleOptions.map((role) => role.label).join(",");
  const orgPaths = orgOptions.map((option) => option.path);
  const orgSheet = workbook.addWorksheet("组织选项");
  orgSheet.state = "veryHidden";
  orgPaths.forEach((path, index) => {
    orgSheet.getCell(`A${index + 1}`).value = path;
  });

  for (let row = 2; row <= 300; row += 1) {
    sheet.getCell(`D${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${roleLabelsText}"`],
      showErrorMessage: true,
      errorTitle: "角色无效",
      error: "请从下拉列表中选择角色。",
    };
    if (orgPaths.length > 0) {
      sheet.getCell(`E${row}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'组织选项'!$A$1:$A$${orgPaths.length}`],
        showErrorMessage: true,
        errorTitle: "所属组织无效",
        error: "请从下拉列表中选择所属组织完整路径。",
      };
    }
    sheet.getCell(`H${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"在职,停用"`],
      showErrorMessage: true,
      errorTitle: "在职状态无效",
      error: "请从下拉列表中选择在职状态。",
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Field({ label, icon: Icon, required, children }: { label: string; icon: React.ElementType; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="org-access-field">
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-surface-700">
        <Icon className="h-3.5 w-3.5 text-surface-400" />
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
