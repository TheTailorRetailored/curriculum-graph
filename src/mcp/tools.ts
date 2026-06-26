import { z } from "zod";
import { detectCycles, downstream } from "../graph/graphAlgorithms.js";
import { GraphIndex, loadGraph } from "../graph/loadGraph.js";
import { applyGraphPatch } from "../graph/patchGraph.js";
import { buildCoverageReport, buildRoleAuditReport } from "../graph/coverage.js";
import { findSimilarNodes, getAreaMap, getNeighbourhood, getNode, searchNodes } from "../graph/queryGraph.js";
import { exportJson } from "../export/exportJson.js";
import { exportJsonLd } from "../export/exportJsonLd.js";
import { exportYamlBundle } from "../export/exportYamlBundle.js";
import { validatePatch } from "../validation/validatePatch.js";
import { EDGE_TYPES } from "../schema/constants.js";
import { getSchemaSection } from "../schema/schemaSections.js";

type ToolContext = {
  allowWrites?: boolean;
  rootDir?: string;
};

type ToolHandler = (args: unknown, graph: GraphIndex, context?: ToolContext) => Promise<unknown> | unknown;

const roleFilterSchema = {
  role: z.string().optional(),
  roles: z.array(z.string()).optional(),
  effective_role: z.string().optional(),
  effective_roles: z.array(z.string()).optional()
};

export const toolDefinitions = [
  { name: "health_check", description: "Report server health, graph load status, write mode, and graph counts.", inputSchema: { type: "object", properties: {} } },
  { name: "get_schema", description: "Return ontology schema, validation rules, and examples.", inputSchema: { type: "object", properties: { section: { type: "string" } } } },
  { name: "search_nodes", description: "Find existing nodes before creating new ones.", inputSchema: { type: "object", properties: { query: { type: "string" }, subject: { type: "string" }, strand: { type: "string" }, area: { type: "string" }, types: { type: "array", items: { type: "string" } }, role: { type: "string" }, roles: { type: "array", items: { type: "string" } }, effective_role: { type: "string" }, effective_roles: { type: "array", items: { type: "string" } }, limit: { type: "number" } }, required: ["query"] } },
  { name: "get_node", description: "Return a full node and directly attached edges.", inputSchema: { type: "object", properties: { id: { type: "string" }, include_edges: { type: "boolean" }, include_derived_edges: { type: "boolean" } }, required: ["id"] } },
  { name: "get_neighbourhood", description: "Return local graph around a node.", inputSchema: { type: "object", properties: { id: { type: "string" }, depth: { type: "number" }, edge_types: { type: "array", items: { type: "string" } }, limit: { type: "number" }, include_derived_edges: { type: "boolean" } }, required: ["id"] } },
  { name: "get_area_map", description: "Return local authoring context for an area.", inputSchema: { type: "object", properties: { subject: { type: "string" }, area: { type: "string" }, year_band: { type: "string" }, include_schema: { type: "boolean" }, include_examples: { type: "boolean" }, include_validation_summary: { type: "boolean" }, role: { type: "string" }, roles: { type: "array", items: { type: "string" } }, effective_role: { type: "string" }, effective_roles: { type: "array", items: { type: "string" } }, include_derived_edges: { type: "boolean" } } } },
  { name: "find_similar_nodes", description: "Prevent duplicate concepts.", inputSchema: { type: "object", properties: { label: { type: "string" }, description: { type: "string" }, subject: { type: "string" }, role: { type: "string" }, roles: { type: "array", items: { type: "string" } }, effective_role: { type: "string" }, effective_roles: { type: "array", items: { type: "string" } }, limit: { type: "number" } }, required: ["label"] } },
  { name: "validate_patch", description: "Validate a patch without committing it.", inputSchema: { type: "object", properties: { patch: { type: "object" }, strictness: { type: "string" } }, required: ["patch"] } },
  { name: "apply_patch", description: "Validate and commit a patch.", inputSchema: { type: "object", properties: { patch: { type: "object" }, strictness: { type: "string" }, allow_warnings: { type: "boolean" } }, required: ["patch"] } },
  { name: "detect_cycles", description: "Detect prerequisite cycles.", inputSchema: { type: "object", properties: { edge_type: { type: "string" }, strengths: { type: "array", items: { type: "string" } }, subject: { type: "string" } } } },
  { name: "impact_analysis", description: "Show downstream dependencies before changing a node.", inputSchema: { type: "object", properties: { node_id: { type: "string" }, edge_types: { type: "array", items: { type: "string" } }, depth: { type: "number" } }, required: ["node_id"] } },
  { name: "coverage_report", description: "Report coverage by subject, strand, area, year band, role, or pathway.", inputSchema: { type: "object", properties: { subject: { type: "string" }, strand: { type: "string" }, area: { type: "string" }, role: { type: "string" }, roles: { type: "array", items: { type: "string" } }, effective_role: { type: "string" }, effective_roles: { type: "array", items: { type: "string" } }, role_audit_limit: { type: "number" } } } },
  { name: "role_audit_report", description: "Report inferred node roles and migration suggestions without applying changes.", inputSchema: { type: "object", properties: { subject: { type: "string" }, strand: { type: "string" }, area: { type: "string" }, role: { type: "string" }, roles: { type: "array", items: { type: "string" } }, effective_role: { type: "string" }, effective_roles: { type: "array", items: { type: "string" } }, limit: { type: "number" } } } },
  { name: "critique_patch", description: "Run deterministic and heuristic critique on a patch.", inputSchema: { type: "object", properties: { patch: { type: "object" }, focus: { type: "array", items: { type: "string" } } }, required: ["patch"] } },
  { name: "export_graph", description: "Export graph to JSON, JSON-LD, or YAML.", inputSchema: { type: "object", properties: { format: { type: "string" }, subject: { type: "string" }, include_drafts: { type: "boolean" }, include_derived_edges: { type: "boolean" }, role: { type: "string" }, roles: { type: "array", items: { type: "string" } }, effective_role: { type: "string" }, effective_roles: { type: "array", items: { type: "string" } } } } }
];

export const toolHandlers: Record<string, ToolHandler> = {
  health_check(_args, graph, context) {
    return {
      ok: true,
      graph_loaded: true,
      ontology_access: context?.allowWrites ? "read-write" : "read-only",
      graph_root: context?.rootDir,
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      generated_at: new Date().toISOString()
    };
  },
  get_schema(args) {
    const section = z.object({ section: z.string().default("all") }).parse(args ?? {}).section;
    return { schema_version: "0.1.0", section, content: getSchemaSection(section) };
  },
  search_nodes(args, graph) {
    return { results: searchNodes(graph, z.object({ query: z.string(), subject: z.string().optional(), strand: z.string().optional(), area: z.string().optional(), types: z.array(z.string()).optional(), ...roleFilterSchema, limit: z.number().optional() }).parse(args)) };
  },
  get_node(args, graph) {
    const input = z.object({ id: z.string(), include_edges: z.boolean().default(true), include_derived_edges: z.boolean().default(true) }).parse(args);
    return getNode(graph, input.id, input.include_edges, input.include_derived_edges);
  },
  get_neighbourhood(args, graph) {
    const input = z.object({ id: z.string(), depth: z.number().default(1), edge_types: z.array(z.string()).default([...EDGE_TYPES]), limit: z.number().default(200), include_derived_edges: z.boolean().default(false) }).parse(args);
    return getNeighbourhood(graph, input.id, input.depth, input.edge_types, input.limit, input.include_derived_edges);
  },
  get_area_map(args, graph) {
    return getAreaMap(graph, z.object({ subject: z.string().optional(), area: z.string().optional(), year_band: z.string().optional(), include_schema: z.boolean().optional(), include_examples: z.boolean().optional(), include_validation_summary: z.boolean().optional(), include_derived_edges: z.boolean().optional(), ...roleFilterSchema }).parse(args ?? {}));
  },
  find_similar_nodes(args, graph) {
    return { results: findSimilarNodes(graph, z.object({ label: z.string(), description: z.string().optional(), subject: z.string().optional(), ...roleFilterSchema, limit: z.number().optional() }).parse(args)) };
  },
  validate_patch(args, graph) {
    const input = z.object({ patch: z.unknown(), strictness: z.enum(["loose", "normal", "strict"]).default("normal") }).parse(args);
    return validatePatch(graph, input.patch, input.strictness);
  },
  async apply_patch(args, graph) {
    const input = z.object({ patch: z.unknown(), strictness: z.enum(["loose", "normal", "strict"]).default("normal"), allow_warnings: z.boolean().default(true) }).parse(args);
    return applyGraphPatch(graph, input.patch, { strictness: input.strictness, allow_warnings: input.allow_warnings });
  },
  detect_cycles(args, graph) {
    const input = z.object({ strengths: z.array(z.string()).default(["hard"]), subject: z.string().optional() }).parse(args ?? {});
    const edges = input.subject ? graph.edges.filter((edge) => graph.nodesById.get(edge.from)?.subject?.toLowerCase() === input.subject?.toLowerCase()) : graph.edges;
    return { cycles: detectCycles(edges, input.strengths) };
  },
  impact_analysis(args, graph) {
    const input = z.object({ node_id: z.string(), edge_types: z.array(z.string()).default(["requires", "encompasses"]), depth: z.number().default(4) }).parse(args);
    const dependent_nodes = downstream(graph.edges, input.node_id, input.edge_types, input.depth);
    return { node_id: input.node_id, downstream_count: dependent_nodes.length, high_impact: dependent_nodes.length >= 20, dependent_nodes };
  },
  coverage_report(args, graph) {
    const input = z.object({ subject: z.string().optional(), strand: z.string().optional(), area: z.string().optional(), ...roleFilterSchema, role_audit_limit: z.number().optional() }).parse(args ?? {});
    return buildCoverageReport(graph, input);
  },
  role_audit_report(args, graph) {
    const input = z.object({ subject: z.string().optional(), strand: z.string().optional(), area: z.string().optional(), ...roleFilterSchema, limit: z.number().optional() }).parse(args ?? {});
    const report = buildRoleAuditReport(graph, input);
    return { results: report.slice(0, input.limit ?? 200), total: report.length, applied: false };
  },
  critique_patch(args, graph) {
    const input = z.object({ patch: z.unknown() }).parse(args);
    const validation = validatePatch(graph, input.patch, "strict");
    return { issues: [...validation.blocking_errors, ...validation.warnings], recommendations: validation.suggested_fixes };
  },
  async export_graph(args, graph) {
    const input = z.object({ format: z.enum(["json", "jsonld", "yaml"]).default("json"), subject: z.string().optional(), include_drafts: z.boolean().default(true), include_derived_edges: z.boolean().default(true), ...roleFilterSchema }).parse(args ?? {});
    if (input.format === "jsonld") return exportJsonLd(graph, input);
    if (input.format === "yaml") return exportYamlBundle(graph, input);
    return exportJson(graph, input);
  }
};

export async function reloadGraph(rootDir: string) {
  return loadGraph(rootDir);
}
