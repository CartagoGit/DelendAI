/**
 * f00141/S2 — `plugin add` command.
 *
 * Additive command surface that resolves a plugin id from the registry,
 * enforces consent for community entries, and prints the same JSON plan
 * shape the S2 tool returns.
 */
import { resolvePlugins } from '@delendai/core/public';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import { hasFlag, positionalArg, scalarArg, usage } from './group-helpers';

interface IPluginAddPlan {
	readonly id: string;
	readonly package: string;
	readonly origin: 'first-party' | 'community';
	readonly dryRun: boolean;
	readonly installed: boolean;
	readonly configured: boolean;
	readonly configPath?: string;
	readonly notes: readonly string[];
}

const INSTALL_STUB_NOTE =
	'install stub: recorded plugin adoption intent; no package install ran.';

const parseDryRun = (args: readonly string[]): boolean => {
	if (hasFlag(args, 'dry-run')) return true;
	const raw = scalarArg(args, 'dry-run');
	if (raw === undefined) return true;
	return !['0', 'false', 'no'].includes(raw.trim().toLowerCase());
};

const buildPlan = (
	id: string,
	packageName: string,
	origin: 'first-party' | 'community',
	dryRun: boolean,
): IPluginAddPlan => ({
	id,
	package: packageName,
	origin,
	dryRun,
	installed: !dryRun,
	configured: !dryRun,
	...(dryRun ? {} : { configPath: 'mcp-vertex.config.json' }),
	notes: dryRun ? [] : [INSTALL_STUB_NOTE],
});

const ok = (
	ctx: Parameters<NonNullable<ICliCommand['run']>>[1],
	plan: IPluginAddPlan,
): ICliCommandResult => {
	const emitJson = ctx.globals.json || ctx.globals.format === 'json';
	if (emitJson) return { code: EXIT_CODE.OK, data: plan };
	return { code: EXIT_CODE.OK, text: `${JSON.stringify(plan)}\n` };
};

export const pluginAddCommand: ICliCommand = {
	name: 'plugin add',
	summary: 'Resolve a plugin id and print its add plan.',
	async run(args, ctx) {
		const id = positionalArg(args);
		if (id === undefined) {
			return usage(
				'plugin add <id> [--dry-run=false] [--consent-community]',
			);
		}

		const dryRun = parseDryRun(args);
		const consentCommunity = hasFlag(args, 'consent-community');
		const { entries } = resolvePlugins({});
		const entry = entries.find((candidate) => candidate.id === id);

		if (entry === undefined) {
			return {
				code: EXIT_CODE.NOT_FOUND,
				error: `Plugin "${id}" was not found in the registry. Run plugin search first and retry with a valid id.`,
			};
		}

		if (entry.origin === 'community' && consentCommunity !== true) {
			return {
				code: EXIT_CODE.VALIDATION,
				error: `Plugin "${entry.id}" (${entry.package}) is community-origin. Re-run with --consent-community to confirm adoption.`,
			};
		}

		return ok(
			ctx,
			buildPlan(entry.id, entry.package, entry.origin, dryRun),
		);
	},
};
