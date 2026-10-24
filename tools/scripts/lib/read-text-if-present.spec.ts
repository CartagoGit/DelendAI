import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readRegularFile, readTextIfPresent } from './read-text-if-present';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
const dir = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'read-once-'));
	roots.push(root);
	return root;
};

describe('readTextIfPresent', () => {
	it('reads a file, and says nothing is there when it is not', () => {
		const root = dir();
		writeFileSync(join(root, 'a.txt'), 'hello');
		expect(readTextIfPresent(join(root, 'a.txt'))).toBe('hello');
		expect(readTextIfPresent(join(root, 'missing.txt'))).toBeUndefined();
	});

	it('still reports a failure that is not a missing file', () => {
		const root = dir();
		mkdirSync(join(root, 'folder'));
		expect(() => readTextIfPresent(join(root, 'folder'))).toThrow();
	});
});

describe('readRegularFile', () => {
	it('reads a regular file and nothing else', () => {
		const root = dir();
		writeFileSync(join(root, 'a.txt'), 'hello');
		mkdirSync(join(root, 'folder'));
		symlinkSync(join(root, 'a.txt'), join(root, 'link.txt'));
		expect(readRegularFile(join(root, 'a.txt'))).toBe('hello');
		expect(readRegularFile(join(root, 'folder'))).toBeUndefined();
		expect(readRegularFile(join(root, 'missing.txt'))).toBeUndefined();
		expect(readRegularFile(join(root, 'link.txt'))).toBeUndefined();
	});
});
