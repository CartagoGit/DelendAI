/**
 * server-args.mapper.ts — Solid Open/Closed + Interface Segregation.
 *
 * The declarative mapper table that `server-args.ts` walks to translate
 * `ICliGlobalOptions` (the human CLI's parsed state) into the argv the
 * host MCP server understands (`__serve --flag value …`).
 *
 * Before the split, `buildServerArgs` grew one `if (globals.X !==
 * undefined) args.push('--X', …)` per host flag (a00036 F-001: the host
 * accepted 13 flags, mcpv forwarded 4). Two SOLID violations:
 *
 *   1. **OCP**: every new host flag required editing the function body.
 *      Now adding a flag is **appending one row** to `SERVER_ARG_MAPPER`
 *      — the consumer never changes.
 *   2. **ISP**: the function knew about four unrelated concerns
 *      (identity, plugins/preset, observability, bootstrap) glued into
 *      one body. Each row here is a tiny rule for a single field, and the
 *      rules are grouped by concern so a test can reason about one
 *      concern in isolation.
 *
 * Each rule is an `IAutoForwardRule` discriminated by `kind`:
 *
 *   - `'option'`     — `--flag value` when the value is a non-empty scalar.
 *   - `'flag'`       — `--flag` (no value) when the boolean is `true`.
 *   - `'repeatable'` — a comma-joined, de-duplicated list (`--flag a,b`).
 *   - `'passthrough'`— forward the raw value verbatim (escape hatch for
 *                      hosts that pre-render their own argv fragment).
 */

import type { ICliGlobalOptions } from '../contracts/interfaces/cli-command.interface';

/** Discriminator for the shape of a forwarding rule. */
export type IAutoForwardKind = 'flag' | 'option' | 'repeatable' | 'passthrough';

export interface IAutoForwardRule {
	/** Field name on `ICliGlobalOptions`. */
	readonly key: keyof ICliGlobalOptions;
	/** Shape of the rule (drives how the value renders to argv). */
	readonly kind: IAutoForwardKind;
	/**
	 * Compute the argv fragment for this field.
	 * @param key   the `keyof ICliGlobalOptions` rendered as `--${key}`
	 * @param value the field value, narrowed by the renderer below
	 */
	readonly argv: (key: string, value: unknown) => readonly string[];
}

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
];

// Re-export the escape-hatch builder so hosts can register a
// `passthrough` rule without re-deriving the renderer.
export { passthrough as passthroughRule };
