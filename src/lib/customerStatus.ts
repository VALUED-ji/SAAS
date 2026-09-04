export const customerStatusFlow = [
  { value: "NEW", label: "新线索", description: "刚进入系统，等待首次有效触达" },
  { value: "CONTACTED", label: "已联系", description: "已电话或微信沟通，确认装修需求" },
  { value: "INVITED", label: "已到店", description: "已有到店跟进记录，继续推进量房和方案沟通" },
  { value: "MEASURED", label: "已量房", description: "已完成量房，准备方案与预算" },
  { value: "DEPOSITED", label: "已交定金", description: "已收定金，方案和报价进入正式推进" },
  { value: "PROPOSAL", label: "方案报价", description: "方案、预算、报价沟通中" },
  { value: "SIGNED", label: "签约客户", description: "已签正式合同，进入交付准备" },
  { value: "LOST", label: "失败/流失", description: "明确不合作、联系不上或暂缓装修" },
] as const;

export type CustomerStatus = (typeof customerStatusFlow)[number]["value"];

export const customerStatusLabels = customerStatusFlow.reduce<Record<string, string>>((labels, item) => {
  labels[item.value] = item.label;
  return labels;
}, {});

export const legacyCustomerStatusMap: Record<string, CustomerStatus> = {
  VISITED: "MEASURED",
  QUOTED: "PROPOSAL",
};

export function normalizeCustomerStatus(status?: string | null): CustomerStatus {
  if (!status) return "NEW";
  return legacyCustomerStatusMap[status] ?? (customerStatusLabels[status] ? (status as CustomerStatus) : "NEW");
}
