import { EDGE_TYPES } from "../schema/constants.js";
import { CurriculumEdge, CurriculumNode } from "../schema/zodSchemas.js";
import { jaccard, normalizeText, tokenize } from "../util/text.js";
import { matchesRoleFilter, NodeRoleFilter, roleAwareCoverageWarnings } from "./coverage.js";
import { GraphIndex } from "./loadGraph.js";

export type SearchNodesInput = NodeRoleFilter & {
  query: string;
  subject?: string;
  strand?: string;
  area?: string;
  types?: string[];
  limit?: number;
};

function matchesFilters(node: CurriculumNode, input: Omit<SearchNodesInput, "query" | "limit">): boolean {
  if (input.subject && node.subject?.toLowerCase() !== input.subject.toLowerCase()) return false;
  if (input.strand && node.strand !== input.strand) return false;
  if (input.area && node.area !== input.area) return false;
  if (input.types?.length && !input.types.includes(node.type)) return false;
  if (!matchesRoleFilter(node, input)) return false;
  return true;
}

function maybeDerivedEdges(graph: GraphIndex, includeDerivedEdges = false): CurriculumEdge[] {
  return includeDerivedEdges ? graph.edges : graph.edges.filter((edge) => !graph.derivedEdgeIds.has(edge.id));
}

export function searchNodes(graph: GraphIndex, input: SearchNodesInput) {
  const queryTokens = tokenize(input.query);
  return graph.nodes
    .filter((node) => matchesFilters(node, input))
    .map((node) => {
      const haystack = [node.id, node.label, node.description ?? "", ...(node.aliases ?? [])].join(" ");
      const exact = normalizeText(node.label) === normalizeText(input.query) || node.id === input.query;
      const score = exact ? 1 : jaccard(queryTokens, tokenize(haystack));
      return { id: node.id, type: node.type, role: node.role, effective_role: node.effective_role, label: node.label, score, status: node.status, path: graph.nodePathById.get(node.id) };
    })
    .filter((result) => result.score > 0 || normalizeText(result.label).includes(normalizeText(input.query)))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, input.limit ?? 20);
}

export function getNode(graph: GraphIndex, id: string, includeEdges = true, includeDerivedEdges = true) {
  const node = graph.nodesById.get(id);
  if (!node) return null;
  const edges = maybeDerivedEdges(graph, includeDerivedEdges);
  const incoming_edges = includeEdges ? edges.filter((edge) => edge.to === id) : [];
  const outgoing_edges = includeEdges ? edges.filter((edge) => edge.from === id) : [];
  return { node, incoming_edges, outgoing_edges };
}

export function getNeighbourhood(graph: GraphIndex, id: string, depth = 1, edgeTypes: string[] = [...EDGE_TYPES], limit = 200, includeDerivedEdges = false) {
  const selectedEdges: CurriculumEdge[] = [];
  const seenNodes = new Set([id]);
  let frontier = new Set([id]);
  const graphEdges = maybeDerivedEdges(graph, includeDerivedEdges);
  for (let i = 0; i < depth; i += 1) {
    const next = new Set<string>();
    for (const edge of graphEdges) {
      if (!edgeTypes.includes(edge.type)) continue;
      if (frontier.has(edge.from) || frontier.has(edge.to)) {
        selectedEdges.push(edge);
        if (!seenNodes.has(edge.from)) next.add(edge.from);
        if (!seenNodes.has(edge.to)) next.add(edge.to);
        seenNodes.add(edge.from);
        seenNodes.add(edge.to);
      }
      if (seenNodes.size >= limit) break;
    }
    frontier = next;
    if (frontier.size === 0 || seenNodes.size >= limit) break;
  }
  return {
    nodes: [...seenNodes].slice(0, limit).map((nodeId) => graph.nodesById.get(nodeId)).filter(Boolean) as CurriculumNode[],
    edges: selectedEdges.slice(0, limit)
  };
}

export function getAreaMap(graph: GraphIndex, input: NodeRoleFilter & { subject?: string; area?: string; year_band?: string; include_schema?: boolean; include_examples?: boolean; include_validation_summary?: boolean; include_derived_edges?: boolean }) {
  const existing_nodes = graph.nodes.filter((node) =>
    (!input.subject || node.subject?.toLowerCase() === input.subject.toLowerCase()) &&
    (!input.area || node.area === input.area) &&
    matchesRoleFilter(node, input)
  );
  const nodeIds = new Set(existing_nodes.map((node) => node.id));
  const existing_edges = maybeDerivedEdges(graph, input.include_derived_edges).filter((edge) => nodeIds.has(edge.from) || nodeIds.has(edge.to));
  const known_gaps = existing_nodes
    .flatMap((node) => roleAwareCoverageWarnings(graph, node).map((issue) => ({ node_id: node.id, issue: issue.code, message: issue.message })));
  const warnings = existing_nodes.length === 0 ? [{ code: "empty_area", message: "No nodes found for this area." }] : [];
  return {
    schema_summary: input.include_schema ? { node_types: "subject, strand, area, topic, knowledge_point, representation, procedure, misconception, task_type, curriculum_standard, pathway" } : undefined,
    existing_nodes,
    existing_edges,
    nearby_nodes: existing_nodes.slice(0, 50),
    known_gaps,
    warnings,
    examples: input.include_examples ? existing_nodes.filter((node) => node.type === "topic").slice(0, 3) : []
  };
}

export function findSimilarNodes(graph: GraphIndex, input: NodeRoleFilter & { label: string; description?: string; subject?: string; limit?: number }) {
  const needle = tokenize(`${input.label} ${input.description ?? ""}`);
  return graph.nodes
    .filter((node) => (!input.subject || node.subject?.toLowerCase() === input.subject.toLowerCase()) && matchesRoleFilter(node, input))
    .map((node) => {
      const similarity = jaccard(needle, tokenize(`${node.label} ${node.description ?? ""} ${(node.aliases ?? []).join(" ")}`));
      return { id: node.id, label: node.label, similarity, reason: similarity > 0.75 ? "high label and description overlap" : "token overlap" };
    })
    .filter((result) => result.similarity > 0.2 || normalizeText(result.label) === normalizeText(input.label))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, input.limit ?? 10);
}
