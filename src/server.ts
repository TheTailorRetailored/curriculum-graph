#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCurriculumGraphServer } from "./mcp/createServer.js";

const server = await createCurriculumGraphServer(process.cwd());
await server.connect(new StdioServerTransport());
