/**
 * working-state.helper.spec.ts — the "left as found" check notices every
 * way an operation can disturb uncommitted work, and nothing else.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	captureWorkingState,
	workingStateChanges,
} from '../../../src/lib/working-state.helper';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8' });

/** A repository with a staged edit, a partial stage and an untracked file. */
const messyRepo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'working-state-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'w@example.com');
	git(root, 'config', 'user.name', 'W');
	git(root, 'config', 'commit.gpgsign', 'false');
	for (const name of ['a.ts', 'b.ts', 'c.ts']) {
		writeFileSync(join(root, name), `export const ${name[0]} = 1;\n`);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
	git(root, 'add', 'a.ts');
	writeFileSync(join(root, 'b.ts'), 'export const b = 2;\n');
	git(root, 'add', 'b.ts');
	writeFileSync(join(root, 'b.ts'), 'export const b = 3;\n');
	writeFileSync(join(root, 'new.ts'), 'export {};\n');
	return root;
};

describe('workingStateChanges', () => {
	it('reports nothing when the operation left everything as found', () => {
		const root = messyRepo();
		const before = captureWorkingState(root);
		expect(before.paths.map((p) => p.path)).toEqual([
			'a.ts',
			'b.ts',
			'new.ts',
		]);
		expect(workingStateChanges(before)).toEqual([]);
	});

	it('notices uncommitted content that was rewritten', () => {
		const root = messyRepo();
		const before = captureWorkingState(root);
		writeFileSync(join(root, 'new.ts'), 'export const lost = 1;\n');
		expect(workingStateChanges(before)).toEqual([
			'new.ts: its uncommitted content changed',
		]);
	});

	it('notices a partial stage that was promoted to a full one', () => {
		const root = messyRepo();
		const before = captureWorkingState(root);
		git(root, 'add', 'b.ts');
		expect(workingStateChanges(before).join('\n')).toContain(
			'b.ts: its index entry changed',
		);
	});

	it('notices work swept into a commit it did not make', () => {
		const root = messyRepo();
		const before = captureWorkingState(root);
		git(root, 'commit', '-q', '-m', 'swept', '--', 'a.ts');
		expect(workingStateChanges(before)).toEqual([
			'a.ts: its uncommitted change was committed or discarded',
		]);
	});

	it('notices a clean file made dirty', () => {
		const root = messyRepo();
		const before = captureWorkingState(root);
		writeFileSync(join(root, 'c.ts'), 'export const c = 9;\n');
		expect(workingStateChanges(before)).toEqual([
			'c.ts: was clean, is now dirty',
		]);
	});
});
