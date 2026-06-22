/**
 * `<prefix>_conventions_classify` — classify a list of repo-relative
 * paths against the TypeScript profile (f00037 S3). Pure: no I/O, no
 * scan; the caller supplies the paths. Single Responsibility — the
 * filesystem walk lives in `check-conventions.tool.ts`.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolOk } from '@mcp-vertex/core/public';

import { classifyPath } from '../profiles/typescript/typescript-profile';

const ROLE_ENUM = z.enum([
	'interface',
	'constant',
	'service',
	'tool',
	'registry',
	'register',
	'factory',
	'builder',
	'generated',
	'barrel',
	'other',
]);

const CLASSIFY_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	results: z.array(z.object({ path: z.string(), role: ROLE_ENUM })),
	unmatched: z.array(z.string()),
});

export interface IClassifyPathsArgs {
	readonly paths: readonly string[];
}

export const runClassifyPaths = (args: IClassifyPathsArgs) => {
	const results = args.paths.map((path) => ({
		path,
		role: classifyPath(path),
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
					'Classify repo-relative paths into f00037 file-convention roles (interface/constant/service/tool/…). Pure — pass the paths; nothing is read from disk. `unmatched` lists the paths with no canonical role.',
				inputSchema: z.object({
					paths: z.array(z.string()),
				}),
			},
			async (args: IClassifyPathsArgs) => runClassifyPaths(args),
		);
	},
});
