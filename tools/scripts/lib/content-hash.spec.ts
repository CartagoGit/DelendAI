import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	filesUnder,
	hashOfDirectory,
	hashOfPaths,
	keyOf,
	recordedPass,
	recordPass,
} from './content-hash';

let root = '';

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'content-hash-'));
	execFileSync('git', ['init', '-q'], { cwd: root });
	writeFileSync(join(root, '.gitignore'), 'ignored/\n');
	mkdirSync(join(root, 'src'));
	writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n');
	execFileSync('git', ['add', '.'], { cwd: root });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('hashOfPaths', () => {
	it('names tracked and untracked files, never ignored ones', () => {
		writeFileSync(join(root, 'src/b.ts'), 'export const b = 2;\n');
		mkdirSync(join(root, 'ignored'));
		writeFileSync(join(root, 'ignored/c.ts'), '');
		expect(filesUnder(root, ['src', 'ignored'])).toEqual([
			'src/a.ts',
			'src/b.ts',
		]);
	});

	it('changes with an uncommitted edit, and only under its pathspecs', () => {
		const before = hashOfPaths(root, ['src']);
		writeFileSync(join(root, '.gitignore'), 'ignored/\nother/\n');
		expect(hashOfPaths(root, ['src'])).toBe(before);
		writeFileSync(join(root, 'src/a.ts'), 'export const a = 2;\n');
		expect(hashOfPaths(root, ['src'])).not.toBe(before);
	});

	it('tells a tracked file deleted in the working tree from its content', () => {
		const before = hashOfPaths(root, ['src']);
		unlinkSync(join(root, 'src/a.ts'));
		expect(hashOfPaths(root, ['src'])).not.toBe(before);
	});
});

describe('hashOfDirectory', () => {
	it('hashes the files it keeps, and nothing for a missing directory', () => {
		const out = join(root, 'out');
		expect(hashOfDirectory(out)).toBeUndefined();
		mkdirSync(join(out, 'lib'), { recursive: true });
		writeFileSync(join(out, 'lib/x.d.ts'), 'export {};\n');
		writeFileSync(join(out, 'lib/x.js'), 'export {};\n');
		const declarations = hashOfDirectory(out, (name) =>
			name.endsWith('.d.ts'),
		);
		writeFileSync(join(out, 'lib/x.js'), 'export const x = 1;\n');
		expect(hashOfDirectory(out, (name) => name.endsWith('.d.ts'))).toBe(
			declarations,
		);
		expect(hashOfDirectory(out)).not.toBe(declarations);
	});
});

describe('recordedPass', () => {
	it('reads back a pass under the same key only', () => {
		const key = keyOf({ inputs: 'a', command: 'lint' });
		expect(recordedPass(root, 'lint:x', key)).toBeUndefined();
		recordPass(root, 'lint:x', key, { output: 'o' });
		expect(recordedPass(root, 'lint:x', key)?.kept).toEqual({
			output: 'o',
		});
		expect(
			recordedPass(
				root,
				'lint:x',
				keyOf({ inputs: 'b', command: 'lint' }),
			),
		).toBeUndefined();
	});

	it('keys by named parts, so concatenations do not collide', () => {
		expect(keyOf({ a: 'bc' })).not.toBe(keyOf({ ab: 'c' }));
		expect(keyOf({ a: '1', b: '2' })).toBe(keyOf({ b: '2', a: '1' }));
	});
});
