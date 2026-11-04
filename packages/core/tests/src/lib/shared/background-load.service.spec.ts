import { describe, expect, it } from 'vitest';

import {
	backgroundEnv,
	backgroundNice,
	backgroundWorkers,
	lowPriority,
	lowPriorityShell,
} from '@delendai/core/lib/shared/background-load.service';

describe('background load', () => {
	it('runs at the lowest priority unless told otherwise', () => {
		expect(backgroundNice({}, 'linux')).toBe(19);
		expect(
			backgroundNice({ DELENDAI_BACKGROUND_NICE: '10' }, 'linux'),
		).toBe(10);
		expect(
			backgroundNice({ DELENDAI_BACKGROUND_NICE: 'off' }, 'linux'),
		).toBeUndefined();
		expect(backgroundNice({}, 'win32')).toBeUndefined();
		expect(
			backgroundNice({ DELENDAI_BACKGROUND_NICE: '99' }, 'linux'),
		).toBe(19);
	});

	it('uses half the cores, at least one, and lets the environment raise it', () => {
		expect(backgroundWorkers({}, 8)).toBe(4);
		expect(backgroundWorkers({}, 1)).toBe(1);
		expect(backgroundWorkers({ DELENDAI_BACKGROUND_WORKERS: '6' }, 8)).toBe(
			6,
		);
	});

	it('wraps commands in nice and caps the proof and vitest', () => {
		expect(
			lowPriority('bun', ['x'], { DELENDAI_BACKGROUND_NICE: '19' }),
		).toEqual({ command: 'nice', args: ['-n', '19', 'bun', 'x'] });
		expect(lowPriorityShell('bun run prove', {})).toBe(
			'nice -n 19 bun run prove',
		);
		const env = backgroundEnv({ DELENDAI_BACKGROUND_WORKERS: '3' });
		expect(env.PROVE_PARALLEL).toBe('3');
		expect(env.VITEST_MAX_WORKERS).toBe('3');
		expect(backgroundEnv({ PROVE_PARALLEL: '9' }).PROVE_PARALLEL).toBe('9');
	});
});
