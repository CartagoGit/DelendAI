/**
 * f00131 S2.a — infer-bump unit tests.
 *
 * Coverage:
 * - empty list → none
 * - docs-only → none
 * - fix → patch
 * - feat → minor
 * - perf → patch
 * - breaking → major (highest priority wins)
 * - multiple commits: first applicable rule wins; major still wins over minor + patch
 * - deterministic ordering: commits are walked in input order
 */
import { describe, expect, it } from 'vitest';

import type { IConventionalCommit } from '../render';

import { inferBump } from './infer-bump';

const cc = (overrides: Partial<IConventionalCommit>): IConventionalCommit => ({
	type: 'chore',
	subject: 'noop',
	breaking: false,
	hash: 'deadbee',
	...overrides,
});

describe('f00131 S2.a infer-bump', () => {
	it('returns none for an empty commit list', () => {
		expect(inferBump([])).toEqual({
			kind: 'none',
			reason: 'no commits in range',
			considered: 0,
		});
	});

	it('returns none for docs-only commits', () => {
		expect(
			inferBump([cc({ type: 'docs', subject: 'fix typo' })]).kind,
		).toBe('none');
	});

	it('returns patch for a fix commit', () => {
		const out = inferBump([
			cc({ type: 'fix', subject: 'crash on import', hash: 'a1b2c3d' }),
		]);
		expect(out.kind).toBe('patch');
		expect(out.reason).toMatch(
			/^patch commit detected in a1b2c3d \(.crash on import.\)/,
		);
		expect(out.considered).toBe(1);
	});

	it('returns minor for a feat commit', () => {
		const out = inferBump([
			cc({ type: 'feat', subject: 'add api_mock tool', hash: 'f00ba7' }),
		]);
		expect(out.kind).toBe('minor');
		expect(out.reason).toMatch(/feature commit detected in f00ba7/);
	});

	it('returns patch for a perf commit', () => {
		expect(
			inferBump([cc({ type: 'perf', subject: 'cache parser' })]).kind,
		).toBe('patch');
	});

	it('returns major for a breaking commit', () => {
		const out = inferBump([
			cc({
				type: 'feat',
				subject: 'redesign public surface',
				hash: 'feedface',
				breaking: true,
			}),
		]);
		expect(out.kind).toBe('major');
		expect(out.reason).toMatch(/breaking change detected in feedface/);
	});

	it('major beats minor + patch when both are present', () => {
		const commits = [
			cc({ type: 'feat', subject: 'new api', hash: '1111111' }),
			cc({ type: 'fix', subject: 'old bug', hash: '2222222' }),
			cc({
				type: 'feat',
				subject: 'breaking redesign',
				hash: '3333333',
				breaking: true,
			}),
		];
		expect(inferBump(commits).kind).toBe('major');
	});

	it('minor beats patch when both are present', () => {
		const commits = [
			cc({ type: 'fix', subject: 'a fix', hash: '4444444' }),
			cc({ type: 'feat', subject: 'a feat', hash: '5555555' }),
			cc({ type: 'perf', subject: 'a perf', hash: '6666666' }),
		];
		expect(inferBump(commits).kind).toBe('minor');
	});

	it('patch beats none when both are present', () => {
		const commits = [
			cc({ type: 'docs', subject: 'readme', hash: '7777777' }),
			cc({ type: 'fix', subject: 'bug', hash: '8888888' }),
		];
		expect(inferBump(commits).kind).toBe('patch');
	});

	it('first matching rule wins (input-order semantics)', () => {
		// Two feats + one breaking. The breaking commit comes first
		// so the result references the breaking hash.
		const commits = [
			cc({
				type: 'feat',
				subject: 'redesign',
				hash: 'aaaaaaa',
				breaking: true,
			}),
			cc({ type: 'feat', subject: 'feature 2', hash: 'bbbbbbb' }),
		];
		const out = inferBump(commits);
		expect(out.kind).toBe('major');
		expect(out.reason).toMatch(/breaking change detected in aaaaaaa/);
	});
});
