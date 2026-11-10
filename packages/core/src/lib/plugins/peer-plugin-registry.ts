/**
 * peer-plugin-registry.ts — shared container for the names of every
 * plugin that successfully registered in the current boot.
 *
 * The core instantiates one of these at boot, hands it to every
 * plugin via `IMcpPluginContext.peerPlugins`, then calls `set()` once
 * `loadPlugins()` finishes so handlers see the final peer list. The
 * registry is intentionally *post-load populated*: plugins run their
 * `register()` while the list is still empty, and they only consult
 * the list from inside tool handlers (where the load is already
 * complete and the registry is populated).
 *
 * Design notes:
 *  - Single mutable slot (array). Reads return a fresh `readonly`
 *    copy so callers cannot mutate it back.
 *  - `set` is idempotent. Re-loading a plugin at runtime replaces the
 *    list wholesale; the core never appends/splices.
 *  - `has(name)` checks the registered names against the requested
 *    candidate with simple `===`. The check is hot on the critical
 *    path of plugins like `audit` that gate work on a peer's presence.
 */
import type { IPeerPluginRegistry } from './plugin-contract';

/** Factory: returns the registry object plus a setter the core invokes. */
export const createPeerPluginRegistry = (): {
	readonly registry: IPeerPluginRegistry;
	readonly set: (names: readonly string[]) => void;
} => {
	// Mutable backing slot. Readonly from the plugin's perspective.
	let current: readonly string[] = [];
	const list = (): readonly string[] => current;
	const has = (name: string): boolean => current.includes(name);
	const set = (names: readonly string[]): void => {
		// Defensive copy + normalisation: the boot loader passes the
		// canonical `pluginNames` set; hosts can pass a fresh array
		// after re-loading.
		current = Object.freeze([...names]);
	};
	return {
		registry: { list, has },
		set,
	};
};
