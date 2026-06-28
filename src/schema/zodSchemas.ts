import { z } from "zod";
import { CONFIDENCES, EDGE_ID_PATTERN, EDGE_TYPES, GRAIN_SIZES, ID_PATTERN, NODE_ROLES, NODE_TYPES, PATCH_OPS, REVIEW_STATUSES, STATUSES, STRENGTHS } from "./constants.js";

export const metadataSchema = z.object({
  created_by: z.string().min(1),
  review_status: z.enum(REVIEW_STATUSES),
  created_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().nullable().optional(),
  model: z.string().optional(),
  source_context: z.array(z.string()).optional(),
  confidence: z.enum(CONFIDENCES).optional()
}).passthrough();

export const embeddedKnowledgePointSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  label: z.string().min(1),
  description: z.string().min(1),
  observable: z.boolean(),
  assessable: z.boolean(),
  status: z.enum(STATUSES)
}).passthrough();

export const topicKnowledgePointSchema = z.union([embeddedKnowledgePointSchema, z.string().regex(ID_PATTERN)]);

export const nodeSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  type: z.enum(NODE_TYPES),
  subject: z.string().optional(),
  strand: z.string().optional(),
  area: z.string().optional(),
  parent_topic: z.string().regex(ID_PATTERN).optional(),
  role: z.enum(NODE_ROLES).optional(),
  effective_role: z.enum(NODE_ROLES).optional(),
  label: z.string().min(1),
  description: z.string().optional(),
  aliases: z.array(z.string()).optional().default([]),
  year_band: z.string().optional(),
  pathways: z.array(z.string()).optional().default([]),
  grain_size: z.enum(GRAIN_SIZES).optional(),
  foundational: z.boolean().optional(),
  observable: z.boolean().optional(),
  assessable: z.boolean().optional(),
  status: z.enum(STATUSES),
  knowledge_points: z.array(topicKnowledgePointSchema).optional().default([]),
  metadata: metadataSchema
}).passthrough().superRefine((node, ctx) => {
  if (node.type === "topic") {
    for (const field of ["subject", "strand", "area", "description", "year_band", "grain_size"] as const) {
      if (!node[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `topic requires ${field}` });
    }
  }
  if (node.type === "knowledge_point") {
    if (node.observable !== true) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["observable"], message: "knowledge point must be observable" });
  }
});

export const edgeSchema = z.object({
  id: z.string().regex(EDGE_ID_PATTERN),
  from: z.string().regex(ID_PATTERN),
  to: z.string().regex(ID_PATTERN),
  type: z.enum(EDGE_TYPES),
  strength: z.enum(STRENGTHS).optional(),
  confidence: z.enum(CONFIDENCES).optional(),
  rationale: z.string().optional(),
  failure_signal: z.string().optional(),
  weight: z.number().min(0.01).max(1).optional(),
  status: z.enum(STATUSES),
  metadata: metadataSchema
}).passthrough().superRefine((edge, ctx) => {
  if (edge.type === "requires") {
    for (const field of ["strength", "confidence", "rationale", "failure_signal"] as const) {
      if (!edge[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `requires edge requires ${field}` });
    }
  }
  if (edge.type === "encompasses") {
    for (const field of ["weight", "confidence", "rationale"] as const) {
      if (edge[field] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `encompasses edge requires ${field}` });
    }
  }
});

export const patchOperationSchema = z.object({
  op: z.enum(PATCH_OPS),
  node: nodeSchema.optional(),
  edge: edgeSchema.optional(),
  id: z.string().optional(),
  updates: z.record(z.unknown()).optional(),
  duplicate_resolution: z.enum(["use_existing", "create_distinct_with_reason", "merge_existing", "split_existing"]).optional(),
  rationale: z.string().optional()
}).passthrough().superRefine((operation, ctx) => {
  if (operation.op === "create_node" && !operation.node) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["node"], message: "create_node requires node" });
  if (operation.op === "create_edge" && !operation.edge) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edge"], message: "create_edge requires edge" });
  if (operation.op === "update_node" && !operation.id && !operation.node?.id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "update_node requires id or node.id" });
  if (operation.op === "update_node" && !operation.updates && !operation.node) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["updates"], message: "update_node requires updates or node" });
  if (operation.op === "deprecate_node" && !operation.id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "deprecate_node requires id" });
  if (operation.op === "deprecate_node" && !operation.rationale) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rationale"], message: "deprecate_node requires rationale" });
  if (operation.op === "update_edge" && !operation.id && !operation.edge?.id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "update_edge requires id or edge.id" });
  if (operation.op === "update_edge" && !operation.updates && !operation.edge) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["updates"], message: "update_edge requires updates or edge" });
  if (operation.op === "delete_edge" && !operation.id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "delete_edge requires id" });
  if (operation.op === "delete_edge" && !operation.rationale) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rationale"], message: "delete_edge requires rationale" });
  if (operation.op === "attach_kp" && !operation.node_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["node_id"], message: "attach_kp requires node_id" });
  if (operation.op === "attach_kp" && !operation.kp_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["kp_id"], message: "attach_kp requires kp_id" });
  if (operation.op === "attach_misconception" && !operation.node_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["node_id"], message: "attach_misconception requires node_id" });
  if (operation.op === "attach_misconception" && !operation.misconception_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["misconception_id"], message: "attach_misconception requires misconception_id" });
  if (operation.op === "add_child" && !operation.parent_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["parent_id"], message: "add_child requires parent_id" });
  if (operation.op === "add_child" && !operation.child_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["child_id"], message: "add_child requires child_id" });
  if (operation.op === "mark_foundational" && !operation.node_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["node_id"], message: "mark_foundational requires node_id" });
  if (operation.op === "deprecate_edge" && !operation.id && !operation.edge_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "deprecate_edge requires id or edge_id" });
});

export const patchSchema = z.object({
  patch_id: z.string().min(1),
  phase: z.string().min(1),
  target: z.object({
    subject: z.string().optional(),
    strand: z.string().optional(),
    area: z.string().optional(),
    year_band: z.string().optional()
  }).passthrough(),
  created_by: z.string().min(1),
  operations: z.array(patchOperationSchema),
  commit_message: z.string().min(1)
}).passthrough();

export type CurriculumNode = z.infer<typeof nodeSchema>;
export type CurriculumEdge = z.infer<typeof edgeSchema>;
export type Patch = z.infer<typeof patchSchema>;
export type PatchOperation = z.infer<typeof patchOperationSchema>;

export type ValidationIssue = {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
  node_id?: string;
  edge_id?: string;
};

export type ValidationResult = {
  valid: boolean;
  blocking_errors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggested_fixes: string[];
  summary: {
    nodes_created: number;
    edges_created: number;
    nodes_updated: number;
  };
};
