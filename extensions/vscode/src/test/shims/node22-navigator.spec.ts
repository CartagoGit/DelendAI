/**
 * node22-navigator.spec.ts — pins the Node ≥ 22 navigator shim so a
 * future refactor cannot accidentally drop it (which would re-break
 * the extension on Node 22+ with `PendingMigrationError`).
 */
import { describe, expect, it } from 'vitest';

import '../../../src/shims/node22-navigator';

describe('Node ≥ 22 navigator shim', () => {
	it('forces globalThis.navigator to undefined', () => {
		expect(
			(globalThis as { navigator?: unknown }).navigator,
		).toBeUndefined();
	});

	it('keeps typeof navigator as "undefined" so zod jit check passes', () => {
		expect(typeof (globalThis as { navigator?: unknown }).navigator).toBe(
			'undefined',
		);
	});
});
