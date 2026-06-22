import { EDGE_ID_PATTERN, ID_PATTERN } from "../schema/constants.js";
import { labelToSlug } from "./text.js";

export function isValidNodeId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function isValidEdgeId(id: string): boolean {
  return EDGE_ID_PATTERN.test(id);
}

export function slugLooksLikeLabel(id: string, label: string): boolean {
  const slug = id.split(".").at(-1) ?? "";
  const labelSlug = labelToSlug(label);
  return labelSlug.includes(slug) || slug.includes(labelSlug.split("_")[0] ?? labelSlug);
}
