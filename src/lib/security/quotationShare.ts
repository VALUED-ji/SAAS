import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/security/session";

type QuotationShareClaims = {
  quotationId: string;
  companyId: string;
  purpose: "quotation-share";
};

export function signQuotationShareToken(quotationId: string, companyId: string, maxAgeSeconds?: number | null) {
  const payload = { quotationId, companyId, purpose: "quotation-share" } satisfies QuotationShareClaims;
  if (!maxAgeSeconds) return jwt.sign(payload, getJwtSecret());
  return jwt.sign(payload, getJwtSecret(), { expiresIn: maxAgeSeconds });
}

export function verifyQuotationShareToken(token: string, expectedQuotationId?: string) {
  if (!token || token.length > 2048) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as Partial<QuotationShareClaims>;
    if (decoded.purpose !== "quotation-share" || !decoded.quotationId || !decoded.companyId) return null;
    if (expectedQuotationId && decoded.quotationId !== expectedQuotationId) return null;
    return {
      quotationId: String(decoded.quotationId),
      companyId: String(decoded.companyId),
    };
  } catch {
    return null;
  }
}
