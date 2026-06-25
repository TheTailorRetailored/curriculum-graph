import path from "node:path";
import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { CurriculumEdge, CurriculumNode, edgeSchema, nodeSchema } from "../schema/zodSchemas.js";
import { normalizeText } from "../util/text.js";

export type GraphIndex = {
  rootDir: string;
  nodes: CurriculumNode[];
  edges: CurriculumEdge[];
  nodesById: Map<string, CurriculumNode>;
  edgesById: Map<string, CurriculumEdge>;
  nodePathById: Map<string, string>;
  edgePathById: Map<string, string>;
  labels: Map<string, CurriculumNode[]>;
  aliases: Map<string, CurriculumNode[]>;
};

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return value ? [value as T] : [];
}

export async function loadGraph(rootDir = process.cwd()): Promise<GraphIndex> {
  const ontologyDir = path.join(rootDir, "ontology");
  const files = await fg("**/*.yaml", { cwd: ontologyDir, absolute: true, onlyFiles: true, ignore: ["schema/examples/**"] });
  const nodes: CurriculumNode[] = [];
  const edges: CurriculumEdge[] = [];
  const nodePathById = new Map<string, string>();
  const edgePathById = new Map<string, string>();

  for (const file of files) {
    const parsed = YAML.parse(await readFile(file, "utf8")) ?? {};
    const rawNodes = asArray<Record<string, unknown>>((parsed as { nodes?: unknown }).nodes);
    const rawEdges = asArray<Record<string, unknown>>((parsed as { edges?: unknown }).edges);
    if ((parsed as { id?: unknown }).id && (parsed as { type?: unknown }).type) rawNodes.push(parsed as Record<string, unknown>);

    for (const rawNode of rawNodes) {
      const node = nodeSchema.parse(rawNode);
      nodes.push(node);
      nodePathById.set(node.id, path.relative(rootDir, file).replace(/\\/g, "/"));
      for (const kp of node.knowledge_points ?? []) {
        if (typeof kp === "string") continue;
        const kpNode = nodeSchema.parse({
          ...kp,
          type: "knowledge_point",
          subject: node.subject,
          strand: node.strand,
          area: node.area,
          parent_topic: node.id,
          metadata: { ...node.metadata }
        });
        nodes.push(kpNode);
        nodePathById.set(kpNode.id, path.relative(rootDir, file).replace(/\\/g, "/"));
      }
    }
    for (const rawEdge of rawEdges) {
      const edge = edgeSchema.parse(rawEdge);
      edges.push(edge);
      edgePathById.set(edge.id, path.relative(rootDir, file).replace(/\\/g, "/"));
    }
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const labels = new Map<string, CurriculumNode[]>();
  const aliases = new Map<string, CurriculumNode[]>();
  for (const node of nodes) {
    const labelKey = normalizeText(node.label);
    labels.set(labelKey, [...(labels.get(labelKey) ?? []), node]);
    for (const alias of node.aliases ?? []) {
      const aliasKey = normalizeText(alias);
      aliases.set(aliasKey, [...(aliases.get(aliasKey) ?? []), node]);
    }
  }

  return { rootDir, nodes, edges, nodesById, edgesById, nodePathById, edgePathById, labels, aliases };
}
