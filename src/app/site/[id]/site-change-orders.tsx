// 工地详情页变更单审批模块
// 从 page.tsx 渐进拆出的变更单工具函数与审批流组件。

"use client";

import { AlertTriangle, CircleCheck, CircleDashed, CircleX, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import ApprovalSignaturePreview from "@/components/approval/ApprovalSignaturePreview";
import NativeImage from "@/components/ui/NativeImage";
import {
  ChangeOrderForm,
  ChangeOrderItemForm,
  formatPlainAmount,
  getChangeOrderAddAmountFromItems,
  getChangeOrderDeductAmountFromItems,
  getChangeOrderLineAmount,
  normalizeChangeLineType,
  roundMoney,
} from "./site-detail-shared";
import changeOrderStyles from "./site-change-orders.module.css";
export function getChangeSignedAmount(change: any) {
  const amount = Math.max(0, Number(change?.amount || 0) || 0);
  return change?.change_type === "DEDUCT" ? -amount : amount;
}

export function getQuotationTargetCostBreakdown(items: any[]) {
  return items.reduce((result, item) => {
    const category = String(item?.category || "").trim();
    const normalizedCategory = category.toLowerCase();
    const quantity = Math.max(0, Number(item?.quantity || 0) || 0);
    const unitPrice = Math.max(0, Number(item?.unit_price || 0) || 0);
    const materialUnit = Math.max(0, Number(item?.material_cost || 0) || 0);
    const laborUnit = Math.max(0, Number(item?.labor_cost || 0) || 0);

    if (normalizedCategory === "other") return result;
    if (["base", "基装", "基装项目"].includes(normalizedCategory)) {
      result.material += quantity * materialUnit;
      result.labor += quantity * (materialUnit || laborUnit ? laborUnit : unitPrice);
      return result;
    }
    if (category === "定制柜") {
      const area = materialUnit * laborUnit / 1_000_000;
      result.material += quantity * (area > 0 ? area : 1) * unitPrice;
      return result;
    }
    result.material += quantity * unitPrice;
    return result;
  }, { material: 0, labor: 0 });
}

export function getChangeOrderDiscountAmount(order: any) {
  return Math.max(0, Number(order?.discount_amount || 0) || 0);
}

export function parseChangeOrderItems(order: any): ChangeOrderItemForm[] {
  let parsed: any[] = [];
  try {
    parsed = Array.isArray(order?.items) ? order.items : JSON.parse(order?.items || "[]");
  } catch {
    parsed = [];
  }
  const normalized = parsed
    .map((item) => {
      const legacyAmount = Math.max(0, Number(item?.amount || 0) || 0);
      const hasUnitPrice = item?.unit_price !== undefined && item?.unit_price !== null && item?.unit_price !== "";
      const hasQuantity = item?.quantity !== undefined && item?.quantity !== null && item?.quantity !== "";
      const unitPrice = Math.max(0, Number(hasUnitPrice ? item.unit_price : legacyAmount) || 0);
      const quantity = Math.max(0, Number(hasQuantity ? item.quantity : 1) || 0);
      const amount = Math.round(unitPrice * quantity * 100) / 100;
      return {
        change_type: normalizeChangeLineType(item?.change_type || order?.change_type),
        title: String(item?.title || "").trim(),
        space: String(item?.space || "").trim(),
        phase: String(item?.phase || "").trim(),
        description: String(item?.description || "").trim(),
        unit_price: formatPlainAmount(unitPrice),
        quantity: formatPlainAmount(quantity),
        unit: String(item?.unit || "项").trim() || "项",
        amount: formatPlainAmount(amount),
        cost_estimate: formatPlainAmount(Math.max(0, Number(item?.cost_estimate || 0) || 0)),
      };
    })
    .filter((item) => item.title);
  if (normalized.length > 0) return normalized;
  const fallbackAmount = Math.max(0, Number(order?.amount || 0) || 0);
  return [{
    change_type: normalizeChangeLineType(order?.change_type),
    title: String(order?.title || "").trim(),
    space: String(order?.space || "").trim(),
    phase: String(order?.phase || "").trim(),
    description: String(order?.description || "").trim(),
    unit_price: formatPlainAmount(fallbackAmount),
    quantity: "1",
    unit: "项",
    amount: formatPlainAmount(fallbackAmount),
    cost_estimate: formatPlainAmount(Math.max(0, Number(order?.cost_estimate || 0) || 0)),
  }];
}

export function getChangeOrderItemCount(order: any) {
  return parseChangeOrderItems(order).filter((item) => item.title).length || 1;
}

export function getChangeOrderListTitle(order: any) {
  const items = parseChangeOrderItems(order).filter((item) => item.title);
  if (items.length === 0) return String(order?.title || "-");
  return items
    .map((item) => `${normalizeChangeLineType(item.change_type) === "DEDUCT" ? "减项" : "增项"}：${item.title}`)
    .join("；");
}

export function getChangeOrderApprovalView(order: any) {
  const approval = order?.approval;
  if (!approval) {
    if (order?.status === "APPROVED") return { title: "不走审批", caption: "分公司未启用变更单审批流", className: "text-surface-500" };
    if (order?.status === "REJECTED") return { title: "审批驳回", caption: order?.rejected_reason || "未生成审批流", className: "text-red-700" };
    if (order?.status === "CANCELLED") return { title: "已作废", caption: order?.rejected_reason || "变更单已作废", className: "text-surface-500" };
    if (order?.status === "PENDING_APPROVAL" || order?.status === "PENDING_OWNER") return { title: "待内部审核", caption: "未生成审批流，可在详情处理", className: "text-primary-700" };
    return { title: "不走审批", caption: "分公司未启用变更单审批流", className: "text-surface-500" };
  }
  if (approval.status === "approved") {
    return { title: "审批通过", caption: `${approval.flow_name || "变更单审批流"} · ${approval.total_nodes || 0} 步`, className: "text-emerald-700" };
  }
  if (approval.status === "rejected") {
    return { title: "审批驳回", caption: approval.error_message || approval.flow_name || "变更单审批流", className: "text-red-700" };
  }
  if (approval.status === "pending") {
    const total = Number(approval.total_nodes || 0);
    const done = Number(approval.approved_nodes || 0);
    const approvers = Array.isArray(approval.current_approvers) ? approval.current_approvers.join("、") : "";
    return {
      title: approval.current_node_name || "待审批",
      caption: `${approval.flow_name || "变更单审批流"} · ${done}/${total}${approvers ? ` · ${approvers}` : ""}`,
      className: "text-primary-700",
    };
  }
  return { title: "审批异常", caption: approval.error_message || "请检查审批流配置", className: "text-amber-700" };
}

export function getApprovalStatusMeta(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return { label: "已通过", className: "border-emerald-200 bg-emerald-50 text-emerald-700", dotClassName: "bg-emerald-500", icon: CircleCheck };
  if (normalized === "rejected") return { label: "已驳回", className: "border-red-200 bg-red-50 text-red-700", dotClassName: "bg-red-500", icon: CircleX };
  if (normalized === "pending") return { label: "待审批", className: "border-primary-200 bg-primary-50 text-primary-700", dotClassName: "bg-primary-600", icon: Clock };
  if (normalized === "skipped") return { label: "已跳过", className: "border-surface-200 bg-surface-50 text-surface-500", dotClassName: "bg-surface-300", icon: CircleDashed };
  return { label: "未开始", className: "border-surface-200 bg-surface-50 text-surface-500", dotClassName: "bg-surface-300", icon: CircleDashed };
}

export function getApprovalInstanceStatusText(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "审批通过";
  if (normalized === "rejected") return "审批驳回";
  if (normalized === "pending") return "审批中";
  return "未发起";
}

export function groupChangeOrderApprovalSteps(steps?: any[]) {
  const groups = new Map<string, { key: string; sortOrder: number; nodeName: string; approveMode: string; steps: any[] }>();
  (Array.isArray(steps) ? steps : []).forEach((step) => {
    const sortOrder = Number(step.sort_order || 0);
    const nodeName = step.node_name || "内部审核";
    const key = `${sortOrder}-${step.node_id || nodeName}`;
    const existing = groups.get(key);
    if (existing) {
      existing.steps.push(step);
    } else {
      groups.set(key, {
        key,
        sortOrder,
        nodeName,
        approveMode: step.approve_mode || "any",
        steps: [step],
      });
    }
  });
  return Array.from(groups.values())
    .sort((a, b) => {
      const sortCompare = a.sortOrder - b.sortOrder;
      if (sortCompare !== 0) return sortCompare;
      return a.nodeName.localeCompare(b.nodeName);
    })
    .map((group) => ({
      ...group,
      steps: group.steps.slice().sort((a: any, b: any) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
    }));
}

export function getChangeOrderApprovalNodeStatus(steps: any[], approveMode?: string) {
  if (!steps.length) return "waiting";
  const statuses = steps.map((step) => String(step.status || "").toLowerCase());
  if (statuses.includes("rejected")) return "rejected";
  if (approveMode === "all") {
    if (statuses.every((status) => status === "approved")) return "approved";
    if (statuses.some((status) => status === "pending")) return "pending";
    if (statuses.some((status) => status === "approved")) return "pending";
    if (statuses.every((status) => status === "skipped")) return "skipped";
    return "waiting";
  }
  if (statuses.includes("approved")) return "approved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.every((status) => status === "skipped")) return "skipped";
  return "waiting";
}

function ApprovalUserAvatar({
  name,
  avatar,
  pending = false,
}: {
  name?: string | null;
  avatar?: string | null;
  pending?: boolean;
}) {
  const initial = String(name || "审").trim().slice(0, 1) || "审";
  return (
    <span className={`${changeOrderStyles.approverAvatar} ${pending ? changeOrderStyles.approverAvatarPending : ""}`}>
      {avatar ? (
        <NativeImage src={avatar} alt={`${name || "审批人"}头像`} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

export function ChangeOrderApprovalFlow({ order, currentUserName }: { order: any; currentUserName?: string }) {
  const approval = order?.approval;
  const approvalView = getChangeOrderApprovalView(order);
  const approvalSteps = (Array.isArray(approval?.steps) ? approval.steps : [])
    .slice()
    .sort((a: any, b: any) => {
      const sortCompare = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (sortCompare !== 0) return sortCompare;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
  const instanceMeta = getApprovalStatusMeta(approval?.status);
  const currentApprovers = Array.isArray(approval?.current_approvers)
    ? approval.current_approvers.filter(Boolean).join("、")
    : "";
  const approvalNodeGroups = groupChangeOrderApprovalSteps(approvalSteps);
  const currentNodeGroup = approvalNodeGroups.find((group) => group.steps.some((step: any) => step.status === "pending"));
  const currentNodePendingCount = currentNodeGroup?.steps.filter((step: any) => step.status === "pending").length || 0;
  const currentNodeHint = currentNodeGroup
    ? `${currentNodeGroup.nodeName} · ${currentNodeGroup.approveMode === "all" ? "全部人审批" : `${currentNodePendingCount || currentNodeGroup.steps.length}人中任一审批`}`
    : currentApprovers;
  const hasFlowNodes = Boolean(approval && approvalNodeGroups.length > 0);
  const flowName = approval?.flow_name || "手动内部审核";
  const orderStatus = String(order?.status || "");
  const approvedNodeCount = approvalNodeGroups.filter((group) => {
    const nodeStatus = getChangeOrderApprovalNodeStatus(group.steps, group.approveMode);
    return nodeStatus === "approved" || nodeStatus === "skipped";
  }).length;
  const manualReviewStatus = orderStatus === "APPROVED"
    ? "approved"
    : orderStatus === "REJECTED"
      ? "rejected"
      : orderStatus === "CANCELLED"
        ? "skipped"
        : "pending";
  const manualProgressText = manualReviewStatus === "approved" || manualReviewStatus === "skipped" ? "1/1" : "0/1";
  const progressText = approval ? `${approvedNodeCount}/${approvalNodeGroups.length || approval.total_nodes || 0}` : manualProgressText;
  const manualReviewerName = orderStatus === "APPROVED"
    ? (order?.approved_by_name || "内部审核")
    : (currentUserName || "当前登录账号");
  const manualReviewCaption = orderStatus === "APPROVED"
    ? "已完成内部审核"
    : orderStatus === "REJECTED"
      ? (order?.rejected_reason || "内部审核驳回")
      : orderStatus === "CANCELLED"
        ? "变更单已作废"
        : "等待处理";
  const manualReviewTime = orderStatus === "APPROVED" ? order?.approved_at : orderStatus === "REJECTED" || orderStatus === "CANCELLED" ? order?.updated_at : "";

  return (
    <section className={changeOrderStyles.approvalFlow}>
      <div className={changeOrderStyles.approvalBody}>
        {approval && approvalSteps.length === 0 ? (
          <div className={changeOrderStyles.approvalEmpty}>
            <AlertTriangle className="h-4 w-4" />
            <div>
              <p className="font-semibold">审批流程暂无节点</p>
              <p className="mt-0.5 text-xs">请检查分公司变更单审批流配置。</p>
            </div>
          </div>
        ) : hasFlowNodes ? (
          <div className={changeOrderStyles.approvalTimelineStack}>
            {approvalNodeGroups.map((group, index) => {
              const nodeStatus = getChangeOrderApprovalNodeStatus(group.steps, group.approveMode);
              const nodeMeta = getApprovalStatusMeta(nodeStatus);
              const NodeIcon = nodeMeta.icon;
              const approveMode = group.approveMode === "all" ? "全部人审批" : "任一人审批";
              return (
                <article key={group.key} className={changeOrderStyles.approvalTimelineItem} data-status={nodeStatus}>
                  <div className={changeOrderStyles.approvalTimelineRail}>
                    <span className={`${changeOrderStyles.approvalNodeIcon} ${nodeMeta.dotClassName}`}>
                      <NodeIcon className="h-3 w-3" />
                    </span>
                    {index < approvalNodeGroups.length - 1 && <span className={changeOrderStyles.approvalConnectorLine} />}
                  </div>
                  <div className={changeOrderStyles.approvalNodePanel}>
                    <div className={changeOrderStyles.approvalNodeHeader}>
                      <div className={changeOrderStyles.approvalNodeTitleRow}>
                        <p className={changeOrderStyles.approvalNodeTitle} title={group.nodeName}>{index + 1}. {group.nodeName}</p>
                        <span className={`${changeOrderStyles.approvalNodeStatus} ${nodeMeta.className}`}>{nodeMeta.label}</span>
                      </div>
                      <span className={changeOrderStyles.approvalNodeMode}>{approveMode}</span>
                    </div>
                    <div className={changeOrderStyles.approverList}>
                      {group.steps.map((step: any) => {
                        const stepMeta = getApprovalStatusMeta(step.status);
                        const displayStatus = step.status === "skipped" && group.approveMode === "any" && nodeStatus === "approved" ? "无需处理" : stepMeta.label;
                        const approverName = step.approver_name || "审批人";
                        const timingText = step.action_at
                          ? `处理时间 ${formatDateTime(step.action_at)}`
                          : step.status === "pending"
                            ? "等待当前审批人处理"
                            : "尚未到达该审批人";
                        return (
                          <div key={step.id} className={changeOrderStyles.approverRow}>
                            <ApprovalUserAvatar name={approverName} avatar={step.approver_avatar || step.approverAvatar} pending={step.status === "pending"} />
                            <div className={changeOrderStyles.approverInfo}>
                              <div className={changeOrderStyles.approverMainLine}>
                                <span className={changeOrderStyles.approverName}>{approverName}</span>
                                <span className={`${changeOrderStyles.approverStatus} ${stepMeta.className}`}>{displayStatus}</span>
                              </div>
                              <p className={changeOrderStyles.approverTime}>{timingText}</p>
                              {(step.comment || step.action_at) && (
                                <div className={changeOrderStyles.approvalSignatureLine}>
                                  <ApprovalSignaturePreview step={step} compact />
                                </div>
                              )}
                              {step.comment && <p className={changeOrderStyles.approvalCommentText}>审批意见：{step.comment}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={changeOrderStyles.manualApproval}>
            {(() => {
              const meta = getApprovalStatusMeta(manualReviewStatus);
              const StepIcon = meta.icon;
              return (
                <div className={changeOrderStyles.approvalTimelineItem} data-status={manualReviewStatus}>
                  <div className={changeOrderStyles.approvalTimelineRail}>
                    <span className={`${changeOrderStyles.approvalNodeIcon} ${meta.dotClassName}`}>
                      <StepIcon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className={changeOrderStyles.approvalNodePanel}>
                    <div className={changeOrderStyles.approvalNodeHeader}>
                      <div className={changeOrderStyles.approvalNodeTitleRow}>
                        <p className={changeOrderStyles.approvalNodeTitle} title={manualReviewerName}>{manualReviewerName}</p>
                        <span className={`${changeOrderStyles.approvalNodeStatus} ${meta.className}`}>{meta.label}</span>
                      </div>
                      <span className={changeOrderStyles.approvalNodeMode}>内部审核</span>
                    </div>
                    <div className={changeOrderStyles.approverList}>
                      <div className={changeOrderStyles.approverRow}>
                        <ApprovalUserAvatar name={manualReviewerName} />
                        <div className={changeOrderStyles.approverInfo}>
                          <div className={changeOrderStyles.approverMainLine}>
                            <span className={changeOrderStyles.approverName}>{manualReviewerName}</span>
                            <span className={`${changeOrderStyles.approverStatus} ${meta.className}`}>{meta.label}</span>
                          </div>
                          <p className={changeOrderStyles.approverTime}>{manualReviewTime ? `处理时间 ${formatDateTime(manualReviewTime)}` : manualReviewCaption}</p>
                          <p className={changeOrderStyles.approvalCommentText}>审批意见：{manualReviewCaption}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}

export function getValidChangeOrderItems(form: ChangeOrderForm) {
  return form.items
    .map((item) => ({
      ...item,
      change_type: normalizeChangeLineType(item.change_type),
      title: item.title.trim(),
      space: item.space.trim(),
      phase: item.phase.trim(),
      description: item.description.trim(),
      unit_price: Math.max(0, Number(item.unit_price || 0) || 0),
      quantity: Math.max(0, Number(item.quantity || 0) || 0),
      unit: item.unit.trim() || "项",
      amount: getChangeOrderLineAmount(item),
      cost_estimate: Math.max(0, Number(item.cost_estimate || 0) || 0),
    }))
    .filter((item) => item.title);
}

export function getChangeOrderAddAmount(order: any) {
  return getChangeOrderAddAmountFromItems(parseChangeOrderItems(order));
}

export function getChangeOrderDeductAmount(order: any) {
  return getChangeOrderDeductAmountFromItems(parseChangeOrderItems(order));
}

export function getChangeOrderNetAddAmount(order: any) {
  return roundMoney(Math.max(0, getChangeOrderAddAmount(order) - getChangeOrderDiscountAmount(order)));
}

export function getChangeOrderTypeTitle(order: any) {
  const addAmount = getChangeOrderAddAmount(order);
  const deductAmount = getChangeOrderDeductAmount(order);
  if (addAmount > 0 && deductAmount > 0) return "增减项";
  return deductAmount > 0 ? "减项" : "增项";
}
