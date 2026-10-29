/**
 * selectors.spec.ts — a repository or issue selector has GitHub's shape
 * before it reaches gh or an API path.
 */
import { describe, expect, it } from 'vitest';

import {
	GITHUB_NUMBER_SCHEMA,
	GITHUB_OWNER_SCHEMA,
	GITHUB_REPOSITORY_SCHEMA,
} from '../../../src/lib/contracts/constants/github-selectors.constant';

const ok =
	(schema: { safeParse(v: unknown): { success: boolean } }) =>
	(value: unknown) =>
		schema.safeParse(value).success;

describe('github selectors', () => {
	it('accepts owners and repositories GitHub allows', () => {
		expect(['CartagoGit', 'a-b', 'x1'].every(ok(GITHUB_OWNER_SCHEMA))).toBe(
			true,
		);
		expect(
			['DelendAI', 'my.repo', 'a_b-c'].every(
				ok(GITHUB_REPOSITORY_SCHEMA),
			),
		).toBe(true);
	});

	it('refuses what walks the path or reads as an option', () => {
		expect(['../..', '-x', 'a/b', ''].some(ok(GITHUB_OWNER_SCHEMA))).toBe(
			false,
		);
		expect(
			['..', '.', 'a/b', '../x'].some(ok(GITHUB_REPOSITORY_SCHEMA)),
		).toBe(false);
	});

	it('takes an issue as a number or #n, nothing else', () => {
		expect([12, '12', '#12'].every(ok(GITHUB_NUMBER_SCHEMA))).toBe(true);
		expect(
			['1/comments', '-1', '0', 'abc', 0].some(ok(GITHUB_NUMBER_SCHEMA)),
		).toBe(false);
	});
});
