/**
 * real-deps.ts — the ONE place that touches the OS for discovery.
 *
 * `discoverRoster` is pure over `IDiscoveryDeps`; this module supplies the
 * production seam (a real `command -v` probe + `process.env`). Keeping the I/O
 * here means the discovery logic stays 100% unit-testable and this thin
 * adapter is the only thing that needs the runtime.
 */
import { execFile } from 'node:child_process';

import type { IClientCommandRunner } from '@delendai/core/contracts';
import { probeClientCommand } from '@delendai/core/runtime';

import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';
import { discoverAndPersistRoster } from './discover-roster';
import type { IRosterSnapshotStore } from './roster-store';

const COMMAND_TIMEOUT_MS = 5_000;

/**
 * A trusted command line (catalogue values only) run through a non-login
 * bash, with a hard timeout so a hung shell can never stall the server.
 */
const runShell: IClientCommandRunner = (command, options) =>
	new Promise((resolve) => {
		execFile(
			'/bin/bash',
			['--noprofile', '--norc', '-c', command],
			{
				cwd: options.cwd,
				timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
			},
			(error, stdout, stderr) =>
				resolve({
					code:
						error === null
							? 0
							: typeof error.code === 'number'
								? error.code
								: 1,
					output: `${stdout}${stderr}`,
				}),
		);
	});

/**
 * Production discovery deps: core's one PATH probe, run in the workspace,
 * and `process.env`.
 */
export const realDiscoveryDeps = (workspaceRoot: string): IDiscoveryDeps => ({
	commandExists: async (command) =>
		(await probeClientCommand(command, runShell, workspaceRoot)).installed,
	env: process.env,
});

/** Production composition: probe the live environment and persist the snapshot. */
export const discoverRosterWithRealDeps = (
	store: IRosterSnapshotStore | undefined,
	workspaceRoot: string,
) => discoverAndPersistRoster(realDiscoveryDeps(workspaceRoot), store);

export const discoverRosterForTool = (
	deps: IDiscoveryDeps | undefined,
	store: IRosterSnapshotStore | undefined,
	workspaceRoot: string,
) =>
	deps !== undefined
		? discoverAndPersistRoster(deps, store)
		: discoverRosterWithRealDeps(store, workspaceRoot);
