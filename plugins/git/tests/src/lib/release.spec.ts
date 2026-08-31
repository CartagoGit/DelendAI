import { describe, expect, it } from 'vitest';

import {
	createReleaseCandidate,
	mergeReleaseFixToDevelop,
	openPromotionPr,
	prepareReleaseBranch,
} from '../../../src/lib/services/git';
import type { IGitRunner } from '../../../src/lib/services/git';

describe('release candidate cut', () => {
	it('creates the canonical release branch from a clean develop checkout', async () => {
		const commands: string[][] = [];
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return { ok: true, output: '## develop...origin/develop\n' };
			if (args[0] === 'rev-parse' && args[1] === 'develop')
				return { ok: true, output: '1111111\n' };
			if (args[0] === 'rev-parse' && args[1] === '--verify')
				return { ok: false, output: '', reason: 'missing branch' };
			return { ok: true, output: '' };
		};

		await expect(
			prepareReleaseBranch(run, {
				type: 'patch',
				slug: 'r1-contracts',
			}),
		).resolves.toEqual({
			branch: 'release/patch/r1-contracts',
			baseBranch: 'develop',
			sourceSha: '1111111',
			upstream: 'origin/release/patch/r1-contracts',
		});
		expect(commands).toEqual([
			['status', '--porcelain=v1', '--branch'],
			['rev-parse', 'develop'],
			[
				'rev-parse',
				'--verify',
				'--quiet',
				'refs/heads/release/patch/r1-contracts',
			],
			['switch', '--create', 'release/patch/r1-contracts', 'develop'],
			['push', '--set-upstream', 'origin', 'release/patch/r1-contracts'],
		]);
	});

	it('rejects a release cut outside develop or with a dirty tree', async () => {
		const notDevelop: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: '## feature/work\n' };
			return { ok: true, output: '' };
		};
		await expect(
			prepareReleaseBranch(notDevelop, {
				type: 'patch',
				slug: 'wrong-source',
			}),
		).rejects.toThrow(/prepared from develop/);

		const dirty: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: '## develop\n M package.json\n' };
			return { ok: true, output: '' };
		};
		await expect(
			prepareReleaseBranch(dirty, {
				type: 'patch',
				slug: 'dirty-source',
			}),
		).rejects.toThrow(/clean working tree/);
	});

	it('rejects an existing release branch that does not point at develop', async () => {
		const commands: string[][] = [];
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return { ok: true, output: '## develop\n' };
			if (args[0] === 'rev-parse' && args[1] === 'develop')
				return { ok: true, output: '1111111\n' };
			if (args[0] === 'rev-parse' && args[1] === '--verify')
				return { ok: true, output: '2222222\n' };
			if (args[0] === 'rev-parse' && args[1] === 'release/patch/diverged')
				return { ok: true, output: '2222222\n' };
			return { ok: true, output: '' };
		};

		await expect(
			prepareReleaseBranch(run, {
				type: 'patch',
				slug: 'diverged',
			}),
		).rejects.toThrow(/does not point at develop/);
		expect(commands).not.toContainEqual([
			'push',
			'--set-upstream',
			'origin',
			'release/patch/diverged',
		]);
	});

	it('uses main version and preserves source/base SHAs when develop advances', async () => {
		let developSha = '1111111';
		const commands: readonly string[][] = [];
		const run: IGitRunner = async (args) => {
			(commands as string[][]).push([...args]);
			if (args[0] === 'status')
				return { ok: true, output: '## develop\n' };
			if (args[0] === 'rev-parse' && args[1] === 'develop')
				return { ok: true, output: `${developSha}\n` };
			if (args[0] === 'rev-parse' && args[1] === '--verify')
				return { ok: false, output: '', reason: 'missing branch' };
			if (args[0] === 'rev-parse' && args[1] === 'main')
				return { ok: true, output: '2222222\n' };
			if (
				args[0] === 'show' &&
				args[1] === '2222222:packages/core/package.json'
			)
				return { ok: true, output: '{"version":"1.4.2"}\n' };
			if (
				args[0] === 'show' &&
				args[1] === 'main:packages/core/package.json'
			)
				throw new Error('mobile main ref was read');
			return { ok: true, output: '{"version":"1.4.2"}\n' };
		};
		const candidate = await createReleaseCandidate(run, {
			type: 'patch',
			slug: 'r1-contracts',
			actor: 'release-agent',
			timestamp: '2026-08-31T00:00:00.000Z',
		});
		developSha = '3333333';
		expect(candidate).toMatchObject({
			sourceDevelopSha: '1111111',
			baseMainSha: '2222222',
			fromVersion: '1.4.2',
			targetVersion: '1.4.3',
			branch: 'release/patch/r1-contracts',
			state: 'cut',
		});
		expect(commands).toContainEqual([
			'show',
			'2222222:packages/core/package.json',
		]);
		expect(Object.isFrozen(candidate)).toBe(true);
		expect(Object.isFrozen(candidate.includedProposals)).toBe(true);
	});
});

describe('release fix merge back to develop', () => {
	const buildRunner = (
		initialBranch: string,
		options: {
			readonly branchSha: string;
			readonly developSha: string;
			readonly mainSha: string;
			readonly mergeResultSha?: string;
			readonly ffOnlyOk?: boolean;
		},
	): { readonly run: IGitRunner; readonly commands: string[][] } => {
		const commands: string[][] = [];
		let headSha = options.branchSha;
		let developSha = options.developSha;
		let currentBranch = initialBranch;
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return { ok: true, output: `## ${currentBranch}\n` };
			if (args[0] === 'rev-parse') {
				if (args[1] === '--verify')
					return { ok: true, output: `${headSha}\n` };
				if (args[1] === 'HEAD')
					return { ok: true, output: `${headSha}\n` };
				if (args[1] === 'release/patch/r1-contracts')
					return { ok: true, output: `${options.branchSha}\n` };
				if (args[1] === 'develop')
					return { ok: true, output: `${developSha}\n` };
				if (args[1] === 'main')
					return { ok: true, output: `${options.mainSha}\n` };
			}
			if (args[0] === 'switch') {
				currentBranch = args[1] ?? currentBranch;
				if (currentBranch === 'develop') headSha = developSha;
				return { ok: true, output: '' };
			}
			if (args[0] === 'merge') {
				if (options.ffOnlyOk === false)
					return {
						ok: false,
						output: '',
						reason: 'not fast-forwardable',
					};
				if (args.includes('--no-ff')) {
					developSha = options.mergeResultSha ?? developSha;
					headSha = developSha;
				} else {
					developSha = options.branchSha;
					headSha = developSha;
				}
				return { ok: true, output: '' };
			}
			if (args[0] === 'push') return { ok: true, output: '' };
			return { ok: true, output: '' };
		};
		return { run, commands };
	};

	it('merges the release branch into develop with a merge commit and pushes it', async () => {
		const { run, commands } = buildRunner('release/patch/r1-contracts', {
			branchSha: 'bbbbbbb',
			developSha: 'aaaaaaa',
			mainSha: 'ddddddd',
			mergeResultSha: 'ccccccc',
		});
		const result = await mergeReleaseFixToDevelop(run, {
			releaseBranch: 'release/patch/r1-contracts',
		});
		expect(result).toMatchObject({
			releaseBranch: 'release/patch/r1-contracts',
			strategy: 'no-ff',
			mergeCommit: 'ccccccc',
			upstream: 'origin/release/patch/r1-contracts',
		});
		expect(result.developSha).toBe('ccccccc');
		expect(commands).toEqual(
			expect.arrayContaining([
				['status', '--porcelain=v1', '--branch'],
				['rev-parse', '--verify', '--quiet', 'HEAD'],
				['rev-parse', 'release/patch/r1-contracts'],
				['rev-parse', 'develop'],
				['rev-parse', 'main'],
				['switch', 'develop'],
				[
					'merge',
					'--no-ff',
					'-m',
					'Merge release release/patch/r1-contracts into develop',
					'release/patch/r1-contracts',
				],
				['push', 'origin', 'develop'],
			]),
		);
	});

	it('fast-forwards develop when explicitly opted in', async () => {
		const { run } = buildRunner('release/patch/r1-contracts', {
			branchSha: 'bbbbbbb',
			developSha: 'aaaaaaa',
			mainSha: 'ddddddd',
		});
		const result = await mergeReleaseFixToDevelop(run, {
			releaseBranch: 'release/patch/r1-contracts',
			fastForwardOnly: true,
		});
		expect(result.strategy).toBe('ff');
		expect(result.mergeCommit).toBeUndefined();
	});

	it('refuses to fast-forward when the release branch diverged from develop', async () => {
		const { run } = buildRunner('release/patch/r1-contracts', {
			branchSha: 'bbbbbbb',
			developSha: 'aaaaaaa',
			mainSha: 'ddddddd',
			ffOnlyOk: false,
		});
		await expect(
			mergeReleaseFixToDevelop(run, {
				releaseBranch: 'release/patch/r1-contracts',
				fastForwardOnly: true,
			}),
		).rejects.toThrow(/not fast-forwardable/);
	});

	it('refuses to run outside the release branch', async () => {
		const wrongBranch: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: '## develop\n' };
			return { ok: true, output: '' };
		};
		await expect(
			mergeReleaseFixToDevelop(wrongBranch, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/must run from release\/patch\/r1-contracts/);
	});

	it('refuses to merge a release branch with a dirty working tree', async () => {
		const dirty: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return {
					ok: true,
					output: '## release/patch/r1-contracts\n M x.ts\n',
				};
			return { ok: true, output: '' };
		};
		await expect(
			mergeReleaseFixToDevelop(dirty, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/clean/);
	});

	it('refuses to merge a release branch with no fixups', async () => {
		const sameSha: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: '## release/patch/r1-contracts\n' };
			if (args[0] === 'rev-parse' && args[1] === '--verify') {
				if (args[2] === '--quiet' && args[3] === 'HEAD')
					return { ok: true, output: 'sameref\n' };
				return { ok: true, output: 'sameref\n' };
			}
			if (
				args[0] === 'rev-parse' &&
				args[1] === 'release/patch/r1-contracts'
			)
				return { ok: true, output: 'sameref\n' };
			if (args[0] === 'rev-parse' && args[1] === 'develop')
				return { ok: true, output: 'sameref\n' };
			if (args[0] === 'rev-parse' && args[1] === 'main')
				return { ok: true, output: 'mainref\n' };
			return { ok: true, output: '' };
		};
		await expect(
			mergeReleaseFixToDevelop(sameSha, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/no fixups/);
	});
});

describe('release promotion push', () => {
	it('pushes the release branch and returns its head SHA', async () => {
		const commands: string[][] = [];
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return { ok: true, output: '## release/patch/r1-contracts\n' };
			if (
				args[0] === 'rev-parse' &&
				args[1] === 'release/patch/r1-contracts'
			)
				return { ok: true, output: 'head-sha\n' };
			return { ok: true, output: '' };
		};
		await expect(
			openPromotionPr(run, { branch: 'release/patch/r1-contracts' }),
		).resolves.toEqual({
			branch: 'release/patch/r1-contracts',
			headSha: 'head-sha',
			upstream: 'origin/release/patch/r1-contracts',
			baseBranch: 'main',
		});
		expect(commands).toContainEqual([
			'push',
			'--set-upstream',
			'origin',
			'release/patch/r1-contracts',
		]);
	});

	it('refuses to push a release branch from a different branch', async () => {
		const wrongBranch: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: '## develop\n' };
			return { ok: true, output: '' };
		};
		await expect(
			openPromotionPr(wrongBranch, {
				branch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/must run from release\/patch\/r1-contracts/);
	});
});
