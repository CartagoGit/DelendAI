/**
 * git-file-origin.spec.ts — against a real repository, because the
 * whole question is what git reports.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	gitFileOrigin,
	parseOriginLine,
} from '../../scripts/lib/git-file-origin';

let repo: string;

const IDENTITY = {
	GIT_AUTHOR_NAME: 't',
	GIT_AUTHOR_EMAIL: 't@t',
	GIT_COMMITTER_NAME: 't',
	GIT_COMMITTER_EMAIL: 't@t',
};

const git = (...args: string[]): string =>
	execFileSync('git', args, {
		cwd: repo,
		encoding: 'utf8',
		env: { ...process.env, ...IDENTITY },
	}).trim();

const commitAt = (message: string, date: string): void => {
	execFileSync('git', ['commit', '--quiet', '--no-verify', '-m', message], {
		cwd: repo,
		env: {
			...process.env,
			...IDENTITY,
			GIT_AUTHOR_DATE: date,
			GIT_COMMITTER_DATE: date,
		},
	});
};

beforeEach(() => {
	repo = mkdtempSync(join(tmpdir(), 'git-file-origin-'));
	git('init', '--quiet');
});

afterEach(() => {
	rmSync(repo, { recursive: true, force: true });
});

describe('gitFileOrigin', () => {
	it('reports the commit and date that first added a file', () => {
		writeFileSync(join(repo, 'a.ts'), '1');
		git('add', 'a.ts');
		commitAt('add a', '2026-06-01T10:00:00Z');
		writeFileSync(join(repo, 'a.ts'), '2');
		git('add', 'a.ts');
		commitAt('edit a', '2026-09-01T10:00:00Z');

		const origin = gitFileOrigin(repo, 'a.ts');

		expect(origin?.date).toBe('2026-06-01');
		expect(origin?.sha).toBe(git('rev-list', '--max-parents=0', 'HEAD'));
	});

	it('follows a rename back to the original creation only when asked', () => {
		writeFileSync(
			join(repo, 'old.ts'),
			'content that is long enough to follow\n',
		);
		git('add', 'old.ts');
		commitAt('add old', '2026-06-01T10:00:00Z');
		git('mv', 'old.ts', 'new.ts');
		commitAt('rename', '2026-09-01T10:00:00Z');

		expect(gitFileOrigin(repo, 'new.ts')?.date).toBe('2026-09-01');
		expect(gitFileOrigin(repo, 'new.ts', { follow: true })?.date).toBe(
			'2026-06-01',
		);
	});

	it('knows nothing of an untracked file in a repository with history', () => {
		// With history, so `git log` SUCCEEDS and prints nothing — the
		// case a repository with no commits at all never reaches, because
		// there `git log` fails outright.
		writeFileSync(join(repo, 'tracked.ts'), '1');
		git('add', 'tracked.ts');
		commitAt('add tracked', '2026-06-01T10:00:00Z');
		writeFileSync(join(repo, 'loose.ts'), 'x');

		expect(gitFileOrigin(repo, 'loose.ts')).toBeUndefined();
	});

	it('knows nothing in a repository with no commits yet', () => {
		writeFileSync(join(repo, 'loose.ts'), 'x');
		expect(gitFileOrigin(repo, 'loose.ts')).toBeUndefined();
	});

	it('knows nothing outside a repository', () => {
		const bare = mkdtempSync(join(tmpdir(), 'not-a-repo-'));
		try {
			expect(gitFileOrigin(bare, 'x.ts')).toBeUndefined();
		} finally {
			rmSync(bare, { recursive: true, force: true });
		}
	});
});

describe('parseOriginLine', () => {
	it('reads a sha and an ISO author date', () => {
		expect(
			parseOriginLine(
				'0123456789abcdef0123456789abcdef01234567 2026-09-08T10:11:12+02:00',
			),
		).toEqual({
			sha: '0123456789abcdef0123456789abcdef01234567',
			iso: '2026-09-08T10:11:12+02:00',
			date: '2026-09-08',
		});
	});

	it('refuses anything that is not exactly that', () => {
		for (const line of [
			'',
			'abc',
			'0123456 not-a-date',
			'2026-09-08T10:11:12Z',
		]) {
			expect(parseOriginLine(line)).toBeUndefined();
		}
	});
});
