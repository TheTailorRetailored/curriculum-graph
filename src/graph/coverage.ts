import { CurriculumEdge, CurriculumNode, ValidationIssue } from "../schema/zodSchemas.js";
import { GraphIndex } from "./loadGraph.js";
import { inferEffectiveRole, NodeRole } from "./roles.js";

export type NodeRoleFilter = {
  role?: string;
  roles?: string[];
  effective_role?: string;
  effective_roles?: string[];
};

export type CoverageInput = NodeRoleFilter & {
  subject?: string;
  strand?: string;
  area?: string;
  role_audit_limit?: number;
};

type NodeCoverage = {
  node_id: string;
  label: string;
  type: string;
  grain_size?: string;
  status: string;
  explicit_role?: NodeRole;
  effective_role: NodeRole;
  direct_knowledge_points: string[];
  effective_knowledge_points: string[];
  direct_misconceptions: string[];
  effective_misconceptions: string[];
  encompassed_child_count: number;
  requires_edge_count: number;
};

function kpId(value: CurriculumNode["knowledge_points"][number]): string {
  return typeof value === "string" ? value : value.id;
}

export function directKnowledgePointIds(graph: GraphIndex, nodeId: string): string[] {
  const node = graph.nodesById.get(nodeId);
  const ids = new Set<string>((node?.knowledge_points ?? []).map(kpId));
  for (const edge of graph.edges) {
    if (edge.from === nodeId && edge.type === "targets_knowledge_point") ids.add(edge.to);
  }
  return [...ids];
}

export function directMisconceptionIds(graph: GraphIndex, nodeId: string): string[] {
  return [...new Set(graph.edges.filter((edge) => edge.from === nodeId && edge.type === "has_misconception").map((edge) => edge.to))];
}

function encompassedDescendants(graph: GraphIndex, nodeId: string): string[] {
  const descendants = new Set<string>();
  const frontier = [nodeId];
  while (frontier.length > 0) {
    const current = frontier.shift() as string;
    for (const edge of graph.edges) {
      if (edge.type !== "encompasses" || edge.from !== current || descendants.has(edge.to)) continue;
      descendants.add(edge.to);
      frontier.push(edge.to);
    }
  }
  return [...descendants];
}

export function effectiveKnowledgePointIds(graph: GraphIndex, nodeId: string): string[] {
  const ids = new Set(directKnowledgePointIds(graph, nodeId));
  for (const descendant of encompassedDescendants(graph, nodeId)) {
    for (const kp of directKnowledgePointIds(graph, descendant)) ids.add(kp);
  }
  return [...ids];
}

export function effectiveMisconceptionIds(graph: GraphIndex, nodeId: string): string[] {
  const ids = new Set(directMisconceptionIds(graph, nodeId));
  for (const descendant of encompassedDescendants(graph, nodeId)) {
    for (const misconception of directMisconceptionIds(graph, descendant)) ids.add(misconception);
  }
  return [...ids];
}

export function matchesRoleFilter(node: CurriculumNode, input: NodeRoleFilter): boolean {
  if (input.role && node.role !== input.role) return false;
  if (input.roles?.length && (!node.role || !input.roles.includes(node.role))) return false;
  if (input.effective_role && node.effective_role !== input.effective_role) return false;
  if (input.effective_roles?.length && (!node.effective_role || !input.effective_roles.includes(node.effective_role))) return false;
  return true;
}

export function filteredCoverageNodes(graph: GraphIndex, input: CoverageInput): CurriculumNode[] {
  return graph.nodes.filter((node) =>
    (!input.subject || node.subject?.toLowerCase() === input.subject.toLowerCase()) &&
    (!input.strand || node.strand === input.strand) &&
    (!input.area || node.area === input.area) &&
    matchesRoleFilter(node, input)
  );
}

export function nodeCoverage(graph: GraphIndex, node: CurriculumNode): NodeCoverage {
  const directKps = directKnowledgePointIds(graph, node.id);
  const effectiveKps = effectiveKnowledgePointIds(graph, node.id);
  const directMisconceptions = directMisconceptionIds(graph, node.id);
  const effectiveMisconceptions = effectiveMisconceptionIds(graph, node.id);
  return {
    node_id: node.id,
    label: node.label,
    type: node.type,
    grain_size: node.grain_size,
    status: node.status,
    explicit_role: node.role,
    effective_role: node.effective_role ?? inferEffectiveRole(node),
    direct_knowledge_points: directKps,
    effective_knowledge_points: effectiveKps,
    direct_misconceptions: directMisconceptions,
    effective_misconceptions: effectiveMisconceptions,
    encompassed_child_count: graph.edges.filter((edge) => edge.from === node.id && edge.type === "encompasses").length,
    requires_edge_count: graph.edges.filter((edge) => edge.from === node.id && edge.type === "requires").length
  };
}

export function roleAwareCoverageWarnings(graph: GraphIndex, node: CurriculumNode): ValidationIssue[] {
  const coverage = nodeCoverage(graph, node);
  const role = coverage.effective_role;
  const warnings: ValidationIssue[] = [];

  if (node.status !== "active") return warnings;

  if (role === "curriculum_view") {
    if (coverage.encompassed_child_count === 0) {
      warnings.push({ code: "curriculum_view_has_no_encompassed_children", severity: "warning", node_id: node.id, message: "Active curriculum_view has no encompassed children." });
    }
    if (coverage.encompassed_child_count > 0 && coverage.effective_knowledge_points.length === 0) {
      warnings.push({ code: "curriculum_view_has_no_effective_kps", severity: "warning", node_id: node.id, message: "Active curriculum_view has no effective knowledge points from descendants." });
    }
  }

  if (role === "learner_state" && ["lesson_topic", "micro_topic", "atomic"].includes(node.grain_size ?? "")) {
    if (coverage.direct_knowledge_points.length === 0) {
      warnings.push({ code: "learner_state_missing_direct_kps", severity: "warning", node_id: node.id, message: "Active learner_state lesson_topic/micro_topic/atomic has no direct knowledge points." });
    }
    if (!node.foundational && coverage.requires_edge_count === 0) {
      warnings.push({ code: "learner_state_missing_prerequisites", severity: "warning", node_id: node.id, message: "Non-foundational learner_state has no prerequisite edges." });
    }
  }

  if (role === "mastery_claim") {
    const referencedByLearnerState = graph.edges.some((edge) => edge.type === "targets_knowledge_point" && edge.to === node.id && graph.nodesById.get(edge.from)?.effective_role === "learner_state");
    if (!referencedByLearnerState) warnings.push({ code: "kp_unreferenced", severity: "warning", node_id: node.id, message: "Active knowledge point is not referenced by a learner_state node." });
  }

  if (role === "diagnostic_error") {
    const sources = graph.edges.filter((edge) => edge.type === "has_misconception" && edge.to === node.id).map((edge) => graph.nodesById.get(edge.from)).filter(Boolean) as CurriculumNode[];
    if (sources.length === 0) warnings.push({ code: "misconception_unattached", severity: "warning", node_id: node.id, message: "Active misconception is not attached to any node." });
    if (sources.length > 0 && sources.every((source) => source.effective_role === "curriculum_view")) {
      warnings.push({ code: "misconception_only_attached_to_curriculum_view", severity: "warning", node_id: node.id, message: "Misconception is attached only to curriculum_view nodes." });
    }
  }

  return warnings;
}

export function orphanNodeIds(graph: GraphIndex, nodes: CurriculumNode[]): string[] {
  return nodes
    .filter((node) => !["subject", "strand", "area"].includes(node.type))
    .filter((node) => !graph.edges.some((edge) => edge.from === node.id || edge.to === node.id))
    .map((node) => node.id);
}

export function buildCoverageReport(graph: GraphIndex, input: CoverageInput) {
  const nodes = filteredCoverageNodes(graph, input);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.from) || nodeIds.has(edge.to));
  const coverage = nodes.filter((node) => node.type === "topic" || node.effective_role === "curriculum_view" || node.effective_role === "learner_state").map((node) => nodeCoverage(graph, node));
  const warnings = nodes.flatMap((node) => roleAwareCoverageWarnings(graph, node));
  const roleAudit = buildRoleAuditReport(graph, input);

  return {
    node_counts: countsBy(nodes.map((node) => node.type)),
    role_counts: countsBy(nodes.map((node) => node.effective_role ?? inferEffectiveRole(node))),
    edge_counts: countsBy(edges.map((edge) => edge.type)),
    topics_without_direct_knowledge_points: coverage
      .filter((item) => item.effective_role === "learner_state" && item.direct_knowledge_points.length === 0)
      .map((item) => item.node_id),
    topics_without_effective_knowledge_points: coverage
      .filter((item) => item.effective_role === "learner_state" && item.effective_knowledge_points.length === 0)
      .map((item) => item.node_id),
    topics_without_prerequisites: nodes
      .filter((node) => node.type === "topic" && node.effective_role === "learner_state" && !node.foundational && !edges.some((edge) => edge.from === node.id && edge.type === "requires"))
      .map((node) => node.id),
    orphan_nodes: orphanNodeIds(graph, nodes),
    coverage,
    role_audit: {
      total: roleAudit.length,
      results: roleAudit.slice(0, input.role_audit_limit ?? 200),
      applied: false
    },
    warnings,
    acara_alignment_counts: {}
  };
}

export function buildRoleAuditReport(graph: GraphIndex, input: CoverageInput = {}) {
  return filteredCoverageNodes(graph, input).map((node) => {
    const coverage = nodeCoverage(graph, node);
    const inferred = inferEffectiveRole({ ...node, role: undefined });
    const warnings = roleAuditWarnings(graph, node, coverage, inferred);
    return {
      node_id: node.id,
      label: node.label,
      type: node.type,
      grain_size: node.grain_size,
      status: node.status,
      explicit_role: node.role ?? null,
      inferred_effective_role: node.effective_role ?? inferred,
      suggested_role: inferred,
      confidence: suggestedRoleConfidence(node),
      reason: suggestedRoleReason(node, inferred),
      has_direct_kps: coverage.direct_knowledge_points.length > 0,
      effective_kp_count: coverage.effective_knowledge_points.length,
      encompassed_child_count: coverage.encompassed_child_count,
      requires_edge_count: coverage.requires_edge_count,
      has_misconception_count: coverage.direct_misconceptions.length,
      warnings
    };
  });
}

function roleAuditWarnings(graph: GraphIndex, node: CurriculumNode, coverage: NodeCoverage, inferred: NodeRole): string[] {
  const warnings: string[] = [];
  if (node.role && node.role !== inferred) warnings.push("explicit_role_conflicts_with_inference");
  if (coverage.effective_role === "curriculum_view" && coverage.direct_knowledge_points.length > 0) warnings.push("curriculum_view_has_direct_kps");
  if (coverage.effective_role === "learner_state" && coverage.direct_knowledge_points.length === 0) warnings.push("learner_state_missing_direct_kps");
  if (coverage.effective_role === "curriculum_view" && graph.edges.some((edge) => edge.type === "requires" && (edge.from === node.id || edge.to === node.id))) warnings.push("curriculum_view_has_requires_edge");
  if (node.type === "topic" && node.grain_size === "course_unit") warnings.push("topic_course_unit_candidate_view");
  if (node.type === "topic" && node.grain_size === "lesson_topic") warnings.push("lesson_topic_candidate_learner_state");
  if (coverage.effective_role === "mastery_claim" && !graph.edges.some((edge) => edge.type === "targets_knowledge_point" && edge.to === node.id)) warnings.push("kp_unreferenced");
  if (coverage.effective_role === "diagnostic_error" && !graph.edges.some((edge) => edge.type === "has_misconception" && edge.to === node.id)) warnings.push("misconception_unattached");
  return warnings;
}

function suggestedRoleConfidence(node: CurriculumNode): "low" | "medium" | "high" {
  if (["knowledge_point", "misconception", "task_type", "curriculum_standard", "pathway", "subject", "strand", "area", "representation", "procedure"].includes(node.type)) return "high";
  if (node.type === "topic" && node.grain_size) return "medium";
  return "low";
}

function suggestedRoleReason(node: CurriculumNode, inferred: NodeRole): string {
  if (node.role) return `Explicit role is ${node.role}; inferred fallback from type/grain size is ${inferred}.`;
  if (node.type === "topic") return `Inferred from topic grain_size ${node.grain_size ?? "missing"}.`;
  return `Inferred from node type ${node.type}.`;
}

function countsBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
