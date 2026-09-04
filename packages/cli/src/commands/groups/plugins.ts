/**
 * f00141 S2 — `plugin` commands. One subcommand per registry tool:
 *   - `delendai plugin search <query>` -> `<prefix>_plugin_search` tool
 *     (delegates to the resolver; read-only).
 *   - `delendai plugin add <id>` -> `<prefix>_plugin_add` tool (returns
 *     the install + wire + config recipe; the CLI echoes it as
 *     plain text or JSON).
 *
 * Both delegate 1:1 to the MCP tool; the CLI is a thin shell that
 * formats the recipe for a terminal session.
 */
import {
	buildPluginAddRecipe,
	type IPluginAddRecipe,
} from '@delendai/core/public';

import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { data, request } from './group-helpers';
import { projectPluginCommands } from './project-plugin';

const formatRecipe = (recipe: IPluginAddRecipe): string => {
	const lines: string[] = [];
	lines.push(`Plugin "${recipe.entry.id}" (${recipe.entry.package})`);
	lines.push(`  origin: ${recipe.entry.origin}`);
	if (recipe.alreadyAdopted) lines.push('  status: already adopted (no-op)');
	lines.push('  steps:');
	for (const step of recipe.steps) {
		lines.push(`    [${step.kind}] ${step.summary}`);
	}
	return `${lines.join('\n')}\n`;
};

const pluginSearchCommand: ICliCommand = {
	name: 'plugin search',
	summary:
		'Search the plugin registry (first-party index + opt-in community).',
	async run(args, ctx) {
		const query = args[0];
		return data(
			await request(ctx, 'delendai_plugin_search', {
				...(query !== undefined ? { query } : {}),
			}),
		);
	},
};

const pluginAddCommand: ICliCommand = {
	name: 'plugin add',
	summary:
		'Plan the adopt of a plugin (returns the install + wire + config recipe).',
	async run(args, ctx) {
		const id = args[0];
		if (id === undefined) {
			const recipe = buildPluginAddRecipe('demo', {});
			// intentionally missing-id error path: surface the resolver miss.
			return data({
				ok: false,
				recipe,
				formatted: recipe === undefined ? 'missing plugin id' : '',
			});
		}
		const consent = args.includes('--consent') || args.includes('-y');
		const result = (await request(ctx, 'delendai_plugin_add', {
			id,
			...(consent ? { consent: true } : {}),
		})) as
			| { ok: false; error: { reason: string; nextAction?: string } }
			| {
					ok: true;
					entry: { id: string };
					steps: unknown[];
					alreadyAdopted: boolean;
			  };
		if (result.ok === false) {
			return data(result);
		}
		const recipe: IPluginAddRecipe = {
			entry: result.entry as IPluginAddRecipe['entry'],
			steps: result.steps as IPluginAddRecipe['steps'],
			alreadyAdopted: result.alreadyAdopted,
		};
		return data({ ok: true, recipe, formatted: formatRecipe(recipe) });
	},
};

export const pluginsCommands: readonly ICliCommand[] = [
	pluginSearchCommand,
	pluginAddCommand,
	...projectPluginCommands,
];
