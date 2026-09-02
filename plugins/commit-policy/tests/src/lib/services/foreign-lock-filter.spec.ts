import { describe, expect, it } from 'vitest';

import {
	buildForeignLockRefusal,
	filterForeignLockedFiles,
} from '../../../../src/lib/services/foreign-lock-filter';

import type { IForeignLockHolding } from '../../../../src/lib/contracts/foreign-lock';

const provider =
	(holdings: readonly IForeignLockHolding[]) =>
	async (): Promise<readonly IForeignLockHolding[]> =>
		holdings;

describe('filterForeignLockedFiles', () => {
	it('is a no-op when no provider is wired', async () => {
		// A host running commit-policy without the proposals plugin is a
		// supported configuration and must behave exactly as before.
		const result = await filterForeignLockedFiles({
			files: ['a.ts', 'b.ts'],
			selfAgent: 'me',
			provider: undefined,
		});
		expect(result.files).toEqual(['a.ts', 'b.ts']);
		expect(result.withheld).toEqual([]);
	});

	it('withholds only the files another agent holds', async () => {
		const result = await filterForeignLockedFiles({
			files: ['mine.ts', 'theirs.ts', 'also-mine.ts'],
			selfAgent: 'me',
			provider: provider([
				{ file: 'theirs.ts', agent: 'other', taskId: 'f00001-S1' },
			]),
		});
		expect(result.files).toEqual(['mine.ts', 'also-mine.ts']);
		expect(result.withheld).toHaveLength(1);
	});

	it('matches paths regardless of a ./ prefix', async () => {
		const result = await filterForeignLockedFiles({
			files: ['./src/a.ts'],
			selfAgent: 'me',
			provider: provider([
				{ file: 'src/a.ts', agent: 'other', taskId: 't' },
			]),
		});
		expect(result.files).toEqual([]);
		expect(result.withheld).toHaveLength(1);
	});

	it('commits everything when the provider throws', async () => {
		// An advisory read must never cost the commit. Failing open here
		// is the same behaviour as having no provider at all.
		const result = await filterForeignLockedFiles({
			files: ['a.ts'],
			selfAgent: 'me',
			provider: async () => {
				throw new Error('lock file unreadable');
			},
		});
		expect(result.files).toEqual(['a.ts']);
		expect(result.withheld).toEqual([]);
	});
});

describe('buildForeignLockRefusal', () => {
	it('names a holder and their task so the caller can wait on it', async () => {
		// "Nothing to commit" with no reason is how an agent concludes
		// its work vanished and starts over.
		const refusal = buildForeignLockRefusal([
			{ file: 'src/a.ts', agent: 'agent-b', taskId: 'f00002-S3' },
			{ file: 'src/b.ts', agent: 'agent-b', taskId: 'f00002-S3' },
		]);
		expect(refusal).toContain('FOREIGN_LOCK_HELD');
		expect(refusal).toContain('src/a.ts');
		expect(refusal).toContain('agent-b');
		expect(refusal).toContain('f00002-S3');
		expect(refusal).toContain('+1 more');
		expect(refusal).toContain('await_lock');
	});
});
