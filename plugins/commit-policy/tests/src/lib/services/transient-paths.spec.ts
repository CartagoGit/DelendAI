import { describe, expect, it } from 'vitest';

import { isTransientWorkspacePath } from '../../../../src/lib/services/git-extra';

describe('isTransientWorkspacePath', () => {
	it('excludes the mutex files withFileMutex creates and deletes', () => {
		// Observed live: a snapshot commit ran inside a mutex's lifetime,
		// staged the `.mutex` sibling, and by the time `git add` ran the
		// file was gone — so the whole commit failed with
		// `pathspec '...mutex' did not match any files` and a real batch
		// of finished work was lost to a file nobody meant to commit.
		expect(
			isTransientWorkspacePath(
				'docs/mcp-vertex/proposals/review/f00339-utility-per-1k.md.mutex',
			),
		).toBe(true);
	});

	it('excludes atomic-write temp files', () => {
		expect(isTransientWorkspacePath('src/a.ts.tmp-abc123')).toBe(true);
	});

	it('excludes anything inside .git', () => {
		expect(isTransientWorkspacePath('.git/index.lock')).toBe(true);
	});

	it('KEEPS bun.lock and package-lock.json', () => {
		// These are real committable files. Excluding every `.lock` would
		// quietly stop dependency changes from ever being committed — a
		// far worse bug than the one this filter fixes.
		expect(isTransientWorkspacePath('bun.lock')).toBe(false);
		expect(isTransientWorkspacePath('package-lock.json')).toBe(false);
		expect(isTransientWorkspacePath('apps/web/bun.lock')).toBe(false);
	});

	it('keeps ordinary source and doc files', () => {
		expect(isTransientWorkspacePath('src/index.ts')).toBe(false);
		expect(isTransientWorkspacePath('docs/a.md')).toBe(false);
		// A file merely *named* like one, but not with the suffix.
		expect(isTransientWorkspacePath('src/mutex-helper.ts')).toBe(false);
	});
});
