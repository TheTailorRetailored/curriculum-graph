import { CurriculumEdge } from "../schema/zodSchemas.js";

export function detectCycles(edges: CurriculumEdge[], strengths = ["hard"]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.type !== "requires") continue;
    if (edge.strength && !strengths.includes(edge.strength)) continue;
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) dfs(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of adjacency.keys()) dfs(node);
  return cycles;
}

export function downstream(edges: CurriculumEdge[], nodeId: string, edgeTypes: string[], depth: number): string[] {
  const dependents = new Set<string>();
  let frontier = new Set([nodeId]);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (!edgeTypes.includes(edge.type)) continue;
      if (frontier.has(edge.to) && !dependents.has(edge.from)) {
        dependents.add(edge.from);
        next.add(edge.from);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return [...dependents];
}
