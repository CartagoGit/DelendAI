import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	buildFsToolRegistrations,
	fsRead,
	fsWrite,
} from '@mcp-vertex/core/lib/shared/fs-tools';
import * as atomicWrite from '@mcp-vertex/core/lib/shared/atomic-write';
import * as fileMutex from '@mcp-vertex/core/lib/shared/with-file-mutex';

describe('fsRead / fsWrite', async () => {
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

/**
 * r00003 S3 (F-003, L + I): the PUBLIC `fs_write` tool must not expose
 * `atomic`. Durability is not a switch a caller can flip off through the
 * tool surface — a public `atomic:false` would be a write variant that
 * silently breaks crash/concurrency safety (LSP). The internal `fsWrite`
 * keeps `atomic` for boot-time callers; the tool strips it and rejects a
 * stray `atomic` with a structured invalid-argument error.
 */
describe('fs_write public tool surface (F-003)', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'fs-tools-pub-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	type ToolHandler = (args: Record<string, unknown>) => Promise<{
		structuredContent?: Record<string, unknown>;
		isError?: boolean;
	}>;

	const captureFsWrite = async (): Promise<{
		handler: ToolHandler;
		inputShape: Record<string, unknown>;
	}> => {
		let handler: ToolHandler | undefined;
		let inputShape: Record<string, unknown> = {};
		const fakeServer = {
			registerTool(
				name: string,
				config: { inputSchema?: { shape?: Record<string, unknown> } },
				fn: ToolHandler,
			) {
				if (name.endsWith('_fs_write')) {
					handler = fn;
					inputShape = config.inputSchema?.shape ?? {};
				}
			},
		};
		const regs = buildFsToolRegistrations({
			namespacePrefix: 'mcp',
			workspaceRootAbs: root,
		});
		const write = regs.find((r) => r.id === 'fs_write');
		await write?.register(
			fakeServer as unknown as Parameters<typeof write.register>[0],
		);
		if (!handler) throw new Error('fs_write did not register a handler');
		return { handler, inputShape };
	};

	it('does NOT declare `atomic` in the input schema', async () => {
		const { inputShape } = await captureFsWrite();
		expect(Object.keys(inputShape).sort()).toEqual([
			'content',
			'createDirs',
			'path',
		]);
		expect(inputShape).not.toHaveProperty('atomic');
	});

	it('returns a structured invalid-argument error when `atomic` is passed', async () => {
		const { handler } = await captureFsWrite();
		const result = await handler({
			path: 'x.txt',
			content: 'data',
			atomic: false,
		});
		expect(result.isError).toBe(true);
		expect(result.structuredContent?.ok).toBe(false);
		const error = result.structuredContent?.error as { reason: string };
		expect(error.reason).toContain('invalid-argument');
		expect(error.reason).toContain('atomic');
		// The stray `atomic:false` must NOT have produced a file: the
		// request is rejected, not silently written.
		expect(existsSync(join(root, 'x.txt'))).toBe(false);
	});

	it('writes durably (atomic) on a valid call without `atomic`', async () => {
		const mutexSpy = vi.spyOn(fileMutex, 'withFileMutex');
		const atomicSpy = vi.spyOn(atomicWrite, 'writeFileAtomic');
		const { handler } = await captureFsWrite();
		const result = await handler({ path: 'ok.txt', content: 'hello' });
		expect(result.isError).toBeUndefined();
		expect(readFileSync(join(root, 'ok.txt'), 'utf8')).toBe('hello');
		expect(mutexSpy).toHaveBeenCalled();
		expect(atomicSpy).toHaveBeenCalled();
		mutexSpy.mockRestore();
		atomicSpy.mockRestore();
	});
});
