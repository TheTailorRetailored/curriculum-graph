import { GraphIndex } from "../graph/loadGraph.js";
import { detectCycles } from "../graph/graphAlgorithms.js";
import { edgeSchema, nodeSchema, Patch, patchSchema, ValidationIssue, ValidationResult } from "../schema/zodSchemas.js";
import { isValidEdgeId, isValidNodeId, slugLooksLikeLabel } from "../util/ids.js";
import { withEffectiveRole } from "../graph/roles.js";
import { detectDuplicateNode } from "./duplicateDetection.js";
import { checkEncompassingEdge } from "./edgeSemantics.js";
import { checkGranularity } from "./granularityChecks.js";
import { checkYearBandDirection } from "./yearBandChecks.js";

export function validatePatch(graph: GraphIndex, patch: Patch | unknown, strictness: "loose" | "normal" | "strict" = "normal"): ValidationResult {
  const blocking_errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      valid: false,
      blocking_errors: parsed.error.issues.map((issue) => ({ code: "patch_schema", severity: "error", message: issue.message, path: issue.path.join(".") })),
      warnings: [],
      suggested_fixes: ["Fix patch structure and required operation fields."],
      summary: { nodes_created: 0, edges_created: 0, nodes_updated: 0 }
    };
  }

  const createdNodes = parsed.data.operations.flatMap((op) => op.op === "create_node" && op.node ? [op.node] : []);
  const createdEdges = parsed.data.operations.flatMap((op) => op.op === "create_edge" && op.edge ? [op.edge] : []);
  const projectedNodes = new Map(graph.nodesById);
  const projectedEdges = [...graph.edges, ...createdEdges];

  for (const op of parsed.data.operations) {
    if (op.op === "update_node") {
      const id = op.id ?? op.node?.id;
      if (id && !graph.nodesById.has(id)) blocking_errors.push({ code: "missing_update_node", severity: "error", message: `Cannot update missing node: ${id}`, node_id: id });
    }
    if (op.op === "deprecate_node") {
      const id = op.id;
      if (id && !graph.nodesById.has(id)) blocking_errors.push({ code: "missing_deprecate_node", severity: "error", message: `Cannot deprecate missing node: ${id}`, node_id: id });
    }
    if (op.op === "update_edge") {
      const id = op.id ?? op.edge?.id;
      if (id && !graph.edgesById.has(id)) blocking_errors.push({ code: "missing_update_edge", severity: "error", message: `Cannot update missing edge: ${id}`, edge_id: id });
    }
    if (op.op === "delete_edge") {
      const id = op.id;
      if (id && !graph.edgesById.has(id)) blocking_errors.push({ code: "missing_delete_edge", severity: "error", message: `Cannot delete missing edge: ${id}`, edge_id: id });
    }
    if (op.node) {
      const result = nodeSchema.safeParse(op.node);
      if (!result.success) blocking_errors.push(...result.error.issues.map((issue) => ({ code: "node_schema", severity: "error" as const, message: issue.message, path: `${op.node?.id}.${issue.path.join(".")}`, node_id: op.node?.id })));
      if (!isValidNodeId(op.node.id)) blocking_errors.push({ code: "invalid_id", severity: "error", message: `Invalid node id: ${op.node.id}`, node_id: op.node.id });
      if (op.node.type === "knowledge_point" && op.node.assessable !== true) blocking_errors.push({ code: "knowledge_point_not_assessable", severity: "error", message: "Knowledge point nodes must be assessable.", node_id: op.node.id });
      if (!slugLooksLikeLabel(op.node.id, op.node.label)) warnings.push({ code: "id_label_mismatch", severity: "warning", message: "ID slug may not match label.", node_id: op.node.id });
      if (op.op === "create_node") {
        for (const issue of detectDuplicateNode(graph, op.node, op)) (issue.severity === "error" ? blocking_errors : warnings).push(issue);
      }
      projectedNodes.set(op.node.id, withEffectiveRole(op.node));
    }
    if (op.edge) {
      const result = edgeSchema.safeParse(op.edge);
      if (!result.success) blocking_errors.push(...result.error.issues.map((issue) => ({ code: "edge_schema", severity: "error" as const, message: issue.message, path: `${op.edge?.id}.${issue.path.join(".")}`, edge_id: op.edge?.id })));
      if (!isValidEdgeId(op.edge.id)) blocking_errors.push({ code: "invalid_edge_id", severity: "error", message: `Invalid edge id: ${op.edge.id}`, edge_id: op.edge.id });
      if (graph.edgesById.has(op.edge.id)) blocking_errors.push({ code: "duplicate_edge_id", severity: "error", message: `Edge id already exists: ${op.edge.id}`, edge_id: op.edge.id });
      if (op.edge.type === "requires" && ["strong", "weak", "helpful"].includes(op.edge.strength ?? "")) {
        warnings.push({
          code: "legacy_requires_strength",
          severity: "warning",
          message: `Requires strength '${op.edge.strength}' is accepted for compatibility but canonical values are hard, medium, soft.`,
          edge_id: op.edge.id
        });
      }
      if (!projectedNodes.has(op.edge.from)) blocking_errors.push({ code: "missing_edge_from", severity: "error", message: `Missing edge endpoint: ${op.edge.from}`, edge_id: op.edge.id });
      if (!projectedNodes.has(op.edge.to)) blocking_errors.push({ code: "missing_edge_to", severity: "error", message: `Missing edge endpoint: ${op.edge.to}`, edge_id: op.edge.id });
      const fromNode = projectedNodes.get(op.edge.from);
      const toNode = projectedNodes.get(op.edge.to);
      if (op.edge.type === "targets_knowledge_point" && toNode && toNode.type !== "knowledge_point") {
        blocking_errors.push({ code: "targets_knowledge_point_target_not_kp", severity: "error", message: "targets_knowledge_point edges must target knowledge_point nodes.", edge_id: op.edge.id });
      }
      if (op.edge.type === "has_misconception" && toNode && toNode.type !== "misconception") {
        blocking_errors.push({ code: "has_misconception_target_not_misconception", severity: "error", message: "has_misconception edges must target misconception nodes.", edge_id: op.edge.id });
      }
      if (op.edge.type === "aligned_to" && toNode && toNode.type !== "curriculum_standard") {
        warnings.push({ code: "aligned_to_target_not_standard", severity: "warning", message: "aligned_to edges should target curriculum_standard nodes.", edge_id: op.edge.id });
      }
      if (op.edge.type === "targets_knowledge_point" && fromNode?.knowledge_points?.some((kp) => (typeof kp === "string" ? kp : kp.id) === op.edge?.to)) {
        warnings.push({ code: "duplicate_targets_knowledge_point_ref", severity: "warning", message: "This targets_knowledge_point edge duplicates a node.knowledge_points reference; prefer the derived edge.", edge_id: op.edge.id });
      }
      if (op.edge.type === "requires" && (fromNode?.effective_role === "curriculum_view" || toNode?.effective_role === "curriculum_view")) {
        warnings.push({ code: "requires_involves_curriculum_view", severity: "warning", message: "requires should represent diagnostic dependencies; curriculum_view nodes usually need supports, develops_into, or pathway sequencing instead.", edge_id: op.edge.id });
      }
      if (op.edge.type === "requires" && (fromNode?.effective_role === "standard_alignment" || toNode?.effective_role === "standard_alignment")) {
        warnings.push({ code: "requires_involves_standard_alignment", severity: "warning", message: "Curriculum standards should not usually participate in requires edges.", edge_id: op.edge.id });
      }
      if ((fromNode?.effective_role === "standard_alignment" || toNode?.effective_role === "standard_alignment") && ["targets_knowledge_point", "has_misconception"].includes(op.edge.type)) {
        warnings.push({ code: "standard_alignment_has_direct_diagnostic_link", severity: "warning", message: "Standards should map onto internal graph nodes rather than having KPs or misconceptions directly attached.", edge_id: op.edge.id });
      }
      warnings.push(...checkYearBandDirection(op.edge, projectedNodes.get(op.edge.from), projectedNodes.get(op.edge.to)));
      warnings.push(...checkEncompassingEdge(op.edge, projectedNodes.get(op.edge.to), projectedEdges));
    }
  }

  for (const node of createdNodes) {
    const hardPrereqCount = projectedEdges.filter((edge) => edge.from === node.id && edge.type === "requires" && edge.strength === "hard").length;
    const childCount = projectedEdges.filter((edge) => edge.from === node.id && edge.type === "part_of").length;
    warnings.push(...checkGranularity(node, hardPrereqCount, childCount));
  }

  const cycles = detectCycles(projectedEdges, ["hard"]);
  for (const cycle of cycles) {
    blocking_errors.push({ code: "hard_requires_cycle", severity: "error", message: `Hard prerequisite cycle: ${cycle.join(" -> ")}` });
  }

  if (strictness === "strict") {
    for (const warning of warnings.filter((issue) => ["id_label_mismatch", "legacy_requires_strength", "no_prerequisites"].includes(issue.code))) {
      blocking_errors.push({ ...warning, severity: "error" });
    }
  }
  const returnedWarnings = strictness === "strict"
    ? warnings.filter((issue) => !["id_label_mismatch", "legacy_requires_strength", "no_prerequisites"].includes(issue.code))
    : warnings;

  return {
    valid: blocking_errors.length === 0,
    blocking_errors,
    warnings: returnedWarnings,
    suggested_fixes: blocking_errors.length ? ["Resolve blocking errors, then validate again."] : [],
    summary: {
      nodes_created: createdNodes.length,
      edges_created: createdEdges.length,
      nodes_updated: parsed.data.operations.filter((op) => op.op === "update_node" || op.op === "deprecate_node").length
    }
  };
}
