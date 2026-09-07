import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "crypto";
import { getJwtSecret } from "@/lib/security/session";

type QuotationShareClaims = {
  quotationId: string;
  companyId: string;
  purpose: "quotation-share";
  exp?: number;
};

type VerifiedQuotationShareClaims = {
  quotationId: string;
  companyId: string;
  expiresAt?: number;
};

export function signQuotationShareToken(quotationId: string, companyId: string, maxAgeSeconds?: number | null) {
  const expiresAt = maxAgeSeconds ? Math.floor(Date.now() / 1000) + maxAgeSeconds : 0;
  const payload = Buffer.from(JSON.stringify([quotationId, companyId, expiresAt])).toString("base64url");
  const signature = createHmac("sha256", getJwtSecret()).update(`qs1.${payload}`).digest("base64url").slice(0, 22);
  return `qs1.${payload}.${signature}`;
}

function verifyCompactQuotationShareToken(token: string, expectedQuotationId?: string): VerifiedQuotationShareClaims | null {
  const match = token.match(/^qs1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match) return null;

  const signedValue = `qs1.${match[1]}`;
  const expectedSignature = createHmac("sha256", getJwtSecret()).update(signedValue).digest("base64url").slice(0, 22);
  const provided = Buffer.from(match[2]);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(decoded)) return null;
    const [quotationId, companyId, expiresAt] = decoded;
    if (!quotationId || !companyId) return null;
    if (expectedQuotationId && quotationId !== expectedQuotationId) return null;
    if (Number(expiresAt || 0) > 0 && Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;
    return {
      quotationId: String(quotationId),
      companyId: String(companyId),
      expiresAt: Number(expiresAt || 0) || undefined,
    };
  } catch {
    return null;
  }
}

export function verifyQuotationShareToken(token: string, expectedQuotationId?: string): VerifiedQuotationShareClaims | null {
  if (!token || token.length > 2048) return null;
  const compactClaims = verifyCompactQuotationShareToken(token, expectedQuotationId);
  if (compactClaims) return compactClaims;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as Partial<QuotationShareClaims>;
    if (decoded.purpose !== "quotation-share" || !decoded.quotationId || !decoded.companyId) return null;
    if (expectedQuotationId && decoded.quotationId !== expectedQuotationId) return null;
    return {
      quotationId: String(decoded.quotationId),
      companyId: String(decoded.companyId),
      expiresAt: Number(decoded.exp || 0) || undefined,
    };
  } catch {
    return null;
  }
}
