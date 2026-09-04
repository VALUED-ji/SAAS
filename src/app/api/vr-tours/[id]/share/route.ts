import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canViewCustomers, getAuthContext } from "@/lib/security/authorization";

const EXPIRE_MS: Record<string, number | null> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  forever: null,
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function makeToken() {
  return crypto.randomBytes(18).toString("base64url");
}

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

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地查看权限" }, { status: 403 });

  try {
    const db = getDb();
    ensureVrShareTables(db);

    const tour = db.prepare(`
      SELECT vt.id
      FROM vr_tours vt
      INNER JOIN projects p ON p.id = vt.project_id
      WHERE vt.id = ? AND p.company_id = ? AND vt.deleted_at IS NULL AND p.deleted_at IS NULL
    `).get(params.id, auth.companyId) as any;
    if (!tour) return NextResponse.json({ message: "VR全景不存在" }, { status: 404 });

    const shares = db.prepare(`
      SELECT id, token, expires_at, created_at
      FROM vr_tour_shares
      WHERE tour_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    `).all(params.id) as any[];

    const latest = shares.find((share) => !share.expires_at || new Date(share.expires_at).getTime() > Date.now());
    if (!latest) {
      return NextResponse.json({ share: null });
    }

    return NextResponse.json({
      share: {
        id: latest.id,
        token: latest.token,
        share_url: `${req.nextUrl.origin}/vr-share/${latest.token}`,
        expires_at: latest.expires_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "读取分享链接失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有工地分享权限" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const expiresIn = String(body?.expiresIn || "7d");
    if (!(expiresIn in EXPIRE_MS)) {
      return NextResponse.json({ message: "分享有效期不正确" }, { status: 400 });
    }

    const db = getDb();
    ensureVrShareTables(db);

    const tour = db.prepare(`
      SELECT vt.id
      FROM vr_tours vt
      INNER JOIN projects p ON p.id = vt.project_id
      WHERE vt.id = ? AND p.company_id = ? AND vt.deleted_at IS NULL AND p.deleted_at IS NULL
    `).get(params.id, auth.companyId) as any;
    if (!tour) return NextResponse.json({ message: "VR全景不存在" }, { status: 404 });

    const duration = EXPIRE_MS[expiresIn];
    const expiresAt = duration === null ? null : new Date(Date.now() + duration).toISOString();
    let token = makeToken();
    while (db.prepare("SELECT id FROM vr_tour_shares WHERE token = ? LIMIT 1").get(token)) {
      token = makeToken();
    }

    const id = makeId("VRSH");
    db.prepare(`
      INSERT INTO vr_tour_shares (id, tour_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(id, params.id, token, expiresAt);

    const shareUrl = `${req.nextUrl.origin}/vr-share/${token}`;
    return NextResponse.json({
      id,
      token,
      share_url: shareUrl,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "生成分享链接失败" }, { status: 500 });
  }
}
