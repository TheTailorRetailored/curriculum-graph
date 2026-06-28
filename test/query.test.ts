import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downstream } from "../src/graph/graphAlgorithms.js";
import { loadGraph } from "../src/graph/loadGraph.js";
import { getNeighbourhood, searchNodes } from "../src/graph/queryGraph.js";
import { assertToolAllowed, availableToolDefinitions } from "../src/mcp/createServer.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("graph queries", () => {
  it("finds canonical nodes using labels and aliases", async () => {
    const graph = await loadGraph(root);
    const results = searchNodes(graph, { query: "fractions", subject: "mathematics", limit: 10 });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.path?.startsWith("ontology/"))).toBe(true);
  });

  it("returns a bounded neighbourhood containing the requested node", async () => {
    const graph = await loadGraph(root);
    const node = graph.nodes.find((candidate) => graph.edges.some((edge) => edge.from === candidate.id || edge.to === candidate.id));
    expect(node).toBeDefined();

    const neighbourhood = getNeighbourhood(graph, node!.id, 1, ["requires", "part_of", "encompasses"], 25);
    expect(neighbourhood.nodes.some((candidate) => candidate.id === node!.id)).toBe(true);
    expect(neighbourhood.nodes.length).toBeLessThanOrEqual(25);
    expect(neighbourhood.edges.length).toBeLessThanOrEqual(25);
  });

  it("walks downstream prerequisite relationships without duplicates", () => {
    const edges = [
      { id: "edge.b.a", from: "b", to: "a", type: "requires", status: "active", metadata: { created_by: "test", review_status: "approved" } },
      { id: "edge.c.b", from: "c", to: "b", type: "requires", status: "active", metadata: { created_by: "test", review_status: "approved" } },
      { id: "edge.c.a", from: "c", to: "a", type: "requires", status: "active", metadata: { created_by: "test", review_status: "approved" } }
    ] as const;

    expect(new Set(downstream([...edges], "a", ["requires"], 3))).toEqual(new Set(["b", "c"]));
  });

  it("keeps ontology mutation opt-in for MCP clients", () => {
    expect(availableToolDefinitions().some((tool) => tool.name === "apply_patch")).toBe(false);
    expect(availableToolDefinitions().some((tool) => tool.name === "apply_validated_patch")).toBe(false);
    expect(availableToolDefinitions(true).some((tool) => tool.name === "apply_patch")).toBe(true);
    expect(availableToolDefinitions(true).some((tool) => tool.name === "apply_validated_patch")).toBe(true);
    expect(() => assertToolAllowed("apply_patch")).toThrow(/read-only mode/);
    expect(() => assertToolAllowed("apply_validated_patch")).toThrow(/read-only mode/);
    expect(() => assertToolAllowed("search_nodes")).not.toThrow();
  });
});
