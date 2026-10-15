export function getQuotationSpaceSequences<T>(items: T[], getSpace: (item: T) => string): number[] {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const space = getSpace(item);
    const sequence = (counts.get(space) || 0) + 1;
    counts.set(space, sequence);
    return sequence;
  });
}

export function reorderQuotationSpaceItems<T>(
  items: T[],
  matches: (item: T) => boolean,
  getSpace: (item: T) => string,
  source: string,
  target: string,
  position: "before" | "after",
): T[] {
  if (source === target) return items;
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!matches(item)) continue;
    const space = getSpace(item);
    const group = groups.get(space) || [];
    group.push(item);
    groups.set(space, group);
  }
  if (!groups.has(source) || !groups.has(target)) return items;
  const spaces = [...groups.keys()].filter((space) => space !== source);
  const targetIndex = spaces.indexOf(target) + (position === "after" ? 1 : 0);
  spaces.splice(targetIndex, 0, source);
  const reordered = spaces.flatMap((space) => groups.get(space)!);
  let index = 0;
  // Replace only selected slots so unrelated items and fee references stay in place.
  return items.map((item) => matches(item) ? reordered[index++] : item);
}
