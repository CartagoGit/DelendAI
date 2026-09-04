#!/usr/bin/env bun
// rebrand-propagate.spec.ts — verify the rebrand-propagate script behaves.
//
// Why this exists: a partial rebrand silently keeps emitting the old brand
// from `dist/*.js` bundles and the regenerated `capabilities.json`. This
// spec guards the safety net: the script must report every lingering
// reference (including those in bundles), and must exit 0 once every layer
// is clean.

import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(HERE, '..', '..', '..');
const SCRIPT = resolve(
	ROOT,
	'tools/scripts/migrate/rebrand-propagate.script.ts',
);

const run = (
	args: readonly string[],
	cwd: string,
): {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
} => {
	const result = spawnSync('bun', ['run', SCRIPT, ...args], {
		cwd,
		encoding: 'utf8',
		env: process.env,
	});
	return {
		status: result.status ?? -1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
};

// When the test runs against a custom root (fixture), the script needs
// to know it. The convention is `--root=<path>`; SCAN_ROOT defaults to
// the monorepo when the flag is absent so the live-check test stays
// zero-config.
const runWithRoot = (
	args: readonly string[],
	cwd: string,
	root: string,
): ReturnType<typeof run> => run([...args, `--root=${root}`], cwd);

const makeFakeProject = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'rebrand-spec-'));
	mkdirSync(join(dir, 'src'), { recursive: true });
	mkdirSync(join(dir, 'dist'), { recursive: true });
	writeFileSync(
		join(dir, 'src/index.ts'),
		'export const brand = "oldbrand";\n',
	);
	writeFileSync(
		join(dir, 'dist/index.js'),
		'export const brand = "oldbrand";\n',
	);
	return dir;
};

describe('rebrand-propagate.script.ts', () => {
	it('flags stale references in both src and dist', () => {
		const fixture = makeFakeProject();
		try {
			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			expect(result.status).toBe(1);
			expect(result.stdout).toContain('still appears in 2 live file(s)');
			expect(result.stdout).toMatch(/dist\/index\.js/);
			expect(result.stdout).toMatch(/src\/index\.ts/);
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it('passes after the source is migrated', () => {
		const fixture = makeFakeProject();
		try {
			writeFileSync(
				join(fixture, 'src/index.ts'),
				'export const brand = "newbrand";\n',
			);
			writeFileSync(
				join(fixture, 'dist/index.js'),
				'export const brand = "newbrand";\n',
			);
			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain('Reband propagation clean');
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it('honours --help and exits 0 without scanning', () => {
		const result = run(['--help'], ROOT);
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/Usage:/);
	});

	it('does not flag preserved historical sinks (CHANGELOG.md)', () => {
		const fixture = makeFakeProject();
		try {
			writeFileSync(
				join(fixture, 'CHANGELOG.md'),
				'# oldbrand release notes\n',
			);
			const result = runWithRoot(
				['--check', '--from=oldbrand', '--to=newbrand'],
				fixture,
				fixture,
			);
			// The CHANGELOG.md entry should NOT be in the hits.
			expect(result.stdout).not.toMatch(/CHANGELOG\.md/);
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it('passes on the real repo (live brand propagation is clean)', () => {
		// This test only runs when the script can read ROOT directly,
		// which is always the case inside the workspace.
		if (!existsSync(SCRIPT)) {
			throw new Error(`rebrand-propagate.script.ts missing at ${SCRIPT}`);
		}
		const result = run(['--check'], ROOT);
		expect(result.stdout).toContain('Reband propagation clean');
		expect(result.status).toBe(0);
	});
});
