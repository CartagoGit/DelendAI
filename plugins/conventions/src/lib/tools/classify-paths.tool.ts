/**
 * `<prefix>_conventions_classify` — classify a list of repo-relative
 * paths against a language profile (f00037 S3; multi-language f00113).
 * Pure: no I/O, no scan; the caller supplies the paths. Single
 * Responsibility — the filesystem walk lives in
 * `check-conventions.tool.ts`.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolOk } from '@delendai/core/public';

import {
	CONVENTION_PROFILE_IDS,
	resolveProfile,
} from '../profiles/profile-registry';
import { classifyWithProfile } from '../profiles/profile.contract';

// f00113 S5: roles are profile-scoped OPEN strings now (each language
// brings its own vocabulary), so the output schema validates shape,
// not a closed enum. The previous enum was already stale — it listed
// 10 of the TypeScript profile's 30+ roles.
const CLASSIFY_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	results: z
		.array(z.object({ path: z.string(), role: z.string() }))
		.optional(),
	unmatched: z.array(z.string()).optional(),
});

export interface IClassifyPathsArgs {
	readonly paths: readonly string[];
	/** Language profile id (f00113); omitted = `typescript`. */
	readonly profile?: string | undefined;
}

export const runClassifyPaths = (args: IClassifyPathsArgs) => {
	const resolution = resolveProfile(args.profile);
	if (!resolution.ok) {
		return toolError(
			resolution.reason,
			`Pass one of: ${resolution.supported.join(', ')} (or omit profile for typescript).`,
		);
	}
	const results = args.paths.map((path) => ({
		path,
		role: classifyWithProfile(resolution.profile, path),
	}));
	return toolOk({
		results,
		unmatched: results.filter((r) => r.role === 'other').map((r) => r.path),
	});
};

export const buildClassifyPathsRegistration = (
	namespacePrefix: string,
): IToolRegistration => ({
	id: 'conventions_classify',
	tags: ['conventions'],
	summary:
		'Classify repo-relative paths into file-convention roles (pure, no scan).',
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_conventions_classify`,
			{
				outputSchema: CLASSIFY_OUTPUT_SCHEMA,
				description:
					'Classify repo-relative paths into f00037 file-convention roles (interface/constant/service/tool/…). Pure — pass the paths; nothing is read from disk. `unmatched` lists the paths with no canonical role. Pass `profile` (typescript | python | rust | go, default typescript) to use a language-specific rule table (f00113).',
				inputSchema: z.object({
					paths: z.array(z.string()),
					profile: z.enum(CONVENTION_PROFILE_IDS).optional(),
				}),
			},
			async (args: IClassifyPathsArgs) => runClassifyPaths(args),
		);
	},
});
