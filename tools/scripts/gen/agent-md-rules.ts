/**
 * agent-md-rules.ts — q00016 S1.
 *
 * `agent-md.script.ts` used to pick invariants with
 * `scope.isPlugin ? PLUGIN_RULES : CORE_RULES`. That ternary has only
 * two outcomes, so every non-plugin workspace — `packages/client`,
 * `packages/contracts`, `packages/test-kit`, `packages/ui-extension` —
 * inherited rules written specifically for `packages/core`:
 * "`@mcp-vertex/core` is project-agnostic" and "do not read files via
 * `node:fs`; go through `IFileReader`". Both are false, or irrelevant,
 * for those packages, and this file exists to instruct an autonomous
 * agent — a wrong rule produces a wrong action (a duplicated `IFileReader`
 * shim, a rejected legitimate `node:fs` import).
 *
 * This module is the fix: a typed, declarative registry that says
 * exactly WHICH workspace a rule applies to and WHY, instead of a
 * boolean branch. It is pure — no filesystem access — so it can be
 * unit-tested without a fixture tree, and `agent-md.script.ts` is the
 * only caller that touches disk.
 */

/**
 * The class of workspace a rule applies to.
 *
 * - `universal`  — every workspace in the repo, package or plugin.
 * - `plugin`     — any `plugins/<name>` workspace.
 * - `exactDir`   — one specific workspace, addressed by its
 *                  repo-relative dir (e.g. `packages/core`). This is
 *                  how a package-specific rule stays package-specific:
 *                  a NEW package under `packages/` matches nothing
 *                  here and gets only the universal rules.
 */
export type IAgentMdRuleScope =
	| { readonly kind: 'universal' }
	| { readonly kind: 'plugin' }
	| { readonly kind: 'exactDir'; readonly dir: string };

export interface IAgentMdRule {
	/** Stable slug; used only for debugging/dedup, never rendered. */
	readonly id: string;
	readonly scope: IAgentMdRuleScope;
	/** The bullet text rendered under `## Do not`. */
	readonly text: string;
	/** WHY this rule exists and why it is scoped the way it is. */
	readonly rationale: string;
}

/**
 * The full registry. Order is preserved in rendering (universal rules
 * first, then whatever matches the workspace), which is why it reads
 * top-to-bottom as "everyone, then plugins, then this one package".
 */
export const AGENT_MD_RULES: readonly IAgentMdRule[] = [
	{
		id: 'universal-no-stash',
		scope: { kind: 'universal' },
		text: "Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.",
		rationale:
			'Enforced by a repo-wide lint gate for every workspace, not a package/plugin convention, so it belongs to every AGENT.md.',
	},
	{
		id: 'universal-generated-markers',
		scope: { kind: 'universal' },
		text: 'Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.',
		rationale:
			'Generated-artifact drift checks run repo-wide (`gen:all --check`); a hand-edit inside a marker is reverted by the next regeneration everywhere, not just in one package.',
	},
	{
		id: 'plugin-core-public-import',
		scope: { kind: 'plugin' },
		text: 'Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.',
		rationale:
			'`@mcp-vertex/core` publishes a deliberate public surface for consumers; plugins are consumers, so this is a plugin-class rule, not a `packages/core` rule.',
	},
	{
		id: 'plugin-dry-run',
		scope: { kind: 'plugin' },
		text: 'Do not run user-facing shell or destructive tools without `dryRunSupported: true`.',
		rationale:
			'Only plugins register user-facing tools; packages have no tool surface for this to apply to.',
	},
	{
		id: 'plugin-no-absolute-paths',
		scope: { kind: 'plugin' },
		text: 'Do not surface absolute host paths; use `workspaceRoot`-relative paths only.',
		rationale:
			'Only plugin tool output reaches a host/agent across a workspace boundary; internal package code has no such boundary to leak across.',
	},
	{
		id: 'core-project-agnostic',
		scope: { kind: 'exactDir', dir: 'packages/core' },
		text: 'Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.',
		rationale:
			'This is a design invariant of `packages/core` specifically. `packages/client`, `packages/contracts`, `packages/test-kit` and `packages/ui-extension` have no such constraint — some exist precisely to hold project- or IDE-specific code.',
	},
	{
		id: 'core-file-reader',
		scope: { kind: 'exactDir', dir: 'packages/core' },
		text: 'Do not read files via `node:fs`; always go through the `IFileReader` abstraction.',
		rationale:
			'`IFileReader` is a `packages/core` abstraction over host filesystem access; other packages either do not depend on it or legitimately use `node:fs` directly (e.g. build/dev tooling).',
	},
] as const;

/** True if `rule` applies to a workspace with the given `dir`/`isPlugin`. */
const ruleApplies = (
	rule: IAgentMdRule,
	scope: { readonly dir: string; readonly isPlugin: boolean },
): boolean => {
	switch (rule.scope.kind) {
		case 'universal':
			return true;
		case 'plugin':
			return scope.isPlugin;
		case 'exactDir':
			return scope.dir === rule.scope.dir;
	}
};

/**
 * Resolve the `Do not` bullet list for one workspace. A workspace that
 * matches no `plugin`/`exactDir` rule (e.g. `packages/client`) still
 * gets the `universal` rules — never another workspace's rules.
 */
export const rulesForScope = (scope: {
	readonly dir: string;
	readonly isPlugin: boolean;
}): readonly string[] =>
	AGENT_MD_RULES.filter((rule) => ruleApplies(rule, scope)).map(
		(rule) => rule.text,
	);
