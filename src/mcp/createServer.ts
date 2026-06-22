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

export async function createCurriculumGraphServer(rootDir = process.cwd()) {
  let graph = await loadGraph(rootDir);

  const server = new Server(
    { name: "curriculum-graph", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
