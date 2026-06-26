# Schema Notes

The canonical ontology source is YAML under `ontology/`. The loader normalizes
that YAML into an in-memory graph used by MCP tools, validation, coverage, and
exports.

## Node Roles

Nodes may include an optional `role` field:

```yaml
role: learner_state
```

Allowed values:

```text
learner_state
mastery_claim
diagnostic_error
curriculum_view
pathway_view
standard_alignment
assessment_view
```

Existing nodes do not need to be edited immediately. If `role` is missing, the
loader exposes `effective_role` using the inference rules documented in
[GRAPH_MODEL.md](GRAPH_MODEL.md).

`type` says what the node is. `role` or `effective_role` says how graph tools
should treat it.

## Knowledge Points

Knowledge points are first-class nodes with `type: knowledge_point` and
`effective_role: mastery_claim`. They must be observable and assessable.

Topic-like nodes may refer to knowledge points by ID:

```yaml
knowledge_points:
  - math.kp.senior.calculus.substitution_reverses_chain_rule
```

The loader materializes each reference as a derived edge:

```text
source --targets_knowledge_point--> knowledge_point
```

## Edge Types

The graph supports the existing edge types plus:

```text
targets_knowledge_point
```

Semantics:

```text
from: learner_state node, topic, procedure, or representation
to: knowledge_point
meaning: this node teaches, targets, or directly supports evidence for an observable mastery claim
```

Derived edge metadata:

```yaml
metadata:
  created_by: system
  review_status: derived
  derived_from: node.knowledge_points
```

Manual patch authors should usually use `knowledge_points` arrays instead of
creating duplicate explicit `targets_knowledge_point` edges.

## Tool Options

Several tools support role filtering:

```json
{
  "role": "learner_state",
  "roles": ["learner_state", "mastery_claim"],
  "effective_role": "curriculum_view",
  "effective_roles": ["curriculum_view", "learner_state"]
}
```

Relevant tools include `search_nodes`, `get_area_map`, `coverage_report`,
`export_graph`, and similar query surfaces.

Derived edges can be included or suppressed with:

```json
{
  "include_derived_edges": true
}
```

`get_neighbourhood` defaults to suppressing derived edges for readability.
Exports default to including them.

## Coverage Fields

Coverage reports distinguish:

```text
direct_knowledge_points
effective_knowledge_points
direct_misconceptions
effective_misconceptions
```

Direct fields describe relationships attached to the node itself. Effective
fields include relationships inherited from encompassed descendants.

`coverage_report` also includes `role_audit` rows so clients with stale tool
manifests can still inspect role migration suggestions even if
`role_audit_report` is not visible.
