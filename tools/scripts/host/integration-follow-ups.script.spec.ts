import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	followUpsFor,
	INTEGRATION_FOLLOW_UPS,
} from './integration-follow-ups.script';

describe('integration follow-ups', () => {
	it('[<20ms] runs only scripts that exist, none of the retired queue', () => {
		const root = join(import.meta.dirname, '../../..');
		for (const { script } of INTEGRATION_FOLLOW_UPS) {
			expect(existsSync(join(root, script))).toBe(true);
			expect(script).not.toMatch(/queue|refresh|hydrat|namespace/u);
		}
	});

	it('[<20ms] runs every step on a move, and only waiting work on a forge event', () => {
		expect(followUpsFor('move')).toEqual(INTEGRATION_FOLLOW_UPS);
		expect(followUpsFor('event').map((step) => step.script)).toEqual([
			'tools/scripts/forge/open-batches.script.ts',
			'tools/scripts/forge/bring-forward.script.ts',
		]);
	});
});
