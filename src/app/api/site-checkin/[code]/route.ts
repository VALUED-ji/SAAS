import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getDb } from "@/lib/db";
import { ensureSiteCheckinTables } from "@/lib/site-checkin";
import { getRequestIp } from "@/lib/security/requestIp";
import { getAuthContext } from "@/lib/security/authorization";

const CHECKIN_WINDOW_MS = 60 * 1000;
const MAX_CHECKINS_PER_WINDOW = 10;
const CHECKIN_LOCATION_LIMIT_METERS = 500;
const MAX_CHECKIN_PHOTOS = 6;
const MAX_CHECKIN_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_CHECKIN_MULTIPART_BYTES = 54 * 1024 * 1024;
const ALLOWED_PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
type CheckinAttempt = { count: number; resetAt: number };
const globalCheckinState = globalThis as typeof globalThis & { __zxgjCheckinAttempts?: Map<string, CheckinAttempt> };
const checkinAttempts = globalCheckinState.__zxgjCheckinAttempts || new Map<string, CheckinAttempt>();
globalCheckinState.__zxgjCheckinAttempts = checkinAttempts;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const earthRadiusMeters = 6371000;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lngDelta = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function consumeCheckinAttempt(req: NextRequest, code: string) {
  const key = `${getRequestIp(req)}:${code}`;
  const now = Date.now();
  const current = checkinAttempts.get(key);
  if (!current || current.resetAt <= now) {
    checkinAttempts.set(key, { count: 1, resetAt: now + CHECKIN_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_CHECKINS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

function getCheckinByCode(db: ReturnType<typeof getDb>, code: string) {
  ensureSiteCheckinTables(db);
  return db.prepare(`
    SELECT checkin.*, COALESCE(NULLIF(customer.address, ''), NULLIF(p.address, ''), p.name) as project_name,
      COALESCE(NULLIF(customer.address, ''), NULLIF(p.address, '')) as project_address, p.manager_id,
      COALESCE(NULLIF(customer.address_location_name, ''), NULLIF(customer.address, ''), NULLIF(p.address, '')) as site_location_name,
      COALESCE(NULLIF(customer.address_location_address, ''), NULLIF(customer.house_address, ''), NULLIF(customer.address, ''), NULLIF(p.address, '')) as site_location_address,
      customer.address_latitude as site_latitude,
      customer.address_longitude as site_longitude,
      p.company_id,
      company.name as company_name, company.logo as company_logo,
      manager.name as manager_name, manager.phone as manager_phone
    FROM site_checkin_codes checkin
    INNER JOIN projects p ON checkin.project_id = p.id
    LEFT JOIN customers customer ON p.customer_id = customer.id
    LEFT JOIN companies company ON p.company_id = company.id
    LEFT JOIN users manager ON p.manager_id = manager.id
    WHERE checkin.code = ?
      AND p.deleted_at IS NULL
  `).get(code) as any;
}

function getCheckinUser(db: ReturnType<typeof getDb>, userId: string, companyId: string) {
  return db.prepare(`
    SELECT u.id, u.company_id, u.name, u.phone, u.role, r.name as role_name
    FROM users u
    LEFT JOIN roles r
      ON r.company_id = u.company_id
      AND r.code = u.role
      AND r.deleted_at IS NULL
      AND COALESCE(r.is_active, 1) = 1
    WHERE u.id = ? AND u.company_id = ? AND u.deleted_at IS NULL AND COALESCE(u.is_active, 1) = 1
    LIMIT 1
  `).get(userId, companyId) as any;
}

function getEmployeeCheckinStats(db: ReturnType<typeof getDb>, codeId: string, userId: string) {
  const row = db.prepare(`
    SELECT COUNT(*) as count, MAX(signed_at) as latest_signed_at
    FROM site_checkin_records
    WHERE code_id = ? AND user_id = ? AND deleted_at IS NULL
  `).get(codeId, userId) as any;
  return {
    count: Number(row?.count || 0),
    latestSignedAt: row?.latest_signed_at || null,
  };
}

function getExternalCheckinStats(db: ReturnType<typeof getDb>, codeId: string, personName: string, phone: string) {
  const row = phone
    ? db.prepare(`
      SELECT COUNT(*) as count, MAX(signed_at) as latest_signed_at
      FROM site_checkin_records
      WHERE code_id = ? AND checkin_source = 'external' AND phone = ? AND deleted_at IS NULL
    `).get(codeId, phone) as any
    : db.prepare(`
      SELECT COUNT(*) as count, MAX(signed_at) as latest_signed_at
      FROM site_checkin_records
      WHERE code_id = ? AND checkin_source = 'external' AND person_name = ? AND deleted_at IS NULL
    `).get(codeId, personName) as any;
  return {
    count: Number(row?.count || 0),
    latestSignedAt: row?.latest_signed_at || null,
  };
}

function safeFileName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, "_").slice(-120) || "photo.jpg";
}

function hasPrefix(buffer: Buffer, bytes: number[]) {
  return bytes.every((value, index) => buffer[index] === value);
}

function hasAscii(buffer: Buffer, offset: number, value: string) {
  return buffer.subarray(offset, offset + value.length).toString("ascii") === value;
}

function isAllowedCheckinPhoto(file: File, buffer: Buffer) {
  const extension = path.extname(String(file.name || "")).toLowerCase();
  if (!ALLOWED_PHOTO_EXTENSIONS.has(extension)) return false;
  if (file.size <= 0 || file.size > MAX_CHECKIN_PHOTO_BYTES) return false;
  if (extension === ".jpg" || extension === ".jpeg") return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (extension === ".png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === ".webp") return hasAscii(buffer, 0, "RIFF") && hasAscii(buffer, 8, "WEBP");
  if (extension === ".heic" || extension === ".heif") return hasAscii(buffer, 4, "ftyp");
  return false;
}

function getTextValue(source: Record<string, unknown> | FormData, key: string) {
  if (source instanceof FormData) return String(source.get(key) || "");
  return String(source[key] || "");
}

async function parseCheckinPayload(req: NextRequest) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    return { body: await req.json(), photoFiles: [] as File[] };
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_CHECKIN_MULTIPART_BYTES) {
    throw new Error("签到照片总大小不能超过54MB");
  }
  const formData = await req.formData();
  const photoFiles = formData.getAll("photos")
    .filter((item): item is File => typeof item === "object" && item !== null && "arrayBuffer" in item);
  if (photoFiles.length > MAX_CHECKIN_PHOTOS) throw new Error(`最多上传${MAX_CHECKIN_PHOTOS}张签到照片`);
  return { body: formData, photoFiles };
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ code: string }> }) {
  const params = await paramsPromise;
  const db = getDb();
  const code = decodeURIComponent(params.code || "");
  const item = getCheckinByCode(db, code);
  if (!item) return NextResponse.json({ message: "签到码不存在" }, { status: 404 });
  const auth = getAuthContext(req);
  const currentUser = auth && auth.companyId === String(item.company_id || "")
    ? getCheckinUser(db, auth.userId, auth.companyId)
    : null;

  const stats = db.prepare(`
    SELECT COUNT(*) as total_count,
      COUNT(DISTINCT COALESCE(NULLIF(user_id, ''), NULLIF(phone, ''), person_name)) as person_count,
      MAX(signed_at) as latest_signed_at
    FROM site_checkin_records
    WHERE code_id = ? AND deleted_at IS NULL
  `).get(item.id) as any;
  const currentUserCheckinStats = currentUser ? getEmployeeCheckinStats(db, item.id, currentUser.id) : { count: 0, latestSignedAt: null };

  return NextResponse.json({
    code: item.code,
    status: item.status,
    created_at: item.created_at,
    project_id: item.project_id,
    project_name: item.project_name,
    project_address: item.project_address,
    company_name: item.company_name,
    company_logo: item.company_logo,
    manager_name: item.manager_name,
    manager_phone: item.manager_phone,
    has_site_location: Number.isFinite(Number(item.site_latitude)) && Number.isFinite(Number(item.site_longitude)),
    location_limit_meters: CHECKIN_LOCATION_LIMIT_METERS,
    current_user: currentUser ? {
      id: currentUser.id,
      name: currentUser.name,
      phone: currentUser.phone,
      role: currentUser.role,
      role_name: currentUser.role_name || currentUser.role,
    } : null,
    login_required: !currentUser,
    total_count: Number(stats?.total_count || 0),
    person_count: Number(stats?.person_count || 0),
    current_user_checkin_count: currentUserCheckinStats.count,
    current_user_latest_signed_at: currentUserCheckinStats.latestSignedAt,
    latest_signed_at: stats?.latest_signed_at || null,
  });
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ code: string }> }) {
  const params = await paramsPromise;
  try {
    const db = getDb();
    const code = decodeURIComponent(params.code || "");
    if (!consumeCheckinAttempt(req, code)) {
      return NextResponse.json({ message: "签到操作过于频繁，请稍后再试" }, { status: 429 });
    }
    const item = getCheckinByCode(db, code);
    if (!item) return NextResponse.json({ message: "签到码不存在" }, { status: 404 });
    if (item.status !== "active") return NextResponse.json({ message: "该签到码已停用" }, { status: 400 });

    const { body, photoFiles } = await parseCheckinPayload(req);
    const auth = getAuthContext(req);
    const requestedExternal = getTextValue(body, "checkin_mode").trim() === "external";
    const currentUser = auth && auth.companyId === String(item.company_id || "") && !requestedExternal
      ? getCheckinUser(db, auth.userId, auth.companyId)
      : null;
    const checkinSource = currentUser ? "employee" : "external";
    let personName = currentUser ? String(currentUser.name || "").trim() : getTextValue(body, "person_name").trim();
    let phone = currentUser ? String(currentUser.phone || "").trim() : getTextValue(body, "phone").trim();
    let role = currentUser ? String(currentUser.role_name || currentUser.role || "员工").trim() : getTextValue(body, "role").trim();
    let companyName = currentUser ? "" : getTextValue(body, "company_name").trim();
    if (!personName) return NextResponse.json({ message: currentUser ? "当前账号姓名为空，请先完善个人资料" : "请填写签到人姓名" }, { status: 400 });
    if (personName.length > 40) return NextResponse.json({ message: "签到人姓名不能超过40个字" }, { status: 400 });
    if (phone && !/^1\d{10}$/.test(phone)) return NextResponse.json({ message: "请填写正确的手机号" }, { status: 400 });
    personName = personName.slice(0, 40);
    phone = phone.slice(0, 20);
    role = role.slice(0, 40);
    companyName = companyName.slice(0, 100);
    const remark = getTextValue(body, "remark").trim();
    const locationName = getTextValue(body, "location_name").trim();
    if (role.length > 40 || companyName.length > 100 || remark.length > 500 || locationName.length > 200) {
      return NextResponse.json({ message: "签到内容过长" }, { status: 400 });
    }
    const latitudeText = getTextValue(body, "latitude").trim();
    const longitudeText = getTextValue(body, "longitude").trim();
    const latitude = latitudeText === "" ? null : Number(latitudeText);
    const longitude = longitudeText === "" ? null : Number(longitudeText);
    if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
      || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      return NextResponse.json({ message: "定位坐标无效" }, { status: 400 });
    }
    if (latitude === null || longitude === null) {
      return NextResponse.json({ message: "请先允许手机获取定位后再签到" }, { status: 400 });
    }
    const siteLatitude = Number(item.site_latitude);
    const siteLongitude = Number(item.site_longitude);
    if (!Number.isFinite(siteLatitude) || !Number.isFinite(siteLongitude)) {
      return NextResponse.json({ message: "该客户资料未保存实际地址定位，请先在客户资料中通过地图选点保存" }, { status: 400 });
    }
    const distanceMeters = Math.round(getDistanceMeters(
      { latitude, longitude },
      { latitude: siteLatitude, longitude: siteLongitude },
    ));
    if (distanceMeters > CHECKIN_LOCATION_LIMIT_METERS) {
      return NextResponse.json({
        message: `当前位置距离工地约${distanceMeters}米，超过${CHECKIN_LOCATION_LIMIT_METERS}米范围，无法签到`,
        distance_meters: distanceMeters,
        limit_meters: CHECKIN_LOCATION_LIMIT_METERS,
      }, { status: 400 });
    }
    const photoBuffers: { file: File; buffer: Buffer }[] = [];
    for (const file of photoFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!isAllowedCheckinPhoto(file, buffer)) {
        return NextResponse.json({ message: "签到照片仅支持 JPG、PNG、WEBP、HEIC，单张不能超过8MB" }, { status: 400 });
      }
      photoBuffers.push({ file, buffer });
    }

    const id = `SCR${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    db.prepare(`
      INSERT INTO site_checkin_records (
        id, code_id, project_id, user_id, checkin_source, person_name, phone, role, company_name, remark,
        location_name, latitude, longitude, distance_meters, user_agent, signed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      item.id,
      item.project_id,
      currentUser?.id || null,
      checkinSource,
      personName,
      phone || null,
      role || null,
      companyName || null,
      remark || null,
      locationName || null,
      latitude,
      longitude,
      distanceMeters,
      String(req.headers.get("user-agent") || "").slice(0, 500) || null,
    );
    if (photoBuffers.length > 0) {
      const dir = path.join(process.cwd(), "public", "uploads", "site-checkins", String(item.project_id), id);
      await mkdir(dir, { recursive: true });
      const insertPhoto = db.prepare(`
        INSERT INTO site_checkin_photos (id, record_id, project_id, file_name, file_url, file_size, mime_type, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      for (const [index, photo] of photoBuffers.entries()) {
        const fileName = `${Date.now()}_${index + 1}_${safeFileName(photo.file.name)}`;
        await writeFile(path.join(dir, fileName), photo.buffer);
        insertPhoto.run(
          `SCP${Date.now()}${index}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          id,
          item.project_id,
          photo.file.name,
          `/uploads/site-checkins/${String(item.project_id)}/${id}/${fileName}`,
          photo.file.size,
          photo.file.type || "image/jpeg",
          index,
        );
      }
    }

    const personCheckinStats = currentUser
      ? getEmployeeCheckinStats(db, item.id, currentUser.id)
      : getExternalCheckinStats(db, item.id, personName, phone);

    return NextResponse.json({
      success: true,
      id,
      person_name: personName,
      person_checkin_count: personCheckinStats.count,
      person_latest_signed_at: personCheckinStats.latestSignedAt,
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "签到失败" }, { status: 500 });
  }
}
