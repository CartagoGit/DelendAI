#!/usr/bin/env bun
/**
 * check-stray-cache-files.script.spec.ts — f00081 + f00082 acceptance.
 *
 * f00081: the lint walks `<repoRoot>/.cache/delendai` and reports any
 * file that looks like an agent's dropped source (`.ts`, `.mjs`, `.sh`,
 * `.py`, …) in a subdir that is NOT one of the sanctioned cache
 * roots. The five branches:
 *   1. Clean tree → `ok: true`, `strays: []`.
 *   2. Unknown top-level directory with code inside → flagged twice
 *      (once for the dir, once for each executable).
 *   3. Single `.mjs` bundle dropped at the cache root → flagged as
 *      `orphan-compiled-bundle` (specific reason so the operator can
 *      tell it apart from a hand-written `.ts`).
 *   4. Sanctioned subdirs (`rules/`, `verify/`, `handoff/`,
 *      `results/logs/`, `.worktrees/`) are NEVER scanned for executable
 *      files inside them, even if a hypothetical `.ts` shows up there.
 *   5. The runtime's own top-level files
 *      (`proposal-id-counters.json`) are recognised and skipped.
 *
 * f00082: the lint also walks the repo root (NOT recursive) and
 * reports any file with an executable extension (`.sh`, `.py`,
 * `.ts`, …). The 19 legitimate root files (`AGENTS.md`, `LICENSE`,
 * `package.json`, …) are explicitly whitelisted. The `-la` incident
 * (an agent's `ls -la` output landed in the root) is the failure
 * mode that motivated the new check.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	findStrayCacheFiles,
	findStrayRootFiles,
} from './check-stray-cache-files.script.ts';

const writeFile = (abs: string, content: string): void => {
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, content, 'utf8');
};

describe('findStrayCacheFiles (f00081)', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'stray-cache-files-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const cacheRoot = (): string => join(root, '.cache', 'delendai');

	it('returns ok=true on a clean cache root with only sanctioned subdirs', async () => {
		// Sanctioned subdirs populated with their canonical artefacts.
		writeFile(
			join(cacheRoot(), 'proposals', 'index.json'),
			'{"proposals": []}',
		);
		writeFile(join(cacheRoot(), 'state', 'proposal-lock.json'), '{}');
		writeFile(join(cacheRoot(), 'drift', 'last-analysis.json'), '{}');
		writeFile(join(cacheRoot(), 'verify', 'probe.txt'), 'ok');
		// a00063: accumulated records live nested under results/, not as
		// their own top-level cache dirs.
		writeFile(
			join(cacheRoot(), 'results', 'logs', '2026-07-17.jsonl'),
			'{}',
		);
		writeFile(join(cacheRoot(), 'results', 'memory', 'note.md'), '# x');
		// Sanctioned runtime file at the root.
		writeFile(join(cacheRoot(), 'proposal-id-counters.json'), '{"f":1}');
		const summary = await findStrayCacheFiles(cacheRoot());
		expect(summary.ok).toBe(true);
		expect(summary.strays).toEqual([]);
	});

	it('flags an unknown top-level directory AND every executable inside it', async () => {
		writeFile(
			join(cacheRoot(), 's4-s5-driver', 's4-s5-driver.ts'),
			'#!/usr/bin/env bun\nexport const x = 1;\n',
		);
		writeFile(
			join(cacheRoot(), 's4-s5-driver', 'inject-icons.script.ts'),
			'#!/usr/bin/env bun\nexport const y = 2;\n',
		);
		const summary = await findStrayCacheFiles(cacheRoot());
		expect(summary.ok).toBe(false);
		// 1 stray for the directory + 1 for each executable inside =
		// 3 entries, all under `s4-s5-driver/`.
		expect(summary.strays).toHaveLength(3);
		const rels = summary.strays.map((s) => s.relPath).sort();
		expect(rels).toEqual([
			's4-s5-driver',
			's4-s5-driver/inject-icons.script.ts',
			's4-s5-driver/s4-s5-driver.ts',
		]);
		// The directory carries `unknown-top-level-dir`; the children
		// carry `unknown-subdir-executable` (the bundle distinction is
		// reserved for top-level .mjs).
		expect(
			summary.strays.find((s) => s.reason === 'unknown-top-level-dir')
				?.relPath,
		).toBe('s4-s5-driver');
		expect(
			summary.strays.every(
				(s) =>
					s.reason === 'unknown-top-level-dir' ||
					s.reason === 'unknown-subdir-executable',
			),
		).toBe(true);
		expect(
			summary.strays.filter(
				(s) => s.reason === 'unknown-subdir-executable',
			).length,
		).toBe(2);
	});

	it('flags a single .mjs at the cache root as orphan-compiled-bundle (distinct reason)', async () => {
		// Top-level .mjs (no enclosing subdir) is specifically the
		// `orphan-compiled-bundle` reason so the operator can tell bun
		// build artefacts apart from hand-written source.
		writeFile(
			join(cacheRoot(), 'leaked-build.mjs'),
			'// bun build artefact\n',
		);
		const summary = await findStrayCacheFiles(cacheRoot());
		expect(summary.ok).toBe(false);
		const mjs = summary.strays.find(
			(s) => s.reason === 'orphan-compiled-bundle',
		);
		expect(mjs?.relPath).toBe('leaked-build.mjs');
	});

	it('does not scan inside sanctioned subdirs even if executables live there', async () => {
		// A `.ts` accidentally dropped into `rules/` (a vendored rule
		// pack dir) must not be flagged — rules/ is sanctioned.
		writeFile(
			join(cacheRoot(), 'rules', 'leaked-script.ts'),
			'#!/usr/bin/env bun\nexport const x = 1;\n',
		);
		// A `.sh` accidentally dropped into `results/logs/` (an
		// append-only event log dir) must not be flagged either.
		writeFile(
			join(cacheRoot(), 'results', 'logs', 'broken-rotation.sh'),
			'#!/bin/sh\n',
		);
		// A `.py` accidentally dropped into a worktree — worktrees are
		// real git worktrees, not part of the cache lint surface.
		writeFile(
			join(cacheRoot(), '.worktrees', 'agent-a', 'experiment.py'),
			'print("ok")\n',
		);
		const summary = await findStrayCacheFiles(cacheRoot());
		expect(summary.ok).toBe(true);
		expect(summary.strays).toEqual([]);
	});

	it('recognises the runtime proposal-id-counters.json at the root', async () => {
		writeFile(
			join(cacheRoot(), 'proposal-id-counters.json'),
			'{"f":80,"c":75,"r":61,"x":76,"q":1}',
		);
		const summary = await findStrayCacheFiles(cacheRoot());
		expect(summary.ok).toBe(true);
	});

	it('handles a missing cache root without throwing', async () => {
		const summary = await findStrayCacheFiles(join(root, 'does-not-exist'));
		expect(summary.ok).toBe(true);
		expect(summary.strays).toEqual([]);
	});
});

describe('findStrayRootFiles (f00082)', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'stray-root-files-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const seedWhitelistedFiles = (): void => {
		const whitelist = [
			'AGENTS.md',
			'CLAUDE.md',
			'CHANGELOG.md',
			'LICENSE',
			'README.md',
			'package.json',
			'biome.json',
			'bunfig.toml',
			'bun.lock',
			'lefthook.yml',
			'delendai.config.json',
			'stylelint.config.mjs',
			'tsconfig.base.json',
			'tsconfig.json',
			'vitest.config.ts',
			'vitest.shared.ts',
			'.gitignore',
			'.mcp.json',
		];
		for (const name of whitelist) {
			writeFile(join(root, name), '');
		}
	};

	it('returns ok=true on a clean root with only the 19 whitelisted files', async () => {
		seedWhitelistedFiles();
		const summary = await findStrayRootFiles(root);
		expect(summary.ok).toBe(true);
		expect(summary.strays).toEqual([]);
	});

	it('flags `-la` (the 2026-06-28 incident — ls output dumped in the root)', async () => {
		seedWhitelistedFiles();
		writeFile(join(root, '-la'), 'SUMMARY OF LESS COMMANDS\n');
		const summary = await findStrayRootFiles(root);
		expect(summary.ok).toBe(false);
		expect(summary.strays).toEqual([
			{
				absPath: join(root, '-la'),
				relPath: '-la',
				reason: 'root-without-extension',
				extension: '',
			},
		]);
	});

	it('flags an executable extension at the root (probe.sh)', async () => {
		seedWhitelistedFiles();
		writeFile(join(root, 'probe.sh'), '#!/bin/sh\ntrue\n');
		const summary = await findStrayRootFiles(root);
		expect(summary.ok).toBe(false);
		expect(summary.strays[0]).toMatchObject({
			relPath: 'probe.sh',
			reason: 'root-executable-extension',
			extension: '.sh',
		});
	});

	it('does NOT scan subdirs (tools/scripts/ contains legitimate .ts source code)', async () => {
		seedWhitelistedFiles();
		mkdirSync(join(root, 'tools', 'scripts'), { recursive: true });
		writeFile(
			join(root, 'tools', 'scripts', 'real-script.ts'),
			'export const x = 1;\n',
		);
		const summary = await findStrayRootFiles(root);
		expect(summary.ok).toBe(true);
		expect(summary.strays).toEqual([]);
	});

	it('handles a missing root without throwing', async () => {
		const summary = await findStrayRootFiles(join(root, 'does-not-exist'));
		expect(summary.ok).toBe(true);
		expect(summary.strays).toEqual([]);
	});
});

describe('findStrayRootFiles — untracked scratch directories', () => {
	// `.scratch-repro/noderes.mjs` sat in the repo root and no gate saw
	// it: the file checks are not recursive, so a scratch DIRECTORY
	// slipped past all of them. commit-policy sweeps the whole dirty
	// worktree on a timer, so it was one sweep away from being
	// committed and pushed inside somebody else's commit.
	let root = '';
	const git = (...args: string[]): void => {
		execFileSync('git', args, { cwd: root, stdio: 'ignore' });
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'stray-root-dirs-'));
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'test@example.com');
		git('config', 'user.name', 'Test');
		writeFile(join(root, 'README.md'), '# x\n');
		git('add', 'README.md');
		git('commit', '-q', '-m', 'chore: seed');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('flags an untracked scratch directory at the root', () => {
		mkdirSync(join(root, '.scratch-repro'), { recursive: true });
		writeFile(join(root, '.scratch-repro', 'noderes.mjs'), 'x');
		return findStrayRootFiles(root).then((summary) => {
			expect(summary.ok).toBe(false);
			expect(
				summary.strays.map((stray) => ({
					relPath: stray.relPath,
					reason: stray.reason,
				})),
			).toContainEqual({
				relPath: '.scratch-repro/',
				reason: 'root-untracked-directory',
			});
		});
	});

	it('does not flag a directory git is told to ignore', async () => {
		// An ignored directory was a deliberate decision, and a sweep
		// will never pick it up. Flagging it would make the gate noise.
		writeFile(join(root, '.gitignore'), 'build-output/\n');
		git('add', '.gitignore');
		git('commit', '-q', '-m', 'chore: ignore build output');
		mkdirSync(join(root, 'build-output'), { recursive: true });
		writeFile(join(root, 'build-output', 'x.mjs'), 'x');
		const summary = await findStrayRootFiles(root);
		expect(
			summary.strays.filter(
				(stray) => stray.reason === 'root-untracked-directory',
			),
		).toEqual([]);
	});

	it('does not flag a tracked directory', async () => {
		mkdirSync(join(root, 'packages'), { recursive: true });
		writeFile(join(root, 'packages', 'a.ts'), 'export const a = 1;\n');
		git('add', 'packages/a.ts');
		git('commit', '-q', '-m', 'feat: a');
		const summary = await findStrayRootFiles(root);
		expect(
			summary.strays.filter(
				(stray) => stray.reason === 'root-untracked-directory',
			),
		).toEqual([]);
	});
});

describe('findStrayCacheFiles — a00072 S7.a zero-byte stale tmp detection', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'stray-cache-files-s7-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	// S7.a: a 0-byte .tmp file that has been sitting in the cache
	// for >60s is a crashed mid-write. The lint must flag it as
	// `stale-zero-byte-tmp` so the operator can clean it up. The
	// test injects `mtimeMs` via a wrapper to bypass the 60s wait.
	it('flags a 0-byte .tmp file older than the stale threshold', async () => {
		// Create a tmp file at .cache/delendai/results/usage-tracking/
		// with size 0 and an mtime that is 5 minutes in the past.
		const usageDir = join(
			root,
			'.cache',
			'delendai',
			'results',
			'usage-tracking',
		);
		mkdirSync(usageDir, { recursive: true });
		const tmpPath = join(usageDir, 'summary.json.tmp');
		writeFileSync(tmpPath, '', 'utf8');
		// Backdate the mtime by 5 minutes. The walker reads mtimeMs
		// via `stat` so we adjust the file's utimes directly.
		const past = new Date(Date.now() - 5 * 60 * 1000);
		const { utimes } = await import('node:fs/promises');
		await utimes(tmpPath, past, past);

		const summary = await findStrayCacheFiles(
			join(root, '.cache', 'delendai'),
		);
		const zeroByte = summary.strays.filter(
			(s) => s.reason === 'stale-zero-byte-tmp',
		);
		expect(zeroByte.length).toBe(1);
		expect(zeroByte[0]?.relPath).toBe(
			'results/usage-tracking/summary.json.tmp',
		);
		expect(summary.ok).toBe(false);
	});

	it('does NOT flag a fresh 0-byte tmp file (still in the write window)', async () => {
		const usageDir = join(
			root,
			'.cache',
			'delendai',
			'results',
			'usage-tracking',
		);
		mkdirSync(usageDir, { recursive: true });
		const tmpPath = join(usageDir, 'summary.json.tmp');
		writeFileSync(tmpPath, '', 'utf8');
		// mtime is "now" — within the 60s window. Walker should skip.
		const summary = await findStrayCacheFiles(
			join(root, '.cache', 'delendai'),
		);
		const zeroByte = summary.strays.filter(
			(s) => s.reason === 'stale-zero-byte-tmp',
		);
		expect(zeroByte.length).toBe(0);
	});

	it('does NOT flag a non-empty tmp file (still being written)', async () => {
		const usageDir = join(
			root,
			'.cache',
			'delendai',
			'results',
			'usage-tracking',
		);
		mkdirSync(usageDir, { recursive: true });
		const tmpPath = join(usageDir, 'summary.json.tmp');
		writeFileSync(tmpPath, '{"partial": true}', 'utf8');
		const past = new Date(Date.now() - 5 * 60 * 1000);
		const { utimes } = await import('node:fs/promises');
		await utimes(tmpPath, past, past);

		const summary = await findStrayCacheFiles(
			join(root, '.cache', 'delendai'),
		);
		const zeroByte = summary.strays.filter(
			(s) => s.reason === 'stale-zero-byte-tmp',
		);
		expect(zeroByte.length).toBe(0);
	});
});
