/**
 * no-node-imports.spec.ts — q00018 S1 acceptance.
 *
 * Mirrors the r00029 S1 guard that protects `@delendai/contracts`:
 * every file under `packages/state/src/**` MUST be pure
 * TypeScript. Running the lint as a test means `bun run validate`
 * catches a regression immediately.
 */

import { describe, expect, it } from 'vitest';

import { main as lintMain } from '../../../../tools/scripts/lint/no-node-imports-in-state.script';

describe('no-node-imports-in-state (q00018 S1)', () => {
	it('returns 0 violations for the current state-engine surface', async () => {
		const code = await lintMain();
		expect(code).toBe(0);
	});
});
