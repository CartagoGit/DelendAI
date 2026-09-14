/**
 * development-policy-evidence.spec.ts — which forge a remote names.
 *
 * The classification decides which governance a migrated workspace is
 * given, and it used to be a substring test over the whole URL. A
 * substring is not a host: `github.com` also appears in
 * `github.com.evil.example` and in any path segment somebody names that
 * way.
 */
import { describe, expect, it } from 'vitest';

import {
	adminAnswerOf,
	forgeKindOf,
} from '../../../../src/lib/workspace-migration/migrators/development-policy-evidence';

describe('forgeKindOf', () => {
	it('answers none when there is no remote at all', () => {
		expect(forgeKindOf(undefined)).toBe('none');
	});

	describe('github', () => {
		it('recognises both shapes a git remote is written in', () => {
			expect(forgeKindOf('https://github.com/owner/repo.git')).toBe(
				'github',
			);
			expect(forgeKindOf('git@github.com:owner/repo.git')).toBe('github');
			expect(forgeKindOf('ssh://git@github.com/owner/repo.git')).toBe(
				'github',
			);
		});

		it('does not promote a subdomain to the forge itself', () => {
			// `api.github.com` is not where repositories live. The short
			// names come from one curated map in the startup seam, and a
			// host outside it keeps its hostname — which is `other` here.
			expect(forgeKindOf('https://api.github.com/owner/repo')).toBe(
				'other',
			);
		});

		it('is not fooled by a host that merely starts the same way', () => {
			expect(
				forgeKindOf('https://github.com.evil.example/owner/repo'),
			).toBe('other');
			expect(
				forgeKindOf('git@github.com.evil.example:owner/repo.git'),
			).toBe('other');
		});

		it('is not fooled by a PATH segment that names it', () => {
			expect(forgeKindOf('https://git.example.org/github.com/repo')).toBe(
				'other',
			);
		});
	});

	describe('gitlab', () => {
		it('matches the word anywhere in the host, because self-hosting', () => {
			expect(forgeKindOf('https://gitlab.com/owner/repo.git')).toBe(
				'gitlab',
			);
			expect(forgeKindOf('https://gitlab.acme.internal/owner/repo')).toBe(
				'gitlab',
			);
			expect(forgeKindOf('git@code.gitlab.acme.org:owner/repo.git')).toBe(
				'gitlab',
			);
		});

		it('stops looking at the path, which the old substring did not', () => {
			expect(forgeKindOf('https://git.example.org/gitlab/repo')).toBe(
				'other',
			);
		});
	});

	it('answers other for a forge it does not know', () => {
		expect(forgeKindOf('https://bitbucket.org/owner/repo.git')).toBe(
			'other',
		);
	});

	it('answers other for a string that is not a remote', () => {
		expect(forgeKindOf('not a url at all')).toBe('other');
		expect(forgeKindOf('')).toBe('other');
	});
});

describe('adminAnswerOf', () => {
	it('reads the two answers the forge gives', () => {
		expect(adminAnswerOf('true')).toBe(true);
		expect(adminAnswerOf('false')).toBe(false);
	});

	it('tolerates the newline `gh` leaves behind', () => {
		expect(adminAnswerOf('true\n')).toBe(true);
		expect(adminAnswerOf('  false  ')).toBe(false);
	});

	it('answers undefined for anything else, which is not "no"', () => {
		// An unauthenticated `gh`, a repository the token cannot see, or
		// a field that moved all land here. Reading them as `false`
		// would tell a migrating workspace it may not require checks
		// when nobody said so.
		expect(adminAnswerOf('')).toBeUndefined();
		expect(adminAnswerOf('null')).toBeUndefined();
		expect(adminAnswerOf('gh: command not found')).toBeUndefined();
	});
});
