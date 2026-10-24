import { describe, expect, it } from 'vitest';

import { runProfileCapture } from '../../../../src/lib/profile/run-profile-capture';
import type {
	IPerfProfileCaptureInput,
	IPerfProfileDeps,
} from '../../../../src/lib/contracts/interfaces/perf.interface';

const input: IPerfProfileCaptureInput = {
	cwd: '/tmp/workspace',
	timeoutMs: 2_500,
	format: 'hotspots',
};

describe('runProfileCapture', () => {
	it('returns normalized hotspots when a profiler is present', async () => {
		const deps: IPerfProfileDeps = {
			probeProfilers: async () => [
				{ tool: 'node-prof', available: true, installHints: [] },
			],
			runProfiler: async () => ({
				ok: true,
				profiler: 'node-prof',
				report: '   ticks  total  nonlib   name\n    120   48.0%   22.0%  LazyCompile: *walkWorkspace /tmp/work.js:12:2\n     60   24.0%   11.0%  Function: *hash package.json',
				code: 0,
				timedOut: false,
			}),
		};

		const result = await runProfileCapture(input, deps);
		expect(result.ok).toBe(true);
		if (result.ok !== true) return;
		expect(result.profiler).toBe('node-prof');
		expect(result.hotspots).toHaveLength(2);
		expect(result.hotspots[0]?.name).toContain('walkWorkspace');
		expect(result.hotspots[0]?.severity).toBe('high');
	});

	it('gracefully skips when no profiler is available', async () => {
		const deps: IPerfProfileDeps = {
			probeProfilers: async () => [
				{
					tool: '0x',
					available: false,
					installHints: [
						{ manager: 'npm', command: 'npm install -g 0x' },
					],
					installHint: {
						manager: 'npm',
						command: 'npm install -g 0x',
					},
				},
			],
			runProfiler: async () => {
				throw new Error('should not run');
			},
		};

		const result = await runProfileCapture(input, deps);
		expect(result).toEqual({
			ok: 'skipped',
			hint: 'npm install -g 0x',
		});
	});

	it('returns a structured failure when the profiler crashes', async () => {
		const deps: IPerfProfileDeps = {
			probeProfilers: async () => [
				{ tool: 'node-prof', available: true, installHints: [] },
			],
			runProfiler: async () => ({
				ok: false,
				profiler: 'node-prof',
				code: 124,
				timedOut: true,
				detail: 'timed out after 2500ms',
			}),
		};

		const result = await runProfileCapture(input, deps);
		expect(result).toEqual({
			ok: false,
			code: 'profiler-failed',
			message: 'Profiler node-prof failed with code 124.',
			hint: 'timed out after 2500ms',
		});
	});
});
