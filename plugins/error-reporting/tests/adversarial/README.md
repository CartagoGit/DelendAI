# Privacy adversarial suite

This suite verifies the privacy-by-construction contract of
`@delendai/error-reporting`.

What it covers:

- registry-derived `safeToolId` for first-party `@delendai/*` tools only
- host/project tools reduced to `toolOwner` + `toolCategory`
- two distinct hosts with the same internal Vertex bug produce the same public report
- serialized payloads and issue bodies do not leak host-project markers
- property tests for resolver behaviour across arbitrary tool names

What it does not cover:

- real network submission to GitHub
- host-specific telemetry outside the safe DTO
- unrelated origin-classification rules outside error-reporting