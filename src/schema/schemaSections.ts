import { EDGE_TYPES, GRAIN_SIZES, NODE_TYPES, PATCH_OPS, STATUSES, STRENGTHS } from "./constants.js";
import { authoringGuidelines } from "./authoringGuidelines.js";

export const nodeSchemaSection = {
  node_types: NODE_TYPES,
  node_type_meanings: authoringGuidelines.node_type_meanings,
  required_all_nodes: ["id", "type", "label", "status", "metadata.created_by", "metadata.review_status"],
  required_topic_fields: ["id", "type", "subject", "strand", "area", "label", "description", "year_band", "grain_size", "status", "metadata"],
  required_knowledge_point_fields: ["id", "type", "label", "description", "observable", "assessable", "status", "metadata"],
  allowed_statuses: STATUSES,
  allowed_grain_sizes: GRAIN_SIZES,
  example: {
    id: "math.senior.functions.evaluate_composite_functions",
    type: "topic",
    subject: "Mathematics",
    strand: "Algebra",
    area: "Advanced functions",
    label: "Evaluate composite functions",
    description: "Evaluate one function and use its output as the input to another function.",
    year_band: "11-12",
    grain_size: "lesson_topic",
    status: "active",
    metadata: { created_by: "assistant", review_status: "ai_generated" }
  }
} as const;

export const edgeSchemaSection = {
  edge_types: EDGE_TYPES,
  edge_semantics: authoringGuidelines.edge_semantics,
  required_all_edges: ["id", "from", "to", "type", "status", "metadata.created_by", "metadata.review_status"],
  requires_edges: {
    required_fields: ["strength", "confidence", "rationale", "failure_signal"],
    canonical_strengths: ["hard", "medium", "soft"],
    compatibility_aliases: {
      strong: "hard",
      weak: "soft",
      helpful: "soft"
    },
    accepted_strength_values: STRENGTHS,
    direction: authoringGuidelines.edge_semantics.requires.direction,
    guidance: authoringGuidelines.edge_semantics.requires.meaning
  },
  encompasses_edges: {
    required_fields: ["weight", "confidence", "rationale"],
    weight_range: "0.01 to 1.00"
  },
  examples: {
    requires: {
      id: "edge.evaluate_composite_functions.requires.evaluate_functions",
      from: "math.senior.functions.evaluate_composite_functions",
      to: "math.senior.functions.evaluate_functions",
      type: "requires",
      strength: "hard",
      confidence: "high",
      rationale: "Composite evaluation depends on evaluating the inner function before using its output as an input.",
      failure_signal: "Learner evaluates both functions separately or cannot use one output as the next input.",
      status: "active",
      metadata: { created_by: "assistant", review_status: "ai_generated" }
    }
  }
} as const;

export const patchSchemaSection = {
  patch_shape: {
    patch_id: "patch.math.advanced_functions.001",
    phase: "prerequisite_pass",
    target: {
      subject: "Mathematics",
      area: "Advanced functions"
    },
    created_by: "assistant",
    operations: [],
    commit_message: "Wire prerequisite edges for function notation and composition."
  },
  required_patch_fields: ["patch_id", "phase", "target", "created_by", "operations", "commit_message"],
  target_contract: {
    type: "object",
    fields: {
      subject: "optional string, e.g. Mathematics",
      strand: "optional string, e.g. Algebra",
      area: "optional string, e.g. Advanced functions",
      year_band: "optional string, e.g. 11-12"
    },
    note: "A string target such as \"Advanced functions\" is invalid. Use an object."
  },
  operation_names: PATCH_OPS,
  operation_contracts: {
    create_node: { required: ["op", "node"] },
    update_node: { required: ["op", "id or node.id", "updates or node"] },
    deprecate_node: { required: ["op", "id", "rationale"] },
    merge_nodes: { required: ["op", "id", "updates", "rationale"] },
    split_node: { required: ["op", "id", "updates", "rationale"] },
    create_edge: { required: ["op", "edge"] },
    update_edge: { required: ["op", "id or edge.id", "updates or edge"] },
    delete_edge: { required: ["op", "id", "rationale"] }
  },
  examples: {
    create_requires_edge_patch: {
      patch_id: "patch.math.functions.requires.001",
      phase: "prerequisite_pass",
      target: { subject: "Mathematics", area: "Advanced functions" },
      created_by: "assistant",
      operations: [
        {
          op: "create_edge",
          edge: edgeSchemaSection.examples.requires
        }
      ],
      commit_message: "Add a prerequisite edge for composite function evaluation."
    },
    update_node_patch: {
      patch_id: "patch.math.functions.node_update.001",
      phase: "cleanup",
      target: { subject: "Mathematics", area: "Advanced functions" },
      created_by: "assistant",
      operations: [
        {
          op: "update_node",
          id: "math.senior.functions.evaluate_composite_functions",
          updates: { status: "active" }
        }
      ],
      commit_message: "Mark composite function evaluation active."
    }
  }
} as const;

export const validationSchemaSection = {
  machine_enforced_rules: [
    "Patch must satisfy the patch object contract.",
    "Node and edge IDs must be deterministic, lowercase, and schema-valid.",
    "Duplicate node IDs and likely duplicate labels block create_node unless duplicate_resolution is supplied.",
    "Every edge endpoint must exist in the projected graph.",
    "Hard requires cycles are blocking errors.",
    "Every requires edge must include strength, confidence, rationale, and failure_signal.",
    "Every encompasses edge must include weight, confidence, and rationale.",
    "Knowledge points must be observable.",
    "AI-created nodes and edges must include metadata.created_by and metadata.review_status."
  ],
  warning_conditions: [
    "ID slug may not match label.",
    "Legacy requires strengths strong, weak, or helpful are accepted but non-canonical.",
    "Topic labels may be too broad.",
    "Topics may have too many or too few knowledge points for their grain size.",
    "Early year-band topics may suspiciously require much later topics.",
    "Encompasses edges may target nodes too broad for practice credit.",
    "High encompasses weight without high confidence is suspicious."
  ],
  strictness_modes: {
    loose: {
      intent: "Structural validation only, with minimal authoring pressure.",
      behavior: "Schema errors still block. Heuristic warnings are reported but intended mainly for exploration."
    },
    normal: {
      intent: "Default constitution-aware validation.",
      behavior: "Compatibility aliases such as strong, weak, and helpful are accepted with warnings."
    },
    strict: {
      intent: "Canonical authoring mode for production-quality patches.",
      behavior: "Canonical values are enforced; selected warnings such as legacy requires strengths are promoted to blocking errors."
    }
  },
  authoring_review_checklist: authoringGuidelines.review_checklist
} as const;

export function getSchemaSection(section: string) {
  switch (section) {
    case "constitution":
    case "authoring":
    case "guidelines":
      return authoringGuidelines;
    case "nodes":
    case "node":
      return nodeSchemaSection;
    case "edges":
    case "edge":
      return edgeSchemaSection;
    case "patch":
    case "patches":
      return patchSchemaSection;
    case "validation":
      return validationSchemaSection;
    case "examples":
      return {
        node: nodeSchemaSection.example,
        requires_edge: edgeSchemaSection.examples.requires,
        patch: patchSchemaSection.examples.create_requires_edge_patch
      };
    default:
      return {
        node_types: NODE_TYPES,
        edge_types: EDGE_TYPES,
        sections: ["constitution", "nodes", "edges", "patch", "validation", "examples"],
        constitution_summary: authoringGuidelines.core_idea,
        patch_shape: patchSchemaSection.patch_shape
      };
  }
}
