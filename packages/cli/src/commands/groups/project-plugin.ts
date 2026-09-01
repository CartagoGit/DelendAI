import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	hasFlag,
	positionalArg,
	request,
	scalarArg,
	usage,
} from './group-helpers';

const projectPluginName = (args: readonly string[]): string | undefined =>
	positionalArg(args);

export const projectPluginCreateCommand: ICliCommand = {
	name: 'project-plugin create',
	summary: 'Create and register a project plugin.',
	async run(args, ctx) {
		const name = projectPluginName(args);
		if (name === undefined)
			return usage(
				'project-plugin create <name> [--description=...] [--namespace=...] [--dry-run]',
			);
		return data(
			await request(ctx, 'mcp-vertex_project_plugins_create', {
				name,
				...(scalarArg(args, 'description') !== undefined
					? { description: scalarArg(args, 'description') }
					: {}),
				...(scalarArg(args, 'namespace') !== undefined
					? { namespace: scalarArg(args, 'namespace') }
					: {}),
				...(hasFlag(args, 'dry-run') ? { dryRun: true } : {}),
			}),
		);
	},
};

export const projectPluginInspectCommand: ICliCommand = {
	name: 'project-plugin inspect',
	summary: 'Inspect a project plugin without writing.',
	async run(args, ctx) {
		const name = projectPluginName(args);
		if (name === undefined) return usage('project-plugin inspect <name>');
		return data(
			await request(ctx, 'mcp-vertex_project_plugins_inspect', { name }),
		);
	},
};

export const projectPluginRepairCommand: ICliCommand = {
	name: 'project-plugin repair',
	summary: 'Repair safe project plugin structure.',
	async run(args, ctx) {
		const name = projectPluginName(args);
		if (name === undefined) return usage('project-plugin repair <name>');
		return data(
			await request(ctx, 'mcp-vertex_project_plugins_repair', { name }),
		);
	},
};

export const projectPluginCommands: readonly ICliCommand[] = [
	projectPluginCreateCommand,
	projectPluginInspectCommand,
	projectPluginRepairCommand,
];
