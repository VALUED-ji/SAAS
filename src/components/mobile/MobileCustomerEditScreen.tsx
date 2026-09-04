"use client";

import { AmapLocationPicker, type LocationPick } from "@/components/ui/AddCustomerModal";
import { formatUserRoleLabel } from "@/lib/userRoleLabels";
import { AlertCircle, ArrowLeft, Check, ChevronRight, Loader2, MapPin, Save, Search, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "@/app/m/mobile.module.css";

type CustomerRecord = Record<string, any> & { id: string };
type OrgUnit = { id: string; name: string; type: string; parent_id: string | null; is_active?: number };
type Employee = { id: string; name: string; phone?: string | null; role?: string | null; role_name?: string | null; is_active?: number };
type PickerField = "service_store" | "inviter_id" | "source" | "house_type" | "decoration_type" | "is_delivered" | "intention";
type PickerOption = { value: string; label: string; description?: string };

const sourceOptions = ["门店", "转介绍", "小程序", "广告投放", "抖音", "小红书", "其它"];
const intentionOptions = ["★", "★★", "★★★", "★★★★", "★★★★★"];
const houseTypeOptions = ["一室一厅", "两室一厅", "两室两厅", "三室一厅", "三室两厅", "四室及以上", "别墅/复式"];
const decorationTypeOptions = ["全包", "半包", "清包"];

function customerToForm(customer: CustomerRecord) {
  const budget = Number(customer.budget || 0);
  const delivery = customer.is_delivered === undefined || customer.is_delivered === null || customer.is_delivered === ""
    ? ""
    : customer.is_delivered === true || customer.is_delivered === 1 || customer.is_delivered === "1" || customer.is_delivered === "已交房" ? "已交房" : "未交房";
  return {
    name: String(customer.name || ""),
    phone: customer.phone === "仅微信联系" ? "" : String(customer.phone || ""),
    weixin: String(customer.weixin || ""),
    source: String(customer.source || ""),
    address: String(customer.address || ""),
    house_address: String(customer.house_address || ""),
    address_location_name: String(customer.address_location_name || ""),
    address_location_address: String(customer.address_location_address || ""),
    address_latitude: customer.address_latitude === undefined || customer.address_latitude === null ? "" : String(customer.address_latitude),
    address_longitude: customer.address_longitude === undefined || customer.address_longitude === null ? "" : String(customer.address_longitude),
    building_no: String(customer.building_no || ""),
    unit_no: String(customer.unit_no || ""),
    room_no: String(customer.room_no || ""),
    no_room_number: customer.no_room_number === true || customer.no_room_number === 1 || customer.no_room_number === "1",
    area_size: customer.area_size === undefined || customer.area_size === null ? "" : String(customer.area_size),
    house_type: String(customer.house_type || ""),
    decoration_type: String(customer.decoration_type || ""),
    budget: Number.isFinite(budget) && budget > 0 ? String(budget / 10000) : "",
    is_delivered: delivery,
    intention: String(customer.intention || ""),
    requirements: String(customer.requirements || ""),
    remarks: String(customer.remarks || ""),
    service_store: String(customer.service_store || ""),
    inviter_id: String(customer.inviter_id || ""),
  };
}

function budgetWanToYuan(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 10000 * 100) / 100 : null;
}

export function MobileCustomerEditScreen({ customer, onClose, onSaved }: { customer: CustomerRecord; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => customerToForm(customer));
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [pickerField, setPickerField] = useState<PickerField | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/org").then((response) => response.ok ? response.json() : []),
      fetch("/api/team").then((response) => response.ok ? response.json() : []),
    ]).then(([orgData, teamData]) => {
      setOrgUnits(Array.isArray(orgData) ? orgData : []);
      setEmployees(Array.isArray(teamData) ? teamData : []);
    }).catch(() => {
      setOrgUnits([]);
      setEmployees([]);
    });
  }, []);

  const stores = useMemo(() => {
    const options = orgUnits.filter((unit) => unit.type === "store" && (Number(unit.is_active ?? 1) === 1 || unit.name === form.service_store)).map((unit) => ({ value: unit.name, label: unit.name }));
    if (form.service_store && !options.some((item) => item.value === form.service_store)) options.unshift({ value: form.service_store, label: form.service_store });
    return options;
  }, [form.service_store, orgUnits]);
  const inviters = useMemo(() => employees.filter((employee) => Number(employee.is_active ?? 1) === 1 || employee.id === form.inviter_id).map((employee) => ({ value: employee.id, label: employee.name, description: [employee.phone, formatUserRoleLabel(employee.role, employee.role_name)].filter(Boolean).join(" · ") })), [employees, form.inviter_id]);
  const sources = useMemo(() => Array.from(new Set([form.source, ...sourceOptions].filter(Boolean))), [form.source]);
  const pickerConfigs = useMemo<Record<PickerField, { title: string; subtitle: string; placeholder: string; searchable?: boolean; options: PickerOption[] }>>(() => ({
    service_store: { title: "选择服务门店", subtitle: "客户将归属到所选门店", placeholder: "请选择服务门店", searchable: true, options: stores },
    inviter_id: { title: "选择邀约人", subtitle: "可按姓名、电话或岗位搜索", placeholder: "请选择邀约人", searchable: true, options: inviters },
    source: { title: "选择客户来源", subtitle: "用于后续渠道统计", placeholder: "请选择来源", options: sources.map((item) => ({ value: item, label: item })) },
    house_type: { title: "选择户型", subtitle: "选择最接近的房屋户型", placeholder: "请选择户型", options: houseTypeOptions.map((item) => ({ value: item, label: item })) },
    decoration_type: { title: "选择装修类型", subtitle: "选择客户意向的承包方式", placeholder: "请选择装修类型", options: decorationTypeOptions.map((item) => ({ value: item, label: item })) },
    is_delivered: { title: "选择交房状态", subtitle: "确认房屋当前是否已经交付", placeholder: "请选择", options: ["未交房", "已交房"].map((item) => ({ value: item, label: item })) },
    intention: { title: "选择客户意向", subtitle: "星级越高，客户意向越明确", placeholder: "请选择意向度", options: intentionOptions.map((item) => ({ value: item, label: item })) },
  }), [inviters, sources, stores]);
  const activePicker = pickerField ? pickerConfigs[pickerField] : null;
  const activePickerValue = pickerField ? String(form[pickerField] || "") : "";
  const filteredOptions = useMemo(() => {
    if (!activePicker) return [];
    const keyword = pickerQuery.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return activePicker.options;
    return activePicker.options.filter((option) => `${option.label} ${option.description || ""}`.toLocaleLowerCase("zh-CN").includes(keyword));
  }, [activePicker, pickerQuery]);

  const update = (key: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  };
  const closePicker = () => { setPickerField(null); setPickerQuery(""); };
  const selectPickerOption = (value: string) => {
    if (!pickerField) return;
    update(pickerField, value);
    closePicker();
  };
  const renderPicker = (field: PickerField) => {
    const config = pickerConfigs[field];
    const selected = config.options.find((option) => option.value === form[field]);
    return <button type="button" className={styles.customerMobileSelectTrigger} data-empty={selected ? undefined : "true"} onClick={() => { setPickerQuery(""); setPickerField(field); }} aria-haspopup="dialog"><span>{selected?.label || config.placeholder}</span><ChevronRight /></button>;
  };
  const setAddressText = (value: string) => {
    setForm((current) => ({ ...current, address: value, address_location_name: "", address_location_address: "", address_latitude: "", address_longitude: "" }));
    if (errors.address) setErrors((current) => ({ ...current, address: "" }));
  };
  const applyLocation = (location: LocationPick) => {
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
  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "请输入客户姓名";
    if (!form.address.trim()) nextErrors.address = "请输入小区/楼盘";
    if (!form.area_size || Number(form.area_size) <= 0) nextErrors.area_size = "请输入装修面积";
    if (form.phone.trim() && form.phone.length !== 11) nextErrors.phone = "手机号必须为11位数字";
    if (!form.phone.trim() && !form.weixin.trim()) { nextErrors.phone = "手机号和微信号至少填一项"; nextErrors.weixin = "手机号和微信号至少填一项"; }
    setErrors(nextErrors);
    setMessage(Object.values(nextErrors)[0] || "");
    return Object.keys(nextErrors).length === 0;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(customer.id)}`, {
        method: "PATCH",
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
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "客户资料保存失败");
      onSaved();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "客户资料保存失败");
    } finally {
      setSaving(false);
    }
  };

  return <div className={`${styles.sheetBackdrop} ${styles.customerEditBackdrop}`} role="presentation">
    <form className={`${styles.sheet} ${styles.customerCreateSheet}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="customer-edit-title">
      <header className={styles.customerCreateHeader}><button type="button" onClick={onClose} aria-label="返回完整客户信息"><ArrowLeft /></button><div><div id="customer-edit-title" className={styles.customerCreateTitle}>编辑客户信息</div><div className={styles.customerCreateSubtitle}>修改后将同步更新电脑端客户资料</div></div></header>
      <div className={styles.customerCreateBody}>
        {message && <div className={styles.message}><AlertCircle />{message}</div>}
        <section className={styles.customerCreateSection}><div className={styles.customerCreateSectionHeading}><b>归属信息</b><small>门店与邀约人员</small></div><div className={styles.customerCreateFields}>
          <div className={styles.customerCreateField}><span>服务客户门店</span>{renderPicker("service_store")}</div><div className={styles.customerCreateField}><span>邀约人</span>{renderPicker("inviter_id")}</div>
        </div></section>
        <section className={styles.customerCreateSection}><div className={styles.customerCreateSectionHeading}><b>基础信息</b><small>姓名与联系方式</small></div><div className={styles.customerCreateFields}>
          <label className={styles.customerCreateField} data-error={errors.name || undefined}><span className={styles.required}>客户姓名</span><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="请输入客户姓名" /></label>
          <div className={styles.customerCreateField}><span>客户来源</span>{renderPicker("source")}</div>
          <label className={styles.customerCreateField} data-error={errors.phone || undefined}><span>手机号</span><input inputMode="numeric" maxLength={11} value={form.phone} onChange={(event) => update("phone", event.target.value.replace(/\D/g, "").slice(0,11))} placeholder="请输入11位手机号" /></label>
          <label className={styles.customerCreateField} data-error={errors.weixin || undefined}><span>微信号</span><input value={form.weixin} onChange={(event) => update("weixin", event.target.value)} placeholder="请输入微信号" /></label>
        </div></section>
        <section className={styles.customerCreateSection}><div className={styles.customerCreateSectionHeading}><b>房屋信息</b><small>地址、房号与面积</small></div><div className={styles.customerCreateFields}>
          <div className={styles.customerCreateField} data-error={errors.address || undefined}><span className={styles.required}>小区 / 楼盘</span><div className={styles.customerAddressControl}><input value={form.address} onChange={(event) => setAddressText(event.target.value)} placeholder="请输入小区或楼盘名称" /><button type="button" onClick={() => setMapPickerOpen(true)}><MapPin />选点</button></div></div>
          {form.address_latitude && form.address_longitude && <div className={styles.customerLocationStatus}><MapPin />已保存实际地址定位</div>}
          <label className={styles.customerCreateField}><span>房屋地址</span><input value={form.house_address} onChange={(event) => update("house_address", event.target.value)} placeholder="选点后自动带出，也可手动填写" /></label>
          <div className={styles.customerRoomBlock}><div className={styles.customerRoomHeading}><span>房号信息 <small>选填</small></span><label><input type="checkbox" checked={form.no_room_number} onChange={(event) => setForm((current) => ({ ...current, no_room_number: event.target.checked, ...(event.target.checked ? { building_no: "", unit_no: "", room_no: "" } : {}) }))} /><i>{form.no_room_number && <Check />}</i>暂无房号</label></div><div className={styles.customerRoomFields}>
            <label><span>楼栋</span><input disabled={form.no_room_number} value={form.building_no} onChange={(event) => update("building_no", event.target.value)} placeholder="如 3栋" /></label><label><span>单元</span><input disabled={form.no_room_number} value={form.unit_no} onChange={(event) => update("unit_no", event.target.value)} placeholder="如 2单元" /></label><label><span>房室</span><input disabled={form.no_room_number} value={form.room_no} onChange={(event) => update("room_no", event.target.value)} placeholder="如 1201室" /></label>
          </div></div>
          <label className={styles.customerCreateField} data-error={errors.area_size || undefined}><span className={styles.required}>装修面积</span><span className={styles.customerAreaInput}><input inputMode="decimal" value={form.area_size} onChange={(event) => update("area_size", event.target.value.replace(/[^\d.]/g, ""))} placeholder="请输入面积" /><em>㎡</em></span></label>
          <div className={styles.customerCreateField}><span>户型</span>{renderPicker("house_type")}</div>
        </div></section>
        <section className={styles.customerCreateSection}><div className={styles.customerCreateSectionHeading}><b>装修需求</b><small>预算、交房与补充说明</small></div><div className={styles.customerCreateFields}>
          <div className={styles.customerCreateField}><span>装修类型</span>{renderPicker("decoration_type")}</div><label className={styles.customerCreateField}><span>装修预算</span><span className={styles.customerAreaInput}><input inputMode="decimal" value={form.budget} onChange={(event) => update("budget", event.target.value.replace(/[^\d.]/g, ""))} placeholder="例如 20" /><em>万元</em></span></label><div className={styles.customerCreateField}><span>是否交房</span>{renderPicker("is_delivered")}</div><div className={styles.customerCreateField}><span>客户意向</span>{renderPicker("intention")}</div>
        </div><label className={styles.customerRequirementField}><span>装修需求</span><textarea value={form.requirements} onChange={(event) => update("requirements", event.target.value)} placeholder="请描述客户的装修需求" /></label><label className={styles.customerRequirementField}><span>备注</span><textarea value={form.remarks} onChange={(event) => update("remarks", event.target.value)} placeholder="填写其他需要说明的信息" /></label></section>
        <p className={styles.customerCreateHint}>手机号和微信号至少填写一项，保存后电脑端和手机端会同步更新。</p>
      </div>
      <footer className={styles.customerCreateFooter}><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "保存中" : "保存修改"}</button></footer>
    </form>
    {pickerField && activePicker && <div className={styles.customerOptionBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePicker()}><section className={styles.customerOptionSheet} role="dialog" aria-modal="true" aria-labelledby="customer-edit-option-title"><div className={styles.customerOptionHandle} /><header className={styles.customerOptionHeader}><div><h3 id="customer-edit-option-title">{activePicker.title}</h3><p>{activePicker.subtitle}</p></div><button type="button" onClick={closePicker} aria-label="关闭选择面板"><X /></button></header>{activePicker.searchable && <label className={styles.customerOptionSearch}><Search /><input autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="输入关键词搜索" />{pickerQuery && <button type="button" onClick={() => setPickerQuery("")} aria-label="清空搜索"><X /></button>}</label>}<div className={styles.customerOptionList} role="listbox" aria-label={activePicker.title}>{!pickerQuery && <button type="button" className={styles.customerOptionRow} data-selected={!activePickerValue || undefined} onClick={() => selectPickerOption("")} role="option" aria-selected={!activePickerValue}><span className={styles.customerOptionText}><b>暂不选择</b><small>保留为空，稍后仍可补充</small></span><i>{!activePickerValue && <Check />}</i></button>}{filteredOptions.map((option) => { const selected = option.value === activePickerValue; return <button type="button" key={option.value} className={styles.customerOptionRow} data-selected={selected || undefined} onClick={() => selectPickerOption(option.value)} role="option" aria-selected={selected}><span className={styles.customerOptionText}><b>{option.label}</b>{option.description && <small>{option.description}</small>}</span><i>{selected && <Check />}</i></button>; })}{filteredOptions.length === 0 && <div className={styles.customerOptionEmpty}><Search /><b>没有匹配项</b><span>换个关键词再试试</span></div>}</div></section></div>}
    {mapPickerOpen && <div className={styles.customerMapPickerLayer}><AmapLocationPicker mobile initialKeyword={form.address} onClose={() => setMapPickerOpen(false)} onConfirm={applyLocation} /></div>}
  </div>;
}
