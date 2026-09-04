# @delendai/security

Security scanning plugin for [`@delendai/core`](../../packages/core).

## Tools

- **`security_secrets`** — scan the project's source for leaked secrets
  (private keys, AWS/GitHub/Google/Slack/OpenAI tokens) with high-precision,
  offline rules. Returns normalized findings (`severity` critical…info, rule
  id, `file:line`, redacted match) plus a per-severity summary.
  - `scope`: `"changed"` (default — git working-tree changes) or `"tracked"`
    (all tracked files).
  - `includeTests`: `false` by default — test/fixture files legitimately carry
    sample secrets and are skipped unless you opt in.

- **`security_deps`** — audit dependencies with `bun audit`, `npm audit` or
  `yarn audit`, normalize the advisories into the shared finding shape and,
  optionally, enrich them with OSV.
  - `json`: `"auto"` (default), `"bun"`, `"npm"` or `"yarn"`.
  - `includeOsv`: opt-in network lookup.
  - Missing CLIs degrade into a typed install hint instead of crashing.

- **`security_sast`** — run stack-aware SAST rule packs via `semgrep` or
  `ast-grep`, with a bounded inline regex fallback when neither CLI is
  installed.
  - `runner`: `"auto"` (default), `"semgrep"` or `"ast-grep"`.
  - `rules`: optional built-in rule ids filter.
  - The built-in rule pack is data-only: `sql-injection`,
    `hardcoded-secret`, `unsafe-deserialize`, `dangerous-eval`.

- **`security_audit`** — aggregate secrets, dependency CVEs and SAST into one
  ranked backlog.

Offline, no network, no bundled binaries. The matched secret is never shown in
full. Built on the shared external-tool/scanner core (`@delendai/core`
`IFinding`/`IScanResult`), so its findings render identically to every other
scanner.

## Gate

The plugin ships an opt-in gate:

```bash
bun run --cwd plugins/security verify:security
```

The gate runs all three scanners, reads `.cache/security/baseline.json`, and
fails only on new critical findings compared with the baseline. If the
baseline is missing, the gate reports that it skipped the comparison and exits
0 so an adopter can seed the baseline without blocking other work.

Example baseline shape:

```json
{
  "criticals": [
    "sql-injection::src/db.ts::3::Potential SQL injection"
  ]
}
```

## Load

```bash
mcp-vertex --plugins=security
```

## External CLIs

- `security_deps` uses the workspace package manager audit command.
- `security_sast` prefers `semgrep`, then `ast-grep`, then falls back to the
  local matcher.
- Missing SAST CLIs surface install hints: `brew install semgrep`,
  `pipx install semgrep`, `brew install ast-grep`, `cargo install ast-grep`.

## License

BSD-3-Clause © Cartago
