import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadGraph } from "../src/graph/loadGraph.js";
import { applyGraphPatch } from "../src/graph/patchGraph.js";
import { buildCoverageReport, buildRoleAuditReport } from "../src/graph/coverage.js";
import { exportJson } from "../src/export/exportJson.js";
import { getAreaMap, getNode } from "../src/graph/queryGraph.js";
import { getNeighbourhood } from "../src/graph/queryGraph.js";
import { nodeSchema } from "../src/schema/zodSchemas.js";
import { validatePatch } from "../src/validation/validatePatch.js";
import { toolHandlers } from "../src/mcp/tools.js";

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
      },
      {
        ...topic("math.topic.fractions_course_unit", "Fractions course unit"),
        grain_size: "course_unit",
        knowledge_points: [],
        metadata: { created_by: "ai", review_status: "ai_generated" }
      },
      {
        ...topic("math.topic.child_with_kp", "Child with knowledge point"),
        knowledge_points: ["math.kp.find_common_denominator"],
        metadata: { created_by: "ai", review_status: "ai_generated" }
      },
      {
        ...topic("math.topic.learner_without_kp", "Learner without knowledge point"),
        knowledge_points: [],
        foundational: false,
        status: "active",
        metadata: { created_by: "ai", review_status: "ai_generated" }
      },
      {
        id: "math.kp.active_orphan",
        type: "knowledge_point",
        subject: "mathematics",
        strand: "Number",
        area: "Fractions",
        label: "Active orphan knowledge point",
        description: "A test active knowledge point with no edges.",
        observable: true,
        assessable: true,
        status: "active",
        metadata: { created_by: "ai", review_status: "ai_generated" }
      },
      {
        id: "math.kp.deprecated_orphan",
        type: "knowledge_point",
        subject: "mathematics",
        strand: "Number",
        area: "Fractions",
        label: "Deprecated orphan knowledge point",
        description: "A test deprecated knowledge point with no edges.",
        observable: true,
        assessable: true,
        status: "deprecated",
        metadata: { created_by: "ai", review_status: "ai_generated" }
      }
    ]
  }), "utf8");
  await writeFile(path.join(temp, "ontology", "edges", "mathematics-prerequisites.yaml"), YAML.stringify({
    edges: [
      {
        id: "edge.math.fractions_course_unit_encompasses_child",
        from: "math.topic.fractions_course_unit",
        to: "math.topic.child_with_kp",
        type: "encompasses",
        weight: 0.5,
        confidence: "medium",
        rationale: "The course unit includes this child topic.",
        status: "active",
        metadata: { created_by: "ai", review_status: "ai_generated" }
      },
      {
        id: "edge.math.fractions_course_unit_requires_child",
        from: "math.topic.fractions_course_unit",
        to: "math.topic.child_with_kp",
        type: "requires",
        strength: "medium",
        confidence: "medium",
        rationale: "Legacy broad course-unit prerequisite retained for delete_edge tests.",
        failure_signal: "Probe broad prerequisite failure.",
        status: "active",
        metadata: { created_by: "ai", review_status: "ai_generated" }
      }
    ]
  }), "utf8");
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

  it("persists deprecate_node changes to canonical YAML, audit, and generated index", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      expect(getNode(graph, "math.kp.active_orphan")?.node.status).toBe("active");

      const result = await applyGraphPatch(graph, patch([
        { op: "deprecate_node", id: "math.kp.active_orphan", rationale: "Duplicate retained for audit history." }
      ]), { allow_warnings: true });

      expect(result.committed).toBe(true);
      expect(result.files_changed).toContain("ontology/mathematics/number/fractions.yaml");

      const reloaded = await loadGraph(temp);
      const node = getNode(reloaded, "math.kp.active_orphan")?.node;
      expect(node?.status).toBe("deprecated");
      expect(node).toMatchObject({ deprecation_rationale: "Duplicate retained for audit history." });

      const generated = JSON.parse(await readFile(path.join(temp, "generated", "indexes", "graph.json"), "utf8")) as { nodes: Array<{ id: string; status: string }> };
      expect(generated.nodes.find((candidate) => candidate.id === "math.kp.active_orphan")?.status).toBe("deprecated");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("persists delete_edge as a deprecated edge in YAML, audit, and generated index", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      expect(graph.edgesById.get("edge.math.fractions_course_unit_requires_child")?.status).toBe("active");

      const result = await applyGraphPatch(graph, patch([
        { op: "delete_edge", id: "edge.math.fractions_course_unit_requires_child", rationale: "Replace broad course-unit prerequisite with non-diagnostic sequencing." }
      ]), { allow_warnings: true });

      expect(result.committed).toBe(true);
      expect(result.files_changed).toContain("ontology/edges/mathematics-prerequisites.yaml");

      const reloaded = await loadGraph(temp);
      const edge = reloaded.edgesById.get("edge.math.fractions_course_unit_requires_child");
      expect(edge?.status).toBe("deprecated");
      expect(edge).toMatchObject({ deletion_rationale: "Replace broad course-unit prerequisite with non-diagnostic sequencing." });

      const generated = JSON.parse(await readFile(path.join(temp, "generated", "indexes", "graph.json"), "utf8")) as { edges: Array<{ id: string; status: string }> };
      expect(generated.edges.find((candidate) => candidate.id === "edge.math.fractions_course_unit_requires_child")?.status).toBe("deprecated");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("stages a validated patch and applies it without resending the full patch", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const compactPatch = patch([
        {
          op: "attach_kp",
          node_id: "math.topic.learner_without_kp",
          kp_id: "math.kp.active_orphan",
          rationale: "The learner topic directly assesses this knowledge point."
        }
      ]);

      const graph = await loadGraph(temp);
      const validation = await toolHandlers.validate_patch({ patch: compactPatch, strictness: "normal" }, graph, { rootDir: temp, allowWrites: true }) as {
        valid: boolean;
        staged_patch?: { validation_id: string; patch_digest: string; operation_count: number };
      };

      expect(validation.valid).toBe(true);
      expect(validation.staged_patch?.validation_id).toMatch(/^validation\./);
      expect(validation.staged_patch?.operation_count).toBe(1);

      const applyGraph = await loadGraph(temp);
      const result = await toolHandlers.apply_validated_patch({
        validation_id: validation.staged_patch!.validation_id,
        patch_digest: validation.staged_patch!.patch_digest
      }, applyGraph, { rootDir: temp, allowWrites: true }) as { committed: boolean; audit_log_path: string };

      expect(result.committed).toBe(true);

      const reloaded = await loadGraph(temp);
      expect(reloaded.edges.some((edge) =>
        edge.type === "targets_knowledge_point" &&
        edge.from === "math.topic.learner_without_kp" &&
        edge.to === "math.kp.active_orphan" &&
        edge.status === "active"
      )).toBe(true);
      await expect(readFile(path.join(temp, result.audit_log_path), "utf8")).resolves.toContain(compactPatch.patch_id);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("expands helper operations into canonical graph edges and node updates", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const result = await applyGraphPatch(graph, patch([
        {
          op: "add_child",
          parent_id: "math.topic.fractions_course_unit",
          child_id: "math.topic.learner_without_kp",
          rationale: "The course unit includes the learner topic as an actively practised child."
        },
        {
          op: "mark_foundational",
          node_id: "math.topic.learner_without_kp"
        },
        {
          op: "attach_misconception",
          node_id: "math.topic.learner_without_kp",
          misconception_id: "math.mis.test_confusion",
          rationale: "Probe misconception attachment."
        }
      ]), { allow_warnings: true });

      expect(result.committed).toBe(false);
      expect(result.validation.blocking_errors.some((issue) => issue.code === "missing_edge_to")).toBe(true);

      const withMisconception = await applyGraphPatch(graph, patch([
        {
          op: "create_node",
          node: {
            id: "math.mis.test_confusion",
            type: "misconception",
            subject: "mathematics",
            strand: "Number",
            area: "Fractions",
            label: "Test confusion",
            description: "A test misconception.",
            status: "active",
            metadata: { created_by: "ai", review_status: "ai_generated" }
          }
        },
        {
          op: "add_child",
          parent_id: "math.topic.fractions_course_unit",
          child_id: "math.topic.learner_without_kp",
          rationale: "The course unit includes the learner topic as an actively practised child."
        },
        {
          op: "mark_foundational",
          node_id: "math.topic.learner_without_kp"
        },
        {
          op: "attach_misconception",
          node_id: "math.topic.learner_without_kp",
          misconception_id: "math.mis.test_confusion",
          rationale: "Probe misconception attachment."
        }
      ]), { allow_warnings: true });

      expect(withMisconception.committed).toBe(true);
      const reloaded = await loadGraph(temp);
      expect(reloaded.edges.some((edge) => edge.id === "edge.learner_without_kp.part_of.fractions_course_unit" && edge.status === "active")).toBe(true);
      expect(reloaded.edges.some((edge) => edge.id === "edge.fractions_course_unit.encompasses.learner_without_kp" && edge.status === "active")).toBe(true);
      expect(reloaded.edges.some((edge) => edge.id === "edge.learner_without_kp.has_misconception.test_confusion" && edge.status === "active")).toBe(true);
      expect(getNode(reloaded, "math.topic.learner_without_kp")?.node).toMatchObject({
        foundational: true,
        prerequisite_policy: { requires_prerequisites: false }
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("treats repeated compact edge helpers as idempotent", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const compactPatch = patch([
        {
          op: "attach_kp",
          node_id: "math.topic.learner_without_kp",
          kp_id: "math.kp.active_orphan",
          rationale: "The learner topic directly assesses this knowledge point."
        }
      ]);

      const first = await applyGraphPatch(await loadGraph(temp), compactPatch, { allow_warnings: true });
      expect(first.committed).toBe(true);
      const second = await applyGraphPatch(await loadGraph(temp), compactPatch, { allow_warnings: true });
      expect(second.committed).toBe(true);

      const reloaded = await loadGraph(temp);
      expect(reloaded.edges.filter((edge) =>
        edge.type === "targets_knowledge_point" &&
        edge.from === "math.topic.learner_without_kp" &&
        edge.to === "math.kp.active_orphan"
      )).toHaveLength(1);
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

  it("materializes topic knowledge point references as derived target edges", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const edge = graph.edges.find((candidate) =>
        candidate.from === "math.topic.references_independent_kp" &&
        candidate.to === "math.kp.find_common_denominator" &&
        candidate.type === "targets_knowledge_point"
      );

      expect(edge).toBeDefined();
      expect(graph.derivedEdgeIds.has(edge!.id)).toBe(true);
      expect(edge?.metadata.review_status).toBe("derived");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("does not treat knowledge points referenced through topic arrays as orphaned", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const report = buildCoverageReport(graph, { subject: "mathematics", area: "Fractions" });
      expect(report.orphan_nodes).not.toContain("math.kp.find_common_denominator");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("keeps deprecated and merged orphan nodes out of active orphan cleanup", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const report = buildCoverageReport(graph, { subject: "mathematics", area: "Fractions" });

      expect(report.orphan_nodes).toContain("math.kp.active_orphan");
      expect(report.orphan_nodes).not.toContain("math.kp.deprecated_orphan");
      expect(report.deprecated_orphan_nodes).toContain("math.kp.deprecated_orphan");
      expect(report.warnings.some((issue) => issue.code === "kp_unreferenced" && issue.node_id === "math.kp.deprecated_orphan")).toBe(false);
      expect(report.role_audit.results.find((item) => item.node_id === "math.kp.deprecated_orphan")?.warnings).not.toContain("kp_unreferenced");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("does not count deprecated requires edges as active role-audit prerequisites", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const result = await applyGraphPatch(graph, patch([
        { op: "delete_edge", id: "edge.math.fractions_course_unit_requires_child", rationale: "Legacy curriculum-view prerequisite should not count as active." }
      ]), { allow_warnings: true });

      expect(result.committed).toBe(true);

      const reloaded = await loadGraph(temp);
      const report = buildCoverageReport(reloaded, { subject: "mathematics", area: "Fractions", role_audit_limit: 20 });
      const unit = report.role_audit.results.find((item) => item.node_id === "math.topic.fractions_course_unit");

      expect(unit?.requires_edge_count).toBe(0);
      expect(unit?.incoming_requires_edge_count).toBe(0);
      expect(unit?.deprecated_requires_edge_count).toBe(1);
      expect(unit?.deprecated_incoming_requires_edge_count).toBe(0);
      expect(unit?.warnings).not.toContain("curriculum_view_has_requires_edge");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("separates direct and effective knowledge point coverage", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const report = buildCoverageReport(graph, { subject: "mathematics", area: "Fractions" });
      const unit = report.coverage.find((item) => item.node_id === "math.topic.fractions_course_unit");

      expect(unit?.effective_role).toBe("curriculum_view");
      expect(unit?.direct_knowledge_points).toHaveLength(0);
      expect(unit?.effective_knowledge_points).toContain("math.kp.find_common_denominator");
      expect(report.topics_without_direct_knowledge_points).not.toContain("math.topic.fractions_course_unit");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("warns when active learner_state topics have no direct knowledge points", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const report = buildCoverageReport(graph, { subject: "mathematics", area: "Fractions" });
      expect(report.warnings.some((issue) => issue.code === "learner_state_missing_direct_kps" && issue.node_id === "math.topic.learner_without_kp")).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("warns when requires connects curriculum_view nodes", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const result = validatePatch(graph, patch([
        {
          op: "create_edge",
          edge: {
            id: "edge.math.curriculum_view_requires_curriculum_view",
            from: "math.topic.fractions_course_unit",
            to: "math.topic.fractions_course_unit",
            type: "requires",
            strength: "medium",
            confidence: "medium",
            rationale: "Probe broad course ordering.",
            failure_signal: "Probe.",
            status: "draft",
            metadata: { created_by: "ai", review_status: "ai_generated" }
          }
        }
      ]));
      expect(result.warnings.some((issue) => issue.code === "requires_involves_curriculum_view")).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("warns when standards participate in requires edges", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const standard = {
        id: "math.standard.test_standard",
        type: "curriculum_standard",
        subject: "mathematics",
        label: "Test standard",
        status: "draft",
        metadata: { created_by: "ai", review_status: "ai_generated" }
      };
      const result = validatePatch(graph, patch([
        { op: "create_node", node: standard },
        {
          op: "create_edge",
          edge: {
            id: "edge.math.child_requires_test_standard",
            from: "math.topic.child_with_kp",
            to: "math.standard.test_standard",
            type: "requires",
            strength: "medium",
            confidence: "medium",
            rationale: "Probe standard ordering.",
            failure_signal: "Probe.",
            status: "draft",
            metadata: { created_by: "ai", review_status: "ai_generated" }
          }
        }
      ]));
      expect(result.warnings.some((issue) => issue.code === "requires_involves_standard_alignment")).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("can include or suppress derived knowledge point edges in neighbourhoods", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const withoutDerived = getNeighbourhood(graph, "math.topic.references_independent_kp", 1, ["targets_knowledge_point"], 25, false);
      const withDerived = getNeighbourhood(graph, "math.topic.references_independent_kp", 1, ["targets_knowledge_point"], 25, true);
      expect(withoutDerived.edges).toHaveLength(0);
      expect(withDerived.edges.some((edge) => edge.type === "targets_knowledge_point")).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("can include or suppress derived edges in JSON exports", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const withDerived = await exportJson(graph, { subject: "mathematics", include_drafts: true, include_derived_edges: true });
      const withoutDerived = await exportJson(graph, { subject: "mathematics", include_drafts: true, include_derived_edges: false });
      expect(withDerived.edge_count).toBeGreaterThan(withoutDerived.edge_count);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("loads legacy nodes without explicit roles and exposes effective roles", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      expect(getNode(graph, "math.topic.fractions_course_unit")?.node.role).toBeUndefined();
      expect(getNode(graph, "math.topic.fractions_course_unit")?.node.effective_role).toBe("curriculum_view");
      expect(getNode(graph, "math.kp.find_common_denominator")?.node.effective_role).toBe("mastery_claim");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("reports role migration suggestions without applying them", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const report = buildRoleAuditReport(graph, { subject: "mathematics", area: "Fractions" });
      const unit = report.find((item) => item.node_id === "math.topic.fractions_course_unit");
      expect(unit?.suggested_role).toBe("curriculum_view");
      expect(unit?.explicit_role).toBeNull();
      expect(getNode(graph, "math.topic.fractions_course_unit")?.node.role).toBeUndefined();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("includes role audit rows in coverage reports for cached tool clients", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const report = buildCoverageReport(graph, { subject: "mathematics", area: "Fractions", role_audit_limit: 20 });
      expect(report.role_audit.applied).toBe(false);
      expect(report.role_audit.results.length).toBeLessThanOrEqual(20);
      expect(report.role_audit.results.some((item) => item.node_id === "math.topic.fractions_course_unit")).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("includes role audit rows in area maps for cached tool clients", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "curriculum-graph-"));
    try {
      await writeMinimalOntologyFixture(temp);
      const graph = await loadGraph(temp);
      const areaMap = getAreaMap(graph, { subject: "mathematics", area: "Fractions" });
      expect(areaMap.role_audit.applied).toBe(false);
      expect(areaMap.role_audit.results.some((item) => item.node_id === "math.topic.fractions_course_unit")).toBe(true);
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
