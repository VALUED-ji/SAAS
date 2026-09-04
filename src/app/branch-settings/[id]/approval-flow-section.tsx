// 分公司设置-审批流程区块组件
// 从 page.tsx 渐进拆出的审批流程配置区块。

"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import SystemSelect from "@/components/ui/SystemSelect";
import { CheckField } from "./branch-settings-fields";
import type { ApprovalFlow, ApprovalNode } from "@/lib/branchSettings";
import {
  RoleOption,
  UserOption,
  approverSourceLabels,
  approverSourceOptions,
  defaultFlowName,
  flowTypeLabels,
  flowTypeOptions,
} from "./branch-settings-approval-shared";
export function ApprovalFlowSection({
  flows,
  roles,
  users,
  onChange,
}: {
  flows: ApprovalFlow[];
  roles: RoleOption[];
  users: UserOption[];
  onChange: (flows: ApprovalFlow[]) => void;
}) {
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [movingNode, setMovingNode] = useState<{ id: string; direction: -1 | 1 } | null>(null);
  const [flowNotice, setFlowNotice] = useState("");
  const roleMap = useMemo(() => new Map(roles.map((role) => [role.code, role.name])), [roles]);
  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId) || null;
  const usedFlowTypes = useMemo(() => new Set(flows.map((flow) => flow.type)), [flows]);
  const unusedFlowTypeOptions = useMemo(
    () => flowTypeOptions.filter((option) => !usedFlowTypes.has(option.value as ApprovalFlow["type"])),
    [usedFlowTypes]
  );

  useEffect(() => {
    if (selectedFlowId && !flows.some((flow) => flow.id === selectedFlowId)) setSelectedFlowId("");
  }, [flows, selectedFlowId]);

  useEffect(() => {
    if (!flowNotice) return;
    const timer = window.setTimeout(() => setFlowNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [flowNotice]);

  const updateFlow = (flowId: string, patch: Partial<ApprovalFlow>) => {
    onChange(flows.map((flow) => flow.id === flowId ? { ...flow, ...patch } : flow));
  };

  const updateFlowType = (flow: ApprovalFlow, type: ApprovalFlow["type"]) => {
    if (flows.some((item) => item.id !== flow.id && item.type === type)) {
      setFlowNotice(`「${flowTypeLabels[type] || "该审批类型"}」已经存在，同类型审批只能配置一条`);
      return;
    }
    updateFlow(flow.id, {
      type,
      name: defaultFlowName(type),
      isDefault: true,
    });
  };

  const addFlow = () => {
    const firstUnusedType = unusedFlowTypeOptions[0]?.value as ApprovalFlow["type"] | undefined;
    if (!firstUnusedType) {
      setFlowNotice("所有审批类型都已配置，同类型审批只能配置一条");
      return;
    }
    const nextFlow = {
      id: `FLOW_${Date.now()}`,
      name: defaultFlowName(firstUnusedType),
      type: firstUnusedType,
      isEnabled: true,
      isDefault: true,
      thresholdAmount: 0,
      nodes: [],
    };
    onChange([
      ...flows,
      nextFlow,
    ]);
    setSelectedFlowId(nextFlow.id);
  };

  const duplicateFlow = (flow: ApprovalFlow) => {
    const firstUnusedType = unusedFlowTypeOptions[0]?.value as ApprovalFlow["type"] | undefined;
    if (!firstUnusedType) {
      setFlowNotice("没有可用的审批类型，无法继续复制");
      return;
    }
    const nextFlow = {
      ...flow,
      id: `FLOW_${Date.now()}`,
      name: defaultFlowName(firstUnusedType),
      type: firstUnusedType,
      isDefault: true,
      nodes: flow.nodes.map((node, index) => ({ ...node, id: `NODE_${Date.now()}_${index}` })),
    };
    onChange([
      ...flows,
      nextFlow,
    ]);
    setSelectedFlowId(nextFlow.id);
  };

  const deleteFlow = (flowId: string) => {
    onChange(flows.filter((flow) => flow.id !== flowId));
  };

  const setDefaultFlow = (flowId: string, type: ApprovalFlow["type"]) => {
    onChange(flows.map((flow) => flow.type === type ? { ...flow, isDefault: flow.id === flowId } : flow));
  };

  const getFlowTypeOptionsForFlow = (flow: ApprovalFlow) => (
    flowTypeOptions.filter((option) => option.value === flow.type || !usedFlowTypes.has(option.value as ApprovalFlow["type"]))
  );

  const updateNode = (flowId: string, nodeId: string, patch: Partial<ApprovalNode>) => {
    onChange(flows.map((flow) => flow.id === flowId ? {
      ...flow,
      nodes: flow.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node),
    } : flow));
  };

  const updateNodeSource = (flowId: string, node: ApprovalNode, approverSource: ApprovalNode["approverSource"]) => {
    updateNode(flowId, node.id, {
      approverSource,
      roleCode: approverSource === "direct_user" || approverSource === "initiator_manager" ? "" : node.roleCode || roles[0]?.code || "",
      userId: approverSource === "direct_user" ? node.userId || users[0]?.id : undefined,
    });
  };

  const addNode = (flowId: string) => {
    onChange(flows.map((flow) => flow.id === flowId ? {
      ...flow,
      nodes: [
        ...flow.nodes,
        {
          id: `NODE_${Date.now()}`,
          name: `审批节点 ${flow.nodes.length + 1}`,
          approverSource: "org_role",
          roleCode: roles[0]?.code || "",
          userId: undefined,
          approveMode: "any",
          canReject: true,
        },
      ],
    } : flow));
  };

  const moveNode = (flowId: string, nodeId: string, direction: -1 | 1) => {
    setMovingNode({ id: nodeId, direction });
    onChange(flows.map((flow) => {
      if (flow.id !== flowId) return flow;
      const index = flow.nodes.findIndex((node) => node.id === nodeId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= flow.nodes.length) return flow;
      const nodes = [...flow.nodes];
      [nodes[index], nodes[nextIndex]] = [nodes[nextIndex], nodes[index]];
      return { ...flow, nodes };
    }));
  };

  useEffect(() => {
    if (!movingNode) return;
    const timer = window.setTimeout(() => setMovingNode(null), 420);
    return () => window.clearTimeout(timer);
  }, [movingNode]);

  const deleteNode = (flowId: string, nodeId: string) => {
    onChange(flows.map((flow) => flow.id === flowId ? {
      ...flow,
      nodes: flow.nodes.filter((node) => node.id !== nodeId),
    } : flow));
  };

  return (
    <div className="branch-settings-panel branch-approval-workbench rounded-lg border border-surface-200/90 bg-white/95 p-5 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-surface-900">审批流程</p>
          <p className="mt-0.5 text-xs text-surface-500">同一种审批类型只允许配置一条，避免实际审批时产生歧义。</p>
        </div>
        <button type="button" className="btn-secondary" onClick={addFlow} disabled={unusedFlowTypeOptions.length === 0} title={unusedFlowTypeOptions.length === 0 ? "所有审批类型都已配置" : undefined}>
          <Plus className="h-4 w-4" />
          新增审批流
        </button>
      </div>

      {flowNotice && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
          {flowNotice}
        </div>
      )}

      <div className="space-y-4">
        {flows.map((flow) => {
          const expanded = selectedFlow?.id === flow.id;
          return (
            <div key={flow.id} className={`overflow-hidden rounded-lg border bg-white transition-shadow ${expanded ? "border-primary-100 shadow-[0_14px_30px_rgba(31,41,53,0.08)]" : "border-surface-200"}`}>
              <div className="flex flex-col gap-3 border-b border-surface-100 px-4 py-3 xl:flex-row xl:items-center">
                <button
                  type="button"
                  onClick={() => setSelectedFlowId(expanded ? "" : flow.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700"
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4 rotate-90" />}
                </button>

                <input
                  value={flow.name}
                  onChange={(event) => updateFlow(flow.id, { name: event.target.value })}
                  className="input-field min-h-9 max-w-64 py-1.5 font-semibold"
                />
                <span className="shrink-0 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-600">
                  {flowTypeLabels[flow.type] || "自定义"}
                </span>
                {flow.isDefault && <span className="shrink-0 rounded-lg bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">默认</span>}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <SystemSelect value={flow.type} onChange={(event) => updateFlowType(flow, event.target.value as ApprovalFlow["type"])} className="input-field min-h-9 w-36 py-1.5 text-sm">
                    {getFlowTypeOptionsForFlow(flow).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </SystemSelect>
                  <CheckField label="启用" checked={flow.isEnabled} onChange={(value) => updateFlow(flow.id, { isEnabled: value })} />
                  <CheckField label="默认" checked={flow.isDefault} onChange={() => setDefaultFlow(flow.id, flow.type)} />
                  <button type="button" onClick={() => duplicateFlow(flow)} className="rounded-md border border-surface-200 bg-white p-2 text-surface-400 hover:bg-surface-50 hover:text-primary-600" title="复制节点到未配置的审批类型">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => deleteFlow(flow.id)} className="rounded-md border border-surface-200 bg-white p-2 text-surface-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="min-h-[520px] bg-white px-5 py-6">
                  <div className="mx-auto flex max-w-xl flex-col items-center">
                    <span className="rounded-full bg-emerald-500 px-5 py-2 text-xs font-semibold text-white shadow-sm">发起</span>
                    {flow.nodes.map((node, index) => {
                      const usesRole = node.approverSource !== "direct_user" && node.approverSource !== "initiator_manager";
                      const validRole = !usesRole || Boolean(node.roleCode && roleMap.has(node.roleCode));
                      const validUser = node.approverSource !== "direct_user" || Boolean(node.userId && users.some((user) => user.id === node.userId));
                      return (
                        <div
                          key={node.id}
                          className={`flex w-full flex-col items-center transition-all duration-300 ease-out ${
                            movingNode?.id === node.id
                              ? `${movingNode.direction === 1 ? "translate-y-3" : "-translate-y-3"} scale-[1.015]`
                              : "translate-y-0 scale-100"
                          }`}
                        >
                          <div className="flex h-8 flex-col items-center">
                            <div className="h-full w-px bg-surface-200" />
                            <ChevronDown className="-mt-3 h-4 w-4 text-surface-300" />
                          </div>
                          <div
                            className={`w-full rounded-lg border p-4 text-left transition-colors duration-300 shadow-[0_8px_18px_rgba(31,41,53,0.06)] ${
                              movingNode?.id === node.id
                                ? "border-primary-200 bg-primary-50/70"
                                : "border-surface-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <input
                                  value={node.name}
                                  onChange={(event) => updateNode(flow.id, node.id, { name: event.target.value })}
                                  className="w-full bg-transparent text-sm font-semibold text-surface-900 outline-none"
                                />
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <SystemSelect value={node.approverSource} onChange={(event) => updateNodeSource(flow.id, node, event.target.value as ApprovalNode["approverSource"])} className="rounded-md border border-surface-200 bg-surface-50 px-2 py-1 text-xs font-medium text-surface-600 outline-none">
                                    {approverSourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                                  </SystemSelect>
                                  {usesRole && (
                                    <SystemSelect value={node.roleCode} onChange={(event) => updateNode(flow.id, node.id, { roleCode: event.target.value })} className="rounded-md border border-surface-200 bg-surface-50 px-2 py-1 text-xs font-medium text-surface-600 outline-none">
                                      <option value="">未选择角色</option>
                                      {roles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}
                                    </SystemSelect>
                                  )}
                                  {node.approverSource === "direct_user" && (
                                    <SystemSelect value={node.userId || ""} onChange={(event) => updateNode(flow.id, node.id, { userId: event.target.value })} className="rounded-md border border-surface-200 bg-surface-50 px-2 py-1 text-xs font-medium text-surface-600 outline-none">
                                      <option value="">未选择员工</option>
                                      {users.map((user) => <option key={user.id} value={user.id}>{user.name}（{roleMap.get(user.role) || user.role}{user.org_unit_name ? ` / ${user.org_unit_name}` : ""}）</option>)}
                                    </SystemSelect>
                                  )}
                                  {node.approverSource === "initiator_manager" && (
                                    <span className="rounded-md border border-surface-200 bg-surface-50 px-2 py-1 text-xs font-medium text-surface-600">
                                      系统按发起人组织关系自动解析
                                    </span>
                                  )}
                                  <SystemSelect value={node.approveMode} onChange={(event) => updateNode(flow.id, node.id, { approveMode: event.target.value as ApprovalNode["approveMode"] })} className="rounded-md border border-primary-100 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 outline-none">
                                    <option value="any">任一人审批</option>
                                    <option value="all">全部人审批</option>
                                  </SystemSelect>
                                  <CheckField label="可驳回" checked={node.canReject} onChange={(value) => updateNode(flow.id, node.id, { canReject: value })} />
                                </div>
                                <div className="mt-2 text-xs text-surface-500">
                                  {approverSourceLabels[node.approverSource]}{usesRole && node.roleCode ? ` · ${roleMap.get(node.roleCode) || node.roleCode}` : ""}
                                </div>
                                {!validRole && (
                                  <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    当前来源未配置有效角色，请检查角色配置
                                  </div>
                                )}
                                {!validUser && (
                                  <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    指定员工不存在或已停用，请重新选择
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button type="button" onClick={() => moveNode(flow.id, node.id, -1)} className="rounded p-1.5 text-surface-400 hover:bg-surface-100" disabled={index === 0}>
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => moveNode(flow.id, node.id, 1)} className="rounded p-1.5 text-surface-400 hover:bg-surface-100" disabled={index === flow.nodes.length - 1}>
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => deleteNode(flow.id, node.id)} className="rounded p-1.5 text-surface-400 hover:bg-red-50 hover:text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex h-8 flex-col items-center">
                      <div className="h-full w-px bg-surface-200" />
                      <ChevronDown className="-mt-3 h-4 w-4 text-surface-300" />
                    </div>
                    <span className="rounded-full bg-[#52647b] px-5 py-2 text-xs font-semibold text-white shadow-sm">完成</span>
                    <button type="button" onClick={() => addNode(flow.id)} className="mt-4 rounded-lg border border-dashed border-primary-200 bg-white px-5 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50">
                      + 添加审批节点
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {flows.length === 0 && <div className="rounded-lg border border-dashed border-surface-200 py-16 text-center text-sm text-surface-400">暂无审批流</div>}
      </div>
    </div>
  );
}

