export const resources = [
  { uri: "curriculum://schema/ontology", name: "Ontology schema" },
  { uri: "curriculum://schema/node", name: "Node schema" },
  { uri: "curriculum://schema/edge", name: "Edge schema" },
  { uri: "curriculum://schema/patch", name: "Patch schema" },
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
  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify({ uri, note: "Static resource placeholder; use get_schema and coverage_report for live v0 context." }, null, 2)
  };
}
