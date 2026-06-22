#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCurriculumGraphServer } from "./mcp/createServer.js";

const allowWrites = process.env.CURRICULUM_GRAPH_ALLOW_WRITES === "true";
const server = await createCurriculumGraphServer(process.cwd(), { allowWrites });
await server.connect(new StdioServerTransport());
