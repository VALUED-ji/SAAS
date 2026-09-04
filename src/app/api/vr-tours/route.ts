import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canEditCustomers, getAuthContext, projectBelongsToCompany } from "@/lib/security/authorization";

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

    CREATE INDEX IF NOT EXISTS idx_vr_tours_project ON vr_tours(project_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_project ON attachments(project_id);
  `);
  const attachmentColumns = db.prepare("PRAGMA table_info(attachments)").all() as { name: string }[];
  if (!attachmentColumns.some((column) => column.name === "user_id")) {
    db.prepare("ALTER TABLE attachments ADD COLUMN user_id TEXT REFERENCES users(id)").run();
  }
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

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有工地资料编辑权限" }, { status: 403 });

  try {
    const body = await req.json();
    const projectId = String(body?.project_id || "").trim();
    const title = String(body?.title || "VR全景").trim();
    const scenes = normalizeScenes(Array.isArray(body?.scenes) ? body.scenes : []);

    if (!projectId) return NextResponse.json({ message: "工地ID不能为空" }, { status: 400 });
    if (!projectBelongsToCompany(auth, projectId)) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
    if (scenes.length === 0) return NextResponse.json({ message: "请至少上传一个空间全景图" }, { status: 400 });

    const db = getDb();
    ensureVrTourTables(db);
    const project = db.prepare("SELECT id FROM projects WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(projectId, auth.companyId);
    if (!project) return NextResponse.json({ message: "工地不存在" }, { status: 404 });

    const tourId = makeId("VR");
    db.prepare(`
      INSERT INTO vr_tours (id, project_id, title, scenes, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(tourId, projectId, title, JSON.stringify(scenes));

    const attachmentId = makeId("ATT");
    const attachmentName = title.includes("VR") ? `${title}链接` : `${title}VR全景链接`;
    const attachmentUrl = `/vr-tour/${tourId}`;
    db.prepare(`
      INSERT INTO attachments (id, project_id, user_id, file_name, file_url, file_size, mime_type, category, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 'text/uri-list', '工地归档-VR全景', datetime('now'))
    `).run(attachmentId, projectId, auth.userId, attachmentName, attachmentUrl);

    const tour = db.prepare("SELECT * FROM vr_tours WHERE id = ?").get(tourId) as any;
    const attachment = db.prepare(`
      SELECT a.*, uploader.name AS uploader_name
      FROM attachments a
      LEFT JOIN users uploader ON uploader.id = a.user_id
      WHERE a.id = ?
    `).get(attachmentId);
    return NextResponse.json({ ...tour, scenes, attachment });
  } catch {
    return NextResponse.json({ message: "生成VR全景失败" }, { status: 500 });
  }
}
