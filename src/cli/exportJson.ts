import { loadGraph } from "../graph/loadGraph.js";
import { exportJson } from "../export/exportJson.js";

const graph = await loadGraph(process.cwd());
console.log(await exportJson(graph, { include_drafts: true }));
