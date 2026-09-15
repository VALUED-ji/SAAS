import { randomBytes } from "crypto";
import type Database from "better-sqlite3";
import type { NextRequest } from "next/server";
import { verifyQuotationShareToken } from "@/lib/security/quotationShare";
import { getPublicAppOrigin } from "@/lib/security/requestOrigin";

const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function ensureQuotationShareShortLinkSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_share_short_links (
      code TEXT PRIMARY KEY,
      target_url TEXT NOT NULL UNIQUE,
      quotation_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_quotation_share_short_links_quotation ON quotation_share_short_links(quotation_id, company_id);
  `);
}

function makeShortCode(length = 7) {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) code += SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length];
  return code;
}

export function getVerifiedQuotationShareTarget(value: string, origin: string) {
  const url = new URL(value, origin);
  const match = url.pathname.match(/^\/(?:q|quotation-share)\/([^/]+)$/);
  if (!match?.[1]) return null;
  const token = decodeURIComponent(match[1]);
  const claims = verifyQuotationShareToken(token);
  if (!claims) return null;
  return { url, claims };
}

export function createQuotationShareShortUrl(req: NextRequest, db: Database.Database, targetValue: string) {
  ensureQuotationShareShortLinkSchema(db);
  const origin = getPublicAppOrigin(req);
  const verified = getVerifiedQuotationShareTarget(targetValue, origin);
  if (!verified) return "";
  const targetUrl = `${verified.url.pathname}${verified.url.search}`;
  const existing = db.prepare("SELECT code FROM quotation_share_short_links WHERE target_url = ? LIMIT 1").get(targetUrl) as { code?: string } | undefined;
  if (existing?.code) return `${origin}/qs/${encodeURIComponent(existing.code)}`;

  const insert = db.prepare(`
    INSERT INTO quotation_share_short_links (code, target_url, quotation_id, company_id)
    VALUES (?, ?, ?, ?)
  `);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeShortCode();
    try {
      insert.run(code, targetUrl, verified.claims.quotationId, verified.claims.companyId);
      return `${origin}/qs/${encodeURIComponent(code)}`;
    } catch (error: any) {
      if (!String(error?.message || "").includes("UNIQUE")) throw error;
    }
  }
  return "";
}

export function resolveQuotationShareShortUrl(db: Database.Database, code: string) {
  ensureQuotationShareShortLinkSchema(db);
  const row = db.prepare("SELECT target_url FROM quotation_share_short_links WHERE code = ? LIMIT 1").get(code) as { target_url?: string } | undefined;
  if (!row?.target_url) return "";
  db.prepare("UPDATE quotation_share_short_links SET last_used_at = datetime('now') WHERE code = ?").run(code);
  return row.target_url;
}
