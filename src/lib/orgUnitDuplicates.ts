export type OrgUnitDuplicateCandidate = {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
};

export function normalizeOrgUnitDisplayName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeOrgUnitNameKey(value: unknown) {
  return normalizeOrgUnitDisplayName(value)
    .replace(/\s+/g, "")
    .toLocaleLowerCase("zh-CN");
}

export function getOrgUnitDuplicateScopeKey(parentId: string | null | undefined, type: string, name: string) {
  return [
    String(parentId || "").trim(),
    String(type || "").trim().toLowerCase(),
    normalizeOrgUnitNameKey(name),
  ].join("::");
}

export function findDuplicateOrgUnitIds(units: OrgUnitDuplicateCandidate[]) {
  const groups = new Map<string, string[]>();
  units.forEach((unit) => {
    const key = getOrgUnitDuplicateScopeKey(unit.parent_id, unit.type, unit.name);
    const ids = groups.get(key) || [];
    ids.push(unit.id);
    groups.set(key, ids);
  });
  return new Set(Array.from(groups.values()).filter((ids) => ids.length > 1).flat());
}

export function findSameScopeOrgUnits<T extends OrgUnitDuplicateCandidate>(
  units: T[],
  candidate: { id?: string; name: string; type: string; parent_id?: string | null },
) {
  const scopeKey = getOrgUnitDuplicateScopeKey(candidate.parent_id, candidate.type, candidate.name);
  return units.filter((unit) => (
    unit.id !== candidate.id
    && getOrgUnitDuplicateScopeKey(unit.parent_id, unit.type, unit.name) === scopeKey
  ));
}
