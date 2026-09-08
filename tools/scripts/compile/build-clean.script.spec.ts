import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	cleanDistDirectories,
	listDistDirectories,
} from './build-clean.script';

const temporaryDirectories: string[] = [];

const makeFakeRepo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-build-clean-'));
	temporaryDirectories.push(root);
	for (const rel of ['packages/core', 'packages/state', 'plugins/env']) {
		mkdirSync(join(root, rel, 'dist', 'nested'), { recursive: true });
		writeFileSync(join(root, rel, 'dist', 'index.js'), 'stale');
		writeFileSync(join(root, rel, 'dist', 'nested', 'a.js'), 'stale');
		mkdirSync(join(root, rel, 'src'), { recursive: true });
		writeFileSync(join(root, rel, 'src', 'index.ts'), 'export {};');
	}
	mkdirSync(join(root, 'packages', 'no-dist'), { recursive: true });
	return root;
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('build:clean', () => {
	it('lists every dist/ under packages/* and plugins/*', () => {
		const root = makeFakeRepo();
		expect(listDistDirectories(root)).toEqual([
			join(root, 'packages', 'core', 'dist'),
			join(root, 'packages', 'state', 'dist'),
			join(root, 'plugins', 'env', 'dist'),
		]);
	});

	it('removes every dist/ recursively and leaves sources untouched', () => {
		const root = makeFakeRepo();
		const removed = cleanDistDirectories(root);
		expect(removed).toHaveLength(3);
		for (const distDir of removed) expect(existsSync(distDir)).toBe(false);
		expect(
			existsSync(join(root, 'packages', 'core', 'src', 'index.ts')),
		).toBe(true);
		expect(listDistDirectories(root)).toEqual([]);
	});

	it('is idempotent on an already clean tree', () => {
		const root = makeFakeRepo();
		cleanDistDirectories(root);
		expect(cleanDistDirectories(root)).toEqual([]);
	});

	it('tolerates a repository without a plugins/ group', () => {
		const root = mkdtempSync(join(tmpdir(), 'delendai-build-clean-empty-'));
		temporaryDirectories.push(root);
		mkdirSync(join(root, 'packages', 'a', 'dist'), { recursive: true });
		expect(cleanDistDirectories(root)).toEqual([
			join(root, 'packages', 'a', 'dist'),
		]);
	});
});
