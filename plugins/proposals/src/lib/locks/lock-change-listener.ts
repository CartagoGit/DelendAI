/**
 * lock-change-listener.ts — Solid ISP extraction.
 *
 * Decouples the agent-lock tool from any specific consumer of lock-file
 * mutations (currently the loop detector, but other plugins may want
 * to subscribe in the future — drift detector, audit counter, etc.).
 *
 * Before this split, `agent-lock.tool.ts` exposed
 * `onLockChanged?: () => void` and the plugin wired it directly to
 * `loopDetector.invalidateLockCache()`. That:
 *
 *   - coupled the lock tool to a specific consumer (the loop detector);
 *   - hid the fact that the only current call site for `claim`,
 *     `release` and `gc` (NOT `status`) can mutate the file;
 *   - made it impossible for two consumers to listen at once without
 *     fan-out logic in the plugin wiring layer.
 *
 * With `ILockChangeListener`:
 *
 *   - any number of listeners can be composed via `lockChangeMultiplexer`;
 *   - listeners receive the action that triggered the change so they
 *     can skip work that doesn't apply (e.g. loop detector only cares
 *     about `claim` / `release` / `gc`, not `status`);
 *   - the tool itself depends only on a typed interface (`ISP`).
 */

/** The four operations the lock tool supports; mirrors the inputSchema enum. */
export type LockAction = 'claim' | 'release' | 'status' | 'gc';

/**
 * Event payload delivered to listeners after a successful lock mutation.
 * Status calls do NOT fire events (they don't mutate the file).
 */
export interface ILockChangeEvent {
	/** Which action mutated the lock file. */
	readonly action: Exclude<LockAction, 'status'>;
	/** The agent who issued the mutation (echoed in lock entries). */
	readonly agent: string | undefined;
	/** The task id of the affected entry (claim/release only). */
	readonly taskId: string | undefined;
}

/**
 * Solid-ISP: a single-purpose interface. Any class that wants to react
 * to lock mutations implements this and is wired by the plugin.
 *
 * The `try-catch` is the listener's responsibility (a misbehaving
 * listener must not break the tool).
 */
export interface ILockChangeListener {
	/** Invoked AFTER a successful claim / release / gc. */
	onLockChanged(event: ILockChangeEvent): void;
}

/**
 * Convenience: a listener that ignores `status` and forwards every
 * other event to a callback. The loop detector uses this shape to
 * keep the cache invalidation logic in one place.
 */
export const createCallbackLockListener = (
	cb: (event: ILockChangeEvent) => void,
): ILockChangeListener => ({
	onLockChanged(event) {
		try {
			cb(event);
		} catch {
			// Never let a listener fail the tool — solid LSP guarantee.
		}
	},
});

/**
 * Solid: composes N listeners into one. The multiplexer swallows each
 * listener's exceptions so a single faulty listener cannot break the
 * tool (defence in depth — individual listeners should already be
 * try-catch-wrapped).
 */
export const lockChangeMultiplexer = (
	listeners: readonly ILockChangeListener[],
): ILockChangeListener => ({
	onLockChanged(event) {
		for (const listener of listeners) {
			try {
				listener.onLockChanged(event);
			} catch {
				// Swallow: the multiplexer is the outermost safety net.
			}
		}
	},
});
