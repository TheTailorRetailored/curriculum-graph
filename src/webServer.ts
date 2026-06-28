#!/usr/bin/env node
import { createServer, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadGraph } from "./graph/loadGraph.js";

const rootDir = process.env.CURRICULUM_GRAPH_ROOT ?? process.cwd();
const webDir = path.join(rootDir, "web");
const port = Number(process.env.WEB_PORT ?? 5177);
const host = process.env.WEB_HOST ?? "127.0.0.1";

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function countsBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

async function graphPayload() {
  const graph = await loadGraph(rootDir);
  const nodes = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    label: node.label,
    subject: node.subject ?? null,
    strand: node.strand ?? null,
    area: node.area ?? null,
    year_band: node.year_band ?? null,
    grain_size: node.grain_size ?? null,
    role: node.role ?? null,
    effective_role: node.effective_role ?? null,
    foundational: node.foundational ?? false,
    status: node.status,
    description: node.description ?? "",
    aliases: node.aliases ?? [],
    parent_topic: node.parent_topic ?? null,
    knowledge_points: (node.knowledge_points ?? []).map((kp) => typeof kp === "string" ? kp : kp.id),
    knowledge_point_count: node.knowledge_points?.length ?? 0,
    path: graph.nodePathById.get(node.id) ?? null,
    metadata: node.metadata
  }));
  const edges = graph.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    strength: edge.strength ?? null,
    confidence: edge.confidence ?? null,
    weight: edge.weight ?? null,
    status: edge.status,
    rationale: edge.rationale ?? "",
    path: graph.edgePathById.get(edge.id) ?? null
  }));
  return {
    generated_at: new Date().toISOString(),
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      by_type: countsBy(nodes.map((node) => node.type)),
      by_edge_type: countsBy(edges.map((edge) => edge.type)),
      by_subject: countsBy(nodes.map((node) => node.subject ?? "none"))
    },
    nodes,
    edges
  };
}

async function serveStatic(reqPath: string, res: ServerResponse) {
  const cleanPath = reqPath === "/" ? "/index.html" : reqPath;
  const target = path.normalize(path.join(webDir, cleanPath));
  if (!target.startsWith(webDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(target);
    res.writeHead(200, { "content-type": mimeTypes[path.extname(target)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
  try {
    if (url.pathname === "/api/graph") {
      sendJson(res, 200, await graphPayload());
      return;
    }
    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, name: "curriculum-graph-web", graph_root: rootDir });
      return;
    }
    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Curriculum Graph Web UI listening at http://${host}:${port}`);
});
