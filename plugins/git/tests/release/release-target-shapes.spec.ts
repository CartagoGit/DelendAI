/**
 * The release tools read the branches and the manifest the project's
 * policy names, whatever its shape.
 */
import { describe, expect, it } from 'vitest';

import type { IReleaseTarget } from '@delendai/core/public';
import { resolveReleaseTarget } from '@delendai/core/lib/development-policy/release-target';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import {
	createReleaseCandidateStore,
	readExpectedReleaseState,
	releasePrepareExecute,
} from '../../src/lib/release';
import { reconcileRelease } from '../../src/lib/release-finalize';
import { createReleaseCandidate } from '../../src/lib/services/git';
import type { IGitRunner } from '../../src/lib/services/git';

const targetFor = (
	development: Record<string, unknown>,
	manifest?: string,
): IReleaseTarget =>
	resolveReleaseTarget(resolveDevelopmentPolicy({ development }), manifest);

const recordingRunner = (
	shas: Readonly<Record<string, string>>,
	manifestPath: string,
) => {
	const calls: string[][] = [];
	const run: IGitRunner = async (args) => {
		calls.push([...args]);
		if (args[0] === 'rev-parse' && shas[args[1] ?? ''] !== undefined)
			return { ok: true, output: `${shas[args[1] ?? '']}\n` };
		if (args[0] === 'show' && args[1]?.endsWith(`:${manifestPath}`))
			return { ok: true, output: '{"version":"2.0.0"}' };
		return {
			ok: false,
			output: '',
			reason: `unexpected ${args.join(' ')}`,
		};
	};
	return { run, calls };
};

describe('release state per project shape', () => {
	it('reads develop, main and the named manifest for this repository', async () => {
		const target = targetFor(
			{
				profile: 'shared-checkout-pr',
				branches: { integration: 'develop', release: 'main' },
			},
			'packages/core/package.json',
		);
		const { run } = recordingRunner(
			{ develop: '1111111', main: '2222222' },
			'packages/core/package.json',
		);
		await expect(readExpectedReleaseState(run, target)).resolves.toEqual({
			sourceDevelopSha: '1111111',
			mainSha: '2222222',
			mainVersion: '2.0.0',
		});
	});

	it('reads the configured branches and the root manifest by default', async () => {
		const target = targetFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'trunk', release: 'stable' },
		});
		const { run, calls } = recordingRunner(
			{ trunk: '3333333', stable: '4444444' },
			'package.json',
		);
		await expect(readExpectedReleaseState(run, target)).resolves.toEqual({
			sourceDevelopSha: '3333333',
			mainSha: '4444444',
			mainVersion: '2.0.0',
		});
		expect(calls).toContainEqual(['show', '4444444:package.json']);
		expect(calls.flat().join(' ')).not.toMatch(/develop|main/);
	});

	it('cuts a candidate from the configured branches', async () => {
		const target = targetFor({
			profile: 'shared-checkout-merge',
			branches: { integration: 'trunk', release: 'stable' },
		});
		const { run } = recordingRunner(
			{ trunk: '3333333', stable: '4444444' },
			'package.json',
		);
		await expect(
			createReleaseCandidate(run, {
				type: 'minor',
				slug: 'custom',
				actor: 'agent',
				target,
			}),
		).resolves.toMatchObject({
			sourceDevelopSha: '3333333',
			baseMainSha: '4444444',
			targetVersion: '2.1.0',
		});
	});

	it('has no release to prepare when one branch integrates and releases', async () => {
		const target = targetFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'main' },
		});
		const { run, calls } = recordingRunner({}, 'package.json');
		await expect(
			readExpectedReleaseState(run, target),
		).rejects.toMatchObject({ code: 'no-release-branch' });
		await expect(
			releasePrepareExecute(run, createReleaseCandidateStore(), {
				type: 'patch',
				slug: 'nothing',
				actor: 'agent',
				target,
				expected: {
					sourceDevelopSha: '1111111',
					mainSha: '1111111',
					mainVersion: '1.0.0',
				},
			}),
		).rejects.toMatchObject({ code: 'no-release-branch' });
		expect(calls).toEqual([]);
	});
});

describe('reconcile names the configured integration branch', () => {
	it('reports the branch it reconciles into', async () => {
		const receipt = await reconcileRelease(
			async (args) => ({ ok: args[2] === 'bbbbbbb', output: '' }),
			{
				releaseSlug: 'custom',
				releaseBranchSha: 'aaaaaaa',
				developShaAtCut: 'bbbbbbb',
				developShaNow: 'ccccccc',
				releaseOnlyFixes: [],
				actor: 'agent',
			},
			'trunk',
		);
		expect(receipt).toMatchObject({ target: 'trunk' });
	});
});
