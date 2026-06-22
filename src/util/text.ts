export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function tokenize(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((part) => part.length > 2));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function labelToSlug(label: string): string {
  return normalizeText(label).replace(/\s+/g, "_");
}
