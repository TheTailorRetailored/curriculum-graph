# Role Migration

The diagnostic role model is active, but the ontology should not be bulk-edited
to add roles everywhere.

Existing YAML remains compatible because the loader infers `effective_role`.
Semantic role migration should happen area by area where inference is wrong or
ambiguous.

## Principles

- Do not bulk-add `role` to every node.
- Let the loader infer `effective_role`.
- Use `role_audit_report` to identify suspicious nodes.
- Apply explicit `role` patches only for exceptions.
- Keep semantic migration separate from schema/tooling migration.
- Review broad curriculum views and learner-state candidates with human
  judgement.

## Recommended Workflow

```text
1. Run role_audit_report for one area.
2. Review suggested roles.
3. Patch explicit roles only for exceptions.
4. Run coverage_report.
5. Run detect_cycles.
6. Continue to next area.
```

If `role_audit_report` is not visible in a cached connector manifest, use
`coverage_report` or `get_area_map`; both include `role_audit` output.

## Audit Fields

Role audit rows include:

```text
node_id
label
type
grain_size
status
explicit_role
inferred_effective_role
suggested_role
confidence
reason
has_direct_kps
effective_kp_count
encompassed_child_count
requires_edge_count
has_misconception_count
warnings
```

Common warnings:

```text
explicit_role_conflicts_with_inference
curriculum_view_has_direct_kps
learner_state_missing_direct_kps
curriculum_view_has_requires_edge
topic_course_unit_candidate_view
lesson_topic_candidate_learner_state
kp_unreferenced
misconception_unattached
```

## When to Add Explicit Roles

Add an explicit `role` only when inference is wrong or too ambiguous.

Examples:

- A `topic` with `grain_size: lesson_sequence` that is actually a diagnostic
  learner-state target may need `role: learner_state`.
- A small topic that exists only as a UI/reporting bucket may need
  `role: curriculum_view`.
- A nonstandard assessment or evidence node may need `role: assessment_view`.

Do not add explicit roles merely to repeat the inferred default.

## Migration Safety

Role migration patches should be small. Avoid mixing large semantic role changes
with unrelated edge, knowledge-point, or misconception work.

After each patch:

- run `validate_patch`
- apply through `apply_patch`
- run `coverage_report`
- run `detect_cycles`
- inspect relevant neighbourhoods with `include_derived_edges` when checking
  knowledge-point targeting
