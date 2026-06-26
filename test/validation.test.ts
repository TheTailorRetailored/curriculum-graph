import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadGraph } from "../src/graph/loadGraph.js";
import { applyGraphPatch } from "../src/graph/patchGraph.js";
import { getAreaMap, getNode } from "../src/graph/queryGraph.js";
import { nodeSchema } from "../src/schema/zodSchemas.js";
import { validatePatch } from "../src/validation/validatePatch.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function topic(id: string, label: string) {
  return {
    id,
    type: "topic",
    subject: "mathematics",
    strand: "Number",
    area: "Fractions",
    label,
    description: `${label} description.`,
    year_band: "3-5",
    grain_size: "lesson_topic",
    foundational: true,
    status: "draft",
    knowledge_points: [],
    metadata: { created_by: "ai", review_status: "ai_generated" }
  };
}

function patch(operations: unknown[]) {
  return {
    patch_id: `patch.test.${Math.random().toString(36).slice(2)}`,
    phase: "test",
    target: { subject: "mathematics", area: "Fractions" },
    created_by: "ai",
    operations,
    commit_message: "Test patch."
  };
}

async function writeMinimalOntologyFixture(temp: string) {
  await mkdir(path.join(temp, "ontology", "mathematics", "number"), { recursive: true });
  await mkdir(path.join(temp, "ontology", "edges"), { recursive: true });
  await writeFile(path.join(temp, "ontology", "mathematics", "index.yaml"), YAML.stringify({
    nodes: [
      {
        id: "math",
        type: "subject",
        label: "Mathematics",
        status: "active",
        metadata: { created_by: "system", review_status: "approved" }
      },
      {
        id: "math.strand.number",
        type: "strand",
        subject: "mathematics",
        label: "Number",
        status: "active",
        metadata: { created_by: "system", review_status: "approved" }
      }
    ]
  }), "utf8");
  await writeFile(path.join(temp, "ontology", "mathematics", "number", "fractions.yaml"), YAML.stringify({
    nodes: [
      {
        ...topic("math.topic.add_fractions_unlike_denominators", "Add fractions with unlike denominators"),
        knowledge_points: [
          {
            id: "math.kp.find_common_denominator",
            label: "Find a common denominator",
            description: "Identify a denominator that each fraction can be rewritten with.",
            observable: true,
            assessable: true,
            status: "draft"
          }
        ],
        metadata: { created_by: "ai", review_status: "ai_generated" }
      },
      {
        ...topic("math.topic.references_independent_kp", "References independent knowledge point"),
        knowledge_points: ["math.kp.find_common_denominator"],
        metadata: { created_by: "ai", review_status: "ai_generated" }
      }
    ]
  }), "utf8");
  await writeFile(path.join(temp, "ontology", "edges", "mathematics-prerequisites.yaml"), YAML.stringify({ edges: [] }), "utf8");
}

describe("curriculum graph validation", () => {
  it("accepts a valid topic node", () => {
    expect(nodeSchema.safeParse(topic("math.topic.compare_unit_fractions", "Compare unit fractions")).success).toBe(true);
  });

  it("rejects an invalid id", () => {
    expect(nodeSchema.safeParse(topic("math.topic.Bad-Id", "Bad id")).success).toBe(false);
  });

  it("flags duplicate nodes", async () => {
    const graph = await loadGraph(root);
    const result = validatePatch(graph, patch([{ op: "create_node", node: topic("math.topic.generate_equivalent_fractions", "Generate equivalent fractions") }]));
    expect(result.blocking_errors.some((issue) => issue.code === "duplicate_id")).toBe(true);
  });

  it("blocks hard prerequisite cycles", async () => {
    const graph = await loadGraph(root);
    const result = validatePatch(graph, patch([
      { op: "create_node", node: topic("math.topic.cycle_a", "Cycle A") },
      { op: "create_node", node: topic("math.topic.cycle_b", "Cycle B") },
      { op: "create_edge", edge: { id: "edge.math.cycle_a_requires_b", from: "math.topic.cycle_a", to: "math.topic.cycle_b", type: "requires", strength: "hard", confidence: "medium", rationale: "Test.", failure_signal: "Test.", status: "draft", metadata: { created_by: "ai", review_status: "ai_generated" } } },
      { op: "create_edge", edge: { id: "edge.math.cycle_b_requires_a", from: "math.topic.cycle_b", to: "math.topic.cycle_a", type: "requires", strength: "hard", confidence: "medium", rationale: "Test.", failure_signal: "Test.", status: "draft", metadata: { created_by: "ai", review_status: "ai_generated" } } }
    ]));
    expect(result.blocking_errors.some((issue) => issue.code === "hard_requires_cycle")).toBe(true);
  });

  it("blocks missing edge endpoints", async () => {
    const graph = await loadGraph(root);
    const result = validatePatch(graph, patch([{ op: "create_edge", edge: { id: "edge.math.missing_requires_equiv", from: "math.topic.missing", to: "math.topic.generate_equivalent_fractions", type: "requires", strength: "hard", confidence: "medium", rationale: "Test.", failure_signal: "Test.", status: "draft", metadata: { created_by: "ai", review_status: "ai_generated" } } }]));
    expect(result.blocking_errors.some((issue) => issue.code === "missing_edge_from")).toBe(true);
  });

  it("blocks encompassing edges without weight", async () => {
    const graph = await loadGraph(root);
    const result = validatePatch(graph, patch([{ op: "create_edge", edge: { id: "edge.math.bad_encompasses", from: "math.topic.add_fractions_unlike_denominators", to: "math.topic.generate_equivalent_fractions", type: "encompasses", confidence: "medium", rationale: "Test.", status: "draft", metadata: { created_by: "ai", review_status: "ai_generated" } } }]));
    expect(result.blocking_errors.some((issue) => issue.code === "patch_schema")).toBe(true);
  });

  it("does not apply a patch with blocking errors", async () => {
    const graph = await loadGraph(root);
    const result = await applyGraphPatch(graph, patch([{ op: "create_node", node: topic("math.topic.generate_equivalent_fractions", "Generate equivalent fractions") }]));
    expect(result.committed).toBe(false);
  });

  it("applies a warning-only patch when allowed", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const result = await applyGraphPatch(graph, patch([{ op: "create_node", node: { ...topic("math.topic.test_warning_node", "Test warning node"), foundational: false } }]), { allow_warnings: true });
      expect(result.committed).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("persists update_node changes to canonical YAML and survives reload", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const result = await applyGraphPatch(graph, patch([
        { op: "update_node", id: "math.strand.number", updates: { subject: "Mathematics" } }
      ]), { allow_warnings: true });

      expect(result.committed).toBe(true);
      expect(result.files_changed).toContain("ontology/mathematics/index.yaml");

      const reloaded = await loadGraph(temp);
      expect(getNode(reloaded, "math.strand.number")?.node.subject).toBe("Mathematics");

      const audit = JSON.parse(await readFile(path.join(temp, result.audit_log_path as string), "utf8")) as { files_changed: string[] };
      expect(audit.files_changed).toContain("ontology/mathematics/index.yaml");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rolls back ontology files when a post-write graph reload fails", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const result = await applyGraphPatch(graph, patch([
        { op: "update_node", id: "math.strand.number", updates: { status: "not_a_status" } }
      ]), { allow_warnings: true });

      expect(result.committed).toBe(false);
      expect(result.error).toMatch(/Invalid enum value|status/);

      const reloaded = await loadGraph(temp);
      expect(getNode(reloaded, "math.strand.number")?.node.status).toBe("active");
      await expect(readFile(path.join(temp, "patches", "rejected", `${result.patch_id}.failed.json`), "utf8")).resolves.toContain("not_a_status");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("persists embedded knowledge point updates to their parent topic file", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const result = await applyGraphPatch(graph, patch([
        { op: "update_node", id: "math.kp.find_common_denominator", updates: { label: "Find a shared denominator" } }
      ]), { allow_warnings: true });

      expect(result.committed).toBe(true);
      const reloaded = await loadGraph(temp);
      expect(getNode(reloaded, "math.kp.find_common_denominator")?.node.label).toBe("Find a shared denominator");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("loads topic knowledge point references without treating them as embedded nodes", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const node = getNode(graph, "math.topic.references_independent_kp")?.node;
      expect(node?.knowledge_points).toEqual(["math.kp.find_common_denominator"]);
      expect(graph.nodes.filter((candidate) => candidate.id === "math.kp.find_common_denominator")).toHaveLength(1);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("returns useful area map context", async () => {
    const graph = await loadGraph(root);
    const areaMap = getAreaMap(graph, { subject: "mathematics", area: "Fractions", include_examples: true });
    expect(areaMap.existing_nodes.some((node) => node.id === "math.topic.generate_equivalent_fractions")).toBe(true);
    expect(areaMap.existing_edges.length).toBeGreaterThan(0);
  });
});
