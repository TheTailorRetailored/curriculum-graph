# Authoring Guide

CurriculumGraph authoring should strengthen the diagnostic/adaptive graph, not
recreate a textbook table of contents.

## Do

- Create fine-grained `learner_state` nodes for teachable and diagnosable
  concepts.
- Attach knowledge points to the most specific useful learner-state node.
- Attach misconceptions to the most specific topic where the error appears.
- Use `requires` only for serious diagnostic dependencies.
- Use `encompasses` for curriculum/view grouping and component practice.
- Use `supports` or `develops_into` for softer relationships.
- Let broad course and unit nodes inherit effective knowledge points from
  descendants.
- Query the current graph before drafting patches.
- Validate patches before applying them.

## Do Not

- Do not add fake broad knowledge points to containers just to satisfy coverage.
- Do not use `requires` for every previous lesson.
- Do not make standards the backbone of the graph.
- Do not attach misconceptions only to broad course units when a specific topic
  exists.
- Do not bulk-add semantic roles without review.
- Do not directly edit YAML for graph authoring when the MCP patch flow is
  available.

## Calculus Examples

```text
Integration = curriculum_view
u_substitution_intro = learner_state
substitution_reverses_chain_rule = mastery_claim
chain_rule_forgets_inner_derivative = diagnostic_error
```

`Integration` can be a course-unit view with no direct knowledge points. Its
effective coverage should come from descendants such as antiderivative meaning,
definite integrals, FTC, substitution, numerical integration, and related
topics.

`u_substitution_intro` should have direct knowledge points because it is a
teachable and diagnosable learner-state topic.

## Patch Workflow

1. Call `get_schema`.
2. Call `get_area_map`.
3. Search for existing nodes with `search_nodes` or `find_similar_nodes`.
4. Draft a patch.
5. Run `validate_patch`.
6. Revise if there are blocking errors or important warnings.
7. Apply only through `apply_patch` in a trusted write-enabled session.
8. Run `coverage_report`, `detect_cycles`, and relevant neighbourhood checks.

## Relationship Choices

Use `requires` when failure of the target prerequisite is a credible diagnostic
blocker for the source node.

Use `supports` when the relationship is helpful but not required.

Use `develops_into` for developmental progressions.

Use `encompasses` when a broader node includes or actively practises a component
node. Course-unit and view nodes usually connect to descendants with
`encompasses`.

Use `aligned_to` from internal graph nodes to external standards. Standards
should not define the internal learner-state graph.
