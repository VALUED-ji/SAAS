"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  ClipboardList,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import SystemDateInput from "@/components/ui/SystemDateInput";
import SystemSelect from "@/components/ui/SystemSelect";
import { formatDateTime } from "@/lib/utils";

const contractTypes = ["装修施工合同", "设计合同", "主材合同", "增补合同", "整装合同", "软装合同", "其他"];
const steps = [
  { title: "基本信息", desc: "类型、名称、编号" },
  { title: "签约与项目", desc: "甲方信息、地址与工期" },
  { title: "金额收款", desc: "合同金额、定金、收款比例" },
  { title: "合同附件", desc: "合同文件与备注" },
];

type Attachment = {
  id: string;
  file_name: string;
  file_size?: number;
  mime_type?: string;
  file_url?: string;
};

type PaymentScheme = {
  id: string;
  name: string;
  isDefault?: boolean;
  stages: Array<{ id: string; name: string; ratio: number; trigger?: string }>;
};

type ContractTemplate = {
  id: string;
  name: string;
  contract_type: string;
  status: string;
  is_default?: number;
  current_version?: number;
};

type ContractForm = {
  id?: string;
  resign_source_contract_id?: string;
  contract_type: string;
  contract_template_id: string;
  title: string;
  contract_no: string;
  quotation_id: string;
  signed_at: string;
  party_a_name: string;
  party_a_contact: string;
  party_a_phone: string;
  party_a_id_no: string;
  party_b_name: string;
  party_b_contact: string;
  party_b_phone: string;
  party_b_license: string;
  project_address: string;
  project_building_no: string;
  project_unit_no: string;
  project_room_no: string;
  project_no_room_number: boolean;
  project_area: string;
  planned_start: string;
  planned_end: string;
  duration_days: string;
  weekend_construction: boolean;
  holiday_construction: boolean;
  construction_scope: string;
  construction_terms: string;
  quality_standard: string;
  warranty_terms: string;
  total_amount: string;
  deposit_deducted: boolean;
  deposit_deduct_amount: string;
  payment_scheme_id: string;
  attachments: Attachment[];
  remarks: string;
};

type ContractCreateFlowModalProps = {
  customerId: string;
  quotationId: string;
  onClose: () => void;
  onCreated?: () => void;
};

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("zh-CN", {
        useGrouping: false,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : "0.00";
}

function formatPlainAmount(value: unknown) {
  return money(value);
}

function formatFileSize(size?: number) {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getQuotationAmount(quotation: any) {
  return Number(quotation?.final_amount ?? quotation?.total_amount ?? 0);
}

function makeContractNo() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `HT${datePart}${String(now.getTime()).slice(-5)}`;
}

function getClientAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zxgj_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function calculatePlannedEnd(startValue: string, durationValue: string, weekend: boolean, holiday: boolean) {
  if (!startValue) return "";
  const days = Math.ceil(Number(durationValue || 0));
  if (!Number.isFinite(days) || days <= 0) return "";
  const cursor = new Date(`${startValue}T00:00:00`);
  if (Number.isNaN(cursor.getTime())) return "";
  let remaining = days;
  let guard = 0;
  while (remaining > 0 && guard < 2000) {
    const weekday = cursor.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (weekend || !isWeekend || holiday) remaining -= 1;
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  const year = cursor.getFullYear();
  const month = String(cursor.getMonth() + 1).padStart(2, "0");
  const day = String(cursor.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultForm(customer: any, project: any, branch: any, schemeId: string, quote: any): ContractForm {
  const customerName = String(customer?.name || "客户").trim();
  const address = String(customer?.address || project?.address || customer?.area || "").trim();
  const totalAmount = Number(quote?.final_amount ?? quote?.total_amount ?? 0);
  return {
    contract_type: "装修施工合同",
    contract_template_id: "",
    title: `${customerName}${address ? `-${address}` : ""}装修施工合同`,
    contract_no: makeContractNo(),
    quotation_id: String(quote?.id || ""),
    signed_at: new Date().toISOString().slice(0, 10),
    party_a_name: customerName,
    party_a_contact: customerName,
    party_a_phone: String(customer?.phone === "仅微信联系" ? "" : customer?.phone || "").trim(),
    party_a_id_no: "",
    party_b_name: String(branch?.legalCompanyName || "").trim(),
    party_b_contact: String(branch?.managerName || "").trim(),
    party_b_phone: String(branch?.contactPhone || "").trim(),
    party_b_license: String(branch?.businessLicenseNo || "").trim(),
    project_address: address,
    project_building_no: String(customer?.building_no || "").trim(),
    project_unit_no: String(customer?.unit_no || "").trim(),
    project_room_no: String(customer?.room_no || "").trim(),
    project_no_room_number: customer?.no_room_number === true || customer?.no_room_number === 1,
    project_area: String(project?.area || customer?.area_size || ""),
    planned_start: "",
    planned_end: "",
    duration_days: "",
    weekend_construction: false,
    holiday_construction: false,
    construction_scope: "按双方确认的设计方案、预算报价及施工图纸执行。",
    construction_terms: "因甲方变更、材料确认延迟或不可抗力导致延期的，工期相应顺延。",
    quality_standard: "工程质量按国家、地方及行业现行住宅装饰装修验收规范执行。",
    warranty_terms: "基础工程按合同约定保修，隐蔽工程和防水工程按国家及公司标准执行。",
    total_amount: totalAmount > 0 ? String(totalAmount) : "",
    deposit_deducted: true,
    deposit_deduct_amount: "",
    payment_scheme_id: schemeId,
    attachments: [],
    remarks: "",
  };
}

function buildFormFromContract(contract: any, fallback: ContractForm): ContractForm {
  const content = contract?.content || {};
  const partyA = content.party_a || {};
  const partyB = content.party_b || {};
  const projectInfo = content.project_info || {};
  const amountInfo = content.amount_info || {};
  const terms = content.construction_terms || {};
  return {
    ...fallback,
    id: String(contract?.id || ""),
    contract_type: content.contract_type || fallback.contract_type,
    contract_template_id: content.contract_template_id || content.document_snapshot?.template_id || fallback.contract_template_id,
    title: contract?.title || fallback.title,
    contract_no: contract?.contract_no || fallback.contract_no,
    quotation_id: amountInfo.quotation_id || content.quotation_id || fallback.quotation_id,
    signed_at: contract?.signed_at || fallback.signed_at,
    party_a_name: partyA.name || fallback.party_a_name,
    party_a_contact: partyA.contact || fallback.party_a_contact,
    party_a_phone: partyA.phone || fallback.party_a_phone,
    party_a_id_no: partyA.id_no || "",
    party_b_name: partyB.name || fallback.party_b_name,
    party_b_contact: partyB.contact || fallback.party_b_contact,
    party_b_phone: partyB.phone || fallback.party_b_phone,
    party_b_license: partyB.license_no || fallback.party_b_license,
    project_address: projectInfo.community || projectInfo.address || fallback.project_address,
    project_building_no: projectInfo.building_no || "",
    project_unit_no: projectInfo.unit_no || "",
    project_room_no: projectInfo.room_no || "",
    project_no_room_number: Boolean(projectInfo.no_room_number),
    project_area: projectInfo.area ? String(projectInfo.area) : fallback.project_area,
    planned_start: projectInfo.planned_start || "",
    planned_end: projectInfo.planned_end || "",
    duration_days: projectInfo.duration_days ? String(projectInfo.duration_days) : "",
    weekend_construction: Boolean(projectInfo.weekend_construction),
    holiday_construction: Boolean(projectInfo.holiday_construction),
    construction_scope: projectInfo.construction_scope || fallback.construction_scope,
    construction_terms: terms.schedule || fallback.construction_terms,
    quality_standard: terms.quality || fallback.quality_standard,
    warranty_terms: terms.warranty || fallback.warranty_terms,
    total_amount: String(contract?.total_amount || amountInfo.total_amount || fallback.total_amount || ""),
    deposit_deducted: Boolean(amountInfo.deposit_deducted),
    deposit_deduct_amount: amountInfo.deposit_deduct_amount ? String(amountInfo.deposit_deduct_amount) : "",
    payment_scheme_id: amountInfo.payment_scheme_id || fallback.payment_scheme_id,
    attachments: Array.isArray(content.attachments) ? content.attachments : [],
    remarks: content.remarks || "",
  };
}

export default function ContractCreateFlowModal({
  customerId,
  quotationId,
  onClose,
  onCreated,
}: ContractCreateFlowModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [missingFields, setMissingFields] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [branch, setBranch] = useState<any>(null);
  const [depositTotal, setDepositTotal] = useState(0);
  const [schemes, setSchemes] = useState<PaymentScheme[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [formalQuotations, setFormalQuotations] = useState<any[]>([]);
  const [form, setForm] = useState<ContractForm | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch(`/api/customers/${customerId}/contracts?includeContent=1`, {
          headers: getClientAuthHeaders(),
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || "加载合同资料失败");
        if (cancelled) return;
        const nextSchemes = Array.isArray(data.paymentSchemes) ? data.paymentSchemes : [];
        const nextTemplates = Array.isArray(data.contractTemplates) ? data.contractTemplates : [];
        const nextQuotes = Array.isArray(data.formalQuotations) ? data.formalQuotations : [];
        const quote = nextQuotes.find((item: any) => String(item.id) === String(quotationId)) || nextQuotes[0] || null;
        const defaultScheme = nextSchemes.find((item: PaymentScheme) => item.isDefault) || nextSchemes[0];
        const defaultForm = buildDefaultForm(data.customer, data.project, data.branchBasicInfo, defaultScheme?.id || "", quote);
        const draft = (Array.isArray(data.contracts) ? data.contracts : [])
          .filter((contract: any) => String(contract?.status || "").toUpperCase() === "DRAFT")
          .find((contract: any) => {
            const content = contract?.content || {};
            const draftQuotationId = content?.amount_info?.quotation_id || content?.quotation_id || "";
            return String(draftQuotationId) === String(quotationId);
          });
        const nextForm = draft ? buildFormFromContract(draft, defaultForm) : defaultForm;
        const defaultTemplate = nextTemplates.find((item: ContractTemplate) => (
          item.contract_type === nextForm.contract_type && item.status === "published" && Number(item.is_default || 0) === 1
        )) || nextTemplates.find((item: ContractTemplate) => (
          item.contract_type === nextForm.contract_type && item.status === "published"
        ));
        nextForm.contract_template_id = defaultTemplate?.id || "";
        const maxDeduct = Math.min(Number(data.depositTotal || 0), Number(nextForm.total_amount || 0));
        nextForm.deposit_deduct_amount = maxDeduct > 0 ? String(maxDeduct) : "";
        setCustomer(data.customer || null);
        setProject(data.project || null);
        setBranch(data.branchBasicInfo || null);
        setDepositTotal(Number(data.depositTotal || 0));
        setSchemes(nextSchemes);
        setTemplates(nextTemplates);
        setFormalQuotations(nextQuotes);
        setForm(nextForm);
        setStep(draft ? Math.max(0, Math.min(steps.length - 1, Number(draft.content?.draft_step || 0))) : 0);
      } catch (error: any) {
        if (!cancelled) setMessage(error?.message || "加载合同资料失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [customerId, quotationId]);

  const selectedQuote = useMemo(() => {
    if (!form) return null;
    return formalQuotations.find((item: any) => String(item.id) === String(form.quotation_id))
      || formalQuotations.find((item: any) => String(item.id) === String(quotationId))
      || formalQuotations[0]
      || null;
  }, [formalQuotations, form, quotationId]);

  const selectedScheme = useMemo(
    () => schemes.find((scheme) => scheme.id === form?.payment_scheme_id) || null,
    [form?.payment_scheme_id, schemes],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form?.contract_template_id) || null,
    [form?.contract_template_id, templates],
  );

  const totalAmount = Number(form?.total_amount || 0);
  const maxDepositDeduct = Math.min(depositTotal, totalAmount);
  const depositDeductAmount = form?.deposit_deducted
    ? Math.min(Number(form.deposit_deduct_amount || 0), maxDepositDeduct)
    : 0;
  const payableAmount = Math.max(0, totalAmount - depositDeductAmount);
  const paymentStages = (selectedScheme?.stages || []).map((stage) => ({
    ...stage,
    amount: Math.round(payableAmount * Number(stage.ratio || 0)) / 100,
  }));
  const ratioTotal = paymentStages.reduce((sum, stage) => sum + Number(stage.ratio || 0), 0);
  const contractSteps = steps;
  const contractStep = step;
  const contractMessage = message;
  const contractForm = form as ContractForm;
  const contractTemplates = templates;
  const contractQuotationOptions = formalQuotations;
  const selectedContractQuotation = selectedQuote;
  const selectedContractTemplate = selectedTemplate;
  const selectedPaymentScheme = selectedScheme;
  const contractPaymentStages = paymentStages;
  const contractPaymentRatioTotal = ratioTotal;
  const contractTotalAmount = totalAmount;
  const contractDepositDeductAmount = depositDeductAmount;
  const contractPayableAmount = payableAmount;
  const contractDepositTotal = depositTotal;
  const contractUploading = uploading;
  const contractSaving = saving;
  const contractFileInputRef = fileInputRef;
  const latestQuotation = formalQuotations[0] || null;
  const contractTemplateOptions = templates
    .filter((template) => template.contract_type === form?.contract_type && template.status === "published")
    .sort((left, right) => Number(right.is_default || 0) - Number(left.is_default || 0));
  const setContractForm = (updater: ContractForm | ((prev: ContractForm) => ContractForm)) => {
    setForm((current) => {
      if (!current) return current;
      return typeof updater === "function" ? updater(current) : updater;
    });
  };
  const setContractStep = setStep;
  const setContractMessage = setMessage;
  const clearContractMissingFields = () => setMissingFields({});
  const contractRequiredFieldClassName = (field: string, extraClassName = "") => [
    "input-field",
    missingFields[field] ? "contract-required-field-missing" : "",
    extraClassName,
  ].filter(Boolean).join(" ");
  const getMaxContractDepositDeduct = (amount: number, total = contractDepositTotal) => (
    Math.max(0, Math.min(Number(total || 0), Number(amount || 0)))
  );
  const normalizeContractDepositDeduct = (value: unknown, amount: number) => (
    Math.max(0, Math.min(Number(value || 0), getMaxContractDepositDeduct(amount)))
  );
  const applyContractQuotation = (quotationIdValue: string) => {
    const quotation = contractQuotationOptions.find((item: any) => String(item.id) === String(quotationIdValue));
    const amount = getQuotationAmount(quotation);
    setContractForm((current) => ({
      ...current,
      quotation_id: quotationIdValue,
      total_amount: amount > 0 ? String(amount) : "",
      deposit_deduct_amount: current.deposit_deducted ? String(getMaxContractDepositDeduct(amount)) : "",
    }));
    setFormalQuotations((current) => {
      const target = current.find((item: any) => String(item.id) === String(quotationIdValue));
      if (!target) return current;
      return [target, ...current.filter((item: any) => String(item.id) !== String(quotationIdValue))];
    });
  };
  const updateContractSchedule = (patch: Partial<Pick<ContractForm, "planned_start" | "duration_days" | "weekend_construction" | "holiday_construction">>) => {
    setContractForm((current) => {
      const next = { ...current, ...patch };
      return {
        ...next,
        planned_end: calculatePlannedEnd(next.planned_start, next.duration_days, next.weekend_construction, next.holiday_construction),
      };
    });
  };
  const removeContractAttachment = (fileId: string) => {
    setContractForm((current) => ({ ...current, attachments: current.attachments.filter((file) => file.id !== fileId) }));
  };
  const handlePreviewCustomerFile = (file: Attachment) => {
    if (!file.file_url) return;
    window.open(file.file_url, "_blank", "noopener,noreferrer");
  };

  const patchForm = (patch: Partial<ContractForm>) => {
    setForm((current) => current ? { ...current, ...patch } : current);
  };

  const validateStep = (targetStep = step) => {
    if (!form) return "合同资料尚未加载完成";
    const fail = (fields: string[], error: string) => {
      setMissingFields(Object.fromEntries(fields.map((field) => [field, Date.now()])));
      return error;
    };
    if (targetStep === 0) {
      if (!form.contract_type) return fail(["contract_type"], "请选择合同类型");
      if (!form.title.trim()) return fail(["title"], "请填写合同名称");
      if (!form.contract_no.trim()) return fail(["contract_no"], "请填写合同编号");
    }
    if (targetStep === 1) {
      if (!form.party_a_name.trim() || !form.party_a_phone.trim()) return fail(["party_a_name", "party_a_phone"], "请完善客户姓名和手机号");
      if (!form.project_address.trim()) return fail(["project_address"], "请填写项目地址");
      if (!form.planned_start) return fail(["planned_start"], "请选择计划开工日期");
      if (!Number(form.duration_days || 0) || Number(form.duration_days) <= 0) return fail(["duration_days"], "请填写大于 0 的签约工期");
      if (!form.planned_end) return fail(["planned_end"], "请确认计划竣工日期");
    }
    if (targetStep === 2) {
      if (!selectedQuote) return fail(["quotation_id"], "当前报价不是正式报价，无法创建合同");
      if (!Number.isFinite(totalAmount) || totalAmount <= 0) return fail(["total_amount"], "合同金额必须大于 0");
      if (!selectedScheme) return fail(["payment_scheme_id"], "请选择收款比例模板");
      if (paymentStages.length === 0 || ratioTotal !== 100) return fail(["payment_scheme_id"], "收款比例合计必须是 100%");
    }
    setMissingFields({});
    return "";
  };

  const next = () => {
    const error = validateStep();
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const uploadAttachment = async (file?: File | null) => {
    if (!file || !form) return;
    setUploading(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("customer_id", customerId);
      body.append("category", "合同附件");
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: getClientAuthHeaders(),
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "附件上传失败");
      patchForm({ attachments: [data, ...form.attachments] });
    } catch (error: any) {
      setMessage(error?.message || "附件上传失败");
    } finally {
      setUploading(false);
    }
  };

  const buildPayload = (action: "save_draft" | "create") => {
    if (!form || !selectedQuote) throw new Error("请选择正式报价");
    return {
      id: form.id || undefined,
      action,
      draft_step: step,
      contract_type: form.contract_type,
      contract_template_id: selectedTemplate?.id || form.contract_template_id || "",
      title: form.title,
      contract_no: form.contract_no,
      quotation_id: selectedQuote.id,
      signed_at: form.signed_at,
      total_amount: totalAmount,
      deposit_deducted: form.deposit_deducted,
      deposit_deduct_amount: depositDeductAmount,
      payment_scheme_id: selectedScheme?.id || "",
      payment_scheme_name: selectedScheme?.name || "",
      payment_stages: paymentStages,
      party_a: {
        name: form.party_a_name,
        contact: form.party_a_contact,
        phone: form.party_a_phone,
        id_no: form.party_a_id_no,
      },
      party_b: {
        name: form.party_b_name,
        contact: form.party_b_contact,
        phone: form.party_b_phone,
        license_no: form.party_b_license,
      },
      project_info: {
        address: form.project_no_room_number
          ? form.project_address
          : [form.project_address, form.project_building_no, form.project_unit_no, form.project_room_no].filter(Boolean).join(""),
        community: form.project_address,
        building_no: form.project_no_room_number ? "" : form.project_building_no,
        unit_no: form.project_no_room_number ? "" : form.project_unit_no,
        room_no: form.project_no_room_number ? "" : form.project_room_no,
        no_room_number: form.project_no_room_number,
        area: form.project_area,
        planned_start: form.planned_start,
        planned_end: form.planned_end,
        duration_days: form.duration_days,
        weekend_construction: form.weekend_construction,
        holiday_construction: form.holiday_construction,
        construction_scope: form.construction_scope,
      },
      construction_terms: {
        schedule: form.construction_terms,
        quality: form.quality_standard,
        warranty: form.warranty_terms,
      },
      attachments: form.attachments,
      remarks: form.remarks,
    };
  };

  const persist = async (action: "save_draft" | "create") => {
    if (!form) return;
    if (action === "create") {
      for (let index = 0; index < steps.length - 1; index += 1) {
        const error = validateStep(index);
        if (error) {
          setStep(index);
          setMessage(error);
          return;
        }
      }
    }
    setSaving(true);
    setMessage("");
    try {
      await api.post(`/api/customers/${customerId}/contracts`, buildPayload(action));
      if (action === "create") onCreated?.();
      onClose();
    } catch (error: any) {
      setMessage(error?.message || (action === "save_draft" ? "暂存失败" : "创建合同失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed bottom-0 right-0 top-0 z-[1100] bg-[#111827]/32 backdrop-blur-[1px] md:left-[var(--active-sidebar-width)] max-md:left-0">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="contract-workbench-ui absolute left-1/2 top-1/2 z-10 flex h-[calc(100dvh-24px)] max-h-[calc(100dvh-24px)] w-[calc(100vw-56px)] max-w-[1240px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] border border-[#dce4ef] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.13)]">
        <div className="border-b border-[#e2e7ee] bg-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-[#182230]">提交合同</h3>
              <p className="mt-1 text-xs leading-5 text-[#667085]">可随时暂存当前填写内容，最终创建后再同步生成收款计划。</p>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#f6f8fb] px-5 py-4">
          <div className="mb-4 rounded-[12px] border border-[#dfe7f1] bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#2f6feb]">第 {contractStep + 1} 步</p>
                <h4 className="mt-0.5 text-[15px] font-semibold text-[#182230]">{contractSteps[contractStep]?.title}</h4>
                <p className="mt-0.5 text-xs leading-5 text-[#667085]">{contractSteps[contractStep]?.desc}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#f2f6fb] px-3 py-1.5 text-xs font-semibold text-[#475467] ring-1 ring-[#dce4ef]">
                {contractStep + 1}/{contractSteps.length}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-1 rounded-[10px] bg-[#f2f6fb] p-1">
              {contractSteps.map((item, index) => {
                const active = contractStep === index;
                const done = contractStep > index;
                const available = index <= contractStep;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      if (!available) return;
                      setContractStep(index);
                      setContractMessage("");
                      clearContractMissingFields();
                    }}
                    className={`group flex min-h-9 items-center justify-center gap-2 rounded-[8px] px-2 text-[13px] font-semibold transition-all ${
                      active ? "bg-white text-[#2f6feb] ring-1 ring-[#dbe7ff]" : done ? "text-[#344054] hover:bg-white/80" : "cursor-default text-[#98a2b3]"
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-xs ${
                      active ? "bg-[#2f6feb] text-white" : done ? "bg-[#ecfdf3] text-[#027a48] ring-1 ring-[#abefc6]" : "bg-white text-[#98a2b3] ring-1 ring-[#d0d7e2]"
                    }`}>
                      {done ? <CheckCircle className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center text-sm font-semibold text-[#667085]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在加载合同资料</div>
          ) : (
            <>
              {contractStep === 0 && (
                <div className="grid min-h-[520px] flex-1 gap-4">
                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4"><h4 className="text-[15px] font-semibold text-[#182230]">合同基本信息</h4><p className="mt-1 text-xs leading-5 text-[#667085]">合同编号需保持唯一，合同名称建议包含客户姓名和小区房号。</p></div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium text-surface-700">合同类型 <span className="text-red-600">*</span></span><SystemSelect value={contractForm.contract_type} onChange={(event) => { const nextType = event.target.value; const defaultTemplate = contractTemplates.find((template) => template.contract_type === nextType && template.status === "published" && template.is_default) || contractTemplates.find((template) => template.contract_type === nextType && template.status === "published"); setContractForm((prev) => ({ ...prev, contract_type: nextType, contract_template_id: defaultTemplate?.id || "" })); }} className={contractRequiredFieldClassName("contract_type")} data-contract-required-field="contract_type">{contractTypes.map((type) => <option key={type} value={type}>{type}</option>)}</SystemSelect></label>
                      <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium text-surface-700">合同模板</span><SystemSelect value={selectedContractTemplate?.id || contractForm.contract_template_id} onChange={(event) => setContractForm((prev) => ({ ...prev, contract_template_id: event.target.value }))} className="input-field">{contractTemplateOptions.length === 0 && <option value="">暂无模板，创建时使用标准模板</option>}{contractTemplateOptions.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? "（默认）" : ""} · v{template.current_version || 1}</option>)}</SystemSelect><p className="mt-1 text-xs text-surface-500">模板在分公司设置维护；提交审批或创建合同时会冻结当前模板版本，历史合同不会被后续模板修改影响。</p></label>
                      <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium text-surface-700">合同名称 <span className="text-red-600">*</span></span><input value={contractForm.title} onChange={(event) => setContractForm((prev) => ({ ...prev, title: event.target.value }))} className={contractRequiredFieldClassName("title")} data-contract-required-field="title" placeholder="例如：张三-天河某小区装修施工合同" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">合同编号 <span className="text-red-600">*</span></span><input value={contractForm.contract_no} onChange={(event) => setContractForm((prev) => ({ ...prev, contract_no: event.target.value }))} className={contractRequiredFieldClassName("contract_no")} data-contract-required-field="contract_no" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">签约日期</span><SystemDateInput value={contractForm.signed_at} onChange={(nextValue) => setContractForm((prev) => ({ ...prev, signed_at: nextValue }))} className="input-field" /></label>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="rounded-[12px] border border-[#cfe0ff] bg-[#edf4ff] p-4 text-sm leading-6 text-[#2459c7]"><p className="font-semibold text-[#175cd3]">填写建议</p><p className="mt-2">施工合同可以用“客户姓名 + 小区房号 + 合同类型”命名，后续查找、打印和财务对账会更清晰。</p><div className="mt-4 rounded-full bg-white/80 px-3 py-2 text-xs text-[#2f6feb]">当前步骤完成后，可继续确认签约双方和项目条款。</div></div>
                  </div>
                </div>
              )}

              {contractStep === 1 && (
                <div className="grid min-h-[520px] flex-1 gap-4">
                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4"><h4 className="text-[15px] font-semibold text-[#182230]">项目信息</h4><p className="mt-1 text-xs leading-5 text-[#667085]">明确施工地址、面积和合同工期，方便后续施工管理承接。</p></div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">客户姓名 <span className="text-red-600">*</span></span><input value={contractForm.party_a_name} onChange={(event) => setContractForm((prev) => ({ ...prev, party_a_name: event.target.value, party_a_contact: event.target.value || prev.party_a_contact }))} className={contractRequiredFieldClassName("party_a_name")} data-contract-required-field="party_a_name" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">手机号 <span className="text-red-600">*</span></span><input value={contractForm.party_a_phone} onChange={(event) => setContractForm((prev) => ({ ...prev, party_a_phone: event.target.value }))} className={contractRequiredFieldClassName("party_a_phone")} data-contract-required-field="party_a_phone" /></label>
                    </div>
                    <div className="my-5 border-t border-[#e2e7ee]" />
                    <div className="grid gap-4 md:grid-cols-4">
                      <label className="block md:col-span-4"><span className="mb-1 block text-sm font-medium text-surface-700">小区/楼盘 <span className="text-red-600">*</span></span><input value={contractForm.project_address} onChange={(event) => setContractForm((prev) => ({ ...prev, project_address: event.target.value }))} className={contractRequiredFieldClassName("project_address")} data-contract-required-field="project_address" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">楼栋</span><input value={contractForm.project_building_no} disabled={contractForm.project_no_room_number} onChange={(event) => setContractForm((prev) => ({ ...prev, project_building_no: event.target.value }))} className={`input-field ${contractForm.project_no_room_number ? "contract-project-locked-input" : ""}`} placeholder="如：3栋" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">单元</span><input value={contractForm.project_unit_no} disabled={contractForm.project_no_room_number} onChange={(event) => setContractForm((prev) => ({ ...prev, project_unit_no: event.target.value }))} className={`input-field ${contractForm.project_no_room_number ? "contract-project-locked-input" : ""}`} placeholder="如：2单元" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">房室</span><input value={contractForm.project_room_no} disabled={contractForm.project_no_room_number} onChange={(event) => setContractForm((prev) => ({ ...prev, project_room_no: event.target.value }))} className={`input-field ${contractForm.project_no_room_number ? "contract-project-locked-input" : ""}`} placeholder="如：1201室" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">面积（㎡）</span><input type="number" min="0" step="0.01" value={contractForm.project_area} onChange={(event) => setContractForm((prev) => ({ ...prev, project_area: event.target.value }))} className="input-field" /></label>
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-surface-700 md:col-span-4"><input type="checkbox" checked={contractForm.project_no_room_number} onChange={(event) => setContractForm((prev) => ({ ...prev, project_no_room_number: event.target.checked, project_building_no: event.target.checked ? "" : prev.project_building_no, project_unit_no: event.target.checked ? "" : prev.project_unit_no, project_room_no: event.target.checked ? "" : prev.project_room_no }))} className="h-4 w-4 rounded border-surface-300 accent-primary-600" />无具体房号</label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">计划开工 <span className="text-red-600">*</span></span><SystemDateInput value={contractForm.planned_start} onChange={(nextValue) => updateContractSchedule({ planned_start: nextValue })} className={contractRequiredFieldClassName("planned_start")} data-contract-required-field="planned_start" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">签约工期（天） <span className="text-red-600">*</span></span><input type="number" min="1" value={contractForm.duration_days} onChange={(event) => updateContractSchedule({ duration_days: event.target.value })} className={contractRequiredFieldClassName("duration_days")} data-contract-required-field="duration_days" /></label>
                      <div className="contract-switch-field block"><span className="mb-1 block text-sm font-medium text-surface-700">周末施工</span><label className="input-field contract-toggle-field flex cursor-pointer items-center justify-between gap-3"><span>{contractForm.weekend_construction ? "周末施工" : "周末不施工"}</span><input type="checkbox" checked={contractForm.weekend_construction} onChange={(event) => updateContractSchedule({ weekend_construction: event.currentTarget.checked })} className="h-4 w-4 shrink-0 accent-primary-600" /></label></div>
                      <div className="contract-switch-field block"><span className="mb-1 block text-sm font-medium text-surface-700">节假日施工</span><label className="input-field contract-toggle-field flex cursor-pointer items-center justify-between gap-3"><span>{contractForm.holiday_construction ? "节假日施工" : "节假日不施工"}</span><input type="checkbox" checked={contractForm.holiday_construction} onChange={(event) => updateContractSchedule({ holiday_construction: event.currentTarget.checked })} className="h-4 w-4 shrink-0 accent-primary-600" /></label></div>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">计划竣工 <span className="text-red-600">*</span></span><SystemDateInput value={contractForm.planned_end} readOnly className={contractRequiredFieldClassName("planned_end", "bg-surface-50 text-surface-700")} data-contract-required-field="planned_end" /></label>
                      <div className="flex items-end text-sm text-surface-500 md:col-span-3"><div className="rounded-[10px] border border-[#dfe7f1] bg-[#f8fafc] px-3 py-2.5 text-xs leading-5 text-[#667085]">计划竣工将按计划开工、签约工期、周末施工/节假日施工设置自动推算。</div></div>
                    </div>
                  </div>
                </div>
              )}

              {contractStep === 2 && (
                <div className="flex min-h-[520px] flex-1 flex-col rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                  <div className="flex flex-col">
                    <div className="mb-4"><h4 className="text-[15px] font-semibold text-[#182230]">合同金额与定金抵扣</h4><p className="mt-1 text-xs leading-5 text-[#667085]">请选择已设为正式报价的预算，合同金额会按该预算带出。</p></div>
                    <div className="flex min-h-0 flex-1 flex-col justify-between gap-5">
                      <div className="space-y-4">
                      <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium text-surface-700">预算报价 <span className="text-red-600">*</span></span><SystemSelect value={contractForm.quotation_id} onChange={(event) => applyContractQuotation(event.target.value)} className={contractRequiredFieldClassName("quotation_id")} data-contract-required-field="quotation_id"><option value="">请选择正式报价</option>{contractQuotationOptions.map((quotation: any) => <option key={quotation.id} value={quotation.id}>{quotation.title || "装修报价单"} · {formatPlainAmount(getQuotationAmount(quotation))}</option>)}</SystemSelect></label>
                      {selectedContractQuotation && <div className="rounded-[10px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2 text-sm text-[#027a48] md:col-span-2">已选择正式报价：{selectedContractQuotation.title || "装修报价单"}，金额 {formatPlainAmount(getQuotationAmount(selectedContractQuotation))}</div>}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">合同总金额（元） <span className="text-red-600">*</span></span><input type="number" min="0" step="0.01" value={contractForm.total_amount} onChange={(event) => { const nextTotal = Number(event.target.value || 0); setContractForm((prev) => ({ ...prev, total_amount: event.target.value, deposit_deduct_amount: prev.deposit_deducted ? String(normalizeContractDepositDeduct(prev.deposit_deduct_amount, nextTotal)) : "" })); }} className={contractRequiredFieldClassName("total_amount")} data-contract-required-field="total_amount" /></label>
                      <label className="block"><span className="mb-1 block text-sm font-medium text-surface-700">收款比例模板 <span className="text-red-600">*</span></span><SystemSelect value={contractForm.payment_scheme_id} onChange={(event) => setContractForm((prev) => ({ ...prev, payment_scheme_id: event.target.value }))} className={contractRequiredFieldClassName("payment_scheme_id")} data-contract-required-field="payment_scheme_id">{schemes.length === 0 && <option value="">暂无可用模板</option>}{schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}{scheme.isDefault ? "（默认）" : ""}</option>)}</SystemSelect></label>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex min-h-[68px] items-center justify-between gap-3 rounded-[10px] border border-[#dfe7f1] bg-[#f8fafc] px-3 py-2"><div className="min-w-0"><p className="text-sm font-semibold leading-5 text-[#182230]">定金是否抵扣</p><p className="mt-0.5 text-xs leading-5 text-[#667085]">当前已收定金</p></div><div className="flex shrink-0 items-center gap-4"><p className="text-base font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(contractDepositTotal)}</p><button type="button" onClick={() => setContractForm((prev) => { const nextDeducted = !prev.deposit_deducted; return { ...prev, deposit_deducted: nextDeducted, deposit_deduct_amount: nextDeducted ? String(getMaxContractDepositDeduct(Number(prev.total_amount || 0))) : "" }; })} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${contractForm.deposit_deducted ? "bg-[#2f6feb]" : "bg-[#d0d7e2]"}`} aria-label="定金是否抵扣"><span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,0.2)] transition-transform ${contractForm.deposit_deducted ? "translate-x-5" : "translate-x-0"}`} /></button></div></div>
                      <label className="flex min-h-[68px] items-center justify-between gap-3 rounded-[10px] border border-[#dfe7f1] bg-[#f8fafc] px-3 py-2"><span className="shrink-0 text-sm font-semibold leading-5 text-[#182230]">本次抵扣定金（元）</span><input type="number" min="0" step="0.01" disabled={!contractForm.deposit_deducted} value={contractForm.deposit_deducted ? String(contractDepositDeductAmount) : ""} onChange={(event) => setContractForm((prev) => ({ ...prev, deposit_deduct_amount: String(normalizeContractDepositDeduct(event.target.value, Number(prev.total_amount || 0))) }))} className={contractRequiredFieldClassName("deposit_deduct_amount", `w-[180px] ${contractForm.deposit_deducted ? "" : "bg-surface-50 text-surface-400"}`)} data-contract-required-field="deposit_deduct_amount" /></label>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid min-h-0 flex-1 gap-4 border-t border-[#e2e7ee] pt-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="flex min-h-0 flex-col rounded-[12px] border border-[#dfe7f1] bg-[#f8fafc] p-3"><div className="flex items-center justify-between gap-3"><h4 className="text-[15px] font-semibold text-[#182230]">金额汇总</h4><span className={`rounded-[8px] px-2 py-1 text-xs font-semibold ${contractPaymentRatioTotal === 100 ? "bg-[#ecfdf3] text-[#027a48]" : "bg-[#fef3f2] text-[#b42318]"}`}>{formatPlainAmount(contractPaymentRatioTotal).replace(".00", "")}%</span></div><div className="mt-3 grid min-h-0 flex-1 gap-3"><div className="flex flex-col justify-between rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5"><p className="text-xs text-[#667085]">合同总金额</p><p className="font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(contractTotalAmount)}</p></div><div className="flex flex-col justify-between rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5"><p className="text-xs text-[#667085]">定金抵扣</p><p className="font-semibold tabular-nums text-[#182230]">{formatPlainAmount(contractDepositDeductAmount)}</p></div><div className="flex flex-col justify-between rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5"><p className="text-xs text-[#667085]">应收合同款</p><p className="font-semibold tabular-nums text-[#d92d20]">{formatPlainAmount(contractPayableAmount)}</p></div></div></div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white"><div className="flex items-center justify-between border-b border-[#e2e7ee] bg-[#f8fafc] px-4 py-3"><div><h4 className="text-[15px] font-semibold text-[#182230]">收款计划预览</h4><p className="mt-1 text-xs text-[#667085]">按应收合同款和选择的收款比例自动生成</p></div>{selectedPaymentScheme && <span className="rounded-full border border-[#dce4ef] bg-white px-3 py-1 text-xs font-semibold text-[#344054]">{selectedPaymentScheme.name}</span>}</div>{contractPaymentStages.length > 0 ? <div className="mx-4 my-3 overflow-hidden rounded-[10px] border border-[#e2e7ee]"><table className="w-full table-fixed text-[13px] font-medium leading-5 text-[#344054]"><thead className="bg-[#f8fafc]"><tr className="border-b border-[#e2e7ee] text-[13px] font-semibold text-[#344054]"><th className="w-[8%] px-2 py-3 text-center">期数</th><th className="w-[24%] px-2 py-3 text-center">款项名称</th><th className="w-[12%] px-2 py-3 text-center">比例</th><th className="w-[24%] px-2 py-3 text-center">应收金额</th><th className="w-[32%] px-2 py-3 text-center">收款阶段</th></tr></thead><tbody className="divide-y divide-[#eef2f6]">{contractPaymentStages.map((stage, index) => <tr key={stage.id || index} className="even:bg-[#fbfcfe] hover:bg-[#f4f7fb]"><td className="px-2 py-3 text-center text-[#344054]">{index + 1}</td><td className="truncate px-2 py-3 text-center text-[#344054]">{stage.name || `第${index + 1}期款`}</td><td className="px-2 py-3 text-center text-[#344054]">{Number(stage.ratio || 0)}%</td><td className="px-2 py-3 text-center font-semibold tabular-nums text-[#344054]">{formatPlainAmount(stage.amount || 0)}</td><td className="truncate px-2 py-3 text-center text-[#344054]">{stage.trigger || "-"}</td></tr>)}</tbody></table></div> : <div className="py-12 text-center text-sm text-surface-400">请选择收款比例模板</div>}</div>
                  </div>
                </div>
              )}

              {contractStep === 3 && (
                <div className="grid min-h-[520px] flex-1 gap-4">
                  <div className="rounded-[12px] border border-[#dfe7f1] bg-white p-5">
                    <div className="mb-4 flex items-start justify-between gap-3"><div><h4 className="text-[15px] font-semibold text-[#182230]">合同附件</h4><p className="mt-1 text-xs leading-5 text-[#667085]">可上传合同扫描件、签字页、补充协议、客户确认截图等资料。</p></div><button type="button" className="btn-secondary shrink-0" onClick={() => contractFileInputRef.current?.click()} disabled={contractUploading}>{contractUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{contractUploading ? "上传中..." : "上传附件"}</button><input ref={contractFileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => { void uploadAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>
                    {contractForm.attachments.length > 0 ? <div className="min-h-[180px] space-y-2">{contractForm.attachments.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-[10px] border border-[#e2e7ee] bg-white px-3 py-2.5 hover:bg-[#f8fafc]"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb]">{file.mime_type?.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#182230]">{file.file_name}</p><p className="mt-0.5 text-xs text-[#98a2b3]">{formatFileSize(file.file_size) || "合同附件"}</p></div><button type="button" onClick={() => handlePreviewCustomerFile(file)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#edf4ff] hover:text-[#2f6feb]" title="预览"><Eye className="h-4 w-4" /></button><button type="button" onClick={() => removeContractAttachment(file.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#fef3f2] hover:text-[#d92d20]" title="从本合同移除"><Trash2 className="h-4 w-4" /></button></div>)}</div> : <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] text-center text-sm text-[#667085]"><Upload className="mb-3 h-8 w-8 text-[#98a2b3]" /><p>暂未上传合同附件</p><p className="mt-1 text-xs">可先创建合同，后续再补充归档。</p></div>}
                    <label className="mt-5 block"><span className="mb-1 block text-sm font-medium text-surface-700">合同备注</span><textarea value={contractForm.remarks} onChange={(event) => setContractForm((prev) => ({ ...prev, remarks: event.target.value }))} className="input-field contract-remark-textarea resize-y" placeholder="例如：客户要求本周内完成签约归档，补充协议另行上传。" /></label>
                  </div>
                </div>
              )}

              {contractMessage && <div className={`mt-4 rounded-[10px] border px-3 py-2 text-sm ${contractMessage.includes("已上传") || contractMessage.includes("已创建") || contractMessage.includes("已暂存") ? "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]" : "border-[#fecdca] bg-[#fef3f2] text-[#b42318]"}`}>{contractMessage}</div>}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#e2e7ee] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="button" className="btn-secondary" onClick={() => void persist("save_draft")} disabled={contractSaving || contractUploading}>{contractSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{contractSaving ? "暂存中..." : "暂存"}</button>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary" onClick={() => { setContractStep((current) => Math.max(current - 1, 0)); setContractMessage(""); }} disabled={contractStep === 0 || contractSaving}>上一步</button>
            {contractStep < contractSteps.length - 1 ? (
              <button type="button" className="btn-primary" onClick={next} disabled={contractSaving}>下一步</button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => void persist("create")} disabled={contractSaving || contractUploading}>{contractSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}{contractSaving ? "创建中..." : "创建合同"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
