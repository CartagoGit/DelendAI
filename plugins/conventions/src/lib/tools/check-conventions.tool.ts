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
	CONVENTION_PROFILE_IDS,
	resolveProfile,
} from '../profiles/profile-registry';
import {
	scanConventions,
	type IDirReader,
} from '../services/conventions-scan.service';

/**
 * Default roots to scan when the caller does not narrow the set.
 * a00064: `''` = the workspace root itself (the scan's SKIP_DIRS keep
 * node_modules/dist/.git out). The old default stamped mcp-vertex's own
 * monorepo layout (packages/plugins/…) — on any repo shaped differently
 * every scan silently classified 0 files, the same silent-zero class
 * that caused the a00063 adopter-agent meltdown.
 */
export const DEFAULT_SCAN_ROOTS: readonly string[] = [''];

const CHECK_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	total: z.number().optional(),
	unmatchedCount: z.number().optional(),
	counts: z.record(z.string(), z.number()).optional(),
	unmatched: z.array(z.string()).optional(),
	diagnostic: z.string().optional(),
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
	/** Language profile id (f00113); omitted = `typescript`. */
	readonly profile?: string | undefined;
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
		const resolution = resolveProfile(args.profile);
		if (!resolution.ok) {
			return toolError(
				resolution.reason,
				`Pass one of: ${resolution.supported.join(', ')} (or omit profile for typescript).`,
			);
		}
		const result = await scanConventions(
			options.reader,
			roots,
			resolution.profile,
		);
		// a00064: a zero-file scan must explain itself — same
		// anti-meltdown rail as search/docs (a00063).
		let diagnostic: string | undefined;
		if (result.total === 0) {
			diagnostic =
				result.missingRoots.length > 0
					? `scanned 0 files: configured roots do not exist in this workspace: ${result.missingRoots.join(', ')}. Fix plugins.conventions.options.roots in mcp-vertex.config.json (omit roots to scan the whole workspace).`
					: `scanned 0 files: no ${resolution.profile.id} files found under roots [${roots.map((r) => r || '.').join(', ')}] — check the profile or the roots.`;
		}
		return toolOk({
			total: result.total,
			unmatchedCount: result.unmatched.length,
			counts: result.counts,
			// Cap the inlined list; the count is always exact.
			unmatched: result.unmatched.slice(0, MAX_UNMATCHED_IN_PAYLOAD),
			...(diagnostic !== undefined ? { diagnostic } : {}),
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
					'Scan the workspace source files and report f00037 file-convention drift: total scanned, per-role counts, and the list of paths with no canonical role (`unmatched`, capped at 100; `unmatchedCount` is exact). Pass `roots` to narrow the scan and `profile` (typescript | python | rust | go, default typescript) to pick the language rule table (f00113).',
				inputSchema: z.object({
					roots: z.array(z.string()).optional(),
					profile: z.enum(CONVENTION_PROFILE_IDS).optional(),
				}),
			},
			async (args: ICheckConventionsArgs) =>
				runCheckConventions(args, options),
		);
	},
});
