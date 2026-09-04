"use client";

import {
  ArrowLeft, AtSign, Banknote, Building2, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, CircleX,
  Clock3, FileCheck2, FileText, House, Loader2, MessageCircle, MoreHorizontal, Paperclip, Phone, ReceiptText, Reply,
  Save, Search, Send, Store, Trash2, UserPlus, UserRound, WalletCards, X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import styles from "@/app/m/mobile.module.css";
import { customerActionOptions } from "@/lib/customerAction";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

export type MobileAttachment = {
  id: string;
  file_name: string;
  file_url: string;
  category?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  created_at?: string | null;
  uploader_name?: string | null;
};
export type MobileCustomer = Record<string, any> & { id: string; name?: string | null; phone?: string | null; area_size?: number | string | null };
export type PaymentScheme = { id: string; name: string; isDefault?: boolean; stages: { id: string; name: string; ratio: number; trigger?: string }[] };
export type ContractWorkspace = {
  contracts: any[]; formalQuotations: any[]; paymentSchemes: PaymentScheme[];
  branchBasicInfo: Record<string, any>; contractTemplates: any[]; depositTotal: number;
  project?: Record<string, any> | null;
};
export type BranchSettings = {
  collectionRules?: { paymentQrCodeUrl?: string; paymentQrCodeName?: string; paymentAccountName?: string };
  businessRules?: { designerAssignmentMode?: "direct" | "approval" | "dispatch" };
};
export type FollowupReplyTarget = { id: string; user_name?: string | null; content?: string | null };
export type FollowupMentionMember = { id: string; name: string; role?: string | null; avatar?: string | null };
export type MobileTeamMember = { id?: string; user_id?: string; user_name?: string | null; user_avatar?: string | null; role?: string | null; is_auto?: boolean | number | null };

const contractTypes = [
  { value: "装修施工合同", desc: "基装施工签约" },
  { value: "设计合同", desc: "方案设计服务" },
  { value: "主材合同", desc: "主材采购确认" },
  { value: "增补合同", desc: "变更增补签约" },
  { value: "整装合同", desc: "整案交付合同" },
  { value: "软装合同", desc: "软装产品服务" },
  { value: "其他", desc: "自定义合同" },
];
const contractSteps = ["基本", "签约", "工程", "金额"];
const followupTypes = [
  { value: "电话", icon: Phone }, { value: "微信", icon: MessageCircle }, { value: "到店", icon: Store },
  { value: "上门", icon: House }, { value: "其他", icon: MoreHorizontal },
];
const mentionRoleLabels: Record<string, string> = { ADVISOR: "家装顾问", DESIGNER: "设计师", PM: "项目经理", WORKER: "施工员", SALES: "销售顾问", OWNER: "负责人" };
const mobileTeamRoles = [
  { value: "ADVISOR", label: "家装顾问", staffRole: "SALES" },
  { value: "DESIGNER", label: "设计师", staffRole: "DESIGNER" },
  { value: "PM", label: "项目经理", staffRole: "PM" },
  { value: "WORKER", label: "施工员", staffRole: "ADMIN" },
  { value: "OTHER", label: "其他人员", staffRole: "ALL" },
];
const coreMobileTeamRoles = new Set(mobileTeamRoles.filter((role) => role.value !== "OTHER").map((role) => role.value));

function toLocalDateTime() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function formatLocalDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseLocalDateTime(value: string) {
  const parsed = value ? new Date(value.length === 16 ? `${value}:00` : value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  date.setSeconds(0, 0);
  return date;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function MobileDateTimePicker({ value, onChange, title, placeholder = "请选择时间", minToday = false }: { value: string; onChange: (value: string) => void; title: string; placeholder?: string; minToday?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parseLocalDateTime(value));
  const [visibleMonth, setVisibleMonth] = useState(() => { const date = parseLocalDateTime(value); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const selectedHour = draft.getHours();
  const selectedMinute = draft.getMinutes();

  const openPicker = () => {
    let next = parseLocalDateTime(value);
    if (!value) {
      next = new Date(); next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5, 0, 0);
    }
    setDraft(next); setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1)); setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const align = (container: HTMLDivElement | null, selected: number) => {
      const target = container?.querySelector<HTMLElement>(`button[data-value="${selected}"]`);
      if (container && target) container.scrollTop = target.offsetTop - container.clientHeight / 2 + target.offsetHeight / 2;
    };
    requestAnimationFrame(() => { align(hourListRef.current, selectedHour); align(minuteListRef.current, selectedMinute); });
  }, [open, selectedHour, selectedMinute]);

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const calendarStart = new Date(monthStart); calendarStart.setDate(1 - monthStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => { const date = new Date(calendarStart); date.setDate(calendarStart.getDate() + index); return date; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const displayValue = value ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(parseLocalDateTime(value)) : "";
  const draftDisplay = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(draft);
  useBodyScrollLock(open);

  const chooseDay = (day: Date) => {
    const next = new Date(draft); next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setDraft(next); setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };
  const chooseTime = (part: "hour" | "minute", amount: number) => {
    const next = new Date(draft);
    if (part === "hour") next.setHours(amount); else next.setMinutes(amount);
    setDraft(next);
  };

  return <>
    <button type="button" className={styles.mobileDateTimeTrigger} data-empty={!displayValue || undefined} onClick={openPicker}><span>{displayValue || placeholder}</span><CalendarDays /></button>
    {open && <div className={styles.mobilePickerBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><div className={styles.mobileDateTimePicker} role="dialog" aria-modal="true" aria-label={title}><div className={styles.mobilePickerHandle} /><div className={styles.mobilePickerHeader}><div><h3>{title}</h3><p>{draftDisplay}</p></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭时间选择"><X /></button></div><div className={styles.mobilePickerBody}><div className={styles.mobileCalendarHeader}><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="上个月"><ChevronLeft /></button><strong>{visibleMonth.getFullYear()}年{visibleMonth.getMonth() + 1}月</strong><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="下个月"><ChevronRight /></button></div><div className={styles.mobileWeekdays}>{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div><div className={styles.mobileCalendarGrid}>{calendarDays.map((day) => { const disabled = minToday && new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() < today.getTime(); return <button type="button" key={dateKey(day)} disabled={disabled} data-outside={day.getMonth() !== visibleMonth.getMonth() || undefined} data-today={dateKey(day) === dateKey(today) || undefined} data-active={dateKey(day) === dateKey(draft) || undefined} onClick={() => chooseDay(day)} aria-label={`${day.getMonth() + 1}月${day.getDate()}日`}>{day.getDate()}</button>; })}</div><div className={styles.mobileTimeHeading}><span><Clock3 />选择时间</span><strong>{String(selectedHour).padStart(2, "0")}:{String(selectedMinute).padStart(2, "0")}</strong></div><div className={styles.mobileTimeWheels}><div><span>小时</span><div ref={hourListRef} className={styles.mobileTimeWheel}>{Array.from({ length: 24 }, (_, hour) => <button type="button" key={hour} data-value={hour} data-active={selectedHour === hour || undefined} onClick={() => chooseTime("hour", hour)}>{String(hour).padStart(2, "0")}</button>)}</div></div><em>:</em><div><span>分钟</span><div ref={minuteListRef} className={styles.mobileTimeWheel}>{Array.from({ length: 60 }, (_, minute) => <button type="button" key={minute} data-value={minute} data-active={selectedMinute === minute || undefined} onClick={() => chooseTime("minute", minute)}>{String(minute).padStart(2, "0")}</button>)}</div></div></div></div><div className={styles.mobilePickerFooter}><button type="button" onClick={() => { onChange(""); setOpen(false); }}>清除</button><button type="button" onClick={() => setOpen(false)}>取消</button><button type="button" data-primary onClick={() => { onChange(formatLocalDateTime(draft)); setOpen(false); }}><Check />确定</button></div></div></div>}
  </>;
}

function toDateInput(value = new Date()) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
}

const contractHolidayDates = new Set([
  "2026-01-01", "2026-01-02", "2026-01-03",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
]);

function parseDateOnly(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculatePlannedEnd(dateText: string, days: string, options: { weekendConstruction: boolean; holidayConstruction: boolean }) {
  const date = parseDateOnly(dateText);
  const duration = Math.ceil(Number(days));
  if (!date || !Number.isFinite(duration) || duration <= 0) return "";
  const cursor = new Date(date);
  let remaining = duration;
  let guard = 0;
  while (remaining > 0 && guard < 2000) {
    const current = formatDateOnly(cursor);
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const isHoliday = contractHolidayDates.has(current);
    if ((options.weekendConstruction || !isWeekend) && (options.holidayConstruction || !isHoliday)) remaining -= 1;
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return formatDateOnly(cursor);
}

function toBool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function makeContractNo() {
  return `HT${toDateInput().replaceAll("-", "")}${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`;
}

function money(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number) : "0";
}

function room(customer: MobileCustomer) {
  const number = [customer.building_no, customer.unit_no, customer.room_no].map((item) => String(item || "").trim()).filter(Boolean).join("-");
  return [customer.address || customer.house_address, number].filter(Boolean).join(" ") || "地址待完善";
}

function SheetFrame({ title, subtitle, onClose, children, footer, tall = false, expanded = false }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; footer?: ReactNode; tall?: boolean; expanded?: boolean }) {
  useBodyScrollLock(true);
  return <div className={styles.sheetBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className={`${styles.sheet} ${tall ? styles.tallSheet : ""} ${expanded ? styles.expandedSheet : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.sheetHandle} />
      <div className={styles.sheetHeader}><div><div className={styles.sheetTitle}>{title}</div><div className={styles.sheetSubtitle}>{subtitle}</div></div><button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭"><X /></button></div>
      <div className={styles.sheetBody}>{children}</div>
      {footer && <div className={styles.sheetFooter}>{footer}</div>}
    </div>
  </div>;
}

function ContractFlowFrame({ customer, step, onStepChange, onClose, children, footer, canGoBack = false, resumeDraft = false }: { customer: MobileCustomer; step: number; onStepChange: (step: number) => void; onClose: () => void; children: ReactNode; footer: ReactNode; canGoBack?: boolean; resumeDraft?: boolean }) {
  useBodyScrollLock(true);

  return <div className={styles.contractFlow} role="dialog" aria-modal="true" aria-label="提交合同">
    <header className={styles.contractFlowHeader}>
      <div className={styles.contractFlowHeaderInner}>
        <button type="button" className={styles.contractFlowBack} onClick={onClose} aria-label="返回客户详情"><ArrowLeft /></button>
        <div className={styles.contractFlowHeading}><h1>{resumeDraft ? "继续提交合同" : "提交合同"}</h1><p>{resumeDraft ? "已恢复上次保存的合同资料" : "完善合同资料并发起审批"}</p></div>
        <span className={styles.contractFlowStatus}><FileCheck2 />{resumeDraft ? "草稿" : "待提交"}</span>
      </div>
    </header>
    <div className={styles.contractFlowProgress}>
      <div className={styles.contractFlowProgressInner}>
        <div className={styles.contractFlowContext}>
          <span className={styles.contractFlowCustomer}>{customer.name?.trim().slice(0, 1) || "客"}</span>
          <span><b>{customer.name || "未命名客户"}</b><small>{room(customer)}</small></span>
          <em>{step + 1} / {contractSteps.length}</em>
        </div>
        <div className={styles.stepper}>{contractSteps.map((label, index) => <button type="button" key={label} data-active={index === step || undefined} data-complete={index < step || undefined} onClick={() => index <= step && onStepChange(index)}><span>{index < step ? <Check /> : index + 1}</span><small>{label}</small></button>)}</div>
      </div>
    </div>
    <main className={styles.contractFlowBody}><div className={styles.contractFlowContent}>{children}</div></main>
    <footer className={styles.contractFlowFooter}><div className={styles.contractFlowFooterInner} data-with-back={canGoBack || undefined}>{footer}</div></footer>
  </div>;
}

async function uploadCustomerFile(customerId: string, category: string, file: File) {
  const body = new FormData();
  body.append("file", file); body.append("customer_id", customerId); body.append("category", category);
  const response = await fetch("/api/upload", { method: "POST", body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "文件上传失败");
  return data as MobileAttachment;
}

type MobileTeamCandidate = {
  id: string;
  name: string;
  avatar?: string | null;
  role?: string | null;
  employee_no?: string | null;
  org_unit_name?: string | null;
};

export function TeamAssignmentSheet({ customerId, members, designerAssignmentMode = "direct", onClose, onSaved }: { customerId: string; members: MobileTeamMember[]; designerAssignmentMode?: "direct" | "approval" | "dispatch"; onClose: () => void; onSaved: (message: string) => void }) {
  const [selectedRole, setSelectedRole] = useState("ADVISOR");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [matchRoleOnly, setMatchRoleOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<MobileTeamCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [customRoleName, setCustomRoleName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ role: string; name: string } | null>(null);
  const candidateListRef = useRef<HTMLDivElement>(null);
  const roleMeta = mobileTeamRoles.find((item) => item.value === selectedRole) || mobileTeamRoles[0];
  const isOtherRole = selectedRole === "OTHER";
  const currentMember = isOtherRole ? undefined : members.find((member) => String(member.role || "").toUpperCase() === selectedRole);
  const additionalMembers = members.filter((member) => {
    const role = String(member.role || "").trim().toUpperCase();
    return role && !coreMobileTeamRoles.has(role);
  });
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedUserId);
  const assignmentUnchanged = Boolean(!isOtherRole && currentMember?.user_id && selectedUserId === String(currentMember.user_id));
  const startReplace = () => {
    if (matchRoleOnly && candidates.length === 0) setMatchRoleOnly(false);
    window.requestAnimationFrame(() => candidateListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  useEffect(() => {
    setSelectedUserId(isOtherRole ? "" : String(currentMember?.user_id || ""));
    setQuery("");
    setMatchRoleOnly(!isOtherRole);
    setCustomRoleName("");
    setMessage("");
    setRemoveTarget(null);
  }, [currentMember?.user_id, isOtherRole, selectedRole]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setMessage("");
      try {
        const params = new URLSearchParams({ picker: "1", limit: "50", customer_id: customerId });
        if (matchRoleOnly && roleMeta.staffRole !== "ALL") params.set("role", roleMeta.staffRole);
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/team?${params.toString()}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "人员加载失败");
        setCandidates(Array.isArray(data.items) ? data.items : []);
      } catch (error: any) {
        if (error?.name !== "AbortError") { setCandidates([]); setMessage(error?.message || "人员加载失败"); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query.trim() ? 240 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [customerId, matchRoleOnly, query, roleMeta.staffRole]);

  const assign = async () => {
    const assignmentRole = isOtherRole ? customRoleName.trim() : selectedRole;
    if (!selectedUserId || !assignmentRole || saving) return;
    setSaving(true); setMessage("");
    try {
      const useDesignerWorkflow = selectedRole === "DESIGNER" && designerAssignmentMode !== "direct";
      const response = await fetch(useDesignerWorkflow ? `/api/customers/${customerId}/designer-assignment` : `/api/customers/${customerId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useDesignerWorkflow ? { preferred_designer_id: selectedUserId } : { user_id: selectedUserId, role: assignmentRole }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || (useDesignerWorkflow ? "设计师指派申请失败" : "人员指派失败"));
      onSaved(useDesignerWorkflow ? `设计师${currentMember ? "更换" : "指派"}申请已提交` : isOtherRole ? `${assignmentRole}已加入服务团队` : `${roleMeta.label}已${currentMember ? "更换" : "指派"}`);
    } catch (error: any) { setMessage(error?.message || "人员指派失败"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!removeTarget || saving) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/customers/${customerId}/team?role=${encodeURIComponent(removeTarget.role)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "移除失败");
      onSaved(`${removeTarget.role}「${removeTarget.name}」已移除`);
    } catch (error: any) { setRemoveTarget(null); setMessage(error?.message || "移除失败"); }
    finally { setSaving(false); }
  };

  const primaryActionLabel = selectedRole === "DESIGNER" && designerAssignmentMode !== "direct"
    ? `提交${currentMember ? "更换" : "指派"}申请`
    : isOtherRole
      ? "添加到团队"
      : currentMember
        ? "确认更换"
        : "确认指派";

  return <>
    <SheetFrame expanded title="指派服务人员" subtitle="维护核心岗位与其他参与人员" onClose={onClose} footer={<><button type="button" className={styles.secondaryButton} onClick={onClose}>取消</button><button type="button" className={styles.primaryButton} onClick={assign} disabled={!selectedUserId || saving || assignmentUnchanged || (isOtherRole && !customRoleName.trim())}>{saving ? <Loader2 className="animate-spin" /> : <UserPlus />}{primaryActionLabel}</button></>}>
      <div className={styles.teamAssignRoles}>{mobileTeamRoles.map((role) => <button type="button" key={role.value} data-active={selectedRole === role.value || undefined} onClick={() => setSelectedRole(role.value)}>{role.label}</button>)}</div>
      {!isOtherRole && <section className={styles.teamAssignCurrent} data-empty={!currentMember || undefined}><span className={styles.teamAssignAvatar}>{currentMember?.user_avatar ? <Image src={currentMember.user_avatar} alt="" width={42} height={42} unoptimized /> : currentMember?.user_name?.slice(0, 1) || "未"}</span><span><small>当前{roleMeta.label}</small><b>{currentMember?.user_name || "暂未指派"}</b><em data-pending={Boolean(currentMember && selectedCandidate && !assignmentUnchanged) || undefined}>{currentMember && selectedCandidate && !assignmentUnchanged ? `将更换为 ${selectedCandidate.name}` : currentMember ? selectedRole === "ADVISOR" ? "必备岗位，只能更换人员" : currentMember.is_auto ? "系统关联人员，可通过指派覆盖" : "可更换或移除" : "请从下方选择人员"}</em></span>{currentMember && <div className={styles.teamAssignCurrentActions}><button type="button" onClick={startReplace}>更换</button>{selectedRole !== "ADVISOR" && !currentMember.is_auto && <button type="button" data-danger onClick={() => setRemoveTarget({ role: selectedRole, name: currentMember.user_name || "该人员" })}><Trash2 />移除</button>}</div>}</section>}
      {isOtherRole && <><div className={styles.teamOtherHeading}><span><b>其他参与人员</b><small>可为客户增加量房师、监理、客服等服务角色</small></span><em>{additionalMembers.length} 人</em></div>{additionalMembers.length > 0 && <div className={styles.teamOtherList}>{additionalMembers.map((member, index) => <div key={member.id || `${member.role}-${member.user_id}-${index}`}><span className={styles.teamCandidateAvatar}>{member.user_avatar ? <Image src={member.user_avatar} alt="" width={38} height={38} unoptimized /> : member.user_name?.slice(0, 1) || "人"}</span><span><b>{member.user_name || "未命名员工"}</b><small>{member.role || "其他服务人员"}</small></span><button type="button" onClick={() => setRemoveTarget({ role: String(member.role || ""), name: member.user_name || "该人员" })} aria-label={`移除 ${member.user_name || "该人员"}`}><Trash2 /></button></div>)}</div>}<label className={styles.teamCustomRoleField}><span>服务职责</span><input value={customRoleName} onChange={(event) => setCustomRoleName(event.target.value)} maxLength={20} placeholder="例如：量房师、监理、客服" /></label></>}
      {selectedRole === "DESIGNER" && designerAssignmentMode !== "direct" && <div className={styles.teamAssignNotice}>当前门店已启用设计师分配流程，确认后将提交指派申请。</div>}
      {message && <div className={styles.message}>{message}</div>}
      <div className={styles.teamAssignToolbar}><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、工号或部门" /></label>{!isOtherRole && <div><button type="button" data-active={matchRoleOnly || undefined} onClick={() => setMatchRoleOnly(true)}>匹配岗位</button><button type="button" data-active={!matchRoleOnly || undefined} onClick={() => setMatchRoleOnly(false)}>全部人员</button></div>}</div>
      <div className={styles.teamCandidateList} ref={candidateListRef}>{loading ? <div className={styles.teamCandidateState}><Loader2 className="animate-spin" />正在加载人员</div> : candidates.length ? candidates.map((candidate) => <button type="button" key={candidate.id} data-active={selectedUserId === candidate.id || undefined} onClick={() => setSelectedUserId(candidate.id)}><span className={styles.teamCandidateAvatar}>{candidate.avatar ? <Image src={candidate.avatar} alt="" width={38} height={38} unoptimized /> : candidate.name?.slice(0, 1) || "人"}</span><span><b>{candidate.name || "未命名员工"}</b><small>{candidate.org_unit_name || "未设置部门"}{candidate.employee_no ? ` · ${candidate.employee_no}` : ""}</small></span><i>{selectedUserId === candidate.id && <Check />}</i></button>) : <div className={styles.teamCandidateState}>没有找到可指派人员</div>}</div>
    </SheetFrame>
    {removeTarget && <div className={styles.confirmBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && setRemoveTarget(null)}><div className={styles.confirmDialog} role="dialog" aria-modal="true" aria-label={`移除${removeTarget.role}`}><div className={styles.confirmHeader}><span className={styles.confirmIcon}><Trash2 /></span><div><h2>移除{removeTarget.role}</h2><p>确认将“{removeTarget.name}”移出该客户的服务团队吗？</p></div><button type="button" onClick={() => setRemoveTarget(null)} disabled={saving} aria-label="关闭"><X /></button></div><div className={styles.confirmActions}><button type="button" className={styles.secondaryButton} onClick={() => setRemoveTarget(null)} disabled={saving}>取消</button><button type="button" className={styles.dangerButton} onClick={remove} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Trash2 />}{saving ? "移除中" : "确认移除"}</button></div></div></div>}
  </>;
}

export function FollowupSheet({ customerId, replyTo, mentionMembers = [], onClose, onSaved }: { customerId: string; replyTo?: FollowupReplyTarget | null; mentionMembers?: FollowupMentionMember[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState(replyTo ? "其他" : "电话");
  const [content, setContent] = useState(replyTo?.user_name ? `@${replyTo.user_name} ` : "");
  const [nextDate, setNextDate] = useState("");
  const [attachments, setAttachments] = useState<MobileAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionQuery, setMentionQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const availableMentionMembers = Array.from(new Map(mentionMembers.filter((member) => member.name.trim()).map((member) => [member.id || member.name, member])).values());
  const filteredMentionMembers = availableMentionMembers.filter((member) => member.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  const updateMention = (value: string, cursor: number) => {
    setContent(value);
    const match = value.slice(0, cursor).match(/@([^@\s]*)$/);
    if (match) {
      setMentionStart(cursor - match[0].length); setMentionQuery(match[1]); setMentionOpen(true);
    } else {
      setMentionStart(-1); setMentionQuery(""); setMentionOpen(false);
    }
  };

  const openMentionPicker = () => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? content.length;
    const needsSpace = cursor > 0 && !/\s/.test(content[cursor - 1] || "");
    const prefix = `${needsSpace ? " " : ""}@`;
    const nextContent = `${content.slice(0, cursor)}${prefix}${content.slice(cursor)}`;
    const nextCursor = cursor + prefix.length;
    setContent(nextContent); setMentionStart(nextCursor - 1); setMentionQuery(""); setMentionOpen(true);
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(nextCursor, nextCursor); });
  };

  const insertMention = (member: FollowupMentionMember) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? content.length;
    const start = mentionStart >= 0 ? mentionStart : cursor;
    const mention = `@${member.name} `;
    const nextContent = `${content.slice(0, start)}${mention}${content.slice(cursor)}`;
    const nextCursor = start + mention.length;
    setContent(nextContent); setMentionStart(-1); setMentionQuery(""); setMentionOpen(false);
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(nextCursor, nextCursor); });
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []); if (!files.length) return;
    setUploading(true); setMessage("");
    try {
      for (const file of files) {
        const uploaded = await uploadCustomerFile(customerId, "跟进附件", file);
        setAttachments((current) => [...current, uploaded]);
      }
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "附件上传失败"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim() && !attachments.length) return setMessage("请输入跟进内容或上传附件");
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customerId, reply_to_id: replyTo?.id || null, type, content, next_date: replyTo ? null : nextDate || null, attachment_ids: attachments.map((item) => item.id) }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || (replyTo ? "回复提交失败" : "跟进保存失败")); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : replyTo ? "回复提交失败" : "跟进保存失败"); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit}><SheetFrame expanded title={replyTo ? "回复跟进" : "新增跟进"} subtitle={replyTo ? `回复 ${replyTo.user_name || "团队成员"}` : "记录沟通结果并安排下一次联系"} onClose={onClose} footer={<><button type="button" className={styles.secondaryButton} onClick={onClose}>取消</button><button type="submit" className={styles.primaryButton} disabled={saving || uploading}>{saving ? <Loader2 className="animate-spin" /> : replyTo ? <Reply /> : <Send />}{replyTo ? "提交回复" : "保存跟进"}</button></>}>
    {message && <div className={styles.message}>{message}</div>}
    {replyTo && <div className={styles.replyContext}><span><Reply /></span><div><b>{replyTo.user_name || "团队成员"} 的跟进</b><p>{replyTo.content || "上传了附件"}</p></div></div>}
    {!replyTo && <><div className={styles.sectionLabel}>跟进方式</div><div className={styles.followupTypePicker}>{followupTypes.map((item) => { const Icon = item.icon; return <button type="button" key={item.value} aria-pressed={type === item.value} data-active={type === item.value || undefined} onClick={() => setType(item.value)}><Icon /><span>{item.value}</span></button>; })}</div></>}
    <div className={`${styles.formSection} mt-4`}><div className={`${styles.field} ${styles.followupContentField}`}><div className={styles.followupComposerHead}><label className={styles.required}>{replyTo ? "回复内容" : "跟进内容"}</label><button type="button" onClick={openMentionPicker} aria-expanded={mentionOpen}><AtSign />提醒成员</button></div><div className={styles.mentionComposer}><textarea ref={textareaRef} autoFocus={Boolean(replyTo)} value={content} onChange={(event) => updateMention(event.target.value, event.target.selectionStart ?? event.target.value.length)} placeholder={replyTo ? "输入回复内容，可 @ 服务团队成员" : "记录沟通结果，可 @ 服务团队成员"} />{mentionOpen && <div className={styles.mentionMenu}>{filteredMentionMembers.length ? filteredMentionMembers.map((member) => <button type="button" key={member.id || member.name} onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member)}><span className={styles.mentionAvatar}>{member.avatar ? <Image src={member.avatar} alt="" width={32} height={32} unoptimized /> : member.name.slice(0, 1)}</span><span><b>{member.name}</b><small>{mentionRoleLabels[String(member.role || "").toUpperCase()] || member.role || "服务团队"}</small></span><AtSign /></button>) : <div className={styles.mentionEmpty}>暂无可提醒的服务团队成员</div>}</div>}</div></div>{!replyTo && <div className={styles.field}><label>下次跟进</label><MobileDateTimePicker title="选择下次跟进时间" value={nextDate} onChange={setNextDate} placeholder="选择日期和时间" minToday /></div>}</div>
    <input ref={fileRef} hidden type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={uploadFiles} />
    <button type="button" className={`${styles.secondaryButton} mt-3 w-full`} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}添加图片或文件</button>
    {attachments.length > 0 && <div className={styles.uploadList}>{attachments.map((file) => <div key={file.id} className={styles.uploadItem}><FileText /><span>{file.file_name}</span><Check /></div>)}</div>}
  </SheetFrame></form>;
}

export function PaymentSheet({ customerId, branchSettings, onClose, onSaved }: { customerId: string; branchSettings: BranchSettings | null; onClose: () => void; onSaved: () => void }) {
  const [recordType, setRecordType] = useState<"deposit" | "design_fee">("deposit");
  const [method, setMethod] = useState<"manual" | "qr">("manual");
  const [receivable, setReceivable] = useState("");
  const [amount, setAmount] = useState("");
  const [depositType, setDepositType] = useState("设计定金");
  const [channel, setChannel] = useState("微信");
  const [receivedAt, setReceivedAt] = useState(toLocalDateTime());
  const [receiverName, setReceiverName] = useState("");
  const [notes, setNotes] = useState("");
  const [voucherUrl, setVoucherUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const actual = Number(amount || 0); const due = Number(receivable || 0); const remaining = Math.max(0, due - actual);
  const qrAvailable = Boolean(branchSettings?.collectionRules?.paymentQrCodeUrl);

  const switchType = (next: "deposit" | "design_fee") => { setRecordType(next); setDepositType(next === "design_fee" ? "设计费" : "设计定金"); setNotes(next === "design_fee" ? "设计费独立收取，不抵扣工程款。" : ""); };
  const uploadVoucher = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setUploading(true); setMessage("");
    try { const data = await uploadCustomerFile(customerId, "收款凭证", file); setVoucherUrl(data.file_url); }
    catch (error) { setMessage(error instanceof Error ? error.message : "凭证上传失败"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const submit = async () => {
    if (!due || due <= 0) return setMessage("请填写应收金额");
    if (actual < 0 || actual > due) return setMessage("实收金额不能小于0或大于应收金额");
    if (method === "qr" && !qrAvailable) return setMessage("当前门店未配置收款码，请选择手动收款");
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/customers/${customerId}/deposits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record_type: recordType, design_fee_mode: "fixed", receivable_amount: due, amount: actual, method, received_at: receivedAt, payment_channel: method === "qr" ? "扫码支付" : channel, deposit_type: depositType, receiver_name: receiverName, voucher_url: voucherUrl, notes }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || "款项保存失败"); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "款项保存失败"); }
    finally { setSaving(false); }
  };

  return <SheetFrame tall title={recordType === "design_fee" ? "登记设计费" : "登记定金"} subtitle="应收与实收分开记录，实收可稍后补收" onClose={onClose} footer={<><button type="button" className={styles.secondaryButton} onClick={onClose}>取消</button><button type="button" className={styles.primaryButton} onClick={submit} disabled={saving || uploading}>{saving ? <Loader2 className="animate-spin" /> : <Check />}保存款项</button></>}>
    {message && <div className={styles.message}>{message}</div>}
    <div className={styles.segmentedControl}><button type="button" data-active={recordType === "deposit" || undefined} onClick={() => switchType("deposit")}>定金</button><button type="button" data-active={recordType === "design_fee" || undefined} onClick={() => switchType("design_fee")}>设计费</button></div>
    <div className={styles.moneyEntry}><div className={styles.moneyField}><span>应收金额</span><label><b>¥</b><input inputMode="decimal" value={receivable} onChange={(event) => setReceivable(event.target.value)} placeholder="0.00" /></label></div><div className={styles.moneyDivider} /><div className={styles.moneyField}><span>本次实收（选填）</span><label><b>¥</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label></div><div className={styles.moneyBalance}><span>{actual > 0 ? "保存后剩余待收" : "未填写实收将记为待收款"}</span><strong>{actual > 0 ? `¥${money(remaining)}` : "待收款"}</strong></div></div>
    <div className={styles.sectionLabel}>收款方式</div>
    <div className={styles.methodCards}><button type="button" data-active={method === "manual" || undefined} onClick={() => setMethod("manual")}><Banknote /><span><b>手动收款</b><small>登记转账、微信或现金</small></span></button><button type="button" data-active={method === "qr" || undefined} data-disabled={!qrAvailable || undefined} onClick={() => qrAvailable ? setMethod("qr") : setMessage("当前门店未配置收款码")}><Camera /><span><b>公司收款码</b><small>{qrAvailable ? branchSettings?.collectionRules?.paymentQrCodeName || "扫码后登记" : "门店暂未配置"}</small></span></button></div>
    <div className={`${styles.formSection} mt-4`}><div className={styles.field}><label>款项名称</label><input value={depositType} onChange={(event) => setDepositType(event.target.value)} /></div>{method === "manual" && <div className={styles.field}><label>收款渠道</label><select value={channel} onChange={(event) => setChannel(event.target.value)}><option>微信</option><option>支付宝</option><option>银行转账</option><option>现金</option><option>其他</option></select></div>}<div className={styles.field}><label>收款时间</label><MobileDateTimePicker title="选择收款时间" value={receivedAt} onChange={setReceivedAt} /></div><div className={styles.field}><label>收款对象</label><input value={receiverName} onChange={(event) => setReceiverName(event.target.value)} placeholder="公司或收款人" /></div><div className={styles.field}><label>备注</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="补充说明" /></div></div>
    <input ref={fileRef} hidden type="file" accept="image/*" onChange={uploadVoucher} />
    <button type="button" className={`${styles.secondaryButton} mt-3 w-full`} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : voucherUrl ? <FileCheck2 /> : <Camera />}{voucherUrl ? "收款凭证已上传" : "上传收款凭证"}</button>
  </SheetFrame>;
}

export function ContractSheet({ customer, workspace, initialContract = null, onClose, onSaved }: { customer: MobileCustomer; workspace: ContractWorkspace; initialContract?: Record<string, any> | null; onClose: () => void; onSaved: () => void }) {
  const draftContent = initialContract?.content || {};
  const draftAmount = draftContent.amount_info || {};
  const draftPartyA = draftContent.party_a || {};
  const draftPartyB = draftContent.party_b || {};
  const draftProject = draftContent.project_info || {};
  const defaultScheme = workspace.paymentSchemes.find((item) => item.id === draftAmount.payment_scheme_id) || workspace.paymentSchemes.find((item) => item.isDefault) || workspace.paymentSchemes[0];
  const basic = workspace.branchBasicInfo || {};
  const firstQuotation = workspace.formalQuotations.find((item) => item.id === (draftAmount.quotation_id || draftContent.quotation_id)) || workspace.formalQuotations[0];
  const savedStep = Math.max(0, Math.min(3, Number(draftContent.draft_step || 0) || 0));
  const [step, setStep] = useState(savedStep); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MobileAttachment[]>(Array.isArray(draftContent.attachments) ? draftContent.attachments : []); const [uploading, setUploading] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    contract_type: draftContent.contract_type || "装修施工合同", title: initialContract?.title || `${customer.name || "客户"}-${room(customer)}装修施工合同`, contract_no: initialContract?.contract_no || makeContractNo(), signed_at: String(initialContract?.signed_at || toDateInput()).slice(0, 10),
    party_a_name: draftPartyA.name || customer.name || "", party_a_phone: draftPartyA.phone || customer.phone || "", party_b_name: draftPartyB.name || basic.legalCompanyName || basic.companyShortName || "", party_b_contact: draftPartyB.contact || basic.managerName || "", party_b_phone: draftPartyB.phone || basic.contactPhone || "",
    project_address: draftProject.address || room(customer), project_area: String(draftProject.area ?? customer.area_size ?? ""), planned_start: String(draftProject.planned_start || toDateInput()).slice(0, 10), duration_days: String(draftProject.duration_days || "90"), weekend_construction: toBool(draftProject.weekend_construction), holiday_construction: toBool(draftProject.holiday_construction), construction_scope: draftProject.construction_scope || "按双方确认的设计方案、预算报价及施工图纸执行。",
    quotation_id: draftAmount.quotation_id || draftContent.quotation_id || firstQuotation?.id || "", total_amount: String(draftAmount.total_amount ?? initialContract?.total_amount ?? firstQuotation?.final_amount ?? firstQuotation?.total_amount ?? ""), payment_scheme_id: draftAmount.payment_scheme_id || defaultScheme?.id || "", deposit_deducted: initialContract ? Boolean(draftAmount.deposit_deducted) : Number(workspace.depositTotal || 0) > 0, deposit_deduct_amount: String(draftAmount.deposit_deduct_amount ?? workspace.depositTotal ?? ""), remarks: draftContent.remarks || "",
  });
  const selectedQuotation = workspace.formalQuotations.find((item) => item.id === form.quotation_id);
  const selectedScheme = workspace.paymentSchemes.find((item) => item.id === form.payment_scheme_id) || defaultScheme;
  const totalAmount = Number(form.total_amount || 0); const deductAmount = form.deposit_deducted ? Math.min(totalAmount, Number(form.deposit_deduct_amount || 0), Number(workspace.depositTotal || 0)) : 0; const payable = Math.max(0, totalAmount - deductAmount);
  const paymentStages = (selectedScheme?.stages || []).map((item) => ({ ...item, amount: Math.round(payable * Number(item.ratio || 0)) / 100 }));
  const setField = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const validateStep = (target = step) => {
    if (target === 0 && (!form.contract_type || !form.title.trim() || !form.contract_no.trim())) return "请完整填写合同类型、名称和编号";
    if (target === 1 && (!form.party_a_name.trim() || !form.party_a_phone.trim() || !form.party_b_name.trim() || !form.party_b_contact.trim())) return "请完善甲乙双方信息";
    if (target === 2 && (!form.project_address.trim() || !form.planned_start || Number(form.duration_days) <= 0 || !form.construction_scope.trim())) return "请完善工程地址、工期和施工范围";
    if (target === 3 && (!selectedQuotation || totalAmount <= 0 || !selectedScheme || paymentStages.reduce((sum, item) => sum + Number(item.ratio || 0), 0) !== 100)) return workspace.formalQuotations.length ? "请选择正式报价并确认金额和收款方案" : "该客户暂无正式报价，请先将报价设为正式";
    return "";
  };
  const next = () => { const error = validateStep(); if (error) return setMessage(error); setMessage(""); setStep((current) => Math.min(3, current + 1)); };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setUploading(true); setMessage("");
    try {
      const uploaded = await uploadCustomerFile(customer.id, "合同附件", file);
      setAttachments((current) => [uploaded, ...current]);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "附件上传失败"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const persist = async (action: "save_draft" | "create") => {
    const invalid = (action === "create" ? [0, 1, 2, 3] : [0]).find((item) => validateStep(item));
    if (invalid !== undefined) { setStep(invalid); return setMessage(validateStep(invalid)); }
    setSaving(true); setMessage("");
    try {
      const plannedEnd = calculatePlannedEnd(form.planned_start, form.duration_days, { weekendConstruction: form.weekend_construction, holidayConstruction: form.holiday_construction });
      const response = await fetch(`/api/customers/${customer.id}/contracts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: initialContract?.id || "", action, draft_step: step, contract_type: form.contract_type, contract_template_id: draftContent.contract_template_id || "", title: form.title, contract_no: form.contract_no, quotation_id: form.quotation_id, signed_at: form.signed_at, total_amount: totalAmount, deposit_deducted: form.deposit_deducted, deposit_deduct_amount: deductAmount, payment_scheme_id: selectedScheme?.id || "", payment_scheme_name: selectedScheme?.name || "", payment_stages: paymentStages, party_a: { name: form.party_a_name, contact: draftPartyA.contact || form.party_a_name, phone: form.party_a_phone, id_no: draftPartyA.id_no || "" }, party_b: { name: form.party_b_name, contact: form.party_b_contact, phone: form.party_b_phone, license_no: draftPartyB.license_no || "" }, project_info: { ...draftProject, address: form.project_address, area: form.project_area, planned_start: form.planned_start, planned_end: plannedEnd, duration_days: form.duration_days, weekend_construction: form.weekend_construction, holiday_construction: form.holiday_construction, construction_scope: form.construction_scope }, construction_terms: draftContent.construction_terms || {}, attachments, remarks: form.remarks }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || (action === "create" ? "合同提交失败" : "合同暂存失败")); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "合同保存失败"); }
    finally { setSaving(false); }
  };

  return <ContractFlowFrame customer={customer} step={step} resumeDraft={Boolean(initialContract)} canGoBack={step > 0} onStepChange={(nextStep) => { setMessage(""); setStep(nextStep); }} onClose={onClose} footer={<>{step > 0 && <button type="button" className={`${styles.secondaryButton} ${styles.contractBackButton}`} onClick={() => { setMessage(""); setStep((current) => Math.max(0, current - 1)); }}><ArrowLeft />上一步</button>}<button type="button" className={styles.secondaryButton} onClick={() => persist("save_draft")} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存草稿</button>{step < 3 ? <button type="button" className={styles.primaryButton} onClick={next}>下一步<ChevronRight /></button> : <button type="button" className={styles.primaryButton} onClick={() => persist("create")} disabled={saving || uploading}>{saving ? <Loader2 className="animate-spin" /> : <Send />}提交审批</button>}</>}>
    {message && <div className={`${styles.message} mt-3`}>{message}</div>}
    {step === 0 && <><div className={styles.sectionLabel}>合同基本信息</div><div className={styles.contractTypeScroller}>{contractTypes.map((item) => <button type="button" key={item.value} data-active={form.contract_type === item.value || undefined} onClick={() => { setField("contract_type", item.value); setField("title", `${customer.name || "客户"}-${room(customer)}${item.value}`); }}><span><b>{item.value}</b><small>{item.desc}</small></span><i>{form.contract_type === item.value && <Check />}</i></button>)}</div><div className={`${styles.formSection} mt-3`}><div className={styles.field}><label className={styles.required}>合同名称</label><textarea className={styles.centeredTextarea} value={form.title} onChange={(event) => setField("title", event.target.value)} /></div><div className={styles.field}><label className={styles.required}>合同编号</label><input value={form.contract_no} onChange={(event) => setField("contract_no", event.target.value)} /></div><div className={styles.field}><label>签约日期</label><input type="date" value={form.signed_at} onChange={(event) => setField("signed_at", event.target.value)} /></div></div></>}
    {step === 1 && <><div className={styles.partyHeading}><span><UserRound />甲方（客户）</span><small>从客户资料自动带入</small></div><div className={styles.formSection}><div className={styles.field}><label className={styles.required}>姓名</label><input value={form.party_a_name} onChange={(event) => setField("party_a_name", event.target.value)} /></div><div className={styles.field}><label className={styles.required}>手机号</label><input inputMode="tel" value={form.party_a_phone} onChange={(event) => setField("party_a_phone", event.target.value)} /></div></div><div className={styles.partyHeading}><span><Building2 />乙方（公司）</span><small>从门店设置自动带入</small></div><div className={styles.formSection}><div className={styles.field}><label className={styles.required}>签约公司</label><input value={form.party_b_name} onChange={(event) => setField("party_b_name", event.target.value)} /></div><div className={styles.field}><label className={styles.required}>联系人</label><input value={form.party_b_contact} onChange={(event) => setField("party_b_contact", event.target.value)} /></div><div className={styles.field}><label>联系电话</label><input inputMode="tel" value={form.party_b_phone} onChange={(event) => setField("party_b_phone", event.target.value)} /></div></div></>}
    {step === 2 && <><div className={styles.sectionLabel}>工程信息</div><div className={styles.formSection}><div className={styles.field}><label className={styles.required}>施工地址</label><textarea className={styles.centeredTextarea} value={form.project_address} onChange={(event) => setField("project_address", event.target.value)} /></div><div className={styles.field}><label>装修面积</label><input inputMode="decimal" value={form.project_area} onChange={(event) => setField("project_area", event.target.value)} placeholder="㎡" /></div><div className={styles.field}><label className={styles.required}>计划开工</label><input type="date" value={form.planned_start} onChange={(event) => setField("planned_start", event.target.value)} /></div><div className={styles.field}><label className={styles.required}>合同工期</label><input inputMode="numeric" value={form.duration_days} onChange={(event) => setField("duration_days", event.target.value)} placeholder="天" /></div><div className={styles.contractScheduleOptions}><button type="button" data-active={form.weekend_construction || undefined} onClick={() => setField("weekend_construction", !form.weekend_construction)}><span><b>周末施工</b><small>{form.weekend_construction ? "周末计入工期" : "周末不计入工期"}</small></span><i>{form.weekend_construction && <Check />}</i></button><button type="button" data-active={form.holiday_construction || undefined} onClick={() => setField("holiday_construction", !form.holiday_construction)}><span><b>节假日施工</b><small>{form.holiday_construction ? "节假日计入工期" : "节假日不计入工期"}</small></span><i>{form.holiday_construction && <Check />}</i></button></div><div className={styles.readonlyRow}><span>预计竣工</span><strong>{calculatePlannedEnd(form.planned_start, form.duration_days, { weekendConstruction: form.weekend_construction, holidayConstruction: form.holiday_construction }) || "待计算"}</strong></div><div className={styles.contractScheduleHint}>计划竣工会按计划开工、合同工期、周末/节假日是否施工自动推算。</div><div className={styles.field}><label className={styles.required}>施工范围</label><textarea className={styles.centeredTextarea} value={form.construction_scope} onChange={(event) => setField("construction_scope", event.target.value)} /></div></div></>}
    {step === 3 && <><div className={styles.sectionLabel}>报价与合同金额</div>{workspace.formalQuotations.length ? <div className={styles.optionList}>{workspace.formalQuotations.map((quotation) => <button type="button" key={quotation.id} data-active={form.quotation_id === quotation.id || undefined} onClick={() => { setField("quotation_id", quotation.id); setField("total_amount", String(quotation.final_amount ?? quotation.total_amount ?? "")); }}><span><b>{quotation.title || "正式报价"}</b><small>正式报价</small></span><strong>¥{money(quotation.final_amount ?? quotation.total_amount)}</strong><i>{form.quotation_id === quotation.id && <Check />}</i></button>)}</div> : <div className={styles.blocker}><ReceiptText /><div><b>暂无正式报价</b><span>请先在报价中设为正式，再提交合同。</span></div><Link href={`/projects/${customer.id}?tab=quotation`}>去处理</Link></div>}<div className={`${styles.formSection} mt-3`}><div className={styles.field}><label className={styles.required}>合同金额</label><input inputMode="decimal" value={form.total_amount} onChange={(event) => setField("total_amount", event.target.value)} /></div><div className={styles.field}><label>收款方案</label><select value={form.payment_scheme_id} onChange={(event) => setField("payment_scheme_id", event.target.value)}>{workspace.paymentSchemes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>{Number(workspace.depositTotal || 0) > 0 && <button type="button" className={styles.deductRow} data-active={form.deposit_deducted || undefined} onClick={() => setField("deposit_deducted", !form.deposit_deducted)}><span><WalletCards /><span><b>抵扣已收定金</b><small>可用 ¥{money(workspace.depositTotal)}</small></span></span><i>{form.deposit_deducted && <Check />}</i></button>}<div className={styles.paymentPlan}><div className={styles.paymentPlanHead}><span>合同收款计划</span><strong>应收 ¥{money(payable)}</strong></div>{paymentStages.map((item) => <div className={styles.paymentPlanRow} key={item.id}><span>{item.name}<small>{item.ratio}%</small></span><strong>¥{money(item.amount)}</strong></div>)}</div><input ref={fileRef} hidden type="file" accept="image/*,.pdf,.doc,.docx" onChange={upload} /><button type="button" className={`${styles.secondaryButton} mt-3 w-full`} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}合同附件 {attachments.length ? `(${attachments.length})` : ""}</button><div className={`${styles.formSection} mt-3`}><div className={styles.field}><label>合同备注</label><textarea value={form.remarks} onChange={(event) => setField("remarks", event.target.value)} placeholder="选填" /></div></div></>}
  </ContractFlowFrame>;
}

export function MoreSheet({ customerId, onClose, onSaved }: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const reasons = customerActionOptions.LOST || [];
  const [reason, setReason] = useState(reasons[0] || "");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!reason) { setMessage("请选择流失/失败原因"); return; }
    setSaving(true); setMessage("");
    try {
      const token = localStorage.getItem("zxgj_token");
      const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "LOST", current_action: reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "标记失败，请稍后重试");

      const note = remark.trim();
      await fetch("/api/followups", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer_id: customerId,
          type: "其他",
          content: note ? `标记为失败/流失：${reason}\n${note}` : `标记为失败/流失：${reason}`,
          next_date: null,
        }),
      }).catch(() => null);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标记失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return <SheetFrame
    title="标记流失/失败"
    subtitle="结束当前客户的跟进流程"
    onClose={() => !saving && onClose()}
    footer={<><button type="button" className={styles.secondaryButton} onClick={onClose} disabled={saving}>取消</button><button type="button" className={styles.dangerButton} onClick={submit} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CircleX />}{saving ? "提交中" : "确认标记"}</button></>}
  >
    <div className={styles.lostSheetIntro}><span><CircleX /></span><div><b>客户状态将变为“失败/流失”</b><p>系统会同时写入一条跟进记录，方便后续查询与复盘。</p></div></div>
    <div className={styles.lostSheetSection}><label>流失/失败原因 <em>*</em></label><div className={styles.lostReasonGrid}>{reasons.map((item) => <button type="button" key={item} data-active={reason === item || undefined} onClick={() => { setReason(item); setMessage(""); }}><span>{item}</span>{reason === item && <Check />}</button>)}</div></div>
    <div className={styles.lostSheetSection}><label htmlFor="mobile-lost-remark">补充说明</label><textarea id="mobile-lost-remark" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="例如：客户已选择同行、报价超出预算等" /></div>
    {message && <div className={styles.lostSheetError}>{message}</div>}
  </SheetFrame>;
}
