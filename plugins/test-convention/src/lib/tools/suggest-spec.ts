import { z } from 'zod';

import {
	toolError,
	toolJson,
	type IToolRegistration,
	type IToolTextResult,
} from '@mcp-vertex/core/public';

import type { ITestConvention } from '../../convention';
import { suggestSpecPath } from '../../suggest';

export interface ISuggestSpecOptions {
	readonly namespacePrefix: string;
	readonly convention: ITestConvention;
}

const InputSchema = z.object({
	sourcePath: z
		.string()
		.min(1)
		.describe(
			'Workspace-relative path to the source file (e.g. "src/lib/foo.ts")',
		),
});

const OutputSchema = z.object({
	specPath: z.string(),
	rationale: z.string(),
	skeleton: z.string(),
});

/**
 * `<prefix>_suggest_spec_path` — given a source path, return where its
 * companion spec should live plus a minimal skeleton.
 */
export const buildSuggestSpec = (
	options: ISuggestSpecOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'suggest_spec_path',
		summary:
			'Given a source file path, return the spec path the convention requires + a starter skeleton.',
		tags: ['testing', 'convention'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_suggest_spec_path`,
				{
					description:
						'For a given source file path inside the workspace, return the companion spec path the convention mandates (placement depends on `specLayout`) plus a minimal `describe(...)` skeleton the agent can paste as the spec body.',
					inputSchema: InputSchema,
					outputSchema: OutputSchema,
				},
				async (args: {
					sourcePath: string;
				}): Promise<IToolTextResult> => {
					if (args.sourcePath.includes('..')) {
						return toolError(
							'invalid sourcePath',
							'path must be workspace-relative and not contain ".."',
						);
					}
					return toolJson(
						suggestSpecPath(args.sourcePath, options.convention),
					);
				},
			);
		},
	};
};
