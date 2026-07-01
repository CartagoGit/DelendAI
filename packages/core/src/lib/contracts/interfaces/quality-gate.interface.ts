/**
 * A single quality gate the host can execute against the project. mcp-vertex
 * treats every gate as opaque data: the core knows only how to launch
 * `command` + measure the exit code; the actual toolchain semantics live in
 * presets shipped by plugins (see `@mcp-vertex/quality` for the canonical TS
 * preset and the language-agnostic runner).
 *
 * Design notes (M27 / l107):
 *
 * - The core is project-agnostic. It MUST NOT install any toolchain or
 *   import language-specific helpers. The interface only describes what
 *   "run a gate" means in a portable way.
 * - A preset (e.g. `ts-eslint`, `py-mypy`, `go-vet`) is a list of gates.
 *   The `quality` plugin loads presets from
 *   `@mcp-vertex/quality/presets/<lang>.ts` and merges them with whatever
 *   the project declares via `mcp-vertex.config.json#plugins.quality.extraGates`.
 * - `id` MUST be unique within the merged gate list. The runner uses it as
 *   the stable identifier reported in audit logs, knowledge entries and
 *   per-gate skip lists.
 * - `command` + `args` are passed verbatim to a `spawn(..., { shell: true })`
 *   call. The shell stays in the loop on purpose: presets for shell tooling
 *   (`shellcheck`, `shfmt`, etc.) need it. The `commandPolicy` gate on the
 *   consumer side is what enforces allow/deny lists.
 * - `expect` is a CLOSED union — not a free string — because silent typos
 *   (`'passed'`, `'Pass'`, `'0'`) used to slip into `IValidationCommand`
 *   configurations and the runner only caught them at runtime. Closing the
 *   union surfaces them at type-check time.
 * - `languages` is an OPEN array (a preset declares `['ts', 'tsx']`, a custom
 *   gate may declare `['sh']`); the language tag is advisory metadata used by
 *   the docs site, by `detectRunner`-style helpers and by the eventual
 *   `gate_suggest_for_file` tool (slice s4 of l107).
 * - `docs` is optional but recommended: a one-line markdown the agent can
 *   surface in knowledge entries without having to grep the registry.
 *
 * The interface deliberately mirrors the JSON shape used in
 * `mcp-vertex.config.json#plugins.quality.extraGates[]` so the parser can
 * deserialise a user config into `IQualityGate[]` without a translation
 * step (verified by the config-schema test in `packages/core/tests/`).
 *
 * @example
 * ```typescript
 * const tsGate: IQualityGate = {
 *   id: 'tsc-no-emit',
 *   command: 'tsc',
 *   args: ['--noEmit'],
 *   expect: 'pass',
 *   languages: ['ts', 'tsx'],
 *   docs: 'Type-check the workspace without emitting JS.',
 * };
 * ```
 */

/** Exit-code expectation of a gate. Closed union: only `pass` and `fail`. */
export type IQualityGateExpect = 'pass' | 'fail';

/**
 * Languages a gate is applicable to. Open string array at the type level
 * (TS, JS, Python, Rust, Go, Kotlin, shell, …) so future presets can add
 * tags without a core release. Presets MUST declare a non-empty array.
 *
 * Reserved short codes (matching the `mcp-vertex.config.json#language`
 * convention proposed in l107 §3.2):
 *
 * - `ts` / `tsx`  — TypeScript / TSX
 * - `js` / `jsx`  — vanilla JS
 * - `py`          — Python
 * - `kt`          — Kotlin (JVM)
 * - `rs`          — Rust
 * - `go`          — Go
 * - `sh`          — POSIX shell
 * - `rb`          — Ruby
 * - `java`        — Java
 *
 * Custom presets may use other codes (e.g. `elixir`, `zig`) — the runner
 * only filters by exact match when a project declares `language: 'py'`.
 */
export type IQualityGateLanguage = string;

/**
 * A single quality gate. The core treats this as opaque data — see the
 * file-level JSDoc for the rationale and the `@example` block above.
 */
export interface IQualityGate {
	/**
	 * Stable identifier of the gate. MUST be unique within the merged list
	 * (preset gates + project `extraGates`). Conventional shape:
	 * `<preset>-<short-name>` (e.g. `ts-eslint`, `py-mypy`, `custom-shellcheck`).
	 */
	readonly id: string;
	/**
	 * Executable to invoke. Passed as the first argument to
	 * `child_process.spawn(..., { shell: true })`, so it can be a bare
	 * binary name (`tsc`, `mypy`) or a path (`./scripts/check.sh`).
	 */
	readonly command: string;
	/**
	 * Arguments to pass to `command`. Empty array means "no arguments".
	 * Globs are intentionally NOT expanded here — the runner uses
	 * `shell: true` and the shell handles them per preset.
	 */
	readonly args: readonly string[];
	/**
	 * What the runner should treat as a passing outcome.
	 *
	 * - `'pass'` — exit code 0 is success, anything else is failure.
	 * - `'fail'` — exit code 0 is failure (used by mutation testing,
	 *   fuzz harnesses, "expect breakage" gates). Anything non-zero is success.
	 *
	 * Closed union; do not extend without a core release.
	 */
	readonly expect: IQualityGateExpect;
	/**
	 * Language tags the gate applies to. Used by:
	 *
	 * - the docs site to render the "Quality gates" section per language;
	 * - `detectRunner`-style helpers to pick the right preset;
	 * - the `gate_suggest_for_file` tool (l107 s4) to recommend a gate
	 *   given a source file's language.
	 *
	 * MUST contain at least one entry; the runner falls back to "unknown"
	 * if it cannot match a tag to the project's declared `language`.
	 */
	readonly languages: readonly IQualityGateLanguage[];
	/**
	 * Optional one-line markdown describing what the gate does. The agent
	 * can surface it in knowledge entries without a registry lookup.
	 */
	readonly docs?: string | undefined;
}

/**
 * Convenience alias for the merged list a runner consumes: presets resolved
 * by language + project-declared `extraGates`, deduplicated by `id`.
 */
export type IQualityGateList = readonly IQualityGate[];
