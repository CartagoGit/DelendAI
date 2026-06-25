# @mcp-vertex/test-convention

**Canonical test convention for any mcp-vertex project.** Publishes the rules
the repo expects its tests to follow (extension, layout, mock API, coverage,
forbidden patterns) and gives the agent three tools to apply them:

- `<prefix>_get_convention` — return the convention as both structured data
  and a markdown block.
- `<prefix>_suggest_spec_path { sourcePath }` — for a given source file,
  return where the spec should live plus a starter skeleton.
- `<prefix>_scan_drift { scope?, maxFiles? }` — walk the workspace, compare
  specs and sources against the convention, return a structured drift
  report (`{ ok, counts, violations, scannedFiles }`).

Designed for [`@mcp-vertex/core`](../../docs/mcp-vertex/README-MCP-VERTEX.md).

## Defaults (override everything in `mcp-vertex.config.json`)

| Field               | Default                             | Notes |
|---------------------|-------------------------------------|-------|
| `specExtension`     | `spec.ts`                           | One suffix for every spec. |
| `specLayout`        | `colocate`                          | Spec lives next to the source. |
| `runners`           | `['vitest']`                        | Drives the mock API hint. |
| `mockStyle`         | `auto`                              | Resolves to `vi` for vitest, `jest` otherwise. |
| `requireDescribe`   | `true`                              | Every spec must start with a `describe(...)`. |
| `coverageThreshold` | lines/functions/statements `80`, branches `70` | Per-field override. |
| `forbiddenPatterns` | `.only(`, `xit(`, `@ts-ignore`, `console.log(` | Compiled to `RegExp(s, 'i')`. |
| `languages`         | `['ts', 'tsx']`                     | Drives rule activation. |

## Enable

```jsonc
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": [
				"@mcp-vertex/core",
				"--preset=swarm" // or explicit: --plugins=test-convention
			]
		}
	}
}
```

The plugin ships in the **`swarm` preset** (see
[`docs/mcp-vertex/examples/swarm/README.md`](../../docs/mcp-vertex/examples/swarm/README.md)) because the
orchestrator benefits most from a single source of truth on test rules.
For a single-agent setup you can enable it explicitly with
`--plugins=test-convention`.

## Override per-project

```jsonc
// mcp-vertex.config.json
{
	"plugins": {
		"test-convention": {
			"options": {
				"specExtension": "test.ts",
				"specLayout": "tests-mirror",
				"runners": ["vitest", "jest"],
				"coverageThreshold": {
					"lines": 90,
					"branches": 80
				},
				"forbiddenPatterns": ["\\.only\\(['\"`]"]
			}
		}
	}
}
```

`forbiddenPatterns` is **replaced** wholesale (the defaults drop out); pass
the strings you want kept. The plugin compiles them with
`new RegExp(s, 'i')` and caches the result.

## Tools

| Tool                          | Purpose                                                                |
|-------------------------------|------------------------------------------------------------------------|
| `<prefix>_get_convention`     | Returns `{ convention, markdown }`. Markdown is paste-ready.          |
| `<prefix>_suggest_spec_path`  | `sourcePath` → `{ specPath, rationale, skeleton }`.                    |
| `<prefix>_scan_drift`         | `scope?` (`all`/`src`/`tests`) → `{ ok, counts, violations, scannedFiles }`. `ok` only when `counts.error === 0`. |

Prefix defaults to `test-convention`; override via
`plugins.test-convention.options` if needed (the loader uses the plugin
name as the default `namespacePrefix`).

## Drift rules

The plugin enforces the following rules in `scan_drift`:

| id                          | severity | what it checks |
|-----------------------------|----------|----------------|
| `wrong-spec-extension`      | error    | File in `tests/` (or next to `src/`) does not end in `<specExtension>`. |
| `missing-top-level-describe`| error    | Spec does not start with `describe(...)` (when `requireDescribe`). |
| `wrong-mock-api`            | error    | Spec uses `jest.fn()` in a vitest project (or vice versa). |
| `forbidden-only`            | error    | `.only(` appears (would skip the rest in CI). |
| `forbidden-ts-ignore`       | error    | `@ts-ignore` appears; prefer `@ts-expect-error` with a reason. |
| `forbidden-skip`            | error    | `xit(` appears (skipped test left behind). |
| `missing-spec-for-export`   | warning  | A source file exports but has no companion spec. |
| `orphan-spec`               | warning  | A spec imports a path that does not resolve in the workspace tree. |
| `describe-it-naming`        | info     | `describe(...)` is empty; name the module under test. |
| `console-residue`           | info     | `console.log(` appears; clean it up before closing. |

## Programmatic reuse

```typescript
import {
	DEFAULT_CONVENTION,
	mergeConvention,
	suggestSpecPath,
	scanDrift,
} from '@mcp-vertex/test-convention/public';

const c = mergeConvention({ coverageThreshold: { lines: 90 } });
const where = suggestSpecPath('src/lib/foo.ts', c);
// { specPath: 'src/lib/foo.spec.ts', rationale: 'colocate: <source>.spec.ts', skeleton: '…' }
```

## See also

- Proposal [`l108`](../../docs/mcp-vertex/proposals/l108-feat-test-convention-plugin.md).
- Companion plugin: [`@mcp-vertex/quality`](../quality) — executes the
  scopes; `test-convention` teaches how to write them.
- Companion plugin: [`@mcp-vertex/status-marker`](../status-marker) — the
  coloured close marker; pair with `scan_drift.ok === true` as a gate.

BSD-3-Clause © Cartago