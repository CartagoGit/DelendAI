/**
 * review-entry.service.spec.ts — a proposal enters review only in a state a
 * reviewer can act on (x00745), on a real repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { prepareReviewEntry } from '@delendai/proposals/lib/services/review-entry.service';
import { createGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository on `develop`, and a unit branch with `delivered` committed. */
const repo = (delivered: readonly string[]): string => {
	const root = mkdtempSync(join(tmpdir(), 'review-entry-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'entry@example.test');
	git(root, 'config', 'user.name', 'Entry');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(
		root,
		'switch',
		'-q',
		'-c',
		'delendai/wip/glm-5/implement/x00001-S1-g1/w',
	);
	mkdirSync(join(root, 'src'), { recursive: true });
	for (const file of delivered)
		writeFileSync(join(root, file), 'export {};\n');
	if (delivered.length > 0) {
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'feat: the work');
	}
	return root;
};

const proposal = (slices: string): string => `---
id: x00001
title: The work
kind: fix
status: in-progress
---

# x00001 — The work

## Slices

${slices}
## acceptance

- it works
`;

const slice = (id: string, files: string, extra = ''): string =>
	`### ${id} — the ${id}

- **Status**: review
- **Files**: ${files}
${extra}
`;

const entry = (root: string, markdown: string) =>
	prepareReviewEntry({
		markdown,
		workspaceRoot: root,
		run: createGitRunner(root),
		integration: 'develop',
	});

describe('handing a proposal to review', () => {
	it('records, on each slice, the commit on the branch that delivered it', async () => {
		const root = repo(['src/a.ts']);
		const delivered = git(root, 'rev-parse', 'HEAD').slice(0, 12);

		const result = await entry(root, proposal(slice('S1', '`src/a.ts`')));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.recorded).toEqual([{ slice: 'S1', commit: delivered }]);
		expect(result.markdown).toContain(`shipped-in: \`${delivered}\``);
		expect(result.markdown).toContain('\n## acceptance');
	});

	it('keeps a delivery the slice already records', async () => {
		const root = repo([]);
		writeFileSync(join(root, 'src/a.ts'), 'export {};\n');

		const result = await entry(
			root,
			proposal(slice('S1', '`src/a.ts`', '- shipped-in: `4815b2479`')),
		);

		expect(result).toMatchObject({ ok: true, recorded: [] });
	});

	it('refuses a slice nothing on the branch delivers and nothing records', async () => {
		const root = repo(['src/a.ts']);
		writeFileSync(join(root, 'src/b.ts'), 'export {};\n');

		const result = await entry(
			root,
			proposal(slice('S1', '`src/a.ts`') + slice('S2', '`src/b.ts`')),
		);

		expect(result).toMatchObject({ ok: false, code: 'undelivered-slices' });
		if (result.ok) return;
		expect(result.reason).toContain('S2');
		expect(result.reason).not.toContain('S1');
		expect(result.nextAction).toContain('shipped-in');
	});

	it('refuses declared files that do not exist', async () => {
		const root = repo(['src/a.ts']);

		const result = await entry(
			root,
			proposal(slice('S1', '`src/a.ts`, `src/missing.ts`')),
		);

		expect(result).toMatchObject({
			ok: false,
			code: 'missing-declared-files',
		});
		if (result.ok) return;
		expect(result.reason).toContain('src/missing.ts');
	});

	/**
	 * Merge, on `develop`, a publication that adds `file`, the way the forge
	 * does: a merge commit whose subject names the publication branch.
	 */
	const mergedEarlier = (
		root: string,
		unit: string,
		file: string,
	): string => {
		const current = git(root, 'branch', '--show-current');
		git(root, 'switch', '-q', 'develop');
		git(
			root,
			'switch',
			'-q',
			'-c',
			`delendai/pr/glm-5/implement/${unit}/w`,
		);
		mkdirSync(join(root, 'src'), { recursive: true });
		writeFileSync(join(root, file), 'export {};\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'feat: an earlier slice');
		git(root, 'switch', '-q', 'develop');
		git(
			root,
			'merge',
			'-q',
			'--no-ff',
			'-m',
			`Merge pull request #1 from o/delendai/pr/glm-5/implement/${unit}/w`,
			`delendai/pr/glm-5/implement/${unit}/w`,
		);
		const merge = git(root, 'rev-parse', 'HEAD').slice(0, 12);
		git(root, 'switch', '-q', current);
		git(root, 'merge', '-q', '--no-edit', 'develop');
		return merge;
	};

	it('finds a slice delivered by an earlier pull request in the merge that landed it', async () => {
		const root = repo(['src/b.ts']);
		const merge = mergedEarlier(root, 'x00001-S1-g1', 'src/a.ts');

		const result = await entry(
			root,
			proposal(slice('S1', '`src/a.ts`') + slice('S2', '`src/b.ts`')),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.recorded).toContainEqual({ slice: 'S1', commit: merge });
	});

	it('finds a slice delivered with its whole proposal', async () => {
		const root = repo(['src/b.ts']);
		const merge = mergedEarlier(root, 'x00001-all-g1', 'src/a.ts');

		const result = await entry(
			root,
			proposal(slice('S1', '`src/a.ts`') + slice('S2', '`src/b.ts`')),
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.recorded).toContainEqual({ slice: 'S1', commit: merge });
	});

	it('does not take a merge that names the slice but changed none of its files', async () => {
		const root = repo(['src/b.ts']);
		mergedEarlier(root, 'x00001-S1-g1', 'src/other.ts');
		writeFileSync(join(root, 'src/a.ts'), 'export {};\n');

		const result = await entry(
			root,
			proposal(slice('S1', '`src/a.ts`') + slice('S2', '`src/b.ts`')),
		);

		expect(result).toMatchObject({ ok: false, code: 'undelivered-slices' });
	});
});
