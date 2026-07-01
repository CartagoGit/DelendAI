---
slug: output-validation-failure
symptom: "A tool call that used to succeed now fails with an MCP SDK error about the result not matching `outputSchema`, even though the tool's logic itself didn't throw."
cause: "mcp-vertex hardens its `outputSchema`s deliberately (see the catalogue of `r00001`/`r00002`-style hardening work): a previously permissive `z.object({}).catchall(z.unknown())` shape was replaced with an explicit object schema derived from the real TypeScript return type. Any caller that depended on extra, undocumented fields the old catchall silently allowed through will now fail validation, because those fields are no longer part of the contract."
fix: "Re-run `bun run types:generate` to refresh the generated client SDK types, then diff your caller's expected shape against the tool's new `outputSchema` (visible on its `/tools/<plugin>/<tool>` page on the web site, or via `mcp-vertex_overview` → tool registry). Update the caller to read only documented fields. If a field you relied on was genuinely dropped rather than just reshaped, open an issue — that is a breaking change that should have shipped as `feat!:`/`BREAKING CHANGE:`, not silently."
tags: [schema, tools, breaking-change]
closedBy: "r00001 / r00002 — outputSchema hardening"
---

This failure mode is a sign the hardening is working as intended: a strict
schema turns a silent drift (a caller quietly depending on undocumented
shape) into a loud, catchable validation error at the protocol boundary
instead of a runtime surprise three calls later.
