export const NODE_TYPES = [
  "subject",
  "strand",
  "area",
  "topic",
  "knowledge_point",
  "representation",
  "procedure",
  "misconception",
  "task_type",
  "curriculum_standard",
  "pathway"
] as const;

export const EDGE_TYPES = [
  "part_of",
  "requires",
  "encompasses",
  "aligned_to",
  "uses_representation",
  "uses_procedure",
  "has_misconception",
  "assessed_by",
  "contrasts_with",
  "develops_into",
  "supports"
] as const;

export const STATUSES = ["draft", "active", "deprecated", "merged", "blocked"] as const;
export const REVIEW_STATUSES = ["ai_generated", "ai_validated", "human_reviewed", "approved", "needs_revision"] as const;
export const GRAIN_SIZES = ["container", "course_unit", "lesson_sequence", "lesson_topic", "micro_topic", "atomic"] as const;
export const STRENGTHS = ["hard", "strong", "medium", "soft", "weak", "helpful"] as const;
export const CONFIDENCES = ["low", "medium", "high"] as const;
export const PATCH_OPS = [
  "create_node",
  "update_node",
  "deprecate_node",
  "merge_nodes",
  "split_node",
  "create_edge",
  "update_edge",
  "delete_edge"
] as const;

export const ID_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_]+)*$/;
export const EDGE_ID_PATTERN = /^edge\.[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;
