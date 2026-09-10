/**
 * state-database-seam.ts — the real `IStateDatabaseSeam` over a file.
 *
 * WHY the probe is resolved BEFORE the seam exists: the operational state
 * database is a MATERIALIZED VIEW — gitignored, never synced between
 * machines, rebuilt from refs, the forge and the journal. A machine that
 * has just cloned the repository therefore HAS no database, and that is
 * the normal first-boot state, not a fault. Letting a driver discover it
 * produces `unable to open database file`, an errno that describes a
 * filesystem call rather than the situation, and that is what turns a
 * diagnostic into the thing that needs diagnosing (the same pathology
 * already fixed in the proposals db-doctor). So the tri-state answer —
 * absent / present / unreadable — is established by one async `stat`
 * here, and `probe()` merely reports it.
 *
 * WHY the factory is async while `probe()` is sync: `IStateDatabaseSeam`
 * is consumed inside a phase that must stay synchronous and total, and
 * the alternative — `existsSync` inside `probe()` — puts blocking I/O
 * behind an interface that gives the caller no way to know. Doing the I/O
 * once, up front, with `node:fs/promises`, keeps both properties.
 *
 * WHY opening is delegated: `@delendai/core` must not import a concrete
 * driver (`bun:sqlite` lives in `@delendai/proposals-sqlite`), and a
 * reconciler bound to one could only ever be tested against a mock of it.
 * The host injects `openPorts`; when no adapter is bound, the seam says
 * so in words instead of pretending the database was fine.
 */

import { stat } from 'node:fs/promises';

import type {
	IStartupStatePorts,
	IStateDatabaseSeam,
	IStateDatabaseProbe,
} from '../startup-reconciler/index';

import type {
	IStateDatabaseOpen,
	IStateDatabaseSeamOptions,
} from './state-database-seam.interface';

export type {
	IStateDatabaseOpen,
	IStatePortsOpener,
	IStateDatabaseSeamOptions,
} from './state-database-seam.interface';

/** Not a claim about the file — a statement about the host. */
const NO_ADAPTER_REASON =
	'no state-database adapter is bound in this host, so the operational state could not be opened; reconciliation observed the workspace but could not rebuild or record anything';

const errorCode = (error: unknown): string | undefined => {
	if (typeof error !== 'object' || error === null) return undefined;
	const code = (error as { readonly code?: unknown }).code;
	return typeof code === 'string' ? code : undefined;
};

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/** Resolve the tri-state without ever throwing. */
export const probeStateDatabase = async (
	databasePath: string,
): Promise<IStateDatabaseProbe> => {
	try {
		const stats = await stat(databasePath);
		if (stats.isDirectory()) {
			return {
				kind: 'unreadable',
				path: databasePath,
				reason: 'the state database path is a directory, not a database file',
			};
		}
		return { kind: 'present', path: databasePath };
	} catch (error) {
		if (errorCode(error) === 'ENOENT') {
			return { kind: 'absent', path: databasePath };
		}
		return {
			kind: 'unreadable',
			path: databasePath,
			reason: describe(error),
		};
	}
};

/**
 * Build the seam. The filesystem is read exactly once, here, so every
 * later `probe()` returns the same answer the open decision was based on.
 */
export const createStateDatabaseSeam = async (
	options: IStateDatabaseSeamOptions,
): Promise<IStateDatabaseSeam> => {
	const probed = await probeStateDatabase(options.databasePath);
	return {
		probe: (): IStateDatabaseProbe => probed,
		open: (openOptions): IStateDatabaseOpen => {
			if (probed.kind === 'unreadable') {
				return { kind: 'unreadable', reason: probed.reason };
			}
			if (probed.kind === 'absent' && !openOptions.allowCreate) {
				return { kind: 'absent' };
			}
			const opener = options.openPorts;
			if (opener === undefined) {
				return { kind: 'unverifiable', reason: NO_ADAPTER_REASON };
			}
			try {
				return opener({
					databasePath: options.databasePath,
					allowCreate: openOptions.allowCreate,
					probe: probed,
				});
			} catch (error) {
				// An adapter that throws is still a diagnosis, never a
				// crashed boot: the file is left exactly as it was.
				return { kind: 'unreadable', reason: describe(error) };
			}
		},
	};
};
