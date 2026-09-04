import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canEditCustomers, canViewCustomers, getAuthContext } from "@/lib/security/authorization";

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function ensureVrTourTables(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vr_tours (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      scenes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      customer_id TEXT REFERENCES customers(id),
      followup_id TEXT REFERENCES follow_ups(id),
      user_id TEXT REFERENCES users(id),
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function normalizeScenes(value: any[]) {
  return value
    .map((scene, index) => {
      const name = String(scene?.name || scene?.space_name || "").trim();
      const imageUrl = String(scene?.image_url || scene?.file_url || "").trim();
      if (!name || !imageUrl) return null;
      return {
        id: String(scene?.id || makeId("VRS")),
        name,
        image_url: imageUrl,
        file_name: String(scene?.file_name || `${name}全景图`).trim(),
        sort_order: Number(scene?.sort_order ?? index),
      };
    })
    .filter(Boolean);
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地查看权限" }, { status: 403 });

  const db = getDb();
  ensureVrTourTables(db);
  const row = db.prepare(`
    SELECT
      vt.*,
      p.name AS project_name,
      p.address AS project_address,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.address AS customer_address,
      c.house_address AS customer_house_address
    FROM vr_tours vt
    LEFT JOIN projects p ON p.id = vt.project_id
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE vt.id = ? AND p.company_id = ? AND vt.deleted_at IS NULL
  `).get(params.id, auth.companyId) as any;

  if (!row) return NextResponse.json({ message: "VR全景不存在" }, { status: 404 });

  let scenes: any[] = [];
  try {
    scenes = JSON.parse(row.scenes || "[]");
  } catch {
    scenes = [];
  }

  return NextResponse.json({
    ...row,
    scenes: scenes
      .filter((scene) => scene?.image_url)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
  });
}

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有工地资料编辑权限" }, { status: 403 });

  try {
    const body = await req.json();
    const title = String(body?.title || "VR全景").trim();
    const scenes = normalizeScenes(Array.isArray(body?.scenes) ? body.scenes : []);
    if (scenes.length === 0) return NextResponse.json({ message: "请至少保留一个空间全景图" }, { status: 400 });

    const db = getDb();
    ensureVrTourTables(db);
    const tour = db.prepare(`
      SELECT vt.id
      FROM vr_tours vt
      INNER JOIN projects p ON p.id = vt.project_id
      WHERE vt.id = ? AND p.company_id = ? AND vt.deleted_at IS NULL AND p.deleted_at IS NULL
    `).get(params.id, auth.companyId) as any;
    if (!tour) return NextResponse.json({ message: "VR全景不存在" }, { status: 404 });

    db.prepare(`
      UPDATE vr_tours
      SET title = ?, scenes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(title, JSON.stringify(scenes), params.id);

    const attachmentName = title.includes("VR") ? `${title}链接` : `${title}VR全景链接`;
    db.prepare(`
      UPDATE attachments
      SET file_name = ?
      WHERE file_url = ? AND mime_type = 'text/uri-list'
    `).run(attachmentName, `/vr-tour/${params.id}`);

    const updated = db.prepare("SELECT * FROM vr_tours WHERE id = ?").get(params.id) as any;
    return NextResponse.json({ ...updated, scenes });
  } catch {
    return NextResponse.json({ message: "保存VR全景失败" }, { status: 500 });
  }
}
