import { describe, expect, it } from 'vitest';

import {
	createReleaseCandidate,
	mergeReleaseFixToIntegration,
	openPromotionPr,
	prepareReleaseBranch,
	rehydrateIntegrationFromRelease,
} from '../../../src/lib/services/git';
import type { IGitRunner } from '../../../src/lib/services/git';

const STATUS = (branch: string, dirty = false): string =>
	dirty ? `## ${branch}\n M x.ts\n` : `## ${branch}\n`;

describe('release candidate cut', () => {
	it('creates the canonical release branch from a clean develop checkout', async () => {
		const commands: string[][] = [];
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return { ok: true, output: STATUS('develop') };
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

	it('honours a custom releaseSourceBranch configuration', async () => {
		const run: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: STATUS('main') };
			if (args[0] === 'rev-parse' && args[1] === 'main')
				return { ok: true, output: '1111111\n' };
			if (args[0] === 'rev-parse' && args[1] === '--verify')
				return { ok: false, output: '', reason: 'missing branch' };
			return { ok: true, output: '' };
		};
		await expect(
			prepareReleaseBranch(run, {
				type: 'patch',
				slug: 'r1-contracts',
				config: { releaseSourceBranch: 'main' },
			}),
		).resolves.toMatchObject({
			branch: 'release/patch/r1-contracts',
			baseBranch: 'develop',
			sourceSha: '1111111',
			upstream: 'origin/release/patch/r1-contracts',
		});
	});

	it('rejects a release cut outside the release source branch or with a dirty tree', async () => {
		const notDevelop: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: STATUS('feature/work') };
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
				return { ok: true, output: STATUS('develop', true) };
			return { ok: true, output: '' };
		};
		await expect(
			prepareReleaseBranch(dirty, {
				type: 'patch',
				slug: 'dirty-source',
			}),
		).rejects.toThrow(/clean working tree/);
	});

	it('rejects an existing release branch that does not point at the release source', async () => {
		const commands: string[][] = [];
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return { ok: true, output: STATUS('develop') };
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
		const run: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: STATUS('develop') };
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
		expect(Object.isFrozen(candidate)).toBe(true);
		expect(Object.isFrozen(candidate.includedProposals)).toBe(true);
	});
});

/**
 * Builds a runner that simulates the integration branch + target branch
 * state machine used by the release-cycle tests. The default
 * configuration targets `main` and integrates into `develop`; tests
 * can override either via the `config` argument.
 */
const buildCycleRunner = (
	initialBranch: string,
	options: {
		readonly branchSha: string;
		readonly integrationSha: string;
		readonly targetSha: string;
		readonly mergeResultSha?: string;
		readonly ffOnlyOk?: boolean;
	},
	config: {
		readonly integrationBranch: string;
		readonly releaseTargetBranch: string;
	} = { integrationBranch: 'develop', releaseTargetBranch: 'main' },
): { readonly run: IGitRunner; readonly commands: string[][] } => {
	const commands: string[][] = [];
	let headSha = options.branchSha;
	let integrationSha = options.integrationSha;
	let currentBranch = initialBranch;
	const run: IGitRunner = async (args) => {
		commands.push([...args]);
		if (args[0] === 'status')
			return { ok: true, output: STATUS(currentBranch) };
		if (args[0] === 'rev-parse') {
			if (args[1] === '--verify')
				return { ok: true, output: `${headSha}\n` };
			if (args[1] === 'HEAD') return { ok: true, output: `${headSha}\n` };
			if (args[1] === 'release/patch/r1-contracts')
				return { ok: true, output: `${options.branchSha}\n` };
			if (args[1] === config.integrationBranch)
				return { ok: true, output: `${integrationSha}\n` };
			if (args[1] === config.releaseTargetBranch)
				return { ok: true, output: `${options.targetSha}\n` };
		}
		if (args[0] === 'fetch') return { ok: true, output: '' };
		if (args[0] === 'switch') {
			currentBranch = args[1] ?? currentBranch;
			if (currentBranch === config.integrationBranch)
				headSha = integrationSha;
			return { ok: true, output: '' };
		}
		if (args[0] === 'merge' || args[0] === 'rebase') {
			if (options.ffOnlyOk === false && args[0] === 'merge')
				return {
					ok: false,
					output: '',
					reason: 'not fast-forwardable',
				};
			const next = options.mergeResultSha ?? options.branchSha;
			integrationSha = next;
			headSha = next;
			return { ok: true, output: '' };
		}
		if (args[0] === 'push') return { ok: true, output: '' };
		return { ok: true, output: '' };
	};
	return { run, commands };
};

describe('release fix merge into integration branch', () => {
	it('merges the release branch into develop with no-ff and pushes it', async () => {
		const { run, commands } = buildCycleRunner(
			'release/patch/r1-contracts',
			{
				branchSha: 'bbbbbbb',
				integrationSha: 'aaaaaaa',
				targetSha: 'ddddddd',
				mergeResultSha: 'ccccccc',
			},
		);
		const result = await mergeReleaseFixToIntegration(run, {
			releaseBranch: 'release/patch/r1-contracts',
		});
		expect(result).toMatchObject({
			releaseBranch: 'release/patch/r1-contracts',
			integrationBranch: 'develop',
			strategy: 'no-ff',
			mergeCommit: 'ccccccc',
			integrationSha: 'ccccccc',
			upstream: 'origin/release/patch/r1-contracts',
		});
		expect(commands).toEqual(
			expect.arrayContaining([
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

	it('honours a custom integrationBranch and never pushes to main', async () => {
		const { run, commands } = buildCycleRunner(
			'release/patch/r1-contracts',
			{
				branchSha: 'bbbbbbb',
				integrationSha: 'aaaaaaa',
				targetSha: 'ddddddd',
				mergeResultSha: 'ccccccc',
			},
			{ integrationBranch: 'staging', releaseTargetBranch: 'main' },
		);
		const result = await mergeReleaseFixToIntegration(run, {
			releaseBranch: 'release/patch/r1-contracts',
			config: { integrationBranch: 'staging' },
		});
		expect(result.integrationBranch).toBe('staging');
		expect(commands).toContainEqual(['push', 'origin', 'staging']);
		expect(commands).not.toContainEqual(['push', 'origin', 'main']);
	});

	it('rejects when integration equals releaseTargetBranch', async () => {
		const { run } = buildCycleRunner('release/patch/r1-contracts', {
			branchSha: 'bbbbbbb',
			integrationSha: 'aaaaaaa',
			targetSha: 'ddddddd',
		});
		await expect(
			mergeReleaseFixToIntegration(run, {
				releaseBranch: 'release/patch/r1-contracts',
				config: { integrationBranch: 'main' },
			}),
		).rejects.toThrow(/integration branch must differ/);
	});

	it('fast-forwards integration when explicitly opted in', async () => {
		const { run } = buildCycleRunner('release/patch/r1-contracts', {
			branchSha: 'bbbbbbb',
			integrationSha: 'aaaaaaa',
			targetSha: 'ddddddd',
		});
		const result = await mergeReleaseFixToIntegration(run, {
			releaseBranch: 'release/patch/r1-contracts',
			fastForwardOnly: true,
		});
		expect(result.strategy).toBe('ff');
		expect(result.mergeCommit).toBeUndefined();
	});

	it('refuses to fast-forward when the release branch diverged', async () => {
		const { run } = buildCycleRunner('release/patch/r1-contracts', {
			branchSha: 'bbbbbbb',
			integrationSha: 'aaaaaaa',
			targetSha: 'ddddddd',
			ffOnlyOk: false,
		});
		await expect(
			mergeReleaseFixToIntegration(run, {
				releaseBranch: 'release/patch/r1-contracts',
				fastForwardOnly: true,
			}),
		).rejects.toThrow(/not fast-forwardable/);
	});

	it('refuses to run outside the release branch', async () => {
		const wrongBranch: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: STATUS('develop') };
			return { ok: true, output: '' };
		};
		await expect(
			mergeReleaseFixToIntegration(wrongBranch, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/must run from release\/patch\/r1-contracts/);
	});

	it('refuses a dirty tree', async () => {
		const dirty: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return {
					ok: true,
					output: STATUS('release/patch/r1-contracts', true),
				};
			return { ok: true, output: '' };
		};
		await expect(
			mergeReleaseFixToIntegration(dirty, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/clean/);
	});

	it('refuses a release branch with no fixups to merge', async () => {
		const sameSha: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return {
					ok: true,
					output: STATUS('release/patch/r1-contracts'),
				};
			if (args[0] === 'rev-parse') {
				if (args[1] === '--verify')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'HEAD')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'release/patch/r1-contracts')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'develop')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'main')
					return { ok: true, output: 'mainref\n' };
			}
			return { ok: true, output: '' };
		};
		await expect(
			mergeReleaseFixToIntegration(sameSha, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/no fixups/);
	});
});

describe('integration rehydrate after release PR merged', () => {
	it('rebases develop onto the release branch and pushes develop', async () => {
		const { run, commands } = buildCycleRunner(
			'release/patch/r1-contracts',
			{
				branchSha: 'bbbbbbb',
				integrationSha: 'aaaaaaa',
				targetSha: 'ddddddd',
				mergeResultSha: 'ccccccc',
			},
		);
		const result = await rehydrateIntegrationFromRelease(run, {
			releaseBranch: 'release/patch/r1-contracts',
		});
		expect(result).toMatchObject({
			releaseBranch: 'release/patch/r1-contracts',
			integrationBranch: 'develop',
			strategy: 'rebase',
			integrationSha: 'ccccccc',
		});
		expect(commands).toEqual(
			expect.arrayContaining([
				['fetch', 'origin', 'develop'],
				['switch', 'develop'],
				['rebase', 'release/patch/r1-contracts'],
				['push', 'origin', 'develop'],
			]),
		);
	});

	it('can opt into a merge strategy preserving the release branch identity', async () => {
		const { run, commands } = buildCycleRunner(
			'release/patch/r1-contracts',
			{
				branchSha: 'bbbbbbb',
				integrationSha: 'aaaaaaa',
				targetSha: 'ddddddd',
				mergeResultSha: 'ccccccc',
			},
		);
		await rehydrateIntegrationFromRelease(run, {
			releaseBranch: 'release/patch/r1-contracts',
			strategy: 'merge',
		});
		expect(commands).toEqual(
			expect.arrayContaining([
				[
					'merge',
					'--no-ff',
					'-m',
					'Rehydrate develop from release release/patch/r1-contracts',
					'release/patch/r1-contracts',
				],
			]),
		);
	});

	it('refuses to rehydrate when integration equals release target', async () => {
		const { run } = buildCycleRunner('release/patch/r1-contracts', {
			branchSha: 'bbbbbbb',
			integrationSha: 'aaaaaaa',
			targetSha: 'ddddddd',
		});
		await expect(
			rehydrateIntegrationFromRelease(run, {
				releaseBranch: 'release/patch/r1-contracts',
				config: { integrationBranch: 'main' },
			}),
		).rejects.toThrow(/integration branch must differ/);
	});

	it('refuses to rehydrate outside the release branch', async () => {
		const wrongBranch: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return { ok: true, output: STATUS('develop') };
			return { ok: true, output: '' };
		};
		await expect(
			rehydrateIntegrationFromRelease(wrongBranch, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/must run from release\/patch\/r1-contracts/);
	});

	it('refuses to rehydrate when there is nothing to replay', async () => {
		const sameSha: IGitRunner = async (args) => {
			if (args[0] === 'status')
				return {
					ok: true,
					output: STATUS('release/patch/r1-contracts'),
				};
			if (args[0] === 'fetch') return { ok: true, output: '' };
			if (args[0] === 'switch') return { ok: true, output: '' };
			if (args[0] === 'rev-parse') {
				if (args[1] === '--verify')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'HEAD')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'release/patch/r1-contracts')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'develop')
					return { ok: true, output: 'sameref\n' };
				if (args[1] === 'main')
					return { ok: true, output: 'mainref\n' };
			}
			return { ok: true, output: '' };
		};
		await expect(
			rehydrateIntegrationFromRelease(sameSha, {
				releaseBranch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/nothing to rehydrate/);
	});
});

describe('release promotion push', () => {
	it('pushes the release branch and targets main by default', async () => {
		const commands: string[][] = [];
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return {
					ok: true,
					output: STATUS('release/patch/r1-contracts'),
				};
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

	it('respects a custom releaseTargetBranch configuration', async () => {
		const commands: string[][] = [];
		const run: IGitRunner = async (args) => {
			commands.push([...args]);
			if (args[0] === 'status')
				return {
					ok: true,
					output: STATUS('release/patch/r1-contracts'),
				};
			if (
				args[0] === 'rev-parse' &&
				args[1] === 'release/patch/r1-contracts'
			)
				return { ok: true, output: 'head-sha\n' };
			return { ok: true, output: '' };
		};
		await expect(
			openPromotionPr(run, {
				branch: 'release/patch/r1-contracts',
				config: { releaseTargetBranch: 'production' },
			}),
		).resolves.toMatchObject({ baseBranch: 'production' });
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
				return { ok: true, output: STATUS('develop') };
			return { ok: true, output: '' };
		};
		await expect(
			openPromotionPr(wrongBranch, {
				branch: 'release/patch/r1-contracts',
			}),
		).rejects.toThrow(/must run from release\/patch\/r1-contracts/);
	});
});
