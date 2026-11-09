# 10 — Plugin `security`

The security plugin unifies three local scanning surfaces behind one normalized
finding shape: leaked secrets, dependency CVEs and SAST.

---

## What it owns

| Surface | Tool | Notes |
|---|---|---|
| Leaked secrets | `security_secrets` | Offline, high-precision rules with redacted matches. |
| Dependency CVEs | `security_deps` | `bun` / `npm` / `yarn` audit, optional OSV enrichment. |
| SAST | `security_sast` | `semgrep` or `ast-grep`, else bounded inline fallback. |
| Aggregate posture | `security_audit` | One ranked backlog across the three scanners. |

The plugin's findings are all normalized to the shared `IFinding` contract, so
they render identically in the CLI, the host extension and downstream tooling.

---

## Safety model

- No bundled binaries, no silent installs.
- Missing CLIs return typed install hints.
- SAST execution is bounded to 30 seconds and output is redacted.
- Secrets are never echoed back in clear text.
- The opt-in gate only fails on new criticals versus a baseline.

---

## Gate

Run the opt-in gate with:

```bash
bun run --cwd plugins/security verify:security
```

It reads `.cache/security/baseline.json`, runs the three scanners and fails
only when new critical findings appear. Missing baseline means advisory skip,
not failure.

---

## Pack membership

The `security-hardened` preset adds the security plugin to a hardened stack.
That keeps the pack discoverable through the same preset catalog the rest of
the monorepo already uses.

---

## Status

Implemented through proposal `f00122`.

- S1 shipped `security_secrets`.
- S2 shipped `security_deps`.
- S3 shipped stack-aware SAST packs and `security_sast`.
- S4 shipped the opt-in gate, preset membership, catalog wiring and docs.
