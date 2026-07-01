/**
 * server-args.service.ts — f00046 + a00036 F-001 (merged in S2 follow-up).
 *
 * Translates `ICliGlobalOptions` (the human CLI's parsed state) into the
 * argv the host MCP server understands (`__serve --flag value …`) AND
 * owns the declarative forwarder table that drives that translation.
 *
 * The mapper table below is the **single source of truth** for which
 * mcpv globals map to which host flags, and how each renders. Adding a
 * host flag is **append one row** to the relevant concern group
 * (`IDENTITY_RULES`, `PLUGIN_RULES`, …) — the consumer
 * (`buildServerArgs`) never changes.
 *
 * SOLID:
 *
 *   - Single responsibility: one module owns both halves of the CLI →
 *     host argv bridge. Splitting them across two files forced every
 *     reviewer to keep two mental models of the same concern in sync
 *     (a00036 follow-up).
 *   - Open/Closed (the original F-001 win): each mcpv global that needs
 *     forwarding becomes one new entry in `SERVER_ARG_MAPPER`. The
 *     consumer walks the table once via `forwardAll()`.
 *   - Interface segregation: the rule kinds `flag | option | repeatable
 *     | passthrough` are independent. Each concern group is its own
 *     constant so a reviewer can reason about one concern at a time.
 *   - Dependency inversion: the consumer depends on the abstract
 *     `IAutoForwardRule` interface and the table constant; neither the
 *     helpers `option / repeatable / flag / passthrough / triStateFlag`
 *     nor the test suite need to know about each other.
 *
 * Two helpers stay local to this module:
 *
 *   - `forwardAll(globals)` — walks the table once, returns the merged
 *     argv fragment.
 *   - `buildServerArgs(globals, extraPlugins)` — public CLI surface;
 *     prepends `__serve --workspace`, walks the table, then merges any
 *     caller-supplied plugins into `--plugins`.
 */

import type { ICliGlobalOptions } from '../contracts/interfaces/cli-command.interface';

import type {
	IAutoForwardKind,
	IAutoForwardRule,
} from '../contracts/interfaces/server-args.interface';

/** Discriminator for the shape of a forwarding rule. */


const option = (key: keyof ICliGlobalOptions): IAutoForwardRule => ({
	key,
	kind: 'option',
	argv: (k, value) =>
		value === undefined || value === '' ? [] : [`--${k}`, String(value)],
});

const repeatable = (key: keyof ICliGlobalOptions): IAutoForwardRule => ({
	key,
	kind: 'repeatable',
	argv: (k, value) => {
		if (!Array.isArray(value) || value.length === 0) return [];
		const joined = [...new Set(value.map(String))].join(',');
		return joined === '' ? [] : [`--${k}`, joined];
	},
});

const flag = (key: keyof ICliGlobalOptions): IAutoForwardRule => ({
	key,
	kind: 'flag',
	argv: (k, value) => (value === true ? [`--${k}`] : []),
});

/**
 * Tri-state boolean forwarded under an explicit host flag name (kebab).
 * `true` ⇒ `--<flagName>`; `false` ⇒ `--<flagName>=false`; `undefined`
 * ⇒ nothing (host falls back to its file config / default). Unlike
 * `flag`, this forwards the explicit `false` so the host parser does not
 * have to guess whether absence means "off" or "unset".
 */
const triStateFlag = (
	key: keyof ICliGlobalOptions,
	flagName: string,
): IAutoForwardRule => ({
	key,
	kind: 'flag',
	argv: (_k, value) => {
		if (value === true) return [`--${flagName}`];
		if (value === false) return [`--${flagName}=false`];
		return [];
	},
});

const passthrough = (key: keyof ICliGlobalOptions): IAutoForwardRule => ({
	key,
	kind: 'passthrough',
	argv: (_k, value) =>
		Array.isArray(value)
			? value.map(String)
			: value === undefined
				? []
				: [],
});

/**
 * Mappers grouped by concern (ISP) — each group is independently
 * testable and a reviewer can reason about one concern at a time.
 */
const IDENTITY_RULES: readonly IAutoForwardRule[] = [option('config')];

const PLUGIN_RULES: readonly IAutoForwardRule[] = [
	option('preset'),
	repeatable('plugins'),
	repeatable('excludePlugins'),
];

const OBSERVABILITY_RULES: readonly IAutoForwardRule[] = [
	option('cacheDir'),
	option('docsDir'),
];

const BOOTSTRAP_RULES: readonly IAutoForwardRule[] = [
	flag('mcpProjectCreate'),
	flag('mcpProjectTests'),
];

/**
 * f00052: host-capability gates. `agent_worktree` is host-scoped, so the
 * mcpv flag forwards an explicit `--agent-worktree[=false]` to the host.
 */
const CAPABILITY_RULES: readonly IAutoForwardRule[] = [
	triStateFlag('agentWorktree', 'agent-worktree'),
];

/**
 * Declarative table of mcpv → host flag forwarding rules.
 *
 * Adding a new flag is **append one entry** to the relevant concern
 * group, not edit `buildServerArgs`. Order within the table is not
 * significant — the consumer walks it once.
 */
export const SERVER_ARG_MAPPER: readonly IAutoForwardRule[] = [
	...IDENTITY_RULES,
	...PLUGIN_RULES,
	...OBSERVABILITY_RULES,
	...BOOTSTRAP_RULES,
	...CAPABILITY_RULES,
];

// Re-export the escape-hatch builder so hosts can register a
// `passthrough` rule without re-deriving the renderer.
export { passthrough as passthroughRule };

const forwardAll = (globals: ICliGlobalOptions): readonly string[] => {
	const out: string[] = [];
	for (const rule of SERVER_ARG_MAPPER) {
		const value = globals[rule.key];
		out.push(...rule.argv(String(rule.key), value));
	}
	return out;
};

export const buildServerArgs = (
	globals: ICliGlobalOptions,
	extraPlugins: readonly string[] = [],
): string[] => {
	const args: string[] = ['__serve', '--workspace', globals.workspace];
	args.push(...forwardAll(globals));

	// `--plugins` is the only field where `extraPlugins` from the caller
	// participates. We keep this final merge local so the mapper rule does
	// not need to know about caller-supplied extras.
	const allPlugins = [
		...new Set([
			...(Array.isArray(globals.plugins) ? globals.plugins : []),
			...extraPlugins,
		]),
	];
	if (allPlugins.length > 0) args.push('--plugins', allPlugins.join(','));

	return args;
};
