import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	NO_LOCKFILE_CACHE_KEY,
	vitestModuleCachePath,
} from './vitest-cache-key.helper';

const roots: string[] = [];
const workspace = (lock?: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'vitest-cache-key-'));
	roots.push(root);
	mkdirSync(root, { recursive: true });
	if (lock !== undefined) writeFileSync(join(root, 'bun.lock'), lock);
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe('vitest module cache path', () => {
	it('[<100ms] gives the same directory to the same lockfile content', () => {
		const a = vitestModuleCachePath(workspace('lock one'));
		const b = vitestModuleCachePath(workspace('lock one'));
		expect(basename(a)).toBe(basename(b));
		expect(basename(a)).toMatch(/^[0-9a-f]{16}$/);
	});

	it('[<100ms] gives a changed lockfile a different directory under the shared cache root', () => {
		const root = workspace('lock one');
		const before = vitestModuleCachePath(root);
		writeFileSync(join(root, 'bun.lock'), 'lock two');
		const after = vitestModuleCachePath(root);
		expect(after).not.toBe(before);
		expect(
			after.startsWith(join(root, 'node_modules', '.vitest-cache')),
		).toBe(true);
	});

	it('[<100ms] falls back to a fixed key when there is no lockfile', () => {
		expect(basename(vitestModuleCachePath(workspace()))).toBe(
			NO_LOCKFILE_CACHE_KEY,
		);
	});
});
