// create-tool: the `<prefix>_create_project` MCP tool — generates
// scaffold files for a host server, plugin or client.
//
// SOLID — Single Responsibility. Owns the tool that returns the
// files to write. It does not know about drift, analysis, or the
// blueprint pipeline — it dispatches to the right `scaffold*Files`
// helper based on `args.kind`.

import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import {
	scaffoldClientFiles,
	scaffoldHostProject,
	scaffoldPluginFiles,
} from '../scaffold/scaffold-host';
import { CREATE_INPUT_SCHEMA, MCP_PROJECT_SKELETON_SCHEMA } from './schemas';
import { toolJson } from '../shared/tool-response';

export interface ICreateToolDeps {
	readonly namespacePrefix: string;
}

const json = (value: unknown) => toolJson(value);

export const buildCreateToolRegistration = (
	deps: ICreateToolDeps,
): IToolRegistration => {
	const prefix = deps.namespacePrefix;
	return {
		id: 'create_project',
		summary:
			'Generate files for a project-specific server, plugin or MCP client from a plan (returns files for you to write).',
		tags: ['bootstrap'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_create_project`,
				{
					outputSchema: MCP_PROJECT_SKELETON_SCHEMA,
					description:
						'Generate the files for a project-specific MCP server (or a new plugin) from a plan. Returns the files for YOU to write — it does not touch disk. Run analyze_project first to get a plan, edit it if needed, then call this.',
					inputSchema: CREATE_INPUT_SCHEMA,
				},
				async (args: z.infer<typeof CREATE_INPUT_SCHEMA>) => {
					const namespacePrefix = args.namespacePrefix ?? 'app';
					if (args.kind === 'plugin') {
						const files = scaffoldPluginFiles({
							pluginName: args.pluginName ?? 'example',
							description:
								args.description ??
								'TODO: describe this plugin.',
						});
						return json({ kind: 'plugin', files });
					}
					if (args.kind === 'client') {
						const files = scaffoldClientFiles({
							clientName:
								args.clientName ?? args.pluginName ?? 'example',
							description:
								args.description ??
								'TODO: describe this MCP client.',
						});
						return json({ kind: 'client', files });
					}
					const files = scaffoldHostProject({
						projectName: args.projectName ?? namespacePrefix,
						namespacePrefix,
						projectPackageName:
							args.projectPackageName ??
							`@${namespacePrefix}/mcp-project`,
					});
					return json({ kind: 'host', files });
				},
			);
		},
	};
};
