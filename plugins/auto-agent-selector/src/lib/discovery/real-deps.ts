/**
 * real-deps.ts — the ONE place that touches the OS for discovery.
 *
 * `discoverRoster` is pure over `IDiscoveryDeps`; this module supplies the
 * production seam (a real `command -v` probe + `process.env`). Keeping the I/O
 * here means the discovery logic stays 100% unit-testable and this thin
 * adapter is the only thing that needs the runtime.
 */
import { probeClientCommand, runClientCommand } from '@delendai/core/runtime';

import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';
import { discoverAndPersistRoster } from './discover-roster';
import type { IRosterSnapshotStore } from './roster-store';

/**
 * Production discovery deps: core's one PATH probe, run in the workspace,
 * and `process.env`.
 */
export const realDiscoveryDeps = (workspaceRoot: string): IDiscoveryDeps => ({
	commandExists: async (command) =>
		(await probeClientCommand(command, runClientCommand, workspaceRoot))
			.installed,
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
