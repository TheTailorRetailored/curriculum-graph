import { CurriculumEdge, CurriculumNode, ValidationIssue } from "../schema/zodSchemas.js";

export function checkEncompassingEdge(edge: CurriculumEdge, target?: CurriculumNode, nearbyEdges: CurriculumEdge[] = []): ValidationIssue[] {
  if (edge.type !== "encompasses") return [];
  const issues: ValidationIssue[] = [];
  const directNearby = nearbyEdges.some((candidate) =>
    candidate.id !== edge.id &&
    ((candidate.from === edge.from && candidate.to === edge.to) || (candidate.from === edge.to && candidate.to === edge.from)) &&
    ["requires", "supports", "part_of", "develops_into"].includes(candidate.type)
  );
  const fromParents = new Set(nearbyEdges.filter((candidate) => candidate.type === "part_of" && candidate.from === edge.from).map((candidate) => candidate.to));
  const toParents = new Set(nearbyEdges.filter((candidate) => candidate.type === "part_of" && candidate.from === edge.to).map((candidate) => candidate.to));
  const sharedStructuralParent = [...fromParents].some((parent) => toParents.has(parent));
  if (!directNearby && !sharedStructuralParent) {
    issues.push({
      code: "encompasses_without_nearby_relation",
      severity: "warning",
      edge_id: edge.id,
      message: "Encompassing edge is valid; consider adding a nearby part_of, supports, or requires edge if that relationship is appropriate."
    });
  }
  if (target?.grain_size === "container" || target?.type === "area" || target?.type === "strand") {
    issues.push({ code: "encompasses_target_too_broad", severity: "warning", edge_id: edge.id, message: "Target may be too broad to receive practice credit." });
  }
  if ((edge.weight ?? 0) > 0.75 && edge.confidence !== "high") {
    issues.push({ code: "high_encompassing_weight_low_confidence", severity: "warning", edge_id: edge.id, message: "High encompassing weight should have high confidence or strong rationale." });
  }
  return issues;
}
