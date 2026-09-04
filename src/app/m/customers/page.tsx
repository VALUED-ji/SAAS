"use client";

import { customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import { useAuth } from "@/lib/auth";
import { formatUserRoleLabel } from "@/lib/userRoleLabels";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { AmapLocationPicker, type LocationPick } from "@/components/ui/AddCustomerModal";
import { AlertCircle, ArrowLeft, BriefcaseBusiness, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, CircleUserRound, Clock3, Copy, Loader2, MapPin, Megaphone, Network, Paintbrush, Plus, RotateCcw, Search, SlidersHorizontal, Star, Store, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import styles from "../mobile.module.css";

type Customer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  source?: string | null;
  address?: string | null;
  house_address?: string | null;
  building_no?: string | null;
  unit_no?: string | null;
  room_no?: string | null;
  no_room_number?: boolean | number | null;
  area_size?: number | string | null;
  decoration_type?: string | null;
  status?: string | null;
  intention?: string | null;
  service_store?: string | null;
  advisor_name?: string | null;
  advisor_avatar?: string | null;
  designer_name?: string | null;
  designer_avatar?: string | null;
  inviter_avatar?: string | null;
  created_by_avatar?: string | null;
  last_followup_at?: string | null;
  latest_followup_content?: string | null;
  next_followup_at?: string | null;
  has_overdue_followup?: boolean | number | null;
  overdue_followup_days?: number | string | null;
  deleted_at?: string | null;
};

type CustomerFilterOption = { value: string; label: string };

type CustomerScopeHelp = Exclude<CustomerOwnerScope, "all">;

const customerScopeHelpContent: Record<CustomerScopeHelp, { title: string; description: string }> = {
  service: { title: "我服务的", description: "我参与服务团队、由我邀约创建，或我负责项目的客户" },
  managed: { title: "我管理的", description: "我负责的组织及其下级组织名下的客户" },
};

type CustomerListResponse = {
  customers: Customer[];
  total: number;
  statusCounts: Record<string, number>;
  sourceOptions: string[];
  storeOptions: string[];
  advisorOptions: CustomerFilterOption[];
  designerOptions: CustomerFilterOption[];
  intentionOptions: string[];
};

type CustomerOwnerScope = "service" | "managed";
type DepartmentFilterType = "business" | "design" | "service_store" | "participant";
type FilterPickerField = "advisor" | "designer" | "department";
type FilterDateField = "createdFrom" | "createdTo";

type StorePickerOption = {
  id: string;
  name: string;
  parent_name?: string | null;
};

type StorePickerResponse = {
  stores?: StorePickerOption[];
  page?: number;
  hasMore?: boolean;
  message?: string;
};

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "NEW", label: "新客户" },
  { value: "CONTACTED", label: "已联系" },
  { value: "INVITED", label: "已到店" },
  { value: "MEASURED", label: "已量房" },
  { value: "DEPOSITED", label: "已交定金" },
  { value: "PROPOSAL", label: "方案报价" },
  { value: "SIGNED", label: "已签约" },
  { value: "LOST", label: "失败/流失" },
];

const sourceDefaults = ["门店", "转介绍", "小程序", "广告投放", "抖音", "小红书", "其它"];
const intentionOptions = ["★", "★★", "★★★", "★★★★", "★★★★★"];
const houseTypeOptions = ["一室一厅", "两室一厅", "两室两厅", "三室一厅", "三室两厅", "四室及以上", "别墅/复式"];
const decorationTypeOptions = ["全包", "半包", "清包"];

type CustomerOrgUnit = { id: string; name: string; type: string; parent_id: string | null; is_active?: number };
type CustomerEmployeeOption = { id: string; name: string; phone: string; role: string; role_name?: string | null; org_unit_id: string | null; is_active: number };
type CustomerPickerField = "service_store" | "inviter_id" | "source" | "house_type" | "decoration_type" | "is_delivered" | "intention";
type CustomerPickerOption = { value: string; label: string; description?: string };

type FilterOrgOption = CustomerOrgUnit & { depth: number; path: string };

const departmentFilterTypes: { value: DepartmentFilterType; label: string }[] = [
  { value: "business", label: "业务部门" },
  { value: "design", label: "设计部门" },
  { value: "service_store", label: "服务门店" },
  { value: "participant", label: "全部参与部门" },
];

const followupFilterOptions = [
  { value: "", label: "全部" },
  { value: "overdue", label: "跟进逾期" },
  { value: "today", label: "今日跟进" },
  { value: "upcoming", label: "后续已安排" },
  { value: "none", label: "未安排跟进" },
];

function buildFilterOrgOptions(units: CustomerOrgUnit[]) {
  const map = new Map<string, CustomerOrgUnit & { children: CustomerOrgUnit[] }>();
  units.forEach((unit) => map.set(unit.id, { ...unit, children: [] }));
  const roots: (CustomerOrgUnit & { children: CustomerOrgUnit[] })[] = [];
  units.forEach((unit) => {
    const node = map.get(unit.id);
    if (!node) return;
    const parent = unit.parent_id ? map.get(unit.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const options: FilterOrgOption[] = [];
  const walk = (node: CustomerOrgUnit & { children: CustomerOrgUnit[] }, depth: number, ancestors: string[]) => {
    const pathParts = [...ancestors, node.name];
    options.push({ id: node.id, name: node.name, type: node.type, parent_id: node.parent_id, is_active: node.is_active, depth, path: pathParts.join(" / ") });
    node.children.forEach((child) => walk(child as CustomerOrgUnit & { children: CustomerOrgUnit[] }, depth + 1, pathParts));
  };
  roots.forEach((root) => walk(root, 0, []));
  return options;
}

function formatFilterDate(value: string) {
  if (!value) return "不限";
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function MobileFilterDatePicker({ title, value, onClose, onConfirm }: { title: string; value: string; onClose: () => void; onConfirm: (value: string) => void }) {
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()), []);
  const [draft, setDraft] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const seed = value || today;
    const [year, month] = seed.split("-").map(Number);
    return new Date(year, month - 1, 1);
  });
  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { date, value: dateValue, outside: date.getMonth() !== month };
    });
  }, [visibleMonth]);

  return (
    <div className={styles.mobilePickerBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`${styles.mobileDateTimePicker} ${styles.filterDatePicker}`} role="dialog" aria-modal="true" aria-labelledby="filter-date-title">
        <div className={styles.mobilePickerHandle} />
        <header className={styles.mobilePickerHeader}><div><h3 id="filter-date-title">{title}</h3><p>{draft ? formatFilterDate(draft) : "暂未限制日期"}</p></div><button type="button" onClick={onClose} aria-label="关闭"><X /></button></header>
        <div className={styles.mobilePickerBody}>
          <div className={styles.mobileCalendarHeader}><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="上个月"><ChevronLeft /></button><strong>{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</strong><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="下个月"><ChevronRight /></button></div>
          <div className={styles.mobileWeekdays}>{["日", "一", "二", "三", "四", "五", "六"].map((item) => <span key={item}>{item}</span>)}</div>
          <div className={styles.mobileCalendarGrid}>{days.map((item) => <button type="button" key={item.value} data-outside={item.outside || undefined} data-today={item.value === today || undefined} data-active={item.value === draft || undefined} onClick={() => setDraft(item.value)}>{item.date.getDate()}</button>)}</div>
        </div>
        <footer className={`${styles.mobilePickerFooter} ${styles.filterDateFooter}`}><button type="button" onClick={() => setDraft("")}>清除</button><button type="button" onClick={() => { setDraft(today); const [year, month] = today.split("-").map(Number); setVisibleMonth(new Date(year, month - 1, 1)); }}>今天</button><button type="button" data-primary onClick={() => { onConfirm(draft); onClose(); }}><Check />确定</button></footer>
      </section>
    </div>
  );
}

const initialCustomerForm = {
  name: "", phone: "", weixin: "", source: "", address: "", house_address: "",
  address_location_name: "", address_location_address: "", address_latitude: "", address_longitude: "",
  building_no: "", unit_no: "", room_no: "", no_room_number: false, area_size: "", house_type: "",
  decoration_type: "", budget: "", is_delivered: "", intention: "", requirements: "", remarks: "",
  service_store: "", inviter_id: "",
};

function findNearestCustomerOrg(units: CustomerOrgUnit[], orgUnitId: string | null | undefined, type: string) {
  if (!orgUnitId) return null;
  const map = new Map(units.map((unit) => [unit.id, unit]));
  let current = map.get(orgUnitId);
  while (current) {
    if (current.type === type) return current;
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return null;
}

function isCustomerOrgDescendant(units: CustomerOrgUnit[], orgUnitId: string | null | undefined, ancestorId: string) {
  if (!orgUnitId) return false;
  const map = new Map(units.map((unit) => [unit.id, unit]));
  let current = map.get(orgUnitId);
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return false;
}

function budgetWanToYuan(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 10000 * 100) / 100 : null;
}

function roomDisplay(customer: Customer) {
  if (customer.no_room_number) return customer.address || customer.house_address || "暂无房号";
  const parts = [customer.building_no, customer.unit_no, customer.room_no].map((item) => String(item || "").trim()).filter(Boolean);
  return [customer.address || customer.house_address, parts.join("-")].filter(Boolean).join(" ") || "地址待完善";
}

function formatFollowupDate(value?: string | null) {
  if (!value) return "未安排下次跟进";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(date);
}

function CardStaffName({ name, avatar, emptyText }: { name?: string | null; avatar?: string | null; emptyText: string }) {
  const displayName = String(name || "").trim();
  const label = displayName || emptyText;
  return (
    <span className={styles.cardStaffValue} data-empty={!displayName || undefined}>
      <span className={styles.cardStaffAvatar}>
        {avatar ? <Image src={avatar} alt="" width={18} height={18} unoptimized /> : label.slice(0, 1)}
      </span>
      <span>{label}</span>
    </span>
  );
}

function CustomerSheet({
  onClose,
  onCreated,
  sourceOptions,
}: {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  sourceOptions: string[];
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...initialCustomerForm });
  const [orgUnits, setOrgUnits] = useState<CustomerOrgUnit[]>([]);
  const [employees, setEmployees] = useState<CustomerEmployeeOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [pickerField, setPickerField] = useState<CustomerPickerField | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const allStores = useMemo(() => orgUnits.filter((unit) => unit.type === "store" && Number(unit.is_active ?? 1) === 1), [orgUnits]);
  const currentUserStore = useMemo(() => findNearestCustomerOrg(orgUnits, user?.org_unit_id, "store"), [orgUnits, user?.org_unit_id]);
  const currentUserActiveStore = currentUserStore && Number(currentUserStore.is_active ?? 1) === 1 ? currentUserStore : null;
  const currentUserCompany = useMemo(() => findNearestCustomerOrg(orgUnits, user?.org_unit_id, "company"), [orgUnits, user?.org_unit_id]);
  const inviterOptions = useMemo(() => employees.filter((employee) => Number(employee.is_active) === 1 && (!currentUserCompany || isCustomerOrgDescendant(orgUnits, employee.org_unit_id, currentUserCompany.id))), [currentUserCompany, employees, orgUnits]);

  useEffect(() => {
    Promise.all([
      fetch("/api/org").then((response) => response.json()),
      fetch("/api/team").then((response) => response.json()),
    ]).then(([orgData, teamData]) => {
      setOrgUnits(Array.isArray(orgData) ? orgData : []);
      setEmployees(Array.isArray(teamData) ? teamData : []);
    }).catch(() => {
      setOrgUnits([]);
      setEmployees([]);
    });
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      service_store: current.service_store || currentUserActiveStore?.name || "",
      inviter_id: current.inviter_id || (inviterOptions.some((employee) => employee.id === user?.id) ? user?.id || "" : ""),
    }));
  }, [currentUserActiveStore?.name, inviterOptions, user?.id]);

  const update = (key: keyof typeof initialCustomerForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  };

  const pickerConfigs = useMemo<Record<CustomerPickerField, {
    title: string;
    subtitle: string;
    placeholder: string;
    searchable?: boolean;
    options: CustomerPickerOption[];
  }>>(() => ({
    service_store: {
      title: "选择服务门店",
      subtitle: "客户将归属到所选门店",
      placeholder: "请选择服务门店",
      searchable: true,
      options: allStores.map((store) => ({ value: store.name, label: store.name })),
    },
    inviter_id: {
      title: "选择邀约人",
      subtitle: "可按姓名、电话或岗位搜索",
      placeholder: "请选择邀约人",
      searchable: true,
      options: inviterOptions.map((employee) => ({
        value: employee.id,
        label: employee.name,
        description: [employee.phone, formatUserRoleLabel(employee.role, employee.role_name)].filter(Boolean).join(" · "),
      })),
    },
    source: {
      title: "选择客户来源",
      subtitle: "用于后续渠道统计",
      placeholder: "请选择来源",
      options: sourceOptions.map((item) => ({ value: item, label: item })),
    },
    house_type: {
      title: "选择户型",
      subtitle: "选择最接近的房屋户型",
      placeholder: "请选择户型",
      options: houseTypeOptions.map((item) => ({ value: item, label: item })),
    },
    decoration_type: {
      title: "选择装修类型",
      subtitle: "选择客户意向的承包方式",
      placeholder: "请选择装修类型",
      options: decorationTypeOptions.map((item) => ({ value: item, label: item })),
    },
    is_delivered: {
      title: "选择交房状态",
      subtitle: "确认房屋当前是否已经交付",
      placeholder: "请选择",
      options: ["未交房", "已交房"].map((item) => ({ value: item, label: item })),
    },
    intention: {
      title: "选择客户意向",
      subtitle: "星级越高，客户意向越明确",
      placeholder: "请选择意向度",
      options: intentionOptions.map((item) => ({ value: item, label: item })),
    },
  }), [allStores, inviterOptions, sourceOptions]);

  const activePicker = pickerField ? pickerConfigs[pickerField] : null;
  const activePickerValue = pickerField ? String(form[pickerField] || "") : "";
  const filteredPickerOptions = useMemo(() => {
    if (!activePicker) return [];
    const keyword = pickerQuery.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return activePicker.options;
    return activePicker.options.filter((option) => `${option.label} ${option.description || ""}`.toLocaleLowerCase("zh-CN").includes(keyword));
  }, [activePicker, pickerQuery]);

  const openPicker = (field: CustomerPickerField) => {
    setPickerQuery("");
    setPickerField(field);
  };

  const closePicker = () => {
    setPickerField(null);
    setPickerQuery("");
  };

  const selectPickerOption = (value: string) => {
    if (!pickerField) return;
    update(pickerField, value);
    closePicker();
  };

  const renderPickerTrigger = (field: CustomerPickerField) => {
    const config = pickerConfigs[field];
    const selectedOption = config.options.find((option) => option.value === form[field]);
    return (
      <button
        type="button"
        className={styles.customerMobileSelectTrigger}
        data-empty={selectedOption ? undefined : "true"}
        onClick={() => openPicker(field)}
        aria-haspopup="dialog"
      >
        <span>{selectedOption?.label || config.placeholder}</span>
        <ChevronRight />
      </button>
    );
  };

  const setAddressText = (value: string) => {
    setForm((current) => ({ ...current, address: value, address_location_name: "", address_location_address: "", address_latitude: "", address_longitude: "" }));
    if (errors.address) setErrors((current) => ({ ...current, address: "" }));
  };

  const setNoRoomNumber = (checked: boolean) => {
    setForm((current) => ({ ...current, no_room_number: checked, ...(checked ? { building_no: "", unit_no: "", room_no: "" } : {}) }));
  };

  const applyPickedLocation = (location: LocationPick) => {
    setForm((current) => ({
      ...current,
      address: location.name || location.address,
      house_address: location.address || location.name,
      address_location_name: location.name || location.address,
      address_location_address: location.address || location.name,
      address_latitude: location.latitude === null ? "" : String(location.latitude),
      address_longitude: location.longitude === null ? "" : String(location.longitude),
    }));
    setErrors((current) => ({ ...current, address: "" }));
    setMapPickerOpen(false);
  };

  const checkDuplicatePhone = async (phoneValue: string) => {
    if (phoneValue.length !== 11) {
      setDuplicateWarning("");
      return;
    }
    try {
      const response = await fetch(`/api/customers?mode=phone-check&phone=${encodeURIComponent(phoneValue)}`);
      const data = await response.json().catch(() => ({}));
      setDuplicateWarning(response.ok && Number(data.count || 0) > 0 ? `该手机号已有 ${Number(data.count)} 位客户记录，确认继续新增？` : "");
    } catch {
      setDuplicateWarning("");
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "请输入客户姓名";
    if (!form.address.trim()) nextErrors.address = "请输入小区/楼盘";
    if (!form.area_size || Number(form.area_size) <= 0) nextErrors.area_size = "请输入装修面积";
    if (form.phone.trim() && form.phone.length !== 11) nextErrors.phone = "手机号必须为11位数字";
    if (!form.phone.trim() && !form.weixin.trim()) {
      nextErrors.phone = "手机号和微信号至少填一项";
      nextErrors.weixin = "手机号和微信号至少填一项";
    }
    setErrors(nextErrors);
    setMessage(Object.values(nextErrors)[0] || "");
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          address: form.address.trim(),
          house_address: form.house_address.trim() || form.address.trim(),
          address_location_name: form.address_location_name.trim() || form.address.trim(),
          address_location_address: form.address_location_address.trim() || form.house_address.trim() || form.address.trim(),
          address_latitude: form.address_latitude ? Number(form.address_latitude) : null,
          address_longitude: form.address_longitude ? Number(form.address_longitude) : null,
          area_size: Number(form.area_size),
          budget: budgetWanToYuan(form.budget),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "客户创建失败");
      onCreated(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "客户创建失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.sheetBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className={`${styles.sheet} ${styles.customerCreateSheet}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="customer-create-title">
        <header className={styles.customerCreateHeader}>
          <button type="button" onClick={onClose} aria-label="返回客户列表"><ArrowLeft /></button>
          <div><div id="customer-create-title" className={styles.customerCreateTitle}>新增客户</div><div className={styles.customerCreateSubtitle}>填写基础资料，创建后仍可继续完善</div></div>
        </header>
        <div className={styles.customerCreateBody}>
          {message && <div className={styles.message}>{message}</div>}
          <section className={styles.customerCreateSection}>
            <div className={styles.customerCreateSectionHeading}><b>归属信息</b><small>门店与邀约人员</small></div>
            <div className={styles.customerCreateFields}>
              <div className={styles.customerCreateField}><span>服务客户门店</span>{currentUserActiveStore ? <b className={styles.customerReadonlyValue}>{form.service_store || currentUserActiveStore.name}</b> : renderPickerTrigger("service_store")}</div>
              <div className={styles.customerCreateField}><span>邀约人</span>{renderPickerTrigger("inviter_id")}</div>
            </div>
          </section>

          <section className={styles.customerCreateSection}>
            <div className={styles.customerCreateSectionHeading}><b>基础信息</b><small>姓名与联系方式</small></div>
            <div className={styles.customerCreateFields}>
              <label className={styles.customerCreateField} data-error={errors.name || undefined}><span className={styles.required}>客户姓名</span><input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="请输入客户姓名" autoComplete="name" /></label>
              <div className={styles.customerCreateField}><span>客户来源</span>{renderPickerTrigger("source")}</div>
              <label className={styles.customerCreateField} data-error={errors.phone || undefined}><span>手机号</span><input inputMode="numeric" maxLength={11} value={form.phone} onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 11))} onBlur={(event) => checkDuplicatePhone(event.target.value)} placeholder="请输入11位手机号" autoComplete="tel" /></label>
              <label className={styles.customerCreateField} data-error={errors.weixin || undefined}><span>微信号</span><input value={form.weixin} onChange={(e) => update("weixin", e.target.value)} placeholder="请输入微信号" /></label>
              {duplicateWarning && <div className={styles.customerDuplicateWarning}><AlertCircle /><span><b>重复提醒：</b>{duplicateWarning}</span></div>}
            </div>
          </section>

          <section className={styles.customerCreateSection}>
            <div className={styles.customerCreateSectionHeading}><b>房屋信息</b><small>地址、房号与面积</small></div>
            <div className={styles.customerCreateFields}>
              <div className={styles.customerCreateField} data-error={errors.address || undefined}><span className={styles.required}>小区 / 楼盘</span><div className={styles.customerAddressControl}><input value={form.address} onChange={(event) => setAddressText(event.target.value)} placeholder="请输入小区或楼盘名称" /><button type="button" onClick={() => setMapPickerOpen(true)}><MapPin />选点</button></div></div>
              {form.address_latitude && form.address_longitude && <div className={styles.customerLocationStatus}><MapPin />已保存实际地址定位</div>}
              <label className={styles.customerCreateField}><span>房屋地址</span><input value={form.house_address} onChange={(event) => update("house_address", event.target.value)} placeholder="选点后自动带出，也可手动填写" /></label>
              <div className={styles.customerRoomBlock}>
                <div className={styles.customerRoomHeading}><span>房号信息 <small>选填</small></span><label><input type="checkbox" checked={form.no_room_number} onChange={(event) => setNoRoomNumber(event.target.checked)} /><i>{form.no_room_number ? <Check /> : null}</i>暂无房号</label></div>
                <div className={styles.customerRoomFields}>
                  <label><span>楼栋</span><input disabled={form.no_room_number} value={form.building_no} onChange={(e) => update("building_no", e.target.value)} placeholder="如 3栋" /></label>
                  <label><span>单元</span><input disabled={form.no_room_number} value={form.unit_no} onChange={(e) => update("unit_no", e.target.value)} placeholder="如 2单元" /></label>
                  <label><span>房室</span><input disabled={form.no_room_number} value={form.room_no} onChange={(e) => update("room_no", e.target.value)} placeholder="如 1201室" /></label>
                </div>
              </div>
              <label className={styles.customerCreateField} data-error={errors.area_size || undefined}><span className={styles.required}>装修面积</span><span className={styles.customerAreaInput}><input inputMode="decimal" value={form.area_size} onChange={(e) => update("area_size", e.target.value.replace(/[^\d.]/g, ""))} placeholder="请输入面积" /><em>㎡</em></span></label>
              <div className={styles.customerCreateField}><span>户型</span>{renderPickerTrigger("house_type")}</div>
            </div>
          </section>

          <section className={styles.customerCreateSection}>
            <div className={styles.customerCreateSectionHeading}><b>装修需求</b><small>预算、交房与补充说明</small></div>
            <div className={styles.customerCreateFields}>
              <div className={styles.customerCreateField}><span>装修类型</span>{renderPickerTrigger("decoration_type")}</div>
              <label className={styles.customerCreateField}><span>装修预算</span><span className={styles.customerAreaInput}><input inputMode="decimal" value={form.budget} onChange={(event) => update("budget", event.target.value.replace(/[^\d.]/g, ""))} placeholder="例如 20" /><em>万元</em></span></label>
              <div className={styles.customerCreateField}><span>是否交房</span>{renderPickerTrigger("is_delivered")}</div>
              <div className={styles.customerCreateField}><span>客户意向</span>{renderPickerTrigger("intention")}</div>
            </div>
            <label className={styles.customerRequirementField}><span>装修需求</span><textarea value={form.requirements} onChange={(e) => update("requirements", e.target.value)} placeholder="请描述客户的装修需求" /></label>
            <label className={styles.customerRequirementField}><span>备注</span><textarea value={form.remarks} onChange={(e) => update("remarks", e.target.value)} placeholder="填写其他需要说明的信息" /></label>
          </section>
          <p className={styles.customerCreateHint}>手机号和微信号至少填写一项，带 * 的信息将用于后续业务流程。</p>
        </div>
        <div className={styles.customerCreateFooter}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <UserPlus />}创建客户</button>
        </div>
      </form>
      {pickerField && activePicker && (
        <div className={styles.customerOptionBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePicker()}>
          <section className={styles.customerOptionSheet} role="dialog" aria-modal="true" aria-labelledby="customer-option-title">
            <div className={styles.customerOptionHandle} />
            <header className={styles.customerOptionHeader}>
              <div>
                <h3 id="customer-option-title">{activePicker.title}</h3>
                <p>{activePicker.subtitle}</p>
              </div>
              <button type="button" onClick={closePicker} aria-label="关闭选择面板"><X /></button>
            </header>
            {activePicker.searchable && (
              <label className={styles.customerOptionSearch}>
                <Search />
                <input autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="输入关键词搜索" />
                {pickerQuery && <button type="button" onClick={() => setPickerQuery("")} aria-label="清空搜索"><X /></button>}
              </label>
            )}
            <div className={styles.customerOptionList} role="listbox" aria-label={activePicker.title}>
              {!pickerQuery && (
                <button type="button" className={styles.customerOptionRow} data-selected={!activePickerValue || undefined} onClick={() => selectPickerOption("")} role="option" aria-selected={!activePickerValue}>
                  <span className={styles.customerOptionText}><b>暂不选择</b><small>保留为空，稍后仍可补充</small></span>
                  <i>{!activePickerValue && <Check />}</i>
                </button>
              )}
              {filteredPickerOptions.map((option) => {
                const selected = option.value === activePickerValue;
                return (
                  <button type="button" key={option.value} className={styles.customerOptionRow} data-selected={selected || undefined} onClick={() => selectPickerOption(option.value)} role="option" aria-selected={selected}>
                    <span className={styles.customerOptionText}><b>{option.label}</b>{option.description && <small>{option.description}</small>}</span>
                    <i>{selected && <Check />}</i>
                  </button>
                );
              })}
              {filteredPickerOptions.length === 0 && <div className={styles.customerOptionEmpty}><Search /><b>没有匹配项</b><span>换个关键词再试试</span></div>}
            </div>
          </section>
        </div>
      )}
      {mapPickerOpen && <div className={styles.customerMapPickerLayer}><AmapLocationPicker mobile initialKeyword={form.address} onClose={() => setMapPickerOpen(false)} onConfirm={applyPickedLocation} /></div>}
    </div>
  );
}

function MobileCustomersPageContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [ownerScope, setOwnerScope] = useState<CustomerOwnerScope>("service");
  const [source, setSource] = useState("");
  const [store, setStore] = useState("");
  const [intention, setIntention] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [designer, setDesigner] = useState("");
  const [followup, setFollowup] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const [departmentType, setDepartmentType] = useState<DepartmentFilterType>("business");
  const [departmentOrgId, setDepartmentOrgId] = useState("");
  const [departmentIncludeChildren, setDepartmentIncludeChildren] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [filterOrgUnits, setFilterOrgUnits] = useState<CustomerOrgUnit[]>([]);
  const [filterPickerField, setFilterPickerField] = useState<FilterPickerField | null>(null);
  const [filterPickerQuery, setFilterPickerQuery] = useState("");
  const [filterDateField, setFilterDateField] = useState<FilterDateField | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [quickStoreOptions, setQuickStoreOptions] = useState<StorePickerOption[]>([]);
  const [quickStoreHasMore, setQuickStoreHasMore] = useState(false);
  const [quickStoreLoading, setQuickStoreLoading] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [storePickerOptions, setStorePickerOptions] = useState<StorePickerOption[]>([]);
  const [storePickerPage, setStorePickerPage] = useState(1);
  const [storePickerHasMore, setStorePickerHasMore] = useState(false);
  const [storePickerLoading, setStorePickerLoading] = useState(false);
  const [storePickerLoadingMore, setStorePickerLoadingMore] = useState(false);
  const [storePickerError, setStorePickerError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [scopeHelp, setScopeHelp] = useState<CustomerScopeHelp | null>(null);
  const followupFocus = searchParams.get("focus") === "followup";
  const effectiveOwnerScope: CustomerOwnerScope = followupFocus ? "service" : ownerScope;
  useBodyScrollLock(Boolean(filterOpen || storePickerOpen || filterPickerField || filterDateField || addOpen || scopeHelp));

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ mode: "list", page: "1", pageSize: "100", status, includeMeta: "1", includeStoreOptions: "0", scope: effectiveOwnerScope });
      if (query.trim()) params.set("search", query.trim());
      if (source) params.set("source", source);
      if (store) params.set("store", store);
      if (intention) params.set("intention", intention);
      if (createdFrom) params.set("createdFrom", createdFrom);
      if (createdTo) params.set("createdTo", createdTo);
      if (advisor) params.set("advisor", advisor);
      if (designer) params.set("designer", designer);
      if (followupFocus) params.set("followup", "overdue");
      else if (followup) params.set("followup", followup);
      if (duplicate) params.set("duplicate", duplicate);
      if (departmentOrgId) {
        params.set("departmentType", departmentType);
        params.set("departmentOrgId", departmentOrgId);
        if (departmentIncludeChildren) params.set("departmentIncludeChildren", "1");
      }
      if (showDeleted) params.set("deleted", "1");
      const response = await fetch(`/api/customers?${params.toString()}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "客户列表加载失败");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "客户列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [advisor, createdFrom, createdTo, departmentIncludeChildren, departmentOrgId, departmentType, designer, duplicate, effectiveOwnerScope, followup, followupFocus, intention, query, showDeleted, source, status, store]);

  useEffect(() => {
    const timer = window.setTimeout(loadCustomers, query ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [loadCustomers, query]);

  useEffect(() => {
    if (!filterOpen || quickStoreOptions.length > 0) return;
    const controller = new AbortController();
    setQuickStoreLoading(true);
    fetch("/api/customers?mode=store-options&page=1&pageSize=4", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as StorePickerResponse;
        if (!response.ok) throw new Error(result.message || "门店加载失败");
        setQuickStoreOptions(result.stores || []);
        setQuickStoreHasMore(Boolean(result.hasMore));
      })
      .catch((storeError) => {
        if (!(storeError instanceof DOMException && storeError.name === "AbortError")) setQuickStoreHasMore(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuickStoreLoading(false);
      });
    return () => controller.abort();
  }, [filterOpen, quickStoreOptions.length]);

  useEffect(() => {
    if (!filterOpen || filterOrgUnits.length > 0) return;
    const controller = new AbortController();
    fetch("/api/org", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("组织加载失败")))
      .then((result) => setFilterOrgUnits(Array.isArray(result) ? result : []))
      .catch((orgError) => {
        if (!(orgError instanceof DOMException && orgError.name === "AbortError")) setFilterOrgUnits([]);
      });
    return () => controller.abort();
  }, [filterOpen, filterOrgUnits.length]);

  useEffect(() => {
    if (!storePickerOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStorePickerLoading(true);
      setStorePickerError("");
      try {
        const params = new URLSearchParams({ mode: "store-options", page: "1", pageSize: "30" });
        if (storeSearch.trim()) params.set("search", storeSearch.trim());
        const response = await fetch(`/api/customers?${params.toString()}`, { signal: controller.signal });
        const result = await response.json().catch(() => ({})) as StorePickerResponse;
        if (!response.ok) throw new Error(result.message || "门店加载失败");
        setStorePickerOptions(result.stores || []);
        setStorePickerPage(1);
        setStorePickerHasMore(Boolean(result.hasMore));
      } catch (storeError) {
        if (storeError instanceof DOMException && storeError.name === "AbortError") return;
        setStorePickerError(storeError instanceof Error ? storeError.message : "门店加载失败");
      } finally {
        if (!controller.signal.aborted) setStorePickerLoading(false);
      }
    }, storeSearch ? 260 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [storePickerOpen, storeSearch]);

  const loadMoreStores = async () => {
    if (storePickerLoadingMore || !storePickerHasMore) return;
    setStorePickerLoadingMore(true);
    setStorePickerError("");
    try {
      const nextPage = storePickerPage + 1;
      const params = new URLSearchParams({ mode: "store-options", page: String(nextPage), pageSize: "30" });
      if (storeSearch.trim()) params.set("search", storeSearch.trim());
      const response = await fetch(`/api/customers?${params.toString()}`);
      const result = await response.json().catch(() => ({})) as StorePickerResponse;
      if (!response.ok) throw new Error(result.message || "门店加载失败");
      setStorePickerOptions((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        (result.stores || []).forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values());
      });
      setStorePickerPage(nextPage);
      setStorePickerHasMore(Boolean(result.hasMore));
    } catch (storeError) {
      setStorePickerError(storeError instanceof Error ? storeError.message : "门店加载失败");
    } finally {
      setStorePickerLoadingMore(false);
    }
  };

  const customers = useMemo(() => data?.customers || [], [data?.customers]);
  const followupStats = useMemo(() => customers.reduce((summary, customer) => {
    if (customer.has_overdue_followup) summary.overdue += 1;
    if (customer.next_followup_at) {
      const date = String(customer.next_followup_at).slice(0, 10);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
      if (date === today) summary.today += 1;
    }
    return summary;
  }, { today: 0, overdue: 0 }), [customers]);
  const activeFilterCount = [createdFrom, createdTo, source, store, advisor, designer, intention, followup, duplicate, departmentOrgId].filter(Boolean).length + (showDeleted ? 1 : 0);
  const sources = data?.sourceOptions?.length ? data.sourceOptions : sourceDefaults;
  const intentions = data?.intentionOptions?.length ? data.intentionOptions : intentionOptions;
  const orgOptions = useMemo(() => buildFilterOrgOptions(filterOrgUnits), [filterOrgUnits]);
  const selectedDepartmentOrg = orgOptions.find((item) => item.id === departmentOrgId);
  const selectedAdvisor = data?.advisorOptions?.find((item) => item.value === advisor)?.label || "全部顾问";
  const selectedDesigner = data?.designerOptions?.find((item) => item.value === designer)?.label || "全部设计师";
  const activeFilterPicker = useMemo<{ title: string; subtitle: string; value: string; options: CustomerPickerOption[] } | null>(() => {
    if (filterPickerField === "advisor") return { title: "选择家装顾问", subtitle: "按姓名搜索服务人员", value: advisor, options: data?.advisorOptions || [] };
    if (filterPickerField === "designer") return { title: "选择设计师", subtitle: "按姓名搜索服务人员", value: designer, options: data?.designerOptions || [] };
    if (filterPickerField === "department") return { title: "选择归属组织", subtitle: "支持按组织名称和完整路径搜索", value: departmentOrgId, options: orgOptions.filter((item) => Number(item.is_active ?? 1) === 1 || item.id === departmentOrgId).map((item) => ({ value: item.id, label: item.name, description: item.path })) };
    return null;
  }, [advisor, data?.advisorOptions, data?.designerOptions, departmentOrgId, designer, filterPickerField, orgOptions]);
  const filteredFilterPickerOptions = useMemo(() => {
    if (!activeFilterPicker) return [];
    const keyword = filterPickerQuery.trim().toLowerCase();
    if (!keyword) return activeFilterPicker.options;
    return activeFilterPicker.options.filter((item) => `${item.label} ${"description" in item ? item.description || "" : ""}`.toLowerCase().includes(keyword));
  }, [activeFilterPicker, filterPickerQuery]);
  const quickStores = useMemo(() => {
    const stores = quickStoreOptions.map((item) => item.name).filter(Boolean);
    if (store && !stores.includes(store)) return [store, ...stores].slice(0, 4);
    return stores.slice(0, 4);
  }, [quickStoreOptions, store]);
  const showMoreStores = quickStoreHasMore || Boolean(store && !quickStoreOptions.some((item) => item.name === store));
  const resetFilters = () => {
    setCreatedFrom(""); setCreatedTo(""); setSource(""); setStore(""); setAdvisor(""); setDesigner(""); setIntention(""); setFollowup(""); setDuplicate("");
    setDepartmentType("business"); setDepartmentOrgId(""); setDepartmentIncludeChildren(true); setShowDeleted(false);
  };
  const openFilterPicker = (field: FilterPickerField) => { setFilterPickerQuery(""); setFilterPickerField(field); };
  const selectFilterPickerOption = (value: string) => {
    if (filterPickerField === "advisor") setAdvisor(value);
    if (filterPickerField === "designer") setDesigner(value);
    if (filterPickerField === "department") setDepartmentOrgId(value);
    setFilterPickerField(null);
  };
  const emptyTitle = showDeleted ? "暂无已删除客户" : followupFocus ? "没有待跟进客户" : ownerScope === "managed" ? "暂无我管理的客户" : "暂无我服务的客户";
  const emptyDescription = showDeleted ? "当前筛选范围内没有已删除的数据。" : followupFocus ? "目前没有逾期的客户跟进任务。" : ownerScope === "managed" ? "当前没有负责组织，或所管理组织下暂无符合条件的客户。" : "调整搜索或筛选条件，也可以直接新增客户。";

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <h1 className={styles.srOnly}>{followupFocus ? "待跟进客户" : "客户管理"}</h1>
        <div className={styles.customerSearchRow}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} />
            <input className={styles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名、电话、小区或房号" />
            {query && <button className={styles.clearSearch} onClick={() => setQuery("")} aria-label="清空搜索"><X /></button>}
          </div>
          <button className={styles.mobileFilterIconButton} data-active={activeFilterCount > 0 || undefined} onClick={() => setFilterOpen(true)} aria-label={activeFilterCount > 0 ? `筛选，已选 ${activeFilterCount} 项` : "筛选"}><SlidersHorizontal />{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>
        </div>
      </header>

      {!followupFocus ? <section className={styles.customerScopeSummary} aria-label="客户范围与跟进概览"><nav className={styles.customerScopeSwitch} aria-label="客户范围">
        <div className={styles.customerScopeOption} data-active={ownerScope === "service" || undefined}>
          <button type="button" className={styles.customerScopeSelect} aria-pressed={ownerScope === "service"} onClick={() => setOwnerScope("service")}><UsersRound /><span>我服务的</span></button>
          <button type="button" className={styles.customerScopeHelpButton} aria-label="解释我服务的" onClick={() => setScopeHelp("service")}><CircleHelp /></button>
        </div>
        <div className={styles.customerScopeOption} data-active={ownerScope === "managed" || undefined}>
          <button type="button" className={styles.customerScopeSelect} aria-pressed={ownerScope === "managed"} onClick={() => setOwnerScope("managed")}><Building2 /><span>我管理的</span></button>
          <button type="button" className={styles.customerScopeHelpButton} aria-label="解释我管理的" onClick={() => setScopeHelp("managed")}><CircleHelp /></button>
        </div>
      </nav></section> : <section className={styles.followupTaskSummary} aria-label="待跟进客户概览"><span><b>{data?.total ?? 0}</b><small>待跟进</small></span><span data-tone="warning"><b>{followupStats.today}</b><small>今日</small></span><span data-tone="danger"><b>{followupStats.overdue}</b><small>逾期</small></span></section>}

      {!followupFocus && !showDeleted && <div className={styles.statusScroller}>{statusOptions.map((item) => <button key={item.value} className={styles.statusChip} data-active={status === item.value || undefined} onClick={() => setStatus(item.value)}>{item.label}<span className={styles.statusCount}>{item.value === "all" ? Number(data?.total || 0) : Number(data?.statusCounts?.[item.value] || 0)}</span></button>)}</div>}

      {loading ? <div className={styles.loadingList}><Loader2 className="h-5 w-5 animate-spin" />正在加载客户</div> : error ? <div className={styles.errorState}><AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" /><div>{error}</div><button className={`${styles.secondaryButton} mt-4 w-full`} onClick={loadCustomers}>重新加载</button></div> : customers.length === 0 ? <div className={styles.emptyState}><div className={styles.emptyIcon}>{showDeleted ? <Trash2 /> : <CircleUserRound />}</div><div className={styles.emptyTitle}>{emptyTitle}</div><div className={styles.emptyText}>{emptyDescription}</div>{ownerScope === "service" && !followupFocus && !showDeleted && <button className={`${styles.primaryButton} mt-4 w-full`} onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />新增客户</button>}</div> : (
        <div className={styles.customerList}>
          {customers.map((customer) => {
            const normalizedStatus = normalizeCustomerStatus(customer.status);
            const latestFollowupContent = String(customer.latest_followup_content || "").trim() || (customer.last_followup_at ? "上传了附件" : "暂无跟进记录");
            const cardContent = <>
                {!customer.deleted_at && customer.has_overdue_followup ? <span className={styles.overdueFollowupStamp}>逾期跟进</span> : null}
                <div className={styles.cardMain}>
                  <div className={styles.customerTop}>
                    <div className={styles.avatar}>{customer.name?.trim().slice(0, 1) || "客"}</div>
                    <div className={styles.customerIdentity}>
                      <div className={styles.nameLine}>
                        <span className={styles.customerName}>{roomDisplay(customer)}</span>
                        {customer.deleted_at ? <span className={styles.deletedCustomerBadge}>已删除</span> : <span className={styles.stageBadge} data-status={normalizedStatus}>{customerStatusLabels[normalizedStatus] || normalizedStatus}</span>}
                      </div>
                      <div className={styles.roomLine}>
                        <CircleUserRound />
                        <span className={styles.customerPersonName}>{customer.name || "未命名客户"}</span>
                        {customer.intention ? <span className={styles.intention}>{customer.intention}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className={styles.customerInfoGrid}>
                    <div className={styles.customerInfoItem}><small>家装顾问</small><b><CardStaffName name={customer.advisor_name} avatar={customer.advisor_avatar || customer.inviter_avatar || customer.created_by_avatar} emptyText="待分配" /></b></div>
                    <div className={styles.customerInfoItem}><small>设计师</small><b><CardStaffName name={customer.designer_name} avatar={customer.designer_avatar} emptyText="待分配" /></b></div>
                    <div className={styles.customerInfoItem}><small>服务门店</small><b>{customer.service_store || "未设置"}</b></div>
                    <div className={styles.customerInfoItem}><small>装修面积</small><b>{customer.area_size ? `${customer.area_size}㎡` : "待完善"}</b></div>
                    <div className={styles.customerInfoItem}><small>客户来源</small><b>{customer.source || "未填写"}</b></div>
                    <div className={styles.customerInfoItem}><small>装修类型</small><b>{customer.decoration_type || "未填写"}</b></div>
                  </div>
                </div>
                <div className={styles.followupBar}><span className={styles.followupState} data-empty={!customer.last_followup_at || undefined}><Clock3 />{customer.last_followup_at && <time>{formatFollowupDate(customer.last_followup_at)}</time>}<span className={styles.followupContent}>{latestFollowupContent}</span></span><ChevronRight className={styles.cardArrow} /></div>
              </>;
            return customer.deleted_at ? <article key={customer.id} className={`${styles.customerCard} ${styles.deletedCustomerCard}`}>{cardContent}</article> : <Link key={customer.id} href={`/m/customers/${customer.id}`} className={styles.customerCard}>{cardContent}</Link>;
          })}
        </div>
      )}

      {filterOpen && (
        <div className={styles.sheetBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFilterOpen(false)}>
          <div className={`${styles.sheet} ${styles.customerFilterSheet}`} role="dialog" aria-modal="true" aria-labelledby="customer-filter-title">
            <div className={styles.sheetHandle} />
            <div className={styles.filterSheetHeader}><div className={styles.filterSheetHeading}><span><SlidersHorizontal /></span><div><div id="customer-filter-title" className={styles.sheetTitle}>筛选客户</div><div className={styles.sheetSubtitle}>{activeFilterCount ? `已选择 ${activeFilterCount} 个条件` : "筛选条件与电脑端一致"}</div></div></div><button className={styles.filterCloseButton} onClick={() => setFilterOpen(false)} aria-label="关闭"><X /></button></div>
            <div className={styles.filterSheetBody}>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="date"><CalendarDays /></span><div><b>创建时间</b><small>{createdFrom || createdTo ? `${createdFrom ? formatFilterDate(createdFrom) : "不限"} - ${createdTo ? formatFilterDate(createdTo) : "不限"}` : "不限"}</small></div></div>
                <div className={styles.filterDateRange}><button type="button" data-active={Boolean(createdFrom) || undefined} onClick={() => setFilterDateField("createdFrom")}><small>开始日期</small><b>{formatFilterDate(createdFrom)}</b><CalendarDays /></button><span>至</span><button type="button" data-active={Boolean(createdTo) || undefined} onClick={() => setFilterDateField("createdTo")}><small>结束日期</small><b>{formatFilterDate(createdTo)}</b><CalendarDays /></button></div>
              </section>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="source"><Megaphone /></span><div><b>客户来源</b><small>{source || "不限"}</small></div></div>
                <div className={styles.filterChoiceGrid} data-columns="4"><button type="button" data-active={!source || undefined} onClick={() => setSource("")}>全部</button>{sources.map((item) => <button type="button" key={item} data-active={source === item || undefined} onClick={() => setSource(item)}>{item}</button>)}</div>
              </section>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="store"><Store /></span><div><b>服务门店</b><small>{store || "不限"}</small></div></div>
                <div className={styles.filterChoiceGrid} data-columns="3"><button type="button" data-active={!store || undefined} onClick={() => setStore("")}>全部门店</button>{quickStoreLoading ? <span className={styles.quickStoreLoading}><Loader2 className="animate-spin" />加载门店</span> : <>{quickStores.map((item) => <button type="button" key={item} data-active={store === item || undefined} onClick={() => setStore(item)}>{item}</button>)}{showMoreStores && <button type="button" className={styles.quickStoreMore} onClick={() => { setStoreSearch(""); setStorePickerOpen(true); }}><span>更多门店</span><ChevronRight /></button>}</>}</div>
              </section>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="staff"><BriefcaseBusiness /></span><div><b>服务人员</b><small>{advisor || designer ? "已指定人员" : "不限"}</small></div></div>
                <div className={styles.filterActionRows}>
                  <button type="button" onClick={() => openFilterPicker("advisor")}><span><BriefcaseBusiness /></span><div><small>家装顾问</small><b data-empty={!advisor || undefined}>{selectedAdvisor}</b></div><ChevronRight /></button>
                  <button type="button" onClick={() => openFilterPicker("designer")}><span><Paintbrush /></span><div><small>设计师</small><b data-empty={!designer || undefined}>{selectedDesigner}</b></div><ChevronRight /></button>
                </div>
              </section>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="intention"><Star /></span><div><b>客户意向</b><small>{intention || "不限"}</small></div></div>
                <div className={styles.filterChoiceGrid} data-columns="3"><button type="button" data-active={!intention || undefined} onClick={() => setIntention("")}>全部</button>{intentions.map((item) => <button type="button" key={item} data-active={intention === item || undefined} onClick={() => setIntention(item)}>{item}</button>)}<button type="button" data-active={intention === "__empty" || undefined} onClick={() => setIntention("__empty")}>未设置</button></div>
              </section>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="followup"><Clock3 /></span><div><b>跟进状态</b><small>{followupFilterOptions.find((item) => item.value === followup)?.label || "全部"}</small></div></div>
                <div className={styles.filterChoiceGrid} data-columns="3">{followupFilterOptions.map((item) => <button type="button" key={item.value || "all"} data-active={followup === item.value || undefined} onClick={() => setFollowup(item.value)}>{item.label}</button>)}</div>
              </section>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="duplicate"><Copy /></span><div><b>重复情况</b><small>{duplicate === "duplicate" ? "重复客户" : duplicate === "unique" ? "非重复客户" : "全部"}</small></div></div>
                <div className={styles.filterChoiceGrid} data-columns="3"><button type="button" data-active={!duplicate || undefined} onClick={() => setDuplicate("")}>全部</button><button type="button" data-active={duplicate === "duplicate" || undefined} onClick={() => setDuplicate("duplicate")}>重复客户</button><button type="button" data-active={duplicate === "unique" || undefined} onClick={() => setDuplicate("unique")}>非重复客户</button></div>
              </section>
              <section className={styles.filterGroup}>
                <div className={styles.filterGroupHeader}><span data-tone="department"><Network /></span><div><b>部门归属</b><small>{selectedDepartmentOrg ? `${selectedDepartmentOrg.name}${departmentIncludeChildren ? "（含下级）" : ""}` : "未选择组织"}</small></div></div>
                <div className={styles.filterChoiceGrid} data-columns="2">{departmentFilterTypes.map((item) => <button type="button" key={item.value} data-active={departmentType === item.value || undefined} onClick={() => setDepartmentType(item.value)}>{item.label}</button>)}</div>
                <div className={styles.filterActionRows} data-compact>
                  <button type="button" onClick={() => openFilterPicker("department")}><span><Building2 /></span><div><small>归属组织</small><b data-empty={!departmentOrgId || undefined}>{selectedDepartmentOrg?.name || "选择组织后生效"}</b></div><ChevronRight /></button>
                  <button type="button" role="switch" aria-checked={departmentIncludeChildren} onClick={() => setDepartmentIncludeChildren((current) => !current)}><span><Network /></span><div><small>查询范围</small><b>包含下级组织</b></div><i className={styles.mobileFilterSwitch} data-active={departmentIncludeChildren || undefined}><em /></i></button>
                </div>
              </section>
              <section className={styles.filterGroup}>
                <button type="button" className={styles.deletedFilterRow} role="switch" aria-checked={showDeleted} onClick={() => { setShowDeleted((current) => !current); setStatus("all"); }}><span><Trash2 /></span><div><b>查看已删除客户</b><small>开启后仅显示已删除的数据</small></div><i className={styles.mobileFilterSwitch} data-active={showDeleted || undefined}><em /></i></button>
              </section>
            </div>
            <div className={styles.filterSheetFooter}><button type="button" className={styles.filterResetButton} disabled={!activeFilterCount} onClick={resetFilters}><RotateCcw />清除筛选</button><button type="button" className={styles.filterApplyButton} onClick={() => setFilterOpen(false)}>确认</button></div>
          </div>
        </div>
      )}

      {storePickerOpen && (
        <div className={`${styles.sheetBackdrop} ${styles.storePickerBackdrop}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setStorePickerOpen(false)}>
          <div className={`${styles.sheet} ${styles.storePickerSheet}`} role="dialog" aria-modal="true" aria-labelledby="store-picker-title">
            <div className={styles.sheetHandle} />
            <div className={styles.storePickerHeader}><button type="button" onClick={() => setStorePickerOpen(false)} aria-label="返回筛选"><ArrowLeft /></button><div><div id="store-picker-title" className={styles.sheetTitle}>选择服务门店</div><div className={styles.sheetSubtitle}>{store ? `当前：${store}` : "当前：全部门店"}</div></div></div>
            <div className={styles.storePickerSearch}><Search /><input value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="搜索门店名称" autoFocus />{storeSearch && <button type="button" onClick={() => setStoreSearch("")} aria-label="清空门店搜索"><X /></button>}</div>
            <div className={styles.storePickerList}>
              {!storeSearch && <button type="button" className={styles.storePickerRow} data-active={!store || undefined} onClick={() => { setStore(""); setStorePickerOpen(false); }}><span className={styles.storePickerRowIcon}><Building2 /></span><span className={styles.storePickerRowText}><b>全部门店</b><small>不限制服务门店</small></span>{!store ? <Check className={styles.storePickerCheck} /> : <ChevronRight className={styles.storePickerArrow} />}</button>}
              {storePickerLoading ? <div className={styles.storePickerStatus}><Loader2 className="animate-spin" />正在加载门店</div> : storePickerError && storePickerOptions.length === 0 ? <div className={styles.storePickerStatus} data-error><AlertCircle />{storePickerError}</div> : storePickerOptions.length === 0 ? <div className={styles.storePickerEmpty}><Store /><b>没有找到门店</b><small>请尝试输入其他关键词</small></div> : <>{storePickerOptions.map((item) => <button type="button" key={item.id} className={styles.storePickerRow} data-active={store === item.name || undefined} onClick={() => { setStore(item.name); setStorePickerOpen(false); }}><span className={styles.storePickerRowIcon}><Store /></span><span className={styles.storePickerRowText}><b>{item.name}</b><small>{item.parent_name || "服务门店"}</small></span>{store === item.name ? <Check className={styles.storePickerCheck} /> : <ChevronRight className={styles.storePickerArrow} />}</button>)}{storePickerError && <div className={styles.storePickerInlineError}>{storePickerError}</div>}{storePickerHasMore && <button type="button" className={styles.storePickerLoadMore} disabled={storePickerLoadingMore} onClick={loadMoreStores}>{storePickerLoadingMore ? <Loader2 className="animate-spin" /> : null}{storePickerLoadingMore ? "加载中" : "加载更多门店"}</button>}</>}
            </div>
          </div>
        </div>
      )}

      {activeFilterPicker && (
        <div className={`${styles.customerOptionBackdrop} ${styles.filterOptionBackdrop}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFilterPickerField(null)}>
          <section className={styles.customerOptionSheet} role="dialog" aria-modal="true" aria-labelledby="filter-option-title">
            <div className={styles.customerOptionHandle} />
            <header className={styles.customerOptionHeader}><div><h3 id="filter-option-title">{activeFilterPicker.title}</h3><p>{activeFilterPicker.subtitle}</p></div><button type="button" onClick={() => setFilterPickerField(null)} aria-label="关闭"><X /></button></header>
            <label className={styles.customerOptionSearch}><Search /><input value={filterPickerQuery} onChange={(event) => setFilterPickerQuery(event.target.value)} placeholder={`搜索${activeFilterPicker.title.replace("选择", "")}`} autoFocus />{filterPickerQuery && <button type="button" onClick={() => setFilterPickerQuery("")} aria-label="清空搜索"><X /></button>}</label>
            <div className={styles.customerOptionList} role="listbox" aria-label={activeFilterPicker.title}>
              {!filterPickerQuery && <button type="button" className={styles.customerOptionRow} data-selected={!activeFilterPicker.value || undefined} onClick={() => selectFilterPickerOption("")} role="option" aria-selected={!activeFilterPicker.value}><span className={styles.customerOptionText}><b>全部</b><small>不限制此筛选条件</small></span><i>{!activeFilterPicker.value && <Check />}</i></button>}
              {filteredFilterPickerOptions.map((item) => { const selected = activeFilterPicker.value === item.value; return <button type="button" key={item.value} className={styles.customerOptionRow} data-selected={selected || undefined} onClick={() => selectFilterPickerOption(item.value)} role="option" aria-selected={selected}><span className={styles.customerOptionText}><b>{item.label}</b>{item.description && <small>{item.description}</small>}</span><i>{selected && <Check />}</i></button>; })}
              {filteredFilterPickerOptions.length === 0 && <div className={styles.customerOptionEmpty}><Search /><b>没有匹配项</b><span>换个关键词再试试</span></div>}
            </div>
          </section>
        </div>
      )}

      {filterDateField && <MobileFilterDatePicker title={filterDateField === "createdFrom" ? "创建开始日期" : "创建结束日期"} value={filterDateField === "createdFrom" ? createdFrom : createdTo} onClose={() => setFilterDateField(null)} onConfirm={(value) => filterDateField === "createdFrom" ? setCreatedFrom(value) : setCreatedTo(value)} />}

      {scopeHelp && (
        <div className={styles.scopeHelpBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setScopeHelp(null)}>
          <section className={styles.scopeHelpSheet} role="dialog" aria-modal="true" aria-labelledby="scope-help-title">
            <div className={styles.scopeHelpHandle} />
            <div className={styles.scopeHelpIcon}><CircleHelp /></div>
            <div className={styles.scopeHelpCopy}>
              <h2 id="scope-help-title">{customerScopeHelpContent[scopeHelp].title}</h2>
              <p>{customerScopeHelpContent[scopeHelp].description}</p>
            </div>
            <button type="button" className={styles.scopeHelpClose} onClick={() => setScopeHelp(null)}>知道了</button>
          </section>
        </div>
      )}

      {!showDeleted && <button className={styles.customerFab} onClick={() => setAddOpen(true)} aria-label="新增客户" title="新增客户"><Plus /></button>}

      {addOpen && <CustomerSheet sourceOptions={sources} onClose={() => setAddOpen(false)} onCreated={(customer) => { setAddOpen(false); setData((current) => current ? { ...current, customers: [customer, ...current.customers], total: current.total + 1 } : current); loadCustomers(); }} />}
    </div>
  );
}

export default function MobileCustomersPage() {
  return (
    <Suspense fallback={<div className={styles.mobilePage}><div className={styles.mobileLoading}>正在加载客户</div></div>}>
      <MobileCustomersPageContent />
    </Suspense>
  );
}
