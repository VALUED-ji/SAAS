import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import { syncCustomerProgress } from "@/lib/customerProgress";
import { beijingLocalDateTimeToUtcSql } from "@/lib/utils";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import {
  createDepositApprovalInstance,
  createDepositRefundApprovalInstance,
  ensureDepositApprovalTables,
  ensureDepositRefundApprovalTables,
  getDepositApprovalMapForDeposits,
  getDepositApprovalSummary,
  getDepositApprovalFlowForCustomer,
  getDepositRefundApprovalFlowForCustomer,
  getDepositRefundApprovalMapForDeposits,
  getDepositRefundApprovalSummary,
  prepareDepositApprovalPlan,
  prepareDepositRefundApprovalPlan,
  promoteCustomerToDeposited,
} from "@/lib/depositApproval";
import { canEditCustomers, canViewCustomers, getAuthContext, hasPermission } from "@/lib/security/authorization";

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function formatAmount(value: number) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function ensureDepositTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_deposit_records (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      company_id TEXT NOT NULL REFERENCES companies(id),
      branch_org_unit_id TEXT REFERENCES org_units(id),
      amount REAL NOT NULL,
      received_at TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'manual',
      payment_channel TEXT,
      record_type TEXT DEFAULT 'deposit',
      deposit_type TEXT,
      receivable_amount REAL,
      design_fee_mode TEXT,
      quotation_id TEXT REFERENCES quotations(id),
      quotation_amount REAL,
      design_fee_base_amount REAL,
      design_fee_rate REAL,
      design_fee_area REAL,
      design_fee_unit_price REAL,
      designer_level TEXT,
      is_refundable INTEGER DEFAULT 0,
      receiver_name TEXT,
      voucher_url TEXT,
      notes TEXT,
      status TEXT DEFAULT 'received',
      refund_status TEXT,
      refund_amount REAL,
      refund_reason TEXT,
      refund_requested_by_id TEXT REFERENCES users(id),
      refund_requested_at TEXT,
      refund_processed_at TEXT,
      waived_amount REAL DEFAULT 0,
      waiver_status TEXT,
      waiver_reason TEXT,
      waiver_requested_by_id TEXT REFERENCES users(id),
      waiver_requested_at TEXT,
      waiver_processed_at TEXT,
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_customer_deposit_records_customer ON customer_deposit_records(customer_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_customer_deposit_records_company ON customer_deposit_records(company_id, received_at);
  `);
  const columns = db.prepare("PRAGMA table_info(customer_deposit_records)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("refund_status")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN refund_status TEXT").run();
  if (!names.has("refund_amount")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN refund_amount REAL").run();
  if (!names.has("refund_reason")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN refund_reason TEXT").run();
  if (!names.has("refund_requested_by_id")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN refund_requested_by_id TEXT REFERENCES users(id)").run();
  if (!names.has("refund_requested_at")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN refund_requested_at TEXT").run();
  if (!names.has("refund_processed_at")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN refund_processed_at TEXT").run();
  if (!names.has("waived_amount")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN waived_amount REAL DEFAULT 0").run();
  if (!names.has("waiver_status")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN waiver_status TEXT").run();
  if (!names.has("waiver_reason")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN waiver_reason TEXT").run();
  if (!names.has("waiver_requested_by_id")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN waiver_requested_by_id TEXT REFERENCES users(id)").run();
  if (!names.has("waiver_requested_at")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN waiver_requested_at TEXT").run();
  if (!names.has("waiver_processed_at")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN waiver_processed_at TEXT").run();
  if (!names.has("record_type")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN record_type TEXT DEFAULT 'deposit'").run();
  if (!names.has("receivable_amount")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN receivable_amount REAL").run();
  if (!names.has("design_fee_mode")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN design_fee_mode TEXT").run();
  if (!names.has("quotation_id")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN quotation_id TEXT REFERENCES quotations(id)").run();
  if (!names.has("quotation_amount")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN quotation_amount REAL").run();
  if (!names.has("design_fee_base_amount")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN design_fee_base_amount REAL").run();
  if (!names.has("design_fee_rate")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN design_fee_rate REAL").run();
  if (!names.has("design_fee_area")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN design_fee_area REAL").run();
  if (!names.has("design_fee_unit_price")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN design_fee_unit_price REAL").run();
  if (!names.has("designer_level")) db.prepare("ALTER TABLE customer_deposit_records ADD COLUMN designer_level TEXT").run();
  ensureDepositApprovalTables(db);
  ensureDepositRefundApprovalTables(db);
}

function normalizeRecordType(value: unknown) {
  return String(value || "").trim() === "design_fee" ? "design_fee" : "deposit";
}

function getPaymentLabel(record: any) {
  return normalizeRecordType(record?.record_type) === "design_fee" ? "设计费" : "定金";
}

function getRefundLabel(record: any) {
  return normalizeRecordType(record?.record_type) === "design_fee" ? "退设计费" : "退定金";
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeDesignFeeMode(value: unknown) {
  const mode = String(value || "").trim();
  return ["quotation_ratio", "direct_fee_ratio", "designer_level_area"].includes(mode) ? mode : "fixed";
}

function getQuotationForDesignFee(db: ReturnType<typeof getDb>, customerId: string, quotationId: string) {
  if (!quotationId) return null;
  return db.prepare(`
    SELECT q.id, q.title, q.final_amount, q.total_amount, q.status, q.updated_at, q.created_at
    FROM quotations q
    INNER JOIN projects p ON q.project_id = p.id
    WHERE q.id = ?
      AND p.customer_id = ?
      AND q.deleted_at IS NULL
      AND UPPER(COALESCE(q.status, '')) = 'APPROVED'
  `).get(quotationId, customerId) as any;
}

function getQuotationDirectAmount(db: ReturnType<typeof getDb>, quotationId: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN COALESCE(category, '') <> 'other'
          THEN COALESCE(total_price, COALESCE(quantity, 0) * COALESCE(unit_price, 0), 0)
        ELSE 0
      END
    ), 0) as direct_amount
    FROM quotation_items
    WHERE quotation_id = ?
  `).get(quotationId) as any;
  return roundMoney(Number(row?.direct_amount || 0));
}

function buildPaymentPayload(db: ReturnType<typeof getDb>, customerId: string, body: any, existingRecord?: any) {
  const recordType = normalizeRecordType(body.record_type || existingRecord?.record_type);
  const amountText = String(body.amount ?? "").trim();
  const amount = amountText ? Number(amountText) : 0;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(recordType === "design_fee" ? "设计费实收金额不能小于 0" : "定金实收金额不能小于 0");
  }

  if (recordType === "design_fee") {
    const designFeeMode = normalizeDesignFeeMode(body.design_fee_mode || existingRecord?.design_fee_mode);
    const designFeeRate = Number(body.design_fee_rate || 0);
    let quotationId = String(body.quotation_id || "").trim();
    let quotationAmount = Number(body.quotation_amount || 0);
    let quotationTitle = String(body.quotation_title || "").trim();
    let designFeeBaseAmount = Number(body.design_fee_base_amount || existingRecord?.design_fee_base_amount || 0);
    let designFeeArea = Number(body.design_fee_area || existingRecord?.design_fee_area || 0);
    let designFeeUnitPrice = Number(body.design_fee_unit_price || existingRecord?.design_fee_unit_price || 0);
    let designerLevel = String(body.designer_level || existingRecord?.designer_level || "").trim();

    if (designFeeMode === "quotation_ratio" || designFeeMode === "direct_fee_ratio") {
      if (!quotationId) throw new Error("请选择用于计算设计费的正式报价");
      const quotation = getQuotationForDesignFee(db, customerId, quotationId);
      if (!quotation) throw new Error("所选报价不存在，或不是该客户的正式报价");
      if (!Number.isFinite(designFeeRate) || designFeeRate <= 0) throw new Error("设计费比例必须大于 0");
      quotationAmount = Number(quotation.final_amount ?? quotation.total_amount ?? 0);
      quotationTitle = quotation.title || "正式报价";
      designFeeBaseAmount = designFeeMode === "direct_fee_ratio" ? getQuotationDirectAmount(db, quotationId) : quotationAmount;
      if (designFeeMode === "direct_fee_ratio" && designFeeBaseAmount <= 0) throw new Error("所选报价暂无直接费明细，无法按直接费比例计算设计费");
      designFeeArea = 0;
      designFeeUnitPrice = 0;
      designerLevel = "";
    } else if (designFeeMode === "designer_level_area") {
      if (!designerLevel) throw new Error("请选择设计师等级");
      if (!Number.isFinite(designFeeArea) || designFeeArea <= 0) throw new Error("计费面积必须大于 0");
      if (!Number.isFinite(designFeeUnitPrice) || designFeeUnitPrice <= 0) throw new Error("设计师等级单价必须大于 0");
      quotationId = "";
      quotationAmount = 0;
      quotationTitle = "";
      designFeeBaseAmount = roundMoney(designFeeArea * designFeeUnitPrice);
    } else {
      quotationId = "";
      quotationAmount = 0;
      quotationTitle = "";
      designFeeBaseAmount = 0;
      designFeeArea = 0;
      designFeeUnitPrice = 0;
      designerLevel = "";
    }

    const computedReceivable = designFeeMode === "quotation_ratio" || designFeeMode === "direct_fee_ratio"
      ? roundMoney(designFeeBaseAmount * designFeeRate / 100)
      : designFeeMode === "designer_level_area"
        ? roundMoney(designFeeArea * designFeeUnitPrice)
        : Number(body.receivable_amount || existingRecord?.receivable_amount || 0);
    if (!Number.isFinite(computedReceivable) || computedReceivable <= 0) {
      throw new Error("设计费应收金额必须大于 0");
    }
    const receivableAmount = roundMoney(computedReceivable);

    return {
      recordType,
      amount: roundMoney(amount),
      depositType: String(body.deposit_type || "设计费").trim() || "设计费",
      receivableAmount,
      designFeeMode,
      quotationId: quotationId || null,
      quotationAmount: quotationAmount ? roundMoney(quotationAmount) : null,
      quotationTitle: quotationTitle || null,
      designFeeBaseAmount: designFeeBaseAmount ? roundMoney(designFeeBaseAmount) : null,
      designFeeRate: (designFeeMode === "quotation_ratio" || designFeeMode === "direct_fee_ratio") ? Math.round(designFeeRate * 10000) / 10000 : null,
      designFeeArea: designFeeMode === "designer_level_area" ? roundMoney(designFeeArea) : null,
      designFeeUnitPrice: designFeeMode === "designer_level_area" ? roundMoney(designFeeUnitPrice) : null,
      designerLevel: designFeeMode === "designer_level_area" ? designerLevel : null,
    };
  }

  return {
    recordType,
    amount: roundMoney(amount),
    depositType: String(body.deposit_type || "设计定金").trim() || "设计定金",
    receivableAmount: (() => {
      const receivableAmount = Number(body.receivable_amount || existingRecord?.receivable_amount || 0);
      if (!Number.isFinite(receivableAmount) || receivableAmount <= 0) throw new Error("定金应收金额必须大于 0");
      return roundMoney(receivableAmount);
    })(),
    designFeeMode: null,
    quotationId: null,
    quotationAmount: null,
    quotationTitle: null,
    designFeeBaseAmount: null,
    designFeeRate: null,
    designFeeArea: null,
    designFeeUnitPrice: null,
    designerLevel: null,
  };
}

function canManageCustomerPayments(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return canEditCustomers(auth) || hasPermission(auth, "finance.view");
}

function getDepositEditBlockedMessage(record: any) {
  const label = getPaymentLabel(record);
  const refundLabel = getRefundLabel(record);
  if (record.status === "pending_approval") return `该${label}正在收款审批中，暂不允许编辑`;
  if (record.approval_status === "approved") return `该${label}收款审批已通过，不允许编辑`;
  if (record.refund_status === "pending_approval") return `该${label}正在${refundLabel}审批中，暂不允许编辑`;
  if (record.refund_status === "pending") return `该${label}已提交${refundLabel}申请，暂不允许编辑`;
  if (record.refund_status === "partial_refunded") return `该${label}已有${refundLabel}审批通过，不允许编辑`;
  if (record.refund_status === "refunded") return `该${label}已完成${refundLabel}，不允许编辑`;
  if (record.refund_status === "rejected") return `该${label}的${refundLabel}审批已完成，不允许编辑`;
  return "";
}

function getDepositTopUpBlockedMessage(record: any) {
  const label = getPaymentLabel(record);
  const refundLabel = getRefundLabel(record);
  if (!["received", "pending"].includes(String(record.status || ""))) return `只有已收款或待收款${label}支持补收`;
  if (record.approval_status === "pending") return `该${label}已有收款审批进行中，暂不允许重复补收`;
  if (record.refund_status === "pending_approval" || record.refund_status === "pending") return `该${label}正在${refundLabel}流程中，暂不允许补收`;
  if (["partial_refunded", "refunded", "rejected"].includes(String(record.refund_status || ""))) return `该${label}已有${refundLabel}记录，暂不允许补收`;
  return "";
}

function getPendingTopUpApprovalAmount(db: ReturnType<typeof getDb>, depositId: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(approval_amount), 0) as amount
    FROM deposit_approval_instances
    WHERE deposit_id = ?
      AND approval_kind = 'top_up'
      AND status = 'pending'
      AND deleted_at IS NULL
  `).get(depositId) as any;
  return roundMoney(Number(row?.amount || 0));
}

function getPendingWaiverApprovalAmount(db: ReturnType<typeof getDb>, depositId: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(approval_amount), 0) as amount
    FROM deposit_approval_instances
    WHERE deposit_id = ?
      AND approval_kind = 'waiver'
      AND status = 'pending'
      AND deleted_at IS NULL
  `).get(depositId) as any;
  return roundMoney(Number(row?.amount || 0));
}

function getDepositDeleteBlockedMessage(record: any) {
  const label = getPaymentLabel(record);
  const refundLabel = getRefundLabel(record);
  const status = String(record?.status || "received");
  const approvalStatus = String(record?.approval_status || "");
  const refundStatus = String(record?.refund_status || "");
  const collectionApprovalCount = Number(record?.collection_approval_count || 0);
  const refundApprovalCount = Number(record?.refund_approval_count || 0);

  if (refundStatus || refundApprovalCount > 0) return `该${label}已有${refundLabel}记录或审批，不允许删除`;
  if (status === "pending_approval" || approvalStatus === "pending") return `收款审批中的${label}不允许删除`;
  if (approvalStatus === "approved") return `收款审批已通过的${label}不允许删除`;
  if (status === "received") return `已收款${label}属于财务流水，不允许删除`;
  if (status === "rejected" || approvalStatus === "rejected" || collectionApprovalCount > 0) {
    return `该${label}已有收款审批记录，不允许删除，可编辑后重新提交`;
  }
  return "";
}

function getApprovedRefundTotals(db: ReturnType<typeof getDb>, depositIds: string[]) {
  if (depositIds.length === 0) return new Map<string, number>();
  const placeholders = depositIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT deposit_id, COALESCE(SUM(refund_amount), 0) as total
    FROM deposit_refund_approval_instances
    WHERE deposit_id IN (${placeholders}) AND status = 'approved' AND deleted_at IS NULL
    GROUP BY deposit_id
  `).all(...depositIds) as any[];
  return new Map(rows.map((row) => [String(row.deposit_id), Math.round(Number(row.total || 0) * 100) / 100]));
}

function getRefundedAmountFromRecord(record: any, approvedTotal?: number) {
  const approved = Number(approvedTotal || 0);
  if (approved > 0) return Math.round(approved * 100) / 100;
  if (["refunded", "partial_refunded"].includes(String(record?.refund_status || ""))) {
    return Math.round(Number(record?.refund_amount || 0) * 100) / 100;
  }
  return 0;
}

function getDeposit(db: ReturnType<typeof getDb>, id: string) {
  const record = db.prepare(`
    SELECT d.*, creator.name as created_by_name, creator.avatar as created_by_avatar, branch.name as branch_name,
      q.title as quotation_title,
      approval.status as approval_status, approval.flow_name as approval_flow_name
    FROM customer_deposit_records d
    LEFT JOIN users creator ON d.created_by_id = creator.id
    LEFT JOIN org_units branch ON d.branch_org_unit_id = branch.id
    LEFT JOIN quotations q ON d.quotation_id = q.id
    LEFT JOIN deposit_approval_instances approval ON approval.deposit_id = d.id AND approval.deleted_at IS NULL
    WHERE d.id = ?
  `).get(id) as any;
  return attachDepositApprovals(db, record ? [record] : [])[0] || null;
}

function attachDepositApprovals(db: ReturnType<typeof getDb>, records: any[]) {
  const depositIds = records.map((record) => record.id).filter(Boolean);
  const approvalMap = getDepositApprovalMapForDeposits(db, depositIds);
  const refundApprovalMap = getDepositRefundApprovalMapForDeposits(db, depositIds);
  const approvedRefundTotals = getApprovedRefundTotals(db, depositIds);
  return records.map((record) => {
    const topUpApprovals = (approvalMap.get(record.id)?.topUps || [])
      .map((approval: any) => getDepositApprovalSummary(approval))
      .filter(Boolean);
    const waiverApprovals = (approvalMap.get(record.id)?.waivers || [])
      .map((approval: any) => getDepositApprovalSummary(approval))
      .filter(Boolean);
    return {
      ...record,
      approval: getDepositApprovalSummary(approvalMap.get(record.id)?.initial),
      top_up_approvals: topUpApprovals,
      top_up_approval: topUpApprovals[0] || null,
      waiver_approvals: waiverApprovals,
      waiver_approval: waiverApprovals[0] || null,
      refund_approval: getDepositRefundApprovalSummary(refundApprovalMap.get(record.id)),
      refunded_amount: getRefundedAmountFromRecord(record, approvedRefundTotals.get(record.id)),
      refundable_remaining_amount: Math.max(0, Math.round((Number(record.amount || 0) - getRefundedAmountFromRecord(record, approvedRefundTotals.get(record.id))) * 100) / 100),
    };
  });
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth) && !hasPermission(auth, "finance.view")) return NextResponse.json({ message: "没有款项查看权限" }, { status: 403 });
  const db = getDb();
  ensureDepositTable(db);
  const customer = db.prepare("SELECT id FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
    .get(params.id, auth.companyId) as any;
  if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

  const records = db.prepare(`
    SELECT d.*, creator.name as created_by_name, creator.avatar as created_by_avatar, branch.name as branch_name,
      q.title as quotation_title,
      approval.status as approval_status, approval.flow_name as approval_flow_name
    FROM customer_deposit_records d
    LEFT JOIN users creator ON d.created_by_id = creator.id
    LEFT JOIN org_units branch ON d.branch_org_unit_id = branch.id
    LEFT JOIN quotations q ON d.quotation_id = q.id
    LEFT JOIN deposit_approval_instances approval ON approval.deposit_id = d.id AND approval.deleted_at IS NULL
    WHERE d.customer_id = ? AND d.deleted_at IS NULL
    ORDER BY d.received_at DESC, d.created_at DESC
  `).all(params.id) as any[];

  return NextResponse.json(attachDepositApprovals(db, records));
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageCustomerPayments(auth)) return NextResponse.json({ message: "没有款项管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureDepositTable(db);
    const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId) as any;
    if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

    const body = await req.json();
    const method = String(body.method || "manual").trim();
    const receivedAtInput = String(body.received_at || "").trim();
    const paymentChannel = String(body.payment_channel || (method === "qr" ? "扫码支付" : "")).trim();
    const receiverName = String(body.receiver_name || "").trim();
    const voucherUrl = String(body.voucher_url || "").trim();
    const notes = String(body.notes || "").trim();
    const paymentPayload = buildPaymentPayload(db, params.id, body);

    if (!receivedAtInput) return NextResponse.json({ message: "请选择收款时间" }, { status: 400 });
    if (!["manual", "qr"].includes(method)) return NextResponse.json({ message: "收款方式无效" }, { status: 400 });
    if (method === "manual" && !paymentChannel) return NextResponse.json({ message: "请选择收款方式" }, { status: 400 });
    if (!paymentPayload.depositType) return NextResponse.json({ message: paymentPayload.recordType === "design_fee" ? "请选择设计费类型" : "请选择定金类型" }, { status: 400 });

    const branch = getBranchSettingsForCustomer(db, params.id);
    if (method === "qr" && !branch.settings.collectionRules.paymentQrCodeUrl) {
      return NextResponse.json({ message: "当前分公司未配置收款码，请先到分公司设置中配置" }, { status: 400 });
    }

    const createdById = auth.userId;
    const approvalFlow = paymentPayload.amount > 0 ? getDepositApprovalFlowForCustomer(db, params.id, paymentPayload.amount) : null;
    if (approvalFlow && !createdById) return NextResponse.json({ message: `缺少提交人，无法发起${getPaymentLabel(paymentPayload)}审批` }, { status: 400 });
    const approvalPlan = approvalFlow
      ? prepareDepositApprovalPlan(db, {
        customerId: params.id,
        branchOrgUnitId: approvalFlow.branchOrgUnitId,
        flow: approvalFlow.flow,
        initiatorId: createdById || "",
      })
      : null;
    const id = makeId("DEP");
    const receivedAt = beijingLocalDateTimeToUtcSql(receivedAtInput);
    const tx = (db as any).transaction(() => {
      db.prepare(`
        INSERT INTO customer_deposit_records (
          id, customer_id, company_id, branch_org_unit_id, amount, received_at, method, payment_channel,
          record_type, deposit_type, receivable_amount, design_fee_mode, quotation_id, quotation_amount,
          design_fee_base_amount, design_fee_rate, design_fee_area, design_fee_unit_price, designer_level,
          is_refundable, receiver_name, voucher_url, notes, status, created_by_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        customer.id,
        customer.company_id,
        branch.org_unit_id,
        paymentPayload.amount,
        receivedAt,
        method,
        paymentChannel || null,
        paymentPayload.recordType,
        paymentPayload.depositType,
        paymentPayload.receivableAmount,
        paymentPayload.designFeeMode,
        paymentPayload.quotationId,
        paymentPayload.quotationAmount,
        paymentPayload.designFeeBaseAmount,
        paymentPayload.designFeeRate,
        paymentPayload.designFeeArea,
        paymentPayload.designFeeUnitPrice,
        paymentPayload.designerLevel,
        1,
        receiverName || null,
        voucherUrl || null,
        notes || null,
        approvalPlan ? "pending_approval" : paymentPayload.amount > 0 ? "received" : "pending",
        createdById
      );

      if (approvalPlan) {
        createDepositApprovalInstance(db, approvalPlan, {
          depositId: id,
          customerId: customer.id,
          createdById: createdById!,
          title: customer.name || "客户",
          amount: paymentPayload.amount,
          recordType: paymentPayload.recordType,
        });
      } else if (paymentPayload.amount > 0 && paymentPayload.recordType === "deposit") {
        promoteCustomerToDeposited(db, customer);
      }
    });
    tx();
    const paymentLabel = getPaymentLabel(paymentPayload);
    recordCustomerOperation(db, {
      userId: auth.userId,
      customerId: customer.id,
      action: approvalPlan ? "customer.payment.submit_approval" : "customer.payment.create",
      module: "款项记录",
      title: approvalPlan ? `提交${paymentLabel}审批` : `登记${paymentLabel}`,
      content: `${paymentLabel}金额：${formatAmount(paymentPayload.amount)} 元${paymentChannel ? `，方式：${paymentChannel}` : ""}`,
      targetName: paymentLabel,
      metadata: { recordId: id, amount: paymentPayload.amount, recordType: paymentPayload.recordType, depositType: paymentPayload.depositType },
      ipAddress: getRequestIp(req),
    });
    return NextResponse.json(getDeposit(db, id), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存款项记录失败" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageCustomerPayments(auth)) return NextResponse.json({ message: "没有款项管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureDepositTable(db);
    const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId) as any;
    if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

    const body = await req.json();
    const recordId = String(body.record_id || "").trim();
    if (!recordId) return NextResponse.json({ message: "缺少款项记录 ID" }, { status: 400 });
    const record = db.prepare(`
      SELECT d.*, approval.status as approval_status
      FROM customer_deposit_records d
      LEFT JOIN deposit_approval_instances approval ON approval.deposit_id = d.id AND approval.deleted_at IS NULL
      WHERE d.id = ? AND d.customer_id = ? AND d.deleted_at IS NULL
    `).get(recordId, params.id) as any;
    if (!record) return NextResponse.json({ message: "款项记录不存在" }, { status: 404 });

    const action = String(body.action || "update").trim();
    if (action === "waiver_request") {
      const label = getPaymentLabel(record);
      const refundLabel = getRefundLabel(record);
      if (record.status !== "received") return NextResponse.json({ message: `只有已收款${label}支持尾款减免` }, { status: 400 });
      if (record.refund_status === "pending_approval" || record.refund_status === "pending") return NextResponse.json({ message: `${refundLabel}流程中的${label}暂不允许尾款减免` }, { status: 400 });
      if (["partial_refunded", "refunded", "rejected"].includes(String(record.refund_status || ""))) return NextResponse.json({ message: `已有${refundLabel}记录的${label}暂不允许尾款减免` }, { status: 400 });
      if (record.waiver_status === "pending_approval") return NextResponse.json({ message: `该${label}已有尾款减免审批中，请勿重复提交` }, { status: 400 });
      const receivableAmount = roundMoney(Number(record.receivable_amount ?? record.amount ?? 0));
      const currentAmount = roundMoney(Number(record.amount || 0));
      const waivedAmount = roundMoney(Number(record.waived_amount || 0));
      const pendingTopUpAmount = getPendingTopUpApprovalAmount(db, recordId);
      const pendingWaiverAmount = getPendingWaiverApprovalAmount(db, recordId);
      const remainingAmount = Math.max(0, roundMoney(receivableAmount - currentAmount - waivedAmount - pendingTopUpAmount - pendingWaiverAmount));
      if (remainingAmount <= 0) return NextResponse.json({ message: pendingWaiverAmount > 0 ? `该${label}已有尾款减免审批占用待收金额` : `该${label}已结清，无需尾款减免` }, { status: 400 });
      const waiverAmount = Number(body.waiver_amount);
      const waiverReason = String(body.waiver_reason || "").trim();
      const waiverNotes = String(body.notes || "").trim();
      if (!Number.isFinite(waiverAmount) || waiverAmount <= 0) return NextResponse.json({ message: "减免金额必须大于 0" }, { status: 400 });
      if (waiverAmount > remainingAmount + 0.005) return NextResponse.json({ message: `减免金额不能大于待收金额 ${formatAmount(remainingAmount)}` }, { status: 400 });
      if (!waiverReason) return NextResponse.json({ message: "请填写尾款减免原因" }, { status: 400 });

      const requesterId = auth.userId;
      const approvalFlow = getDepositApprovalFlowForCustomer(db, params.id, waiverAmount);
      if (approvalFlow && !requesterId) return NextResponse.json({ message: `缺少提交人，无法发起${label}尾款减免审批` }, { status: 400 });
      const approvalPlan = approvalFlow
        ? prepareDepositApprovalPlan(db, {
          customerId: params.id,
          branchOrgUnitId: approvalFlow.branchOrgUnitId,
          flow: approvalFlow.flow,
          initiatorId: requesterId || "",
        })
        : null;
      const nextWaivedAmount = roundMoney(waivedAmount + waiverAmount);
      const noteParts = [
        String(record.notes || "").trim(),
        `尾款减免：${formatAmount(waiverAmount)} 元，原因：${waiverReason}${waiverNotes ? `，备注：${waiverNotes}` : ""}`,
      ].filter(Boolean);

      const tx = (db as any).transaction(() => {
        db.prepare(`
          UPDATE customer_deposit_records
          SET waiver_status = ?,
              waiver_reason = ?,
              waiver_requested_by_id = ?,
              waiver_requested_at = datetime('now'),
              waiver_processed_at = ${approvalPlan ? "NULL" : "datetime('now')"},
              waived_amount = ?,
              notes = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          approvalPlan ? "pending_approval" : "approved",
          waiverReason,
          requesterId,
          approvalPlan ? waivedAmount : nextWaivedAmount,
          approvalPlan ? record.notes || null : noteParts.join("\n"),
          recordId,
        );
        if (approvalPlan) {
          createDepositApprovalInstance(db, approvalPlan, {
            depositId: recordId,
            customerId: customer.id,
            createdById: requesterId!,
            title: customer.name || "客户",
            amount: waiverAmount,
            recordType: normalizeRecordType(record.record_type),
            approvalKind: "waiver",
            approvalMeta: {
              reason: waiverReason,
              notes: waiverNotes,
            },
          });
        }
      });
      tx();
      recordCustomerOperation(db, {
        userId: requesterId,
        customerId: customer.id,
        action: approvalPlan ? "customer.payment.waiver_submit_approval" : "customer.payment.waiver",
        module: "款项记录",
        title: approvalPlan ? `提交${label}尾款减免审批` : `${label}尾款减免`,
        content: `${label}尾款减免金额：${formatAmount(waiverAmount)} 元，原因：${waiverReason}${approvalPlan ? "，已提交审批" : ""}`,
        targetName: label,
        metadata: { recordId, waiverAmount, receivableAmount, currentAmount, waivedAmount: approvalPlan ? waivedAmount : nextWaivedAmount, approvalRequired: Boolean(approvalPlan) },
        ipAddress: getRequestIp(req),
      });
      if (!approvalPlan) syncCustomerProgress(db, customer.id);
      return NextResponse.json(getDeposit(db, recordId));
    }
    if (action === "refund_request") {
      const label = getPaymentLabel(record);
      const refundLabel = getRefundLabel(record);
      if (record.status !== "received") {
        return NextResponse.json({ message: record.status === "pending_approval" ? `该${label}正在审批中，审批通过后才可申请退款` : `只有已收款${label}支持申请${refundLabel}` }, { status: 400 });
      }
      if (record.refund_status === "pending" || record.refund_status === "pending_approval") {
        return NextResponse.json({ message: `该${label}已提交${refundLabel}申请，请勿重复提交` }, { status: 400 });
      }
      const refundedAmount = getRefundedAmountFromRecord(record, getApprovedRefundTotals(db, [recordId]).get(recordId));
      const remainingAmount = Math.max(0, Math.round((Number(record.amount || 0) - refundedAmount) * 100) / 100);
      if (remainingAmount <= 0) return NextResponse.json({ message: `该${label}已全部退完` }, { status: 400 });
      const refundAmount = Number(body.refund_amount);
      const refundReason = String(body.refund_reason || "").trim();
      if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
        return NextResponse.json({ message: "退款金额必须大于 0" }, { status: 400 });
      }
      if (refundAmount > remainingAmount) {
        return NextResponse.json({ message: `退款金额不能大于剩余可退金额 ${remainingAmount.toFixed(2)}` }, { status: 400 });
      }
      if (!refundReason) return NextResponse.json({ message: `请填写${refundLabel}原因` }, { status: 400 });
      const requesterId = auth.userId;
      const approvalFlow = getDepositRefundApprovalFlowForCustomer(db, params.id, refundAmount);
      if (approvalFlow && !requesterId) return NextResponse.json({ message: `缺少提交人，无法发起${refundLabel}审批` }, { status: 400 });
      const approvalPlan = approvalFlow
        ? prepareDepositRefundApprovalPlan(db, {
          customerId: params.id,
          branchOrgUnitId: approvalFlow.branchOrgUnitId,
          flow: approvalFlow.flow,
          initiatorId: requesterId || "",
        })
        : null;
      const tx = (db as any).transaction(() => {
        db.prepare(`
          UPDATE customer_deposit_records
          SET refund_status = ?,
              refund_amount = ?,
              refund_reason = ?,
              refund_requested_by_id = ?,
              refund_requested_at = datetime('now'),
              refund_processed_at = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(approvalPlan ? "pending_approval" : "pending", Math.round(refundAmount * 100) / 100, refundReason, requesterId, recordId);
        if (approvalPlan) {
          createDepositRefundApprovalInstance(db, approvalPlan, {
            depositId: recordId,
            customerId: customer.id,
            createdById: requesterId!,
            title: customer.name || "客户",
            refundAmount,
            refundReason,
            recordType: normalizeRecordType(record.record_type),
          });
        }
      });
      tx();
      recordCustomerOperation(db, {
        userId: requesterId,
        customerId: customer.id,
        action: approvalPlan ? "customer.payment.refund_submit_approval" : "customer.payment.refund_request",
        module: "款项记录",
        title: `申请${refundLabel}`,
        content: `${label}${refundLabel}金额：${formatAmount(refundAmount)} 元，原因：${refundReason}`,
        targetName: label,
        metadata: { recordId, refundAmount, approvalRequired: Boolean(approvalPlan) },
        ipAddress: getRequestIp(req),
      });
      return NextResponse.json(getDeposit(db, recordId));
    }
    if (action === "top_up_payment") {
      const label = getPaymentLabel(record);
      const blockedMessage = getDepositTopUpBlockedMessage(record);
      if (blockedMessage) return NextResponse.json({ message: blockedMessage }, { status: 400 });

      const receivableAmount = roundMoney(Number(record.receivable_amount ?? record.amount ?? 0));
      const currentAmount = roundMoney(Number(record.amount || 0));
      const pendingTopUpAmount = getPendingTopUpApprovalAmount(db, recordId);
      const remainingAmount = Math.max(0, roundMoney(receivableAmount - currentAmount - pendingTopUpAmount));
      const topUpAmount = Number(body.amount);
      const receivedAtInput = String(body.received_at || "").trim();
      const paymentChannel = String(body.payment_channel || "").trim();
      const receiverName = String(body.receiver_name || "").trim();
      const voucherUrl = String(body.voucher_url || "").trim();
      const topUpNotes = String(body.notes || "").trim();

      if (remainingAmount <= 0) return NextResponse.json({ message: pendingTopUpAmount > 0 ? `该${label}已有补收审批占用待补金额，审批完成前不能重复补收` : `该${label}已收满，无需补收` }, { status: 400 });
      if (!Number.isFinite(topUpAmount) || topUpAmount <= 0) return NextResponse.json({ message: "补收金额必须大于 0" }, { status: 400 });
      if (topUpAmount > remainingAmount + 0.005) return NextResponse.json({ message: `补收金额不能大于待补金额 ${formatAmount(remainingAmount)}` }, { status: 400 });
      if (!receivedAtInput) return NextResponse.json({ message: "请选择补收时间" }, { status: 400 });
      if (!paymentChannel) return NextResponse.json({ message: "请选择补收方式" }, { status: 400 });

      const createdById = auth.userId;
      const approvalFlow = getDepositApprovalFlowForCustomer(db, params.id, topUpAmount);
      if (approvalFlow && !createdById) return NextResponse.json({ message: `缺少提交人，无法发起补收${label}审批` }, { status: 400 });
      const approvalPlan = approvalFlow
        ? prepareDepositApprovalPlan(db, {
          customerId: params.id,
          branchOrgUnitId: approvalFlow.branchOrgUnitId,
          flow: approvalFlow.flow,
          initiatorId: createdById || "",
        })
        : null;
      const nextAmount = roundMoney(currentAmount + topUpAmount);
      const noteParts = [
        String(record.notes || "").trim(),
        `补收记录：${formatAmount(topUpAmount)} 元，方式：${paymentChannel}，时间：${receivedAtInput}${receiverName ? `，收款人：${receiverName}` : ""}${voucherUrl ? `，凭证：${voucherUrl}` : ""}${topUpNotes ? `，备注：${topUpNotes}` : ""}`,
      ].filter(Boolean);

      const tx = (db as any).transaction(() => {
        if (approvalPlan) {
          createDepositApprovalInstance(db, approvalPlan, {
            depositId: recordId,
            customerId: customer.id,
            createdById: createdById!,
            title: customer.name || "客户",
            amount: topUpAmount,
            recordType: normalizeRecordType(record.record_type),
            approvalKind: "top_up",
            approvalMeta: {
              received_at: receivedAtInput,
              payment_channel: paymentChannel,
              receiver_name: receiverName,
              voucher_url: voucherUrl,
              notes: topUpNotes,
            },
          });
        } else {
          db.prepare(`
            UPDATE customer_deposit_records
            SET amount = ?,
                status = 'received',
                voucher_url = COALESCE(voucher_url, NULLIF(?, '')),
                notes = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(
            nextAmount,
            voucherUrl,
            noteParts.join("\n"),
            recordId
          );
        }
      });
      tx();

      if (!approvalPlan) syncCustomerProgress(db, customer.id);
      recordCustomerOperation(db, {
        userId: auth.userId,
        customerId: customer.id,
        action: approvalPlan ? "customer.payment.top_up_submit_approval" : "customer.payment.top_up",
        module: "款项记录",
        title: approvalPlan ? `提交补收${label}审批` : `补收${label}`,
        content: approvalPlan
          ? `${label}补收金额：${formatAmount(topUpAmount)} 元，方式：${paymentChannel}，已提交审批`
          : `${label}补收金额：${formatAmount(topUpAmount)} 元，累计实收：${formatAmount(nextAmount)} 元`,
        targetName: label,
        metadata: { recordId, amount: topUpAmount, totalReceivedAmount: approvalPlan ? currentAmount : nextAmount, receivableAmount, recordType: normalizeRecordType(record.record_type), approvalRequired: Boolean(approvalPlan) },
        ipAddress: getRequestIp(req),
      });
      return NextResponse.json(getDeposit(db, recordId));
    }
    const editBlockedMessage = getDepositEditBlockedMessage(record);
    if (editBlockedMessage) {
      return NextResponse.json({ message: editBlockedMessage }, { status: 400 });
    }

    const receivedAtInput = String(body.received_at || "").trim();
    const method = String(body.method || record.method || "manual").trim();
    const paymentChannel = String(body.payment_channel || (method === "qr" ? "扫码支付" : "")).trim();
    const receiverName = String(body.receiver_name || "").trim();
    const voucherUrl = String(body.voucher_url || "").trim();
    const notes = String(body.notes || "").trim();
    const paymentPayload = buildPaymentPayload(db, params.id, body, record);

    if (!receivedAtInput) return NextResponse.json({ message: "请选择收款时间" }, { status: 400 });
    if (!["manual", "qr"].includes(method)) return NextResponse.json({ message: "收款方式无效" }, { status: 400 });
    if (method === "manual" && !paymentChannel) return NextResponse.json({ message: "请选择收款方式" }, { status: 400 });
    if (!paymentPayload.depositType) return NextResponse.json({ message: paymentPayload.recordType === "design_fee" ? "请选择设计费类型" : "请选择定金类型" }, { status: 400 });

    const branch = getBranchSettingsForCustomer(db, params.id);
    if (method === "qr" && !branch.settings.collectionRules.paymentQrCodeUrl) {
      return NextResponse.json({ message: "当前分公司未配置收款码，请先到分公司设置中配置" }, { status: 400 });
    }

    const createdById = auth.userId;
    const approvalFlow = record.status === "rejected" && paymentPayload.amount > 0 ? getDepositApprovalFlowForCustomer(db, params.id, paymentPayload.amount) : null;
    if (approvalFlow && !createdById) return NextResponse.json({ message: `缺少提交人，无法重新发起${getPaymentLabel(paymentPayload)}审批` }, { status: 400 });
    const approvalPlan = approvalFlow
      ? prepareDepositApprovalPlan(db, {
        customerId: params.id,
        branchOrgUnitId: approvalFlow.branchOrgUnitId,
        flow: approvalFlow.flow,
        initiatorId: createdById || "",
      })
      : null;
    const nextStatus = record.status === "rejected"
      ? (approvalPlan ? "pending_approval" : paymentPayload.amount > 0 ? "received" : "pending")
      : record.status === "pending_approval"
        ? "pending_approval"
        : paymentPayload.amount > 0 ? "received" : "pending";
    const receivedAt = beijingLocalDateTimeToUtcSql(receivedAtInput);

    const tx = (db as any).transaction(() => {
      db.prepare(`
        UPDATE customer_deposit_records
        SET amount = ?,
            received_at = ?,
            method = ?,
            payment_channel = ?,
            record_type = ?,
            deposit_type = ?,
            receivable_amount = ?,
            design_fee_mode = ?,
            quotation_id = ?,
            quotation_amount = ?,
            design_fee_base_amount = ?,
            design_fee_rate = ?,
            design_fee_area = ?,
            design_fee_unit_price = ?,
            designer_level = ?,
            is_refundable = ?,
            receiver_name = ?,
            voucher_url = ?,
            notes = ?,
            status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        paymentPayload.amount,
        receivedAt,
        method,
        paymentChannel || null,
        paymentPayload.recordType,
        paymentPayload.depositType,
        paymentPayload.receivableAmount,
        paymentPayload.designFeeMode,
        paymentPayload.quotationId,
        paymentPayload.quotationAmount,
        paymentPayload.designFeeBaseAmount,
        paymentPayload.designFeeRate,
        paymentPayload.designFeeArea,
        paymentPayload.designFeeUnitPrice,
        paymentPayload.designerLevel,
        1,
        receiverName || null,
        voucherUrl || null,
        notes || null,
        nextStatus,
        recordId
      );
      if (approvalPlan) {
        createDepositApprovalInstance(db, approvalPlan, {
          depositId: recordId,
          customerId: customer.id,
          createdById: createdById!,
          title: customer.name || "客户",
          amount: paymentPayload.amount,
          recordType: paymentPayload.recordType,
        });
      } else if (record.status === "rejected" && nextStatus === "received" && paymentPayload.amount > 0 && paymentPayload.recordType === "deposit") {
        promoteCustomerToDeposited(db, customer);
      }
    });
    tx();
    syncCustomerProgress(db, customer.id);
    const paymentLabel = getPaymentLabel(paymentPayload);
    recordCustomerOperation(db, {
      userId: auth.userId,
      customerId: customer.id,
      action: approvalPlan ? "customer.payment.resubmit_approval" : "customer.payment.update",
      module: "款项记录",
      title: approvalPlan ? `重新提交${paymentLabel}审批` : `修改${paymentLabel}`,
      content: `${paymentLabel}金额：${formatAmount(paymentPayload.amount)} 元${paymentChannel ? `，方式：${paymentChannel}` : ""}`,
      targetName: paymentLabel,
      metadata: { recordId, amount: paymentPayload.amount, recordType: paymentPayload.recordType, depositType: paymentPayload.depositType },
      ipAddress: getRequestIp(req),
    });

    return NextResponse.json(getDeposit(db, recordId));
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "更新款项记录失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageCustomerPayments(auth)) return NextResponse.json({ message: "没有款项管理权限" }, { status: 403 });
  try {
    const recordId = req.nextUrl.searchParams.get("record_id");
    if (!recordId) return NextResponse.json({ message: "缺少款项记录 ID" }, { status: 400 });
    const db = getDb();
    ensureDepositTable(db);
    const customer = db.prepare("SELECT id FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId);
    if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
    const record = db.prepare(`
      SELECT d.*,
        approval.status as approval_status,
        (
          SELECT COUNT(*)
          FROM deposit_approval_instances dai
          WHERE dai.deposit_id = d.id AND dai.deleted_at IS NULL
        ) as collection_approval_count,
        (
          SELECT COUNT(*)
          FROM deposit_refund_approval_instances drai
          WHERE drai.deposit_id = d.id AND drai.deleted_at IS NULL
        ) as refund_approval_count
      FROM customer_deposit_records d
      LEFT JOIN deposit_approval_instances approval ON approval.deposit_id = d.id AND approval.deleted_at IS NULL
      WHERE d.id = ? AND d.customer_id = ? AND d.deleted_at IS NULL
    `).get(recordId, params.id) as any;
    if (!record) return NextResponse.json({ message: "款项记录不存在" }, { status: 404 });
    const deleteBlockedMessage = getDepositDeleteBlockedMessage(record);
    if (deleteBlockedMessage) return NextResponse.json({ message: deleteBlockedMessage }, { status: 400 });
    const tx = (db as any).transaction(() => {
      const instances = db.prepare("SELECT id FROM deposit_approval_instances WHERE deposit_id = ? AND deleted_at IS NULL").all(recordId) as any[];
      if (instances.length) {
        const placeholders = instances.map(() => "?").join(",");
        db.prepare(`UPDATE deposit_approval_steps SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE instance_id IN (${placeholders}) AND deleted_at IS NULL`).run(...instances.map((item) => item.id));
        db.prepare("UPDATE deposit_approval_instances SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE deposit_id = ? AND deleted_at IS NULL").run(recordId);
      }
      const refundInstances = db.prepare("SELECT id FROM deposit_refund_approval_instances WHERE deposit_id = ? AND deleted_at IS NULL").all(recordId) as any[];
      if (refundInstances.length) {
        const placeholders = refundInstances.map(() => "?").join(",");
        db.prepare(`UPDATE deposit_refund_approval_steps SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE instance_id IN (${placeholders}) AND deleted_at IS NULL`).run(...refundInstances.map((item) => item.id));
        db.prepare("UPDATE deposit_refund_approval_instances SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE deposit_id = ? AND deleted_at IS NULL").run(recordId);
      }
      db.prepare("UPDATE customer_deposit_records SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(recordId);
    });
    tx();
    syncCustomerProgress(db, params.id);
    const operatorId = auth.userId;
    const paymentLabel = getPaymentLabel(record);
    recordCustomerOperation(db, {
      userId: operatorId,
      customerId: params.id,
      action: "customer.payment.delete",
      module: "款项记录",
      title: `删除${paymentLabel}`,
      content: `${paymentLabel}金额：${formatAmount(record.amount)} 元`,
      targetName: paymentLabel,
      metadata: { recordId, amount: Number(record.amount || 0), recordType: record.record_type, depositType: record.deposit_type },
      ipAddress: getRequestIp(req),
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "删除款项记录失败" }, { status: 500 });
  }
}
