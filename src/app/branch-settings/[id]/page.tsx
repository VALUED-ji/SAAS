"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import areaData from "china-area-data";
import { ArrowLeft, Building2, Check, ClipboardList, Copy, FileCheck2, Hammer, ListChecks, Loader2, Plus, Save, Search, SlidersHorizontal, Trash2, Upload, UserRoundCheck, Users, X } from "lucide-react";
import { ApprovalFlow, BranchSettings, ConstructionProcessNode, ConstructionProcessNodeType, ConstructionStageAreaDuration, ConstructionStandardImage, ConstructionStandardItem, ConstructionTemplate, ConstructionTemplateStage, DesignerAssignmentDispatcher, DesignerAssignmentDispatcherSource, OrderTemplate, PaymentScheme, defaultBranchSettings, findDuplicateApprovalFlowType } from "@/lib/branchSettings";
import { defaultQuotationSignatureLabels, normalizeQuotationSignatureLabels } from "@/lib/quotationPrintSettings";
import { cn } from "@/lib/utils";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import ContractTemplatesSection from "@/components/branch-settings/ContractTemplatesSection";
import {
  BrandLogoField,
  NumberField,
  SelectField,
  TextField,
  ToggleField,
} from "./branch-settings-fields";

import {
  CollectionRulesSection,
} from "./collection-rules-section";


import {
  BranchMaterialOption,
  BranchSupplierOption,
  RoleOption,
  UserOption,
  flowTypeLabels,
} from "./branch-settings-approval-shared";
import {
  ApprovalFlowSection,
} from "./approval-flow-section";

import {
  OrderSettingsSection,
} from "./order-settings-section";
import {
  makeLocalId,
} from "./branch-settings-approval-shared";




type OrgUnit = {
  id: string;
  company_id?: string | null;
  name: string;
  type: string;
  parent_id: string | null;
  is_active?: number;
};

type BranchOption = OrgUnit & { path: string };



type SettingsTab = "basicInfo" | "collectionRules" | "contractTemplates" | "charging" | "approval" | "business" | "site" | "construction" | "order" | "features" | "notifications" | "print";

const settingsTabs: { key: SettingsTab; label: string }[] = [
  { key: "basicInfo", label: "基本信息" },
  { key: "collectionRules", label: "收款比例" },
  { key: "contractTemplates", label: "合同模板" },
  { key: "charging", label: "收费比例" },
  { key: "approval", label: "审批流程" },
  { key: "business", label: "业务规则" },
  { key: "site", label: "工地规则" },
  { key: "construction", label: "施工模板" },
  { key: "order", label: "下单设置" },
  { key: "features", label: "功能开关" },
  { key: "notifications", label: "通知规则" },
  { key: "print", label: "打印设置" },
];

const constructionTemplateTypeOptions = ["标准家装", "旧房翻新", "局部改造", "精装改造", "工装项目"];

const designerAssignmentDispatcherSourceOptions: Array<{
  value: DesignerAssignmentDispatcherSource;
  label: string;
  description: string;
}> = [
  { value: "store_manager", label: "客户所属门店负责人", description: "按客户当前服务门店的负责人处理；有多位负责人时，任意一位均可办理。" },
  { value: "org_manager", label: "指定组织负责人", description: "由下方选定组织的负责人处理；任意一位负责人均可办理。" },
  { value: "role", label: "指定岗位人员", description: "由当前分公司内具备所选岗位的在职员工处理。" },
  { value: "user", label: "指定员工", description: "仅由下方明确选定的在职员工处理。" },
];

const areaMap = areaData as Record<string, Record<string, string> | undefined>;
const provinceOptions = Object.entries(areaMap["86"] || {});

function findAreaCode(parentCode: string, name: string) {
  if (!name) return "";
  return Object.entries(areaMap[parentCode] || {}).find(([, itemName]) => itemName === name)?.[0] || "";
}

function buildBranchOptions(units: OrgUnit[]): BranchOption[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const pathOf = (unit: OrgUnit): string => {
    const names = [unit.name];
    let current = unit;
    while (current.parent_id && byId.has(current.parent_id)) {
      current = byId.get(current.parent_id)!;
      names.unshift(current.name);
    }
    return names.join(" / ");
  };
  return units.filter((unit) => unit.type === "company").map((unit) => ({ ...unit, path: pathOf(unit) }));
}

function isOrgActive(unit?: OrgUnit | null) {
  return Number(unit?.is_active ?? 1) === 1;
}

function getBranchDescendantOrgIds(units: OrgUnit[], branchId: string) {
  const rootId = String(branchId || "").trim();
  if (!rootId) return [];
  const childrenByParent = new Map<string, string[]>();
  units.forEach((unit) => {
    if (!unit.parent_id) return;
    childrenByParent.set(unit.parent_id, [...(childrenByParent.get(unit.parent_id) || []), unit.id]);
  });
  const ids: string[] = [];
  const visited = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const currentId = queue.shift() || "";
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    ids.push(currentId);
    (childrenByParent.get(currentId) || []).forEach((childId) => queue.push(childId));
  }
  return ids;
}

function getDispatcherClientValidation(dispatcher: DesignerAssignmentDispatcher) {
  if (dispatcher.source === "store_manager") return "";
  if (dispatcher.source === "org_manager" && dispatcher.orgUnitIds.length === 0) return "请选择至少一个指定组织";
  if (dispatcher.source === "role" && dispatcher.roleCodes.length === 0) return "请选择至少一个员工岗位";
  if (dispatcher.source === "user" && dispatcher.userIds.length === 0) return "请选择至少一位指定员工";
  return "";
}

function reorderByDropTarget<T extends { id: string }>(items: T[], activeId: string, targetId: string, placement: "before" | "after") {
  if (!activeId || !targetId || activeId === targetId) return items;
  const activeIndex = items.findIndex((item) => item.id === activeId);
  if (activeIndex < 0) return items;
  const nextItems = [...items];
  const [activeItem] = nextItems.splice(activeIndex, 1);
  const targetIndex = nextItems.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return items;
  nextItems.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, activeItem);
  return nextItems;
}

function getVerticalDropPlacement(rect: DOMRect, clientY: number): DragPlacement {
  return clientY > rect.top + rect.height / 2 ? "after" : "before";
}

type DragPlacement = "before" | "after";
type DragTargetState = { id: string; placement: DragPlacement } | null;
type PointerSortDragState = {
  sourceId: string;
  startX: number;
  startY: number;
  moved: boolean;
  targetId: string | null;
  placement: DragPlacement;
} | null;

function getDropIndicatorClass(target: DragTargetState, itemId: string, activeId: string) {
  if (!target || target.id !== itemId || activeId === itemId) return "";
  return target.placement === "before" ? "construction-sort-drop-before" : "construction-sort-drop-after";
}

function DragSortHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className="group flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border border-transparent text-surface-300 transition-all duration-200 ease-out hover:border-primary-100 hover:bg-primary-50/70 hover:text-primary-700 active:scale-95 active:cursor-grabbing active:bg-primary-100/70"
      title="拖动排序"
      aria-label={label}
    >
      <span className="flex h-[18px] w-[18px] flex-col items-center justify-center gap-[3px]" aria-hidden="true">
        <span className="h-[1.5px] w-3 rounded-full bg-current opacity-55 transition-all duration-200 group-hover:w-4 group-hover:opacity-95" />
        <span className="h-[1.5px] w-4 rounded-full bg-current opacity-70 transition-all duration-200 group-hover:opacity-100" />
        <span className="h-[1.5px] w-3 rounded-full bg-current opacity-55 transition-all duration-200 group-hover:w-4 group-hover:opacity-95" />
      </span>
    </button>
  );
}

export default function BranchSettingsDetailPage() {
  const params = useParams<{ id: string }>();
  const branchId = decodeURIComponent(params.id);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [settings, setSettings] = useState<BranchSettings>(defaultBranchSettings);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [branchMaterials, setBranchMaterials] = useState<BranchMaterialOption[]>([]);
  const [branchSuppliers, setBranchSuppliers] = useState<BranchSupplierOption[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>("basicInfo");
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPrintLogo, setUploadingPrintLogo] = useState(false);
  const [message, setMessage] = useState("");

  const branchOptions = useMemo(() => buildBranchOptions(orgUnits), [orgUnits]);
  const selectedBranch = branchOptions.find((branch) => branch.id === branchId);
  const branchInactive = Boolean(selectedBranch && !isOrgActive(selectedBranch));
  const branchOrgIds = useMemo(() => getBranchDescendantOrgIds(orgUnits, branchId), [branchId, orgUnits]);
  const dispatcherOrgOptions = useMemo(
    () => orgUnits.filter((unit) => branchOrgIds.includes(unit.id) && isOrgActive(unit)),
    [branchOrgIds, orgUnits],
  );
  const dispatcherUserOptions = useMemo(
    () => users.filter((user) => branchOrgIds.includes(String(user.org_unit_id || ""))),
    [branchOrgIds, users],
  );
  const dispatcherRoleOptions = useMemo(
    () => roles.filter((role) => !role.company_id || role.company_id === selectedBranch?.company_id),
    [roles, selectedBranch?.company_id],
  );
  const selectedProvinceCode = useMemo(() => findAreaCode("86", settings.basicInfo.province), [settings.basicInfo.province]);
  const cityOptions = useMemo(() => Object.entries(areaMap[selectedProvinceCode] || {}), [selectedProvinceCode]);
  const selectedCityCode = useMemo(() => findAreaCode(selectedProvinceCode, settings.basicInfo.city), [selectedProvinceCode, settings.basicInfo.city]);
  const districtOptions = useMemo(() => Object.entries(areaMap[selectedCityCode] || {}), [selectedCityCode]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/org")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setOrgUnits(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    fetch("/api/roles")
      .then((res) => res.json())
      .then((data) => setRoles((Array.isArray(data) ? data : []).filter((role) => role.is_active).map((role) => ({ code: role.code, name: role.name, company_id: role.company_id }))))
      .catch(() => setRoles([]));
    fetch("/api/team")
      .then((res) => res.json())
      .then((data) => setUsers((Array.isArray(data) ? data : []).filter((user) => user.is_active !== 0).map((user) => ({ id: user.id, name: user.name, role: user.role, org_unit_id: user.org_unit_id, org_unit_name: user.org_unit_name }))))
      .catch(() => setUsers([]));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    setMessage("");
    fetch(`/api/branch-settings?org_unit_id=${encodeURIComponent(branchId)}`)
      .then((res) => res.json())
      .then((data) => {
        setSettings(data.settings || defaultBranchSettings);
        setBranchMaterials(Array.isArray(data.materials) ? data.materials : []);
        setBranchSuppliers(Array.isArray(data.suppliers) ? data.suppliers : []);
      })
      .catch(() => {
        setSettings(defaultBranchSettings);
        setBranchMaterials([]);
        setBranchSuppliers([]);
      });
  }, [branchId]);

  const update = <K extends keyof Omit<BranchSettings, "approvalFlows">, F extends keyof BranchSettings[K]>(
    group: K,
    field: F,
    value: BranchSettings[K][F]
  ) => {
    setSettings((prev) => ({ ...prev, [group]: { ...prev[group], [field]: value } }));
    setMessage("");
  };

  const updateApprovalFlows = (flows: ApprovalFlow[]) => {
    setSettings((prev) => ({ ...prev, approvalFlows: flows }));
    setMessage("");
  };

  const updateDesignerAssignmentDispatcher = (dispatcher: DesignerAssignmentDispatcher) => {
    setSettings((prev) => ({
      ...prev,
      businessRules: {
        ...prev.businessRules,
        designerAssignmentDispatcher: dispatcher,
      },
    }));
    setMessage("");
  };

  const updateCollectionSchemes = (schemes: PaymentScheme[]) => {
    setSettings((prev) => ({ ...prev, collectionRules: { ...prev.collectionRules, schemes } }));
    setMessage("");
  };

  const updateQuotationSignatureLabels = (labels: string[]) => {
    setSettings((prev) => ({
      ...prev,
      printSettings: {
        ...prev.printSettings,
        quotationSignatureLabels: labels.map((label) => String(label || "")).slice(0, 8),
      },
    }));
    setMessage("");
  };

  const updateOrderTemplates = (templates: OrderTemplate[]) => {
    setSettings((prev) => ({
      ...prev,
      orderSettings: {
        ...prev.orderSettings,
        auxiliaryTemplates: templates,
      },
    }));
    setMessage("");
  };

  const updateConstructionTemplates = (templates: ConstructionTemplate[]) => {
    setSettings((prev) => ({
      ...prev,
      constructionTemplates: {
        ...prev.constructionTemplates,
        templates,
      },
    }));
    setMessage("");
  };

  const uploadCompanyLogo = async (file?: File | null) => {
    if (!file || !branchId) return;
    if (branchInactive) {
      setMessage("该分公司已停用，不能继续修改分公司设置");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage("公司Logo只能上传图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage("公司Logo图片不能超过2MB");
      return;
    }
    setUploadingLogo(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("org_unit_id", branchId);
      formData.append("category", "品牌Logo");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Logo上传失败");
      const logoUrl = String(data.file_url || "").trim();
      if (!logoUrl) throw new Error("Logo上传失败");
      update("basicInfo", "companyLogoUrl", logoUrl);
      setMessage("Logo已上传，请记得保存设置");
    } catch (err: any) {
      setMessage(err.message || "Logo上传失败");
    } finally {
      setUploadingLogo(false);
    }
  };

  const uploadQuotationLogo = async (file?: File | null) => {
    if (!file || !branchId) return;
    if (branchInactive) {
      setMessage("该分公司已停用，不能继续修改分公司设置");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage("报价打印Logo只能上传图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage("报价打印Logo图片不能超过2MB");
      return;
    }
    setUploadingPrintLogo(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("org_unit_id", branchId);
      formData.append("category", "报价打印Logo");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "报价打印Logo上传失败");
      const logoUrl = String(data.file_url || "").trim();
      if (!logoUrl) throw new Error("报价打印Logo上传失败");
      update("printSettings", "quotationLogoUrl", logoUrl);
      setMessage("报价打印Logo已上传，请记得保存设置");
    } catch (err: any) {
      setMessage(err.message || "报价打印Logo上传失败");
    } finally {
      setUploadingPrintLogo(false);
    }
  };

 const save = async () => {
    if (!branchId) return;
    if (branchInactive) {
      setMessage("该分公司已停用，不能继续修改分公司设置");
      return;
    }
    const companyShortName = String(settings.basicInfo.companyShortName || "").trim();
    if (Array.from(companyShortName).length > 6) {
      setMessage("公司简称最多不超过6个字，请修改后再保存");
      return;
    }
    const duplicateFlowType = findDuplicateApprovalFlowType(settings.approvalFlows);
    if (duplicateFlowType) {
      setMessage(`审批流程中「${flowTypeLabels[duplicateFlowType] || "同类型审批"}」只能配置一条，请删除重复审批流后再保存`);
      return;
    }
    if (settings.businessRules.designerAssignmentMode !== "direct") {
      const dispatcherError = getDispatcherClientValidation(settings.businessRules.designerAssignmentDispatcher);
      if (dispatcherError) {
        setMessage(dispatcherError);
        return;
      }
    }
    const invalid = settings.collectionRules.schemes.filter(
      (s) => s.stages.reduce((sum, st) => sum + Number(st.ratio || 0), 0) !== 100
    );
    if (invalid.length > 0) {
      setMessage(`收款方案「${invalid[0].name}」的付款阶段合计比例不是 100%，请调整后重试`);
      return;
    }
    const invalidConstructionTemplate = settings.constructionTemplates.templates.find((template) => {
      if (!template.isEnabled) return false;
      if (!template.name.trim() || template.stages.length === 0) return true;
      return template.stages.some((stage) =>
        !stage.name.trim()
        || stage.processNodes.length === 0
        || stage.processNodes.some((node) => !node.name.trim() || !node.areaDurationRules?.length)
      );
    });
    if (invalidConstructionTemplate) {
      setMessage(`施工模板「${invalidConstructionTemplate.name || "未命名模板"}」需要填写模板名称、阶段名称、工序节点和节点工期`);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const companyBrandSubtitle = String(settings.basicInfo.companyBrandSubtitle || "").trim();
      if (Array.from(companyBrandSubtitle).length > 40) {
        setMessage("品牌英文标识最多不超过40个字符，请修改后再保存");
        return;
      }
      const settingsPayload = {
        ...settings,
        basicInfo: {
          ...settings.basicInfo,
          companyShortName,
          companyLogoUrl: String(settings.basicInfo.companyLogoUrl || "").trim(),
          companyBrandSubtitle,
        },
        printSettings: {
          ...settings.printSettings,
          quotationLogoUrl: String(settings.printSettings.quotationLogoUrl || "").trim(),
        },
      };
      const res = await fetch("/api/branch-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_unit_id: branchId, settings: settingsPayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "保存失败");
      setSettings(data.settings);
      window.dispatchEvent(new Event("auth:user-updated"));
      setMessage("已保存分公司设置");
    } catch (err: any) {
      setMessage(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-page-surface admin-config-ui branch-settings-ui branch-settings-detail-ui flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[#F5F7FB]">
      <section className="branch-settings-detail-header rounded-lg border border-surface-200/90 bg-white/95 px-3 py-3 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/branch-settings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 hover:bg-surface-50 hover:text-surface-800">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-surface-900">{selectedBranch?.name || "分公司设置"}</span>
                {branchInactive && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">已停用</span>}
              </div>
              <div className="mt-0.5 truncate text-xs text-surface-400">{selectedBranch?.path || "正在加载分公司信息"}</div>
            </div>
          </div>
          <button className="btn-primary" onClick={save} disabled={!branchId || saving || branchInactive}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
        {branchInactive && (
          <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700 ring-1 ring-amber-100">
            该分公司已停用，当前页面仅用于查看历史配置；如需继续调整，请先在组织管理中启用该组织。
          </div>
        )}
      </section>

      {message && (
        <div className={`branch-settings-notice rounded-lg border px-4 py-3 text-sm ${
         message.startsWith("已保存") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {message}
        </div>
      )}

      <div className="branch-settings-workspace-card flex-1">
        <nav className="branch-settings-tabs-shell system-page-tabs-shell" aria-label="分公司设置分类">
          <div className="branch-settings-tabs system-page-tabs">
            {settingsTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  data-active={isActive ? "true" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className="branch-settings-tab system-page-tab"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        <section className="branch-settings-content">
          {selectedBranch ? (
            <>
              {activeTab === "basicInfo" && (
                <SettingsSection title="基本信息" caption="维护分公司的主体资料、负责人和经营地址。">
                  <TextField label="法定公司名称" value={settings.basicInfo.legalCompanyName} onChange={(value) => update("basicInfo", "legalCompanyName", value)} placeholder="例如：广州某某装饰工程有限公司" />
                  <TextField label="公司简称" value={settings.basicInfo.companyShortName} onChange={(value) => update("basicInfo", "companyShortName", value)} placeholder="最多6个字，如：广州星艺装饰、呼和浩特星艺等" />
                  <TextField label="营业执照号" value={settings.basicInfo.businessLicenseNo} onChange={(value) => update("basicInfo", "businessLicenseNo", value)} placeholder="统一社会信用代码" />
                  <TextField label="法人" value={settings.basicInfo.legalPersonName} onChange={(value) => update("basicInfo", "legalPersonName", value)} placeholder="例如：张三" />
                  <TextField label="负责人" value={settings.basicInfo.managerName} onChange={(value) => update("basicInfo", "managerName", value)} placeholder="例如：王总" />
                  <TextField label="联系电话" value={settings.basicInfo.contactPhone} onChange={(value) => update("basicInfo", "contactPhone", value)} placeholder="例如：13800000000" />
                  <div className="grid gap-4 md:col-span-2 md:grid-cols-3 xl:col-span-3">
                    <SelectField
                      label="省份"
                      value={settings.basicInfo.province}
                      placeholder="请选择省份"
                      options={provinceOptions.map(([, name]) => name)}
                      onChange={(value) => {
                        setSettings((prev) => ({ ...prev, basicInfo: { ...prev.basicInfo, province: value, city: "", district: "" } }));
                        setMessage("");
                      }}
                    />
                    <SelectField
                      label="城市"
                      value={settings.basicInfo.city}
                      placeholder="请选择城市"
                      options={cityOptions.map(([, name]) => name)}
                      disabled={!settings.basicInfo.province}
                      onChange={(value) => {
                        setSettings((prev) => ({ ...prev, basicInfo: { ...prev.basicInfo, city: value, district: "" } }));
                        setMessage("");
                      }}
                    />
                    <SelectField
                      label="区县"
                      value={settings.basicInfo.district}
                      placeholder="请选择区县"
                      options={districtOptions.map(([, name]) => name)}
                      disabled={!settings.basicInfo.city}
                      onChange={(value) => update("basicInfo", "district", value)}
                    />
                  </div>
                  <div className="md:col-span-2 xl:col-span-3">
                    <TextField label="详细地址" value={settings.basicInfo.address} onChange={(value) => update("basicInfo", "address", value)} placeholder="例如：珠江新城华夏路 10 号" />
                  </div>
                  <BrandLogoField
                    value={settings.basicInfo.companyLogoUrl}
                    uploading={uploadingLogo}
                    disabled={branchInactive}
                    onUpload={uploadCompanyLogo}
                    onClear={() => update("basicInfo", "companyLogoUrl", "")}
                  />
                  <div className="md:col-span-2 xl:col-span-3">
                    <TextField
                      label="品牌英文标识"
                      value={settings.basicInfo.companyBrandSubtitle}
                      onChange={(value) => update("basicInfo", "companyBrandSubtitle", value)}
                      placeholder="留空则不显示"
                    />
                  </div>
                </SettingsSection>
              )}

              {activeTab === "collectionRules" && (
                <CollectionRulesSection
                  branchId={branchId}
                  collectionRules={settings.collectionRules}
                  onSchemesChange={updateCollectionSchemes}
                  onPaymentSettingChange={(field, value) => update("collectionRules", field, value)}
                />
              )}

              {activeTab === "contractTemplates" && (
                <ContractTemplatesSection branchId={branchId} disabled={branchInactive} />
              )}

              {activeTab === "charging" && (
                <SettingsSection title="收费比例" caption="用于报价、收款节点和成本核算的基础比例。">
                  <NumberField label="设计费比例" suffix="%" value={settings.charging.designFeeRate} onChange={(value) => update("charging", "designFeeRate", value)} />
                  <NumberField label="项目管理费比例" suffix="%" value={settings.charging.projectManagementRate} onChange={(value) => update("charging", "projectManagementRate", value)} />
                  <NumberField label="定金比例" suffix="%" value={settings.charging.depositRate} onChange={(value) => update("charging", "depositRate", value)} />
                  <NumberField label="尾款比例" suffix="%" value={settings.charging.finalPaymentRate} onChange={(value) => update("charging", "finalPaymentRate", value)} />
                  <NumberField label="责任险比例" suffix="%" value={settings.charging.liabilityInsuranceRate} onChange={(value) => update("charging", "liabilityInsuranceRate", value)} />
                  <NumberField label="税率" suffix="%" value={settings.charging.taxRate} onChange={(value) => update("charging", "taxRate", value)} />
                </SettingsSection>
              )}

              {activeTab === "approval" && <ApprovalFlowSection flows={settings.approvalFlows} roles={roles} users={users} onChange={updateApprovalFlows} />}

              {activeTab === "business" && (
                <div className="space-y-5">
                  <SettingsSection title="客户归属与跟进规则" caption="控制撞单、保护期、跟进提醒和客户基础资料要求。">
                    <NumberField label="撞单判断周期" suffix="天" value={settings.businessRules.duplicateCustomerDays} onChange={(value) => update("businessRules", "duplicateCustomerDays", value)} />
                    <NumberField label="客户保护期" suffix="天" value={settings.businessRules.customerProtectionDays} onChange={(value) => update("businessRules", "customerProtectionDays", value)} />
                    <NumberField label="跟进超时提醒" suffix="小时" value={settings.businessRules.followUpTimeoutHours} onChange={(value) => update("businessRules", "followUpTimeoutHours", value)} />
                    <NumberField label="自动流失周期" suffix="天" value={settings.businessRules.autoLoseDays} onChange={(value) => update("businessRules", "autoLoseDays", value)} />
                    <div>
                      <ToggleField
                        label="客户手机号必填"
                        checked={settings.businessRules.requiredCustomerPhone}
                        variant="standalone"
                        onChange={(value) => update("businessRules", "requiredCustomerPhone", value)}
                      />
                    </div>
                  </SettingsSection>

                  <DesignerAssignmentRulesSection
                    mode={settings.businessRules.designerAssignmentMode}
                    branchId={branchId}
                    dispatcher={settings.businessRules.designerAssignmentDispatcher}
                    organizations={dispatcherOrgOptions}
                    roles={dispatcherRoleOptions}
                    users={dispatcherUserOptions}
                    disabled={branchInactive}
                    onModeChange={(value) => update("businessRules", "designerAssignmentMode", value)}
                    onDispatcherChange={updateDesignerAssignmentDispatcher}
                  />
                </div>
              )}

              {activeTab === "site" && (
                <SettingsSection title="工地规则" caption="控制施工过程中的日志、照片、安全检查和材料验收要求。">
                  <ToggleField label="必须填写工地日志" checked={settings.siteRules.dailyLogRequired} onChange={(value) => update("siteRules", "dailyLogRequired", value)} />
                  <ToggleField label="工地日志必须上传照片" checked={settings.siteRules.photoRequired} onChange={(value) => update("siteRules", "photoRequired", value)} />
                  <ToggleField label="必须做安全检查" checked={settings.siteRules.safetyCheckRequired} onChange={(value) => update("siteRules", "safetyCheckRequired", value)} />
                  <ToggleField label="材料必须验收" checked={settings.siteRules.materialAcceptanceRequired} onChange={(value) => update("siteRules", "materialAcceptanceRequired", value)} variant="standalone" />
                  <NumberField label="进度更新频率" suffix="天" value={settings.siteRules.progressUpdateDays} onChange={(value) => update("siteRules", "progressUpdateDays", value)} />
                </SettingsSection>
              )}

              {activeTab === "construction" && (
                <ConstructionTemplatesSection
                  branchId={branchId}
                  templates={settings.constructionTemplates.templates}
                  onTemplatesChange={updateConstructionTemplates}
                />
              )}

              {activeTab === "order" && (
                <OrderSettingsSection
                  templates={settings.orderSettings.auxiliaryTemplates}
                  materials={branchMaterials}
                  suppliers={branchSuppliers}
                  onTemplatesChange={updateOrderTemplates}
                />
              )}

              {activeTab === "features" && (
                <SettingsSection title="功能开关" caption="控制该分公司可使用的业务模块和批量能力。">
                  <ToggleField label="客户导入" checked={settings.featureFlags.customerImport} onChange={(value) => update("featureFlags", "customerImport", value)} />
                  <ToggleField label="员工导入" checked={settings.featureFlags.employeeImport} onChange={(value) => update("featureFlags", "employeeImport", value)} />
                  <ToggleField label="报价合同模块" checked={settings.featureFlags.quotationModule} onChange={(value) => update("featureFlags", "quotationModule", value)} />
                  <ToggleField label="材料管理模块" checked={settings.featureFlags.materialsModule} onChange={(value) => update("featureFlags", "materialsModule", value)} />
                  <ToggleField label="财务中心模块" checked={settings.featureFlags.financeModule} onChange={(value) => update("featureFlags", "financeModule", value)} />
                  <ToggleField label="工地施工模块" checked={settings.featureFlags.constructionModule} onChange={(value) => update("featureFlags", "constructionModule", value)} />
                </SettingsSection>
              )}

              {activeTab === "notifications" && (
                <SettingsSection title="通知规则" caption="控制分公司内的业务提醒和审批提醒。">
                  <ToggleField label="跟进提醒" checked={settings.notifications.followUpReminder} onChange={(value) => update("notifications", "followUpReminder", value)} />
                  <ToggleField label="审批提醒" checked={settings.notifications.approvalReminder} onChange={(value) => update("notifications", "approvalReminder", value)} />
                  <ToggleField label="收款提醒" checked={settings.notifications.paymentReminder} onChange={(value) => update("notifications", "paymentReminder", value)} />
                  <ToggleField label="工期延期提醒" checked={settings.notifications.siteDelayReminder} onChange={(value) => update("notifications", "siteDelayReminder", value)} />
                </SettingsSection>
              )}

              {activeTab === "print" && (
                <PrintSettingsSection
                  quotationLogoUrl={settings.printSettings.quotationLogoUrl}
                  uploadingLogo={uploadingPrintLogo}
                  disabled={branchInactive}
                  onLogoUpload={uploadQuotationLogo}
                  onLogoClear={() => update("printSettings", "quotationLogoUrl", "")}
                  signatureLabels={settings.printSettings.quotationSignatureLabels}
                  onSignatureLabelsChange={updateQuotationSignatureLabels}
                />
              )}
            </>
          ) : (
            <div className="flex min-h-96 flex-col items-center justify-center rounded-lg border border-surface-200/90 bg-white/95 text-center text-surface-400">
              <SlidersHorizontal className="mb-3 h-10 w-10 text-surface-300" />
              <p className="text-sm">请选择一个分公司后维护规则。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PrintSettingsSection({
  quotationLogoUrl,
  uploadingLogo,
  disabled = false,
  onLogoUpload,
  onLogoClear,
  signatureLabels,
  onSignatureLabelsChange,
}: {
  quotationLogoUrl: string;
  uploadingLogo: boolean;
  disabled?: boolean;
  onLogoUpload: (file?: File | null) => void;
  onLogoClear: () => void;
  signatureLabels: string[];
  onSignatureLabelsChange: (labels: string[]) => void;
}) {
  const labels = signatureLabels.length ? signatureLabels.map((label) => String(label || "")).slice(0, 8) : defaultQuotationSignatureLabels;
  const previewLabels = normalizeQuotationSignatureLabels(labels);

  const updateLabel = (index: number, value: string) => {
    const next = labels.map((label, currentIndex) => currentIndex === index ? value : label);
    onSignatureLabelsChange(next);
  };

  const addLabel = () => {
    onSignatureLabelsChange([...labels, `签字栏${labels.length + 1}`]);
  };

  const removeLabel = (index: number) => {
    const next = labels.filter((_, currentIndex) => currentIndex !== index);
    onSignatureLabelsChange(next.length ? next : defaultQuotationSignatureLabels);
  };

  return (
    <div className="branch-settings-panel branch-print-settings rounded-lg border border-surface-200/90 bg-[#f7f9fc] p-4 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
      <div className="grid gap-4">
        <section className="rounded-lg border border-surface-200 bg-white p-4">
          <div className="mb-3 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <FileCheck2 className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold text-surface-900">打印标识</p>
              <p className="mt-0.5 text-xs text-surface-500">单独维护报价文件中使用的 Logo。</p>
            </div>
          </div>
          <BrandLogoField
            value={quotationLogoUrl}
            uploading={uploadingLogo}
            disabled={disabled}
            label="报价打印Logo"
            setText="已设置报价打印Logo"
            emptyText="未单独设置，打印时沿用品牌Logo"
            helpText="仅用于报价打印PDF和报价表格封面，不影响系统左上角品牌Logo。"
            uploadText="上传打印Logo"
            clearText="清除打印Logo"
            onUpload={onLogoUpload}
            onClear={onLogoClear}
          />
        </section>

        <section className="rounded-lg border border-surface-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ecfdf3] text-[#16824a]">
                <ListChecks className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-surface-900">报价单签字栏</p>
                <p className="mt-0.5 text-xs text-surface-500">维护该分公司装修报价单底部展示的签字项。</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onSignatureLabelsChange(defaultQuotationSignatureLabels)} className="btn-secondary">
                恢复默认
              </button>
              <button type="button" onClick={addLabel} className="btn-secondary" disabled={labels.length >= 8}>
                <Plus className="h-4 w-4" />
                添加签字栏
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {labels.map((label, index) => (
              <div key={`signature-label-${index}`} className="grid items-center gap-2 rounded-lg border border-surface-100 bg-surface-50/60 p-3 sm:grid-cols-[32px_minmax(0,1fr)_40px]">
                <span className="text-sm font-semibold text-surface-400">{index + 1}</span>
                <input
                  value={label}
                  onChange={(event) => updateLabel(index, event.target.value)}
                  onBlur={(event) => updateLabel(index, event.target.value.trim() || defaultQuotationSignatureLabels[index] || `签字栏${index + 1}`)}
                  className="input-field bg-white"
                  placeholder="例如：客户签字"
                />
                <button
                  type="button"
                  onClick={() => removeLabel(index)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-400 hover:bg-red-50 hover:text-red-600"
                  disabled={labels.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-surface-100 bg-surface-50/70 p-3">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#c25a18]" />
              <p className="text-sm font-semibold text-surface-900">打印预览</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {previewLabels.map((label, index) => (
                <div key={`${label}-${index}`} className="min-h-12 rounded-md bg-white px-3 py-2">
                  <p className="text-sm font-semibold text-surface-700">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SettingsSection({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="branch-settings-panel branch-settings-form-panel rounded-lg border border-surface-200/90 bg-white/95 p-5 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
      <div className="mb-4">
        <p className="font-semibold text-surface-900">{title}</p>
        <p className="mt-0.5 text-xs text-surface-500">{caption}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function DesignerAssignmentRulesSection({
  mode,
  branchId,
  dispatcher,
  organizations,
  roles,
  users,
  disabled = false,
  onModeChange,
  onDispatcherChange,
}: {
  mode: "direct" | "approval" | "dispatch";
  branchId: string;
  dispatcher: DesignerAssignmentDispatcher;
  organizations: OrgUnit[];
  roles: RoleOption[];
  users: UserOption[];
  disabled?: boolean;
  onModeChange: (value: "direct" | "approval" | "dispatch") => void;
  onDispatcherChange: (dispatcher: DesignerAssignmentDispatcher) => void;
}) {
  return (
    <section className="branch-settings-panel branch-assignment-panel rounded-lg border border-surface-200/90 bg-white/95 p-5 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          <UserRoundCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-surface-900">设计师派单规则</p>
          <p className="mt-0.5 text-xs leading-5 text-surface-500">设置设计师分配申请如何流转，以及由谁接收和处理申请。</p>
        </div>
      </div>

      <div className="mt-5">
        <label className="block max-w-2xl">
          <span className="mb-1 block text-sm font-medium text-surface-700">派单方式</span>
          <SystemSelect
            value={mode}
            disabled={disabled}
            onChange={(event) => onModeChange(event.target.value as "direct" | "approval" | "dispatch")}
            className="input-field disabled:cursor-not-allowed disabled:bg-surface-100 disabled:text-surface-400"
          >
            <option value="direct">直接分配设计师</option>
            <option value="approval">申请后由派单处理人直接分配</option>
            <option value="dispatch">申请后由派单处理人分派后分配</option>
          </SystemSelect>
          <span className="mt-1 block text-xs leading-5 text-surface-500">
            {mode === "dispatch"
              ? "申请会先交给下方设置的派单处理人。处理人可直接分配设计师，或从本分公司在职员工中分派一位处理人继续办理。"
              : mode === "approval"
                ? "申请会交给下方设置的派单处理人，由其直接完成设计师分配。"
                : "服务团队可直接指定设计师，无需发起分配申请。"}
          </span>
        </label>

        {mode !== "direct" && (
          <DesignerAssignmentDispatcherField
            branchId={branchId}
            dispatcher={dispatcher}
            organizations={organizations}
            roles={roles}
            users={users}
            disabled={disabled}
            onChange={onDispatcherChange}
          />
        )}
      </div>
    </section>
  );
}

function DesignerAssignmentDispatcherField({
  branchId,
  dispatcher,
  organizations,
  roles,
  users,
  disabled = false,
  onChange,
}: {
  branchId: string;
  dispatcher: DesignerAssignmentDispatcher;
  organizations: OrgUnit[];
  roles: RoleOption[];
  users: UserOption[];
  disabled?: boolean;
  onChange: (dispatcher: DesignerAssignmentDispatcher) => void;
}) {
  const [organizationQuery, setOrganizationQuery] = useState("");
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const sourceOption = designerAssignmentDispatcherSourceOptions.find((option) => option.value === dispatcher.source)
    || designerAssignmentDispatcherSourceOptions[0];
  const roleMap = useMemo(() => new Map(roles.map((role) => [role.code, role.name])), [roles]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const normalizedOrganizationQuery = organizationQuery.trim().toLowerCase();
  const filteredOrganizations = organizations.filter((organization) => {
    if (!normalizedOrganizationQuery) return true;
    return `${organization.name} ${organization.type}`.toLowerCase().includes(normalizedOrganizationQuery);
  });
  const selectedUsers = dispatcher.userIds.map((userId) => userMap.get(userId) || {
    id: userId,
    name: "员工已不可用",
    role: "",
    org_unit_name: "",
  });

  const updateSource = (source: DesignerAssignmentDispatcherSource) => {
    onChange({
      source,
      orgUnitIds: source === "org_manager" ? dispatcher.orgUnitIds : [],
      roleCodes: source === "role" ? dispatcher.roleCodes : [],
      userIds: source === "user" ? dispatcher.userIds : [],
    });
  };

  const toggleId = (field: "orgUnitIds" | "roleCodes" | "userIds", id: string) => {
    const currentIds = dispatcher[field];
    const nextIds = currentIds.includes(id)
      ? currentIds.filter((item) => item !== id)
      : [...currentIds, id];
    onChange({ ...dispatcher, [field]: nextIds });
  };

  const organizationTypeLabel = (type: string) => {
    if (type === "company") return "分公司";
    if (type === "store") return "门店";
    if (type === "dept") return "部门";
    if (type === "team") return "团队";
    return "组织";
  };

  return (
    <section className="mt-5 border-t border-surface-200 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <UserRoundCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-surface-900">派单处理人</p>
            <p className="mt-0.5 text-xs leading-5 text-surface-500">配置谁可以接收设计师分配申请。多人符合条件时，任意一人处理即可。</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <label className="block max-w-2xl">
          <span className="mb-1 block text-sm font-medium text-surface-700">处理人来源</span>
          <SystemSelect
            value={dispatcher.source}
            disabled={disabled}
            onChange={(event) => updateSource(event.target.value as DesignerAssignmentDispatcherSource)}
            className="input-field disabled:cursor-not-allowed disabled:bg-surface-100 disabled:text-surface-400"
          >
            {designerAssignmentDispatcherSourceOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SystemSelect>
          <span className="mt-1 block text-xs leading-5 text-surface-500">{sourceOption.description}</span>
        </label>

        {dispatcher.source === "store_manager" && (
          <div className="flex items-start gap-2 rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2.5 text-sm leading-5 text-primary-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            客户后续变更服务门店时，派单处理人会随客户当前所属门店自动变化。
          </div>
        )}

        {dispatcher.source === "org_manager" && (
          <div className="rounded-lg border border-surface-200 bg-white p-3">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-surface-800">指定组织</p>
                <p className="mt-0.5 text-xs text-surface-500">只可选择当前分公司及其下级组织；每个组织至少需要一位在职负责人。</p>
              </div>
              <span className="text-xs font-medium text-surface-500">已选择 {dispatcher.orgUnitIds.length} 个</span>
            </div>
            <div className="relative mb-3 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={organizationQuery}
                disabled={disabled}
                onChange={(event) => setOrganizationQuery(event.target.value)}
                className="input-field min-h-9 pl-9 text-sm disabled:cursor-not-allowed disabled:bg-surface-50"
                placeholder="搜索组织名称"
              />
            </div>
            {filteredOrganizations.length > 0 ? (
              <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                {filteredOrganizations.map((organization) => {
                  const selected = dispatcher.orgUnitIds.includes(organization.id);
                  return (
                    <button
                      key={organization.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleId("orgUnitIds", organization.id)}
                      className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected
                          ? "border-primary-300 bg-primary-50 text-primary-800"
                          : "border-surface-200 bg-white text-surface-700 hover:border-primary-200 hover:bg-primary-50/40"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-primary-600 bg-primary-600 text-white" : "border-surface-300 bg-white"}`}>
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{organization.name}</span>
                        <span className="mt-0.5 block text-[11px] text-surface-400">{organizationTypeLabel(organization.type)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-surface-200 py-6 text-center text-sm text-surface-400">没有找到可选组织</p>
            )}
          </div>
        )}

        {dispatcher.source === "role" && (
          <div className="rounded-lg border border-surface-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-surface-800">员工岗位</p>
                <p className="mt-0.5 text-xs text-surface-500">仅当前分公司内，属于所选岗位的在职员工可处理申请。</p>
              </div>
              <span className="text-xs font-medium text-surface-500">已选择 {dispatcher.roleCodes.length} 个</span>
            </div>
            {roles.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {roles.map((role) => {
                  const selected = dispatcher.roleCodes.includes(role.code);
                  return (
                    <button
                      key={role.code}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleId("roleCodes", role.code)}
                      className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected
                          ? "border-primary-300 bg-primary-50 text-primary-800"
                          : "border-surface-200 bg-white text-surface-700 hover:border-primary-200 hover:bg-primary-50/40"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-primary-600 bg-primary-600 text-white" : "border-surface-300 bg-white"}`}>
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate text-sm font-medium">{role.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-surface-200 py-6 text-center text-sm text-surface-400">暂无可选岗位</p>
            )}
          </div>
        )}

        {dispatcher.source === "user" && (
          <div className="rounded-lg border border-surface-200 bg-white p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-surface-800">指定员工</p>
                <p className="mt-0.5 text-xs leading-5 text-surface-500">可从当前分公司的在职员工中搜索并选择多人。</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowEmployeePicker(true)}
                className="btn-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Users className="h-4 w-4" />
                选择员工
              </button>
            </div>

            {selectedUsers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <span key={user.id} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border border-primary-100 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800">
                    <span className="truncate">{user.name}{user.org_unit_name ? ` / ${user.org_unit_name}` : ""}{user.role ? ` / ${roleMap.get(user.role) || user.role}` : ""}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleId("userIds", user.id)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-primary-700 hover:bg-primary-100 disabled:cursor-not-allowed"
                      aria-label={`移除${user.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-surface-200 py-5 text-center text-sm text-surface-400">尚未选择员工</p>
            )}
          </div>
        )}
      </div>

      {showEmployeePicker && (
        <DesignerAssignmentEmployeePickerModal
          branchId={branchId}
          roles={roles}
          selectedIds={dispatcher.userIds}
          onChange={(userIds) => onChange({ ...dispatcher, userIds })}
          onClose={() => setShowEmployeePicker(false)}
        />
      )}
    </section>
  );
}

function DesignerAssignmentEmployeePickerModal({
  branchId,
  roles,
  selectedIds,
  onChange,
  onClose,
}: {
  branchId: string;
  roles: RoleOption[];
  selectedIds: string[];
  onChange: (userIds: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<UserOption[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const roleMap = useMemo(() => new Map(roles.map((role) => [role.code, role.name])), [roles]);

  useEffect(() => {
    setOffset(0);
    setItems([]);
  }, [branchId, query]);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          picker: "1",
          branch_id: branchId,
          limit: "50",
          offset: String(offset),
        });
        const keyword = query.trim();
        if (keyword) params.set("q", keyword);
        const token = localStorage.getItem("zxgj_token");
        const response = await fetch(`/api/team?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "员工加载失败");
        const nextItems = (Array.isArray(data.items) ? data.items : []).map((user: any) => ({
          id: String(user.id || ""),
          name: String(user.name || "未命名员工"),
          role: String(user.role || ""),
          org_unit_id: user.org_unit_id || null,
          org_unit_name: user.org_unit_name || "",
        })).filter((user: UserOption) => user.id);
        setItems((previous) => {
          if (offset === 0) return nextItems;
          const seen = new Set(previous.map((user) => user.id));
          return [...previous, ...nextItems.filter((user: UserOption) => !seen.has(user.id))];
        });
        setTotal(Number(data.total || 0));
        setHasMore(Boolean(data.hasMore));
      } catch (requestError: any) {
        if (requestError?.name === "AbortError") return;
        setError(requestError?.message || "员工加载失败");
        if (offset === 0) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim() ? 260 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [branchId, offset, query]);

  const toggleUser = (userId: string) => {
    onChange(selectedIds.includes(userId)
      ? selectedIds.filter((id) => id !== userId)
      : [...selectedIds, userId]);
  };

  return (
    <div className="branch-settings-modal-overlay fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭选择员工" />
      <div className="branch-settings-modal relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 bg-surface-50 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-surface-900">选择派单处理员工</h3>
              <p className="mt-0.5 text-xs leading-5 text-surface-500">仅显示当前分公司下的在职员工，可搜索姓名、工号、手机号或所属组织。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 hover:bg-surface-100 hover:text-surface-800" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-surface-200 bg-white p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input-field pl-9"
              placeholder="搜索姓名、工号、手机号或组织"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-surface-500">
            <span>已选择 {selectedIds.length} 人</span>
            <span>{loading && offset === 0 ? "正在查询..." : `共 ${total} 位在职员工`}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : items.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((user) => {
                const selected = selectedIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className={`flex min-h-[58px] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-primary-300 bg-primary-50 text-primary-900"
                        : "border-surface-200 bg-white text-surface-800 hover:border-primary-200 hover:bg-primary-50/40"
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary-600 bg-primary-600 text-white" : "border-surface-300 bg-white"}`}>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{user.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-surface-500">{user.org_unit_name || "未设置组织"}{user.role ? ` / ${roleMap.get(user.role) || user.role}` : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : loading ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-surface-400">
              <Loader2 className="mb-3 h-6 w-6 animate-spin" />
              <p className="text-sm">正在加载员工</p>
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-surface-200 text-surface-400">
              <Users className="mb-3 h-8 w-8 text-surface-300" />
              <p className="text-sm">没有找到匹配员工</p>
              <p className="mt-1 text-xs">请更换关键词后重试</p>
            </div>
          )}

          {hasMore && !error && (
            <div className="mt-4 flex justify-center">
              <button type="button" disabled={loading} onClick={() => setOffset(items.length)} className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "加载中..." : "加载更多"}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-surface-200 bg-white px-5 py-4">
          <button type="button" className="btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}

function ConstructionTemplatesSection({
  branchId,
  templates,
  onTemplatesChange,
}: {
  branchId: string;
  templates: ConstructionTemplate[];
  onTemplatesChange: (templates: ConstructionTemplate[]) => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || "");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [stageModalId, setStageModalId] = useState<string | null>(null);
  const [nodeModalId, setNodeModalId] = useState<string | null>(null);
  const [draggingStageId, setDraggingStageId] = useState("");
  const [dragOverStageTarget, setDragOverStageTarget] = useState<DragTargetState>(null);
  const [recentlyMovedStageId, setRecentlyMovedStageId] = useState("");
  const pointerStageDragRef = useRef<PointerSortDragState>(null);
  const movedStageTimerRef = useRef<number | null>(null);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;
  const selectedStage = selectedTemplate?.stages.find((stage) => stage.id === selectedStageId) || selectedTemplate?.stages[0] || null;
  const selectedNode = selectedStage?.processNodes.find((node) => node.id === selectedNodeId) || selectedStage?.processNodes[0] || null;
  const getDurationRuleStats = useCallback((rules: ConstructionStageAreaDuration[]) => {
    const durationDays = rules.map((rule) => Number(rule.plannedDays || 0)).filter((day) => day > 0);
    const floorHeatingDurationDays = rules
      .map((rule) => Number(rule.floorHeatingDays ?? rule.plannedDays ?? 0))
      .filter((day) => day > 0);
    return {
      minDurationDays: durationDays.length ? Math.min(...durationDays) : 0,
      maxDurationDays: durationDays.length ? Math.max(...durationDays) : 0,
      minFloorHeatingDurationDays: floorHeatingDurationDays.length ? Math.min(...floorHeatingDurationDays) : 0,
      maxFloorHeatingDurationDays: floorHeatingDurationDays.length ? Math.max(...floorHeatingDurationDays) : 0,
      hasFloorHeatingDurationDifference: rules.some((rule) => Number(rule.floorHeatingDays ?? rule.plannedDays ?? 0) !== Number(rule.plannedDays || 0)),
    };
  }, []);
  const getStageDurationStats = useCallback((stage: ConstructionTemplateStage) => (
    stage.processNodes.reduce(
      (result, node) => {
        const nodeStats = getDurationRuleStats(node.areaDurationRules || []);
        return {
          minDurationDays: result.minDurationDays + nodeStats.minDurationDays,
          maxDurationDays: result.maxDurationDays + nodeStats.maxDurationDays,
          minFloorHeatingDurationDays: result.minFloorHeatingDurationDays + nodeStats.minFloorHeatingDurationDays,
          maxFloorHeatingDurationDays: result.maxFloorHeatingDurationDays + nodeStats.maxFloorHeatingDurationDays,
          hasFloorHeatingDurationDifference: result.hasFloorHeatingDurationDifference || nodeStats.hasFloorHeatingDurationDifference,
        };
      },
      { minDurationDays: 0, maxDurationDays: 0, minFloorHeatingDurationDays: 0, maxFloorHeatingDurationDays: 0, hasFloorHeatingDurationDifference: false },
    )
  ), [getDurationRuleStats]);
  const selectedTemplateStats = useMemo(() => {
    if (!selectedTemplate) return { minDurationDays: 0, maxDurationDays: 0, minFloorHeatingDurationDays: 0, maxFloorHeatingDurationDays: 0, hasFloorHeatingDurationDifference: false, constructionNodes: 0, acceptanceNodes: 0 };
    return selectedTemplate.stages.reduce(
      (result, stage) => {
        const stageStats = getStageDurationStats(stage);
        return {
          minDurationDays: result.minDurationDays + stageStats.minDurationDays,
          maxDurationDays: result.maxDurationDays + stageStats.maxDurationDays,
          minFloorHeatingDurationDays: result.minFloorHeatingDurationDays + stageStats.minFloorHeatingDurationDays,
          maxFloorHeatingDurationDays: result.maxFloorHeatingDurationDays + stageStats.maxFloorHeatingDurationDays,
          hasFloorHeatingDurationDifference: result.hasFloorHeatingDurationDifference || stageStats.hasFloorHeatingDurationDifference,
          constructionNodes: result.constructionNodes + stage.processNodes.filter((node) => node.type === "construction").length,
          acceptanceNodes: result.acceptanceNodes + stage.processNodes.filter((node) => node.type === "acceptance").length,
        };
      },
      { minDurationDays: 0, maxDurationDays: 0, minFloorHeatingDurationDays: 0, maxFloorHeatingDurationDays: 0, hasFloorHeatingDurationDifference: false, constructionNodes: 0, acceptanceNodes: 0 },
    );
  }, [getStageDurationStats, selectedTemplate]);
  const selectedTemplateDurationText = selectedTemplateStats.maxDurationDays <= 0
    ? "未设置"
    : (selectedTemplateStats.minDurationDays === selectedTemplateStats.maxDurationDays
      ? `${selectedTemplateStats.minDurationDays} 天`
      : `${selectedTemplateStats.minDurationDays}-${selectedTemplateStats.maxDurationDays} 天`);
  const selectedTemplateFloorHeatingDurationText = selectedTemplateStats.maxFloorHeatingDurationDays <= 0
    ? "未设置"
    : (selectedTemplateStats.minFloorHeatingDurationDays === selectedTemplateStats.maxFloorHeatingDurationDays
      ? `${selectedTemplateStats.minFloorHeatingDurationDays} 天`
      : `${selectedTemplateStats.minFloorHeatingDurationDays}-${selectedTemplateStats.maxFloorHeatingDurationDays} 天`);

  useEffect(() => {
    if (selectedTemplateId && templates.some((template) => template.id === selectedTemplateId)) return;
    setSelectedTemplateId(templates[0]?.id || "");
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedStageId("");
      return;
    }
    if (selectedStageId && selectedTemplate.stages.some((stage) => stage.id === selectedStageId)) return;
    setSelectedStageId(selectedTemplate.stages[0]?.id || "");
  }, [selectedStageId, selectedTemplate]);

  useEffect(() => {
    if (!selectedStage) {
      setSelectedNodeId("");
      return;
    }
    if (selectedNodeId && selectedStage.processNodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(selectedStage.processNodes[0]?.id || "");
  }, [selectedNodeId, selectedStage]);

  useEffect(() => {
    if (!stageModalId || selectedTemplate?.stages.some((stage) => stage.id === stageModalId)) return;
    setStageModalId(null);
  }, [selectedTemplate, stageModalId]);

  useEffect(() => {
    if (!nodeModalId || selectedStage?.processNodes.some((node) => node.id === nodeModalId)) return;
    setNodeModalId(null);
  }, [nodeModalId, selectedStage]);

  const normalizeStageOrder = (stages: ConstructionTemplateStage[]) => (
    stages.map((stage, index) => ({ ...stage, sortOrder: index + 1 }))
  );

  const normalizeNodeOrder = (nodes: ConstructionProcessNode[]) => (
    nodes.map((node, index) => ({ ...node, sortOrder: index + 1 }))
  );

  const updateTemplate = (templateId: string, patch: Partial<ConstructionTemplate>) => {
    onTemplatesChange(templates.map((template) => template.id === templateId ? { ...template, ...patch } : template));
  };

  const updateTemplatesWithDefault = (nextTemplates: ConstructionTemplate[]) => {
    const defaultTemplate = nextTemplates.find((template) => template.isDefault && template.isEnabled)
      || nextTemplates.find((template) => template.isDefault)
      || nextTemplates.find((template) => template.isEnabled)
      || nextTemplates[0];
    onTemplatesChange(nextTemplates.map((template) => ({
      ...template,
      isDefault: Boolean(defaultTemplate && template.id === defaultTemplate.id),
    })));
  };

  const createStage = (index: number): ConstructionTemplateStage => ({
    id: makeLocalId("CONSTRUCTION_STAGE"),
    name: `施工阶段 ${index + 1}`,
    code: "CUSTOM",
    sortOrder: index + 1,
    areaDurationRules: createDefaultAreaDurationRules(1),
    processNodes: [createProcessNode(0, "construction")],
  });

  const createProcessNode = (index: number, type: ConstructionProcessNodeType): ConstructionProcessNode => ({
    id: makeLocalId("CONSTRUCTION_NODE"),
    name: type === "acceptance" ? `验收节点 ${index + 1}` : `工序节点 ${index + 1}`,
    type,
    sortOrder: index + 1,
    areaDurationRules: createDefaultAreaDurationRules(1),
    constructionStandard: { description: "", descriptions: [], images: [], standards: [] },
    acceptanceStandard: { description: "", descriptions: [], images: [], standards: [] },
    logBroadcastScripts: [],
    photoRequired: true,
    customerConfirmRequired: false,
    projectManagerConfirmRequired: type === "acceptance",
  });

  const cloneNode = (node: ConstructionProcessNode): ConstructionProcessNode => ({
    ...node,
    id: makeLocalId("CONSTRUCTION_NODE"),
    areaDurationRules: (node.areaDurationRules || []).map((rule) => ({ ...rule, id: makeLocalId("CONSTRUCTION_AREA") })),
    constructionStandard: {
      description: node.constructionStandard.description,
      descriptions: [...node.constructionStandard.descriptions],
      images: node.constructionStandard.images.map((image) => ({ ...image, id: makeLocalId("CONSTRUCTION_IMAGE") })),
      standards: node.constructionStandard.standards.map((standard) => ({
        ...standard,
        id: makeLocalId("CONSTRUCTION_STANDARD"),
        images: standard.images.map((image) => ({ ...image, id: makeLocalId("CONSTRUCTION_IMAGE") })),
      })),
    },
    acceptanceStandard: {
      description: node.acceptanceStandard.description,
      descriptions: [...node.acceptanceStandard.descriptions],
      images: node.acceptanceStandard.images.map((image) => ({ ...image, id: makeLocalId("CONSTRUCTION_IMAGE") })),
      standards: node.acceptanceStandard.standards.map((standard) => ({
        ...standard,
        id: makeLocalId("CONSTRUCTION_STANDARD"),
        images: standard.images.map((image) => ({ ...image, id: makeLocalId("CONSTRUCTION_IMAGE") })),
      })),
    },
    logBroadcastScripts: [...node.logBroadcastScripts],
  });

  const cloneStage = (stage: ConstructionTemplateStage): ConstructionTemplateStage => ({
    ...stage,
    id: makeLocalId("CONSTRUCTION_STAGE"),
    areaDurationRules: stage.areaDurationRules.map((rule) => ({ ...rule, id: makeLocalId("CONSTRUCTION_AREA") })),
    processNodes: stage.processNodes.map(cloneNode),
  });

  const addTemplate = () => {
    const nextTemplate: ConstructionTemplate = {
      id: makeLocalId("CONSTRUCTION_TEMPLATE"),
      name: `施工模板 ${templates.length + 1}`,
      description: "用于维护该分公司自定义施工工序、图文工艺标准、验收标准和施工日志播报话术。",
      decorationType: "标准家装",
      isDefault: templates.length === 0,
      isEnabled: true,
      stages: [createStage(0)],
    };
    updateTemplatesWithDefault([...templates, nextTemplate]);
    setSelectedTemplateId(nextTemplate.id);
    setSelectedStageId(nextTemplate.stages[0].id);
    setSelectedNodeId(nextTemplate.stages[0].processNodes[0]?.id || "");
  };

  const duplicateTemplate = (template: ConstructionTemplate) => {
    const nextTemplate: ConstructionTemplate = {
      ...template,
      id: makeLocalId("CONSTRUCTION_TEMPLATE"),
      name: `${template.name} 副本`,
      isDefault: false,
      isEnabled: true,
      stages: template.stages.map(cloneStage),
    };
    updateTemplatesWithDefault([...templates, nextTemplate]);
    setSelectedTemplateId(nextTemplate.id);
    setSelectedStageId(nextTemplate.stages[0]?.id || "");
    setSelectedNodeId(nextTemplate.stages[0]?.processNodes[0]?.id || "");
  };

  const deleteTemplate = (templateId: string) => {
    if (templates.length <= 1) return;
    const nextTemplates = templates.filter((template) => template.id !== templateId);
    updateTemplatesWithDefault(nextTemplates);
    setSelectedTemplateId(nextTemplates[0]?.id || "");
    setSelectedStageId(nextTemplates[0]?.stages[0]?.id || "");
    setSelectedNodeId(nextTemplates[0]?.stages[0]?.processNodes[0]?.id || "");
  };

  const setDefaultTemplate = (templateId: string) => {
    onTemplatesChange(templates.map((template) => ({
      ...template,
      isDefault: template.id === templateId,
      isEnabled: template.id === templateId ? true : template.isEnabled,
    })));
  };

  const setTemplateEnabled = (templateId: string, isEnabled: boolean) => {
    updateTemplatesWithDefault(templates.map((template) => template.id === templateId ? { ...template, isEnabled } : template));
  };

  const updateStages = (stages: ConstructionTemplateStage[]) => {
    if (!selectedTemplate) return;
    updateTemplate(selectedTemplate.id, { stages: normalizeStageOrder(stages) });
  };

  const updateStage = (stageId: string, patch: Partial<ConstructionTemplateStage>) => {
    if (!selectedTemplate) return;
    updateStages(selectedTemplate.stages.map((stage) => stage.id === stageId ? { ...stage, ...patch } : stage));
  };

  const addStage = () => {
    if (!selectedTemplate) return;
    const nextStage = createStage(selectedTemplate.stages.length);
    updateStages([...selectedTemplate.stages, nextStage]);
    setSelectedStageId(nextStage.id);
    setSelectedNodeId(nextStage.processNodes[0]?.id || "");
    setStageModalId(nextStage.id);
  };

  const removeStage = (stageId: string) => {
    if (!selectedTemplate || selectedTemplate.stages.length <= 1) return;
    const nextStages = selectedTemplate.stages.filter((stage) => stage.id !== stageId);
    updateStages(nextStages);
    setSelectedStageId(nextStages[0]?.id || "");
    setSelectedNodeId(nextStages[0]?.processNodes[0]?.id || "");
    if (stageModalId === stageId) setStageModalId(null);
  };

  const reorderStageByTarget = useCallback((sourceId: string, targetId: string, placement: DragPlacement) => {
    if (!selectedTemplate || !sourceId || !targetId || sourceId === targetId) return;
    const nextStages = reorderByDropTarget(selectedTemplate.stages, sourceId, targetId, placement);
    if (nextStages === selectedTemplate.stages) return;
    const normalizedStages = nextStages.map((stage, index) => ({ ...stage, sortOrder: index + 1 }));
    onTemplatesChange(templates.map((template) => template.id === selectedTemplate.id ? { ...template, stages: normalizedStages } : template));
    setRecentlyMovedStageId(sourceId);
    if (movedStageTimerRef.current) window.clearTimeout(movedStageTimerRef.current);
    movedStageTimerRef.current = window.setTimeout(() => setRecentlyMovedStageId(""), 650);
  }, [onTemplatesChange, selectedTemplate, templates]);

  const getTargetStage = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const row = element?.closest<HTMLElement>("[data-construction-stage-row]");
    const stageId = row?.dataset.stageId || "";
    if (!row || !stageId) return null;
    return {
      id: stageId,
      placement: getVerticalDropPlacement(row.getBoundingClientRect(), clientY),
    };
  };

  const startPointerStageDrag = (event: ReactPointerEvent<HTMLButtonElement>, stageId: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    pointerStageDragRef.current = { sourceId: stageId, startX: event.clientX, startY: event.clientY, moved: false, targetId: stageId, placement: "after" };
    setDragOverStageTarget(null);
  };

  useEffect(() => () => {
    if (movedStageTimerRef.current) window.clearTimeout(movedStageTimerRef.current);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerStageDragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 4) {
        state.moved = true;
        setDraggingStageId(state.sourceId);
      }
      if (!state.moved) return;
      event.preventDefault();
      const target = getTargetStage(event.clientX, event.clientY);
      if (!target || target.id === state.sourceId) {
        state.targetId = null;
        setDragOverStageTarget(null);
        return;
      }
      state.targetId = target.id;
      state.placement = target.placement;
      setDragOverStageTarget(target);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerStageDragRef.current;
      if (!state) return;
      pointerStageDragRef.current = null;
      if (state.moved) {
        const target = getTargetStage(event.clientX, event.clientY);
        const targetId = target?.id ?? state.targetId;
        const placement = target?.placement ?? state.placement;
        if (targetId) reorderStageByTarget(state.sourceId, targetId, placement);
      }
      setDraggingStageId("");
      setDragOverStageTarget(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderStageByTarget]);

  const updateProcessNodes = (nodes: ConstructionProcessNode[]) => {
    if (!selectedStage) return;
    updateStage(selectedStage.id, { processNodes: normalizeNodeOrder(nodes) });
  };

  const updateProcessNode = (nodeId: string, patch: Partial<ConstructionProcessNode>) => {
    if (!selectedStage) return;
    updateProcessNodes(selectedStage.processNodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node));
  };

  const addProcessNode = (type: ConstructionProcessNodeType) => {
    if (!selectedStage) return;
    const nextNode = createProcessNode(selectedStage.processNodes.length, type);
    updateProcessNodes([...selectedStage.processNodes, nextNode]);
    setSelectedNodeId(nextNode.id);
    setNodeModalId(nextNode.id);
  };

  const removeProcessNode = (nodeId: string) => {
    if (!selectedStage || selectedStage.processNodes.length <= 1) return;
    const nextNodes = selectedStage.processNodes.filter((node) => node.id !== nodeId);
    updateProcessNodes(nextNodes);
    setSelectedNodeId(nextNodes[0]?.id || "");
    if (nodeModalId === nodeId) setNodeModalId(null);
  };

  const typeOptions = selectedTemplate && selectedTemplate.decorationType && !constructionTemplateTypeOptions.includes(selectedTemplate.decorationType)
    ? [selectedTemplate.decorationType, ...constructionTemplateTypeOptions]
    : constructionTemplateTypeOptions;

  const openStageModal = (stageId: string) => {
    const stage = selectedTemplate?.stages.find((item) => item.id === stageId);
    setSelectedStageId(stageId);
    setSelectedNodeId(stage?.processNodes[0]?.id || "");
    setStageModalId(stageId);
  };

  const openNodeModal = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setNodeModalId(nodeId);
  };

  const renderNodeDurationRuleSummary = (stage: ConstructionTemplateStage) => {
    const ruleCounts = stage.processNodes.map((node) => node.areaDurationRules?.length || 0).filter((count) => count > 0);
    if (!ruleCounts.length) return "未配置";
    const minCount = Math.min(...ruleCounts);
    const maxCount = Math.max(...ruleCounts);
    return minCount === maxCount ? `${minCount} 个面积区间` : `${minCount}-${maxCount} 个面积区间`;
  };

  const renderStageDuration = (stage: ConstructionTemplateStage) => {
    const stats = getStageDurationStats(stage);
    if (stats.maxDurationDays <= 0) return "未设置";
    return stats.minDurationDays === stats.maxDurationDays ? `${stats.minDurationDays} 天` : `${stats.minDurationDays}-${stats.maxDurationDays} 天`;
  };

  const renderStageNodeSummary = (stage: ConstructionTemplateStage) => {
    const constructionCount = stage.processNodes.filter((node) => node.type === "construction").length;
    const acceptanceCount = stage.processNodes.filter((node) => node.type === "acceptance").length;
    return `${constructionCount} 工序 / ${acceptanceCount} 验收`;
  };

  return (
    <div className="branch-settings-panel branch-construction-workbench space-y-4 rounded-lg border border-surface-200/90 bg-white/95 p-4 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Hammer className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-surface-900">施工模板</p>
            <p className="mt-0.5 text-xs leading-5 text-surface-500">
              维护分公司施工阶段、工序节点、节点工期、图文标准和日志话术。
            </p>
          </div>
        </div>
        <button type="button" onClick={addTemplate} className="btn-secondary shrink-0">
          <Plus className="h-4 w-4" />
          新增模板
        </button>
      </div>

      {selectedTemplate ? (
        <main className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-[#dce8f8] bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-surface-900">模板</p>
              <span className="text-xs font-semibold text-surface-500">{templates.length} 套</span>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {templates.map((template) => {
                const active = selectedTemplate.id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      setSelectedStageId(template.stages[0]?.id || "");
                      setSelectedNodeId(template.stages[0]?.processNodes[0]?.id || "");
                      setStageModalId(null);
                      setNodeModalId(null);
                    }}
                    className={cn(
                      "relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left shadow-none transition-colors",
                      active ? "border-[#dce8f8] bg-white" : "border-transparent bg-white hover:border-[#dce8f8] hover:bg-[#f8fbff]",
                    )}
                  >
                    {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-[#407AFF]" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-surface-900" title={template.name}>{template.name}</span>
                      {template.isDefault && <span className="shrink-0 rounded bg-[#edf4ff] px-1.5 py-0.5 text-[11px] font-semibold text-[#407AFF]">默认</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-surface-500">{template.decorationType || "未分类"} · {template.stages.length} 阶段</p>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <section className="rounded-lg border border-surface-200 bg-white p-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-surface-600">模板名称</span>
                    <input
                      value={selectedTemplate.name}
                      onChange={(event) => updateTemplate(selectedTemplate.id, { name: event.target.value })}
                      className="input-field h-12 min-h-12 py-0"
                      placeholder="例如：标准家装施工模板"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-surface-600">模板说明</span>
                    <textarea
                      value={selectedTemplate.description}
                      onChange={(event) => updateTemplate(selectedTemplate.id, { description: event.target.value })}
                      className="input-field min-h-[70px] resize-y py-2"
                      placeholder="说明该模板适用的施工范围、客户类型或门店标准"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-surface-600">适用类型</span>
                      <SystemSelect
                        value={selectedTemplate.decorationType}
                        onChange={(event) => updateTemplate(selectedTemplate.id, { decorationType: event.target.value })}
                        className="input-field h-12 min-h-12 py-0"
                      >
                        {typeOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </SystemSelect>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTemplateEnabled(selectedTemplate.id, !selectedTemplate.isEnabled)}
                        className={cn(
                          "inline-flex h-12 min-h-12 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors",
                          selectedTemplate.isEnabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-surface-200 bg-surface-50 text-surface-500",
                        )}
                      >
                        {selectedTemplate.isEnabled ? "已启用" : "已停用"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultTemplate(selectedTemplate.id)}
                        className={cn(
                          "inline-flex h-12 min-h-12 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors",
                          selectedTemplate.isDefault
                            ? "border-primary-200 bg-primary-50 text-primary-700"
                            : "border-surface-200 bg-white text-surface-600 hover:bg-primary-50 hover:text-primary-700",
                        )}
                      >
                        {selectedTemplate.isDefault ? "默认模板" : "设为默认"}
                      </button>
                      <button type="button" onClick={() => duplicateTemplate(selectedTemplate)} className="flex h-12 min-h-12 w-12 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 transition-colors hover:border-surface-300 hover:bg-surface-50 hover:text-surface-900" title="复制模板">
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(selectedTemplate.id)}
                        disabled={templates.length <= 1}
                        className="flex h-12 min-h-12 w-12 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title={templates.length <= 1 ? "至少保留一个模板" : "删除模板"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <span aria-hidden="true" className="mb-1.5 block h-4 select-none text-xs font-medium text-transparent">统计</span>
	                    <div className="grid gap-2 sm:grid-cols-[minmax(72px,0.8fr)_minmax(190px,1.5fr)_minmax(82px,0.8fr)]">
	                      <div className="flex h-12 min-h-12 items-center rounded-lg border border-surface-200 bg-surface-50/70 px-3">
	                        <p className="whitespace-nowrap text-sm font-semibold text-surface-900">阶段：{selectedTemplate.stages.length}</p>
	                      </div>
	                      <div className="flex min-h-12 flex-col justify-center rounded-lg border border-surface-200 bg-surface-50/70 px-3 py-1.5">
	                        <p className="whitespace-nowrap text-sm font-semibold text-surface-900">工期天数：{selectedTemplateDurationText}</p>
	                        {selectedTemplateStats.hasFloorHeatingDurationDifference && (
	                          <p className="mt-0.5 whitespace-nowrap text-xs font-semibold text-primary-700">有地暖：{selectedTemplateFloorHeatingDurationText}</p>
	                        )}
	                      </div>
	                      <div className="flex h-12 min-h-12 items-center rounded-lg border border-surface-200 bg-surface-50/70 px-3">
	                        <p className="whitespace-nowrap text-sm font-semibold text-surface-900">节点：{selectedTemplateStats.constructionNodes + selectedTemplateStats.acceptanceNodes} 个</p>
	                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="construction-stage-panel overflow-hidden rounded-lg border border-[#dce8f8] bg-white">
              <div className="construction-stage-header flex flex-col gap-3 border-b border-[#dce8f8] bg-[#f8fbff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#111827]">施工阶段</p>
                  <p className="mt-0.5 text-xs text-[#52647b]">拖动左侧手柄调整顺序，点击阶段进入配置。</p>
                </div>
                <button type="button" onClick={addStage} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#cfe1ff] bg-white px-3 text-sm font-semibold text-[#407AFF] transition-colors hover:bg-[#edf4ff]">
                  <Plus className="h-4 w-4" />
                  添加阶段
                </button>
              </div>

              <div className="construction-stage-list divide-y divide-[#E5E7EB] bg-white">
                {selectedTemplate.stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    data-construction-stage-row
                    data-stage-id={stage.id}
                    className={cn(
                      "construction-stage-row relative grid gap-3 bg-white px-4 py-3 transition-[background-color,border-color,box-shadow,opacity,transform] duration-200 ease-out lg:grid-cols-[88px_minmax(0,1fr)_132px_120px_144px_72px] lg:items-center",
                      draggingStageId === stage.id ? "construction-stage-row-dragging scale-[0.98] opacity-55 shadow-[0_8px_20px_rgba(31,41,53,0.08)]" : "hover:bg-[#f8fbff]",
                      recentlyMovedStageId === stage.id && "construction-sort-item-moved",
                      getDropIndicatorClass(dragOverStageTarget, stage.id, draggingStageId),
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <DragSortHandle
                        label={`拖动调整${stage.name || "施工阶段"}顺序`}
                        onPointerDown={(event) => startPointerStageDrag(event, stage.id)}
                      />
                      <div className="min-w-0">
                        <span className="construction-stage-index inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#f8fbff] text-xs font-bold text-[#407AFF] ring-1 ring-[#cfe1ff]">
                          {index + 1}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <button type="button" onClick={() => openStageModal(stage.id)} className="block max-w-full truncate text-left text-sm font-semibold text-surface-900 hover:text-primary-700" title={stage.name}>
                        {stage.name || "未命名阶段"}
                      </button>
                      <p className="mt-1 text-xs text-surface-500">{renderStageNodeSummary(stage)} · {stage.processNodes.reduce((sum, node) => sum + node.logBroadcastScripts.length, 0)} 条话术</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-surface-400">节点工期</p>
                      <p className="mt-1 text-sm font-semibold text-surface-800">{renderStageDuration(stage)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-surface-400">面积区间</p>
                      <p className="mt-1 text-sm font-semibold text-surface-800">{renderNodeDurationRuleSummary(stage)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-surface-400">节点配置</p>
                      <p className="mt-1 text-sm font-semibold text-surface-800">{stage.processNodes.length} 个节点</p>
                    </div>
                    <div className="flex items-center lg:justify-end">
                      <button type="button" onClick={() => openStageModal(stage.id)} className="btn-secondary min-h-9 px-3 text-sm">
                        配置
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {stageModalId && selectedStage && (
            <ConstructionStageModal
              stage={selectedStage}
              canDelete={selectedTemplate.stages.length > 1}
              onClose={() => {
                setStageModalId(null);
                setNodeModalId(null);
              }}
              onStageChange={(patch) => updateStage(selectedStage.id, patch)}
              onDeleteStage={() => removeStage(selectedStage.id)}
              onAddNode={addProcessNode}
              onOpenNode={openNodeModal}
              onReorderNodes={updateProcessNodes}
              onDeleteNode={removeProcessNode}
            />
          )}

          {nodeModalId && selectedNode && (
            <ConstructionNodeModal
              branchId={branchId}
              node={selectedNode}
              onClose={() => setNodeModalId(null)}
              onChange={(patch) => updateProcessNode(selectedNode.id, patch)}
            />
          )}
        </main>
      ) : (
        <main className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-surface-300 bg-white text-center text-surface-400">
          <div>
            <Hammer className="mx-auto mb-3 h-10 w-10 text-surface-300" />
            <p className="text-sm font-semibold text-surface-700">先创建一个施工模板</p>
            <button type="button" onClick={addTemplate} className="btn-secondary mt-3">
              <Plus className="h-4 w-4" />
              新增模板
            </button>
          </div>
        </main>
      )}
      <style jsx global>{`
        .construction-stage-panel,
        .construction-stage-list,
        .construction-stage-row {
          background: #ffffff !important;
        }
        .construction-stage-header {
          background: #f8fbff !important;
        }
        .construction-stage-row:hover {
          background: #f8fbff !important;
        }
        .construction-stage-row-dragging {
          background: #edf4ff !important;
        }
        .construction-stage-index {
          background: #f8fbff !important;
          color: #407aff !important;
          box-shadow: inset 0 0 0 1px #cfe1ff !important;
        }
        .construction-sort-drop-before,
        .construction-sort-drop-after {
          position: relative;
          z-index: 1;
        }
        .construction-sort-drop-before::before,
        .construction-sort-drop-after::after {
          content: "";
          position: absolute;
          left: 14px;
          right: 14px;
          height: 2px;
          border-radius: 999px;
          background: rgba(64, 122, 255, 0.96);
          box-shadow: 0 0 0 4px rgba(64, 122, 255, 0.12), 0 8px 18px rgba(64, 122, 255, 0.16);
          pointer-events: none;
          z-index: 6;
          animation: construction-sort-line-in 160ms ease-out;
        }
        .construction-sort-drop-before::before {
          top: -2px;
        }
        .construction-sort-drop-after::after {
          bottom: -2px;
        }
        [data-construction-node-row].construction-sort-drop-before::before {
          top: -6px;
        }
        [data-construction-node-row].construction-sort-drop-after::after {
          bottom: -6px;
        }
        .construction-sort-item-moved {
          animation: construction-sort-settle 560ms ease-out;
          box-shadow: inset 3px 0 0 rgba(64, 122, 255, 0.62), 0 0 0 1px rgba(64, 122, 255, 0.14), 0 8px 18px rgba(64, 122, 255, 0.08);
        }
        @keyframes construction-sort-line-in {
          0% {
            opacity: 0;
            transform: scaleX(0.72);
          }
          100% {
            opacity: 1;
            transform: scaleX(1);
          }
        }
        @keyframes construction-sort-settle {
          0% {
            transform: translateY(-8px);
            background-color: rgba(64, 122, 255, 0.12);
          }
          55% {
            transform: translateY(2px);
            background-color: rgba(64, 122, 255, 0.07);
          }
          100% {
            transform: translateY(0);
            background-color: transparent;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .construction-sort-drop-before::before,
          .construction-sort-drop-after::after,
          .construction-sort-item-moved {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function ConstructionStageModal({
  stage,
  canDelete,
  onClose,
  onStageChange,
  onDeleteStage,
  onAddNode,
  onOpenNode,
  onReorderNodes,
  onDeleteNode,
}: {
  stage: ConstructionTemplateStage;
  canDelete: boolean;
  onClose: () => void;
  onStageChange: (patch: Partial<ConstructionTemplateStage>) => void;
  onDeleteStage: () => void;
  onAddNode: (type: ConstructionProcessNodeType) => void;
  onOpenNode: (nodeId: string) => void;
  onReorderNodes: (nodes: ConstructionProcessNode[]) => void;
  onDeleteNode: (nodeId: string) => void;
}) {
  const [draggingNodeId, setDraggingNodeId] = useState("");
  const [dragOverNodeTarget, setDragOverNodeTarget] = useState<DragTargetState>(null);
  const [recentlyMovedNodeId, setRecentlyMovedNodeId] = useState("");
  const pointerNodeDragRef = useRef<PointerSortDragState>(null);
  const movedNodeTimerRef = useRef<number | null>(null);

  const reorderNodeByTarget = useCallback((sourceId: string, targetId: string, placement: DragPlacement) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const nextNodes = reorderByDropTarget(stage.processNodes, sourceId, targetId, placement);
    if (nextNodes === stage.processNodes) return;
    onReorderNodes(nextNodes);
    setRecentlyMovedNodeId(sourceId);
    if (movedNodeTimerRef.current) window.clearTimeout(movedNodeTimerRef.current);
    movedNodeTimerRef.current = window.setTimeout(() => setRecentlyMovedNodeId(""), 650);
  }, [onReorderNodes, stage.processNodes]);

  const getTargetNode = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const row = element?.closest<HTMLElement>("[data-construction-node-row]");
    const nodeId = row?.dataset.nodeId || "";
    if (!row || !nodeId) return null;
    return {
      id: nodeId,
      placement: getVerticalDropPlacement(row.getBoundingClientRect(), clientY),
    };
  };

  const startPointerNodeDrag = (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    pointerNodeDragRef.current = { sourceId: nodeId, startX: event.clientX, startY: event.clientY, moved: false, targetId: nodeId, placement: "after" };
    setDragOverNodeTarget(null);
  };

  useEffect(() => () => {
    if (movedNodeTimerRef.current) window.clearTimeout(movedNodeTimerRef.current);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerNodeDragRef.current;
      if (!state) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.moved && distance > 4) {
        state.moved = true;
        setDraggingNodeId(state.sourceId);
      }
      if (!state.moved) return;
      event.preventDefault();
      const target = getTargetNode(event.clientX, event.clientY);
      if (!target || target.id === state.sourceId) {
        state.targetId = null;
        setDragOverNodeTarget(null);
        return;
      }
      state.targetId = target.id;
      state.placement = target.placement;
      setDragOverNodeTarget(target);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerNodeDragRef.current;
      if (!state) return;
      pointerNodeDragRef.current = null;
      if (state.moved) {
        const target = getTargetNode(event.clientX, event.clientY);
        const targetId = target?.id ?? state.targetId;
        const placement = target?.placement ?? state.placement;
        if (targetId) reorderNodeByTarget(state.sourceId, targetId, placement);
      }
      setDraggingNodeId("");
      setDragOverNodeTarget(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderNodeByTarget]);

  const renderNodeDuration = (node: ConstructionProcessNode) => {
    const days = (node.areaDurationRules || []).map((rule) => Number(rule.plannedDays || 0)).filter((day) => day > 0);
    if (!days.length) return "未设置工期";
    const minDays = Math.min(...days);
    const maxDays = Math.max(...days);
    return minDays === maxDays ? `${minDays} 天` : `${minDays}-${maxDays} 天`;
  };

  return (
    <div className="branch-settings-modal-overlay fixed inset-0 z-[70] flex items-center justify-center bg-surface-900/35 px-4 py-6 backdrop-blur-[2px]">
      <div className="branch-settings-modal relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.22)]" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 bg-surface-50/80 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <ClipboardList className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-surface-900">{stage.name || "未命名阶段"}</p>
              <p className="mt-0.5 text-xs text-surface-500">维护当前阶段的工序节点，节点内设置工期和标准。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 hover:bg-surface-100" title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className="rounded-lg border border-surface-200 bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-surface-600">阶段名称</span>
                <input
                  value={stage.name}
                  onChange={(event) => onStageChange({ name: event.target.value })}
                  className="input-field min-h-10 py-2"
                  placeholder="例如：水电验收"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onDeleteStage} disabled={!canDelete} className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" title={canDelete ? "删除阶段" : "至少保留一个阶段"}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-lg border border-surface-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-surface-200 bg-surface-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-surface-900">工序节点</p>
                <p className="mt-0.5 text-xs text-surface-500">拖动左侧手柄调整顺序，点击节点维护工期、标准和话术。</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => onAddNode("construction")} className="btn-secondary min-h-9 justify-center px-3 text-sm">
                  <Plus className="h-4 w-4" />
                  工序
                </button>
                <button type="button" onClick={() => onAddNode("acceptance")} className="btn-secondary min-h-9 justify-center px-3 text-sm">
                  <Plus className="h-4 w-4" />
                  验收
                </button>
              </div>
            </div>

            <div className="space-y-2 p-3">
              {stage.processNodes.map((node, index) => (
                <div
                  key={node.id}
                  data-construction-node-row
                  data-node-id={node.id}
                  className={cn(
                    "relative rounded-lg border border-surface-200 bg-white px-3 py-2.5 transition-[background-color,border-color,box-shadow,opacity,transform] duration-200 ease-out hover:border-primary-100 hover:bg-primary-50/20",
                    draggingNodeId === node.id && "scale-[0.98] border-primary-200 bg-primary-50/45 opacity-55 shadow-[0_8px_20px_rgba(31,41,53,0.08)]",
                    recentlyMovedNodeId === node.id && "construction-sort-item-moved",
                    getDropIndicatorClass(dragOverNodeTarget, node.id, draggingNodeId),
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <DragSortHandle
                        label={`拖动调整${node.name || "工序节点"}顺序`}
                        onPointerDown={(event) => startPointerNodeDrag(event, node.id)}
                      />
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-xs font-bold text-surface-600">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => onOpenNode(node.id)} className="block max-w-full truncate text-left text-sm font-semibold leading-5 text-surface-900 hover:text-primary-700" title={node.name}>
                          {node.name || "未命名节点"}
                        </button>
                        <p className="mt-0.5 truncate text-xs text-surface-500">工期 {renderNodeDuration(node)} · {node.areaDurationRules?.length || 0} 个面积区间</p>
                      </div>
                      <span className={cn("shrink-0 rounded px-2 py-1 text-xs font-semibold", node.type === "acceptance" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-primary-50 text-primary-700 ring-1 ring-primary-100")}>
                        {node.type === "acceptance" ? "验收" : "施工"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <button type="button" onClick={() => onOpenNode(node.id)} className="btn-secondary min-h-9 px-3 text-sm">配置</button>
                      <button type="button" onClick={() => onDeleteNode(node.id)} disabled={stage.processNodes.length <= 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" title={stage.processNodes.length <= 1 ? "至少保留一个节点" : "删除节点"}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-200 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="btn-primary">完成</button>
        </div>
      </div>
    </div>
  );
}

function ConstructionNodeModal({
  branchId,
  node,
  onClose,
  onChange,
}: {
  branchId: string;
  node: ConstructionProcessNode;
  onClose: () => void;
  onChange: (patch: Partial<ConstructionProcessNode>) => void;
}) {
  return (
    <div className="branch-settings-modal-overlay fixed inset-0 z-[80] flex items-center justify-center bg-surface-900/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="branch-settings-modal relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.24)]" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 bg-surface-50/80 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", node.type === "acceptance" ? "bg-emerald-50 text-emerald-700" : "bg-primary-50 text-primary-700")}>
              {node.type === "acceptance" ? <FileCheck2 className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-surface-900">{node.name || "未命名节点"}</p>
              <p className="mt-0.5 text-xs text-surface-500">{node.type === "acceptance" ? "验收节点" : "施工节点"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500 hover:bg-surface-100" title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ConstructionProcessNodeEditor
            branchId={branchId}
            node={node}
            onChange={onChange}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-surface-200 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="btn-primary">完成</button>
        </div>
      </div>
    </div>
  );
}

function createDefaultAreaDurationRules(baseDays: number): ConstructionStageAreaDuration[] {
  return [
    { id: makeLocalId("CONSTRUCTION_AREA"), minArea: 0, maxArea: 80, plannedDays: baseDays, floorHeatingDays: baseDays },
    { id: makeLocalId("CONSTRUCTION_AREA"), minArea: 80, maxArea: 120, plannedDays: Math.ceil(baseDays * 1.15), floorHeatingDays: Math.ceil(baseDays * 1.15) },
    { id: makeLocalId("CONSTRUCTION_AREA"), minArea: 120, maxArea: 160, plannedDays: Math.ceil(baseDays * 1.35), floorHeatingDays: Math.ceil(baseDays * 1.35) },
    { id: makeLocalId("CONSTRUCTION_AREA"), minArea: 160, maxArea: null, plannedDays: Math.ceil(baseDays * 1.6), floorHeatingDays: Math.ceil(baseDays * 1.6) },
  ];
}

function ConstructionProcessNodeEditor({
  branchId,
  node,
  onChange,
}: {
  branchId: string;
  node: ConstructionProcessNode;
  onChange: (patch: Partial<ConstructionProcessNode>) => void;
}) {
  const activeStandard = node.type === "acceptance" ? node.acceptanceStandard : node.constructionStandard;
  const isAcceptanceNode = node.type === "acceptance";
  const standardTitle = isAcceptanceNode ? "各项验收标准内容" : "图文标准施工工艺规范";
  const standardItems = activeStandard.standards.length
    ? activeStandard.standards
    : (activeStandard.descriptions.length
      ? activeStandard.descriptions.map((description, index) => ({
        id: makeLocalId("CONSTRUCTION_STANDARD"),
        description,
        images: index === 0 ? activeStandard.images : [],
        required: true,
        photoRequired: true,
      }))
      : (activeStandard.description || activeStandard.images.length
        ? [{ id: makeLocalId("CONSTRUCTION_STANDARD"), description: activeStandard.description, images: activeStandard.images, required: true, photoRequired: true }]
        : []));

  const updateStandard = (patch: Partial<typeof activeStandard>) => {
    if (node.type === "acceptance") {
      onChange({ acceptanceStandard: { ...node.acceptanceStandard, ...patch } });
      return;
    }
    onChange({ constructionStandard: { ...node.constructionStandard, ...patch } });
  };
  const updateStandardItems = (items: ConstructionStandardItem[]) => {
    const normalizedItems = items.map((item) => item.description.trim()).filter(Boolean);
    updateStandard({
      standards: items,
      descriptions: normalizedItems,
      description: normalizedItems.join("\n"),
      images: items.flatMap((item) => item.images),
    });
  };
  const durationRules = node.areaDurationRules?.length ? node.areaDurationRules : createDefaultAreaDurationRules(1);
  const updateDurationRules = (rules: ConstructionStageAreaDuration[]) => {
    onChange({
      areaDurationRules: rules.map((rule) => ({
        ...rule,
        minArea: Math.max(0, Number(rule.minArea || 0)),
        maxArea: rule.maxArea === null ? null : Math.max(0, Number(rule.maxArea || 0)),
        plannedDays: Math.max(0, Number(rule.plannedDays || 0)),
        floorHeatingDays: Math.max(0, Number(rule.floorHeatingDays ?? rule.plannedDays ?? 0)),
      })).sort((left, right) => left.minArea - right.minArea),
    });
  };
  const updateDurationRule = (ruleId: string, patch: Partial<ConstructionStageAreaDuration>) => {
    updateDurationRules(durationRules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule));
  };
  const addDurationRule = () => {
    const lastRule = durationRules[durationRules.length - 1];
    const nextMinArea = lastRule?.maxArea ?? lastRule?.minArea ?? 0;
    updateDurationRules([...durationRules, { id: makeLocalId("CONSTRUCTION_AREA"), minArea: nextMinArea, maxArea: null, plannedDays: 1, floorHeatingDays: 1 }]);
  };
  const removeDurationRule = (ruleId: string) => {
    if (durationRules.length <= 1) return;
    updateDurationRules(durationRules.filter((rule) => rule.id !== ruleId));
  };

  return (
    <main className="space-y-3">
      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-surface-600">节点名称</span>
            <input
              value={node.name}
              onChange={(event) => onChange({ name: event.target.value })}
              className="input-field min-h-10 py-2"
              placeholder={node.type === "acceptance" ? "例如：水电隐蔽验收" : "例如：开槽布管"}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-surface-600">节点类型</span>
            <SystemSelect
              value={node.type}
              onChange={(event) => onChange({
                type: event.target.value as ConstructionProcessNodeType,
                projectManagerConfirmRequired: event.target.value === "acceptance" ? true : node.projectManagerConfirmRequired,
              })}
              className="input-field min-h-10 py-2"
            >
              <option value="construction">施工节点</option>
              <option value="acceptance">验收节点</option>
            </SystemSelect>
          </label>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <ToggleField label="要求上传照片" checked={node.photoRequired} onChange={(value) => onChange({ photoRequired: value })} />
          <ToggleField label="项目经理确认" checked={node.projectManagerConfirmRequired} onChange={(value) => onChange({ projectManagerConfirmRequired: value })} />
          <ToggleField label="客户确认" checked={node.customerConfirmRequired} onChange={(value) => onChange({ customerConfirmRequired: value })} />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-surface-200 bg-surface-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-surface-900">节点工期</p>
            <p className="mt-0.5 text-xs text-surface-500">按房屋面积设置该节点需要的施工天数。</p>
          </div>
          <button type="button" onClick={addDurationRule} className="btn-secondary min-h-9 shrink-0 px-3 text-sm">
            <Plus className="h-4 w-4" />
            添加区间
          </button>
        </div>
        <div className="grid grid-cols-[minmax(82px,1fr)_minmax(82px,1fr)_72px_104px_36px] gap-2 border-b border-surface-100 bg-surface-50/50 px-3 py-2 text-[11px] font-semibold text-surface-500">
          <span>最小面积（㎡）</span>
          <span>最大面积（㎡）</span>
          <span className="text-right">工期天数</span>
          <span className="text-right">有地暖天数</span>
          <span aria-hidden="true" />
        </div>
        <div className="divide-y divide-surface-100">
          {durationRules.map((rule) => (
            <div key={rule.id} className="grid grid-cols-[minmax(82px,1fr)_minmax(82px,1fr)_72px_104px_36px] items-center gap-2 px-3 py-2">
              <input
                type="number"
                min="0"
                value={rule.minArea}
                onChange={(event) => updateDurationRule(rule.id, { minArea: Number(event.target.value || 0) })}
                className="input-field h-9 min-h-9 min-w-0 py-1.5 text-sm"
                aria-label="最小面积"
              />
              <input
                type="number"
                min="0"
                value={rule.maxArea ?? ""}
                onChange={(event) => updateDurationRule(rule.id, { maxArea: event.target.value === "" ? null : Number(event.target.value) })}
                className="input-field h-9 min-h-9 min-w-0 py-1.5 text-sm"
                placeholder="以上"
                aria-label="最大面积"
              />
              <input
                type="number"
                min="0"
                value={rule.plannedDays}
                onChange={(event) => updateDurationRule(rule.id, { plannedDays: Number(event.target.value || 0) })}
                className="input-field h-9 min-h-9 min-w-0 py-1.5 text-right text-sm"
                aria-label="工期天数"
              />
              <input
                type="number"
                min="0"
                value={rule.floorHeatingDays ?? rule.plannedDays ?? 0}
                onChange={(event) => updateDurationRule(rule.id, { floorHeatingDays: Number(event.target.value || 0) })}
                className="input-field h-9 min-h-9 min-w-0 py-1.5 text-right text-sm"
                aria-label="有地暖天数"
              />
              <button type="button" onClick={() => removeDurationRule(rule.id)} disabled={durationRules.length <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40" title="删除区间">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <ConstructionStandardItemsEditor
          branchId={branchId}
          title={standardTitle}
          mode={isAcceptanceNode ? "acceptance" : "construction"}
          items={standardItems}
          addLabel={isAcceptanceNode ? "添加验收项" : "添加工艺规范"}
          placeholder={isAcceptanceNode ? "例如：冷热水管打压 30 分钟无掉压，水电走向拍照留存。" : "例如：线管固定牢固，横平竖直，强弱电保持合理间距。"}
          onChange={updateStandardItems}
        />
      </section>

      <ConstructionStringListEditor
        title="日志快捷话术"
        items={node.logBroadcastScripts}
        addLabel="添加话术"
        placeholder="例如：今日完成水电开槽及线管预埋，现场已按规范拍照留档。"
        onChange={(items) => onChange({ logBroadcastScripts: items })}
      />
    </main>
  );
}

function ConstructionStandardItemsEditor({
  branchId,
  title,
  mode = "construction",
  items,
  addLabel,
  placeholder,
  onChange,
}: {
  branchId: string;
  title: string;
  mode?: "construction" | "acceptance";
  items: ConstructionStandardItem[];
  addLabel: string;
  placeholder: string;
  onChange: (items: ConstructionStandardItem[]) => void;
}) {
  const [uploadingStandardId, setUploadingStandardId] = useState("");
  const [message, setMessage] = useState("");
  const isAcceptanceMode = mode === "acceptance";
  const updateItem = (standardId: string, patch: Partial<ConstructionStandardItem>) => {
    onChange(items.map((item) => item.id === standardId ? { ...item, ...patch } : item));
  };
  const addItem = () => {
    onChange([...items, { id: makeLocalId("CONSTRUCTION_STANDARD"), description: "", images: [], required: true, photoRequired: true }]);
  };
  const removeItem = (standardId: string) => {
    onChange(items.filter((item) => item.id !== standardId));
  };
  const removeImage = (standardId: string, imageId: string) => {
    onChange(items.map((item) => item.id === standardId
      ? { ...item, images: item.images.filter((image) => image.id !== imageId) }
      : item));
  };
  const uploadImages = async (standardId: string, files?: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;
    if (!branchId) {
      setMessage("请先选择分公司后再上传图片");
      return;
    }
    const invalidFile = selectedFiles.find((file) => !file.type.startsWith("image/"));
    if (invalidFile) {
      setMessage("只能上传图片文件");
      return;
    }
    setUploadingStandardId(standardId);
    setMessage("");
    try {
      const uploadedImages: ConstructionStandardImage[] = [];
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("org_unit_id", branchId);
        formData.append("category", "施工模板标准图片");
        const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "图片上传失败");
        const url = String(result.file_url || "").trim();
        if (!url) throw new Error("图片上传失败");
        uploadedImages.push({
          id: makeLocalId("CONSTRUCTION_IMAGE"),
          url,
          caption: String(result.file_name || file.name || ""),
        });
      }
      onChange(items.map((item) => item.id === standardId
        ? { ...item, images: [...item.images, ...uploadedImages] }
        : item));
      setMessage(uploadedImages.length > 1 ? `已上传 ${uploadedImages.length} 张图片，请记得保存设置` : "图片已上传，请记得保存设置");
    } catch (error: any) {
      setMessage(error?.message || "图片上传失败");
    } finally {
      setUploadingStandardId("");
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-surface-900">{title}</p>
          {items.length > 0 && (
            <span className="shrink-0 rounded-md bg-surface-100 px-2 py-1 text-xs font-semibold text-surface-500">{items.length} 条</span>
          )}
        </div>
        <button type="button" onClick={addItem} className="btn-secondary min-h-9 px-3 text-sm">
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => {
          const uploading = uploadingStandardId === item.id;
          return (
            <div key={item.id} className="rounded-lg border border-surface-200 bg-surface-50/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-primary-700 ring-1 ring-surface-200">{index + 1}</span>
                  <p className="truncate text-sm font-semibold text-surface-900">{isAcceptanceMode ? "验收项" : "标准"} {index + 1}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-400 hover:bg-red-50 hover:text-red-600"
                  title={isAcceptanceMode ? "删除验收项" : "删除标准"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {isAcceptanceMode ? (
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-surface-600">验收标准内容</span>
                    <textarea
                      value={item.description}
                      onChange={(event) => updateItem(item.id, { description: event.target.value })}
                      onBlur={(event) => updateItem(item.id, { description: event.target.value.trim() })}
                      className="input-field min-h-[72px] resize-y py-2 text-sm"
                      placeholder={placeholder}
                    />
                  </label>
                  <div className="flex flex-nowrap gap-2 lg:pt-[22px]">
                    <ConstructionChecklistOption
                      label="必验"
                      checked={item.required !== false}
                      onChange={(value) => updateItem(item.id, { required: value })}
                    />
                    <ConstructionChecklistOption
                      label="必须上传图片"
                      checked={item.photoRequired !== false}
                      onChange={(value) => updateItem(item.id, { photoRequired: value })}
                    />
                  </div>
                </div>
              ) : (
                <textarea
                  value={item.description}
                  onChange={(event) => updateItem(item.id, { description: event.target.value })}
                  onBlur={(event) => updateItem(item.id, { description: event.target.value.trim() })}
                  className="input-field min-h-[72px] resize-y py-2 text-sm"
                  placeholder={placeholder}
                />
              )}

              <div className="mt-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-surface-500">{isAcceptanceMode ? "标准图片" : "图片"}：{item.images.length} 张</p>
                  <label className={cn("btn-secondary min-h-8 cursor-pointer px-2.5 text-xs", uploading && "pointer-events-none opacity-60")}>
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploading ? "上传中" : (isAcceptanceMode ? "上传标准图片" : "上传图片")}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (event) => {
                        const input = event.currentTarget;
                        await uploadImages(item.id, input.files);
                        input.value = "";
                      }}
                    />
                  </label>
                </div>
                {item.images.length > 0 ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {item.images.map((image) => (
                      <div key={image.id} className="group relative overflow-hidden rounded-lg border border-surface-200 bg-white">
                        <div className="aspect-[4/3] bg-surface-100">
                          <NativeImage src={image.url} alt={image.caption || "标准图片"} className="h-full w-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImage(item.id, image.id)}
                          className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-white/95 text-red-600 transition-colors hover:bg-red-50"
                          title="删除图片"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <button
            type="button"
            onClick={addItem}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-200 bg-white px-4 py-3 text-sm text-surface-400 transition-colors hover:border-primary-200 hover:bg-primary-50/30 hover:text-primary-700"
          >
            <Plus className="h-4 w-4" />
            {isAcceptanceMode ? "暂无验收项，点击添加" : "暂无标准，点击添加"}
          </button>
        )}
        {message && (
          <p className={cn("text-xs", message.includes("已上传") ? "text-emerald-600" : "text-red-600")}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function ConstructionChecklistOption({
  label,
  checked,
  className,
  onChange,
}: {
  label: string;
  checked: boolean;
  className?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
        checked
          ? "border-primary-200 bg-primary-50 text-primary-700"
          : "border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:bg-surface-50",
        className,
      )}
    >
      <span className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        checked ? "border-primary-600 bg-primary-600 text-white" : "border-surface-300 bg-white",
      )}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      {label}
    </button>
  );
}

function ConstructionStringListEditor({
  title,
  items,
  addLabel,
  placeholder,
  onChange,
}: {
  title: string;
  items: string[];
  addLabel: string;
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const updateItem = (index: number, value: string) => {
    onChange(items.map((item, currentIndex) => currentIndex === index ? value : item));
  };
  const removeItem = (index: number) => {
    onChange(items.filter((_, currentIndex) => currentIndex !== index));
  };
  const addItem = () => {
    onChange([...items, ""]);
  };

  return (
    <section className="rounded-lg border border-surface-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-surface-900">{title}</p>
          {items.length > 0 && (
            <span className="shrink-0 rounded-md bg-surface-100 px-2 py-1 text-xs font-semibold text-surface-500">{items.length} 条</span>
          )}
        </div>
        <button type="button" onClick={addItem} className="btn-secondary min-h-9 px-3 text-sm">
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="grid items-center gap-2 rounded-lg border border-surface-200 bg-surface-50/60 p-2 sm:grid-cols-[28px_minmax(0,1fr)_36px]">
            <span className="text-center text-xs font-semibold text-surface-400">{index + 1}</span>
            <input
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              onBlur={(event) => updateItem(index, event.target.value.trim())}
              className="input-field min-h-9 py-1.5 text-sm"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-400 hover:bg-red-50 hover:text-red-600"
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <button
            type="button"
            onClick={addItem}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-200 bg-white px-4 py-3 text-sm text-surface-400 transition-colors hover:border-primary-200 hover:bg-primary-50/30 hover:text-primary-700"
          >
            <Plus className="h-4 w-4" />
            暂无话术，点击添加
          </button>
        )}
      </div>
    </section>
  );
}
