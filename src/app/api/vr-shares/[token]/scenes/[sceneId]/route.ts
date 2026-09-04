import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const IMAGE_CONTENT_TYPES: Record<string, string> = {
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
};

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ message: "VR全景图片不存在" }, { status: 404 });
}

export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string; sceneId: string }> }) {
  const params = await paramsPromise;
  const token = String(params.token || "").trim();
  const sceneId = String(params.sceneId || "").trim();
  if (!token || token.length > 200 || !sceneId || sceneId.length > 200) return notFound();

  const db = getDb();
  const share = db.prepare(`
    SELECT s.expires_at, vt.project_id, vt.scenes
    FROM vr_tour_shares s
    INNER JOIN vr_tours vt ON vt.id = s.tour_id AND vt.deleted_at IS NULL
    INNER JOIN projects p ON p.id = vt.project_id AND p.deleted_at IS NULL
    INNER JOIN companies c ON c.id = p.company_id AND c.deleted_at IS NULL
    WHERE s.token = ? AND s.deleted_at IS NULL
    LIMIT 1
  `).get(token) as any;
  if (!share || (share.expires_at && new Date(share.expires_at).getTime() <= Date.now())) return notFound();

  let scenes: any[] = [];
  try {
    scenes = JSON.parse(share.scenes || "[]");
  } catch {
    return notFound();
  }
  const scene = scenes.find((item) => String(item?.id || "") === sceneId);
  const imageUrl = String(scene?.image_url || "").trim();
  const expectedPrefix = `/uploads/projects/${String(share.project_id)}/`;
  if (!imageUrl.startsWith(expectedPrefix)) return notFound();

  const relativeFileName = imageUrl.slice(expectedPrefix.length);
  let fileName = "";
  try {
    fileName = decodeURIComponent(relativeFileName);
  } catch {
    return notFound();
  }
  if (!fileName || path.basename(fileName) !== fileName) return notFound();
  const extension = path.extname(fileName).toLowerCase();
  const contentType = IMAGE_CONTENT_TYPES[extension];
  if (!contentType) return notFound();

  const projectRoot = path.resolve(process.cwd(), "public", "uploads", "projects", String(share.project_id));
  const absolutePath = path.resolve(projectRoot, fileName);
  if (!absolutePath.startsWith(`${projectRoot}${path.sep}`)) return notFound();

  try {
    const data = await readFile(absolutePath);
    return new NextResponse(data, {
      headers: {
        "Cache-Control": "private, max-age=300, must-revalidate",
        "Content-Type": contentType,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
