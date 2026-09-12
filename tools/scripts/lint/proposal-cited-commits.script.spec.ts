/**
 * proposal-cited-commits.script.spec.ts — x00153 S4.
 *
 * Unit tests for the pure functions. The CLI wrapper is exercised
 * separately (manual run + JSON output inspection).
 */
import { describe, expect, it } from 'vitest';

import {
	applyBaseline,
	commitExists,
	extractCitedHashes,
	findOrphanHashes,
	type IBaseline,
} from './proposal-cited-commits.script';

describe('extractCitedHashes', () => {
	it('returns every backticked hex string with its 1-based line', () => {
		const md = [
			'# x',
			'cites `3fbb19bd` here',
			'and `ac33a462` plus `be6a505c` on the same line',
			'',
			'also `f14456a8` on its own line',
		].join('\n');
		const hits = extractCitedHashes(md).map((h) => `${h.hash}@${h.line}`);
		expect(hits).toEqual([
			'3fbb19bd@2',
			'ac33a462@3',
			'be6a505c@3',
			'f14456a8@5',
		]);
	});

	it('skips non-hex backticks and short hex', () => {
		const md = '`abc` `1234567` `notahexbut7chars` `f00` `f00ba7cafe`';
		const hits = extractCitedHashes(md).map((h) => h.hash);
		expect(hits).toEqual(['1234567', 'f00ba7cafe']);
	});

	it('skips proposal ids that resemble short commit hashes', () => {
		const md = 'proposal `f00067a` and commit `3fbb19bd`';
		const hits = extractCitedHashes(md).map((h) => h.hash);
		expect(hits).toEqual(['3fbb19bd']);
	});

	it('skips numeric CI run ids', () => {
		const md = 'run `33076654689` and commit `3fbb19bd`';
		const hits = extractCitedHashes(md).map((h) => h.hash);
		expect(hits).toEqual(['3fbb19bd']);
	});

	it('returns empty for prose with no citations', () => {
		expect(extractCitedHashes('hello world, no backticks here')).toEqual(
			[],
		);
	});

	it('lowercases the hash so the baseline can compare case-insensitively', () => {
		const md = 'cites `ABCDEF0`';
		const hits = extractCitedHashes(md);
		expect(hits[0]?.hash).toBe('abcdef0');
	});
});

describe('commitExists', () => {
	const REACHABLE = 'a'.repeat(40);
	const DANGLING = 'b'.repeat(40);

	/**
	 * A git stub that distinguishes the two questions the real fix turns
	 * on: `rev-parse` answers "is this object in the store" (dangling
	 * objects included), `rev-list --all` answers "what is published".
	 */
	const stubGit =
		(store: Record<string, string>) =>
		(args: readonly string[]): { stdout: string; status: number } => {
			if (args[0] === 'rev-list')
				return { stdout: `${REACHABLE}\n`, status: 0 };
			const target = (args[args.length - 1] ?? '').replace(
				'^{commit}',
				'',
			);
			const full = store[target];
			return full === undefined
				? { stdout: '', status: 1 }
				: { stdout: `${full}\n`, status: 0 };
		};

	it('accepts a commit reachable from a ref', () => {
		expect(commitExists('aaaaaaa', stubGit({ aaaaaaa: REACHABLE }))).toBe(
			true,
		);
	});

	it('rejects a DANGLING object that only exists locally', () => {
		// The regression this whole change exists for: a rebased-away
		// commit survives in the author's object store for weeks, so
		// `cat-file` said yes on their machine and no in CI. A citation
		// nobody else can follow is not a citation.
		expect(commitExists('bbbbbbb', stubGit({ bbbbbbb: DANGLING }))).toBe(
			false,
		);
	});

	it('rejects a hash git cannot resolve at all', () => {
		expect(commitExists('abc1234', stubGit({}))).toBe(false);
	});

	it('rejects a zero-exit answer that is not a full object id', () => {
		const weird = (args: readonly string[]) =>
			args[0] === 'rev-list'
				? { stdout: `${REACHABLE}\n`, status: 0 }
				: { stdout: '', status: 0 };
		expect(commitExists('abc1234', weird)).toBe(false);
	});

	it('reuses a precomputed reachable set instead of re-walking', () => {
		const calls: string[] = [];
		const counting = (args: readonly string[]) => {
			calls.push(args[0] ?? '');
			return { stdout: `${REACHABLE}\n`, status: 0 };
		};
		commitExists('aaaaaaa', counting, new Set([REACHABLE]));
		expect(calls).toEqual(['rev-parse']);
	});
});

describe('findOrphanHashes', () => {
	it('finds orphan hashes in done/feats', async () => {
		const CAFEBABE = `cafebabe${'0'.repeat(32)}`;
		const stubGit = (
			args: readonly string[],
		): { stdout: string; status: number } => {
			// Only `cafebabe` is published; everything else is an orphan.
			if (args[0] === 'rev-list')
				return { stdout: `${CAFEBABE}\n`, status: 0 };
			const hash = (args[args.length - 1] ?? '').replace('^{commit}', '');
			return hash === 'cafebabe'
				? { stdout: `${CAFEBABE}\n`, status: 0 }
				: { stdout: '', status: 1 };
		};
		const dir = `/tmp/proposal-cited-commits-test-${Date.now()}`;
		const fakeDone = joinFor(dir, 'done', 'feats');
		await import('node:fs/promises').then((fs) =>
			fs.mkdir(fakeDone, { recursive: true }),
		);
		await import('node:fs/promises').then((fs) =>
			fs.writeFile(
				joinFor(fakeDone, 'fake.md'),
				'# fake\ncites `3fbb19bd` and `cafebabe`\n',
				'utf8',
			),
		);
		const verdict = await findOrphanHashes(dir, ['done/feats'], stubGit);
		expect(verdict.orphans).toHaveLength(1);
		expect(verdict.orphans[0]?.hash).toBe('3fbb19bd');
		expect(verdict.orphans[0]?.proposalRelPath).toContain('fake.md');
		expect(verdict.checked).toBe(2);
		// Cleanup
		await import('node:fs/promises').then((fs) =>
			fs.rm(dir, { recursive: true, force: true }),
		);
	});

	it('returns empty when no proposals exist', async () => {
		const dir = `/tmp/proposal-cited-commits-empty-${Date.now()}`;
		await import('node:fs/promises').then((fs) =>
			fs.mkdir(dir, { recursive: true }),
		);
		const verdict = await findOrphanHashes(
			dir,
			['done/nonexistent'],
			() => ({ stdout: 'commit', status: 0 }),
		);
		expect(verdict.orphans).toEqual([]);
		expect(verdict.checked).toBe(0);
		await import('node:fs/promises').then((fs) =>
			fs.rm(dir, { recursive: true, force: true }),
		);
	});
});

describe('applyBaseline', () => {
	const baseline: IBaseline = {
		orphans: [
			{
				hash: 'knownaaa',
				proposals: ['done/feats/fake.md'],
				status: 'known-orphan',
				expectedResolution: 'amend on next close',
				recordedAt: '2026-07-26T00:00:00Z',
			},
		],
	};

	it('suppresses orphans already in the baseline', () => {
		const orphans = [
			{
				hash: 'knownaaa',
				proposalRelPath: 'done/feats/fake.md',
				line: 1,
			},
		];
		expect(applyBaseline(orphans, baseline)).toEqual([]);
	});

	it('keeps orphans not in the baseline (new orphans)', () => {
		const orphans = [
			{ hash: 'newbbb', proposalRelPath: 'done/feats/other.md', line: 5 },
		];
		const result = applyBaseline(orphans, baseline);
		expect(result).toHaveLength(1);
		expect(result[0]?.hash).toBe('newbbb');
	});

	it('mixes known + new correctly', () => {
		const orphans = [
			{
				hash: 'knownaaa',
				proposalRelPath: 'done/feats/fake.md',
				line: 1,
			},
			{ hash: 'newbbb', proposalRelPath: 'done/feats/other.md', line: 5 },
		];
		const result = applyBaseline(orphans, baseline);
		expect(result).toHaveLength(1);
		expect(result[0]?.hash).toBe('newbbb');
	});

	it('does not suppress same-hash-in-different-proposal', () => {
		// The baseline keys by (hash, proposal) so a hash that's
		// orphaned in proposal A but known in proposal B is still
		// reported for A.
		const orphans = [
			{
				hash: 'knownaaa',
				proposalRelPath: 'done/feats/OTHER.md',
				line: 1,
			},
		];
		const result = applyBaseline(orphans, baseline);
		expect(result).toHaveLength(1);
	});
});

// Local helper to avoid pulling `path` at top of file
const { join: joinFor } = await import('node:path');
