# Security

## Supported version

Only the latest revision of this pre-release project is supported.

## Current boundary

The stdio and web processes are intended for local use. The HTTP MCP server binds to loopback by default and can require a bearer token through `MCP_AUTH_TOKEN`. That token is a basic access control, not a complete production security design.

Do not expose the service publicly without adding transport security, secret management, request limits, logging, and an appropriate authentication proxy. Treat ontology patches as untrusted input until validation and human review are complete.

Never commit credentials, tunnel URLs containing secrets, personal learner records, or private source material.

## Reporting

Please report a suspected vulnerability privately to the repository owner rather than opening a public issue containing exploit details.
