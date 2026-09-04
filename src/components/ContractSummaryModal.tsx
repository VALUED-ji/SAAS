"use client";

import { useRef } from "react";
import type { ElementType, ReactNode, WheelEvent } from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  ReceiptText,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import ApprovalSignaturePreview from "@/components/approval/ApprovalSignaturePreview";
import NativeImage from "@/components/ui/NativeImage";

export type ContractSummaryModalContract = {
  id: string;
  contract_no?: string | null;
  title?: string | null;
  total_amount?: number | null;
  status?: string | null;
  signed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  content?: any;
  payment_plans?: any[];
  approval?: any;
};

type ContractSummaryModalProps = {
  contract: ContractSummaryModalContract | null;
  currentUserId?: string | null;
  approvalProcessingId?: string;
  onClose: () => void;
  onApprovalAction?: (stepId: string, action: "approve" | "reject") => Promise<void> | void;
};

type PaymentStageSummary = {
  id?: string;
  name?: string;
  milestone?: string;
  ratio?: number | string | null;
  amount?: number | string | null;
  due_date?: string | null;
  trigger?: string | null;
  status?: string | null;
};

function formatAmount(value?: number | string | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getContractStatusView(contract: ContractSummaryModalContract) {
  const status = String(contract.status || "").toUpperCase();
  if (status === "DRAFT" && contract.content?.is_temporary_draft) return { label: "暂存", className: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]" };
  if (status === "PENDING_APPROVAL") return { label: "待审批", className: "border-[#cfe0ff] bg-[#edf4ff] text-[#2f6feb]" };
  if (status === "REJECTED") return { label: "已驳回", className: "border-[#fecdca] bg-[#fef3f2] text-[#d92d20]" };
  if (status === "SIGNED") return { label: "已签约", className: "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]" };
  if (status === "RESIGNED") return { label: "已重签", className: "border-[#d0d7e2] bg-[#f2f6fb] text-[#475467]" };
  if (status === "APPROVED") return { label: "已审批", className: "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]" };
  return { label: "草稿", className: "border-[#d0d7e2] bg-white text-[#475467]" };
}

function getApprovalStatusMeta(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return { label: "已通过", className: "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]", icon: CircleCheck };
  if (normalized === "rejected") return { label: "已驳回", className: "border-[#fecdca] bg-[#fef3f2] text-[#d92d20]", icon: CircleX };
  if (normalized === "pending") return { label: "待审批", className: "border-[#cfe0ff] bg-[#edf4ff] text-[#2f6feb]", icon: Clock };
  if (normalized === "skipped") return { label: "已跳过", className: "border-[#d0d7e2] bg-[#f2f6fb] text-[#667085]", icon: CircleDashed };
  return { label: "未开始", className: "border-[#d0d7e2] bg-[#f2f6fb] text-[#667085]", icon: CircleDashed };
}

function getApprovalInstanceText(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "审批通过";
  if (normalized === "rejected") return "审批驳回";
  if (normalized === "pending") return "审批中";
  return "未发起";
}

function ApprovalUserAvatar({ name, avatar }: { name?: string | null; avatar?: string | null }) {
  const initial = String(name || "审").trim().slice(0, 1) || "审";
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ${
      avatar
        ? "bg-white ring-1 ring-inset ring-[#dfe5ed]"
        : "bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]"
    }`}>
      {avatar ? (
        <NativeImage src={avatar} alt={`${name || "审批人"}头像`} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

function groupApprovalSteps(steps?: any[]) {
  const groups = new Map<number, any[]>();
  (Array.isArray(steps) ? steps : []).forEach((step) => {
    const order = Number(step.sort_order || 0);
    groups.set(order, [...(groups.get(order) || []), step]);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([sortOrder, group]) => ({
      sortOrder,
      nodeName: group[0]?.node_name || `审批节点 ${sortOrder + 1}`,
      steps: group,
    }));
}

function getApprovalNodeStatus(steps: any[]) {
  if (steps.some((step) => step.status === "rejected")) return "rejected";
  if (steps.some((step) => step.status === "pending")) return "pending";
  if (steps.some((step) => step.status === "approved")) return "approved";
  if (steps.every((step) => step.status === "skipped")) return "skipped";
  return "waiting";
}

function asText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function yesNo(value: unknown) {
  return value ? "允许" : "不允许";
}

function Section({ icon: Icon, title, children }: { icon: ElementType; title: string; children: ReactNode }) {
  return (
    <section className="contract-summary-section overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e2e7ee] bg-white px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
          <Icon className="h-4 w-4" />
        </span>
        <h4 className="text-[15px] font-semibold text-[#182230]">{title}</h4>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function InfoCell({ label, value, className = "" }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-[10px] border border-[#eef2f6] bg-[#f8fafc] px-3 py-2.5 ${className}`}>
      <p className="text-xs font-medium leading-5 text-[#667085]">{label}</p>
      <div className="mt-0.5 min-h-5 break-words text-[13px] font-semibold leading-5 text-[#182230]">{value || "-"}</div>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[#eef2f6] bg-[#f8fafc] px-3 py-2.5">
      <p className="text-xs font-medium leading-5 text-[#667085]">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-[13px] font-semibold leading-6 text-[#182230]">{value || "-"}</p>
    </div>
  );
}

export default function ContractSummaryModal({
  contract,
  currentUserId,
  approvalProcessingId = "",
  onClose,
  onApprovalAction,
}: ContractSummaryModalProps) {
  const contentScrollRef = useRef<HTMLDivElement>(null);

  if (!contract) return null;

  const content = contract.content || {};
  const amountInfo = content.amount_info || {};
  const partyA = content.party_a || {};
  const partyB = content.party_b || {};
  const projectInfo = content.project_info || {};
  const constructionTerms = content.construction_terms || {};
  const statusView = getContractStatusView(contract);
  const approval = contract.approval;
  const approvalGroups = groupApprovalSteps(approval?.steps);
  const paymentStages: PaymentStageSummary[] = Array.isArray(amountInfo.payment_stages) && amountInfo.payment_stages.length > 0
    ? amountInfo.payment_stages
    : (Array.isArray(contract.payment_plans) ? contract.payment_plans : []).map((plan, index) => ({
      id: plan.id || index,
      name: plan.milestone,
      amount: plan.amount,
      due_date: plan.due_date,
      status: plan.status,
      ratio: plan.ratio,
      trigger: plan.trigger,
    }));
  const attachments = Array.isArray(content.attachments) ? content.attachments : [];
  const totalAmount = Number(amountInfo.total_amount || contract.total_amount || 0);
  const depositDeductAmount = Number(amountInfo.deposit_deduct_amount || 0);
  const payableAmount = Number(amountInfo.payable_amount ?? Math.max(0, totalAmount - depositDeductAmount));

  const handleModalWheel = (event: WheelEvent<HTMLDivElement>) => {
    const scroller = contentScrollRef.current;
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
    event.preventDefault();
    scroller.scrollTop += event.deltaY;
  };

  return (
    <div
      className="fixed bottom-0 right-0 top-0 z-[70] overflow-y-auto bg-[#111827]/32 px-4 py-5 backdrop-blur-[1px] md:left-[var(--active-sidebar-width)] max-md:left-0"
      role="dialog"
      aria-modal="true"
      aria-label="合同摘要"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="contract-summary-modal-shell relative z-10 mx-auto flex h-[calc(100dvh-40px)] max-h-[900px] w-full max-w-[1180px] flex-col overflow-hidden rounded-[12px] border border-[#dce4ef] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.13)]"
        onMouseDown={(event) => event.stopPropagation()}
        onWheel={handleModalWheel}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[#2f6feb] ring-1 ring-inset ring-[#cfe0ff]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusView.className}`}>
                {statusView.label}
              </span>
              <span className="rounded-full border border-[#dce4ef] bg-white px-2.5 py-1 text-xs font-semibold text-[#475467]">
                {asText(content.contract_type || "合同")}
              </span>
            </div>
              <h3 className="mt-2 truncate text-lg font-semibold leading-7 text-[#182230]">{asText(contract.title || "未命名合同")}</h3>
              <p className="mt-1 text-xs leading-5 text-[#667085]">合同编号：{asText(contract.contract_no)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-3">
            <div className="rounded-[12px] border border-[#fee4e2] bg-[#fff8f7] px-4 py-2.5 text-right">
              <p className="text-xs font-semibold text-[#667085]">合同金额</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[#d92d20]">{formatAmount(totalAmount)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-[10px] text-[#667085] transition hover:bg-[#f2f6fb] hover:text-[#182230] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#2f6feb]/15"
              aria-label="关闭"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={contentScrollRef} className="contract-summary-modal-scroll min-h-0 flex-1 !overflow-y-auto overscroll-contain bg-[#f6f8fb] px-5 py-4 [scrollbar-gutter:stable]">
          <div className="grid gap-4">
            <Section icon={ClipboardList} title="合同基本信息">
              <div className="grid gap-3 md:grid-cols-4">
                <InfoCell label="合同类型" value={asText(content.contract_type || "合同")} />
                <InfoCell label="合同编号" value={asText(contract.contract_no)} />
                <InfoCell label="签约日期" value={formatDate(contract.signed_at)} />
                <InfoCell label="创建人" value={asText(contract.created_by_name)} />
                <InfoCell label="创建时间" value={formatDateTime(contract.created_at)} />
                <InfoCell label="最近更新" value={formatDateTime(contract.updated_at)} />
                <InfoCell label="来源预算" value={asText(amountInfo.quotation_title || content.quotation_title)} />
                <InfoCell label="重签来源" value={asText(content.resign_source_contract_title)} />
              </div>
            </Section>

            <Section icon={Users} title="签约双方信息">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
                  <div className="border-b border-[#e2e7ee] bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#182230]">甲方 / 业主</div>
                  <div className="grid gap-3 p-3 md:grid-cols-2">
                    <InfoCell label="姓名" value={asText(partyA.name)} />
                    <InfoCell label="联系人" value={asText(partyA.contact)} />
                    <InfoCell label="手机号" value={asText(partyA.phone)} />
                    <InfoCell label="证件号" value={asText(partyA.id_no)} />
                  </div>
                </div>
                <div className="overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
                  <div className="border-b border-[#e2e7ee] bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#182230]">乙方 / 公司</div>
                  <div className="grid gap-3 p-3 md:grid-cols-2">
                    <InfoCell label="公司名称" value={asText(partyB.name)} />
                    <InfoCell label="联系人" value={asText(partyB.contact)} />
                    <InfoCell label="联系电话" value={asText(partyB.phone)} />
                    <InfoCell label="统一社会信用代码" value={asText(partyB.license_no)} />
                  </div>
                </div>
              </div>
            </Section>

            <Section icon={MapPin} title="项目信息与施工条款">
              <div className="grid gap-3 md:grid-cols-4">
                <InfoCell className="md:col-span-2" label="项目地址" value={asText(projectInfo.address || contract.project_address || contract.project_name)} />
                <InfoCell label="面积" value={projectInfo.area ? `${projectInfo.area}㎡` : "-"} />
                <InfoCell label="签约工期" value={projectInfo.duration_days ? `${projectInfo.duration_days} 天` : "-"} />
                <InfoCell label="计划开工" value={formatDate(projectInfo.planned_start)} />
                <InfoCell label="计划竣工" value={formatDate(projectInfo.planned_end)} />
                <InfoCell label="周末施工" value={yesNo(projectInfo.weekend_construction)} />
                <InfoCell label="节假日施工" value={yesNo(projectInfo.holiday_construction)} />
              </div>
              <div className="mt-3 grid gap-3">
                <TextBlock label="施工范围" value={asText(projectInfo.construction_scope)} />
                <TextBlock label="工期条款" value={asText(constructionTerms.schedule)} />
                <TextBlock label="质量标准" value={asText(constructionTerms.quality)} />
                <TextBlock label="保修条款" value={asText(constructionTerms.warranty)} />
              </div>
            </Section>

            <Section icon={WalletCards} title="合同金额与收款计划">
              <div className="grid gap-3 md:grid-cols-5">
                <InfoCell label="预算金额" value={formatAmount(amountInfo.quotation_amount || content.quotation_amount || 0)} />
                <InfoCell label="合同总额" value={<span className="text-[#d92d20]">{formatAmount(totalAmount)}</span>} />
                <InfoCell label="定金抵扣" value={amountInfo.deposit_deducted ? "抵扣" : "不抵扣"} />
                <InfoCell label="本次抵扣金额" value={formatAmount(depositDeductAmount)} />
                <InfoCell label="应收合同款" value={<span className="text-[#d92d20]">{formatAmount(payableAmount)}</span>} />
              </div>
              <div className="mt-3 overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
                <table className="w-full table-fixed text-[13px]">
                  <colgroup>
                    <col className="w-[90px]" />
                    <col />
                    <col className="w-[100px]" />
                    <col className="w-[130px]" />
                    <col className="w-[150px]" />
                    <col className="w-[110px]" />
                  </colgroup>
                  <thead className="bg-[#f8fafc]">
                    <tr className="border-b border-[#e2e7ee] text-xs font-semibold text-[#475467]">
                      <th className="px-3 py-2.5 text-center">序号</th>
                      <th className="px-3 py-2.5 text-left">收款阶段</th>
                      <th className="px-3 py-2.5 text-center">比例</th>
                      <th className="px-3 py-2.5 text-right">金额</th>
                      <th className="px-3 py-2.5 text-left">触发/到期</th>
                      <th className="px-3 py-2.5 text-center">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f6] bg-white">
                    {paymentStages.length > 0 ? paymentStages.map((stage: PaymentStageSummary, index: number) => (
                      <tr key={stage.id || `${stage.name}-${index}`} className="transition hover:bg-[#f8fafc]">
                        <td className="px-3 py-3 text-center text-[#667085]">{index + 1}</td>
                        <td className="px-3 py-3 text-left font-semibold text-[#182230]">{asText(stage.name || stage.milestone)}</td>
                        <td className="px-3 py-3 text-center text-[#475467]">{stage.ratio !== undefined && stage.ratio !== null && stage.ratio !== "" ? `${stage.ratio}%` : "-"}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#d92d20]">{formatAmount(stage.amount)}</td>
                        <td className="px-3 py-3 text-left text-[#667085]">{asText(stage.trigger || stage.due_date)}</td>
                        <td className="px-3 py-3 text-center text-[#667085]">{asText(stage.status)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-[#98a2b3]">暂无收款计划</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section icon={Paperclip} title="附件与备注">
              <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                <div className="overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
                  <div className="border-b border-[#e2e7ee] bg-[#f8fafc] px-3 py-2.5 text-xs font-semibold text-[#475467]">合同附件</div>
                  <div className="divide-y divide-[#eef2f6] bg-white">
                    {attachments.length > 0 ? attachments.map((file: any, index: number) => (
                      <a
                        key={file.id || `${file.file_url}-${index}`}
                        href={file.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 px-3 py-3 text-sm transition hover:bg-[#f8fafc]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] text-[#2f6feb]"><FileText className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-[#182230]">{asText(file.file_name || file.name || "合同附件")}</span>
                        <span className="shrink-0 text-xs font-medium text-[#667085]">查看</span>
                      </a>
                    )) : (
                      <div className="px-3 py-8 text-center text-sm text-[#98a2b3]">暂无附件</div>
                    )}
                  </div>
                </div>
                <TextBlock label="合同备注" value={asText(content.remarks)} />
              </div>
            </Section>

            <Section icon={ReceiptText} title="审批流程">
              {!approval ? (
                <div className="rounded-[12px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-8 text-center">
                  <CircleDashed className="mx-auto mb-3 h-9 w-9 text-[#98a2b3]" />
                  <p className="font-semibold text-[#182230]">不走审批或暂未发起审批</p>
                  <p className="mt-1 text-sm text-[#667085]">若分公司未开启合同审批流，合同创建后会直接进入签约状态。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <InfoCell label="审批状态" value={getApprovalInstanceText(approval.status)} />
                    <InfoCell className="md:col-span-2" label="审批流程" value={asText(approval.flow_name)} />
                    <InfoCell label="审批进度" value={`${approval.approved_nodes || 0}/${approval.total_nodes || 0}`} />
                  </div>
                  <div className="overflow-hidden rounded-[12px] border border-[#dfe7f1] bg-white">
                    <table className="w-full table-fixed text-[13px]">
                      <colgroup>
                        <col className="w-[78px]" />
                        <col className="w-[160px]" />
                        <col />
                        <col className="w-[120px]" />
                        <col className="w-[155px]" />
                        <col className="w-[180px]" />
                      </colgroup>
                      <thead className="bg-[#f8fafc]">
                        <tr className="border-b border-[#e2e7ee] text-xs font-semibold text-[#475467]">
                          <th className="px-3 py-2.5 text-center">节点</th>
                          <th className="px-3 py-2.5 text-left">审批环节</th>
                          <th className="px-3 py-2.5 text-left">审批人 / 意见</th>
                          <th className="px-3 py-2.5 text-center">状态</th>
                          <th className="px-3 py-2.5 text-center">处理时间</th>
                          <th className="px-3 py-2.5 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eef2f6] bg-white">
                        {approvalGroups.length > 0 ? approvalGroups.map((group, groupIndex) => {
                          const nodeStatus = getApprovalNodeStatus(group.steps);
                          const nodeMeta = getApprovalStatusMeta(nodeStatus);
                          return group.steps.map((step, stepIndex) => {
                            const stepMeta = getApprovalStatusMeta(step.status);
                            const canHandle = step.status === "pending" && step.approver_id === currentUserId && onApprovalAction;
                            const approveLoading = approvalProcessingId === step.id + "approve";
                            const rejectLoading = approvalProcessingId === step.id + "reject";
                            return (
                              <tr key={step.id || `${group.sortOrder}-${stepIndex}`} className="transition hover:bg-[#f8fafc]">
                                {stepIndex === 0 && (
                                  <>
                                    <td rowSpan={group.steps.length} className="px-3 py-3 text-center align-middle text-[#667085]">{groupIndex + 1}</td>
                                    <td rowSpan={group.steps.length} className="px-3 py-3 align-middle">
                                      <p className="font-semibold text-[#182230]">{group.nodeName}</p>
                                      <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${nodeMeta.className}`}>{nodeMeta.label}</span>
                                    </td>
                                  </>
                                )}
                                <td className="px-3 py-3 align-middle">
                                  <div className="flex min-w-0 items-start gap-2.5">
                                    <ApprovalUserAvatar name={step.approver_name} avatar={step.approver_avatar} />
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-[#182230]">{asText(step.approver_name || "审批人")}</p>
                                      {step.comment && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#667085]">意见：{step.comment}</p>}
                                      <ApprovalSignaturePreview step={step} compact />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center align-middle">
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${stepMeta.className}`}>{stepMeta.label}</span>
                                </td>
                                <td className="px-3 py-3 text-center align-middle text-xs text-[#667085]">{formatDateTime(step.action_at)}</td>
                                <td className="px-3 py-3 text-center align-middle">
                                  {canHandle ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onApprovalAction(step.id, "approve")}
                                        disabled={Boolean(approvalProcessingId)}
                                        className="inline-flex h-8 items-center justify-center rounded-[8px] border border-[#abefc6] bg-[#ecfdf3] px-3 text-xs font-semibold text-[#027a48] transition hover:border-[#75e0a7] hover:bg-[#dcfae6] disabled:opacity-60"
                                      >
                                        {approveLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                        同意
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onApprovalAction(step.id, "reject")}
                                        disabled={Boolean(approvalProcessingId) || step.can_reject === 0 || step.can_reject === false}
                                        className="inline-flex h-8 items-center justify-center rounded-[8px] border border-[#fecdca] bg-[#fef3f2] px-3 text-xs font-semibold text-[#d92d20] transition hover:border-[#fda29b] hover:bg-[#fee4e2] disabled:opacity-60"
                                      >
                                        {rejectLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                        驳回
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-[#98a2b3]">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        }) : (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-[#98a2b3]">暂无审批节点</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
