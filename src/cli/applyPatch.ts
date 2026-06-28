#!/usr/bin/env node
import path from "node:path";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { loadGraph } from "../graph/loadGraph.js";
import { applyGraphPatch } from "../graph/patchGraph.js";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const patchPath = process.argv[2];
if (!patchPath || patchPath.startsWith("--")) {
  console.error("Usage: npm run apply:patch -- <patch.json|patch.yaml> [--strictness loose|normal|strict] [--disallow-warnings]");
  process.exit(1);
}

const strictness = (argValue("--strictness") ?? "normal") as "loose" | "normal" | "strict";
const allow_warnings = !process.argv.includes("--disallow-warnings");
const rootDir = process.env.CURRICULUM_GRAPH_ROOT ?? process.cwd();
const absolutePatchPath = path.resolve(patchPath);
const raw = await readFile(absolutePatchPath, "utf8");
const parsed = patchPath.endsWith(".yaml") || patchPath.endsWith(".yml") ? YAML.parse(raw) : JSON.parse(raw);
const patch = parsed?.patch ?? parsed;
const graph = await loadGraph(rootDir);
const result = await applyGraphPatch(graph, patch, { strictness, allow_warnings });

console.log(JSON.stringify({
  patch_file: absolutePatchPath,
  strictness,
  allow_warnings,
  ...result
}, null, 2));

if (!result.committed) process.exit(2);
