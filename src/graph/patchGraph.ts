import path from "node:path";
import os from "node:os";
import { access, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { GraphIndex, loadGraph } from "./loadGraph.js";
import { appendEdges, appendNodes, areaFileForNode, patchEdgeFile, updateEdges, updateNodes, writeTextFileAtomic } from "./saveGraph.js";
import { patchSchema, Patch } from "../schema/zodSchemas.js";
import { validatePatch } from "../validation/validatePatch.js";
import { exportJson } from "../export/exportJson.js";

type FileSnapshot = {
  target: string;
  backup: string;
  existed: boolean;
};

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function snapshotFiles(files: string[]): Promise<{ dir: string; snapshots: FileSnapshot[] }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-patch-"));
  const snapshots: FileSnapshot[] = [];
  for (const target of [...new Set(files)]) {
    const backup = path.join(dir, `${snapshots.length}.bak`);
    const existed = await fileExists(target);
    if (existed) await copyFile(target, backup);
    snapshots.push({ target, backup, existed });
  }
  return { dir, snapshots };
}

async function restoreSnapshots(snapshots: FileSnapshot[]) {
  for (const snapshot of snapshots.reverse()) {
    if (snapshot.existed) {
      await mkdir(path.dirname(snapshot.target), { recursive: true });
      await copyFile(snapshot.backup, snapshot.target);
    } else {
      await rm(snapshot.target, { force: true });
    }
  }
}

function touchedFilesForPatch(graph: GraphIndex, patch: Patch, auditPath: string): string[] {
  const files = new Set<string>([
    path.join(graph.rootDir, "generated", "indexes", "graph.json"),
    auditPath
  ]);
  const nodes = patch.operations.flatMap((op) => op.op === "create_node" && op.node ? [op.node] : []);
  const edges = patch.operations.flatMap((op) => op.op === "create_edge" && op.edge ? [op.edge] : []);
  for (const node of nodes) files.add(areaFileForNode(graph.rootDir, node));
  if (edges.length > 0) files.add(patchEdgeFile(graph.rootDir, `${patch.target.subject ?? "graph"}-patches.yaml`));

  for (const operation of patch.operations) {
    if (operation.op === "update_node" || operation.op === "deprecate_node") {
      const id = operation.id ?? operation.node?.id;
      const sourcePath = id ? graph.nodePathById.get(id) : undefined;
      if (sourcePath) files.add(path.join(graph.rootDir, sourcePath));
    }
    if (operation.op === "update_edge" || operation.op === "delete_edge") {
      const id = operation.id ?? operation.edge?.id;
      const sourcePath = id ? graph.edgePathById.get(id) : undefined;
      if (sourcePath) files.add(path.join(graph.rootDir, sourcePath));
    }
  }

  return [...files];
}

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
  const auditPath = path.join(graph.rootDir, "patches", "logs", `${patch.patch_id}.json`);
  const { dir: snapshotDir, snapshots } = await snapshotFiles(touchedFilesForPatch(graph, patch, auditPath));

  try {
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
    await writeTextFileAtomic(auditPath, JSON.stringify(audit, null, 2));
    return {
      committed: true,
      patch_id: patch.patch_id,
      validation,
      files_changed: [...files_changed, path.relative(graph.rootDir, auditPath).replace(/\\/g, "/")],
      audit_log_path: path.relative(graph.rootDir, auditPath).replace(/\\/g, "/")
    };
  } catch (error) {
    let rollbackError: string | null = null;
    try {
      await restoreSnapshots(snapshots);
    } catch (restoreError) {
      rollbackError = restoreError instanceof Error ? restoreError.message : String(restoreError);
    }

    const message = error instanceof Error ? error.message : String(error);
    const failedLogPath = path.join(graph.rootDir, "patches", "rejected", `${patch.patch_id}.failed.json`);
    try {
      await writeTextFileAtomic(failedLogPath, JSON.stringify({
        patch_id: patch.patch_id,
        failed_at: new Date().toISOString(),
        created_by: patch.created_by,
        error: message,
        rollback_error: rollbackError,
        validation,
        operations: patch.operations
      }, null, 2));
    } catch {
      // Preserve the original apply failure for the caller; rejected-log writes are best effort.
    }

    return {
      committed: false,
      patch_id: patch.patch_id,
      validation,
      files_changed: [],
      audit_log_path: null,
      error: message,
      rollback_error: rollbackError,
      rejected_log_path: path.relative(graph.rootDir, failedLogPath).replace(/\\/g, "/")
    };
  } finally {
    await rm(snapshotDir, { recursive: true, force: true });
  }
}
