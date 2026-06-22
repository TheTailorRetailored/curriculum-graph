import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import YAML from "yaml";
import { GraphIndex } from "../graph/loadGraph.js";

export async function exportYamlBundle(graph: GraphIndex, options: { subject?: string; include_drafts?: boolean } = {}) {
  const nodes = graph.nodes.filter((node) => (!options.subject || node.subject?.toLowerCase() === options.subject.toLowerCase()) && (options.include_drafts || node.status !== "draft"));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && (options.include_drafts || edge.status !== "draft"));
  const out = path.join(graph.rootDir, "generated", "indexes", "graph.yaml");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, YAML.stringify({ nodes, edges }), "utf8");
  return { path: path.relative(graph.rootDir, out).replace(/\\/g, "/"), node_count: nodes.length, edge_count: edges.length };
}
