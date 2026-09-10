/**
 * Contract shapes for `./state-database-seam`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `state-database-seam.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `state-database-seam.ts`, so no import site changes.
 */

import type {
	IStartupStatePorts,
	IStateDatabaseSeam,
	IStateDatabaseProbe,
} from '../startup-reconciler/index';

/** What `open()` may answer. Mirrors `IStateDatabaseSeam['open']`. */
export type IStateDatabaseOpen =
	| { readonly kind: 'opened'; readonly ports: IStartupStatePorts }
	| { readonly kind: 'absent' }
	| { readonly kind: 'unreadable'; readonly reason: string }
	| { readonly kind: 'unverifiable'; readonly reason: string };

/**
 * Binds the ports to a concrete driver. Supplied by the host, because
 * core owns the contract and not the storage engine.
 */
export type IStatePortsOpener = (options: {
	readonly databasePath: string;
	readonly allowCreate: boolean;
	readonly probe: IStateDatabaseProbe;
}) => IStateDatabaseOpen;

export interface IStateDatabaseSeamOptions {
	/** Absolute path of the state database file. */
	readonly databasePath: string;
	/** Bound driver. Absent means this host has no state adapter at all. */
	readonly openPorts?: IStatePortsOpener | undefined;
}
