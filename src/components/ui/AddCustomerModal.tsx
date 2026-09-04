"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Loader2, MapPin, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import SystemSelect from "@/components/ui/SystemSelect";

type EditableCustomer = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  weixin?: string | null;
  source?: string | null;
  address?: string | null;
  house_address?: string | null;
  address_location_name?: string | null;
  address_location_address?: string | null;
  address_latitude?: string | number | null;
  address_longitude?: string | number | null;
  building_no?: string | null;
  unit_no?: string | null;
  room_no?: string | null;
  no_room_number?: boolean | number | null;
  area_size?: string | number | null;
  house_type?: string | null;
  decoration_type?: string | null;
  budget?: string | number | null;
  intention?: string | null;
  requirements?: string | null;
  remarks?: string | null;
  service_store?: string | null;
  inviter_id?: string | null;
  status?: string | null;
  is_delivered?: string | number | boolean | null;
};

interface AddCustomerModalProps {
  existingPhones?: string[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customer?: EditableCustomer | null;
}

const sourceOptions = ["门店", "转介绍", "小程序", "广告投放", "抖音", "小红书", "其它"];
const houseTypeOptions = ["一室一厅", "两室一厅", "两室两厅", "三室一厅", "三室两厅", "四室及以上", "别墅/复式"];
const decorationTypeOptions = ["全包", "半包", "清包"];
const intentionOptions = Array.from({ length: 5 }, (_, index) => "★".repeat(index + 1));

interface FormData {
  name: string;
  phone: string;
  weixin: string;
  source: string;
  address: string;
  house_address: string;
  address_location_name: string;
  address_location_address: string;
  address_latitude: string;
  address_longitude: string;
  building_no: string;
  unit_no: string;
  room_no: string;
  no_room_number: boolean;
  area_size: string;
  house_type: string;
  decoration_type: string;
  budget: string;
  is_delivered: string;
  intention: string;
  requirements: string;
  remarks: string;
  service_store: string;
  inviter_id: string;
}

const initialForm: FormData = {
  name: "", phone: "", weixin: "", source: "", address: "", house_address: "",
  address_location_name: "", address_location_address: "", address_latitude: "", address_longitude: "",
  building_no: "", unit_no: "", room_no: "", no_room_number: false,
  area_size: "", house_type: "", decoration_type: "", budget: "",
  is_delivered: "", intention: "", requirements: "", remarks: "", service_store: "", inviter_id: "",
};

const modalShellClass = "customer-entry-modal-shell relative z-10 flex max-h-[calc(100dvh-48px)] w-full max-w-[920px] flex-col overflow-hidden rounded-xl border border-[#DCE4EF] bg-[#F6F8FB]";
const sectionClass = "customer-entry-section rounded-lg border border-[#E4EAF2] bg-[#FBFCFE] px-4 py-4 md:px-5";
const sectionHeaderClass = "mb-3 flex items-center gap-2 border-b border-[#EEF2F6] pb-3 [&>h3]:text-[13px] [&>h3]:font-semibold [&>h3]:text-[#182230] [&>h3]:before:mr-2 [&>h3]:before:inline-block [&>h3]:before:h-2 [&>h3]:before:w-2 [&>h3]:before:rounded-full [&>h3]:before:bg-[#407AFF] [&>p]:hidden";
const sectionBodyClass = "grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2";
const labelClass = "mb-1.5 block text-xs font-semibold text-[#344054]";
const hintClass = "hidden";
const inputClass = "h-10 w-full rounded-lg border border-[#D7DFEA] bg-white px-3 text-[13px] font-normal text-[#1F2937] outline-none transition placeholder:text-[#98A2B3] hover:border-[#C5CFDC] focus:border-[#407AFF] focus:ring-[3px] focus:ring-[#407AFF]/12";
const textAreaClass = "w-full rounded-lg border border-[#D7DFEA] bg-white px-3 py-2.5 text-[13px] font-normal leading-5 text-[#1F2937] outline-none transition placeholder:text-[#98A2B3] hover:border-[#C5CFDC] focus:border-[#407AFF] focus:ring-[3px] focus:ring-[#407AFF]/12";
const selectMenuClass = "customer-entry-select-menu";
const selectOptionClass = "customer-entry-select-option";
const secondaryButtonClass = "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#D7DFEA] bg-white px-4 text-sm font-medium text-[#344054] transition hover:border-[#C5CFDC] hover:bg-[#F8FAFC] hover:text-[#1F2937] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#407AFF]/15 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass = "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#407AFF] bg-[#407AFF] px-4 text-sm font-medium text-white transition hover:border-[#2F66E8] hover:bg-[#2F66E8] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#407AFF]/20 disabled:cursor-not-allowed disabled:opacity-60";

interface OrgUnit {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active?: number;
}

interface EmployeeOption {
  id: string;
  name: string;
  phone: string;
  role: string;
  org_unit_id: string | null;
  is_active: number;
}

export interface LocationPick {
  name: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
  source: "search" | "map";
}

interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  district: string;
  location: string;
  longitude: number | null;
  latitude: number | null;
  type: string;
}

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode?: string };
  }
}

let amapScriptPromise: Promise<void> | null = null;
const defaultMapCenter = { longitude: 113.264385, latitude: 23.129112 };

type BrowserPosition = {
  longitude: number;
  latitude: number;
};

function getBrowserPosition(): Promise<BrowserPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        longitude: position.coords.longitude,
        latitude: position.coords.latitude,
      }),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60_000,
      },
    );
  });
}

function loadAmapScript(key: string, securityJsCode?: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("地图只能在浏览器中打开"));
  if (window.AMap) return Promise.resolve();
  if (securityJsCode) window._AMapSecurityConfig = { securityJsCode };
  if (amapScriptPromise) return amapScriptPromise;
  amapScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("amap-js-api");
    if (existing) {
      existing.addEventListener("load", () => window.AMap ? resolve() : reject(new Error("高德地图脚本已加载，但地图对象不可用")), { once: true });
      existing.addEventListener("error", () => reject(new Error("高德地图加载失败")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "amap-js-api";
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.onload = () => window.AMap ? resolve() : reject(new Error("高德地图脚本已加载，但地图对象不可用"));
    script.onerror = () => reject(new Error("高德地图加载失败，请检查高德 JS Key"));
    document.head.appendChild(script);
  }).catch((error) => {
    amapScriptPromise = null;
    document.getElementById("amap-js-api")?.remove();
    throw error;
  });
  return amapScriptPromise;
}

function findNearestStore(units: OrgUnit[], orgUnitId?: string | null) {
  if (!orgUnitId) return null;
  const map = new Map(units.map((unit) => [unit.id, unit]));
  let current = map.get(orgUnitId);
  while (current) {
    if (current.type === "store") return current;
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return null;
}

function isOrgActive(unit?: OrgUnit | null) {
  return Number(unit?.is_active ?? 1) === 1;
}

function findNearestCompany(units: OrgUnit[], orgUnitId?: string | null) {
  if (!orgUnitId) return null;
  const map = new Map(units.map((unit) => [unit.id, unit]));
  let current = map.get(orgUnitId);
  while (current) {
    if (current.type === "company") return current;
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return null;
}

function isOrgDescendantOf(units: OrgUnit[], orgUnitId: string | null | undefined, ancestorId: string) {
  if (!orgUnitId) return false;
  const map = new Map(units.map((unit) => [unit.id, unit]));
  let current = map.get(orgUnitId);
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return false;
}

function customerToForm(customer: EditableCustomer): FormData {
  const budgetInYuan = Number(customer.budget || 0);
  return {
    name: customer.name || "",
    phone: normalizePhone(customer.phone || ""),
    weixin: customer.weixin || "",
    source: customer.source || "",
    address: customer.address || "",
    house_address: customer.house_address || "",
    address_location_name: customer.address_location_name || "",
    address_location_address: customer.address_location_address || "",
    address_latitude: customer.address_latitude === undefined || customer.address_latitude === null ? "" : String(customer.address_latitude),
    address_longitude: customer.address_longitude === undefined || customer.address_longitude === null ? "" : String(customer.address_longitude),
    building_no: customer.building_no || "",
    unit_no: customer.unit_no || "",
    room_no: customer.room_no || "",
    no_room_number: customer.no_room_number === true || customer.no_room_number === 1,
    area_size: customer.area_size ? String(customer.area_size) : "",
    house_type: customer.house_type || "",
    decoration_type: customer.decoration_type || "",
    budget: Number.isFinite(budgetInYuan) && budgetInYuan > 0 ? String(budgetInYuan / 10000) : "",
    is_delivered: customer.is_delivered === true || customer.is_delivered === 1 || customer.is_delivered === "1" || customer.is_delivered === "已交房" ? "已交房" : customer.is_delivered === undefined || customer.is_delivered === null ? "" : "未交房",
    intention: customer.intention || "",
    requirements: customer.requirements || "",
    remarks: customer.remarks || "",
    service_store: customer.service_store || "",
    inviter_id: customer.inviter_id || "",
  };
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function budgetWanToYuan(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 10000 * 100) / 100 : null;
}

export default function AddCustomerModal({ isOpen, onClose, onSuccess, customer = null }: AddCustomerModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormData>(initialForm);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const duplicateCheckRef = useRef(0);
  const allStores = useMemo(() => orgUnits.filter((unit) => unit.type === "store" && isOrgActive(unit)), [orgUnits]);
  const currentUserStore = useMemo(() => findNearestStore(orgUnits, user?.org_unit_id), [orgUnits, user?.org_unit_id]);
  const currentUserActiveStore = currentUserStore && isOrgActive(currentUserStore) ? currentUserStore : null;
  const currentUserCompany = useMemo(() => findNearestCompany(orgUnits, user?.org_unit_id), [orgUnits, user?.org_unit_id]);
  const isEdit = Boolean(customer?.id);
  const selectedInactiveStore = form.service_store
    ? orgUnits.find((unit) => unit.type === "store" && unit.name === form.service_store && !isOrgActive(unit))
    : null;
  const inviterOptions = useMemo(() => employees.filter((employee) => {
    if (!employee.is_active) return false;
    if (!currentUserCompany) return true;
    return isOrgDescendantOf(orgUnits, employee.org_unit_id, currentUserCompany.id);
  }), [currentUserCompany, employees, orgUnits]);
  const defaultServiceStore = currentUserActiveStore?.name || "";
  const defaultInviterId = inviterOptions.some((employee) => employee.id === user?.id) ? user?.id || "" : "";
  const customerRef = useRef(customer);
  customerRef.current = customer;

  useEffect(() => {
    fetch("/api/org").then((res) => res.json()).then((data) => setOrgUnits(data || [])).catch(() => setOrgUnits([]));
    fetch("/api/team").then((res) => res.json()).then((data) => setEmployees(data || [])).catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDuplicateWarning("");
      setErrors({});
      if (customerRef.current?.id) {
        setForm(customerToForm(customerRef.current));
        return;
      }
      setForm(initialForm);
    }
  }, [isOpen, customer?.id]);

  useEffect(() => {
    if (!isOpen || customer?.id) return;
    setForm((prev) => ({
      ...prev,
      service_store: prev.service_store || defaultServiceStore,
      inviter_id: prev.inviter_id || defaultInviterId,
    }));
  }, [customer?.id, defaultInviterId, defaultServiceStore, isOpen]);

  const checkDuplicate = async (phoneVal: string) => {
    const normalizedPhone = normalizePhone(phoneVal);
    if (!normalizedPhone) { setDuplicateWarning(""); return; }
    if (isEdit && normalizedPhone === normalizePhone(customer?.phone || "")) {
      setDuplicateWarning("");
      return;
    }
    if (normalizedPhone.length !== 11) {
      setDuplicateWarning("");
      return;
    }

    const requestId = duplicateCheckRef.current + 1;
    duplicateCheckRef.current = requestId;
    try {
      const params = new URLSearchParams({
        mode: "phone-check",
        phone: normalizedPhone,
      });
      if (customer?.id) params.set("excludeId", customer.id);
      const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
      const res = await fetch(`/api/customers?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (requestId !== duplicateCheckRef.current) return;
      if (!res.ok) throw new Error(data?.message || "手机号重复校验失败");
      const count = Number(data?.count || 0);
      setDuplicateWarning(count > 0 ? `该手机号已有 ${count} 位客户记录，确认继续新增？` : "");
    } catch {
      if (requestId === duplicateCheckRef.current) setDuplicateWarning("");
    }
  };

  const set = (field: keyof FormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const setAddressText = (value: string) => {
    setForm((prev) => ({
      ...prev,
      address: value,
      address_location_name: "",
      address_location_address: "",
      address_latitude: "",
      address_longitude: "",
    }));
    if (errors.address) setErrors((prev) => ({ ...prev, address: "" }));
  };

  const setNoRoomNumber = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      no_room_number: checked,
      ...(checked ? { building_no: "", unit_no: "", room_no: "" } : {}),
    }));
  };

  const applyPickedLocation = (location: LocationPick) => {
    setForm((prev) => ({
      ...prev,
      address: location.name || location.address,
      house_address: location.address || location.name,
      address_location_name: location.name || location.address,
      address_location_address: location.address || location.name,
      address_latitude: location.latitude === null ? "" : String(location.latitude),
      address_longitude: location.longitude === null ? "" : String(location.longitude),
    }));
    if (errors.address) setErrors((prev) => ({ ...prev, address: "" }));
    setMapPickerOpen(false);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "请输入客户姓名";
    if (!form.address.trim()) errs.address = "请输入小区/楼盘";
    if (!form.area_size || Number(form.area_size) <= 0) errs.area_size = "请输入装修面积";
    if (form.phone.trim() && form.phone.length !== 11) errs.phone = "手机号必须为11位数字";
    if (!form.phone.trim() && !form.weixin.trim()) {
      errs.phone = "手机号和微信号至少填一项";
      errs.weixin = "手机号和微信号至少填一项";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch(isEdit ? `/api/customers/${customer?.id}` : "/api/customers", {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          address: form.address.trim(),
          house_address: form.house_address.trim() || form.address.trim(),
          address_location_name: form.address_location_name.trim() || form.address.trim(),
          address_location_address: form.address_location_address.trim() || form.house_address.trim() || form.address.trim(),
          address_latitude: form.address_latitude ? Number(form.address_latitude) : null,
          address_longitude: form.address_longitude ? Number(form.address_longitude) : null,
          area_size: form.area_size ? Number(form.area_size) : null,
          phone: normalizePhone(form.phone),
          budget: budgetWanToYuan(form.budget),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || (isEdit ? "保存失败" : "创建失败"));
      }
      onSuccess();
      onClose();
      if (!isEdit) setForm(initialForm);
    } catch (err: any) {
      setErrors({ submit: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/24 px-4 py-6 backdrop-blur-[1px] sm:px-6">
      <div className="absolute inset-0" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className={modalShellClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-modal-title"
        data-customer-entry-modal
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#E5EAF2] bg-white px-5 py-4 md:px-6">
          <div>
            <h2 id="customer-modal-title" className="text-lg font-semibold leading-6 text-[#1F2937]">{isEdit ? "编辑客户" : "新增客户"}</h2>
            <p className="hidden">
              {isEdit ? "更新客户档案信息，保存后同步到客户管理。" : "填写客户基础资料，便于后续跟进、报价和工地流转。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#8A97A8] transition hover:bg-[#F2F4F7] hover:text-[#1F2937] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#407AFF]/15"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="customer-entry-modal-scroll min-h-0 flex-1 !overflow-y-auto overscroll-contain bg-[#F5F7FA] [scrollbar-gutter:stable]"
          data-customer-modal-scroll
        >
          <div className="grid gap-3 p-4 md:p-5">
            <section className={sectionClass}>
              <div className={sectionHeaderClass}>
                <h3 className="text-sm font-semibold text-[#1F2937]">归属信息</h3>
                <p className="mt-1 text-xs font-normal leading-5 text-[#667085]">确认客户归属门店和邀约人员。</p>
              </div>
              <div className={sectionBodyClass}>
                <div>
                  <label className={labelClass}>服务客户门店</label>
                  {currentUserActiveStore ? (
                    <>
                      <input type="text" value={form.service_store} readOnly className={`${inputClass} bg-[#F8FAFC] text-[#6B7280]`} />
                      <p className={hintClass}>已按当前账号所属门店自动带出</p>
                    </>
                  ) : (
                    <SystemSelect value={form.service_store} onChange={(e) => set("service_store", e.target.value)} className={inputClass} menuClassName={selectMenuClass} optionClassName={selectOptionClass}>
                      <option value="">请选择服务门店</option>
                      {selectedInactiveStore && <option value={selectedInactiveStore.name} disabled>{selectedInactiveStore.name}（已停用）</option>}
                      {allStores.map((store) => <option key={store.id} value={store.name}>{store.name}</option>)}
                    </SystemSelect>
                  )}
                  {selectedInactiveStore && (
                    <p className="mt-1 text-xs text-amber-600">当前客户历史门店已停用；如需继续新增业务，请改选启用门店。</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>邀约人</label>
                  <SystemSelect value={form.inviter_id} onChange={(e) => set("inviter_id", e.target.value)} className={inputClass} menuClassName={selectMenuClass} optionClassName={selectOptionClass}>
                    <option value="">请选择邀约人</option>
                    {inviterOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.name}（{employee.phone}）</option>
                    ))}
                  </SystemSelect>
                  <p className={hintClass}>
                    {currentUserCompany ? `仅显示${currentUserCompany.name}范围内员工` : "当前账号未归属分公司，可选择全部员工"}
                  </p>
                </div>
              </div>
            </section>

            <section className={sectionClass}>
              <div className={sectionHeaderClass}>
                <h3 className="text-sm font-semibold text-[#1F2937]">基础信息</h3>
                <p className="mt-1 text-xs font-normal leading-5 text-[#667085]">客户姓名必填，手机号和微信号至少填写一项。</p>
              </div>
              <div className={sectionBodyClass}>
                <div>
                  <label className={labelClass}>客户姓名 <span className="text-red-500">*</span></label>
                  <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                    className={cn(inputClass, errors.name && "border-red-400")} placeholder="请输入客户姓名" />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>

                <div>
                  <label className={labelClass}>客户来源</label>
                  <SystemSelect value={form.source} onChange={(e) => set("source", e.target.value)} className={inputClass} menuClassName={selectMenuClass} optionClassName={selectOptionClass}>
                    <option value="">请选择来源</option>
                    {sourceOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </SystemSelect>
                </div>

                <div>
                  <label className={labelClass}>手机号</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.phone}
                    onChange={(e) => set("phone", normalizePhone(e.target.value))}
                    onBlur={(e) => checkDuplicate(e.target.value)}
                    className={cn(inputClass, errors.phone && "border-red-400")}
                    placeholder="请输入11位手机号"
                  />
                  {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                </div>

                <div>
                  <label className={labelClass}>微信号</label>
                  <input type="text" value={form.weixin} onChange={(e) => set("weixin", e.target.value)}
                    className={cn(inputClass, errors.weixin && "border-red-400")} placeholder="请输入微信号" />
                  {errors.weixin && <p className="mt-1 text-xs text-red-500">{errors.weixin}</p>}
                </div>

                {duplicateWarning && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 md:col-span-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <span><span className="font-medium">重复提醒：</span>{duplicateWarning}</span>
                  </div>
                )}
              </div>
            </section>

            <section className={sectionClass}>
              <div className={sectionHeaderClass}>
                <h3 className="text-sm font-semibold text-[#1F2937]">房屋信息</h3>
                <p className="mt-1 text-xs font-normal leading-5 text-[#667085]">记录小区、完整房号和面积信息。</p>
              </div>
              <div className={sectionBodyClass}>
                <div className="md:col-span-2">
                  <label className={labelClass}>小区/楼盘 <span className="text-red-500">*</span></label>
                  <div className={cn(
                    "flex overflow-hidden rounded-lg border border-[#D7DFEA] bg-white transition hover:border-[#C5CFDC] focus-within:border-[#407AFF] focus-within:ring-[3px] focus-within:ring-[#407AFF]/12",
                    errors.address && "border-red-400"
                  )}>
                    <input type="text" value={form.address} onChange={(e) => setAddressText(e.target.value)}
                      className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] font-normal text-[#1F2937] outline-none placeholder:text-[#98A2B3]" placeholder="请输入小区或楼盘名称" />
                    <button
                      type="button"
                      onClick={() => setMapPickerOpen(true)}
                      className="inline-flex shrink-0 items-center gap-1.5 border-l border-[#E5EAF2] px-3 text-xs font-medium text-[#407AFF] transition hover:bg-[#EDF4FF] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#407AFF]/15"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      地图选点
                    </button>
                  </div>
                  {form.address_latitude && form.address_longitude && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#EDF4FF] px-2 py-0.5 text-xs font-medium text-[#407AFF]">
                      <MapPin className="h-3 w-3" />
                      已保存实际地址定位
                    </p>
                  )}
                  {errors.address && <p className="mt-1 text-xs text-red-500">{errors.address}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>房屋地址</label>
                  <input
                    type="text"
                    value={form.house_address}
                    onChange={(event) => set("house_address", event.target.value)}
                    className={inputClass}
                    placeholder="地图选点后自动带出，也可手动填写"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className={labelClass}>
                      房号信息 <span className="text-xs font-medium text-[#6B7280]">选填</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280]">
                      <input
                        type="checkbox"
                        checked={form.no_room_number}
                        onChange={(event) => setNoRoomNumber(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-[#D7DFEA] text-[#407AFF] accent-[#407AFF]"
                      />
                      暂无房号
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[#6B7280]">楼栋</span>
                      <input
                        type="text"
                        value={form.building_no}
                        disabled={form.no_room_number}
                        onChange={(event) => set("building_no", event.target.value)}
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#9CA3AF]`}
                        placeholder="如：3栋"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[#6B7280]">单元</span>
                      <input
                        type="text"
                        value={form.unit_no}
                        disabled={form.no_room_number}
                        onChange={(event) => set("unit_no", event.target.value)}
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#9CA3AF]`}
                        placeholder="如：2单元"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[#6B7280]">房室</span>
                      <input
                        type="text"
                        value={form.room_no}
                        disabled={form.no_room_number}
                        onChange={(event) => set("room_no", event.target.value)}
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#9CA3AF]`}
                        placeholder="如：1201室"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>装修面积 (㎡) <span className="text-red-500">*</span></label>
                  <input type="number" value={form.area_size} onChange={(e) => set("area_size", e.target.value)}
                    className={cn(inputClass, errors.area_size && "border-red-400")} placeholder="例：120" min="1" />
                  {errors.area_size && <p className="mt-1 text-xs text-red-500">{errors.area_size}</p>}
                </div>

                <div>
                  <label className={labelClass}>户型</label>
                  <SystemSelect value={form.house_type} onChange={(e) => set("house_type", e.target.value)} className={inputClass} menuClassName={selectMenuClass} optionClassName={selectOptionClass}>
                    <option value="">请选择户型</option>
                    {houseTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </SystemSelect>
                </div>
              </div>
            </section>

            <section className={sectionClass}>
              <div className={sectionHeaderClass}>
                <h3 className="text-sm font-semibold text-[#1F2937]">装修需求</h3>
                <p className="mt-1 text-xs font-normal leading-5 text-[#667085]">记录客户预算、交房状态、意向度和补充说明。</p>
              </div>
              <div className={sectionBodyClass}>
                <div>
                  <label className={labelClass}>装修类型</label>
                  <SystemSelect value={form.decoration_type} onChange={(e) => set("decoration_type", e.target.value)} className={inputClass} menuClassName={selectMenuClass} optionClassName={selectOptionClass}>
                    <option value="">请选择装修类型</option>
                    {decorationTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </SystemSelect>
                </div>

                <div>
                  <label className={labelClass}>装修预算（万元）</label>
                  <div className="flex overflow-hidden rounded-lg border border-[#D7DFEA] bg-white transition hover:border-[#C5CFDC] focus-within:border-[#407AFF] focus-within:ring-[3px] focus-within:ring-[#407AFF]/12">
                    <input
                      type="number"
                      value={form.budget}
                      onChange={(e) => set("budget", e.target.value)}
                      className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] font-normal text-[#1F2937] outline-none placeholder:text-[#98A2B3]"
                      placeholder="例：20"
                      min="0"
                      step="0.1"
                    />
                    <span className="flex shrink-0 items-center border-l border-[#E5EAF2] px-3 text-sm font-semibold text-[#6B7280]">万元</span>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>是否交房</label>
                  <SystemSelect value={form.is_delivered} onChange={(e) => set("is_delivered", e.target.value)} className={inputClass} menuClassName={selectMenuClass} optionClassName={selectOptionClass}>
                    <option value="">请选择</option>
                    <option value="未交房">未交房</option>
                    <option value="已交房">已交房</option>
                  </SystemSelect>
                </div>

                <div>
                  <label className={labelClass}>客户意向</label>
                  <SystemSelect value={form.intention} onChange={(e) => set("intention", e.target.value)} className={inputClass} menuClassName={selectMenuClass} optionClassName={selectOptionClass}>
                    <option value="">请选择意向度</option>
                    {intentionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </SystemSelect>
                  <p className={hintClass}>下拉选择客户意向度，星星越多意向越高。</p>
                </div>

                <div>
                  <label className={labelClass}>装修需求</label>
                  <textarea value={form.requirements} onChange={(e) => set("requirements", e.target.value)}
                    className={`${textAreaClass} min-h-[76px] resize-y`} placeholder="请描述客户的装修需求..." rows={3} />
                </div>

                <div>
                  <label className={labelClass}>备注</label>
                  <textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)}
                    className={`${textAreaClass} min-h-[76px] resize-y`} placeholder="备注信息..." rows={3} />
                </div>
              </div>
            </section>

            {errors.submit && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">{errors.submit}</div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-[#E5EAF2] bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p className="text-xs font-normal text-[#667085]">带 <span className="font-medium text-red-500">*</span> 的字段为必填项</p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>取消</button>
            <button type="submit" disabled={submitting} className={primaryButtonClass}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "提交中..." : isEdit ? "保存修改" : "保存客户"}
            </button>
          </div>
        </div>
      </form>
      {mapPickerOpen && (
        <AmapLocationPicker
          initialKeyword={form.address}
          onClose={() => setMapPickerOpen(false)}
          onConfirm={applyPickedLocation}
        />
      )}
    </div>
  );
}

export function AmapLocationPicker({
  initialKeyword,
  mobile = false,
  onClose,
  onConfirm,
}: {
  initialKeyword: string;
  mobile?: boolean;
  onClose: () => void;
  onConfirm: (location: LocationPick) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapCityTimerRef = useRef<number | null>(null);
  const keywordRef = useRef(initialKeyword);
  const currentCityRef = useRef("");
  const [keyword, setKeyword] = useState(initialKeyword);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selected, setSelected] = useState<LocationPick | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [searching, setSearching] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapRetryKey, setMapRetryKey] = useState(0);
  keywordRef.current = keyword;

  const placeMarker = useCallback((longitude: number, latitude: number) => {
    if (!window.AMap || !mapRef.current) return;
    const position = [longitude, latitude];
    if (!markerRef.current) {
      markerRef.current = new window.AMap.Marker({ position, map: mapRef.current });
    } else {
      markerRef.current.setPosition(position);
    }
    mapRef.current.setCenter(position);
  }, []);

  const setMapCity = useCallback((city: string) => {
    const nextCity = city.trim();
    if (!nextCity) return;
    currentCityRef.current = nextCity;
  }, []);

  const syncCityFromReverseData = useCallback((data: any) => {
    const city = String(data?.city || data?.province || "").trim();
    if (city) setMapCity(city);
  }, [setMapCity]);

  const resolveInitialMapCenter = useCallback(async (positionPromise: Promise<BrowserPosition | null>) => {
    const position = await positionPromise;
    if (!position) return { ...defaultMapCenter, city: "" };

    try {
      const response = await fetch(`/api/location/reverse?lat=${encodeURIComponent(position.latitude)}&lng=${encodeURIComponent(position.longitude)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "当前位置解析失败");
      const longitude = Number(data?.amap_longitude);
      const latitude = Number(data?.amap_latitude);
      return {
        longitude: Number.isFinite(longitude) ? longitude : position.longitude,
        latitude: Number.isFinite(latitude) ? latitude : position.latitude,
        city: String(data?.city || data?.province || "").trim(),
      };
    } catch {
      // 浏览器位置仍可作为地图中心，城市搜索会继续由地图移动后的反向解析更新。
      return { ...position, city: "" };
    }
  }, []);

  const reverseCoordinate = useCallback(async (longitude: number, latitude: number) => {
    const response = await fetch(`/api/location/reverse?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&coordsys=amap`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || "位置解析失败");
    syncCityFromReverseData(data);
    return data;
  }, [syncCityFromReverseData]);

  const syncCurrentMapCity = useCallback(async () => {
    const center = mapRef.current?.getCenter?.();
    const longitude = Number(center?.lng);
    const latitude = Number(center?.lat);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
    try {
      const data = await reverseCoordinate(longitude, latitude);
      syncCityFromReverseData(data);
    } catch {
      // 城市识别失败时保留上一次城市，不影响用户搜索和选点。
    }
  }, [reverseCoordinate, syncCityFromReverseData]);

  const pickByCoordinate = useCallback(async (longitude: number, latitude: number) => {
    placeMarker(longitude, latitude);
    setReverseLoading(true);
    setMessage("");
    try {
      const data = await reverseCoordinate(longitude, latitude);
      const name = String(data.place_name || data.location_name || data.location_address || "").replace(/附近$/, "");
      setSelected({
        name,
        address: data.location_address || "",
        longitude,
        latitude,
        source: "map",
      });
    } catch (error) {
      setSelected({
        name: `选点位置 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        address: "",
        longitude,
        latitude,
        source: "map",
      });
      setMessage(error instanceof Error ? error.message : "位置解析失败，请确认后手动调整名称");
    } finally {
      setReverseLoading(false);
    }
  }, [placeMarker, reverseCoordinate]);

  const searchPlaces = useCallback(async (value?: string) => {
    const searchValue = value === undefined ? keywordRef.current : value;
    const query = searchValue.trim();
    if (!query) {
      setMessage("请输入小区、楼盘或地址关键词");
      return;
    }
    setSearching(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ keywords: query });
      if (currentCityRef.current) params.set("city", currentCityRef.current);
      const response = await fetch(`/api/location/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "搜索失败");
      setResults(data.pois || []);
      if (!data.pois?.length) setMessage("没有搜索到匹配的小区/楼盘，可以在地图上直接点选");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }, []);

  const selectResult = (place: PlaceSearchResult) => {
    const name = place.name || place.address;
    setSelected({
      name,
      address: place.address || place.district,
      longitude: place.longitude,
      latitude: place.latitude,
      source: "search",
    });
    if (place.longitude !== null && place.latitude !== null) {
      placeMarker(place.longitude, place.latitude);
      mapRef.current?.setZoom(16);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const initMap = async () => {
      setLoadingMap(true);
      setMessage("");
      setMapError("");
      const browserPositionPromise = getBrowserPosition();
      try {
        const configResponse = await fetch("/api/location/config");
        const config = await configResponse.json();
        if (!configResponse.ok || !config.amapJsKey) {
          throw new Error(config?.message || "未配置高德 JS Key");
        }
        await loadAmapScript(config.amapJsKey, config.securityJsCode);
        if (cancelled || !mapContainerRef.current || !window.AMap) return;
        const initialCenter = await resolveInitialMapCenter(browserPositionPromise);
        if (cancelled || !mapContainerRef.current || !window.AMap) return;
        if (initialCenter.city) setMapCity(initialCenter.city);
        const map = new window.AMap.Map(mapContainerRef.current, {
          center: [initialCenter.longitude, initialCenter.latitude],
          zoom: 12,
          viewMode: "2D",
        });
        mapRef.current = map;
        window.setTimeout(() => map.resize?.(), 0);
        window.setTimeout(() => map.resize?.(), 180);
        map.on("click", (event: any) => {
          const longitude = Number(event?.lnglat?.lng);
          const latitude = Number(event?.lnglat?.lat);
          if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
            void pickByCoordinate(longitude, latitude);
          }
        });
        map.on("moveend", () => {
          if (mapCityTimerRef.current) window.clearTimeout(mapCityTimerRef.current);
          mapCityTimerRef.current = window.setTimeout(() => {
            void syncCurrentMapCity();
          }, 500);
        });
        void syncCurrentMapCity();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "地图初始化失败";
        setMessage(errorMessage);
        setMapError(errorMessage);
      } finally {
        if (!cancelled) setLoadingMap(false);
      }
    };
    void initMap();
    if (initialKeyword.trim()) {
      void searchPlaces(initialKeyword);
    }
    return () => {
      cancelled = true;
      if (mapCityTimerRef.current) window.clearTimeout(mapCityTimerRef.current);
      mapRef.current?.destroy?.();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initialKeyword, mapRetryKey, pickByCoordinate, resolveInitialMapCenter, searchPlaces, setMapCity, syncCurrentMapCity]);

  useEffect(() => {
    const query = keyword.trim();
    if (query.length < 2) return;
    const timer = window.setTimeout(() => {
      void searchPlaces(query);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [keyword, searchPlaces]);

  if (mobile) {
    return (
      <div className="customer-entry-mobile-map-picker relative z-[260] flex h-full min-h-0 w-full max-w-[520px] flex-col overflow-hidden bg-[#f4f6f3] text-[#192522]">
        <header className="grid min-h-[64px] shrink-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5 border-b border-[#dfe5e1] bg-white px-4 pb-2.5 pt-[max(10px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-[11px] border border-[#d8e1dc] bg-white text-[#4f5e59] active:scale-95 active:bg-[#edf2ef]" aria-label="返回新增客户">
            <ArrowLeft className="h-[19px] w-[19px]" />
          </button>
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold text-[#1e2c28]">选择小区位置</h3>
            <p className="mt-0.5 truncate text-[10px] font-medium text-[#84908c]">搜索楼盘或直接在地图上点选</p>
          </div>
        </header>

        <section className={cn("relative min-h-[280px] overflow-hidden border-b border-[#dfe5e1] bg-[#eef2f0]", results.length === 0 ? "flex-1" : "h-[34dvh] max-h-[320px] shrink-0")}>
          <div ref={mapContainerRef} className="h-full w-full" />
          {loadingMap && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/85 text-xs font-semibold text-[#53635e]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />地图加载中
            </div>
          )}
          {!loadingMap && mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-5 text-center">
              <div className="max-w-[300px]">
                <p className="text-[12px] font-bold text-[#30403b]">地图没有加载成功</p>
                <p className="mt-1.5 text-[10px] font-medium leading-5 text-[#84908c]">{mapError}</p>
                <button
                  type="button"
                  onClick={() => setMapRetryKey((value) => value + 1)}
                  className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#d8e1dc] bg-white px-3 text-[11px] font-bold text-[#176b5b]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />重新加载
                </button>
              </div>
            </div>
          )}
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-white/80 bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-[#53635e] shadow-sm">
            <MapPin className="h-3.5 w-3.5 text-[#176b5b]" />拖动地图或点击位置
          </div>
        </section>

        <section className="shrink-0 border-b border-[#e0e6e3] bg-white p-3">
          <div className="flex h-11 overflow-hidden rounded-[11px] border border-[#d8e1dc] bg-[#fbfcfb] focus-within:border-[#609386] focus-within:ring-[3px] focus-within:ring-[#176b5b]/10">
            <Search className="ml-3 h-[17px] w-[17px] shrink-0 self-center text-[#81908b]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchPlaces();
                }
              }}
              className="min-w-0 flex-1 bg-transparent px-2.5 text-[13px] font-medium text-[#26342f] outline-none placeholder:text-[#9ca7a3]"
              placeholder="搜索小区、楼盘或地址"
            />
            <button type="button" onClick={() => void searchPlaces()} className="inline-flex w-[62px] shrink-0 items-center justify-center border-l border-[#e0e6e3] text-xs font-bold text-[#176b5b] active:bg-[#edf4f1]">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜索"}
            </button>
          </div>
          {message && <p className="mt-1.5 px-1 text-[10px] font-medium text-[#9a651d]">{message}</p>}
        </section>

        <section className={cn("overflow-y-auto overscroll-contain bg-[#f4f6f3] px-3", results.length === 0 ? "shrink-0 py-2" : "min-h-0 flex-1 py-2.5")}>
          {results.length === 0 ? (
            <div className="flex min-h-[42px] items-center justify-center px-6 text-center text-[10px] font-medium leading-5 text-[#84918c]">
              搜索后可从列表选择，也可以直接点击上方地图
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#dfe5e1] bg-white">
              {results.map((place, index) => {
                const active = selected?.longitude === place.longitude && selected?.latitude === place.latitude && selected?.name === place.name;
                return (
                  <button
                    key={`${place.id}-${place.location}`}
                    type="button"
                    onClick={() => selectResult(place)}
                    className={cn(
                      "grid min-h-[58px] w-full grid-cols-[minmax(0,1fr)_20px] items-center gap-2 px-3 py-2 text-left",
                      index > 0 && "border-t border-[#edf0ee]",
                      active ? "bg-[#edf6f2]" : "bg-white active:bg-[#f3f6f4]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className={cn("block truncate text-[12px] font-bold", active ? "text-[#176b5b]" : "text-[#30403b]")}>{place.name}</span>
                      <span className="mt-1 block truncate text-[10px] font-medium text-[#83908b]">{place.address || place.district || "暂无详细地址"}</span>
                    </span>
                    <span className={cn("grid h-5 w-5 place-items-center rounded-full border", active ? "border-[#176b5b] bg-[#176b5b] text-white" : "border-[#d6dfda] text-transparent")}><Check className="h-3 w-3" /></span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <footer className="shrink-0 border-t border-[#dce3df] bg-white px-3.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
          <div className="mb-2 flex min-w-0 items-center gap-2.5 px-0.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#e8f2ee] text-[#176b5b]"><MapPin className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <small className="block text-[9px] font-semibold text-[#899590]">当前选择</small>
              <b className="mt-0.5 block truncate text-[12px] font-bold text-[#30403b]">{reverseLoading ? "位置解析中..." : selected?.name || "请在地图或搜索结果中选择"}</b>
            </span>
          </div>
          <button type="button" disabled={!selected || reverseLoading} onClick={() => selected && onConfirm(selected)} className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-[#176b5b] bg-[#176b5b] text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(23,107,91,.15)] active:scale-[.99] disabled:border-[#cdd7d2] disabled:bg-[#dfe6e2] disabled:text-[#8d9994] disabled:shadow-none">
            <MapPin className="h-[17px] w-[17px]" />确认此位置
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/24 px-4 py-6 backdrop-blur-[1px]">
      <div className="customer-entry-map-modal-shell flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-none border border-[#DCE4EF] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5EAF2] bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-[#1F2937]">地图选择小区/楼盘</h3>
            <p className="mt-0.5 text-xs font-medium text-[#6B7280]">搜索楼盘或直接点击地图，确认后自动回填到客户资料。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-none p-1.5 text-[#8A97A8] hover:bg-[#F8FAFC] hover:text-[#1F2937]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_340px]">
          <div className="relative min-h-[420px] bg-[#F5F7FB]">
            <div ref={mapContainerRef} className="h-full min-h-[420px] w-full" />
            {loadingMap && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm font-semibold text-[#4B5563]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                地图加载中...
              </div>
            )}
            {!loadingMap && mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-8 text-center">
                <div className="max-w-[360px]">
                  <p className="text-sm font-semibold text-[#1F2937]">地图没有加载成功</p>
                  <p className="mt-2 text-xs font-medium leading-5 text-[#6B7280]">{mapError}</p>
                  <button
                    type="button"
                    onClick={() => setMapRetryKey((value) => value + 1)}
                    className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-none border border-[#D7DFEA] bg-white px-3 text-xs font-semibold text-[#407AFF] hover:bg-[#F8FAFC]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    重新加载地图
                  </button>
                </div>
              </div>
            )}
            <div className="absolute left-4 top-4 rounded-none border border-[#E5EAF2] bg-white/95 px-3 py-2 text-xs font-medium text-[#4B5563]">
              可拖动地图，也可以点击地图任意位置选点
            </div>
          </div>

          <div className="flex min-h-0 flex-col border-l border-[#E5EAF2] bg-white">
            <div className="border-b border-[#E5EAF2] p-4">
              <label className={labelClass}>搜索小区/楼盘</label>
              <div className="flex overflow-hidden rounded-none border border-[#D7DFEA] bg-white focus-within:border-[#407AFF] focus-within:ring-2 focus-within:ring-[#407AFF]/15">
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchPlaces();
                    }
                  }}
                  className="min-h-10 min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-medium text-[#1F2937] outline-none placeholder:text-[#9CA3AF]"
                  placeholder="输入小区、楼盘或地址"
                />
                <button
                  type="button"
                  onClick={() => void searchPlaces()}
                  className="inline-flex min-h-10 items-center gap-1 border-l border-[#E5EAF2] px-3 text-sm font-semibold text-[#407AFF] hover:bg-[#F8FAFC]"
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  搜索
                </button>
              </div>
              {message && <p className="mt-2 text-xs text-amber-600">{message}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {results.length === 0 ? (
                <div className="rounded-none border border-dashed border-[#CFE0FF] bg-[#F8FAFC] px-4 py-8 text-center text-sm font-medium text-[#6B7280]">
                  搜索结果会显示在这里，也可以直接在左侧地图点选。
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((place) => {
                    const active = selected?.longitude === place.longitude && selected?.latitude === place.latitude && selected?.name === place.name;
                    return (
                      <button
                        key={`${place.id}-${place.location}`}
                        type="button"
                        onClick={() => selectResult(place)}
                        className={cn(
                          "w-full rounded-none border px-3 py-2 text-left transition-colors",
                          active ? "border-[#CFE0FF] bg-[#EDF4FF]" : "border-[#E5EAF2] bg-white hover:border-[#CFE0FF] hover:bg-[#F8FAFC]"
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[#1F2937]">{place.name}</span>
                          {active && <Check className="h-4 w-4 text-[#407AFF]" />}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-xs font-medium text-[#6B7280]">{place.address || place.district || "暂无详细地址"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[#E5EAF2] bg-[#F8FAFC] p-4">
              <div className="mb-3 rounded-none border border-[#E5EAF2] bg-white px-3 py-2">
                <p className="text-xs font-medium text-[#6B7280]">当前选择</p>
                <p className="mt-1 truncate text-sm font-semibold text-[#1F2937]">{reverseLoading ? "位置解析中..." : selected?.name || "未选择"}</p>
                {selected?.address && <p className="mt-1 line-clamp-2 text-xs font-medium text-[#6B7280]">{selected.address}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className={secondaryButtonClass}>取消</button>
                <button type="button" disabled={!selected || reverseLoading} onClick={() => selected && onConfirm(selected)} className={`${primaryButtonClass} disabled:opacity-60`}>
                  确认回填
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
