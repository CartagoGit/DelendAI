/**
 * The guard a project declares is there before its first commit.
 *
 * A development policy that only advises is a policy an agent can ignore,
 * and one did: it committed to the integration branch and made its own
 * worktrees after delendai refused (x00548 S4, x00549). So a project that
 * declares a `development` block gets the hooks installed when its server
 * starts, without anyone remembering a command. `development.guardHooks`
 * decides: `install` (default), `report`, or `off`.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseJsonc } from '@delendai/core/public';

import type {
	IGuardAutoinstallOutcome,
	IGuardHooksMode,
} from '../contracts/interfaces/guard-hooks-autoinstall.interface';
import type { IGuardHooksReport } from '../contracts/interfaces/guard-hooks-service.interface';
import { isRecord } from './helpers/cli-command.helper';
import { readConfigText } from './config-file.service';
import { inspectGuardHooks, installGuardHooks } from './guard-hooks.service';

/** What the project asks for, or `absent` when it declares no policy. */
export const guardHooksMode = async (
	workspaceRoot: string,
): Promise<IGuardHooksMode | 'absent'> => {
	const text = await readConfigText(workspaceRoot);
	if (text === undefined) return 'absent';
	const parsed = parseJsonc(text);
	if (parsed.errors.length > 0) return 'absent';
	const config = parsed.value;
	if (!isRecord(config) || !isRecord(config.development)) return 'absent';
	const declared = config.development.guardHooks;
	return declared === 'report' || declared === 'off' || declared === 'install'
		? declared
		: 'install';
};

/**
 * The CLI entry a hook must call, resolved from this module rather than
 * from `process.argv[1]`: the server can be started by another entry
 * entirely (the repository's own host script), and a hook pointing at
 * that would start a server instead of judging the operation — which is
 * to say, it would refuse nothing.
 */
const cliEntryPath = (): string => {
	for (const candidate of ['../index.ts', '../index.js']) {
		const path = fileURLToPath(new URL(candidate, import.meta.url));
		if (existsSync(path)) return path;
	}
	return process.argv[1] ?? '';
};

const describe = (report: IGuardHooksReport, verb: string): string[] => [
	`guard hooks ${verb} in ${report.dir}`,
	...report.hooks.map(
		(entry) =>
			`  ${entry.hook}: ${entry.state}${entry.reason === undefined ? '' : ` — ${entry.reason}`}`,
	),
];

/**
 * Install or inspect the guard for a workspace. Never throws: a
 * repository that cannot take the hooks still gets its server.
 */
export const ensureGuardHooks = async (input: {
	readonly workspaceRoot: string;
	readonly runner?: string;
	readonly entry?: string;
}): Promise<IGuardAutoinstallOutcome> => {
	const mode = await guardHooksMode(input.workspaceRoot);
	if (mode === 'absent' || mode === 'off') return { mode, lines: [] };
	try {
		if (mode === 'report') {
			const report = inspectGuardHooks(input.workspaceRoot);
			return { mode, report, lines: describe(report, 'state') };
		}
		const report = installGuardHooks(input.workspaceRoot, {
			runner: input.runner ?? process.execPath,
			entry: input.entry ?? cliEntryPath(),
		});
		return { mode, report, lines: describe(report, 'installed') };
	} catch (error) {
		return {
			mode,
			lines: [
				`guard hooks could not be ${mode === 'report' ? 'inspected' : 'installed'}: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
};
