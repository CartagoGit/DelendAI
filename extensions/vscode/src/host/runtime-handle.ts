/**
 * runtime-handle.ts — Solid SRP + DIP for extension lifecycle.
 *
 * Before this split, `extension.ts` violated two SOLID principles:
 *
 *   1. **SRP**: `activate()` was doing two jobs — *registering* commands,
 *      trees, watchers, and the status bar (registration), and *deciding
 *      when each one should be torn down* (lifecycle). The first concern
 *      is the extension's domain; the second is generic lifecycle.
 *
 *   2. **DIP**: `deactivate()` had no abstraction to depend on. Because
 *      `activate()` registered everything against the raw
 *      `IExtensionContext.subscriptions` array, `deactivate()` was forced
 *      to know that array exists — and was empty, leaking the status bar
 *      item, watchers, and the stdio client on every window reload.
 *
 * With `IRuntimeHandle`:
 *
 *   - `activate()` calls `handle.register(id, disposable)` for every
 *     resource it creates. The handle is the single source of truth.
 *   - `deactivate()` calls `handle.disposeAll()`. Order is LIFO, errors
 *     in one disposer do not abort the rest (best-effort cleanup), and
 *     the underlying `IExtensionContext.subscriptions` array is still
 *     the integration point with VS Code — but only via the handle.
 *   - The `IRuntimeHandle` interface lets unit tests inject a fake
 *     handle and assert *which* disposables the extension registered
 *     and *in which order* they are torn down.
 */

export interface IRuntimeHandle {
	/** How many disposables the handle currently owns. */
	readonly count: number;
	/** Register a disposable under a stable id (used in disposeOne + debug). */
	register(id: string, disposable: IDisposableLike): void;
	/** Dispose a single disposable by id. Returns true if removed. */
	disposeOne(id: string): boolean;
	/** Dispose every registered disposable, in LIFO order. Errors are swallowed. */
	disposeAll(): void;
}

export interface IDisposableLike {
	dispose(): void;
}

interface IEntry {
	readonly id: string;
	readonly disposable: IDisposableLike;
	disposed: boolean;
}

export const createRuntimeHandle = (): IRuntimeHandle => {
	const entries: IEntry[] = [];

	const disposeEntry = (entry: IEntry): void => {
		if (entry.disposed) return;
		entry.disposed = true;
		try {
			entry.disposable.dispose();
		} catch {
			// best-effort: a broken disposable must not block the rest.
		}
	};

	return {
		get count(): number {
			return entries.filter((e) => !e.disposed).length;
		},
		register(id, disposable) {
			entries.push({ id, disposable, disposed: false });
		},
		disposeOne(id) {
			const idx = entries.findIndex((e) => e.id === id && !e.disposed);
			if (idx === -1) return false;
			disposeEntry(entries[idx]!);
			return true;
		},
		disposeAll() {
			// LIFO: walk the array backwards so the most recently registered
			// resource is disposed first. This matches the convention
			// `IExtensionContext.subscriptions` follows in the real VS Code
			// runtime.
			for (let i = entries.length - 1; i >= 0; i--) {
				disposeEntry(entries[i]!);
			}
		},
	};
};
