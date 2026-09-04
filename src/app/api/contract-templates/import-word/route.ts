import { NextRequest, NextResponse } from "next/server";
import * as mammoth from "mammoth";
import { getDb } from "@/lib/db";
import { sanitizeContractTemplateHtml } from "@/lib/contractTemplates";
import { canManageOrganization, getAuthContext, hasPermission } from "@/lib/security/authorization";

const MAX_WORD_IMPORT_BYTES = 15 * 1024 * 1024;

function canManageBranchSettings(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return canManageOrganization(auth) || hasPermission(auth, "settings.manage");
}

function hasZipSignature(buffer: Buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function normalizeImportedHtml(html: string) {
  const sanitized = sanitizeContractTemplateHtml(html);
  return sanitized
    .replace(/<p>\s*<\/p>/gi, "<p><br /></p>")
    .replace(/<table/g, '<table class="contract-table word-import-table"')
    .replace(/<img/g, '<img class="word-import-image"');
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageBranchSettings(auth)) return NextResponse.json({ message: "没有合同模板导入权限" }, { status: 403 });

  try {
    const formData = await req.formData();
    const orgUnitId = String(formData.get("org_unit_id") || "").trim();
    const fileValue = formData.get("file");
    const file = fileValue && typeof fileValue === "object" && "arrayBuffer" in fileValue ? fileValue as File : null;
    if (!orgUnitId) return NextResponse.json({ message: "缺少分公司 ID" }, { status: 400 });
    if (!file) return NextResponse.json({ message: "请选择要导入的 Word 文件" }, { status: 400 });

    const db = getDb();
    const org = db.prepare(`
      SELECT id, COALESCE(is_active, 1) as is_active
      FROM org_units
      WHERE id = ? AND company_id = ? AND type = 'company' AND deleted_at IS NULL
      LIMIT 1
    `).get(orgUnitId, auth.companyId) as any;
    if (!org) return NextResponse.json({ message: "分公司不存在" }, { status: 404 });
    if (Number(org.is_active ?? 1) !== 1) return NextResponse.json({ message: "该分公司已停用，不能导入合同模板" }, { status: 400 });

    const fileName = String(file.name || "").trim();
    if (!/\.docx$/i.test(fileName)) {
      return NextResponse.json({ message: "请上传 .docx 格式的 Word 文件；旧版 .doc 请先另存为 .docx" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_WORD_IMPORT_BYTES) {
      return NextResponse.json({ message: "Word 文件大小必须在 15MB 以内" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasZipSignature(buffer)) return NextResponse.json({ message: "文件内容不是有效的 .docx 文件" }, { status: 400 });

    const result = await mammoth.convertToHtml(
      { buffer },
      {
        includeDefaultStyleMap: true,
        includeEmbeddedStyleMap: true,
        convertImage: mammoth.images.imgElement(async (image) => {
          const imageBuffer = await image.read();
          return {
            src: `data:${image.contentType};base64,${imageBuffer.toString("base64")}`,
          };
        }),
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='标题'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='标题 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='标题 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='标题 3'] => h3:fresh",
          "p[style-name='Subtitle'] => p.subtitle:fresh",
          "p[style-name='副标题'] => p.subtitle:fresh",
          "r[style-name='Strong'] => strong",
          "r[style-name='强调'] => strong",
        ],
      },
    );

    const html = normalizeImportedHtml(result.value);
    if (!html) return NextResponse.json({ message: "未能读取 Word 正文内容" }, { status: 400 });

    return NextResponse.json({
      html,
      file_name: fileName,
      warnings: result.messages.map((item) => item.message).filter(Boolean).slice(0, 8),
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "导入 Word 失败" }, { status: 500 });
  }
}
