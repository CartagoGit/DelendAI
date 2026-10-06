/**
 * perf-profile-containment.spec.ts — the profiler runs inside the
 * workspace, or not at all.
 *
 * `perf_profile` turns a caller-supplied `cwd` into the directory the
 * profiler actually executes in. The lexical containment check it used
 * is a string comparison, so `workspace/linked` passed while naming
 * another tree — and the profiler would have run there. Physical
 * containment resolves the real path before anything executes.
 */
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

describe('perf_profile cwd containment', () => {
	it('refuses a cwd reached through a symlink that leaves the workspace', async () => {
		const parent = await mkdtemp(join(tmpdir(), 'perf-containment-'));
		const workspaceRootAbs = join(parent, 'workspace');
		const outside = join(parent, 'outside');
		await mkdir(workspaceRootAbs, { recursive: true });
		await mkdir(outside, { recursive: true });
		await symlink(outside, join(workspaceRootAbs, 'linked'), 'dir');

		try {
			let ranIn: string | undefined;
			const captured = await captureToolRegistration(
				buildPerfProfileRegistration({
					namespacePrefix: 'mcp',
					workspaceRootAbs,
					deps: stubDeps,
					runProfileCapture: async (
						input,
					): Promise<IPerfProfileCaptureResult> => {
						// Records where the profiler WOULD have run; on a
						// refusal it must never be reached at all.
						ranIn = input.cwd;
						return { ok: 'skipped', hint: 'not reached' };
					},
				}),
			);

			const out = (await captured.invoke({ cwd: 'linked' })) as {
				ok?: unknown;
			};

			// The refusal is a tool error, and the capture never ran.
			expect(JSON.stringify(out)).toContain('not allowed');
			expect(ranIn).toBeUndefined();
		} finally {
			await rm(parent, { recursive: true, force: true });
		}
	});

	it('still profiles a cwd that really is inside the workspace', async () => {
		const workspaceRootAbs = await mkdtemp(join(tmpdir(), 'perf-ws-'));
		await mkdir(join(workspaceRootAbs, 'pkg'), { recursive: true });

		try {
			let ranIn: string | undefined;
			const captured = await captureToolRegistration(
				buildPerfProfileRegistration({
					namespacePrefix: 'mcp',
					workspaceRootAbs,
					deps: stubDeps,
					runProfileCapture: async (
						input,
					): Promise<IPerfProfileCaptureResult> => {
						ranIn = input.cwd;
						return { ok: 'skipped', hint: 'no profiler' };
					},
				}),
			);

			await captured.invoke({ cwd: 'pkg' });

			expect(ranIn).toBe(join(workspaceRootAbs, 'pkg'));
		} finally {
			await rm(workspaceRootAbs, { recursive: true, force: true });
		}
	});
});
