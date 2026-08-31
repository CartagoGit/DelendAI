/**
 * Node 22 shim — `navigator` is scheduled to become a Node.js global,
 * so accessing the bare `navigator` identifier now throws
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
 *
 * IMPORTANT: the body below must run eagerly when this module is
 * imported. Bun's bundler treats top-level code without an export
 * as side-effect-free and tree-shakes it, so we wrap the body in
 * an IIFE and export a sentinel that callers can reference to keep
 * the module alive.
 */
const globalRef = globalThis as typeof globalThis & {
	__mcpVertexNode22NavigatorPatched?: boolean;
};
(function patchNavigator(): void {
	try {
		Object.defineProperty(globalRef, 'navigator', {
			value: undefined,
			writable: true,
			configurable: true,
		});
		globalRef.__mcpVertexNode22NavigatorPatched = true;
	} catch {
		// If defineProperty is blocked (rare), swallow — the worst case
		// is the original zod failure, which we have already raised
		// above.
	}
})();
export const NAVIGATOR_PATCH_MARKER =
	globalRef.__mcpVertexNode22NavigatorPatched === true;
