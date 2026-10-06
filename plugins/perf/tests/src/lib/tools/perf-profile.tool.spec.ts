import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../../tools/scripts/lib/test-mcp-server';
import { buildPerfProfileRegistration } from '../../../../src/lib/tools/perf-profile.tool';
import type {
	IPerfProfileCaptureResult,
	IPerfProfileDeps,
} from '../../../../src/lib/contracts/interfaces/perf.interface';

const stubDeps: IPerfProfileDeps = {
	probeProfilers: async () => [],
	runProfiler: async () => ({
		ok: false,
		profiler: 'node-prof',
		code: 1,
		timedOut: false,
	}),
};

describe('perf_profile tool (f00126 S3)', () => {
	it('returns a skipped envelope when no profiler is present', async () => {
		const captured = await captureToolRegistration(
			buildPerfProfileRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs: '/tmp/perf-fixture',
				deps: stubDeps,
				runProfileCapture:
					async (): Promise<IPerfProfileCaptureResult> => ({
						ok: 'skipped',
						hint: 'npm install -g 0x',
					}),
			}),
		);

		const out = (await captured.invoke({})) as { ok: string; hint: string };
		expect(out).toEqual({ ok: 'skipped', hint: 'npm install -g 0x' });
	});

	it('returns normalized hotspots with summary and worst severity', async () => {
		const captured = await captureToolRegistration(
			buildPerfProfileRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs: '/tmp/perf-fixture',
				deps: stubDeps,
				runProfileCapture:
					async (): Promise<IPerfProfileCaptureResult> => ({
						ok: true,
						profiler: 'node-prof',
						hotspots: [
							{
								name: 'walkWorkspace',
								message:
									'walkWorkspace — self 22.0%, total 48.0%',
								severity: 'high',
								selfPercent: 22,
								totalPercent: 48,
								samples: 120,
							},
						],
					}),
			}),
		);

		const out = (await captured.invoke({})) as {
			ok: boolean;
			profiler: string;
			summary: {
				high: number;
				medium: number;
				low: number;
				info: number;
				critical: number;
			};
			worst: string;
		};
		expect(out.ok).toBe(true);
		expect(out.profiler).toBe('node-prof');
		expect(out.summary.high).toBe(1);
		expect(out.worst).toBe('high');
	});

	// x00168 (S3): `cwd` used to reach the spawned profiler process
	// argument with zero containment check.
	it('rejects a cwd that escapes the workspace', async () => {
		const captured = await captureToolRegistration(
			buildPerfProfileRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs: '/tmp/perf-fixture',
				deps: stubDeps,
				runProfileCapture:
					async (): Promise<IPerfProfileCaptureResult> => ({
						ok: 'skipped',
						hint: 'should never be reached',
					}),
			}),
		);
		const out = (await captured.invoke({
			cwd: '../../../../etc',
		})) as { error?: unknown };
		expect(out.error).toBeDefined();
	});
});
