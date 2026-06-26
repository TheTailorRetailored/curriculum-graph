# Changelog

## Unreleased

### Documentation

- Added dedicated documentation for the frozen diagnostic/adaptive graph model.
- Documented node roles, `effective_role` inference, derived knowledge-point
  edges, direct vs effective coverage, and role migration workflow.
- Added schema, authoring, validation, and migration guides so future graph work
  does not drift back into a textbook table-of-contents model.

## 2026-06-26

### Added Diagnostic Role Model and Derived KP Coverage

Commit `3ee31ff` added the diagnostic role model and derived KP coverage:

- Added optional node `role` and inferred `effective_role`.
- Added `targets_knowledge_point` edge type.
- Materialized derived KP edges from `node.knowledge_points`.
- Added role-aware coverage with direct/effective KPs and misconceptions.
- Fixed orphan KP handling for string KP refs.
- Added role/effective_role filtering and `include_derived_edges` options.
- Added validation warnings for broad `requires` involving curriculum views or
  standards.
- Added role audit support for future semantic migration.
