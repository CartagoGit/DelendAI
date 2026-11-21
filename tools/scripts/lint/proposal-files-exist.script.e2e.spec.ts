import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createGitRepoTemplate } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { scanMissingFiles } from './proposal-files-exist.script';

const PROPOSAL = 'docs/delendai/proposals/done/audits/a00098-thing.md';

const template = createGitRepoTemplate({
	files: { '.gitignore': 'local-only/\n' },
});

const writeIn = (root: string, rel: string, body: string): void => {
	mkdirSync(dirname(join(root, rel)), { recursive: true });
	writeFileSync(join(root, rel), body);
};

describe('proposal-files-exist against a real git history', () => {
	it('[<1000ms] accepts a file a later change deleted, when a shipped-in commit held it', () => {
		const repo = template.copy();
		writeIn(repo.root, 'packages/gone/src/store.ts', 'export {};');
		repo.git('add', '-A');
		repo.git('commit', '--quiet', '-m', 'ship it');
		const shipped = repo.git('rev-parse', '--short', 'HEAD');
		repo.git('rm', '--quiet', '-r', 'packages/gone');
		repo.git('commit', '--quiet', '-m', 'retire the package');
		writeIn(
			repo.root,
			'docs/delendai/proposals/review/x00001-thing.md',
			`---\nid: x00001\nshipped-in:\n  - "${shipped}"\n---\n\n` +
				'### S1 — thing\n- **Status**: done\n' +
				'- **Files**: `packages/gone/src/store.ts`, `packages/never/x.ts`\n',
		);
		repo.git('add', '-A');
		expect(
			scanMissingFiles(repo.root)[
				'docs/delendai/proposals/review/x00001-thing.md'
			],
		).toEqual(['packages/never/x.ts']);
	});

	it('[<1000ms] ignores a shipped-in commit no ref holds: CI never has it', () => {
		const repo = template.copy();
		repo.git('checkout', '--quiet', '-b', 'scratch');
		writeIn(repo.root, 'packages/lost/store.ts', 'export {};');
		repo.git('add', '-A');
		repo.git('commit', '--quiet', '-m', 'never pushed');
		const lost = repo.git('rev-parse', '--short', 'HEAD');
		repo.git('checkout', '--quiet', '-');
		repo.git('branch', '-D', 'scratch');
		writeIn(
			repo.root,
			'docs/delendai/proposals/review/x00002-thing.md',
			`---\nid: x00002\nshipped-in:\n  - "${lost}"\n---\n\n` +
				'### S1 — thing\n- **Status**: done\n' +
				'- **Files**: `packages/lost/store.ts`\n',
		);
		repo.git('add', '-A');
		expect(
			scanMissingFiles(repo.root)[
				'docs/delendai/proposals/review/x00002-thing.md'
			],
		).toEqual(['packages/lost/store.ts']);
	});

	it('[<1000ms] counts tracked files only: an ignored local file is no deliverable', () => {
		const repo = template.copy();
		writeIn(repo.root, 'local-only/notes.ts', 'export {};');
		writeIn(repo.root, PROPOSAL, '- **Files**: `local-only/notes.ts`\n');
		repo.git('add', '-A');
		expect(scanMissingFiles(repo.root)[PROPOSAL]).toEqual([
			'local-only/notes.ts',
		]);
	});
});
