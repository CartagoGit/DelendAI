import { describe, expect, it } from 'vitest';

import {
	createReleaseCandidate,
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
