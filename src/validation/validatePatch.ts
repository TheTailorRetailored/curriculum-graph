import { GraphIndex } from "../graph/loadGraph.js";
import { detectCycles } from "../graph/graphAlgorithms.js";
import { edgeSchema, nodeSchema, Patch, patchSchema, ValidationIssue, ValidationResult } from "../schema/zodSchemas.js";
import { isValidEdgeId, isValidNodeId, slugLooksLikeLabel } from "../util/ids.js";
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
    if (op.op === "update_edge") {
      const id = op.id ?? op.edge?.id;
      if (id && !graph.edgesById.has(id)) blocking_errors.push({ code: "missing_update_edge", severity: "error", message: `Cannot update missing edge: ${id}`, edge_id: id });
    }
    if (op.node) {
      const result = nodeSchema.safeParse(op.node);
      if (!result.success) blocking_errors.push(...result.error.issues.map((issue) => ({ code: "node_schema", severity: "error" as const, message: issue.message, path: `${op.node?.id}.${issue.path.join(".")}`, node_id: op.node?.id })));
      if (!isValidNodeId(op.node.id)) blocking_errors.push({ code: "invalid_id", severity: "error", message: `Invalid node id: ${op.node.id}`, node_id: op.node.id });
      if (!slugLooksLikeLabel(op.node.id, op.node.label)) warnings.push({ code: "id_label_mismatch", severity: "warning", message: "ID slug may not match label.", node_id: op.node.id });
      if (op.op === "create_node") {
        for (const issue of detectDuplicateNode(graph, op.node, op)) (issue.severity === "error" ? blocking_errors : warnings).push(issue);
      }
      projectedNodes.set(op.node.id, op.node);
    }
    if (op.edge) {
      const result = edgeSchema.safeParse(op.edge);
      if (!result.success) blocking_errors.push(...result.error.issues.map((issue) => ({ code: "edge_schema", severity: "error" as const, message: issue.message, path: `${op.edge?.id}.${issue.path.join(".")}`, edge_id: op.edge?.id })));
      if (!isValidEdgeId(op.edge.id)) blocking_errors.push({ code: "invalid_edge_id", severity: "error", message: `Invalid edge id: ${op.edge.id}`, edge_id: op.edge.id });
      if (graph.edgesById.has(op.edge.id)) blocking_errors.push({ code: "duplicate_edge_id", severity: "error", message: `Edge id already exists: ${op.edge.id}`, edge_id: op.edge.id });
      if (!projectedNodes.has(op.edge.from)) blocking_errors.push({ code: "missing_edge_from", severity: "error", message: `Missing edge endpoint: ${op.edge.from}`, edge_id: op.edge.id });
      if (!projectedNodes.has(op.edge.to)) blocking_errors.push({ code: "missing_edge_to", severity: "error", message: `Missing edge endpoint: ${op.edge.to}`, edge_id: op.edge.id });
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
    for (const warning of warnings.filter((issue) => ["id_label_mismatch", "no_prerequisites"].includes(issue.code))) blocking_errors.push({ ...warning, severity: "error" });
  }

  return {
    valid: blocking_errors.length === 0,
    blocking_errors,
    warnings,
    suggested_fixes: blocking_errors.length ? ["Resolve blocking errors, then validate again."] : [],
    summary: {
      nodes_created: createdNodes.length,
      edges_created: createdEdges.length,
      nodes_updated: parsed.data.operations.filter((op) => op.op === "update_node").length
    }
  };
}
