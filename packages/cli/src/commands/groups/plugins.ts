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
	DEFAULT_CORE_PATHS,
	readPluginAvailabilities,
	type IPluginAddRecipe,
	type IPluginAvailabilityRecord,
} from '@delendai/core/cli';

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

/** States in which a plugin's tools can be used as they are. */
const USABLE = new Set(['library', 'registered', 'verified']);

const formatAvailability = (
	records: readonly IPluginAvailabilityRecord[],
): string => {
	if (records.length === 0) {
		return 'No plugin has registered in this workspace yet: start delendai here, then run this again.\n';
	}
	const lines = records.map((record) => {
		const mark = USABLE.has(record.state) ? '*' : '!';
		const missing =
			record.missing === undefined ? '' : `: ${record.missing}`;
		const fix =
			record.fix === undefined ? '' : `\n      fix: ${record.fix}`;
		return `  ${mark} ${record.plugin} [${record.state}]${missing} (read ${record.readAt})${fix}`;
	});
	return `${lines.join('\n')}\n`;
};

const pluginDoctorCommand: ICliCommand = {
	name: 'plugin doctor',
	summary:
		'Whether each plugin can work in this workspace, as it last said when it registered: its state, what is missing and the fix.',
	async run(_args, ctx) {
		const records = await readPluginAvailabilities(
			ctx.cwd,
			ctx.globals.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir,
		);
		return data({
			plugins: records,
			formatted: formatAvailability(records),
		});
	},
};

export const pluginsCommands: readonly ICliCommand[] = [
	pluginSearchCommand,
	pluginAddCommand,
	pluginDoctorCommand,
	...projectPluginCommands,
];
