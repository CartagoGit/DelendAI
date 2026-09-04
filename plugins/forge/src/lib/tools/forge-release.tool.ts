import {
	toolJsonBounded,
	type IToolRegistration,
} from '@delendai/core/public';

import {
	FORGE_RELEASE_INPUT_SCHEMA,
	FORGE_RELEASE_OUTPUT_SCHEMA,
} from '../contracts/constants/forge-release.constant';
import type {
	IForgeReleaseExec,
	IForgeReleaseOptions,
} from '../contracts/interfaces/forge-release.interface';
import { createRelease } from '../services/forge-release';

export interface IForgeReleaseToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly forgeExec?: IForgeReleaseExec | undefined;
}

export const runForgeRelease = async (
	args: IForgeReleaseOptions,
	options: IForgeReleaseToolOptions,
) =>
	toolJsonBounded(
		await createRelease(options.workspaceRootAbs, args, options.forgeExec),
	);

export const buildForgeReleaseToolRegistrations = (
	options: IForgeReleaseToolOptions,
): readonly IToolRegistration[] => [
	{
		id: 'release',
		tags: ['forge', 'release', 'network', 'write'],
		effects: ['write', 'network'],
		summary:
			'Create a forge release from a tag with explicit confirmation.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_release`,
				{
					description:
						'Create a release from an existing tag on the origin forge. Requires confirm:true and returns the created release metadata.',
					inputSchema: FORGE_RELEASE_INPUT_SCHEMA,
					outputSchema: FORGE_RELEASE_OUTPUT_SCHEMA,
				},
				async (args) => runForgeRelease(args, options),
			);
		},
	},
];
