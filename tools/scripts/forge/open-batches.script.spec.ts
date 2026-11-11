/**
 * open-batches.script.spec.ts — the host's pass opens batches in the
 * `open-batches` role, from a clone of its own, and runs when the forge
 * says something changed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	followUpsFor,
	INTEGRATION_FOLLOW_UPS,
} from '../host/integration-follow-ups.script';

const SCRIPT = 'tools/scripts/forge/open-batches.script.ts';

describe('open-batches', () => {
	it('[<50ms] runs the pass in the host role, built in a throwaway clone', () => {
		const source = readFileSync(
			join(import.meta.dirname, 'open-batches.script.ts'),
			'utf8',
		);
		expect(source).toContain("role: 'open-batches'");
		expect(source).toContain('throwawayClone(root,');
		expect(source).toMatch(/root: clone\.dir,\s*remote: 'origin',/u);
		expect(source).toContain("batchOpener !== 'host'");
	});

	it('[<20ms] runs on a move of the integration branch and on a forge event', () => {
		expect(INTEGRATION_FOLLOW_UPS.map((step) => step.script)).toContain(
			SCRIPT,
		);
		expect(followUpsFor('event').map((step) => step.script)).toContain(
			SCRIPT,
		);
	});
});
