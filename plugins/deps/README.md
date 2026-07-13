# @mcp-vertex/deps

Dependency **inventory + offline health** plugin for
[`@mcp-vertex/core`](../../packages/core). Reports what the project's
`package.json` declares and flags basic health issues — entirely offline and
agnostic (no network, no CVE database).

## Load it

```bash
mcp-vertex --plugins=deps
```

Registers `<prefix>_deps_list`, `<prefix>_deps_check` and the offline
`<prefix>_deps_polyglot` inventory.

## Tools

- **`<prefix>_deps_list`** `{ manifest? }` →
  `{ manifest, found, counts, deps: [{name, range, section}] }`.
  Enumerates `dependencies` / `devDependencies` / `peerDependencies` /
  `optionalDependencies` with their version ranges.
- **`<prefix>_deps_check`** `{ manifest? }` →
  `{ manifest, lockfile: {present, kind}, findings: [{kind, dep?, detail}], healthy }`.
  Offline health: missing lockfile (non-reproducible builds), unpinned ranges
  (`*`, `latest`), and deps declared in more than one section.

## Configuration (`mcp-vertex.config.json`)

```json
{ "plugins": { "deps": { "options": { "manifest": "package.json" } } } }
```

## Optional network and write surfaces

The default remains **offline**: no network calls and no vulnerability database.
Security/CVE scanning needs an external vuln source and is out of scope for an
agnostic core plugin — use a dedicated tool (e.g. `npm audit`, `osv-scanner`)
for that.

Set `allowNetwork: true` to register `deps_outdated` with a network effect.
Set `allowWrite: true` to register `package_install` and
`package_run_script`, both with write/spawn effects. These capabilities are
absent unless explicitly enabled.
