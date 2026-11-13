import { describe, expect, it } from 'vitest';

import {
	chooseSelectionBase,
	type IProofGitReader,
	type IProvedCommit,
	livingProofs,
	MAX_PROVED_CANDIDATES,
	parseProofStore,
	recordProof,
	serializeProofStore,
} from './proved-ancestors';

const proof = (
	commit: string,
	scope: IProvedCommit['scope'] = 'fast',
): IProvedCommit => ({
	commit,
	tree: `tree-${commit}`,
	base: 'mergebase0',
	scope,
	at: '2026-11-13T00:00:00.000Z',
});

/** A repository in memory: each commit's file count against HEAD. */
const reader = (
	files: Record<string, number>,
	ancestors: readonly string[],
): IProofGitReader => ({
	exists: (commit) => commit in files,
	isAncestorOfHead: (commit) => ancestors.includes(commit),
	changedFileCount: (commit) => files[commit] ?? 0,
});

describe('chooseSelectionBase', () => {
	it('[<7ms] takes the proved ancestor that leaves fewer files', () => {
		const choice = chooseSelectionBase(
			'mergebase0',
			[proof('aaaaaaaaaaaa')],
			reader({ mergebase0: 40, aaaaaaaaaaaa: 3 }, ['aaaaaaaaaaaa']),
		);
		expect(choice).toMatchObject({
			base: 'aaaaaaaaaaaa',
			proved: true,
			files: 3,
		});
		expect(choice.message).toBe(
			'proved ancestor aaaaaaaaa (3 files) instead of develop merge-base (40 files)',
		);
	});

	it('[<7ms] keeps the merge base on a tie, and says why', () => {
		const choice = chooseSelectionBase(
			'mergebase0',
			[proof('aaaaaaaaaaaa')],
			reader({ mergebase0: 5, aaaaaaaaaaaa: 5 }, ['aaaaaaaaaaaa']),
		);
		expect(choice.base).toBe('mergebase0');
		expect(choice.message).toContain('no proved ancestor leaves fewer');
	});

	it('[<7ms] ignores a proved commit that is not an ancestor of HEAD', () => {
		const choice = chooseSelectionBase(
			'mergebase0',
			[proof('bbbbbbbbbbbb')],
			reader({ mergebase0: 9, bbbbbbbbbbbb: 0 }, []),
		);
		expect(choice.base).toBe('mergebase0');
	});

	it('[<7ms] picks the closest of several ancestors', () => {
		const choice = chooseSelectionBase(
			'mergebase0',
			[proof('aaaaaaaaaaaa'), proof('cccccccccccc')],
			reader({ mergebase0: 30, aaaaaaaaaaaa: 12, cccccccccccc: 2 }, [
				'aaaaaaaaaaaa',
				'cccccccccccc',
			]),
		);
		expect(choice.base).toBe('cccccccccccc');
	});

	it('[<7ms] looks at the 20 most recent records only', () => {
		const proofs = Array.from(
			{ length: MAX_PROVED_CANDIDATES + 1 },
			(_, i) => proof(`c${String(i)}`),
		);
		const files = Object.fromEntries(
			proofs.map((each, i) => [each.commit, i === 20 ? 0 : 50]),
		);
		const choice = chooseSelectionBase(
			'mergebase0',
			proofs,
			reader({ mergebase0: 60, ...files }, Object.keys(files)),
		);
		expect(choice.files).toBe(50);
		expect(choice.base).not.toBe('c20');
	});

	it('[<7ms] lets a fast proof trust a full one but not the reverse', () => {
		const git = reader({ mergebase0: 9, aaaaaaaaaaaa: 1 }, [
			'aaaaaaaaaaaa',
		]);
		const full = [proof('aaaaaaaaaaaa', 'full')];
		expect(chooseSelectionBase('mergebase0', full, git).proved).toBe(true);
		expect(
			chooseSelectionBase('mergebase0', [proof('aaaaaaaaaaaa')], git, [
				'full',
			]).proved,
		).toBe(false);
	});
});

describe('the proof store', () => {
	it('[<7ms] round-trips and ignores what is not a record', () => {
		const text = serializeProofStore([proof('aaaaaaaaaaaa')]);
		expect(parseProofStore(text)).toEqual([proof('aaaaaaaaaaaa')]);
		expect(parseProofStore('not json')).toEqual([]);
		expect(parseProofStore('[{"commit":1}]')).toEqual([]);
	});

	it('[<7ms] keeps one record a commit and scope, newest first', () => {
		const first = proof('aaaaaaaaaaaa');
		const again = { ...first, at: '2026-11-14T00:00:00.000Z' };
		const proofs = recordProof(
			recordProof([proof('bbbbbbbbbbbb')], first),
			again,
		);
		expect(proofs.map((each) => each.commit)).toEqual([
			'aaaaaaaaaaaa',
			'bbbbbbbbbbbb',
		]);
		expect(proofs[0]?.at).toBe(again.at);
	});

	it('[<7ms] prunes the records whose commit no longer exists', () => {
		const { kept, pruned } = livingProofs(
			[proof('aaaaaaaaaaaa'), proof('gone')],
			{ exists: (commit) => commit !== 'gone' },
		);
		expect(kept.map((each) => each.commit)).toEqual(['aaaaaaaaaaaa']);
		expect(pruned).toBe(1);
	});
});
