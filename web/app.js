const canvas = document.querySelector("#graphCanvas");
const ctx = canvas.getContext("2d");

const state = {
  graph: null,
  nodes: [],
  edges: [],
  filteredNodes: [],
  filteredEdges: [],
  selectedId: null,
  hoveredId: null,
  typeFilters: new Set(["subject", "strand", "area", "topic"]),
  subject: "all",
  strand: "all",
  area: "all",
  search: "",
  mode: "overview",
  showLabels: true,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  dragStart: null
};

const typeColors = {
  subject: "#17201b",
  strand: "#27685b",
  area: "#3f5f9a",
  topic: "#a9572b",
  knowledge_point: "#7a5795",
  misconception: "#a66a00",
  representation: "#4c7770",
  procedure: "#656a32",
  task_type: "#846048",
  curriculum_standard: "#687282",
  pathway: "#6c705d"
};

const edgeColors = {
  requires: "rgba(169, 87, 43, 0.38)",
  encompasses: "rgba(39, 104, 91, 0.32)",
  part_of: "rgba(63, 95, 154, 0.28)",
  supports: "rgba(88, 101, 74, 0.25)"
};

function byId(id) {
  return state.graph.nodeMap.get(id);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setSelectOptions(select, values, label) {
  select.innerHTML = "";
  select.append(new Option(`All ${label}`, "all"));
  for (const value of values) select.append(new Option(value, value));
}

function nodeRadius(node) {
  if (node.type === "subject") return 11;
  if (node.type === "strand") return 8;
  if (node.type === "area") return 6;
  if (node.type === "topic") return 4.2;
  return 2.8;
}

function assignLayout() {
  const width = canvas.getBoundingClientRect().width || 1000;
  const height = canvas.getBoundingClientRect().height || 720;
  const centerX = width / 2;
  const centerY = height / 2 + 24;
  const strands = uniqueOptions(state.nodes.map((node) => node.strand ?? node.subject ?? "Other"));
  const strandIndex = new Map(strands.map((strand, index) => [strand, index]));
  const typeRing = {
    subject: 0,
    strand: 120,
    area: 235,
    topic: 380,
    knowledge_point: 520,
    misconception: 610,
    representation: 570,
    procedure: 560,
    task_type: 640,
    curriculum_standard: 690,
    pathway: 80
  };

  state.nodes.forEach((node, index) => {
    const strandKey = node.strand ?? node.subject ?? "Other";
    const bucket = strandIndex.get(strandKey) ?? 0;
    const bucketCount = Math.max(1, strands.length);
    const baseAngle = (bucket / bucketCount) * Math.PI * 2 - Math.PI / 2;
    const localAngle = baseAngle + ((index % 37) - 18) * 0.009;
    const ring = typeRing[node.type] ?? 500;
    const jitter = ((index * 97) % 61) - 30;
    node.x = centerX + Math.cos(localAngle) * (ring + jitter);
    node.y = centerY + Math.sin(localAngle) * (ring + jitter);
  });
}

function hydrateGraph(payload) {
  state.graph = payload;
  state.nodes = payload.nodes;
  state.edges = payload.edges;
  state.graph.nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  assignLayout();
  setSelectOptions(document.querySelector("#subjectFilter"), uniqueOptions(state.nodes.map((node) => node.subject)), "subjects");
  setSelectOptions(document.querySelector("#strandFilter"), uniqueOptions(state.nodes.map((node) => node.strand)), "strands");
  setSelectOptions(document.querySelector("#areaFilter"), uniqueOptions(state.nodes.map((node) => node.area)), "areas");
  document.querySelector("#snapshotLabel").textContent = `${payload.counts.nodes.toLocaleString()} nodes, ${payload.counts.edges.toLocaleString()} edges`;
  buildTypeFilters();
  applyFilters();
}

function buildTypeFilters() {
  const container = document.querySelector("#typeFilters");
  container.innerHTML = "";
  for (const [type, count] of Object.entries(state.graph.counts.by_type).sort((a, b) => b[1] - a[1])) {
    const button = document.createElement("button");
    button.className = `chip ${state.typeFilters.has(type) ? "active" : ""}`;
    button.textContent = `${type.replaceAll("_", " ")} ${count}`;
    button.addEventListener("click", () => {
      if (state.typeFilters.has(type)) state.typeFilters.delete(type);
      else state.typeFilters.add(type);
      button.classList.toggle("active");
      applyFilters();
    });
    container.append(button);
  }
}

function nodeMatchesSearch(node) {
  if (!state.search) return true;
  const haystack = `${node.id} ${node.label} ${node.description} ${(node.aliases ?? []).join(" ")}`.toLowerCase();
  return haystack.includes(state.search);
}

function neighbourhoodIds() {
  if (state.mode !== "neighbourhood" || !state.selectedId) return null;
  const ids = new Set([state.selectedId]);
  for (const edge of state.edges) {
    if (edge.from === state.selectedId) ids.add(edge.to);
    if (edge.to === state.selectedId) ids.add(edge.from);
  }
  return ids;
}

function assignNeighbourhoodLayout() {
  const selected = state.selectedId ? byId(state.selectedId) : null;
  if (!selected || state.filteredNodes.length < 2) return;
  const rect = canvas.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const radius = Math.min(rect.width, rect.height) * 0.2;
  selected.x = centerX;
  selected.y = centerY;
  const neighbours = state.filteredNodes
    .filter((node) => node.id !== selected.id)
    .sort((a, b) => a.label.localeCompare(b.label));
  neighbours.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / neighbours.length) * Math.PI * 2;
    node.x = centerX + Math.cos(angle) * radius;
    node.y = centerY + Math.sin(angle) * radius;
  });
}

function applyFilters() {
  const neighbourhood = neighbourhoodIds();
  state.filteredNodes = state.nodes.filter((node) => {
    if (neighbourhood && !neighbourhood.has(node.id)) return false;
    if (!state.typeFilters.has(node.type)) return false;
    if (state.subject !== "all" && node.subject !== state.subject) return false;
    if (state.strand !== "all" && node.strand !== state.strand) return false;
    if (state.area !== "all" && node.area !== state.area) return false;
    return nodeMatchesSearch(node);
  });
  const visible = new Set(state.filteredNodes.map((node) => node.id));
  state.filteredEdges = state.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
  if (state.mode === "neighbourhood") assignNeighbourhoodLayout();
  updateMetrics();
  document.querySelector("#emptyState").hidden = state.filteredNodes.length !== 0;
  draw();
}

function updateMetrics() {
  const panel = document.querySelector("#metricsPanel");
  const topicCount = state.filteredNodes.filter((node) => node.type === "topic").length;
  const kpCount = state.filteredNodes.filter((node) => node.type === "knowledge_point").length;
  const requiresCount = state.filteredEdges.filter((edge) => edge.type === "requires").length;
  panel.innerHTML = `
    <div class="metric"><span>Visible nodes</span><strong>${state.filteredNodes.length.toLocaleString()}</strong></div>
    <div class="metric"><span>Visible edges</span><strong>${state.filteredEdges.length.toLocaleString()}</strong></div>
    <div class="metric"><span>Topics</span><strong>${topicCount.toLocaleString()}</strong></div>
    <div class="metric"><span>Knowledge points</span><strong>${kpCount.toLocaleString()}</strong></div>
    <div class="metric"><span>Prerequisites</span><strong>${requiresCount.toLocaleString()}</strong></div>
  `;
}

function worldToScreen(node) {
  return {
    x: node.x * state.scale + state.offsetX,
    y: node.y * state.scale + state.offsetY
  };
}

function screenToWorld(x, y) {
  return {
    x: (x - state.offsetX) / state.scale,
    y: (y - state.offsetY) / state.scale
  };
}

function draw() {
  if (!state.graph) return;
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#f7f8f5";
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.save();
  ctx.translate(state.offsetX, state.offsetY);
  ctx.scale(state.scale, state.scale);

  for (const edge of state.filteredEdges) {
    const from = byId(edge.from);
    const to = byId(edge.to);
    if (!from || !to) continue;
    ctx.strokeStyle = edgeColors[edge.type] ?? "rgba(80, 88, 84, 0.16)";
    ctx.lineWidth = edge.type === "requires" ? 1.2 / state.scale : 0.8 / state.scale;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  for (const node of state.filteredNodes) {
    const selected = node.id === state.selectedId;
    const hovered = node.id === state.hoveredId;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius(node) + (selected ? 4 : hovered ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#ffffff" : typeColors[node.type] ?? "#5f665f";
    ctx.fill();
    if (selected || hovered) {
      ctx.lineWidth = selected ? 3 / state.scale : 2 / state.scale;
      ctx.strokeStyle = selected ? "#17201b" : "#a9572b";
      ctx.stroke();
    }
  }

  if (state.showLabels && state.scale > 0.42) {
    ctx.font = `${Math.max(10, 12 / state.scale)}px Inter, sans-serif`;
    ctx.fillStyle = "#26302a";
    const selected = state.selectedId ? byId(state.selectedId) : null;
    for (const node of state.filteredNodes) {
      const labelNeighbourhood = state.mode === "neighbourhood";
      if (!labelNeighbourhood && !["subject", "strand", "area"].includes(node.type) && node.id !== state.selectedId) continue;
      const labelLeft = labelNeighbourhood && selected && node.id !== selected.id && node.x < selected.x;
      ctx.textAlign = labelLeft ? "right" : "left";
      const labelX = node.x + (labelLeft ? -1 : 1) * (nodeRadius(node) + 4 / state.scale);
      ctx.fillText(node.label, labelX, node.y + 4 / state.scale);
    }
    ctx.textAlign = "left";
  }

  ctx.restore();
}

function pickNode(x, y) {
  const point = screenToWorld(x, y);
  let best = null;
  let bestDistance = Infinity;
  for (const node of state.filteredNodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    const threshold = nodeRadius(node) + 7 / state.scale;
    if (distance < threshold && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function selectNode(id) {
  state.selectedId = id;
  updateDetails();
  applyFilters();
}

function updateDetails() {
  const node = state.selectedId ? byId(state.selectedId) : null;
  document.querySelector("#detailType").textContent = node ? node.type.replaceAll("_", " ") : "No selection";
  document.querySelector("#detailTitle").textContent = node ? node.label : "Select a node";
  document.querySelector("#detailDescription").textContent = node?.description || "Click a node in the graph or choose a result from search to inspect relationships, provenance, and source location.";

  const properties = document.querySelector("#propertyList");
  const rows = node ? [
    ["ID", node.id],
    ["Subject", node.subject],
    ["Strand", node.strand],
    ["Area", node.area],
    ["Year band", node.year_band],
    ["Status", node.status],
    ["Source", node.path],
    ["Review", node.metadata?.review_status]
  ].filter(([, value]) => value) : [];
  properties.innerHTML = rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join("");

  const edgeList = document.querySelector("#edgeList");
  if (!node) {
    edgeList.innerHTML = "";
    return;
  }
  const attached = state.edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .slice(0, 80);
  edgeList.innerHTML = attached.map((edge) => {
    const otherId = edge.from === node.id ? edge.to : edge.from;
    const other = byId(otherId);
    const direction = edge.from === node.id ? "to" : "from";
    return `<button class="edge-item" data-node-id="${otherId}">
      <strong>${edge.type.replaceAll("_", " ")} ${direction} ${other?.label ?? otherId}</strong>
      <span>${edge.strength ?? edge.confidence ?? edge.status} · ${edge.id}</span>
    </button>`;
  }).join("") || "<p class=\"eyebrow\">No attached edges.</p>";
  edgeList.querySelectorAll("[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
}

function fitGraph() {
  if (!state.filteredNodes.length) return;
  const rect = canvas.getBoundingClientRect();
  const xs = state.filteredNodes.map((node) => node.x);
  const ys = state.filteredNodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const graphWidth = Math.max(1, maxX - minX);
  const graphHeight = Math.max(1, maxY - minY);
  state.scale = Math.min(1.35, Math.max(0.22, Math.min((rect.width - 80) / graphWidth, (rect.height - 110) / graphHeight)));
  state.offsetX = rect.width / 2 - ((minX + maxX) / 2) * state.scale;
  state.offsetY = rect.height / 2 - ((minY + maxY) / 2) * state.scale + 20;
  draw();
}

async function loadGraph() {
  const response = await fetch("/api/graph");
  hydrateGraph(await response.json());
  fitGraph();
}

document.querySelector("#reloadButton").addEventListener("click", loadGraph);
document.querySelector("#fitButton").addEventListener("click", fitGraph);
document.querySelector("#labelsButton").addEventListener("click", (event) => {
  state.showLabels = !state.showLabels;
  event.currentTarget.classList.toggle("active", state.showLabels);
  draw();
});
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    if (state.mode === "overview") assignLayout();
    applyFilters();
  });
});
document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value.toLowerCase().trim();
  applyFilters();
});
document.querySelector("#subjectFilter").addEventListener("change", (event) => {
  state.subject = event.target.value;
  applyFilters();
});
document.querySelector("#strandFilter").addEventListener("change", (event) => {
  state.strand = event.target.value;
  applyFilters();
});
document.querySelector("#areaFilter").addEventListener("change", (event) => {
  state.area = event.target.value;
  applyFilters();
});

canvas.addEventListener("pointerdown", (event) => {
  const rect = canvas.getBoundingClientRect();
  const node = pickNode(event.clientX - rect.left, event.clientY - rect.top);
  if (node) {
    selectNode(node.id);
    return;
  }
  state.dragging = true;
  state.dragStart = { x: event.clientX, y: event.clientY, offsetX: state.offsetX, offsetY: state.offsetY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  if (state.dragging && state.dragStart) {
    state.offsetX = state.dragStart.offsetX + event.clientX - state.dragStart.x;
    state.offsetY = state.dragStart.offsetY + event.clientY - state.dragStart.y;
    draw();
    return;
  }
  const node = pickNode(event.clientX - rect.left, event.clientY - rect.top);
  state.hoveredId = node?.id ?? null;
  canvas.style.cursor = node ? "pointer" : "grab";
  draw();
});

canvas.addEventListener("pointerup", (event) => {
  state.dragging = false;
  state.dragStart = null;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouse = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
  const factor = event.deltaY > 0 ? 0.9 : 1.1;
  state.scale = Math.max(0.16, Math.min(3.2, state.scale * factor));
  state.offsetX = event.clientX - rect.left - mouse.x * state.scale;
  state.offsetY = event.clientY - rect.top - mouse.y * state.scale;
  draw();
}, { passive: false });

window.addEventListener("resize", () => {
  resizeCanvas();
  fitGraph();
});

resizeCanvas();
loadGraph();
