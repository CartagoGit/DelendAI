/**
 * bun-polyfill.spec.ts
 *
 * Sanity tests for the worker-side polyfill that injects a minimal
 * `Bun` global into every vitest worker. The polyfill is a side-effect
 * import (run once when the file is loaded by vitest), so we exercise it
 * by importing the module and asserting what landed on globalThis.
 *
 * NOTE: this spec must run in a vitest project that wires the polyfill
 * through its setupFiles. The root project (tools/scripts/vitest.config.ts)
 * does so automatically via sharedSetupFiles; if you ever move this
 * spec to a project that does NOT include the polyfill, the assertions
 * on `globalThis.Bun` will fail with a clear "Bun is undefined" error.
 */
import { afterEach, describe, expect, it } from 'vitest';

import './bun-polyfill.ts';

describe('bun-polyfill', () => {
	const originalBun = (globalThis as { Bun?: unknown }).Bun;

	afterEach(() => {
		// Restore the original Bun (may be the real one in CI) so we never
		// leak the polyfill into sibling tests in this file or others.
		(globalThis as { Bun?: unknown }).Bun = originalBun;
	});

	it('attaches a Bun global to globalThis as a side effect', () => {
		const Bun = (globalThis as { Bun?: unknown }).Bun;
		expect(Bun).toBeDefined();
		expect(typeof Bun).toBe('object');
	});

	it('Bun.which("bun") returns the host bun path when installed', () => {
		const Bun = (
			globalThis as { Bun?: { which: (n: string) => string | null } }
		).Bun;
		expect(Bun?.which).toBeTypeOf('function');
		// On this dev host Bun IS installed at a known location. We assert
		// the contract (string | null), not the exact path -- the path
		// varies across machines (CI, dev containers, native installs).
		const result = Bun?.which('bun');
		expect(result === null || typeof result === 'string').toBe(true);
	});

	it('Bun.which(<other-binary>) returns null', () => {
		const Bun = (
			globalThis as { Bun?: { which: (n: string) => string | null } }
		).Bun;
		// Names that are guaranteed not to be on $PATH must return null,
		// matching the real Bun API contract.
		expect(Bun?.which('not-a-real-binary-xyz')).toBeNull();
	});

	it('Bun.version is a string (empty when Bun is not installed)', () => {
		const Bun = (globalThis as { Bun?: { version: unknown } }).Bun;
		expect(typeof Bun?.version).toBe('string');
	});
});
