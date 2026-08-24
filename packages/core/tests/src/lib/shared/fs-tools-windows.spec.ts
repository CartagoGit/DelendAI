import { win32 } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	resolveAgainstRoots,
	resolveWorkspaceContained,
} from '@mcp-vertex/core/public';

const ROOT = 'C:\\Workspace\\Repo';
const AUTHORIZED = 'C:\\Shared\\Safe';

describe('filesystem containment — Windows lexical semantics', async () => {
	it('rejects a different-drive absolute path as outside the workspace', async () => {
		const result = resolveWorkspaceContained(ROOT, 'D:\\escape.txt', {
			pathDialect: win32,
			caseInsensitive: true,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/absolute path not allowed/);
	});

	it('accepts an allowlisted drive-letter absolute path and normalizes rel', async () => {
		const result = resolveAgainstRoots(
			ROOT,
			[AUTHORIZED],
			'C:\\Shared\\Safe\\nested\\note.txt',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(result.ok).toBe(true);
		expect(result.abs).toBe('C:\\Shared\\Safe\\nested\\note.txt');
		expect(result.rel).toBe('nested/note.txt');
	});

	it('accepts an allowlisted UNC absolute path and keeps it inside its share root', async () => {
		const uncRoot = '\\\\server\\share\\repo';
		const uncAllowed = '\\\\server\\share\\drop';
		const result = resolveAgainstRoots(
			uncRoot,
			[uncAllowed],
			'\\\\server\\share\\drop\\logs\\today.txt',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(result.ok).toBe(true);
		expect(result.rel).toBe('logs/today.txt');
	});

	it('rejects a UNC path from a sibling share even when one share is authorized', async () => {
		const result = resolveAgainstRoots(
			'\\\\server\\share\\repo',
			['\\\\server\\share\\drop'],
			'\\\\server\\other\\drop\\logs\\today.txt',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/absolute path not allowed/);
	});

	it('treats drive letters and path segments case-insensitively for containment', async () => {
		const result = resolveAgainstRoots(
			'C:\\Foo\\Repo',
			[],
			'.\\Sub\\FILE.txt',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(result.ok).toBe(true);
		expect(result.rel).toBe('Sub/FILE.txt');

		const absoluteResult = resolveAgainstRoots(
			'C:\\Foo\\Repo',
			['C:\\Shared\\Safe'],
			'c:\\shared\\safe\\Nested\\Doc.md',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(absoluteResult.ok).toBe(true);
		expect(absoluteResult.rel).toBe('Nested/Doc.md');
	});

	it('normalizes mixed separators before reporting the relative path', async () => {
		const result = resolveWorkspaceContained(ROOT, 'src\\nested/file.ts', {
			pathDialect: win32,
			caseInsensitive: true,
		});
		expect(result.ok).toBe(true);
		expect(result.rel).toBe('src/nested/file.ts');
	});

	it('rejects a path that climbs out of the allowlisted root with mixed separators', async () => {
		const result = resolveAgainstRoots(
			ROOT,
			[AUTHORIZED],
			'C:\\Shared\\Safe\\nested\\..\\..\\Other\\secret.txt',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/absolute path not allowed/);
	});

	it('keeps lexical link-looking paths inside the workspace until realpath validation runs', async () => {
		const symlinkLike = resolveWorkspaceContained(
			ROOT,
			'links\\possible-symlink\\file.txt',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(symlinkLike.ok).toBe(true);
		expect(symlinkLike.rel).toBe('links/possible-symlink/file.txt');

		const junctionLike = resolveWorkspaceContained(
			ROOT,
			'links/junction-target/file.txt',
			{ pathDialect: win32, caseInsensitive: true },
		);
		expect(junctionLike.ok).toBe(true);
		expect(junctionLike.rel).toBe('links/junction-target/file.txt');
	});
});

const describeWindowsOnly =
	process.platform === 'win32' ? describe : describe.skip;

describeWindowsOnly(
	'filesystem containment — Windows realpath behaviour',
	async () => {
		it('needs a native Windows runner for junction and symlink realpath checks', async () => {
			// `realpathContained` is already covered on the host platform in
			// fs-tools.spec.ts. The Windows-specific reparse-point cases need
			// a native NTFS environment, so Linux CI documents the requirement
			// here instead of faking Windows filesystem behaviour.
			expect(process.platform).toBe('win32');
		});
	},
);
