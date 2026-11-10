/**
 * unit-dependencies.service.ts — a unit is entered with what its checks
 * need.
 *
 * `work enter` made a worktree without the project's dependencies, and
 * the pre-push proof runs the typecheck, so the first publish of every
 * unit failed on a missing module until somebody who knew installed
 * them by hand. Entering now links the shared checkout's when its lockfile
 * is the same (no install, no gigabytes per unit), and otherwise installs them with the project's own
 * package manager, from its lockfile, with scripts off (an install
 * script run in a worktree once rewrote the shared git configuration).
 * It never fails the entry: when it cannot, the answer says so and
 * gives the command.
 */
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
	UNIT_INSTALL_BY_LOCKFILE,
	UNIT_INSTALL_MAX_OUTPUT_BYTES,
	UNIT_INSTALL_TIMEOUT_MS,
	UNIT_INSTALL_VARIABLE,
} from '../contracts/constants/unit-dependencies.constant';
import type { IUnitDependencies } from '../contracts/interfaces/unit-dependencies.interface';
import { linkSharedDependencies } from './unit-shared-dependencies.service';

const run = promisify(execFile);

const exists = (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

/** Specs that name a local package, which no registry install fetches. */
const LOCAL_SPEC = /^(?:workspace|file|link|portal):/u;

/**
 * The dependencies `package.json` declares that `node_modules` lacks. A
 * `node_modules` folder alone proved nothing: a worktree left with an
 * interrupted or partial install passed for complete, and its proof then
 * failed late on a missing binary (`Missing workspace TypeScript binary`).
 */
const missingDeclared = async (path: string): Promise<readonly string[]> => {
	let manifest: Record<string, unknown>;
	try {
		manifest = JSON.parse(
			await readFile(join(path, 'package.json'), 'utf8'),
		) as Record<string, unknown>;
	} catch {
		return [];
	}
	const declared = ['dependencies', 'devDependencies'].flatMap((field) => {
		const group = manifest[field];
		return typeof group === 'object' && group !== null
			? Object.entries(group as Record<string, unknown>).filter(
					([, spec]) =>
						typeof spec === 'string' && !LOCAL_SPEC.test(spec),
				)
			: [];
	});
	const present = await Promise.all(
		declared.map(([name]) => exists(join(path, 'node_modules', name))),
	);
	return declared.flatMap(([name], index) =>
		present[index] === true ? [] : [name],
	);
};

export const installUnitDependencies = async (
	path: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<IUnitDependencies> => {
	if (env[UNIT_INSTALL_VARIABLE] === 'off')
		return { status: 'skipped', reason: `${UNIT_INSTALL_VARIABLE}=off` };
	const hasModules = await exists(join(path, 'node_modules'));
	if (hasModules && (await missingDeclared(path)).length === 0)
		return { status: 'present' };
	if (!hasModules) {
		const linked = await linkSharedDependencies(path);
		if (linked !== undefined) return linked;
	}
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

/**
 * What entering a unit did about its dependencies, for the answer. A
 * unit entered again installs them too: a kept unit nobody worked on
 * gave them back to the disk (`work reap`).
 */
export const enteredDependencies = async (
	path: string | undefined,
): Promise<{ readonly dependencies?: IUnitDependencies }> =>
	path === undefined
		? {}
		: { dependencies: await installUnitDependencies(path) };
