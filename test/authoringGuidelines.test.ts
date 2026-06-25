import { describe, expect, it } from "vitest";
import { authoringGuidelines } from "../src/schema/authoringGuidelines.js";
import { readResource, resources } from "../src/mcp/resources.js";
import { toolHandlers } from "../src/mcp/tools.js";
import { loadGraph } from "../src/graph/loadGraph.js";
import { validatePatch } from "../src/validation/validatePatch.js";
import { checkEncompassingEdge } from "../src/validation/edgeSemantics.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type SchemaResult = {
  schema_version: string;
  section: string;
  content: Record<string, any>;
};

describe("authoring guidelines", () => {
  it("exposes edge semantics as MCP resources", () => {
    expect(resources.some((resource) => resource.uri === "curriculum://style/authoring-guidelines")).toBe(true);
    const resource = readResource("curriculum://style/edge-semantics");
    expect(resource.text).toContain("requires");
    expect(resource.text).toContain("target concept -> prerequisite concept");
  });

  it("exposes a health_check tool", () => {
    expect(toolHandlers.health_check).toBeDefined();
  });

  it("includes the constitution in get_schema", async () => {
    const graph = await loadGraph(root);
    const result = await toolHandlers.get_schema({ section: "constitution" }, graph) as SchemaResult;
    expect(result).toMatchObject({
      schema_version: "0.1.0",
      content: {
        edge_semantics: {
          supports: {
            direction: "helpful background -> target concept"
          }
        }
      }
    });
    expect(authoringGuidelines.patch_quality_bar.length).toBeGreaterThan(5);
  });

  it("exposes patch shape and operation names separately from the constitution", async () => {
    const graph = await loadGraph(root);
    const result = await toolHandlers.get_schema({ section: "patch" }, graph) as SchemaResult;
    expect(result).toMatchObject({
      schema_version: "0.1.0",
      section: "patch",
      content: {
        patch_shape: {
          target: {
            subject: "Mathematics",
            area: "Advanced functions"
          }
        },
        target_contract: {
          type: "object"
        }
      }
    });
    expect(result.content.operation_names).toContain("create_edge");
    expect(result.content.operation_names).not.toContain("add_edge");
    expect(JSON.stringify(result.content.examples)).toContain("math.senior.functions.evaluate_composite_functions");
    expect(result.content).not.toHaveProperty("core_idea");
  });

  it("exposes machine validation rules separately", async () => {
    const graph = await loadGraph(root);
    const result = await toolHandlers.get_schema({ section: "validation" }, graph) as SchemaResult;
    expect(result.content.machine_enforced_rules).toContain("Every requires edge must include strength, confidence, rationale, and failure_signal.");
    expect(result.content.warning_conditions.some((item: string) => item.includes("Legacy requires strengths"))).toBe(true);
    expect(result.content.strictness_modes.strict.behavior).toContain("promoted to blocking errors");
    expect(result.content).not.toHaveProperty("edge_semantics");
  });

  it("requires failure_signal for every requires edge", async () => {
    const graph = await loadGraph(root);
    const result = validatePatch(graph, {
      patch_id: "patch.test.requires.failure_signal",
      phase: "test",
      target: { subject: "Mathematics", area: "Fractions" },
      created_by: "test",
      operations: [
        {
          op: "create_edge",
          edge: {
            id: "edge.test_medium_requires_without_failure_signal",
            from: "math.topic.add_fractions_unlike_denominators",
            to: "math.topic.generate_equivalent_fractions",
            type: "requires",
            strength: "medium",
            confidence: "medium",
            rationale: "Test edge for validation strictness.",
            status: "draft",
            metadata: { created_by: "test", review_status: "ai_generated" }
          }
        }
      ],
      commit_message: "Probe requires validation."
    });
    expect(result.blocking_errors.some((issue) => issue.path?.includes("failure_signal") || issue.message.includes("failure_signal"))).toBe(true);
  });

  it("warns when a new requires edge uses a legacy strength alias", async () => {
    const graph = await loadGraph(root);
    const probePatch = {
      patch_id: "patch.test.requires.legacy_strength",
      phase: "test",
      target: { subject: "Mathematics", area: "Fractions" },
      created_by: "test",
      operations: [
        {
          op: "create_edge",
          edge: {
            id: "edge.test_legacy_strength_requires",
            from: "math.topic.add_fractions_unlike_denominators",
            to: "math.topic.generate_equivalent_fractions",
            type: "requires",
            strength: "weak",
            confidence: "medium",
            rationale: "Test edge for legacy strength warning.",
            failure_signal: "Learner needs remediation on the prerequisite.",
            status: "draft",
            metadata: { created_by: "test", review_status: "ai_generated" }
          }
        }
      ],
      commit_message: "Probe legacy strength warning."
    };
    const result = validatePatch(graph, probePatch);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "legacy_requires_strength")).toBe(true);

    const strictResult = validatePatch(graph, probePatch, "strict");
    expect(strictResult.valid).toBe(false);
    expect(strictResult.blocking_errors.some((issue) => issue.code === "legacy_requires_strength")).toBe(true);
    expect(strictResult.warnings.some((issue) => issue.code === "legacy_requires_strength")).toBe(false);
  });

  it("phrases encompasses nearby-relation warning as advisory", async () => {
    const warning = checkEncompassingEdge({
      id: "edge.test_function_notation_encompasses_evaluate_functions",
      from: "math.senior.functions.function_notation",
      to: "math.senior.functions.evaluate_functions",
      type: "encompasses",
      weight: 0.7,
      confidence: "medium",
      rationale: "Function notation is a course-unit level topic that intentionally covers evaluating functions.",
      status: "draft",
      metadata: { created_by: "test", review_status: "ai_generated" }
    })[0];
    expect(warning?.message).toContain("is valid");
    expect(warning?.message).toContain("consider adding");
  });

  it("does not warn on encompasses when the patch creates shared area structure", async () => {
    const graph = await loadGraph(root);
    const result = validatePatch(graph, {
      patch_id: "patch.test.encompasses.shared_structure",
      phase: "test",
      target: { subject: "Mathematics", area: "Advanced functions" },
      created_by: "test",
      operations: [
        {
          op: "create_edge",
          edge: {
            id: "edge.test_evaluate_functions_part_of_advanced_functions",
            from: "math.senior.functions.evaluate_functions",
            to: "math.area.advanced_functions",
            type: "part_of",
            status: "draft",
            metadata: { created_by: "test", review_status: "ai_generated" }
          }
        },
        {
          op: "create_edge",
          edge: {
            id: "edge.test_function_notation_encompasses_evaluate_functions_with_structure",
            from: "math.senior.functions.function_notation",
            to: "math.senior.functions.evaluate_functions",
            type: "encompasses",
            weight: 0.7,
            confidence: "medium",
            rationale: "Function notation is a course-unit level topic that intentionally covers evaluating functions.",
            status: "draft",
            metadata: { created_by: "test", review_status: "ai_generated" }
          }
        }
      ],
      commit_message: "Probe encompasses shared structure."
    }, "strict");
    expect(result.warnings.some((issue) => issue.code === "encompasses_without_nearby_relation")).toBe(false);
  });
});
