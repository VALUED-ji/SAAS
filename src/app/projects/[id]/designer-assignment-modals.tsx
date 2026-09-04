// 客户详情页设计师分配弹窗模块
// 从 page.tsx 渐进拆出的设计师分配流程与团队选择组件。

"use client";

import { Briefcase, Building2, CheckCircle2, CircleCheck, CircleDashed, CircleX, Clock, Loader2, Search, User, X } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import NativeImage from "@/components/ui/NativeImage";

const roleLabels: Record<string, string> = {
  OWNER: "负责人", PM: "项目经理", DESIGNER: "设计师",
  SALES: "销售顾问", ADVISOR: "家装顾问", WORKER: "施工员", ADMIN: "施工人员", FINANCE: "财务",
};
type TeamPickerMember = {
  id: string;
  name: string;
  avatar?: string | null;
  role?: string | null;
  employee_no?: string | null;
  org_unit_name?: string | null;
  project_count?: number | null;
};
type DesignerAssignmentFlowStep = {
  title: string;
  personLabel: string;
  personValue: string;
  personHint?: string;
  detailLabel: string;
  detailValue: string;
  timeLabel: string;
  timeValue: string;
  state: "done" | "rejected" | "current" | "pending";
};
export function DesignerAssignmentFlowModal({
  request,
  canAssign = false,
  canDispatch = false,
  onAssign,
  onDispatch,
  onClose,
}: {
  request: any;
  canAssign?: boolean;
  canDispatch?: boolean;
  onAssign?: () => void;
  onDispatch?: () => void;
  onClose: () => void;
}) {
  const status = String(request?.status || "").toLowerCase();
  const completed = status === "completed" || status === "approved";
  const rejected = status === "rejected";
  const dispatchWorkflow = String(request?.workflow_mode || "") === "dispatch";
  const waitingForDispatch = dispatchWorkflow && status === "pending_dispatch";
  const waitingForHandler = dispatchWorkflow && status === "pending_handler";
  const pending = ["pending", "pending_dispatch", "pending_handler"].includes(status);
  const rawApproverNames = Array.isArray(request?.approver_names)
    ? request.approver_names
    : String(request?.approver_name || "")
      .split("、")
      .filter(Boolean);
  const approverNames = rawApproverNames
    .map((name: unknown) => String(name || "").trim())
    .filter(Boolean);
  const dispatcherLabel = request?.dispatcher_label || "客户所属门店负责人";
  const currentApproverName = approverNames.join("、") || request?.approver_name || "派单处理人";
  const currentApproverTitle = pending && approverNames.length > 1
    ? `${approverNames[0]}等${approverNames.length}人`
    : currentApproverName;
  const requesterName = request?.requester_name || "申请人";
  const preferredDesignerName = request?.preferred_designer_name || "";
  const assignedDesignerName = request?.assigned_user_name || "";
  const handlerName = request?.handler_name || "";
  const dispatcherName = request?.dispatched_by_name || "";
  const resolverName = request?.resolved_by_name || request?.handler_name || currentApproverName;
  const storeName = request?.store_name || request?.service_store || "客户所属门店";
  const headerStatus = completed
    ? { label: "已完成", className: "bg-emerald-50 text-emerald-700 ring-emerald-100" }
    : rejected
      ? { label: "已驳回", className: "bg-red-50 text-red-700 ring-red-100" }
      : { label: waitingForDispatch ? "待分派" : waitingForHandler ? "待处理人分配" : "审批中", className: "bg-amber-50 text-amber-700 ring-amber-100" };
  const submittedStep: DesignerAssignmentFlowStep = {
    title: "提交申请",
    personLabel: "申请人",
    personValue: requesterName,
    detailLabel: "申请内容",
    detailValue: preferredDesignerName ? `指定意向设计师：${preferredDesignerName}` : "未指定意向设计师，由处理人确定",
    timeLabel: "提交时间",
    timeValue: request?.created_at ? formatDateTime(request.created_at) : "-",
    state: "done",
  };
  const approvalFlowSteps: DesignerAssignmentFlowStep[] = [
    submittedStep,
    {
      title: completed ? "完成分配" : rejected ? "申请已驳回" : `等待${dispatcherLabel}分配设计师`,
      personLabel: completed || rejected ? "处理人" : approverNames.length > 1 ? "可处理人" : dispatcherLabel,
      personValue: completed || rejected
        ? String(resolverName)
        : currentApproverName,
      personHint: pending && approverNames.length > 1 ? `任意一位${dispatcherLabel}均可处理` : "",
      detailLabel: completed || rejected ? "处理结果" : "处理后",
      detailValue: completed
        ? assignedDesignerName
          ? `已分配给 ${assignedDesignerName}，并已加入服务团队`
          : "设计师已完成分配，并已加入服务团队"
        : rejected
          ? "本次设计师分配申请已驳回"
          : "分配完成后，设计师会自动加入服务团队",
      timeLabel: request?.resolved_at ? "处理时间" : pending ? "当前状态" : "处理时间",
      timeValue: request?.resolved_at ? formatDateTime(request.resolved_at) : pending ? "等待处理" : "-",
      state: completed ? "done" : rejected ? "rejected" : "current",
    },
  ];
  const dispatchFlowSteps: DesignerAssignmentFlowStep[] = rejected
    ? [
      submittedStep,
      {
        title: "申请已驳回",
        personLabel: "处理人",
        personValue: resolverName,
        detailLabel: "处理结果",
        detailValue: "本次设计师分配申请已驳回",
        timeLabel: request?.resolved_at ? "处理时间" : "当前状态",
        timeValue: request?.resolved_at ? formatDateTime(request.resolved_at) : "已结束",
        state: "rejected",
      },
    ]
    : completed && !handlerName
      ? [
        submittedStep,
        {
          title: `${dispatcherLabel}直接分配设计师`,
          personLabel: "处理人",
          personValue: resolverName,
          detailLabel: "处理结果",
          detailValue: assignedDesignerName ? `已分配给 ${assignedDesignerName}，并已加入服务团队` : "设计师已完成分配，并已加入服务团队",
          timeLabel: "处理时间",
          timeValue: request?.resolved_at ? formatDateTime(request.resolved_at) : "-",
          state: "done",
        },
      ]
      : [
        submittedStep,
        {
          title: `${dispatcherLabel}分派处理人`,
          personLabel: waitingForDispatch ? (approverNames.length > 1 ? "可处理人" : "当前处理人") : "分派人",
          personValue: waitingForDispatch ? currentApproverName : dispatcherName || currentApproverName,
          personHint: waitingForDispatch && approverNames.length > 1 ? `任意一位${dispatcherLabel}均可处理` : "",
          detailLabel: waitingForDispatch ? "可选操作" : "分派结果",
          detailValue: waitingForDispatch
            ? "可直接分配设计师，或从本分公司在职员工中分派一位处理人"
            : `已分派给 ${handlerName || "指定处理人"} 继续分配设计师`,
          timeLabel: request?.dispatched_at ? "分派时间" : waitingForDispatch ? "当前状态" : "分派时间",
          timeValue: request?.dispatched_at ? formatDateTime(request.dispatched_at) : waitingForDispatch ? `等待${dispatcherLabel}分派` : "-",
          state: waitingForDispatch ? "current" : "done",
        },
        {
          title: completed ? "完成分配设计师" : "处理人分配设计师",
          personLabel: completed ? "处理人" : "当前处理人",
          personValue: completed ? resolverName : handlerName || "待分派",
          detailLabel: completed ? "处理结果" : "完成后",
          detailValue: completed
            ? assignedDesignerName ? `已分配给 ${assignedDesignerName}，并已加入服务团队` : "设计师已完成分配，并已加入服务团队"
            : "分配完成后，设计师会自动加入服务团队",
          timeLabel: request?.resolved_at ? "处理时间" : waitingForHandler ? "当前状态" : "处理时间",
          timeValue: request?.resolved_at ? formatDateTime(request.resolved_at) : waitingForHandler ? "等待分配" : `待${dispatcherLabel}分派`,
          state: completed ? "done" : waitingForHandler ? "current" : "pending",
        },
      ];
  const flowSteps: DesignerAssignmentFlowStep[] = dispatchWorkflow ? dispatchFlowSteps : approvalFlowSteps;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/32 p-4 backdrop-blur-[1px]">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[820px] flex-col overflow-hidden rounded-[12px] border border-[#dce4ef] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.13)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-[#182230]">{dispatchWorkflow ? "设计师分配流程" : "设计师分配审批流"}</h3>
              <span className={`rounded-[8px] px-2.5 py-1 text-xs font-medium ring-1 ${headerStatus.className}`}>
                {headerStatus.label}
              </span>
            </div>
            <p className="mt-1 text-sm leading-5 text-[#667085]">
              {waitingForDispatch
                ? `当前等待${currentApproverTitle}直接分配设计师或分派处理人`
                : waitingForHandler
                  ? `已分派给 ${handlerName || "指定处理人"}，等待其分配设计师`
                  : pending
                    ? approverNames.length > 1
                      ? `当前可由${currentApproverTitle}中的任意一人处理`
                      : `当前卡在 ${currentApproverName}，等待分配设计师`
                    : completed ? "设计师已完成分配" : "设计师分配申请已结束"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#dce4ef] bg-white text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230]"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#f6f8fb] px-5 py-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3.5 py-3">
              <p className="text-xs font-medium text-[#8a97a8]">所属门店</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#182230]">{storeName}</p>
            </div>
            <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3.5 py-3">
              <p className="text-xs font-medium text-[#8a97a8]">{waitingForHandler ? "当前处理人" : pending && approverNames.length > 1 ? `可处理人（${dispatcherLabel}）` : dispatcherLabel}</p>
              <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#182230]">{waitingForHandler ? handlerName || "待分派" : currentApproverName}</p>
            </div>
            <div className="rounded-[10px] border border-[#e2e7ee] bg-white px-3.5 py-3">
              <p className="text-xs font-medium text-[#8a97a8]">意向设计师</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#182230]">{preferredDesignerName || "未指定"}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-[#e2e7ee] bg-white">
            <div className="border-b border-[#e2e7ee] px-4 py-3">
              <p className="text-sm font-semibold text-[#182230]">流程进度</p>
              <p className="mt-0.5 text-xs text-[#667085]">查看申请提交、分派与设计师分配状态。</p>
            </div>
            <div className="space-y-3 p-4">
              {flowSteps.map((step, index) => {
                const stepMeta = step.state === "done"
                  ? { icon: CircleCheck, tone: "emerald", dot: "border-emerald-200 bg-emerald-50 text-emerald-700", tag: "text-emerald-700 bg-emerald-50 ring-emerald-100", panel: "border-[#dcebe2] bg-[#fcfffd]", label: "已完成" }
                  : step.state === "rejected"
                    ? { icon: CircleX, tone: "red", dot: "border-red-200 bg-red-50 text-red-700", tag: "text-red-700 bg-red-50 ring-red-100", panel: "border-red-200 bg-[#fffafa]", label: "已驳回" }
                    : step.state === "current"
                      ? { icon: Clock, tone: "amber", dot: "border-amber-200 bg-amber-50 text-amber-700", tag: "text-amber-700 bg-amber-50 ring-amber-100", panel: "border-amber-200 bg-[#fffdf7]", label: "等待处理" }
                      : { icon: CircleDashed, tone: "slate", dot: "border-[#d5dae1] bg-[#f2f4f7] text-[#98a2b3]", tag: "text-[#667085] bg-[#f2f4f7] ring-[#e2e7ee]", panel: "border-[#e2e7ee] bg-[#fbfcfe]", label: "未完成" };
                const StepIcon = stepMeta.icon;
                return (
                  <div key={step.title} className={`rounded-[10px] border px-4 py-3 ${stepMeta.panel}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border ${stepMeta.dot}`}>
                          <StepIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[#182230]">{index + 1}. {step.title}</p>
                            <span className={`rounded-[7px] px-2 py-0.5 text-[11px] font-medium ring-1 ${stepMeta.tag}`}>
                              {stepMeta.label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#667085]">
                            <span className="mr-1 text-[#8a97a8]">{step.timeLabel}</span>
                            <span className="tabular-nums text-[#52647b]">{step.timeValue}</span>
                          </p>
                        </div>
                      </div>
                      {step.state === "current" && <span className="hidden h-2 w-2 shrink-0 rounded-full bg-amber-500 sm:block" />}
                    </div>
                    <div className="mt-3 grid overflow-hidden rounded-[8px] border border-[#e2e7ee] bg-white sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                      <div className="min-w-0 border-b border-[#e2e7ee] px-3 py-2.5 sm:border-b-0 sm:border-r">
                        <p className="text-[11px] font-medium text-[#8a97a8]">{step.personLabel}</p>
                        <p className="mt-1 break-words text-sm font-semibold text-[#182230]">{step.personValue}</p>
                        {step.personHint && <p className="mt-1 text-xs font-medium text-amber-700">{step.personHint}</p>}
                      </div>
                      <div className="min-w-0 px-3 py-2.5">
                        <p className="text-[11px] font-medium text-[#8a97a8]">{step.detailLabel}</p>
                        <p className="mt-1 break-words text-sm font-medium leading-5 text-[#52647b]">{step.detailValue}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#e2e7ee] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          {(canAssign || canDispatch) && pending ? (
            <p className="min-w-0 flex-1 text-xs leading-5 text-[#667085]">
              {canDispatch
                ? `你是本次${dispatcherLabel}，可以直接分配设计师，或先分派一位处理人继续办理。`
                : waitingForHandler
                  ? "你是本次申请的指定处理人，可以分配设计师完成申请。"
                  : `你是本次${dispatcherLabel}，可以直接分配设计师完成本次申请。`}
            </p>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 flex-nowrap justify-end gap-2">
            <button className="btn-secondary min-h-10 shrink-0 whitespace-nowrap text-sm" onClick={onClose}>{(canAssign || canDispatch) && pending ? "稍后处理" : "知道了"}</button>
            {canDispatch && pending && onDispatch && (
              <button className="btn-secondary min-h-10 shrink-0 whitespace-nowrap text-sm" onClick={onDispatch}>分派处理人</button>
            )}
            {canAssign && pending && (
              <button className="btn-primary min-h-10 shrink-0 whitespace-nowrap text-sm" onClick={onAssign}>{canDispatch ? "直接分配设计师" : "分配设计师"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamMemberPickerPanel({
  members,
  loading,
  error,
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
  roleOptions,
  selectedUserId,
  onSelect,
  total,
  hasMore,
  actionHint = "点击人员卡片选择",
  emptyTitle,
  emptyDescription,
}: {
  members: TeamPickerMember[];
  loading: boolean;
  error: string;
  query: string;
  onQueryChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  roleOptions: Array<{ value: string; label: string }>;
  selectedUserId: string;
  onSelect: (value: string) => void;
  total: number;
  hasMore: boolean;
  actionHint?: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-10 w-full rounded-[8px] border border-[#d5dae1] bg-white pl-9 pr-3 text-[13px] text-[#182230] outline-none transition placeholder:text-[#98a2b3] hover:border-[#c5cfdc] focus:border-[#2f6feb] focus:ring-2 focus:ring-[#2f6feb]/12"
          placeholder="搜索姓名 / 工号 / 手机号 / 组织"
        />
      </div>

      {roleOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {roleOptions.map((option) => {
            const active = roleFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onRoleFilterChange(option.value)}
                className={`inline-flex h-8 items-center justify-center rounded-[8px] border px-3 text-xs font-medium transition ${
                  active
                    ? "border-[#b8d1ff] bg-[#edf4ff] text-[#2f6feb]"
                    : "border-[#e2e7ee] bg-white text-[#667085] hover:border-[#cfe0ff] hover:bg-[#fbfdff] hover:text-[#2f6feb]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between rounded-[8px] border border-[#e2e7ee] bg-[#f8fafc] px-3 py-2 text-xs font-medium text-[#667085]">
        <span>{loading ? "正在查找人员..." : `共 ${total} 人`}</span>
        <span>{hasMore ? "仅显示前 50 条，请继续输入关键词缩小范围" : actionHint}</span>
      </div>

      <div className="h-[330px] overflow-y-auto rounded-[10px] border border-[#e2e7ee] bg-[#f8fafc] p-2">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center text-sm font-medium text-[#667085]">
            <Loader2 className="mb-3 h-6 w-6 animate-spin text-[#2f6feb]" />
            正在加载人员
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center rounded-[8px] border border-red-100 bg-red-50 px-4 text-center text-sm font-medium text-red-600">
            {error}
          </div>
        ) : members.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-[8px] border border-dashed border-[#dce4ef] bg-white px-6 text-center">
            <User className="mb-3 h-8 w-8 text-[#b8c5d8]" />
            <p className="text-sm font-semibold text-[#475467]">{emptyTitle}</p>
            <p className="mt-1 text-xs leading-5 text-[#8a97a8]">{emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {members.map((member) => {
              const selected = selectedUserId === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(member.id)}
                  className={`group flex w-full items-center gap-3 rounded-[9px] border px-3 py-2.5 text-left transition ${
                    selected
                      ? "border-[#b8d1ff] bg-[#edf4ff]"
                      : "border-[#edf0f4] bg-white hover:border-[#cfe0ff] hover:bg-[#fbfdff]"
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-sm font-semibold ring-1 ring-inset ${
                    selected
                      ? "bg-white text-[#2f6feb] ring-[#b8d1ff]"
                      : "bg-[#f1f5f9] text-[#52647b] ring-[#e2e7ee]"
                  }`}>
                    {member.avatar ? (
                      <NativeImage src={member.avatar} alt={`${member.name || "人员"}头像`} className="h-full w-full object-cover" />
                    ) : (
                      (member.name || "?")[0]
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[#182230]">{member.name}</span>
                      <span className="shrink-0 rounded-[7px] border border-[#dce4ef] bg-white px-2 py-0.5 text-[11px] font-medium text-[#52647b]">
                        {roleLabels[String(member.role || "")] || member.role || "未设置岗位"}
                      </span>
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#7c8aa0]">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{member.org_unit_name || "未分配组织"}</span>
                      </span>
                      {member.employee_no && <span>工号：{member.employee_no}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        在施工地 {Number(member.project_count || 0)}
                      </span>
                    </span>
                  </span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                    selected
                      ? "border-[#2f6feb] bg-[#2f6feb] text-white"
                      : "border-[#d5dae1] bg-white text-transparent group-hover:border-[#cfe0ff]"
                  }`}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

