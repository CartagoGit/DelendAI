import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IFollowUpPorts } from './integration-follow-ups.script';
import {
	followUpsFor,
	followUpsRefusal,
	INTEGRATION_FOLLOW_UPS,
	runFollowUps,
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

	it('[<20ms] receives no forge-writing port: a follow-up can only check for and run a local script', async () => {
		const ports: IFollowUpPorts = {
			exists: () => true,
			run: () => Promise.resolve(),
			report: () => undefined,
		};
		expect(Object.keys(ports).sort()).toEqual(['exists', 'report', 'run']);
		const ran: string[] = [];
		await runFollowUps('move', {
			...ports,
			run: (step) => {
				ran.push(step.script);
				return Promise.resolve();
			},
		});
		expect(ran).toEqual(INTEGRATION_FOLLOW_UPS.map((step) => step.script));
		expect(ran).not.toContain(
			'tools/scripts/forge/bring-forward.script.ts',
		);
	});

	it('[<20ms] skips a missing script and reports a failing one without stopping', async () => {
		const lines: string[] = [];
		const ran: string[] = [];
		await runFollowUps(
			'move',
			{
				exists: (script) => script !== 'b.ts',
				run: (step) => {
					ran.push(step.script);
					return step.script === 'a.ts'
						? Promise.reject(new Error('boom'))
						: Promise.resolve();
				},
				report: (line) => lines.push(line),
			},
			[
				{ script: 'a.ts', timeoutMs: 1, onEvent: false },
				{ script: 'b.ts', timeoutMs: 1, onEvent: false },
				{ script: 'c.ts', timeoutMs: 1, onEvent: false },
			],
		);
		expect(ran).toEqual(['a.ts', 'c.ts']);
		expect(lines.join('')).toContain('a.ts did not complete: boom');
	});

	it('[<5ms] a process older than the recorded protocol refuses and says to restart', () => {
		expect(followUpsRefusal(2, 2)).toBeUndefined();
		expect(followUpsRefusal(3, 2)).toContain('Restart');
	});
});
