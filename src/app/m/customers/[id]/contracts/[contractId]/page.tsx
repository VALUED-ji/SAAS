"use client";

import { api } from "@/lib/api";
import {
  ArrowLeft, Building2, Check, CircleDashed, CircleX, ClipboardList, Clock3,
  ExternalLink, Eye, FileText, MapPin, Paperclip, RefreshCw,
  ShieldCheck, UserRound, UsersRound, WalletCards,
} from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMobileBack } from "@/lib/mobileNavigation";
import styles from "./contract-detail.module.css";

type ApprovalStep = {
  id?: string; sort_order?: number; node_name?: string | null; approve_mode?: string | null;
  approver_name?: string | null; approver_avatar?: string | null; status?: string | null;
  action_at?: string | null; comment?: string | null; signature_name?: string | null;
  signature_signer_name?: string | null; signature_signed_at?: string | null;
};
type Approval = {
  status?: string | null; flow_name?: string | null; approved_nodes?: number | null;
  total_nodes?: number | null; current_node_name?: string | null; steps?: ApprovalStep[];
};
type PaymentStage = {
  id?: string; name?: string; milestone?: string; ratio?: number | string | null;
  amount?: number | string | null; due_date?: string | null; trigger?: string | null; status?: string | null;
};
type Attachment = { id?: string; file_name?: string; name?: string; file_url?: string };
type Contract = {
  id: string; contract_no?: string | null; title?: string | null; total_amount?: number | null;
  status?: string | null; signed_at?: string | null; created_at?: string | null; updated_at?: string | null;
  created_by_name?: string | null; project_name?: string | null; project_address?: string | null;
  content?: Record<string, any>; payment_plans?: PaymentStage[]; approval?: Approval | null;
};
type Customer = { id: string; name?: string | null; service_store?: string | null };
type ContractResponse = { customer?: Customer; contracts?: Contract[] };

function numberValue(value: unknown) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue(value));
}

function formatDate(value?: string | null, includeTime = false) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Shanghai" }).format(date);
}

function text(value: unknown) {
  return String(value ?? "").trim() || "-";
}

function statusMeta(status?: string | null) {
  const key = String(status || "DRAFT").toUpperCase();
  if (key === "SIGNED") return { key: "signed", label: "已签约" };
  if (key === "PENDING_APPROVAL") return { key: "pending", label: "合同审批中" };
  if (key === "REJECTED") return { key: "rejected", label: "审批驳回" };
  if (key === "RESIGNED") return { key: "neutral", label: "已重签" };
  if (key === "APPROVED") return { key: "signed", label: "审批通过" };
  return { key: "neutral", label: "草稿" };
}

function approvalMeta(status?: string | null) {
  const key = String(status || "waiting").toLowerCase();
  if (key === "approved") return { key, label: "已通过" };
  if (key === "rejected") return { key, label: "已驳回" };
  if (key === "pending") return { key, label: "审批中" };
  if (key === "skipped") return { key, label: "已跳过" };
  return { key: "waiting", label: "未开始" };
}

function groupSteps(steps?: ApprovalStep[]) {
  const groups = new Map<number, ApprovalStep[]>();
  (Array.isArray(steps) ? steps : []).forEach((step) => {
    const order = Number(step.sort_order || 0);
    groups.set(order, [...(groups.get(order) || []), step]);
  });
  return Array.from(groups.entries()).sort(([left], [right]) => left - right).map(([order, rows]) => ({
    order, name: rows[0]?.node_name || `审批节点 ${order + 1}`,
    mode: rows[0]?.approve_mode === "all" ? "全部人审批" : "任一人审批", steps: rows,
  }));
}

function nodeStatus(steps: ApprovalStep[]) {
  if (steps.some((step) => step.status === "rejected")) return "rejected";
  if (steps.some((step) => step.status === "pending")) return "pending";
  if (steps.some((step) => step.status === "approved")) return "approved";
  if (steps.length && steps.every((step) => step.status === "skipped")) return "skipped";
  return "waiting";
}

function documentHtml(content: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:18px 16px 32px;color:#25332e;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.85;overflow-wrap:anywhere}h1{font-size:21px;line-height:1.4;text-align:center;margin:0 0 18px}h2{font-size:17px;margin:22px 0 10px}h3{font-size:15px;margin:18px 0 8px}p{margin:7px 0}table{width:100%!important;border-collapse:collapse!important;table-layout:fixed}th,td{border:1px solid #cfd8d3!important;padding:7px!important;font-size:12px!important;vertical-align:top!important;word-break:break-word}th{background:#f5f7f5}img{max-width:100%;height:auto}.contract-signatures{display:grid;grid-template-columns:1fr;gap:10px}.contract-signatures>div,.contract-seal{min-height:90px;border:1px solid #dce4df;padding:12px}</style></head><body>${content}</body></html>`;
}

function InfoItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return <div className={styles.infoItem}><span>{label}</span><b>{value || "-"}</b></div>;
}

function Avatar({ name, src }: { name?: string | null; src?: string | null }) {
  return <span className={styles.avatar}>{src ? <Image src={src} alt={`${name || "审批人"}头像`} width={36} height={36} unoptimized /> : String(name || "审").trim().slice(0, 1)}</span>;
}

export default function MobileContractDetailPage() {
  const params = useParams<{ id: string; contractId: string }>();
  const customerId = String(params.id || "");
  const contractId = String(params.contractId || "");
  const mobileBack = useMobileBack(`/m/customers/${customerId}`);
  const [contract, setContract] = useState<Contract | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<"contract" | "approval">("contract");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await api.get<ContractResponse>(`/api/customers/${customerId}/contracts?contract_id=${encodeURIComponent(contractId)}&includeContent=1`);
      const current = (response.contracts || []).find((item) => String(item.id) === contractId) || null;
      if (!current) throw new Error("合同不存在或已被删除");
      setContract(current); setCustomer(response.customer || null);
      const status = String(current.status || "").toUpperCase();
      setActiveTab(["PENDING_APPROVAL", "REJECTED"].includes(status) ? "approval" : "contract");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "合同详情加载失败"); }
    finally { setLoading(false); }
  }, [contractId, customerId]);

  useEffect(() => { load(); }, [load]);

  const content = contract?.content || {};
  const amount = content.amount_info || {};
  const partyA = content.party_a || {};
  const partyB = content.party_b || {};
  const project = content.project_info || {};
  const construction = content.construction_terms || {};
  const attachments: Attachment[] = Array.isArray(content.attachments) ? content.attachments : [];
  const paymentStages: PaymentStage[] = Array.isArray(amount.payment_stages) && amount.payment_stages.length ? amount.payment_stages : contract?.payment_plans || [];
  const renderedDocument = String(content.document_snapshot?.rendered_html || "");
  const approvalGroups = useMemo(() => groupSteps(contract?.approval?.steps), [contract?.approval?.steps]);

  if (loading) return <div className={styles.screen}><div className={styles.state}><FileText /><b>正在加载合同</b></div></div>;
  if (error || !contract) return <div className={styles.screen}><header className={styles.header}><button type="button" onClick={mobileBack} aria-label="返回"><ArrowLeft /></button><div><h1>合同详情</h1><p>只读查看</p></div><span /></header><div className={styles.state}><FileText /><b>{error || "合同不存在"}</b><button type="button" onClick={load}><RefreshCw />重新加载</button></div></div>;

  const status = statusMeta(contract.status);
  const approval = contract.approval;
  const approvalStatus = approvalMeta(approval?.status);
  const totalAmount = numberValue(amount.total_amount || contract.total_amount);
  const deducted = numberValue(amount.deposit_deduct_amount);
  const payable = numberValue(amount.payable_amount ?? Math.max(0, totalAmount - deducted));
  const printUrl = `/api/customers/${customerId}/contracts/${contract.id}/print`;

  return <div className={styles.screen}>
    <header className={styles.header}><button type="button" onClick={mobileBack} aria-label="返回客户详情"><ArrowLeft /></button><div><h1>合同详情</h1><p>预览合同与审批记录</p></div><span className={styles.readonlyBadge}><Eye />只读</span></header>
    <main className={styles.content}>
      <section className={styles.hero}><div className={styles.heroTop}><span className={styles.heroIcon}><ClipboardList /></span><div><small>{customer?.name || "客户"} · {content.contract_type || "装修合同"}</small><h2>{contract.title || "未命名合同"}</h2><p>{contract.contract_no || "合同编号待完善"}</p></div><em data-status={status.key}>{status.label}</em></div><div className={styles.heroAmount}><span>合同金额</span><strong>¥{formatMoney(totalAmount)}</strong><small>签约日期 · {formatDate(contract.signed_at)}</small></div></section>

      <nav className={styles.tabs} aria-label="合同查看方式"><button type="button" data-active={activeTab === "contract" || undefined} onClick={() => setActiveTab("contract")}><FileText />合同预览</button><button type="button" data-active={activeTab === "approval" || undefined} onClick={() => setActiveTab("approval")}><ShieldCheck />审批记录{approval && <i data-status={approvalStatus.key} />}</button></nav>

      {activeTab === "contract" && <>
        {renderedDocument ? <section className={styles.documentSection}><div className={styles.sectionTitle}><span><FileText /><b>合同正文</b></span><a href={printUrl} target="_blank" rel="noreferrer">完整页面<ExternalLink /></a></div><iframe className={styles.documentFrame} title="合同正文预览" sandbox="" srcDoc={documentHtml(renderedDocument)} /></section> : <section className={styles.noDocument}><FileText /><b>暂无冻结合同正文</b><p>可查看下方合同资料，或打开系统生成的完整合同页面。</p><a href={printUrl} target="_blank" rel="noreferrer">打开合同预览<ExternalLink /></a></section>}

        <section className={styles.section}><div className={styles.sectionTitle}><span><ClipboardList /><b>基本信息</b></span></div><div className={styles.infoGrid}><InfoItem label="合同类型" value={content.contract_type} /><InfoItem label="合同编号" value={contract.contract_no} /><InfoItem label="签约日期" value={formatDate(contract.signed_at)} /><InfoItem label="创建人" value={contract.created_by_name} /><InfoItem label="来源报价" value={amount.quotation_title || content.quotation_title} /><InfoItem label="更新时间" value={formatDate(contract.updated_at, true)} /></div></section>

        <section className={styles.section}><div className={styles.sectionTitle}><span><UsersRound /><b>签约双方</b></span></div><div className={styles.partyList}><div><span className={styles.partyIcon}><UserRound /></span><span><small>甲方 / 业主</small><b>{text(partyA.name)}</b><p>{text(partyA.phone)}{partyA.id_no ? ` · ${partyA.id_no}` : ""}</p></span></div><div><span className={styles.partyIcon} data-tone="company"><Building2 /></span><span><small>乙方 / 公司</small><b>{text(partyB.name)}</b><p>{text(partyB.contact)} · {text(partyB.phone)}</p></span></div></div></section>

        <section className={styles.section}><div className={styles.sectionTitle}><span><MapPin /><b>工程信息</b></span></div><div className={styles.infoGrid}><InfoItem label="施工地址" value={project.address || contract.project_address || contract.project_name} /><InfoItem label="装修面积" value={project.area ? `${project.area}㎡` : "-"} /><InfoItem label="计划开工" value={formatDate(project.planned_start)} /><InfoItem label="计划竣工" value={formatDate(project.planned_end)} /><InfoItem label="合同工期" value={project.duration_days ? `${project.duration_days}天` : "-"} /><InfoItem label="施工安排" value={`${project.weekend_construction ? "周末施工" : "周末不施工"} · ${project.holiday_construction ? "节假日施工" : "节假日不施工"}`} /></div>{project.construction_scope && <div className={styles.textBlock}><span>施工范围</span><p>{project.construction_scope}</p></div>}{(construction.schedule || construction.quality || construction.warranty) && <div className={styles.textBlock}><span>施工条款</span><p>{[construction.schedule, construction.quality, construction.warranty].filter(Boolean).join("\n")}</p></div>}</section>

        <section className={styles.section}><div className={styles.sectionTitle}><span><WalletCards /><b>合同金额与收款计划</b></span></div><div className={styles.amountSummary}><div><span>合同总额</span><b>¥{formatMoney(totalAmount)}</b></div><div><span>定金抵扣</span><b>¥{formatMoney(deducted)}</b></div><div><span>合同应收</span><b>¥{formatMoney(payable)}</b></div></div><div className={styles.planList}>{paymentStages.length ? paymentStages.map((stage, index) => <div key={stage.id || `${stage.name}-${index}`}><span className={styles.planIndex}>{index + 1}</span><span><b>{stage.name || stage.milestone || `第${index + 1}期款`}</b><small>{stage.trigger || stage.due_date || "按合同约定"}</small></span><em>{stage.ratio !== undefined && stage.ratio !== null ? `${stage.ratio}%` : ""}</em><strong>¥{formatMoney(stage.amount)}</strong></div>) : <p className={styles.emptyLine}>暂无收款计划</p>}</div></section>

        {(attachments.length > 0 || content.remarks) && <section className={styles.section}><div className={styles.sectionTitle}><span><Paperclip /><b>附件与备注</b></span></div>{attachments.length > 0 && <div className={styles.attachmentList}>{attachments.map((file, index) => <a href={file.file_url} target="_blank" rel="noreferrer" key={file.id || index}><span><FileText /></span><b>{file.file_name || file.name || "合同附件"}</b><ExternalLink /></a>)}</div>}{content.remarks && <div className={styles.textBlock}><span>合同备注</span><p>{content.remarks}</p></div>}</section>}
      </>}

      {activeTab === "approval" && <section className={`${styles.section} ${styles.approvalSection}`}><div className={styles.sectionTitle}><span><ShieldCheck /><b>审批记录</b></span><em data-status={approvalStatus.key}>{approval ? approvalStatus.label : "未发起"}</em></div>{approval ? <><div className={styles.approvalSummary}><div><span>审批流程</span><b>{approval.flow_name || "合同审批流"}</b></div><div><span>当前节点</span><b>{approval.current_node_name || (approval.status === "approved" ? "审批已完成" : "-")}</b></div><div><span>审批进度</span><b>{numberValue(approval.approved_nodes)}/{numberValue(approval.total_nodes)}</b></div><div className={styles.progress}><i style={{ width: `${numberValue(approval.total_nodes) ? Math.min(100, numberValue(approval.approved_nodes) / numberValue(approval.total_nodes) * 100) : 0}%` }} /></div></div>{approvalGroups.length ? <div className={styles.timeline}>{approvalGroups.map((group, index) => { const groupState = nodeStatus(group.steps); const Icon = groupState === "approved" ? Check : groupState === "rejected" ? CircleX : groupState === "pending" ? Clock3 : CircleDashed; return <div className={styles.node} key={`${group.order}-${group.name}`}><div className={styles.nodeRail}><span data-status={groupState}><Icon /></span>{index < approvalGroups.length - 1 && <i />}</div><div className={styles.nodeBody}><div className={styles.nodeHeading}><span><b>{index + 1}. {group.name}</b><small>{group.mode}</small></span><em data-status={groupState}>{approvalMeta(groupState).label}</em></div><div className={styles.approvers}>{group.steps.map((step, stepIndex) => { const stepStatus = approvalMeta(step.status); return <div className={styles.approver} key={step.id || stepIndex}><Avatar name={step.approver_name} src={step.approver_avatar} /><div><span><b>{step.approver_name || "审批人"}</b><em data-status={stepStatus.key}>{stepStatus.label}</em></span><small>{step.action_at ? formatDate(step.action_at, true) : step.status === "pending" ? "等待处理" : "尚未开始"}</small>{step.comment && <p>审批意见：{step.comment}</p>}{(step.signature_name || step.signature_signer_name) && <p className={styles.signature}>已签署 · {step.signature_signer_name || step.signature_name}{step.signature_signed_at ? ` · ${formatDate(step.signature_signed_at, true)}` : ""}</p>}</div></div>; })}</div></div></div>; })}</div> : <div className={styles.emptyApproval}><CircleDashed /><b>审批流程暂无节点</b></div>}</> : <div className={styles.emptyApproval}><ShieldCheck /><b>该合同未经过审批</b><p>门店未启用合同审批时，合同提交后可直接签约。</p></div>}</section>}
    </main>
  </div>;
}
