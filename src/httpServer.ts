#!/usr/bin/env node
import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { loadGraph } from "./graph/loadGraph.js";
import { createCurriculumGraphServer } from "./mcp/createServer.js";

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "127.0.0.1";
const rootDir = process.env.CURRICULUM_GRAPH_ROOT ?? process.cwd();
const publicBaseUrl = process.env.PUBLIC_BASE_URL;
const authToken = process.env.MCP_AUTH_TOKEN;
const allowWrites = process.env.CURRICULUM_GRAPH_ALLOW_WRITES === "true";
const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",").map((hostName) => hostName.trim()).filter(Boolean);
const serverStartedAt = new Date().toISOString();
let lastServerError: { at: string; context: string; message: string; stack?: string } | null = null;

const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts });

type ExpressRequest = {
  body?: unknown;
  header(name: string): string | undefined;
};

type ExpressResponse = {
  headersSent: boolean;
  json(body: unknown): ExpressResponse;
  on(event: "close", listener: () => void): ExpressResponse;
  status(code: number): ExpressResponse;
};

type NextFunction = () => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function recordServerError(context: string, error: unknown) {
  const entry = {
    at: new Date().toISOString(),
    context,
    message: errorMessage(error),
    stack: error instanceof Error ? error.stack : undefined
  };
  lastServerError = entry;
  try {
    const logPath = path.join(rootDir, "patches", "logs", "server-errors.log");
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Console logging is the fallback when file logging is unavailable.
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  void recordServerError("unhandledRejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  void recordServerError("uncaughtException", error).finally(() => process.exit(1));
});

app.get("/health", async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const graph = await loadGraph(rootDir);
    res.json({
      ok: true,
      name: "curriculum-graph",
      endpoint: "/mcp",
      public_base_url: publicBaseUrl ?? null,
      auth: authToken ? "bearer" : "none",
      ontology_access: allowWrites ? "read-write" : "read-only",
      graph_loaded: true,
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      derived_edge_count: graph.derivedEdgeIds.size,
      root_dir: rootDir,
      pid: process.pid,
      started_at: serverStartedAt,
      uptime_seconds: Math.round(process.uptime()),
      last_error: lastServerError
    });
  } catch (error) {
    await recordServerError("health.graph_load_failed", error);
    res.json({
      ok: false,
      name: "curriculum-graph",
      endpoint: "/mcp",
      public_base_url: publicBaseUrl ?? null,
      auth: authToken ? "bearer" : "none",
      ontology_access: allowWrites ? "read-write" : "read-only",
      graph_loaded: false,
      root_dir: rootDir,
      pid: process.pid,
      started_at: serverStartedAt,
      uptime_seconds: Math.round(process.uptime()),
      error_type: "graph_load_failed",
      error: errorMessage(error),
      last_error: lastServerError
    });
  }
});

app.use("/mcp", (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (!authToken) {
    next();
    return;
  }
  const expected = `Bearer ${authToken}`;
  if (req.header("authorization") !== expected) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null
    });
    return;
  }
  next();
});

app.post("/mcp", async (req: ExpressRequest, res: ExpressResponse) => {
  let server: Awaited<ReturnType<typeof createCurriculumGraphServer>> | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  try {
    server = await createCurriculumGraphServer(rootDir, { allowWrites });
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    await server.connect(transport);
    await transport.handleRequest(req as never, res as never, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    await recordServerError("mcp.request_failed", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
          data: error instanceof Error ? error.message : String(error)
        },
        id: null
      });
    }
  } finally {
    res.on("close", () => {
      void transport?.close();
      void server?.close();
    });
  }
});

app.get("/mcp", (_req: ExpressRequest, res: ExpressResponse) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST for streamable HTTP MCP." },
    id: null
  });
});

app.delete("/mcp", (_req: ExpressRequest, res: ExpressResponse) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null
  });
});

app.listen(port, host, (error?: Error) => {
  if (error) {
    console.error("Failed to start MCP HTTP server:", error);
    process.exit(1);
  }
  const localUrl = `http://${host}:${port}`;
  console.log(`Curriculum Graph MCP HTTP server listening at ${localUrl}/mcp`);
  console.log(`Ontology access: ${allowWrites ? "read-write" : "read-only"}`);
  if (publicBaseUrl) console.log(`Public MCP URL: ${publicBaseUrl.replace(/\/$/, "")}/mcp`);
  if (!authToken) console.warn("MCP_AUTH_TOKEN is not set. Do not expose this tunnel longer than needed.");
  if (allowWrites && !authToken) console.warn("Ontology writes are enabled without bearer authentication.");
});
