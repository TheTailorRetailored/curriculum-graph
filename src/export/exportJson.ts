import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { GraphIndex } from "../graph/loadGraph.js";

export async function exportJson(graph: GraphIndex, options: { subject?: string; include_drafts?: boolean } = {}) {
  const nodes = graph.nodes.filter((node) => (!options.subject || node.subject?.toLowerCase() === options.subject.toLowerCase() || node.id === options.subject) && (options.include_drafts || node.status !== "draft"));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && (options.include_drafts || edge.status !== "draft"));
  const out = path.join(graph.rootDir, "generated", "indexes", "graph.json");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ nodes, edges }, null, 2), "utf8");
  return { path: path.relative(graph.rootDir, out).replace(/\\/g, "/"), node_count: nodes.length, edge_count: edges.length };
}
