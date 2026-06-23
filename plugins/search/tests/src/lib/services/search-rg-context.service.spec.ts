/**
 * search-rg-context.spec.ts (f00028 S1)
 *
 * `context: N` (surrounding lines) and the optional `rg` (ripgrep) backend,
 * both behind the same containment guard and result cap as the in-house
 * walker.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { searchWorkspace } from '@mcp-vertex/search/lib/engine';

const execFileAsync = promisify(execFile);

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

let rgAvailable = false;
beforeEach(async () => {
	try {
		await execFileAsync('rg', ['--version']);
		rgAvailable = true;
	} catch {
		rgAvailable = false;
	}
});

describe('searchWorkspace — context lines (f00028 S1)', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-ctx-'));
		write(
			root,
			'src/a.ts',
			`${['line1', 'line2', 'TARGET', 'line4', 'line5'].join('\n')}\n`,
		);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('context:0 (default) returns no before/after fields', async () => {
		const res = await searchWorkspace(root, 'TARGET');
		expect(res.hits).toHaveLength(1);
		expect(res.hits[0]?.before).toBeUndefined();
		expect(res.hits[0]?.after).toBeUndefined();
	});

	it('context:3 returns up to 3 lines before and after the match', async () => {
		const res = await searchWorkspace(root, 'TARGET', { context: 3 });
		expect(res.hits).toHaveLength(1);
		expect(res.hits[0]?.before).toEqual(['line1', 'line2']);
		expect(res.hits[0]?.after).toEqual(['line4', 'line5']);
	});

	it('does not match inside .git/ even with context requested', async () => {
		write(root, '.git/TARGET.txt', 'TARGET\n');
		const res = await searchWorkspace(root, 'TARGET', { context: 2 });
		expect(res.hits.every((h) => !h.file.startsWith('.git/'))).toBe(true);
	});
});

describe('searchWorkspace — rg backend (f00028 S1)', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'search-rg-'));
		write(
			root,
			'src/a.ts',
			`${['line1', 'line2', 'TARGET', 'line4', 'line5'].join('\n')}\n`,
		);
		write(root, 'src/b.ts', 'no match here\n');
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('preferRg:true uses rg when available and reports usedRg:true', async () => {
		if (!rgAvailable) return; // environment without rg — covered by the fallback test below
		const res = await searchWorkspace(root, 'TARGET', { preferRg: true });
		expect(res.usedRg).toBe(true);
		expect(res.rgFallbackReason).toBeUndefined();
		expect(res.hits.map((h) => h.file)).toContain('src/a.ts');
	});

	it('preferRg:true with context returns the same surrounding lines as the in-house walker', async () => {
		if (!rgAvailable) return;
		const rg = await searchWorkspace(root, 'TARGET', {
			preferRg: true,
			context: 2,
		});
		const inHouse = await searchWorkspace(root, 'TARGET', { context: 2 });
		const rgHit = rg.hits.find((h) => h.file === 'src/a.ts');
		const inHouseHit = inHouse.hits.find((h) => h.file === 'src/a.ts');
		expect(rgHit?.before).toEqual(inHouseHit?.before);
		expect(rgHit?.after).toEqual(inHouseHit?.after);
	});

	it('falls back to the in-house walker and reports the reason when rg is unavailable', async () => {
		// Simulate "rg missing" deterministically regardless of the host's
		// actual PATH by pointing PATH at an empty dir for the duration of
		// the call — this is the only reliable cross-environment way to
		// force the "not found" branch without mocking child_process.
		const emptyDir = mkdtempSync(join(tmpdir(), 'search-rg-empty-path-'));
		const originalPath = process.env.PATH;
		process.env.PATH = emptyDir;
		try {
			const res = await searchWorkspace(root, 'TARGET', {
				preferRg: true,
			});
			expect(res.usedRg).toBe(false);
			expect(res.rgFallbackReason).toBe('rg binary not found on $PATH');
			expect(res.hits.map((h) => h.file)).toContain('src/a.ts');
		} finally {
			process.env.PATH = originalPath;
			rmSync(emptyDir, { recursive: true, force: true });
		}
	});

	it('without preferRg, never shells out — usedRg is always false', async () => {
		const res = await searchWorkspace(root, 'TARGET');
		expect(res.usedRg).toBe(false);
		expect(res.rgFallbackReason).toBeUndefined();
	});
});
