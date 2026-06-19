---
id: p107
type: proposal
status: pending
track: core+scaffold
---

# p107 — Quality gates multi-lenguaje

See `docs/proposals/p107-multilang-quality-gates.md` for the full
narrative. Summary:

- Today `@mcp-vertex/quality` only knows about TypeScript checks.
- We want a `IQualityGate` contract in the core so any language
  (TS, Python, Kotlin, Rust, Go) can plug its own check command.
- A new `/guide` page will document the architecture + the TS
  case + how to extend to other languages.
- 6 slices (s1 contract, s2-s3 presets, s4 plugin integration,
  s5 docs, s6 validate).
