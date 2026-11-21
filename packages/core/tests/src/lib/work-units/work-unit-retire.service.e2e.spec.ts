/**
 * work-unit-retire.service.e2e.spec.ts — `work retire` and `work retired`
 * refuse what is not theirs, over a throwaway clone with no forge.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '@delendai/core/lib/contracts/constants/exit-code.constant';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import { cleanUnitRepos, unitRepo } from './unit-repo.helper';

afterEach(() => {
	cleanUnitRepos();
});

const run = (root: string, args: readonly string[]) =>
	runWorkUnit([...args], {
		cwd: root,
		globals: { workspace: root, json: true, format: 'json' },
	});

describe('work retire', () => {
	it('[<3000ms] asks for a ref and a reason', async () => {
		const repo = unitRepo();
		const result = await run(repo.root, ['retire']);
		expect(result.code).not.toBe(EXIT_CODE.OK);
	});

	it('[<3000ms] refuses a branch that is neither a unit nor a stray ref', async () => {
		const repo = unitRepo();
		const result = await run(repo.root, [
			'retire',
			'--ref=develop',
			'--reason=not mine',
		]);
		expect(result.code).not.toBe(EXIT_CODE.OK);
	});

	it('[<3000ms] refuses a unit no branch of which exists', async () => {
		const repo = unitRepo();
		const result = await run(repo.root, [
			'retire',
			'--ref=delendai/wip/a/implement/x1-S1-g1/work',
			'--reason=gone',
		]);
		expect(result.code).not.toBe(EXIT_CODE.OK);
	});
});

describe('work retired', () => {
	it('[<3000ms] says so when the forge cannot be asked', async () => {
		const repo = unitRepo();
		const result = await run(repo.root, ['retired']);
		expect(result.code).not.toBe(EXIT_CODE.OK);
	});
});
