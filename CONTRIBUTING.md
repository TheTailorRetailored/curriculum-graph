# Contributing

Curriculum Graph is currently an alpha research project. Small, reviewable changes are preferred.

## Development

```bash
npm ci
npm run lint
npm test
npm run build
```

## Ontology changes

Search the existing graph before proposing a new node. Use the patch validation and application flow where possible, keep claims specific and observable, and preserve provenance in `metadata`. Do not add personal learner data, private teaching records, API credentials, or copyrighted curriculum text.

Ontology pull requests should explain the affected subject and area, the evidence or rationale for the change, and any prerequisite relationships that may be affected. Software pull requests should include or update tests for behavioural changes.
