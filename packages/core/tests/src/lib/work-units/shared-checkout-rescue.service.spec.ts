/**
 * shared-checkout-rescue.service.spec.ts — what landed in the shared
 * checkout by mistake is kept under a ref before the checkout is restored.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { rescueSharedCheckout } from '@delendai/core/lib/work-units/shared-checkout-rescue.service';

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A checkout on `develop` with one commit, and a forge to push to. */
const checkout = (withForge = true): { root: string; remote: string } => {
	const remote = mkdtempSync(join(tmpdir(), 'rescue-remote-'));
	const root = mkdtempSync(join(tmpdir(), 'rescue-'));
	dirs.push(remote, root);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.name', 'spec');
	git(root, 'config', 'user.email', 'spec@example.invalid');
	writeFileSync(join(root, 'kept.txt'), 'as it was\n');
	writeFileSync(join(root, '.gitignore'), 'ignored/\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', withForge ? remote : '/nowhere.git');
	return { root, remote };
};

const rescue = (root: string) =>
	rescueSharedCheckout({
		root,
		integration: 'develop',
		namespace: 'delendai',
		remote: 'origin',
	});

describe('rescueSharedCheckout', () => {
	it('has nothing to do in a clean checkout', () => {
		const { root } = checkout();
		expect(rescue(root)).toEqual({ outcome: 'clean', paths: [] });
	});

	it('keeps staged, unstaged and untracked changes under a ref, then restores the checkout', () => {
		const { root, remote } = checkout();
		writeFileSync(join(root, 'kept.txt'), 'edited by mistake\n');
		writeFileSync(join(root, 'staged.txt'), 'staged by mistake\n');
		git(root, 'add', 'staged.txt');
		writeFileSync(join(root, 'untracked.txt'), 'written by mistake\n');

		const result = rescue(root);

		expect(result.outcome).toBe('rescued');
		expect([...result.paths].sort()).toEqual([
			'kept.txt',
			'staged.txt',
			'untracked.txt',
		]);
		expect(result.keptAt).toMatch(
			/^refs\/delendai\/rescued\/shared-checkout-[0-9a-f]{12}$/u,
		);
		expect(result.onForge).toBe(true);
		// The checkout is as its branch tip says.
		expect(git(root, 'status', '--porcelain')).toBe('');
		expect(existsSync(join(root, 'staged.txt'))).toBe(false);
		expect(existsSync(join(root, 'untracked.txt'))).toBe(false);
		// And everything that was written is in the ref, here and on the forge.
		const keptAt = result.keptAt ?? '';
		expect(git(root, 'show', `${keptAt}:kept.txt`)).toBe(
			'edited by mistake',
		);
		expect(git(root, 'show', `${keptAt}:untracked.txt`)).toBe(
			'written by mistake',
		);
		expect(git(remote, 'show', `${keptAt}:staged.txt`)).toBe(
			'staged by mistake',
		);
		expect(git(root, 'rev-parse', `${keptAt}^`)).toBe(
			git(root, 'rev-parse', 'HEAD'),
		);
	});

	it('still rescues and restores when the forge cannot be reached, and says so', () => {
		const { root } = checkout(false);
		writeFileSync(join(root, 'untracked.txt'), 'x\n');
		const result = rescue(root);
		expect(result.outcome).toBe('rescued');
		expect(result.onForge).toBe(false);
		expect(git(root, 'show', `${result.keptAt ?? ''}:untracked.txt`)).toBe(
			'x',
		);
		expect(git(root, 'status', '--porcelain')).toBe('');
	});

	it('refuses on any branch but the integration branch, and touches nothing', () => {
		const { root } = checkout();
		git(root, 'switch', '-q', '-c', 'elsewhere');
		writeFileSync(join(root, 'mine.txt'), 'my work\n');
		const result = rescue(root);
		expect(result.outcome).toBe('refused');
		expect(result.reason).toContain('git switch develop');
		expect(existsSync(join(root, 'mine.txt'))).toBe(true);
	});
});
