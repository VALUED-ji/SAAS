export type OrgOrderNode = {
  id: string;
  parent_id: string | null;
  type: string;
};

export type OrgDropPosition = "before" | "after";

export function getOrgSiblingKey(unit: Pick<OrgOrderNode, "parent_id" | "type">) {
  return `${unit.parent_id ?? "__root__"}::${unit.type}`;
}

export function getOrgReorderableIds(units: OrgOrderNode[]) {
  const counts = new Map<string, number>();
  units.forEach((unit) => {
    const key = getOrgSiblingKey(unit);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set(units.filter((unit) => (counts.get(getOrgSiblingKey(unit)) || 0) > 1).map((unit) => unit.id));
}

export function canReorderOrgUnits(
  units: OrgOrderNode[],
  sourceId: string,
  targetId: string,
) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const source = units.find((unit) => unit.id === sourceId);
  const target = units.find((unit) => unit.id === targetId);
  if (!source || !target) return false;
  return getOrgSiblingKey(source) === getOrgSiblingKey(target);
}

export function reorderOrgUnits<T extends OrgOrderNode>(
  units: T[],
  sourceId: string,
  targetId: string,
  position: OrgDropPosition,
) {
  if (!canReorderOrgUnits(units, sourceId, targetId)) return units;

  const source = units.find((unit) => unit.id === sourceId)!;
  const siblingKey = getOrgSiblingKey(source);
  const siblings = units.filter((unit) => getOrgSiblingKey(unit) === siblingKey);
  const sourceIndex = siblings.findIndex((unit) => unit.id === sourceId);
  const targetIndex = siblings.findIndex((unit) => unit.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return units;

  const nextSiblings = [...siblings];
  const [moved] = nextSiblings.splice(sourceIndex, 1);
  let insertIndex = targetIndex + (position === "after" ? 1 : 0);
  if (sourceIndex < insertIndex) insertIndex -= 1;
  if (insertIndex === sourceIndex) return units;
  nextSiblings.splice(insertIndex, 0, moved);

  const siblingIds = new Set(nextSiblings.map((unit) => unit.id));
  let siblingIndex = 0;
  return units.map((unit) => (
    siblingIds.has(unit.id) ? nextSiblings[siblingIndex++] : unit
  ));
}

export function buildOrgTreeOrder<T extends OrgOrderNode>(units: T[]): T[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const childrenByParent = new Map<string | null, T[]>();
  units.forEach((unit) => {
    const parentId = unit.parent_id && byId.has(unit.parent_id) ? unit.parent_id : null;
    const siblings = childrenByParent.get(parentId) || [];
    siblings.push(unit);
    childrenByParent.set(parentId, siblings);
  });

  const ordered: T[] = [];
  const visit = (parentId: string | null) => {
    (childrenByParent.get(parentId) || []).forEach((unit) => {
      ordered.push(unit);
      visit(unit.id);
    });
  };
  visit(null);
  return ordered;
}
