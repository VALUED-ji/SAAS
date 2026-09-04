import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import {
  buildContractTemplateSnapshot,
  ensureContractTemplateTables,
  getContractTemplateById,
  getContractTemplateVersion,
  getDefaultContractTemplate,
  listContractTemplates,
} from "@/lib/contractTemplates";
import { syncCustomerProgress } from "@/lib/customerProgress";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import {
  createContractApprovalInstance,
  ensureContractApprovalTables,
  getApprovalMapForContracts,
  getApprovalSummary,
  getContractApprovalFlowForCustomer,
  prepareContractApprovalPlan,
} from "@/lib/contractApproval";
import { canViewCustomers, getAuthContext, hasPermission } from "@/lib/security/authorization";

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function toMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatAmount(value: number) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function ensureContractTables(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      company_id TEXT NOT NULL REFERENCES companies(id),
      contract_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      signed_at TEXT,
      effective_at TEXT,
      expire_at TEXT,
      file_url TEXT,
      content TEXT,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS payment_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      contract_id TEXT REFERENCES contracts(id),
      milestone TEXT NOT NULL,
      due_date TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'PENDING',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_payment_plans_contract ON payment_plans(contract_id, sort_order);
  `);
  ensureContractTemplateTables(db);
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectColumns.some((column) => column.name === "site_stage")) {
    db.prepare("ALTER TABLE projects ADD COLUMN site_stage TEXT").run();
  }
  ensureContractApprovalTables(db);
}

function getCustomer(db: ReturnType<typeof getDb>, customerId: string, companyId: string) {
  return db.prepare(`
    SELECT c.*, company.name as company_name, company.phone as company_phone, company.address as company_address
    FROM customers c
    LEFT JOIN companies company ON c.company_id = company.id
    WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL
  `).get(customerId, companyId) as any;
}

function getLatestProject(db: ReturnType<typeof getDb>, customerId: string) {
  return db.prepare(`
    SELECT p.*, manager.name as manager_name
    FROM projects p
    LEFT JOIN users manager ON p.manager_id = manager.id
    WHERE p.customer_id = ? AND p.deleted_at IS NULL
    ORDER BY p.updated_at DESC, p.created_at DESC
    LIMIT 1
  `).get(customerId) as any;
}

function ensureCustomerProject(db: ReturnType<typeof getDb>, customer: any, createdById: string, initialStatus = "SIGNED") {
  const existing = getLatestProject(db, customer.id);
  if (existing) {
    db.prepare(`
      UPDATE projects
      SET site_stage = COALESCE(site_stage, CASE WHEN status IN ('SIGNED','CONSTRUCTION','COMPLETED','CLOSED') THEN 'PENDING_START' ELSE site_stage END),
          updated_at = updated_at
      WHERE id = ? AND deleted_at IS NULL
    `).run(existing.id);
    return existing;
  }

  const projectId = makeId("PROJ");
  const projectName = `${customer.name || "客户"}装修项目`;
  db.prepare(`
    INSERT INTO projects (id, company_id, customer_id, manager_id, name, address, area, status, site_stage, budget_amount, contract_amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
  `).run(
    projectId,
    customer.company_id,
    customer.id,
    createdById,
    projectName,
    customer.address || customer.area || null,
    Number(customer.area_size || 0) || null,
    initialStatus,
    initialStatus === "SIGNED" ? "PENDING_START" : null,
    Number(customer.budget || 0) || null,
  );
  return getLatestProject(db, customer.id);
}

function getLatestQuotation(db: ReturnType<typeof getDb>, customerId: string) {
  return db.prepare(`
    SELECT q.*
    FROM quotations q
    LEFT JOIN projects p ON q.project_id = p.id
    WHERE p.customer_id = ? AND q.deleted_at IS NULL
    ORDER BY CASE WHEN q.status = 'APPROVED' THEN 0 ELSE 1 END, q.updated_at DESC, q.created_at DESC
    LIMIT 1
  `).get(customerId) as any;
}

function getFormalQuotations(db: ReturnType<typeof getDb>, customerId: string) {
  return db.prepare(`
    SELECT q.id, q.title, q.status, q.total_amount, q.final_amount, q.updated_at, q.created_at,
      p.customer_id, p.name as project_name, p.address as project_address
    FROM quotations q
    LEFT JOIN projects p ON q.project_id = p.id
    WHERE p.customer_id = ?
      AND q.deleted_at IS NULL
      AND UPPER(q.status) = 'APPROVED'
    ORDER BY q.updated_at DESC, q.created_at DESC
  `).all(customerId) as any[];
}

function getDepositTotal(db: ReturnType<typeof getDb>, customerId: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM customer_deposit_records
    WHERE customer_id = ?
      AND deleted_at IS NULL
      AND status = 'received'
      AND COALESCE(record_type, 'deposit') = 'deposit'
  `).get(customerId) as any;
  return toMoney(Number(row?.total || 0));
}

function parseContent(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function markSourceContractResigned(db: ReturnType<typeof getDb>, sourceContractId?: string | null, newContractId?: string | null) {
  if (!sourceContractId || !newContractId) return;
  const source = db.prepare("SELECT content FROM contracts WHERE id = ? AND deleted_at IS NULL").get(sourceContractId) as any;
  const content = parseContent(source?.content);
  db.prepare(`
    UPDATE contracts
    SET status = 'RESIGNED',
        content = ?,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'SIGNED' AND deleted_at IS NULL
  `).run(JSON.stringify({
    ...content,
    resigned_by_contract_id: newContractId,
    resigned_at: new Date().toISOString(),
  }), sourceContractId);
}

function listContracts(db: ReturnType<typeof getDb>, customerId: string, options: { includeContent?: boolean; contractId?: string } = {}) {
  const fields = options.includeContent
    ? "c.*"
    : `c.id, c.project_id, c.company_id, c.contract_no, c.title, c.total_amount, c.status,
      c.signed_at, c.effective_at, c.expire_at, c.file_url, c.created_by_id, c.created_at, c.updated_at, c.deleted_at`;
  const rows = db.prepare(`
    SELECT ${fields}, p.customer_id, p.name as project_name, p.address as project_address,
      creator.name as created_by_name, creator.avatar as created_by_avatar
    FROM contracts c
    LEFT JOIN projects p ON c.project_id = p.id
    LEFT JOIN users creator ON c.created_by_id = creator.id
    WHERE p.customer_id = ? AND c.deleted_at IS NULL
      ${options.contractId ? "AND c.id = ?" : ""}
    ORDER BY CASE c.status WHEN 'SIGNED' THEN 0 WHEN 'PENDING_APPROVAL' THEN 1 WHEN 'REJECTED' THEN 2 WHEN 'DRAFT' THEN 3 WHEN 'RESIGNED' THEN 4 ELSE 5 END,
      c.updated_at DESC, c.created_at DESC
  `).all(...(options.contractId ? [customerId, options.contractId] : [customerId])) as any[];

  const approvalMap = getApprovalMapForContracts(db, rows.map((contract) => contract.id));
  const paymentPlansByContract = new Map<string, any[]>();
  const contractIds = rows.map((contract) => String(contract.id || "")).filter(Boolean);
  if (contractIds.length > 0) {
    const placeholders = contractIds.map(() => "?").join(",");
    const paymentPlans = db.prepare(`
      SELECT *
      FROM payment_plans
      WHERE contract_id IN (${placeholders})
      ORDER BY contract_id ASC, sort_order ASC, created_at ASC
    `).all(...contractIds) as any[];
    paymentPlans.forEach((plan) => {
      const contractId = String(plan.contract_id || "");
      if (!paymentPlansByContract.has(contractId)) paymentPlansByContract.set(contractId, []);
      paymentPlansByContract.get(contractId)?.push(plan);
    });
  }
  return rows.map((contract) => {
    const approval = getApprovalSummary(approvalMap.get(contract.id));
    return {
      ...contract,
      ...(options.includeContent ? { content: parseContent(contract.content) } : {}),
      payment_plans: paymentPlansByContract.get(String(contract.id || "")) || [],
      approval,
    };
  });
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有合同查看权限" }, { status: 403 });
  const db = getDb();
  ensureContractTables(db);
  const customer = getCustomer(db, params.id, auth.companyId);
  if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

  const project = getLatestProject(db, params.id);
  const latestQuotation = getLatestQuotation(db, params.id);
  const branch = getBranchSettingsForCustomer(db, params.id);
  const contractId = String(req.nextUrl.searchParams.get("contract_id") || req.nextUrl.searchParams.get("contractId") || "").trim();
  const includeContent = req.nextUrl.searchParams.get("includeContent") === "1" || Boolean(contractId);
  const contracts = listContracts(db, params.id, { includeContent, contractId: contractId || undefined });

  return NextResponse.json({
    customer,
    project,
    contracts,
    paymentSchemes: branch.settings.collectionRules.schemes,
    branchBasicInfo: branch.settings.basicInfo,
    branchOrgUnitId: branch.org_unit_id,
    contractTemplates: branch.org_unit_id
      ? listContractTemplates(db, {
        companyId: auth.companyId,
        orgUnitId: branch.org_unit_id,
        enabledOnly: true,
      })
      : [],
    depositTotal: getDepositTotal(db, params.id),
    latestQuotation,
    formalQuotations: getFormalQuotations(db, params.id),
  });
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有合同管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureContractTables(db);
    const customer = getCustomer(db, params.id, auth.companyId);
    if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

    const body = await req.json();
    const contractType = String(body.contract_type || "").trim();
    const title = String(body.title || "").trim();
    const contractNo = String(body.contract_no || "").trim();
    const rawTotalAmount = Number(body.total_amount || 0);
    const totalAmount = Number.isFinite(rawTotalAmount) ? toMoney(rawTotalAmount) : 0;
    const signedAt = String(body.signed_at || "").trim() || null;
    const effectiveAt = String(body.effective_at || "").trim() || signedAt;
    const expireAt = String(body.expire_at || "").trim() || null;
    const action = String(body.action || "").trim();
    const isDraftSave = action === "save_draft";
    const quotationId = String(body.quotation_id || "").trim();
    const existingContractId = String(body.id || "").trim();
    const resignSourceContractId = String(body.resign_source_contract_id || "").trim();
    const depositDeducted = Boolean(body.deposit_deducted);
    const rawDepositDeductAmount = Number(body.deposit_deduct_amount || 0);
    const depositDeductAmount = depositDeducted ? Math.min(toMoney(Number.isFinite(rawDepositDeductAmount) ? rawDepositDeductAmount : 0), getDepositTotal(db, params.id), totalAmount) : 0;
    const paymentStages = Array.isArray(body.payment_stages) ? body.payment_stages : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const requestedTemplateId = String(body.contract_template_id || "").trim();

    if (!contractType) return NextResponse.json({ message: "请选择合同类型" }, { status: 400 });
    if (!title) return NextResponse.json({ message: "请填写合同名称" }, { status: 400 });
    if (!contractNo) return NextResponse.json({ message: "请填写合同编号" }, { status: 400 });
    if (!isDraftSave && (!Number.isFinite(totalAmount) || totalAmount <= 0)) return NextResponse.json({ message: "合同金额必须大于 0" }, { status: 400 });
    if (existingContractId && resignSourceContractId) return NextResponse.json({ message: "重签合同必须生成新的合同记录" }, { status: 400 });

    const duplicated = db.prepare("SELECT id FROM contracts WHERE contract_no = ? AND deleted_at IS NULL AND id <> ?").get(contractNo, existingContractId || "__new__") as any;
    if (duplicated) return NextResponse.json({ message: "合同编号已存在，请更换" }, { status: 400 });

    const createdById = auth.userId;
    const project = ensureCustomerProject(db, customer, createdById, "LEAD");
    if (!project) return NextResponse.json({ message: "客户未关联项目，无法创建合同" }, { status: 400 });

    const resignSourceContract = resignSourceContractId
      ? db.prepare(`
        SELECT c.id, c.title, c.status, p.customer_id
        FROM contracts c
        INNER JOIN projects p ON c.project_id = p.id
        WHERE c.id = ? AND p.customer_id = ? AND c.deleted_at IS NULL
        LIMIT 1
      `).get(resignSourceContractId, params.id) as any
      : null;
    if (resignSourceContractId) {
      if (!resignSourceContract) return NextResponse.json({ message: "原合同不存在或已删除" }, { status: 404 });
      if (String(resignSourceContract.status || "").toUpperCase() !== "SIGNED") {
        return NextResponse.json({ message: "只有已签约合同可以发起重签" }, { status: 400 });
      }
    }

    const selectedQuotation = quotationId
      ? db.prepare(`
        SELECT q.id, q.title, q.status, q.total_amount, q.final_amount, p.customer_id
        FROM quotations q
        INNER JOIN projects p ON q.project_id = p.id
        WHERE q.id = ? AND q.deleted_at IS NULL
        LIMIT 1
      `).get(quotationId) as any
      : null;
    if (quotationId || !isDraftSave) {
      if (!selectedQuotation) return NextResponse.json({ message: "请选择状态为正式报价的预算" }, { status: 400 });
      if (selectedQuotation.customer_id !== params.id) return NextResponse.json({ message: "所选预算报价不属于当前客户" }, { status: 400 });
      if (String(selectedQuotation.status || "").toUpperCase() !== "APPROVED") {
        return NextResponse.json({ message: "只能选择状态为正式报价的预算" }, { status: 400 });
      }
    }

    const payableAmount = Math.max(0, toMoney(totalAmount - depositDeductAmount));
    const branch = getBranchSettingsForCustomer(db, params.id);
    const approvalFlow = !isDraftSave ? getContractApprovalFlowForCustomer(db, params.id, totalAmount) : null;
    const approvalPlan = approvalFlow
      ? prepareContractApprovalPlan(db, {
        customerId: params.id,
        project,
        branchOrgUnitId: approvalFlow.branchOrgUnitId,
        flow: approvalFlow.flow,
        initiatorId: createdById,
      })
      : null;
    const finalContractStatus = isDraftSave ? "DRAFT" : approvalPlan ? "PENDING_APPROVAL" : "SIGNED";
    const previousContract = existingContractId
      ? db.prepare(`
        SELECT c.id, c.status, c.content
        FROM contracts c
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE c.id = ? AND p.customer_id = ? AND c.deleted_at IS NULL
      `).get(existingContractId, params.id) as any
      : null;
    const previousContent = parseContent(previousContract?.content);
    const previousSnapshot = previousContent.document_snapshot || null;
    const shouldReuseFrozenTemplateVersion = !isDraftSave
      && String(previousContract?.status || "").toUpperCase() === "REJECTED"
      && previousSnapshot?.template_version_id;
    const selectedTemplate = shouldReuseFrozenTemplateVersion
      ? getContractTemplateVersion(db, previousSnapshot.template_version_id, auth.companyId)
      : requestedTemplateId
        ? getContractTemplateById(db, requestedTemplateId, auth.companyId)
        : branch.org_unit_id
          ? getDefaultContractTemplate(db, {
            companyId: auth.companyId,
            orgUnitId: branch.org_unit_id,
            contractType,
            createIfMissing: true,
            userId: auth.userId,
          })
          : null;

    if (selectedTemplate) {
      if (selectedTemplate.company_id !== auth.companyId) return NextResponse.json({ message: "合同模板无效" }, { status: 400 });
      if (!shouldReuseFrozenTemplateVersion && branch.org_unit_id && selectedTemplate.org_unit_id !== branch.org_unit_id) {
        return NextResponse.json({ message: "所选合同模板不属于当前客户分公司" }, { status: 400 });
      }
      if (!shouldReuseFrozenTemplateVersion && selectedTemplate.status !== "published") {
        return NextResponse.json({ message: "只能使用已发布的合同模板" }, { status: 400 });
      }
      if (!shouldReuseFrozenTemplateVersion && selectedTemplate.contract_type !== contractType) {
        return NextResponse.json({ message: "合同模板类型与当前合同类型不一致" }, { status: 400 });
      }
    }

    const content = {
      contract_type: contractType,
      resign_source_contract_id: resignSourceContract?.id || "",
      resign_source_contract_title: resignSourceContract?.title || "",
      quotation_id: selectedQuotation?.id || "",
      quotation_title: selectedQuotation?.title || "",
      quotation_amount: selectedQuotation ? toMoney(Number(selectedQuotation.final_amount ?? selectedQuotation.total_amount ?? 0)) : 0,
      party_a: body.party_a || {},
      party_b: body.party_b || {},
      project_info: body.project_info || {},
      amount_info: {
        total_amount: totalAmount,
        quotation_id: selectedQuotation?.id || "",
        quotation_title: selectedQuotation?.title || "",
        quotation_amount: selectedQuotation ? toMoney(Number(selectedQuotation.final_amount ?? selectedQuotation.total_amount ?? 0)) : 0,
        deposit_deducted: depositDeducted,
        deposit_deduct_amount: depositDeductAmount,
        payable_amount: payableAmount,
        payment_scheme_id: body.payment_scheme_id || "",
        payment_scheme_name: body.payment_scheme_name || "",
        payment_stages: paymentStages,
      },
      construction_terms: body.construction_terms || {},
      attachments,
      remarks: String(body.remarks || "").trim(),
      is_temporary_draft: isDraftSave,
      approval_required: Boolean(approvalPlan),
      approval_flow_id: approvalPlan?.flow.id || "",
      approval_flow_name: approvalPlan?.flow.name || "",
      draft_step: Math.max(0, Math.min(4, Number(body.draft_step || 0) || 0)),
    };
    const contractForSnapshot = {
      id: existingContractId || "",
      contract_no: contractNo,
      title,
      total_amount: totalAmount,
      signed_at: signedAt,
      content,
    };
    const documentSnapshot = selectedTemplate
      ? buildContractTemplateSnapshot({
        template: selectedTemplate,
        customer,
        project,
        contract: contractForSnapshot,
        branchBasicInfo: branch.settings.basicInfo,
        frozen: !isDraftSave,
      })
      : previousSnapshot || null;
    if (documentSnapshot) {
      (content as any).contract_template_id = documentSnapshot.template_id;
      (content as any).contract_template_name = documentSnapshot.template_name;
      (content as any).document_snapshot = documentSnapshot;
    }

    let contractId = existingContractId;
    if (contractId) {
      const existing = previousContract;
      if (!existing) return NextResponse.json({ message: "合同不存在或已删除" }, { status: 404 });
      if (["SIGNED", "RESIGNED"].includes(String(existing.status || "").toUpperCase())) {
        return NextResponse.json({ message: "已签约或已重签合同不允许直接编辑，请发起重签" }, { status: 400 });
      }
      db.prepare(`
        UPDATE contracts
        SET project_id = ?, company_id = ?, contract_no = ?, title = ?, total_amount = ?, status = ?,
            signed_at = ?, effective_at = ?, expire_at = ?, file_url = ?, content = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        project.id,
        customer.company_id,
        contractNo,
        title,
        totalAmount,
        finalContractStatus,
        signedAt,
        effectiveAt,
        expireAt,
        attachments[0]?.file_url || null,
        JSON.stringify(content),
        contractId
      );
    } else {
      contractId = makeId("CON");
      db.prepare(`
        INSERT INTO contracts (
          id, project_id, company_id, contract_no, title, total_amount, status,
          signed_at, effective_at, expire_at, file_url, content, created_by_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        contractId,
        project.id,
        customer.company_id,
        contractNo,
        title,
        totalAmount,
        finalContractStatus,
        signedAt,
        effectiveAt,
        expireAt,
        attachments[0]?.file_url || null,
        JSON.stringify(content),
        createdById
      );
    }

    db.prepare("DELETE FROM payment_plans WHERE contract_id = ?").run(contractId);
    if (!isDraftSave && approvalPlan) {
      createContractApprovalInstance(db, approvalPlan, {
        contractId,
        customerId: params.id,
        projectId: project.id,
        createdById,
        title,
      });
      db.prepare(`
        UPDATE customers
        SET current_action = '合同待审批',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(customer.id);
    } else if (!isDraftSave) {
      const insertPlan = db.prepare(`
        INSERT INTO payment_plans (id, project_id, contract_id, milestone, due_date, amount, status, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, datetime('now'), datetime('now'))
      `);
      paymentStages.forEach((stage: any, index: number) => {
        const ratio = Number(stage.ratio || 0);
        const amount = Number.isFinite(Number(stage.amount)) ? toMoney(Number(stage.amount)) : toMoney(payableAmount * ratio / 100);
        if (amount <= 0 && ratio <= 0) return;
        insertPlan.run(
          makeId("PP"),
          project.id,
          contractId,
          String(stage.name || `第${index + 1}期款`).trim(),
          String(stage.due_date || "").trim() || null,
          amount,
          index + 1
        );
      });
    }

    if (!isDraftSave && !approvalPlan) {
      markSourceContractResigned(db, resignSourceContract?.id, contractId);
      db.prepare(`
        UPDATE projects
        SET contract_amount = ?,
            status = CASE WHEN status IN ('LEAD','DESIGNED','QUOTED') THEN 'SIGNED' ELSE status END,
            site_stage = COALESCE(site_stage, 'PENDING_START'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(totalAmount, project.id);

      db.prepare(`
        UPDATE customers
        SET status = CASE WHEN status IN ('NEW','CONTACTED','INVITED','MEASURED','DEPOSITED','PROPOSAL') THEN 'SIGNED' ELSE status END,
            current_action = '合同已创建',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(customer.id);
    }

    if (!isDraftSave) {
      syncCustomerProgress(db, customer.id);
    }

    const created = listContracts(db, params.id).find((item) => item.id === contractId);
    recordCustomerOperation(db, {
      userId: createdById,
      customerId: params.id,
      action: existingContractId ? "customer.contract.update" : isDraftSave ? "customer.contract.save_draft" : "customer.contract.create",
      module: "合同资料",
      title: existingContractId ? "编辑合同" : isDraftSave ? "暂存合同" : "创建合同",
      content: `${title}，合同金额：${formatAmount(totalAmount)} 元${approvalPlan ? "，已提交审批" : ""}`,
      targetName: title,
      metadata: { contractId, contractNo, totalAmount, status: finalContractStatus },
      ipAddress: getRequestIp(req),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "创建合同失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有合同管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureContractTables(db);
    const customer = getCustomer(db, params.id, auth.companyId);
    if (!customer) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

    const contractId = String(req.nextUrl.searchParams.get("contract_id") || "").trim();
    if (!contractId) return NextResponse.json({ message: "缺少合同ID" }, { status: 400 });

    const contract = db.prepare(`
      SELECT c.*, p.customer_id
      FROM contracts c
      INNER JOIN projects p ON c.project_id = p.id
      WHERE c.id = ? AND p.customer_id = ? AND c.deleted_at IS NULL
      LIMIT 1
    `).get(contractId, params.id) as any;

    if (!contract) return NextResponse.json({ message: "合同不存在或已删除" }, { status: 404 });
    if (["SIGNED", "RESIGNED"].includes(String(contract.status || "").toUpperCase())) {
      return NextResponse.json({ message: "已签约或已重签合同不允许删除" }, { status: 400 });
    }

    const tx = (db as any).transaction(() => {
      db.prepare("DELETE FROM payment_plans WHERE contract_id = ?").run(contractId);
      db.prepare(`
        UPDATE contract_approval_steps
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE contract_id = ? AND deleted_at IS NULL
      `).run(contractId);
      db.prepare(`
        UPDATE contract_approval_instances
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE contract_id = ? AND deleted_at IS NULL
      `).run(contractId);
      db.prepare(`
        UPDATE contracts
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(contractId);
    });
    tx();
    syncCustomerProgress(db, params.id);
    recordCustomerOperation(db, {
      userId: auth.userId,
      customerId: params.id,
      action: "customer.contract.delete",
      module: "合同资料",
      title: "删除合同",
      content: `${contract.title || "未命名合同"}，合同金额：${formatAmount(Number(contract.total_amount || 0))} 元`,
      targetName: contract.title || "",
      metadata: { contractId, contractNo: contract.contract_no || "", totalAmount: Number(contract.total_amount || 0) },
      ipAddress: getRequestIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "删除合同失败" }, { status: 500 });
  }
}
