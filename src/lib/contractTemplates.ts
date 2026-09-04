import type Database from "better-sqlite3";

export type ContractTemplateStatus = "draft" | "published" | "disabled";

export type ContractTemplateRow = {
  id: string;
  company_id: string;
  org_unit_id: string;
  name: string;
  contract_type: string;
  status: ContractTemplateStatus;
  is_default: number;
  current_version: number;
  created_by_id?: string | null;
  updated_by_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  version_id?: string | null;
  content_json?: string | null;
  html?: string | null;
  version_created_at?: string | null;
  has_published_history?: number;
};

export type ContractTemplateSnapshot = {
  template_id: string;
  template_name: string;
  template_type: string;
  template_version_id: string;
  template_version: number;
  template_html: string;
  rendered_html: string;
  variables: Record<string, string>;
  frozen: boolean;
  created_at: string;
};

type Db = Database.Database;

const CONTRACT_TYPES = ["装修施工合同", "设计合同", "主材合同", "增补合同", "整装合同", "软装合同", "其他"];

export const contractTemplateVariableGroups = [
  {
    name: "公司信息",
    variables: [
      { key: "company.legal_name", label: "法定公司名称" },
      { key: "company.short_name", label: "公司简称" },
      { key: "company.license_no", label: "营业执照号" },
      { key: "company.legal_person", label: "法人" },
      { key: "company.manager", label: "负责人" },
      { key: "company.phone", label: "联系电话" },
      { key: "company.address", label: "公司地址" },
    ],
  },
  {
    name: "客户信息",
    variables: [
      { key: "customer.name", label: "客户姓名" },
      { key: "customer.phone", label: "客户电话" },
      { key: "customer.id_no", label: "客户身份证" },
    ],
  },
  {
    name: "项目信息",
    variables: [
      { key: "project.address", label: "项目地址" },
      { key: "project.area", label: "项目面积" },
      { key: "project.planned_start", label: "计划开工" },
      { key: "project.planned_end", label: "计划竣工" },
      { key: "project.duration_days", label: "签约工期" },
      { key: "project.scope", label: "施工范围" },
    ],
  },
  {
    name: "合同信息",
    variables: [
      { key: "contract.title", label: "合同名称" },
      { key: "contract.type", label: "合同类型" },
      { key: "contract.no", label: "合同编号" },
      { key: "contract.signed_at", label: "签约日期" },
      { key: "contract.total_amount", label: "合同总金额" },
      { key: "contract.total_amount_upper", label: "合同大写金额" },
      { key: "contract.deposit_deduct_amount", label: "定金抵扣" },
      { key: "contract.payable_amount", label: "应收合同款" },
    ],
  },
];

export const contractTemplateDynamicBlocks = [
  { key: "payment_schedule_table", label: "收款计划表" },
  { key: "quotation_summary", label: "报价金额摘要" },
  { key: "signature_section", label: "甲乙方签字区" },
  { key: "seal_section", label: "公司盖章区" },
];

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function ensureContractTemplateTables(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      org_unit_id TEXT NOT NULL REFERENCES org_units(id),
      name TEXT NOT NULL,
      contract_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      is_default INTEGER DEFAULT 0,
      current_version INTEGER NOT NULL DEFAULT 1,
      created_by_id TEXT REFERENCES users(id),
      updated_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS contract_template_versions (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES contract_templates(id),
      version INTEGER NOT NULL,
      content_json TEXT NOT NULL DEFAULT '{}',
      html TEXT NOT NULL DEFAULT '',
      created_by_id TEXT REFERENCES users(id),
      published_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      published_at TEXT,
      UNIQUE(template_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_contract_templates_branch
      ON contract_templates(company_id, org_unit_id, contract_type, status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_contract_template_versions_template
      ON contract_template_versions(template_id, version);
  `);
}

export function sanitizeContractTemplateHtml(value: unknown) {
  const html = String(value || "").trim();
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, "")
    .replace(/\ssrc\s*=\s*("|')((?!data:image\/|https?:\/\/|\/uploads\/)[\s\S])*?\1/gi, "")
    .replace(/<(?!\/?(p|br|strong|b|em|i|u|h1|h2|h3|h4|ol|ul|li|table|thead|tbody|tr|th|td|div|span|section|header|footer|article|hr|img)\b)[^>]*>/gi, "");
}

export function getDefaultContractTemplateHtml(contractType = "装修施工合同") {
  return `
    <h1 style="text-align:center;">{{contract.type}}</h1>
    <p style="text-align:center;">合同编号：{{contract.no}}</p>
    <p>甲方（业主）：{{customer.name}}，联系电话：{{customer.phone}}</p>
    <p>乙方：{{company.legal_name}}，联系电话：{{company.phone}}</p>
    <p>工程地址：{{project.address}}</p>
    <p>工程面积：{{project.area}}㎡</p>
    <p>施工范围：{{project.scope}}</p>
    <h3>一、合同金额</h3>
    <p>本合同总金额为人民币 {{contract.total_amount}} 元（大写：{{contract.total_amount_upper}}）。</p>
    <p>定金抵扣：{{contract.deposit_deduct_amount}} 元；应收合同款：{{contract.payable_amount}} 元。</p>
    <h3>二、工期约定</h3>
    <p>计划开工日期：{{project.planned_start}}，计划竣工日期：{{project.planned_end}}，签约工期 {{project.duration_days}} 天。</p>
    <h3>三、收款计划</h3>
    <p>[[payment_schedule_table]]</p>
    <h3>四、报价摘要</h3>
    <p>[[quotation_summary]]</p>
    <h3>五、签字盖章</h3>
    <p>[[signature_section]]</p>
    <p>[[seal_section]]</p>
  `.trim().replace("{{contract.type}}", contractType);
}

export function createDefaultTemplate(db: Db, params: { companyId: string; orgUnitId: string; contractType?: string; userId?: string }) {
  ensureContractTemplateTables(db);
  const type = CONTRACT_TYPES.includes(String(params.contractType || "")) ? String(params.contractType) : "装修施工合同";
  const templateId = makeId("CTPL");
  const versionId = makeId("CTPV");
  const html = sanitizeContractTemplateHtml(getDefaultContractTemplateHtml(type));
  const tx = (db as any).transaction(() => {
    db.prepare(`
      INSERT INTO contract_templates (
        id, company_id, org_unit_id, name, contract_type, status, is_default, current_version,
        created_by_id, updated_by_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'published', 1, 1, ?, ?, datetime('now'), datetime('now'))
    `).run(templateId, params.companyId, params.orgUnitId, `${type}标准模板`, type, params.userId || null, params.userId || null);
    db.prepare(`
      INSERT INTO contract_template_versions (
        id, template_id, version, content_json, html, created_by_id, published_by_id, created_at, published_at
      )
      VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(versionId, templateId, JSON.stringify({ mode: "html" }), html, params.userId || null, params.userId || null);
  });
  tx();
  return getContractTemplateById(db, templateId, params.companyId);
}

export function listContractTemplates(db: Db, params: { companyId: string; orgUnitId: string; contractType?: string; enabledOnly?: boolean }) {
  ensureContractTemplateTables(db);
  const args: any[] = [params.companyId, params.orgUnitId];
  let where = "t.company_id = ? AND t.org_unit_id = ? AND t.deleted_at IS NULL";
  if (params.contractType) {
    where += " AND t.contract_type = ?";
    args.push(params.contractType);
  }
  if (params.enabledOnly) where += " AND t.status = 'published'";
  return db.prepare(`
    SELECT t.*, v.id as version_id, v.content_json, v.html, v.created_at as version_created_at,
      EXISTS (
        SELECT 1
        FROM contract_template_versions pv
        WHERE pv.template_id = t.id AND (pv.published_at IS NOT NULL OR pv.published_by_id IS NOT NULL)
      ) as has_published_history
    FROM contract_templates t
    LEFT JOIN contract_template_versions v ON v.template_id = t.id AND v.version = t.current_version
    WHERE ${where}
    ORDER BY t.contract_type ASC, t.is_default DESC, CASE t.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      datetime(t.updated_at) DESC
  `).all(...args) as ContractTemplateRow[];
}

export function getContractTemplateById(db: Db, templateId: string, companyId: string) {
  ensureContractTemplateTables(db);
  return db.prepare(`
    SELECT t.*, v.id as version_id, v.content_json, v.html, v.created_at as version_created_at,
      EXISTS (
        SELECT 1
        FROM contract_template_versions pv
        WHERE pv.template_id = t.id AND (pv.published_at IS NOT NULL OR pv.published_by_id IS NOT NULL)
      ) as has_published_history
    FROM contract_templates t
    LEFT JOIN contract_template_versions v ON v.template_id = t.id AND v.version = t.current_version
    WHERE t.id = ? AND t.company_id = ? AND t.deleted_at IS NULL
    LIMIT 1
  `).get(templateId, companyId) as ContractTemplateRow | undefined;
}

export function getContractTemplateVersion(db: Db, versionId: string, companyId: string) {
  ensureContractTemplateTables(db);
  return db.prepare(`
    SELECT t.*, v.id as version_id, v.content_json, v.html, v.created_at as version_created_at, v.version as current_version,
      EXISTS (
        SELECT 1
        FROM contract_template_versions pv
        WHERE pv.template_id = t.id AND (pv.published_at IS NOT NULL OR pv.published_by_id IS NOT NULL)
      ) as has_published_history
    FROM contract_template_versions v
    INNER JOIN contract_templates t ON t.id = v.template_id
    WHERE v.id = ? AND t.company_id = ? AND t.deleted_at IS NULL
    LIMIT 1
  `).get(versionId, companyId) as ContractTemplateRow | undefined;
}

export function getDefaultContractTemplate(db: Db, params: { companyId: string; orgUnitId: string; contractType: string; createIfMissing?: boolean; userId?: string }) {
  ensureContractTemplateTables(db);
  const row = db.prepare(`
    SELECT t.*, v.id as version_id, v.content_json, v.html, v.created_at as version_created_at,
      EXISTS (
        SELECT 1
        FROM contract_template_versions pv
        WHERE pv.template_id = t.id AND (pv.published_at IS NOT NULL OR pv.published_by_id IS NOT NULL)
      ) as has_published_history
    FROM contract_templates t
    LEFT JOIN contract_template_versions v ON v.template_id = t.id AND v.version = t.current_version
    WHERE t.company_id = ? AND t.org_unit_id = ? AND t.contract_type = ? AND t.status = 'published' AND t.deleted_at IS NULL
    ORDER BY t.is_default DESC, datetime(t.updated_at) DESC
    LIMIT 1
  `).get(params.companyId, params.orgUnitId, params.contractType) as ContractTemplateRow | undefined;
  if (row || !params.createIfMissing) return row;
  return createDefaultTemplate(db, {
    companyId: params.companyId,
    orgUnitId: params.orgUnitId,
    contractType: params.contractType,
    userId: params.userId,
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripEscapedInlineTags(value: string) {
  return String(value || "")
    .replace(/&lt;span\b[\s\S]*?&gt;/gi, "")
    .replace(/&lt;\/span&gt;/gi, "");
}

function formatAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function uppercaseAmount(value: unknown) {
  const amount = Math.round(Number(value || 0) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return "零元整";
  const fraction = amount % 100;
  const yuan = Math.floor(amount / 100);
  const digits = "零壹贰叁肆伍陆柒捌玖";
  const units = ["", "拾", "佰", "仟"];
  const sections = ["", "万", "亿"];
  const sectionToChinese = (num: number) => {
    let str = "";
    let unitIndex = 0;
    let zero = true;
    while (num > 0) {
      const digit = num % 10;
      if (digit === 0) {
        if (!zero) {
          zero = true;
          str = digits[0] + str;
        }
      } else {
        zero = false;
        str = digits[digit] + units[unitIndex] + str;
      }
      unitIndex += 1;
      num = Math.floor(num / 10);
    }
    return str.replace(/零+$/g, "");
  };
  let yuanText = "";
  let rest = yuan;
  let sectionIndex = 0;
  while (rest > 0) {
    const section = rest % 10000;
    if (section > 0) yuanText = sectionToChinese(section) + sections[sectionIndex] + yuanText;
    rest = Math.floor(rest / 10000);
    sectionIndex += 1;
  }
  const jiao = Math.floor(fraction / 10);
  const fen = fraction % 10;
  const fractionText = fraction === 0 ? "整" : `${jiao ? `${digits[jiao]}角` : ""}${fen ? `${digits[fen]}分` : ""}`;
  return `${yuanText || "零"}元${fractionText}`;
}

export function resolveContractTemplateVariables(input: {
  customer: any;
  project: any;
  contract: any;
  branchBasicInfo?: any;
}) {
  const content = input.contract?.content || {};
  const amountInfo = content.amount_info || {};
  const projectInfo = content.project_info || {};
  const partyA = content.party_a || {};
  const branch = input.branchBasicInfo || {};
  const totalAmount = Number(input.contract?.total_amount ?? amountInfo.total_amount ?? 0);
  return {
    "company.legal_name": branch.legalCompanyName || branch.name || input.customer?.company_name || "",
    "company.short_name": branch.companyShortName || branch.legalCompanyName || branch.name || "",
    "company.license_no": branch.businessLicenseNo || "",
    "company.legal_person": branch.legalPersonName || "",
    "company.manager": branch.managerName || "",
    "company.phone": branch.contactPhone || branch.phone || input.customer?.company_phone || "",
    "company.address": branch.address || input.customer?.company_address || "",
    "customer.name": partyA.name || input.customer?.name || "",
    "customer.phone": partyA.phone || input.customer?.phone || "",
    "customer.id_no": partyA.id_no || "",
    "project.address": projectInfo.address || input.project?.address || input.customer?.address || "",
    "project.area": String(projectInfo.area || input.project?.area || input.customer?.area_size || ""),
    "project.planned_start": projectInfo.planned_start || "",
    "project.planned_end": projectInfo.planned_end || "",
    "project.duration_days": String(projectInfo.duration_days || ""),
    "project.scope": projectInfo.construction_scope || "",
    "contract.title": input.contract?.title || "",
    "contract.type": content.contract_type || "",
    "contract.no": input.contract?.contract_no || "",
    "contract.signed_at": input.contract?.signed_at || "",
    "contract.total_amount": formatAmount(totalAmount),
    "contract.total_amount_upper": uppercaseAmount(totalAmount),
    "contract.deposit_deduct_amount": formatAmount(amountInfo.deposit_deduct_amount || 0),
    "contract.payable_amount": formatAmount(amountInfo.payable_amount ?? totalAmount),
  };
}

function renderPaymentSchedule(content: any) {
  const stages = Array.isArray(content?.amount_info?.payment_stages) ? content.amount_info.payment_stages : [];
  if (!stages.length) return `<p class="contract-empty">暂无收款计划</p>`;
  const rows = stages.map((stage: any, index: number) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(stage.name || `第${index + 1}期款`)}</td>
      <td>${escapeHtml(String(stage.ratio || 0))}%</td>
      <td>${escapeHtml(stage.trigger || "-")}</td>
      <td>${formatAmount(stage.amount || 0)}</td>
    </tr>
  `).join("");
  return `
    <table class="contract-table">
      <thead><tr><th>期数</th><th>收款阶段</th><th>比例</th><th>触发条件</th><th>应收金额</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderQuotationSummary(content: any) {
  const amountInfo = content?.amount_info || {};
  return `
    <table class="contract-table">
      <tbody>
        <tr><td>预算报价</td><td>${escapeHtml(amountInfo.quotation_title || "-")}</td></tr>
        <tr><td>报价金额</td><td>${formatAmount(amountInfo.quotation_amount || 0)}</td></tr>
        <tr><td>合同总金额</td><td>${formatAmount(amountInfo.total_amount || 0)}</td></tr>
        <tr><td>定金抵扣</td><td>${formatAmount(amountInfo.deposit_deduct_amount || 0)}</td></tr>
        <tr><td>应收合同款</td><td>${formatAmount(amountInfo.payable_amount || amountInfo.total_amount || 0)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderSignatureSection(content: any) {
  const partyA = content?.party_a || {};
  const partyB = content?.party_b || {};
  return `
    <div class="contract-signatures">
      <div><p>甲方签字：</p><p>${escapeHtml(partyA.name || "")}</p><p>日期：____年__月__日</p></div>
      <div><p>乙方代表：</p><p>${escapeHtml(partyB.contact || "")}</p><p>日期：____年__月__日</p></div>
    </div>
  `;
}

function renderSealSection(content: any) {
  const partyB = content?.party_b || {};
  return `<div class="contract-seal"><p>乙方盖章：${escapeHtml(partyB.name || "")}</p><p>盖章处</p></div>`;
}

export function renderContractTemplateHtml(templateHtml: string, input: {
  customer: any;
  project: any;
  contract: any;
  branchBasicInfo?: any;
}) {
  const variables = resolveContractTemplateVariables(input);
  let html = stripEscapedInlineTags(sanitizeContractTemplateHtml(templateHtml || getDefaultContractTemplateHtml(input.contract?.content?.contract_type)));
  Object.entries(variables).forEach(([key, value]) => {
    html = html.replace(new RegExp(`{{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*}}`, "g"), escapeHtml(value));
  });
  html = html
    .replace(/\[\[\s*payment_schedule_table\s*\]\]/g, renderPaymentSchedule(input.contract?.content || {}))
    .replace(/\[\[\s*quotation_summary\s*\]\]/g, renderQuotationSummary(input.contract?.content || {}))
    .replace(/\[\[\s*signature_section\s*\]\]/g, renderSignatureSection(input.contract?.content || {}))
    .replace(/\[\[\s*seal_section\s*\]\]/g, renderSealSection(input.contract?.content || {}))
    .replace(/{{\s*[^}]+\s*}}/g, '<span class="contract-missing-variable">未填写</span>');
  return { html, variables };
}

export function buildContractTemplateSnapshot(input: {
  template: ContractTemplateRow;
  customer: any;
  project: any;
  contract: any;
  branchBasicInfo?: any;
  frozen: boolean;
}): ContractTemplateSnapshot {
  const templateHtml = input.template.html || getDefaultContractTemplateHtml(input.contract?.content?.contract_type);
  const rendered = renderContractTemplateHtml(templateHtml, {
    customer: input.customer,
    project: input.project,
    contract: input.contract,
    branchBasicInfo: input.branchBasicInfo,
  });
  return {
    template_id: input.template.id,
    template_name: input.template.name,
    template_type: input.template.contract_type,
    template_version_id: String(input.template.version_id || ""),
    template_version: Number(input.template.current_version || 1),
    template_html: templateHtml,
    rendered_html: rendered.html,
    variables: rendered.variables,
    frozen: input.frozen,
    created_at: new Date().toISOString(),
  };
}
