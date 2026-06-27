import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import YAML from "yaml";
import { CurriculumEdge, CurriculumNode, PatchOperation } from "../schema/zodSchemas.js";
import { GraphIndex } from "./loadGraph.js";

export function areaFileForNode(rootDir: string, node: CurriculumNode): string {
  const subjectDir = node.subject === "english" || node.id.startsWith("eng.") ? "english" : "mathematics";
  const areaSlug = (node.area ?? "misc").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (subjectDir === "mathematics") return path.join(rootDir, "ontology", subjectDir, "number", `${areaSlug}.yaml`);
  return path.join(rootDir, "ontology", subjectDir, "skeleton", `${areaSlug}.yaml`);
}

export function patchEdgeFile(rootDir: string, filename = "patch-edges.yaml"): string {
  return path.join(rootDir, "ontology", "edges", filename);
}

export async function writeTextFileAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const temp = `${file}.${suffix}.tmp`;
  await writeFile(temp, content, "utf8");

  try {
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function readYamlDocument(file: string): Promise<Record<string, unknown>> {
  try {
    return YAML.parse(await readFile(file, "utf8")) ?? {};
  } catch {
    return {};
  }
}

function mergeRecord<T extends Record<string, unknown>>(existing: T, updates: Record<string, unknown>): T {
  return { ...existing, ...updates };
}

export async function appendNodes(rootDir: string, nodes: CurriculumNode[]): Promise<string[]> {
  const changed = new Set<string>();
  for (const node of nodes) {
    const file = areaFileForNode(rootDir, node);
    await mkdir(path.dirname(file), { recursive: true });
    const doc = await readYamlDocument(file);
    const existing = Array.isArray(doc.nodes) ? doc.nodes : [];
    doc.nodes = [...existing, node];
    await writeTextFileAtomic(file, YAML.stringify(doc));
    changed.add(path.relative(rootDir, file).replace(/\\/g, "/"));
  }
  return [...changed];
}

export async function appendEdges(rootDir: string, edges: CurriculumEdge[], filename = "patch-edges.yaml"): Promise<string[]> {
  if (edges.length === 0) return [];
  const file = patchEdgeFile(rootDir, filename);
  await mkdir(path.dirname(file), { recursive: true });
  const doc = await readYamlDocument(file);
  const existing = Array.isArray(doc.edges) ? doc.edges : [];
  doc.edges = [...existing, ...edges];
  await writeTextFileAtomic(file, YAML.stringify(doc));
  return [path.relative(rootDir, file).replace(/\\/g, "/")];
}

export async function updateNodes(rootDir: string, graph: GraphIndex, operations: PatchOperation[]): Promise<string[]> {
  const changed = new Set<string>();
  const updatesByPath = new Map<string, PatchOperation[]>();

  for (const operation of operations) {
    if (!["update_node", "deprecate_node"].includes(operation.op)) continue;
    const id = operation.id ?? operation.node?.id;
    if (!id) continue;
    const sourcePath = graph.nodePathById.get(id);
    if (!sourcePath) continue;
    updatesByPath.set(sourcePath, [...(updatesByPath.get(sourcePath) ?? []), operation]);
  }

  for (const [sourcePath, pathOperations] of updatesByPath) {
    const file = path.join(rootDir, sourcePath);
    const doc = await readYamlDocument(file);

    for (const operation of pathOperations) {
      const id = operation.id ?? operation.node?.id;
      if (!id) continue;
      const updates = operation.op === "deprecate_node"
        ? { status: "deprecated", deprecation_rationale: operation.rationale }
        : operation.node ? { ...operation.node } : { ...(operation.updates ?? {}) };
      delete (updates as { id?: unknown }).id;

      if ((doc as { id?: unknown }).id === id) {
        Object.assign(doc, mergeRecord(doc, updates));
        continue;
      }

      if (Array.isArray(doc.nodes)) {
        doc.nodes = doc.nodes.map((rawNode: unknown) => {
          if (!rawNode || typeof rawNode !== "object") return rawNode;
          const node = rawNode as Record<string, unknown>;
          if (node.id === id) return mergeRecord(node, updates);

          if (Array.isArray(node.knowledge_points)) {
            node.knowledge_points = node.knowledge_points.map((rawKp: unknown) => {
              if (!rawKp || typeof rawKp !== "object") return rawKp;
              const kp = rawKp as Record<string, unknown>;
              return kp.id === id ? mergeRecord(kp, updates) : kp;
            });
          }

          return node;
        });
      }
    }

    await writeTextFileAtomic(file, YAML.stringify(doc));
    changed.add(sourcePath.replace(/\\/g, "/"));
  }

  return [...changed];
}

export async function updateEdges(rootDir: string, graph: GraphIndex, operations: PatchOperation[]): Promise<string[]> {
  const changed = new Set<string>();
  const updatesByPath = new Map<string, PatchOperation[]>();

  for (const operation of operations) {
    if (operation.op !== "update_edge") continue;
    const id = operation.id ?? operation.edge?.id;
    if (!id) continue;
    const sourcePath = graph.edgePathById.get(id);
    if (!sourcePath) continue;
    updatesByPath.set(sourcePath, [...(updatesByPath.get(sourcePath) ?? []), operation]);
  }

  for (const [sourcePath, pathOperations] of updatesByPath) {
    const file = path.join(rootDir, sourcePath);
    const doc = await readYamlDocument(file);
    if (!Array.isArray(doc.edges)) continue;
    let edges = doc.edges;

    for (const operation of pathOperations) {
      const id = operation.id ?? operation.edge?.id;
      if (!id) continue;
      const updates = operation.edge ? { ...operation.edge } : { ...(operation.updates ?? {}) };
      delete (updates as { id?: unknown }).id;
      edges = edges.map((rawEdge: unknown) => {
        if (!rawEdge || typeof rawEdge !== "object") return rawEdge;
        const edge = rawEdge as Record<string, unknown>;
        return edge.id === id ? mergeRecord(edge, updates) : edge;
      });
    }

    doc.edges = edges;
    await writeTextFileAtomic(file, YAML.stringify(doc));
    changed.add(sourcePath.replace(/\\/g, "/"));
  }

  return [...changed];
}
