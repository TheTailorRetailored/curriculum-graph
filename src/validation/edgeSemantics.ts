import { CurriculumEdge, CurriculumNode, ValidationIssue } from "../schema/zodSchemas.js";

export function checkEncompassingEdge(edge: CurriculumEdge, target?: CurriculumNode, nearbyEdges: CurriculumEdge[] = []): ValidationIssue[] {
  if (edge.type !== "encompasses") return [];
  const issues: ValidationIssue[] = [];
  const nearby = nearbyEdges.some((candidate) =>
    candidate.id !== edge.id &&
    ((candidate.from === edge.from && candidate.to === edge.to) || (candidate.from === edge.to && candidate.to === edge.from)) &&
    ["requires", "supports", "part_of", "develops_into"].includes(candidate.type)
  );
  if (!nearby) issues.push({ code: "encompasses_without_nearby_relation", severity: "warning", edge_id: edge.id, message: "Encompassing edge has no nearby prerequisite/support/part relationship." });
  if (target?.grain_size === "container" || target?.type === "area" || target?.type === "strand") {
    issues.push({ code: "encompasses_target_too_broad", severity: "warning", edge_id: edge.id, message: "Target may be too broad to receive practice credit." });
  }
  if ((edge.weight ?? 0) > 0.75 && edge.confidence !== "high") {
    issues.push({ code: "high_encompassing_weight_low_confidence", severity: "warning", edge_id: edge.id, message: "High encompassing weight should have high confidence or strong rationale." });
  }
  return issues;
}
