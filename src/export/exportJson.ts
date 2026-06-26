import path from "node:path";
import { GraphIndex } from "../graph/loadGraph.js";
import { writeTextFileAtomic } from "../graph/saveGraph.js";

export async function exportJson(graph: GraphIndex, options: { subject?: string; include_drafts?: boolean } = {}) {
  const nodes = graph.nodes.filter((node) => (!options.subject || node.subject?.toLowerCase() === options.subject.toLowerCase() || node.id === options.subject) && (options.include_drafts || node.status !== "draft"));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && (options.include_drafts || edge.status !== "draft"));
  const out = path.join(graph.rootDir, "generated", "indexes", "graph.json");
  await writeTextFileAtomic(out, JSON.stringify({ nodes, edges }, null, 2));
  return { path: path.relative(graph.rootDir, out).replace(/\\/g, "/"), node_count: nodes.length, edge_count: edges.length };
}
