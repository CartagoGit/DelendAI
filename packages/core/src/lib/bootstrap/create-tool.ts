// create-tool: the `<prefix>_create_project` MCP tool — generates
// scaffold files for a host server, plugin or client.
//
// SOLID — Single Responsibility. Owns the tool that returns the
// files to write. It does not know about drift, analysis, or the
// blueprint pipeline — it dispatches to the right `scaffold*Files`
// helper based on `args.kind`.

import type { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { resolveAdoptionStrategy } from './adoption-strategy';
import { buildBlueprintFiles } from './build-blueprint';
import type { IBlueprintArtifact, IServerBlueprint } from './build-blueprint';
import {
	scaffoldClientFiles,
	scaffoldHostProject,
	scaffoldPluginFiles,
} from '../scaffold/scaffold-host';
import { scaffoldExtensionHostFiles } from '../scaffold/scaffold-extension-host';
import {
	CREATE_INPUT_SCHEMA,
	type BLUEPRINT_ARTIFACT_SCHEMA,
	MCP_PROJECT_SKELETON_SCHEMA,
} from './schemas';
import { toolJson } from '../shared/tool-response';

export interface ICreateToolDeps {
	readonly namespacePrefix: string;
}

const json = (value: unknown) => toolJson(value);

const hasBlueprintPayload = (
	args: z.infer<typeof CREATE_INPUT_SCHEMA>,
): boolean => args.blueprint !== undefined;

const normalizeArtifacts = (
	artifacts: readonly z.infer<typeof BLUEPRINT_ARTIFACT_SCHEMA>[] | undefined,
): readonly IBlueprintArtifact[] =>
	(artifacts ?? []).map((artifact) => ({
		name: artifact.name,
		description: artifact.description,
		...(artifact.body === undefined ? {} : { body: artifact.body }),
		...(artifact.whenToUse === undefined
			? {}
			: { whenToUse: [...artifact.whenToUse] }),
	}));

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
					if (args.kind === 'extension-host') {
						const files = scaffoldExtensionHostFiles({
							hostName:
								args.extensionHostName ??
								args.clientName ??
								'example',
							description:
								args.description ??
								'TODO: describe this extension host.',
						});
						return json({ kind: 'extension-host', files });
					}
					if (hasBlueprintPayload(args)) {
						const blueprintInput = args.blueprint;
						const serverName =
							blueprintInput?.serverName ??
							args.serverName ??
							args.projectName ??
							`mcp-project-${namespacePrefix}`;
						const blueprint: IServerBlueprint = {
							serverName,
							namespacePrefix:
								blueprintInput?.namespacePrefix ??
								namespacePrefix,
							targetDir:
								blueprintInput?.targetDir ??
								args.targetDir ??
								'.',
							projectType:
								blueprintInput?.projectType ?? 'generic',
							plugins: blueprintInput?.plugins ?? [],
							tools: normalizeArtifacts(blueprintInput?.tools),
							prompts: normalizeArtifacts(
								blueprintInput?.prompts,
							),
							skills: normalizeArtifacts(blueprintInput?.skills),
							agents: blueprintInput?.agents ?? [],
							tests: blueprintInput?.tests ?? true,
							hasExistingServer:
								blueprintInput?.hasExistingServer ?? false,
							adoptionStrategy:
								blueprintInput?.adoptionStrategy ??
								resolveAdoptionStrategy(
									{},
									{
										hasExistingMcpProject: false,
									},
								),
							defaults: blueprintInput?.defaults ?? {
								keepLegacy: false,
								reasons: ['blueprint provided by caller'],
								warnings: [],
							},
							notes: blueprintInput?.notes ?? [],
						};
						const files = buildBlueprintFiles(
							blueprint,
							args.projectPackageName,
						);
						return json({ kind: 'host', files });
					}
					const files = scaffoldHostProject({
						projectName: args.projectName ?? namespacePrefix,
						namespacePrefix,
						projectPackageName:
							args.projectPackageName ??
							`@${namespacePrefix}/mcp-project`,
						...(args.targetDir === undefined
							? {}
							: { targetDir: args.targetDir }),
						...(args.serverName === undefined
							? {}
							: { mcpServerName: args.serverName }),
					});
					return json({ kind: 'host', files });
				},
			);
		},
	};
};
