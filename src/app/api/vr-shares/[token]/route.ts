import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function ensureVrShareTables(db: ReturnType<typeof getDb>) {
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

    CREATE TABLE IF NOT EXISTS vr_tour_shares (
      id TEXT PRIMARY KEY,
      tour_id TEXT NOT NULL REFERENCES vr_tours(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT,
      view_count INTEGER DEFAULT 0,
      last_viewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_vr_tour_shares_tour ON vr_tour_shares(tour_id);
    CREATE INDEX IF NOT EXISTS idx_vr_tour_shares_token ON vr_tour_shares(token);
  `);
}

function publicSceneImageUrl(token: string, projectId: string, scene: any) {
  const imageUrl = String(scene?.image_url || "").trim();
  const sceneId = String(scene?.id || "").trim();
  if (!sceneId || !imageUrl.startsWith(`/uploads/projects/${projectId}/`)) return imageUrl;
  return `/api/vr-shares/${encodeURIComponent(token)}/scenes/${encodeURIComponent(sceneId)}`;
}

export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const db = getDb();
  ensureVrShareTables(db);

  const share = db.prepare(`
    SELECT *
    FROM vr_tour_shares
    WHERE token = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(params.token) as any;

  if (!share) return NextResponse.json({ message: "分享链接不存在" }, { status: 404 });
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ message: "分享链接已过期，请联系工作人员重新分享" }, { status: 410 });
  }

  const row = db.prepare(`
    SELECT
      vt.*,
      p.name AS project_name,
      p.address AS project_address,
      c.name AS customer_name,
      c.address AS customer_address,
      c.house_address AS customer_house_address
    FROM vr_tours vt
    LEFT JOIN projects p ON p.id = vt.project_id
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE vt.id = ? AND vt.deleted_at IS NULL
  `).get(share.tour_id) as any;

  if (!row) return NextResponse.json({ message: "VR全景不存在" }, { status: 404 });

  let scenes: any[] = [];
  try {
    scenes = JSON.parse(row.scenes || "[]");
  } catch {
    scenes = [];
  }

  db.prepare(`
    UPDATE vr_tour_shares
    SET view_count = COALESCE(view_count, 0) + 1, last_viewed_at = datetime('now')
    WHERE id = ?
  `).run(share.id);

  return NextResponse.json({
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    project_name: row.project_name,
    project_address: row.project_address,
    customer_address: row.customer_address,
    customer_house_address: row.customer_house_address,
    scenes: scenes
      .filter((scene) => scene?.image_url)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((scene) => ({
        ...scene,
        image_url: publicSceneImageUrl(params.token, String(row.project_id || ""), scene),
      })),
    share: {
      expires_at: share.expires_at,
    },
  });
}
