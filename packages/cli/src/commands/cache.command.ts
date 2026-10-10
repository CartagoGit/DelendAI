import {
	listCacheLayoutMigrations,
	readCacheLayoutStatus,
	runCacheLayoutStep,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { data, hasFlag } from '../lib/helpers/cli-command.helper';

/**
 * `delendai cache` — the operator's view of the cache layout lifecycle.
 *
 * It calls the same engine the server start runs; there is no tool that
 * lets an agent trigger a migration, because the cache should be carried
 * by the version, not by someone remembering to ask. Output is structured
 * data only.
 */
export const cacheCommand: ICliCommand = {
	name: 'cache',
	summary:
		'Inspect and carry the cache layout: status, registered migrations, migrate, and eviction (gc).',
	usage: 'cache [status|migrations|migrate [--dry-run]|gc [--dry-run|--apply]]  [--workspace=<path>]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const workspaceRoot = ctx.globals.workspace;
		const sub = args[0];
		if (sub === undefined || sub === 'status')
			return data({
				workspaceRoot,
				...(await readCacheLayoutStatus(workspaceRoot)),
			});
		if (sub === 'migrations')
			return data({ migrations: listCacheLayoutMigrations() });
		if (sub === 'migrate') {
			const result = await runCacheLayoutStep(
				workspaceRoot,
				hasFlag(args, 'dry-run'),
			);
			return {
				...data(result),
				code:
					result.status === 'failed'
						? EXIT_CODE.RUNTIME
						: EXIT_CODE.OK,
			};
		}
		if (sub === 'gc') {
			// Eviction deletes by age, so it previews unless told to apply;
			// `--dry-run` wins if both are given.
			const dryRun = hasFlag(args, 'dry-run') || !hasFlag(args, 'apply');
			return data(await ctx.request('delendai_cache_gc', { dryRun }));
		}
		return {
			code: EXIT_CODE.USAGE,
			error: `unknown cache subcommand: ${String(sub)}`,
		};
	},
};
