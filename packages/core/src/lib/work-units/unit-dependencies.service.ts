/**
 * unit-dependencies.service.ts — a unit is entered with what its checks
 * need.
 *
 * `work enter` made a worktree without the project's dependencies, and
 * the pre-push proof runs the typecheck, so the first publish of every
 * unit failed on a missing module until somebody who knew installed
 * them by hand. Entering now installs them with the project's own
 * package manager, from its lockfile, with scripts off (an install
 * script run in a worktree once rewrote the shared git configuration).
 * It never fails the entry: when it cannot, the answer says so and
 * gives the command.
 */
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
	UNIT_INSTALL_BY_LOCKFILE,
	UNIT_INSTALL_MAX_OUTPUT_BYTES,
	UNIT_INSTALL_TIMEOUT_MS,
	UNIT_INSTALL_VARIABLE,
} from '../contracts/constants/unit-dependencies.constant';
import type { IUnitDependencies } from '../contracts/interfaces/unit-dependencies.interface';

const run = promisify(execFile);

const exists = (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

export const installUnitDependencies = async (
	path: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<IUnitDependencies> => {
	if (env[UNIT_INSTALL_VARIABLE] === 'off')
		return { status: 'skipped', reason: `${UNIT_INSTALL_VARIABLE}=off` };
	if (await exists(join(path, 'node_modules'))) return { status: 'present' };
	let install: (typeof UNIT_INSTALL_BY_LOCKFILE)[number] | undefined;
	for (const candidate of UNIT_INSTALL_BY_LOCKFILE)
		if (await exists(join(path, candidate.lockfile))) {
			install = candidate;
			break;
		}
	if (install === undefined)
		return { status: 'skipped', reason: 'no lockfile' };
	const command = install.command.join(' ');
	const [bin = '', ...args] = install.command;
	try {
		await run(bin, args, {
			cwd: path,
			timeout: UNIT_INSTALL_TIMEOUT_MS,
			maxBuffer: UNIT_INSTALL_MAX_OUTPUT_BYTES,
		});
		return { status: 'installed', command };
	} catch (error) {
		return {
			status: 'failed',
			command,
			reason:
				error instanceof Error
					? (error.message.split('\n')[0] ?? 'failed')
					: String(error),
		};
	}
};
