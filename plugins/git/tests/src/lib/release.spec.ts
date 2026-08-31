import { describe, expect, it } from 'vitest';

import { createReleaseCandidate } from '../../../src/lib/services/git';
import type { IGitRunner } from '../../../src/lib/services/git';

describe('release candidate cut', () => {
	it('uses main version and preserves source/base SHAs when develop advances', async () => {
		let developSha = '1111111';
		const commands: readonly string[][] = [];
		const run: IGitRunner = async (args) => {
			(commands as string[][]).push([...args]);
			if (args[0] === 'rev-parse' && args[1] === 'develop')
				return { ok: true, output: `${developSha}\n` };
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
