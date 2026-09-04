export const customerActionOptions: Record<string, string[]> = {
  NEW: ["待首次联系", "电话未接", "微信待添加", "资料待补充"],
  CONTACTED: ["需求确认中", "已加微信", "等待客户回复", "预算初步确认"],
  INVITED: ["邀约到店", "邀约上门", "预约量房", "已到店", "已上门", "爽约", "改期"],
  MEASURED: ["量房资料整理", "方案制作中", "等待设计沟通", "设计师已对接"],
  DEPOSITED: ["定金已收", "定金待确认", "收据待开", "方案深化中", "等待报价"],
  PROPOSAL: ["已发报价", "等待反馈", "方案修改中", "价格谈判中", "合同准备中"],
  SIGNED: ["合同归档", "准备开工", "已交接项目"],
  LOST: ["价格不合适", "已选同行", "需求取消", "联系不上", "暂缓装修", "区域不匹配"],
};

export const allCustomerActions = Array.from(new Set(Object.values(customerActionOptions).flat()));

export function getCustomerActionOptions(status?: string | null) {
  return status ? customerActionOptions[status] ?? [] : [];
}

export function isValidCustomerAction(status?: string | null, action?: string | null) {
  if (!action) return true;
  return getCustomerActionOptions(status).includes(action);
}
