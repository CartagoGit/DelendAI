/**
 * server-args.ts — Solid Open/Closed + Interface Segregation.
 *
 * Translates `ICliGlobalOptions` (the human CLI's parsed state) into the
 * argv the host MCP server understands (`__serve --flag value …`).
 *
 * Before this split, `buildServerArgs` violated two SOLID principles:
 *
 *   1. **OCP**: every new host flag required editing the function body
 *      to add a new `if (globals.X !== undefined) args.push('--X', ...)`.
 *      Adding `--cacheDir`, `--docsDir`, `--exclude-plugins`, etc. was a
 *      copy-paste of the same 2-line idiom. The host parser already
 *      accepted 13 flags; mcpv was forwarding 4 (a00036 F-001).
 *
 *   2. **ISP**: the function knew about workspace, config, preset, plugins
 *      — four concerns glued together. A test that wanted to assert
 *      "what does mcpv forward when only `preset` is set?" had to
 *      construct a full `ICliGlobalOptions` with all the other fields.
 *
 * With `SERVER_ARG_FORWARDERS`:
 *
 *   - Each forwarder is a tiny pure function that maps a single field of
 *     `ICliGlobalOptions` to an argv fragment. Adding a new host flag is
 *     appending one entry to the table — no edits to `buildServerArgs`.
 *   - Each forwarder is independently unit-testable with the `argv`
 *     helper exported below.
 *   - The "missing flag" coverage test (see `server-args.spec.ts`)
 *     catches any drift between the host parser's `KNOWN_KEYS` and the
 *     mcpv forwarders, so we never silently lose a flag again.
 */

import type { ICliGlobalOptions } from '../contracts/interfaces/cli-command.interface';

export type IServerArgForwarder = {
	/** Field name on `ICliGlobalOptions`. */
	readonly key: keyof ICliGlobalOptions;
	/** Discriminator for the forwarder shape. */
	readonly kind: 'option' | 'flag' | 'passthrough';
	/**
	 * Compute the argv fragment for this field.
	 * @param key   the `keyof ICliGlobalOptions` (used to render `--${key}`)
	 * @param value the field value, already narrowed by the caller
	 */
	readonly argv: (key: string, value: unknown) => readonly string[];
};

const optionForwarder = (
	key: keyof ICliGlobalOptions,
): IServerArgForwarder => ({
	key,
	kind: 'option',
	argv: (k, value) =>
		value === undefined || value === '' ? [] : [`--${k}`, String(value)],
});

const commaListForwarder = (
	key: keyof ICliGlobalOptions,
): IServerArgForwarder => ({
	key,
	kind: 'option',
	argv: (k, value) => {
		if (!Array.isArray(value) || value.length === 0) return [];
		const joined = [...new Set(value.map(String))].join(',');
		return joined === '' ? [] : [`--${k}`, joined];
	},
});

const flagForwarder = (key: keyof ICliGlobalOptions): IServerArgForwarder => ({
	key,
	kind: 'flag',
	argv: (k, value) => (value === true ? [`--${k}`] : []),
});

/**
 * Declarative table of mcpv → host flag forwarding rules.
 *
 * Adding a new flag is **append one entry**, not edit `buildServerArgs`.
 * Order is not significant — `buildServerArgs` walks the table once.
 */
export const SERVER_ARG_FORWARDERS: readonly IServerArgForwarder[] = [
	optionForwarder('config'),
	optionForwarder('preset'),
	optionForwarder('cacheDir'),
	optionForwarder('docsDir'),
	commaListForwarder('plugins'),
	commaListForwarder('excludePlugins'),
	flagForwarder('mcpProjectCreate'),
	flagForwarder('mcpProjectTests'),
] as const;

const forwardAll = (globals: ICliGlobalOptions): readonly string[] => {
	const out: string[] = [];
	for (const forwarder of SERVER_ARG_FORWARDERS) {
		const value = (globals as Record<string, unknown>)[forwarder.key];
		out.push(...forwarder.argv(String(forwarder.key), value));
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
	// participates. We keep this final merge local so the forwarder does
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
