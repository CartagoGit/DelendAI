/**
 * Node 22 shim — `navigator` is scheduled to become a Node.js global, so
 * accessing the bare `navigator` identifier now throws
 * `PendingMigrationError: navigator is now a global in nodejs`.
 *
 * `zod@4.4.3` (pulled in transitively from the dashboard message
 * schemas) probes `typeof navigator !== "undefined"` during its `jit`
 * capability check. Even the `typeof` evaluation triggers the
 * migration error on Node ≥ 22, which makes the whole bundle fail to
 * load with the cryptic "Activating extension failed" stack.
 *
 * We patch `globalThis.navigator` to `undefined` so the migration
 * guard is satisfied and the typeof check resolves cleanly. The
 * extension itself never reads `navigator`, so this is a no-op at
 * runtime; it only exists to keep the bundled zod happy.
 */
if (typeof globalThis !== 'undefined') {
	try {
		// `globalThis.navigator` may already be declared (and writable).
		// Use a defineProperty to force the value without triggering the
		// PendingMigrationError that a bare identifier read causes.
		Object.defineProperty(globalThis, 'navigator', {
			value: undefined,
			writable: true,
			configurable: true,
		});
	} catch {
		// If defineProperty is blocked (rare), swallow — the worst case is
		// the original zod failure, which we have already raised above.
	}
}
