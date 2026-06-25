# Curriculum Graph Authoring Guidelines v0.1

The graph is not a textbook table of contents. It is a learner-state graph:
nodes and edges should matter for diagnosis, sequencing, assessment,
remediation, or curriculum planning.

Course order is not automatically prerequisite structure. Helpful background
is not automatically a prerequisite. Use `requires` only when a learner will be
blocked, fragile, or misleadingly successful without the prerequisite.

## Canonical Edge Direction

- `part_of`: child -> parent.
- `requires`: target concept -> prerequisite concept.
- `encompasses`: larger instructional unit -> included or covered concept.
- `uses_representation`: concept/task/procedure -> representation.
- `uses_procedure`: concept/task -> procedure.
- `has_misconception`: concept -> misconception.
- `assessed_by`: concept/knowledge_point -> task_type.
- `aligned_to`: internal concept -> external standard.
- `develops_into`: earlier concept -> later concept.
- `supports`: helpful background -> target concept.
- `contrasts_with`: concept A -> concept B.

## Requires Edge

Use `requires` only when the dependency is instructionally serious:

> If the learner does not have B, they are likely blocked, fragile, or
> misleadingly successful on A.

Required fields:

- `strength`
- `confidence`
- `rationale`
- `failure_signal`

## Supports Edge

Use `supports` when prior knowledge is helpful but not strictly blocking.
Direction is background concept -> target concept.

## Part Of vs Encompasses

`part_of` says where a node lives structurally. `encompasses` says what a
teaching unit intentionally covers instructionally.

## Prerequisite Tests

- Could a learner meaningfully learn A without B?
- Could a learner imitate A procedurally without B but fail transfer?
- If a learner fails A, would checking B be a natural remediation step?
- Is B just the format used to show A? If so, prefer `uses_representation`.
- Does B merely come earlier in a textbook? If so, skip unless another test
  passes.
- Would this edge be useful to a tutor diagnosing a learner?

## Patch Quality Bar

- Every `requires` edge has rationale and failure_signal.
- No edge merely encodes textbook order.
- Each misconception is attached to the most specific topic possible.
- Edge direction is correct.
- No duplicate near-synonymous edges are added.
- No cycles are introduced in `requires`.
- Topic `grain_size` is respected.
- Broad course-unit topics are not overloaded with every misconception.
- `supports` is used instead of weak `requires` when appropriate.
