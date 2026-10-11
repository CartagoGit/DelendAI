/**
 * storms-tool.interface.ts — the options the `commit_policy_storms`
 * tool registration takes.
 */

import type { StormDetector } from '../../services/storm-detector';
import type { StormLog } from '../../services/storm-log';
import type { IStormEvent } from './storm-detector.interface';

export interface IStormsToolOptions {
	readonly namespacePrefix: string;
	/**
	 * Optional pre-built detector (e.g. one the host wired into
	 * the engine event sink). When `undefined`, the tool creates
	 * its own detector — useful in unit tests and for callers that
	 * just want to inspect the snapshot after seeding events.
	 */
	readonly detector?: StormDetector;
	/**
	 * Optional sink of historical events. When provided, the tool
	 * replays these into the detector before snapshotting. The host
	 * uses this to feed the in-process engine's stderr stream.
	 */
	readonly observedEvents?: readonly IStormEvent[];
	/**
	 * Optional callback invoked once after every successful
	 * snapshot. The host uses this to persist the snapshot via
	 * `StormLog` so the count survives a restart.
	 */
	readonly onSnapshot?: (() => void) | undefined;
	/**
	 * Optional reference to the StormLog; the tool can decide
	 * whether to persist the snapshot itself rather than relying
	 * on a host callback. Currently unused — we just thread it
	 * through for the host's boot-hook convenience.
	 */
	readonly stormLog?: StormLog | undefined;
}
