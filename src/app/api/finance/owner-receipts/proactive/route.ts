import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import {
  createDepositApprovalInstance,
  ensureDepositApprovalTables,
  getDepositApprovalFlowForCustomer,
  prepareDepositApprovalPlan,
  promoteCustomerToDeposited,
} from "@/lib/depositApproval";
import { beijingLocalDateTimeToUtcSql } from "@/lib/utils";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { getAuthContext } from "@/lib/security/authorization";

export const dynamic = "force-dynamic";

const RECEIPT_TYPES = new Set(["deposit", "design_fee"]);
const PAYMENT_METHODS = new Set(["银行转账", "现金", "微信", "支付宝", "刷卡", "POS机", "扫码支付", "其他"]);

type FinanceActor = {
  id: string;
  companyId: string;
  name: string;
  role: string;
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function formatAmount(value: number) {
  return Number(value || 0).toFixed(2);
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeRecordType(value: unknown) {
  const recordType = String(value || "").trim();
  if (recordType === "deposit" || recordType === "design_fee") return recordType;
  return null;
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

function getFormalQuotations(db: ReturnType<typeof getDb>, customerId: string) {
  return db.prepare(`
    SELECT q.id, q.title, q.status, q.total_amount, q.final_amount, q.updated_at, q.created_at,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN COALESCE(qi.category, '') <> 'other'
              THEN COALESCE(qi.total_price, COALESCE(qi.quantity, 0) * COALESCE(qi.unit_price, 0), 0)
            ELSE 0
          END
        )
        FROM quotation_items qi
        WHERE qi.quotation_id = q.id
      ), 0) as direct_amount
    FROM quotations q
    INNER JOIN projects p ON q.project_id = p.id
    WHERE p.customer_id = ?
      AND q.deleted_at IS NULL
      AND UPPER(COALESCE(q.status, '')) = 'APPROVED'
    ORDER BY q.updated_at DESC, q.created_at DESC
  `).all(customerId) as any[];
}

function buildPaymentPayload(db: ReturnType<typeof getDb>, customerId: string, body: any) {
  const recordType = normalizeRecordType(body.record_type || body.recordType);
  if (!recordType) throw new Error("请选择收款类型：定金或设计费");
  const amount = Number(body.amount);
  if (recordType !== "design_fee" && (!Number.isFinite(amount) || amount <= 0)) {
    throw new Error("定金金额必须大于 0");
  }

  if (recordType === "design_fee") {
    const designFeeMode = normalizeDesignFeeMode(body.design_fee_mode);
    const designFeeRate = Number(body.design_fee_rate || 0);
    let quotationId = String(body.quotation_id || "").trim();
    let quotationAmount = Number(body.quotation_amount || 0);
    let designFeeBaseAmount = Number(body.design_fee_base_amount || 0);
    let designFeeArea = Number(body.design_fee_area || 0);
    let designFeeUnitPrice = Number(body.design_fee_unit_price || 0);
    let designerLevel = String(body.designer_level || "").trim();

    if (designFeeMode === "quotation_ratio" || designFeeMode === "direct_fee_ratio") {
      if (!quotationId) throw new Error("请选择用于计算设计费的正式报价");
      const quotation = getQuotationForDesignFee(db, customerId, quotationId);
      if (!quotation) throw new Error("所选报价不存在，或不是该客户的正式报价");
      if (!Number.isFinite(designFeeRate) || designFeeRate <= 0) throw new Error("设计费比例必须大于 0");
      quotationAmount = Number(quotation.final_amount ?? quotation.total_amount ?? 0);
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
      designFeeBaseAmount = roundMoney(designFeeArea * designFeeUnitPrice);
    } else {
      quotationId = "";
      quotationAmount = 0;
      designFeeBaseAmount = 0;
      designFeeArea = 0;
      designFeeUnitPrice = 0;
      designerLevel = "";
    }

    const computedReceivable = designFeeMode === "quotation_ratio" || designFeeMode === "direct_fee_ratio"
      ? roundMoney(designFeeBaseAmount * designFeeRate / 100)
      : designFeeMode === "designer_level_area"
        ? roundMoney(designFeeArea * designFeeUnitPrice)
        : Number(body.receivable_amount || amount);
    if (!Number.isFinite(computedReceivable) || computedReceivable <= 0) {
      throw new Error("设计费应收金额必须大于 0");
    }

    return {
      recordType,
      amount: roundMoney(computedReceivable),
      depositType: String(body.deposit_type || "设计费").trim() || "设计费",
      receivableAmount: roundMoney(computedReceivable),
      designFeeMode,
      quotationId: quotationId || null,
      quotationAmount: quotationAmount ? roundMoney(quotationAmount) : null,
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
      const receivableAmount = Number(body.receivable_amount || amount);
      if (!Number.isFinite(receivableAmount) || receivableAmount <= 0) throw new Error("定金应收金额必须大于 0");
      return roundMoney(receivableAmount);
    })(),
    designFeeMode: null,
    quotationId: null,
    quotationAmount: null,
    designFeeBaseAmount: null,
    designFeeRate: null,
    designFeeArea: null,
    designFeeUnitPrice: null,
    designerLevel: null,
  };
}

function getFinanceActor(db: ReturnType<typeof getDb>, request: NextRequest) {
  const auth = getAuthContext(request);
  if (!auth) return { error: "请先登录", status: 401 as const };

  const user = db.prepare(`
    SELECT id, company_id as companyId, name, role
    FROM users
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(auth.userId, auth.companyId) as FinanceActor | undefined;
  if (!user) return { error: "当前账号不可用", status: 401 as const };

  const role = db.prepare(`
    SELECT permissions
    FROM roles
    WHERE company_id = ? AND code = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(user.companyId, user.role) as { permissions?: string | null } | undefined;
  let permissions: string[] = [];
  try {
    const parsed = JSON.parse(String(role?.permissions || "[]"));
    permissions = Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    permissions = [];
  }

  const hasFinanceAccess = ["OWNER", "ADMIN", "FINANCE"].includes(String(user.role || "").toUpperCase()) || permissions.includes("finance.view");
  if (!hasFinanceAccess) return { error: "没有业主收款权限", status: 403 as const };
  return { actor: user };
}

function normalizeRoomPart(value: unknown, suffixes: string[]) {
  const cleaned = String(value || "").trim();
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

function getFullRoomName(row: any) {
  const community = String(row.address || row.house_address || "").trim();
  if (Number(row.no_room_number || 0) === 1) return community || "暂无房号";
  const building = normalizeRoomPart(row.building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(row.unit_no, ["单元"]);
  const room = normalizeRoomPart(row.room_no, ["室", "房", "号"]);
  const number = [building, unit, room].filter(Boolean).join("-");
  return community && number ? `${community}${number}` : community || number || "暂无房号";
}

function getCustomerInActorScope(db: ReturnType<typeof getDb>, actor: FinanceActor, customerId: string) {
  return db.prepare(`
    SELECT id, company_id, name, address, house_address, building_no, unit_no, room_no, no_room_number, service_store, area_size
    FROM customers
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(customerId, actor.companyId) as any;
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const access = getFinanceActor(db, request);
    if ("error" in access) return NextResponse.json({ message: access.error }, { status: access.status });

    const customerId = String(request.nextUrl.searchParams.get("customerId") || "").trim();
    if (customerId) {
      const customer = getCustomerInActorScope(db, access.actor, customerId);
      if (!customer) return NextResponse.json({ message: "客户不存在或不在当前财务数据范围内" }, { status: 404 });
      const branch = getBranchSettingsForCustomer(db, customer.id);
      return NextResponse.json({
        actorName: access.actor.name || "",
        customer: {
          id: customer.id,
          name: customer.name || "未命名客户",
          fullRoomName: getFullRoomName(customer),
          serviceStore: customer.service_store || "未设置服务门店",
          areaSize: customer.area_size == null ? null : Number(customer.area_size),
        },
        collectionRules: branch.settings.collectionRules,
        formalQuotations: getFormalQuotations(db, customer.id),
      });
    }

    const search = String(request.nextUrl.searchParams.get("search") || "").trim();
    if (!search) return NextResponse.json({ customers: [] });

    const keyword = `%${search}%`;
    const roomKeyword = `%${search.replace(/[\s\-_/]/g, "")}%`;
    const rows = db.prepare(`
      SELECT id, name, address, house_address, building_no, unit_no, room_no, no_room_number, service_store, area_size
      FROM customers
      WHERE company_id = ?
        AND deleted_at IS NULL
        AND (
          name LIKE ?
          OR COALESCE(address, '') LIKE ?
          OR COALESCE(house_address, '') LIKE ?
          OR COALESCE(building_no, '') LIKE ?
          OR COALESCE(unit_no, '') LIKE ?
          OR COALESCE(room_no, '') LIKE ?
          OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            COALESCE(address, '') || COALESCE(building_no, '') || COALESCE(unit_no, '') || COALESCE(room_no, ''),
            '号楼', ''), '栋', ''), '幢', ''), '座', ''), '单元', ''), '室', ''), '房', ''), '号', '') LIKE ?
        )
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 20
    `).all(access.actor.companyId, keyword, keyword, keyword, keyword, keyword, keyword, roomKeyword) as any[];

    return NextResponse.json({
      customers: rows.map((row) => ({
        id: row.id,
        name: row.name || "未命名客户",
        fullRoomName: getFullRoomName(row),
        serviceStore: row.service_store || "未设置服务门店",
        areaSize: row.area_size == null ? null : Number(row.area_size),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "客户搜索失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    ensureDepositApprovalTables(db);
    const access = getFinanceActor(db, request);
    if ("error" in access) return NextResponse.json({ message: access.error }, { status: access.status });

    const body = await request.json();
    const customerId = String(body.customerId || "").trim();
    const method = String(body.method || "manual").trim();
    const paymentChannel = String(body.payment_channel || body.payMethod || (method === "qr" ? "扫码支付" : "")).trim();
    const payDateInput = String(body.received_at || body.payDate || "").trim();
    const receiverName = String(body.receiver_name || "").trim();
    const voucherUrl = String(body.voucher_url || "").trim();
    const notes = String(body.notes || "").trim();
    if (!customerId) return NextResponse.json({ message: "请选择客户" }, { status: 400 });
    if (!["manual", "qr"].includes(method)) return NextResponse.json({ message: "收款方式无效" }, { status: 400 });
    if (method === "manual" && !paymentChannel) return NextResponse.json({ message: "请选择收款方式" }, { status: 400 });
    if (paymentChannel && !PAYMENT_METHODS.has(paymentChannel)) return NextResponse.json({ message: "请选择有效的收款方式" }, { status: 400 });
    if (!payDateInput) return NextResponse.json({ message: "请选择收款时间" }, { status: 400 });
    if (notes.length > 500) return NextResponse.json({ message: "备注不能超过 500 个字" }, { status: 400 });
    if (receiverName.length > 50) return NextResponse.json({ message: "收款人不能超过 50 个字" }, { status: 400 });
    if (voucherUrl.length > 500) return NextResponse.json({ message: "收款凭证地址过长" }, { status: 400 });

    const customer = getCustomerInActorScope(db, access.actor, customerId);
    if (!customer) return NextResponse.json({ message: "客户不存在或不在当前财务数据范围内" }, { status: 404 });

    let paymentPayload: ReturnType<typeof buildPaymentPayload>;
    try {
      paymentPayload = buildPaymentPayload(db, customer.id, body);
    } catch (err: any) {
      return NextResponse.json({ message: err?.message || "收款信息填写不完整" }, { status: 400 });
    }
    if (!RECEIPT_TYPES.has(paymentPayload.recordType)) return NextResponse.json({ message: "收款类型无效" }, { status: 400 });
    if (!Number.isFinite(paymentPayload.amount) || paymentPayload.amount <= 0 || paymentPayload.amount > 100000000) {
      return NextResponse.json({ message: "收款金额必须大于 0 且不能超过 100000000" }, { status: 400 });
    }
    if (!paymentPayload.depositType) {
      return NextResponse.json({ message: paymentPayload.recordType === "design_fee" ? "请选择设计费类型" : "请选择定金类型" }, { status: 400 });
    }

    const branch = getBranchSettingsForCustomer(db, customer.id);
    if (method === "qr" && !branch.settings.collectionRules.paymentQrCodeUrl) {
      return NextResponse.json({ message: "当前分公司未配置收款码，请先到分公司设置中配置" }, { status: 400 });
    }

    const approvalFlow = getDepositApprovalFlowForCustomer(db, customer.id, paymentPayload.amount);
    const approvalPlan = approvalFlow
      ? prepareDepositApprovalPlan(db, {
        customerId: customer.id,
        branchOrgUnitId: approvalFlow.branchOrgUnitId,
        flow: approvalFlow.flow,
        initiatorId: access.actor.id,
      })
      : null;
    const paymentLabel = paymentPayload.recordType === "design_fee" ? "设计费" : "定金";
    const recordId = makeId("DEP");
    const receivedAt = beijingLocalDateTimeToUtcSql(payDateInput);

    const tx = (db as any).transaction(() => {
      db.prepare(`
        INSERT INTO customer_deposit_records (
          id, customer_id, company_id, branch_org_unit_id, amount, received_at, method, payment_channel,
          record_type, deposit_type, receivable_amount, design_fee_mode, quotation_id, quotation_amount,
          design_fee_base_amount, design_fee_rate, design_fee_area, design_fee_unit_price, designer_level,
          is_refundable, receiver_name, voucher_url, notes, status, created_by_id, created_at, updated_at
        )
        VALUES (
          @id, @customerId, @companyId, @branchOrgUnitId, @amount, @receivedAt, @method, @paymentChannel,
          @recordType, @depositType, @receivableAmount, @designFeeMode, @quotationId, @quotationAmount,
          @designFeeBaseAmount, @designFeeRate, @designFeeArea, @designFeeUnitPrice, @designerLevel,
          @isRefundable, @receiverName, @voucherUrl, @notes, @status, @createdById,
          datetime('now'), datetime('now')
        )
      `).run(
        {
          id: recordId,
          customerId: customer.id,
          companyId: customer.company_id,
          branchOrgUnitId: branch.org_unit_id,
          amount: paymentPayload.amount,
          receivedAt,
          method,
          paymentChannel: paymentChannel || null,
          recordType: paymentPayload.recordType,
          depositType: paymentPayload.depositType,
          receivableAmount: paymentPayload.receivableAmount,
          designFeeMode: paymentPayload.designFeeMode,
          quotationId: paymentPayload.quotationId,
          quotationAmount: paymentPayload.quotationAmount,
          designFeeBaseAmount: paymentPayload.designFeeBaseAmount,
          designFeeRate: paymentPayload.designFeeRate,
          designFeeArea: paymentPayload.designFeeArea,
          designFeeUnitPrice: paymentPayload.designFeeUnitPrice,
          designerLevel: paymentPayload.designerLevel,
          isRefundable: 1,
          receiverName: receiverName || null,
          voucherUrl: voucherUrl || null,
          notes: notes || null,
          status: approvalPlan ? "pending_approval" : "received",
          createdById: access.actor.id,
        },
      );

      if (approvalPlan) {
        createDepositApprovalInstance(db, approvalPlan, {
          depositId: recordId,
          customerId: customer.id,
          createdById: access.actor.id,
          title: customer.name || "客户",
          amount: paymentPayload.amount,
          recordType: paymentPayload.recordType,
        });
      } else if (paymentPayload.recordType === "deposit") {
        promoteCustomerToDeposited(db, customer);
      }

      recordCustomerOperation(db, {
        userId: access.actor.id,
        customerId: customer.id,
        action: approvalPlan ? "finance.owner_receipt.submit_approval" : "finance.owner_receipt.create",
        module: "业主收款",
        title: approvalPlan ? `提交${paymentLabel}收款审批` : `主动收${paymentLabel}`,
        content: `${paymentPayload.depositType}金额：${formatAmount(paymentPayload.amount)} 元，方式：${paymentChannel || "-"}`,
        targetName: paymentPayload.depositType,
        metadata: {
          recordId,
          recordType: paymentPayload.recordType,
          amount: paymentPayload.amount,
          depositType: paymentPayload.depositType,
          paymentChannel,
          method,
          source: "finance_owner_receipts",
        },
        ipAddress: getRequestIp(request),
      });
    });
    tx();

    return NextResponse.json({
      id: recordId,
      status: approvalPlan ? "pending_approval" : "received",
      message: approvalPlan ? `${paymentLabel}已提交收款审批` : `${paymentLabel}已登记收款`,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "主动收款保存失败" }, { status: 500 });
  }
}
