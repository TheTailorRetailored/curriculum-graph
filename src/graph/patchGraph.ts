import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { GraphIndex, loadGraph } from "./loadGraph.js";
import { appendEdges, appendNodes, updateEdges, updateNodes } from "./saveGraph.js";
import { patchSchema, Patch } from "../schema/zodSchemas.js";
import { validatePatch } from "../validation/validatePatch.js";
import { exportJson } from "../export/exportJson.js";

export async function applyGraphPatch(graph: GraphIndex, patchInput: Patch | unknown, options: { strictness?: "loose" | "normal" | "strict"; allow_warnings?: boolean } = {}) {
  const patch = patchSchema.parse(patchInput);
  const validation = validatePatch(graph, patch, options.strictness ?? "normal");
  const duplicateWarnings = validation.warnings.filter((issue) => issue.code.includes("duplicate"));
  if (!validation.valid || (duplicateWarnings.length > 0 && !patch.operations.some((op) => op.duplicate_resolution))) {
    return { committed: false, patch_id: patch.patch_id, validation, files_changed: [], audit_log_path: null };
  }
  if (!options.allow_warnings && validation.warnings.length > 0) {
    return { committed: false, patch_id: patch.patch_id, validation, files_changed: [], audit_log_path: null };
  }

  const nodes = patch.operations.flatMap((op) => op.op === "create_node" && op.node ? [op.node] : []);
  const edges = patch.operations.flatMap((op) => op.op === "create_edge" && op.edge ? [op.edge] : []);
  const before = { nodes: graph.nodes.length, edges: graph.edges.length };
  const nodeFiles = await appendNodes(graph.rootDir, nodes);
  const edgeFiles = await appendEdges(graph.rootDir, edges, `${patch.target.subject ?? "graph"}-patches.yaml`);
  const updatedNodeFiles = await updateNodes(graph.rootDir, graph, patch.operations);
  const updatedEdgeFiles = await updateEdges(graph.rootDir, graph, patch.operations);
  const changedGraph = await loadGraph(graph.rootDir);
  const exportResult = await exportJson(changedGraph, { include_drafts: true });
  const files_changed = [...new Set([...nodeFiles, ...edgeFiles, ...updatedNodeFiles, ...updatedEdgeFiles, exportResult.path])];
  const audit = {
    patch_id: patch.patch_id,
    applied_at: new Date().toISOString(),
    created_by: patch.created_by,
    validation,
    operations: patch.operations,
    files_changed,
    graph_counts_before: before,
    graph_counts_after: { nodes: changedGraph.nodes.length, edges: changedGraph.edges.length }
  };
  const auditPath = path.join(graph.rootDir, "patches", "logs", `${patch.patch_id}.json`);
  await mkdir(path.dirname(auditPath), { recursive: true });
  await writeFile(auditPath, JSON.stringify(audit, null, 2), "utf8");
  return {
    committed: true,
    patch_id: patch.patch_id,
    validation,
    files_changed: [...files_changed, path.relative(graph.rootDir, auditPath).replace(/\\/g, "/")],
    audit_log_path: path.relative(graph.rootDir, auditPath).replace(/\\/g, "/")
  };
}
