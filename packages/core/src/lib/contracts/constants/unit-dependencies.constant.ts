/**
 * unit-dependencies.constant.ts — how a unit's dependencies are installed
 * when it is entered: one command per lockfile, scripts off.
 */

/** Lockfile → the install that reproduces it without running any script. */
export const UNIT_INSTALL_BY_LOCKFILE: readonly {
	readonly lockfile: string;
	readonly command: readonly string[];
}[] = [
	{
		lockfile: 'bun.lock',
		command: ['bun', 'install', '--frozen-lockfile', '--ignore-scripts'],
	},
	{
		lockfile: 'bun.lockb',
		command: ['bun', 'install', '--frozen-lockfile', '--ignore-scripts'],
	},
	{
		lockfile: 'pnpm-lock.yaml',
		command: ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'],
	},
	{
		lockfile: 'yarn.lock',
		command: ['yarn', 'install', '--frozen-lockfile', '--ignore-scripts'],
	},
	{
		lockfile: 'package-lock.json',
		command: ['npm', 'ci', '--ignore-scripts'],
	},
];

/** Set to `off` to enter units without installing their dependencies. */
export const UNIT_INSTALL_VARIABLE = 'DELENDAI_UNIT_INSTALL';

/** How long an install may take before the entry stops waiting for it. */
export const UNIT_INSTALL_TIMEOUT_MS = 10 * 60_000;

/** Room for an install's output; it is discarded unless the install fails. */
export const UNIT_INSTALL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
