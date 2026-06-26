import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import YAML from "yaml";
import { matchesRoleFilter, NodeRoleFilter } from "../graph/coverage.js";
import { GraphIndex } from "../graph/loadGraph.js";

export async function exportYamlBundle(graph: GraphIndex, options: NodeRoleFilter & { subject?: string; include_drafts?: boolean; include_derived_edges?: boolean } = {}) {
  const includeDerivedEdges = options.include_derived_edges ?? true;
  const nodes = graph.nodes.filter((node) => (!options.subject || node.subject?.toLowerCase() === options.subject.toLowerCase()) && (options.include_drafts || node.status !== "draft") && matchesRoleFilter(node, options));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && (includeDerivedEdges || !graph.derivedEdgeIds.has(edge.id)) && (options.include_drafts || edge.status !== "draft"));
  const out = path.join(graph.rootDir, "generated", "indexes", "graph.yaml");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, YAML.stringify({ nodes, edges }), "utf8");
  return { path: path.relative(graph.rootDir, out).replace(/\\/g, "/"), node_count: nodes.length, edge_count: edges.length };
}
