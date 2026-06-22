import { CurriculumNode, ValidationIssue } from "../schema/zodSchemas.js";

const BROAD_TOPIC_LABELS = new Set(["fractions", "algebra", "number", "measurement", "space", "statistics", "probability", "grammar", "writing"]);

export function checkGranularity(node: CurriculumNode, hardPrereqCount = 0, childCount = 0): ValidationIssue[] {
  if (node.type !== "topic") return [];
  const issues: ValidationIssue[] = [];
  if (BROAD_TOPIC_LABELS.has(node.label.toLowerCase())) {
    issues.push({ code: "topic_too_broad", severity: "warning", node_id: node.id, message: `Topic label looks too broad: ${node.label}` });
  }
  const kpCount = node.knowledge_points?.length ?? 0;
  if (kpCount > 8) issues.push({ code: "too_many_knowledge_points", severity: "warning", node_id: node.id, message: "Topic has more than 8 knowledge points." });
  if (kpCount === 1 && node.grain_size !== "atomic") issues.push({ code: "single_knowledge_point", severity: "warning", node_id: node.id, message: "Topic has one knowledge point but is not marked atomic." });
  if (hardPrereqCount > 12) issues.push({ code: "too_many_hard_prerequisites", severity: "warning", node_id: node.id, message: "Topic has more than 12 hard prerequisites." });
  if (hardPrereqCount === 0 && !node.foundational) issues.push({ code: "no_prerequisites", severity: "warning", node_id: node.id, message: "Topic has no hard prerequisites and is not marked foundational." });
  if (node.grain_size !== "container" && childCount > 8) issues.push({ code: "many_child_topics", severity: "warning", node_id: node.id, message: "Non-container topic has many child topics." });
  return issues;
}
