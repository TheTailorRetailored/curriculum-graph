import { NODE_ROLES } from "../schema/constants.js";
import { CurriculumNode } from "../schema/zodSchemas.js";

export type NodeRole = typeof NODE_ROLES[number];

export function inferEffectiveRole(node: Pick<CurriculumNode, "type" | "grain_size" | "role">): NodeRole {
  if (node.role) return node.role;
  if (node.type === "knowledge_point") return "mastery_claim";
  if (node.type === "misconception") return "diagnostic_error";
  if (node.type === "task_type") return "assessment_view";
  if (node.type === "curriculum_standard") return "standard_alignment";
  if (node.type === "pathway") return "pathway_view";
  if (["subject", "strand", "area"].includes(node.type)) return "curriculum_view";
  if (node.type === "topic" && ["container", "course_unit", "lesson_sequence"].includes(node.grain_size ?? "")) return "curriculum_view";
  if (node.type === "topic" && ["lesson_topic", "micro_topic", "atomic"].includes(node.grain_size ?? "")) return "learner_state";
  if (["representation", "procedure"].includes(node.type)) return "learner_state";
  return "learner_state";
}

export function withEffectiveRole<T extends CurriculumNode>(node: T): T {
  return { ...node, effective_role: inferEffectiveRole(node) };
}

