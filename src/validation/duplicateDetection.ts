import { CurriculumNode, PatchOperation, ValidationIssue } from "../schema/zodSchemas.js";
import { normalizeText, jaccard, tokenize } from "../util/text.js";
import { GraphIndex } from "../graph/loadGraph.js";

export function detectDuplicateNode(graph: GraphIndex, node: CurriculumNode, operation?: PatchOperation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (graph.nodesById.has(node.id)) {
    issues.push({ code: "duplicate_id", severity: "error", message: `Node id already exists: ${node.id}`, node_id: node.id });
  }
  const labelKey = normalizeText(node.label);
  for (const existing of graph.labels.get(labelKey) ?? []) {
    if (existing.id !== node.id) {
      issues.push({ code: "duplicate_label", severity: operation?.duplicate_resolution ? "warning" : "error", message: `Likely duplicate label: ${existing.id}`, node_id: node.id });
    }
  }
  for (const alias of node.aliases ?? []) {
    for (const existing of graph.labels.get(normalizeText(alias)) ?? []) {
      issues.push({ code: "alias_matches_existing_label", severity: operation?.duplicate_resolution ? "warning" : "error", message: `Alias matches existing label: ${existing.id}`, node_id: node.id });
    }
  }
  const candidateTokens = tokenize(`${node.label} ${node.description ?? ""}`);
  for (const existing of graph.nodes) {
    if (existing.id === node.id || existing.subject !== node.subject) continue;
    const score = jaccard(candidateTokens, tokenize(`${existing.label} ${existing.description ?? ""}`));
    if (score >= 0.82) {
      issues.push({ code: "likely_duplicate", severity: operation?.duplicate_resolution ? "warning" : "error", message: `Likely duplicate of ${existing.id} (${score.toFixed(2)})`, node_id: node.id });
    }
  }
  return issues;
}
