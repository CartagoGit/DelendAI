/**
 * `<prefix>_conventions_check` — scan the workspace and report
 * file-convention drift (f00037 S3). Walks the configured roots through
 * an injected `IDirReader`, classifies every TypeScript file, and
 * returns the per-role counts plus the unmatched (`'other'`) list.
 *
 * The reader is injected (Dependency Inversion) so the registration can
 * pass a real `node:fs`-backed reader in production and tests can pass an
 * in-memory tree — no global filesystem coupling in the tool itself.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import {
	scanConventions,
	type IDirReader,
} from '../services/conventions-scan.service';

/** Default roots to scan when the caller does not narrow the set. */
export const DEFAULT_SCAN_ROOTS: readonly string[] = [
	'packages',
	'plugins',
	'extensions',
	'apps',
	'tools',
];

const CHECK_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	total: z.number().optional(),
	unmatchedCount: z.number().optional(),
	counts: z.record(z.string(), z.number()).optional(),
	unmatched: z.array(z.string()).optional(),
});

/** A cap so the tool payload stays compact on a large drift backlog. */
const MAX_UNMATCHED_IN_PAYLOAD = 100;

export interface ICheckConventionsToolOptions {
	readonly namespacePrefix: string;
	readonly reader: IDirReader;
	readonly defaultRoots?: readonly string[];
}

export interface ICheckConventionsArgs {
	readonly roots?: readonly string[] | undefined;
}

export const runCheckConventions = async (
	args: ICheckConventionsArgs,
	options: ICheckConventionsToolOptions,
) => {
	try {
		const roots =
			args.roots && args.roots.length > 0
				? args.roots
				: (options.defaultRoots ?? DEFAULT_SCAN_ROOTS);
		const result = await scanConventions(options.reader, roots);
		return toolOk({
			total: result.total,
			unmatchedCount: result.unmatched.length,
			counts: result.counts,
			// Cap the inlined list; the count is always exact.
			unmatched: result.unmatched.slice(0, MAX_UNMATCHED_IN_PAYLOAD),
		});
	} catch (error) {
		return toolError(
			error instanceof Error ? error.message : String(error),
			'Check that the scan roots exist and are readable.',
		);
	}
};

export const buildCheckConventionsRegistration = (
	options: ICheckConventionsToolOptions,
): IToolRegistration => ({
	id: 'conventions_check',
	tags: ['conventions'],
	summary:
		'Scan the workspace and report file-convention drift (per-role counts + unmatched files).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_conventions_check`,
			{
				outputSchema: CHECK_OUTPUT_SCHEMA,
				description:
					'Scan the workspace TypeScript files and report f00037 file-convention drift: total scanned, per-role counts, and the list of paths with no canonical role (`unmatched`, capped at 100; `unmatchedCount` is exact). Pass `roots` to narrow the scan.',
				inputSchema: z.object({
					roots: z.array(z.string()).optional(),
				}),
			},
			async (args: ICheckConventionsArgs) =>
				runCheckConventions(args, options),
		);
	},
});
