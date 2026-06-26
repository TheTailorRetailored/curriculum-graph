# Validation

Validation protects the graph from schema errors, duplicate concepts, broken
edges, invalid IDs, prerequisite cycles, and relationships that do not match the
diagnostic/adaptive model.

## Blocking Rules

Blocking errors stop a patch from being applied. Examples:

- invalid patch structure
- invalid node or edge ID
- duplicate node or edge ID
- missing edge endpoint
- hard `requires` cycle
- missing required fields on `requires` or `encompasses`
- invalid `role` value
- `targets_knowledge_point` edge that does not target a knowledge point
- `has_misconception` edge that does not target a misconception
- knowledge point that is not observable or assessable in a new patch

## Role-Aware Warnings

Warnings do not always block a patch, but they should be read carefully.

### `requires_involves_curriculum_view`

A `requires` edge touches a `curriculum_view` node. This is often broad course
ordering rather than a diagnostic dependency.

Usually prefer:

```text
supports
develops_into
pathway sequencing
curriculum view ordering
```

### `requires_involves_standard_alignment`

A curriculum standard or standard-alignment node participates in `requires`.
Standards should map onto the internal graph, not define prerequisite structure.
This is the implemented warning for the broad idea sometimes described as
`standard_in_requires`.

### `kp_unreferenced`

An active knowledge point is not referenced by a learner-state node. It may be a
valid future claim, but usually it should be targeted by a topic, procedure, or
representation.

### `misconception_unattached`

An active misconception is not attached with `has_misconception`. Attach it to
the most specific learner-state topic where the error appears.

### `learner_state_missing_direct_kps`

An active `learner_state` lesson topic, micro topic, or atomic node has no direct
knowledge points. This usually needs authoring attention.

### `curriculum_view_has_no_effective_kps`

An active `curriculum_view` has encompassed children but no effective knowledge
points from descendants. This may indicate an incomplete view or missing child
coverage. This is the implemented warning for the broad idea sometimes
described as `curriculum_view_missing_effective_kps`.

### `curriculum_view_has_no_encompassed_children`

An active `curriculum_view` has no encompassed children. This may be expected for
a placeholder, but mature course/unit views should normally organize descendant
learner-state nodes.

### `duplicate_targets_knowledge_point_ref`

A manual `targets_knowledge_point` edge duplicates a `node.knowledge_points`
reference. This is non-fatal when identical, but the derived edge is preferred.

## Expected vs Serious Warnings

A `curriculum_view` with no direct knowledge points is not a problem if it has
effective knowledge points from descendants.

A `learner_state` lesson topic with no direct knowledge points probably needs
authoring attention.

A broad `requires` edge between course units is suspicious. It may be retained
temporarily during migration, but new graph work should avoid adding more of
these.

Unreferenced KPs and unattached misconceptions are often real gaps unless they
are intentionally staged for a later authoring pass.
