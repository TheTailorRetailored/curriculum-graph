export const authoringGuidelines = {
  version: "0.1",
  core_idea: [
    "The graph is not a textbook table of contents.",
    "It is a learner-state graph: nodes and edges should matter for diagnosis, sequencing, assessment, remediation, or curriculum planning.",
    "Course order is not automatically prerequisite structure.",
    "Prefer a sparse graph with high-signal edges over a dense graph full of weak curriculum-order links."
  ],
  authoring_questions: [
    "What should a learner already know before this?",
    "What misconception explains this error?",
    "What representation or procedure is being used here?",
    "What larger topic or area does this belong to?",
    "What does this concept develop into?",
    "What should I assess to check mastery?",
    "What remediation target should I send them to?"
  ],
  node_type_meanings: {
    subject: "A top-level curriculum domain, such as Mathematics or English.",
    strand: "A major vertical curriculum strand within a subject.",
    area: "A coherent subdomain inside a strand.",
    topic: "The main teachable concept or skill unit; the primary curriculum content node.",
    knowledge_point: "A precise claim or understanding a learner must internalise; should be observable or inferable from learner work.",
    misconception: "A common wrong model, confusion, or overgeneralisation that explains a class of learner errors.",
    representation: "A representational format used to understand, solve, teach, or assess.",
    procedure: "A repeatable method or algorithm; something the learner does.",
    task_type: "A form of assessment or activity that can produce evidence.",
    curriculum_standard: "An external standard or alignment node, kept separate from internal concept structure.",
    pathway: "A learner or course pathway, such as F-10 core or a senior pathway."
  },
  edge_semantics: {
    part_of: {
      direction: "child -> parent",
      meaning: "Canonical hierarchy. Does not imply prerequisite sequence.",
      example: "math.topic.domain_meaning part_of math.area.advanced_functions"
    },
    requires: {
      direction: "target concept -> prerequisite concept",
      meaning: "Use only when the dependency is instructionally serious: without the target's prerequisite, the learner is likely blocked, fragile, or misleadingly successful.",
      not_for: "Do not use for every previous lesson or for mere textbook order.",
      required_fields: ["strength", "confidence", "rationale", "failure_signal"],
      examples: [
        "evaluate_composite_functions requires evaluate_functions",
        "logarithm_meaning_as_inverse requires exponential_function_form"
      ]
    },
    encompasses: {
      direction: "larger instructional unit -> included/covered concept",
      meaning: "A larger topic intentionally includes smaller topics or knowledge points.",
      distinction: "part_of says where a node lives structurally; encompasses says what a teaching unit covers instructionally."
    },
    uses_representation: {
      direction: "topic/procedure/task -> representation",
      meaning: "The concept is commonly taught, assessed, or understood through the representation.",
      warning: "Do not turn every representation into a prerequisite unless reading that representation is itself assumed."
    },
    uses_procedure: {
      direction: "topic/task -> procedure",
      meaning: "The topic or task relies on a named method."
    },
    has_misconception: {
      direction: "concept -> misconception",
      meaning: "A misconception is a plausible wrong mental model for the topic or knowledge point.",
      guidance: "Attach misconceptions to the most specific relevant topic possible, not only broad course units."
    },
    assessed_by: {
      direction: "topic/knowledge_point -> task_type",
      meaning: "The task type gives evidence of mastery.",
      guidance: "Use sparingly at first; prefer a few strong evidence links over generic assessment links."
    },
    aligned_to: {
      direction: "internal concept -> external standard",
      meaning: "Maps internal graph nodes to external standards."
    },
    develops_into: {
      direction: "earlier concept -> later concept",
      meaning: "The later concept generalises, extends, formalises, or abstracts the earlier one.",
      warning: "Not the same as requires."
    },
    supports: {
      direction: "helpful background -> target concept",
      meaning: "Use when prior knowledge helps but is not strictly blocking.",
      examples: ["input_output_tables supports function_notation"]
    },
    contrasts_with: {
      direction: "concept A -> concept B",
      meaning: "Use for concepts learners often confuse or that are pedagogically useful to distinguish.",
      guidance: "Usually symmetric in meaning; store one edge unless tooling expects both."
    }
  },
  prerequisite_tests: {
    hard_prerequisite_test: "Could a learner meaningfully learn A without B? If no, A requires B.",
    fragility_test: "Could a learner imitate A procedurally without B but fail transfer? If yes, use medium requires or supports.",
    diagnostic_test: "If a learner fails A, would checking B be a natural remediation step?",
    representation_test: "If B is only the format used to show A, use uses_representation, not requires.",
    course_order_test: "If B merely comes earlier in a textbook, do not add requires unless another test passes.",
    overlinking_test: "Would this edge be obvious and useful to a tutor diagnosing a learner? If no, skip it."
  },
  requires_strength_guidance: {
    hard: "Learner is genuinely blocked without it.",
    medium: "Learner can attempt the topic, but success will be fragile or procedural.",
    soft: "Helpful prior knowledge that is still prerequisite-like; prefer supports for merely helpful background.",
    note: "The v0 schema also accepts legacy values strong, weak, and helpful."
  },
  patch_quality_bar: [
    "Every requires edge has rationale and failure_signal.",
    "No edge merely encodes textbook order.",
    "Each misconception is attached to the most specific topic possible.",
    "Edge direction is correct.",
    "No duplicate near-synonymous edges are added.",
    "No requires cycles are introduced.",
    "Topic grain_size is respected.",
    "Broad course_unit topics are not overloaded with every misconception.",
    "Micro_topics are not made prerequisites of their own parent unless genuinely necessary.",
    "supports is used instead of weak requires when appropriate."
  ],
  review_checklist: [
    "Are any requires edges too strong?",
    "Are any supports edges actually hard prerequisites?",
    "Are there any cycles?",
    "Are any misconceptions attached too broadly?",
    "Are any existing nodes duplicated?",
    "Are all edge ids deterministic and readable?",
    "Does every requires edge include strength, confidence, rationale, and failure_signal?",
    "Does the patch improve diagnosis or sequencing, not just add density?"
  ],
  suggested_wiring_passes: [
    "hierarchy pass: add missing part_of/encompasses edges",
    "prerequisite pass: add requires edges inside one area or topic family",
    "misconception pass: attach existing misconception nodes to specific topics",
    "representation/procedure pass: attach representations and procedures",
    "assessment pass: attach task types",
    "cleanup pass: remove or downgrade overstrong requires edges"
  ]
} as const;

export function authoringGuidelinesMarkdown(): string {
  const lines = [
    "# Curriculum Graph Authoring Guidelines v0.1",
    "",
    "## Core Idea",
    ...authoringGuidelines.core_idea.map((item) => `- ${item}`),
    "",
    "## Canonical Edge Direction",
    ...Object.entries(authoringGuidelines.edge_semantics).map(([type, info]) => `- ${type}: ${info.direction}. ${info.meaning}`),
    "",
    "## Requires Edge",
    "Use `requires` only when the dependency is instructionally serious. A requires edge means: if the learner does not have B, they are likely blocked, fragile, or misleadingly successful on A.",
    "",
    "Required fields for `requires`: `strength`, `confidence`, `rationale`, `failure_signal`.",
    "",
    "## Prerequisite Tests",
    ...Object.values(authoringGuidelines.prerequisite_tests).map((item) => `- ${item}`),
    "",
    "## Patch Quality Bar",
    ...authoringGuidelines.patch_quality_bar.map((item) => `- ${item}`),
    "",
    "## Review Checklist",
    ...authoringGuidelines.review_checklist.map((item, index) => `${index + 1}. ${item}`)
  ];
  return lines.join("\n");
}
