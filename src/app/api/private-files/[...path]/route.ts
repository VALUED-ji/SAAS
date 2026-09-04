import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  canManageMaterials,
  canViewCustomers,
  customerBelongsToCompany,
  getAuthContext,
  orgBelongsToCompany,
  projectBelongsToCompany,
} from "@/lib/security/authorization";

const SAFE_BUSINESS_ID = /^[A-Za-z0-9_-]{1,100}$/;
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".dwg": "application/acad",
  ".dxf": "application/dxf",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ path: string[] }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const parts = Array.isArray(params.path) ? params.path : [];
  if (parts.length !== 3) return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  const [scope, businessId, fileName] = parts;
  if (!SAFE_BUSINESS_ID.test(businessId) || !fileName || path.basename(fileName) !== fileName) {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }
  if (scope === "customers") {
    if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户资料查看权限" }, { status: 403 });
    if (!customerBelongsToCompany(auth, businessId)) return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  } else if (scope === "projects") {
    if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地资料查看权限" }, { status: 403 });
    if (!projectBelongsToCompany(auth, businessId)) return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  } else if (scope === "materials") {
    if (!canManageMaterials(auth)) return NextResponse.json({ message: "没有材料图片查看权限" }, { status: 403 });
    const material = getDb().prepare(`
      SELECT id FROM materials
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(businessId, auth.companyId);
    if (!material) return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  } else if (scope === "users") {
    const user = getDb().prepare(`
      SELECT id FROM users
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(businessId, auth.companyId);
    if (!user) return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  } else if (scope === "branches") {
    if (!orgBelongsToCompany(auth, businessId)) return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  } else {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }

  const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
  const absolutePath = path.resolve(uploadRoot, scope, businessId, fileName);
  if (!absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }

  try {
    const data = await readFile(absolutePath);
    const extension = path.extname(fileName).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
    const canDisplayInline = contentType.startsWith("image/") || contentType.startsWith("video/") || extension === ".pdf";
    return new NextResponse(data, {
      headers: {
        "Cache-Control": "private, max-age=300, must-revalidate",
        "Content-Disposition": `${canDisplayInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Type": contentType,
        "Referrer-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "文件不存在" }, { status: 404 });
  }
}
