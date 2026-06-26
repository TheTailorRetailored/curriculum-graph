import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { GraphIndex, loadGraph } from "../graph/loadGraph.js";
import { getPrompt, prompts } from "./prompts.js";
import { readResource, resources } from "./resources.js";
import { toolDefinitions, toolHandlers } from "./tools.js";

export const ONTOLOGY_MUTATING_TOOLS = new Set(["apply_patch"]);

export function availableToolDefinitions(allowWrites = false) {
  return allowWrites ? toolDefinitions : toolDefinitions.filter((tool) => !ONTOLOGY_MUTATING_TOOLS.has(tool.name));
}

export function assertToolAllowed(name: string, allowWrites = false) {
  if (!allowWrites && ONTOLOGY_MUTATING_TOOLS.has(name)) {
    throw new Error(`Tool ${name} is disabled in read-only mode. Set CURRICULUM_GRAPH_ALLOW_WRITES=true to enable ontology mutations.`);
  }
}

function toolError(name: string, errorType: string, error: unknown, extra: Record<string, unknown> = {}) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        ok: false,
        tool: name,
        error_type: errorType,
        error: error instanceof Error ? error.message : String(error),
        ...extra
      }, null, 2)
    }]
  };
}

export async function createCurriculumGraphServer(rootDir = process.cwd(), options: { allowWrites?: boolean } = {}) {
  const allowWrites = options.allowWrites ?? false;
  let graph: GraphIndex | null = null;

  const server = new Server(
    { name: "curriculum-graph", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: availableToolDefinitions(allowWrites) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    try {
      assertToolAllowed(toolName, allowWrites);
    } catch (error) {
      return toolError(toolName, "tool_not_allowed", error, { ontology_access: allowWrites ? "read-write" : "read-only" });
    }

    const handler = toolHandlers[toolName];
    if (!handler) return toolError(toolName, "unknown_tool", `Unknown tool: ${toolName}`);
    try {
      graph = await loadGraph(rootDir);
    } catch (error) {
      if (toolName === "health_check") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              graph_loaded: false,
              ontology_access: allowWrites ? "read-write" : "read-only",
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
      return toolError(toolName, "graph_load_failed", error, { ontology_access: allowWrites ? "read-write" : "read-only" });
    }

    try {
      const result = await handler(request.params.arguments ?? {}, graph, { allowWrites, rootDir });
      if (toolName === "apply_patch") {
        try {
          graph = await loadGraph(rootDir);
        } catch (error) {
          return toolError(toolName, "graph_reload_failed_after_apply", error, { result });
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return toolError(toolName, "tool_execution_failed", error);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({ contents: [readResource(request.params.uri)] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => getPrompt(request.params.name, request.params.arguments ?? {}));

  return server;
}
