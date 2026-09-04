import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEzvizConfigStatus, getEzvizLiveAddress } from "@/lib/ezviz";
import {
  createSiteCamera,
  decryptCameraSecret,
  encryptCameraSecret,
  ensureSiteCameraTables,
  getSiteCameraById,
  listSiteCameras,
  sanitizeSiteCamera,
} from "@/lib/site-cameras";
import {
  canEditCustomers,
  canViewCustomers,
  getAuthContext,
  isSameOriginMutation,
  projectBelongsToCompany,
} from "@/lib/security/authorization";

function cleanText(value: unknown, max = 80) {
  return String(value || "").trim().slice(0, max);
}

function normalizeChannelNo(value: unknown) {
  return Math.max(1, Math.min(64, Number(value || 1) || 1));
}

function getCameraProject(db: ReturnType<typeof getDb>, projectId: string, companyId: string) {
  return db.prepare(`
    SELECT id, company_id
    FROM projects
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(projectId, companyId) as any;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地查看权限" }, { status: 403 });

  const projectId = cleanText(req.nextUrl.searchParams.get("project_id"), 80);
  if (!projectId) return NextResponse.json({ message: "缺少工地 ID" }, { status: 400 });
  if (!projectBelongsToCompany(auth, projectId)) {
    return NextResponse.json({ message: "工地不存在" }, { status: 404 });
  }

  const db = getDb();
  ensureSiteCameraTables(db);
  return NextResponse.json({
    items: listSiteCameras(db, auth.companyId, [projectId]),
    ezviz: getEzvizConfigStatus(),
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "请求来源异常，请刷新页面后重试" }, { status: 403 });

  const db = getDb();
  ensureSiteCameraTables(db);
  const body = await req.json().catch(() => ({}));
  const action = cleanText(body.action, 40);

  if (action === "play") {
    if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地查看权限" }, { status: 403 });
    const cameraId = cleanText(body.camera_id, 80);
    const camera = getSiteCameraById(db, cameraId, auth.companyId);
    if (!camera || !projectBelongsToCompany(auth, camera.project_id)) {
      return NextResponse.json({ message: "摄像头不存在" }, { status: 404 });
    }
    if (String(camera.status || "") !== "active") {
      return NextResponse.json({ message: "该摄像头已停用" }, { status: 400 });
    }
    try {
      const live = await getEzvizLiveAddress({
        deviceSerial: camera.device_serial,
        channelNo: Number(camera.channel_no || 1),
        validateCode: decryptCameraSecret(camera.verify_code),
      });
      return NextResponse.json({
        success: true,
        camera: sanitizeSiteCamera(camera),
        live,
      });
    } catch (error: any) {
      return NextResponse.json({ message: error?.message || "获取实时画面失败" }, { status: 502 });
    }
  }

  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有工地操作权限" }, { status: 403 });

  if (action === "create") {
    const projectId = cleanText(body.project_id, 80);
    const name = cleanText(body.name, 40);
    const deviceSerial = cleanText(body.device_serial, 80).replace(/\s+/g, "");
    if (!projectId) return NextResponse.json({ message: "缺少工地 ID" }, { status: 400 });
    if (!projectBelongsToCompany(auth, projectId) || !getCameraProject(db, projectId, auth.companyId)) {
      return NextResponse.json({ message: "工地不存在" }, { status: 404 });
    }
    if (!name) return NextResponse.json({ message: "请输入摄像头名称" }, { status: 400 });
    if (!deviceSerial) return NextResponse.json({ message: "请输入萤石设备序列号" }, { status: 400 });
    const camera = createSiteCamera(db, {
      companyId: auth.companyId,
      projectId,
      userId: auth.userId,
      name,
      location: cleanText(body.location, 60),
      deviceSerial,
      channelNo: normalizeChannelNo(body.channel_no),
      verifyCode: cleanText(body.verify_code, 80),
      ownerVisible: Boolean(body.owner_visible),
    });
    return NextResponse.json({ success: true, camera: camera ? sanitizeSiteCamera(camera) : null });
  }

  if (action === "update") {
    const cameraId = cleanText(body.camera_id, 80);
    const camera = getSiteCameraById(db, cameraId, auth.companyId);
    if (!camera || !projectBelongsToCompany(auth, camera.project_id)) {
      return NextResponse.json({ message: "摄像头不存在" }, { status: 404 });
    }
    const name = cleanText(body.name, 40);
    const deviceSerial = cleanText(body.device_serial, 80).replace(/\s+/g, "");
    if (!name) return NextResponse.json({ message: "请输入摄像头名称" }, { status: 400 });
    if (!deviceSerial) return NextResponse.json({ message: "请输入萤石设备序列号" }, { status: 400 });
    const verifyCode = Object.prototype.hasOwnProperty.call(body, "verify_code")
      ? cleanText(body.verify_code, 80)
      : "";
    const verifyCodeSql = verifyCode ? encryptCameraSecret(verifyCode) : camera.verify_code;
    db.prepare(`
      UPDATE site_cameras
      SET name = ?, location = ?, device_serial = ?, channel_no = ?, verify_code = ?,
        owner_visible = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `).run(
      name,
      cleanText(body.location, 60),
      deviceSerial,
      normalizeChannelNo(body.channel_no),
      verifyCodeSql,
      body.owner_visible ? 1 : 0,
      cameraId,
      auth.companyId,
    );
    const nextCamera = getSiteCameraById(db, cameraId, auth.companyId);
    return NextResponse.json({ success: true, camera: nextCamera ? sanitizeSiteCamera(nextCamera) : null });
  }

  if (action === "delete") {
    const cameraId = cleanText(body.camera_id, 80);
    const camera = getSiteCameraById(db, cameraId, auth.companyId);
    if (!camera || !projectBelongsToCompany(auth, camera.project_id)) {
      return NextResponse.json({ message: "摄像头不存在" }, { status: 404 });
    }
    db.prepare(`
      UPDATE site_cameras
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `).run(cameraId, auth.companyId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ message: "未知操作" }, { status: 400 });
}

