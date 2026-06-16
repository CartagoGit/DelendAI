# @cartago-git/mcp-deps

Dependency **inventory + offline health** plugin for
[`@cartago-git/mcp-core`](../../packages/core). Reports what the project's
`package.json` declares and flags basic health issues — entirely offline and
agnostic (no network, no CVE database).

## Load it

```bash
mcp-core --plugins=deps
```

Registers `<prefix>_deps_list` and `<prefix>_deps_check`.

## Tools

- **`<prefix>_deps_list`** `{ manifest? }` →
  `{ manifest, found, counts, deps: [{name, range, section}] }`.
  Enumerates `dependencies` / `devDependencies` / `peerDependencies` /
  `optionalDependencies` with their version ranges.
- **`<prefix>_deps_check`** `{ manifest? }` →
  `{ manifest, lockfile: {present, kind}, findings: [{kind, dep?, detail}], healthy }`.
  Offline health: missing lockfile (non-reproducible builds), unpinned ranges
  (`*`, `latest`), and deps declared in more than one section.

## Configuration (`mcp-core.config.json`)

```json
{ "plugins": { "deps": { "options": { "manifest": "package.json" } } } }
```

## Scope

Intentionally **offline**: no network calls and no vulnerability database.
Security/CVE scanning needs an external vuln source and is out of scope for an
agnostic core plugin — use a dedicated tool (e.g. `npm audit`, `osv-scanner`)
for that.
