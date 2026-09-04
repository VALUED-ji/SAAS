import { defaultQuotationSignatureLabels, normalizeQuotationSignatureLabels } from "@/lib/quotationPrintSettings";

export type DesignerAssignmentDispatcherSource = "store_manager" | "org_manager" | "role" | "user";

export type DesignerAssignmentDispatcher = {
  source: DesignerAssignmentDispatcherSource;
  orgUnitIds: string[];
  roleCodes: string[];
  userIds: string[];
};

export type BranchSettings = {
  basicInfo: {
    legalCompanyName: string;
    companyShortName: string;
    companyLogoUrl: string;
    companyBrandSubtitle: string;
    legalPersonName: string;
    managerName: string;
    contactPhone: string;
    businessLicenseNo: string;
    province: string;
    city: string;
    district: string;
    address: string;
  };
  collectionRules: {
    schemes: PaymentScheme[];
    paymentQrCodeUrl: string;
    paymentQrCodeName: string;
    paymentAccountName: string;
    paymentQrNote: string;
  };
  charging: {
    designFeeRate: number;
    projectManagementRate: number;
    depositRate: number;
    finalPaymentRate: number;
    liabilityInsuranceRate: number;
    taxRate: number;
  };
  approvalFlows: ApprovalFlow[];
  businessRules: {
    duplicateCustomerDays: number;
    customerProtectionDays: number;
    followUpTimeoutHours: number;
    autoLoseDays: number;
    requiredCustomerPhone: boolean;
    designerAssignmentMode: "direct" | "approval" | "dispatch";
    designerAssignmentDispatcher: DesignerAssignmentDispatcher;
  };
  siteRules: {
    dailyLogRequired: boolean;
    photoRequired: boolean;
    safetyCheckRequired: boolean;
    materialAcceptanceRequired: boolean;
    progressUpdateDays: number;
  };
  constructionTemplates: {
    templates: ConstructionTemplate[];
  };
  featureFlags: {
    customerImport: boolean;
    employeeImport: boolean;
    quotationModule: boolean;
    materialsModule: boolean;
    financeModule: boolean;
    constructionModule: boolean;
  };
  notifications: {
    followUpReminder: boolean;
    approvalReminder: boolean;
    paymentReminder: boolean;
    siteDelayReminder: boolean;
  };
  orderSettings: {
    auxiliaryTemplates: OrderTemplate[];
  };
  printSettings: {
    quotationLogoUrl: string;
    quotationSignatureLabels: string[];
  };
};

export type ApprovalFlow = {
  id: string;
  name: string;
  type: "quote" | "contract" | "deposit" | "discount" | "refund" | "payment" | "material" | "change_order" | "custom";
  isEnabled: boolean;
  isDefault: boolean;
  thresholdAmount: number;
  nodes: ApprovalNode[];
};

export function findDuplicateApprovalFlowType(flows: Array<Pick<ApprovalFlow, "type">>) {
  const seen = new Set<string>();
  for (const flow of flows) {
    const type = normalizeFlowType(flow.type);
    if (seen.has(type)) return type;
    seen.add(type);
  }
  return "";
}

export type ApprovalNode = {
  id: string;
  name: string;
  approverSource: "customer_team_role" | "project_team_role" | "org_role" | "direct_user" | "initiator_manager";
  roleCode: string;
  userId?: string;
  approveMode: "any" | "all";
  canReject: boolean;
};

export type PaymentStage = {
  id: string;
  name: string;
  ratio: number;
  trigger: string;
};

export type PaymentScheme = {
  id: string;
  name: string;
  isDefault: boolean;
  stages: PaymentStage[];
};

export type ConstructionStageAreaDuration = {
  id: string;
  minArea: number;
  maxArea: number | null;
  plannedDays: number;
  floorHeatingDays: number;
};

export type ConstructionProcessNodeType = "construction" | "acceptance";

export type ConstructionStandardImage = {
  id: string;
  url: string;
  caption: string;
};

export type ConstructionStandardItem = {
  id: string;
  description: string;
  images: ConstructionStandardImage[];
  required?: boolean;
  photoRequired?: boolean;
};

export type ConstructionNodeStandard = {
  description: string;
  descriptions: string[];
  images: ConstructionStandardImage[];
  standards: ConstructionStandardItem[];
};

export type ConstructionProcessNode = {
  id: string;
  name: string;
  type: ConstructionProcessNodeType;
  sortOrder: number;
  areaDurationRules: ConstructionStageAreaDuration[];
  constructionStandard: ConstructionNodeStandard;
  acceptanceStandard: ConstructionNodeStandard;
  logBroadcastScripts: string[];
  photoRequired: boolean;
  customerConfirmRequired: boolean;
  projectManagerConfirmRequired: boolean;
};

export type ConstructionTemplateStage = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  areaDurationRules: ConstructionStageAreaDuration[];
  processNodes: ConstructionProcessNode[];
};

export type ConstructionTemplate = {
  id: string;
  name: string;
  description: string;
  decorationType: string;
  isDefault: boolean;
  isEnabled: boolean;
  stages: ConstructionTemplateStage[];
};

export type OrderTemplateItem = {
  id: string;
  materialId: string;
  defaultQuantity: number;
  remark: string;
};

export type OrderTemplate = {
  id: string;
  name: string;
  warehouseSupplierId: string;
  isEnabled: boolean;
  items: OrderTemplateItem[];
};

const defaultApprovalFlows: ApprovalFlow[] = [
  {
    id: "FLOW_CONTRACT_STANDARD",
    name: "合同标准审批流",
    type: "contract",
    isEnabled: true,
    isDefault: true,
    thresholdAmount: 0,
    nodes: [
      { id: "NODE_STORE_MANAGER", name: "门店经理审批", approverSource: "org_role", roleCode: "STORE_MANAGER", approveMode: "any", canReject: true },
      { id: "NODE_FINANCE", name: "财务审批", approverSource: "org_role", roleCode: "FINANCE", approveMode: "any", canReject: true },
      { id: "NODE_BOSS", name: "老板审批", approverSource: "org_role", roleCode: "OWNER", approveMode: "any", canReject: true },
    ],
  },
  {
    id: "FLOW_QUOTE_STANDARD",
    name: "报价标准审批流",
    type: "quote",
    isEnabled: true,
    isDefault: true,
    thresholdAmount: 50000,
    nodes: [
      { id: "NODE_PM", name: "项目经理审批", approverSource: "project_team_role", roleCode: "PM", approveMode: "any", canReject: true },
      { id: "NODE_FINANCE", name: "财务审批", approverSource: "org_role", roleCode: "FINANCE", approveMode: "any", canReject: true },
    ],
  },
  {
    id: "FLOW_DEPOSIT_STANDARD",
    name: "收款审批流",
    type: "deposit",
    isEnabled: false,
    isDefault: true,
    thresholdAmount: 0,
    nodes: [
      { id: "NODE_FINANCE_DEPOSIT", name: "财务审批", approverSource: "org_role", roleCode: "FINANCE", approveMode: "any", canReject: true },
    ],
  },
  {
    id: "FLOW_DEPOSIT_REFUND_STANDARD",
    name: "退款审批流",
    type: "refund",
    isEnabled: false,
    isDefault: true,
    thresholdAmount: 0,
    nodes: [
      { id: "NODE_FINANCE_DEPOSIT_REFUND", name: "财务审批", approverSource: "org_role", roleCode: "FINANCE", approveMode: "any", canReject: true },
    ],
  },
  {
    id: "FLOW_CHANGE_ORDER_STANDARD",
    name: "变更单审批流",
    type: "change_order",
    isEnabled: false,
    isDefault: true,
    thresholdAmount: 0,
    nodes: [
      { id: "NODE_PM_CHANGE_ORDER", name: "项目经理审批", approverSource: "project_team_role", roleCode: "PM", approveMode: "any", canReject: true },
      { id: "NODE_FINANCE_CHANGE_ORDER", name: "财务审批", approverSource: "org_role", roleCode: "FINANCE", approveMode: "any", canReject: true },
    ],
  },
];

const defaultPaymentSchemes: PaymentScheme[] = [
  {
    id: "SCHEME_STANDARD_HOME",
    name: "标准家装合同",
    isDefault: true,
    stages: [
      { id: "PAY_SIGN", name: "签约款", ratio: 30, trigger: "合同签订" },
      { id: "PAY_START", name: "开工款", ratio: 35, trigger: "开工交底" },
      { id: "PAY_MID", name: "中期款", ratio: 30, trigger: "泥木验收" },
      { id: "PAY_FINAL", name: "尾款", ratio: 5, trigger: "竣工验收" },
    ],
  },
];

const defaultConstructionTemplates: ConstructionTemplate[] = [
  {
    id: "CONSTRUCTION_TEMPLATE_STANDARD_HOME",
    name: "标准家装施工模板",
    description: "适用于常规住宅装修，从开工交底到竣工验收维护统一工序、工艺标准和验收标准。",
    decorationType: "标准家装",
    isDefault: true,
    isEnabled: true,
    stages: [
      {
        id: "CONSTRUCTION_STAGE_HANDOVER",
        name: "开工交底",
        code: "HANDOVER",
        sortOrder: 1,
        areaDurationRules: makeDefaultAreaDurationRules(1, "HANDOVER"),
        processNodes: [
          makeConstructionProcessNode("NODE_HANDOVER_MEETING", "现场施工交底", "construction", "核对设计图纸、报价范围、施工边界、保护要求和重点注意事项，确认开工前准备已完成。", ["今日完成现场开工交底，已核对图纸、施工范围和重点注意事项。"]),
          makeConstructionProcessNode("NODE_HANDOVER_ACCEPTANCE", "开工交底确认", "acceptance", "", ["开工交底已完成，现场保护和施工准备已确认。"], "客户、设计师、项目经理完成现场确认，成品保护和安全告知到位。"),
        ],
      },
      {
        id: "CONSTRUCTION_STAGE_DEMOLITION",
        name: "拆改",
        code: "DEMOLITION",
        sortOrder: 2,
        areaDurationRules: makeDefaultAreaDurationRules(3, "DEMOLITION"),
        processNodes: [
          makeConstructionProcessNode("NODE_DEMOLITION_PROTECTION", "成品保护", "construction", "对入户门、电梯通道、公共区域、保留设施进行保护，避免拆改期间造成二次损坏。", ["今日完成拆改前成品保护，公共区域和保留设施已做好防护。"]),
          makeConstructionProcessNode("NODE_DEMOLITION_WORK", "拆除施工", "construction", "按交底范围拆除墙地面、门窗、吊顶或非承重墙体，严禁违规拆改承重结构。", ["今日完成拆除施工，拆除范围按交底要求执行。"]),
          makeConstructionProcessNode("NODE_DEMOLITION_ACCEPTANCE", "拆改验收", "acceptance", "", ["拆改阶段已完成，现场垃圾清运和结构安全已检查。"], "拆除范围符合交底，结构墙体未违规拆改，现场垃圾清运完成。"),
        ],
      },
      {
        id: "CONSTRUCTION_STAGE_HYDROPOWER",
        name: "水电",
        code: "HYDROPOWER",
        sortOrder: 3,
        areaDurationRules: makeDefaultAreaDurationRules(7, "HYDROPOWER"),
        processNodes: [
          makeConstructionProcessNode("NODE_HYDROPOWER_POSITION", "水电定位", "construction", "根据图纸确认开关、插座、灯位、给排水点位和设备预留位置，现场标记清晰。", ["今日完成水电定位，开关插座、灯位和给排水点位已现场确认。"]),
          makeConstructionProcessNode("NODE_HYDROPOWER_PIPE", "开槽布管", "construction", "按规范开槽，线管固定牢固，横平竖直，强弱电保持合理间距。", ["今日完成水电开槽及线管预埋，现场已按规范拍照留档。"]),
          makeConstructionProcessNode("NODE_HYDROPOWER_WATER", "给排水改造", "construction", "冷热水管分色清晰，管路固定牢固，排水坡度合理，接口位置便于后续安装。", ["今日完成给排水管路改造，冷热水管和排水坡度已检查。"]),
          makeConstructionProcessNode("NODE_HYDROPOWER_ACCEPTANCE", "水电隐蔽验收", "acceptance", "", ["水电隐蔽验收已完成，打压测试和隐蔽照片已留档。"], "回路标识清晰，强弱电间距合规，水管打压合格，排水坡度正常，隐蔽照片完整。"),
        ],
      },
      {
        id: "CONSTRUCTION_STAGE_MASONRY",
        name: "泥瓦",
        code: "MASONRY",
        sortOrder: 4,
        areaDurationRules: makeDefaultAreaDurationRules(10, "MASONRY"),
        processNodes: [
          makeConstructionProcessNode("NODE_MASONRY_WATERPROOF", "防水施工", "construction", "基层清理干净，重点部位加强处理，防水高度和涂刷遍数符合门店施工标准。", ["今日完成防水施工，墙地面重点部位已加强处理。"]),
          makeConstructionProcessNode("NODE_MASONRY_CLOSED_WATER", "闭水试验", "acceptance", "", ["闭水试验已完成，现场未发现渗漏。"], "闭水时间和水位符合要求，楼下检查无渗漏，照片记录完整。"),
          makeConstructionProcessNode("NODE_MASONRY_TILE", "墙地砖铺贴", "construction", "瓷砖铺贴前排版确认，留缝均匀，地漏坡度合理，墙地砖空鼓率控制在标准范围内。", ["今日进行墙地砖铺贴，排版、留缝和坡度按标准执行。"]),
          makeConstructionProcessNode("NODE_MASONRY_ACCEPTANCE", "泥瓦验收", "acceptance", "", ["泥瓦阶段验收已完成，空鼓、坡度和阴阳角已检查。"], "防水无渗漏，瓷砖空鼓率合格，地漏排水顺畅，阴阳角顺直。"),
        ],
      },
      {
        id: "CONSTRUCTION_STAGE_CARPENTRY",
        name: "木作吊顶",
        code: "CARPENTRY",
        sortOrder: 5,
        areaDurationRules: makeDefaultAreaDurationRules(7, "CARPENTRY"),
        processNodes: [
          makeConstructionProcessNode("NODE_CARPENTRY_KEEL", "吊顶龙骨施工", "construction", "龙骨固定牢固，间距符合规范，吊顶标高和造型尺寸与图纸一致。", ["今日完成吊顶龙骨施工，标高、间距和固定情况已检查。"]),
          makeConstructionProcessNode("NODE_CARPENTRY_BOARD", "石膏板封板", "construction", "板缝错缝处理，螺钉间距合理，检修口按设备和后期维护需求预留。", ["今日完成石膏板封板，板缝和检修口已按要求处理。"]),
          makeConstructionProcessNode("NODE_CARPENTRY_ACCEPTANCE", "木作吊顶验收", "acceptance", "", ["木作吊顶验收已完成，龙骨、封板和检修口已检查。"], "龙骨固定牢固，板缝预留规范，检修口位置合理，造型尺寸符合图纸。"),
        ],
      },
      {
        id: "CONSTRUCTION_STAGE_PAINT",
        name: "油漆",
        code: "PAINT",
        sortOrder: 6,
        areaDurationRules: makeDefaultAreaDurationRules(10, "PAINT"),
        processNodes: [
          makeConstructionProcessNode("NODE_PAINT_BASE", "墙面基层处理", "construction", "基层清理、找平、阴阳角修正和防裂处理到位，为底漆面漆施工做好基础。", ["今日完成墙面基层处理，找平和阴阳角修正已检查。"]),
          makeConstructionProcessNode("NODE_PAINT_FINISH", "底漆面漆施工", "construction", "按产品要求进行底漆和面漆施工，漆面颜色一致，避免明显流坠、透底和开裂。", ["今日完成底漆面漆施工，漆面效果和细节已检查。"]),
          makeConstructionProcessNode("NODE_PAINT_ACCEPTANCE", "油漆验收", "acceptance", "", ["油漆阶段验收已完成，墙面平整度和漆面效果已检查。"], "墙面平整无明显波浪，阴阳角顺直，漆面颜色一致，无明显流坠和开裂。"),
        ],
      },
      {
        id: "CONSTRUCTION_STAGE_INSTALLATION",
        name: "安装",
        code: "INSTALLATION",
        sortOrder: 7,
        areaDurationRules: makeDefaultAreaDurationRules(7, "INSTALLATION"),
        processNodes: [
          makeConstructionProcessNode("NODE_INSTALLATION_ELECTRIC", "开关灯具安装", "construction", "开关插座安装平整牢固，通电测试正常，灯具位置和安装牢固度符合要求。", ["今日完成开关插座和灯具安装，通电测试正常。"]),
          makeConstructionProcessNode("NODE_INSTALLATION_FIXTURE", "卫浴柜体安装", "construction", "卫浴、五金、柜体和门套踢脚线安装牢固，收口完整，功能测试正常。", ["今日完成卫浴、五金和柜体安装，收口和功能已检查。"]),
          makeConstructionProcessNode("NODE_INSTALLATION_ACCEPTANCE", "安装验收", "acceptance", "", ["安装阶段验收已完成，开关、灯具、卫浴和柜体功能已检查。"], "开关插座通电正常，灯具安装牢固，卫浴排水正常，柜体门板开合顺畅，收口细节完整。"),
        ],
      },
      {
        id: "CONSTRUCTION_STAGE_COMPLETION",
        name: "竣工验收",
        code: "COMPLETION",
        sortOrder: 8,
        areaDurationRules: makeDefaultAreaDurationRules(2, "COMPLETION"),
        processNodes: [
          makeConstructionProcessNode("NODE_COMPLETION_CLEAN", "全屋保洁与整改", "construction", "对现场进行保洁，按内部预验收问题完成整改，确保交付前功能和观感达标。", ["今日完成全屋保洁和问题整改，现场已具备竣工验收条件。"]),
          makeConstructionProcessNode("NODE_COMPLETION_ACCEPTANCE", "竣工验收", "acceptance", "", ["竣工验收已完成，资料归档和交付确认已处理。"], "全屋功能检查完成，整改项闭环，竣工资料齐全，客户签字确认，现场交付完成。"),
        ],
      },
    ],
  },
];

export const defaultBranchSettings: BranchSettings = {
  basicInfo: {
    legalCompanyName: "",
    companyShortName: "",
    companyLogoUrl: "",
    companyBrandSubtitle: "",
    legalPersonName: "",
    managerName: "",
    contactPhone: "",
    businessLicenseNo: "",
    province: "",
    city: "",
    district: "",
    address: "",
  },
  collectionRules: {
    schemes: defaultPaymentSchemes,
    paymentQrCodeUrl: "",
    paymentQrCodeName: "",
    paymentAccountName: "",
    paymentQrNote: "",
  },
  charging: {
    designFeeRate: 3,
    projectManagementRate: 8,
    depositRate: 20,
    finalPaymentRate: 5,
    liabilityInsuranceRate: 0,
    taxRate: 9,
  },
  approvalFlows: defaultApprovalFlows,
  businessRules: {
    duplicateCustomerDays: 90,
    customerProtectionDays: 30,
    followUpTimeoutHours: 24,
    autoLoseDays: 60,
    requiredCustomerPhone: true,
    designerAssignmentMode: "direct",
    designerAssignmentDispatcher: {
      source: "store_manager",
      orgUnitIds: [],
      roleCodes: [],
      userIds: [],
    },
  },
  siteRules: {
    dailyLogRequired: true,
    photoRequired: true,
    safetyCheckRequired: true,
    materialAcceptanceRequired: true,
    progressUpdateDays: 3,
  },
  constructionTemplates: {
    templates: cloneConstructionTemplates(defaultConstructionTemplates),
  },
  featureFlags: {
    customerImport: true,
    employeeImport: true,
    quotationModule: true,
    materialsModule: true,
    financeModule: true,
    constructionModule: true,
  },
  notifications: {
    followUpReminder: true,
    approvalReminder: true,
    paymentReminder: true,
    siteDelayReminder: true,
  },
  orderSettings: {
    auxiliaryTemplates: [],
  },
  printSettings: {
    quotationLogoUrl: "",
    quotationSignatureLabels: defaultQuotationSignatureLabels,
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeBranchSettings(value: unknown): BranchSettings {
  if (!isObject(value)) return defaultBranchSettings;
  const legacyApprovals = isObject(value.approvals) ? value.approvals : null;
  const legacyLocation = isObject(value.location) ? value.location : {};
  return {
    basicInfo: { ...defaultBranchSettings.basicInfo, ...legacyLocation, ...(isObject(value.basicInfo) ? value.basicInfo : {}) },
    collectionRules: {
      ...defaultBranchSettings.collectionRules,
      ...(isObject(value.collectionRules) ? value.collectionRules : {}),
      schemes: Array.isArray(isObject(value.collectionRules) ? value.collectionRules.schemes : undefined)
        ? normalizePaymentSchemes((value.collectionRules as Record<string, unknown>).schemes as unknown[])
        : defaultPaymentSchemes,
    },
    charging: { ...defaultBranchSettings.charging, ...(isObject(value.charging) ? value.charging : {}) },
    approvalFlows: Array.isArray(value.approvalFlows)
      ? normalizeApprovalFlows(value.approvalFlows)
      : legacyApprovalsToFlows(legacyApprovals),
    businessRules: normalizeBusinessRules(value.businessRules),
    siteRules: { ...defaultBranchSettings.siteRules, ...(isObject(value.siteRules) ? value.siteRules : {}) },
    constructionTemplates: normalizeConstructionTemplateSettings(value.constructionTemplates),
    featureFlags: { ...defaultBranchSettings.featureFlags, ...(isObject(value.featureFlags) ? value.featureFlags : {}) },
    notifications: { ...defaultBranchSettings.notifications, ...(isObject(value.notifications) ? value.notifications : {}) },
    orderSettings: normalizeOrderSettings(value.orderSettings),
    printSettings: normalizePrintSettings(value.printSettings),
  };
}

function cloneConstructionTemplates(templates: ConstructionTemplate[]): ConstructionTemplate[] {
  return templates.map((template) => ({
    ...template,
    stages: template.stages.map((stage) => ({
      ...stage,
      areaDurationRules: cloneConstructionAreaDurationRules(stage.areaDurationRules),
      processNodes: cloneConstructionProcessNodes(stage.processNodes, stage.areaDurationRules),
    })),
  }));
}

function cloneConstructionAreaDurationRules(rules: ConstructionStageAreaDuration[]): ConstructionStageAreaDuration[] {
  return rules.map((rule) => ({ ...rule }));
}

function splitDurationAcrossNodes(totalDays: unknown, nodeIndex: number, nodeCount: number) {
  const total = Math.max(0, Math.ceil(Number(totalDays || 0)));
  const count = Math.max(1, nodeCount);
  if (total <= 0) return 0;
  const baseDays = Math.floor(total / count);
  const remainder = total % count;
  return Math.max(1, baseDays + (nodeIndex < remainder ? 1 : 0));
}

function deriveNodeAreaDurationRules(
  stageRules: ConstructionStageAreaDuration[],
  nodeIndex: number,
  nodeCount: number,
  prefix: string,
): ConstructionStageAreaDuration[] {
  const sourceRules = stageRules.length ? stageRules : makeDefaultAreaDurationRules(1, prefix);
  return sourceRules.map((rule, ruleIndex) => ({
    id: `${prefix}_NODE_${nodeIndex + 1}_AREA_${ruleIndex + 1}`,
    minArea: rule.minArea,
    maxArea: rule.maxArea,
    plannedDays: splitDurationAcrossNodes(rule.plannedDays, nodeIndex, nodeCount),
    floorHeatingDays: splitDurationAcrossNodes(rule.floorHeatingDays ?? rule.plannedDays, nodeIndex, nodeCount),
  }));
}

function cloneConstructionProcessNodes(
  nodes: ConstructionProcessNode[],
  fallbackStageRules: ConstructionStageAreaDuration[] = [],
): ConstructionProcessNode[] {
  return nodes.map((node, index) => ({
    ...node,
    sortOrder: index + 1,
    areaDurationRules: node.areaDurationRules?.length
      ? cloneConstructionAreaDurationRules(node.areaDurationRules)
      : deriveNodeAreaDurationRules(fallbackStageRules, index, nodes.length, node.id || `CONSTRUCTION_NODE_${index}`),
    constructionStandard: {
      description: node.constructionStandard.description,
      descriptions: [...node.constructionStandard.descriptions],
      images: node.constructionStandard.images.map((image) => ({ ...image })),
      standards: node.constructionStandard.standards.map((standard) => ({
        ...standard,
        images: standard.images.map((image) => ({ ...image })),
      })),
    },
    acceptanceStandard: {
      description: node.acceptanceStandard.description,
      descriptions: [...node.acceptanceStandard.descriptions],
      images: node.acceptanceStandard.images.map((image) => ({ ...image })),
      standards: node.acceptanceStandard.standards.map((standard) => ({
        ...standard,
        images: standard.images.map((image) => ({ ...image })),
      })),
    },
    logBroadcastScripts: [...node.logBroadcastScripts],
  }));
}

function makeDefaultAreaDurationRules(baseDays: number, prefix: string): ConstructionStageAreaDuration[] {
  const safeBaseDays = Math.max(0, Number.isFinite(baseDays) ? baseDays : 1);
  return [
    { id: `${prefix}_AREA_0_80`, minArea: 0, maxArea: 80, plannedDays: safeBaseDays, floorHeatingDays: safeBaseDays },
    { id: `${prefix}_AREA_80_120`, minArea: 80, maxArea: 120, plannedDays: Math.ceil(safeBaseDays * 1.15), floorHeatingDays: Math.ceil(safeBaseDays * 1.15) },
    { id: `${prefix}_AREA_120_160`, minArea: 120, maxArea: 160, plannedDays: Math.ceil(safeBaseDays * 1.35), floorHeatingDays: Math.ceil(safeBaseDays * 1.35) },
    { id: `${prefix}_AREA_160_PLUS`, minArea: 160, maxArea: null, plannedDays: Math.ceil(safeBaseDays * 1.6), floorHeatingDays: Math.ceil(safeBaseDays * 1.6) },
  ];
}

function makeConstructionProcessNode(
  id: string,
  name: string,
  type: ConstructionProcessNodeType,
  constructionDescription: string,
  logBroadcastScripts: string[],
  acceptanceDescription = "",
): ConstructionProcessNode {
  return {
    id,
    name,
    type,
    sortOrder: 1,
    areaDurationRules: [],
    constructionStandard: {
      description: constructionDescription,
      descriptions: constructionDescription ? [constructionDescription] : [],
      images: [],
      standards: constructionDescription ? [{ id: `${id}_CONSTRUCTION_STANDARD_1`, description: constructionDescription, images: [], required: true, photoRequired: true }] : [],
    },
    acceptanceStandard: {
      description: acceptanceDescription,
      descriptions: acceptanceDescription ? [acceptanceDescription] : [],
      images: [],
      standards: acceptanceDescription ? [{ id: `${id}_ACCEPTANCE_STANDARD_1`, description: acceptanceDescription, images: [], required: true, photoRequired: true }] : [],
    },
    logBroadcastScripts,
    photoRequired: true,
    customerConfirmRequired: false,
    projectManagerConfirmRequired: type === "acceptance",
  };
}

function normalizeConstructionTemplateSettings(value: unknown): BranchSettings["constructionTemplates"] {
  const raw = isObject(value) ? value : {};
  const templates = Array.isArray(raw.templates)
    ? normalizeConstructionTemplates(raw.templates)
    : cloneConstructionTemplates(defaultConstructionTemplates);
  return {
    templates: ensureConstructionTemplateDefault(templates.length ? templates : cloneConstructionTemplates(defaultConstructionTemplates)),
  };
}

function normalizeConstructionTemplates(value: unknown[]): ConstructionTemplate[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    return {
      id: String(raw.id || `CONSTRUCTION_TEMPLATE_${Date.now()}_${index}`),
      name: String(raw.name || `施工模板 ${index + 1}`),
      description: String(raw.description || ""),
      decorationType: String(raw.decorationType || "标准家装"),
      isDefault: raw.isDefault === true,
      isEnabled: raw.isEnabled !== false,
      stages: Array.isArray(raw.stages) ? normalizeConstructionTemplateStages(raw.stages) : [],
    };
  });
}

function normalizeConstructionTemplateStages(value: unknown[]): ConstructionTemplateStage[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    const id = String(raw.id || `CONSTRUCTION_STAGE_${Date.now()}_${index}`);
    const legacyPlannedDays = Number(raw.plannedDays ?? 1);
    const sortOrder = Number(raw.sortOrder ?? index + 1);
    const legacyLogItems = normalizeStringList(raw.logQuickItems);
    const legacyAcceptanceItems = normalizeStringList(raw.acceptanceItems);
    const areaDurationRules = Array.isArray(raw.areaDurationRules)
      ? normalizeConstructionAreaDurationRules(raw.areaDurationRules, Number.isFinite(legacyPlannedDays) ? legacyPlannedDays : 1, id)
      : makeDefaultAreaDurationRules(Number.isFinite(legacyPlannedDays) ? legacyPlannedDays : 1, id);
    const processNodes = Array.isArray(raw.processNodes)
      ? normalizeConstructionProcessNodes(raw.processNodes, areaDurationRules)
      : legacyConstructionItemsToProcessNodes(legacyLogItems, legacyAcceptanceItems, areaDurationRules);
    return {
      id,
      name: String(raw.name || `施工阶段 ${index + 1}`),
      code: String(raw.code || "CUSTOM"),
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : index + 1,
      areaDurationRules,
      processNodes: processNodes.length ? processNodes : legacyConstructionItemsToProcessNodes(["施工节点"], [], areaDurationRules),
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder)
    .map((stage, index) => ({ ...stage, sortOrder: index + 1 }));
}

function normalizeConstructionAreaDurationRules(
  value: unknown[],
  fallbackDays: number,
  prefix: string,
): ConstructionStageAreaDuration[] {
  const rules = value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    const minArea = Number(raw.minArea ?? 0);
    const maxAreaRaw = raw.maxArea;
    const maxArea = maxAreaRaw === null || maxAreaRaw === undefined || maxAreaRaw === "" ? null : Number(maxAreaRaw);
    const plannedDays = Number(raw.plannedDays ?? fallbackDays);
    const safePlannedDays = Number.isFinite(plannedDays) ? Math.max(0, plannedDays) : Math.max(0, fallbackDays);
    const legacyFloorHeatingExtraDays = Number(raw.floorHeatingExtraDays ?? 0);
    const floorHeatingDays = raw.floorHeatingDays === undefined
      ? safePlannedDays + (Number.isFinite(legacyFloorHeatingExtraDays) ? Math.max(0, legacyFloorHeatingExtraDays) : 0)
      : Number(raw.floorHeatingDays);
    return {
      id: String(raw.id || `${prefix}_AREA_${index}`),
      minArea: Number.isFinite(minArea) ? Math.max(0, minArea) : 0,
      maxArea: maxArea === null || !Number.isFinite(maxArea) ? null : Math.max(0, maxArea),
      plannedDays: safePlannedDays,
      floorHeatingDays: Number.isFinite(floorHeatingDays) ? Math.max(0, floorHeatingDays) : safePlannedDays,
    };
  }).sort((left, right) => left.minArea - right.minArea);
  return rules.length ? rules : makeDefaultAreaDurationRules(fallbackDays, prefix);
}

function normalizeConstructionProcessNodes(
  value: unknown[],
  fallbackStageRules: ConstructionStageAreaDuration[] = [],
): ConstructionProcessNode[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    const type: ConstructionProcessNodeType = raw.type === "acceptance" ? "acceptance" : "construction";
    const sortOrder = Number(raw.sortOrder ?? index + 1);
    const id = String(raw.id || `CONSTRUCTION_NODE_${Date.now()}_${index}`);
    const rawDurationRules = Array.isArray(raw.areaDurationRules)
      ? raw.areaDurationRules
      : (Array.isArray(raw.durationRules) ? raw.durationRules : null);
    return {
      id,
      name: String(raw.name || (type === "acceptance" ? `验收节点 ${index + 1}` : `工序节点 ${index + 1}`)),
      type,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : index + 1,
      areaDurationRules: rawDurationRules?.length
        ? normalizeConstructionAreaDurationRules(rawDurationRules, 1, id)
        : deriveNodeAreaDurationRules(fallbackStageRules, index, value.length, id),
      constructionStandard: normalizeConstructionNodeStandard(raw.constructionStandard, raw.constructionStandardDescription),
      acceptanceStandard: normalizeConstructionNodeStandard(raw.acceptanceStandard, raw.acceptanceStandardDescription),
      logBroadcastScripts: normalizeStringList(raw.logBroadcastScripts),
      photoRequired: raw.photoRequired !== false,
      customerConfirmRequired: raw.customerConfirmRequired === true,
      projectManagerConfirmRequired: raw.projectManagerConfirmRequired === true || type === "acceptance",
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder)
    .map((node, index) => ({ ...node, sortOrder: index + 1 }));
}

function normalizeConstructionNodeStandard(value: unknown, fallbackDescription?: unknown): ConstructionNodeStandard {
  const raw = isObject(value) ? value : {};
  const legacyImages = Array.isArray(raw.images) ? normalizeConstructionStandardImages(raw.images) : [];
  const rawStandards = Array.isArray(raw.standards) ? normalizeConstructionStandardItems(raw.standards) : [];
  const fallbackText = String(raw.description || fallbackDescription || "");
  const fallbackDescriptions = normalizeStringList(raw.descriptions);
  const fallbackItems = fallbackDescriptions.length
    ? fallbackDescriptions.map((item, index) => ({
      id: `CONSTRUCTION_STANDARD_${Date.now()}_${index}`,
      description: item,
      images: index === 0 ? legacyImages : [],
      required: true,
      photoRequired: true,
    }))
    : (fallbackText || legacyImages.length
      ? [{ id: `CONSTRUCTION_STANDARD_${Date.now()}_0`, description: fallbackText, images: legacyImages, required: true, photoRequired: true }]
      : []);
  const standards = rawStandards.length ? rawStandards : fallbackItems;
  const descriptions = standards.map((item) => item.description).filter((item) => item.trim());
  const description = descriptions.join("\n");
  return {
    description,
    descriptions,
    images: standards.flatMap((item) => item.images),
    standards,
  };
}

function normalizeConstructionStandardItems(value: unknown[]): ConstructionStandardItem[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    const images = Array.isArray(raw.images) ? normalizeConstructionStandardImages(raw.images) : [];
    return {
      id: String(raw.id || `CONSTRUCTION_STANDARD_${Date.now()}_${index}`),
      description: String(raw.description || ""),
      images,
      required: raw.required !== false,
      photoRequired: raw.photoRequired !== false,
    };
  }).filter((item) => item.description.trim() || item.images.length > 0);
}

function normalizeConstructionStandardImages(value: unknown[]): ConstructionStandardImage[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    return {
      id: String(raw.id || `CONSTRUCTION_STANDARD_IMAGE_${Date.now()}_${index}`),
      url: String(raw.url || raw.imageUrl || ""),
      caption: String(raw.caption || ""),
    };
  }).filter((item) => item.url.trim());
}

function legacyConstructionItemsToProcessNodes(
  logQuickItems: string[],
  acceptanceItems: string[],
  fallbackStageRules: ConstructionStageAreaDuration[] = [],
): ConstructionProcessNode[] {
  const totalCount = Math.max(1, logQuickItems.length + acceptanceItems.length);
  const constructionNodes = logQuickItems.map((item, index) => {
    const id = `LEGACY_CONSTRUCTION_NODE_${Date.now()}_${index}`;
    return {
      ...makeConstructionProcessNode(id, item, "construction", "", [item]),
      sortOrder: index + 1,
      areaDurationRules: deriveNodeAreaDurationRules(fallbackStageRules, index, totalCount, id),
    };
  });
  const acceptanceNodes = acceptanceItems.map((item, index) => {
    const sortOrder = constructionNodes.length + index + 1;
    const id = `LEGACY_ACCEPTANCE_NODE_${Date.now()}_${index}`;
    return {
      ...makeConstructionProcessNode(id, item, "acceptance", "", [], item),
      sortOrder,
      areaDurationRules: deriveNodeAreaDurationRules(fallbackStageRules, sortOrder - 1, totalCount, id),
    };
  });
  return [...constructionNodes, ...acceptanceNodes];
}

function ensureConstructionTemplateDefault(templates: ConstructionTemplate[]) {
  const firstEnabled = templates.find((template) => template.isEnabled) || templates[0];
  const defaultId = templates.find((template) => template.isDefault && template.isEnabled)?.id
    || templates.find((template) => template.isDefault)?.id
    || firstEnabled?.id
    || "";
  return templates.map((template) => ({ ...template, isDefault: Boolean(defaultId && template.id === defaultId) }));
}

function normalizeOrderSettings(value: unknown): BranchSettings["orderSettings"] {
  const raw = isObject(value) ? value : {};
  return {
    ...defaultBranchSettings.orderSettings,
    ...raw,
    auxiliaryTemplates: Array.isArray(raw.auxiliaryTemplates)
      ? normalizeOrderTemplates(raw.auxiliaryTemplates)
      : [],
  };
}

function normalizeOrderTemplates(value: unknown[]): OrderTemplate[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    const items = Array.isArray(raw.items) ? normalizeOrderTemplateItems(raw.items) : [];
    return {
      id: String(raw.id || `ORDER_TEMPLATE_${Date.now()}_${index}`),
      name: String(raw.name || `下单模板 ${index + 1}`),
      warehouseSupplierId: String(raw.warehouseSupplierId || ""),
      isEnabled: raw.isEnabled !== false,
      items,
    };
  });
}

function normalizeOrderTemplateItems(value: unknown[]): OrderTemplateItem[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    const defaultQuantity = Number(raw.defaultQuantity || 0);
    return {
      id: String(raw.id || `ORDER_TEMPLATE_ITEM_${Date.now()}_${index}`),
      materialId: String(raw.materialId || raw.material_id || ""),
      defaultQuantity: Number.isFinite(defaultQuantity) ? Math.max(0, defaultQuantity) : 0,
      remark: String(raw.remark || ""),
    };
  }).filter((item) => item.materialId);
}

function normalizePrintSettings(value: unknown): BranchSettings["printSettings"] {
  const raw = isObject(value) ? value : {};
  return {
    ...defaultBranchSettings.printSettings,
    ...raw,
    quotationLogoUrl: String(raw.quotationLogoUrl || "").trim(),
    quotationSignatureLabels: normalizeQuotationSignatureLabels(raw.quotationSignatureLabels),
  };
}

function normalizePaymentSchemes(value: unknown[]): PaymentScheme[] {
  const schemes = value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    return {
      id: String(raw.id || `SCHEME_${Date.now()}_${index}`),
      name: String(raw.name || "未命名收款方案"),
      isDefault: raw.isDefault === true,
      stages: Array.isArray(raw.stages) ? normalizePaymentStages(raw.stages) : [],
    };
  });

  if (!schemes.length) return defaultPaymentSchemes;
  if (!schemes.some((scheme) => scheme.isDefault)) schemes[0].isDefault = true;
  return schemes;
}

function normalizePaymentStages(value: unknown[]): PaymentStage[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    return {
      id: String(raw.id || `STAGE_${Date.now()}_${index}`),
      name: String(raw.name || `阶段${index + 1}`),
      ratio: Number(raw.ratio || 0),
      trigger: String(raw.trigger || ""),
    };
  });
}

function normalizeApprovalFlows(value: unknown[]): ApprovalFlow[] {
  const flows = value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    return {
      id: String(raw.id || `FLOW_${Date.now()}_${index}`),
      name: String(raw.name || "未命名审批流"),
      type: normalizeFlowType(raw.type),
      isEnabled: raw.isEnabled !== false,
      isDefault: raw.isDefault === true,
      thresholdAmount: Number(raw.thresholdAmount || 0),
      nodes: Array.isArray(raw.nodes) ? normalizeApprovalNodes(raw.nodes) : [],
    };
  });
  return ensureStandardApprovalFlows(flows.length ? flows : defaultApprovalFlows);
}

function normalizeApprovalNodes(value: unknown[]): ApprovalNode[] {
  return value.map((item, index) => {
    const raw = isObject(item) ? item : {};
    return {
      id: String(raw.id || `NODE_${Date.now()}_${index}`),
      name: String(raw.name || `审批节点 ${index + 1}`),
      approverSource: normalizeApproverSource(raw.approverSource, raw.roleCode),
      roleCode: String(raw.roleCode || ""),
      userId: raw.userId ? String(raw.userId) : undefined,
      approveMode: raw.approveMode === "all" ? "all" : "any",
      canReject: raw.canReject !== false,
    };
  });
}

function normalizeApproverSource(value: unknown, roleCode?: unknown): ApprovalNode["approverSource"] {
  if (["customer_team_role", "project_team_role", "org_role", "direct_user", "initiator_manager"].includes(String(value))) {
    return value as ApprovalNode["approverSource"];
  }
  if (String(roleCode) === "DESIGNER") return "customer_team_role";
  if (String(roleCode) === "PM") return "project_team_role";
  return "org_role";
}

function normalizeFlowType(value: unknown): ApprovalFlow["type"] {
  if (["quote", "contract", "deposit", "discount", "refund", "payment", "material", "change_order", "custom"].includes(String(value))) {
    return value as ApprovalFlow["type"];
  }
  return "custom";
}

function cloneApprovalFlow(flow: ApprovalFlow) {
  return { ...flow, nodes: flow.nodes.map((node) => ({ ...node })) };
}

function ensureStandardApprovalFlows(flows: ApprovalFlow[]) {
  const next = flows.map((flow) => ({
    ...flow,
    name: flow.type === "deposit" && flow.name === "定金审批流"
      ? "收款审批流"
      : flow.type === "refund" && flow.name === "退定金审批流"
        ? "退款审批流"
        : flow.name,
  }));
  (["deposit", "refund", "change_order"] as const).forEach((type) => {
    if (next.some((flow) => flow.type === type)) return;
    const defaultFlow = defaultApprovalFlows.find((flow) => flow.type === type);
    if (defaultFlow) next.push(cloneApprovalFlow(defaultFlow));
  });
  return next;
}

function normalizeBusinessRules(value: unknown): BranchSettings["businessRules"] {
  const raw = isObject(value) ? value : {};
  return {
    ...defaultBranchSettings.businessRules,
    ...raw,
    designerAssignmentMode: ["approval", "dispatch"].includes(String(raw.designerAssignmentMode))
      ? raw.designerAssignmentMode as "approval" | "dispatch"
      : "direct",
    designerAssignmentDispatcher: normalizeDesignerAssignmentDispatcher(raw.designerAssignmentDispatcher),
  };
}

function normalizeDesignerAssignmentDispatcher(value: unknown): DesignerAssignmentDispatcher {
  const raw = isObject(value) ? value : {};
  const source = ["store_manager", "org_manager", "role", "user"].includes(String(raw.source))
    ? raw.source as DesignerAssignmentDispatcherSource
    : "store_manager";
  return {
    source,
    orgUnitIds: normalizeStringList(raw.orgUnitIds),
    roleCodes: normalizeStringList(raw.roleCodes),
    userIds: normalizeStringList(raw.userIds),
  };
}

function normalizeStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  return values
    .map((item) => String(item || "").trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function legacyApprovalsToFlows(legacy: Record<string, unknown> | null): ApprovalFlow[] {
  if (!legacy) return defaultApprovalFlows;
  const flows: ApprovalFlow[] = [];
  if (legacy.contractApproval !== false) flows.push(defaultApprovalFlows[0]);
  if (legacy.quoteApproval !== false) {
    flows.push({
      ...defaultApprovalFlows[1],
      thresholdAmount: Number(legacy.quoteApprovalAmount || defaultApprovalFlows[1].thresholdAmount),
    });
  }
  if (legacy.discountApproval) {
    flows.push({
      id: "FLOW_DISCOUNT_STANDARD",
      name: "折扣审批流",
      type: "discount",
      isEnabled: true,
      isDefault: true,
      thresholdAmount: 0,
      nodes: [{ id: "NODE_BOSS_DISCOUNT", name: "老板审批", approverSource: "org_role", roleCode: "OWNER", approveMode: "any", canReject: true }],
    });
  }
  if (legacy.refundApproval) {
    flows.push({
      id: "FLOW_DEPOSIT_REFUND_STANDARD",
      name: "退款审批流",
      type: "refund",
      isEnabled: true,
      isDefault: true,
      thresholdAmount: 0,
      nodes: [{ id: "NODE_FINANCE_DEPOSIT_REFUND", name: "财务审批", approverSource: "org_role", roleCode: "FINANCE", approveMode: "any", canReject: true }],
    });
  }
  return ensureStandardApprovalFlows(flows.length ? flows : defaultApprovalFlows);
}
