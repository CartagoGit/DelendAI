import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fsRead, fsWrite } from '@mcp-vertex/core/lib/shared/fs-tools';
import * as atomicWrite from '@mcp-vertex/core/lib/shared/atomic-write';
import * as fileMutex from '@mcp-vertex/core/lib/shared/with-file-mutex';

describe('fsRead / fsWrite', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'fs-tools-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('reads a file in full', async () => {
		writeFileSync(join(root, 'a.txt'), 'line1\nline2\nline3', 'utf8');
		const result = await fsRead(root, 'a.txt');
		expect(result.found).toBe(true);
		expect(result.content).toBe('line1\nline2\nline3');
		expect(result.totalLines).toBe(3);
		expect(result.range).toBeNull();
	});

	it('reads only the requested 1-indexed inclusive line range', async () => {
		writeFileSync(join(root, 'b.txt'), 'l1\nl2\nl3\nl4\nl5', 'utf8');
		const result = await fsRead(root, 'b.txt', [2, 4]);
		expect(result.found).toBe(true);
		expect(result.content).toBe('l2\nl3\nl4');
		expect(result.range).toEqual([2, 4]);
		expect(result.totalLines).toBe(5);
	});

	it('writes a simple file', async () => {
		const result = await fsWrite(root, 'out.txt', 'hello');
		expect(result.ok).toBe(true);
		expect(readFileSync(join(root, 'out.txt'), 'utf8')).toBe('hello');
	});

	it('creates parent directories with createDirs:true', async () => {
		const result = await fsWrite(root, 'nested/dir/out.txt', 'hi', {
			createDirs: true,
		});
		expect(result.ok).toBe(true);
		expect(existsSync(join(root, 'nested/dir/out.txt'))).toBe(true);
	});

	it('atomic:true routes the write through writeFileAtomic + withFileMutex', async () => {
		const mutexSpy = vi.spyOn(fileMutex, 'withFileMutex');
		const atomicSpy = vi.spyOn(atomicWrite, 'writeFileAtomic');
		const result = await fsWrite(root, 'atomic.txt', 'data', {
			atomic: true,
		});
		expect(result.ok).toBe(true);
		expect(mutexSpy).toHaveBeenCalled();
		expect(atomicSpy).toHaveBeenCalled();
		mutexSpy.mockRestore();
		atomicSpy.mockRestore();
	});

	it('rejects a path that escapes the workspace via ../', async () => {
		const readResult = await fsRead(root, '../outside.txt');
		expect(readResult.found).toBe(false);

		const writeResult = await fsWrite(root, '../outside.txt', 'nope');
		expect(writeResult.ok).toBe(false);
		expect(writeResult.error).toContain('escapes workspace');
		expect(existsSync(join(root, '..', 'outside.txt'))).toBe(false);
	});
});
