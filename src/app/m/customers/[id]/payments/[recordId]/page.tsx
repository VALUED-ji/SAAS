"use client";

import { api } from "@/lib/api";
import {
  ArrowLeft, Banknote, Check, CheckCircle2, ChevronRight, CircleDashed, CircleX,
  Clock3, Eye, FileImage, FileText, ReceiptText, RefreshCw, ShieldCheck,
  Store, UserRound, WalletCards,
} from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMobileBack } from "@/lib/mobileNavigation";
import styles from "./payment-detail.module.css";

type ApprovalStep = {
  id?: string;
  sort_order?: number;
  node_name?: string | null;
  approve_mode?: string | null;
  approver_name?: string | null;
  approver_avatar?: string | null;
  status?: string | null;
  action_at?: string | null;
  comment?: string | null;
  signature_name?: string | null;
  signature_signer_name?: string | null;
  signature_signed_at?: string | null;
  signature_url?: string | null;
};

type ApprovalInstance = {
  id?: string;
  status?: string | null;
  flow_name?: string | null;
  approval_amount?: number | null;
  total_nodes?: number | null;
  approved_nodes?: number | null;
  current_node_name?: string | null;
  steps?: ApprovalStep[];
  created_at?: string | null;
  completed_at?: string | null;
};

type PaymentRecord = {
  id: string;
  amount?: number | null;
  receivable_amount?: number | null;
  received_at?: string | null;
  method?: string | null;
  payment_channel?: string | null;
  record_type?: string | null;
  deposit_type?: string | null;
  receiver_name?: string | null;
  voucher_url?: string | null;
  notes?: string | null;
  status?: string | null;
  quotation_title?: string | null;
  quotation_amount?: number | null;
  design_fee_mode?: string | null;
  design_fee_base_amount?: number | null;
  design_fee_rate?: number | null;
  design_fee_area?: number | null;
  design_fee_unit_price?: number | null;
  designer_level?: string | null;
  branch_name?: string | null;
  created_by_name?: string | null;
  created_by_avatar?: string | null;
  created_at?: string | null;
  refund_status?: string | null;
  refund_amount?: number | null;
  refunded_amount?: number | null;
  refundable_remaining_amount?: number | null;
  refund_reason?: string | null;
  waived_amount?: number | null;
  waiver_status?: string | null;
  waiver_reason?: string | null;
  approval?: ApprovalInstance | null;
  top_up_approvals?: ApprovalInstance[];
  waiver_approvals?: ApprovalInstance[];
  refund_approval?: ApprovalInstance | null;
};

type Customer = { id: string; name?: string | null; address?: string | null; house_address?: string | null; service_store?: string | null };
type ApprovalFlow = { key: string; label: string; kind: "initial" | "topup" | "waiver" | "refund"; approval: ApprovalInstance };

const statusLabels: Record<string, string> = {
  approved: "审批通过", rejected: "审批驳回", pending: "审批中", waiting: "未开始", skipped: "已跳过",
};

function numberValue(value: unknown) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue(value));
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(numberValue(value));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(date);
}

function paymentLabel(record: PaymentRecord) {
  return record.deposit_type || (record.record_type === "design_fee" ? "设计费" : "定金");
}

function paymentStatus(record: PaymentRecord) {
  if (record.refund_status === "pending_approval") return { label: "退款审批中", tone: "warning" };
  if (["refunded", "partial_refunded"].includes(String(record.refund_status))) return { label: record.refund_status === "refunded" ? "已退款" : "部分退款", tone: "danger" };
  if (record.status === "pending_approval" || record.approval?.status === "pending") return { label: "收款审批中", tone: "warning" };
  if (record.status === "pending") return { label: "待收款", tone: "neutral" };
  if (record.status === "rejected" || record.approval?.status === "rejected") return { label: "审批驳回", tone: "danger" };
  return { label: "已收款", tone: "success" };
}

function approvalStatus(status?: string | null) {
  const key = String(status || "waiting").toLowerCase();
  return { key, label: statusLabels[key] || "未开始" };
}

function groupApprovalSteps(steps?: ApprovalStep[]) {
  const groups = new Map<number, ApprovalStep[]>();
  (Array.isArray(steps) ? steps : []).forEach((step) => {
    const order = Number(step.sort_order || 0);
    groups.set(order, [...(groups.get(order) || []), step]);
  });
  return Array.from(groups.entries()).sort(([a], [b]) => a - b).map(([order, rows]) => ({
    order,
    name: rows[0]?.node_name || `审批节点 ${order + 1}`,
    mode: rows[0]?.approve_mode === "all" ? "全部人审批" : "任一人审批",
    steps: rows,
  }));
}

function nodeStatus(steps: ApprovalStep[]) {
  if (steps.some((step) => step.status === "rejected")) return "rejected";
  if (steps.some((step) => step.status === "pending")) return "pending";
  if (steps.some((step) => step.status === "approved")) return "approved";
  if (steps.length && steps.every((step) => step.status === "skipped")) return "skipped";
  return "waiting";
}

function Avatar({ name, src }: { name?: string | null; src?: string | null }) {
  return <span className={styles.avatar}>{src ? <Image src={src} alt={`${name || "人员"}头像`} width={36} height={36} unoptimized /> : String(name || "人").trim().slice(0, 1)}</span>;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: React.ReactNode }) {
  return <div className={styles.infoRow}><span className={styles.infoIcon}>{icon}</span><span><small>{label}</small><b>{value || "-"}</b></span></div>;
}

export default function MobilePaymentDetailPage() {
  const params = useParams<{ id: string; recordId: string }>();
  const customerId = String(params.id || "");
  const recordId = String(params.recordId || "");
  const mobileBack = useMobileBack(`/m/customers/${customerId}`);
  const [record, setRecord] = useState<PaymentRecord | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFlowKey, setActiveFlowKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [records, customerData] = await Promise.all([
        api.get<PaymentRecord[]>(`/api/customers/${customerId}/deposits`),
        api.get<Customer>(`/api/customers/${customerId}`),
      ]);
      const current = records.find((item) => String(item.id) === recordId) || null;
      if (!current) throw new Error("款项记录不存在或已被删除");
      setRecord(current);
      setCustomer(customerData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "款项详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [customerId, recordId]);

  useEffect(() => { load(); }, [load]);

  const flows = useMemo<ApprovalFlow[]>(() => {
    if (!record) return [];
    const result: ApprovalFlow[] = [];
    if (record.approval) result.push({ key: `initial-${record.approval.id || "approval"}`, label: "首次收款审批", kind: "initial", approval: record.approval });
    (record.top_up_approvals || []).forEach((approval, index) => result.push({ key: `topup-${approval.id || index}`, label: `第 ${index + 1} 次补收审批`, kind: "topup", approval }));
    (record.waiver_approvals || []).forEach((approval, index) => result.push({ key: `waiver-${approval.id || index}`, label: record.waiver_approvals?.length === 1 ? "尾款减免审批" : `第 ${index + 1} 次减免审批`, kind: "waiver", approval }));
    if (record.refund_approval) result.push({ key: `refund-${record.refund_approval.id || "approval"}`, label: "退款审批", kind: "refund", approval: record.refund_approval });
    return result;
  }, [record]);

  useEffect(() => {
    if (!flows.some((flow) => flow.key === activeFlowKey)) setActiveFlowKey(flows[0]?.key || "");
  }, [activeFlowKey, flows]);

  const activeFlow = flows.find((flow) => flow.key === activeFlowKey) || flows[0] || null;
  const nodeGroups = useMemo(() => groupApprovalSteps(activeFlow?.approval.steps), [activeFlow]);

  if (loading) return <div className={styles.screen}><div className={styles.state}><ReceiptText /><b>正在加载款项详情</b></div></div>;
  if (error || !record) return <div className={styles.screen}><header className={styles.header}><button type="button" onClick={mobileBack} aria-label="返回"><ArrowLeft /></button><div><h1>款项详情</h1><p>只读查看</p></div><span /></header><div className={styles.state}><FileText /><b>{error || "款项不存在"}</b><button type="button" onClick={load}><RefreshCw />重新加载</button></div></div>;

  const status = paymentStatus(record);
  const receivable = numberValue(record.receivable_amount || record.amount);
  const received = numberValue(record.amount);
  const waived = numberValue(record.waived_amount);
  const pending = Math.max(0, receivable - received - waived);
  const method = record.method === "qr" ? "在线收款" : record.method === "manual" ? "手动收款" : record.method || "-";
  const designFee = record.record_type === "design_fee";

  return <div className={styles.screen}>
    <header className={styles.header}><button type="button" onClick={mobileBack} aria-label="返回客户详情"><ArrowLeft /></button><div><h1>款项详情</h1><p>查看收款信息与审批记录</p></div><span className={styles.readonlyBadge}><Eye />只读</span></header>
    <main className={styles.content}>
      <section className={styles.hero}>
        <div className={styles.heroTop}><span className={styles.heroIcon}>{designFee ? <ReceiptText /> : <WalletCards />}</span><div><small>{customer?.name || "客户"} · {record.branch_name || customer?.service_store || "门店待完善"}</small><h2>{paymentLabel(record)}</h2></div><span className={styles.statusBadge} data-tone={status.tone}>{status.label}</span></div>
        <div className={styles.heroAmount}><span>实收金额</span><strong>¥{formatMoney(received)}</strong><small>{record.payment_channel || method} · {formatDate(record.received_at)}</small></div>
      </section>

      <section className={styles.amountGrid}><div><span>应收</span><strong>¥{formatMoney(receivable)}</strong></div><div><span>实收</span><strong>¥{formatMoney(received)}</strong></div><div><span>待收</span><strong data-warning={pending > 0 || undefined}>¥{formatMoney(pending)}</strong></div></section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><Banknote /><span><b>款项信息</b><small>收款记录</small></span></div>
        <div className={styles.infoGrid}>
          <InfoRow icon={<WalletCards />} label="收款方式" value={method} />
          <InfoRow icon={<ReceiptText />} label="收款渠道" value={record.payment_channel} />
          <InfoRow icon={<Clock3 />} label="收款时间" value={formatDate(record.received_at)} />
          <InfoRow icon={<UserRound />} label="收款对象 / 收款人" value={record.receiver_name} />
          <InfoRow icon={<Store />} label="所属门店" value={record.branch_name || customer?.service_store} />
          <InfoRow icon={<UserRound />} label="发起人" value={record.created_by_name} />
        </div>
        {(record.quotation_title || record.quotation_amount) && <div className={styles.linkedQuote}><span><FileText /><b>{record.quotation_title || "关联报价"}</b></span><strong>¥{formatMoney(record.quotation_amount)}</strong></div>}
      </section>

      {designFee && <section className={styles.section}><div className={styles.sectionTitle}><ReceiptText /><span><b>设计费核算</b><small>登记时的计算依据</small></span></div><div className={styles.calculationGrid}><div><span>计费方式</span><b>{record.design_fee_mode === "rate" ? "按比例" : record.design_fee_mode === "area" ? "按面积" : "固定金额"}</b></div><div><span>计费基数</span><b>¥{formatMoney(record.design_fee_base_amount)}</b></div>{record.design_fee_mode === "rate" && <div><span>设计费率</span><b>{formatNumber(record.design_fee_rate)}%</b></div>}{record.design_fee_mode === "area" && <><div><span>计费面积</span><b>{formatNumber(record.design_fee_area)}㎡</b></div><div><span>面积单价</span><b>¥{formatMoney(record.design_fee_unit_price)}/㎡</b></div></>}{record.designer_level && <div><span>设计师级别</span><b>{record.designer_level}</b></div>}</div></section>}

      {record.voucher_url && <section className={styles.section}><div className={styles.sectionTitle}><FileImage /><span><b>收款凭证</b><small>点击查看原图</small></span></div><a className={styles.voucher} href={record.voucher_url} target="_blank" rel="noreferrer"><Image src={record.voucher_url} alt="收款凭证" fill sizes="(max-width: 520px) 92vw, 480px" unoptimized /><span>查看原图<ChevronRight /></span></a></section>}

      {(record.notes || numberValue(record.refunded_amount) > 0 || numberValue(record.waived_amount) > 0 || record.refund_reason || record.waiver_reason) && <section className={styles.section}><div className={styles.sectionTitle}><FileText /><span><b>补充信息</b><small>备注与款项调整</small></span></div><div className={styles.noteList}>{record.notes && <div><span>收款备注</span><p>{record.notes}</p></div>}{numberValue(record.refunded_amount) > 0 && <div><span>已退款</span><strong className={styles.dangerText}>¥{formatMoney(record.refunded_amount)}</strong>{record.refund_reason && <p>{record.refund_reason}</p>}</div>}{numberValue(record.waived_amount) > 0 && <div><span>已减免</span><strong>¥{formatMoney(record.waived_amount)}</strong>{record.waiver_reason && <p>{record.waiver_reason}</p>}</div>}</div></section>}

      <section className={`${styles.section} ${styles.approvalSection}`}>
        <div className={styles.sectionTitle}><ShieldCheck /><span><b>审批记录</b><small>{flows.length ? `${flows.length} 个审批流程` : "该笔款项未经过审批"}</small></span></div>
        {flows.length ? <>
          {flows.length > 1 && <div className={styles.flowTabs}>{flows.map((flow) => { const meta = approvalStatus(flow.approval.status); return <button type="button" key={flow.key} data-active={activeFlow?.key === flow.key || undefined} onClick={() => setActiveFlowKey(flow.key)}><span><b>{flow.label}</b><small>¥{formatMoney(flow.approval.approval_amount)}</small></span><em data-status={meta.key}>{meta.label}</em></button>; })}</div>}
          {activeFlow && <div className={styles.approvalSummary}><div><span className={styles.approvalMark} data-status={approvalStatus(activeFlow.approval.status).key}><ShieldCheck /></span><span><small>{activeFlow.label}</small><b>{activeFlow.approval.flow_name || "系统审批流程"}</b></span><em data-status={approvalStatus(activeFlow.approval.status).key}>{approvalStatus(activeFlow.approval.status).label}</em></div><div className={styles.progressMeta}><span>审批进度</span><b>{numberValue(activeFlow.approval.approved_nodes)}/{numberValue(activeFlow.approval.total_nodes)}</b></div><div className={styles.progress}><i style={{ width: `${numberValue(activeFlow.approval.total_nodes) ? Math.min(100, numberValue(activeFlow.approval.approved_nodes) / numberValue(activeFlow.approval.total_nodes) * 100) : 0}%` }} /></div></div>}
          {nodeGroups.length ? <div className={styles.timeline}>{nodeGroups.map((group, index) => { const groupStatus = nodeStatus(group.steps); const Icon = groupStatus === "approved" ? Check : groupStatus === "rejected" ? CircleX : groupStatus === "pending" ? Clock3 : CircleDashed; return <div className={styles.node} key={`${group.order}-${group.name}`}><div className={styles.nodeRail}><span data-status={groupStatus}><Icon /></span>{index < nodeGroups.length - 1 && <i />}</div><div className={styles.nodeBody}><div className={styles.nodeHeading}><span><b>{index + 1}. {group.name}</b><small>{group.mode}</small></span><em data-status={groupStatus}>{approvalStatus(groupStatus).label}</em></div><div className={styles.approvers}>{group.steps.map((step, stepIndex) => { const meta = approvalStatus(step.status); return <div className={styles.approver} key={step.id || stepIndex}><Avatar name={step.approver_name} src={step.approver_avatar} /><div><span><b>{step.approver_name || "审批人"}</b><em data-status={meta.key}>{meta.label}</em></span><small>{step.action_at ? formatDate(step.action_at) : step.status === "pending" ? "等待处理" : "尚未开始"}</small>{step.comment && <p>审批意见：{step.comment}</p>}{(step.signature_name || step.signature_signer_name) && <p className={styles.signature}>已签署 · {step.signature_signer_name || step.signature_name}{step.signature_signed_at ? ` · ${formatDate(step.signature_signed_at)}` : ""}</p>}</div></div>; })}</div></div></div>; })}</div> : <div className={styles.emptyApproval}><CircleDashed /><b>审批流程暂无节点</b><p>流程已经生成，但暂时没有可展示的审批节点。</p></div>}
        </> : <div className={styles.emptyApproval}><CheckCircle2 /><b>无需审批</b><p>该笔款项未发起审批流程，款项信息仍可在本页完整查看。</p></div>}
      </section>

      <p className={styles.createdTime}>记录创建于 {formatDate(record.created_at)}</p>
    </main>
  </div>;
}
