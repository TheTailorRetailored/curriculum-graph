import { authoringGuidelines, authoringGuidelinesMarkdown } from "../schema/authoringGuidelines.js";

export const resources = [
  { uri: "curriculum://schema/ontology", name: "Ontology schema" },
  { uri: "curriculum://schema/node", name: "Node schema" },
  { uri: "curriculum://schema/edge", name: "Edge schema" },
  { uri: "curriculum://schema/patch", name: "Patch schema" },
  { uri: "curriculum://style/authoring-guidelines", name: "Authoring guidelines" },
  { uri: "curriculum://style/edge-semantics", name: "Edge semantics and direction" },
  { uri: "curriculum://style/requires", name: "Requires edge guidance" },
  { uri: "curriculum://style/patch-quality", name: "Patch quality bar" },
  { uri: "curriculum://examples/topic", name: "Topic example" },
  { uri: "curriculum://examples/prerequisite-edge", name: "Prerequisite edge example" },
  { uri: "curriculum://examples/encompassing-edge", name: "Encompassing edge example" },
  { uri: "curriculum://style/id-conventions", name: "ID conventions" },
  { uri: "curriculum://style/granularity", name: "Granularity guide" },
  { uri: "curriculum://reports/validation", name: "Validation report" },
  { uri: "curriculum://reports/orphans", name: "Orphan report" },
  { uri: "curriculum://reports/coverage/mathematics", name: "Mathematics coverage report" }
];

export function readResource(uri: string) {
  if (uri === "curriculum://style/authoring-guidelines") {
    return { uri, mimeType: "text/markdown", text: authoringGuidelinesMarkdown() };
  }
  if (uri === "curriculum://style/edge-semantics") {
    return { uri, mimeType: "application/json", text: JSON.stringify(authoringGuidelines.edge_semantics, null, 2) };
  }
  if (uri === "curriculum://style/requires") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        edge: authoringGuidelines.edge_semantics.requires,
        prerequisite_tests: authoringGuidelines.prerequisite_tests,
        strength_guidance: authoringGuidelines.requires_strength_guidance
      }, null, 2)
    };
  }
  if (uri === "curriculum://style/patch-quality") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        quality_bar: authoringGuidelines.patch_quality_bar,
        review_checklist: authoringGuidelines.review_checklist,
        suggested_wiring_passes: authoringGuidelines.suggested_wiring_passes
      }, null, 2)
    };
  }
  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify({ uri, note: "Static resource placeholder; use get_schema and coverage_report for live v0 context." }, null, 2)
  };
}
