export type PackagePricingTierInput = {
  minArea?: number | string | null;
  maxArea?: number | string | null;
  unitPrice?: number | string | null;
};

export type PackageQuoteConfigInput = {
  mode?: string | null;
  packageAmount?: number | string | null;
  includedArea?: number | string | null;
  extraAreaPrice?: number | string | null;
  packageTiers?: PackagePricingTierInput[] | null;
};

export type PackagePriceSegment = {
  startArea: number;
  endArea: number;
  chargedArea: number;
  unitPrice: number;
  amount: number;
};

export type PackagePriceResult = {
  area: number;
  includedArea: number;
  packageAmount: number;
  extraArea: number;
  extraAmount: number;
  totalAmount: number;
  segments: PackagePriceSegment[];
};

export function toPricingAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function roundPricingMoney(value: number) {
  return Math.round(toPricingAmount(value) * 100) / 100;
}

export function calculatePackageQuotePrice(config: PackageQuoteConfigInput | null | undefined, inputArea: unknown): PackagePriceResult {
  const area = toPricingAmount(inputArea);
  const includedArea = toPricingAmount(config?.includedArea);
  const packageAmount = roundPricingMoney(toPricingAmount(config?.packageAmount));
  const tiers = Array.isArray(config?.packageTiers) ? config.packageTiers : [];
  const segments: PackagePriceSegment[] = [];

  if (area <= includedArea) {
    return {
      area,
      includedArea,
      packageAmount,
      extraArea: 0,
      extraAmount: 0,
      totalAmount: packageAmount,
      segments,
    };
  }

  let cursor = includedArea;
  const fallbackUnitPrice = toPricingAmount(config?.extraAreaPrice);
  const normalizedTiers = tiers.length > 0
    ? tiers.map((tier) => ({
      maxArea: toPricingAmount(tier?.maxArea),
      unitPrice: toPricingAmount(tier?.unitPrice ?? fallbackUnitPrice),
    }))
    : [{ maxArea: area, unitPrice: fallbackUnitPrice }];

  normalizedTiers.forEach((tier, index) => {
    if (area <= cursor) return;
    const isLastTier = index === normalizedTiers.length - 1;
    const configuredEnd = toPricingAmount(tier.maxArea);
    const tierEnd = configuredEnd > cursor ? Math.min(area, configuredEnd) : (isLastTier ? area : cursor);
    const chargedArea = Math.max(0, tierEnd - cursor);
    if (chargedArea <= 0) return;
    const unitPrice = toPricingAmount(tier.unitPrice);
    const amount = roundPricingMoney(chargedArea * unitPrice);
    segments.push({
      startArea: cursor,
      endArea: tierEnd,
      chargedArea,
      unitPrice,
      amount,
    });
    cursor = tierEnd;
  });

  if (area > cursor) {
    const lastTier = normalizedTiers[normalizedTiers.length - 1];
    const unitPrice = toPricingAmount(lastTier?.unitPrice ?? fallbackUnitPrice);
    const chargedArea = area - cursor;
    segments.push({
      startArea: cursor,
      endArea: area,
      chargedArea,
      unitPrice,
      amount: roundPricingMoney(chargedArea * unitPrice),
    });
  }

  const extraAmount = roundPricingMoney(segments.reduce((sum, segment) => sum + segment.amount, 0));
  return {
    area,
    includedArea,
    packageAmount,
    extraArea: roundPricingMoney(Math.max(0, area - includedArea)),
    extraAmount,
    totalAmount: roundPricingMoney(packageAmount + extraAmount),
    segments,
  };
}

export function formatPricingAmount(value: unknown, fractionDigits = 2) {
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toPricingAmount(value));
}
