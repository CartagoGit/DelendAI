/**
 * server-args.ts — consumer of the declarative `SERVER_ARG_MAPPER`.
 *
 * Translates `ICliGlobalOptions` (the human CLI's parsed state) into the
 * argv the host MCP server understands (`__serve --flag value …`).
 *
 * The forwarding *policy* (which fields map to which flags, and how each
 * renders) lives in `server-args.mapper.ts` as a declarative table
 * (SOLID Open/Closed + Interface Segregation, a00036 F-001). This module
 * stays tiny: it walks the table once and handles the one field
 * (`--plugins`) where caller-supplied extras must merge in.
 */

import type { ICliGlobalOptions } from '../contracts/interfaces/cli-command.interface';
import { type IAutoForwardRule, SERVER_ARG_MAPPER } from './server-args.mapper';

/**
 * @deprecated Use `IAutoForwardRule` from `./server-args.mapper`. Kept as
 * a type alias so existing imports keep compiling.
 */
export type IServerArgForwarder = IAutoForwardRule;

/**
 * @deprecated Use `SERVER_ARG_MAPPER` from `./server-args.mapper`. Kept
 * as a value alias so existing imports keep working.
 */
export const SERVER_ARG_FORWARDERS: readonly IAutoForwardRule[] =
	SERVER_ARG_MAPPER;

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
