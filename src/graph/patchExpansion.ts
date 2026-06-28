import { GraphIndex } from "./loadGraph.js";

type RawOperation = Record<string, unknown>;
type RawPatch = Record<string, unknown> & { operations?: unknown[]; created_by?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function slugFromId(id: string): string {
  return id.split(".").at(-1)?.replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "") || "node";
}

export function deterministicEdgeId(type: string, from: string, to: string): string {
  return `edge.${slugFromId(from)}.${type}.${slugFromId(to)}`;
}

function activeEdgeFor(graph: GraphIndex, type: string, from: string, to: string) {
  return graph.edges.find((edge) =>
    edge.type === type &&
    edge.from === from &&
    edge.to === to &&
    !["deprecated", "merged"].includes(edge.status)
  );
}

function inactiveEdgeFor(graph: GraphIndex, type: string, from: string, to: string, id: string) {
  return graph.edges.find((edge) =>
    edge.id === id ||
    (edge.type === type && edge.from === from && edge.to === to && ["deprecated", "merged"].includes(edge.status))
  );
}

function metadata(createdBy: unknown) {
  return {
    created_by: typeof createdBy === "string" && createdBy.length > 0 ? createdBy : "assistant",
    review_status: "ai_generated"
  };
}

function edgeOperation(
  graph: GraphIndex,
  patch: RawPatch,
  edge: Record<string, unknown>,
  options: { idempotent?: boolean; generatedId?: boolean } = {}
): RawOperation[] {
  const type = String(edge.type ?? "");
  const from = String(edge.from ?? "");
  const to = String(edge.to ?? "");
  if (!type || !from || !to) return [{ op: "create_edge", edge }];

  const id = typeof edge.id === "string" && edge.id.length > 0 ? edge.id : deterministicEdgeId(type, from, to);
  const fullEdge = { ...edge, id, status: edge.status ?? "active", metadata: edge.metadata ?? metadata(patch.created_by) };
  const active = activeEdgeFor(graph, type, from, to);
  if ((options.idempotent || options.generatedId) && active) return [];

  const inactive = inactiveEdgeFor(graph, type, from, to, id);
  if ((options.idempotent || options.generatedId) && inactive) {
    const updates = { ...fullEdge, status: "active" };
    delete (updates as { id?: unknown }).id;
    return [{ op: "update_edge", id: inactive.id, updates }];
  }

  return [{ op: "create_edge", edge: fullEdge }];
}

function helperEdge(
  graph: GraphIndex,
  patch: RawPatch,
  type: string,
  from: unknown,
  to: unknown,
  extras: Record<string, unknown> = {}
): RawOperation[] {
  if (typeof from !== "string" || typeof to !== "string") return [{ op: "create_edge", edge: { type, from, to, ...extras } }];
  return edgeOperation(graph, patch, { type, from, to, ...extras }, { idempotent: true, generatedId: true });
}

function expandOperation(graph: GraphIndex, patch: RawPatch, operation: unknown): RawOperation[] {
  if (!isRecord(operation)) return [operation as RawOperation];
  const op = operation.op;

  if (op === "create_edge" && isRecord(operation.edge) && typeof operation.edge.id !== "string") {
    return edgeOperation(graph, patch, operation.edge, { generatedId: true });
  }

  if (op === "attach_kp") {
    return helperEdge(graph, patch, "targets_knowledge_point", operation.node_id, operation.kp_id, {
      confidence: operation.confidence,
      rationale: operation.rationale
    });
  }

  if (op === "attach_misconception") {
    return helperEdge(graph, patch, "has_misconception", operation.node_id, operation.misconception_id, {
      confidence: operation.confidence,
      rationale: operation.rationale
    });
  }

  if (op === "add_child") {
    const parentId = operation.parent_id;
    const childId = operation.child_id;
    const confidence = operation.confidence ?? "medium";
    const rationale = operation.rationale ?? "Parent topic includes the child topic as an actively practised component.";
    return [
      ...helperEdge(graph, patch, "part_of", childId, parentId, {
        rationale,
        confidence
      }),
      ...helperEdge(graph, patch, "encompasses", parentId, childId, {
        weight: operation.weight ?? 0.5,
        confidence,
        rationale
      })
    ];
  }

  if (op === "mark_foundational") {
    return [{
      op: "update_node",
      id: operation.node_id,
      updates: {
        foundational: true,
        prerequisite_policy: {
          requires_prerequisites: false
        }
      }
    }];
  }

  if (op === "deprecate_edge") {
    return [{
      op: "delete_edge",
      id: operation.id ?? operation.edge_id,
      rationale: operation.rationale ?? "Deprecated by compact deprecate_edge operation."
    }];
  }

  return [operation as RawOperation];
}

export function expandPatchInput(graph: GraphIndex, patchInput: unknown): unknown {
  if (!isRecord(patchInput) || !Array.isArray(patchInput.operations)) return patchInput;
  const patch = patchInput as RawPatch;
  const operations = patchInput.operations;
  return {
    ...patch,
    operations: operations.flatMap((operation) => expandOperation(graph, patch, operation))
  };
}
