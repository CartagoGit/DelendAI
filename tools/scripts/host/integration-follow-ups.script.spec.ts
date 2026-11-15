import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	followUpsFor,
	followUpsRefusal,
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

	it('[<20ms] runs every step on a move, and nothing on a forge event: no step waits on this machine', () => {
		expect(followUpsFor('move')).toEqual(INTEGRATION_FOLLOW_UPS);
		expect(followUpsFor('event')).toEqual([]);
	});

	it('[<20ms] does no forge write: no pull request, label, merge, comment or push', () => {
		const root = join(import.meta.dirname, '../../..');
		const write =
			/openPublicationPullRequest|'pr',\s*'(create|edit|merge|close|comment)'|'-X'|'--method'|\bPOST\b|\bPATCH\b|\[\s*'push'(?!,\s*'--quiet',\s*'--delete')/u;
		for (const { script } of INTEGRATION_FOLLOW_UPS)
			expect(
				write.test(readFileSync(join(root, script), 'utf8')),
				script,
			).toBe(false);
		expect(INTEGRATION_FOLLOW_UPS.map((step) => step.script)).not.toContain(
			'tools/scripts/forge/bring-forward.script.ts',
		);
	});

	it('[<5ms] a process older than the recorded protocol refuses and says to restart', () => {
		expect(followUpsRefusal(2, 2)).toBeUndefined();
		expect(followUpsRefusal(3, 2)).toContain('Restart');
	});
});
