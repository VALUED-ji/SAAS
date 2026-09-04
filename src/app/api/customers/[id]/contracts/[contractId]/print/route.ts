import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import {
  buildContractTemplateSnapshot,
  ensureContractTemplateTables,
  getDefaultContractTemplate,
  renderContractTemplateHtml,
} from "@/lib/contractTemplates";
import { canViewCustomers, getAuthContext } from "@/lib/security/authorization";

function parseJson(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRenderedContractHtml(value: string) {
  return String(value || "")
    .replace(/&lt;span\b[\s\S]*?&gt;/gi, "")
    .replace(/&lt;\/span&gt;/gi, "");
}

function buildPrintShell(params: {
  title: string;
  contractNo: string;
  status: string;
  html: string;
  watermark?: string;
}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title || "合同打印")}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f7; color: #182230; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; border-bottom: 1px solid #dce4ef; background: rgba(255,255,255,.94); backdrop-filter: blur(12px); }
    .toolbar h1 { margin: 0; font-size: 15px; line-height: 22px; }
    .toolbar p { margin: 2px 0 0; font-size: 12px; color: #667085; }
    .toolbar button { height: 36px; border: 1px solid #407aff; background: #407aff; color: #fff; padding: 0 16px; font-size: 13px; font-weight: 700; cursor: pointer; border-radius: 10px; }
    .page-wrap { padding: 28px 16px 48px; }
    .a4 { position: relative; width: 794px; min-height: 1123px; margin: 0 auto; background: #fff; padding: 40px 48px; box-shadow: 0 20px 50px rgba(15,23,42,.12); }
    .watermark { position: fixed; inset: 0; pointer-events: none; display: grid; place-items: center; color: rgba(217,45,32,.12); font-size: 92px; font-weight: 900; transform: rotate(-28deg); letter-spacing: 16px; }
    .document { color: #182230; font-size: 14px; line-height: 1.75; }
    .document h1, .document h2, .document h3, .document h4 { margin: 0 0 12px; color: #111827; font-weight: 700; line-height: 1.45; }
    .document h1 { font-size: 24px; text-align: center; }
    .document h2 { font-size: 20px; }
    .document h3 { font-size: 17px; }
    .document p, .document div { margin: 0 0 10px; min-height: 1em; }
    .document ul, .document ol { margin: 0 0 12px 24px; padding: 0; }
    .document li { margin: 0 0 6px; padding-left: 2px; }
    .contract-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
    .contract-table th, .contract-table td { border: 1px solid #cfd7e3; padding: 8px 10px; text-align: left; vertical-align: top; }
    .contract-table th { background: #f6f8fb; font-weight: 700; }
    .document img, .document .word-import-image { display: block; max-width: 100%; height: auto; margin: 10px auto; }
    .document img[data-align="left"] { margin-left: 0; margin-right: auto; }
    .document img[data-align="right"] { margin-left: auto; margin-right: 0; }
    .document .subtitle { color: #667085; font-size: 15px; text-align: center; }
    .document hr { margin: 22px 0; border: 0; border-top: 1px dashed #cbd5e1; }
    .contract-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 26px; }
    .contract-signatures > div, .contract-seal { min-height: 110px; border: 1px solid #dce4ef; padding: 14px; }
    .contract-missing-variable, .contract-empty { color: #98a2b3; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page-wrap { padding: 0; }
      .a4 { width: auto; min-height: auto; box-shadow: none; padding: 0; }
      .watermark { position: fixed; }
      @page { size: A4; margin: 10.5mm 12.7mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>${escapeHtml(params.title || "合同打印")}</h1>
      <p>合同编号：${escapeHtml(params.contractNo || "-")} · 状态：${escapeHtml(params.status || "-")}</p>
    </div>
    <button type="button" onclick="window.print()">打印合同</button>
  </div>
  ${params.watermark ? `<div class="watermark">${escapeHtml(params.watermark)}</div>` : ""}
  <main class="page-wrap">
    <article class="a4">
      <section class="document">${params.html}</section>
    </article>
  </main>
  <script>
    if (window.location.hash === "#print") {
      window.addEventListener("load", function () {
        window.setTimeout(function () { window.print(); }, 250);
      });
    }
  </script>
</body>
</html>`;
}

export async function GET(
  _req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string; contractId: string }> },
) {
  const params = await paramsPromise;
  const auth = getAuthContext(_req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有合同查看权限" }, { status: 403 });

  const db = getDb();
  ensureContractTemplateTables(db);
  const contract = db.prepare(`
    SELECT c.*, p.customer_id, p.name as project_name, p.address as project_address,
      customer.name as customer_name, customer.phone as customer_phone, customer.address as customer_address,
      company.name as company_name, company.phone as company_phone, company.address as company_address
    FROM contracts c
    INNER JOIN projects p ON c.project_id = p.id
    INNER JOIN customers customer ON p.customer_id = customer.id
    LEFT JOIN companies company ON c.company_id = company.id
    WHERE c.id = ? AND p.customer_id = ? AND c.company_id = ? AND c.deleted_at IS NULL
    LIMIT 1
  `).get(params.contractId, params.id, auth.companyId) as any;
  if (!contract) return NextResponse.json({ message: "合同不存在或已删除" }, { status: 404 });

  const content = parseJson(contract.content);
  const fullContract = { ...contract, content };
  const customer = {
    id: params.id,
    company_id: auth.companyId,
    name: contract.customer_name,
    phone: contract.customer_phone,
    address: contract.customer_address,
    company_name: contract.company_name,
    company_phone: contract.company_phone,
    company_address: contract.company_address,
  };
  const project = {
    id: contract.project_id,
    name: contract.project_name,
    address: contract.project_address,
  };
  const branch = getBranchSettingsForCustomer(db, params.id);
  const snapshot = content.document_snapshot;
  const status = String(contract.status || "DRAFT").toUpperCase();
  const shouldWatermark = !["SIGNED", "RESIGNED"].includes(status);
  let renderedHtml = String(snapshot?.rendered_html || "");

  if (!renderedHtml) {
    const template = getDefaultContractTemplate(db, {
      companyId: auth.companyId,
      orgUnitId: String(branch.org_unit_id || ""),
      contractType: String(content.contract_type || "装修施工合同"),
      createIfMissing: Boolean(branch.org_unit_id),
      userId: auth.userId,
    });
    if (template) {
      const newSnapshot = buildContractTemplateSnapshot({
        template,
        customer,
        project,
        contract: fullContract,
        branchBasicInfo: branch.settings.basicInfo,
        frozen: false,
      });
      renderedHtml = newSnapshot.rendered_html;
    } else {
      renderedHtml = renderContractTemplateHtml("", {
        customer,
        project,
        contract: fullContract,
        branchBasicInfo: branch.settings.basicInfo,
      }).html;
    }
  }
  renderedHtml = normalizeRenderedContractHtml(renderedHtml);

  return new NextResponse(buildPrintShell({
    title: contract.title,
    contractNo: contract.contract_no,
    status,
    html: renderedHtml,
    watermark: shouldWatermark ? "草稿" : "",
  }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
