# CurriculumGraph Graph Model

This document freezes the core CurriculumGraph architecture around a diagnostic
and adaptive learner-state model.

## 1. Core Principle

The core graph models learnable states and diagnostic dependencies.
Curriculum structures are projections/views over that graph.

In short:

```text
Topics are teaching handles.
Knowledge points are mastery handles.
Misconceptions are diagnostic handles.
Tasks are evidence handles.
```

CurriculumGraph is not a textbook table of contents. It may expose course maps,
units, strands, standards, reports, pathways, and app views, but those are views
over the learner-state graph rather than the primary model.

## 2. The Three Layers

Learner-state graph:
Concepts, skills, procedures, representations, knowledge points,
misconceptions, and task/evidence structures. This is the core graph.

Curriculum/view layer:
Courses, units, strands, areas, standards, pathways, UI maps, reporting
buckets, and app course maps. These organize or project the core graph for
humans and applications.

Evidence/assessment layer:
Tasks, task types, observations, learner evidence, and mastery estimates. This
layer is mostly future-facing, but schema decisions should preserve it. Future
learner state should be stored mainly against knowledge points, with topic
mastery computed from knowledge-point and task evidence.

## 3. Node Roles

`type` describes what kind of node something is. `role` describes how graph
tools should treat it. Existing nodes may omit `role`; the loader exposes an
inferred `effective_role` for every node.

Allowed roles:

- `learner_state`: A learnable concept, skill, topic, procedure, or
  representation that can be taught, diagnosed, sequenced, remediated, or
  assessed.
- `mastery_claim`: An observable knowledge point. This is the primary unit for
  mastery tracking.
- `diagnostic_error`: A misconception or common failure mode.
- `curriculum_view`: A course, unit, area, strand, reporting bucket, UI
  grouping, or curriculum bundle. It is not normally a direct mastery target.
- `pathway_view`: A recommended route or pedagogical sequence through the graph.
- `standard_alignment`: An external curriculum standard or alignment target.
- `assessment_view`: A task type, rubric, assessment lens, or evidence
  structure.

Examples:

```yaml
id: math.senior.calculus.u_substitution_intro
type: topic
grain_size: lesson_topic
effective_role: learner_state
```

```yaml
id: math.senior.calculus.integration
type: topic
grain_size: course_unit
effective_role: curriculum_view
```

```yaml
id: math.kp.senior.calculus.substitution_reverses_chain_rule
type: knowledge_point
effective_role: mastery_claim
```

## 4. Effective Role Inference

Explicit `role` overrides inferred `effective_role`. When `role` is missing,
the loader uses these defaults:

```text
knowledge_point -> mastery_claim
misconception -> diagnostic_error
task_type -> assessment_view
curriculum_standard -> standard_alignment
pathway -> pathway_view
subject/strand/area -> curriculum_view
topic container/course_unit/lesson_sequence -> curriculum_view
topic lesson_topic/micro_topic/atomic -> learner_state
representation/procedure -> learner_state
```

This keeps legacy YAML compatible while allowing role-aware tools and reports.

## 5. Knowledge Points

Knowledge points are first-class nodes. They are observable and assessable
mastery claims.

Authors may attach them ergonomically through a node's `knowledge_points`
array:

```yaml
knowledge_points:
  - math.kp.senior.calculus.substitution_reverses_chain_rule
```

The loader materializes this internally as a derived edge:

```text
u_substitution_intro --targets_knowledge_point--> substitution_reverses_chain_rule
```

Derived `targets_knowledge_point` edges support analytics, traversal, exports,
and coverage. Patch authors do not need to manually create these edges when the
`knowledge_points` array already represents the relationship.

## 6. Curriculum Views

Course, unit, container, strand, and area nodes are usually `curriculum_view`
nodes. They:

- are not usually direct mastery targets
- should not be forced to have direct knowledge points
- should usually have effective knowledge points through encompassed descendants
- should mostly use `encompasses` for grouping
- should rarely participate in `requires`

Example: `math.senior.calculus.integration` can have zero direct knowledge
points but many effective knowledge points from antiderivatives, definite
integrals, the Fundamental Theorem of Calculus, substitution, and related
descendants.

## 7. Requires Semantics

`requires` means a genuine diagnostic dependency, not "comes earlier in the
course".

Good examples:

```text
u_substitution_intro requires chain_rule_intro
evaluate_definite_integrals requires basic_antiderivative_rules
jump_discontinuity_limits requires one_sided_limits
```

Suspicious examples:

```text
integration requires differentiation
calculus requires algebra
year_8_algebra requires year_7_number
```

For weaker or order-like relationships, prefer:

```text
supports
develops_into
pathway sequencing
curriculum view ordering
```

## 8. Direct vs Effective Coverage

Coverage distinguishes:

```text
direct_knowledge_points
effective_knowledge_points
direct_misconceptions
effective_misconceptions
```

Direct coverage comes from relationships attached to the node itself.
Effective coverage includes direct coverage plus coverage inherited through
encompassed descendants.

`curriculum_view` nodes are judged mainly by effective coverage. A broad view
with no direct knowledge points is fine if its descendants carry mastery claims.
`learner_state` lesson topics, micro topics, and atomic nodes usually need
direct knowledge points.

## 9. Standards

Standards are secondary alignment nodes. They map onto the internal graph; they
do not define it.

Use:

```text
internal learner_state node --aligned_to--> external standard
```

Standards should not normally participate in `requires`, and they should not
carry direct knowledge points or misconceptions as if they were learner-state
nodes.
