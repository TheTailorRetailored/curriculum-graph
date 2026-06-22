import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { loadGraph } from "../graph/loadGraph.js";
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

export async function createCurriculumGraphServer(rootDir = process.cwd(), options: { allowWrites?: boolean } = {}) {
  const allowWrites = options.allowWrites ?? false;
  let graph = await loadGraph(rootDir);

  const server = new Server(
    { name: "curriculum-graph", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: availableToolDefinitions(allowWrites) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    assertToolAllowed(request.params.name, allowWrites);
    const handler = toolHandlers[request.params.name];
    if (!handler) throw new Error(`Unknown tool: ${request.params.name}`);
    if (request.params.name === "apply_patch") graph = await loadGraph(rootDir);
    const result = await handler(request.params.arguments ?? {}, graph);
    if (request.params.name === "apply_patch") graph = await loadGraph(rootDir);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({ contents: [readResource(request.params.uri)] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => getPrompt(request.params.name, request.params.arguments ?? {}));

  return server;
}
