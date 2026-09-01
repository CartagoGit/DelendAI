import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	SafeWorkspaceReader,
	WorkspaceContainmentError,
} from '@mcp-vertex/core/public';

describe('SafeWorkspaceReader', () => {
	let workspaceRoot = '';
	let workspaceAlias = '';
	let outsideRoot = '';
	let reader: SafeWorkspaceReader;

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), 'safe-reader-ws-'));
		outsideRoot = mkdtempSync(join(tmpdir(), 'safe-reader-outside-'));
		workspaceAlias = `${workspaceRoot}-alias`;
		mkdirSync(join(workspaceRoot, 'src/nested'), { recursive: true });
		mkdirSync(join(workspaceRoot, 'tests/ÁÉÍÓÚ'), { recursive: true });
		mkdirSync(join(workspaceRoot, '.git'), { recursive: true });
		mkdirSync(join(workspaceRoot, 'node_modules/pkg'), { recursive: true });
		writeFileSync(
			join(workspaceRoot, 'src', 'safe.ts'),
			'export const safe = true;',
		);
		writeFileSync(
			join(workspaceRoot, 'src/nested', 'inner.ts'),
			'export const inner = true;',
		);
		writeFileSync(
			join(workspaceRoot, 'tests/ÁÉÍÓÚ', 'file.ts'),
			'export const accented = true;',
		);
		writeFileSync(
			join(workspaceRoot, 'foo\\bar.ts'),
			'export const windowsy = true;',
		);
		writeFileSync(join(workspaceRoot, '.env'), 'TOKEN=secret');
		writeFileSync(
			join(workspaceRoot, '.git/HEAD'),
			'ref: refs/heads/develop',
		);
		writeFileSync(
			join(workspaceRoot, 'node_modules/pkg/index.js'),
			'module.exports = true;',
		);
		writeFileSync(
			join(outsideRoot, 'secret.ts'),
			'export const secret = true;',
		);
		symlinkSync(
			join(workspaceRoot, 'src', 'safe.ts'),
			join(workspaceRoot, 'link-inside.ts'),
		);
		symlinkSync(
			join(outsideRoot, 'secret.ts'),
			join(workspaceRoot, 'link-outside.ts'),
		);
		symlinkSync('link-outside.ts', join(workspaceRoot, 'chain-outside.ts'));
		symlinkSync(workspaceRoot, workspaceAlias);
		reader = new SafeWorkspaceReader(workspaceRoot);
	});

	afterEach(() => {
		rmSync(workspaceAlias, { recursive: true, force: true });
		rmSync(workspaceRoot, { recursive: true, force: true });
		rmSync(outsideRoot, { recursive: true, force: true });
	});

	it('resolves a plain relative path inside the workspace', () => {
		const resolved = reader.resolve('src/safe.ts');
		expect(resolved.relativePath).toBe('src/safe.ts');
		expect(resolved.absolutePath).toBe(
			join(workspaceRoot, 'src', 'safe.ts'),
		);
		expect(resolved.wasAbsolute).toBe(false);
	});

	it("treats '.' as the workspace root", () => {
		const resolved = reader.resolve('.');
		expect(resolved.relativePath).toBe('.');
		expect(resolved.absolutePath).toBe(workspaceRoot);
	});

	it('collapses interior traversal that stays inside the workspace', () => {
		const resolved = reader.resolve('src/../src/nested/inner.ts');
		expect(resolved.relativePath).toBe('src/nested/inner.ts');
	});

	it('rejects a bare traversal escape', () => {
		expect(() => reader.resolve('..')).toThrow(WorkspaceContainmentError);
	});

	it('rejects a deep traversal escape', () => {
		expect(() => reader.resolve('../../outside.ts')).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('accepts an absolute path that stays inside the workspace', () => {
		const absoluteInput = join(workspaceRoot, 'src', 'safe.ts');
		const resolved = reader.resolve(absoluteInput);
		expect(resolved.relativePath).toBe('src/safe.ts');
		expect(resolved.wasAbsolute).toBe(true);
	});

	it('rejects an absolute path outside the workspace', () => {
		expect(() => reader.resolve(join(outsideRoot, 'secret.ts'))).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('rejects a prefix-collision sibling path', () => {
		const sibling = resolve(`${workspaceRoot}-secret/file.ts`);
		expect(() => reader.resolve(sibling)).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('accepts a unicode path inside the workspace', async () => {
		const result = await reader.readText('tests/ÁÉÍÓÚ/file.ts');
		expect(result.content).toContain('accented');
		expect(result.path.relativePath).toBe('tests/ÁÉÍÓÚ/file.ts');
	});

	it('treats Windows-style separators as a literal POSIX filename segment', async () => {
		const result = await reader.readText('foo\\bar.ts');
		expect(result.content).toContain('windowsy');
	});

	it('rejects the reserved .env path', () => {
		expect(() => reader.resolve('.env')).toThrow(WorkspaceContainmentError);
	});

	it('rejects the reserved .git path', () => {
		expect(() => reader.resolve('.git/HEAD')).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('rejects the reserved node_modules path', () => {
		expect(() => reader.resolve('node_modules/pkg/index.js')).toThrow(
			WorkspaceContainmentError,
		);
	});

	// ── d00008 / FS-005: explicit `.env*` reserved-path policy ──────

	it('rejects the reserved .env.local path (d00008)', () => {
		expect(() => reader.resolve('.env.local')).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('rejects the reserved .env.production path (d00008)', () => {
		expect(() => reader.resolve('.env.production')).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('rejects the reserved .env.development path (d00008)', () => {
		expect(() => reader.resolve('.env.development')).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('rejects the reserved .env.secret path (d00008)', () => {
		expect(() => reader.resolve('.env.secret')).toThrow(
			WorkspaceContainmentError,
		);
	});

	it('allows .env.example (metadata, not a secret) (d00008)', () => {
		expect(() => reader.resolve('.env.example')).not.toThrow();
	});

	it('allows .env.test (metadata, not a secret) (d00008)', () => {
		expect(() => reader.resolve('.env.test')).not.toThrow();
	});

	it('resolveExistingContained returns null for a reserved .env.production (d00007 + d00008)', async () => {
		await expect(
			reader.resolveExistingContained('.env.production'),
		).resolves.toBeNull();
	});

	it('resolveLexical succeeds for .env.example (d00007 + d00008)', () => {
		expect(reader.resolveLexical('.env.example').relativePath).toBe(
			'.env.example',
		);
	});

	it('reads a legitimate workspace file', async () => {
		const result = await reader.readText('src/safe.ts');
		expect(result.content).toContain('safe');
		expect(result.stats.isFile()).toBe(true);
	});

	it('returns stats for a legitimate workspace file', async () => {
		const result = await reader.stat('src/safe.ts');
		expect(result.path.relativePath).toBe('src/safe.ts');
		expect(result.stats.isFile()).toBe(true);
	});

	it('returns the contained path from exists for a legitimate file', async () => {
		const result = await reader.exists('src/safe.ts');
		expect(result?.relativePath).toBe('src/safe.ts');
	});

	it('returns null from exists for a missing file', async () => {
		await expect(reader.exists('src/missing.ts')).resolves.toBeNull();
	});

	it('returns null from exists for a reserved path', async () => {
		await expect(reader.exists('.env')).resolves.toBeNull();
	});

	it('rejects a symlink inside the workspace that targets outside', async () => {
		await expect(reader.readText('link-outside.ts')).rejects.toThrow(
			WorkspaceContainmentError,
		);
	});

	it('rejects a symlink chain that eventually targets outside', async () => {
		await expect(reader.stat('chain-outside.ts')).rejects.toThrow(
			WorkspaceContainmentError,
		);
	});

	it('follows a symlink that still resolves inside the workspace', async () => {
		const result = await reader.readText('link-inside.ts');
		expect(result.content).toContain('safe');
		expect(result.path.relativePath).toBe('src/safe.ts');
	});

	it('honors a symlinked workspace root by resolving the real root first', async () => {
		const aliasReader = new SafeWorkspaceReader(workspaceAlias);
		const result = await aliasReader.readText('src/safe.ts');
		expect(result.path.absolutePath).toBe(
			join(workspaceRoot, 'src', 'safe.ts'),
		);
	});

	it('lists a directory without exposing reserved entries or outside symlinks', async () => {
		const result = await reader.list('.', {
			recursive: false,
			maxDepth: 1,
		});
		const relativePaths = result.entries.map(
			(entry) => entry.path.relativePath,
		);
		expect(relativePaths).toContain('src');
		expect(relativePaths).toContain('src/safe.ts');
		expect(relativePaths).not.toContain('.git');
		expect(relativePaths).not.toContain('.env');
		expect(relativePaths).not.toContain('node_modules');
		expect(relativePaths).not.toContain('link-outside.ts');
	});

	it('lists recursively up to the requested depth', async () => {
		const result = await reader.list('src', {
			recursive: true,
			maxDepth: 3,
		});
		const relativePaths = result.entries.map(
			(entry) => entry.path.relativePath,
		);
		expect(relativePaths).toContain('src/nested');
		expect(relativePaths).toContain('src/nested/inner.ts');
	});
});
