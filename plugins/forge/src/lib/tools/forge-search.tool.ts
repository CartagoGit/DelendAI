import { toolJsonBounded, type IToolRegistration } from '@delendai/core/public';

import {
	FORGE_SEARCH_CODE_INPUT_SCHEMA,
	FORGE_SEARCH_CODE_OUTPUT_SCHEMA,
} from '../contracts/constants/forge-search.constant';
import type {
	IForgeSearchCodeOptions,
	IForgeSearchExec,
} from '../contracts/interfaces/forge-search.interface';
import { searchCode } from '../services/forge-search';

export interface IForgeSearchToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly forgeExec?: IForgeSearchExec | undefined;
}

export const runForgeSearchCode = async (
	args: IForgeSearchCodeOptions,
	options: IForgeSearchToolOptions,
) =>
	toolJsonBounded(
		await searchCode(options.workspaceRootAbs, args, options.forgeExec),
	);

export const buildForgeSearchToolRegistrations = (
	options: IForgeSearchToolOptions,
): readonly IToolRegistration[] => [
	{
		id: 'search_code',
		tags: ['forge', 'search', 'network'],
		effects: ['network'],
		summary: 'Run remote code search on the origin forge.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_search_code`,
				{
					description:
						"Search code on the origin forge through the host's authenticated gh/glab CLI. Supports optional language, path, repository and result-limit filters.",
					inputSchema: FORGE_SEARCH_CODE_INPUT_SCHEMA,
					outputSchema: FORGE_SEARCH_CODE_OUTPUT_SCHEMA,
				},
				async (args) => runForgeSearchCode(args, options),
			);
		},
	},
];
