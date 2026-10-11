import { describe, expect, it, vi } from 'vitest';

import {
	decideReleaseGate,
	main,
	type IReleaseGateOptions,
} from './release-pr-gate.script';

const makeUpdate = (
	localRef: string,
	remoteRef: string,
	localSha = '1111111111111111111111111111111111111111',
	remoteSha = '2222222222222222222222222222222222222222',
) => ({
	localRef,
	localSha,
	remoteRef,
	remoteSha,
});

describe('release-pr-gate — decideReleaseGate', () => {
	it('returns ok without inspected refs when no updates are present', () => {
		const decision = decideReleaseGate([], 'feat(release): prepare cut');
		expect(decision).toEqual({ ok: true, blockers: [], inspectedRefs: [] });
	});

	it('runs steps when a pushed ref targets main', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/develop', 'refs/heads/main')],
			'feat(release): prepare cut',
			{ runStep },
		);
		expect(decision.ok).toBe(true);
		expect(decision.inspectedRefs).toEqual(['develop->main']);
		expect(runStep).toHaveBeenCalledTimes(2);
		expect(runStep).toHaveBeenNthCalledWith(1, 'typecheck');
		expect(runStep).toHaveBeenNthCalledWith(2, 'lint');
	});

	it('runs steps for release to same release branch', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/release/v1', 'refs/heads/release/v1')],
			'fix(release): patch notes',
			{ runStep },
		);
		expect(decision.ok).toBe(true);
		expect(decision.inspectedRefs).toEqual(['release/v1->release/v1']);
		expect(runStep).toHaveBeenCalledTimes(2);
	});

	it('runs steps for release to main', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/release/v1', 'refs/heads/main')],
			'fix(release): patch notes',
			{ runStep },
		);
		expect(decision.ok).toBe(true);
		expect(decision.inspectedRefs).toEqual(['release/v1->main']);
		expect(runStep).toHaveBeenCalledTimes(2);
	});

	it('skips steps for non-release refs', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/feature/x', 'refs/heads/feature/x')],
			'feat(feature): continue work',
			{ runStep },
		);
		expect(decision).toEqual({ ok: true, blockers: [], inspectedRefs: [] });
		expect(runStep).not.toHaveBeenCalled();
	});

	it('blocks on an empty commit message before running steps', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/develop', 'refs/heads/main')],
			'',
			{ runStep },
		);
		expect(decision.ok).toBe(false);
		expect(decision.blockers.join('\n')).toContain(
			'commit-msg: commit message is empty.',
		);
		expect(runStep).not.toHaveBeenCalled();
	});

	it('blocks when typecheck fails', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockImplementation((label) => (label === 'typecheck' ? 2 : 0));
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/develop', 'refs/heads/main')],
			'feat(release): prepare cut',
			{ runStep },
		);
		expect(decision.ok).toBe(false);
		expect(decision.blockers.join('\n')).toContain(
			'bun run typecheck failed (exit 2).',
		);
		expect(runStep).toHaveBeenCalledTimes(2);
	});

	it('blocks when lint fails', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockImplementation((label) => (label === 'lint' ? 3 : 0));
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/develop', 'refs/heads/main')],
			'feat(release): prepare cut',
			{ runStep },
		);
		expect(decision.ok).toBe(false);
		expect(decision.blockers.join('\n')).toContain(
			'bun run lint failed (exit 3).',
		);
		expect(runStep).toHaveBeenCalledTimes(2);
	});

	it('passes when commit message and both steps are green', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const decision = decideReleaseGate(
			[makeUpdate('refs/heads/develop', 'refs/heads/main')],
			'feat(release): prepare cut',
			{ runStep },
		);
		expect(decision).toEqual({
			ok: true,
			blockers: [],
			inspectedRefs: ['develop->main'],
		});
	});

	it('ignores branch deletes even if they mention a release ref', () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const decision = decideReleaseGate(
			[
				makeUpdate(
					'refs/heads/release/v1',
					'refs/heads/release/v1',
					'0000000000000000000000000000000000000000',
				),
			],
			'feat(release): prepare cut',
			{ runStep },
		);
		expect(decision).toEqual({ ok: true, blockers: [], inspectedRefs: [] });
		expect(runStep).not.toHaveBeenCalled();
	});
});

describe('release-pr-gate — main', () => {
	it('returns exit 1 when the decision blocks', async () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const options: IReleaseGateOptions = {
			readStdin: async () =>
				'refs/heads/develop 1111111111111111111111111111111111111111 refs/heads/main 2222222222222222222222222222222222222222\n',
			readLastCommit: () => '',
			runStep,
		};
		await expect(main([], options)).resolves.toBe(1);
		expect(runStep).not.toHaveBeenCalled();
	});

	it('returns exit 0 when the decision passes', async () => {
		const runStep = vi
			.fn<(label: 'typecheck' | 'lint') => number>()
			.mockReturnValue(0);
		const options: IReleaseGateOptions = {
			readStdin: async () =>
				'refs/heads/release/v1 1111111111111111111111111111111111111111 refs/heads/main 2222222222222222222222222222222222222222\n',
			readLastCommit: () => 'feat(release): prepare cut',
			runStep,
		};
		await expect(main([], options)).resolves.toBe(0);
		expect(runStep).toHaveBeenCalledTimes(2);
	});
});
